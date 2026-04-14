import { useState } from "react";
import { Plus, Pencil, Trash2, FileText, AlertTriangle, Check } from "lucide-react";

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

type Modalidade = "parcelado_fixo" | "parcelado_variavel" | "recorrente";
type StatusContrato = "ativo" | "pausado" | "encerrado";
type StatusParcela = "aberto" | "pago" | "parcial" | "vencido";

interface Parcela {
    numero: number;
    valor: number;
    data_vencimento: string;
    valor_pago?: number;
    status: StatusParcela;
}

interface Contrato {
    id: string;
    descricao: string;
    modalidade: Modalidade;
    valor_total: number | null;
    numero_parcelas: number | null;
    valor_parcela: number | null;
    data_inicio: string;
    dia_vencimento: number;
    periodicidade?: string;
    parcelas: Parcela[];
    status: StatusContrato;
    observacoes?: string;
}

const modalidadeLabel: Record<Modalidade, string> = {
    parcelado_fixo: "Parcelado (fixo)",
    parcelado_variavel: "Parcelado (variável)",
    recorrente: "Recorrente",
};

const statusLabel: Record<StatusContrato, { label: string; className: string }> = {
    ativo: { label: "Ativo", className: "bg-[#e6f4ec] text-[#0a5c2e] border-[#0a5c2e]" },
    pausado: { label: "Pausado", className: "bg-[#fffbe6] text-[#5c3a00] border-[#b8960a]" },
    encerrado: { label: "Encerrado", className: "bg-[#f5f5f5] text-[#555] border-[#aaa]" },
};

interface TabContractsProps {
    clientId?: string;
    clientName?: string;
}

export function TabContracts({ clientId, clientName }: TabContractsProps) {
    const [contratos, setContratos] = useState<Contrato[]>([]);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<Contrato | null>(null);

    const handleNew = () => {
        setEditing(null);
        setDialogOpen(true);
    };

    const handleEdit = (c: Contrato) => {
        setEditing(c);
        setDialogOpen(true);
    };

    const handleDelete = (id: string) => {
        if (confirm("Excluir este contrato? Esta ação não pode ser desfeita.")) {
            setContratos((prev) => prev.filter((c) => c.id !== id));
        }
    };

    const handleSave = (contrato: Contrato) => {
        setContratos((prev) => {
            const idx = prev.findIndex((c) => c.id === contrato.id);
            if (idx >= 0) {
                const next = [...prev];
                next[idx] = contrato;
                return next;
            }
            return [...prev, contrato];
        });
        setDialogOpen(false);
        setEditing(null);
    };

    if (!clientId) {
        return (
            <div className="pt-6 pb-8 text-center text-sm text-[#888]">
                Salve o cliente antes de cadastrar contratos.
            </div>
        );
    }

    return (
        <div className="pt-4 space-y-4 animate-in fade-in duration-300">
            {/* Aviso de persistência pendente (mock) */}
            <div className="flex items-start gap-2 px-3 py-2 rounded border border-[#fde68a] bg-[#fffbe6] text-[11px] text-[#5c3a00]">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <div>
                    <strong>Pré-visualização</strong> — contratos ficam em memória local.
                    A persistência no banco será ligada após aprovação do fluxo.
                </div>
            </div>

            {/* Cabeçalho */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-bold text-[#1a2e4a]">
                        Contratos {clientName ? `· ${clientName}` : ""}
                    </h3>
                    <p className="text-[11px] text-[#888]">
                        {contratos.length} contrato{contratos.length === 1 ? "" : "s"} cadastrado{contratos.length === 1 ? "" : "s"}
                    </p>
                </div>
                <Button type="button" onClick={handleNew} className="bg-[#1a2e4a] hover:bg-[#0f1f33] text-white">
                    <Plus className="h-4 w-4 mr-1" /> Novo contrato
                </Button>
            </div>

            {/* Lista */}
            {contratos.length === 0 ? (
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
                            onEdit={() => handleEdit(c)}
                            onDelete={() => handleDelete(c.id)}
                        />
                    ))}
                </div>
            )}

            {/* Dialog de criação/edição */}
            <ContratoDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                initial={editing}
                onSave={handleSave}
            />
        </div>
    );
}

