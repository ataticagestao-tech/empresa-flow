import { supabase } from "@/integrations/supabase/client";

export interface SendEmailParams {
    destinatario: string;
    assunto: string;
    corpo: string;
    /** Anexo opcional. Para enviar PDF, passe a URL e o helper baixa + converte. */
    anexoUrl?: string;
    anexoNomeArquivo?: string;
}

export interface SendEmailResult {
    ok: boolean;
    error?: string;
    messageId?: string;
}

async function fetchPdfAsBase64(url: string): Promise<string> {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Não foi possível baixar o anexo (${resp.status})`);
    const blob = await resp.blob();
    return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result as string;
            const base64 = result.includes(",") ? result.split(",")[1] : result;
            resolve(base64);
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

/**
 * Envia e-mail generico via Edge Function `enviar-email` (Resend).
 * Anexo e opcional — se passar anexoUrl, baixa o arquivo, converte
 * para base64 e anexa.
 *
 * Pre-requisito: secret RESEND_API_KEY ja setado no Supabase.
 */
export async function sendEmail({
    destinatario,
    assunto,
    corpo,
    anexoUrl,
    anexoNomeArquivo,
}: SendEmailParams): Promise<SendEmailResult> {
    if (!destinatario) return { ok: false, error: "E-mail vazio" };
    if (!assunto.trim()) return { ok: false, error: "Assunto vazio" };
    if (!corpo.trim()) return { ok: false, error: "Mensagem vazia" };

    try {
        const payload: any = { destinatario, assunto, corpo };
        if (anexoUrl && anexoNomeArquivo) {
            const pdfBase64 = await fetchPdfAsBase64(anexoUrl);
            payload.anexo = { pdfBase64, nomeArquivo: anexoNomeArquivo };
        }

        const { data, error } = await supabase.functions.invoke("enviar-email", { body: payload });

        if (error) {
            // supabase-js coloca a Response em error.context. Le body real (json/text)
            const ctx: any = (error as any).context;
            let detail = error.message || "Falha ao enviar e-mail";
            try {
                if (ctx && typeof ctx.json === "function") {
                    const parsed = await ctx.clone().json();
                    detail = parsed?.erro || parsed?.error || JSON.stringify(parsed);
                } else if (ctx && typeof ctx.text === "function") {
                    const txt = await ctx.clone().text();
                    if (txt) detail = txt;
                }
            } catch { /* ignore */ }
            return { ok: false, error: detail };
        }

        if (data && (data as any).ok === false) {
            return { ok: false, error: (data as any).erro || (data as any).error };
        }

        return { ok: true, messageId: (data as any)?.messageId };
    } catch (err: any) {
        return { ok: false, error: err?.message || String(err) };
    }
}
