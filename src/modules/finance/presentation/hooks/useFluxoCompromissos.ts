import { useQuery } from "@tanstack/react-query";
import { format, addDays } from "date-fns";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Fluxo de Caixa — Compromissos a Pagar (CP), horizonte de 1 mês.
 *
 * Lista as contas a pagar EM ABERTO que vencem nos próximos `dias` (default 30),
 * dia a dia pela data de vencimento (fallback competência), e acumula o desembolso
 * partindo do ZERO. Considera só o lado a pagar (CP) — não inclui saldo bancário
 * atual nem recebíveis.
 *
 *  - itens[]   = um por título de CP, ordenado por vencimento, com saldo acumulado.
 *  - dias[]    = agregado por dia (a pagar no dia + acumulado) para o gráfico.
 *  - Vencidas e ainda em aberto (vencimento < hoje) caem em HOJE (pagar já) e
 *    são destacadas à parte.
 *  - CP que vencem além do horizonte ficam fora (footer).
 *
 * 100% client-side via activeClient (multi-tenant). Sempre filtra deleted_at IS NULL.
 * Consolidado de grupo: junta os itens de todas as empresas e reordena por data.
 */

const OPEN_STATUSES = ["aberto", "parcial", "vencido"];

export interface CompromissoItem {
  id: string;
  /** Data efetiva no fluxo, 'YYYY-MM-DD' (vencimento, ou HOJE se já vencida). */
  data: string;
  descricao: string;
  /** Saldo em aberto do título (valor − valor_pago). */
  valor: number;
  vencida: boolean;
  /** Saldo acumulado até este item (parte do zero), na ordem do fluxo. */
  acumulado: number;
}

export interface CompromissoDia {
  /** Label 'dd/MM'. */
  dia: string;
  /** 'YYYY-MM-DD'. */
  data: string;
  /** A pagar que vence neste dia. */
  aPagar: number;
  /** Acumulado até o fim do dia (parte do zero). */
  acumulado: number;
}

export interface CompromissosData {
  itens: CompromissoItem[];
  dias: CompromissoDia[];
  /** Total a pagar no horizonte (= acumulado final; inclui vencidas). */
  totalAPagar: number;
  vencidoTotal: number;
  vencidoCount: number;
  /** Dia de maior desembolso no horizonte. */
  maiorDia: { data: string; valor: number } | null;
  /** CP em aberto que vencem ALÉM do horizonte (fora da lista). */
  alemHorizonte: number;
  /** CP em aberto sem data de vencimento nem competência. */
  semData: number;
  totalTitulos: number;
  /** Horizonte usado, em dias. */
  horizonteDias: number;
}

export interface UseCompromissosParams {
  companyId?: string;
  dias?: number;
}

export interface UseCompromissosConsolidadoParams {
  companyIds: string[];
  dias?: number;
}

interface CpRow {
  id: string;
  valor: number | null;
  valor_pago: number | null;
  data_vencimento: string | null;
  competencia: string | null;
  status: string | null;
  credor_nome: string | null;
  descricao: string | null;
}

/** Item bruto (sem acumulado) — usado antes de juntar/ordenar. */
interface RawItem {
  id: string;
  data: string;
  descricao: string;
  valor: number;
  vencida: boolean;
}

interface RawResult {
  itens: RawItem[];
  vencidoTotal: number;
  vencidoCount: number;
  alemHorizonte: number;
  semData: number;
}

/** Competência 'YYYY-MM' → 1º dia do mês em 'YYYY-MM-DD'. */
function competenciaToISO(competencia: string | null | undefined): string | null {
  if (!competencia) return null;
  const m = /^(\d{4})-(\d{2})/.exec(competencia);
  if (!m) return null;
  return `${m[1]}-${m[2]}-01`;
}

/** Normaliza 'YYYY-MM-DD' (corta hora se vier timestamp). */
function dateISO(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : null;
}

