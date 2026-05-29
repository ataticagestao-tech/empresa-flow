// agente-tool-gerar_fluxo_caixa — retorna a DFC (Demonstração de Fluxo de
// Caixa) de um período via RPC fn_gerar_dfc. Texto pro agente resumir no chat.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-agente-user-id, x-agente-acesso-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Input {
    empresa_id: string;
    data_inicio?: string;
    data_fim?: string;
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    try {
        const userId = req.headers.get("x-agente-user-id");
        const acessoId = req.headers.get("x-agente-acesso-id");
        if (!userId && !acessoId) return j({ error: "x-agente-user-id ou x-agente-acesso-id obrigatório" }, 401);

        const input = (await req.json()) as Input;
        if (!input.empresa_id) return j({ error: "empresa_id obrigatório" }, 400);

        const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
        const { data: pode } = await service.rpc("agente_pode_acessar_empresa", {
            p_user_id: userId, p_acesso_id: acessoId, p_company_id: input.empresa_id,
        });
        if (!pode) return j({ error: "Sem acesso a essa empresa" }, 403);

        const hoje = hojeSaoPaulo();
        const inicio = input.data_inicio || hoje.slice(0, 8) + "01";
        const fim = input.data_fim || hoje;

        const { data, error } = await service.rpc("fn_gerar_dfc", {
            p_company_id: input.empresa_id,
            p_data_inicio: inicio,
            p_data_fim: fim,
        });
        if (error) return j({ error: error.message }, 500);

        const linhas = (data || [])
            .filter((r: any) => Number(r.valor) !== 0 || r.nivel === 1)
            .sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0))
            .map((r: any) => ({
                codigo: r.codigo,
                nome: r.nome,
                nivel: r.nivel,
                atividade: r.atividade_dfc,
                valor: Number(r.valor) || 0,
            }));

        return j({ ok: true, periodo: { inicio, fim }, linhas });
    } catch (err: any) {
        return j({ error: err?.message || String(err) }, 500);
    }
});

function hojeSaoPaulo(): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
}

function j(p: unknown, s = 200) {
    return new Response(JSON.stringify(p), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
