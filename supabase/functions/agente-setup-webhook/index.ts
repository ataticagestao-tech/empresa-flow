// ============================================================
// agente-setup-webhook — Edge Function (Deno)
// Configura o webhook do Evolution para apontar pro
// agente-orquestrador. Roda 1 vez após o deploy.
//
// Uso: POST sem body, com Authorization Bearer da service role key.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") ?? "https://api.ataticagestao.com";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY")!;
const EVOLUTION_INSTANCE = Deno.env.get("EVOLUTION_INSTANCE") ?? "financeiro";

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        if (!EVOLUTION_API_KEY) {
            return new Response(JSON.stringify({ error: "EVOLUTION_API_KEY não configurada nos secrets" }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const webhookUrl = `${SUPABASE_URL}/functions/v1/agente-orquestrador`;
        const evolutionEndpoint = `${EVOLUTION_API_URL.replace(/\/$/, "")}/webhook/set/${EVOLUTION_INSTANCE}`;

        const resp = await fetch(evolutionEndpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: EVOLUTION_API_KEY,
            },
            body: JSON.stringify({
                webhook: {
                    enabled: true,
                    url: webhookUrl,
                    webhookByEvents: false,
                    webhookBase64: false,
                    events: ["MESSAGES_UPSERT"],
                },
            }),
        });

        const bodyText = await resp.text();
        let data: any;
        try {
            data = JSON.parse(bodyText);
        } catch {
            data = { raw: bodyText };
        }

        return new Response(
            JSON.stringify({
                ok: resp.ok,
                status: resp.status,
                webhook_apontado_para: webhookUrl,
                evolution_response: data,
            }, null, 2),
            {
                status: resp.ok ? 200 : 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
        );
    } catch (err: any) {
        return new Response(JSON.stringify({ error: err?.message || String(err) }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
