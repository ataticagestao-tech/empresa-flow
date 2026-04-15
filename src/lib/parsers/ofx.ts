
export interface OFXTransaction {
    fitId: string;
    type: 'credit' | 'debit';
    date: Date;
    amount: number;
    description: string;
    memo?: string;
}

function hashString(input: string): string {
    let hash = 5381;
    for (let i = 0; i < input.length; i += 1) {
        hash = (hash * 33) ^ input.charCodeAt(i);
    }
    return (hash >>> 0).toString(16);
}

export async function parseOFX(file: File): Promise<OFXTransaction[]> {
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

    return transactions;
}
