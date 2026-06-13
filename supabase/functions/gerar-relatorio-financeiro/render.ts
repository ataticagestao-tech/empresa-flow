// ============================================================
// gerar-relatorio-financeiro — Renderização do PDF (pura, sem IO)
// Renderizador GENÉRICO de relatórios financeiros tabulares, no mesmo
// visual do Overnight (header navy, barra verde de seção, cabeçalho de
// tabela navy, linha de total). Recebe um RelatorioPDF já montado pela
// edge function (index.ts) e devolve os bytes do PDF.
// ============================================================

import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "npm:pdf-lib@1.17.1";

// ── Layout A4 ──────────────────────────────────────────────
const A4: [number, number] = [595.28, 841.89];
const MARGIN_TOP = 40;
const MARGIN_BOTTOM = 50;
const MARGIN_LEFT = 50;
const MARGIN_RIGHT = 50;
const CONTENT_WIDTH = A4[0] - MARGIN_LEFT - MARGIN_RIGHT;

// ── Paleta (igual ao Overnight) ────────────────────────────
const COLOR_NAVY = rgb(0.118, 0.235, 0.471); // #1E3C78
const COLOR_ACCENT = rgb(0.357, 0.745, 0.502); // #5BBE80 verde claro Tática
const COLOR_WHITE = rgb(1, 1, 1);
const COLOR_NAVY_SOFT = rgb(0.8, 0.85, 0.92);
const COLOR_BODY = rgb(0.114, 0.161, 0.224);
const COLOR_MUTED = rgb(0.408, 0.471, 0.553);
const COLOR_BORDER = rgb(0.85, 0.87, 0.91);
const COLOR_BG_TOTAL = rgb(0.918, 0.945, 0.969);
const COLOR_BG_SOFT = rgb(0.953, 0.961, 0.973);
const COLOR_GREEN = rgb(0.094, 0.549, 0.361);
const COLOR_RED = rgb(0.784, 0.157, 0.192);

// ── Tipos que o render consome ─────────────────────────────
export type Align = "left" | "right" | "center";
export type CorCelula = "green" | "red" | "body" | "muted";
export type Celula = string | { text: string; cor?: CorCelula; bold?: boolean };

export interface Coluna {
    header: string;
    flex: number;
    align?: Align;
}

export interface Secao {
    titulo: string;
    colunas: Coluna[];
    linhas: Celula[][];
    total?: Celula[];
    msgVazio?: string;
}

export interface ResumoBox {
    label: string;
    valor: string;
    cor?: CorCelula;
}

export interface RelatorioPDF {
    empresa_nome: string;
    titulo: string;
    periodo_label: string;
    resumo_boxes?: ResumoBox[];
    secoes: Secao[];
}

interface RenderCtx {
    doc: PDFDocument;
    page: PDFPage;
    font: PDFFont;
    fontBold: PDFFont;
    fontItalic: PDFFont;
    y: number;
    pages: PDFPage[];
}

// ============================================================
// ENTRY
// ============================================================
export async function renderRelatorio(d: RelatorioPDF): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    doc.setTitle(sanitizeWinAnsi(`${d.titulo} — ${d.empresa_nome}`));
    doc.setProducer("Tatica Gestao Empresarial");
    doc.setCreator("Tatica Gestao");

    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique);

    const page = doc.addPage(A4);
    const ctx: RenderCtx = { doc, page, font, fontBold, fontItalic, y: A4[1], pages: [page] };

    desenharHeader(ctx, d);
    ctx.y -= 6;

    if (d.resumo_boxes && d.resumo_boxes.length > 0) {
        ensureSpace(ctx, 70);
        desenharResumoBoxes(ctx, d.resumo_boxes);
        ctx.y -= 10;
    }

    let n = 1;
    for (const sec of d.secoes) {
        ensureSpace(ctx, 80);
        desenharTituloSecao(ctx, `${n}.`, sec.titulo);
        desenharTabela(ctx, sec);
        ctx.y -= 12;
        n++;
    }

    desenharAssinatura(ctx);
    desenharRodapesFinais(ctx);

    return await doc.save();
}

