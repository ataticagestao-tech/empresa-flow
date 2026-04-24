// ============================================================
// gerar-overnight-pdf — Edge Function (Deno)
// Gera o PDF "Overnight Financeiro" do dia para uma empresa.
// Usado pelo admin (preview/download) e pelo cron 18h BRT.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { PDFDocument, PDFImage, StandardFonts, rgb, PDFFont, PDFPage } from "npm:pdf-lib@1.17.1";

const HERO_IMAGE_URL = "https://ataticagestao.com/overnight-hero.png";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Layout ABNT (NBR 14724) em pontos PostScript ────────────
const A4: [number, number] = [595.28, 841.89];
const MARGIN_TOP = 85;      // 30mm
const MARGIN_BOTTOM = 56.7; // 20mm
const MARGIN_LEFT = 85;     // 30mm
const MARGIN_RIGHT = 56.7;  // 20mm
const CONTENT_WIDTH = A4[0] - MARGIN_LEFT - MARGIN_RIGHT;

// ── Paleta ─────────────────────────────────────────────────
const COLOR_HERO_BG = rgb(0.039, 0.118, 0.306);     // navy #0A1E4E
const COLOR_HERO_ACCENT = rgb(0.647, 0.705, 0.969); // #A5B4FC
const COLOR_WHITE = rgb(1, 1, 1);
const COLOR_BODY = rgb(0.114, 0.161, 0.224);        // #1D2939
const COLOR_MUTED = rgb(0.408, 0.471, 0.553);       // #68748D
const COLOR_BORDER = rgb(0.89, 0.91, 0.94);
const COLOR_BG_SOFT = rgb(0.969, 0.973, 0.980);
const COLOR_BLUE_LINK = rgb(0.149, 0.388, 0.922);   // #2663EB
const COLOR_RED = rgb(0.784, 0.157, 0.192);
const COLOR_AMBER = rgb(0.816, 0.471, 0.086);
const COLOR_GREEN = rgb(0.094, 0.549, 0.361);

// HERO_HEIGHT bate com a proporção nativa da arte overnight.png (1135×341 → 595×179)
const HERO_HEIGHT = 179;

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
interface SaldoConta { nome: string; banco: string; saldo_atual: number; variacao_hoje: number; }
interface VendaItem { cliente: string; parcelas: number; forma_pagamento: string; valor: number; }
interface TituloItem {
    descricao: string;
    vencimento: string;
    valor: number;
    status_label: string;
    status_color: "red" | "amber" | "green";
}
interface Consolidado { faturamento: number; despesas: number; resultado: number; }

interface OvernightDados {
    empresa: EmpresaInfo;
    frase_noite: string;
    hoje_brt: Date;
    saldos: SaldoConta[];
    total_saldo: number;
    vendas_dia: VendaItem[];
    vendas_total: number;
    vendas_extras: number;
    vendas_count: number;
    contas_pagar: TituloItem[];
    cp_total: number;
    cp_extras: number;
    contas_receber: TituloItem[];
    cr_total: number;
    cr_extras: number;
    consolidado_dia: Consolidado;
    consolidado_mes: Consolidado;
}

function hojeBRT(): Date {
    const iso = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    return new Date(`${iso}T00:00:00Z`);
}

function formatIsoDate(d: Date): string {
    return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
    const r = new Date(d);
    r.setUTCDate(r.getUTCDate() + n);
    return r;
}

