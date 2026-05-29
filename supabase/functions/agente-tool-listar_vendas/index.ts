// agente-tool-listar_vendas — lista vendas individuais (detalhe venda a venda)
// num período. Read-only. Complementa consultar_faturamento (que é só agregado).
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
    data_inicio?: string; // YYYY-MM-DD, default 1º dia do mês corrente
    data_fim?: string;    // YYYY-MM-DD, default hoje
    termo?: string;       // filtra por cliente
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

        const { data, error } = await service
            .from("vendas")
            .select("id, cliente_nome, valor_total, data_venda, forma_pagamento, status")
            .eq("company_id", input.empresa_id)
            .is("deleted_at", null)
            .gte("data_venda", inicio)
            .lte("data_venda", fim)
            .order("data_venda", { ascending: false })
            .limit(300);

        if (error) return j({ error: error.message }, 500);

        let rows = (data || []).map((r: any) => ({
            venda_id: r.id,
            cliente: r.cliente_nome,
            valor: Number(r.valor_total) || 0,
            data: r.data_venda,
            forma: r.forma_pagamento,
            status: r.status,
        }));

        const termo = (input.termo || "").trim().toLowerCase();
        if (termo) rows = rows.filter((r) => (r.cliente || "").toLowerCase().includes(termo));

        const total = rows.reduce((acc, r) => acc + r.valor, 0);

        return j({
            ok: true,
            periodo: { inicio, fim },
            qtd: rows.length,
            total_periodo: total,
            vendas: rows.slice(0, 15),
        });
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
