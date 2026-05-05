// ============================================================
// gerar-overnight-pdf — Edge Function (Deno)
// Gera o PDF "Overnight Financeiro" do dia para uma empresa.
// Layout segue o template Tática (hero navy + seções numeradas):
//   1. Resumo Executivo  ·  2. Vendas (agrupado por forma)
//   3. Contas a Pagar    ·  4. Contas a Receber
//   5. Consolidado Dia/Mês
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Layout A4 ──────────────────────────────────────────────
const A4: [number, number] = [595.28, 841.89];
const MARGIN_TOP = 40;
const MARGIN_BOTTOM = 50;
const MARGIN_LEFT = 50;
const MARGIN_RIGHT = 50;
const CONTENT_WIDTH = A4[0] - MARGIN_LEFT - MARGIN_RIGHT;

// ── Paleta (extraída do template impresso) ─────────────────
const COLOR_HERO_BG = rgb(0.118, 0.235, 0.471);     // #1E3C78  navy
const COLOR_HERO_ACCENT = rgb(0.357, 0.745, 0.502); // #5BBE80  verde claro do TÁTICA
const COLOR_WHITE = rgb(1, 1, 1);
const COLOR_BODY = rgb(0.114, 0.161, 0.224);        // #1D2939
const COLOR_MUTED = rgb(0.408, 0.471, 0.553);       // #68748D
const COLOR_BORDER = rgb(0.85, 0.87, 0.91);
const COLOR_BG_SOFT = rgb(0.953, 0.961, 0.973);     // cinza claríssimo
const COLOR_BG_HEADER = rgb(0.118, 0.235, 0.471);   // mesmo navy do hero (header tabela)
const COLOR_BG_TOTAL = rgb(0.918, 0.945, 0.969);    // azul muito claro p/ linha total
const COLOR_GREEN_BAR = rgb(0.094, 0.549, 0.361);   // #18A55C  barra verde dos títulos
const COLOR_GREEN = rgb(0.094, 0.549, 0.361);
const COLOR_RED = rgb(0.784, 0.157, 0.192);

const HERO_HEIGHT = 100;

