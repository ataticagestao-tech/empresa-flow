import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Ciclo de Caixa (PMR, PMP e Ciclo Financeiro).
 *
 * Calcula DOIS métodos:
 *  - Giro/Saldo (DSO/DPO) [PRINCIPAL]: saldos em aberto sobre o fluxo do período.
 *  - Evento (data a data) [CONFERÊNCIA]: média ponderada do tempo real entre
 *    a âncora do título e o pagamento.
 *
 * 100% client-side via activeClient (multi-tenant). Sempre filtra deleted_at IS NULL.
 */

const OPEN_STATUSES = ["aberto", "parcial", "vencido"];
const PAID_STATUSES = ["pago", "parcial"];

/** Threshold abaixo do qual a amostra de CP é insuficiente para PMP/Ciclo. */
export const CICLO_CAIXA_MIN_CP_SAMPLE = 8;

export interface CicloCaixaMetodoGiro {
  pmr: number | null;
  pmp: number | null;
  ciclo: number | null;
}

export interface CicloCaixaMetodoEvento {
  pmr: number | null;
  pmp: number | null;
  ciclo: number | null;
  nCR: number;
  nCP: number;
}

export interface CicloCaixaData {
  receita: number;
  compras: number;
  saldoCRaberto: number;
  saldoCPaberto: number;
  nDias: number;
  giro: CicloCaixaMetodoGiro;
  evento: CicloCaixaMetodoEvento;
}

export interface UseCicloCaixaParams {
  /** Opcional: sobrescreve a empresa ativa (ex.: dashboard de empresa por rota). */
  companyId?: string;
  periodStart: string; // 'YYYY-MM-DD'
  periodEnd: string; // 'YYYY-MM-DD'
}

export interface UseCicloCaixaConsolidadoParams {
  /** IDs das empresas do grupo a consolidar. */
  companyIds: string[];
  periodStart: string;
  periodEnd: string;
}

const EMPTY: CicloCaixaData = {
  receita: 0,
  compras: 0,
  saldoCRaberto: 0,
  saldoCPaberto: 0,
  nDias: 0,
  giro: { pmr: null, pmp: null, ciclo: null },
  evento: { pmr: null, pmp: null, ciclo: null, nCR: 0, nCP: 0 },
};

/** Acumulador interno do método Evento, somável entre empresas. */
export interface EventoAcc {
  crWeightSum: number;
  crWeightedDays: number;
  nCR: number;
  cpWeightSum: number;
  cpWeightedDays: number;
  nCP: number;
}

/** Totais somáveis de UMA empresa (antes de virar PMR/PMP, que são razões). */
export interface CicloRaw {
  receita: number;
  compras: number;
  saldoCRaberto: number;
  saldoCPaberto: number;
  evento: EventoAcc;
}

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

/** Diferença em dias inteiros (b - a). */
function diffDays(a: Date, b: Date): number {
  const MS = 24 * 60 * 60 * 1000;
  return Math.round((b.getTime() - a.getTime()) / MS);
}

