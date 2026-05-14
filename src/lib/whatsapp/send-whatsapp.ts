import { supabase } from "@/integrations/supabase/client";

export interface SendWhatsAppParams {
    phone: string;
    text: string;
}

export interface SendWhatsAppResult {
    ok: boolean;
    error?: string;
    phone?: string;
}

/**
 * Envia mensagem de texto via WhatsApp usando a Evolution API (proxy via
 * Edge Function `enviar-whatsapp`). O telefone e normalizado server-side
 * para o formato DDI+DDD+numero esperado pela Evolution.
 *
 * Pre-requisito: o admin precisa setar EVOLUTION_API_KEY no Supabase
 * (e opcionalmente EVOLUTION_API_URL e EVOLUTION_INSTANCE):
 *   supabase secrets set EVOLUTION_API_KEY=TaticaEvol2026
 */
export async function sendWhatsApp({ phone, text }: SendWhatsAppParams): Promise<SendWhatsAppResult> {
    if (!phone) return { ok: false, error: "Telefone vazio" };
    if (!text) return { ok: false, error: "Mensagem vazia" };

    try {
        const { data, error } = await supabase.functions.invoke("enviar-whatsapp", {
            body: { phone, text },
        });

        if (error) {
            // Quando a Edge Function retorna 4xx/5xx, supabase-js coloca em error.
            // Tenta extrair a mensagem do body retornado.
            const context: any = (error as any).context;
            let detail = error.message || "Falha ao enviar WhatsApp";
            try {
                if (context?.body) {
                    const parsed = typeof context.body === "string" ? JSON.parse(context.body) : context.body;
                    detail = parsed?.error || detail;
                }
            } catch { /* ignore */ }
            return { ok: false, error: detail };
        }

        if (data && (data as any).error) {
            return { ok: false, error: (data as any).error };
        }

        return { ok: true, phone: (data as any)?.phone };
    } catch (err: any) {
        return { ok: false, error: err?.message || String(err) };
    }
}