interface OvernightRequest {
    empresa_id: string;
    origem?: "manual" | "agendado";
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
        const dados = await coletarDados(userClient, body.empresa_id);
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

interface EmpresaInfo { id: string; nome: string; }
interface VendaPorForma { forma_label: string; qtd: number; valor: number; }
interface TituloComCategoria {
    categoria: string;
    descricao: string;
    vencimento: string;
    valor: number;
}
interface Consolidado { entradas: number; saidas: number; resultado: number; }

interface OvernightDados {
    empresa: EmpresaInfo;
    hoje_brt: Date;
    saldo_consolidado: number;
    vendas_por_forma: VendaPorForma[];
    vendas_total: number;
    vendas_qtd_total: number;
    contas_pagar: TituloComCategoria[];
    cp_total: number;
    contas_receber: TituloComCategoria[];
    cr_total: number;
    consolidado_dia: Consolidado;
    consolidado_mes: Consolidado;
}

// Ordem fixa das 6 categorias de venda do template
const ORDEM_FORMAS: { key: string; label: string }[] = [
    { key: "dinheiro",            label: "Dinheiro / Espécie" },
    { key: "pix",                 label: "PIX" },
    { key: "cartao_debito",       label: "Cartão de Débito" },
    { key: "cartao_credito_avista", label: "Cartão de Crédito — à vista" },
    { key: "cartao_credito_parcelado", label: "Cartão de Crédito — parcelado" },
    { key: "boleto_outros",       label: "Boleto / Outros" },
];

function bucketForma(forma: string | null, parcelas: number): string {
    const f = (forma || "").toLowerCase().trim();
    if (f === "pix" || f === "ted") return "pix";
    if (f === "dinheiro" || f === "especie" || f === "espécie") return "dinheiro";
    if (f === "cartao_debito" || f === "debito") return "cartao_debito";
    if (f === "cartao_credito" || f === "credito") {
        return parcelas > 1 ? "cartao_credito_parcelado" : "cartao_credito_avista";
    }
    if (f === "parcelado") return "cartao_credito_parcelado";
    return "boleto_outros"; // boleto, outros, vazio etc.
}

function hojeBRT(): Date {
    const iso = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    return new Date(`${iso}T00:00:00Z`);
}

function formatIsoDate(d: Date): string {
    return d.toISOString().slice(0, 10);
}

async function coletarDados(client: SupabaseClient, companyId: string): Promise<OvernightDados> {
    const hoje = hojeBRT();
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

    // Movs do dia (exclui transferências) — base do consolidado_dia
    const { data: movsHoje, error: movsHojeErr } = await client
        .from("movimentacoes")
        .select("tipo, valor")
        .eq("company_id", companyId)
        .eq("data", hojeIso)
        .neq("origem", "transferencia");
    if (movsHojeErr) throw new Error(`movimentacoes (hoje): ${movsHojeErr.message}`);

    let entradas_dia = 0, saidas_dia = 0;
    for (const m of movsHoje ?? []) {
        const v = Number(m.valor) || 0;
        if (m.tipo === "credito") entradas_dia += v;
        else if (m.tipo === "debito") saidas_dia += v;
    }

    // Vendas do dia — agrupadas por forma de recebimento
    const { data: vendasRaw, error: vendasErr } = await client
        .from("vendas")
        .select("valor_liquido, parcelas, forma_pagamento")
        .eq("company_id", companyId)
        .eq("data_venda", hojeIso)
        .eq("status", "confirmado");
    if (vendasErr) throw new Error(`vendas: ${vendasErr.message}`);

    const buckets: Record<string, { qtd: number; valor: number }> = {};
    for (const cat of ORDEM_FORMAS) buckets[cat.key] = { qtd: 0, valor: 0 };
    for (const v of vendasRaw ?? []) {
        const k = bucketForma(v.forma_pagamento, Number(v.parcelas) || 1);
        buckets[k].qtd += 1;
        buckets[k].valor += Number(v.valor_liquido) || 0;
    }
    const vendas_por_forma: VendaPorForma[] = ORDEM_FORMAS.map(cat => ({
        forma_label: cat.label,
        qtd: buckets[cat.key].qtd,
        valor: buckets[cat.key].valor,
    }));
    const vendas_total = vendas_por_forma.reduce((a, b) => a + b.valor, 0);
    const vendas_qtd_total = vendas_por_forma.reduce((a, b) => a + b.qtd, 0);

    // Contas a pagar do dia (vencimento = hoje) com categoria contábil
    const { data: cpRaw, error: cpErr } = await client
        .from("contas_pagar")
        .select("credor_nome, observacoes, valor, data_vencimento, categoria:chart_of_accounts(name)")
        .eq("company_id", companyId)
        .eq("data_vencimento", hojeIso)
        .neq("status", "cancelado")
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
        .order("created_at", { ascending: true });
    if (crErr) throw new Error(`contas_receber: ${crErr.message}`);

    const contas_receber: TituloComCategoria[] = (crRaw ?? []).map((r: any) => ({
        categoria: r.categoria?.name?.trim() || "Sem categoria",
        descricao: r.pagador_nome?.trim() || r.observacoes?.trim() || "—",
        vencimento: r.data_vencimento as string,
        valor: Number(r.valor) || 0,
    }));
    const cr_total = contas_receber.reduce((a, t) => a + t.valor, 0);

    // Consolidado do mês (até hoje, exclui transferências)
    const { data: movsMes, error: movsMesErr } = await client
        .from("movimentacoes")
        .select("tipo, valor")
        .eq("company_id", companyId)
        .gte("data", inicioMesIso)
        .lte("data", hojeIso)
        .neq("origem", "transferencia");
    if (movsMesErr) throw new Error(`movimentacoes (mês): ${movsMesErr.message}`);

    let entradas_mes = 0, saidas_mes = 0;
    for (const m of movsMes ?? []) {
        const v = Number(m.valor) || 0;
        if (m.tipo === "credito") entradas_mes += v;
        else if (m.tipo === "debito") saidas_mes += v;
    }

    return {
        empresa,
        hoje_brt: hoje,
        saldo_consolidado,
        vendas_por_forma, vendas_total, vendas_qtd_total,
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

// ============================================================
// PDF RENDERING
// ============================================================

interface RenderCtx {
    doc: PDFDocument;
    page: PDFPage;
    font: PDFFont;
    fontBold: PDFFont;
    fontItalic: PDFFont;
    y: number;
    pages: PDFPage[]; // p/ rodapé "página X de N" no fim
}

async function renderizarPdf(d: OvernightDados): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    doc.setTitle(sanitizeWinAnsi(`Overnight Financeiro — ${d.empresa.nome}`));
    doc.setProducer("Tatica Gestao Empresarial");
    doc.setCreator("Tatica Overnight");

    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique);

    const page = doc.addPage(A4);
    const ctx: RenderCtx = { doc, page, font, fontBold, fontItalic, y: A4[1], pages: [page] };

    desenharHero(ctx);
    desenharCabecalhoEmpresa(ctx, d);
    ctx.y -= 18;

    ensureSpace(ctx, 110);
    desenharTituloSecao(ctx, "1.", "RESUMO EXECUTIVO DO DIA");
    desenharResumoBoxes(ctx, d);
    ctx.y -= 14;

    ensureSpace(ctx, 180);
    desenharTituloSecao(ctx, "2.", "VENDAS DO DIA");
    desenharTabelaVendas(ctx, d);
    ctx.y -= 14;

    ensureSpace(ctx, 120);
    desenharTituloSecao(ctx, "3.", "CONTAS A PAGAR");
    desenharTabelaTitulos(
        ctx,
        d.contas_pagar,
        d.cp_total,
        ["CATEGORIA", "FORNECEDOR / DESCRIÇÃO", "VENCIMENTO", "VALOR (R$)"],
        "TOTAL PAGO / A PAGAR NO DIA",
        "Nenhum vencimento de pagamento hoje",
    );
    ctx.y -= 14;

    ensureSpace(ctx, 120);
    desenharTituloSecao(ctx, "4.", "CONTAS A RECEBER");
    desenharTabelaTitulos(
        ctx,
        d.contas_receber,
        d.cr_total,
        ["CATEGORIA", "CLIENTE / DESCRIÇÃO", "VENCIMENTO", "VALOR (R$)"],
        "TOTAL RECEBIDO / A RECEBER NO DIA",
        "Nenhum vencimento de recebimento hoje",
    );
    ctx.y -= 14;

    ensureSpace(ctx, 120);
    desenharTituloSecao(ctx, "5.", "CONSOLIDADO — DIA E MÊS");
    desenharTabelaConsolidado(ctx, d);
    ctx.y -= 24;

    desenharAssinatura(ctx);
    desenharRodapesFinais(ctx);

    return await doc.save();
}

// ── Hero (banda navy + EMPRESA/DATA) ───────────────────────

function desenharHero(ctx: RenderCtx) {
    // Faixa navy
    ctx.page.drawRectangle({
        x: 0,
        y: A4[1] - HERO_HEIGHT,
        width: A4[0],
        height: HERO_HEIGHT,
        color: COLOR_HERO_BG,
    });

    // OVERNIGHT (esquerda)
    ctx.page.drawText("OVERNIGHT", {
        x: MARGIN_LEFT,
        y: A4[1] - 50,
        size: 26,
        font: ctx.fontBold,
        color: COLOR_WHITE,
    });
    ctx.page.drawText("Atualização Financeira Diária", {
        x: MARGIN_LEFT,
        y: A4[1] - 70,
        size: 9,
        font: ctx.font,
        color: COLOR_HERO_ACCENT,
    });

    // TÁTICA GESTÃO / EMPRESARIAL (direita)
    const dirText1 = "TÁTICA GESTÃO";
    const dirText2 = "EMPRESARIAL";
    const w1 = ctx.fontBold.widthOfTextAtSize(dirText1, 9);
    const w2 = ctx.fontBold.widthOfTextAtSize(dirText2, 9);
    ctx.page.drawText(dirText1, {
        x: A4[0] - MARGIN_RIGHT - w1,
        y: A4[1] - 45,
        size: 9,
        font: ctx.fontBold,
        color: COLOR_WHITE,
    });
    ctx.page.drawText(dirText2, {
        x: A4[0] - MARGIN_RIGHT - w2,
        y: A4[1] - 58,
        size: 9,
        font: ctx.fontBold,
        color: COLOR_HERO_ACCENT,
    });

    ctx.y = A4[1] - HERO_HEIGHT - 8;
}

function desenharCabecalhoEmpresa(ctx: RenderCtx, d: OvernightDados) {
    // Caixa cinza-clara com 2 colunas: EMPRESA | DATA DE REFERÊNCIA
    const h = 48;
    const colW = CONTENT_WIDTH / 2;
    const y0 = ctx.y - h;

    ctx.page.drawRectangle({
        x: MARGIN_LEFT, y: y0,
        width: CONTENT_WIDTH, height: h,
        color: COLOR_BG_SOFT,
        borderColor: COLOR_BORDER,
        borderWidth: 0.6,
    });
    // separador entre colunas
    ctx.page.drawLine({
        start: { x: MARGIN_LEFT + colW, y: y0 },
        end: { x: MARGIN_LEFT + colW, y: y0 + h },
        thickness: 0.6,
        color: COLOR_BORDER,
    });

    // Coluna 1 — EMPRESA
    ctx.page.drawText("EMPRESA", {
        x: MARGIN_LEFT + 10, y: ctx.y - 14,
        size: 7.5, font: ctx.fontBold, color: COLOR_MUTED,
    });
    const nome = truncar(d.empresa.nome, ctx.fontBold, 12, colW - 20);
    ctx.page.drawText(nome, {
        x: MARGIN_LEFT + 10, y: ctx.y - 32,
        size: 12, font: ctx.fontBold, color: COLOR_HERO_BG,
    });

    // Coluna 2 — DATA DE REFERÊNCIA
    ctx.page.drawText("DATA DE REFERÊNCIA", {
        x: MARGIN_LEFT + colW + 10, y: ctx.y - 14,
        size: 7.5, font: ctx.fontBold, color: COLOR_MUTED,
    });
    ctx.page.drawText(formatarDataExtensa(d.hoje_brt), {
        x: MARGIN_LEFT + colW + 10, y: ctx.y - 32,
        size: 12, font: ctx.fontBold, color: COLOR_HERO_BG,
    });

    ctx.y = y0 - 4;
}

// ── Título de seção (barra verde + numeração + texto) ──────

function desenharTituloSecao(ctx: RenderCtx, num: string, titulo: string) {
    const barH = 14;
    const barW = 4;
    // barra verde
    ctx.page.drawRectangle({
        x: MARGIN_LEFT, y: ctx.y - barH - 1,
        width: barW, height: barH,
        color: COLOR_GREEN_BAR,
    });
    // numeração + título
    ctx.page.drawText(`${num}  ${titulo}`, {
        x: MARGIN_LEFT + barW + 8,
        y: ctx.y - barH + 2,
        size: 11,
        font: ctx.fontBold,
        color: COLOR_BODY,
    });
    ctx.y -= barH + 8;
}

// ── Seção 1 — Resumo Executivo (3 boxes) ───────────────────

function desenharResumoBoxes(ctx: RenderCtx, d: OvernightDados) {
    const boxH = 56;
    const gap = 8;
    const boxW = (CONTENT_WIDTH - gap * 2) / 3;
    const topY = ctx.y;
    const bottomY = topY - boxH;

    const itens = [
        { titulo: "FATURAMENTO CONSOLIDADO (+)", valor: formatarMoeda(d.consolidado_mes.entradas), cor: COLOR_GREEN },
        { titulo: "DESPESAS E CUSTOS (-)",       valor: formatarMoeda(d.consolidado_mes.saidas),   cor: COLOR_RED },
        { titulo: "RESULTADO DO MÊS (=)",        valor: signedMoeda(d.consolidado_mes.resultado),  cor: corResultado(d.consolidado_mes.resultado) },
    ];

    for (let i = 0; i < 3; i++) {
        const x = MARGIN_LEFT + i * (boxW + gap);
        const it = itens[i];

        ctx.page.drawRectangle({
            x, y: bottomY, width: boxW, height: boxH,
            color: COLOR_BG_SOFT,
            borderColor: COLOR_BORDER,
            borderWidth: 0.6,
        });

        ctx.page.drawText(it.titulo, {
            x: x + 10, y: topY - 14,
            size: 7.5, font: ctx.fontBold, color: COLOR_MUTED,
        });
        ctx.page.drawText(it.valor, {
            x: x + 10, y: topY - 38,
            size: 14, font: ctx.fontBold, color: it.cor,
        });
    }
    ctx.y = bottomY - 4;
}

// ── Seção 2 — Vendas do dia (agrupado por forma) ───────────

function desenharTabelaVendas(ctx: RenderCtx, d: OvernightDados) {
    const cols = [
        { x: MARGIN_LEFT,                                w: 270, align: "left" as const },
        { x: MARGIN_LEFT + 270,                          w: 110, align: "center" as const },
        { x: MARGIN_LEFT + 380,                          w: CONTENT_WIDTH - 380, align: "right" as const },
    ];
    desenharHeaderTabela(ctx, cols, ["FORMA DE RECEBIMENTO", "QTD. TRANSAÇÕES", "VALOR (R$)"]);

    const formasComVenda = d.vendas_por_forma.filter(v => v.qtd > 0);
    if (formasComVenda.length === 0) {
        desenharLinhaVazia(ctx, "Nenhuma venda confirmada hoje");
    } else {
        for (const v of formasComVenda) {
            desenharLinhaTabela(ctx, cols, [
                v.forma_label,
                String(v.qtd),
                formatarMoeda(v.valor),
            ], 18, 9, ctx.font);
        }
    }

    desenharLinhaTotal(
        ctx, cols,
        ["TOTAL DE VENDAS DO DIA", String(d.vendas_qtd_total), formatarMoeda(d.vendas_total)],
        ctx.fontBold, COLOR_HERO_BG,
    );
}

// ── Seções 3/4 — Contas a Pagar / Receber (com categoria) ──

function desenharTabelaTitulos(
    ctx: RenderCtx,
    itens: TituloComCategoria[],
    total: number,
    headers: string[],
    rotuloTotal: string,
    msgVazio: string,
) {
    const cols = [
        { x: MARGIN_LEFT,                                w: 150, align: "left" as const },
        { x: MARGIN_LEFT + 150,                          w: 195, align: "left" as const },
        { x: MARGIN_LEFT + 345,                          w: 80,  align: "center" as const },
        { x: MARGIN_LEFT + 425,                          w: CONTENT_WIDTH - 425, align: "right" as const },
    ];
    desenharHeaderTabela(ctx, cols, headers);

    if (itens.length === 0) {
        desenharLinhaVazia(ctx, msgVazio);
    } else {
        for (const it of itens) {
            desenharLinhaTabela(ctx, cols, [
                truncar(it.categoria, ctx.font, 9, cols[0].w - 8),
                truncar(it.descricao, ctx.font, 9, cols[1].w - 8),
                formatarDataBr(it.vencimento),
                formatarMoeda(it.valor),
            ], 18, 9, ctx.font);
        }
    }

    desenharLinhaTotal(
        ctx, cols,
        [rotuloTotal, "", "", formatarMoeda(total)],
        ctx.fontBold, COLOR_HERO_BG,
    );
}

// ── Seção 5 — Consolidado Dia/Mês ──────────────────────────

function desenharTabelaConsolidado(ctx: RenderCtx, d: OvernightDados) {
    const cols = [
        { x: MARGIN_LEFT,                                w: 280, align: "left" as const },
        { x: MARGIN_LEFT + 280,                          w: (CONTENT_WIDTH - 280) / 2, align: "right" as const },
        { x: MARGIN_LEFT + 280 + (CONTENT_WIDTH - 280) / 2, w: (CONTENT_WIDTH - 280) / 2, align: "right" as const },
    ];
    desenharHeaderTabela(ctx, cols, ["DEMONSTRATIVO CONSOLIDADO", "DIA (R$)", "ACUMULADO MÊS (R$)"]);

    desenharLinhaTabela(ctx, cols, [
        "(+) Total de Entradas",
        formatarMoeda(d.consolidado_dia.entradas),
        formatarMoeda(d.consolidado_mes.entradas),
    ], 18, 9, ctx.font, COLOR_GREEN);

    desenharLinhaTabela(ctx, cols, [
        "(-) Total de Saídas",
        formatarMoeda(d.consolidado_dia.saidas),
        formatarMoeda(d.consolidado_mes.saidas),
    ], 18, 9, ctx.font, COLOR_RED);

    const corDia = corResultado(d.consolidado_dia.resultado);
    const corMes = corResultado(d.consolidado_mes.resultado);
    desenharLinhaTotalMulticor(
        ctx, cols,
        ["(=) RESULTADO LÍQUIDO",
         signedMoeda(d.consolidado_dia.resultado),
         signedMoeda(d.consolidado_mes.resultado)],
        ctx.fontBold,
        [COLOR_BODY, corDia, corMes],
    );
}

// ── Helpers de tabela ──────────────────────────────────────

function desenharHeaderTabela(
    ctx: RenderCtx,
    cols: { x: number; w: number; align: "left" | "right" | "center" }[],
    headers: string[],
) {
    const h = 22;
    ctx.page.drawRectangle({
        x: MARGIN_LEFT, y: ctx.y - h,
        width: CONTENT_WIDTH, height: h,
        color: COLOR_BG_HEADER,
    });
    for (let i = 0; i < cols.length; i++) {
        const label = headers[i];
        const c = cols[i];
        const size = 8;
        const labelW = ctx.fontBold.widthOfTextAtSize(label, size);
        const textX =
            c.align === "right"  ? c.x + c.w - labelW - 8 :
            c.align === "center" ? c.x + (c.w - labelW) / 2 :
                                   c.x + 8;
        ctx.page.drawText(label, {
            x: textX, y: ctx.y - 14,
            size, font: ctx.fontBold, color: COLOR_WHITE,
        });
    }
    ctx.y -= h;
}

function desenharLinhaTabela(
    ctx: RenderCtx,
    cols: { x: number; w: number; align: "left" | "right" | "center" }[],
    valores: string[],
    rowHeight: number,
    fontSize: number,
    fnt: PDFFont,
    corValor?: ReturnType<typeof rgb>,
) {
    for (let i = 0; i < cols.length; i++) {
        const v = valores[i];
        if (!v) continue;
        const c = cols[i];
        const valW = fnt.widthOfTextAtSize(v, fontSize);
        const textX =
            c.align === "right"  ? c.x + c.w - valW - 8 :
            c.align === "center" ? c.x + (c.w - valW) / 2 :
                                   c.x + 8;
        const cor = (i > 0 && corValor) ? corValor : COLOR_BODY;
        ctx.page.drawText(v, {
            x: textX, y: ctx.y - rowHeight + 6,
            size: fontSize, font: fnt, color: cor,
        });
    }
    // borda inferior
    ctx.page.drawLine({
        start: { x: MARGIN_LEFT, y: ctx.y - rowHeight },
        end: { x: MARGIN_LEFT + CONTENT_WIDTH, y: ctx.y - rowHeight },
        thickness: 0.3,
        color: COLOR_BORDER,
    });
    ctx.y -= rowHeight;
}

function desenharLinhaVazia(ctx: RenderCtx, msg: string) {
    const h = 22;
    ctx.page.drawText(msg, {
        x: MARGIN_LEFT + 10, y: ctx.y - 14,
        size: 9, font: ctx.fontItalic, color: COLOR_MUTED,
    });
    ctx.page.drawLine({
        start: { x: MARGIN_LEFT, y: ctx.y - h },
        end: { x: MARGIN_LEFT + CONTENT_WIDTH, y: ctx.y - h },
        thickness: 0.3,
        color: COLOR_BORDER,
    });
    ctx.y -= h;
}

function desenharLinhaTotal(
    ctx: RenderCtx,
    cols: { x: number; w: number; align: "left" | "right" | "center" }[],
    valores: string[],
    fnt: PDFFont,
    corValor: ReturnType<typeof rgb>,
) {
    const h = 22;
    ctx.page.drawRectangle({
        x: MARGIN_LEFT, y: ctx.y - h,
        width: CONTENT_WIDTH, height: h,
        color: COLOR_BG_TOTAL,
    });
    for (let i = 0; i < cols.length; i++) {
        const v = valores[i];
        if (!v) continue;
        const c = cols[i];
        const size = i === 0 ? 9 : 9.5;
        const valW = fnt.widthOfTextAtSize(v, size);
        const textX =
            c.align === "right"  ? c.x + c.w - valW - 8 :
            c.align === "center" ? c.x + (c.w - valW) / 2 :
                                   c.x + 8;
        ctx.page.drawText(v, {
            x: textX, y: ctx.y - 14,
            size, font: fnt, color: corValor,
        });
    }
    ctx.y -= h;
}

function desenharLinhaTotalMulticor(
    ctx: RenderCtx,
    cols: { x: number; w: number; align: "left" | "right" | "center" }[],
    valores: string[],
    fnt: PDFFont,
    cores: ReturnType<typeof rgb>[],
) {
    const h = 22;
    ctx.page.drawRectangle({
        x: MARGIN_LEFT, y: ctx.y - h,
        width: CONTENT_WIDTH, height: h,
        color: COLOR_BG_TOTAL,
    });
    for (let i = 0; i < cols.length; i++) {
        const v = valores[i];
        if (!v) continue;
        const c = cols[i];
        const size = i === 0 ? 9 : 9.5;
        const valW = fnt.widthOfTextAtSize(v, size);
        const textX =
            c.align === "right"  ? c.x + c.w - valW - 8 :
            c.align === "center" ? c.x + (c.w - valW) / 2 :
                                   c.x + 8;
        ctx.page.drawText(v, {
            x: textX, y: ctx.y - 14,
            size, font: fnt, color: cores[i] ?? COLOR_BODY,
        });
    }
    ctx.y -= h;
}

// ── Assinatura final ───────────────────────────────────────

function desenharAssinatura(ctx: RenderCtx) {
    ensureSpace(ctx, 60);
    ctx.page.drawLine({
        start: { x: MARGIN_LEFT, y: ctx.y - 4 },
        end: { x: MARGIN_LEFT + CONTENT_WIDTH, y: ctx.y - 4 },
        thickness: 0.4, color: COLOR_BORDER,
    });
    ctx.page.drawText("Atenciosamente,", {
        x: MARGIN_LEFT, y: ctx.y - 22,
        size: 10, font: ctx.font, color: COLOR_BODY,
    });
    ctx.page.drawText("Tática Gestão Empresarial Ltda.", {
        x: MARGIN_LEFT, y: ctx.y - 36,
        size: 10, font: ctx.fontBold, color: COLOR_BODY,
    });
    ctx.page.drawText("contato@taticagestao.com.br  |  Varginha — MG", {
        x: MARGIN_LEFT, y: ctx.y - 50,
        size: 8.5, font: ctx.font, color: COLOR_MUTED,
    });
}

// ── Rodapés "Página X de N" em todas as páginas ────────────

function desenharRodapesFinais(ctx: RenderCtx) {
    const total = ctx.pages.length;
    for (let i = 0; i < total; i++) {
        const p = ctx.pages[i];
        // linha
        p.drawLine({
            start: { x: MARGIN_LEFT, y: 35 },
            end: { x: A4[0] - MARGIN_RIGHT, y: 35 },
            thickness: 0.3, color: COLOR_BORDER,
        });
        // esquerda — Tática
        p.drawText("Tática Gestão Empresarial Ltda.", {
            x: MARGIN_LEFT, y: 22,
            size: 7.5, font: ctx.fontBold, color: COLOR_BODY,
        });
        p.drawText("  |  Documento confidencial — uso restrito do destinatário", {
            x: MARGIN_LEFT + ctx.fontBold.widthOfTextAtSize("Tática Gestão Empresarial Ltda.", 7.5),
            y: 22,
            size: 7.5, font: ctx.font, color: COLOR_MUTED,
        });
        // direita — Página X de N
        const pagText = `Página ${i + 1} de ${total}`;
        const w = ctx.font.widthOfTextAtSize(pagText, 7.5);
        p.drawText(pagText, {
            x: A4[0] - MARGIN_RIGHT - w, y: 22,
            size: 7.5, font: ctx.font, color: COLOR_MUTED,
        });
    }
}

// ── Quebra de página ───────────────────────────────────────

function ensureSpace(ctx: RenderCtx, needed: number) {
    if (ctx.y - needed < MARGIN_BOTTOM) {
        const novaPagina = ctx.doc.addPage(A4);
        ctx.page = novaPagina;
        ctx.pages.push(novaPagina);
        ctx.y = A4[1] - MARGIN_TOP;
    }
}

// ============================================================
// HELPERS
// ============================================================

function corResultado(v: number): ReturnType<typeof rgb> {
    if (v > 0) return COLOR_GREEN;
    if (v < 0) return COLOR_RED;
    return COLOR_BODY;
}

function signedMoeda(v: number): string {
    const sign = v > 0 ? "+ " : v < 0 ? "- " : "";
    return `${sign}${formatarMoeda(Math.abs(v))}`;
}

function formatarMoeda(v: number): string {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 2,
    }).format(v);
}

