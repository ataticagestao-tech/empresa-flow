// Módulo de segurança de extrato: roda verificações ANTES de lançar transações
// na conciliação. Bloqueia importações de risco (conta errada, nada novo) e sinaliza
// situações que pedem confirmação (período sobreposto, buraco de período, saldo divergente).

export type StatementSource = 'ofx' | 'pdf' | 'excel' | 'credit_card_pdf';

/** Transação normalizada para verificação — amount já com o sinal que será gravado. */
export interface NormalizedTx {
    date: string; // yyyy-MM-dd
    amount: number; // assinado (negativo = débito)
}

export type CheckStatus = 'ok' | 'warn' | 'block' | 'skip';

export interface StatementCheck {
    id: 'account' | 'duplicate' | 'gap' | 'pending' | 'balance';
    label: string;
    status: CheckStatus;
    detail: string;
}

export interface StatementSecurityReport {
    checks: StatementCheck[];
    /** Algum check exige atenção (warn/block) — abre o diálogo. */
    needsReview: boolean;
    /** Impede o lançamento por completo (conta errada ou nada novo). Sem "lançar mesmo assim". */
    hardBlock: boolean;
    total: number;
    newCount: number;
    dupCount: number;
    /** Diferença sistema − extrato (saldo de continuidade), só OFX. */
    diff: number | null;
    systemBalanceAtClose: number | null;
    /** Quando o arquivo é de outra conta: conta a que o ACCTID realmente pertence. */
    suggestedAccountId: string | null;
    suggestedAccountName: string | null;
}

export interface OfxLikeSummary {
    acctId?: string | null;
    closingBalance?: number | null;
    closingDate?: Date | null;
    periodStart?: Date | null;
    periodEnd?: Date | null;
}

export interface BankAccountMeta {
    id: string;
    name?: string;
    ofx_acctid?: string | null;
    initial_balance?: number | null;
}

interface CheckArgs {
    activeClient: any;
    companyId: string;
    bankAccountId: string;
    source: StatementSource;
    txs: NormalizedTx[];
    summary?: OfxLikeSummary | null;
    bankAcc: BankAccountMeta | null;
}

const GAP_THRESHOLD_DAYS = 7;

const amountKey = (date: string, amount: number) => `${date}|${amount.toFixed(2)}`;

const daysBetween = (a: string, b: string) => {
    const da = new Date(`${a}T00:00:00`).getTime();
    const db = new Date(`${b}T00:00:00`).getTime();
    return Math.round((db - da) / 86_400_000);
};

const fmtBRL = (v: number | null | undefined) =>
    v == null || !Number.isFinite(v)
        ? '—'
        : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const fmtDateBR = (iso: string) => {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
};

