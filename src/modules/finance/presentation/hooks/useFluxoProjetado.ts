import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, addDays } from "date-fns";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Projeção de Caixa ancorada no saldo real (Forma B).
 *
 * Parte do saldo bancário de HOJE (Σ saldo_atual de todas as contas) e projeta
 * dia a dia até `dias` à frente, somando os recebíveis (CR) que vencem e abatendo
 * os compromissos (CP) que vencem. Responde "em que dia o caixa fica no vermelho?".
 *
 *  - saldoInicial = Σ v_saldo_contas_bancarias.saldo_atual (todas as contas).
 *  - serie[dia].saldo = saldoInicial + Σ(entradas − saídas) até aquele dia.
 *  - Vencidos e ainda em aberto (vencimento < hoje) entram em HOJE.
 *  - incluirCR=false → cenário "pior caso": o SALDO ignora os recebíveis
 *    (mas as listas/barras de entradas continuam visíveis, como expectativa).
 *
 * Também devolve as listas item a item (entradasItens / saidasItens) para os
 * painéis laterais de Entradas e Saídas.
 *
 * 100% client-side via activeClient (multi-tenant). Sempre filtra deleted_at IS NULL.
 */

const OPEN_STATUSES = ["aberto", "parcial", "vencido"];

export interface FluxoItem {
  id: string;
  /** Data efetiva no fluxo 'YYYY-MM-DD' (vencimento, ou HOJE se já vencido). */
  data: string;
  descricao: string;
  valor: number;
  vencida: boolean;
  /** Forma de recebimento/pagamento (pix, boleto, dinheiro...). */
  forma?: string;
}

export interface FluxoDia {
  /** Label 'dd/MM'. */
  dia: string;
  /** 'YYYY-MM-DD'. */
  data: string;
  entradas: number;
  saidas: number;
  /** Saldo projetado ao fim do dia (respeita o cenário com/sem CR). */
  saldo: number;
  /** Onda verde: saldo de hoje + entradas acumuladas (recursos disponíveis no tempo). */
  recursos: number;
  /** Onda vermelha: saídas acumuladas (compromissos no tempo). */
  compromissos: number;
}

export interface FluxoProjetadoData {
  saldoInicial: number;
  totalReceber: number;
  totalPagar: number;
  /** Saldo projetado no fim do horizonte. */
  saldoFinal: number;
  /** Menor saldo projetado no horizonte (pode ser negativo). */
  menorSaldo: number;
  /** Data ('YYYY-MM-DD') do menor saldo. */
  menorSaldoData: string | null;
  /** 1º dia em que o saldo projetado fica negativo (null se nunca). */
  diaCritico: string | null;
  serie: FluxoDia[];
  entradasItens: FluxoItem[];
  saidasItens: FluxoItem[];
  /** Recebíveis de cartão (repasse) deixados FORA da projeção — só pra transparência. */
  cartaoReceberExcluido: number;
  cartaoReceberExcluidoCount: number;
  /** Recebíveis VENCIDOS (atrasados) deixados FORA do fluxo — só pra informar. */
  receberAtraso: number;
  receberAtrasoCount: number;
  horizonteDias: number;
  comReceber: boolean;
}

export interface UseFluxoProjetadoParams {
  companyId?: string;
  dias?: number;
  /** Incluir recebíveis (CR) no SALDO projetado. false = cenário "pior caso". */
  incluirCR?: boolean;
  /** Saldo de HOJE que ancora a projeção (definido pelo editor de contas da página). */
  saldoInicial?: number;
}

/** Dados de fluxo (entradas/saídas) — independem do saldo inicial, então não refazem query ao mexer nas contas. */
interface FlowData {
  serieFlow: Array<{ dia: string; data: string; entradas: number; saidas: number }>;
  totalReceber: number;
  totalPagar: number;
  entradasItens: FluxoItem[];
  saidasItens: FluxoItem[];
  cartaoReceberExcluido: number;
  cartaoReceberExcluidoCount: number;
  receberAtraso: number;
  receberAtrasoCount: number;
  horizonteDias: number;
  comReceber: boolean;
}

interface TituloRow {
  id: string;
  valor: number | null;
  valor_pago: number | null;
  data_vencimento: string | null;
  competencia: string | null;
  status: string | null;
  pagador_nome?: string | null;
  credor_nome?: string | null;
  descricao?: string | null;
  forma_recebimento?: string | null;
}

