import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";

export interface OvernightConfig {
    id?: string;
    company_id: string;
    frase_noite: string | null;
    ativa: boolean;
    whatsapp_ativo: boolean;
    whatsapp_destinos: string[];
    horario_envio: string;
    whatsapp_mensagem: string | null;
    whatsapp_ultimo_envio_em: string | null;
    whatsapp_ultimo_envio_status: "sucesso" | "erro" | "parcial" | null;
    whatsapp_ultimo_envio_erro: string | null;
    updated_at?: string;
}

export interface OvernightLog {
    id: string;
    company_id: string;
    gerado_em: string;
    status: "sucesso" | "erro";
    tamanho_bytes: number | null;
    erro_descricao: string | null;
    origem: "manual" | "agendado" | "whatsapp";
    destinos_enviados?: string[];
}

export interface OvernightConfigInput {
    frase_noite?: string;
    ativa?: boolean;
    whatsapp_ativo?: boolean;
    whatsapp_destinos?: string[];
    horario_envio?: string;
    whatsapp_mensagem?: string | null;
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
        mutationFn: async (input: OvernightConfigInput) => {
            if (!companyId) throw new Error("Empresa não selecionada");
            const existing = query.data;

            const payload: Record<string, unknown> = {};
            if (input.frase_noite !== undefined) {
                const frase = input.frase_noite.trim().slice(0, 200);
                payload.frase_noite = frase || null;
            }
            if (input.ativa !== undefined) payload.ativa = input.ativa;
            if (input.whatsapp_ativo !== undefined) payload.whatsapp_ativo = input.whatsapp_ativo;
            if (input.whatsapp_destinos !== undefined) {
                payload.whatsapp_destinos = (input.whatsapp_destinos || [])
                    .map(d => d.trim())
                    .filter(d => d.length > 0);
            }
            if (input.horario_envio !== undefined) {
                // aceita 'HH:MM' ou 'HH:MM:SS'; persiste sempre 'HH:MM:SS'
                const v = input.horario_envio.trim();
                payload.horario_envio = v.length === 5 ? `${v}:00` : v;
            }
            if (input.whatsapp_mensagem !== undefined) {
                const t = (input.whatsapp_mensagem || "").trim();
                payload.whatsapp_mensagem = t.length > 0 ? t.slice(0, 500) : null;
            }

            if (existing?.id) {
                const { error } = await activeClient
                    .from("overnight_config")
                    .update(payload)
                    .eq("id", existing.id);
                if (error) throw error;
            } else {
                const { error } = await activeClient
                    .from("overnight_config")
                    .insert({
                        company_id: companyId,
                        ativa: true,
                        ...payload,
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

export function useEnviarOvernightWhatsApp() {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const queryClient = useQueryClient();
    const companyId = selectedCompany?.id;

    return useMutation({
        mutationFn: async () => {
            if (!companyId) throw new Error("Empresa não selecionada");
            const { data, error } = await activeClient.functions.invoke<{
                ok: boolean;
                resultados?: Array<{
                    company_id: string;
                    status: "sucesso" | "erro" | "parcial" | "pulado";
                    motivo?: string;
                    destinos_ok?: string[];
                    destinos_erro?: Array<{ phone: string; erro: string }>;
                }>;
                erro?: string;
            }>("disparar-overnight-agendado", {
                body: { empresa_id: companyId, forcar: true },
            });
            if (error) throw error;
            if (!data?.ok) throw new Error(data?.erro || "Falha no envio");
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["overnight_config", companyId] });
            queryClient.invalidateQueries({ queryKey: ["overnight_logs", companyId] });
        },
    });
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
