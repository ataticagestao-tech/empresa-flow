import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  classificaFixoVariavel,
  isExcluidoDoResultado,
  isNaoDesembolsavel,
} from "@/modules/finance/domain/custoFixoVariavel";

/**
 * Ponto de Equilíbrio (Break-even) — regime de competência.
 *
 * Reconstrói receita e custos do período, separando custos FIXOS de VARIÁVEIS
 * (classificação manual chart_of_accounts.expense_nature, com fallback de heurística),
 * e calcula os 3 pontos de equilíbrio:
 *  - Margem de Contribuição (R$) = Receita − Custo Variável
 *  - mcPct = MC / Receita (fração)
 *  - PE Contábil   = Custo Fixo / mcPct                     (lucro = 0)
 *  - PE Financeiro = (Custo Fixo − Não-desembolsável) / mcPct  (caixa empata)
 *  - PE Econômico  = (Custo Fixo + Lucro Desejado) / mcPct  (lucro mínimo desejado)
 *  - Margem de Segurança = (Receita − PE Contábil) / Receita (fração; pode ser negativa)
 *
 * Se a margem de contribuição for ≤ 0 (custo variável ≥ receita), não há ponto de
 * equilíbrio possível → todos os PE vêm null com flag mcInvalida.
 *
 * CP atribuídas ao período por COMPETÊNCIA (se existe e cai no período); senão por
 * data_vencimento dentro do período (mesma regra do useMargens).
 * 100% client-side via activeClient (multi-tenant). Sempre filtra deleted_at IS NULL.
 * No consolidado de grupo, os COMPONENTES BRUTOS são somados ANTES do cálculo.
 */

/** Componentes brutos (somáveis entre empresas). */
export interface PontoEquilibrioRaw {
  receita: number;
  custoVariavel: number; // CP classificadas variável (CMV, impostos s/ venda, taxa cartão, comissão…)
  custoFixo: number; // CP classificadas fixa
  naoDesembolsavel: number; // subconjunto do fixo: depreciação/amortização (PE Financeiro)
  lucroDesejado: number; // companies.lucro_minimo_desejado (consolidado: soma das empresas)
}

export interface PontoEquilibrioData {
  receita: number;
  custoFixo: number;
  custoVariavel: number;
  naoDesembolsavel: number;
  lucroDesejado: number;
  margemContribuicaoValor: number;
  mcPct: number | null; // fração 0..1
  peContabil: number | null;
  peFinanceiro: number | null;
  peEconomico: number | null;
  margemSeguranca: number | null; // fração (pode ser negativa)
  mcInvalida: boolean; // true quando mcPct null/≤0 → PE não calculável
}

export interface UsePontoEquilibrioParams {
  companyId?: string;
  periodStart: string; // 'YYYY-MM-DD'
  periodEnd: string; // 'YYYY-MM-DD'
}

export interface UsePontoEquilibrioConsolidadoParams {
  companyIds: string[];
  periodStart: string;
  periodEnd: string;
}

const EMPTY_RAW: PontoEquilibrioRaw = {
  receita: 0,
  custoVariavel: 0,
  custoFixo: 0,
  naoDesembolsavel: 0,
  lucroDesejado: 0,
};

const EMPTY: PontoEquilibrioData = {
  receita: 0,
  custoFixo: 0,
  custoVariavel: 0,
  naoDesembolsavel: 0,
  lucroDesejado: 0,
  margemContribuicaoValor: 0,
  mcPct: null,
  peContabil: null,
  peFinanceiro: null,
  peEconomico: null,
  margemSeguranca: null,
  mcInvalida: true,
};

/* ── Helpers de período (idênticos ao useMargens) ── */

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function competenciaToFirstDay(competencia: string | null | undefined): Date | null {
  if (!competencia) return null;
  const m = /^(\d{4})-(\d{2})/.exec(competencia);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  return Number.isNaN(d.getTime()) ? null : d;
}

function competenciaInPeriod(competencia: string | null | undefined, start: string, end: string): boolean {
  const first = competenciaToFirstDay(competencia);
  if (!first) return false;
  const s = parseDate(start);
  const e = parseDate(end);
  if (!s || !e) return false;
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  return first <= e && last >= s;
}

function cpInPeriod(
  competencia: string | null | undefined,
  dataVencimento: string | null | undefined,
  start: string,
  end: string,
): boolean {
  if (competencia) return competenciaInPeriod(competencia, start, end);
  return !!dataVencimento && dataVencimento >= start && dataVencimento <= end;
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
  chart_of_accounts: {
    account_type: string | null;
    dre_group: string | null;
    expense_nature: string | null;
    code: string | null;
    name: string | null;
  } | null;
}

/**
 * Busca as linhas de UMA empresa e acumula os componentes brutos (somáveis).
 * NÃO calcula os PE aqui — isso é feito após somar todas as empresas.
 */
