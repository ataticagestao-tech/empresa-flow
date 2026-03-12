
import { useState, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useBankAccounts } from "@/modules/finance/presentation/hooks/useBankAccounts";
import { useBankReconciliation, SystemTransaction } from "@/modules/finance/presentation/hooks/useBankReconciliation";
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
import { Upload, Check, AlertCircle, RefreshCw, ArrowLeft, Search, Filter, FileText, Calendar, ChevronDown, ChevronUp, Plus, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { BankTransaction } from "@/modules/finance/domain/schemas/bank-reconciliation.schema";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useToast } from "@/components/ui/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCategorySuggestion } from "@/modules/finance/presentation/hooks/useCategorySuggestion";
import { CategorySuggestions } from "@/modules/finance/presentation/components/CategorySuggestions";

export default function Conciliacao() {
    const [searchParams, setSearchParams] = useSearchParams();
    const accountIdFromUrl = searchParams.get("conta") || "";

    // Se não tiver conta na URL, usa estado local para o dropdown
    const [selectedAccountId, setSelectedAccountId] = useState(accountIdFromUrl);

    // Sincroniza URL se mudar no state
    const handleAccountChange = (val: string) => {
        setSelectedAccountId(val);
        setSearchParams({ conta: val });
    };

    const { accounts } = useBankAccounts();
    const {
        bankTransactions,
        systemTransactions,
        importHistory,
        isLoading,
        uploadOFX,
        matchTransaction
    } = useBankReconciliation(selectedAccountId);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedBankTx, setSelectedBankTx] = useState<BankTransaction | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [showImportHistory, setShowImportHistory] = useState(true);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [newEntry, setNewEntry] = useState({ description: "", category_id: "" });
    const [isCreating, setIsCreating] = useState(false);

    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Categorias para IA sugestiva no formulário de criação
    const { data: chartCategories } = useQuery({
        queryKey: ["chart_of_accounts_all", selectedCompany?.id],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data } = await (activeClient as any)
                .from("chart_of_accounts")
                .select("id, name, code, type")
                .eq("company_id", selectedCompany.id)
                .eq("is_analytic", true)
                .order("code");
            return data || [];
        },
        enabled: !!selectedCompany?.id
    });

    // IA sugestiva: determina tipo pela transação bancária selecionada
    const createDescription = showCreateForm ? (newEntry.description || selectedBankTx?.description || "") : "";
    const createType = selectedBankTx?.amount && selectedBankTx.amount < 0 ? "despesa" : "receita";
    const { suggestions: createSuggestions } = useCategorySuggestion(
        createDescription,
        chartCategories || [],
        createType as "receita" | "despesa"
    );

    // Criar novo lançamento e conciliar
    const handleCreateAndReconcile = async () => {
        if (!selectedBankTx || !selectedCompany?.id) return;

        const isExpense = selectedBankTx.amount < 0;
        const table = isExpense ? "accounts_payable" : "accounts_receivable";
        const description = newEntry.description || selectedBankTx.description || "Lançamento via conciliação";
        const amount = Math.abs(selectedBankTx.amount);

        setIsCreating(true);
        try {
            // 1. Criar o lançamento
            const payload: Record<string, any> = {
                company_id: selectedCompany.id,
                description,
                amount,
                due_date: selectedBankTx.date,
                status: "pending",
            };
            if (newEntry.category_id && newEntry.category_id !== "none") {
                payload.category_id = newEntry.category_id;
            }

            const { data: created, error: createError } = await (activeClient as any)
                .from(table)
                .insert(payload)
                .select("id, description, amount, due_date, status")
                .single();

            if (createError) throw createError;

            // 2. Conciliar com a transação bancária
            const sysTx: SystemTransaction = {
                id: created.id,
                type: isExpense ? "payable" : "receivable",
                description: created.description,
                amount: created.amount,
                date: created.due_date,
                status: created.status,
                entity_name: "Criado via conciliação",
                original_table_id: created.id,
            };

            matchTransaction.mutate({ bankTx: selectedBankTx, sysTx });

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

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) uploadOFX.mutate(file);
    };

    // Helper: Encontra sugestões
    const getSuggestions = (bt: BankTransaction) => {
        if (!systemTransactions) return [];
        return systemTransactions.filter(st => {
            // Regra 1: Valor exato
            // OFX: Débito é negativo (ex: -100). Contas a Pagar é positivo (100).
            // OFX: Crédito é positivo (ex: 100). Contas a Receber é positivo (100).

            let amountMatch = false;

            if (st.type === 'payable') {
                // Pagamento: BT deve ser negativo e o valor absoluto igual
                amountMatch = (bt.amount < 0) && (Math.abs(bt.amount) === Number(st.amount));
            } else {
                // Recebimento: BT positivo e valor igual
                amountMatch = (bt.amount > 0) && (Math.abs(bt.amount) === Number(st.amount));
            }

            return amountMatch;
        });
    };

    // Helper: Filtrar transações do sistema na busca manual
    const filteredSystemTransactions = systemTransactions?.filter(st => {
        const needle = searchTerm.toLowerCase();
        const matchesSearch = st.description.toLowerCase().includes(needle) ||
            st.entity_name?.toLowerCase().includes(needle) ||
            String(st.amount).includes(needle);

        // Se estamos conciliando uma transação bancária específica, filtrar por tipo compatível
        if (selectedBankTx) {
            // Se BT < 0 (Saída), só mostrar Payables
            // Se BT > 0 (Entrada), só mostrar Receivables
            const compatibleType = selectedBankTx.amount < 0 ? 'payable' : 'receivable';
            return matchesSearch && st.type === compatibleType;
        }

        return matchesSearch;
    });

    return (
        <AppLayout title="Conciliação Bancária">
            <div className="space-y-6 animate-in fade-in duration-500">

                {/* Header e Seleção de Conta */}
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
                                            {acc.name} - {acc.banco}
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
                        <input
                            type="file"
                            accept=".ofx"
                            className="hidden"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            disabled={!selectedAccountId || uploadOFX.isPending}
                        />
                        <Button
                            variant="outline"
                            className="border-[#E2E8F0] text-muted-foreground"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={!selectedAccountId || uploadOFX.isPending}
                        >
                            {uploadOFX.isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                            Importar OFX
                        </Button>
                    </div>
                </div>

                {!selectedAccountId ? (
                    <div className="flex flex-col items-center justify-center p-16 bg-[#F8FAFC] rounded-xl border border-dashed border-[#E2E8F0] text-center">
                        <div className="bg-white p-4 rounded-full mb-4 shadow-sm">
                            <ArrowLeft className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <h3 className="text-xl font-semibold text-foreground mb-2">Selecione uma conta acima</h3>
                        <p className="text-muted-foreground max-w-md">
                            Para iniciar a conciliação, escolha qual conta bancária você deseja gerenciar no menu suspenso.
                        </p>
                    </div>
                ) : (
                    <div className="grid gap-6">

                        {/* Painel de Histórico de Importações */}
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
                                <CardDescription>
                                    Quando cada importação foi realizada e o período das transações.
                                </CardDescription>
                            </CardHeader>
                            {showImportHistory && (
                                <CardContent className="pt-0">
                                    {!importHistory?.length ? (
                                        <div className="text-center py-6 text-muted-foreground text-sm">
                                            Nenhuma importação registrada para esta conta.
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {importHistory.map((imp) => (
                                                <div
                                                    key={imp.key}
                                                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-white transition-colors"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className={`flex items-center justify-center h-9 w-9 rounded-lg ${imp.source === 'pdf' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                                                            <FileText className="h-4 w-4" />
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-medium text-foreground">
                                                                Importação {imp.source.toUpperCase()}
                                                            </p>
                                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                                <Calendar className="h-3 w-3" />
                                                                Importado em {format(parseISO(imp.imported_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3 sm:gap-4 ml-12 sm:ml-0">
                                                        <div className="text-right">
                                                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Período</p>
                                                            <p className="text-sm font-medium text-foreground">
                                                                {format(parseISO(imp.min_date), 'dd/MM/yy')} — {format(parseISO(imp.max_date), 'dd/MM/yy')}
                                                            </p>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Transações</p>
                                                            <p className="text-sm font-bold text-foreground">{imp.count}</p>
                                                        </div>
                                                        <Badge
                                                            variant="outline"
                                                            className={`text-[10px] uppercase font-semibold ${imp.source === 'pdf' ? 'border-red-200 text-red-600 bg-red-50' : 'border-blue-200 text-blue-600 bg-blue-50'}`}
                                                        >
                                                            {imp.source}
                                                        </Badge>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            )}
                        </Card>

                        <Card className="border-[#E2E8F0]">
                            <CardHeader>
                                <CardTitle className="flex justify-between items-center">
                                    <span>Transações do Extrato (Pendentes)</span>
                                    <Badge variant="secondary" className="text-muted-foreground bg-[#F1F5F9]">
                                        {bankTransactions?.length || 0} itens
                                    </Badge>
                                </CardTitle>
                                <CardDescription>
                                    Itens importados do banco que ainda não foram vinculados ao sistema.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {!bankTransactions?.length ? (
                                    <div className="text-center py-12">
                                        <Check className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
                                        <h3 className="text-lg font-medium text-foreground">Tudo em dia!</h3>
                                        <p className="text-muted-foreground">Não há transações pendentes para conciliar nesta conta.</p>
                                    </div>
                                ) : (
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-[#F8FAFC]">
                                                <TableHead>Data</TableHead>
                                                <TableHead>Descrição Banco</TableHead>
                                                <TableHead>Valor</TableHead>
                                                <TableHead>Sugestão do Sistema</TableHead>
                                                <TableHead className="text-right">Ações</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {bankTransactions.map((bt) => {
                                                const suggestions = getSuggestions(bt);
                                                const bestMatch = suggestions[0];

                                                return (
                                                    <TableRow key={bt.id} className="group hover:bg-[#F8FAFC] transition-colors">
                                                        <TableCell className="font-medium text-muted-foreground">
                                                            {format(parseISO(bt.date), 'dd/MM')}
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="font-medium">{bt.description}</div>
                                                            {bt.memo && <div className="text-xs text-muted-foreground">{bt.memo}</div>}
                                                        </TableCell>
                                                        <TableCell>
                                                            <span className={`font-bold ${bt.amount < 0 ? 'text-[#EF4444]' : 'text-emerald-600'}`}>
                                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(bt.amount)}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell>
                                                            {bestMatch ? (
                                                                <div className="flex flex-col gap-1 items-start">
                                                                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 cursor-pointer" onClick={() => matchTransaction.mutate({ bankTx: bt, sysTx: bestMatch })}>
                                                                        <Check className="h-3 w-3 mr-1" />
                                                                        {bestMatch.entity_name} - {bestMatch.description}
                                                                    </Badge>
                                                                    <span className="text-[10px] text-muted-foreground">Venc: {format(parseISO(bestMatch.date), 'dd/MM')}</span>
                                                                </div>
                                                            ) : (
                                                                <span className="text-xs text-muted-foreground italic">Sem match automático</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                {bestMatch && (
                                                                    <Button
                                                                        size="sm"
                                                                        className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                                                                        onClick={() => matchTransaction.mutate({ bankTx: bt, sysTx: bestMatch })}
                                                                    >
                                                                        Aceitar
                                                                    </Button>
                                                                )}
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="h-8 border-[#E2E8F0]"
                                                                    onClick={() => {
                                                                        setSelectedBankTx(bt);
                                                                        setSearchTerm("");
                                                                    }}
                                                                >
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
                    if (!open) {
                        setSelectedBankTx(null);
                        setShowCreateForm(false);
                        setNewEntry({ description: "", category_id: "" });
                    }
                }}>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>Conciliar Manualmente</DialogTitle>
                            <DialogDescription>
                                Selecione um lançamento existente ou crie um novo para vincular.
                            </DialogDescription>
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
                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedBankTx.amount)}
                                        </span>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {selectedBankTx.amount < 0 ? "Saída → Conta a Pagar" : "Entrada → Conta a Receber"}
                                        </p>
                                    </div>
                                </div>

                                {!showCreateForm ? (
                                    <>
                                        {/* Busca de lançamentos existentes */}
                                        <div className="space-y-2">
                                            <div className="relative">
                                                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                                <Input
                                                    placeholder="Buscar lançamentos (descrição, valor, fornecedor)..."
                                                    className="pl-9"
                                                    value={searchTerm}
                                                    onChange={(e) => setSearchTerm(e.target.value)}
                                                />
                                            </div>

                                            <ScrollArea className="h-[250px] border rounded-md p-2">
                                                {!filteredSystemTransactions?.length && (
                                                    <div className="text-center py-8 text-muted-foreground text-sm">
                                                        Nenhum lançamento compatível encontrado.
                                                    </div>
                                                )}
                                                <div className="space-y-1">
                                                    {filteredSystemTransactions?.map((st) => (
                                                        <div
                                                            key={`${st.type}-${st.id}`}
                                                            className="flex items-center justify-between p-3 hover:bg-[#F8FAFC] rounded-md cursor-pointer border border-transparent hover:border-[#E2E8F0] transition-all"
                                                            onClick={() => {
                                                                matchTransaction.mutate({ bankTx: selectedBankTx, sysTx: st });
                                                                setSelectedBankTx(null);
                                                            }}
                                                        >
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
                                                            <span className="font-bold text-foreground">
                                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(st.amount)}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </ScrollArea>
                                        </div>

                                        {/* Separador + Botão Criar Novo */}
                                        <Separator />
                                        <Button
                                            variant="outline"
                                            className="w-full border-dashed border-2 border-primary/30 text-primary hover:bg-primary/5 hover:border-primary/50 h-11"
                                            onClick={() => {
                                                setShowCreateForm(true);
                                                setNewEntry({
                                                    description: selectedBankTx.description || "",
                                                    category_id: "",
                                                });
                                            }}
                                        >
                                            <Plus className="mr-2 h-4 w-4" />
                                            Criar {selectedBankTx.amount < 0 ? "Nova Despesa" : "Nova Receita"} e Conciliar
                                        </Button>
                                    </>
                                ) : (
                                    <>
                                        {/* Formulário de criação inline */}
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
                                                    <Input
                                                        value={newEntry.description}
                                                        onChange={(e) => setNewEntry({ ...newEntry, description: e.target.value })}
                                                        placeholder="Descrição do lançamento"
                                                    />
                                                </div>

                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="space-y-1.5">
                                                        <Label className="text-xs font-medium">Valor</Label>
                                                        <Input
                                                            value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.abs(selectedBankTx.amount))}
                                                            disabled
                                                            className="bg-muted font-bold"
                                                        />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <Label className="text-xs font-medium">Data</Label>
                                                        <Input
                                                            value={format(parseISO(selectedBankTx.date), 'dd/MM/yyyy')}
                                                            disabled
                                                            className="bg-muted"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="space-y-1.5">
                                                    <Label className="text-xs font-medium">Categoria (Plano de Contas)</Label>
                                                    <Select
                                                        value={newEntry.category_id || "none"}
                                                        onValueChange={(val) => setNewEntry({ ...newEntry, category_id: val === "none" ? "" : val })}
                                                    >
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Selecione..." />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="none">-- Nenhuma --</SelectItem>
                                                            {chartCategories
                                                                ?.filter((c: any) => c.type === createType)
                                                                .map((c: any) => (
                                                                    <SelectItem key={c.id} value={c.id}>{c.code} - {c.name}</SelectItem>
                                                                ))
                                                            }
                                                        </SelectContent>
                                                    </Select>
                                                    <CategorySuggestions
                                                        suggestions={createSuggestions}
                                                        onSelect={(id) => setNewEntry({ ...newEntry, category_id: id })}
                                                        currentValue={newEntry.category_id}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex gap-2">
                                            <Button
                                                variant="outline"
                                                className="flex-1"
                                                onClick={() => {
                                                    setShowCreateForm(false);
                                                    setNewEntry({ description: "", category_id: "" });
                                                }}
                                            >
                                                Voltar
                                            </Button>
                                            <Button
                                                className={`flex-1 text-white ${selectedBankTx.amount < 0 ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                                                onClick={handleCreateAndReconcile}
                                                disabled={isCreating || !newEntry.description}
                                            >
                                                {isCreating ? (
                                                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Check className="mr-2 h-4 w-4" />
                                                )}
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