async function coletarDados(client: SupabaseClient, companyId: string): Promise<OvernightDados> {
    const hoje = hojeBRT();
    const hojeIso = formatIsoDate(hoje);
    const amanhaIso = formatIsoDate(addDays(hoje, 1));
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

    // Frase
    const { data: configRow } = await client
        .from("overnight_config")
        .select("frase_noite")
        .eq("company_id", companyId)
        .maybeSingle();
    const frase_noite = configRow?.frase_noite?.trim() || "Bom fechamento de dia. Até amanhã!";

    // Saldos
    const { data: saldosRaw, error: saldosErr } = await client
        .from("v_saldo_contas_bancarias")
        .select("conta_bancaria_id, nome, banco, saldo_atual")
        .eq("company_id", companyId);
    if (saldosErr) throw new Error(`v_saldo_contas_bancarias: ${saldosErr.message}`);

    // Movs do dia (exclui transferências) — reutilizado para variação e consolidado_dia
    const { data: movsHoje, error: movsHojeErr } = await client
        .from("movimentacoes")
        .select("conta_bancaria_id, tipo, valor")
        .eq("company_id", companyId)
        .eq("data", hojeIso)
        .neq("origem", "transferencia");
    if (movsHojeErr) throw new Error(`movimentacoes (hoje): ${movsHojeErr.message}`);

    const variacaoPorConta = new Map<string, number>();
    let faturamento_dia = 0, despesas_dia = 0;
    for (const m of movsHoje ?? []) {
        const v = Number(m.valor) || 0;
        const delta = m.tipo === "credito" ? v : -v;
        variacaoPorConta.set(m.conta_bancaria_id, (variacaoPorConta.get(m.conta_bancaria_id) ?? 0) + delta);
        if (m.tipo === "credito") faturamento_dia += v;
        else if (m.tipo === "debito") despesas_dia += v;
    }

    const saldos: SaldoConta[] = (saldosRaw ?? []).map((s: any) => ({
        nome: s.nome ?? "",
        banco: s.banco ?? "",
        saldo_atual: Number(s.saldo_atual) || 0,
        variacao_hoje: variacaoPorConta.get(s.conta_bancaria_id) ?? 0,
    }));
    const total_saldo = saldos.reduce((acc, s) => acc + s.saldo_atual, 0);

    // Vendas do dia
    const { data: vendasRaw, error: vendasErr } = await client
        .from("vendas")
        .select("cliente_nome, valor_liquido, parcelas, forma_pagamento, created_at")
        .eq("company_id", companyId)
        .eq("data_venda", hojeIso)
        .eq("status", "confirmado")
        .order("created_at", { ascending: false });
    if (vendasErr) throw new Error(`vendas: ${vendasErr.message}`);

    const vendasTodas: VendaItem[] = (vendasRaw ?? []).map((v: any) => ({
        cliente: v.cliente_nome || "—",
        parcelas: Number(v.parcelas) || 1,
        forma_pagamento: v.forma_pagamento || "—",
        valor: Number(v.valor_liquido) || 0,
    }));
    const vendas_total = vendasTodas.reduce((a, v) => a + v.valor, 0);
    const vendas_dia = vendasTodas.slice(0, 5);
    const vendas_extras = Math.max(0, vendasTodas.length - 5);
    const vendas_count = vendasTodas.length;

    // Contas a pagar
    const { data: cpRaw, error: cpErr } = await client
        .from("contas_pagar")
        .select("credor_nome, observacoes, valor, data_vencimento")
        .eq("company_id", companyId)
        .eq("status", "aberto")
        .lte("data_vencimento", amanhaIso)
        .order("data_vencimento", { ascending: true });
    if (cpErr) throw new Error(`contas_pagar: ${cpErr.message}`);

    const cpTodos: TituloItem[] = (cpRaw ?? []).map((r: any) => {
        const venc = r.data_vencimento as string;
        let label = "A VENCER", color: "red" | "amber" | "green" = "green";
        if (venc < hojeIso) { label = "ATRASADO"; color = "red"; }
        else if (venc === hojeIso) { label = "VENCE HOJE"; color = "amber"; }
        else if (venc === amanhaIso) { label = "VENCE AMANHÃ"; color = "amber"; }
        return {
            descricao: (r.observacoes?.trim() || r.credor_nome || "—"),
            vencimento: venc,
            valor: Number(r.valor) || 0,
            status_label: label,
            status_color: color,
        };
    });
    const cp_total = cpTodos.reduce((a, t) => a + t.valor, 0);
    const contas_pagar = cpTodos.slice(0, 5);
    const cp_extras = Math.max(0, cpTodos.length - 5);

    // Contas a receber
    const { data: crRaw, error: crErr } = await client
        .from("contas_receber")
        .select("pagador_nome, observacoes, valor, data_vencimento")
        .eq("company_id", companyId)
        .eq("status", "aberto")
        .lte("data_vencimento", hojeIso)
        .order("data_vencimento", { ascending: true });
    if (crErr) throw new Error(`contas_receber: ${crErr.message}`);

    const crTodos: TituloItem[] = (crRaw ?? []).map((r: any) => {
        const venc = r.data_vencimento as string;
        let label = "NÃO RECEBIDO", color: "red" | "amber" | "green" = "amber";
        if (venc < hojeIso) { label = "ATRASADO"; color = "red"; }
        return {
            descricao: (r.observacoes?.trim() || r.pagador_nome || "—"),
            vencimento: venc,
            valor: Number(r.valor) || 0,
            status_label: label,
            status_color: color,
        };
    });
    const cr_total = crTodos.reduce((a, t) => a + t.valor, 0);
    const contas_receber = crTodos.slice(0, 5);
    const cr_extras = Math.max(0, crTodos.length - 5);

    // Consolidado do mês (até hoje, exclui transferências)
    const { data: movsMes, error: movsMesErr } = await client
        .from("movimentacoes")
        .select("tipo, valor")
        .eq("company_id", companyId)
        .gte("data", inicioMesIso)
        .lte("data", hojeIso)
        .neq("origem", "transferencia");
    if (movsMesErr) throw new Error(`movimentacoes (mês): ${movsMesErr.message}`);

    let fat_mes = 0, desp_mes = 0;
    for (const m of movsMes ?? []) {
        const v = Number(m.valor) || 0;
        if (m.tipo === "credito") fat_mes += v;
        else if (m.tipo === "debito") desp_mes += v;
    }

    return {
        empresa,
        frase_noite,
        hoje_brt: hoje,
        saldos, total_saldo,
        vendas_dia, vendas_total, vendas_extras, vendas_count,
        contas_pagar, cp_total, cp_extras,
        contas_receber, cr_total, cr_extras,
        consolidado_dia: {
            faturamento: faturamento_dia,
            despesas: despesas_dia,
            resultado: faturamento_dia - despesas_dia,
        },
        consolidado_mes: {
            faturamento: fat_mes,
            despesas: desp_mes,
            resultado: fat_mes - desp_mes,
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
}

async function renderizarPdf(d: OvernightDados): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    doc.setTitle(`Overnight Financeiro — ${d.empresa.nome}`);
    doc.setProducer("Gestap / Tatica Gestao");
    doc.setCreator("Gestap Overnight");

    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique);

    const page = doc.addPage(A4);
    const ctx: RenderCtx = { doc, page, font, fontBold, fontItalic, y: A4[1] };

    // Busca a arte do banner (PNG full-bleed) — falha silenciosa mantém o PDF funcional
    let heroImg: PDFImage | null = null;
    try {
        const res = await fetch(HERO_IMAGE_URL);
        if (res.ok) {
            const bytes = new Uint8Array(await res.arrayBuffer());
            heroImg = await doc.embedPng(bytes);
        }
    } catch (_) { /* segue sem arte */ }

    desenharHero(ctx, heroImg);
    ctx.y = A4[1] - HERO_HEIGHT - 18;

    desenharInfoEmpresa(ctx, d);
    desenharFrase(ctx, d.frase_noite);
    ctx.y -= 8;

    ensureSpace(ctx, 100);
    desenharTituloBloco(ctx, "1. SALDO FINANCEIRO");
    desenharTabelaSaldos(ctx, d.saldos, d.total_saldo);
    ctx.y -= 10;

    ensureSpace(ctx, 100);
    desenharTituloBloco(ctx, "2. VENDAS DO DIA");
    desenharTabelaVendas(ctx, d);
    ctx.y -= 10;

    ensureSpace(ctx, 100);
    desenharTituloBloco(ctx, "3. CONTAS A PAGAR");
    desenharTabelaTitulos(ctx, d.contas_pagar, d.cp_total, d.cp_extras, "a pagar", "outros vencimentos");
    ctx.y -= 10;

    ensureSpace(ctx, 100);
    desenharTituloBloco(ctx, "4. CONTAS A RECEBER");
    desenharTabelaTitulos(ctx, d.contas_receber, d.cr_total, d.cr_extras, "a receber", "outros recebimentos");
    ctx.y -= 12;

    ensureSpace(ctx, 75);
    desenharTituloBloco(ctx, "( = ) CONSOLIDADO DO DIA");
    desenharConsolidadoBoxes(ctx, d.consolidado_dia, "hoje");
    ctx.y -= 10;

    ensureSpace(ctx, 75);
    desenharTituloBloco(ctx, "( = ) CONSOLIDADO DO MÊS");
    desenharConsolidadoBoxes(ctx, d.consolidado_mes, "mês corrente");
    ctx.y -= 14;

    desenharAssinatura(ctx);

    return await doc.save();
}

