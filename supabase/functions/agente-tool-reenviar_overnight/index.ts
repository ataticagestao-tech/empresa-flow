// agente-tool-reenviar_overnight — gera o Overnight de uma DATA específica
// (dia anterior) e envia o PDF pro número de quem pediu (janela de 24h aberta).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-agente-user-id, x-agente-acesso-id, x-agente-phone",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Input {
    empresa_id: string;
    data: string; // YYYY-MM-DD — o dia do overnight
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    try {
        const userId = req.headers.get("x-agente-user-id");
        const acessoId = req.headers.get("x-agente-acesso-id");
        const phone = req.headers.get("x-agente-phone");
        if (!userId && !acessoId) return j({ error: "x-agente-user-id ou x-agente-acesso-id obrigatório" }, 401);
        if (!phone) return j({ error: "não consegui identificar seu número pra enviar o PDF" }, 400);

        const input = (await req.json()) as Input;
        if (!input.empresa_id) return j({ error: "empresa_id obrigatório" }, 400);
        if (!input.data || !/^\d{4}-\d{2}-\d{2}$/.test(input.data)) return j({ error: "data obrigatória no formato YYYY-MM-DD" }, 400);

        const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
        const { data: pode } = await service.rpc("agente_pode_acessar_empresa", {
            p_user_id: userId, p_acesso_id: acessoId, p_company_id: input.empresa_id,
        });
        if (!pode) return j({ error: "Sem acesso a essa empresa" }, 403);

        // 1. gera o PDF da data pedida
        const gerar = await fetch(`${SUPABASE_URL}/functions/v1/gerar-overnight-pdf`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
            body: JSON.stringify({ empresa_id: input.empresa_id, data: input.data, origem: "manual" }),
        });
        const gerarBody: any = await gerar.json().catch(() => ({}));
        if (!gerar.ok || !gerarBody?.pdfBase64) {
            return j({ error: gerarBody?.erro || `Falha ao gerar o PDF (HTTP ${gerar.status})` }, 500);
        }

        // 2. envia pro número de quem pediu (texto livre/documento — janela 24h aberta)
        const fileName = `overnight-${input.data}.pdf`;
        const env = await fetch(`${SUPABASE_URL}/functions/v1/enviar-whatsapp`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
            body: JSON.stringify({
                phone,
                mediaBase64: gerarBody.pdfBase64,
                fileName,
                mimeType: "application/pdf",
                caption: `Overnight de ${brData(input.data)}`,
            }),
        });
        const envBody: any = await env.json().catch(() => ({}));
        if (!env.ok || envBody?.ok === false) {
            return j({ ok: false, enviado: false, motivo: envBody?.error || `Falha ao enviar (HTTP ${env.status})` });
        }

        return j({ ok: true, enviado: true, data: input.data, mensagem: `Overnight de ${brData(input.data)} enviado pro seu WhatsApp.` });
    } catch (err: any) {
        return j({ error: err?.message || String(err) }, 500);
    }
});

function brData(iso: string): string {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
}

function j(p: unknown, s = 200) {
    return new Response(JSON.stringify(p), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
