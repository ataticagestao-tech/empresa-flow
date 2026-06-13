// ============================================================
// gerar-overnight-pdf — Renderização do PDF (pura, sem IO)
// Desenha o "Overnight Financeiro" com pdf-lib. Sem Deno/Supabase:
// recebe os dados já coletados (OvernightDados) e devolve os bytes.
// Compartilhado entre a edge function (index.ts) e o preview local
// (scripts/overnight-preview).
// ============================================================

import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage, PDFImage } from "npm:pdf-lib@1.17.1";
import { OVERNIGHT_HERO_PNG_BASE64 } from "./overnight-hero-image.ts";

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
const COLOR_FAINT = rgb(0.66, 0.71, 0.78);          // cinza claro — faixa de anos

// ── Tipos compartilhados (o que o render consome) ──────────
export interface EmpresaInfo { id: string; nome: string; }
export interface VendaLinha { produto: string; forma_label: string; valor: number; }
export interface TituloComCategoria {
    categoria: string;
    descricao: string;
    vencimento: string;
    valor: number;
}
export interface Consolidado { entradas: number; saidas: number; resultado: number; }

export interface OvernightDados {
    empresa: EmpresaInfo;
    hoje_brt: Date;
    saldo_consolidado: number;
    faturamento_mes: number; // soma vendas confirmadas do mes (competencia)
    vendas_dia: VendaLinha[];
    vendas_total: number;
    contas_pagar: TituloComCategoria[];
    cp_total: number;
    contas_receber: TituloComCategoria[];
    cr_total: number;
    consolidado_dia: Consolidado;
    consolidado_mes: Consolidado;
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

export async function renderizarPdf(d: OvernightDados): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    doc.setTitle(sanitizeWinAnsi(`Overnight Financeiro — ${d.empresa.nome}`));
    doc.setProducer("Tatica Gestao Empresarial");
    doc.setCreator("Tatica Overnight");

    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique);
    const heroImg = await doc.embedPng(base64ToBytes(OVERNIGHT_HERO_PNG_BASE64));

    const page = doc.addPage(A4);
    const ctx: RenderCtx = { doc, page, font, fontBold, fontItalic, y: A4[1], pages: [page] };

    desenharHero(ctx, d, heroImg);
    ctx.y -= 9;

    ensureSpace(ctx, 110);
    desenharTituloSecao(ctx, "1.", "RESUMO EXECUTIVO — MÊS");
    desenharResumoBoxes(ctx, d);
    ctx.y -= 9;

    ensureSpace(ctx, 180);
    desenharTituloSecao(ctx, "2.", "VENDAS DO DIA");
    desenharTabelaVendas(ctx, d);
    ctx.y -= 9;

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
    ctx.y -= 9;

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
    ctx.y -= 9;

    ensureSpace(ctx, 120);
    desenharTituloSecao(ctx, "5.", "CONSOLIDADO — DIA E MÊS");
    desenharTabelaConsolidado(ctx, d);
    ctx.y -= 10;

    desenharAssinatura(ctx);
    desenharRodapesFinais(ctx);

    return await doc.save();
}

// ── Hero (banner-imagem + nome/data + faixa de anos) ───────

function desenharHero(ctx: RenderCtx, d: OvernightDados, heroImg: PDFImage) {
    // Banner (imagem) ocupando a largura inteira da página, no topo.
    // Altura limitada (leve compressão) pra sobrar espaço e caber em 1 página.
    const bannerW = A4[0];
    const scale = bannerW / heroImg.width;
    const bannerH = Math.min(heroImg.height * scale, 168);
    const topY = A4[1];
    ctx.page.drawImage(heroImg, {
        x: 0,
        y: topY - bannerH,
        width: bannerW,
        height: bannerH,
    });

    // Nome da empresa (direita, em destaque) logo abaixo do banner
    const y = topY - bannerH - 8;
    const nomeEmp = truncar(d.empresa.nome, ctx.fontBold, 12, CONTENT_WIDTH * 0.6);
    const wNome = ctx.fontBold.widthOfTextAtSize(nomeEmp, 12);
    ctx.page.drawText(nomeEmp, {
        x: A4[0] - MARGIN_RIGHT - wNome,
        y: y - 12,
        size: 12,
        font: ctx.fontBold,
        color: COLOR_HERO_BG,
    });

    // Linha abaixo: faixa de anos (esquerda) + data de referência (direita)
    const yLinha = y - 26;
    desenharFaixaAnos(ctx, yLinha);
    const dataRef = formatarDataExtensa(d.hoje_brt);
    const wData = ctx.font.widthOfTextAtSize(dataRef, 8.5);
    ctx.page.drawText(dataRef, {
        x: A4[0] - MARGIN_RIGHT - wData,
        y: yLinha,
        size: 8.5,
        font: ctx.font,
        color: COLOR_MUTED,
    });

    ctx.y = yLinha - 12;
}

