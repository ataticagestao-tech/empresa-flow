// ============================================================
// agente-tool-consultar_saldo — Edge Function (Deno)
// Tool chamada pelo agente-orquestrador. Retorna saldo de
// uma ou todas as contas bancárias da empresa.
// Usa a função SQL public.agente_saldo_conta.
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
    conta_id?: string;
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

        // chama RPC
        const { data, error } = await service.rpc("agente_saldo_conta", {
            p_company_id: input.empresa_id,
            p_conta_id: input.conta_id ?? null,
        });

        if (error) {
            return jsonResp({ error: error.message }, 500);
        }

        const contas = (data || []).map((row: any) => ({
            conta_id: row.conta_id,
            nome: row.nome,
            tipo: row.tipo,
            saldo: Number(row.saldo) || 0,
        }));

        const total = contas
            .filter((c: any) => c.tipo !== "cartao_credito")
            .reduce((acc: number, c: any) => acc + c.saldo, 0);

        return jsonResp({
            ok: true,
            contas,
            total_disponivel: total,
            qtd_contas: contas.length,
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