// ── Hero / info / frase ────────────────────────────────────

function desenharHero(ctx: RenderCtx, heroImg: PDFImage | null) {
    if (heroImg) {
        // A arte já contém navy, logo, 'OVERNIGHT', subtítulo e foto — só pintamos ela full-bleed.
        ctx.page.drawImage(heroImg, {
            x: 0,
            y: A4[1] - HERO_HEIGHT,
            width: A4[0],
            height: HERO_HEIGHT,
        });
        return;
    }

    // Fallback caso a arte não carregue: faixa navy simples com texto renderizado.
    ctx.page.drawRectangle({
        x: 0,
        y: A4[1] - HERO_HEIGHT,
        width: A4[0],
        height: HERO_HEIGHT,
        color: COLOR_HERO_BG,
    });
    ctx.page.drawText("OVERNIGHT", {
        x: MARGIN_LEFT,
        y: A4[1] - 80,
        size: 40,
        font: ctx.fontBold,
        color: COLOR_WHITE,
    });
    ctx.page.drawText("SUA ATUALIZAÇÃO FINANCEIRA EM TEMPO", {
        x: MARGIN_LEFT,
        y: A4[1] - 105,
        size: 9,
        font: ctx.fontBold,
        color: COLOR_HERO_ACCENT,
    });
}