/** Competência 'YYYY-MM' → 1º dia do mês 'YYYY-MM-DD'. */
function competenciaToISO(competencia: string | null | undefined): string | null {
  if (!competencia) return null;
  const m = /^(\d{4})-(\d{2})/.exec(competencia);
  return m ? `${m[1]}-${m[2]}-01` : null;
}

/** Normaliza para 'YYYY-MM-DD' (corta hora). */
function dateISO(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : null;
}

function fmtDiaCurto(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}` : iso;
}

/**
 * Coleta títulos em aberto: mapa por dia + lista item a item + total.
 *
 * overdueMode controla o que fazer com títulos VENCIDOS (vencimento < hoje):
 *  - "fold"    → caem em HOJE (a pagar: você ainda deve, entra no fluxo agora).
 *  - "exclude" → ficam FORA do fluxo (a receber: dinheiro atrasado não é confiável),
 *                somados em vencidoExcluido* só para informar.
 */
function coletar(
  rows: TituloRow[],
  hojeISO: string,
  fimISO: string,
  nomeField: "pagador_nome" | "credor_nome",
  overdueMode: "fold" | "exclude",
): { porDia: Map<string, number>; itens: FluxoItem[]; total: number; vencidoExcluidoTotal: number; vencidoExcluidoCount: number } {
  const porDia = new Map<string, number>();
  const itens: FluxoItem[] = [];
  let total = 0;
  let vencidoExcluidoTotal = 0;
  let vencidoExcluidoCount = 0;

  for (const r of rows) {
    const saldo = (Number(r.valor) || 0) - (Number(r.valor_pago) || 0);
    if (saldo <= 0) continue;
    const vencISO = dateISO(r.data_vencimento) ?? competenciaToISO(r.competencia);
    if (!vencISO) continue;

    let dia: string;
    let vencida = false;
    if (vencISO < hojeISO) {
      if (overdueMode === "exclude") {
        vencidoExcluidoTotal += saldo;
        vencidoExcluidoCount += 1;
        continue;
      }
      dia = hojeISO;
      vencida = true;
    } else if (vencISO > fimISO) {
      continue;
    } else {
      dia = vencISO;
    }

    porDia.set(dia, (porDia.get(dia) || 0) + saldo);
    const nome = (r[nomeField] || r.descricao || "—") as string;
    itens.push({ id: r.id, data: dia, descricao: nome.trim() || "—", valor: saldo, vencida, forma: r.forma_recebimento || undefined });
    total += saldo;
  }

  // Vencidos primeiro; depois por data; maior valor antes.
  itens.sort((a, b) => {
    if (a.data !== b.data) return a.data < b.data ? -1 : 1;
    if (a.vencida !== b.vencida) return a.vencida ? -1 : 1;
    return b.valor - a.valor;
  });

  return { porDia, itens, total, vencidoExcluidoTotal, vencidoExcluidoCount };
}

function emptyFlows(dias: number, incluirCR: boolean): FlowData {
  return {
    serieFlow: [],
    totalReceber: 0,
    totalPagar: 0,
    entradasItens: [],
    saidasItens: [],
    cartaoReceberExcluido: 0,
    cartaoReceberExcluidoCount: 0,
    receberAtraso: 0,
    receberAtrasoCount: 0,
    horizonteDias: dias,
    comReceber: incluirCR,
  };
}

/** Busca CP/CR e monta o fluxo diário de entradas/saídas (NÃO depende do saldo inicial). */
async function fetchFlows(db: any, companyId: string, dias: number, incluirCR: boolean): Promise<FlowData> {
  const hoje = new Date();
  const hojeISO = format(hoje, "yyyy-MM-dd");
  const fimISO = format(addDays(hoje, dias), "yyyy-MM-dd");

  // ── CP em aberto (saídas) — vencidos caem em hoje (você ainda deve) ──
  const { data: cpData, error: cpErr } = await db
    .from("contas_pagar")
    .select("id, valor, valor_pago, data_vencimento, competencia, status, credor_nome, descricao")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .in("status", OPEN_STATUSES)
    .limit(50000);
  if (cpErr) throw cpErr;
  const cp = coletar((cpData || []) as TituloRow[], hojeISO, fimISO, "credor_nome", "fold");

  // ── CR em aberto (entradas) ──
  const { data: crData, error: crErr } = await db
    .from("contas_receber")
    .select("id, valor, valor_pago, data_vencimento, competencia, status, pagador_nome, descricao, forma_recebimento")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .in("status", OPEN_STATUSES)
    .limit(50000);
  if (crErr) throw crErr;

  // Cartão (repasse) fica FORA; vencidos a receber também (dinheiro atrasado não é confiável).
  const crAll = (crData || []) as TituloRow[];
  const isCartao = (r: TituloRow) => (r.forma_recebimento || "").toLowerCase() === "cartao_credito";
  const cr = coletar(crAll.filter((r) => !isCartao(r)), hojeISO, fimISO, "pagador_nome", "exclude");
  const cartao = coletar(crAll.filter(isCartao), hojeISO, fimISO, "pagador_nome", "fold");

  const serieFlow: FlowData["serieFlow"] = [];
  for (let i = 0; i <= dias; i++) {
    const dISO = format(addDays(hoje, i), "yyyy-MM-dd");
    serieFlow.push({ dia: fmtDiaCurto(dISO), data: dISO, entradas: cr.porDia.get(dISO) || 0, saidas: cp.porDia.get(dISO) || 0 });
  }

  return {
    serieFlow,
    totalReceber: cr.total,
    totalPagar: cp.total,
    entradasItens: cr.itens,
    saidasItens: cp.itens,
    cartaoReceberExcluido: cartao.total,
    cartaoReceberExcluidoCount: cartao.itens.length,
    receberAtraso: cr.vencidoExcluidoTotal,
    receberAtrasoCount: cr.vencidoExcluidoCount,
    horizonteDias: dias,
    comReceber: incluirCR,
  };
}

/** Aplica o saldo inicial ao fluxo: monta as ondas (recursos/compromissos), saldo, menor saldo e dia crítico. */
function aplicarSaldo(f: FlowData, saldoInicial: number): FluxoProjetadoData {
  let saldo = saldoInicial;
  let entradasAcum = 0;
  let saidasAcum = 0;
  let menorSaldo = saldoInicial;
  let menorSaldoData: string | null = f.serieFlow[0]?.data ?? null;
  let diaCritico: string | null = null;

  const serie: FluxoDia[] = f.serieFlow.map((p) => {
    entradasAcum += p.entradas;
    saidasAcum += p.saidas;
    saldo = saldoInicial + (f.comReceber ? entradasAcum : 0) - saidasAcum;
    if (saldo < menorSaldo) {
      menorSaldo = saldo;
      menorSaldoData = p.data;
    }
    if (diaCritico === null && saldo < 0) diaCritico = p.data;
    return {
      dia: p.dia,
      data: p.data,
      entradas: p.entradas,
      saidas: p.saidas,
      saldo,
      recursos: saldoInicial + (f.comReceber ? entradasAcum : 0),
      compromissos: saidasAcum,
    };
  });

  return {
    saldoInicial,
    totalReceber: f.totalReceber,
    totalPagar: f.totalPagar,
    saldoFinal: saldo,
    menorSaldo,
    menorSaldoData,
    diaCritico,
    serie,
    entradasItens: f.entradasItens,
    saidasItens: f.saidasItens,
    cartaoReceberExcluido: f.cartaoReceberExcluido,
    cartaoReceberExcluidoCount: f.cartaoReceberExcluidoCount,
    receberAtraso: f.receberAtraso,
    receberAtrasoCount: f.receberAtrasoCount,
    horizonteDias: f.horizonteDias,
    comReceber: f.comReceber,
  };
}

/** Hook de UMA empresa. O saldo inicial vem de fora (editor de contas) e é aplicado em memória. */
export function useFluxoProjetado({ companyId, dias = 30, incluirCR = true, saldoInicial = 0 }: UseFluxoProjetadoParams) {
  const { selectedCompany } = useCompany();
  const { activeClient } = useAuth();
  const db = activeClient as any;
  const resolvedCompanyId = companyId || selectedCompany?.id;

  const { data: flows, isLoading } = useQuery({
    queryKey: ["fluxo_projetado_flows", resolvedCompanyId, dias, incluirCR],
    enabled: !!db && !!resolvedCompanyId,
    queryFn: async (): Promise<FlowData> => {
      if (!db || !resolvedCompanyId) return emptyFlows(dias, incluirCR);
      return fetchFlows(db, resolvedCompanyId, dias, incluirCR);
    },
  });

  const data = useMemo(
    () => aplicarSaldo(flows ?? emptyFlows(dias, incluirCR), saldoInicial),
    [flows, saldoInicial, dias, incluirCR],
  );

  return { ...data, isLoading };
}