// Faixa decorativa de anos (2014 … 2025) abaixo do hero, espalhada
// pela metade esquerda (a data fica à direita na mesma linha).
function desenharFaixaAnos(ctx: RenderCtx, y: number) {
    const anoIni = 2014;
    const anoFim = 2025;
    const n = anoFim - anoIni; // 11 intervalos
    const x0 = MARGIN_LEFT + 6;
    const x1 = MARGIN_LEFT + CONTENT_WIDTH * 0.6;
    const size = 7;
    for (let i = 0; i <= n; i++) {
        const ano = String(anoIni + i);
        const cx = x0 + ((x1 - x0) * i) / n;
        const w = ctx.font.widthOfTextAtSize(ano, size);
        ctx.page.drawText(ano, {
            x: cx - w / 2,
            y,
            size,
            font: ctx.font,
            color: COLOR_FAINT,
        });
    }
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
    const boxH = 50;
    const gap = 8;
    const boxW = (CONTENT_WIDTH - gap * 2) / 3;
    const topY = ctx.y;
    const bottomY = topY - boxH;

    const resultadoMes = d.faturamento_mes - d.consolidado_mes.saidas;
    const itens = [
        { titulo: "FATURAMENTO DO MÊS (vendas)", valor: formatarMoeda(d.faturamento_mes),        cor: COLOR_GREEN },
        { titulo: "DESPESAS DO MÊS (CP pagas)",  valor: formatarMoeda(d.consolidado_mes.saidas), cor: COLOR_RED },
        { titulo: "RESULTADO DO MÊS (=)",        valor: signedMoeda(resultadoMes),               cor: corResultado(resultadoMes) },
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

// ── Seção 2 — Vendas do dia (uma linha por venda) ──────────

function desenharTabelaVendas(ctx: RenderCtx, d: OvernightDados) {
    const cols = [
        { x: MARGIN_LEFT,                                w: 270, align: "left" as const },
        { x: MARGIN_LEFT + 270,                          w: 130, align: "left" as const },
        { x: MARGIN_LEFT + 400,                          w: CONTENT_WIDTH - 400, align: "right" as const },
    ];
    desenharHeaderTabela(ctx, cols, ["PRODUTO", "FORMA DE PAGAMENTO", "VALOR (R$)"]);

    if (d.vendas_dia.length === 0) {
        desenharLinhaVazia(ctx, "Nenhuma venda confirmada hoje");
    } else {
        for (const v of d.vendas_dia) {
            ensureSpace(ctx, 18);
            desenharLinhaTabela(ctx, cols, [
                truncar(v.produto, ctx.font, 9, cols[0].w - 8),
                truncar(v.forma_label, ctx.font, 9, cols[1].w - 8),
                formatarMoeda(v.valor),
            ], 16, 9, ctx.font);
        }
    }

    desenharLinhaTotal(
        ctx, cols,
        ["TOTAL DE VENDAS DO DIA", "", formatarMoeda(d.vendas_total)],
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
            ], 16, 9, ctx.font);
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
    ], 16, 9, ctx.font, COLOR_GREEN);

    desenharLinhaTabela(ctx, cols, [
        "(-) Total de Saídas",
        formatarMoeda(d.consolidado_dia.saidas),
        formatarMoeda(d.consolidado_mes.saidas),
    ], 16, 9, ctx.font, COLOR_RED);

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
    const h = 20;
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
    const h = 20;
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
    const h = 20;
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
    const h = 20;
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
    ensureSpace(ctx, 46);
    ctx.page.drawLine({
        start: { x: MARGIN_LEFT, y: ctx.y - 3 },
        end: { x: MARGIN_LEFT + CONTENT_WIDTH, y: ctx.y - 3 },
        thickness: 0.4, color: COLOR_BORDER,
    });
    ctx.page.drawText("Atenciosamente,", {
        x: MARGIN_LEFT, y: ctx.y - 17,
        size: 9.5, font: ctx.font, color: COLOR_BODY,
    });
    ctx.page.drawText("Tática Gestão Empresarial Ltda.", {
        x: MARGIN_LEFT, y: ctx.y - 29,
        size: 9.5, font: ctx.fontBold, color: COLOR_BODY,
    });
    ctx.page.drawText("contato@taticagestao.com.br  |  Varginha — MG", {
        x: MARGIN_LEFT, y: ctx.y - 41,
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

function base64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

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
    " ": " ",                       // NBSP -> espaço comum
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
