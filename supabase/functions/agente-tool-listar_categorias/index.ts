// agente-tool-listar_categorias — busca categorias do plano de contas
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-agente-user-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    try {
        const userId = req.headers.get("x-agente-user-id");
        const acessoId = req.headers.get("x-agente-acesso-id");
        if (!userId && !acessoId) return j({ error: "x-agente-user-id ou x-agente-acesso-id obrigatório" }, 401);

        const { empresa_id, tipo, termo } = await req.json();
        if (!empresa_id) return j({ error: "empresa_id obrigatório" }, 400);

        const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
        const { data: pode } = await service.rpc("agente_pode_acessar_empresa", {
            p_user_id: userId, p_acesso_id: acessoId, p_company_id: empresa_id,
        });
        if (!pode) return j({ error: "Sem acesso a essa empresa" }, 403);

        const { data, error } = await service.rpc("agente_listar_categorias", {
            p_company_id: empresa_id,
            p_tipo: tipo ?? "despesa",
            p_termo: termo ?? null,
        });
        if (error) return j({ error: error.message }, 500);

        // Se nada bater pelo termo, retorna fallback da categoria genérica
        let fallback: any = null;
        if (termo && (data || []).length === 0) {
            const { data: fallbackId } = await service.rpc("agente_categoria_fallback", { p_company_id: empresa_id });
            if (fallbackId) {
                const { data: cat } = await service.from("chart_of_accounts")
                    .select("id, code, name, account_type")
                    .eq("id", fallbackId).maybeSingle();
                fallback = cat;
            }
        }

        return j({ ok: true, qtd: (data || []).length, categorias: data || [], fallback });
    } catch (err: any) { return j({ error: err?.message || String(err) }, 500); }
});

function j(p: unknown, s = 200) {
    return new Response(JSON.stringify(p), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