export async function fetchPontoEquilibrioRaw(
  db: any,
  companyId: string,
  periodStart: string,
  periodEnd: string,
): Promise<PontoEquilibrioRaw> {
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

  // --- Custos/Despesas: contas a pagar + plano de contas ---
  const { data: cpData, error: cpErr } = await db
    .from("contas_pagar")
    .select(
      "valor, competencia, data_vencimento, conta_contabil_id, chart_of_accounts:conta_contabil_id ( account_type, dre_group, expense_nature, code, name )",
    )
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .limit(50000);
  if (cpErr) throw cpErr;
  const cps = (cpData || []) as CpRow[];

  let custoFixo = 0;
  let custoVariavel = 0;
  let naoDesembolsavel = 0;

  for (const cp of cps) {
    if (!cpInPeriod(cp.competencia, cp.data_vencimento, periodStart, periodEnd)) continue;
    const valor = Number(cp.valor) || 0;
    if (valor === 0) continue;

    const acc = cp.chart_of_accounts;
    // 1. Pula ativo / não-resultado.
    if (isExcluidoDoResultado(acc?.account_type, acc?.dre_group)) continue;

    // 2. Natureza: manual (expense_nature) MANDA; senão heurística.
    const manual = acc?.expense_nature;
    const natureza =
      manual === "fixa" || manual === "variavel"
        ? manual
        : classificaFixoVariavel(acc?.code, acc?.name, acc?.dre_group);

    // 3. Acumula.
    if (natureza === "variavel") {
      custoVariavel += valor;
    } else {
      custoFixo += valor;
      // Subconjunto não-desembolsável do fixo (depreciação/amortização).
      if (isNaoDesembolsavel(acc?.name, acc?.dre_group)) naoDesembolsavel += valor;
    }
  }

  // --- Lucro mínimo desejado da empresa ---
  let lucroDesejado = 0;
  try {
    const { data: compData } = await db
      .from("companies")
      .select("lucro_minimo_desejado")
      .eq("id", companyId)
      .single();
    lucroDesejado = Number(compData?.lucro_minimo_desejado) || 0;
  } catch {
    lucroDesejado = 0;
  }

  return { receita, custoVariavel, custoFixo, naoDesembolsavel, lucroDesejado };
}

/** Converte os componentes brutos (somados) nos 3 pontos de equilíbrio. */
export function buildPontoEquilibrioData(raw: PontoEquilibrioRaw): PontoEquilibrioData {
  const { receita, custoVariavel, custoFixo, naoDesembolsavel, lucroDesejado } = raw;

  const margemContribuicaoValor = receita - custoVariavel;
  const mcPct = receita > 0 ? margemContribuicaoValor / receita : null;
  const mcInvalida = mcPct == null || mcPct <= 0;

  if (mcInvalida || mcPct == null) {
    return {
      receita,
      custoFixo,
      custoVariavel,
      naoDesembolsavel,
      lucroDesejado,
      margemContribuicaoValor,
      mcPct: mcPct,
      peContabil: null,
      peFinanceiro: null,
      peEconomico: null,
      margemSeguranca: null,
      mcInvalida: true,
    };
  }

  const peContabil = custoFixo / mcPct;
  const peFinanceiro = (custoFixo - naoDesembolsavel) / mcPct;
  const peEconomico = (custoFixo + lucroDesejado) / mcPct;
  const margemSeguranca = receita > 0 ? (receita - peContabil) / receita : null;

  return {
    receita,
    custoFixo,
    custoVariavel,
    naoDesembolsavel,
    lucroDesejado,
    margemContribuicaoValor,
    mcPct,
    peContabil,
    peFinanceiro,
    peEconomico,
    margemSeguranca,
    mcInvalida: false,
  };
}

/** Hook de UMA empresa (empresa selecionada por padrão). */
export function usePontoEquilibrio({ companyId, periodStart, periodEnd }: UsePontoEquilibrioParams) {
  const { selectedCompany } = useCompany();
  const { activeClient } = useAuth();
  const db = activeClient as any;
  const resolvedCompanyId = companyId || selectedCompany?.id;

  const { data, isLoading } = useQuery({
    queryKey: ["ponto_equilibrio", resolvedCompanyId, periodStart, periodEnd],
    enabled: !!db && !!resolvedCompanyId,
    queryFn: async (): Promise<PontoEquilibrioData> => {
      if (!db || !resolvedCompanyId) return EMPTY;
      const raw = await fetchPontoEquilibrioRaw(db, resolvedCompanyId, periodStart, periodEnd);
      return buildPontoEquilibrioData(raw);
    },
  });

  return { ...(data ?? EMPTY), isLoading };
}

