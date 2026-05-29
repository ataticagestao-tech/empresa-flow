// agente-tool-excluir_lancamento — soft-delete de uma CP ou CR EM ABERTO.
// Pagas NÃO são excluídas aqui (precisa estorno no sistema, pra reverter a
// movimentação e não bagunçar o saldo).
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
        const nomeCampo = input.tipo === "cp" ? "credor_nome" : "pagador_nome";

        const { data: row } = await service
            .from(tabela)
            .select(`id, company_id, status, deleted_at, ${nomeCampo}, valor`)
            .eq("id", input.id)
            .maybeSingle();
        if (!row || row.deleted_at) return j({ error: "Lançamento não encontrado" }, 404);
        if ((row as any).company_id !== input.empresa_id) return j({ error: "Esse lançamento é de outra empresa" }, 403);
        if ((row as any).status === "pago" || (row as any).status === "parcial") {
            return j({ error: "Esse lançamento já tem pagamento registrado. Excluir exigiria estorno (reverter a movimentação) — faça pelo sistema pra não bagunçar o saldo." }, 409);
        }

        const { error } = await service
            .from(tabela)
            .update({ deleted_at: new Date().toISOString() })
            .eq("id", input.id);
        if (error) return j({ error: error.message }, 500);

        return j({
            ok: true,
            excluido: true,
            tipo: input.tipo,
            nome: (row as any)[nomeCampo],
            valor: Number((row as any).valor) || 0,
            mensagem: "Lançamento excluído.",
        });
    } catch (err: any) {
        return j({ error: err?.message || String(err) }, 500);
    }
});

function j(p: unknown, s = 200) {
    return new Response(JSON.stringify(p), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
