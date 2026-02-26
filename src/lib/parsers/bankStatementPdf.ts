import * as pdfjsLib from "pdfjs-dist";

// Usar CDN para garantir carregamento correto do worker independente do ambiente
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export interface BankStatementParsedTransaction {
    date: string;
    description: string;
    amount: number;
    raw: string;
}

function parseBrlCurrency(input: string): number | null {
    const normalized = input
        .replace(/\s/g, "")
        .replace(/^[-+]?R\$/i, "")
        .replace(/R\$/gi, "")
        .replace(/\./g, "")
        .replace(",", ".");

    const sign = input.includes("-") ? -1 : 1;
    const value = Number(normalized);
    if (!Number.isFinite(value)) return null;
    return sign * value;
}

function ddmmyyyyToIsoDate(input: string): string | null {
    const m = input.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    const [, dd, mm, yyyy] = m;
    return `${yyyy}-${mm}-${dd}`;
}

function extractSegmentsByDate(text: string): string[] {
    const dateRe = /\b\d{2}\/\d{2}\/\d{4}\b/g;
    const indices: Array<{ index: number; value: string }> = [];

    for (; ;) {
        const match = dateRe.exec(text);
        if (!match) break;
        indices.push({ index: match.index, value: match[0] });
    }

    const segments: string[] = [];
    for (let i = 0; i < indices.length; i += 1) {
        const start = indices[i].index;
        const end = i + 1 < indices.length ? indices[i + 1].index : text.length;
        segments.push(text.slice(start, end).trim());
    }
    return segments;
}

export async function parseBankStatementPdf(file: File): Promise<BankStatementParsedTransaction[]> {
    console.log(`[PDF Parser] Iniciando parse do arquivo: ${file.name} (${file.size} bytes)`);

    try {
        const arrayBuffer = await file.arrayBuffer();
        console.log(`[PDF Parser] ArrayBuffer carregado. Tamanho: ${arrayBuffer.byteLength}`);

        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        console.log(`[PDF Parser] PDF carregado. Páginas: ${pdf.numPages}`);

        let fullText = "";
        for (let i = 1; i <= pdf.numPages; i += 1) {
            console.log(`[PDF Parser] Processando página ${i}...`);
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = (textContent.items as any[])
                .map((item) => String(item.str || ""))
                .join(" ");
            fullText += `${pageText}\n`;
        }
        console.log(`[PDF Parser] Texto extraído com sucesso. Tamanho: ${fullText.length} caracteres`);

        const normalized = fullText.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
        const segments = extractSegmentsByDate(normalized);
        console.log(`[PDF Parser] Segmentos encontrados: ${segments.length}`);

        const moneyRe = /-?\s*R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}/g;

        const parsed: BankStatementParsedTransaction[] = [];
        for (const seg of segments) {
            const dateMatch = seg.match(/^(\d{2}\/\d{2}\/\d{4})\b/);
            if (!dateMatch) continue;
            const isoDate = ddmmyyyyToIsoDate(dateMatch[1]);
            if (!isoDate) continue;

            const moneyMatches = [...seg.matchAll(moneyRe)];
            if (moneyMatches.length < 2) continue;

            const firstMoneyIndex = moneyMatches[0].index ?? -1;
            const lastMoney = moneyMatches[moneyMatches.length - 1];
            const lastMoneyRaw = lastMoney[0];
            const amount = parseBrlCurrency(lastMoneyRaw);
            if (!amount || !Number.isFinite(amount)) continue;

            const description = seg
                .slice(dateMatch[0].length, firstMoneyIndex)
                .replace(/\s+/g, " ")
                .trim();

            if (!description) continue;

            parsed.push({
                date: isoDate,
                description,
                amount,
                raw: seg,
            });
        }

        console.log(`[PDF Parser] Transações parseadas: ${parsed.length}`);
        return parsed;
    } catch (e) {
        console.error("[PDF Parser] Erro fatal durante o parse:", e);
        throw e;
    }
}