// ── Header (faixa navy com título + empresa + período) ─────
function desenharHeader(ctx: RenderCtx, d: RelatorioPDF) {
    const h = 78;
    const top = A4[1];
    ctx.page.drawRectangle({ x: 0, y: top - h, width: A4[0], height: h, color: COLOR_NAVY });

    ctx.page.drawText("TÁTICA GESTÃO", {
        x: MARGIN_LEFT, y: top - 24, size: 9, font: ctx.fontBold, color: COLOR_ACCENT,
    });
    ctx.page.drawText(truncar(d.titulo, ctx.fontBold, 16, CONTENT_WIDTH), {
        x: MARGIN_LEFT, y: top - 47, size: 16, font: ctx.fontBold, color: COLOR_WHITE,
    });
    ctx.page.drawText(truncar(d.periodo_label, ctx.font, 9.5, CONTENT_WIDTH * 0.6), {
        x: MARGIN_LEFT, y: top - 63, size: 9.5, font: ctx.font, color: COLOR_NAVY_SOFT,
    });

    // Nome da empresa (direita)
    const nome = truncar(d.empresa_nome, ctx.fontBold, 11, CONTENT_WIDTH * 0.45);
    const w = ctx.fontBold.widthOfTextAtSize(nome, 11);
    ctx.page.drawText(nome, {
        x: A4[0] - MARGIN_RIGHT - w, y: top - 47, size: 11, font: ctx.fontBold, color: COLOR_WHITE,
    });

    ctx.y = top - h - 16;
}

// ── Resumo (até 3 boxes) ───────────────────────────────────
function desenharResumoBoxes(ctx: RenderCtx, boxes: ResumoBox[]) {
    const itens = boxes.slice(0, 3);
    const cols = itens.length;
    const boxH = 50;
    const gap = 8;
    const boxW = (CONTENT_WIDTH - gap * (cols - 1)) / cols;
    const topY = ctx.y;
    const bottomY = topY - boxH;

    for (let i = 0; i < cols; i++) {
        const x = MARGIN_LEFT + i * (boxW + gap);
        const it = itens[i];
        ctx.page.drawRectangle({
            x, y: bottomY, width: boxW, height: boxH,
            color: COLOR_BG_SOFT, borderColor: COLOR_BORDER, borderWidth: 0.6,
        });
        ctx.page.drawText(truncar(it.label.toUpperCase(), ctx.fontBold, 7.5, boxW - 16), {
            x: x + 10, y: topY - 14, size: 7.5, font: ctx.fontBold, color: COLOR_MUTED,
        });
        ctx.page.drawText(truncar(it.valor, ctx.fontBold, 14, boxW - 16), {
            x: x + 10, y: topY - 38, size: 14, font: ctx.fontBold, color: corOf(it.cor),
        });
    }
    ctx.y = bottomY - 4;
}

// ── Título de seção (barra verde + numeração + texto) ──────
function desenharTituloSecao(ctx: RenderCtx, num: string, titulo: string) {
    const barH = 14;
    const barW = 4;
    ctx.page.drawRectangle({ x: MARGIN_LEFT, y: ctx.y - barH - 1, width: barW, height: barH, color: COLOR_GREEN });
    ctx.page.drawText(`${num}  ${sanitizeWinAnsi(titulo)}`, {
        x: MARGIN_LEFT + barW + 8, y: ctx.y - barH + 2, size: 11, font: ctx.fontBold, color: COLOR_BODY,
    });
    ctx.y -= barH + 8;
}

// ── Tabela genérica ────────────────────────────────────────
function desenharTabela(ctx: RenderCtx, sec: Secao) {
    const cols = layout(sec.colunas);
    desenharHeaderTabela(ctx, cols, sec.colunas.map((c) => c.header));

    if (sec.linhas.length === 0) {
        desenharLinhaVazia(ctx, sec.msgVazio ?? "Nenhum registro no período");
    } else {
        for (const linha of sec.linhas) {
            ensureSpace(ctx, 17);
            desenharLinha(ctx, cols, linha, ctx.font, 9);
        }
    }

    if (sec.total) {
        ensureSpace(ctx, 20);
        desenharLinhaTotal(ctx, cols, sec.total);
    }
}

interface ColBox { x: number; w: number; align: Align }

