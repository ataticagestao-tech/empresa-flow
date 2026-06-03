import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CotacaoCambio {
    compra: number | null;
    venda: number | null;
    data: string | null;
    moeda: string;
}

export interface IndicadorSGS {
    nome: string;
    valor: number | null;
    data: string | null;
    unidade: string;
}

export interface Noticia {
    titulo: string;
    resumo: string;
    link: string;
    data: string;
    fonte: string;
}

export interface AtivoBolsa {
    label: string;
    symbol: string;
    tipo: "indice" | "acao" | "moeda";
    preco: number | null;
    variacao_pct: number | null;
}

export interface IndicadoresData {
    atualizado_em: string;
    cambio: { dolar: CotacaoCambio; euro: CotacaoCambio };
    juros: { selic: IndicadorSGS; cdi: IndicadorSGS };
    inflacao: {
        ipca: IndicadorSGS;
        ipca_12m: IndicadorSGS;
        igpm: IndicadorSGS;
        inpc: IndicadorSGS;
    };
    economia?: {
        inadimplencia_pf: IndicadorSGS;
        salario_minimo: IndicadorSGS;
        credito_familias_12m: IndicadorSGS;
    };
    setorial?: {
        desemprego: IndicadorSGS;
        ipca_saude: IndicadorSGS;
        ipca_educacao: IndicadorSGS;
        pmc_varejo: IndicadorSGS;
        pms_servicos: IndicadorSGS;
    };
    bolsa: AtivoBolsa[];
    noticias: Noticia[];
}

/**
 * Busca indicadores econômicos + notícias via Edge Function
 * `indicadores-economicos`. A função agrega BCB/IBGE/Agência Brasil
 * e cacheia em memória; aqui o react-query revalida a cada 5 min.
 */
export function useIndicadores() {
    const query = useQuery<IndicadoresData>({
        queryKey: ["indicadores-economicos"],
        queryFn: async () => {
            const { data, error } = await supabase.functions.invoke("indicadores-economicos", {
                body: { recurso: "todos", qtd: 5 },
            });
            if (error) throw error;
            if ((data as any)?.error) throw new Error((data as any).error);
            return data as IndicadoresData;
        },
        staleTime: 5 * 60 * 1000,       // 5 min
        refetchInterval: 5 * 60 * 1000, // auto-refresh a cada 5 min
        refetchOnWindowFocus: false,
        retry: 1,
    });

    return {
        indicadores: query.data ?? null,
        bolsa: query.data?.bolsa ?? [],
        noticias: query.data?.noticias ?? [],
        loading: query.isLoading,
        error: query.error ? (query.error as Error).message : null,
        lastUpdate: query.dataUpdatedAt ? new Date(query.dataUpdatedAt) : null,
        refetch: query.refetch,
    };
}

export interface HistoricoData {
    titulo: string;
    unidade: string;
    historico: Array<{ data: string; valor: number }>;
}

/**
 * Busca o histórico de UM indicador sob demanda (ex.: ao clicar pra expandir).
 * Câmbio vem em ~45 dias (diário); índices em 12 pontos (mensal/diário).
 * `enabled` controla se a busca dispara — passe o indicador selecionado.
 */
export function useHistoricoIndicador(indicador: string | null) {
    return useQuery<HistoricoData>({
        queryKey: ["indicador-historico", indicador],
        queryFn: async () => {
            const { data, error } = await supabase.functions.invoke("indicadores-economicos", {
                body: { recurso: "historico", indicador },
            });
            if (error) throw error;
            return data as HistoricoData;
        },
        enabled: !!indicador,
        staleTime: 60 * 60 * 1000,       // 1h — histórico muda pouco
        refetchOnWindowFocus: false,
        retry: 1,
    });
}
