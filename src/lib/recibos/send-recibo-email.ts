import { supabase } from "@/integrations/supabase/client";

export interface SendReciboEmailParams {
    destinatario: string;
    assunto: string;
    corpo: string;
    pdfUrl: string;
    nomeArquivo: string;
}

export interface SendReciboEmailResult {
    ok: boolean;
    error?: string;
    messageId?: string;
}

async function fetchPdfAsBase64(url: string): Promise<string> {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Não foi possível baixar o PDF (${resp.status})`);
    const blob = await resp.blob();
    return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result as string;
            // result vem como "data:application/pdf;base64,XXXX..."; precisamos so do base64
            const base64 = result.includes(",") ? result.split(",")[1] : result;
            resolve(base64);
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

/**
 * Envia recibo por e-mail via Edge Function `enviar-recibo-email`.
 * Baixa o PDF do storage, converte para base64 e dispara via Resend.
 *
 * Pre-requisito: secret RESEND_API_KEY ja setado no Supabase.
 */
export async function sendReciboEmail({
    destinatario,
    assunto,
    corpo,
    pdfUrl,
    nomeArquivo,
}: SendReciboEmailParams): Promise<SendReciboEmailResult> {
    if (!destinatario) return { ok: false, error: "E-mail vazio" };
    if (!pdfUrl) return { ok: false, error: "Recibo não tem PDF para anexar" };

    try {
        const pdfBase64 = await fetchPdfAsBase64(pdfUrl);

        const { data, error } = await supabase.functions.invoke("enviar-recibo-email", {
            body: { destinatario, assunto, corpo, pdfBase64, nomeArquivo },
        });

        if (error) {
            const context: any = (error as any).context;
            let detail = error.message || "Falha ao enviar e-mail";
            try {
                if (context?.body) {
                    const parsed = typeof context.body === "string" ? JSON.parse(context.body) : context.body;
                    detail = parsed?.erro || parsed?.error || detail;
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
