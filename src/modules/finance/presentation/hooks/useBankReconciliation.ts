
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext"; // Assumindo isso
import { parseOFX } from "@/lib/parsers/ofx";
import { format } from "date-fns";
import { BankTransaction } from "../../domain/schemas/bank-reconciliation.schema";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { parseBankStatementPdf } from "@/lib/parsers/bankStatementPdf";
import { parseCreditCardPdf } from "@/lib/parsers/creditCardPdf";

// Interface unificada para transações do sistema (Pagar e Receber)
export interface SystemTransaction {
    id: string;
    type: 'payable' | 'receivable';
    description: string;
    amount: number;
    date: string; // Vencimento
    status: string;
    entity_name?: string; // Nome do fornecedor ou cliente
    original_table_id: string; // ID na tabela original
}

function hashString(input: string): string {
    let hash = 5381;
    for (let i = 0; i < input.length; i += 1) {
        hash = (hash * 33) ^ input.charCodeAt(i);
    }
    return (hash >>> 0).toString(16);
}

export function useBankReconciliation(bankAccountId?: string, companyIdOverride?: string) {
    const { selectedCompany } = useCompany();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { activeClient, user } = useAuth();
    const companyId = companyIdOverride || selectedCompany?.id;

    // 1. Buscar Transações Bancárias Pendentes
    const { data: bankTransactions, isLoading: isLoadingBankTx } = useQuery({
        queryKey: ['bank_transactions_pending', bankAccountId],
        queryFn: async () => {
            if (!bankAccountId) return [];
            // Supabase limita 1000 por request — paginar para buscar tudo
            const pageSize = 1000;
            let allData: any[] = [];
            let page = 0;
            while (true) {
                const { data, error } = await (activeClient as any)
                    .from('bank_transactions')
                    .select('id, bank_account_id, company_id, date, amount, description, memo, fit_id, status, reconciled_payable_id, reconciled_receivable_id, created_at, updated_at, source, unidade_destino_id')
                    .eq('bank_account_id', bankAccountId)
                    .eq('status', 'pending')
                    .order('date', { ascending: true })
                    .range(page * pageSize, (page + 1) * pageSize - 1);
                if (error) throw error;
                if (!data || data.length === 0) break;
                allData = allData.concat(data);
                if (data.length < pageSize) break;
                page++;
            }
            // Ordenar mais recentes primeiro
            allData.sort((a: any, b: any) => b.date.localeCompare(a.date));
            return allData as BankTransaction[];
        },
        enabled: !!bankAccountId
    });

    const { data: statementFiles } = useQuery({
        queryKey: ['bank_statement_files', companyId, bankAccountId],
        queryFn: async () => {
            if (!companyId || !bankAccountId) return [];
            const { data, error } = await (activeClient as any)
                .from('bank_statement_files')
                .select('*')
                .eq('company_id', companyId)
                .eq('bank_account_id', bankAccountId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data as any[];
        },
        enabled: !!companyId && !!bankAccountId,
    });

    // 2. Buscar Pendências do Sistema (Pagar e Receber)
    const { data: systemTransactions, isLoading: isLoadingSystemTx } = useQuery({
        queryKey: ['system_pending_transactions', companyId],
        queryFn: async () => {
            if (!companyId) return [];

            // Buscar Contas a Pagar e Receber em paralelo (só pendentes, com limite)
            const [payResult, recResult, reconciledResult] = await Promise.all([
                (activeClient as any)
                    .from('contas_pagar')
                    .select('id, credor_nome, valor, data_vencimento, status')
                    .eq('company_id', companyId)
                    .eq('status', 'aberto')
                    .limit(1000),
                (activeClient as any)
                    .from('contas_receber')
                    .select('id, pagador_nome, valor, data_vencimento, status')
                    .eq('company_id', companyId)
                    .in('status', ['aberto', 'parcial', 'vencido'])
                    .limit(1000),
                (activeClient as any)
                    .from('bank_transactions')
                    .select('reconciled_receivable_id')
                    .eq('company_id', companyId)
                    .eq('status', 'reconciled')
                    .not('reconciled_receivable_id', 'is', null)
                    .limit(2000),
            ]);

            if (payResult.error) throw payResult.error;
            if (recResult.error) throw recResult.error;

            const payables = payResult.data;
            const receivables = recResult.data;

            const reconciledCRIds = new Set(
                (reconciledResult.data || []).map((r: any) => r.reconciled_receivable_id)
            );

            // Normalizar
            const normalized: SystemTransaction[] = [];

            payables?.forEach((p: any) => {
                normalized.push({
                    id: p.id,
                    type: 'payable',
                    description: p.credor_nome || '',
                    amount: Number(p.valor || 0),
                    date: p.data_vencimento,
                    status: p.status,
                    entity_name: p.credor_nome || 'Fornecedor avulso',
                    original_table_id: p.id
                });
            });

            // Adicionar todos os CRs — marcar os já conciliados
            receivables?.forEach((r: any) => {
                const jaConciliado = reconciledCRIds.has(r.id);
                normalized.push({
                    id: r.id,
                    type: 'receivable',
                    description: r.pagador_nome || '',
                    amount: Number(r.valor || 0),
                    date: r.data_vencimento,
                    status: jaConciliado ? 'conciliado' : r.status,
                    entity_name: r.pagador_nome || 'Cliente avulso',
                    original_table_id: r.id
                });
            });

            return normalized.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        },
        enabled: !!companyId
    });

    // Mutation: Upload OFX
    const uploadOFX = useMutation({
        mutationFn: async (file: File) => {
            if (!bankAccountId || !companyId) throw new Error("Dados incompletos");

            const parsed = await parseOFX(file);
            if (!parsed.length) throw new Error("Arquivo vazio ou inválido");

            const toInsert = parsed.map(tx => {
                // Ensure strictly only columns that exist in DB
                const sanitized = {
                    company_id: companyId,
                    bank_account_id: bankAccountId,
                    fit_id: tx.fitId,
                    date: format(tx.date, 'yyyy-MM-dd'),
                    amount: tx.type === 'debit' ? -Math.abs(tx.amount) : Math.abs(tx.amount),
                    description: tx.description ? tx.description.substring(0, 255) : '', // Safety truncate
                    memo: tx.memo ? tx.memo.substring(0, 255) : '',
                    status: 'pending',
                    source: 'ofx',
                };
                return sanitized;
            });

            const { error } = await (activeClient as any)
                .from('bank_transactions')
                .upsert(toInsert, { onConflict: 'bank_account_id,fit_id', ignoreDuplicates: true });

            if (error) throw error;
            return parsed.length;
        },
        onSuccess: (count) => {
            toast({ title: "Sucesso", description: `${count} transações importadas.` });
            queryClient.invalidateQueries({ queryKey: ['bank_transactions_pending'] });
        },
        onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" })
    });

    const uploadPDF = useMutation({
        mutationFn: async (file: File) => {
            if (!bankAccountId || !companyId) throw new Error("Dados incompletos");

            const filePath = `${companyId}/reconciliation/${bankAccountId}/${Date.now()}_${file.name}`;

            const { error: uploadError } = await activeClient.storage
                .from('company-docs')
                .upload(filePath, file, { upsert: false });

            if (uploadError) throw uploadError;

            const { data: statementRow, error: statementError } = await (activeClient as any)
                .from('bank_statement_files')
                .insert({
                    company_id: companyId,
                    bank_account_id: bankAccountId,
                    file_path: filePath,
                    file_name: file.name,
                    file_size: file.size,
                    content_type: file.type,
                    source: 'pdf',
                    ocr_status: 'processing',
                    created_by: user?.id ?? null,
                })
                .select('*')
                .single();

            if (statementError) throw statementError;

            const parsed = await parseBankStatementPdf(file);

            const toInsert = parsed.map((tx, index) => {
                const fitBase = `${statementRow.id}:${tx.date}:${tx.amount}:${tx.description}:${index}`;
                const fitId = `pdf_${hashString(fitBase)}`;
                return {
                    company_id: companyId,
                    bank_account_id: bankAccountId,
                    fit_id: fitId,
                    date: tx.date,
                    amount: tx.amount,
                    description: tx.description.substring(0, 255),
                    memo: "",
                    status: 'pending',
                    source: 'pdf',
                    statement_file_id: statementRow.id,
                };
            });

            if (toInsert.length > 0) {
                const { error: txError } = await (activeClient as any)
                    .from('bank_transactions')
                    .upsert(toInsert, { onConflict: 'bank_account_id,fit_id', ignoreDuplicates: true });

                if (txError) throw txError;
            }

            const ocrTextPreview = parsed.map((t) => t.raw).join("\n").slice(0, 20000);
            const { error: updateStatementError } = await (activeClient as any)
                .from('bank_statement_files')
                .update({
                    ocr_status: 'done',
                    ocr_text: ocrTextPreview,
                    processed_at: new Date().toISOString(),
                })
                .eq('id', statementRow.id);

            if (updateStatementError) throw updateStatementError;

            return toInsert.length;
        },
        onSuccess: (count) => {
            toast({ title: "Sucesso", description: `${count} transações importadas do PDF.` });
            queryClient.invalidateQueries({ queryKey: ['bank_transactions_pending'] });
            queryClient.invalidateQueries({ queryKey: ['bank_statement_files'] });
        },
        onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" })
    });

    // Mutation: Conciliar (Match)
    const matchTransaction = useMutation({
        mutationFn: async ({
            bankTx,
            sysTx,
            overrides,
        }: {
            bankTx: BankTransaction,
            sysTx: SystemTransaction,
            overrides?: { amount?: number; date?: string; note?: string }
        }) => {
            if (!companyId) throw new Error("Empresa não selecionada");
            if (!bankTx.id) throw new Error("Transação bancária inválida");

            const amount = overrides?.amount ?? Math.abs(Number(bankTx.amount || 0));
            const date = overrides?.date ?? bankTx.date;
            const note = overrides?.note ?? null;

            if (!Number.isFinite(amount) || amount <= 0) throw new Error("Valor inválido");

            if (sysTx.type === 'payable') {
                const { error } = await (activeClient as any).rpc('quitar_conta_pagar', {
                    p_conta_pagar_id: sysTx.id,
                    p_valor_pago: amount,
                    p_conta_bancaria_id: bankTx.bank_account_id,
                    p_data_pagamento: date,
                });
                if (error) throw error;
            } else {
                const { error } = await (activeClient as any).rpc('quitar_conta_receber', {
                    p_conta_receber_id: sysTx.id,
                    p_valor_pago: amount,
                    p_conta_bancaria_id: bankTx.bank_account_id,
                    p_data_pagamento: date,
                });
                if (error) throw error;
            }

            const { data: matchRow, error: matchError } = await (activeClient as any)
                .from('bank_reconciliation_matches')
                .insert({
                    company_id: companyId,
                    bank_account_id: bankTx.bank_account_id,
                    bank_transaction_id: bankTx.id,
                    payable_id: sysTx.type === 'payable' ? sysTx.id : null,
                    receivable_id: sysTx.type === 'receivable' ? sysTx.id : null,
                    match_type: 'manual',
                    matched_amount: amount,
                    matched_date: date,
                    status: 'matched',
                    note,
                    created_by: user?.id ?? null,
                })
                .select('*')
                .single();

            if (matchError) throw matchError;

            if (overrides && (overrides.amount || overrides.date || overrides.note)) {
                const { error: adjError } = await (activeClient as any)
                    .from('bank_reconciliation_adjustments')
                    .insert({
                        company_id: companyId,
                        match_id: matchRow.id,
                        payload: overrides,
                        created_by: user?.id ?? null,
                    });
                if (adjError) throw adjError;
            }

            const { error: bankError } = await (activeClient as any)
                .from('bank_transactions')
                .update({
                    status: 'reconciled',
                    reconciled_payable_id: sysTx.type === 'payable' ? sysTx.id : null,
                    reconciled_receivable_id: sysTx.type === 'receivable' ? sysTx.id : null,
                    reconciled_at: new Date().toISOString(),
                    reconciled_by: user?.id ?? null,
                    reconciliation_note: note,
                })
                .eq('id', bankTx.id);

            if (bankError) throw bankError;
        },
        onSuccess: () => {
            toast({ title: "Conciliado!", description: "Lançamento baixado com sucesso." });
            // Invalidar apenas queries essenciais da conciliação
            queryClient.invalidateQueries({ queryKey: ['bank_transactions_pending'] });
            queryClient.invalidateQueries({ queryKey: ['system_pending_transactions'] });
            queryClient.invalidateQueries({ queryKey: ['reconciled_transactions'] });
            queryClient.invalidateQueries({ queryKey: ['import_history'] });
            // Dashboard: invalidar com delay para não travar a UI
            setTimeout(() => {
                queryClient.invalidateQueries({ queryKey: ['dashboard_accounts_balance'] });
                queryClient.invalidateQueries({ queryKey: ['dashboard_cashflow'] });
                queryClient.invalidateQueries({ queryKey: ['dashboard_dre'] });
            }, 2000);
        },
        onError: (err: any) => toast({ title: "Erro na conciliação", description: err.message, variant: "destructive" })
    });

    // Query: Histórico de importações com período
    // Colunas reais da tabela: id, bank_account_id, company_id, date, amount, description, memo, fit_id, status, created_at, updated_at
    const { data: importHistory } = useQuery({
        queryKey: ['import_history', bankAccountId],
        queryFn: async () => {
            if (!bankAccountId) return [];

            // Buscar transações recentes para calcular períodos (limitado)
            const { data: allTx, error: txError } = await (activeClient as any)
                .from('bank_transactions')
                .select('id, date, created_at, fit_id')
                .eq('bank_account_id', bankAccountId)
                .order('created_at', { ascending: false })
                .limit(2000);

            if (txError) throw txError;
            if (!allTx?.length) return [];

            // Agrupar por lote de importação (created_at truncado ao minuto)
            const groups = new Map<string, {
                key: string;
                source: string;
                imported_at: string;
                min_date: string;
                max_date: string;
                count: number;
                tx_ids: string[];
            }>();

            for (const tx of allTx) {
                // Agrupar por created_at truncado ao minuto (transações importadas juntas)
                const createdMinute = tx.created_at?.substring(0, 16) || 'unknown';
                const groupKey = `import_${createdMinute}`;

                // Detectar source pelo fit_id: pdf_ prefix = PDF, senão OFX
                const source = tx.fit_id?.startsWith('pdf_') ? 'pdf' : 'ofx';

                const existing = groups.get(groupKey);
                if (existing) {
                    existing.count++;
                    existing.tx_ids.push(tx.id);
                    if (tx.date < existing.min_date) existing.min_date = tx.date;
                    if (tx.date > existing.max_date) existing.max_date = tx.date;
                } else {
                    groups.set(groupKey, {
                        key: groupKey,
                        source,
                        imported_at: tx.created_at,
                        min_date: tx.date,
                        max_date: tx.date,
                        count: 1,
                        tx_ids: [tx.id],
                    });
                }
            }

            const result = Array.from(groups.values());

            // Ordenar por data de importação (mais recente primeiro)
            result.sort((a, b) => new Date(b.imported_at).getTime() - new Date(a.imported_at).getTime());

            return result;
        },
        enabled: !!bankAccountId,
    });

    // Mutation: Deletar lote de importação
    const deleteImportBatch = useMutation({
        mutationFn: async (txIds: string[]) => {
            if (!txIds.length) throw new Error("Nenhuma transação para deletar");

            // Deletar em batches de 50 (limite do Supabase IN filter)
            const batchSize = 50;
            for (let i = 0; i < txIds.length; i += batchSize) {
                const batch = txIds.slice(i, i + batchSize);
                const { error } = await (activeClient as any)
                    .from('bank_transactions')
                    .delete()
                    .in('id', batch);
                if (error) throw error;
            }

            return txIds.length;
        },
        onSuccess: (count) => {
            toast({ title: "Extrato excluído", description: `${count} transações removidas.` });
            queryClient.invalidateQueries({ queryKey: ['bank_transactions_pending'] });
            queryClient.invalidateQueries({ queryKey: ['import_history'] });
            queryClient.invalidateQueries({ queryKey: ['reconciled_transactions'] });
        },
        onError: (err: any) => toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" })
    });

    // Mutation: Upload Fatura de Cartão de Crédito (PDF)
    const uploadCreditCardPDF = useMutation({
        mutationFn: async (file: File) => {
            if (!bankAccountId || !companyId) throw new Error("Dados incompletos");

            const statement = await parseCreditCardPdf(file);
            if (!statement.transactions.length) throw new Error("Nenhuma transação encontrada na fatura");

            const toInsert = statement.transactions.map((tx, index) => {
                const fitBase = `cc_${bankAccountId}:${tx.date}:${tx.amount}:${tx.description}:${index}`;
                const fitId = `cc_${hashString(fitBase)}`;
                return {
                    company_id: companyId,
                    bank_account_id: bankAccountId,
                    fit_id: fitId,
                    date: tx.date,
                    amount: -Math.abs(tx.amount), // Cartão = despesa = negativo
                    description: tx.installment
                        ? `${tx.description} (${tx.installment})`
                        : tx.description,
                    memo: tx.installment ? `Parcela ${tx.installment}` : "",
                    status: 'pending',
                    source: 'credit_card_pdf',
                };
            });

            const { error } = await (activeClient as any)
                .from('bank_transactions')
                .upsert(toInsert, { onConflict: 'bank_account_id,fit_id', ignoreDuplicates: true });

            if (error) throw error;

            return {
                count: toInsert.length,
                total: statement.totalAmount,
                dueDate: statement.dueDate,
                cardLast4: statement.cardLast4,
            };
        },
        onSuccess: (result) => {
            const extra = result.total ? ` | Total fatura: R$ ${result.total.toFixed(2).replace('.', ',')}` : '';
            toast({ title: "Fatura importada", description: `${result.count} transações importadas.${extra}` });
            queryClient.invalidateQueries({ queryKey: ['bank_transactions_pending'] });
        },
        onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" })
    });

    return {
        bankTransactions,
        statementFiles,
        systemTransactions,
        importHistory,
        isLoading: isLoadingBankTx || isLoadingSystemTx,
        uploadOFX,
        uploadPDF,
        uploadCreditCardPDF,
        matchTransaction,
        deleteImportBatch
    };
}