/** Hook consolidado de várias empresas (dashboard de grupo). */
export function usePontoEquilibrioConsolidado({
  companyIds,
  periodStart,
  periodEnd,
}: UsePontoEquilibrioConsolidadoParams) {
  const { activeClient } = useAuth();
  const db = activeClient as any;
  const ids = (companyIds || []).filter(Boolean);

  const { data, isLoading } = useQuery({
    queryKey: ["ponto_equilibrio_consolidado", ids, periodStart, periodEnd],
    enabled: !!db && ids.length > 0,
    queryFn: async (): Promise<PontoEquilibrioData> => {
      if (!db || ids.length === 0) return EMPTY;

      const parts = await Promise.all(ids.map((id) => fetchPontoEquilibrioRaw(db, id, periodStart, periodEnd)));

      const total: PontoEquilibrioRaw = { ...EMPTY_RAW };
      for (const p of parts) {
        total.receita += p.receita;
        total.custoVariavel += p.custoVariavel;
        total.custoFixo += p.custoFixo;
        total.naoDesembolsavel += p.naoDesembolsavel;
        total.lucroDesejado += p.lucroDesejado;
      }

      return buildPontoEquilibrioData(total);
    },
  });

  return { ...(data ?? EMPTY), isLoading };
}

/* ────────────────────────────────────────────────────────────────────────
 * SÉRIE MENSAL (tendência dos últimos N meses). Cada ponto usa
 * fetchPontoEquilibrioRaw no período [startOfMonth .. min(endOfMonth, hoje)]
 * e calcula os 3 PE (R$). null quando mcInvalida.
 * No consolidado, soma os componentes BRUTOS antes do cálculo.
 * ──────────────────────────────────────────────────────────────────────── */

const SERIE_MAX_EMPRESAS = 12;

export interface PontoEquilibrioSeriePonto {
  mes: string; // "jan/26"
  contabil: number | null;
  financeiro: number | null;
  economico: number | null;
}

export interface UsePontoEquilibrioSerieParams {
  companyId?: string;
  companyIds?: string[];
  meses?: number;
}

function mesLabel(d: Date): string {
  return format(d, "MMM/yy", { locale: ptBR }).replace(".", "");
}

function mesPeriodo(d: Date): { start: string; end: string } | null {
  const hoje = new Date();
  const ini = startOfMonth(d);
  let fim = endOfMonth(d);
  if (fim > hoje) fim = hoje;
  if (fim < ini) return null;
  return { start: format(ini, "yyyy-MM-dd"), end: format(fim, "yyyy-MM-dd") };
}

function rawToPonto(mes: string, raw: PontoEquilibrioRaw): PontoEquilibrioSeriePonto {
  const d = buildPontoEquilibrioData(raw);
  return { mes, contabil: d.peContabil, financeiro: d.peFinanceiro, economico: d.peEconomico };
}

/**
 * Série mensal dos 3 PE (últimos `meses`, incluindo o corrente),
 * do mês mais antigo ao mais recente. Empresa única ou consolidado de grupo.
 */
export function usePontoEquilibrioSerie({ companyId, companyIds, meses = 6 }: UsePontoEquilibrioSerieParams) {
  const { selectedCompany } = useCompany();
  const { activeClient } = useAuth();
  const db = activeClient as any;

  const ids = (companyIds || []).filter(Boolean).slice(0, SERIE_MAX_EMPRESAS);
  const isConsolidado = ids.length > 0;
  const singleId = companyId || selectedCompany?.id;
  const enabled = !!db && (isConsolidado || !!singleId);

  const { data, isLoading } = useQuery({
    queryKey: ["ponto_equilibrio_serie", isConsolidado ? ids : singleId, meses],
    enabled,
    queryFn: async (): Promise<PontoEquilibrioSeriePonto[]> => {
      if (!db) return [];

      const hoje = new Date();
      const mesesDates: Date[] = [];
      for (let i = meses - 1; i >= 0; i--) mesesDates.push(subMonths(hoje, i));

      const pontos = await Promise.all(
        mesesDates.map(async (d): Promise<PontoEquilibrioSeriePonto> => {
          const label = mesLabel(d);
          const per = mesPeriodo(d);
          if (!per) return { mes: label, contabil: null, financeiro: null, economico: null };

          if (isConsolidado) {
            const parts = await Promise.all(ids.map((id) => fetchPontoEquilibrioRaw(db, id, per.start, per.end)));
            const total: PontoEquilibrioRaw = { ...EMPTY_RAW };
            for (const p of parts) {
              total.receita += p.receita;
              total.custoVariavel += p.custoVariavel;
              total.custoFixo += p.custoFixo;
              total.naoDesembolsavel += p.naoDesembolsavel;
              total.lucroDesejado += p.lucroDesejado;
            }
            return rawToPonto(label, total);
          }

          if (!singleId) return { mes: label, contabil: null, financeiro: null, economico: null };
          const raw = await fetchPontoEquilibrioRaw(db, singleId, per.start, per.end);
          return rawToPonto(label, raw);
        }),
      );

      return pontos;
    },
  });

  return { serie: data ?? [], isLoading };
}
