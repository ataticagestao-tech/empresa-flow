// agente-tool-criar_fornecedor — cria fornecedor mínimo (nome + CPF/CNPJ)
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

        const { empresa_id, razao_social, cpf_cnpj, nome_fantasia } = await req.json();
        if (!empresa_id || !razao_social) return j({ error: "empresa_id e razao_social obrigatórios" }, 400);
        if (!cpf_cnpj) return j({ error: "cpf_cnpj obrigatório (peça pro empresário antes de criar)" }, 400);

        const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
        const { data: pode } = await service.rpc("agente_pode_acessar_empresa", {
            p_user_id: userId, p_acesso_id: acessoId, p_company_id: empresa_id,
        });
        if (!pode) return j({ error: "Sem acesso a essa empresa" }, 403);

        const { data, error } = await service.rpc("agente_criar_fornecedor", {
            p_company_id: empresa_id,
            p_razao_social: razao_social,
            p_cpf_cnpj: cpf_cnpj,
            p_nome_fantasia: nome_fantasia ?? null,
        });
        if (error) return j({ error: error.message }, 500);

        const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
        return j({ ok: true, fornecedor: row });
    } catch (err: any) { return j({ error: err?.message || String(err) }, 500); }
});

function j(p: unknown, s = 200) {
    return new Response(JSON.stringify(p), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
