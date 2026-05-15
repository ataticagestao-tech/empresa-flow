// ============================================================
// agente-restart-instancia — Edge Function (Deno)
// Reinicia a instância Evolution. Útil quando ela está "open"
// mas não está recebendo nem disparando webhook (zumbi).
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") ?? "https://api.ataticagestao.com";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY")!;
const EVOLUTION_INSTANCE = Deno.env.get("EVOLUTION_INSTANCE") ?? "financeiro";

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const base = EVOLUTION_API_URL.replace(/\/$/, "");
        const headers = { apikey: EVOLUTION_API_KEY };

        // restart
        const resp = await fetch(`${base}/instance/restart/${EVOLUTION_INSTANCE}`, {
            method: "POST",
            headers,
        });
        const text = await resp.text();
        let data: any;
        try { data = JSON.parse(text); } catch { data = { raw: text }; }

        // Aguarda 3s pra estabilizar
        await new Promise((r) => setTimeout(r, 3000));

        // Confere status
        const statusResp = await fetch(`${base}/instance/connectionState/${EVOLUTION_INSTANCE}`, { headers });
        const statusData = await statusResp.json().catch(() => ({}));

        return new Response(
            JSON.stringify({
                ok: resp.ok,
                restart_response: data,
                status_apos_restart: statusData,
            }, null, 2),
            {
                status: 200,
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
