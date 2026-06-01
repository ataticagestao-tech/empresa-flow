import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Proposicao {
    id: number;
    camara_id: number;
    tipo: string;
    numero: number;
    ano: number;
    ementa: string;
    tema: string | null;
    relevancia: "alta" | "media" | "baixa";
    keyword_match: string | null;
    url_camara: string;
    data_apresentacao: string | null;
    status_orgao: string | null;
    status_descricao: string | null;
}

export interface RadarStats {
    total_proposicoes: number;
    por_relevancia: Record<string, number>;
    por_tema: Record<string, number>;
    ultima_execucao: { data: string | null; novas: number; duracao: number } | null;
}

export interface RadarTema {
    codigo: number;
    nome: string;
}

interface ListaParams {
    tema?: number;
    relevancia?: string;
    limit?: number;
    offset?: number;
}

/**
 * Lista proposições legislativas via Edge Function `radar-legislativo`.
 * A função consulta a tabela radar_proposicoes (populada pelo cron semanal).
 */
export function useRadarLegislativo(params: ListaParams = {}) {
    const query = useQuery<{ total: number; proposicoes: Proposicao[] }>({
        queryKey: ["radar-proposicoes", params],
        queryFn: async () => {
            const { data, error } = await supabase.functions.invoke("radar-legislativo", {
                body: { recurso: "proposicoes", ...params },
            });
            if (error) throw error;
            if ((data as any)?.error) throw new Error((data as any).error);
            return data as { total: number; proposicoes: Proposicao[] };
        },
        staleTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
        retry: 1,
    });

    return {
        proposicoes: query.data?.proposicoes ?? [],
        total: query.data?.total ?? 0,
        loading: query.isLoading,
        error: query.error ? (query.error as Error).message : null,
        refetch: query.refetch,
    };
}

export function useRadarStats() {
    const query = useQuery<RadarStats>({
        queryKey: ["radar-estatisticas"],
        queryFn: async () => {
            const { data, error } = await supabase.functions.invoke("radar-legislativo", {
                body: { recurso: "estatisticas" },
            });
            if (error) throw error;
            return data as RadarStats;
        },
        staleTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
        retry: 1,
    });
    return { stats: query.data ?? null, loading: query.isLoading, refetch: query.refetch };
}

export function useRadarTemas() {
    const query = useQuery<{ temas: RadarTema[] }>({
        queryKey: ["radar-temas"],
        queryFn: async () => {
            const { data, error } = await supabase.functions.invoke("radar-legislativo", {
                body: { recurso: "temas" },
            });
            if (error) throw error;
            return data as { temas: RadarTema[] };
        },
        staleTime: 60 * 60 * 1000,
        refetchOnWindowFocus: false,
    });
    return { temas: query.data?.temas ?? [] };
}