export async function checkStatement({
    activeClient,
    companyId,
    bankAccountId,
    source,
    txs,
    summary,
    bankAcc,
}: CheckArgs): Promise<StatementSecurityReport> {
    const checks: StatementCheck[] = [];
    const total = txs.length;

    const dates = txs.map((t) => t.date).filter(Boolean).sort();
    const minDate = dates[0];
    const maxDate = dates[dates.length - 1];

    let suggestedAccountId: string | null = null;
    let suggestedAccountName: string | null = null;

    // ── 1. Conta confere ────────────────────────────────────────────────
    // Só dá pra validar automaticamente no OFX (traz ACCTID). Mismatch = bloqueio duro.
    if (source === 'ofx') {
        const fileAcct = summary?.acctId || null;
        const accCadastrado = bankAcc?.ofx_acctid || null;
        if (accCadastrado && fileAcct && accCadastrado !== fileAcct) {
            let hint = '';
            const { data: matchAcc } = await activeClient
                .from('bank_accounts')
                .select('id, name, companies(nome_fantasia)')
                .eq('ofx_acctid', fileAcct)
                .limit(1)
                .maybeSingle();
            if (matchAcc) {
                const emp = matchAcc.companies?.nome_fantasia;
                suggestedAccountId = matchAcc.id;
                suggestedAccountName = emp ? `${matchAcc.name} · ${emp}` : matchAcc.name;
                hint = ` Esse extrato é da conta "${suggestedAccountName}".`;
            }
            checks.push({
                id: 'account',
                label: 'Conta do extrato',
                status: 'block',
                detail: `Este arquivo é de outra conta (nº ${fileAcct}). Você está importando em "${bankAcc?.name}".${hint}`,
            });
        } else if (!accCadastrado) {
            checks.push({
                id: 'account',
                label: 'Conta do extrato',
                status: 'skip',
                detail: 'Esta conta não tem o número do banco cadastrado, então não dá pra conferir automaticamente. Confira que é a conta certa.',
            });
        } else if (!fileAcct) {
            checks.push({
                id: 'account',
                label: 'Conta do extrato',
                status: 'skip',
                detail: 'O arquivo não traz o número da conta. Confira que é a conta certa.',
            });
        } else {
            checks.push({
                id: 'account',
                label: 'Conta do extrato',
                status: 'ok',
                detail: 'O arquivo é desta conta.',
            });
        }
    } else {
        checks.push({
            id: 'account',
            label: 'Conta do extrato',
            status: 'skip',
            detail: 'Este formato não identifica a conta automaticamente. Confira que selecionou a conta certa.',
        });
    }

    // ── 2. Período já importado (duplicidade por conteúdo) ───────────────
    // Match por (data, valor) contra o que já existe na conta dentro do período.
    // Mais confiável que fit_id (esquemas variam por formato).
    let newCount = total;
    let dupCount = 0;
    let lastDupImportedAt: string | null = null;

    if (total && minDate && maxDate) {
        const existing: any[] = [];
        const pageSize = 1000;
        let page = 0;
        while (true) {
            const { data, error } = await activeClient
                .from('bank_transactions')
                .select('date, amount, created_at')
                .eq('bank_account_id', bankAccountId)
                .gte('date', minDate)
                .lte('date', maxDate)
                .range(page * pageSize, (page + 1) * pageSize - 1);
            if (error) break;
            if (!data?.length) break;
            existing.push(...data);
            if (data.length < pageSize) break;
            page++;
            if (page > 50) break;
        }

        // Multiset das existentes por (data, valor)
        const existingCount = new Map<string, number>();
        for (const e of existing) {
            const k = amountKey(e.date, Number(e.amount || 0));
            existingCount.set(k, (existingCount.get(k) || 0) + 1);
        }
        // created_at mais recente entre as existentes que casam com o arquivo
        const matchedKeys = new Set<string>();
        const remaining = new Map(existingCount);
        let matched = 0;
        for (const tx of txs) {
            const k = amountKey(tx.date, tx.amount);
            const c = remaining.get(k) || 0;
            if (c > 0) {
                remaining.set(k, c - 1);
                matched++;
                matchedKeys.add(k);
            }
        }
        dupCount = matched;
        newCount = total - matched;
        for (const e of existing) {
            const k = amountKey(e.date, Number(e.amount || 0));
            if (matchedKeys.has(k) && e.created_at && (!lastDupImportedAt || e.created_at > lastDupImportedAt)) {
                lastDupImportedAt = e.created_at;
            }
        }
    }

    if (total === 0) {
        checks.push({ id: 'duplicate', label: 'Período já importado', status: 'block', detail: 'O arquivo não tem transações.' });
    } else if (newCount === 0) {
        const quando = lastDupImportedAt ? ` (importado em ${fmtDateBR(lastDupImportedAt.slice(0, 10))})` : '';
        checks.push({
            id: 'duplicate',
            label: 'Período já importado',
            status: 'block',
            detail: `Todas as ${total} transações deste período já existem na conta${quando}. Nada novo pra lançar.`,
        });
    } else if (dupCount > 0) {
        const quando = lastDupImportedAt ? ` em ${fmtDateBR(lastDupImportedAt.slice(0, 10))}` : '';
        checks.push({
            id: 'duplicate',
            label: 'Período já importado',
            status: 'warn',
            detail: `${dupCount} de ${total} transações já foram importadas${quando}. Lançar agora vai inserir só as ${newCount} novas.`,
        });
    } else {
        checks.push({ id: 'duplicate', label: 'Período já importado', status: 'ok', detail: `Nenhuma das ${total} transações existe ainda na conta.` });
    }

    // ── 3. Buraco de período (gap) ──────────────────────────────────────
    if (minDate) {
        const { data: lastRow } = await activeClient
            .from('bank_transactions')
            .select('date')
            .eq('bank_account_id', bankAccountId)
            .order('date', { ascending: false })
            .limit(1)
            .maybeSingle();
        const lastImported: string | null = lastRow?.date ?? null;
        if (lastImported && minDate > lastImported) {
            const gap = daysBetween(lastImported, minDate);
            if (gap > GAP_THRESHOLD_DAYS) {
                checks.push({
                    id: 'gap',
                    label: 'Continuidade do período',
                    status: 'block',
                    detail: `A última transação na conta é de ${fmtDateBR(lastImported)} e este extrato começa em ${fmtDateBR(minDate)} — ${gap} dias sem movimento. Importe o período que está faltando antes deste.`,
                });
            } else {
                checks.push({ id: 'gap', label: 'Continuidade do período', status: 'ok', detail: `Emenda com a última importação (${fmtDateBR(lastImported)}).` });
            }
        } else {
            checks.push({
                id: 'gap',
                label: 'Continuidade do período',
                status: 'ok',
                detail: lastImported ? 'Período contínuo ou sobreposto ao histórico.' : 'Primeira importação desta conta.',
            });
        }
    }

    // ── 5. Pendências de imports anteriores ─────────────────────────────
    // Transações já na conta com status 'pending' (nunca conciliadas). O ideal
    // é zerar antes de subir um período novo. Nunca bloqueia — só avisa.
    {
        const { count, error } = await activeClient
            .from('bank_transactions')
            .select('id', { count: 'exact', head: true })
            .eq('bank_account_id', bankAccountId)
            .eq('status', 'pending');
        const pending = error ? 0 : (count ?? 0);
        if (pending > 0) {
            checks.push({
                id: 'pending',
                label: 'Pendências anteriores',
                status: 'warn',
                detail: `A conta tem ${pending} transação${pending === 1 ? '' : 'ões'} de imports anteriores ainda sem conciliar. O ideal é conciliá-las antes de subir um novo período. Dá pra subir mesmo assim.`,
            });
        } else {
            checks.push({ id: 'pending', label: 'Pendências anteriores', status: 'ok', detail: 'Nenhuma transação pendente de imports anteriores.' });
        }
    }

    // ── 4. Saldo bate (continuidade) — só OFX com saldo final ────────────
    let diff: number | null = null;
    let systemBalanceAtClose: number | null = null;
    const closingBalance = summary?.closingBalance ?? null;
    const closingDate = summary?.closingDate ?? summary?.periodEnd ?? null;

    if (source === 'ofx' && closingBalance != null && closingDate) {
        const closeIso = `${closingDate.getFullYear()}-${String(closingDate.getMonth() + 1).padStart(2, '0')}-${String(closingDate.getDate()).padStart(2, '0')}`;
        const initial = Number(bankAcc?.initial_balance ?? 0);
        const { data: movs } = await activeClient
            .from('movimentacoes')
            .select('valor, tipo')
            .eq('conta_bancaria_id', bankAccountId)
            .lte('data', closeIso);
        const movSum = (movs || []).reduce((acc: number, m: any) => {
            const v = Number(m.valor ?? 0);
            return acc + (m.tipo === 'credito' ? v : -v);
        }, 0);
        systemBalanceAtClose = initial + movSum;
        diff = Number((systemBalanceAtClose - closingBalance).toFixed(2));
        if (Math.abs(diff) >= 0.01) {
            const sentido = diff > 0 ? 'a mais que o extrato' : 'a menos que o extrato';
            checks.push({
                id: 'balance',
                label: 'Saldo bate',
                status: 'warn',
                detail: `Saldo do extrato em ${fmtDateBR(closeIso)}: ${fmtBRL(closingBalance)} · sistema: ${fmtBRL(systemBalanceAtClose)} · diferença ${fmtBRL(diff)} (${sentido}). Dá pra ajustar depois de lançar.`,
            });
        } else {
            checks.push({ id: 'balance', label: 'Saldo bate', status: 'ok', detail: `Saldo do sistema bate com o extrato (${fmtBRL(closingBalance)}).` });
        }
    } else {
        checks.push({
            id: 'balance',
            label: 'Saldo bate',
            status: 'skip',
            detail: source === 'ofx' ? 'O arquivo não traz saldo final pra comparar.' : 'Este formato não traz saldo final — confira o saldo manualmente.',
        });
    }

    const hardBlock = checks.some((c) => c.status === 'block');
    const needsReview = checks.some((c) => c.status === 'warn' || c.status === 'block');

    return { checks, needsReview, hardBlock, total, newCount, dupCount, diff, systemBalanceAtClose, suggestedAccountId, suggestedAccountName };
}
