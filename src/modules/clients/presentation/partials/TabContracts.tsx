import { useMemo, useRef, useState } from "react";
import {
    Plus, Trash2, FileText, Check, Upload, ExternalLink, Loader2, Paperclip,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatBRL } from "@/lib/format";
import { useClientContratos, ContratoVenda, CreateContratoInput, CondicaoPagamento } from "../hooks/useClientContratos";

const PROCEDIMENTOS = ["FUE", "DHI", "FUE + DHI", "Outro"];

const FORMAS_PAGAMENTO = [
    { value: "cartao_credito", label: "Cartão de crédito" },
    { value: "pix", label: "PIX" },
    { value: "boleto", label: "Boleto" },
    { value: "transferencia", label: "Transferência bancária" },
    { value: "dinheiro", label: "Dinheiro" },
    { value: "misto", label: "Misto" },
];

const formaLabel = (v: string | null | undefined) =>
    FORMAS_PAGAMENTO.find((f) => f.value === v)?.label || v || "—";

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
                Cadastre o CPF/CNPJ do cliente antes de criar contratos.
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
                        <h4 className="text-sm font-bold text-[#1a2e4a]">
                            {contrato.procedimento || contrato.descricao}
                        </h4>
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
                    <div className="text-[11px] text-[#666] mt-1 space-y-0.5">
                        {contrato.consultora && <div>Consultora: <strong>{contrato.consultora}</strong></div>}
                        <div>
                            Assinatura: {formatDate(contrato.data_venda)}
                            {contrato.previsao_cirurgia && ` · Cirurgia: ${formatDate(contrato.previsao_cirurgia)}`}
                        </div>
                        <div>
                            {formaLabel(contrato.forma_pagamento)}
                            {contrato.parcelas_qtd > 1 && ` em ${contrato.parcelas_qtd}x`}
                            {contrato.reserva_valor
                                ? ` · Reserva: ${formatBRL(contrato.reserva_valor)}${contrato.reserva_data ? ` (${formatDate(contrato.reserva_data)})` : ""}`
                                : ""}
                        </div>
                    </div>
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
                <Metric
                    label="Parcelas"
                    value={contrato.crs.length > 0 ? `${contrato.parcelas_pagas}/${contrato.crs.length}` : "—"}
                />
            </div>

            <div className="mt-3">
                <Progress value={progresso} className="h-1.5" />
                <p className="text-[10px] text-[#888] mt-1 text-right">{progresso.toFixed(1)}% quitado</p>
            </div>
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

/* ─── Dialog de criação ─────────────────────────────────────── */

interface ContratoDialogProps {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    clientName: string;
    onSubmit: (input: CreateContratoInput) => Promise<void>;
    saving: boolean;
}