function desenharInfoEmpresa(ctx: RenderCtx, d: OvernightDados) {
    const nome = d.empresa.nome;
    const data = formatarDataExtensa(d.hoje_brt);
    const gerado = `Gerado às ${formatarAgoraBRT()}`;

    ctx.page.drawText(nome, {
        x: MARGIN_LEFT,
        y: ctx.y - 10,
        size: 11,
        font: ctx.fontBold,
        color: COLOR_BODY,
    });
    const nomeW = ctx.fontBold.widthOfTextAtSize(nome, 11);

    const sep = "  |  ";
    ctx.page.drawText(sep, {
        x: MARGIN_LEFT + nomeW,
        y: ctx.y - 10,
        size: 11,
        font: ctx.font,
        color: COLOR_MUTED,
    });

    ctx.page.drawText(data, {
        x: MARGIN_LEFT + nomeW + ctx.font.widthOfTextAtSize(sep, 11),
        y: ctx.y - 10,
        size: 11,
        font: ctx.font,
        color: COLOR_BODY,
    });

    // Hora gerada alinhada à direita
    const geradoW = ctx.font.widthOfTextAtSize(gerado, 9);
    ctx.page.drawText(gerado, {
        x: MARGIN_LEFT + CONTENT_WIDTH - geradoW,
        y: ctx.y - 10,
        size: 9,
        font: ctx.font,
        color: COLOR_MUTED,
    });

    ctx.y -= 22;
}

