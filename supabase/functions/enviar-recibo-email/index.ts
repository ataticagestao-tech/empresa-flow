import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReciboEmailRequest {
    destinatario: string;
    assunto: string;
    corpo: string;
    pdfBase64: string;
    nomeArquivo: string;
    remetente?: string;
}

function gerarHTMLEmail(corpo: string): string {
    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Comprovante de Pagamento</title>
</head>
<body style="margin:0;padding:0;background:#f7f5f0;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5f0;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e8e4dc;">
          <tr>
            <td style="background:#0d1b2a;padding:20px 28px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width:40px;height:40px;background:#c9a84c;border-radius:8px;text-align:center;vertical-align:middle;">
                    <span style="color:#0d1b2a;font-size:20px;font-weight:bold;font-family:Georgia,serif;">T</span>
                  </td>
                  <td style="padding-left:12px;">
                    <div style="color:#ffffff;font-size:14px;font-weight:bold;">Tatica Gestao</div>
                    <div style="color:#c9a84c;font-size:9px;letter-spacing:2px;margin-top:2px;">COMPROVANTE DE PAGAMENTO</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px;">
              <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.6;">
                ${corpo.replace(/\n/g, "<br/>")}
              </p>
              <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.5;">
                O comprovante completo esta anexado a este e-mail em formato PDF.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px;border-top:1px solid #f0ece3;margin-top:16px;">
              <p style="margin:0;color:#94a3b8;font-size:11px;text-align:center;">
                Gerado por <strong style="color:#475569;">Tatica Gestao</strong>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        if (!RESEND_API_KEY) {
            return new Response(
                JSON.stringify({ ok: false, erro: "RESEND_API_KEY nao configurada" }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const body: ReciboEmailRequest = await req.json();

        if (!body.destinatario || !body.pdfBase64 || !body.nomeArquivo) {
            return new Response(
                JSON.stringify({ ok: false, erro: "Campos obrigatorios: destinatario, pdfBase64, nomeArquivo" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${RESEND_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                from: body.remetente ?? "Tatica Gestao <noreply@meutatico.site>",
                to: [body.destinatario],
                subject: body.assunto || "Comprovante de Pagamento - Tatica Gestao",
                html: gerarHTMLEmail(body.corpo || "Segue em anexo o comprovante de pagamento."),
                attachments: [
                    {
                        filename: body.nomeArquivo,
                        content: body.pdfBase64,
                    },
                ],
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            return new Response(
                JSON.stringify({ ok: false, erro: data.message || "Erro ao enviar email" }),
                { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        return new Response(
            JSON.stringify({ ok: true, messageId: data.id }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro desconhecido";
        return new Response(
            JSON.stringify({ ok: false, erro: msg }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
