import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";

export interface OvernightConfig {
    id?: string;
    company_id: string;
    frase_noite: string | null;
    ativa: boolean;
    updated_at?: string;
}

export interface OvernightLog {
    id: string;
    company_id: string;
    gerado_em: string;
    status: "sucesso" | "erro";
    tamanho_bytes: number | null;
    erro_descricao: string | null;
    origem: "manual" | "agendado";
}

interface GerarResult {
    ok: boolean;
    pdfBase64?: string;
    tamanho_bytes?: number;
    gerado_em?: string;
    erro?: string;
}

export function useOvernightConfig() {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const queryClient = useQueryClient();
    const companyId = selectedCompany?.id;

    const query = useQuery({
        queryKey: ["overnight_config", companyId],
        queryFn: async (): Promise<OvernightConfig | null> => {
            const { data, error } = await activeClient
                .from("overnight_config")
                .select("*")
                .eq("company_id", companyId)
                .maybeSingle();
            if (error) throw error;
            return data;
        },
        enabled: !!companyId,
    });

    const salvar = useMutation({
        mutationFn: async (input: { frase_noite: string; ativa?: boolean }) => {
            if (!companyId) throw new Error("Empresa não selecionada");
            const frase = input.frase_noite.trim().slice(0, 200);

            const existing = query.data;
            if (existing?.id) {
                const { error } = await activeClient
                    .from("overnight_config")
                    .update({
                        frase_noite: frase || null,
                        ativa: input.ativa ?? existing.ativa,
                    })
                    .eq("id", existing.id);
                if (error) throw error;
            } else {
                const { error } = await activeClient
                    .from("overnight_config")
                    .insert({
                        company_id: companyId,
                        frase_noite: frase || null,
                        ativa: input.ativa ?? true,
                    });
                if (error) throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["overnight_config", companyId] });
        },
    });

    return { ...query, salvar };
}

export function useOvernightLogs(limit = 10) {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const companyId = selectedCompany?.id;

    return useQuery({
        queryKey: ["overnight_logs", companyId, limit],
        queryFn: async (): Promise<OvernightLog[]> => {
            const { data, error } = await activeClient
                .from("overnight_logs")
                .select("*")
                .eq("company_id", companyId)
                .order("gerado_em", { ascending: false })
                .limit(limit);
            if (error) throw error;
            return data ?? [];
        },
        enabled: !!companyId,
    });
}

export function useGerarOvernightPdf() {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const queryClient = useQueryClient();
    const companyId = selectedCompany?.id;

    return useMutation({
        mutationFn: async (): Promise<GerarResult> => {
            if (!companyId) throw new Error("Empresa não selecionada");
            const { data, error } = await activeClient.functions.invoke<GerarResult>(
                "gerar-overnight-pdf",
                { body: { empresa_id: companyId, origem: "manual" } },
            );
            if (error) throw error;
            if (!data?.ok) throw new Error(data?.erro || "Falha ao gerar PDF");
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["overnight_logs", companyId] });
        },
    });
}

export function base64ToBlob(base64: string, mime = "application/pdf"): Blob {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
}