/** Formata 'YYYY-MM-DD' como 'dd/MM' (sem shift de timezone). */
function fmtDiaCurto(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}` : iso;
}

function emptyData(dias: number): CompromissosData {
  return {
    itens: [],
    dias: [],
    totalAPagar: 0,
    vencidoTotal: 0,
    vencidoCount: 0,
    maiorDia: null,
    alemHorizonte: 0,
    semData: 0,
    totalTitulos: 0,
    horizonteDias: dias,
  };
}

/** Busca as CP em aberto de UMA empresa e produz os itens BRUTOS no horizonte. */
export async function fetchCompromissosRaw(db: any, companyId: string, dias: number): Promise<RawResult> {
  const hojeISO = format(new Date(), "yyyy-MM-dd");
  const fimISO = format(addDays(new Date(), dias), "yyyy-MM-dd");

  const { data, error } = await db
    .from("contas_pagar")
    .select("id, valor, valor_pago, data_vencimento, competencia, status, credor_nome, descricao")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .in("status", OPEN_STATUSES)
    .limit(50000);
  if (error) throw error;
  const rows = (data || []) as CpRow[];

  const itens: RawItem[] = [];
  let vencidoTotal = 0;
  let vencidoCount = 0;
  let alemHorizonte = 0;
  let semData = 0;

  for (const r of rows) {
    const valor = (Number(r.valor) || 0) - (Number(r.valor_pago) || 0);
    if (valor <= 0) continue;

    const vencISO = dateISO(r.data_vencimento) ?? competenciaToISO(r.competencia);
    if (!vencISO) {
      semData += valor;
      continue;
    }

    let data = vencISO;
    let vencida = false;
    if (vencISO < hojeISO) {
      // Vencida e em aberto → cai em HOJE (pagar já).
      data = hojeISO;
      vencida = true;
      vencidoTotal += valor;
      vencidoCount += 1;
    } else if (vencISO > fimISO) {
      alemHorizonte += valor;
      continue;
    }

    itens.push({
      id: r.id,
      data,
      descricao: (r.credor_nome || r.descricao || "—").trim() || "—",
      valor,
      vencida,
    });
  }

  return { itens, vencidoTotal, vencidoCount, alemHorizonte, semData };
}

/** Junta itens (já mesclados, se consolidado), ordena por data e calcula acumulados. */
function buildCompromissosData(raw: RawResult, dias: number): CompromissosData {
  // Vencidas (data=hoje) primeiro; depois por data crescente.
  const itensOrdenados = [...raw.itens].sort((a, b) => {
    if (a.data !== b.data) return a.data < b.data ? -1 : 1;
    if (a.vencida !== b.vencida) return a.vencida ? -1 : 1;
    return b.valor - a.valor;
  });

  let acc = 0;
  const itens: CompromissoItem[] = itensOrdenados.map((it) => {
    acc += it.valor;
    return { ...it, acumulado: acc };
  });
  const totalAPagar = acc;

  // Agregado por dia.
  const porDia = new Map<string, number>();
  for (const it of itensOrdenados) porDia.set(it.data, (porDia.get(it.data) || 0) + it.valor);
  const diasOrdenados = Array.from(porDia.keys()).sort();
  let accDia = 0;
  let maiorDia: { data: string; valor: number } | null = null;
  const diasArr: CompromissoDia[] = diasOrdenados.map((data) => {
    const aPagar = porDia.get(data) || 0;
    accDia += aPagar;
    if (!maiorDia || aPagar > maiorDia.valor) maiorDia = { data, valor: aPagar };
    return { dia: fmtDiaCurto(data), data, aPagar, acumulado: accDia };
  });

  return {
    itens,
    dias: diasArr,
    totalAPagar,
    vencidoTotal: raw.vencidoTotal,
    vencidoCount: raw.vencidoCount,
    maiorDia: maiorDia && maiorDia.valor > 0 ? maiorDia : null,
    alemHorizonte: raw.alemHorizonte,
    semData: raw.semData,
    totalTitulos: itens.length,
    horizonteDias: dias,
  };
}

/** Hook de UMA empresa (empresa selecionada por padrão). */
export function useFluxoCompromissos({ companyId, dias = 30 }: UseCompromissosParams) {
  const { selectedCompany } = useCompany();
  const { activeClient } = useAuth();
  const db = activeClient as any;
  const resolvedCompanyId = companyId || selectedCompany?.id;

  const { data, isLoading } = useQuery({
    queryKey: ["fluxo_compromissos", resolvedCompanyId, dias],
    enabled: !!db && !!resolvedCompanyId,
    queryFn: async (): Promise<CompromissosData> => {
      if (!db || !resolvedCompanyId) return emptyData(dias);
      const raw = await fetchCompromissosRaw(db, resolvedCompanyId, dias);
      return buildCompromissosData(raw, dias);
    },
  });

  return { ...(data ?? emptyData(dias)), isLoading };
}

/** Hook consolidado de várias empresas (dashboard de grupo). */
export function useFluxoCompromissosConsolidado({ companyIds, dias = 30 }: UseCompromissosConsolidadoParams) {
  const { activeClient } = useAuth();
  const db = activeClient as any;
  const ids = (companyIds || []).filter(Boolean);

  const { data, isLoading } = useQuery({
    queryKey: ["fluxo_compromissos_consolidado", ids, dias],
    enabled: !!db && ids.length > 0,
    queryFn: async (): Promise<CompromissosData> => {
      if (!db || ids.length === 0) return emptyData(dias);

      const parts = await Promise.all(ids.map((id) => fetchCompromissosRaw(db, id, dias)));
      const merged: RawResult = { itens: [], vencidoTotal: 0, vencidoCount: 0, alemHorizonte: 0, semData: 0 };
      for (const p of parts) {
        merged.itens.push(...p.itens);
        merged.vencidoTotal += p.vencidoTotal;
        merged.vencidoCount += p.vencidoCount;
        merged.alemHorizonte += p.alemHorizonte;
        merged.semData += p.semData;
      }
      return buildCompromissosData(merged, dias);
    },
  });

  return { ...(data ?? emptyData(dias)), isLoading };
}
