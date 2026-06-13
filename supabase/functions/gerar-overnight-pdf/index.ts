// ============================================================
// gerar-overnight-pdf — Edge Function (Deno)
// Coleta os dados do "Overnight Financeiro" do dia para uma empresa
// e delega o desenho do PDF para ./render.ts.
//   1. Resumo Executivo  ·  2. Vendas (uma linha por venda)
//   3. Contas a Pagar    ·  4. Contas a Receber
//   5. Consolidado Dia/Mês
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { renderizarPdf } from "./render.ts";
import type { OvernightDados, EmpresaInfo, VendaLinha, TituloComCategoria } from "./render.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OvernightRequest {
    empresa_id: string;
    origem?: "manual" | "agendado";
    data?: string; // YYYY-MM-DD — data de referência (default hoje). Pra reenviar overnight de dias anteriores.
}

// ============================================================
// HTTP ENTRY
// ============================================================
serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
        return jsonError("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configuradas", 500);
    }

    let body: OvernightRequest;
    try {
        body = await req.json();
    } catch {
        return jsonError("Body JSON inválido", 400);
    }
    if (!body.empresa_id) {
        return jsonError("empresa_id obrigatório", 400);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, serviceRoleKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
    });
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false },
    });

    const origem = body.origem ?? "manual";

    try {
        const dados = await coletarDados(userClient, body.empresa_id, body.data);
        const pdfBytes = await renderizarPdf(dados);

        await serviceClient.from("overnight_logs").insert({
            company_id: body.empresa_id,
            status: "sucesso",
            tamanho_bytes: pdfBytes.byteLength,
            origem,
        });

        const pdfBase64 = bytesToBase64(pdfBytes);
        return new Response(
            JSON.stringify({
                ok: true,
                pdfBase64,
                tamanho_bytes: pdfBytes.byteLength,
                gerado_em: new Date().toISOString(),
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro desconhecido";
        await serviceClient.from("overnight_logs").insert({
            company_id: body.empresa_id,
            status: "erro",
            erro_descricao: msg.slice(0, 500),
            origem,
        });
        return jsonError(msg, 500);
    }
});

function jsonError(msg: string, status: number) {
    return new Response(
        JSON.stringify({ ok: false, erro: msg }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
}

// ============================================================
// DATA LAYER
// ============================================================

// Rótulo amigável da forma de pagamento de uma venda (uma linha por venda).
function formaPagamentoLabel(forma: string | null, parcelas: number): string {
    const f = (forma || "").toLowerCase().trim();
    if (!f) return "—";
    if (f === "multiplo" || f === "múltiplo") return "Múltiplo";
    if (f === "pix") return "PIX";
    if (f === "ted") return "TED";
    if (f === "dinheiro" || f === "especie" || f === "espécie") return "Dinheiro / Espécie";
    if (f === "cartao_debito" || f === "debito") return "Cartão de Débito";
    if (f === "boleto") return "Boleto";
    if (f === "cartao_credito" || f === "credito" || f === "parcelado") {
        return parcelas > 1 ? `Cartão de Crédito — ${parcelas}x` : "Cartão de Crédito — à vista";
    }
    // fallback: primeira letra maiúscula
    return forma!.charAt(0).toUpperCase() + forma!.slice(1);
}

function hojeBRT(): Date {
    const iso = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    return new Date(`${iso}T00:00:00Z`);
}

function formatIsoDate(d: Date): string {
    return d.toISOString().slice(0, 10);
}

async function coletarDados(client: SupabaseClient, companyId: string, refDateIso?: string): Promise<OvernightDados> {
    // refDateIso (YYYY-MM-DD) permite gerar o overnight de um dia anterior.
    // Sem ele, comportamento idêntico ao diário (hoje BRT).
    const hoje = (refDateIso && /^\d{4}-\d{2}-\d{2}$/.test(refDateIso))
        ? new Date(`${refDateIso}T00:00:00Z`)
        : hojeBRT();
    const hojeIso = formatIsoDate(hoje);
    const inicioMesIso = formatIsoDate(new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1)));

    // Empresa
    const { data: empresaRow, error: empresaErr } = await client
        .from("companies")
        .select("id, razao_social, nome_fantasia")
        .eq("id", companyId)
        .maybeSingle();
    if (empresaErr) throw new Error(`companies: ${empresaErr.message}`);
    if (!empresaRow) throw new Error("Empresa não encontrada ou sem acesso");
    const empresa: EmpresaInfo = {
        id: empresaRow.id,
        nome: empresaRow.razao_social || empresaRow.nome_fantasia || "Empresa",
    };

    // Saldo consolidado de todas as contas bancárias ativas
    const { data: saldosRows } = await client
        .from("v_saldo_contas_bancarias")
        .select("saldo_atual")
        .eq("company_id", companyId);
    const saldo_consolidado = (saldosRows ?? []).reduce(
        (acc: number, r: any) => acc + (Number(r.saldo_atual) || 0), 0,
    );

    // Entradas/saídas do dia — vindas de CR/CP pagas (lançado em contas a receber/pagar)
    const { data: crPagosHoje, error: crPagosHojeErr } = await client
        .from("contas_receber")
        .select("valor_pago")
        .eq("company_id", companyId)
        .eq("status", "pago")
        .eq("data_pagamento", hojeIso)
        .is("deleted_at", null);
    if (crPagosHojeErr) throw new Error(`contas_receber (hoje): ${crPagosHojeErr.message}`);

    const { data: cpPagosHoje, error: cpPagosHojeErr } = await client
        .from("contas_pagar")
        .select("valor_pago")
        .eq("company_id", companyId)
        .eq("status", "pago")
        .eq("data_pagamento", hojeIso)
        .is("deleted_at", null);
    if (cpPagosHojeErr) throw new Error(`contas_pagar (hoje): ${cpPagosHojeErr.message}`);

    const entradas_dia = (crPagosHoje ?? []).reduce(
        (acc: number, r: any) => acc + (Number(r.valor_pago) || 0), 0,
    );
    const saidas_dia = (cpPagosHoje ?? []).reduce(
        (acc: number, r: any) => acc + (Number(r.valor_pago) || 0), 0,
    );

    // Vendas do dia — uma linha por venda (produto + forma de pagamento)
    const { data: vendasRaw, error: vendasErr } = await client
        .from("vendas")
        .select("id, cliente_nome, observacoes, valor_liquido, parcelas, forma_pagamento")
        .eq("company_id", companyId)
        .eq("data_venda", hojeIso)
        .eq("status", "confirmado")
        .order("created_at", { ascending: true });
    if (vendasErr) throw new Error(`vendas: ${vendasErr.message}`);

    // Produtos (itens) das vendas do dia — pra montar o rótulo da coluna PRODUTO
    const vendaIds = (vendasRaw ?? []).map((v: any) => v.id);
    const itensPorVenda: Record<string, string[]> = {};
    if (vendaIds.length > 0) {
        const { data: itensRaw, error: itensErr } = await client
            .from("vendas_itens")
            .select("venda_id, descricao")
            .in("venda_id", vendaIds);
        if (itensErr) throw new Error(`vendas_itens: ${itensErr.message}`);
        for (const it of itensRaw ?? []) {
            const desc = (it.descricao || "").trim();
            if (!desc) continue;
            (itensPorVenda[it.venda_id] ??= []).push(desc);
        }
    }

    const vendas_dia: VendaLinha[] = (vendasRaw ?? []).map((v: any) => {
        const itens = itensPorVenda[v.id] || [];
        const produto = itens.length > 0
            ? itens.join(", ")
            : ((v.observacoes || "").trim() || "—");
        return {
            produto,
            forma_label: formaPagamentoLabel(v.forma_pagamento, Number(v.parcelas) || 1),
            valor: Number(v.valor_liquido) || 0,
        };
    });
    const vendas_total = vendas_dia.reduce((a, b) => a + b.valor, 0);

    // Faturamento do mes (competencia) — soma das vendas confirmadas do mes
    const { data: vendasMesRaw, error: vendasMesErr } = await client
        .from("vendas")
        .select("valor_liquido")
        .eq("company_id", companyId)
        .gte("data_venda", inicioMesIso)
        .lte("data_venda", hojeIso)
        .eq("status", "confirmado");
    if (vendasMesErr) throw new Error(`vendas (mes): ${vendasMesErr.message}`);
    const faturamento_mes = (vendasMesRaw ?? []).reduce(
        (acc: number, v: any) => acc + (Number(v.valor_liquido) || 0), 0,
    );

    // Contas a pagar do dia (vencimento = hoje) com categoria contábil
    const { data: cpRaw, error: cpErr } = await client
        .from("contas_pagar")
        .select("credor_nome, observacoes, valor, data_vencimento, categoria:chart_of_accounts(name)")
        .eq("company_id", companyId)
        .eq("data_vencimento", hojeIso)
        .neq("status", "cancelado")
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
    if (cpErr) throw new Error(`contas_pagar: ${cpErr.message}`);

    const contas_pagar: TituloComCategoria[] = (cpRaw ?? []).map((r: any) => ({
        categoria: r.categoria?.name?.trim() || "Sem categoria",
        descricao: r.credor_nome?.trim() || r.observacoes?.trim() || "—",
        vencimento: r.data_vencimento as string,
        valor: Number(r.valor) || 0,
    }));
    const cp_total = contas_pagar.reduce((a, t) => a + t.valor, 0);

    // Contas a receber do dia (vencimento = hoje) com categoria contábil
    const { data: crRaw, error: crErr } = await client
        .from("contas_receber")
        .select("pagador_nome, observacoes, valor, data_vencimento, categoria:chart_of_accounts(name)")
        .eq("company_id", companyId)
        .eq("data_vencimento", hojeIso)
        .neq("status", "cancelado")
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
    if (crErr) throw new Error(`contas_receber: ${crErr.message}`);

    const contas_receber: TituloComCategoria[] = (crRaw ?? []).map((r: any) => ({
        categoria: r.categoria?.name?.trim() || "Sem categoria",
        descricao: r.pagador_nome?.trim() || r.observacoes?.trim() || "—",
        vencimento: r.data_vencimento as string,
        valor: Number(r.valor) || 0,
    }));
    const cr_total = contas_receber.reduce((a, t) => a + t.valor, 0);

    // Consolidado do mês — CR/CP pagas no mês (lançado em contas a receber/pagar)
    const { data: crPagosMes, error: crPagosMesErr } = await client
        .from("contas_receber")
        .select("valor_pago")
        .eq("company_id", companyId)
        .eq("status", "pago")
        .gte("data_pagamento", inicioMesIso)
        .lte("data_pagamento", hojeIso)
        .is("deleted_at", null);
    if (crPagosMesErr) throw new Error(`contas_receber (mês): ${crPagosMesErr.message}`);

    const { data: cpPagosMes, error: cpPagosMesErr } = await client
        .from("contas_pagar")
        .select("valor_pago")
        .eq("company_id", companyId)
        .eq("status", "pago")
        .gte("data_pagamento", inicioMesIso)
        .lte("data_pagamento", hojeIso)
        .is("deleted_at", null);
    if (cpPagosMesErr) throw new Error(`contas_pagar (mês): ${cpPagosMesErr.message}`);

    const entradas_mes = (crPagosMes ?? []).reduce(
        (acc: number, r: any) => acc + (Number(r.valor_pago) || 0), 0,
    );
    const saidas_mes = (cpPagosMes ?? []).reduce(
        (acc: number, r: any) => acc + (Number(r.valor_pago) || 0), 0,
    );

    return {
        empresa,
        hoje_brt: hoje,
        saldo_consolidado,
        faturamento_mes,
        vendas_dia, vendas_total,
        contas_pagar, cp_total,
        contas_receber, cr_total,
        consolidado_dia: {
            entradas: entradas_dia,
            saidas: saidas_dia,
            resultado: entradas_dia - saidas_dia,
        },
        consolidado_mes: {
            entradas: entradas_mes,
            saidas: saidas_mes,
            resultado: entradas_mes - saidas_mes,
        },
    };
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
    }
    return btoa(binary);
}
