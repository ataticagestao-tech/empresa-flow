import { useRef, useState } from "react";
import {
    Plus, Trash2, FileText, Check, Upload, ExternalLink, Loader2, Paperclip,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatBRL } from "@/lib/format";
import { useClientContratos, ContratoVenda } from "../hooks/useClientContratos";

type Modalidade = "fixo" | "variavel";

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
                        Início: {formatDate(contrato.data_venda)}
                        {contrato.data_contrato && contrato.data_contrato !== contrato.data_venda
                            ? ` · Assinado: ${formatDate(contrato.data_contrato)}`
                            : ""}
                        {` · ${contrato.parcelas}x`}
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

            <div className="grid grid-cols-4 gap-3 mt-3 pt-3 border-t border-[#f0f0f0]">
                <Metric label="Valor total" value={formatBRL(contrato.valor_total)} />
                <Metric label="Pago" value={formatBRL(contrato.total_pago)} color="#0a5c2e" />
                <Metric label="Saldo" value={formatBRL(contrato.saldo)} color={contrato.saldo > 0 ? "#8b0000" : "#0a5c2e"} />
                <Metric label="Parcelas" value={`${contrato.parcelas_pagas}/${contrato.crs.length}`} />
            </div>

            <div className="mt-3">
                <Progress value={progresso} className="h-1.5" />
                <p className="text-[10px] text-[#888] mt-1 text-right">{progresso.toFixed(1)}% quitado</p>
            </div>

            {/* Parcelas (colapsavel futuro — por enquanto inline se <=6) */}
            {contrato.crs.length > 0 && contrato.crs.length <= 6 && (
                <div className="mt-3 pt-3 border-t border-[#f0f0f0] space-y-1">
                    {contrato.crs.map((p) => (
                        <div key={p.id} className="flex items-center justify-between text-[11px]">
                            <span className="text-[#666]">
                                #{p.numero} · vence {formatDate(p.data_vencimento)}
                            </span>
                            <div className="flex items-center gap-2">
                                <span className={`font-bold ${p.status === "pago" ? "text-[#0a5c2e]" : "text-[#1a2e4a]"}`}>
                                    {formatBRL(p.valor)}
                                </span>
                                {p.valor_pago > 0 && p.valor_pago < p.valor && (
                                    <span className="text-[9px] text-[#b8960a]">parcial: {formatBRL(p.valor_pago)}</span>
                                )}
                                <ParcelaStatusBadge status={p.status} />
                            </div>
                        </div>
                    ))}
                </div>
            )}
            {contrato.crs.length > 6 && (
                <p className="text-[10px] text-[#888] mt-2 text-right">
                    {contrato.crs.length} parcelas · veja detalhes em Contas a Receber
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

function ParcelaStatusBadge({ status }: { status: string }) {
    const map: Record<string, string> = {
        pago: "bg-[#e6f4ec] text-[#0a5c2e]",
        aberto: "bg-[#f0f4f8] text-[#1a2e4a]",
        parcial: "bg-[#fffbe6] text-[#5c3a00]",
        vencido: "bg-[#fdecea] text-[#8b0000]",
        cancelado: "bg-[#f5f5f5] text-[#555]",
    };
    const labels: Record<string, string> = {
        pago: "Pago", aberto: "Aberto", parcial: "Parcial", vencido: "Vencido", cancelado: "Cancelado",
    };
    return (
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${map[status] || map.aberto}`}>
            {labels[status] || status}
        </span>
    );
}

/* ─── Dialog de criação ─────────────────────────────────────── */

interface ContratoDialogProps {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    clientName: string;
    onSubmit: (input: {
        clientName: string;
        descricao: string;
        modalidade: "fixo" | "variavel";
        valor_total: number;
        numero_parcelas: number;
        data_inicio: string;
        dia_vencimento: number;
        data_contrato?: string;
        parcelas_custom?: Array<{ valor: number; data_vencimento: string }>;
        contrato_url?: string | null;
        observacoes?: string;
    }) => Promise<void>;
    saving: boolean;
}

function ContratoDialog({ open, onOpenChange, clientName, onSubmit, saving }: ContratoDialogProps) {
    const [descricao, setDescricao] = useState("");
    const [modalidade, setModalidade] = useState<Modalidade>("fixo");
    const [valorTotal, setValorTotal] = useState("");
    const [numeroParcelas, setNumeroParcelas] = useState("1");
    const [dataInicio, setDataInicio] = useState(new Date().toISOString().slice(0, 10));
    const [dataContrato, setDataContrato] = useState("");
    const [diaVencimento, setDiaVencimento] = useState("10");
    const [observacoes, setObservacoes] = useState("");
    const [parcelasVariaveis, setParcelasVariaveis] = useState<Array<{ valor: string; data: string }>>([
        { valor: "", data: "" },
    ]);

    const resetOnOpen = (v: boolean) => {
        if (v) {
            setDescricao("");
            setModalidade("fixo");
            setValorTotal("");
            setNumeroParcelas("1");
            setDataInicio(new Date().toISOString().slice(0, 10));
            setDataContrato("");
            setDiaVencimento("10");
            setObservacoes("");
            setParcelasVariaveis([{ valor: "", data: "" }]);
        }
        onOpenChange(v);
    };

    const addParcela = () =>
        setParcelasVariaveis((p) => [...p, { valor: "", data: "" }]);

    const removeParcela = (idx: number) =>
        setParcelasVariaveis((p) => p.filter((_, i) => i !== idx));

    const updateParcela = (idx: number, field: "valor" | "data", value: string) =>
        setParcelasVariaveis((p) => {
            const next = [...p];
            next[idx] = { ...next[idx], [field]: value };
            return next;
        });

    const totalVariavel = parcelasVariaveis.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0);

    const handleSubmit = async () => {
        if (!descricao.trim()) return alert("Descrição é obrigatória");

        if (modalidade === "fixo") {
            const vt = parseFloat(valorTotal);
            const n = parseInt(numeroParcelas, 10);
            if (!vt || vt <= 0) return alert("Valor total inválido");
            if (!n || n < 1) return alert("Número de parcelas inválido");

            await onSubmit({
                clientName,
                descricao: descricao.trim(),
                modalidade: "fixo",
                valor_total: vt,
                numero_parcelas: n,
                data_inicio: dataInicio,
                dia_vencimento: parseInt(diaVencimento, 10),
                data_contrato: dataContrato || undefined,
                observacoes: observacoes.trim() || undefined,
            });
        } else {
            const valid = parcelasVariaveis
                .filter((p) => p.valor && p.data)
                .map((p) => ({ valor: parseFloat(p.valor), data_vencimento: p.data }));
            if (valid.length === 0) return alert("Adicione pelo menos uma parcela");
            const vt = valid.reduce((s, p) => s + p.valor, 0);

            await onSubmit({
                clientName,
                descricao: descricao.trim(),
                modalidade: "variavel",
                valor_total: vt,
                numero_parcelas: valid.length,
                data_inicio: dataInicio,
                dia_vencimento: parseInt(diaVencimento, 10),
                data_contrato: dataContrato || undefined,
                parcelas_custom: valid,
                observacoes: observacoes.trim() || undefined,
            });
        }
    };

    return (
        <Dialog open={open} onOpenChange={resetOnOpen}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Novo contrato</DialogTitle>
                    <DialogDescription>
                        As parcelas virarão Contas a Receber vinculadas a este contrato. Pagamentos abatem o saldo automaticamente.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div>
                        <Label className="text-[10px] font-bold uppercase text-[#555]">Descrição</Label>
                        <Input
                            value={descricao}
                            onChange={(e) => setDescricao(e.target.value)}
                            placeholder="Ex: Pacote de tratamento capilar 12x"
                        />
                    </div>

                    <div>
                        <Label className="text-[10px] font-bold uppercase text-[#555]">Modalidade das parcelas</Label>
                        <Select value={modalidade} onValueChange={(v) => setModalidade(v as Modalidade)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="fixo">Parcelas iguais</SelectItem>
                                <SelectItem value="variavel">Parcelas variáveis (valores/datas customizados)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {modalidade === "fixo" ? (
                        <div className="grid grid-cols-3 gap-3 p-3 rounded bg-[#f8f9fa] border border-[#e0e0e0]">
                            <div>
                                <Label className="text-[10px] font-bold uppercase text-[#555]">Valor total (R$)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={valorTotal}
                                    onChange={(e) => setValorTotal(e.target.value)}
                                    placeholder="0,00"
                                />
                            </div>
                            <div>
                                <Label className="text-[10px] font-bold uppercase text-[#555]">Nº parcelas</Label>
                                <Input
                                    type="number"
                                    min="1"
                                    value={numeroParcelas}
                                    onChange={(e) => setNumeroParcelas(e.target.value)}
                                />
                            </div>
                            <div>
                                <Label className="text-[10px] font-bold uppercase text-[#555]">Valor/parcela</Label>
                                <Input
                                    disabled
                                    value={
                                        valorTotal && numeroParcelas
                                            ? formatBRL(parseFloat(valorTotal) / parseInt(numeroParcelas, 10))
                                            : "—"
                                    }
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2 p-3 rounded bg-[#f8f9fa] border border-[#e0e0e0]">
                            <div className="flex items-center justify-between">
                                <Label className="text-[10px] font-bold uppercase text-[#555]">Parcelas</Label>
                                <Button type="button" size="sm" variant="outline" onClick={addParcela}>
                                    <Plus className="h-3 w-3 mr-1" /> Adicionar
                                </Button>
                            </div>
                            {parcelasVariaveis.map((p, idx) => (
                                <div key={idx} className="grid grid-cols-[40px_1fr_1fr_40px] gap-2 items-end">
                                    <div className="text-[11px] font-bold text-[#888] pb-2">#{idx + 1}</div>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        placeholder="Valor"
                                        value={p.valor}
                                        onChange={(e) => updateParcela(idx, "valor", e.target.value)}
                                    />
                                    <Input
                                        type="date"
                                        value={p.data}
                                        onChange={(e) => updateParcela(idx, "data", e.target.value)}
                                    />
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => removeParcela(idx)}
                                        disabled={parcelasVariaveis.length === 1}
                                        className="text-[#8b0000]"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            ))}
                            <p className="text-[10px] text-[#666] pt-1">
                                Total: <strong>{formatBRL(totalVariavel)}</strong>
                            </p>
                        </div>
                    )}

                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <Label className="text-[10px] font-bold uppercase text-[#555]">Data de início</Label>
                            <Input
                                type="date"
                                value={dataInicio}
                                onChange={(e) => setDataInicio(e.target.value)}
                            />
                        </div>
                        <div>
                            <Label className="text-[10px] font-bold uppercase text-[#555]">Assinatura (opcional)</Label>
                            <Input
                                type="date"
                                value={dataContrato}
                                onChange={(e) => setDataContrato(e.target.value)}
                            />
                        </div>
                        {modalidade === "fixo" && (
                            <div>
                                <Label className="text-[10px] font-bold uppercase text-[#555]">Dia de vencimento</Label>
                                <Input
                                    type="number"
                                    min="1"
                                    max="31"
                                    value={diaVencimento}
                                    onChange={(e) => setDiaVencimento(e.target.value)}
                                />
                            </div>
                        )}
                    </div>

                    <div>
                        <Label className="text-[10px] font-bold uppercase text-[#555]">Observações</Label>
                        <Textarea
                            rows={3}
                            value={observacoes}
                            onChange={(e) => setObservacoes(e.target.value)}
                            placeholder="Notas internas sobre o contrato"
                        />
                    </div>

                    <p className="text-[10px] text-[#888] italic">
                        O PDF do contrato pode ser anexado após a criação, clicando no ícone de upload no card do contrato.
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
