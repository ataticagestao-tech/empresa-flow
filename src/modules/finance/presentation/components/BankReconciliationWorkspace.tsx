import { useMemo, useRef, useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, Download, RefreshCw, Search, Upload, X, Trash2, FileText, AlertCircle, MoreHorizontal, Plus, PlusCircle, ArrowRightLeft, Ban, Sparkles } from "lucide-react";

import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { useBankAccounts } from "@/modules/finance/presentation/hooks/useBankAccounts";
import { SystemTransaction, useBankReconciliation } from "@/modules/finance/presentation/hooks/useBankReconciliation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSidebar } from "@/components/ui/sidebar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { BankTransaction, BankStatementFile } from "@/modules/finance/domain/schemas/bank-reconciliation.schema";
import { CreateTransactionDialog } from "./CreateTransactionDialog";
import { FileDetailsDialog } from "./FileDetailsDialog";
import { BankTransactionList } from "./BankTransactionList";
import { ReconciliationActionsPanel } from "./ReconciliationActionsPanel";
import { ReconciliationConfirmDialog } from "./ReconciliationConfirmDialog";
import type { ReconciliationPayload } from "./ReconciliationConfirmDialog";
import { resolveReconciliationCompanyId } from "../utils/bankReconciliationUpload";
import { parseBankStatementAccountMetadata } from "@/lib/parsers/bankStatementPdf";

interface BankReconciliationWorkspaceProps {
  companyIdOverride?: string;
  initialBankAccountId?: string;
  onBankAccountChange?: (bankAccountId: string) => void;
  showCompanySelector?: boolean;
}

