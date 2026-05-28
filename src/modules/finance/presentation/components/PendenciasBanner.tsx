import { useState } from "react";
import { AlertTriangle, ArrowRight, X } from "lucide-react";

import { usePendenciasReclassificacao } from "../hooks/usePendenciasReclassificacao";
import { PendenciasReclassificacaoDialog } from "./PendenciasReclassificacaoDialog";
import { formatBRL } from "@/lib/format";

interface Props {
    variant?: "full" | "compact";
    filter?: "credito" | "debito" | "all";
    className?: string;
}

export function PendenciasBanner({ variant = "full", filter = "all", className = "" }: Props) {
    const { data } = usePendenciasReclassificacao();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [dismissedCount, setDismissedCount] = useState<number | null>(() => {
        const v = localStorage.getItem("pendencias_reclass_dismissed");
        return v != null ? Number(v) : null;
    });

    if (!data) return null;

    const showCredito = filter === "all" || filter === "credito";
    const showDebito = filter === "all" || filter === "debito";

    const count =
        filter === "credito" ? data.creditoCount
        : filter === "debito" ? data.debitoCount
        : data.totalCount;

    const total =
        filter === "credito" ? data.totalCredito
        : filter === "debito" ? data.totalDebito
        : data.totalCredito + data.totalDebito;

    if (count === 0) return null;

    const parts: string[] = [];
    if (showCredito && data.creditoCount > 0) {
        parts.push(`${data.creditoCount} recebimento${data.creditoCount > 1 ? "s" : ""} (${formatBRL(data.totalCredito)})`);
    }
    if (showDebito && data.debitoCount > 0) {
        parts.push(`${data.debitoCount} pagamento${data.debitoCount > 1 ? "s" : ""} (${formatBRL(data.totalDebito)})`);
    }

    if (variant === "compact") {
        return (
            <>
                <button
                    type="button"
                    onClick={() => setDialogOpen(true)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[#fbbf24] bg-[#FFF0EB] text-[#7a5400] text-[11px] font-semibold hover:bg-[#fde68a] transition-colors cursor-pointer ${className}`}
                    title="Reclassificar movimentações pendentes"
                >
                    <AlertTriangle className="h-3 w-3" />
                    <span>{count} pendência{count > 1 ? "s" : ""} de reclassificação</span>
                    <span className="text-[#9a6e00] tabular-nums">· {formatBRL(total)}</span>
                </button>
                <PendenciasReclassificacaoDialog
                    open={dialogOpen}
                    onOpenChange={setDialogOpen}
                    filter={filter}
                />
            </>
        );
    }

    if (dismissedCount === count) return null;

    const dismiss = () => {
        localStorage.setItem("pendencias_reclass_dismissed", String(count));
        setDismissedCount(count);
    };

    return (
        <>
            <div className={`flex items-start gap-3 px-4 py-3 rounded-md border border-[#fbbf24] bg-[#FFF0EB] ${className}`}>
                <AlertTriangle className="h-4 w-4 text-[#EA580C] flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold text-[#7a5400]">
                        {count} movimenta{count > 1 ? "ções" : "ção"} pendente{count > 1 ? "s" : ""} de reclassificação
                    </p>
                    <p className="text-[11px] text-[#9a6e00] mt-0.5">
                        {parts.join(" · ")}. Atribua uma categoria contábil para que apareçam no DRE.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setDialogOpen(true)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#059669] hover:underline whitespace-nowrap flex-shrink-0 cursor-pointer"
                >
                    Reclassificar <ArrowRight className="h-3 w-3" />
                </button>
                <button
                    type="button"
                    onClick={dismiss}
                    aria-label="Dispensar aviso"
                    title="Dispensar"
                    className="flex-shrink-0 -mt-0.5 -mr-1 p-1 rounded text-[#9a6e00] hover:bg-[#fde68a] transition-colors cursor-pointer"
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>
            <PendenciasReclassificacaoDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                filter={filter}
            />
        </>
    );
}
