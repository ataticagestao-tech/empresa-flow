// ============================================================
// agente-tool-consultar_faturamento — Edge Function (Deno)
// Tool chamada pelo agente-orquestrador. Retorna o faturamento
// total da empresa em um período. Espelha o dashboard.
// Usa a função SQL public.agente_faturamento.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-agente-user-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Input {
    empresa_id: string;
    data_inicio?: string;   // 'YYYY-MM-DD'
    data_fim?: string;      // 'YYYY-MM-DD'
    regime?: "competencia" | "caixa";
}

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const userId = req.headers.get("x-agente-user-id");
        const acessoId = req.headers.get("x-agente-acesso-id");
        if (!userId && !acessoId) {
            return jsonResp({ error: "x-agente-user-id ou x-agente-acesso-id obrigatório" }, 401);
        }

        const input = (await req.json()) as Input;
        if (!input.empresa_id) {
            return jsonResp({ error: "empresa_id obrigatório" }, 400);
        }

        const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

        const { data: pode } = await service.rpc("agente_pode_acessar_empresa", {
            p_user_id: userId,
            p_acesso_id: acessoId,
            p_company_id: input.empresa_id,
        });
        if (!pode) return jsonResp({ error: "Sem acesso a essa empresa" }, 403);

        const { data, error } = await service.rpc("agente_faturamento", {
            p_company_id: input.empresa_id,
            p_data_inicio: input.data_inicio ?? null,
            p_data_fim: input.data_fim ?? null,
            p_regime: input.regime ?? "competencia",
        });

        if (error) {
            return jsonResp({ error: error.message }, 500);
        }

        const row = Array.isArray(data) ? data[0] : data;
        const total = Number(row?.total) || 0;
        const qtd = Number(row?.qtd_registros) || 0;

        return jsonResp({
            ok: true,
            total,
            qtd_registros: qtd,
            data_inicio: row?.data_inicio,
            data_fim: row?.data_fim,
            regime: row?.regime,
        });
    } catch (err: any) {
        return jsonResp({ error: err?.message || String(err) }, 500);
    }
});

function jsonResp(payload: unknown, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}
