// agente-tool-lancar_cp — lança Conta a Pagar EM ABERTO (status='aberto')
// O empresário dá baixa depois com outra mensagem ("paguei a luz").
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
    credor_id?: string;       // UUID do fornecedor OU funcionário (conforme credor_tipo)
    credor_tipo?: "fornecedor" | "funcionario" | "outro";
    credor_nome: string;      // sempre obrigatório (texto livre)
    descricao: string;
    valor: number;
    data_vencimento: string;  // YYYY-MM-DD
    categoria_id?: string;
    centro_custo_id?: string;
    observacao?: string;
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    try {
        const userId = req.headers.get("x-agente-user-id");
        const acessoId = req.headers.get("x-agente-acesso-id");
        if (!userId && !acessoId) return j({ error: "x-agente-user-id ou x-agente-acesso-id obrigatório" }, 401);

        const input = (await req.json()) as Input;
        if (!input.empresa_id) return j({ error: "empresa_id obrigatório" }, 400);
        if (!input.credor_nome) return j({ error: "credor_nome obrigatório (mesmo se vier do credor_id)" }, 400);
        if (!input.descricao) return j({ error: "descricao obrigatória" }, 400);
        if (!input.valor || input.valor <= 0) return j({ error: "valor deve ser > 0" }, 400);
        if (!input.data_vencimento) return j({ error: "data_vencimento obrigatória (YYYY-MM-DD)" }, 400);

        const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
        const { data: pode } = await service.rpc("agente_pode_acessar_empresa", {
            p_user_id: userId, p_acesso_id: acessoId, p_company_id: input.empresa_id,
        });
        if (!pode) return j({ error: "Sem acesso a essa empresa" }, 403);

        // Validação extra: se credor_id veio, confirma que pertence à mesma empresa
        if (input.credor_id) {
            const tabela = input.credor_tipo === "funcionario" ? "employees" : "suppliers";
            const { data: f } = await service.from(tabela).select("id, company_id").eq("id", input.credor_id).maybeSingle();
            if (!f || f.company_id !== input.empresa_id) {
                return j({ error: `credor_id inválido ou de outra empresa (tabela=${tabela})` }, 400);
            }
        }

        const { data, error } = await service.rpc("agente_lancar_cp", {
            p_company_id: input.empresa_id,
            p_credor_id: input.credor_id ?? null,
            p_credor_nome: input.credor_nome,
            p_descricao: input.descricao,
            p_valor: input.valor,
            p_data_vencimento: input.data_vencimento,
            p_categoria_id: input.categoria_id ?? null,
            p_centro_custo_id: input.centro_custo_id ?? null,
            p_observacao: input.observacao ?? null,
            p_credor_tipo: input.credor_tipo ?? "fornecedor",
        });

        if (error) return j({ error: error.message }, 500);

        const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
        return j({
            ok: true,
            cp: row,
            mensagem: "CP lançada em aberto. Pra dar baixa, manda 'paguei a conta da [credor]'."
        });
    } catch (err: any) {
        return j({ error: err?.message || String(err) }, 500);
    }
});

function j(p: unknown, s = 200) {
    return new Response(JSON.stringify(p), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
