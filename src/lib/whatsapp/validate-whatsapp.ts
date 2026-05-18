import { supabase } from "@/integrations/supabase/client";

export interface ValidateWhatsAppResult {
    ok: boolean;
    /** `true` se o numero tem WhatsApp ativo. So tem valor se `ok=true`. */
    exists?: boolean;
    /** Numero normalizado (com DDI 55) que a Evolution reconheceu. */
    phone?: string;
    /** Quando `ok=false`: motivo legivel. */
    error?: string;
    /** "format" = telefone em formato invalido; "api_error"/"exception" = falha de rede/API. */
    reason?: "format" | "api_error" | "exception" | "unknown";
}

/**
 * Verifica via Evolution API se o telefone tem WhatsApp ativo.
 * Usa a edge function `validar-whatsapp` como proxy (mantem a apikey no servidor).
 */
export async function validateWhatsAppNumber(
    phone: string,
): Promise<ValidateWhatsAppResult> {
    if (!phone || !phone.trim()) {
        return { ok: false, error: "Telefone vazio", reason: "format" };
    }

    try {
        const { data, error } = await supabase.functions.invoke("validar-whatsapp", {
            body: { phone },
        });

        if (error) {
            const ctx: any = (error as any).context;
            let detail = error.message || "Falha ao validar WhatsApp";
            try {
                if (ctx && typeof ctx.json === "function") {
                    const parsed = await ctx.clone().json();
                    detail = parsed?.error || parsed?.message || JSON.stringify(parsed);
                } else if (ctx && typeof ctx.text === "function") {
                    const txt = await ctx.clone().text();
                    if (txt) detail = txt;
                }
            } catch { /* ignore */ }
            return { ok: false, error: detail, reason: "api_error" };
        }

        const d = data as any;
        if (d?.valid === false) {
            return {
                ok: false,
                error: d?.message || "Telefone invalido",
                reason: d?.reason || "unknown",
            };
        }

        return {
            ok: true,
            exists: !!d?.exists,
            phone: d?.phone,
        };
    } catch (err: any) {
        return {
            ok: false,
            error: err?.message || String(err),
            reason: "exception",
        };
    }
}