/** Número de dias do período (inclusive). */
export function periodDays(start: string, end: string): number {
  const s = parseDate(start);
  const e = parseDate(end);
  if (!s || !e) return 0;
  return Math.max(0, diffDays(s, e) + 1);
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

/**
 * Busca as linhas de UMA empresa e acumula os totais brutos (somáveis).
 * NÃO calcula PMR/PMP aqui — isso é feito após somar todas as empresas,
 * para que o consolidado de grupo seja matematicamente correto.
 */
export async function fetchCicloRaw(
  db: any,
  companyId: string,
  periodStart: string,
  periodEnd: string,
): Promise<CicloRaw> {
  // --- Vendas confirmadas no período (Receita) ---
  const { data: vendasData, error: vendasErr } = await db
    .from("vendas")
    .select("id, valor_liquido, data_venda")
    .eq("company_id", companyId)
    .eq("status", "confirmado")
    .is("deleted_at", null)
    .gte("data_venda", periodStart)
    .lte("data_venda", periodEnd)
    .limit(50000);
  if (vendasErr) throw vendasErr;
  const vendas = (vendasData || []) as Array<{ id: string; valor_liquido: number | null; data_venda: string | null }>;

  const receita = vendas.reduce((acc, v) => acc + (Number(v.valor_liquido) || 0), 0);

  // --- Contas a receber (todas da empresa; filtro em JS por período/status) ---
  const { data: crData, error: crErr } = await db
    .from("contas_receber")
    .select("valor, valor_pago, data_pagamento, competencia, status, venda_id")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .limit(50000);
  if (crErr) throw crErr;
  const crs = (crData || []) as Array<{
    valor: number | null;
    valor_pago: number | null;
    data_pagamento: string | null;
    competencia: string | null;
    status: string | null;
    venda_id: string | null;
  }>;

  // --- Contas a pagar ---
  const { data: cpData, error: cpErr } = await db
    .from("contas_pagar")
    .select("valor, valor_pago, data_pagamento, data_vencimento, competencia, status")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .limit(50000);
  if (cpErr) throw cpErr;
  const cps = (cpData || []) as Array<{
    valor: number | null;
    valor_pago: number | null;
    data_pagamento: string | null;
    data_vencimento: string | null;
    competencia: string | null;
    status: string | null;
  }>;

  // Mapa venda_id -> data_venda (âncora preferencial das CR no método Evento)
  const vendaDataById = new Map<string, string | null>();
  for (const v of vendas) vendaDataById.set(v.id, v.data_venda);
  // CR cuja venda não está no período ainda precisa da data_venda → busca complementar.
  const missingVendaIds = new Set<string>();
  for (const cr of crs) {
    if (cr.venda_id && !vendaDataById.has(cr.venda_id)) missingVendaIds.add(cr.venda_id);
  }
  if (missingVendaIds.size > 0) {
    const { data: extraVendas, error: extraErr } = await db
      .from("vendas")
      .select("id, data_venda")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .in("id", Array.from(missingVendaIds));
    if (extraErr) throw extraErr;
    for (const v of (extraVendas || []) as Array<{ id: string; data_venda: string | null }>) {
      vendaDataById.set(v.id, v.data_venda);
    }
  }

  // --- Compras (Método Giro): Σ CP cujo mês de competência cai no período;
  //     se sem competência, usa data_vencimento dentro do período. ---
  let compras = 0;
  for (const cp of cps) {
    const valor = Number(cp.valor) || 0;
    if (cp.competencia) {
      if (competenciaInPeriod(cp.competencia, periodStart, periodEnd)) compras += valor;
    } else {
      const venc = cp.data_vencimento;
      if (venc && venc >= periodStart && venc <= periodEnd) compras += valor;
    }
  }

  // --- Saldos em aberto atuais (Método Giro) ---
  const saldoCRaberto = crs
    .filter((cr) => OPEN_STATUSES.includes((cr.status || "").toLowerCase()))
    .reduce((acc, cr) => acc + ((Number(cr.valor) || 0) - (Number(cr.valor_pago) || 0)), 0);

  const saldoCPaberto = cps
    .filter((cp) => OPEN_STATUSES.includes((cp.status || "").toLowerCase()))
    .reduce((acc, cp) => acc + ((Number(cp.valor) || 0) - (Number(cp.valor_pago) || 0)), 0);

  // --- Método Evento (acumuladores somáveis) ---
  const evento: EventoAcc = {
    crWeightSum: 0,
    crWeightedDays: 0,
    nCR: 0,
    cpWeightSum: 0,
    cpWeightedDays: 0,
    nCP: 0,
  };

  // PMR_B: média ponderada por valor_pago de (data_pagamento - âncoraCR)
  for (const cr of crs) {
    const status = (cr.status || "").toLowerCase();
    if (!PAID_STATUSES.includes(status)) continue;
    if (!cr.data_pagamento || cr.data_pagamento < periodStart || cr.data_pagamento > periodEnd) continue;
    const pago = parseDate(cr.data_pagamento);
    if (!pago) continue;

    // âncora: data_venda da venda; senão 1º dia do mês de competência; senão pular
    let ancora: Date | null = null;
    if (cr.venda_id) ancora = parseDate(vendaDataById.get(cr.venda_id));
    if (!ancora) ancora = competenciaToFirstDay(cr.competencia);
    if (!ancora) continue;

    const dias = diffDays(ancora, pago);
    if (dias < 0) continue;

    const peso = Number(cr.valor_pago) || 0;
    if (peso <= 0) continue;
    evento.crWeightSum += peso;
    evento.crWeightedDays += peso * dias;
    evento.nCR += 1;
  }

  // PMP_B: média ponderada por valor_pago de (data_pagamento - âncoraCP)
  for (const cp of cps) {
    const status = (cp.status || "").toLowerCase();
    if (!PAID_STATUSES.includes(status)) continue;
    if (!cp.data_pagamento || cp.data_pagamento < periodStart || cp.data_pagamento > periodEnd) continue;
    const pago = parseDate(cp.data_pagamento);
    if (!pago) continue;

    // âncora: 1º dia do mês de competência; senão data_vencimento; senão pular
    let ancora: Date | null = competenciaToFirstDay(cp.competencia);
    if (!ancora) ancora = parseDate(cp.data_vencimento);
    if (!ancora) continue;

    const dias = diffDays(ancora, pago);
    if (dias < 0) continue;

    const peso = Number(cp.valor_pago) || 0;
    if (peso <= 0) continue;
    evento.cpWeightSum += peso;
    evento.cpWeightedDays += peso * dias;
    evento.nCP += 1;
  }

  return { receita, compras, saldoCRaberto, saldoCPaberto, evento };
}

/** Converte os totais brutos (somados) em PMR/PMP/Ciclo dos dois métodos. */
function buildCicloData(raw: CicloRaw, nDias: number): CicloCaixaData {
  const { receita, compras, saldoCRaberto, saldoCPaberto, evento } = raw;

  // Método A — Giro/Saldo (DSO/DPO)
  const pmrA = receita > 0 && nDias > 0 ? (saldoCRaberto / receita) * nDias : null;
  const pmpA = compras > 0 && nDias > 0 ? (saldoCPaberto / compras) * nDias : null;
  const cicloA = pmrA != null && pmpA != null ? pmrA - pmpA : null;

  // Método B — Evento (data a data)
  const pmrB = evento.crWeightSum > 0 ? evento.crWeightedDays / evento.crWeightSum : null;
  const pmpB = evento.cpWeightSum > 0 ? evento.cpWeightedDays / evento.cpWeightSum : null;
  const cicloB = pmrB != null && pmpB != null ? pmrB - pmpB : null;

  return {
    receita,
    compras,
    saldoCRaberto,
    saldoCPaberto,
    nDias,
    giro: { pmr: pmrA, pmp: pmpA, ciclo: cicloA },
    evento: { pmr: pmrB, pmp: pmpB, ciclo: cicloB, nCR: evento.nCR, nCP: evento.nCP },
  };
}

/** Hook de UMA empresa (empresa selecionada por padrão). */
export function useCicloCaixa({ companyId, periodStart, periodEnd }: UseCicloCaixaParams) {
  const { selectedCompany } = useCompany();
  const { activeClient } = useAuth();
  const db = activeClient as any;
  const resolvedCompanyId = companyId || selectedCompany?.id;

  const { data, isLoading } = useQuery({
    queryKey: ["ciclo_caixa", resolvedCompanyId, periodStart, periodEnd],
    enabled: !!db && !!resolvedCompanyId,
    queryFn: async (): Promise<CicloCaixaData> => {
      if (!db || !resolvedCompanyId) return EMPTY;
      const nDias = periodDays(periodStart, periodEnd);
      const raw = await fetchCicloRaw(db, resolvedCompanyId, periodStart, periodEnd);
      return buildCicloData(raw, nDias);
    },
  });

  return { ...(data ?? EMPTY), isLoading };
}

/** Hook consolidado de várias empresas (dashboard de grupo). */
export function useCicloCaixaConsolidado({
  companyIds,
  periodStart,
  periodEnd,
}: UseCicloCaixaConsolidadoParams) {
  const { activeClient } = useAuth();
  const db = activeClient as any;
  const ids = (companyIds || []).filter(Boolean);

  const { data, isLoading } = useQuery({
    queryKey: ["ciclo_caixa_consolidado", ids, periodStart, periodEnd],
    enabled: !!db && ids.length > 0,
    queryFn: async (): Promise<CicloCaixaData> => {
      if (!db || ids.length === 0) return EMPTY;
      const nDias = periodDays(periodStart, periodEnd);

      const parts = await Promise.all(
        ids.map((id) => fetchCicloRaw(db, id, periodStart, periodEnd)),
      );

      const total: CicloRaw = {
        receita: 0,
        compras: 0,
        saldoCRaberto: 0,
        saldoCPaberto: 0,
        evento: { crWeightSum: 0, crWeightedDays: 0, nCR: 0, cpWeightSum: 0, cpWeightedDays: 0, nCP: 0 },
      };
      for (const p of parts) {
        total.receita += p.receita;
        total.compras += p.compras;
        total.saldoCRaberto += p.saldoCRaberto;
        total.saldoCPaberto += p.saldoCPaberto;
        total.evento.crWeightSum += p.evento.crWeightSum;
        total.evento.crWeightedDays += p.evento.crWeightedDays;
        total.evento.nCR += p.evento.nCR;
        total.evento.cpWeightSum += p.evento.cpWeightSum;
        total.evento.cpWeightedDays += p.evento.cpWeightedDays;
        total.evento.nCP += p.evento.nCP;
      }

      return buildCicloData(total, nDias);
    },
  });

  return { ...(data ?? EMPTY), isLoading };
}

/* ────────────────────────────────────────────────────────────────────────
 * SÉRIE MENSAL (tendência dos últimos N meses) — método Evento (data a data),
 * que reconstrói bem o passado. Cada ponto do mês usa fetchCicloRaw no período
 * [startOfMonth .. min(endOfMonth, hoje)] e divide os acumuladores ponderados.
 * No consolidado, soma os acumuladores BRUTOS de todas as empresas ANTES de dividir.
 * ──────────────────────────────────────────────────────────────────────── */

/** Limite de empresas no consolidado para conter o custo (meses × empresas chamadas). */
const SERIE_MAX_EMPRESAS = 12;

export interface CicloSeriePonto {
  mes: string; // "jan/26"
  pmr: number | null;
  pmp: number | null;
  ciclo: number | null;
}

export interface UseCicloCaixaSerieParams {
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

/** Soma os acumuladores do método Evento de vários CicloRaw. */
function somaEvento(parts: CicloRaw[]): EventoAcc {
  const acc: EventoAcc = {
    crWeightSum: 0,
    crWeightedDays: 0,
    nCR: 0,
    cpWeightSum: 0,
    cpWeightedDays: 0,
    nCP: 0,
  };
  for (const p of parts) {
    acc.crWeightSum += p.evento.crWeightSum;
    acc.crWeightedDays += p.evento.crWeightedDays;
    acc.nCR += p.evento.nCR;
    acc.cpWeightSum += p.evento.cpWeightSum;
    acc.cpWeightedDays += p.evento.cpWeightedDays;
    acc.nCP += p.evento.nCP;
  }
  return acc;
}

/** Converte acumuladores do método Evento num ponto da série (PMR/PMP/Ciclo). */
function eventoToPonto(mes: string, ev: EventoAcc): CicloSeriePonto {
  const pmr = ev.crWeightSum > 0 ? ev.crWeightedDays / ev.crWeightSum : null;
  const pmp = ev.cpWeightSum > 0 ? ev.cpWeightedDays / ev.cpWeightSum : null;
  const ciclo = pmr != null && pmp != null ? pmr - pmp : null;
  return { mes, pmr, pmp, ciclo };
}

/**
 * Série mensal de PMR/PMP/Ciclo (últimos `meses`, incluindo o corrente),
 * do mês mais antigo ao mais recente. Atende empresa única ou consolidado de grupo.
 */
export function useCicloCaixaSerie({ companyId, companyIds, meses = 6 }: UseCicloCaixaSerieParams) {
  const { selectedCompany } = useCompany();
  const { activeClient } = useAuth();
  const db = activeClient as any;

  const ids = (companyIds || []).filter(Boolean).slice(0, SERIE_MAX_EMPRESAS);
  const isConsolidado = ids.length > 0;
  const singleId = companyId || selectedCompany?.id;
  const enabled = !!db && (isConsolidado || !!singleId);

  const { data, isLoading } = useQuery({
    queryKey: ["ciclo_caixa_serie", isConsolidado ? ids : singleId, meses],
    enabled,
    queryFn: async (): Promise<CicloSeriePonto[]> => {
      if (!db) return [];

      // Meses do mais antigo ao mais recente (incluindo o corrente).
      const hoje = new Date();
      const mesesDates: Date[] = [];
      for (let i = meses - 1; i >= 0; i--) mesesDates.push(subMonths(hoje, i));

      const pontos = await Promise.all(
        mesesDates.map(async (d): Promise<CicloSeriePonto> => {
          const label = mesLabel(d);
          const per = mesPeriodo(d);
          if (!per) return { mes: label, pmr: null, pmp: null, ciclo: null };

          if (isConsolidado) {
            const parts = await Promise.all(
              ids.map((id) => fetchCicloRaw(db, id, per.start, per.end)),
            );
            return eventoToPonto(label, somaEvento(parts));
          }

          if (!singleId) return { mes: label, pmr: null, pmp: null, ciclo: null };
          const raw = await fetchCicloRaw(db, singleId, per.start, per.end);
          return eventoToPonto(label, raw.evento);
        }),
      );

      return pontos;
    },
  });

  return { serie: data ?? [], isLoading };
}
