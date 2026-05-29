// agente-tool-listar_cr_abertas — lista Contas a Receber em aberto/parcial/vencido
// pra o agente achar qual CR dar baixa quando o empresario diz "recebi de X".
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
    termo?: string; // filtra por pagador_nome ou observacoes
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

        const { data, error } = await service
            .from("contas_receber")
            .select("id, pagador_nome, observacoes, valor, valor_pago, status, data_vencimento")
            .eq("company_id", input.empresa_id)
            .is("deleted_at", null)
            .in("status", ["aberto", "parcial", "vencido"])
            .order("data_vencimento", { ascending: true })
            .limit(200);

        if (error) return j({ error: error.message }, 500);

        let rows = (data || []).map((r: any) => ({
            cr_id: r.id,
            pagador_nome: r.pagador_nome,
            descricao: r.observacoes,
            valor: Number(r.valor) || 0,
            valor_pago: Number(r.valor_pago) || 0,
            saldo: (Number(r.valor) || 0) - (Number(r.valor_pago) || 0),
            data_vencimento: r.data_vencimento,
            status: r.status,
        }));

        const termo = (input.termo || "").trim().toLowerCase();
        if (termo) {
            rows = rows.filter((r) =>
                (r.pagador_nome || "").toLowerCase().includes(termo) ||
                (r.descricao || "").toLowerCase().includes(termo)
            );
        }

        return j({ ok: true, total: rows.length, contas: rows.slice(0, 15) });
    } catch (err: any) {
        return j({ error: err?.message || String(err) }, 500);
    }
});

function j(p: unknown, s = 200) {
    return new Response(JSON.stringify(p), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
