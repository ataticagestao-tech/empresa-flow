
import { useState, useRef, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useBankAccounts } from "@/modules/finance/presentation/hooks/useBankAccounts";
import { useBankReconciliation, SystemTransaction } from "@/modules/finance/presentation/hooks/useBankReconciliation";
import { useConciliationEngine, MatchSuggestion } from "@/modules/finance/presentation/hooks/useConciliationEngine";
import { useDefaultConciliationRules } from "@/modules/finance/presentation/hooks/useDefaultConciliationRules";
import { useSearchParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
    Upload, Check, RefreshCw, ArrowLeft, Search, FileText,
    Calendar, ChevronDown, ChevronUp, Plus, Brain, CheckCircle2,
    Eye, HelpCircle, Zap, BookOpen, Trash2, CheckSquare, Sparkles,
    DollarSign, Clock, Bot, CreditCard
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { BankTransaction } from "@/modules/finance/domain/schemas/bank-reconciliation.schema";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useToast } from "@/components/ui/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCategorySuggestion, ExternalSuggestion } from "@/modules/finance/presentation/hooks/useCategorySuggestion";
import { CategorySuggestions } from "@/modules/finance/presentation/components/CategorySuggestions";
import { useAiRecategorization } from "@/modules/finance/presentation/hooks/useAiRecategorization";
import { useHistoricalCategorySuggestion } from "@/modules/finance/presentation/hooks/useHistoricalCategorySuggestion";

function ScoreBadge({ score }: { score: number }) {
    if (score >= 85) return (
        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1">
            <Zap className="h-3 w-3" /> {score}%
        </Badge>
    );
    if (score >= 50) return (
        <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1">
            <Eye className="h-3 w-3" /> {score}%
        </Badge>
    );
    if (score > 0) return (
        <Badge className="bg-slate-100 text-slate-500 border-slate-200 gap-1">
            <HelpCircle className="h-3 w-3" /> {score}%
        </Badge>
    );
    return null;
}

