import { useRef, useState } from "react";
import {
    Plus, Trash2, FileText, Check, Upload, ExternalLink, Loader2, Paperclip,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatBRL } from "@/lib/format";
import { useClientContratos, ContratoVenda } from "../hooks/useClientContratos";

const statusLabel: Record<string, { label: string; className: string }> = {
    confirmado: { label: "Ativo", className: "bg-[#e6f4ec] text-[#0a5c2e] border-[#0a5c2e]" },
    orcamento: { label: "Orçamento", className: "bg-[#fffbe6] text-[#5c3a00] border-[#b8960a]" },
    cancelado: { label: "Cancelado", className: "bg-[#f5f5f5] text-[#555] border-[#aaa]" },
};

interface TabContractsProps {
    clientId?: string;
    clientName?: string;
    clientCpfCnpj?: string;
}

export function TabContracts({ clientId, clientName, clientCpfCnpj }: TabContractsProps) {
    const { contratos, isLoading, createContrato, deleteContrato, uploadContratoPdf } =
        useClientContratos(clientCpfCnpj);

    const [dialogOpen, setDialogOpen] = useState(false);

    if (!clientId) {
        return (
            <div className="pt-6 pb-8 text-center text-sm text-[#888]">
                Salve o cliente antes de cadastrar contratos.
            </div>
        );
    }

    if (!clientCpfCnpj) {
        return (
            <div className="pt-6 pb-8 text-center text-sm text-[#888]">
                Cadastre o CPF/CNPJ do cliente antes de criar contratos —
                vinculamos o contrato ao documento.
            </div>
        );
    }

    return (
        <div className="pt-4 space-y-4 animate-in fade-in duration-300">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-bold text-[#1a2e4a]">
                        Contratos {clientName ? `· ${clientName}` : ""}
                    </h3>
                    <p className="text-[11px] text-[#888]">
                        {contratos.length} contrato{contratos.length === 1 ? "" : "s"} · pagamentos abatem automaticamente do saldo
                    </p>
                </div>
                <Button
                    type="button"
                    onClick={() => setDialogOpen(true)}
                    className="bg-[#1a2e4a] hover:bg-[#0f1f33] text-white"
                >
                    <Plus className="h-4 w-4 mr-1" /> Novo contrato
                </Button>
            </div>

            {isLoading ? (
                <div className="py-10 text-center">
                    <Loader2 className="h-6 w-6 mx-auto animate-spin text-[#888]" />
                </div>
            ) : contratos.length === 0 ? (
                <div className="py-10 text-center border border-dashed border-[#ddd] rounded">
                    <FileText className="h-10 w-10 mx-auto text-[#ccc] mb-2" />
                    <p className="text-sm text-[#888]">Nenhum contrato cadastrado</p>
                    <p className="text-[11px] text-[#aaa]">Clique em "Novo contrato" para começar</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {contratos.map((c) => (
                        <ContratoCard
                            key={c.id}
                            contrato={c}
                            onDelete={() => {
                                if (confirm("Excluir este contrato? Parcelas em aberto serão removidas. Parcelas pagas impedem exclusão.")) {
                                    deleteContrato.mutate(c.id);
                                }
                            }}
                            onUploadPdf={(file) => uploadContratoPdf.mutate({ vendaId: c.id, file })}
                            uploading={uploadContratoPdf.isPending}
                        />
                    ))}
                </div>
            )}

            <ContratoDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                clientName={clientName || ""}
                onSubmit={async (input) => {
                    await createContrato.mutateAsync(input);
                    setDialogOpen(false);
                }}
                saving={createContrato.isPending}
            />
        </div>
    );
}

/* ─── Card de contrato ─────────────────────────────────────── */

function ContratoCard({
    contrato,
    onDelete,
    onUploadPdf,
    uploading,
}: {
    contrato: ContratoVenda;
    onDelete: () => void;
    onUploadPdf: (file: File) => void;
    uploading: boolean;
}) {
    const fileRef = useRef<HTMLInputElement>(null);
    const progresso = contrato.valor_total > 0 ? (contrato.total_pago / contrato.valor_total) * 100 : 0;
    const statusInfo = statusLabel[contrato.status] || statusLabel.confirmado;

    return (
        <div className="border border-[#e0e0e0] rounded p-4 hover:border-[#1a2e4a] transition-colors">
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-bold text-[#1a2e4a]">{contrato.descricao}</h4>
                        <Badge variant="outline" className={`text-[10px] ${statusInfo.className}`}>
                            {statusInfo.label}
                        </Badge>
                        {contrato.contrato_url && (
                            <a
                                href={contrato.contrato_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-[#1a2e4a] inline-flex items-center gap-1 hover:underline"
                            >
                                <Paperclip className="h-3 w-3" /> PDF
                                <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                        )}
                    </div>
                    <p className="text-[11px] text-[#666] mt-1">
                        Venda/Assinatura: {formatDate(contrato.data_venda)}
                        {contrato.previsao_cirurgia
                            ? ` · Cirurgia prevista: ${formatDate(contrato.previsao_cirurgia)}`
                            : ""}
                    </p>
                </div>
                <div className="flex gap-1">
                    <input
                        ref={fileRef}
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) onUploadPdf(f);
                            e.target.value = "";
                        }}
                    />
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => fileRef.current?.click()}
                        disabled={uploading}
                        className="h-7 w-7 p-0"
                        title={contrato.contrato_url ? "Trocar PDF" : "Anexar PDF"}
                    >
                        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={onDelete}
                        className="h-7 w-7 p-0 text-[#8b0000] hover:text-[#8b0000] hover:bg-[#fdecea]"
                        title="Excluir contrato"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-[#f0f0f0]">
                <Metric label="Valor total" value={formatBRL(contrato.valor_total)} />
                <Metric label="Pago" value={formatBRL(contrato.total_pago)} color="#0a5c2e" />
                <Metric label="Saldo" value={formatBRL(contrato.saldo)} color={contrato.saldo > 0 ? "#8b0000" : "#0a5c2e"} />
            </div>

            <div className="mt-3">
                <Progress value={progresso} className="h-1.5" />
                <p className="text-[10px] text-[#888] mt-1 text-right">{progresso.toFixed(1)}% quitado</p>
            </div>

            {contrato.crs.length > 0 && (
                <p className="text-[10px] text-[#888] mt-2 text-right">
                    {contrato.crs.length} pagamento{contrato.crs.length === 1 ? "" : "s"} vinculado{contrato.crs.length === 1 ? "" : "s"} · detalhes em Contas a Receber
                </p>
            )}
        </div>
    );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
    return (
        <div>
            <p className="text-[9px] text-[#888] uppercase font-bold tracking-wide">{label}</p>
            <p className="text-xs font-bold mt-0.5" style={{ color: color || "#1a2e4a" }}>{value}</p>
        </div>
    );
}

/* ─── Dialog de criação (4 campos apenas) ────────────────────── */

interface ContratoDialogProps {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    clientName: string;
    onSubmit: (input: {
        clientName: string;
        descricao: string;
        valor: number;
        data_venda: string;
        previsao_cirurgia?: string | null;
    }) => Promise<void>;
    saving: boolean;
}

function ContratoDialog({ open, onOpenChange, clientName, onSubmit, saving }: ContratoDialogProps) {
    const [descricao, setDescricao] = useState("");
    const [valor, setValor] = useState("");
    const [dataVenda, setDataVenda] = useState(new Date().toISOString().slice(0, 10));
    const [previsaoCirurgia, setPrevisaoCirurgia] = useState("");

    const resetOnOpen = (v: boolean) => {
        if (v) {
            setDescricao("");
            setValor("");
            setDataVenda(new Date().toISOString().slice(0, 10));
            setPrevisaoCirurgia("");
        }
        onOpenChange(v);
    };

    const handleSubmit = async () => {
        if (!descricao.trim()) return alert("Descrição é obrigatória");
        const v = parseFloat(valor);
        if (!v || v <= 0) return alert("Valor inválido");
        if (!dataVenda) return alert("Data de venda é obrigatória");

        await onSubmit({
            clientName,
            descricao: descricao.trim(),
            valor: v,
            data_venda: dataVenda,
            previsao_cirurgia: previsaoCirurgia || null,
        });
    };

    return (
        <Dialog open={open} onOpenChange={resetOnOpen}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Novo contrato</DialogTitle>
                    <DialogDescription>
                        Os pagamentos deste contrato serão registrados via Contas a Receber
                        e abatidos automaticamente do saldo.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div>
                        <Label className="text-[10px] font-bold uppercase text-[#555]">Descrição</Label>
                        <Input
                            value={descricao}
                            onChange={(e) => setDescricao(e.target.value)}
                            placeholder="Ex: Transplante capilar"
                        />
                    </div>

                    <div>
                        <Label className="text-[10px] font-bold uppercase text-[#555]">Valor (R$)</Label>
                        <Input
                            type="number"
                            step="0.01"
                            value={valor}
                            onChange={(e) => setValor(e.target.value)}
                            placeholder="0,00"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label className="text-[10px] font-bold uppercase text-[#555]">Data de venda (assinatura)</Label>
                            <Input
                                type="date"
                                value={dataVenda}
                                onChange={(e) => setDataVenda(e.target.value)}
                            />
                        </div>
                        <div>
                            <Label className="text-[10px] font-bold uppercase text-[#555]">Previsão de cirurgia</Label>
                            <Input
                                type="date"
                                value={previsaoCirurgia}
                                onChange={(e) => setPrevisaoCirurgia(e.target.value)}
                            />
                        </div>
                    </div>

                    <p className="text-[10px] text-[#888] italic">
                        O PDF do contrato pode ser anexado após a criação, clicando no ícone de upload no card.
                    </p>
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        Cancelar
                    </Button>
                    <Button
                        type="button"
                        onClick={handleSubmit}
                        disabled={saving}
                        className="bg-[#1a2e4a] hover:bg-[#0f1f33] text-white"
                    >
                        {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                        Criar contrato
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/* ─── Helpers ──────────────────────────────────────────────── */

function formatDate(iso: string | null | undefined): string {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
}
