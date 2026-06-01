import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import { fetchMargensRaw } from "@/modules/finance/presentation/hooks/useMargens";

/**
 * Contexto da página de Indicadores (UMA empresa).
 *
 * Reúne os números que dão sentido aos 4 indicadores ANTES deles:
 *  - kpis        : faturamento / despesa total / resultado do período + saldo em caixa (posição atual).
 *  - serie       : faturamento × despesa × resultado dos últimos `meses` meses (gráfico de barras+linha).
 *  - composicao  : decomposição do resultado do período (Receita − Custo − Despesa Op. − Outras).
 *
 * Reusa fetchMargensRaw (useMargens) → mesma classificação de CP por competência e
 * mesmo regime de competência. 100% client-side via activeClient (multi-tenant).
 * NÃO faz versão consolidada (a aba Indicadores é sempre por empresa).
 */

export interface ContextoKpis {
  faturamento: number;
  despesaTotal: number;
  resultado: number;
  saldoCaixa: number;
}

export interface ContextoSeriePonto {
  mes: string; // "jan/26"
  faturamento: number;
  despesa: number;
  resultado: number;
}

export interface ContextoComposicao {
  receita: number;
  custo: number;
  despesaOperacional: number;
  outras: number;
  despesaTotal: number;
  resultado: number;
}

export interface ContextoIndicadoresData {
  kpis: ContextoKpis;
  serie: ContextoSeriePonto[];
  composicao: ContextoComposicao;
}

export interface UseContextoIndicadoresParams {
  companyId?: string;
  periodStart: string; // 'YYYY-MM-DD'
  periodEnd: string; // 'YYYY-MM-DD'
  meses?: number;
}

const EMPTY_COMPOSICAO: ContextoComposicao = {
  receita: 0,
  custo: 0,
  despesaOperacional: 0,
  outras: 0,
  despesaTotal: 0,
  resultado: 0,
};

const EMPTY: ContextoIndicadoresData = {
  kpis: { faturamento: 0, despesaTotal: 0, resultado: 0, saldoCaixa: 0 },
  serie: [],
  composicao: EMPTY_COMPOSICAO,
};

/* ── Helpers de mês (idênticos aos demais hooks de indicadores) ── */

/** Label "jan/26" (sem ponto da abreviação) para um Date. */
function mesLabel(d: Date): string {
  return format(d, "MMM/yy", { locale: ptBR }).replace(".", "");
}

/** Período [1º dia, min(último dia, hoje)] do mês de `d`, em 'YYYY-MM-DD'; null se futuro. */
function mesPeriodo(d: Date): { start: string; end: string } | null {
  const hoje = new Date();
  const ini = startOfMonth(d);
  let fim = endOfMonth(d);
  if (fim > hoje) fim = hoje;
  if (fim < ini) return null; // mês inteiramente no futuro
  return { start: format(ini, "yyyy-MM-dd"), end: format(fim, "yyyy-MM-dd") };
}

/** Soma o saldo atual de todas as contas bancárias da empresa (posição atual). */
async function fetchSaldoCaixa(db: any, companyId: string): Promise<number> {
  const { data, error } = await db
    .from("v_saldo_contas_bancarias")
    .select("saldo_atual")
    .eq("company_id", companyId);
  if (error) throw error;
  return ((data || []) as Array<{ saldo_atual: number | null }>).reduce(
    (acc, r) => acc + (Number(r.saldo_atual) || 0),
    0,
  );
}

export function useContextoIndicadores({
  companyId,
  periodStart,
  periodEnd,
  meses = 12,
}: UseContextoIndicadoresParams) {
  const { activeClient } = useAuth();
  const db = activeClient as any;

  const { data, isLoading } = useQuery({
    queryKey: ["contexto_indicadores", companyId, periodStart, periodEnd, meses],
    enabled: !!db && !!companyId,
    queryFn: async (): Promise<ContextoIndicadoresData> => {
      if (!db || !companyId) return EMPTY;

      // ── Composição do período atual ──
      const raw = await fetchMargensRaw(db, companyId, periodStart, periodEnd);
      const despesaTotal = raw.custo + raw.despesaOperacional + raw.outras;
      const resultado = raw.receita - despesaTotal;
      const composicao: ContextoComposicao = {
        receita: raw.receita,
        custo: raw.custo,
        despesaOperacional: raw.despesaOperacional,
        outras: raw.outras,
        despesaTotal,
        resultado,
      };

      // ── Série mensal (últimos `meses`, do mais antigo ao corrente) ──
      const hoje = new Date();
      const mesesDates: Date[] = [];
      for (let i = meses - 1; i >= 0; i--) mesesDates.push(subMonths(hoje, i));

      const serie = await Promise.all(
        mesesDates.map(async (d): Promise<ContextoSeriePonto> => {
          const label = mesLabel(d);
          const per = mesPeriodo(d);
          if (!per) return { mes: label, faturamento: 0, despesa: 0, resultado: 0 };
          const r = await fetchMargensRaw(db, companyId, per.start, per.end);
          const desp = r.custo + r.despesaOperacional + r.outras;
          return { mes: label, faturamento: r.receita, despesa: desp, resultado: r.receita - desp };
        }),
      );

      // ── Saldo em caixa (posição atual) ──
      const saldoCaixa = await fetchSaldoCaixa(db, companyId);

      const kpis: ContextoKpis = {
        faturamento: composicao.receita,
        despesaTotal,
        resultado,
        saldoCaixa,
      };

      return { kpis, serie, composicao };
    },
  });

  return { ...(data ?? EMPTY), isLoading };
}
