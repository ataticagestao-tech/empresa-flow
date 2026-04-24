// ============================================================
// gerar-overnight-pdf — Edge Function (Deno)
// Gera o PDF "Overnight Financeiro" do dia para uma empresa.
// Usado pelo admin (preview/download) e pelo cron 18h BRT.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Layout ABNT (NBR 14724) em pontos PostScript ────────────
const A4: [number, number] = [595.28, 841.89];
const MARGIN_TOP = 85;      // 30mm
const MARGIN_LEFT = 85;     // 30mm
const MARGIN_RIGHT = 56.7;  // 20mm
const CONTENT_WIDTH = A4[0] - MARGIN_LEFT - MARGIN_RIGHT;

// ── Paleta ─────────────────────────────────────────────────
const COLOR_HEADER_BG = rgb(0.059, 0.059, 0.118);   // #0F0F1E
const COLOR_HEADER_ACCENT = rgb(0.647, 0.705, 0.969); // #A5B4FC
const COLOR_WHITE = rgb(1, 1, 1);
const COLOR_BODY = rgb(0.114, 0.161, 0.224);        // #1D2939
const COLOR_MUTED = rgb(0.408, 0.471, 0.553);       // #68748D
const COLOR_BORDER = rgb(0.89, 0.91, 0.94);
const COLOR_BG_SOFT = rgb(0.969, 0.973, 0.980);
const COLOR_RED = rgb(0.784, 0.157, 0.192);
const COLOR_AMBER = rgb(0.816, 0.471, 0.086);
const COLOR_GREEN = rgb(0.094, 0.549, 0.361);

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

    // Cliente que respeita RLS do chamador (user JWT ou service_role)
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, serviceRoleKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
    });

    // Cliente service_role puro — usado apenas para gravar overnight_logs
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

interface EmpresaInfo {
    id: string;
    nome: string;
}

interface SaldoConta {
    nome: string;
    banco: string;
    tipo: string;
    saldo_atual: number;
    variacao_hoje: number;
}

interface TituloItem {
    descricao: string;
    vencimento: string; // ISO date
    valor: number;
    status_label: string;
    status_color: "red" | "amber" | "green";
}

interface Consolidado {
    faturamento: number;
    despesas: number;
    resultado: number;
}

interface OvernightDados {
    empresa: EmpresaInfo;
    frase_noite: string;
    hoje_brt: Date;
    saldos: SaldoConta[];
    total_saldo: number;
    contas_pagar: TituloItem[];
    cp_total: number;
    cp_extras: number;
    contas_receber: TituloItem[];
    cr_total: number;
    cr_extras: number;
    consolidado: Consolidado;
}

