// agente-tool-baixar_cr — dá baixa (recebimento) numa Conta a Receber em aberto.
// Reusa a RPC canônica quitar_conta_receber (atômica: cria a movimentação
// crédito vinculada + atualiza a CR + gera recibo). NUNCA mexe na CR direto.
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
    cr_id: string;
    conta_bancaria_id: string;
    data_pagamento?: string;     // YYYY-MM-DD, default hoje
    valor_pago?: number;         // default = saldo restante
    forma_recebimento?: string;  // default 'pix'
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    try {
        const userId = req.headers.get("x-agente-user-id");
        const acessoId = req.headers.get("x-agente-acesso-id");
        if (!userId && !acessoId) return j({ error: "x-agente-user-id ou x-agente-acesso-id obrigatório" }, 401);

        const input = (await req.json()) as Input;
        if (!input.empresa_id) return j({ error: "empresa_id obrigatório" }, 400);
        if (!input.cr_id) return j({ error: "cr_id obrigatório" }, 400);
        if (!input.conta_bancaria_id) return j({ error: "conta_bancaria_id obrigatório (em qual conta caiu o dinheiro)" }, 400);

        const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
        const { data: pode } = await service.rpc("agente_pode_acessar_empresa", {
            p_user_id: userId, p_acesso_id: acessoId, p_company_id: input.empresa_id,
        });
        if (!pode) return j({ error: "Sem acesso a essa empresa" }, 403);

        const { data: cr } = await service
            .from("contas_receber")
            .select("id, company_id, pagador_nome, valor, valor_pago, status, deleted_at")
            .eq("id", input.cr_id)
            .maybeSingle();
        if (!cr || cr.deleted_at) return j({ error: "CR não encontrada" }, 404);
        if (cr.company_id !== input.empresa_id) return j({ error: "Essa CR é de outra empresa" }, 403);
        if (cr.status === "pago") return j({ ok: true, ja_pago: true, mensagem: "Esse recebimento já estava quitado." });

        const { data: conta } = await service
            .from("bank_accounts")
            .select("id, company_id, name")
            .eq("id", input.conta_bancaria_id)
            .maybeSingle();
        if (!conta || conta.company_id !== input.empresa_id) {
            return j({ error: "conta_bancaria_id inválida ou de outra empresa" }, 400);
        }

        const saldo = (Number(cr.valor) || 0) - (Number(cr.valor_pago) || 0);
        const valorPago = input.valor_pago && input.valor_pago > 0 ? input.valor_pago : saldo;
        const dataPagamento = input.data_pagamento || hojeSaoPaulo();

        const { data, error } = await service.rpc("quitar_conta_receber", {
            p_conta_receber_id: input.cr_id,
            p_valor_pago: valorPago,
            p_data_pagamento: dataPagamento,
            p_conta_bancaria_id: input.conta_bancaria_id,
            p_forma_recebimento: input.forma_recebimento || "pix",
        });

        if (error) {
            const m = error.message || String(error);
            if (m.includes("CR_JA_PAGO")) return j({ ok: true, ja_pago: true, mensagem: "Esse recebimento já estava quitado." });
            if (m.includes("NOT_FOUND")) return j({ error: "CR não encontrada" }, 404);
            if (m.includes("VALOR_INVALIDO")) return j({ error: "Valor de recebimento inválido" }, 400);
            return j({ error: m }, 500);
        }

        const result = (data || {}) as any;
        return j({
            ok: true,
            cr_id: input.cr_id,
            pagador_nome: cr.pagador_nome,
            valor_pago: valorPago,
            data_pagamento: dataPagamento,
            conta: conta.name,
            novo_status: result.novo_status ?? null,
            mensagem: result.novo_status === "parcial"
                ? "Recebimento parcial registrado — ainda resta saldo em aberto."
                : "Recebimento registrado com sucesso.",
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
