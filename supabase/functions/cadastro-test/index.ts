// Funcao de teste minima — so pra confirmar que o basico funciona
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    let body = null;
    try {
        body = await req.json();
    } catch {}

    return new Response(
        JSON.stringify({
            ok: true,
            hello: "world",
            received: body,
            env_has_url: !!Deno.env.get("SUPABASE_URL"),
            env_has_service_key: !!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
            env_has_evolution_key: !!Deno.env.get("EVOLUTION_API_KEY"),
            env_has_anthropic: !!Deno.env.get("ANTHROPIC_API_KEY"),
        }),
        {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
    );
});