function hojeBRT(): Date {
    // Data "agora" no fuso America/Sao_Paulo, retornada como Date em UTC meia-noite daquela data
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

    // Frase da noite
    const { data: configRow } = await client
        .from("overnight_config")
        .select("frase_noite")
        .eq("company_id", companyId)
        .maybeSingle();
    const frase_noite = configRow?.frase_noite?.trim() || "Bom fechamento de dia. Até amanhã!";

    // Saldos por conta (usa view existente)
    const { data: saldosRaw, error: saldosErr } = await client
        .from("v_saldo_contas_bancarias")
        .select("conta_bancaria_id, nome, banco, tipo, saldo_atual")
        .eq("company_id", companyId);
    if (saldosErr) throw new Error(`v_saldo_contas_bancarias: ${saldosErr.message}`);

    // Variação de hoje: soma movimentações de hoje por conta (exclui transferências)
    const { data: movsHoje, error: movsHojeErr } = await client
        .from("movimentacoes")
        .select("conta_bancaria_id, tipo, valor")
        .eq("company_id", companyId)
        .eq("data", hojeIso)
        .neq("origem", "transferencia");
    if (movsHojeErr) throw new Error(`movimentacoes (hoje): ${movsHojeErr.message}`);

    const variacaoPorConta = new Map<string, number>();
    for (const m of movsHoje ?? []) {
        const delta = m.tipo === "credito" ? Number(m.valor) : -Number(m.valor);
        variacaoPorConta.set(m.conta_bancaria_id, (variacaoPorConta.get(m.conta_bancaria_id) ?? 0) + delta);
    }

    const saldos: SaldoConta[] = (saldosRaw ?? []).map((s: any) => ({
        nome: s.nome ?? "",
        banco: s.banco ?? "",
        tipo: s.tipo ?? "",
        saldo_atual: Number(s.saldo_atual) || 0,
        variacao_hoje: variacaoPorConta.get(s.conta_bancaria_id) ?? 0,
    }));
    const total_saldo = saldos.reduce((acc, s) => acc + s.saldo_atual, 0);

    // Contas a pagar (abertas, vencendo até amanhã) — ordenadas por vencimento ASC
    const { data: cpRaw, error: cpErr } = await client
        .from("contas_pagar")
        .select("credor_nome, observacoes, valor, data_vencimento, status")
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
    const cp_total = cpTodos.reduce((acc, t) => acc + t.valor, 0);
    const contas_pagar = cpTodos.slice(0, 5);
    const cp_extras = Math.max(0, cpTodos.length - 5);

    // Contas a receber (abertas, vencendo até hoje)
    const { data: crRaw, error: crErr } = await client
        .from("contas_receber")
        .select("pagador_nome, observacoes, valor, data_vencimento, status")
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
    const cr_total = crTodos.reduce((acc, t) => acc + t.valor, 0);
    const contas_receber = crTodos.slice(0, 5);
    const cr_extras = Math.max(0, crTodos.length - 5);

    // Consolidado do mês corrente (até hoje, exclui transferências)
    const { data: movsMes, error: movsMesErr } = await client
        .from("movimentacoes")
        .select("tipo, valor")
        .eq("company_id", companyId)
        .gte("data", inicioMesIso)
        .lte("data", hojeIso)
        .neq("origem", "transferencia");
    if (movsMesErr) throw new Error(`movimentacoes (mês): ${movsMesErr.message}`);

    let faturamento = 0, despesas = 0;
    for (const m of movsMes ?? []) {
        const v = Number(m.valor) || 0;
        if (m.tipo === "credito") faturamento += v;
        else if (m.tipo === "debito") despesas += v;
    }
    const consolidado: Consolidado = {
        faturamento,
        despesas,
        resultado: faturamento - despesas,
    };

    return {
        empresa,
        frase_noite,
        hoje_brt: hoje,
        saldos,
        total_saldo,
        contas_pagar,
        cp_total,
        cp_extras,
        contas_receber,
        cr_total,
        cr_extras,
        consolidado,
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

    desenharHeader(ctx, d);
    ctx.y = A4[1] - MARGIN_TOP;

    desenharFrase(ctx, d.frase_noite);
    ctx.y -= 6;

    desenharTituloBloco(ctx, "1. Saldo Financeiro Bancário");
    desenharTabelaSaldos(ctx, d.saldos, d.total_saldo);
    ctx.y -= 14;

    desenharTituloBloco(ctx, "2. Contas a Pagar");
    desenharTabelaTitulos(ctx, d.contas_pagar, d.cp_total, d.cp_extras, "a pagar", "outros vencimentos");
    ctx.y -= 14;

    desenharTituloBloco(ctx, "3. Contas a Receber");
    desenharTabelaTitulos(ctx, d.contas_receber, d.cr_total, d.cr_extras, "a receber", "outros recebimentos");
    ctx.y -= 18;

    desenharConsolidado(ctx, d.consolidado);

    return await doc.save();
}

function desenharHeader(ctx: RenderCtx, d: OvernightDados) {
    const headerHeight = 70;
    // Faixa escura que sangra nas bordas horizontais
    ctx.page.drawRectangle({
        x: 0,
        y: A4[1] - headerHeight,
        width: A4[0],
        height: headerHeight,
        color: COLOR_HEADER_BG,
    });

    const tituloY = A4[1] - 30;
    const tituloLinha = "Overnight Financeiro";
    const empresaLinha = `  |  ${d.empresa.nome.toUpperCase()}`;

    ctx.page.drawText(tituloLinha, {
        x: MARGIN_LEFT,
        y: tituloY,
        size: 16,
        font: ctx.fontBold,
        color: COLOR_WHITE,
    });
    const tituloLargura = ctx.fontBold.widthOfTextAtSize(tituloLinha, 16);
    ctx.page.drawText(empresaLinha, {
        x: MARGIN_LEFT + tituloLargura,
        y: tituloY,
        size: 12,
        font: ctx.font,
        color: COLOR_HEADER_ACCENT,
    });

    const dataStr = formatarDataExtensa(d.hoje_brt);
    const geradoEm = formatarAgoraBRT();
    const subLinha = `${dataStr}  ·  Gerado às ${geradoEm}`;
    ctx.page.drawText(subLinha, {
        x: MARGIN_LEFT,
        y: A4[1] - 52,
        size: 9,
        font: ctx.font,
        color: COLOR_HEADER_ACCENT,
    });
}

function desenharFrase(ctx: RenderCtx, frase: string) {
    const boxHeight = 38;
    const boxY = ctx.y - boxHeight;
    ctx.page.drawRectangle({
        x: MARGIN_LEFT,
        y: boxY,
        width: CONTENT_WIDTH,
        height: boxHeight,
        color: COLOR_BG_SOFT,
        borderColor: COLOR_BORDER,
        borderWidth: 0.5,
    });

    const linhas = wrapText(frase, ctx.fontItalic, 10, CONTENT_WIDTH - 20, 2);
    const lineHeight = 13;
    const totalAltura = linhas.length * lineHeight;
    let textY = boxY + (boxHeight + totalAltura) / 2 - lineHeight + 2;
    for (const linha of linhas) {
        ctx.page.drawText(linha, {
            x: MARGIN_LEFT + 10,
            y: textY,
            size: 10,
            font: ctx.fontItalic,
            color: COLOR_BODY,
        });
        textY -= lineHeight;
    }
    ctx.y = boxY - 10;
}

function desenharTituloBloco(ctx: RenderCtx, titulo: string) {
    ctx.page.drawText(titulo, {
        x: MARGIN_LEFT,
        y: ctx.y,
        size: 11,
        font: ctx.fontBold,
        color: COLOR_BODY,
    });
    ctx.page.drawLine({
        start: { x: MARGIN_LEFT, y: ctx.y - 3 },
        end: { x: MARGIN_LEFT + CONTENT_WIDTH, y: ctx.y - 3 },
        thickness: 0.6,
        color: COLOR_BORDER,
    });
    ctx.y -= 14;
}

function desenharTabelaSaldos(ctx: RenderCtx, saldos: SaldoConta[], total: number) {
    // Colunas: Conta | Banco | Saldo Atual | Variação Hoje
    const cols = [
        { x: MARGIN_LEFT,                       w: 140, align: "left" as const },
        { x: MARGIN_LEFT + 140,                 w: 110, align: "left" as const },
        { x: MARGIN_LEFT + 250,                 w: 100, align: "right" as const },
        { x: MARGIN_LEFT + 350,                 w: CONTENT_WIDTH - 350, align: "right" as const },
    ];
    const headers = ["Conta", "Banco", "Saldo Atual", "Variação Hoje"];

    desenharHeaderTabela(ctx, cols, headers);

    const rowHeight = 14;
    if (saldos.length === 0) {
        desenharLinhaVazia(ctx, "Nenhuma conta bancária cadastrada");
    } else {
        for (const s of saldos) {
            const variacaoStr = formatarVariacao(s.variacao_hoje);
            const linha = [s.nome || "—", s.banco || "—", formatarMoeda(s.saldo_atual), variacaoStr];
            desenharLinhaTabela(ctx, cols, linha, rowHeight, 9, ctx.font);
        }
    }

    // Linha total
    desenharLinhaTotal(ctx, "Total Consolidado", formatarMoeda(total), cols);
}

function desenharTabelaTitulos(
    ctx: RenderCtx,
    itens: TituloItem[],
    total: number,
    extras: number,
    labelTotal: string,
    labelExtras: string,
) {
    // Colunas: Descrição | Vencimento | Valor | Status
    const cols = [
        { x: MARGIN_LEFT,                       w: 200, align: "left" as const },
        { x: MARGIN_LEFT + 200,                 w: 80,  align: "left" as const },
        { x: MARGIN_LEFT + 280,                 w: 80,  align: "right" as const },
        { x: MARGIN_LEFT + 360,                 w: CONTENT_WIDTH - 360, align: "right" as const },
    ];
    const headers = ["Descrição", "Vencimento", "Valor", "Status"];
    desenharHeaderTabela(ctx, cols, headers);

    const rowHeight = 14;
    if (itens.length === 0) {
        desenharLinhaVazia(ctx, `Nenhum título ${labelTotal}`);
    } else {
        for (const t of itens) {
            // Desenha descrição/vencimento/valor normais
            const linhaTexto = [
                truncar(t.descricao, ctx.font, 9, cols[0].w - 6),
                formatarDataBr(t.vencimento),
                formatarMoeda(t.valor),
                "",
            ];
            desenharLinhaTabela(ctx, cols, linhaTexto, rowHeight, 9, ctx.font);

            // Redesenha a célula de Status colorida (sobrescrevendo a última, vazia)
            const statusCor = t.status_color === "red" ? COLOR_RED :
                              t.status_color === "amber" ? COLOR_AMBER : COLOR_GREEN;
            const statusX = cols[3].x + cols[3].w -
                ctx.fontBold.widthOfTextAtSize(t.status_label, 8) - 2;
            ctx.page.drawText(t.status_label, {
                x: statusX,
                y: ctx.y + 4,
                size: 8,
                font: ctx.fontBold,
                color: statusCor,
            });
        }
    }

    // Total
    desenharLinhaTotal(ctx, `Total ${labelTotal}`, formatarMoeda(total), cols);

    // Extras
    if (extras > 0) {
        ctx.y -= 4;
        ctx.page.drawText(`+ ${extras} ${labelExtras}`, {
            x: MARGIN_LEFT,
            y: ctx.y,
            size: 8,
            font: ctx.fontItalic,
            color: COLOR_MUTED,
        });
        ctx.y -= 10;
    }
}

function desenharHeaderTabela(
    ctx: RenderCtx,
    cols: { x: number; w: number; align: "left" | "right" }[],
    headers: string[],
) {
    const h = 16;
    ctx.page.drawRectangle({
        x: MARGIN_LEFT,
        y: ctx.y - h + 4,
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
            y: ctx.y - 6,
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
            y: ctx.y + 4,
            size: fontSize,
            font: fnt,
            color: COLOR_BODY,
        });
    }
    ctx.page.drawLine({
        start: { x: MARGIN_LEFT, y: ctx.y - 1 },
        end: { x: MARGIN_LEFT + CONTENT_WIDTH, y: ctx.y - 1 },
        thickness: 0.3,
        color: COLOR_BORDER,
    });
    ctx.y -= rowHeight;
}

