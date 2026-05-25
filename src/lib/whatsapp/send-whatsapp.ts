import { supabase } from "@/integrations/supabase/client";

export interface SendWhatsAppTemplate {
    name: string;
    languageCode?: string;
    bodyParams?: string[];
    headerDocumentLink?: string;
    headerDocumentMediaId?: string;
    headerDocumentFilename?: string;
    headerImageLink?: string;
    headerImageMediaId?: string;
}

export interface SendWhatsAppParams {
    phone: string;
    /** Texto livre. Usado pela Evolution e pelo Cloud dentro da janela de 24h. */
    text?: string;
    /** Template aprovado pela Meta. Usado pela Cloud API (obrigatório fora da janela). */
    template?: SendWhatsAppTemplate;
    /** Mídia opcional (PDF/imagem em base64). */
    mediaBase64?: string;
    fileName?: string;
    mimeType?: string;
    caption?: string;
}

export interface SendWhatsAppResult {
    ok: boolean;
    error?: string;
    phone?: string;
    provider?: "evolution" | "cloud";
}

/**
 * Envia mensagem de WhatsApp via Edge Function `enviar-whatsapp`.
 *
 * A Edge Function roteia entre Evolution (legado) e Cloud API (oficial Meta)
 * conforme a env `USE_WHATSAPP_CLOUD`. Como callers ainda podem rodar
 * em qualquer um dos dois modos, recomenda-se passar AMBOS `text` (fallback
 * Evolution) e `template` (preferido pela Cloud). A Edge Function escolhe
 * o caminho correto.
 */
export async function sendWhatsApp(params: SendWhatsAppParams): Promise<SendWhatsAppResult> {
    if (!params.phone) return { ok: false, error: "Telefone vazio" };
    if (!params.text && !params.template && !params.mediaBase64) {
        return { ok: false, error: "Forneça text, template ou mediaBase64" };
    }

    try {
        const { data, error } = await supabase.functions.invoke("enviar-whatsapp", { body: params });

        if (error) {
            const ctx: any = (error as any).context;
            let detail = error.message || "Falha ao enviar WhatsApp";
            try {
                if (ctx && typeof ctx.json === "function") {
                    const parsed = await ctx.clone().json();
                    detail = parsed?.error || parsed?.erro || JSON.stringify(parsed);
                } else if (ctx && typeof ctx.text === "function") {
                    const txt = await ctx.clone().text();
                    if (txt) detail = txt;
                }
            } catch { /* ignore */ }
            return { ok: false, error: detail };
        }

        if (data && (data as any).error) {
            return { ok: false, error: (data as any).error, provider: (data as any).provider };
        }

        return { ok: true, phone: (data as any)?.phone, provider: (data as any)?.provider };
    } catch (err: any) {
        return { ok: false, error: err?.message || String(err) };
    }
}