/* ─── Card de contrato ─────────────────────────────────────── */

function ContratoCard({
    contrato,
    onEdit,
    onDelete,
}: {
    contrato: Contrato;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const totalPago = contrato.parcelas.reduce((s, p) => s + (p.valor_pago || 0), 0);
    const valorTotal = contrato.valor_total || contrato.parcelas.reduce((s, p) => s + p.valor, 0);
    const saldo = valorTotal - totalPago;
    const progresso = valorTotal > 0 ? (totalPago / valorTotal) * 100 : 0;
    const parcelasPagas = contrato.parcelas.filter((p) => p.status === "pago").length;
    const statusInfo = statusLabel[contrato.status];

    return (
        <div className="border border-[#e0e0e0] rounded p-4 hover:border-[#1a2e4a] transition-colors">
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-bold text-[#1a2e4a]">{contrato.descricao}</h4>
                        <Badge variant="outline" className={`text-[10px] ${statusInfo.className}`}>
                            {statusInfo.label}
                        </Badge>
                        <span className="text-[10px] text-[#888] uppercase font-semibold">
                            {modalidadeLabel[contrato.modalidade]}
                        </span>
                    </div>
                    <p className="text-[11px] text-[#666] mt-1">
                        Início: {formatDate(contrato.data_inicio)} · Vence dia {contrato.dia_vencimento}
                    </p>
                </div>
                <div className="flex gap-1">
                    <Button type="button" size="sm" variant="ghost" onClick={onEdit} className="h-7 w-7 p-0">
                        <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={onDelete} className="h-7 w-7 p-0 text-[#8b0000] hover:text-[#8b0000] hover:bg-[#fdecea]">
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>

            {/* Métricas */}
            <div className="grid grid-cols-4 gap-3 mt-3 pt-3 border-t border-[#f0f0f0]">
                <Metric label="Valor total" value={formatBRL(valorTotal)} />
                <Metric label="Pago" value={formatBRL(totalPago)} color="#0a5c2e" />
                <Metric label="Saldo" value={formatBRL(saldo)} color={saldo > 0 ? "#8b0000" : "#0a5c2e"} />
                <Metric
                    label="Parcelas"
                    value={`${parcelasPagas}/${contrato.parcelas.length}`}
                />
            </div>

            {/* Progresso */}
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

/* ─── Dialog de criação/edição ─────────────────────────────── */

function ContratoDialog({
    open,
    onOpenChange,
    initial,
    onSave,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    initial: Contrato | null;
    onSave: (c: Contrato) => void;
}) {
    const [descricao, setDescricao] = useState(initial?.descricao || "");
    const [modalidade, setModalidade] = useState<Modalidade>(initial?.modalidade || "parcelado_fixo");
    const [valorTotal, setValorTotal] = useState<string>(initial?.valor_total?.toString() || "");
    const [numeroParcelas, setNumeroParcelas] = useState<string>(initial?.numero_parcelas?.toString() || "1");
    const [valorParcela, setValorParcela] = useState<string>(initial?.valor_parcela?.toString() || "");
    const [dataInicio, setDataInicio] = useState(initial?.data_inicio || new Date().toISOString().slice(0, 10));
    const [diaVencimento, setDiaVencimento] = useState<string>(initial?.dia_vencimento?.toString() || "10");
    const [periodicidade, setPeriodicidade] = useState(initial?.periodicidade || "mensal");
    const [status, setStatus] = useState<StatusContrato>(initial?.status || "ativo");
    const [observacoes, setObservacoes] = useState(initial?.observacoes || "");

    // Parcelas (apenas para variável)
    const [parcelasVariaveis, setParcelasVariaveis] = useState<Array<{ valor: string; data: string }>>(
        initial?.modalidade === "parcelado_variavel"
            ? initial.parcelas.map((p) => ({ valor: p.valor.toString(), data: p.data_vencimento }))
            : [{ valor: "", data: "" }]
    );

    const resetOnOpen = (v: boolean) => {
        if (v && !initial) {
            setDescricao("");
            setModalidade("parcelado_fixo");
            setValorTotal("");
            setNumeroParcelas("1");
            setValorParcela("");
            setDataInicio(new Date().toISOString().slice(0, 10));
            setDiaVencimento("10");
            setPeriodicidade("mensal");
            setStatus("ativo");
            setObservacoes("");
            setParcelasVariaveis([{ valor: "", data: "" }]);
        }
        onOpenChange(v);
    };

    const addParcelaVariavel = () => {
        setParcelasVariaveis((prev) => [...prev, { valor: "", data: "" }]);
    };

    const removeParcelaVariavel = (idx: number) => {
        setParcelasVariaveis((prev) => prev.filter((_, i) => i !== idx));
    };

    const updateParcelaVariavel = (idx: number, field: "valor" | "data", value: string) => {
        setParcelasVariaveis((prev) => {
            const next = [...prev];
            next[idx] = { ...next[idx], [field]: value };
            return next;
        });
    };

    const handleSubmit = () => {
        if (!descricao.trim()) {
            alert("Descrição é obrigatória");
            return;
        }

        let parcelas: Parcela[] = [];
        let valorTotalCalc: number | null = null;
        let numeroParcelasCalc: number | null = null;
        let valorParcelaCalc: number | null = null;

        if (modalidade === "parcelado_fixo") {
            const vt = parseFloat(valorTotal);
            const n = parseInt(numeroParcelas, 10);
            if (!vt || vt <= 0) return alert("Valor total inválido");
            if (!n || n < 1) return alert("Número de parcelas inválido");
            const vp = vt / n;
            valorTotalCalc = vt;
            numeroParcelasCalc = n;
            valorParcelaCalc = vp;
            parcelas = Array.from({ length: n }, (_, i) => ({
                numero: i + 1,
                valor: vp,
                data_vencimento: addMonthsDay(dataInicio, i, parseInt(diaVencimento, 10)),
                status: "aberto" as StatusParcela,
            }));
        } else if (modalidade === "parcelado_variavel") {
            const valid = parcelasVariaveis.filter((p) => p.valor && p.data);
            if (valid.length === 0) return alert("Adicione pelo menos uma parcela");
            parcelas = valid.map((p, i) => ({
                numero: i + 1,
                valor: parseFloat(p.valor),
                data_vencimento: p.data,
                status: "aberto" as StatusParcela,
            }));
            valorTotalCalc = parcelas.reduce((s, p) => s + p.valor, 0);
            numeroParcelasCalc = parcelas.length;
        } else {
            // recorrente
            const vp = parseFloat(valorParcela);
            if (!vp || vp <= 0) return alert("Valor da recorrência inválido");
            valorParcelaCalc = vp;
            parcelas = []; // recorrente gera CRs conforme vai rodando
        }

        const contrato: Contrato = {
            id: initial?.id || `mock-${Date.now()}`,
            descricao: descricao.trim(),
            modalidade,
            valor_total: valorTotalCalc,
            numero_parcelas: numeroParcelasCalc,
            valor_parcela: valorParcelaCalc,
            data_inicio: dataInicio,
            dia_vencimento: parseInt(diaVencimento, 10),
            periodicidade: modalidade === "recorrente" ? periodicidade : undefined,
            parcelas,
            status,
            observacoes: observacoes.trim() || undefined,
        };

        onSave(contrato);
    };

    return (
        <Dialog open={open} onOpenChange={resetOnOpen}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{initial ? "Editar contrato" : "Novo contrato"}</DialogTitle>
                    <DialogDescription>
                        Defina modalidade, valores e vigência. As parcelas virarão Contas a Receber vinculadas.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Descrição */}
                    <div>
                        <Label className="text-[10px] font-bold uppercase text-[#555]">Descrição do contrato</Label>
                        <Input
                            value={descricao}
                            onChange={(e) => setDescricao(e.target.value)}
                            placeholder="Ex: Pacote de tratamento capilar 12x"
                        />
                    </div>

                    {/* Modalidade e status */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label className="text-[10px] font-bold uppercase text-[#555]">Modalidade</Label>
                            <Select value={modalidade} onValueChange={(v) => setModalidade(v as Modalidade)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="parcelado_fixo">Parcelado (parcelas iguais)</SelectItem>
                                    <SelectItem value="parcelado_variavel">Parcelado (parcelas variáveis)</SelectItem>
                                    <SelectItem value="recorrente">Recorrente (mensalidade)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label className="text-[10px] font-bold uppercase text-[#555]">Status</Label>
                            <Select value={status} onValueChange={(v) => setStatus(v as StatusContrato)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ativo">Ativo</SelectItem>
                                    <SelectItem value="pausado">Pausado</SelectItem>
                                    <SelectItem value="encerrado">Encerrado</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Campos específicos por modalidade */}
                    {modalidade === "parcelado_fixo" && (
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
                    )}

                    {modalidade === "parcelado_variavel" && (
                        <div className="space-y-2 p-3 rounded bg-[#f8f9fa] border border-[#e0e0e0]">
                            <div className="flex items-center justify-between">
                                <Label className="text-[10px] font-bold uppercase text-[#555]">Parcelas</Label>
                                <Button type="button" size="sm" variant="outline" onClick={addParcelaVariavel}>
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
                                        onChange={(e) => updateParcelaVariavel(idx, "valor", e.target.value)}
                                    />
                                    <Input
                                        type="date"
                                        value={p.data}
                                        onChange={(e) => updateParcelaVariavel(idx, "data", e.target.value)}
                                    />
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => removeParcelaVariavel(idx)}
                                        disabled={parcelasVariaveis.length === 1}
                                        className="text-[#8b0000]"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            ))}
                            <p className="text-[10px] text-[#666] pt-1">
                                Total: <strong>{formatBRL(parcelasVariaveis.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0))}</strong>
                            </p>
                        </div>
                    )}

                    {modalidade === "recorrente" && (
                        <div className="grid grid-cols-2 gap-3 p-3 rounded bg-[#f8f9fa] border border-[#e0e0e0]">
                            <div>
                                <Label className="text-[10px] font-bold uppercase text-[#555]">Valor da recorrência (R$)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={valorParcela}
                                    onChange={(e) => setValorParcela(e.target.value)}
                                    placeholder="0,00"
                                />
                            </div>
                            <div>
                                <Label className="text-[10px] font-bold uppercase text-[#555]">Periodicidade</Label>
                                <Select value={periodicidade} onValueChange={setPeriodicidade}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="semanal">Semanal</SelectItem>
                                        <SelectItem value="quinzenal">Quinzenal</SelectItem>
                                        <SelectItem value="mensal">Mensal</SelectItem>
                                        <SelectItem value="bimestral">Bimestral</SelectItem>
                                        <SelectItem value="trimestral">Trimestral</SelectItem>
                                        <SelectItem value="semestral">Semestral</SelectItem>
                                        <SelectItem value="anual">Anual</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}

                    {/* Vigência */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label className="text-[10px] font-bold uppercase text-[#555]">Data de início</Label>
                            <Input
                                type="date"
                                value={dataInicio}
                                onChange={(e) => setDataInicio(e.target.value)}
                            />
                        </div>
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
                    </div>

                    {/* Observações */}
                    <div>
                        <Label className="text-[10px] font-bold uppercase text-[#555]">Observações</Label>
                        <Textarea
                            rows={3}
                            value={observacoes}
                            onChange={(e) => setObservacoes(e.target.value)}
                            placeholder="Notas internas sobre o contrato"
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Cancelar
                    </Button>
                    <Button type="button" onClick={handleSubmit} className="bg-[#1a2e4a] hover:bg-[#0f1f33] text-white">
                        <Check className="h-4 w-4 mr-1" /> {initial ? "Salvar alterações" : "Criar contrato"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/* ─── Helpers ──────────────────────────────────────────────── */

function formatDate(iso: string): string {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
}

function addMonthsDay(startIso: string, monthsOffset: number, day: number): string {
    const [y, m] = startIso.split("-").map((s) => parseInt(s, 10));
    const d = new Date(y, m - 1 + monthsOffset, 1);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const useDay = Math.min(day, lastDay);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(useDay).padStart(2, "0")}`;
}