function desenharLinhaVazia(ctx: RenderCtx, msg: string) {
    ctx.page.drawText(msg, {
        x: MARGIN_LEFT + 2,
        y: ctx.y + 2,
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
        y: ctx.y - h + 4,
        width: CONTENT_WIDTH,
        height: h,
        color: COLOR_BG_SOFT,
    });
    ctx.page.drawText(label, {
        x: MARGIN_LEFT + 2,
        y: ctx.y - 6,
        size: 9,
        font: ctx.fontBold,
        color: COLOR_BODY,
    });
    const vSize = 9.5;
    const vWidth = ctx.fontBold.widthOfTextAtSize(valor, vSize);
    const last = cols[cols.length - 1];
    ctx.page.drawText(valor, {
        x: last.x + last.w - vWidth - 2,
        y: ctx.y - 6,
        size: vSize,
        font: ctx.fontBold,
        color: COLOR_BODY,
    });
    ctx.y -= h + 2;
}

function desenharConsolidado(ctx: RenderCtx, c: Consolidado) {
    desenharTituloBloco(ctx, "4. Consolidado Financeiro");

    const boxH = 68;
    const gap = 10;
    const boxW = (CONTENT_WIDTH - gap * 2) / 3;
    const topY = ctx.y;
    const boxBottomY = topY - boxH;

    const caixas = [
        {
            titulo: "FATURAMENTO", sub: "até agora (mês corrente)",
            valor: formatarMoeda(c.faturamento), cor: COLOR_BODY,
        },
        {
            titulo: "DESPESAS", sub: "até agora (mês corrente)",
            valor: formatarMoeda(c.despesas), cor: COLOR_BODY,
        },
        {
            titulo: "RESULTADO", sub: "até agora (mês corrente)",
            valor: `${c.resultado >= 0 ? "+ " : "- "}${formatarMoeda(Math.abs(c.resultado))}`,
            cor: c.resultado >= 0 ? COLOR_GREEN : COLOR_RED,
        },
    ];

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
            x: x + boxW / 2 - ctx.fontBold.widthOfTextAtSize(b.titulo, 8) / 2,
            y: topY - 14,
            size: 8,
            font: ctx.fontBold,
            color: COLOR_MUTED,
        });
        ctx.page.drawText(b.sub, {
            x: x + boxW / 2 - ctx.font.widthOfTextAtSize(b.sub, 7) / 2,
            y: topY - 24,
            size: 7,
            font: ctx.font,
            color: COLOR_MUTED,
        });
        ctx.page.drawText(b.valor, {
            x: x + boxW / 2 - ctx.fontBold.widthOfTextAtSize(b.valor, 14) / 2,
            y: topY - 48,
            size: 14,
            font: ctx.fontBold,
            color: b.cor,
        });
    }
    ctx.y = boxBottomY - 8;
}

// ============================================================
// HELPERS DE FORMATAÇÃO E TEXTO
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
                // última linha permitida: trunca se ainda exceder
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
