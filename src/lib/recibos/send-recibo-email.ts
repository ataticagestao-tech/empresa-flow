import { sendEmail } from "@/lib/email/send-email";

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

/**
 * Envia recibo por e-mail.
 *
 * Wrapper sobre `sendEmail` (Edge Function `enviar-email`) que passa o PDF
 * como anexo. Antes usava uma Edge Function dedicada `enviar-recibo-email`,
 * mas foi consolidado para reaproveitar a infra ja existente.
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

    const result = await sendEmail({
        destinatario,
        assunto,
        corpo,
        anexoUrl: pdfUrl,
        anexoNomeArquivo: nomeArquivo,
    });
    return result;
}
