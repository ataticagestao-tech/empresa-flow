// agente-tool-lancar_cr — lança Conta a Receber EM ABERTO (status='aberto').
// Sem movimentação (só vira mov quando der baixa via baixar_cr).
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
    pagador_nome: string;
    valor: number;
    data_vencimento: string;       // YYYY-MM-DD
    descricao?: string;
    pagador_cpf_cnpj?: string;
    categoria_id?: string;         // = conta_contabil_id (receita)
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    try {
        const userId = req.headers.get("x-agente-user-id");
        const acessoId = req.headers.get("x-agente-acesso-id");
        if (!userId && !acessoId) return j({ error: "x-agente-user-id ou x-agente-acesso-id obrigatório" }, 401);

        const input = (await req.json()) as Input;
        if (!input.empresa_id) return j({ error: "empresa_id obrigatório" }, 400);
        if (!input.pagador_nome) return j({ error: "pagador_nome obrigatório (de quem vai receber)" }, 400);
        if (!input.valor || input.valor <= 0) return j({ error: "valor deve ser > 0" }, 400);
        if (!input.data_vencimento) return j({ error: "data_vencimento obrigatória (YYYY-MM-DD)" }, 400);

        const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
        const { data: pode } = await service.rpc("agente_pode_acessar_empresa", {
            p_user_id: userId, p_acesso_id: acessoId, p_company_id: input.empresa_id,
        });
        if (!pode) return j({ error: "Sem acesso a essa empresa" }, 403);

        const { data, error } = await service
            .from("contas_receber")
            .insert({
                company_id: input.empresa_id,
                pagador_nome: toTitleCase(input.pagador_nome.trim()),
                pagador_cpf_cnpj: input.pagador_cpf_cnpj ?? null,
                valor: input.valor,
                valor_pago: 0,
                data_vencimento: input.data_vencimento,
                status: "aberto",
                conta_contabil_id: input.categoria_id ?? null,
                observacoes: input.descricao ?? null,
            })
            .select("id, pagador_nome, valor, data_vencimento, status")
            .single();

        if (error) return j({ error: error.message }, 500);

        return j({
            ok: true,
            cr: data,
            mensagem: "CR lançada em aberto. Pra dar baixa quando receber, manda 'recebi de [pagador]'.",
        });
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
