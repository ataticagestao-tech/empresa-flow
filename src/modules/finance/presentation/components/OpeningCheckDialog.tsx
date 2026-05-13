import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Calendar, Wallet } from "lucide-react";
import type { OFXSummary } from "@/lib/parsers/ofx";

interface OpeningCheckDialogProps {
    open: boolean;
    onClose: () => void;
    summary: OFXSummary | null;
    systemBalanceAtClose: number | null;
    bankAccountName?: string;
}

const fmtBRL = (v: number | null | undefined) => {
    if (v == null || !Number.isFinite(v)) return "—";
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
};

const fmtDate = (d: Date | null) => (d ? format(d, "dd 'de' MMM 'de' yyyy", { locale: ptBR }) : "—");

export function OpeningCheckDialog({ open, onClose, summary, systemBalanceAtClose, bankAccountName }: OpeningCheckDialogProps) {
    const navigate = useNavigate();

    const diff = useMemo(() => {
        if (summary?.closingBalance == null || systemBalanceAtClose == null) return null;
        return Number((systemBalanceAtClose - summary.closingBalance).toFixed(2));
    }, [summary, systemBalanceAtClose]);

    const isAligned = diff != null && Math.abs(diff) < 0.01;
    const cannotCompare = summary?.closingBalance == null || systemBalanceAtClose == null;

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
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

                    {!isAligned && !cannotCompare && (
                        <p className="text-[12px] text-[#667085]">
                            Há uma diferença entre o saldo do extrato e o do sistema. Antes de conciliar, recomenda-se lançar uma <strong>movimentação de ajuste</strong> de {fmtBRL(diff != null ? -diff : null)} para alinhar os saldos. Sem isso, a conciliação parte de uma base inconsistente.
                        </p>
                    )}
                </div>

                <DialogFooter className="gap-2">
                    {!isAligned && !cannotCompare && (
                        <Button variant="outline" onClick={() => { navigate("/movimentacoes"); onClose(); }}>
                            Lançar ajuste em Movimentações
                        </Button>
                    )}
                    <Button onClick={onClose}>
                        {isAligned ? "Iniciar conciliação" : "Conciliar mesmo assim"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