function layout(colunas: Coluna[]): ColBox[] {
    const totalFlex = colunas.reduce((a, c) => a + c.flex, 0) || 1;
    let x = MARGIN_LEFT;
    const out: ColBox[] = [];
    for (const c of colunas) {
        const w = CONTENT_WIDTH * (c.flex / totalFlex);
        out.push({ x, w, align: c.align ?? "left" });
        x += w;
    }
    return out;
}

function desenharHeaderTabela(ctx: RenderCtx, cols: ColBox[], headers: string[]) {
    const h = 20;
    ctx.page.drawRectangle({ x: MARGIN_LEFT, y: ctx.y - h, width: CONTENT_WIDTH, height: h, color: COLOR_NAVY });
    for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        const label = truncar(headers[i] ?? "", ctx.fontBold, 8, c.w - 12);
        const labelW = ctx.fontBold.widthOfTextAtSize(label, 8);
        const tx = c.align === "right" ? c.x + c.w - labelW - 8 : c.align === "center" ? c.x + (c.w - labelW) / 2 : c.x + 8;
        ctx.page.drawText(label, { x: tx, y: ctx.y - 14, size: 8, font: ctx.fontBold, color: COLOR_WHITE });
    }
    ctx.y -= h;
}

function desenharLinha(ctx: RenderCtx, cols: ColBox[], valores: Celula[], fontPad: PDFFont, fontSize: number) {
    const rowH = 16;
    for (let i = 0; i < cols.length; i++) {
        const cel = valores[i];
        if (cel === undefined || cel === null) continue;
        const txt = typeof cel === "string" ? cel : cel.text;
        if (!txt) continue;
        const c = cols[i];
        const fnt = typeof cel !== "string" && cel.bold ? ctx.fontBold : fontPad;
        const cor = typeof cel === "string" ? COLOR_BODY : corOf(cel.cor);
        const safe = truncar(txt, fnt, fontSize, c.w - 10);
        const vw = fnt.widthOfTextAtSize(safe, fontSize);
        const tx = c.align === "right" ? c.x + c.w - vw - 8 : c.align === "center" ? c.x + (c.w - vw) / 2 : c.x + 8;
        ctx.page.drawText(safe, { x: tx, y: ctx.y - rowH + 6, size: fontSize, font: fnt, color: cor });
    }
    ctx.page.drawLine({
        start: { x: MARGIN_LEFT, y: ctx.y - rowH },
        end: { x: MARGIN_LEFT + CONTENT_WIDTH, y: ctx.y - rowH },
        thickness: 0.3, color: COLOR_BORDER,
    });
    ctx.y -= rowH;
}

function desenharLinhaTotal(ctx: RenderCtx, cols: ColBox[], valores: Celula[]) {
    const h = 20;
    ctx.page.drawRectangle({ x: MARGIN_LEFT, y: ctx.y - h, width: CONTENT_WIDTH, height: h, color: COLOR_BG_TOTAL });
    for (let i = 0; i < cols.length; i++) {
        const cel = valores[i];
        if (cel === undefined || cel === null) continue;
        const txt = typeof cel === "string" ? cel : cel.text;
        if (!txt) continue;
        const c = cols[i];
        const cor = typeof cel === "string" ? COLOR_BODY : corOf(cel.cor);
        const size = 9.5;
        const safe = truncar(txt, ctx.fontBold, size, c.w - 10);
        const vw = ctx.fontBold.widthOfTextAtSize(safe, size);
        const tx = c.align === "right" ? c.x + c.w - vw - 8 : c.align === "center" ? c.x + (c.w - vw) / 2 : c.x + 8;
        ctx.page.drawText(safe, { x: tx, y: ctx.y - 14, size, font: ctx.fontBold, color: cor });
    }
    ctx.y -= h;
}

function desenharLinhaVazia(ctx: RenderCtx, msg: string) {
    const h = 20;
    ctx.page.drawText(sanitizeWinAnsi(msg), {
        x: MARGIN_LEFT + 10, y: ctx.y - 14, size: 9, font: ctx.fontItalic, color: COLOR_MUTED,
    });
    ctx.page.drawLine({
        start: { x: MARGIN_LEFT, y: ctx.y - h },
        end: { x: MARGIN_LEFT + CONTENT_WIDTH, y: ctx.y - h },
        thickness: 0.3, color: COLOR_BORDER,
    });
    ctx.y -= h;
}

