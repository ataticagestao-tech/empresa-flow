/**
 * Parser de fatura de cartão de crédito em PDF.
 * Extrai transações (data, descrição, valor) de faturas dos principais bancos/bandeiras.
 * Usa pdfjs-dist carregado dinamicamente para evitar crash.
 */

export interface CreditCardTransaction {
    date: string; // yyyy-MM-dd
    description: string;
    amount: number; // sempre positivo (despesa)
    installment?: string; // ex: "3/12"
    raw: string;
}

export interface CreditCardStatement {
    transactions: CreditCardTransaction[];
    totalAmount: number | null;
    dueDate: string | null; // yyyy-MM-dd
    cardLast4?: string;
}

async function loadPdfJs() {
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
    return pdfjsLib;
}

function parseBrlCurrency(input: string): number | null {
    const cleaned = input
        .replace(/\s/g, "")
        .replace(/R\$/gi, "")
        .replace(/\./g, "")
        .replace(",", ".");
    const val = parseFloat(cleaned);
    if (!Number.isFinite(val) || val <= 0) return null;
    return val;
}

function parseDateBR(raw: string): string | null {
    const m = raw.match(/(\d{2})\/(\d{2})(?:\/(\d{2,4}))?/);
    if (!m) return null;
    const dd = m[1];
    const mm = m[2];
    let yyyy = m[3];
    if (!yyyy) {
        yyyy = String(new Date().getFullYear());
    } else if (yyyy.length === 2) {
        yyyy = "20" + yyyy;
    }
    const d = parseInt(dd), mo = parseInt(mm), y = parseInt(yyyy);
    if (d < 1 || d > 31 || mo < 1 || mo > 12 || y < 2020 || y > 2040) return null;
    return `${yyyy}-${mm}-${dd}`;
}

async function extractTextByLines(file: File): Promise<string[]> {
    const pdfjsLib = await loadPdfJs();
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const allLines: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();

        const lines = new Map<number, { x: number; str: string }[]>();
        for (const item of content.items as any[]) {
            if (!item.str || !item.str.trim()) continue;
            const y = Math.round(item.transform[5]);
            const x = item.transform[4];
            if (!lines.has(y)) lines.set(y, []);
            lines.get(y)!.push({ x, str: item.str });
        }

        const sortedYs = Array.from(lines.keys()).sort((a, b) => b - a);
        for (const y of sortedYs) {
            const items = lines.get(y)!.sort((a, b) => a.x - b.x);
            allLines.push(items.map(i => i.str).join(" ").trim());
        }
    }

    return allLines;
}

export async function parseCreditCardPdf(file: File): Promise<CreditCardStatement> {
    console.log(`[CC Parser] Iniciando parse: ${file.name}`);

    const lines = await extractTextByLines(file);
    const fullText = lines.join("\n");

    console.log(`[CC Parser] ${lines.length} linhas extraídas`);

    const transactions: CreditCardTransaction[] = [];
    let totalAmount: number | null = null;
    let dueDate: string | null = null;
    let cardLast4: string | undefined;

    // Extrair vencimento da fatura
    const vencRe = /(?:vencimento|venc\.?|data\s*de\s*pagamento)\s*[:=]?\s*(\d{2}\/\d{2}\/\d{2,4})/i;
    const vencMatch = fullText.match(vencRe);
    if (vencMatch) {
        dueDate = parseDateBR(vencMatch[1]);
    }

    // Extrair total da fatura
    const totalRe = /(?:total\s*(?:da\s*)?fatura|valor\s*(?:total|da\s*fatura|a\s*pagar)|total\s*a\s*pagar)\s*[:=]?\s*R?\$?\s*([\d.,]+)/i;
    const totalMatch = fullText.match(totalRe);
    if (totalMatch) {
        totalAmount = parseBrlCurrency(totalMatch[1]);
    }

    // Extrair últimos 4 dígitos do cartão
    const cardRe = /(?:cart[aã]o|final|terminado\s*em)\s*[:=]?\s*\*{0,4}\s*(\d{4})/i;
    const cardMatch = fullText.match(cardRe);
    if (cardMatch) {
        cardLast4 = cardMatch[1];
    }

    // Padrão principal: DD/MM  DESCRIÇÃO  VALOR
    // Faturas geralmente têm: data (dd/mm), descrição, parcela opcional, valor
    const txLineRe = /^(\d{2}\/\d{2}(?:\/\d{2,4})?)\s+(.+?)\s+([\d.,]+)\s*$/;
    const txLineRe2 = /(\d{2}\/\d{2}(?:\/\d{2,4})?)\s+(.+?)\s+R?\$?\s*([\d]{1,3}(?:\.\d{3})*,\d{2})/;

    for (const line of lines) {
        // Ignorar linhas de cabeçalho/resumo
        if (/total|saldo|pagamento|cr[eé]dito|anterior|encargos|juros|iof|anuidade/i.test(line) &&
            !/parcela|parc\./i.test(line)) continue;

        let date: string | null = null;
        let description = "";
        let amount: number | null = null;
        let installment: string | undefined;

        // Tentar padrão 1: DD/MM DESCRIÇÃO VALOR
        let match = line.match(txLineRe) || line.match(txLineRe2);
        if (match) {
            date = parseDateBR(match[1]);
            description = match[2].trim();
            amount = parseBrlCurrency(match[3]);
        }

        if (!date || !amount) continue;

        // Extrair parcela se existir (ex: "PARCELA 3/12" ou "3/12" ou "PARC 03/12")
        const parcMatch = description.match(/(?:parcela|parc\.?)\s*(\d{1,2}\/\d{1,2})/i)
            || description.match(/\b(\d{1,2}\/\d{1,2})\s*$/);
        if (parcMatch) {
            const [num, den] = parcMatch[1].split("/");
            if (parseInt(num) <= parseInt(den) && parseInt(den) <= 48) {
                installment = parcMatch[1];
                description = description.replace(parcMatch[0], "").trim();
            }
        }

        // Limpar descrição
        description = description
            .replace(/\s{2,}/g, " ")
            .replace(/[-–—]+$/, "")
            .trim();

        if (description.length < 2) continue;

        transactions.push({
            date,
            description,
            amount: Math.abs(amount),
            installment,
            raw: line,
        });
    }

    console.log(`[CC Parser] ${transactions.length} transações encontradas, total: ${totalAmount}`);

    return {
        transactions,
        totalAmount,
        dueDate,
        cardLast4,
    };
}
