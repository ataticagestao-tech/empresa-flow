
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
    // Split by <STMTTRN> markers — each block is one transaction
    const parts = text.split(/<STMTTRN>/i);
    // First part is header, skip it
    parts.shift();

    const getTag = (block: string, tag: string): string | null => {
        // Match tag value: handles both <TAG>value\n and <TAG>value</TAG>
        const regex = new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i');
        const m = regex.exec(block);
        return m ? m[1].trim() : null;
    };

    for (let i = 0; i < parts.length; i++) {
        // Trim block at next STMTTRN or end-of-list marker
        let block = parts[i];
        const endIdx = block.search(/<\/STMTTRN>|<\/BANKTRANLIST>/i);
        if (endIdx > -1) block = block.substring(0, endIdx);

        const fitId = getTag(block, 'FITID');
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

            // Generate a unique fitId: hash original fitId + date + amount + index + description
            // Many Brazilian banks use non-unique FITIDs (e.g. "CRED PIX" for all PIX credits)
            const uniqueFitId = fitId
                ? `${fitId}_${dtPosted}_${trnAmt}_${i}_${hashString(description)}`
                : `gen_${dtPosted}_${trnAmt}_${i}_${hashString(description)}`;

            transactions.push({
                fitId: uniqueFitId,
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
