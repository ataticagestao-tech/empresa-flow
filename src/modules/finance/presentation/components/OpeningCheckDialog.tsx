import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Calendar, Wallet } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useToast } from "@/components/ui/use-toast";
import type { OFXSummary } from "@/lib/parsers/ofx";

interface OpeningCheckDialogProps {
    open: boolean;
    onClose: () => void;
    summary: OFXSummary | null;
    systemBalanceAtClose: number | null;
    bankAccountName?: string;
    bankAccountId?: string;
}

interface ChartAccount {
    id: string;
    code: string;
    name: string;
    account_type: string;
    account_nature: string;
}

const fmtBRL = (v: number | null | undefined) => {
    if (v == null || !Number.isFinite(v)) return "—";
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
};

const fmtDate = (d: Date | null) => (d ? format(d, "dd 'de' MMM 'de' yyyy", { locale: ptBR }) : "—");

export function OpeningCheckDialog({ open, onClose, summary, systemBalanceAtClose, bankAccountName, bankAccountId }: OpeningCheckDialogProps) {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const queryClient = useQueryClient();
    const { toast } = useToast();

    const [showAdjustForm, setShowAdjustForm] = useState(false);
    const [contaContabilId, setContaContabilId] = useState("");
    const [creating, setCreating] = useState(false);
    const [creatingCategory, setCreatingCategory] = useState(false);

    const diff = useMemo(() => {
        if (summary?.closingBalance == null || systemBalanceAtClose == null) return null;
        return Number((systemBalanceAtClose - summary.closingBalance).toFixed(2));
    }, [summary, systemBalanceAtClose]);

    const isAligned = diff != null && Math.abs(diff) < 0.01;
    const cannotCompare = summary?.closingBalance == null || systemBalanceAtClose == null;

    // tipo: se sistema > extrato precisa de saida (debito); se sistema < extrato precisa de entrada (credito)
    const tipoAjuste: "credito" | "debito" | null = diff == null || isAligned ? null : (diff > 0 ? "debito" : "credito");

    // Chart of accounts filtrado pra natureza correta do ajuste
    const { data: chartAccounts } = useQuery<ChartAccount[]>({
        queryKey: ["chart_accounts_adjustment", selectedCompany?.id],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data, error } = await (activeClient as any)
                .from("chart_of_accounts")
                .select("id, code, name, account_type, account_nature")
                .eq("company_id", selectedCompany.id)
                .eq("status", "active")
                .eq("is_analytical", true)
                .order("code");
            if (error) return [];
            return (data || []) as ChartAccount[];
        },
        enabled: open && showAdjustForm && !!selectedCompany?.id,
    });

    const filteredAccounts = useMemo(() => {
        if (!chartAccounts) return [];
        // Exclui contas de transferencia — transferencia entre contas e neutra,
        // nao serve pra ajuste de saldo (regra global do projeto: nao impacta DRE)
        const noTransfer = chartAccounts.filter(a => !/transfer/i.test(a.name));
        if (!tipoAjuste) return noTransfer;
        const wantedTypes = tipoAjuste === "credito" ? ["revenue"] : ["expense", "cost"];
        const filtered = noTransfer.filter(a => wantedTypes.includes(a.account_type));
        return filtered.length > 0 ? filtered : noTransfer;
    }, [chartAccounts, tipoAjuste]);

    const existingAjusteCategory = useMemo(() => {
        if (!chartAccounts || !tipoAjuste) return null;
        const wantedNature = tipoAjuste === "credito" ? "credit" : "debit";
        return chartAccounts.find(a =>
            /ajuste\s+de\s+saldo/i.test(a.name) && a.account_nature === wantedNature
        ) || null;
    }, [chartAccounts, tipoAjuste]);

    const handleCreateCategory = async () => {
        if (!selectedCompany?.id || !tipoAjuste) return;
        setCreatingCategory(true);
        try {
            const isEntrada = tipoAjuste === "credito";
            const payload = {
                company_id: selectedCompany.id,
                code: isEntrada ? "9.91.01" : "9.92.01",
                name: isEntrada ? "Ajuste de Saldo (Entrada)" : "Ajuste de Saldo (Saída)",
                level: 3,
                account_type: isEntrada ? "revenue" : "expense",
                account_nature: isEntrada ? "credit" : "debit",
                is_analytical: true,
                is_synthetic: false,
                show_in_dre: false,
                dre_group: null,
                dre_order: null,
                parent_id: null,
                status: "active",
                accepts_manual_entry: true,
            };
            const { data, error } = await (activeClient as any)
                .from("chart_of_accounts")
                .insert(payload)
                .select("id")
                .single();
            if (error) throw error;
            toast({ title: "Categoria criada", description: payload.name });
            await queryClient.invalidateQueries({ queryKey: ["chart_accounts_adjustment", selectedCompany.id] });
            // Pre-seleciona a categoria recem-criada
            if (data?.id) setContaContabilId(data.id);
        } catch (e: any) {
            const msg = e.message || String(e);
            if (msg.includes("unique_code_per_company") || msg.includes("duplicate")) {
                toast({ title: "Categoria ja existe", description: "Recarregue e selecione na lista" });
                await queryClient.invalidateQueries({ queryKey: ["chart_accounts_adjustment", selectedCompany.id] });
            } else {
                toast({ title: "Erro ao criar categoria", description: msg, variant: "destructive" });
            }
        } finally {
            setCreatingCategory(false);
        }
    };

    const resetState = () => {
        setShowAdjustForm(false);
        setContaContabilId("");
        setCreating(false);
    };

    const handleClose = () => {
        resetState();
        onClose();
    };

    const handleCreateAjuste = async () => {
        if (!bankAccountId || !selectedCompany?.id || !contaContabilId || !tipoAjuste || diff == null) return;
        setCreating(true);
        try {
            const closingDate = summary?.closingDate ?? summary?.periodEnd ?? new Date();
            const dataIso = format(closingDate, "yyyy-MM-dd");
            const { error } = await (activeClient as any).from("movimentacoes").insert({
                company_id: selectedCompany.id,
                tipo: tipoAjuste,
                descricao: `Ajuste de saldo de abertura — ${fmtDate(closingDate)}`,
                valor: Math.abs(diff),
                data: dataIso,
                conta_bancaria_id: bankAccountId,
                conta_contabil_id: contaContabilId,
                origem: "manual",
            });
            if (error) throw error;

            toast({
                title: "Ajuste lançado",
                description: `${fmtBRL(Math.abs(diff))} em ${tipoAjuste === "credito" ? "entrada" : "saída"}`,
            });
            queryClient.invalidateQueries({ queryKey: ["movimentacoes"] });
            queryClient.invalidateQueries({ queryKey: ["dashboard_accounts_balance"] });
            queryClient.invalidateQueries({ queryKey: ["bank_transactions_pending"] });
            handleClose();
        } catch (e: any) {
            toast({ title: "Erro ao lançar ajuste", description: e.message || String(e), variant: "destructive" });
        } finally {
            setCreating(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
            <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {isAligned ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        ) : (
                            <AlertTriangle className="h-5 w-5 text-amber-600" />
                        )}
                        Conferência de abertura do extrato
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Período */}
                    <div className="rounded-lg border border-[#EAECF0] p-3 bg-[#F9FAFB]">
                        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#555] mb-2">
                            <Calendar className="h-3.5 w-3.5" /> Período do extrato
                        </div>
                        <div className="text-sm text-[#1D2939]">
                            {fmtDate(summary?.periodStart ?? null)} <span className="text-[#999]">até</span>{" "}
                            {fmtDate(summary?.periodEnd ?? null)}
                        </div>
                        {bankAccountName && (
                            <div className="text-[11px] text-[#667085] mt-1">Conta: {bankAccountName}</div>
                        )}
                    </div>

                    {/* Saldos */}
                    <div className="rounded-lg border border-[#EAECF0] overflow-hidden">
                        <div className="bg-[#F9FAFB] px-3 py-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#555]">
                            <Wallet className="h-3.5 w-3.5" /> Saldo final em {fmtDate(summary?.closingDate ?? summary?.periodEnd ?? null)}
                        </div>
                        <div className="divide-y divide-[#EAECF0]">
                            <div className="px-3 py-2.5 flex items-center justify-between">
                                <span className="text-[12.5px] text-[#555]">Extrato (banco)</span>
                                <span className="text-[14px] font-semibold text-[#1D2939] tabular-nums">
                                    {fmtBRL(summary?.closingBalance)}
                                </span>
                            </div>
                            <div className="px-3 py-2.5 flex items-center justify-between">
                                <span className="text-[12.5px] text-[#555]">Sistema</span>
                                <span className="text-[14px] font-semibold text-[#1D2939] tabular-nums">
                                    {fmtBRL(systemBalanceAtClose)}
                                </span>
                            </div>
                            {!cannotCompare && (
                                <div className={`px-3 py-2.5 flex items-center justify-between ${isAligned ? "bg-emerald-50" : "bg-amber-50"}`}>
                                    <span className="text-[12.5px] font-semibold text-[#555]">Diferença</span>
                                    <span className={`text-[14px] font-bold tabular-nums ${isAligned ? "text-emerald-700" : "text-amber-700"}`}>
                                        {isAligned ? "R$ 0,00 — alinhado" : fmtBRL(diff)}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {cannotCompare && (
                        <p className="text-[12px] text-[#667085]">
                            Não foi possível comparar — o arquivo OFX não traz saldo final ou o sistema ainda não tem saldo inicial cadastrado para esta conta.
                        </p>
                    )}

                    {!isAligned && !cannotCompare && !showAdjustForm && (
                        <p className="text-[12px] text-[#667085]">
                            Há uma diferença entre o saldo do extrato e o do sistema. Antes de conciliar, recomenda-se lançar uma <strong>movimentação de ajuste</strong> de {fmtBRL(Math.abs(diff ?? 0))} em <strong>{tipoAjuste === "credito" ? "entrada" : "saída"}</strong> para alinhar os saldos.
                        </p>
                    )}

                    {showAdjustForm && tipoAjuste && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-3">
                            <div className="text-[12px] text-[#1D2939]">
                                Lançando <strong>{tipoAjuste === "credito" ? "entrada" : "saída"}</strong> de <strong>{fmtBRL(Math.abs(diff ?? 0))}</strong> em {fmtDate(summary?.closingDate ?? summary?.periodEnd ?? null)} na conta <strong>{bankAccountName}</strong>.
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#555] mb-1">
                                    Categoria contábil <span className="text-[#E53E3E]">*</span>
                                </label>
                                <select
                                    value={contaContabilId}
                                    onChange={(e) => setContaContabilId(e.target.value)}
                                    className="w-full border border-[#ccc] rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#059669]"
                                >
                                    <option value="">Selecione...</option>
                                    {existingAjusteCategory && (
                                        <option value={existingAjusteCategory.id}>
                                            ★ {existingAjusteCategory.code} - {existingAjusteCategory.name}
                                        </option>
                                    )}
                                    {filteredAccounts
                                        .filter(a => a.id !== existingAjusteCategory?.id)
                                        .map((a) => (
                                            <option key={a.id} value={a.id}>
                                                {a.code} - {a.name}
                                            </option>
                                        ))}
                                </select>
                                {!existingAjusteCategory && (
                                    <div className="mt-2 flex items-center justify-between gap-2 rounded border border-dashed border-amber-300 bg-amber-100/50 px-2 py-1.5">
                                        <span className="text-[10.5px] text-[#7c2d12]">
                                            Não há categoria "Ajuste de Saldo" cadastrada para {tipoAjuste === "credito" ? "entrada" : "saída"}.
                                        </span>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 text-[10.5px] px-2"
                                            onClick={handleCreateCategory}
                                            disabled={creatingCategory}
                                        >
                                            {creatingCategory ? "Criando..." : "Criar agora"}
                                        </Button>
                                    </div>
                                )}
                                <p className="text-[10.5px] text-[#667085] mt-1">
                                    Sugere-se uma conta de "outras receitas/despesas" ou "ajuste de saldo".
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2">
                    {!isAligned && !cannotCompare && !showAdjustForm && (
                        <Button variant="outline" onClick={() => setShowAdjustForm(true)} disabled={!bankAccountId}>
                            Lançar ajuste agora
                        </Button>
                    )}
                    {showAdjustForm && (
                        <>
                            <Button variant="outline" onClick={() => { setShowAdjustForm(false); setContaContabilId(""); }} disabled={creating}>
                                Cancelar ajuste
                            </Button>
                            <Button onClick={handleCreateAjuste} disabled={!contaContabilId || creating}>
                                {creating ? "Lançando..." : "Confirmar e lançar"}
                            </Button>
                        </>
                    )}
                    {!showAdjustForm && (
                        <Button onClick={handleClose}>
                            {isAligned ? "Iniciar conciliação" : "Conciliar mesmo assim"}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
