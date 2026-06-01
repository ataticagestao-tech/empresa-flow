import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Margens / Rentabilidade (regime de competência).
 *
 * Reconstrói a cascata de resultado do período:
 *  - Receita R           = Σ vendas confirmadas (valor_liquido) no período.
 *  - Custo C             = Σ CP classificadas como CUSTO (entram na Margem Bruta).
 *  - Despesa Operacional = Σ CP operacionais (pessoal, admin, comerciais, impostos…).
 *  - Outras O            = Σ CP financeiras / outras (entram só na Margem Líquida).
 *  - Lucro Bruto LB = R − C            → Margem Bruta %       = LB/R
 *  - Result. Operac. RO = LB − D       → Margem Operacional % = RO/R
 *  - Result. Líquido RL = RO − O       → Margem Líquida %     = RL/R
 *
 * CP atribuídas ao período por COMPETÊNCIA (se existe e cai no período); senão por
 * data_vencimento dentro do período (mesma regra de "compras" do useCicloCaixa).
 * Classificação por chart_of_accounts.dre_group + account_type (NÃO só account_type).
 *
 * 100% client-side via activeClient (multi-tenant). Sempre filtra deleted_at IS NULL.
 * No consolidado de grupo, os COMPONENTES BRUTOS (R/C/D/O) são somados ANTES de
 * calcular as razões (igual o useLiquidez/useCicloCaixa).
 */

/** Componentes brutos (somáveis entre empresas). */
export interface MargensRaw {
  receita: number;
  custo: number;
  despesaOperacional: number;
  outras: number;
}

export interface MargensData {
  receita: number;
  custo: number;
  despesaOperacional: number;
  outras: number;
  lucroBruto: number;
  resultadoOperacional: number;
  resultadoLiquido: number;
  margemBruta: number | null;
  margemOperacional: number | null;
  margemLiquida: number | null;
}

export interface UseMargensParams {
  /** Opcional: sobrescreve a empresa ativa (ex.: dashboard de empresa por rota). */
  companyId?: string;
  periodStart: string; // 'YYYY-MM-DD'
  periodEnd: string; // 'YYYY-MM-DD'
}

export interface UseMargensConsolidadoParams {
  /** IDs das empresas do grupo a consolidar. */
  companyIds: string[];
  periodStart: string;
  periodEnd: string;
}

const EMPTY_RAW: MargensRaw = {
  receita: 0,
  custo: 0,
  despesaOperacional: 0,
  outras: 0,
};

const EMPTY: MargensData = {
  ...EMPTY_RAW,
  lucroBruto: 0,
  resultadoOperacional: 0,
  resultadoLiquido: 0,
  margemBruta: null,
  margemOperacional: null,
  margemLiquida: null,
};

