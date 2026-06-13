// ============================================================
// agente-tool-gerar_relatorio_pdf — Edge Function (Deno)
// Tool do Assistente. Gera um relatório financeiro em PDF (via
// gerar-relatorio-financeiro) e ENTREGA pro usuário:
//   • WhatsApp (quando vem x-agente-phone): manda o documento direto
//     pro número de quem pediu (dentro da janela de 24h, sem template).
//   • Web (chat /assistente, sem phone): sobe o PDF no storage e devolve
//     um link de download (não dá pra mandar base64 gigante de volta pro
//     Claude — estouraria tokens).
// Tipos: fluxo_caixa | contas_pagar | contas_receber | dre | faturamento.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-agente-user-id, x-agente-acesso-id, x-agente-phone",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STORAGE_BUCKET = "relatorios-temp";
const SIGNED_URL_TTL = 60 * 60 * 2; // 2h

interface Input {
    empresa_id: string;
    tipo: "fluxo_caixa" | "contas_pagar" | "contas_receber" | "dre" | "faturamento";
    data_inicio?: string;
    data_fim?: string;
    escopo?: "abertas" | "todas";
}

serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const userId = req.headers.get("x-agente-user-id");
        const acessoId = req.headers.get("x-agente-acesso-id");
        const phone = req.headers.get("x-agente-phone");
        if (!userId && !acessoId) {
            return jsonResp({ error: "x-agente-user-id ou x-agente-acesso-id obrigatório" }, 401);
        }

        const input = (await req.json()) as Input;
        if (!input.empresa_id) return jsonResp({ error: "empresa_id obrigatório" }, 400);
        if (!input.tipo) return jsonResp({ error: "tipo obrigatório" }, 400);

        const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

        const { data: pode } = await service.rpc("agente_pode_acessar_empresa", {
            p_user_id: userId, p_acesso_id: acessoId, p_company_id: input.empresa_id,
        });
        if (!pode) return jsonResp({ error: "Sem acesso a essa empresa" }, 403);

        // 1) Gera o PDF
        const genResp = await fetch(`${SUPABASE_URL}/functions/v1/gerar-relatorio-financeiro`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
            body: JSON.stringify({
                empresa_id: input.empresa_id,
                tipo: input.tipo,
                data_inicio: input.data_inicio,
                data_fim: input.data_fim,
                escopo: input.escopo,
            }),
        });
        const gen = await genResp.json().catch(() => ({}));
        if (!genResp.ok || !gen?.ok || !gen?.pdfBase64) {
            return jsonResp({ error: gen?.erro || `Falha ao gerar o relatório (HTTP ${genResp.status})` }, 200);
        }

        const { pdfBase64, filename, resumo, titulo } = gen as {
            pdfBase64: string; filename: string; resumo: string; titulo: string;
        };

        // 2a) Canal WhatsApp — manda o documento direto pro número de quem pediu.
        if (phone) {
            const sendResp = await fetch(`${SUPABASE_URL}/functions/v1/enviar-whatsapp`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
                body: JSON.stringify({
                    phone,
                    mediaBase64: pdfBase64,
                    fileName: filename,
                    mimeType: "application/pdf",
                    caption: resumo,
                    company_id: input.empresa_id,
                }),
            });
            const send = await sendResp.json().catch(() => ({}));
            if (!sendResp.ok || !send?.ok) {
                return jsonResp({
                    ok: true, canal: "whatsapp", enviado: false,
                    motivo: send?.error || `Falha ao enviar (HTTP ${sendResp.status})`,
                    titulo, resumo,
                });
            }
            return jsonResp({ ok: true, canal: "whatsapp", enviado: true, filename, titulo, resumo });
        }

        // 2b) Canal Web — sobe no storage e devolve link de download.
        const bytes = base64ToBytes(pdfBase64);
        const path = `relatorios/${input.empresa_id}/${crypto.randomUUID()}.pdf`;
        const { error: upErr } = await service.storage.from(STORAGE_BUCKET).upload(path, bytes, {
            contentType: "application/pdf", upsert: false,
        });
        if (upErr) {
            return jsonResp({ error: `Falha ao salvar o PDF: ${upErr.message}` }, 200);
        }
        const { data: signed, error: signErr } = await service.storage
            .from(STORAGE_BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
        if (signErr || !signed?.signedUrl) {
            return jsonResp({ error: `Falha ao gerar link: ${signErr?.message || "sem URL"}` }, 200);
        }

        return jsonResp({
            ok: true, canal: "web", download_url: signed.signedUrl,
            filename, titulo, resumo, expira_em_horas: 2,
        });
    } catch (err: any) {
        return jsonResp({ error: err?.message || String(err) }, 500);
    }
});

function base64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

function jsonResp(payload: unknown, status = 200) {
    return new Response(JSON.stringify(payload), {
        status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}
