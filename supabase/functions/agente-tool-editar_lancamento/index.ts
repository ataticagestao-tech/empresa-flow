// agente-tool-editar_lancamento — edita campos de uma CP ou CR EM ABERTO
// (descrição, valor, vencimento, categoria). Pagas não são editadas aqui.
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
    tipo: "cp" | "cr";
    id: string;
    descricao?: string;
    valor?: number;
    data_vencimento?: string;
    categoria_id?: string;
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    try {
        const userId = req.headers.get("x-agente-user-id");
        const acessoId = req.headers.get("x-agente-acesso-id");
        if (!userId && !acessoId) return j({ error: "x-agente-user-id ou x-agente-acesso-id obrigatório" }, 401);

        const input = (await req.json()) as Input;
        if (!input.empresa_id) return j({ error: "empresa_id obrigatório" }, 400);
        if (input.tipo !== "cp" && input.tipo !== "cr") return j({ error: "tipo deve ser 'cp' ou 'cr'" }, 400);
        if (!input.id) return j({ error: "id obrigatório" }, 400);

        const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
        const { data: pode } = await service.rpc("agente_pode_acessar_empresa", {
            p_user_id: userId, p_acesso_id: acessoId, p_company_id: input.empresa_id,
        });
        if (!pode) return j({ error: "Sem acesso a essa empresa" }, 403);

        const tabela = input.tipo === "cp" ? "contas_pagar" : "contas_receber";
        // CP guarda descrição em 'descricao'; CR em 'observacoes'
        const campoDescricao = input.tipo === "cp" ? "descricao" : "observacoes";

        const { data: row } = await service
            .from(tabela)
            .select("id, company_id, status, deleted_at")
            .eq("id", input.id)
            .maybeSingle();
        if (!row || row.deleted_at) return j({ error: "Lançamento não encontrado" }, 404);
        if (row.company_id !== input.empresa_id) return j({ error: "Esse lançamento é de outra empresa" }, 403);
        if (row.status === "pago" || row.status === "parcial") {
            return j({ error: "Esse lançamento já tem pagamento. Editar valor/vencimento dele exige ajuste no sistema." }, 409);
        }

        const patch: Record<string, unknown> = {};
        if (input.descricao !== undefined) patch[campoDescricao] = input.descricao;
        if (input.valor !== undefined) {
            if (!(input.valor > 0)) return j({ error: "valor deve ser > 0" }, 400);
            patch.valor = input.valor;
        }
        if (input.data_vencimento !== undefined) patch.data_vencimento = input.data_vencimento;
        if (input.categoria_id !== undefined) patch.conta_contabil_id = input.categoria_id;

        if (Object.keys(patch).length === 0) {
            return j({ error: "Nada pra atualizar — informe descricao, valor, data_vencimento ou categoria_id" }, 400);
        }

        const { data, error } = await service
            .from(tabela)
            .update(patch)
            .eq("id", input.id)
            .select(`id, status, valor, data_vencimento, ${campoDescricao}`)
            .single();
        if (error) return j({ error: error.message }, 500);

        return j({ ok: true, tipo: input.tipo, lancamento: data, campos_alterados: Object.keys(patch) });
    } catch (err: any) {
        return j({ error: err?.message || String(err) }, 500);
    }
});

function j(p: unknown, s = 200) {
    return new Response(JSON.stringify(p), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