/** Parse 'YYYY-MM-DD' como data local (evita shift de timezone do new Date(str)). */
function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Primeiro dia do mês de uma competência 'YYYY-MM'. */
function competenciaToFirstDay(competencia: string | null | undefined): Date | null {
  if (!competencia) return null;
  const m = /^(\d{4})-(\d{2})/.exec(competencia);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Verdadeiro se o mês de competência 'YYYY-MM' do título cai dentro do período. */
function competenciaInPeriod(competencia: string | null | undefined, start: string, end: string): boolean {
  const first = competenciaToFirstDay(competencia);
  if (!first) return false;
  const s = parseDate(start);
  const e = parseDate(end);
  if (!s || !e) return false;
  // mês dentro do período se [1º dia .. último dia] do mês intersecta [início .. fim]
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  return first <= e && last >= s;
}

/** Verdadeiro se a CP deve ser atribuída ao período (competência → senão vencimento). */
function cpInPeriod(
  competencia: string | null | undefined,
  dataVencimento: string | null | undefined,
  start: string,
  end: string,
): boolean {
  if (competencia) return competenciaInPeriod(competencia, start, end);
  return !!dataVencimento && dataVencimento >= start && dataVencimento <= end;
}

type CpClasse = "excluir" | "custo" | "outras" | "operacional";

/** Normaliza dre_group: minúsculas + remove acentos. */
function normalize(s: string | null | undefined): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Classifica uma CP a partir do account_type + dre_group (na ordem definida).
 * CP sem conta (accountType/dreGroup null) → operacional (despesa não categorizada).
 */
function classificaCp(accountType: string | null | undefined, dreGroup: string | null | undefined): CpClasse {
  const at = (accountType || "").toLowerCase();
  const norm = normalize(dreGroup);

  // 1. EXCLUIR — compras de ativo / não-resultado.
  if (at === "asset" || at === "liability" || at === "equity" || at === "revenue") return "excluir";
  if (norm.includes("nao dre")) return "excluir";

  // 2. CUSTO — entra na Margem Bruta.
  if (at === "cost" || norm.includes("custo") || norm.includes("cmv") || norm.includes("csp")) return "custo";

  // 3. OUTRAS / FINANCEIRAS — entram só na Margem Líquida.
  if (norm.includes("outras") || norm.includes("financ")) return "outras";

  // 4. DESPESA OPERACIONAL — default para o resto.
  return "operacional";
}

interface VendaRow {
  valor_liquido: number | null;
  data_venda: string | null;
}

interface CpRow {
  valor: number | null;
  competencia: string | null;
  data_vencimento: string | null;
  conta_contabil_id: string | null;
  chart_of_accounts: { account_type: string | null; dre_group: string | null } | null;
}

/**
 * Busca as linhas de UMA empresa e acumula os componentes brutos (somáveis).
 * NÃO calcula as margens aqui — isso é feito após somar todas as empresas.
 */
export async function fetchMargensRaw(
  db: any,
  companyId: string,
  periodStart: string,
  periodEnd: string,
): Promise<MargensRaw> {
  // --- Receita: vendas confirmadas no período ---
  const { data: vendasData, error: vendasErr } = await db
    .from("vendas")
    .select("valor_liquido, data_venda")
    .eq("company_id", companyId)
    .eq("status", "confirmado")
    .is("deleted_at", null)
    .gte("data_venda", periodStart)
    .lte("data_venda", periodEnd)
    .limit(50000);
  if (vendasErr) throw vendasErr;
  const vendas = (vendasData || []) as VendaRow[];
  const receita = vendas.reduce((acc, v) => acc + (Number(v.valor_liquido) || 0), 0);

  // --- Custos/Despesas: contas a pagar + plano de contas (classificação) ---
  const { data: cpData, error: cpErr } = await db
    .from("contas_pagar")
    .select(
      "valor, competencia, data_vencimento, conta_contabil_id, chart_of_accounts:conta_contabil_id ( account_type, dre_group )",
    )
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .limit(50000);
  if (cpErr) throw cpErr;
  const cps = (cpData || []) as CpRow[];

  let custo = 0;
  let despesaOperacional = 0;
  let outras = 0;

  for (const cp of cps) {
    if (!cpInPeriod(cp.competencia, cp.data_vencimento, periodStart, periodEnd)) continue;
    const valor = Number(cp.valor) || 0;
    if (valor === 0) continue;

    const classe = classificaCp(cp.chart_of_accounts?.account_type, cp.chart_of_accounts?.dre_group);
    if (classe === "excluir") continue;
    if (classe === "custo") custo += valor;
    else if (classe === "outras") outras += valor;
    else despesaOperacional += valor; // operacional (inclui CP sem conta)
  }

  return { receita, custo, despesaOperacional, outras };
}

/** Converte os componentes brutos (somados) na cascata de resultado e nas 3 margens. */
export function buildMargensData(raw: MargensRaw): MargensData {
  const { receita, custo, despesaOperacional, outras } = raw;
  const lucroBruto = receita - custo;
  const resultadoOperacional = lucroBruto - despesaOperacional;
  const resultadoLiquido = resultadoOperacional - outras;

  const temReceita = receita > 0;
  return {
    receita,
    custo,
    despesaOperacional,
    outras,
    lucroBruto,
    resultadoOperacional,
    resultadoLiquido,
    margemBruta: temReceita ? (lucroBruto / receita) * 100 : null,
    margemOperacional: temReceita ? (resultadoOperacional / receita) * 100 : null,
    margemLiquida: temReceita ? (resultadoLiquido / receita) * 100 : null,
  };
}

/** Hook de UMA empresa (empresa selecionada por padrão). */
export function useMargens({ companyId, periodStart, periodEnd }: UseMargensParams) {
  const { selectedCompany } = useCompany();
  const { activeClient } = useAuth();
  const db = activeClient as any;
  const resolvedCompanyId = companyId || selectedCompany?.id;

  const { data, isLoading } = useQuery({
    queryKey: ["margens", resolvedCompanyId, periodStart, periodEnd],
    enabled: !!db && !!resolvedCompanyId,
    queryFn: async (): Promise<MargensData> => {
      if (!db || !resolvedCompanyId) return EMPTY;
      const raw = await fetchMargensRaw(db, resolvedCompanyId, periodStart, periodEnd);
      return buildMargensData(raw);
    },
  });

  return { ...(data ?? EMPTY), isLoading };
}

/** Hook consolidado de várias empresas (dashboard de grupo). */
export function useMargensConsolidado({ companyIds, periodStart, periodEnd }: UseMargensConsolidadoParams) {
  const { activeClient } = useAuth();
  const db = activeClient as any;
  const ids = (companyIds || []).filter(Boolean);

  const { data, isLoading } = useQuery({
    queryKey: ["margens_consolidado", ids, periodStart, periodEnd],
    enabled: !!db && ids.length > 0,
    queryFn: async (): Promise<MargensData> => {
      if (!db || ids.length === 0) return EMPTY;

      const parts = await Promise.all(ids.map((id) => fetchMargensRaw(db, id, periodStart, periodEnd)));

      const total: MargensRaw = { ...EMPTY_RAW };
      for (const p of parts) {
        total.receita += p.receita;
        total.custo += p.custo;
        total.despesaOperacional += p.despesaOperacional;
        total.outras += p.outras;
      }

      return buildMargensData(total);
    },
  });

  return { ...(data ?? EMPTY), isLoading };
}

/* ────────────────────────────────────────────────────────────────────────
 * SÉRIE MENSAL (tendência dos últimos N meses). Cada ponto usa fetchMargensRaw
 * no período [startOfMonth .. min(endOfMonth, hoje)] e calcula as 3 margens.
 * No consolidado, soma os componentes BRUTOS de todas as empresas ANTES de dividir.
 * ──────────────────────────────────────────────────────────────────────── */

/** Limite de empresas no consolidado para conter o custo (meses × empresas chamadas). */
const SERIE_MAX_EMPRESAS = 12;

export interface MargensSeriePonto {
  mes: string; // "jan/26"
  bruta: number | null;
  operacional: number | null;
  liquida: number | null;
}

export interface UseMargensSerieParams {
  companyId?: string;
  companyIds?: string[];
  meses?: number;
}

/** Label "jan/26" (sem ponto da abreviação) para um Date. */
function mesLabel(d: Date): string {
  return format(d, "MMM/yy", { locale: ptBR }).replace(".", "");
}

/** Período [1º dia, min(último dia, hoje)] do mês de `d`, em 'YYYY-MM-DD'. */
function mesPeriodo(d: Date): { start: string; end: string } | null {
  const hoje = new Date();
  const ini = startOfMonth(d);
  let fim = endOfMonth(d);
  if (fim > hoje) fim = hoje;
  if (fim < ini) return null; // mês inteiramente no futuro
  return { start: format(ini, "yyyy-MM-dd"), end: format(fim, "yyyy-MM-dd") };
}

/** Converte componentes brutos num ponto da série (3 margens). */
function rawToPonto(mes: string, raw: MargensRaw): MargensSeriePonto {
  const d = buildMargensData(raw);
  return { mes, bruta: d.margemBruta, operacional: d.margemOperacional, liquida: d.margemLiquida };
}

/**
 * Série mensal das 3 margens (últimos `meses`, incluindo o corrente),
 * do mês mais antigo ao mais recente. Empresa única ou consolidado de grupo.
 */
export function useMargensSerie({ companyId, companyIds, meses = 6 }: UseMargensSerieParams) {
  const { selectedCompany } = useCompany();
  const { activeClient } = useAuth();
  const db = activeClient as any;

  const ids = (companyIds || []).filter(Boolean).slice(0, SERIE_MAX_EMPRESAS);
  const isConsolidado = ids.length > 0;
  const singleId = companyId || selectedCompany?.id;
  const enabled = !!db && (isConsolidado || !!singleId);

  const { data, isLoading } = useQuery({
    queryKey: ["margens_serie", isConsolidado ? ids : singleId, meses],
    enabled,
    queryFn: async (): Promise<MargensSeriePonto[]> => {
      if (!db) return [];

      const hoje = new Date();
      const mesesDates: Date[] = [];
      for (let i = meses - 1; i >= 0; i--) mesesDates.push(subMonths(hoje, i));

      const pontos = await Promise.all(
        mesesDates.map(async (d): Promise<MargensSeriePonto> => {
          const label = mesLabel(d);
          const per = mesPeriodo(d);
          if (!per) return { mes: label, bruta: null, operacional: null, liquida: null };

          if (isConsolidado) {
            const parts = await Promise.all(ids.map((id) => fetchMargensRaw(db, id, per.start, per.end)));
            const total: MargensRaw = { ...EMPTY_RAW };
            for (const p of parts) {
              total.receita += p.receita;
              total.custo += p.custo;
              total.despesaOperacional += p.despesaOperacional;
              total.outras += p.outras;
            }
            return rawToPonto(label, total);
          }

          if (!singleId) return { mes: label, bruta: null, operacional: null, liquida: null };
          const raw = await fetchMargensRaw(db, singleId, per.start, per.end);
          return rawToPonto(label, raw);
        }),
      );

      return pontos;
    },
  });

  return { serie: data ?? [], isLoading };
}
