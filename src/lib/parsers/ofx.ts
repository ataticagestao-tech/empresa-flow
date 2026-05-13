
export interface OFXTransaction {
    fitId: string;
    type: 'credit' | 'debit';
    date: Date;
    amount: number;
    description: string;
    memo?: string;
}

export interface OFXSummary {
    /** Saldo final declarado pelo banco (LEDGERBAL > BALAMT) */
    closingBalance: number | null;
    /** Data do saldo final declarado (LEDGERBAL > DTASOF) */
    closingDate: Date | null;
    /** Inicio do periodo do extrato (BANKTRANLIST > DTSTART) */
    periodStart: Date | null;
    /** Fim do periodo do extrato (BANKTRANLIST > DTEND) */
    periodEnd: Date | null;
}

export interface OFXParseResult {
    transactions: OFXTransaction[];
    summary: OFXSummary;
}

function hashString(input: string): string {
    let hash = 5381;
    for (let i = 0; i < input.length; i += 1) {
        hash = (hash * 33) ^ input.charCodeAt(i);
    }
    return (hash >>> 0).toString(16);
}

function parseOfxDate(raw: string | null): Date | null {
    if (!raw) return null;
    const clean = raw.trim().substring(0, 8);
    if (clean.length < 8) return null;
    const year = parseInt(clean.substring(0, 4));
    const month = parseInt(clean.substring(4, 6)) - 1;
    const day = parseInt(clean.substring(6, 8));
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    return new Date(year, month, day);
}

export async function parseOFX(file: File): Promise<OFXTransaction[]> {
    return (await parseOFXFull(file)).transactions;
}

export async function parseOFXFull(file: File): Promise<OFXParseResult> {
    const text = await file.text();
    const transactions: OFXTransaction[] = [];

    // Support both OFX v1 (SGML, no closing tags) and v2 (XML, with closing tags)
    const parts = text.split(/<STMTTRN>/i);
    parts.shift();

    const getTag = (block: string, tag: string): string | null => {
        const regex = new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i');
        const m = regex.exec(block);
        return m ? m[1].trim() : null;
    };

    // fit_id estavel: IGNORA FITID do banco (Stone/Itau/BB rotacionam a cada download,
    // causando duplicatas ao re-importar o mesmo OFX). Usa content+indice de ocorrencia
    // dentro do mesmo (data, valor, descricao, memo) para diferenciar transacoes reais
    // de mesmo conteudo.
    const occurrenceCounter = new Map<string, number>();

    for (let i = 0; i < parts.length; i++) {
        let block = parts[i];
        const endIdx = block.search(/<\/STMTTRN>|<\/BANKTRANLIST>/i);
        if (endIdx > -1) block = block.substring(0, endIdx);

        const dtPosted = getTag(block, 'DTPOSTED');
        const trnAmt = getTag(block, 'TRNAMT');
        const name = getTag(block, 'NAME');
        const memo = getTag(block, 'MEMO');

        if (!dtPosted || !trnAmt) continue;

        try {
            const year = parseInt(dtPosted.substring(0, 4));
            const month = parseInt(dtPosted.substring(4, 6)) - 1;
            const day = parseInt(dtPosted.substring(6, 8));
            const date = new Date(year, month, day);

            const amountVal = parseFloat(trnAmt.replace(',', '.'));
            if (!Number.isFinite(amountVal)) continue;

            const type: 'credit' | 'debit' = amountVal < 0 ? 'debit' : 'credit';
            const description = name || memo || 'Transação Bancária';

            const contentKey = `${dtPosted}_${trnAmt}_${description}_${memo || ''}`;
            const occurrenceIdx = occurrenceCounter.get(contentKey) || 0;
            occurrenceCounter.set(contentKey, occurrenceIdx + 1);

            const stableFitId = `ofx_${dtPosted}_${trnAmt}_${hashString(contentKey)}_${occurrenceIdx}`;

            transactions.push({
                fitId: stableFitId,
                type,
                date,
                amount: Math.abs(amountVal),
                description,
                memo: memo || undefined
            });
        } catch (e) {
            console.warn('Error parsing OFX transaction line', e);
        }
    }

    // Extrai metadados do extrato (saldo final + periodo) para o popup de abertura
    const getOuter = (tag: string): string | null => {
        const regex = new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i');
        const m = regex.exec(text);
        return m ? m[1].trim() : null;
    };

    const closingBalanceRaw = getOuter('BALAMT');
    const closingDateRaw = getOuter('DTASOF');
    const periodStartRaw = getOuter('DTSTART');
    const periodEndRaw = getOuter('DTEND');

    const closingBalance = closingBalanceRaw != null
        ? parseFloat(closingBalanceRaw.replace(',', '.'))
        : null;

    const summary: OFXSummary = {
        closingBalance: Number.isFinite(closingBalance as number) ? (closingBalance as number) : null,
        closingDate: parseOfxDate(closingDateRaw),
        periodStart: parseOfxDate(periodStartRaw),
        periodEnd: parseOfxDate(periodEndRaw),
    };

    return { transactions, summary };
}
