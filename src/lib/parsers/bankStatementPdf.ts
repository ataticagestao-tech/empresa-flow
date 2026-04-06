import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export interface BankStatementParsedTransaction {
    date: string;
    description: string;
    amount: number;
    raw: string;
}

// ─── Helpers ────────────────────────────────────────────────

interface TextItem {
    str: string;
    x: number;
    y: number;
}

/** Agrupa items de texto por coordenada Y (mesma linha visual) */
function groupIntoLines(items: TextItem[], tolerance = 3): TextItem[][] {
    if (!items.length) return [];
    // PDF: y cresce de baixo pra cima — ordenar y DESC = topo-primeiro
    const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
    const lines: TextItem[][] = [];
    let line: TextItem[] = [sorted[0]];
    let lineY = sorted[0].y;

    for (let i = 1; i < sorted.length; i++) {
        if (Math.abs(sorted[i].y - lineY) <= tolerance) {
            line.push(sorted[i]);
        } else {
            lines.push(line.sort((a, b) => a.x - b.x));
            line = [sorted[i]];
            lineY = sorted[i].y;
        }
    }
    lines.push(line.sort((a, b) => a.x - b.x));
    return lines;
}

/** Detecta o ano do extrato a partir do texto (ex: "jan 2026", "01/2026") */
function detectYear(text: string): number {
    const monthYear = text.match(
        /\b(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\w*\s+(\d{4})/i
    );
    if (monthYear) return parseInt(monthYear[1]);

    const mmyyyy = text.match(/\b(\d{2})\/(\d{4})\b/);
    if (mmyyyy) return parseInt(mmyyyy[2]);

    return new Date().getFullYear();
}

/** Detecta o mês do extrato (1-12) */
function detectMonth(text: string): number | null {
    const months: Record<string, number> = {
        jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
        jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
    };
    const match = text.match(
        /\b(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\w*/i
    );
    if (match) return months[match[1].toLowerCase().substring(0, 3)] || null;

    const mmyyyy = text.match(/\b(\d{2})\/(\d{4})\b/);
    if (mmyyyy) return parseInt(mmyyyy[1]);

    return null;
}

/**
 * Parse valor BRL — suporta:
 *   R$ 1.234,56  |  1.234,56  |  10.540,39-  |  -R$ 500,00
 */
function parseBrlAmount(input: string): number | null {
    let str = input.trim();
    const trailingMinus = str.endsWith("-");
    if (trailingMinus) str = str.slice(0, -1);
    const leadingMinus = str.startsWith("-");
    if (leadingMinus) str = str.slice(1);
    str = str.replace(/R\$\s*/gi, "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
    const value = parseFloat(str);
    if (!Number.isFinite(value)) return null;
    return (trailingMinus || leadingMinus) ? -Math.abs(value) : value;
}

// Valor numérico no formato brasileiro: 1.234,56  ou  1.234,56-
const VALUE_RE = /^\d{1,3}(?:\.\d{3})*,\d{2}-?$/;
// Data curta DD/MM (Itaú, Bradesco, etc.)
const DATE_SHORT_RE = /^(\d{2})\/(\d{2})$/;
// Data completa DD/MM/YYYY
const DATE_FULL_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/** Linhas de saldo/totalizador — não são transações */
const SKIP_RE = [
    /^saldo\s+(anterior|aplic|em|final|do\s+dia)/i,
    /^totalizador/i,
    /^total\b/i,
];
function shouldSkip(desc: string): boolean {
    return SKIP_RE.some((r) => r.test(desc.trim()));
}

/** Headers de tabela para ignorar */
const HEADER_TOKENS = new Set([
    "r$", "entradas", "saídas", "saidas", "saldo", "(créditos)", "(creditos)",
    "(débitos)", "(debitos)", "data", "descrição", "descricao",
]);
function isHeaderToken(s: string): boolean {
    return HEADER_TOKENS.has(s.toLowerCase().trim());
}

/** Detecta se estamos na seção de transações reais */
function isEndOfMovimentacao(lineText: string): boolean {
    const lower = lineText.toLowerCase();
    return (
        lower.includes("aplicações automáticas") ||
        lower.includes("aplicacoes automaticas") ||
        lower.includes("débitos automáticos") ||
        lower.includes("debitos automaticos") ||
        lower.includes("cheque especial") ||
        lower.includes("notas explicativas") ||
        lower.includes("totalizador de aplicações") ||
        lower.includes("totalizador de aplicacoes")
    );
}

// ─── Parser Principal (posição) ─────────────────────────────

export async function parseBankStatementPdf(
    file: File
): Promise<BankStatementParsedTransaction[]> {
    console.log(`[PDF Parser] Iniciando parse: ${file.name} (${file.size} bytes)`);

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    console.log(`[PDF Parser] Páginas: ${pdf.numPages}`);

    // 1ª passada: extrair items com posição + texto completo p/ detectar ano
    let fullText = "";
    const allPageItems: TextItem[][] = [];

    for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        const items: TextItem[] = [];
        for (const item of content.items as any[]) {
            const str = String(item.str || "").trim();
            if (!str) continue;
            fullText += str + " ";
            items.push({ str, x: item.transform[4], y: item.transform[5] });
        }
        allPageItems.push(items);
    }

    const year = detectYear(fullText);
    const stmtMonth = detectMonth(fullText);
    console.log(`[PDF Parser] Ano detectado: ${year}, mês: ${stmtMonth}`);

    // 2ª passada: parsing por posição (linhas)
    const parsed: BankStatementParsedTransaction[] = [];
    let currentDate: string | null = null;
    let dateColumnX: number | null = null; // x-position da coluna "data"
    let inMovimentacao = false;
    let finishedMovimentacao = false;

    for (const pageItems of allPageItems) {
        const lines = groupIntoLines(pageItems);

        for (const lineItems of lines) {
            const lineText = lineItems.map((i) => i.str).join(" ");

            // Detectar início da seção "Movimentação"
            if (lineText.toLowerCase().includes("movimentação") || lineText.toLowerCase().includes("movimentacao")) {
                inMovimentacao = true;
                continue;
            }

            // Detectar fim da seção de transações
            if (inMovimentacao && isEndOfMovimentacao(lineText)) {
                inMovimentacao = false;
                finishedMovimentacao = true;
                continue;
            }

            // Se já passou pela Movimentação e saiu, não parsear mais
            if (finishedMovimentacao) continue;

            // Checar se a primeira coluna é uma data
            const first = lineItems[0];
            let lineDate: string | null = null;

            const fullMatch = first.str.match(DATE_FULL_RE);
            const shortMatch = first.str.match(DATE_SHORT_RE);

            if (fullMatch) {
                const [, dd, mm, yyyy] = fullMatch;
                const d = parseInt(dd), m = parseInt(mm);
                if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
                    if (dateColumnX === null || Math.abs(first.x - dateColumnX) < 50) {
                        lineDate = `${yyyy}-${mm}-${dd}`;
                        if (dateColumnX === null) dateColumnX = first.x;
                    }
                }
            } else if (shortMatch) {
                const [, dd, mm] = shortMatch;
                const d = parseInt(dd), m = parseInt(mm);
                if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
                    if (dateColumnX === null || Math.abs(first.x - dateColumnX) < 50) {
                        let dateYear = year;
                        // Datas de mês anterior (ex: 30/12 num extrato de jan)
                        if (stmtMonth && m > stmtMonth) dateYear = year - 1;
                        lineDate = `${dateYear}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                        if (dateColumnX === null) dateColumnX = first.x;
                    }
                }
            }

            if (lineDate) currentDate = lineDate;
            if (!currentDate) continue;

            // Separar descrição e valores
            const startIdx = lineDate ? 1 : 0;
            const descParts: string[] = [];
            const values: number[] = [];

            for (let i = startIdx; i < lineItems.length; i++) {
                const s = lineItems[i].str;
                if (VALUE_RE.test(s)) {
                    const v = parseBrlAmount(s);
                    if (v !== null) values.push(v);
                } else if (isHeaderToken(s)) {
                    continue;
                } else {
                    descParts.push(s);
                }
            }

            const description = descParts.join(" ").trim();
            if (!description || shouldSkip(description)) continue;

            // Linhas de tabela CDB/investimentos têm muitos valores por linha
            if (values.length === 0 || values.length > 3) continue;

            // Primeiro valor = transação, último valor (se 2+) = saldo (ignorar)
            const amount = values[0];
            if (!Number.isFinite(amount) || Math.abs(amount) < 0.01) continue;

            parsed.push({
                date: currentDate,
                description: description.substring(0, 255),
                amount,
                raw: lineText,
            });
        }
    }

    console.log(`[PDF Parser] Transações (posição): ${parsed.length}`);
    if (parsed.length > 0) return parsed;

    // ─── Fallback: parser texto genérico (R$ prefix) ────────
    console.log("[PDF Parser] Fallback para parser texto genérico...");
    return fallbackTextParse(fullText);
}

// ─── Parser Fallback (texto puro, formato com R$) ───────────

function fallbackTextParse(fullText: string): BankStatementParsedTransaction[] {
    const normalized = fullText.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

    // Separar segmentos por data DD/MM/YYYY
    const dateRe = /\b\d{2}\/\d{2}\/\d{4}\b/g;
    const indices: { index: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = dateRe.exec(normalized)) !== null) {
        indices.push({ index: m.index });
    }

    const moneyRe = /-?\s*R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}/g;
    const parsed: BankStatementParsedTransaction[] = [];

    for (let i = 0; i < indices.length; i++) {
        const start = indices[i].index;
        const end = i + 1 < indices.length ? indices[i + 1].index : normalized.length;
        const seg = normalized.slice(start, end).trim();

        const dm = seg.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
        if (!dm) continue;
        const isoDate = `${dm[3]}-${dm[2]}-${dm[1]}`;

        const moneyMatches = [...seg.matchAll(moneyRe)];
        if (!moneyMatches.length) continue;

        const firstMoney = moneyMatches[0];
        const amount = parseBrlAmount(firstMoney[0]);
        if (!amount || !Number.isFinite(amount)) continue;

        const description = seg
            .slice(dm[0].length, firstMoney.index ?? 0)
            .replace(/\s+/g, " ")
            .trim();
        if (!description) continue;

        parsed.push({ date: isoDate, description, amount, raw: seg });
    }

    console.log(`[PDF Parser] Transações (fallback): ${parsed.length}`);
    return parsed;
}
