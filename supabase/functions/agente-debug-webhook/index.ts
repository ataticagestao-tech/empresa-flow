// ============================================================
// agente-debug-webhook — Edge Function (Deno)
// Lê config atual do webhook + status da instância no Evolution.
// Usado pra debugar quando mensagem não chega no orquestrador.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

        // 1. Status da instância (conectada?)
        const instResp = await fetch(`${base}/instance/connectionState/${EVOLUTION_INSTANCE}`, { headers });
        const instText = await instResp.text();
        let instData: any;
        try { instData = JSON.parse(instText); } catch { instData = { raw: instText }; }

        // 2. Webhook atual
        const wbResp = await fetch(`${base}/webhook/find/${EVOLUTION_INSTANCE}`, { headers });
        const wbText = await wbResp.text();
        let wbData: any;
        try { wbData = JSON.parse(wbText); } catch { wbData = { raw: wbText }; }

        // 3. Lista de instâncias (pra confirmar o nome)
        const listResp = await fetch(`${base}/instance/fetchInstances`, { headers });
        const listText = await listResp.text();
        let listData: any;
        try { listData = JSON.parse(listText); } catch { listData = { raw: listText }; }

        return new Response(
            JSON.stringify({
                evolution_url: base,
                instance_name_configurado: EVOLUTION_INSTANCE,
                instance_status: { http: instResp.status, data: instData },
                webhook_atual: { http: wbResp.status, data: wbData },
                instancias_existentes: { http: listResp.status, data: listData },
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
