import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const DEFAULT_FROM = Deno.env.get("RESEND_FROM") ?? "Tatica Gestao <noreply@meutatico.site>";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface EmailRequest {
    destinatario: string;
    assunto: string;
    corpo: string;
    remetente?: string;
    /** Anexo único (legado — mantido por compatibilidade). */
    anexo?: {
        pdfBase64: string;
        nomeArquivo: string;
    };
    /** Múltiplos anexos. Se passar anexos[] e anexo, ambos são incluídos. */
    anexos?: Array<{
        conteudoBase64: string;
        nomeArquivo: string;
        contentType?: string;
    }>;
}

function gerarHTMLEmail(corpo: string, titulo = "Tatica Gestao"): string {
    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${titulo}</title>
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
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <div style="margin:0;color:#475569;font-size:14px;line-height:1.6;white-space:pre-wrap;">${corpo.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px;border-top:1px solid #f0ece3;">
              <p style="margin:0;color:#94a3b8;font-size:11px;text-align:center;">
                Enviado por <strong style="color:#475569;">Tatica Gestao</strong>
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

        const body: EmailRequest = await req.json();

        if (!body.destinatario || !body.assunto || !body.corpo) {
            return new Response(
                JSON.stringify({ ok: false, erro: "Campos obrigatorios: destinatario, assunto, corpo" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const payload: Record<string, any> = {
            from: body.remetente ?? DEFAULT_FROM,
            to: [body.destinatario],
            subject: body.assunto,
            html: gerarHTMLEmail(body.corpo, body.assunto),
        };

        const attachments: Array<{ filename: string; content: string; content_type?: string }> = [];
        if (body.anexo?.pdfBase64 && body.anexo?.nomeArquivo) {
            attachments.push({ filename: body.anexo.nomeArquivo, content: body.anexo.pdfBase64 });
        }
        if (Array.isArray(body.anexos)) {
            for (const a of body.anexos) {
                if (a?.conteudoBase64 && a?.nomeArquivo) {
                    attachments.push({
                        filename: a.nomeArquivo,
                        content: a.conteudoBase64,
                        ...(a.contentType ? { content_type: a.contentType } : {}),
                    });
                }
            }
        }
        if (attachments.length > 0) {
            payload.attachments = attachments;
        }

        const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${RESEND_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
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
