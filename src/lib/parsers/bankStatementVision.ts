// Leitor de extrato por VISÃO (Claude) — fallback do parser de texto.
//
// Quando o PDF é escaneado (sem camada de texto) ou o usuário sobe uma FOTO do
// extrato, o parser posicional (bankStatementPdf.ts) acha 0 transações. Aqui
// mandamos o arquivo pra edge function `ler-extrato`, que usa visão e devolve as
// transações já normalizadas (amount assinado, date yyyy-MM-dd).
//
// CACHE: a conciliação parseia o mesmo arquivo DUAS vezes — uma no gate de
// segurança (prepareStatement) e outra no commit (uploadPDF). Visão custa tempo
// e tokens, então memoizamos por referência do File (WeakMap) pra chamar a IA
// uma vez só. O mesmo objeto File flui do gate pro commit, então o hit é certo.

import type { BankStatementParsedTransaction } from "./bankStatementPdf";

export interface VisionStatementSummary {
    acctId: string | null;
    closingBalance: number | null;
    closingDate: string | null;
    periodStart: string | null;
    periodEnd: string | null;
}

export interface VisionStatementResult {
    transactions: BankStatementParsedTransaction[];
    summary: VisionStatementSummary;
    /** A IA cortou a resposta por limite de tokens — pode faltar transação no fim. */
    truncated: boolean;
}

// ~12 MB de arquivo bruto (base64 infla ~33%); acima disso o gateway pode recusar.
const MAX_FILE_BYTES = 12 * 1024 * 1024;

const cache = new WeakMap<File, Promise<VisionStatementResult>>();

function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            // remove o prefixo "data:...;base64,"
            const comma = result.indexOf(",");
            resolve(comma >= 0 ? result.slice(comma + 1) : result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function guessMime(file: File): string {
    if (file.type) return file.type;
    const name = file.name.toLowerCase();
    if (name.endsWith(".pdf")) return "application/pdf";
    if (name.endsWith(".png")) return "image/png";
    if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
    if (name.endsWith(".webp")) return "image/webp";
    return "image/png";
}

export function isVisionEligible(file: File): boolean {
    const mime = guessMime(file);
    return mime === "application/pdf" || mime.startsWith("image/");
}

/** Lê o extrato por visão. Resultado memoizado por referência do File. */
export function readStatementWithVision(file: File, client: any): Promise<VisionStatementResult> {
    const cached = cache.get(file);
    if (cached) return cached;

    const promise = (async (): Promise<VisionStatementResult> => {
        if (file.size > MAX_FILE_BYTES) {
            throw new Error(
                `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB) para leitura por foto. ` +
                `Envie um período menor ou um PDF/foto de até 12 MB.`,
            );
        }

        const fileBase64 = await fileToBase64(file);
        const mimeType = guessMime(file);

        const { data, error } = await client.functions.invoke("ler-extrato", {
            body: { fileBase64, mimeType },
        });
        if (error) throw new Error(error.message || "Falha ao ler o extrato por foto.");
        if (data?.error) throw new Error(data.error);

        const rawTxs: any[] = Array.isArray(data?.transactions) ? data.transactions : [];
        const transactions: BankStatementParsedTransaction[] = [];
        for (const t of rawTxs) {
            const date = typeof t?.date === "string" ? t.date : null;
            const amount = Number(t?.amount);
            if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
            if (!Number.isFinite(amount) || Math.abs(amount) < 0.01) continue;
            const description = String(t?.description ?? "").trim().substring(0, 255);
            transactions.push({ date, description, amount, raw: description || "visão" });
        }

        const summary: VisionStatementSummary = {
            acctId: data?.acctId ?? null,
            closingBalance: typeof data?.closingBalance === "number" ? data.closingBalance : null,
            closingDate: data?.closingDate ?? null,
            periodStart: data?.periodStart ?? null,
            periodEnd: data?.periodEnd ?? null,
        };

        return { transactions, summary, truncated: !!data?.truncated };
    })();

    // Se falhar, não cacheia o erro (permite retry com o mesmo arquivo).
    promise.catch(() => cache.delete(file));
    cache.set(file, promise);
    return promise;
}