function desenharAssinatura(ctx: RenderCtx) {
    ensureSpace(ctx, 40);
    ctx.page.drawLine({
        start: { x: MARGIN_LEFT, y: ctx.y - 3 }, end: { x: MARGIN_LEFT + CONTENT_WIDTH, y: ctx.y - 3 },
        thickness: 0.4, color: COLOR_BORDER,
    });
    ctx.page.drawText("Tática Gestão Empresarial Ltda.", {
        x: MARGIN_LEFT, y: ctx.y - 17, size: 9, font: ctx.fontBold, color: COLOR_BODY,
    });
    ctx.page.drawText("contato@taticagestao.com.br  |  Varginha — MG", {
        x: MARGIN_LEFT, y: ctx.y - 29, size: 8, font: ctx.font, color: COLOR_MUTED,
    });
}

function desenharRodapesFinais(ctx: RenderCtx) {
    const total = ctx.pages.length;
    for (let i = 0; i < total; i++) {
        const p = ctx.pages[i];
        p.drawLine({
            start: { x: MARGIN_LEFT, y: 35 }, end: { x: A4[0] - MARGIN_RIGHT, y: 35 },
            thickness: 0.3, color: COLOR_BORDER,
        });
        p.drawText("Tática Gestão Empresarial Ltda.", {
            x: MARGIN_LEFT, y: 22, size: 7.5, font: ctx.fontBold, color: COLOR_BODY,
        });
        p.drawText("  |  Documento confidencial — uso restrito do destinatário", {
            x: MARGIN_LEFT + ctx.fontBold.widthOfTextAtSize("Tática Gestão Empresarial Ltda.", 7.5),
            y: 22, size: 7.5, font: ctx.font, color: COLOR_MUTED,
        });
        const pagText = `Página ${i + 1} de ${total}`;
        const w = ctx.font.widthOfTextAtSize(pagText, 7.5);
        p.drawText(pagText, { x: A4[0] - MARGIN_RIGHT - w, y: 22, size: 7.5, font: ctx.font, color: COLOR_MUTED });
    }
}

function ensureSpace(ctx: RenderCtx, needed: number) {
    if (ctx.y - needed < MARGIN_BOTTOM) {
        const nova = ctx.doc.addPage(A4);
        ctx.page = nova;
        ctx.pages.push(nova);
        ctx.y = A4[1] - MARGIN_TOP;
    }
}

// ── helpers ────────────────────────────────────────────────
function corOf(c?: CorCelula) {
    if (c === "green") return COLOR_GREEN;
    if (c === "red") return COLOR_RED;
    if (c === "muted") return COLOR_MUTED;
    return COLOR_BODY;
}

function truncar(s: string, fnt: PDFFont, size: number, maxW: number): string {
    const safe = sanitizeWinAnsi(s);
    if (fnt.widthOfTextAtSize(safe, size) <= maxW) return safe;
    let out = safe;
    while (out.length > 1 && fnt.widthOfTextAtSize(out + "…", size) > maxW) out = out.slice(0, -1);
    return out + "…";
}

const TRANSLIT: Record<string, string> = {
    "−": "-", "–": "-", "—": "-",
    "→": "->", "←": "<-", "↑": "^", "↓": "v",
    "≤": "<=", "≥": ">=", "≠": "!=", "≈": "~",
    "•": "-", "·": "-",
    "“": '"', "”": '"', "‘": "'", "’": "'",
    " ": " ",
};

function sanitizeWinAnsi(s: string | null | undefined): string {
    if (!s) return "";
    let out = "";
    for (const ch of s) {
        if (TRANSLIT[ch] !== undefined) { out += TRANSLIT[ch]; continue; }
        const code = ch.charCodeAt(0);
        if (code >= 0x20 && code <= 0x7E) { out += ch; continue; }
        if (code >= 0xA0 && code <= 0xFF) { out += ch; continue; }
        if ("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ".includes(ch)) { out += ch; continue; }
        out += "?";
    }
    return out;
}
