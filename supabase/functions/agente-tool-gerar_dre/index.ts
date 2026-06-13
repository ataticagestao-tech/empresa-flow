// agente-tool-gerar_dre — retorna o DRE (Demonstração de Resultado) de um
// período em REGIME DE CAIXA, espelhando a tela DRE.tsx: agrega CR/CP PAGOS
// por data_pagamento, agrupados por conta contábil (revenue/expense/cost).
// (Antes usava fn_gerar_dre, cujo motor de template deixa subtotais zerados.)
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

        const sel = "valor, valor_pago, conta_contabil_id";
        const qCR = service.from("contas_receber").select(sel)
            .eq("company_id", input.empresa_id).eq("status", "pago").is("deleted_at", null)
            .not("data_pagamento", "is", null).gte("data_pagamento", inicio).lte("data_pagamento", fim);
        const qCP = service.from("contas_pagar").select(sel)
            .eq("company_id", input.empresa_id).eq("status", "pago").is("deleted_at", null)
            .not("data_pagamento", "is", null).gte("data_pagamento", inicio).lte("data_pagamento", fim);
        const qContas = service.from("chart_of_accounts").select("id, code, name, account_type")
            .eq("company_id", input.empresa_id).in("account_type", ["revenue", "expense", "cost"]);

        const [crRes, cpRes, contasRes] = await Promise.all([qCR, qCP, qContas]);
        if (crRes.error) return j({ error: `contas_receber: ${crRes.error.message}` }, 500);
        if (cpRes.error) return j({ error: `contas_pagar: ${cpRes.error.message}` }, 500);
        if (contasRes.error) return j({ error: `chart_of_accounts: ${contasRes.error.message}` }, 500);

        const contasMap: Record<string, any> = {};
        for (const c of (contasRes.data ?? []) as any[]) contasMap[c.id] = c;

        const porConta: Record<string, number> = {};
        const addRow = (r: any) => {
            const id = r.conta_contabil_id;
            if (!id || !contasMap[id]) return;
            porConta[id] = (porConta[id] || 0) + (Number(r.valor_pago ?? r.valor) || 0);
        };
        for (const r of (crRes.data ?? []) as any[]) addRow(r);
        for (const r of (cpRes.data ?? []) as any[]) addRow(r);

        const receitas: Array<{ codigo: string; conta: string; valor: number }> = [];
        const despesas: Array<{ codigo: string; conta: string; valor: number }> = [];
        let receita_total = 0, despesa_total = 0;
        for (const [id, total] of Object.entries(porConta)) {
            const c = contasMap[id];
            if (c.account_type === "revenue") {
                receitas.push({ codigo: c.code || "", conta: c.name || "—", valor: round2(total) });
                receita_total += total;
            } else {
                const abs = Math.abs(total);
                despesas.push({ codigo: c.code || "", conta: c.name || "—", valor: round2(abs) });
                despesa_total += abs;
            }
        }
        receitas.sort((a, b) => b.valor - a.valor);
        despesas.sort((a, b) => b.valor - a.valor);
        const resultado = receita_total - despesa_total;
        const margem_pct = receita_total > 0 ? round2((resultado / receita_total) * 100) : null;

        return j({
            ok: true,
            regime: "caixa",
            periodo: { inicio, fim },
            receita_total: round2(receita_total),
            despesa_total: round2(despesa_total),
            resultado: round2(resultado),
            margem_pct,
            // Top contas (pra resumir no chat); arrays completos podem ser grandes.
            receitas: receitas.slice(0, 12),
            despesas: despesas.slice(0, 12),
            qtd_contas_receita: receitas.length,
            qtd_contas_despesa: despesas.length,
        });
    } catch (err: any) {
        return j({ error: err?.message || String(err) }, 500);
    }
});

function round2(v: number): number {
    return Math.round((Number(v) || 0) * 100) / 100;
}

function hojeSaoPaulo(): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
}

function j(p: unknown, s = 200) {
    return new Response(JSON.stringify(p), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
