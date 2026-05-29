// agente-tool-editar_fornecedor — edita campos de um fornecedor existente.
// Só atualiza os campos enviados. Valida que o fornecedor é da empresa.
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
    fornecedor_id: string;
    razao_social?: string;
    nome_fantasia?: string;
    cpf_cnpj?: string;
    email?: string;
    telefone?: string;
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    try {
        const userId = req.headers.get("x-agente-user-id");
        const acessoId = req.headers.get("x-agente-acesso-id");
        if (!userId && !acessoId) return j({ error: "x-agente-user-id ou x-agente-acesso-id obrigatório" }, 401);

        const input = (await req.json()) as Input;
        if (!input.empresa_id) return j({ error: "empresa_id obrigatório" }, 400);
        if (!input.fornecedor_id) return j({ error: "fornecedor_id obrigatório (use buscar_fornecedor antes)" }, 400);

        const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
        const { data: pode } = await service.rpc("agente_pode_acessar_empresa", {
            p_user_id: userId, p_acesso_id: acessoId, p_company_id: input.empresa_id,
        });
        if (!pode) return j({ error: "Sem acesso a essa empresa" }, 403);

        const { data: forn } = await service
            .from("suppliers")
            .select("id, company_id")
            .eq("id", input.fornecedor_id)
            .maybeSingle();
        if (!forn) return j({ error: "Fornecedor não encontrado" }, 404);
        if (forn.company_id !== input.empresa_id) return j({ error: "Esse fornecedor é de outra empresa" }, 403);

        const patch: Record<string, unknown> = {};
        if (input.razao_social !== undefined) patch.razao_social = toTitleCase(input.razao_social.trim());
        if (input.nome_fantasia !== undefined) patch.nome_fantasia = input.nome_fantasia ? toTitleCase(input.nome_fantasia.trim()) : null;
        if (input.cpf_cnpj !== undefined) patch.cpf_cnpj = input.cpf_cnpj;
        if (input.email !== undefined) patch.email = input.email;
        if (input.telefone !== undefined) patch.telefone = input.telefone;

        if (Object.keys(patch).length === 0) {
            return j({ error: "Nada pra atualizar — informe pelo menos um campo (razao_social, nome_fantasia, cpf_cnpj, email ou telefone)" }, 400);
        }

        const { data, error } = await service
            .from("suppliers")
            .update(patch)
            .eq("id", input.fornecedor_id)
            .select("id, razao_social, nome_fantasia, cpf_cnpj, email, telefone")
            .single();

        if (error) return j({ error: error.message }, 500);

        return j({ ok: true, fornecedor: data, campos_alterados: Object.keys(patch) });
    } catch (err: any) {
        return j({ error: err?.message || String(err) }, 500);
    }
});

function toTitleCase(s: string): string {
    return s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

function j(p: unknown, s = 200) {
    return new Response(JSON.stringify(p), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