function ContratoDialog({ open, onOpenChange, clientName, onSubmit, saving }: ContratoDialogProps) {
    const [consultora, setConsultora] = useState("");
    const [procedimento, setProcedimento] = useState(PROCEDIMENTOS[0]);
    const [procedimentoOutro, setProcedimentoOutro] = useState("");
    const [valorTotal, setValorTotal] = useState("");
    const [dataVenda, setDataVenda] = useState(new Date().toISOString().slice(0, 10));
    const [previsaoCirurgia, setPrevisaoCirurgia] = useState("");
    const [reservaValor, setReservaValor] = useState("");
    const [reservaData, setReservaData] = useState("");

    type CondicaoForm = { forma: string; valor: string; parcelas: string };
    const [condicoes, setCondicoes] = useState<CondicaoForm[]>([
        { forma: "cartao_credito", valor: "", parcelas: "10" },
    ]);

    const resetOnOpen = (v: boolean) => {
        if (v) {
            setConsultora("");
            setProcedimento(PROCEDIMENTOS[0]);
            setProcedimentoOutro("");
            setValorTotal("");
            setDataVenda(new Date().toISOString().slice(0, 10));
            setPrevisaoCirurgia("");
            setReservaValor("");
            setReservaData("");
            setCondicoes([{ forma: "cartao_credito", valor: "", parcelas: "10" }]);
        }
        onOpenChange(v);
    };

    const podeParcelarForma = (f: string) =>
        f === "cartao_credito" || f === "boleto";

    const addCondicao = () =>
        setCondicoes((prev) => [...prev, { forma: "pix", valor: "", parcelas: "1" }]);

    const removeCondicao = (idx: number) =>
        setCondicoes((prev) => prev.filter((_, i) => i !== idx));

    const updateCondicao = (idx: number, field: keyof CondicaoForm, value: string) =>
        setCondicoes((prev) => {
            const next = [...prev];
            next[idx] = { ...next[idx], [field]: value };
            return next;
        });

    const calc = useMemo(() => {
        const vt = parseFloat(valorTotal) || 0;
        const rv = parseFloat(reservaValor) || 0;
        const saldo = Math.max(0, vt - rv);
        const totalCondicoes = condicoes.reduce((s, c) => s + (parseFloat(c.valor) || 0), 0);
        const falta = Math.round((saldo - totalCondicoes) * 100) / 100;
        return { vt, rv, saldo, totalCondicoes, falta };
    }, [valorTotal, reservaValor, condicoes]);

    const handleSubmit = async () => {
        const proc = procedimento === "Outro" ? procedimentoOutro.trim() : procedimento;
        if (!proc) return alert("Procedimento é obrigatório");
        if (!consultora.trim()) return alert("Consultora é obrigatória");
        if (calc.vt <= 0) return alert("Valor total inválido");
        if (!dataVenda) return alert("Data de assinatura é obrigatória");
        if (calc.rv > 0 && !reservaData) return alert("Informe a data da reserva");
        if (calc.rv > calc.vt) return alert("Reserva não pode ser maior que o valor total");

        const condicoesValidas: CondicaoPagamento[] = condicoes
            .map((c) => ({
                forma: c.forma,
                valor: parseFloat(c.valor) || 0,
                parcelas: podeParcelarForma(c.forma) ? Math.max(parseInt(c.parcelas, 10) || 1, 1) : 1,
            }))
            .filter((c) => c.valor > 0);

        if (condicoesValidas.length === 0 && calc.saldo > 0) {
            return alert("Adicione pelo menos uma condição de pagamento para o saldo");
        }

        if (Math.abs(calc.falta) > 0.01) {
            return alert(
                calc.falta > 0
                    ? `Faltam ${formatBRL(calc.falta)} para fechar o saldo`
                    : `Condições excedem o saldo em ${formatBRL(Math.abs(calc.falta))}`
            );
        }

        await onSubmit({
            clientName,
            consultora: consultora.trim(),
            procedimento: proc,
            valor_total: calc.vt,
            data_venda: dataVenda,
            previsao_cirurgia: previsaoCirurgia || null,
            reserva_valor: calc.rv,
            reserva_data: reservaData || null,
            condicoes: condicoesValidas,
        });
    };

    return (
        <Dialog open={open} onOpenChange={resetOnOpen}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Novo contrato</DialogTitle>
                    <DialogDescription>
                        As parcelas e a reserva virão Contas a Receber vinculadas.
                        Pagamentos abatem automaticamente do saldo.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Bloco 1: info do procedimento */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label className="text-[10px] font-bold uppercase text-[#555]">Consultora responsável</Label>
                            <Input
                                value={consultora}
                                onChange={(e) => setConsultora(e.target.value)}
                                placeholder="Ex: Mariana Melo"
                            />
                        </div>
                        <div>
                            <Label className="text-[10px] font-bold uppercase text-[#555]">Procedimento</Label>
                            <Select value={procedimento} onValueChange={setProcedimento}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {PROCEDIMENTOS.map((p) => (
                                        <SelectItem key={p} value={p}>{p}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {procedimento === "Outro" && (
                                <Input
                                    className="mt-2"
                                    value={procedimentoOutro}
                                    onChange={(e) => setProcedimentoOutro(e.target.value)}
                                    placeholder="Especifique"
                                />
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
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
                            <Label className="text-[10px] font-bold uppercase text-[#555]">Data assinatura</Label>
                            <Input
                                type="date"
                                value={dataVenda}
                                onChange={(e) => setDataVenda(e.target.value)}
                            />
                        </div>
                        <div>
                            <Label className="text-[10px] font-bold uppercase text-[#555]">Previsão cirurgia</Label>
                            <Input
                                type="date"
                                value={previsaoCirurgia}
                                onChange={(e) => setPrevisaoCirurgia(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Bloco 2: reserva */}
                    <div className="p-3 rounded bg-[#f8f9fa] border border-[#e0e0e0] space-y-3">
                        <Label className="text-[10px] font-bold uppercase text-[#555]">Reserva de data (opcional)</Label>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label className="text-[10px] text-[#888]">Valor (R$)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={reservaValor}
                                    onChange={(e) => setReservaValor(e.target.value)}
                                    placeholder="0,00"
                                />
                            </div>
                            <div>
                                <Label className="text-[10px] text-[#888]">Data do pagamento</Label>
                                <Input
                                    type="date"
                                    value={reservaData}
                                    onChange={(e) => setReservaData(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Bloco 3: parcelamento (multiplas condicoes) */}
                    <div className="p-3 rounded bg-[#f8f9fa] border border-[#e0e0e0] space-y-3">
                        <div className="flex items-center justify-between">
                            <Label className="text-[10px] font-bold uppercase text-[#555]">Parcelamento do saldo</Label>
                            <Button type="button" size="sm" variant="outline" onClick={addCondicao}>
                                <Plus className="h-3 w-3 mr-1" /> Adicionar condição
                            </Button>
                        </div>

                        {condicoes.map((c, idx) => {
                            const parcelasNum = podeParcelarForma(c.forma) ? Math.max(parseInt(c.parcelas, 10) || 1, 1) : 1;
                            const valorNum = parseFloat(c.valor) || 0;
                            const valorParcela = parcelasNum > 0 ? valorNum / parcelasNum : 0;

                            return (
                                <div key={idx} className="grid grid-cols-[1fr_120px_90px_1fr_32px] gap-2 items-end">
                                    <div>
                                        {idx === 0 && <Label className="text-[10px] text-[#888]">Condição</Label>}
                                        <Select value={c.forma} onValueChange={(v) => updateCondicao(idx, "forma", v)}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {FORMAS_PAGAMENTO.map((f) => (
                                                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        {idx === 0 && <Label className="text-[10px] text-[#888]">Valor (R$)</Label>}
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={c.valor}
                                            onChange={(e) => updateCondicao(idx, "valor", e.target.value)}
                                            placeholder="0,00"
                                        />
                                    </div>
                                    <div>
                                        {idx === 0 && <Label className="text-[10px] text-[#888]">Nº parc.</Label>}
                                        <Input
                                            type="number"
                                            min="1"
                                            max="24"
                                            value={c.parcelas}
                                            onChange={(e) => updateCondicao(idx, "parcelas", e.target.value)}
                                            disabled={!podeParcelarForma(c.forma)}
                                        />
                                    </div>
                                    <div>
                                        {idx === 0 && <Label className="text-[10px] text-[#888]">Valor/parcela</Label>}
                                        <Input disabled value={valorNum > 0 ? formatBRL(valorParcela) : "—"} />
                                    </div>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => removeCondicao(idx)}
                                        disabled={condicoes.length === 1}
                                        className="text-[#8b0000] h-9 w-9 p-0"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            );
                        })}

                        {calc.vt > 0 && (
                            <div className="text-[11px] flex flex-wrap gap-x-4 gap-y-1 pt-2 border-t border-[#e0e0e0]">
                                <span>Total: <strong>{formatBRL(calc.vt)}</strong></span>
                                <span>Reserva: <strong>{formatBRL(calc.rv)}</strong></span>
                                <span>Saldo: <strong>{formatBRL(calc.saldo)}</strong></span>
                                <span>Condições: <strong>{formatBRL(calc.totalCondicoes)}</strong></span>
                                {Math.abs(calc.falta) < 0.01 ? (
                                    <span className="text-[#0a5c2e] font-bold">✓ Fechado</span>
                                ) : calc.falta > 0 ? (
                                    <span className="text-[#8b0000] font-bold">
                                        Faltam {formatBRL(calc.falta)}
                                    </span>
                                ) : (
                                    <span className="text-[#8b0000] font-bold">
                                        Excede em {formatBRL(Math.abs(calc.falta))}
                                    </span>
                                )}
                            </div>
                        )}
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