function desenharFrase(ctx: RenderCtx, frase: string) {
    const linhas = wrapText(frase, ctx.fontItalic, 11, CONTENT_WIDTH, 2);
    const lineHeight = 14;
    for (const linha of linhas) {
        ctx.page.drawText(linha, {
            x: MARGIN_LEFT,
            y: ctx.y - 11,
            size: 11,
            font: ctx.fontItalic,
            color: COLOR_BLUE_LINK,
        });
        ctx.y -= lineHeight;
    }
}

// ── Títulos de bloco ───────────────────────────────────────

function desenharTituloBloco(ctx: RenderCtx, titulo: string) {
    ctx.page.drawText(titulo, {
        x: MARGIN_LEFT,
        y: ctx.y - 12,
        size: 12,
        font: ctx.fontBold,
        color: COLOR_BODY,
    });
    ctx.page.drawLine({
        start: { x: MARGIN_LEFT, y: ctx.y - 16 },
        end: { x: MARGIN_LEFT + CONTENT_WIDTH, y: ctx.y - 16 },
        thickness: 0.8,
        color: COLOR_BODY,
    });
    ctx.y -= 22;
}

// ── Tabelas ────────────────────────────────────────────────

function desenharTabelaSaldos(ctx: RenderCtx, saldos: SaldoConta[], total: number) {
    const cols = [
        { x: MARGIN_LEFT,                       w: 150, align: "left" as const },
        { x: MARGIN_LEFT + 150,                 w: 130, align: "left" as const },
        { x: MARGIN_LEFT + 280,                 w: 90,  align: "right" as const },
        { x: MARGIN_LEFT + 370,                 w: CONTENT_WIDTH - 370, align: "right" as const },
    ];
    desenharHeaderTabela(ctx, cols, ["Conta", "Banco", "Saldo Atual", "Variação Hoje"]);

    const rowHeight = 14;
    if (saldos.length === 0) {
        desenharLinhaVazia(ctx, "Nenhuma conta bancária cadastrada");
    } else {
        for (const s of saldos) {
            const linha = [
                truncar(s.nome || "—", ctx.font, 9, cols[0].w - 6),
                truncar(s.banco || "—", ctx.font, 9, cols[1].w - 6),
                formatarMoeda(s.saldo_atual),
                formatarVariacao(s.variacao_hoje),
            ];
            desenharLinhaTabela(ctx, cols, linha, rowHeight, 9, ctx.font);
        }
    }
    desenharLinhaTotal(ctx, "Total Consolidado", formatarMoeda(total), cols);
}

function desenharTabelaVendas(ctx: RenderCtx, d: OvernightDados) {
    const cols = [
        { x: MARGIN_LEFT,                       w: 200, align: "left" as const },
        { x: MARGIN_LEFT + 200,                 w: 60,  align: "right" as const },
        { x: MARGIN_LEFT + 260,                 w: 110, align: "left" as const },
        { x: MARGIN_LEFT + 370,                 w: CONTENT_WIDTH - 370, align: "right" as const },
    ];
    desenharHeaderTabela(ctx, cols, ["Cliente", "Parcelas", "Forma Pagamento", "Valor"]);

    const rowHeight = 14;
    if (d.vendas_dia.length === 0) {
        desenharLinhaVazia(ctx, "Nenhuma venda confirmada hoje");
    } else {
        for (const v of d.vendas_dia) {
            const linha = [
                truncar(v.cliente, ctx.font, 9, cols[0].w - 6),
                String(v.parcelas) + "x",
                truncar(v.forma_pagamento, ctx.font, 9, cols[2].w - 6),
                formatarMoeda(v.valor),
            ];
            desenharLinhaTabela(ctx, cols, linha, rowHeight, 9, ctx.font);
        }
    }
    const labelTotal = d.vendas_count > 0
        ? `Total (${d.vendas_count} ${d.vendas_count === 1 ? "venda" : "vendas"})`
        : "Total";
    desenharLinhaTotal(ctx, labelTotal, formatarMoeda(d.vendas_total), cols);

    if (d.vendas_extras > 0) {
        ctx.y -= 4;
        ctx.page.drawText(`+ ${d.vendas_extras} outras vendas`, {
            x: MARGIN_LEFT,
            y: ctx.y - 8,
            size: 8,
            font: ctx.fontItalic,
            color: COLOR_MUTED,
        });
        ctx.y -= 10;
    }
}

