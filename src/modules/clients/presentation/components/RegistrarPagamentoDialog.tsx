import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useBankAccounts } from "@/modules/finance/presentation/hooks/useBankAccounts";
import { formatBRL } from "@/lib/format";
import { ContratoVenda } from "../hooks/useClientContratos";

const FORMAS = [
    { value: "pix", label: "PIX" },
    { value: "cartao_credito", label: "Cartão de crédito" },
    { value: "cartao_debito", label: "Cartão de débito" },
    { value: "boleto", label: "Boleto" },
    { value: "dinheiro", label: "Dinheiro" },
    { value: "transferencia", label: "Transferência" },
];

interface Props {
    contrato: ContratoVenda | null;
    clientName: string;
    clientCpfCnpj: string | null | undefined;
    onClose: () => void;
}

export function RegistrarPagamentoDialog({ contrato, clientName, clientCpfCnpj, onClose }: Props) {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const queryClient = useQueryClient();
    const { accounts: bankAccounts } = useBankAccounts();

    const docLimpo = (clientCpfCnpj || "").replace(/\D/g, "");
    const open = !!contrato;

    const [valor, setValor] = useState("");
    const [data, setData] = useState(new Date().toISOString().slice(0, 10));
    const [forma, setForma] = useState("pix");
    const [contaBancaria, setContaBancaria] = useState("");
    const [observacoes, setObservacoes] = useState("");

    useEffect(() => {
        if (contrato) {
            setValor("");
            setData(new Date().toISOString().slice(0, 10));
            setForma("pix");
            setContaBancaria("");
            setObservacoes("");
        }
    }, [contrato?.id]);

    const mutation = useMutation({
        mutationFn: async () => {
            if (!contrato || !selectedCompany?.id) throw new Error("Dados incompletos");
            const v = parseFloat(valor);
            if (!v || v <= 0) throw new Error("Valor inválido");
            if (!contaBancaria) throw new Error("Selecione a conta bancária");

            const ac = activeClient as any;

            const { data: cr, error: crErr } = await ac
                .from("contas_receber")
                .insert({
                    company_id: selectedCompany.id,
                    pagador_nome: clientName,
                    pagador_cpf_cnpj: docLimpo,
                    valor: v,
                    valor_pago: v,
                    data_vencimento: data,
                    data_pagamento: data,
                    status: "pago",
                    forma_recebimento: forma,
                    venda_id: contrato.id,
                    observacoes: observacoes.trim() || `Pagamento avulso — ${contrato.procedimento || "contrato"}`,
                })
                .select()
                .single();

            if (crErr) throw crErr;

            const { error: movErr } = await ac.from("movimentacoes").insert({
                company_id: selectedCompany.id,
                conta_bancaria_id: contaBancaria,
                conta_contabil_id: null,
                tipo: "credito",
                valor: v,
                data,
                descricao: `Pagamento avulso — ${clientName} — ${contrato.procedimento || "Contrato"}`,
                origem: "conta_receber",
                conta_receber_id: cr.id,
            });

            if (movErr) throw movErr;

            return cr;
        },
        onSuccess: () => {
            toast.success("Pagamento registrado e vinculado ao contrato");
            queryClient.invalidateQueries({ queryKey: ["client-contratos"] });
            queryClient.invalidateQueries({ queryKey: ["contas-receber"] });
            onClose();
        },
        onError: (err: any) => {
            toast.error(err?.message || "Erro ao registrar pagamento");
        },
    });

    const v = parseFloat(valor) || 0;
    const saldoApos = contrato ? contrato.saldo - v : 0;

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-lg p-0 gap-0">
                <div className="px-7 pt-6 pb-4 border-b border-[#eef0f3]">
                    <DialogTitle className="text-[16px] font-bold text-[#1E3A8A]">
                        Registrar pagamento avulso
                    </DialogTitle>
                    <DialogDescription className="text-[11px] text-[#667085] mt-1">
                        {contrato?.procedimento && <>Contrato: <strong>{contrato.procedimento}</strong> · </>}
                        Saldo atual: <strong className="text-[#1E3A8A]">{formatBRL(contrato?.saldo || 0)}</strong>
                    </DialogDescription>
                </div>

                <div className="px-7 py-5 space-y-4 bg-[#fafbfc]">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label className="text-[10px] font-bold uppercase tracking-wide text-[#667085] mb-1.5 block">
                                Valor (R$)
                            </Label>
                            <Input
                                type="number"
                                step="0.01"
                                value={valor}
                                onChange={(e) => setValor(e.target.value)}
                                placeholder="0,00"
                                className="h-10 bg-white tabular-nums font-semibold"
                            />
                        </div>
                        <div>
                            <Label className="text-[10px] font-bold uppercase tracking-wide text-[#667085] mb-1.5 block">
                                Data do pagamento
                            </Label>
                            <Input
                                type="date"
                                value={data}
                                onChange={(e) => setData(e.target.value)}
                                className="h-10 bg-white"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label className="text-[10px] font-bold uppercase tracking-wide text-[#667085] mb-1.5 block">
                                Forma de pagamento
                            </Label>
                            <Select value={forma} onValueChange={setForma}>
                                <SelectTrigger className="h-10 bg-white"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {FORMAS.map((f) => (
                                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label className="text-[10px] font-bold uppercase tracking-wide text-[#667085] mb-1.5 block">
                                Conta de recebimento
                            </Label>
                            <Select value={contaBancaria} onValueChange={setContaBancaria}>
                                <SelectTrigger className="h-10 bg-white">
                                    <SelectValue placeholder="Selecione..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {bankAccounts.map((b: any) => (
                                        <SelectItem key={b.id} value={b.id}>
                                            {b.name} {b.banco ? `· ${b.banco}` : ""}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div>
                        <Label className="text-[10px] font-bold uppercase tracking-wide text-[#667085] mb-1.5 block">
                            Observações
                        </Label>
                        <Textarea
                            rows={2}
                            value={observacoes}
                            onChange={(e) => setObservacoes(e.target.value)}
                            placeholder="Opcional — ex: sinal adicional, amortização"
                            className="bg-white resize-none"
                        />
                    </div>

                    {v > 0 && (
                        <div className="rounded border border-[#EAECF0] bg-white p-3 text-[11px] tabular-nums">
                            <div className="flex justify-between text-[#667085]">
                                <span>Saldo atual</span>
                                <span>{formatBRL(contrato?.saldo || 0)}</span>
                            </div>
                            <div className="flex justify-between text-[#667085]">
                                <span>Pagamento</span>
                                <span className="text-[#039855]">− {formatBRL(v)}</span>
                            </div>
                            <div className="flex justify-between mt-1 pt-1 border-t border-[#EAECF0] font-bold text-[13px]">
                                <span className="text-[#1E3A8A]">Novo saldo</span>
                                <span style={{ color: saldoApos > 0 ? "#D92D20" : "#039855" }}>
                                    {formatBRL(Math.max(0, saldoApos))}
                                </span>
                            </div>
                            {saldoApos < -0.01 && (
                                <p className="text-[10px] text-[#D92D20] mt-1">
                                    Pagamento excede o saldo em {formatBRL(Math.abs(saldoApos))}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                <div className="px-7 py-4 border-t border-[#eef0f3] bg-white flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending} className="h-10 px-5">
                        Cancelar
                    </Button>
                    <Button
                        type="button"
                        onClick={() => mutation.mutate()}
                        disabled={mutation.isPending || !v || v <= 0 || !contaBancaria}
                        className="h-10 px-6 bg-[#1E3A8A] hover:bg-[#0f1f33] text-white"
                    >
                        {mutation.isPending
                            ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                            : <Check className="h-4 w-4 mr-1.5" />}
                        Registrar pagamento
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
