import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { resolveSetor, newsQuery, SETORES, type SetorPerfil } from "@/lib/setores";

export interface NoticiaSetor {
    titulo: string;
    resumo: string;
    link: string;
    data: string;
    fonte: string;
}

/**
 * Resolve o setor da empresa selecionada a partir do CNAE.
 * O CompanyContext não carrega o CNAE, então buscamos cnae+activity_profile
 * sob demanda (cacheado por empresa). Cai em "Geral" se não houver CNAE.
 */
export function useSetorEmpresa() {
    const { selectedCompany } = useCompany();
    const companyId = selectedCompany?.id ?? null;

    const query = useQuery<{ cnae: string | null; activity_profile: any }>({
        queryKey: ["company-cnae", companyId],
        enabled: !!companyId,
        staleTime: 60 * 60 * 1000,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("companies")
                .select("cnae, activity_profile")
                .eq("id", companyId)
                .maybeSingle();
            if (error) throw error;
            return (data as any) ?? { cnae: null, activity_profile: null };
        },
    });

    const setor: SetorPerfil = query.data
        ? resolveSetor(query.data.cnae, query.data.activity_profile)
        : SETORES.geral;

    return { setor, loading: query.isLoading && !!companyId };
}

/** Notícias do setor via Edge Function noticias-setor (Google News RSS). */
export function useNoticiasSetor(setor: SetorPerfil | null, qtd = 6) {
    const query = useQuery<{ noticias: NoticiaSetor[] }>({
        queryKey: ["noticias-setor", setor?.key, qtd],
        enabled: !!setor,
        staleTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        retry: 1,
        queryFn: async () => {
            const { data, error } = await supabase.functions.invoke("noticias-setor", {
                body: { q: newsQuery(setor!), qtd },
            });
            if (error) throw error;
            return data as { noticias: NoticiaSetor[] };
        },
    });
    return {
        noticias: query.data?.noticias ?? [],
        loading: query.isLoading,
        error: query.error ? (query.error as Error).message : null,
        refetch: query.refetch,
    };
}