function desenharTabelaTitulos(
    ctx: RenderCtx,
    itens: TituloItem[],
    total: number,
    extras: number,
    labelTotal: string,
    labelExtras: string,
) {
    const cols = [
        { x: MARGIN_LEFT,                       w: 200, align: "left" as const },
        { x: MARGIN_LEFT + 200,                 w: 80,  align: "left" as const },
        { x: MARGIN_LEFT + 280,                 w: 85,  align: "right" as const },
        { x: MARGIN_LEFT + 365,                 w: CONTENT_WIDTH - 365, align: "right" as const },
    ];
    desenharHeaderTabela(ctx, cols, ["Descrição", "Vencimento", "Valor", "Status"]);

    const rowHeight = 14;
    if (itens.length === 0) {
        desenharLinhaVazia(ctx, `Nenhum título ${labelTotal}`);
    } else {
        for (const t of itens) {
            const topY = ctx.y;
            const linhaTexto = [
                truncar(t.descricao, ctx.font, 9, cols[0].w - 6),
                formatarDataBr(t.vencimento),
                formatarMoeda(t.valor),
                "",
            ];
            desenharLinhaTabela(ctx, cols, linhaTexto, rowHeight, 9, ctx.font);

            const statusCor = t.status_color === "red" ? COLOR_RED :
                              t.status_color === "amber" ? COLOR_AMBER : COLOR_GREEN;
            const statusX = cols[3].x + cols[3].w -
                ctx.fontBold.widthOfTextAtSize(t.status_label, 8) - 2;
            ctx.page.drawText(t.status_label, {
                x: statusX,
                y: topY - 10,
                size: 8,
                font: ctx.fontBold,
                color: statusCor,
            });
        }
    }
    desenharLinhaTotal(ctx, `Total ${labelTotal}`, formatarMoeda(total), cols);

    if (extras > 0) {
        ctx.y -= 4;
        ctx.page.drawText(`+ ${extras} ${labelExtras}`, {
            x: MARGIN_LEFT,
            y: ctx.y - 8,
            size: 8,
            font: ctx.fontItalic,
            color: COLOR_MUTED,
        });
        ctx.y -= 10;
    }
}

// Convenção: ctx.y é o TOPO da próxima linha livre.

function desenharHeaderTabela(
    ctx: RenderCtx,
    cols: { x: number; w: number; align: "left" | "right" }[],
    headers: string[],
) {
    const h = 16;
    ctx.page.drawRectangle({
        x: MARGIN_LEFT,
        y: ctx.y - h,
        width: CONTENT_WIDTH,
        height: h,
        color: COLOR_BG_SOFT,
    });
    for (let i = 0; i < cols.length; i++) {
        const label = headers[i];
        const c = cols[i];
        const size = 8;
        const textX = c.align === "right"
            ? c.x + c.w - ctx.fontBold.widthOfTextAtSize(label, size) - 2
            : c.x + 2;
        ctx.page.drawText(label, {
            x: textX,
            y: ctx.y - 11,
            size,
            font: ctx.fontBold,
            color: COLOR_MUTED,
        });
    }
    ctx.y -= h;
}