export function BankReconciliationWorkspace({
  companyIdOverride,
  initialBankAccountId,
  onBankAccountChange,
  showCompanySelector = true,
}: BankReconciliationWorkspaceProps) {
  const { companies, selectedCompany, setSelectedCompany } = useCompany();
  const { activeClient } = useAuth();
  const { setOpen } = useSidebar();

  const [activeTab, setActiveTab] = useState("overview");

  const handleTabChange = (val: string) => {
    setActiveTab(val);
    if (val === "report") {
      setOpen(false);
    }
  };

  const [selectedAccountId, setSelectedAccountId] = useState(initialBankAccountId || "");
  const { accounts } = useBankAccounts(companyIdOverride || undefined);
  const selectedAccount = useMemo(
    () => accounts.find((acc) => acc.id === selectedAccountId),
    [accounts, selectedAccountId],
  );
  const companyId = resolveReconciliationCompanyId(
    companyIdOverride,
    selectedCompany?.id,
    selectedAccount?.company_id,
  );

  const handleAccountChange = (val: string) => {
    setSelectedAccountId(val);
    onBankAccountChange?.(val);
  };

  const {
    bankTransactions,
    statementFiles,
    systemTransactions,
    reconciliationMatches,
    isLoading,
    uploadOFX,
    uploadPDF,
    deleteStatementFile,
    suggestMatches,
    rejectSuggestion,
    matchTransaction,
    ignoreBankTransaction,
    createPayable,
    createReceivable
  } = useBankReconciliation(selectedAccountId, companyId || undefined);

  useEffect(() => {
    if (!selectedAccountId) return;
    const accountStillExists = accounts.some((account) => account.id === selectedAccountId);
    if (!accountStillExists) {
      setSelectedAccountId("");
      onBankAccountChange?.("");
    }
  }, [accounts, onBankAccountChange, selectedAccountId]);

  const [createTxDialogState, setCreateTxDialogState] = useState<{
    isOpen: boolean;
    type?: 'payable' | 'receivable';
    bankTx: BankTransaction | null;
  }>({ isOpen: false, bankTx: null });

  const ofxInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const [selectedBankTx, setSelectedBankTx] = useState<BankTransaction | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [inspectFileId, setInspectFileId] = useState<string | null>(null);
  const [activeStatementFileId, setActiveStatementFileId] = useState<string>("__all__");
  const hasInitializedActiveStatement = useRef(false);
  const [suggestionsCard, setSuggestionsCard] = useState<{
    visible: boolean;
    generated: number;
    generatedAt: Date | null;
  }>({
    visible: false,
    generated: 0,
    generatedAt: null,
  });

  const [confirmPayload, setConfirmPayload] = useState<{
    bankTx: BankTransaction;
    sysTx: SystemTransaction;
    existingMatchId?: string;
  } | null>(null);

  const filteredSystemTransactions = useMemo(() => {
    const rows = systemTransactions ?? [];
    const needle = searchTerm.toLowerCase();
    return rows.filter((st) => {
      const matchesSearch =
        st.description.toLowerCase().includes(needle) ||
        st.entity_name?.toLowerCase().includes(needle) ||
        String(st.amount).includes(needle);

      if (selectedBankTx) {
        const compatibleType = selectedBankTx.amount < 0 ? "payable" : "receivable";
        return matchesSearch && st.type === compatibleType;
      }

      return matchesSearch;
    });
  }, [searchTerm, selectedBankTx, systemTransactions]);

  const statementFileMap = useMemo(() => {
    const map: Record<string, BankStatementFile> = {};
    (statementFiles || []).forEach((file) => {
      map[file.id] = file;
    });
    return map;
  }, [statementFiles]);

  const fileNameByStatementId = useMemo(() => {
    const map: Record<string, string> = {};
    Object.values(statementFileMap).forEach((file) => {
      map[file.id] = file.file_name;
    });
    return map;
  }, [statementFileMap]);

  const transactionCountByFileId = useMemo(() => {
    const map: Record<string, number> = {};
    (bankTransactions || []).forEach((transaction) => {
      if (!transaction.statement_file_id) return;
      map[transaction.statement_file_id] = (map[transaction.statement_file_id] || 0) + 1;
    });
    return map;
  }, [bankTransactions]);

  const filteredBankTransactions = useMemo(() => {
    const rows = bankTransactions || [];
    if (activeStatementFileId === "__all__") return rows;
    return rows.filter((transaction) => transaction.statement_file_id === activeStatementFileId);
  }, [activeStatementFileId, bankTransactions]);

  const activeStatementFile = useMemo(() => {
    if (activeStatementFileId === "__all__") return null;
    return statementFileMap[activeStatementFileId] || null;
  }, [activeStatementFileId, statementFileMap]);

  const activeStatementMetadata = useMemo(() => {
    if (!activeStatementFile?.ocr_text) return null;
    return parseBankStatementAccountMetadata(activeStatementFile.ocr_text);
  }, [activeStatementFile?.ocr_text]);

  useEffect(() => {
    const files = statementFiles || [];
    if (!files.length) {
      hasInitializedActiveStatement.current = false;
      if (activeStatementFileId !== "__all__") {
        setActiveStatementFileId("__all__");
      }
      return;
    }

    if (!hasInitializedActiveStatement.current) {
      setActiveStatementFileId(files[0].id);
      hasInitializedActiveStatement.current = true;
      return;
    }

    if (activeStatementFileId !== "__all__" && !files.some((file) => file.id === activeStatementFileId)) {
      setActiveStatementFileId(files[0].id);
    }
  }, [activeStatementFileId, statementFiles]);

  useEffect(() => {
    if (!selectedBankTx?.id) return;
    const stillVisible = filteredBankTransactions.some((tx) => tx.id === selectedBankTx.id);
    if (!stillVisible) {
      setSelectedBankTx(null);
    }
  }, [filteredBankTransactions, selectedBankTx]);

  const getSuggestions = (bt: BankTransaction) => {
    if (!systemTransactions) return [];
    return systemTransactions.filter((st) => {
      let amountMatch = false;
      if (st.type === "payable") {
        amountMatch = bt.amount < 0 && Math.abs(bt.amount) === Number(st.amount);
      } else {
        amountMatch = bt.amount > 0 && Math.abs(bt.amount) === Number(st.amount);
      }
      return amountMatch;
    });
  };

  const startConfirm = (bankTx: BankTransaction, sysTx: SystemTransaction, existingMatchId?: string) => {
    setConfirmPayload({
      bankTx,
      sysTx,
      existingMatchId,
    });
  };

  const handleDownloadStatement = async (filePath: string) => {
    const { data, error } = await activeClient.storage.from("company-docs").createSignedUrl(filePath, 60);
    if (error) return;
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const suggestedByBankTxId = useMemo(() => {
    const map = new Map<string, any>();
    (reconciliationMatches || [])
      .filter((m: any) => String(m.status) === "suggested")
      .forEach((m: any) => {
        if (!m.bank_transaction_id) return;
        if (!map.has(m.bank_transaction_id)) map.set(m.bank_transaction_id, m);
      });
    return map;
  }, [reconciliationMatches]);

  const suggestedInCurrentView = useMemo(() => {
    if (!filteredBankTransactions?.length) return 0;
    return filteredBankTransactions.reduce((count, transaction) => {
      if (!transaction.id) return count;
      return suggestedByBankTxId.has(transaction.id) ? count + 1 : count;
    }, 0);
  }, [filteredBankTransactions, suggestedByBankTxId]);

  const resolvedHistory = useMemo(() => {
    return (reconciliationMatches || []).filter((m: any) => String(m.status) === "matched").slice(0, 20);
  }, [reconciliationMatches]);

  // --- Relatório Logic ---
  const [reportDateRange, setReportDateRange] = useState({
    start: format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd"),
    end: format(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0), "yyyy-MM-dd")
  });

  const reportData = useMemo(() => {
    const start = new Date(reportDateRange.start);
    const end = new Date(reportDateRange.end);
    // Ajustar para final do dia no end
    end.setHours(23, 59, 59, 999);

    const matches = (reconciliationMatches || []).filter((m: any) => {
      const d = m.matched_date ? new Date(m.matched_date) : null;
      if (!d) return false;
      return d >= start && d <= end && (m.status === 'suggested' || m.status === 'confirmed');
    });

    const allMatches = (reconciliationMatches || []).filter((m: any) => m.status === 'suggested' || m.status === 'confirmed');
    const matchedBankTxIds = new Set(allMatches.map((m: any) => m.bank_transaction_id));
    const matchedPayableIds = new Set(allMatches.map((m: any) => m.payable_id).filter(Boolean));
    const matchedReceivableIds = new Set(allMatches.map((m: any) => m.receivable_id).filter(Boolean));

    // Pendentes Banco (que não estão nos matches) e dentro do período
    const pendingBank = (bankTransactions || []).filter(bt => {
      if (!bt.id) return false;
      if (matchedBankTxIds.has(bt.id)) return false;
      const d = new Date(bt.date);
      return d >= start && d <= end;
    });

    // Pendentes Sistema (que não estão nos matches) e dentro do período
    const pendingSystem = (systemTransactions || []).filter(st => {
      if (st.type === 'payable' && matchedPayableIds.has(st.id)) return false;
      if (st.type === 'receivable' && matchedReceivableIds.has(st.id)) return false;

      const d = new Date(st.date);
      return d >= start && d <= end;
    });

    return {
      matches,
      pendingBank,
      pendingSystem
    };
  }, [reconciliationMatches, bankTransactions, systemTransactions, reportDateRange]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const yellowButtonClass =
    "border-[#F2C94C] bg-[#F2C94C] text-[#173B5B] hover:bg-[#e7bd4a] hover:text-[#173B5B] active:bg-[#2F80ED] active:border-[#2F80ED] active:text-white";
  const blueSelectedButtonClass =
    "border-[#2F80ED] bg-[#2F80ED] text-white hover:bg-[#256fd1] hover:text-white";

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-[#113657]/40 bg-gradient-to-br from-[#173B5B] via-[#153652] to-[#102B42] p-4 sm:p-6 space-y-6 animate-in fade-in duration-500 shadow-[0_24px_60px_rgba(9,28,44,0.30)]">
      <div className="pointer-events-none absolute right-[-120px] top-[-100px] h-64 w-64 rounded-full bg-[#2F80ED]/20 blur-3xl" />
      <div className="pointer-events-none absolute left-[-100px] bottom-[-120px] h-64 w-64 rounded-full bg-[#C5A03F]/20 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.10)_0%,rgba(255,255,255,0)_45%)]" />

      <div className="relative grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-4 bg-white/10 p-6 rounded-xl border border-white/20 shadow-sm backdrop-blur-sm">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start w-full">
          {showCompanySelector && !companyIdOverride && (
            <Select
              value={selectedCompany?.id || ""}
              onValueChange={(val) => {
                setSelectedCompany(companies.find((c) => c.id === val) || null);
                setSelectedAccountId("");
                onBankAccountChange?.("");
              }}
            >
              <SelectTrigger className="w-full h-11 text-base font-medium border-white/25 bg-white/10 text-white placeholder:text-white/60" aria-label="Selecione uma empresa">
                <SelectValue placeholder="Selecione uma empresa..." />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome_fantasia || c.razao_social}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={selectedAccountId} onValueChange={handleAccountChange} disabled={!companyId}>
            <SelectTrigger className="w-full h-11 text-base font-medium border-white/25 bg-white/10 text-white placeholder:text-white/60" aria-label="Selecione uma conta">
              <SelectValue placeholder="Selecione uma conta..." />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((acc) => (
                <SelectItem key={acc.id} value={acc.id || ""}>
                  {acc.name} - {acc.banco}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto lg:justify-end">
          <input
            type="file"
            accept=".ofx"
            className="hidden"
            ref={ofxInputRef}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadOFX.mutate(file);
              e.currentTarget.value = "";
            }}
            disabled={!selectedAccountId || uploadOFX.isPending}
            aria-label="Importar arquivo OFX"
          />

          <input
            type="file"
            accept=".pdf"
            className="hidden"
            ref={pdfInputRef}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadPDF.mutate(file);
              e.currentTarget.value = "";
            }}
            disabled={!selectedAccountId || uploadPDF.isPending}
            aria-label="Importar arquivo PDF"
          />

          <Button
            variant="outline"
            onClick={() => pdfInputRef.current?.click()}
            disabled={!selectedAccountId || uploadPDF.isPending}
            className={`h-11 px-4 ${yellowButtonClass}`}
          >
            <FileText className="mr-2 h-4 w-4" />
            {uploadPDF.isPending ? "Lendo PDF..." : "Importar PDF"}
          </Button>

          <Button
            variant="outline"
            onClick={() => ofxInputRef.current?.click()}
            disabled={!selectedAccountId || uploadOFX.isPending}
            className={`h-11 px-4 ${yellowButtonClass}`}
          >
            <Upload className="mr-2 h-4 w-4" />
            {uploadOFX.isPending ? "Lendo OFX..." : "Importar OFX"}
          </Button>

          <Button
            onClick={() =>
              suggestMatches.mutate(undefined, {
                onSuccess: (count: number) => {
                  setSuggestionsCard({
                    visible: true,
                    generated: Number.isFinite(count) ? count : 0,
                    generatedAt: new Date(),
                  });
                },
              })
            }
            disabled={suggestMatches.isPending || !selectedAccountId}
            className={`h-11 px-4 ${yellowButtonClass}`}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${suggestMatches.isPending ? "animate-spin" : ""}`} />
            Gerar Sugestões
          </Button>

          <Button
            variant={activeTab === "report" ? "secondary" : "default"}
            className={activeTab === "report" ? `h-11 px-4 ${blueSelectedButtonClass}` : `h-11 px-4 ${yellowButtonClass}`}
            onClick={() => handleTabChange(activeTab === "report" ? "overview" : "report")}
            disabled={!selectedAccountId}
          >
            <FileText className="mr-2 h-4 w-4" />
            {activeTab === "report" ? "Voltar para Conciliação" : "Abrir Relatório"}
          </Button>
        </div>
      </div>

      {!companyId ? (
        <div className="relative flex flex-col items-center justify-center p-16 bg-white/5 rounded-xl border border-dashed border-white/25 text-center backdrop-blur-sm">
          <h3 className="text-xl font-semibold text-white mb-2">Selecione uma empresa</h3>
          <p className="text-white/75 max-w-md">Escolha uma empresa para listar contas e importar extratos.</p>
        </div>
      ) : !selectedAccountId ? (
        <div className="relative flex flex-col items-center justify-center p-16 bg-white/5 rounded-xl border border-dashed border-white/25 text-center backdrop-blur-sm">
          <h3 className="text-xl font-semibold text-white mb-2">Selecione uma conta</h3>
          <p className="text-white/75 max-w-md">Escolha a conta bancária para visualizar e conciliar.</p>
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <div className="flex items-center justify-between mb-4">
            <TabsList className="border border-white/20 bg-white/10 backdrop-blur-sm">
              <TabsTrigger className="border border-[#F2C94C] bg-[#F2C94C] text-[#173B5B] hover:bg-[#e7bd4a] data-[state=active]:border-[#2F80ED] data-[state=active]:bg-[#2F80ED] data-[state=active]:text-white" value="overview">Visão Geral</TabsTrigger>
              <TabsTrigger className="border border-[#F2C94C] bg-[#F2C94C] text-[#173B5B] hover:bg-[#e7bd4a] data-[state=active]:border-[#2F80ED] data-[state=active]:bg-[#2F80ED] data-[state=active]:text-white" value="report">Relatório de Conciliação</TabsTrigger>
            </TabsList>
            <span className="text-xs text-white/70">v2.1 (Atualizado)</span>
          </div>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-6">
              <Card className="relative overflow-hidden rounded-[24px] border border-[#113657]/40 bg-gradient-to-br from-[#173B5B] via-[#153652] to-[#102B42] shadow-[0_24px_60px_rgba(9,28,44,0.30)]">
                <div className="pointer-events-none absolute right-[-100px] top-[-90px] h-56 w-56 rounded-full bg-[#2F80ED]/20 blur-3xl" />
                <div className="pointer-events-none absolute left-[-80px] bottom-[-100px] h-56 w-56 rounded-full bg-[#C5A03F]/20 blur-3xl" />
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.10)_0%,rgba(255,255,255,0)_45%)]" />
                <CardHeader className="relative">
                  <CardTitle className="flex justify-between items-center">
                    <span className="text-white">Arquivos anexados</span>
                    <Badge variant="secondary" className="border border-white/20 bg-white/15 text-white">
                      {statementFiles?.length || 0} arquivos
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-white/75">PDFs e extratos processados para esta conta.</CardDescription>
                </CardHeader>
                <CardContent className="relative">
                  {!statementFiles?.length ? (
                    <div className="text-center py-8 text-white/80 text-sm">Nenhum arquivo anexado.</div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={activeStatementFileId === "__all__" ? "default" : "outline"}
                          className={`h-8 ${activeStatementFileId === "__all__" ? blueSelectedButtonClass : yellowButtonClass}`}
                          onClick={() => {
                            setActiveStatementFileId("__all__");
                            setSelectedBankTx(null);
                          }}
                        >
                          Todos os extratos ({bankTransactions?.length || 0})
                        </Button>
                        {statementFiles.map((file) => (
                          <Button
                            key={file.id}
                            type="button"
                            size="sm"
                            variant={activeStatementFileId === file.id ? "default" : "outline"}
                            className={`h-8 max-w-[280px] ${activeStatementFileId === file.id ? blueSelectedButtonClass : yellowButtonClass}`}
                            title={file.file_name}
                            onClick={() => {
                              setActiveStatementFileId(file.id);
                              setSelectedBankTx(null);
                            }}
                          >
                            <span className="truncate">{file.file_name}</span>
                            <span className="ml-2 text-xs opacity-80">({transactionCountByFileId[file.id] || 0})</span>
                          </Button>
                        ))}
                      </div>
                      <div className="overflow-x-auto rounded-xl border border-white/20 bg-white/5 backdrop-blur-sm">
                        <Table
                          containerClassName="rounded-xl border-white/20 bg-white/5 shadow-none ring-0"
                          className="text-white"
                        >
                          <TableHeader className="!bg-transparent text-white/80 [&_tr]:border-white/15">
                            <TableRow className="border-b border-white/15 bg-white/10 odd:bg-white/10 even:bg-white/10 hover:bg-white/10">
                              <TableHead className="text-white/80">Arquivo</TableHead>
                              <TableHead className="text-white/80">Registros</TableHead>
                              <TableHead className="text-white/80">Status</TableHead>
                              <TableHead className="text-white/80">Data</TableHead>
                              <TableHead className="text-right text-white/80">Ações</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {statementFiles.map((f: BankStatementFile) => (
                              <TableRow
                                key={f.id}
                                className={`border-b border-white/10 transition-colors cursor-pointer odd:bg-transparent even:bg-transparent hover:bg-white/10 ${activeStatementFileId === f.id ? "bg-white/15" : ""}`}
                                onClick={() => {
                                  setActiveStatementFileId(f.id);
                                  setSelectedBankTx(null);
                                }}
                              >
                                <TableCell className="font-medium text-white">{f.file_name}</TableCell>
                                <TableCell className="text-white/85">
                                  {transactionCountByFileId[f.id] || 0}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="border-white/25 bg-white/10 text-white/90">
                                    {String(f.ocr_status || "pending")}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-white/75">
                                  {f.created_at ? format(new Date(f.created_at), "dd/MM/yyyy HH:mm") : "-"}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className={`h-8 ${yellowButtonClass}`}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setActiveStatementFileId(f.id);
                                        setSelectedBankTx(null);
                                      }}
                                    >
                                      Exibir
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className={`h-8 ${yellowButtonClass}`}
                                      onClick={() => handleDownloadStatement(String(f.file_path))}
                                    >
                                      <Download className="h-4 w-4 mr-2" />
                                      Baixar
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className={`h-8 ${yellowButtonClass}`}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setInspectFileId(f.id);
                                      }}
                                    >
                                      <FileText className="h-4 w-4 mr-2" />
                                      Visualizar
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className={`h-8 ${yellowButtonClass}`}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        if (confirm("Tem certeza que deseja excluir este arquivo e suas transações?")) {
                                          deleteStatementFile.mutate({ id: f.id, file_path: f.file_path });
                                        }
                                      }}
                                      disabled={deleteStatementFile.isPending}
                                      aria-label="Excluir arquivo"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
              {suggestionsCard.visible && (
                <section className="relative overflow-hidden rounded-[24px] border border-[#113657]/40 bg-gradient-to-br from-[#173B5B] via-[#153652] to-[#102B42] shadow-[0_24px_60px_rgba(9,28,44,0.30)]">
                  <div className="pointer-events-none absolute right-[-100px] top-[-90px] h-56 w-56 rounded-full bg-[#2F80ED]/20 blur-3xl" />
                  <div className="pointer-events-none absolute left-[-80px] bottom-[-100px] h-56 w-56 rounded-full bg-[#C5A03F]/20 blur-3xl" />
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.10)_0%,rgba(255,255,255,0)_45%)]" />

                  <div className="relative p-6 sm:p-7">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white/75">
                          <Sparkles className="h-3.5 w-3.5 text-[#F2C94C]" />
                          Sugestões de Conciliação
                        </div>
                        <h4 className="mt-3 text-xl font-black text-white">
                          {suggestionsCard.generated > 0 ? "Sugestões geradas com sucesso" : "Nenhuma nova sugestão encontrada"}
                        </h4>
                        <p className="mt-1 text-sm text-white/75">
                          {activeStatementFile ? `Arquivo ativo: ${activeStatementFile.file_name}` : "Escopo: todos os extratos desta conta"}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={`h-8 ${yellowButtonClass}`}
                        onClick={() => setSuggestionsCard((prev) => ({ ...prev, visible: false }))}
                      >
                        Fechar
                      </Button>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center gap-2">
                      <Badge className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm hover:bg-white/15">
                        {filteredBankTransactions.length} lançamentos no recorte
                      </Badge>
                      <Badge className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm hover:bg-white/15">
                        {suggestedInCurrentView} com sugestão no recorte
                      </Badge>
                      <Badge className="rounded-full border-none bg-[#F2C94C] px-3 py-1 text-xs font-bold text-[#173B5B] shadow-[0_8px_20px_rgba(242,201,76,0.45)]">
                        Novas geradas agora: {suggestionsCard.generated}
                      </Badge>
                    </div>

                    {suggestionsCard.generatedAt && (
                      <p className="mt-4 text-xs text-white/70">
                        Última geração: {format(suggestionsCard.generatedAt, "dd/MM/yyyy HH:mm")}
                      </p>
                    )}
                  </div>
                </section>
              )}
              <div className="space-y-6">
                <Card className="relative overflow-hidden rounded-[24px] border border-[#113657]/40 bg-gradient-to-br from-[#173B5B] via-[#153652] to-[#102B42] shadow-[0_24px_60px_rgba(9,28,44,0.30)]">
                  <div className="pointer-events-none absolute right-[-100px] top-[-90px] h-56 w-56 rounded-full bg-[#2F80ED]/20 blur-3xl" />
                  <div className="pointer-events-none absolute left-[-80px] bottom-[-100px] h-56 w-56 rounded-full bg-[#C5A03F]/20 blur-3xl" />
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.10)_0%,rgba(255,255,255,0)_45%)]" />
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <CardTitle className="text-base text-white">Lançamentos Importados</CardTitle>
                        <CardDescription className="text-white/75">
                          {activeStatementFile ? `Arquivo ativo: ${activeStatementFile.file_name}` : "Visualizando todos os arquivos"}
                        </CardDescription>
                      </div>
                      <Badge variant="secondary" className="border border-white/20 bg-white/15 text-white">
                        {filteredBankTransactions.length} registros
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {activeStatementFile && activeStatementMetadata ? (
                      <div className="mb-4 rounded-xl border border-white/20 bg-white/10 p-3 backdrop-blur-sm">
                        <div className="flex flex-wrap gap-2">
                          {activeStatementMetadata.institutionName ? (
                            <Badge variant="outline" className="border-white/25 bg-white/10 text-white/85">
                              Instituição: {activeStatementMetadata.institutionName}
                            </Badge>
                          ) : null}
                          {activeStatementMetadata.agency ? (
                            <Badge variant="outline" className="border-white/25 bg-white/10 text-white/85">
                              Agência: {activeStatementMetadata.agency}
                            </Badge>
                          ) : null}
                          {activeStatementMetadata.account ? (
                            <Badge variant="outline" className="border-white/25 bg-white/10 text-white/85">
                              Conta: {activeStatementMetadata.account}
                            </Badge>
                          ) : null}
                          {activeStatementMetadata.document ? (
                            <Badge variant="outline" className="border-white/25 bg-white/10 text-white/85">
                              Documento: {activeStatementMetadata.document}
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    <BankTransactionList
                      transactions={filteredBankTransactions}
                      selectedId={selectedBankTx?.id || null}
                      onSelect={(tx) => {
                        setSelectedBankTx(tx);
                        setSearchTerm("");
                      }}
                      isLoading={isLoading}
                      fileNameByStatementId={fileNameByStatementId}
                      showFileBadge={activeStatementFileId === "__all__"}
                      theme="dark"
                    />
                  </CardContent>
                </Card>

                <ReconciliationActionsPanel
                  selectedTx={selectedBankTx}
                  allTransactions={filteredBankTransactions}
                  theme="dark"
                  matchSuggestion={
                    selectedBankTx && reconciliationMatches
                      ? (() => {
                        const matchDetails = reconciliationMatches.find((m: any) => m.bank_transaction_id === selectedBankTx.id);
                        const sysTxId = matchDetails?.payable_id || matchDetails?.receivable_id;
                        return systemTransactions?.find(s => s.id === sysTxId);
                      })()
                      : undefined
                  }
                  onConciliate={() => {
                    const matchDetails = reconciliationMatches?.find((m: any) => m.bank_transaction_id === selectedBankTx?.id);
                    const sysTxId = matchDetails?.payable_id || matchDetails?.receivable_id;
                    const sysTx = systemTransactions?.find(s => s.id === sysTxId);

                    if (matchDetails && selectedBankTx && sysTx) {
                      matchTransaction.mutate({
                        bankTx: selectedBankTx,
                        sysTx: sysTx,
                        matchType: 'auto',
                        existingMatchId: matchDetails.id
                      });
                    }
                  }}
                  onNewPayable={() => selectedBankTx && setCreateTxDialogState({
                    isOpen: true,
                    type: 'payable',
                    bankTx: selectedBankTx
                  })}
                  onNewReceivable={() => selectedBankTx && setCreateTxDialogState({
                    isOpen: true,
                    type: 'receivable',
                    bankTx: selectedBankTx
                  })}
                  onNewTransfer={() => { }} // Placeholder for now
                  onSearchExisting={() => {
                    // TODO: Implement Manual Search Dialog
                    alert("Busca manual em breve");
                  }}
                  onIgnore={() => {
                    if (selectedBankTx && selectedBankTx.id) {
                      ignoreBankTransaction.mutate(selectedBankTx.id);
                    }
                  }}
                />
              </div>
            </div >
          </TabsContent >

          <TabsContent value="report" className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/10 p-4 rounded-lg border border-white/20 backdrop-blur-sm">
              <div className="flex flex-col">
                <h3 className="text-lg font-semibold text-white">Resumo do Período</h3>
                <p className="text-sm text-white/75">Selecione o intervalo de datas para o relatório.</p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={reportDateRange.start}
                  onChange={(e) => setReportDateRange((prev) => ({ ...prev, start: e.target.value }))}
                  className="h-9 w-40 border-white/25 bg-white/10 text-white"
                />
                <span className="text-white/70">até</span>
                <Input
                  type="date"
                  value={reportDateRange.end}
                  onChange={(e) => setReportDateRange((prev) => ({ ...prev, end: e.target.value }))}
                  className="h-9 w-40 border-white/25 bg-white/10 text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-white/20 bg-white/10 backdrop-blur-sm">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-white/80">Matches Encontrados</CardTitle></CardHeader>
                <CardContent><div className="text-2xl font-bold text-emerald-300">{reportData.matches.length}</div></CardContent>
              </Card>
              <Card className="border-white/20 bg-white/10 backdrop-blur-sm">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-white/80">Pendentes no Banco</CardTitle></CardHeader>
                <CardContent><div className="text-2xl font-bold text-blue-300">{reportData.pendingBank.length}</div></CardContent>
              </Card>
              <Card className="border-white/20 bg-white/10 backdrop-blur-sm">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-white/80">Pendentes no Sistema</CardTitle></CardHeader>
                <CardContent><div className="text-2xl font-bold text-amber-300">{reportData.pendingSystem.length}</div></CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="col-span-1 lg:col-span-2 border-white/20 bg-white/10 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-emerald-300">
                    <Check className="h-5 w-5" /> Correspondências (Matches)
                  </CardTitle>
                  <CardDescription className="text-white/75">Itens que o sistema conciliou automaticamente ou manualmente.</CardDescription>
                </CardHeader>
                <CardContent>
                  {!reportData.matches.length ? (
                    <div className="text-center py-8 text-white/75">Nenhum match encontrado.</div>
                  ) : (
                    <Table containerClassName="rounded-xl border-white/20 bg-white/5 shadow-none ring-0" className="text-white">
                      <TableHeader className="!bg-white/10 text-white/80 [&_tr]:border-white/15">
                        <TableRow className="odd:bg-white/10 even:bg-white/10 hover:bg-white/10">
                          <TableHead className="text-white/80">Data</TableHead>
                          <TableHead className="text-white/80">Valor</TableHead>
                          <TableHead className="text-white/80">Tipo</TableHead>
                          <TableHead className="text-white/80">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="text-white/85">
                        {reportData.matches.map((m: any) => (
                          <TableRow key={m.id} className="border-white/10 odd:bg-transparent even:bg-transparent hover:bg-white/10">
                            <TableCell>{m.matched_date ? format(parseISO(m.matched_date), 'dd/MM/yyyy') : '-'}</TableCell>
                            <TableCell>{formatCurrency(m.matched_amount)}</TableCell>
                            <TableCell>{m.match_type === 'auto' ? 'Automático' : 'Manual'}</TableCell>
                            <TableCell>
                              <Badge variant={m.status === 'confirmed' ? 'default' : 'secondary'} className={m.status === "confirmed" ? "bg-emerald-600 text-white" : "border-white/20 bg-white/15 text-white"}>
                                {m.status === 'confirmed' ? 'Confirmado' : 'Sugerido'}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card className="border-white/20 bg-white/10 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-blue-300 flex items-center gap-2">
                    <AlertCircle className="h-5 w-5" /> Pendentes no Banco
                  </CardTitle>
                  <CardDescription className="text-white/75">Transações no extrato sem correspondência.</CardDescription>
                </CardHeader>
                <CardContent>
                  {!reportData.pendingBank.length ? (
                    <div className="text-center py-8 text-white/75">Nenhuma pendência.</div>
                  ) : (
                    <ScrollArea className="h-[400px]">
                      <Table containerClassName="rounded-xl border-white/20 bg-white/5 shadow-none ring-0" className="text-white">
                        <TableHeader className="!bg-white/10 text-white/80 [&_tr]:border-white/15">
                          <TableRow className="odd:bg-white/10 even:bg-white/10 hover:bg-white/10">
                            <TableHead className="text-white/80">Data</TableHead>
                            <TableHead className="text-white/80">Descrição</TableHead>
                            <TableHead className="text-right text-white/80">Valor</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="text-white/85">
                          {reportData.pendingBank.map((bt: any) => (
                            <TableRow key={bt.id} className="border-white/10 odd:bg-transparent even:bg-transparent hover:bg-white/10">
                              <TableCell>{format(parseISO(bt.date), 'dd/MM/yyyy')}</TableCell>
                              <TableCell className="text-xs text-white/85">{bt.description}</TableCell>
                              <TableCell className={`text-right font-medium ${bt.amount < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                {formatCurrency(bt.amount)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>

              <Card className="border-white/20 bg-white/10 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-amber-300 flex items-center gap-2">
                    <AlertCircle className="h-5 w-5" /> Pendentes no Sistema
                  </CardTitle>
                  <CardDescription className="text-white/75">Contas a pagar/receber sem baixa bancária.</CardDescription>
                </CardHeader>
                <CardContent>
                  {!reportData.pendingSystem.length ? (
                    <div className="text-center py-8 text-white/75">Nenhuma pendência.</div>
                  ) : (
                    <ScrollArea className="h-[400px]">
                      <Table containerClassName="rounded-xl border-white/20 bg-white/5 shadow-none ring-0" className="text-white">
                        <TableHeader className="!bg-white/10 text-white/80 [&_tr]:border-white/15">
                          <TableRow className="odd:bg-white/10 even:bg-white/10 hover:bg-white/10">
                            <TableHead className="text-white/80">Vencimento</TableHead>
                            <TableHead className="text-white/80">Entidade</TableHead>
                            <TableHead className="text-right text-white/80">Valor</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="text-white/85">
                          {reportData.pendingSystem.map((st: any) => (
                            <TableRow key={st.id} className="border-white/10 odd:bg-transparent even:bg-transparent hover:bg-white/10">
                              <TableCell>{format(parseISO(st.date), 'dd/MM/yyyy')}</TableCell>
                              <TableCell className="text-xs">
                                <div className="font-medium text-white">{st.entity_name}</div>
                                <div className="text-white/70">{st.description}</div>
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {formatCurrency(st.amount)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs >
      )
      }

      {/* Dialogs outside the component but still using its state? No, must be inside, so I will move them inside before closing brace */}
      <Dialog open={!!selectedBankTx} onOpenChange={(open) => !open && setSelectedBankTx(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col border-white/20 bg-[#123754] text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Conciliar Manualmente</DialogTitle>
            <DialogDescription className="text-white/75">Selecione um lançamento do sistema para vincular a esta transação.</DialogDescription>
          </DialogHeader>

          {selectedBankTx && (
            <div className="flex-1 flex gap-4 overflow-hidden">
              {/* Painel Esquerdo: Detalhes Expandidos da Transação Bancária */}
              <div className="w-[35%] border-r border-white/10 pr-6 overflow-y-auto">
                <div className="space-y-5">
                  <div>
                    <h3 className="text-[13px] font-bold uppercase tracking-wider text-white/50 mb-4">Dados do Banco</h3>
                    <div className="bg-white/5 p-4 rounded-xl border border-white/10 space-y-4 backdrop-blur-sm shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-sky-400 to-emerald-400 opacity-50" />

                      <div>
                        <p className="text-[11px] uppercase font-semibold tracking-wider text-white/40 mb-1">Descrição Original</p>
                        <p className="font-medium text-sm text-white break-words leading-relaxed">{selectedBankTx.description || "—"}</p>
                      </div>

                      {selectedBankTx.memo && (
                        <div>
                          <p className="text-[11px] uppercase font-semibold tracking-wider text-white/40 mb-1">Detalhes (Memo)</p>
                          <div className="bg-black/20 p-2.5 rounded-lg border border-white/5">
                            <p className="text-xs leading-relaxed text-white/70 break-words">{selectedBankTx.memo}</p>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/5">
                        <div>
                          <p className="text-[11px] uppercase font-semibold tracking-wider text-white/40 mb-1">Data</p>
                          <p className="text-sm font-medium text-white/90">
                            {format(parseISO(selectedBankTx.date), "dd/MM/yyyy")}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase font-semibold tracking-wider text-white/40 mb-1">Valor</p>
                          <p className={`text-base font-bold ${selectedBankTx.amount < 0 ? "text-rose-400" : "text-emerald-400"}`}>
                            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(selectedBankTx.amount)}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/5">
                        <div>
                          <p className="text-[11px] uppercase font-semibold tracking-wider text-white/40 mb-1.5">Detalhes Extras</p>
                          <div className="flex flex-wrap gap-1.5">
                            <Badge variant="outline" className="text-[10px] border-transparent bg-white/10 text-white/70 font-medium">
                              {selectedBankTx.status === 'reconciled' ? 'Conciliado' : selectedBankTx.status === 'ignored' ? 'Ignorado' : 'Pendente'}
                            </Badge>
                            {selectedBankTx.source && (
                              <Badge variant="outline" className="text-[10px] border-transparent bg-sky-500/15 text-sky-300 font-medium capitalize">
                                {selectedBankTx.source}
                              </Badge>
                            )}
                          </div>
                        </div>
                        {selectedBankTx.fit_id && (
                          <div>
                            <p className="text-[11px] uppercase font-semibold tracking-wider text-white/40 mb-1">ID Transação</p>
                            <p className="text-[10px] font-mono text-white/50 break-all bg-black/20 p-1.5 rounded">{selectedBankTx.fit_id}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Informações adicionais se houver */}
                  {(selectedBankTx.reconciled_payable_id || selectedBankTx.reconciled_receivable_id) && (
                    <div className="bg-emerald-500/10 p-4 rounded-xl border border-emerald-500/20">
                      <h4 className="text-[11px] uppercase font-semibold tracking-wider text-emerald-400/80 mb-1.5">Status de Vinculação</h4>
                      <p className="text-sm font-medium text-emerald-300">
                        {selectedBankTx.reconciled_payable_id ? "Já vinculado a uma Conta a Pagar" : "Já vinculado a uma Conta a Receber"}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Painel Direito: Lista de Lançamentos para Conciliação */}
              <div className="flex-1 overflow-y-auto pl-6 flex flex-col">
                <div className="flex items-center justify-between gap-4 mb-5">
                  <div>
                    <h3 className="text-[14px] font-bold text-white mb-1">Buscar no Sistema</h3>
                    <p className="text-xs text-white/50">Selecione o registro correspondente para fazer o match</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="gap-2 h-9 border-transparent bg-sky-500 text-white hover:bg-sky-600 shadow-sm"
                    onClick={() => {
                      if (!selectedBankTx) return;
                      setCreateTxDialogState({
                        isOpen: true,
                        type: selectedBankTx.amount < 0 ? "payable" : "receivable",
                        bankTx: selectedBankTx,
                      });
                      setSelectedBankTx(null);
                    }}
                    disabled={!selectedBankTx}
                    title={!selectedBankTx ? "Selecione uma transação bancária" : "Criar novo lançamento com estes dados"}
                  >
                    <PlusCircle className="h-4 w-4" />
                    Novo {selectedBankTx.amount < 0 ? "a Pagar" : "a Receber"}
                  </Button>
                </div>

                <div className="relative mb-4">
                  <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-white/40" />
                  <Input
                    placeholder="Busque por descrição, valor ou fornecedor/cliente..."
                    className="pl-10 h-10 border-white/10 bg-black/20 text-sm text-white placeholder:text-white/30 rounded-xl focus-visible:ring-1 focus-visible:ring-sky-500"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                <ScrollArea className="flex-1 border border-white/5 rounded-xl bg-black/10">
                  <div className="p-2 space-y-1.5 min-h-[300px]">
                    {!filteredSystemTransactions?.length ? (
                      <div className="flex flex-col items-center justify-center h-48 text-center px-4">
                        <Ban className="w-8 h-8 text-white/20 mb-3" />
                        <p className="text-sm font-medium text-white/60 mb-1">Nenhum lançamento encontrado</p>
                        <p className="text-xs text-white/40">Busque por outros termos ou crie um novo registro.</p>
                      </div>
                    ) : (
                      filteredSystemTransactions.map((st) => (
                        <div
                          key={`${st.type}-${st.id}`}
                          className="group flex items-start justify-between gap-4 p-3.5 bg-white/5 hover:bg-white/10 rounded-lg cursor-pointer border border-transparent hover:border-white/15 transition-all w-full"
                          onClick={() => {
                            startConfirm(selectedBankTx, st);
                            setSelectedBankTx(null);
                          }}
                        >
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className={cn(
                                "h-5 text-[9px] uppercase font-bold tracking-wider px-1.5 border-transparent",
                                st.type === "payable" ? "bg-rose-500/15 text-rose-400" : "bg-emerald-500/15 text-emerald-400"
                              )}>
                                {st.type === "payable" ? "Pagar" : "Receber"}
                              </Badge>
                              <span className="font-medium text-sm text-white truncate group-hover:text-white transition-colors">{st.description}</span>
                            </div>

                            <div className="flex items-center gap-2 text-[11px] text-white/50">
                              <span className="font-medium text-white/70 truncate max-w-[150px]">{st.entity_name || "Sem entidade"}</span>
                              <span className="w-1 h-1 rounded-full bg-white/20" />
                              <span className="shrink-0">{format(parseISO(st.date), "dd/MM/yyyy")}</span>
                              <span className="w-1 h-1 rounded-full bg-white/20" />
                              <span className="truncate">{st.category_label || "Sem categoria"}</span>
                            </div>
                          </div>

                          <div className="text-right flex-shrink-0 flex flex-col justify-center h-full">
                            <div className={cn(
                              "font-bold text-[15px] mb-1.5",
                              st.type === "payable" ? "text-rose-400" : "text-emerald-400"
                            )}>
                              {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(st.amount)}
                            </div>
                            <span className="text-[9px] uppercase tracking-wider font-semibold text-white/30 truncate max-w-[120px] block">
                              {st.source === "transactions" ? "Transação Direta" : st.source === "accounts_receivable" ? "Conta a Receber" : "Conta a Pagar"}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {confirmPayload && (
        <ReconciliationConfirmDialog
          isOpen={!!confirmPayload}
          onClose={() => setConfirmPayload(null)}
          bankTx={confirmPayload.bankTx}
          sysTx={confirmPayload.sysTx}
          existingMatchId={confirmPayload.existingMatchId}
          isPending={matchTransaction.isPending}
          onConfirm={(payload: ReconciliationPayload) => {
            matchTransaction.mutate(
              {
                bankTx: payload.bankTx,
                sysTx: payload.sysTx,
                fullPayload: payload,
                existingMatchId: payload.existingMatchId,
                matchType: payload.existingMatchId ? "auto" : "manual",
              },
              {
                onSuccess: () => setConfirmPayload(null),
              },
            );
          }}
        />
      )}

      <CreateTransactionDialog
        isOpen={createTxDialogState.isOpen}
        onClose={() => setCreateTxDialogState({ isOpen: false, bankTx: null })}
        bankTx={createTxDialogState.bankTx}
        onCreatePayable={async (data) => {
          const newTx = await createPayable.mutateAsync(data);
          if (createTxDialogState.bankTx) {
            matchTransaction.mutate({
              bankTx: createTxDialogState.bankTx,
              sysTx: {
                id: newTx.id,
                type: 'payable',
                description: newTx.description,
                amount: newTx.amount,
                date: newTx.due_date,
                status: newTx.status,
                entity_name: 'Novo Fornecedor', // O ideal seria buscar o nome, mas ok por agora
                original_table_id: newTx.id
              },
              matchType: 'manual'
            });
          }
        }}
        onCreateReceivable={async (data) => {
          const newTx = await createReceivable.mutateAsync(data);
          if (createTxDialogState.bankTx) {
            matchTransaction.mutate({
              bankTx: createTxDialogState.bankTx,
              sysTx: {
                id: newTx.id,
                type: 'receivable',
                description: newTx.description,
                amount: newTx.amount,
                date: newTx.due_date,
                status: newTx.status,
                entity_name: 'Novo Cliente',
                original_table_id: newTx.id
              },
              matchType: 'manual'
            });
          }
        }}
      />

      <FileDetailsDialog
        open={!!inspectFileId}
        onOpenChange={(open) => !open && setInspectFileId(null)}
        fileId={inspectFileId}
        fileName={statementFiles?.find((f: BankStatementFile) => f.id === inspectFileId)?.file_name}
      />
    </div>
  );
}
