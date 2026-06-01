import { useQuery } from "@tanstack/react-query";
import { format, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Liquidez / Solvência de curto prazo.
 *
 * Reconstrói a posição patrimonial de curto prazo numa data de referência D
 * (= min(periodEnd, hoje); nunca projeta pro futuro) e calcula:
 *  - Liquidez Corrente  = Ativo Circulante / Passivo Circulante
 *  - Liquidez Seca      = (Ativo Circulante − Estoque) / Passivo Circulante
 *  - Liquidez Imediata  = Disponível / Passivo Circulante
 *  - Capital de Giro Líquido (CCL) = Ativo Circulante − Passivo Circulante
 *
 * 100% client-side via activeClient (multi-tenant). Sempre filtra deleted_at IS NULL.
 *
 * Composição (por conta/título, com regras de reconstrução histórica para D < hoje):
 *  - Disponível         = Σ saldo(D) > 0 das contas que NÃO são cartão de crédito nem investimento.
 *  - Caixa positivo     = Σ saldo(D) > 0 de TODAS as contas (compõe o Ativo Circulante).
 *  - Dívida bancária CP = Σ |saldo(D)| das contas com saldo(D) < 0 (cheque especial / fatura cartão).
 *  - CR em aberto       = Σ títulos a receber reconhecidos e não liquidados até D.
 *  - CP em aberto       = Σ títulos a pagar reconhecidos e não liquidados até D.
 *  - Estoque            = Σ produtos ativos de estoque_atual × custo (posição atual; ~0 em serviços).
 *
 * Para o consolidado de grupo, os COMPONENTES BRUTOS são somados entre empresas
 * ANTES de calcular as razões (igual o useCicloCaixaConsolidado).
 */

const OPEN_STATUSES = ["aberto", "parcial", "vencido"];

/** Tipos de conta que NÃO entram no "disponível" da Liquidez Imediata. */
const NAO_DISPONIVEL_TIPOS = ["cartao_credito", "investimento"];

export interface LiquidezData {
  /** Componentes brutos (somáveis entre empresas). */
  disponivel: number;
  caixaPositivo: number;
  dividaBancariaCurto: number;
  crAberto: number;
  cpAberto: number;
  estoque: number;
  ac: number; // ativo circulante
  pc: number; // passivo circulante
  /** Razões (calculadas após somar os componentes). */
  liquidezCorrente: number | null;
  liquidezSeca: number | null;
  liquidezImediata: number | null;
  ccl: number; // capital de giro líquido (sempre calculável; pode ser negativo)
  /** Data de referência efetiva ('YYYY-MM-DD'); para o card exibir "Posição em ...". */
  refDate: string;
}

export interface UseLiquidezParams {
  /** Opcional: sobrescreve a empresa ativa (ex.: dashboard de empresa por rota). */
  companyId?: string;
  periodEnd: string; // 'YYYY-MM-DD'
}

export interface UseLiquidezConsolidadoParams {
  /** IDs das empresas do grupo a consolidar. */
  companyIds: string[];
  periodEnd: string;
}

/** Totais somáveis de UMA empresa (antes de virar razões). */
export interface LiquidezRaw {
  disponivel: number;
  caixaPositivo: number;
  dividaBancariaCurto: number;
  crAberto: number;
  cpAberto: number;
  estoque: number;
  ac: number;
  pc: number;
}

const EMPTY_RAW: LiquidezRaw = {
  disponivel: 0,
  caixaPositivo: 0,
  dividaBancariaCurto: 0,
  crAberto: 0,
  cpAberto: 0,
  estoque: 0,
  ac: 0,
  pc: 0,
};

function emptyData(refDate: string): LiquidezData {
  return {
    ...EMPTY_RAW,
    liquidezCorrente: null,
    liquidezSeca: null,
    liquidezImediata: null,
    ccl: 0,
    refDate,
  };
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

/** Hoje formatado 'YYYY-MM-DD' (local). */
function hojeISO(): string {
  return format(new Date(), "yyyy-MM-dd");
}

/** Data de referência D = min(periodEnd, hoje). Nunca projeta pro futuro. */
function resolveRefDate(periodEnd: string): string {
  const hoje = hojeISO();
  return periodEnd < hoje ? periodEnd : hoje;
}

interface BankRow {
  conta_bancaria_id: string | null;
  tipo: string | null;
  saldo_atual: number | null;
}
interface MovRow {
  conta_bancaria_id: string | null;
  tipo: string | null;
  valor: number | null;
  data: string | null;
}
interface TituloRow {
  valor: number | null;
  valor_pago: number | null;
  data_pagamento: string | null;
  data_vencimento: string | null;
  competencia: string | null;
  status: string | null;
  created_at: string | null;
  venda_id?: string | null;
}

/**
 * Saldo em aberto de um título (CR/CP) na data D, com reconstrução histórica.
 * Retorna null se o título não deve ser contado (cancelado, ainda não reconhecido em D),
 * senão o valor em aberto (>= 0).
 */
function saldoTituloEmD(
  t: TituloRow,
  refDate: string,
  fast: boolean,
  vendaDataById: Map<string, string | null>,
): number | null {
  const status = (t.status || "").toLowerCase();
  if (status === "cancelado") return null;

  const valor = Number(t.valor) || 0;
  const pago = Number(t.valor_pago) || 0;

  if (fast) {
    // Caminho rápido (D >= hoje): posição atual = status em aberto, valor − valor_pago.
    if (!OPEN_STATUSES.includes(status)) return null;
    return valor - pago;
  }

  // Reconstrução histórica (D < hoje).
  // Liquidado até D? pagamento não-nulo e <= D → quitado (saldo = valor − valor_pago, ~0).
  const liquidadoAteD = t.data_pagamento != null && t.data_pagamento <= refDate;
  const saldoAberto = liquidadoAteD ? valor - pago : valor;
  if (saldoAberto <= 0) return null;

  // Reconhecido até D? âncora = 1ª data não-nula em
  //   [competência→1º dia ; (CR) data_venda via venda_id ; data_vencimento ; created_at].
  let ancora: Date | null = competenciaToFirstDay(t.competencia);
  if (!ancora && t.venda_id) ancora = parseDate(vendaDataById.get(t.venda_id));
  if (!ancora) ancora = parseDate(t.data_vencimento);
  if (!ancora) ancora = parseDate(t.created_at);
  if (!ancora) return null; // sem âncora → não dá pra posicionar → ignora

  const dRef = parseDate(refDate);
  if (dRef && ancora > dRef) return null; // ainda não existia em D

  return saldoAberto;
}

/**
 * Busca as linhas de UMA empresa e acumula os componentes brutos (somáveis).
 * NÃO calcula as razões aqui — isso é feito após somar todas as empresas.
 */
export async function fetchLiquidezRaw(db: any, companyId: string, refDate: string): Promise<LiquidezRaw> {
  const fast = refDate >= hojeISO();

  // ── Contas bancárias (saldo da verdade via view) ──
  const { data: bankData, error: bankErr } = await db
    .from("v_saldo_contas_bancarias")
    .select("conta_bancaria_id, tipo, saldo_atual")
    .eq("company_id", companyId);
  if (bankErr) throw bankErr;
  const banks = (bankData || []) as BankRow[];

  // ── Movimentações futuras (> D) para reconstruir saldo histórico ──
  // Inclui transferência (a view saldo_atual inclui tudo; precisa bater).
  const movByConta = new Map<string, number>(); // soma com sinal das movs > D
  if (!fast) {
    const { data: movData, error: movErr } = await db
      .from("movimentacoes")
      .select("conta_bancaria_id, tipo, valor, data")
      .eq("company_id", companyId)
      .gt("data", refDate)
      .limit(100000);
    if (movErr) throw movErr;
    const movs = (movData || []) as MovRow[];
    for (const mv of movs) {
      if (!mv.conta_bancaria_id) continue;
      const v = Number(mv.valor) || 0;
      const sinal = (mv.tipo || "").toLowerCase() === "credito" ? 1 : -1;
      movByConta.set(mv.conta_bancaria_id, (movByConta.get(mv.conta_bancaria_id) || 0) + sinal * v);
    }
  }

  // ── Decomposição bancária por conta ──
  let disponivel = 0;
  let caixaPositivo = 0;
  let dividaBancariaCurto = 0;
  for (const b of banks) {
    const futuro = b.conta_bancaria_id ? movByConta.get(b.conta_bancaria_id) || 0 : 0;
    // saldo(D) = saldo_atual − Σ(movs com data > D, com sinal)
    const saldoD = (Number(b.saldo_atual) || 0) - futuro;
    const tipo = (b.tipo || "").toLowerCase();
    if (saldoD > 0) {
      caixaPositivo += saldoD;
      if (!NAO_DISPONIVEL_TIPOS.includes(tipo)) disponivel += saldoD;
    } else if (saldoD < 0) {
      dividaBancariaCurto += -saldoD;
    }
  }

  // ── CR em aberto em D ──
  const { data: crData, error: crErr } = await db
    .from("contas_receber")
    .select("valor, valor_pago, data_pagamento, data_vencimento, competencia, status, venda_id, created_at")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .limit(50000);
  if (crErr) throw crErr;
  const crs = (crData || []) as TituloRow[];

  // Mapa venda_id -> data_venda (âncora preferencial das CR na reconstrução histórica).
  const vendaDataById = new Map<string, string | null>();
  if (!fast) {
    const vendaIds = new Set<string>();
    for (const cr of crs) {
      if (cr.venda_id) vendaIds.add(cr.venda_id);
    }
    if (vendaIds.size > 0) {
      const { data: vendasData, error: vendasErr } = await db
        .from("vendas")
        .select("id, data_venda")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .in("id", Array.from(vendaIds))
        .limit(50000);
      if (vendasErr) throw vendasErr;
      for (const v of (vendasData || []) as Array<{ id: string; data_venda: string | null }>) {
        vendaDataById.set(v.id, v.data_venda);
      }
    }
  }

  let crAberto = 0;
  for (const cr of crs) {
    const s = saldoTituloEmD(cr, refDate, fast, vendaDataById);
    if (s != null) crAberto += s;
  }

  // ── CP em aberto em D ──
  const { data: cpData, error: cpErr } = await db
    .from("contas_pagar")
    .select("valor, valor_pago, data_pagamento, data_vencimento, competencia, status, created_at")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .limit(50000);
  if (cpErr) throw cpErr;
  const cps = (cpData || []) as TituloRow[];

  let cpAberto = 0;
  for (const cp of cps) {
    const s = saldoTituloEmD(cp, refDate, fast, vendaDataById);
    if (s != null) cpAberto += s;
  }

  // ── Estoque valorizado (posição atual; ~0 em serviços) ──
  const { data: prodData, error: prodErr } = await db
    .from("products")
    .select("estoque_atual, custo_medio, cost_price")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .limit(50000);
  if (prodErr) throw prodErr;
  const prods = (prodData || []) as Array<{
    estoque_atual: number | null;
    custo_medio: number | null;
    cost_price: number | null;
  }>;
  let estoque = 0;
  for (const p of prods) {
    const qtd = Number(p.estoque_atual) || 0;
    const custo = Number(p.custo_medio) || Number(p.cost_price) || 0;
    estoque += qtd * custo;
  }

  const ac = caixaPositivo + crAberto + estoque;
  const pc = cpAberto + dividaBancariaCurto;

  return { disponivel, caixaPositivo, dividaBancariaCurto, crAberto, cpAberto, estoque, ac, pc };
}

/** Converte os componentes brutos (somados) nas razões de liquidez. */
export function buildLiquidezData(raw: LiquidezRaw, refDate: string): LiquidezData {
  const { ac, pc, disponivel, estoque } = raw;
  return {
    ...raw,
    liquidezCorrente: pc > 0 ? ac / pc : null,
    liquidezSeca: pc > 0 ? (ac - estoque) / pc : null,
    liquidezImediata: pc > 0 ? disponivel / pc : null,
    ccl: ac - pc,
    refDate,
  };
}

/** Hook de UMA empresa (empresa selecionada por padrão). */
export function useLiquidez({ companyId, periodEnd }: UseLiquidezParams) {
  const { selectedCompany } = useCompany();
  const { activeClient } = useAuth();
  const db = activeClient as any;
  const resolvedCompanyId = companyId || selectedCompany?.id;
  const refDate = resolveRefDate(periodEnd);

  const { data, isLoading } = useQuery({
    queryKey: ["liquidez", resolvedCompanyId, refDate],
    enabled: !!db && !!resolvedCompanyId,
    queryFn: async (): Promise<LiquidezData> => {
      if (!db || !resolvedCompanyId) return emptyData(refDate);
      const raw = await fetchLiquidezRaw(db, resolvedCompanyId, refDate);
      return buildLiquidezData(raw, refDate);
    },
  });

  return { ...(data ?? emptyData(refDate)), isLoading };
}

/** Hook consolidado de várias empresas (dashboard de grupo). */
export function useLiquidezConsolidado({ companyIds, periodEnd }: UseLiquidezConsolidadoParams) {
  const { activeClient } = useAuth();
  const db = activeClient as any;
  const ids = (companyIds || []).filter(Boolean);
  const refDate = resolveRefDate(periodEnd);

  const { data, isLoading } = useQuery({
    queryKey: ["liquidez_consolidado", ids, refDate],
    enabled: !!db && ids.length > 0,
    queryFn: async (): Promise<LiquidezData> => {
      if (!db || ids.length === 0) return emptyData(refDate);

      const parts = await Promise.all(ids.map((id) => fetchLiquidezRaw(db, id, refDate)));

      const total: LiquidezRaw = { ...EMPTY_RAW };
      for (const p of parts) {
        total.disponivel += p.disponivel;
        total.caixaPositivo += p.caixaPositivo;
        total.dividaBancariaCurto += p.dividaBancariaCurto;
        total.crAberto += p.crAberto;
        total.cpAberto += p.cpAberto;
        total.estoque += p.estoque;
        total.ac += p.ac;
        total.pc += p.pc;
      }

      return buildLiquidezData(total, refDate);
    },
  });

  return { ...(data ?? emptyData(refDate)), isLoading };
}

/* ────────────────────────────────────────────────────────────────────────
 * SÉRIE MENSAL (tendência dos últimos N meses). Cada ponto reconstrói a posição
 * em D = min(endOfMonth(mês), hoje) e calcula Corrente/Seca/Imediata. No
 * consolidado, soma os componentes BRUTOS (ac/pc/estoque/disponível) ANTES de dividir.
 * ──────────────────────────────────────────────────────────────────────── */

/** Limite de empresas no consolidado para conter o custo (meses × empresas chamadas). */
const SERIE_MAX_EMPRESAS = 12;

export interface LiquidezSeriePonto {
  mes: string; // "jan/26"
  corrente: number | null;
  seca: number | null;
  imediata: number | null;
}

export interface UseLiquidezSerieParams {
  companyId?: string;
  companyIds?: string[];
  meses?: number;
}

/** Label "jan/26" (sem ponto da abreviação) para um Date. */
function mesLabel(d: Date): string {
  return format(d, "MMM/yy", { locale: ptBR }).replace(".", "");
}

/** D = min(endOfMonth(d), hoje), em 'YYYY-MM-DD'; null se o mês está no futuro. */
function mesRefDate(d: Date): string | null {
  const hoje = new Date();
  let fim = endOfMonth(d);
  if (fim > hoje) fim = hoje;
  // Se o mês inteiro é futuro (fim ficou antes do 1º dia do mês), ignora.
  if (fim < new Date(d.getFullYear(), d.getMonth(), 1)) return null;
  return format(fim, "yyyy-MM-dd");
}

/** Converte componentes brutos num ponto da série (razões de liquidez). */
function rawToPonto(mes: string, raw: LiquidezRaw): LiquidezSeriePonto {
  const { ac, pc, disponivel, estoque } = raw;
  return {
    mes,
    corrente: pc > 0 ? ac / pc : null,
    seca: pc > 0 ? (ac - estoque) / pc : null,
    imediata: pc > 0 ? disponivel / pc : null,
  };
}

/**
 * Série mensal de Liquidez Corrente/Seca/Imediata (últimos `meses`, incluindo o
 * corrente), do mês mais antigo ao mais recente. Empresa única ou consolidado de grupo.
 */
export function useLiquidezSerie({ companyId, companyIds, meses = 6 }: UseLiquidezSerieParams) {
  const { selectedCompany } = useCompany();
  const { activeClient } = useAuth();
  const db = activeClient as any;

  const ids = (companyIds || []).filter(Boolean).slice(0, SERIE_MAX_EMPRESAS);
  const isConsolidado = ids.length > 0;
  const singleId = companyId || selectedCompany?.id;
  const enabled = !!db && (isConsolidado || !!singleId);

  const { data, isLoading } = useQuery({
    queryKey: ["liquidez_serie", isConsolidado ? ids : singleId, meses],
    enabled,
    queryFn: async (): Promise<LiquidezSeriePonto[]> => {
      if (!db) return [];

      const hoje = new Date();
      const mesesDates: Date[] = [];
      for (let i = meses - 1; i >= 0; i--) mesesDates.push(subMonths(hoje, i));

      const pontos = await Promise.all(
        mesesDates.map(async (d): Promise<LiquidezSeriePonto> => {
          const label = mesLabel(d);
          const refDate = mesRefDate(d);
          if (!refDate) return { mes: label, corrente: null, seca: null, imediata: null };

          if (isConsolidado) {
            const parts = await Promise.all(ids.map((id) => fetchLiquidezRaw(db, id, refDate)));
            const total: LiquidezRaw = { ...EMPTY_RAW };
            for (const p of parts) {
              total.disponivel += p.disponivel;
              total.caixaPositivo += p.caixaPositivo;
              total.dividaBancariaCurto += p.dividaBancariaCurto;
              total.crAberto += p.crAberto;
              total.cpAberto += p.cpAberto;
              total.estoque += p.estoque;
              total.ac += p.ac;
              total.pc += p.pc;
            }
            return rawToPonto(label, total);
          }

          if (!singleId) return { mes: label, corrente: null, seca: null, imediata: null };
          const raw = await fetchLiquidezRaw(db, singleId, refDate);
          return rawToPonto(label, raw);
        }),
      );

      return pontos;
    },
  });

  return { serie: data ?? [], isLoading };
}