function desenharLinhaTabela(
    ctx: RenderCtx,
    cols: { x: number; w: number; align: "left" | "right" }[],
    valores: string[],
    rowHeight: number,
    fontSize: number,
    fnt: PDFFont,
) {
    for (let i = 0; i < cols.length; i++) {
        const v = valores[i];
        if (!v) continue;
        const c = cols[i];
        const textX = c.align === "right"
            ? c.x + c.w - fnt.widthOfTextAtSize(v, fontSize) - 2
            : c.x + 2;
        ctx.page.drawText(v, {
            x: textX,
            y: ctx.y - 10,
            size: fontSize,
            font: fnt,
            color: COLOR_BODY,
        });
    }
    ctx.page.drawLine({
        start: { x: MARGIN_LEFT, y: ctx.y - rowHeight },
        end: { x: MARGIN_LEFT + CONTENT_WIDTH, y: ctx.y - rowHeight },
        thickness: 0.3,
        color: COLOR_BORDER,
    });
    ctx.y -= rowHeight;
}

function desenharLinhaVazia(ctx: RenderCtx, msg: string) {
    ctx.page.drawText(msg, {
        x: MARGIN_LEFT + 2,
        y: ctx.y - 12,
        size: 9,
        font: ctx.fontItalic,
        color: COLOR_MUTED,
    });
    ctx.y -= 18;
}

function desenharLinhaTotal(
    ctx: RenderCtx,
    label: string,
    valor: string,
    cols: { x: number; w: number; align: "left" | "right" }[],
) {
    const h = 16;
    ctx.page.drawRectangle({
        x: MARGIN_LEFT,
        y: ctx.y - h,
        width: CONTENT_WIDTH,
        height: h,
        color: COLOR_BG_SOFT,
    });
    ctx.page.drawText(label, {
        x: MARGIN_LEFT + 2,
        y: ctx.y - 11,
        size: 9,
        font: ctx.fontBold,
        color: COLOR_BODY,
    });
    const vSize = 9.5;
    const vWidth = ctx.fontBold.widthOfTextAtSize(valor, vSize);
    const last = cols[cols.length - 1];
    ctx.page.drawText(valor, {
        x: last.x + last.w - vWidth - 2,
        y: ctx.y - 11,
        size: vSize,
        font: ctx.fontBold,
        color: COLOR_BODY,
    });
    ctx.y -= h + 2;
}

function desenharConsolidadoBoxes(ctx: RenderCtx, c: Consolidado, _sufLegenda: string) {
    // Versão compacta — o rótulo da seção ("CONSOLIDADO DO DIA"/"DO MÊS") já
    // informa o período, então cada caixa só precisa de título + valor.
    const boxH = 40;
    const gap = 8;
    const boxW = (CONTENT_WIDTH - gap * 2) / 3;
    const topY = ctx.y;
    const boxBottomY = topY - boxH;

    const caixas = [
        { titulo: "FATURAMENTO", valor: formatarMoeda(c.faturamento), cor: COLOR_BODY },
        { titulo: "DESPESAS", valor: formatarMoeda(c.despesas), cor: COLOR_BODY },
        {
            titulo: "RESULTADO",
            valor: `${c.resultado >= 0 ? "+ " : "- "}${formatarMoeda(Math.abs(c.resultado))}`,
            cor: c.resultado >= 0 ? COLOR_GREEN : COLOR_RED,
        },
    ];

    const titSize = 7;
    const valSize = 11;

    for (let i = 0; i < 3; i++) {
        const x = MARGIN_LEFT + i * (boxW + gap);
        const b = caixas[i];
        ctx.page.drawRectangle({
            x, y: boxBottomY, width: boxW, height: boxH,
            color: COLOR_BG_SOFT,
            borderColor: COLOR_BORDER,
            borderWidth: 0.6,
        });
        ctx.page.drawText(b.titulo, {
            x: x + boxW / 2 - ctx.fontBold.widthOfTextAtSize(b.titulo, titSize) / 2,
            y: topY - 12,
            size: titSize,
            font: ctx.fontBold,
            color: COLOR_MUTED,
        });
        ctx.page.drawText(b.valor, {
            x: x + boxW / 2 - ctx.fontBold.widthOfTextAtSize(b.valor, valSize) / 2,
            y: topY - 30,
            size: valSize,
            font: ctx.fontBold,
            color: b.cor,
        });
    }
    ctx.y = boxBottomY - 6;
}