function formatarDataBr(iso: string): string {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
}

function formatarDataExtensa(d: Date): string {
    const diasSemana = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
    const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    return `${diasSemana[d.getUTCDay()]}, ${d.getUTCDate()} de ${meses[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

function truncar(s: string, fnt: PDFFont, size: number, maxW: number): string {
    const safe = sanitizeWinAnsi(s);
    if (fnt.widthOfTextAtSize(safe, size) <= maxW) return safe;
    let out = safe;
    while (out.length > 1 && fnt.widthOfTextAtSize(out + "…", size) > maxW) {
        out = out.slice(0, -1);
    }
    return out + "…";
}

// Helvetica padrão usa codificação WinAnsi — caracteres fora dela
// (setas, símbolos matemáticos, emoji, asiáticos) lançam erro ao desenhar.
// Esta função troca por equivalentes ASCII ou "?" como fallback.
const TRANSLIT: Record<string, string> = {
    "−": "-", "–": "-", "—": "-",      // travessões e sinal de menos
    "→": "->", "←": "<-", "↑": "^", "↓": "v",
    "≤": "<=", "≥": ">=", "≠": "!=", "≈": "~",
    "•": "-", "·": "-",
    "“": '"', "”": '"', "‘": "'", "’": "'",
    " ": " ",                       // NBSP -> espaço comum
};

function sanitizeWinAnsi(s: string | null | undefined): string {
    if (!s) return "";
    let out = "";
    for (const ch of s) {
        if (TRANSLIT[ch] !== undefined) { out += TRANSLIT[ch]; continue; }
        const code = ch.charCodeAt(0);
        // ASCII imprimível + Latin-1 (acentos pt-BR) + €,…,",–,— já mapeados pelo WinAnsi
        if (code >= 0x20 && code <= 0x7E) { out += ch; continue; }
        if (code >= 0xA0 && code <= 0xFF) { out += ch; continue; }
        if ("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ".includes(ch)) { out += ch; continue; }
        out += "?"; // qualquer outra coisa vira "?"
    }
    return out;
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
    }
    return btoa(binary);
}