export default function Conciliacao() {
    const [searchParams, setSearchParams] = useSearchParams();
    const accountIdFromUrl = searchParams.get("conta") || "";
    const [selectedAccountId, setSelectedAccountId] = useState(accountIdFromUrl);
    const [selectedBankTx, setSelectedBankTx] = useState<BankTransaction | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [showImportHistory, setShowImportHistory] = useState(false);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [showRulesPanel, setShowRulesPanel] = useState(false);
    const [newEntry, setNewEntry] = useState({ description: "", category_id: "" });
    const [isCreating, setIsCreating] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [scoreFilter, setScoreFilter] = useState<"all" | "auto" | "suggested" | "review">("all");
    const [showNewCategory, setShowNewCategory] = useState(false);
    const [newCatName, setNewCatName] = useState("");
    const [isCreatingCategory, setIsCreatingCategory] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [expandedBatchKey, setExpandedBatchKey] = useState<string | null>(null);
    const [expandedBatchTxIds, setExpandedBatchTxIds] = useState<string[]>([]);
    const [editingCategoryTxId, setEditingCategoryTxId] = useState<string | null>(null);

    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const handleAccountChange = (val: string) => {
        setSelectedAccountId(val);
        setSearchParams({ conta: val });
        setSelectedIds(new Set());
    };

    const { accounts } = useBankAccounts();
    const {
        bankTransactions,
        systemTransactions,
        importHistory,
        uploadOFX,
        uploadCreditCardPDF,
        matchTransaction,
        deleteImportBatch
    } = useBankReconciliation(selectedAccountId);

    const selectedAccount = accounts?.find((a: any) => a.id === selectedAccountId);
    const isCreditCard = selectedAccount?.type === 'credit_card';

    const {
        suggestions,
        rules,
        scoreSummary,
        learnRule,
        createRule,
        deleteRule,
    } = useConciliationEngine(selectedAccountId, bankTransactions, systemTransactions);

    const { seedDefaultRules, rulesCount: defaultRulesCount } = useDefaultConciliationRules();

    // Faturamento conciliado vs a conciliar
    const { data: reconciledTx } = useQuery({
        queryKey: ["reconciled_transactions", selectedAccountId],
        queryFn: async () => {
            if (!selectedAccountId) return [];
            const { data, error } = await (activeClient as any)
                .from("bank_transactions")
                .select("id, amount, status, date")
                .eq("bank_account_id", selectedAccountId)
                .eq("status", "reconciled");
            if (error) return [];
            return data || [];
        },
        enabled: !!selectedAccountId,
    });

    // Query: fetch full details of a batch when expanded
    const { data: expandedBatchTx, isLoading: isLoadingBatchTx, isError: isBatchTxError, error: batchTxError } = useQuery({
        queryKey: ["batch_details", expandedBatchKey],
        queryFn: async () => {
            const ids = expandedBatchTxIds;
            if (!ids.length) return [];

            const { data, error } = await (activeClient as any)
                .from("bank_transactions")
                .select("id, date, amount, description, memo, status, category_id, reconciled_payable_id, reconciled_receivable_id")
                .in("id", ids.slice(0, 50))
                .order("date", { ascending: true });

            if (error) throw new Error(JSON.stringify(error));
            return (data || []).map((t: any) => ({
                ...t,
                linked_table: t.reconciled_payable_id ? "accounts_payable" : t.reconciled_receivable_id ? "accounts_receivable" : null,
                linked_id: t.reconciled_payable_id || t.reconciled_receivable_id || null,
            }));
        },
        enabled: !!expandedBatchKey && expandedBatchTxIds.length > 0,
        retry: 1,
    });

    // Mutation: update category — works on linked payable/receivable OR directly on bank_transactions
    const updateLinkedCategory = async (linkedTable: string | null, linkedId: string | null, newCategoryId: string, bankTxId?: string) => {
        // Always save category_id directly on the bank_transaction
        if (bankTxId) {
            await (activeClient as any)
                .from("bank_transactions")
                .update({ category_id: newCategoryId })
                .eq("id", bankTxId);
        }

        // If linked to payable/receivable, also update there
        if (linkedTable && linkedId) {
            const gestapTable = linkedTable === "accounts_payable" ? "contas_pagar" : "contas_receber";
            const { error } = await (activeClient as any)
                .from(gestapTable)
                .update({ conta_contabil_id: newCategoryId })
                .eq("id", linkedId);
            if (error) {
                toast({ title: "Erro", description: "Não foi possível atualizar a categoria.", variant: "destructive" });
                return;
            }
            const txField = linkedTable === "accounts_payable" ? "conta_pagar_id" : "conta_receber_id";
            await (activeClient as any)
                .from("movimentacoes")
                .update({ conta_contabil_id: newCategoryId })
                .eq(txField, linkedId);
        }

        toast({ title: "Categoria atualizada", description: "A categoria foi alterada com sucesso." });
        queryClient.invalidateQueries({ queryKey: ["batch_details", expandedBatchKey] });
        queryClient.invalidateQueries({ queryKey: ["dashboard_dre"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard_dre_detailed"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard_revenue_by_service"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard_revenue_by_payment"] });
        queryClient.invalidateQueries({ queryKey: ["historical_categorized_tx"] });
        setEditingCategoryTxId(null);
    };

    const billingStats = useMemo(() => {
        const conciliado = (reconciledTx || []).reduce((acc: number, t: any) => acc + Math.abs(Number(t.amount || 0)), 0);
        const aConciliar = (bankTransactions || []).reduce((acc: number, t: any) => acc + Math.abs(Number(t.amount || 0)), 0);
        const withAiSupport = suggestions.filter(s => s.score > 0).length;
        const aiPercent = suggestions.length > 0 ? Math.round((withAiSupport / suggestions.length) * 100) : 0;

        // Período: min/max date de todas as transações (pendentes + reconciliadas)
        const allDates: string[] = [
            ...(bankTransactions || []).map((t: any) => t.date).filter(Boolean),
            ...(reconciledTx || []).map((t: any) => t.date).filter(Boolean),
        ];
        let periodoLabel = "";
        if (allDates.length > 0) {
            const sorted = allDates.sort();
            const minDate = sorted[0];
            const maxDate = sorted[sorted.length - 1];
            try {
                const fmtMin = format(parseISO(minDate), "dd/MM/yyyy", { locale: ptBR });
                const fmtMax = format(parseISO(maxDate), "dd/MM/yyyy", { locale: ptBR });
                periodoLabel = fmtMin === fmtMax ? fmtMin : `${fmtMin} — ${fmtMax}`;
            } catch { periodoLabel = ""; }
        }

        return { conciliado, aConciliar, withAiSupport, aiPercent, totalPending: suggestions.length, periodoLabel };
    }, [reconciledTx, bankTransactions, suggestions]);

    // Build lookup: bankTxId -> suggestion
    const suggestionMap = useMemo(() => {
        const map = new Map<string, MatchSuggestion>();
        suggestions.forEach(s => map.set(s.bankTransaction.id, s));
        return map;
    }, [suggestions]);

    // Filtered by score bucket
    const filteredBankTransactions = useMemo(() => {
        if (!bankTransactions) return [];
        if (scoreFilter === "all") return bankTransactions;

        return bankTransactions.filter(bt => {
            const s = suggestionMap.get(bt.id);
            if (!s) return scoreFilter === "review";
            if (scoreFilter === "auto") return s.score >= 85;
            if (scoreFilter === "suggested") return s.score >= 50 && s.score < 85;
            if (scoreFilter === "review") return s.score < 50;
            return true;
        });
    }, [bankTransactions, scoreFilter, suggestionMap]);

    // Categories for create form — all accounts (analytical + synthetic)
    const { data: allChartAccounts } = useQuery({
        queryKey: ["chart_of_accounts_all", selectedCompany?.id],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data, error } = await (activeClient as any)
                .from("chart_of_accounts")
                .select("*")
                .eq("company_id", selectedCompany.id)
                .order("code");
            if (error) return [];
            return (data || []).map((c: any) => ({
                id: c.id, code: c.code, name: c.name,
                type: c.type || (
                    ['expense', 'cost'].includes(c.account_type) ? 'despesa'
                    : c.account_type === 'revenue' && c.account_nature === 'debit' ? 'despesa'
                    : c.account_type === 'revenue' ? 'receita'
                    : c.account_type
                ),
                account_type: c.account_type,
                account_nature: c.account_nature,
                is_analytical: c.is_analytic === true || c.is_analytical === true,
                is_synthetic: !c.is_analytic && !c.is_analytical,
                parent_id: c.parent_id,
            }));
        },
        enabled: !!selectedCompany?.id
    });

    // Analytical accounts (for category picker)
    const chartCategories = useMemo(() =>
        (allChartAccounts || []).filter((c: any) => c.is_analytical),
    [allChartAccounts]);

    const createDescription = showCreateForm ? (newEntry.description || selectedBankTx?.description || "") : "";
    const createType = selectedBankTx?.amount && selectedBankTx.amount < 0 ? "despesa" : "receita";

    // Synthetic (parent) groups for "criar categoria" — filtered by createType
    // Despesa includes: expense, cost, and revenue-debit (deduções)
    // Patrimonial/asset/liability/equity groups appear in both views
    const parentGroups = useMemo(() => {
        if (!allChartAccounts) return [];
        const standardTypes = ['expense', 'cost', 'revenue'];
        const patrimonialGroups = allChartAccounts.filter((c: any) =>
            c.is_synthetic && !standardTypes.includes(c.account_type)
        );
        if (createType === "despesa") {
            return [
                ...allChartAccounts.filter((c: any) =>
                    c.is_synthetic && (
                        c.account_type === 'expense' ||
                        c.account_type === 'cost' ||
                        (c.account_type === 'revenue' && c.account_nature === 'debit')
                    )
                ),
                ...patrimonialGroups
            ];
        }
        return [
            ...allChartAccounts.filter((c: any) =>
                c.is_synthetic && c.account_type === 'revenue' && c.account_nature === 'credit'
            ),
            ...patrimonialGroups
        ];
    }, [allChartAccounts, createType]);

    // Auto-generate next available code under selected parent group
    const [selectedParentId, setSelectedParentId] = useState("");
    const nextCatCode = useMemo(() => {
        if (!selectedParentId || !allChartAccounts) return "";
        const parent = allChartAccounts.find((c: any) => c.id === selectedParentId);
        if (!parent) return "";
        const prefix = parent.code + ".";
        const existing = allChartAccounts
            .filter((c: any) => c.code.startsWith(prefix) && c.code.split(".").length === parent.code.split(".").length + 1)
            .map((c: any) => {
                const lastPart = c.code.substring(prefix.length);
                return parseInt(lastPart, 10);
            })
            .filter((n: number) => !isNaN(n));
        const nextNum = existing.length > 0 ? Math.max(...existing) + 1 : 1;
        return `${prefix}${String(nextNum).padStart(2, "0")}`;
    }, [selectedParentId, allChartAccounts]);

    // Historical suggestions from past categorized transactions
    const { historicalSuggestions } = useHistoricalCategorySuggestion(
        createDescription, createType as "receita" | "despesa"
    );

    // Build external suggestions from: engine rules + historical data
    const externalSuggestions = useMemo<ExternalSuggestion[]>(() => {
        const result: ExternalSuggestion[] = [];

        // 1. Engine suggestion (from conciliation_rules learned patterns)
        if (selectedBankTx && showCreateForm) {
            const engineSuggestion = suggestionMap.get(selectedBankTx.id);
            if (engineSuggestion?.accountId) {
                result.push({
                    accountId: engineSuggestion.accountId,
                    reason: `Regra: ${engineSuggestion.ruleName || "padrão aprendido"}`,
                    score: 15,
                });
            }
        }

        // 2. Historical suggestions (from past categorized transactions)
        for (const hs of historicalSuggestions) {
            if (!result.some(r => r.accountId === hs.accountId)) {
                result.push(hs);
            }
        }

        return result;
    }, [selectedBankTx, showCreateForm, suggestionMap, historicalSuggestions]);

    const { suggestions: createSuggestions } = useCategorySuggestion(
        createDescription, chartCategories || [], createType as "receita" | "despesa", externalSuggestions
    );

    // AI recategorization for reconciled batches
    const aiRecat = useAiRecategorization(chartCategories || []);

    // ============================================================
    // HANDLERS
    // ============================================================

    const ccFileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) uploadOFX.mutate(file);
    };

    const handleCCFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) uploadCreditCardPDF.mutate(file);
    };

    const handleMatch = (bt: BankTransaction, sysTx: SystemTransaction) => {
        matchTransaction.mutate({ bankTx: bt, sysTx });
        // MEMORIZAÇÃO IMEDIATA: aprender regra com beneficiário
        learnRule.mutate({ bankTx: bt });
    };

    const handleCreateAndReconcile = async () => {
        if (!selectedBankTx || !selectedCompany?.id) return;

        // Verificar se esta bank_transaction já foi conciliada (evitar duplicatas)
        const { data: existingMatch } = await (activeClient as any)
            .from("bank_reconciliation_matches")
            .select("id")
            .eq("bank_transaction_id", selectedBankTx.id)
            .eq("status", "matched")
            .limit(1);
        if (existingMatch && existingMatch.length > 0) {
            toast({ title: "Já conciliada", description: "Esta transação bancária já possui um lançamento vinculado.", variant: "destructive" });
            return;
        }

        const isExpense = selectedBankTx.amount < 0;
        const table = isExpense ? "contas_pagar" : "contas_receber";
        const nameCol = isExpense ? "credor_nome" : "pagador_nome";
        const entryDescription = newEntry.description || selectedBankTx.description || "Lançamento via conciliação";
        const amount = Math.abs(selectedBankTx.amount);

        setIsCreating(true);
        try {
            const payload: Record<string, any> = {
                company_id: selectedCompany.id,
                [nameCol]: entryDescription,
                valor: amount,
                data_vencimento: selectedBankTx.date,
                status: "aberto",
            };
            if (newEntry.category_id && newEntry.category_id !== "none") {
                payload.conta_contabil_id = newEntry.category_id;
            }

            const { data: created, error: createError } = await (activeClient as any)
                .from(table).insert(payload)
                .select(`id, ${nameCol}, valor, data_vencimento, status`).single();
            if (createError) throw createError;

            const sysTx: SystemTransaction = {
                id: created.id,
                type: isExpense ? "payable" : "receivable",
                description: created[nameCol] || '',
                amount: Number(created.valor || 0),
                date: created.data_vencimento,
                status: created.status,
                entity_name: "Criado via conciliação",
                original_table_id: created.id,
            };

            matchTransaction.mutate({ bankTx: selectedBankTx, sysTx });
            // MEMORIZAÇÃO IMEDIATA: beneficiário → categoria selecionada
            learnRule.mutate({ bankTx: selectedBankTx, categoryId: newEntry.category_id || undefined });

            toast({ title: "Sucesso", description: `${isExpense ? "Despesa" : "Receita"} criada e conciliada!` });
            setSelectedBankTx(null);
            setShowCreateForm(false);
            setNewEntry({ description: "", category_id: "" });
        } catch (err: any) {
            toast({ title: "Erro", description: err.message, variant: "destructive" });
        } finally {
            setIsCreating(false);
        }
    };

    // Batch approval: conciliar selecionados (com sysTx existente OU criando lançamento via sugestão IA)
    const handleBatchApprove = async () => {
        const toApprove = Array.from(selectedIds)
            .map(id => suggestionMap.get(id))
            .filter((s): s is MatchSuggestion => !!s && (!!s.systemTransaction || s.score > 0));

        if (toApprove.length === 0) {
            toast({ title: "Nenhum item elegível", description: "Selecione transações que tenham sugestão.", variant: "destructive" });
            return;
        }

        let success = 0;
        let failed = 0;

        for (const suggestion of toApprove) {
            try {
                const bt = suggestion.bankTransaction;

                // Verificar se já foi conciliada (evitar duplicatas)
                const { data: alreadyMatched } = await (activeClient as any)
                    .from("bank_reconciliation_matches")
                    .select("id")
                    .eq("bank_transaction_id", bt.id)
                    .eq("status", "matched")
                    .limit(1);
                if (alreadyMatched && alreadyMatched.length > 0) {
                    failed++;
                    continue;
                }

                if (suggestion.systemTransaction) {
                    // Caso 1: Já tem lançamento do sistema → conciliar direto
                    await matchTransaction.mutateAsync({
                        bankTx: bt,
                        sysTx: suggestion.systemTransaction,
                    });
                } else {
                    // Caso 2: Sugestão IA (categoria) → criar lançamento + conciliar
                    const isExpense = bt.amount < 0;
                    const table = isExpense ? "contas_pagar" : "contas_receber";
                    const batchNameCol = isExpense ? "credor_nome" : "pagador_nome";

                    const payload: Record<string, any> = {
                        company_id: selectedCompany?.id,
                        [batchNameCol]: bt.description || "Lançamento via conciliação IA",
                        valor: Math.abs(bt.amount),
                        data_vencimento: bt.date,
                        status: "aberto",
                    };
                    if (suggestion.accountId) {
                        payload.conta_contabil_id = suggestion.accountId;
                    }

                    const { data: created, error: createError } = await (activeClient as any)
                        .from(table).insert(payload)
                        .select(`id, ${batchNameCol}, valor, data_vencimento, status`).single();
                    if (createError) throw createError;

                    const sysTx: SystemTransaction = {
                        id: created.id,
                        type: isExpense ? "payable" : "receivable",
                        description: created[batchNameCol] || '',
                        amount: Number(created.valor || 0),
                        date: created.data_vencimento,
                        status: created.status,
                        entity_name: "Criado via conciliação IA",
                        original_table_id: created.id,
                    };

                    await matchTransaction.mutateAsync({ bankTx: bt, sysTx });
                }

                // Aprender regra com conta sugerida
                learnRule.mutate({
                    bankTx: suggestion.bankTransaction,
                    categoryId: suggestion.accountId,
                });
                success++;
            } catch {
                failed++;
            }
        }

        setSelectedIds(new Set());
        toast({
            title: "Aprovação em lote",
            description: `${success} conciliado(s)${failed > 0 ? `, ${failed} falha(s)` : ""}`,
        });
    };

    const handleSelectHighConfidence = () => {
        const highConf = suggestions
            .filter(s => s.score >= 85)
            .map(s => s.bankTransaction.id);
        setSelectedIds(new Set(highConf));
    };

    const toggleSelect = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelectedIds(next);
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredBankTransactions.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredBankTransactions.map(bt => bt.id)));
        }
    };

    const handleCreateCategory = async () => {
        if (!nextCatCode || !newCatName.trim() || !selectedCompany?.id || !selectedParentId) return;
        setIsCreatingCategory(true);
        try {
            const parent = allChartAccounts?.find((c: any) => c.id === selectedParentId);
            const accountType = parent?.account_type || (createType === "despesa" ? "expense" : "revenue");
            const accountNature = parent?.account_nature || (createType === "despesa" ? "debit" : "credit");
            const parentLevel = parent?.code.split(".").length || 1;
            const { data, error } = await (activeClient as any)
                .from("chart_of_accounts")
                .insert({
                    company_id: selectedCompany.id,
                    code: nextCatCode,
                    name: newCatName.trim(),
                    account_type: accountType,
                    account_nature: accountNature,
                    is_analytical: true,
                    is_synthetic: false,
                    status: "active",
                    level: parentLevel + 1,
                    parent_id: selectedParentId,
                })
                .select("id")
                .single();
            if (error) throw error;
            toast({ title: "Categoria criada", description: `${nextCatCode} - ${newCatName.trim()}` });
            queryClient.invalidateQueries({ queryKey: ["chart_of_accounts_all"] });
            queryClient.invalidateQueries({ queryKey: ["chart_accounts_analytical"] });
            setNewEntry({ ...newEntry, category_id: data.id });
            setShowNewCategory(false);
            setSelectedParentId("");
            setNewCatName("");
        } catch (err: any) {
            toast({ title: "Erro ao criar categoria", description: err.message, variant: "destructive" });
        } finally {
            setIsCreatingCategory(false);
        }
    };

    // Filtered system transactions for manual search
    const filteredSystemTransactions = systemTransactions?.filter(st => {
        const needle = searchTerm.toLowerCase();
        const matchesSearch = st.description.toLowerCase().includes(needle) ||
            st.entity_name?.toLowerCase().includes(needle) ||
            String(st.amount).includes(needle);
        if (selectedBankTx) {
            const compatibleType = selectedBankTx.amount < 0 ? 'payable' : 'receivable';
            return matchesSearch && st.type === compatibleType;
        }
        return matchesSearch;
    });

    const formatBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

    return (
        <AppLayout title="Conciliação Bancária">
            <div className="space-y-6 animate-in fade-in duration-500">

                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl border border-[#E2E8F0] shadow-sm">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <Select value={selectedAccountId} onValueChange={handleAccountChange}>
                                <SelectTrigger className="w-[280px] h-10 text-lg font-medium border-[#E2E8F0]">
                                    <SelectValue placeholder="Selecione uma conta..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {accounts.map(acc => (
                                        <SelectItem key={acc.id} value={acc.id || ""}>
                                            {acc.type === 'credit_card' ? '💳 ' : ''}{acc.name} - {acc.banco}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <p className="text-sm text-muted-foreground ml-1">
                            Selecione a conta para visualizar e importar extratos.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <input type="file" accept=".ofx" className="hidden" ref={fileInputRef}
                            onChange={handleFileChange} disabled={!selectedAccountId || uploadOFX.isPending} />
                        <input type="file" accept=".pdf" className="hidden" ref={ccFileInputRef}
                            onChange={handleCCFileChange} disabled={!selectedAccountId || uploadCreditCardPDF.isPending} />
                        <Button variant="outline" className="border-[#E2E8F0]"
                            onClick={() => setShowRulesPanel(!showRulesPanel)}>
                            <Brain className="mr-2 h-4 w-4" />
                            Regras ({rules.length})
                        </Button>
                        {isCreditCard ? (
                            <Button variant="outline" className="border-[#E2E8F0] text-muted-foreground"
                                onClick={() => ccFileInputRef.current?.click()}
                                disabled={!selectedAccountId || uploadCreditCardPDF.isPending}>
                                {uploadCreditCardPDF.isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                                Importar Fatura (PDF)
                            </Button>
                        ) : (
                            <Button variant="outline" className="border-[#E2E8F0] text-muted-foreground"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={!selectedAccountId || uploadOFX.isPending}>
                                {uploadOFX.isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                                Importar OFX
                            </Button>
                        )}
                    </div>
                </div>

                {!selectedAccountId ? (
                    <div className="flex flex-col items-center justify-center p-16 bg-[#F8FAFC] rounded-xl border border-dashed border-[#E2E8F0] text-center">
                        <div className="bg-white p-4 rounded-full mb-4 shadow-sm">
                            <ArrowLeft className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <h3 className="text-xl font-semibold text-foreground mb-2">Selecione uma conta acima</h3>
                        <p className="text-muted-foreground max-w-md">
                            Para iniciar a conciliação, escolha qual conta bancária você deseja gerenciar.
                        </p>
                    </div>
                ) : (
                    <div className="grid gap-6">

                        {/* Faturamento Cards — sempre visíveis no topo */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Card className="border-emerald-200 bg-emerald-50/50">
                                <CardContent className="p-5">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Faturamento Conciliado</p>
                                            <p className="text-2xl font-bold text-emerald-600 mt-1">
                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(billingStats.conciliado)}
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {reconciledTx?.length || 0} transações reconciliadas
                                            </p>
                                            {billingStats.periodoLabel && (
                                                <p className="text-xs text-emerald-600/80 mt-1 flex items-center gap-1">
                                                    <Calendar className="h-3 w-3" />
                                                    Período: {billingStats.periodoLabel}
                                                </p>
                                            )}
                                        </div>
                                        <div className="h-12 w-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                                            <DollarSign className="h-6 w-6 text-emerald-600" />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="border-amber-200 bg-amber-50/50">
                                <CardContent className="p-5">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Faturamento a Conciliar</p>
                                            <p className="text-2xl font-bold text-amber-600 mt-1">
                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(billingStats.aConciliar)}
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {billingStats.totalPending} transações pendentes
                                            </p>
                                        </div>
                                        <div className="h-12 w-12 rounded-xl bg-amber-100 flex items-center justify-center">
                                            <Clock className="h-6 w-6 text-amber-600" />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="border-purple-200 bg-purple-50/50">
                                <CardContent className="p-5">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Suporte IA</p>
                                            <p className="text-2xl font-bold text-purple-600 mt-1">
                                                {billingStats.aiPercent}%
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {billingStats.withAiSupport} de {billingStats.totalPending} com sugestão automática
                                            </p>
                                        </div>
                                        <div className="h-12 w-12 rounded-xl bg-purple-100 flex items-center justify-center">
                                            <Bot className="h-6 w-6 text-purple-600" />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Painel de Regras Aprendidas */}
                        {showRulesPanel && (
                            <Card className="border-[#E2E8F0]">
                                <CardHeader className="pb-3">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <Brain className="h-5 w-5 text-purple-600" />
                                        Regras de Conciliação Memorizadas
                                        <Badge variant="secondary" className="ml-2">{rules.length}</Badge>
                                    </CardTitle>
                                    <CardDescription>
                                        O sistema aprende automaticamente quando você concilia manualmente. Regras são aplicadas nas próximas importações.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {/* Botão para aplicar regras padrão */}
                                    <div className="flex items-center justify-between mb-3 p-3 rounded-lg bg-blue-50 border border-blue-100">
                                        <div className="flex items-center gap-2 text-sm text-blue-700">
                                            <Zap className="h-4 w-4" />
                                            <span><strong>{defaultRulesCount}</strong> regras padrão disponíveis (keywords da clínica)</span>
                                        </div>
                                        <Button size="sm" variant="outline"
                                            className="border-blue-200 text-blue-700 hover:bg-blue-100"
                                            onClick={() => seedDefaultRules.mutate()}
                                            disabled={seedDefaultRules.isPending}
                                        >
                                            {seedDefaultRules.isPending ? <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                                            Aplicar Regras Padrão
                                        </Button>
                                    </div>

                                    {rules.length === 0 ? (
                                        <div className="text-center py-6 text-muted-foreground text-sm">
                                            <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                            Nenhuma regra ainda. Aplique as regras padrão ou concilie manualmente para o sistema memorizar.
                                        </div>
                                    ) : (
                                        <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                            {rules.map(rule => {
                                                const kws = (rule.palavras_chave || []).join(", ");
                                                const confiancaScore = rule.confianca === "Alta" ? 95 : rule.confianca === "Média" ? 70 : 50;
                                                return (
                                                <div key={rule.id} className="flex items-center justify-between p-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-white transition-colors">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <Badge variant="outline" className={`text-[10px] ${rule.acao === "auto-conciliar" ? "border-emerald-200 text-emerald-600 bg-emerald-50" : "border-amber-200 text-amber-600 bg-amber-50"}`}>
                                                                {rule.acao === "auto-conciliar" ? "Auto" : "Sugerir"}
                                                            </Badge>
                                                            <span className="font-medium text-sm truncate">{kws}</span>
                                                        </div>
                                                        <p className="text-xs text-muted-foreground mt-1">
                                                            Keywords: <strong>{kws}</strong>
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-3 ml-4">
                                                        <Badge className="bg-emerald-100 text-emerald-700">{confiancaScore}%</Badge>
                                                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-400 hover:text-red-600"
                                                            onClick={() => deleteRule.mutate(rule.id)}>
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        )}

                        {/* Histórico de Importações (colapsado por padrão) */}
                        <Card className="border-[#E2E8F0]">
                            <CardHeader className="pb-3">
                                <div className="flex justify-between items-center cursor-pointer" onClick={() => setShowImportHistory(!showImportHistory)}>
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <FileText className="h-5 w-5 text-primary" />
                                        Histórico de Importações
                                        <Badge variant="secondary" className="text-muted-foreground bg-[#F1F5F9] ml-2">
                                            {importHistory?.length || 0}
                                        </Badge>
                                    </CardTitle>
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                        {showImportHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                    </Button>
                                </div>
                            </CardHeader>
                            {showImportHistory && (
                                <CardContent className="pt-0">
                                    {!importHistory?.length ? (
                                        <div className="text-center py-6 text-muted-foreground text-sm">
                                            Nenhuma importação registrada para esta conta.
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {importHistory.map((imp) => {
                                                const isExpanded = expandedBatchKey === imp.key;
                                                return (
                                                <div key={imp.key} className="rounded-lg border border-[#E2E8F0] overflow-hidden">
                                                    <div
                                                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-[#F8FAFC] cursor-pointer hover:bg-[#F1F5F9] transition-colors"
                                                        onClick={() => {
                                                            if (isExpanded) {
                                                                setExpandedBatchKey(null);
                                                                setExpandedBatchTxIds([]);
                                                            } else {
                                                                setExpandedBatchKey(imp.key);
                                                                setExpandedBatchTxIds(imp.tx_ids || []);
                                                            }
                                                        }}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className={`flex items-center justify-center h-9 w-9 rounded-lg ${imp.source === 'pdf' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                                                                <FileText className="h-4 w-4" />
                                                            </div>
                                                            <div>
                                                                <p className="text-sm font-medium">{imp.source.toUpperCase()}</p>
                                                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                                    <Calendar className="h-3 w-3" />
                                                                    {format(parseISO(imp.imported_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-4 ml-12 sm:ml-0">
                                                            <div className="text-right">
                                                                <p className="text-xs text-muted-foreground uppercase tracking-wide">Período</p>
                                                                <p className="text-sm font-medium">
                                                                    {format(parseISO(imp.min_date), 'dd/MM/yy')} — {format(parseISO(imp.max_date), 'dd/MM/yy')}
                                                                </p>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="text-xs text-muted-foreground uppercase tracking-wide">Qtd</p>
                                                                <p className="text-sm font-bold">{imp.count}</p>
                                                            </div>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-8 w-8 p-0"
                                                                onClick={(e) => { e.stopPropagation(); }}
                                                            >
                                                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600 hover:bg-red-50"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (confirm(`Excluir ${imp.count} transações deste extrato?`)) {
                                                                        deleteImportBatch.mutate(imp.tx_ids);
                                                                    }
                                                                }}
                                                                disabled={deleteImportBatch.isPending}
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </div>

                                                    {/* Expanded: transaction details */}
                                                    {isExpanded && (
                                                        <div className="border-t border-[#E2E8F0] bg-white">
                                                            {/* DEBUG - remover depois */}
                                                            <div className="px-4 py-1 text-[10px] bg-yellow-50 text-yellow-800 font-mono">
                                                                IDs no state: {expandedBatchTxIds.length} | key: {expandedBatchKey} | loading: {String(isLoadingBatchTx)} | error: {String(isBatchTxError)} | data: {expandedBatchTx ? expandedBatchTx.length : 'null'} {batchTxError ? `| err: ${batchTxError}` : ''}
                                                            </div>
                                                            {isBatchTxError ? (
                                                                <div className="text-center py-6 text-sm">
                                                                    <p className="text-destructive">Erro ao carregar transações.</p>
                                                                    <p className="text-xs text-muted-foreground mt-1">{String(batchTxError)}</p>
                                                                    <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => queryClient.invalidateQueries({ queryKey: ["batch_details", expandedBatchKey] })}>
                                                                        Tentar novamente
                                                                    </Button>
                                                                </div>
                                                            ) : isLoadingBatchTx || !expandedBatchTx ? (
                                                                <div className="text-center py-6 text-muted-foreground text-sm">
                                                                    Carregando transações...
                                                                </div>
                                                            ) : !expandedBatchTx.length ? (
                                                                <div className="text-center py-6 text-muted-foreground text-sm">
                                                                    Nenhuma transação encontrada.
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    {/* Batch-level AI button */}
                                                                    <div className="flex items-center justify-between px-4 py-2.5 bg-[#FAFBFC] border-b border-[#E2E8F0]">
                                                                        <span className="text-xs text-muted-foreground">
                                                                            {expandedBatchTx.filter((t: any) => t.status === "reconciled").length} transações conciliadas
                                                                        </span>
                                                                        <Button
                                                                            variant="outline"
                                                                            size="sm"
                                                                            className="h-7 text-xs gap-1.5 bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200 text-amber-700 hover:from-amber-100 hover:to-orange-100 hover:border-amber-300"
                                                                            onClick={() => aiRecat.suggestForBatch(expandedBatchTx)}
                                                                            disabled={aiRecat.processing}
                                                                        >
                                                                            <Bot className="h-3.5 w-3.5" />
                                                                            {aiRecat.processing ? "Analisando..." : "Recategorizar com IA"}
                                                                        </Button>
                                                                    </div>

                                                                    <Table>
                                                                        <TableHeader>
                                                                            <TableRow>
                                                                                <TableHead className="text-xs w-[70px]"></TableHead>
                                                                                <TableHead className="text-xs">Data</TableHead>
                                                                                <TableHead className="text-xs">Descrição</TableHead>
                                                                                <TableHead className="text-xs text-right">Valor</TableHead>
                                                                                <TableHead className="text-xs">Status</TableHead>
                                                                                <TableHead className="text-xs">Categoria</TableHead>
                                                                            </TableRow>
                                                                        </TableHeader>
                                                                        <TableBody>
                                                                            {expandedBatchTx.map((tx: any) => {
                                                                                const catAccount = chartCategories?.find((c: any) => c.id === tx.category_id);
                                                                                const isEditingThis = editingCategoryTxId === tx.id;
                                                                                const isReconciled = tx.status === "reconciled";
                                                                                const aiResult = aiRecat.results[tx.id];
                                                                                return (
                                                                                    <TableRow key={tx.id} className="group align-top">
                                                                                        {/* Ações à ESQUERDA */}
                                                                                        <TableCell className="py-2">
                                                                                            <div className="flex items-center gap-0.5">
                                                                                                {isReconciled && tx.linked_id && (
                                                                                                    <>
                                                                                                        <Button
                                                                                                            variant="ghost"
                                                                                                            size="sm"
                                                                                                            className="h-7 w-7 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                                                                                            onClick={() => {
                                                                                                                aiRecat.suggestForBatch([{
                                                                                                                    id: tx.id,
                                                                                                                    description: tx.description || tx.memo || "",
                                                                                                                    amount: Number(tx.amount),
                                                                                                                    date: tx.date,
                                                                                                                    linked_table: tx.linked_table,
                                                                                                                    linked_id: tx.linked_id,
                                                                                                                    status: tx.status,
                                                                                                                }]);
                                                                                                            }}
                                                                                                            title="Sugerir categoria com IA"
                                                                                                        >
                                                                                                            <Bot className="h-3.5 w-3.5" />
                                                                                                        </Button>
                                                                                                        <Button
                                                                                                            variant="ghost"
                                                                                                            size="sm"
                                                                                                            className="h-7 w-7 p-0"
                                                                                                            onClick={() => setEditingCategoryTxId(isEditingThis ? null : tx.id)}
                                                                                                            title="Editar categoria manualmente"
                                                                                                        >
                                                                                                            <BookOpen className="h-3.5 w-3.5" />
                                                                                                        </Button>
                                                                                                    </>
                                                                                                )}
                                                                                            </div>
                                                                                        </TableCell>
                                                                                        <TableCell className="text-xs whitespace-nowrap py-2">
                                                                                            {tx.date ? format(parseISO(tx.date), "dd/MM/yy") : "—"}
                                                                                        </TableCell>
                                                                                        <TableCell className="text-xs py-2">
                                                                                            <div className="whitespace-normal break-words text-[12px] leading-snug">
                                                                                                {tx.description || tx.memo || "—"}
                                                                                            </div>
                                                                                            {/* AI suggestions inline */}
                                                                                            {aiResult && aiResult.suggestions.length > 0 && (
                                                                                                <div className="flex flex-wrap items-center gap-1 mt-1.5">
                                                                                                    <span className="flex items-center gap-0.5 text-[9px] font-semibold text-amber-600 uppercase tracking-wider">
                                                                                                        <Sparkles className="h-2.5 w-2.5" />
                                                                                                        IA:
                                                                                                    </span>
                                                                                                    {aiResult.suggestions.map((s) => (
                                                                                                        <Badge
                                                                                                            key={s.account.id}
                                                                                                            variant="outline"
                                                                                                            className={`cursor-pointer text-[10px] font-medium transition-all hover:scale-105 ${
                                                                                                                tx.category_id === s.account.id
                                                                                                                    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                                                                                                    : "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
                                                                                                            }`}
                                                                                                            title={`${s.reason} (score: ${s.score})`}
                                                                                                            onClick={() => {
                                                                                                                if (tx.linked_table && tx.linked_id) {
                                                                                                                    updateLinkedCategory(tx.linked_table, tx.linked_id, s.account.id);
                                                                                                                }
                                                                                                            }}
                                                                                                        >
                                                                                                            {s.account.code} {s.account.name}
                                                                                                        </Badge>
                                                                                                    ))}
                                                                                                </div>
                                                                                            )}
                                                                                        </TableCell>
                                                                                        <TableCell className={`text-xs text-right font-medium whitespace-nowrap py-2 ${Number(tx.amount) < 0 ? "text-red-600" : "text-emerald-600"}`}>
                                                                                            {Number(tx.amount) < 0 ? "−" : "+"} R$ {Math.abs(Number(tx.amount)).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                                                                        </TableCell>
                                                                                        <TableCell className="py-2">
                                                                                            <Badge variant={isReconciled ? "default" : "secondary"} className={`text-[10px] ${isReconciled ? "bg-emerald-100 text-emerald-700 border-emerald-200" : ""}`}>
                                                                                                {isReconciled ? "Conciliado" : "Pendente"}
                                                                                            </Badge>
                                                                                        </TableCell>
                                                                                        <TableCell className="text-xs py-2">
                                                                                            {isEditingThis ? (
                                                                                                <div className="relative">
                                                                                                    <Command className="rounded-lg border shadow-md" shouldFilter={true}>
                                                                                                        <CommandInput placeholder="Buscar categoria..." className="h-8 text-xs" />
                                                                                                        <CommandList>
                                                                                                            <CommandEmpty className="py-2 text-center text-xs text-muted-foreground">Nenhuma encontrada</CommandEmpty>
                                                                                                            <CommandGroup className="max-h-[200px] overflow-y-auto">
                                                                                                                {(chartCategories || []).map((cat: any) => (
                                                                                                                    <CommandItem
                                                                                                                        key={cat.id}
                                                                                                                        value={`${cat.code} ${cat.name}`}
                                                                                                                        onSelect={() => {
                                                                                                                            if (tx.linked_table && tx.linked_id) {
                                                                                                                                updateLinkedCategory(tx.linked_table, tx.linked_id, cat.id);
                                                                                                                            }
                                                                                                                        }}
                                                                                                                        className="text-xs cursor-pointer"
                                                                                                                    >
                                                                                                                        <span className="font-medium text-muted-foreground mr-1.5">{cat.code}</span>
                                                                                                                        <span>{cat.name}</span>
                                                                                                                        {tx.category_id === cat.id && (
                                                                                                                            <Check className="ml-auto h-3 w-3 text-emerald-600" />
                                                                                                                        )}
                                                                                                                    </CommandItem>
                                                                                                                ))}
                                                                                                            </CommandGroup>
                                                                                                        </CommandList>
                                                                                                    </Command>
                                                                                                </div>
                                                                                            ) : (
                                                                                                <span className="text-muted-foreground whitespace-normal text-[11.5px] leading-snug">
                                                                                                    {catAccount ? `${catAccount.code} — ${catAccount.name}` : "Sem categoria"}
                                                                                                </span>
                                                                                            )}
                                                                                        </TableCell>
                                                                                    </TableRow>
                                                                                );
                                                                            })}
                                                                        </TableBody>
                                                                    </Table>
                                                                </>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </CardContent>
                            )}
                        </Card>

                        {/* Score Summary Cards */}
                        {scoreSummary.total > 0 && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <Card
                                    className={`cursor-pointer transition-all ${scoreFilter === "auto" ? "ring-2 ring-emerald-400" : "hover:shadow-md"}`}
                                    onClick={() => setScoreFilter(scoreFilter === "auto" ? "all" : "auto")}
                                >
                                    <CardContent className="p-4 flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                                            <Zap className="h-5 w-5 text-emerald-600" />
                                        </div>
                                        <div>
                                            <p className="text-2xl font-bold text-emerald-600">{scoreSummary.auto}</p>
                                            <p className="text-xs text-muted-foreground">Auto-conciliar</p>
                                        </div>
                                    </CardContent>
                                </Card>
                                <Card
                                    className={`cursor-pointer transition-all ${scoreFilter === "suggested" ? "ring-2 ring-amber-400" : "hover:shadow-md"}`}
                                    onClick={() => setScoreFilter(scoreFilter === "suggested" ? "all" : "suggested")}
                                >
                                    <CardContent className="p-4 flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
                                            <Eye className="h-5 w-5 text-amber-600" />
                                        </div>
                                        <div>
                                            <p className="text-2xl font-bold text-amber-600">{scoreSummary.suggested}</p>
                                            <p className="text-xs text-muted-foreground">Sugeridos</p>
                                        </div>
                                    </CardContent>
                                </Card>
                                <Card
                                    className={`cursor-pointer transition-all ${scoreFilter === "review" ? "ring-2 ring-slate-400" : "hover:shadow-md"}`}
                                    onClick={() => setScoreFilter(scoreFilter === "review" ? "all" : "review")}
                                >
                                    <CardContent className="p-4 flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center">
                                            <HelpCircle className="h-5 w-5 text-slate-500" />
                                        </div>
                                        <div>
                                            <p className="text-2xl font-bold text-slate-600">{scoreSummary.review}</p>
                                            <p className="text-xs text-muted-foreground">Revisar</p>
                                        </div>
                                    </CardContent>
                                </Card>
                                <Card
                                    className={`cursor-pointer transition-all ${scoreFilter === "all" ? "ring-2 ring-blue-400" : "hover:shadow-md"}`}
                                    onClick={() => setScoreFilter("all")}
                                >
                                    <CardContent className="p-4 flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                                            <CheckCircle2 className="h-5 w-5 text-blue-600" />
                                        </div>
                                        <div>
                                            <p className="text-2xl font-bold text-blue-600">{scoreSummary.total}</p>
                                            <p className="text-xs text-muted-foreground">Total pendentes</p>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        )}

                        {/* Transactions Table */}
                        <Card className="border-[#E2E8F0]">
                            <CardHeader>
                                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                                    <div>
                                        <CardTitle className="flex items-center gap-2">
                                            Transações do Extrato (Pendentes)
                                            <Badge variant="secondary" className="text-muted-foreground bg-[#F1F5F9]">
                                                {filteredBankTransactions.length} itens
                                            </Badge>
                                        </CardTitle>
                                        <CardDescription>
                                            Itens importados do banco pendentes de conciliação.
                                        </CardDescription>
                                    </div>
                                    {selectedIds.size > 0 && (
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className="text-sm py-1">
                                                {selectedIds.size} selecionado(s)
                                            </Badge>
                                            <Button size="sm" variant="outline" onClick={handleSelectHighConfidence}
                                                className="gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50">
                                                <Zap className="h-3.5 w-3.5" />
                                                Selecionar Alta Confiança
                                            </Button>
                                            <Button size="sm" onClick={handleBatchApprove}
                                                className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white">
                                                <CheckSquare className="h-3.5 w-3.5" />
                                                Aprovar Selecionados
                                            </Button>
                                        </div>
                                    )}
                                    {selectedIds.size === 0 && scoreSummary.auto > 0 && (
                                        <Button size="sm" variant="outline" onClick={handleSelectHighConfidence}
                                            className="gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50">
                                            <Zap className="h-3.5 w-3.5" />
                                            Selecionar Alta Confiança ({scoreSummary.auto})
                                        </Button>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent>
                                {!filteredBankTransactions.length ? (
                                    <div className="text-center py-12">
                                        <Check className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
                                        <h3 className="text-lg font-medium text-foreground">Tudo em dia!</h3>
                                        <p className="text-muted-foreground">Não há transações pendentes para conciliar.</p>
                                    </div>
                                ) : (
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-[#F8FAFC]">
                                                <TableHead className="w-10">
                                                    <Checkbox
                                                        checked={selectedIds.size === filteredBankTransactions.length && filteredBankTransactions.length > 0}
                                                        onCheckedChange={toggleSelectAll}
                                                    />
                                                </TableHead>
                                                <TableHead className="w-20">Data</TableHead>
                                                <TableHead>Descrição Banco</TableHead>
                                                <TableHead className="w-28">Valor</TableHead>
                                                <TableHead>Sugestão IA</TableHead>
                                                <TableHead className="w-16 text-center">Score</TableHead>
                                                <TableHead className="text-right w-32">Ações</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredBankTransactions.map((bt) => {
                                                const suggestion = suggestionMap.get(bt.id);
                                                const bestMatch = suggestion?.systemTransaction;
                                                const score = suggestion?.score || 0;

                                                return (
                                                    <TableRow key={bt.id} className="group hover:bg-[#F8FAFC] transition-colors">
                                                        <TableCell>
                                                            <Checkbox
                                                                checked={selectedIds.has(bt.id)}
                                                                onCheckedChange={() => toggleSelect(bt.id)}
                                                            />
                                                        </TableCell>
                                                        <TableCell className="font-medium text-muted-foreground whitespace-nowrap">
                                                            {format(parseISO(bt.date), 'dd/MM')}
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="font-medium">{bt.description}</div>
                                                            {bt.memo && <div className="text-xs text-muted-foreground">{bt.memo}</div>}
                                                        </TableCell>
                                                        <TableCell>
                                                            <span className={`font-bold ${bt.amount < 0 ? 'text-[#EF4444]' : 'text-emerald-600'}`}>
                                                                {formatBRL(bt.amount)}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell>
                                                            {bestMatch ? (
                                                                <div className="flex flex-col gap-1 items-start">
                                                                    <Badge
                                                                        variant="outline"
                                                                        className={`cursor-pointer ${score >= 85 ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : score >= 50 ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' : 'bg-slate-50 text-slate-600 border-slate-200'}`}
                                                                        onClick={() => handleMatch(bt, bestMatch)}
                                                                    >
                                                                        <Check className="h-3 w-3 mr-1" />
                                                                        {bestMatch.entity_name} - {bestMatch.description}
                                                                    </Badge>
                                                                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                                        {suggestion?.method === "rule" && <><Sparkles className="h-3 w-3 text-purple-500" /> {suggestion.ruleName}</>}
                                                                        {suggestion?.method !== "rule" && <>Venc: {format(parseISO(bestMatch.date), 'dd/MM')}</>}
                                                                    </span>
                                                                </div>
                                                            ) : suggestion?.method === "rule" && suggestion?.label ? (
                                                                <div className="flex items-center gap-1">
                                                                    <Sparkles className="h-3 w-3 text-purple-500" />
                                                                    <span className="text-xs text-purple-600">{suggestion.label}</span>
                                                                </div>
                                                            ) : (
                                                                <span className="text-xs text-muted-foreground italic">Sem sugestão</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <ScoreBadge score={score} />
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                {bestMatch && (
                                                                    <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                                                        onClick={() => handleMatch(bt, bestMatch)}>
                                                                        Aceitar
                                                                    </Button>
                                                                )}
                                                                <Button variant="outline" size="sm" className="h-7 text-xs border-[#E2E8F0]"
                                                                    onClick={() => { setSelectedBankTx(bt); setSearchTerm(""); }}>
                                                                    Buscar
                                                                </Button>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Modal de Conciliação Manual */}
                <Dialog open={!!selectedBankTx} onOpenChange={(open) => {
                    if (!open) { setSelectedBankTx(null); setShowCreateForm(false); setShowNewCategory(false); setSelectedParentId(""); setNewCatName(""); setNewEntry({ description: "", category_id: "" }); }
                }}>
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>Conciliar Manualmente</DialogTitle>
                            <DialogDescription>Selecione um lançamento existente ou crie um novo.</DialogDescription>
                        </DialogHeader>

                        {selectedBankTx && (
                            <div className="space-y-4">
                                {/* Info da transação bancária */}
                                <div className="bg-[#F8FAFC] p-4 rounded-lg flex justify-between items-center border border-[#F1F5F9]">
                                    <div>
                                        <p className="font-semibold text-foreground">{selectedBankTx.description}</p>
                                        <p className="text-sm text-muted-foreground">{format(parseISO(selectedBankTx.date), 'PPP', { locale: ptBR })}</p>
                                    </div>
                                    <div className="text-right">
                                        <span className={`text-xl font-bold ${selectedBankTx.amount < 0 ? 'text-[#EF4444]' : 'text-emerald-600'}`}>
                                            {formatBRL(selectedBankTx.amount)}
                                        </span>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {selectedBankTx.amount < 0 ? "Saída → Conta a Pagar" : "Entrada → Conta a Receber"}
                                        </p>
                                    </div>
                                </div>

                                {/* Aviso de memorização */}
                                <div className="flex items-center gap-2 text-xs text-purple-600 bg-purple-50 p-2 rounded-md border border-purple-100">
                                    <Brain className="h-4 w-4 flex-shrink-0" />
                                    <span>O sistema irá <strong>memorizar</strong> este padrão para sugerir automaticamente na próxima vez.</span>
                                </div>

                                {!showCreateForm ? (
                                    <>
                                        <div className="space-y-2">
                                            <div className="relative">
                                                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                                <Input placeholder="Buscar lançamentos..." className="pl-9"
                                                    value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                                            </div>
                                            <ScrollArea className="h-[250px] border rounded-md p-2">
                                                {!filteredSystemTransactions?.length && (
                                                    <div className="text-center py-8 text-muted-foreground text-sm">
                                                        Nenhum lançamento compatível encontrado.
                                                    </div>
                                                )}
                                                <div className="space-y-1">
                                                    {filteredSystemTransactions?.map((st) => (
                                                        <div key={`${st.type}-${st.id}`}
                                                            className="flex items-center justify-between p-3 hover:bg-[#F8FAFC] rounded-md cursor-pointer border border-transparent hover:border-[#E2E8F0] transition-all"
                                                            onClick={() => {
                                                                handleMatch(selectedBankTx, st);
                                                                setSelectedBankTx(null);
                                                            }}>
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    <Badge variant={st.type === 'payable' ? 'destructive' : 'default'} className="h-5 text-[10px] px-1">
                                                                        {st.type === 'payable' ? 'Pagar' : 'Receber'}
                                                                    </Badge>
                                                                    <span className="font-medium text-muted-foreground">{st.description}</span>
                                                                </div>
                                                                <p className="text-xs text-muted-foreground pl-1 mt-1">
                                                                    {st.entity_name} • Venc: {format(parseISO(st.date), 'dd/MM/yyyy')}
                                                                </p>
                                                            </div>
                                                            <span className="font-bold text-foreground">{formatBRL(st.amount)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </ScrollArea>
                                        </div>
                                        <Separator />
                                        <Button variant="outline"
                                            className="w-full border-dashed border-2 border-primary/30 text-primary hover:bg-primary/5 h-11"
                                            onClick={() => {
                                                setShowCreateForm(true);
                                                // Pre-fill category from engine suggestion (learned rules)
                                                const engineSuggestion = suggestionMap.get(selectedBankTx.id);
                                                const prefilledCategoryId = engineSuggestion?.accountId || "";
                                                setNewEntry({ description: selectedBankTx.description || "", category_id: prefilledCategoryId });
                                            }}>
                                            <Plus className="mr-2 h-4 w-4" />
                                            Criar {selectedBankTx.amount < 0 ? "Nova Despesa" : "Nova Receita"} e Conciliar
                                        </Button>
                                    </>
                                ) : (
                                    <>
                                        <div className="space-y-4 p-4 border border-primary/20 rounded-lg bg-primary/[0.02]">
                                            <div className="flex items-center gap-2 mb-1">
                                                <div className={`h-7 w-7 rounded-md flex items-center justify-center ${selectedBankTx.amount < 0 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                                    <Plus className="h-4 w-4" />
                                                </div>
                                                <h4 className="text-sm font-semibold">
                                                    Criar {selectedBankTx.amount < 0 ? "Conta a Pagar" : "Conta a Receber"}
                                                </h4>
                                            </div>
                                            <div className="space-y-3">
                                                <div className="space-y-1.5">
                                                    <Label className="text-xs font-medium">Descrição</Label>
                                                    <Input value={newEntry.description}
                                                        onChange={(e) => setNewEntry({ ...newEntry, description: e.target.value })}
                                                        placeholder="Descrição do lançamento" />
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="space-y-1.5">
                                                        <Label className="text-xs font-medium">Valor</Label>
                                                        <Input value={formatBRL(Math.abs(selectedBankTx.amount))} disabled className="bg-muted font-bold" />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <Label className="text-xs font-medium">Data</Label>
                                                        <Input value={format(parseISO(selectedBankTx.date), 'dd/MM/yyyy')} disabled className="bg-muted" />
                                                    </div>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <div className="flex items-center justify-between">
                                                        <Label className="text-xs font-medium">Categoria (Plano de Contas)</Label>
                                                        {!showNewCategory && (
                                                            <button
                                                                type="button"
                                                                className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                                                                onClick={() => setShowNewCategory(true)}>
                                                                <Plus className="h-3 w-3" />
                                                                Criar categoria
                                                            </button>
                                                        )}
                                                    </div>
                                                    {newEntry.category_id && (
                                                        <div className="flex items-center justify-between px-3 py-2 rounded-md border bg-muted/50">
                                                            <span className="text-sm font-medium">
                                                                {(() => {
                                                                    const cat = chartCategories?.find((c: any) => c.id === newEntry.category_id);
                                                                    return cat ? `${cat.code} - ${cat.name}` : "";
                                                                })()}
                                                            </span>
                                                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-red-600"
                                                                onClick={() => setNewEntry({ ...newEntry, category_id: "" })}>
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </div>
                                                    )}
                                                    {showNewCategory ? (
                                                        <div className="rounded-md border p-3 space-y-3 bg-blue-50/50">
                                                            <p className="text-xs font-semibold text-primary flex items-center gap-1">
                                                                <Plus className="h-3 w-3" /> Nova Categoria
                                                            </p>
                                                            <div className="space-y-1.5">
                                                                <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Grupo (conta pai)</Label>
                                                                <Select value={selectedParentId} onValueChange={setSelectedParentId}>
                                                                    <SelectTrigger className="h-8 text-xs">
                                                                        <SelectValue placeholder="Selecione o grupo..." />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        {parentGroups.map((g: any) => (
                                                                            <SelectItem key={g.id} value={g.id} className="text-xs">
                                                                                {g.code} - {g.name}
                                                                            </SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                            </div>
                                                            {selectedParentId && (
                                                                <div className="space-y-1.5">
                                                                    <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                                                                        Código (automático): <span className="text-primary font-bold">{nextCatCode}</span>
                                                                    </Label>
                                                                    <Input placeholder="Nome da nova categoria"
                                                                        value={newCatName}
                                                                        onChange={e => setNewCatName(e.target.value)}
                                                                        className="text-xs h-8"
                                                                        autoFocus />
                                                                </div>
                                                            )}
                                                            <div className="flex gap-2">
                                                                <Button variant="outline" size="sm" className="h-7 text-xs flex-1"
                                                                    onClick={() => { setShowNewCategory(false); setSelectedParentId(""); setNewCatName(""); }}>
                                                                    Cancelar
                                                                </Button>
                                                                <Button size="sm" className="h-7 text-xs flex-1 bg-primary text-white"
                                                                    onClick={handleCreateCategory}
                                                                    disabled={isCreatingCategory || !selectedParentId || !nextCatCode || !newCatName.trim()}>
                                                                    {isCreatingCategory ? <RefreshCw className="mr-1 h-3 w-3 animate-spin" /> : <Plus className="mr-1 h-3 w-3" />}
                                                                    Criar {nextCatCode}
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <Command className="rounded-md border">
                                                            <CommandInput placeholder="Buscar categoria..." />
                                                            <CommandList className="max-h-[150px]">
                                                                <CommandEmpty>Nenhuma categoria encontrada.</CommandEmpty>
                                                                <CommandGroup>
                                                                    {chartCategories?.filter((c: any) => c.type === createType || !['despesa', 'receita'].includes(c.type))
                                                                        .map((c: any) => (
                                                                            <CommandItem
                                                                                key={c.id}
                                                                                value={`${c.code} ${c.name}`}
                                                                                onSelect={() => setNewEntry({ ...newEntry, category_id: c.id })}>
                                                                                <Check className={`mr-2 h-4 w-4 ${newEntry.category_id === c.id ? "opacity-100" : "opacity-0"}`} />
                                                                                {c.code} - {c.name}
                                                                            </CommandItem>
                                                                        ))}
                                                                </CommandGroup>
                                                            </CommandList>
                                                        </Command>
                                                    )}
                                                    <CategorySuggestions suggestions={createSuggestions}
                                                        onSelect={(id) => setNewEntry({ ...newEntry, category_id: id })}
                                                        currentValue={newEntry.category_id} />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button variant="outline" className="flex-1"
                                                onClick={() => { setShowCreateForm(false); setShowNewCategory(false); setSelectedParentId(""); setNewCatName(""); setNewEntry({ description: "", category_id: "" }); }}>
                                                Voltar
                                            </Button>
                                            <Button className={`flex-1 text-white ${selectedBankTx.amount < 0 ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                                                onClick={handleCreateAndReconcile}
                                                disabled={isCreating || !newEntry.description}>
                                                {isCreating ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                                                Criar e Conciliar
                                            </Button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </DialogContent>
                </Dialog>
            </div>
        </AppLayout>
    );
}