function desenharAssinatura(ctx: RenderCtx) {
    ensureSpace(ctx, 60);

    // Linha fina separadora
    ctx.page.drawLine({
        start: { x: MARGIN_LEFT, y: ctx.y - 4 },
        end: { x: MARGIN_LEFT + CONTENT_WIDTH, y: ctx.y - 4 },
        thickness: 0.4,
        color: COLOR_BORDER,
    });

    const linha1 = "Atenciosamente,";
    const linha2 = "Tática Gestão Financeira Ltda";

    const cx = MARGIN_LEFT + CONTENT_WIDTH / 2;
    ctx.page.drawText(linha1, {
        x: cx - ctx.fontItalic.widthOfTextAtSize(linha1, 10) / 2,
        y: ctx.y - 24,
        size: 10,
        font: ctx.fontItalic,
        color: COLOR_MUTED,
    });
    ctx.page.drawText(linha2, {
        x: cx - ctx.fontItalic.widthOfTextAtSize(linha2, 10) / 2,
        y: ctx.y - 38,
        size: 10,
        font: ctx.fontItalic,
        color: COLOR_MUTED,
    });
}

// ── Quebra de página ───────────────────────────────────────

function ensureSpace(ctx: RenderCtx, needed: number) {
    if (ctx.y - needed < MARGIN_BOTTOM) {
        const novaPagina = ctx.doc.addPage(A4);
        ctx.page = novaPagina;
        ctx.y = A4[1] - MARGIN_TOP;
    }
}

// ============================================================
// HELPERS
// ============================================================

function formatarMoeda(v: number): string {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 2,
    }).format(v);
}

function formatarVariacao(v: number): string {
    if (v === 0) return "—";
    const sinal = v > 0 ? "↑" : "↓";
    return `${sinal} ${formatarMoeda(Math.abs(v))}`;
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

function formatarAgoraBRT(): string {
    return new Date().toLocaleTimeString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function truncar(s: string, fnt: PDFFont, size: number, maxW: number): string {
    if (fnt.widthOfTextAtSize(s, size) <= maxW) return s;
    let out = s;
    while (out.length > 1 && fnt.widthOfTextAtSize(out + "…", size) > maxW) {
        out = out.slice(0, -1);
    }
    return out + "…";
}

function wrapText(txt: string, fnt: PDFFont, size: number, maxW: number, maxLines: number): string[] {
    const palavras = txt.split(/\s+/);
    const linhas: string[] = [];
    let atual = "";
    for (const p of palavras) {
        const candidato = atual ? `${atual} ${p}` : p;
        if (fnt.widthOfTextAtSize(candidato, size) <= maxW) {
            atual = candidato;
        } else {
            if (atual) linhas.push(atual);
            atual = p;
            if (linhas.length === maxLines - 1) {
                while (atual.length > 1 && fnt.widthOfTextAtSize(atual + "…", size) > maxW) {
                    atual = atual.slice(0, -1);
                }
                if (palavras.indexOf(p) < palavras.length - 1) atual = atual + "…";
                linhas.push(atual);
                return linhas;
            }
        }
    }
    if (atual) linhas.push(atual);
    return linhas;
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
    }
    return btoa(binary);
}
