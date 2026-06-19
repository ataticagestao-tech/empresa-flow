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
    /**
     * Quando true, o diálogo entra em modo "quitar tudo":
     * - valor inicia com o saldo total e fica bloqueado
     * - após registrar o pagamento, todas as CRs em aberto da venda
     *   são soft-deletadas (zera as parcelas pendentes)
     */
    modoQuitacao?: boolean;
}

export function RegistrarPagamentoDialog({ contrato, clientName, clientCpfCnpj, onClose, modoQuitacao = false }: Props) {
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
            setValor(modoQuitacao ? (contrato.saldo || 0).toFixed(2) : "");
            setData(new Date().toISOString().slice(0, 10));
            setForma("pix");
            setContaBancaria("");
            setObservacoes("");
        }
    }, [contrato?.id, modoQuitacao]);

    const mutation = useMutation({
        mutationFn: async () => {
            if (!contrato || !selectedCompany?.id) throw new Error("Dados incompletos");
            const v = parseFloat(valor);
            if (!v || v <= 0) throw new Error("Valor inválido");
            if (!contaBancaria) throw new Error("Selecione a conta bancária");

            const ac = activeClient as any;

            // Garante que a venda do contrato ainda existe. Ela pode ter sido
            // excluída em outra aba/sessão enquanto este card ficava em cache —
            // sem esta checagem, o INSERT abaixo falha com um erro de foreign
            // key cru ("contas_receber_venda_id_fkey") incompreensível.
            const { data: vendaAtual, error: vendaErr } = await ac
                .from("vendas")
                .select("id")
                .eq("id", contrato.id)
                .is("deleted_at", null)
                .maybeSingle();
            if (vendaErr) throw vendaErr;
            if (!vendaAtual) {
                throw new Error(
                    "Este contrato não existe mais (pode ter sido excluído). Atualize a página (F5) e tente novamente."
                );
            }

            const obsBase = modoQuitacao
                ? `Quitação — ${contrato.procedimento || "contrato"}`
                : `Pagamento avulso — ${contrato.procedimento || "contrato"}`;

            // Herda conta_contabil_id de qualquer CR existente do mesmo contrato
            // (preserva categoria contábil — alimenta DRE/Fluxo de Caixa).
            const { data: crsExistentes } = await ac
                .from("contas_receber")
                .select("conta_contabil_id")
                .eq("venda_id", contrato.id)
                .not("conta_contabil_id", "is", null)
                .limit(1);
            let contaContabilHerda = crsExistentes?.[0]?.conta_contabil_id ?? null;

            // Fallback p/ contratos antigos (criados antes de categorizar na
            // origem): se nenhum CR do contrato tem categoria, usa a conta de
            // receita padrão da empresa — senão o pagamento nasce sem categoria
            // e some do Fluxo de Caixa (DFC).
            if (!contaContabilHerda) {
                const { data: receita } = await ac
                    .from("chart_of_accounts")
                    .select("id")
                    .eq("company_id", selectedCompany.id)
                    .eq("account_type", "revenue")
                    .eq("is_analytical", true)
                    .eq("status", "active")
                    .order("code")
                    .limit(1);
                contaContabilHerda = receita?.[0]?.id ?? null;
            }

            // INSERT CR com conta_bancaria_id + conta_contabil_id.
            // Trigger garantir_mov_ao_quitar_cr cria a mov automaticamente
            // (não precisamos do INSERT mov manual abaixo).
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
                    observacoes: observacoes.trim() || obsBase,
                    conta_bancaria_id: contaBancaria,
                    conta_contabil_id: contaContabilHerda,
                })
                .select()
                .single();

            if (crErr) throw crErr;

            // Mov é criada automaticamente pelo trigger garantir_mov_ao_quitar_cr
            // ao detectar status='pago' + conta_bancaria_id preenchido.

            if (modoQuitacao) {
                // Quitação: zera todo o calendário em aberto da venda
                // (as parcelas que ainda não foram pagas).
                const { error: delErr } = await ac
                    .from("contas_receber")
                    .update({ deleted_at: new Date().toISOString() })
                    .eq("venda_id", contrato.id)
                    .eq("status", "aberto")
                    .is("deleted_at", null)
                    .neq("id", cr.id);
                if (delErr) console.error("[RegistrarPagamento] erro ao limpar parcelas em aberto:", delErr);
            } else {
                // Pagamento avulso: abate o valor pago das parcelas em aberto,
                // da mais antiga para a mais nova (FIFO). Sem isto, o pagamento
                // ficaria DUPLICADO por cima das parcelas originais (o calendário
                // continuaria cheio mesmo com o saldo quitado). Assim, o que sobra
                // em aberto sempre reflete o que realmente falta receber.
                const { data: abertas, error: abertasErr } = await ac
                    .from("contas_receber")
                    .select("id, valor, valor_pago")
                    .eq("venda_id", contrato.id)
                    .eq("status", "aberto")
                    .is("deleted_at", null)
                    .neq("id", cr.id)
                    .order("data_vencimento", { ascending: true });

                if (abertasErr) {
                    console.error("[RegistrarPagamento] erro ao buscar parcelas em aberto:", abertasErr);
                } else {
                    let restante = v;
                    const aRemover: string[] = [];
                    for (const p of (abertas as any[]) || []) {
                        if (restante <= 0.005) break;
                        const emAberto = parseFloat(p.valor || 0) - parseFloat(p.valor_pago || 0);
                        if (restante >= emAberto - 0.005) {
                            // Parcela totalmente coberta pelo pagamento → remove.
                            aRemover.push(p.id);
                            restante -= emAberto;
                        } else {
                            // Parcela parcialmente coberta → encolhe o valor que resta.
                            const novoValor = Math.round((emAberto - restante) * 100) / 100;
                            const { error: shrinkErr } = await ac
                                .from("contas_receber")
                                .update({ valor: novoValor })
                                .eq("id", p.id);
                            if (shrinkErr) console.error("[RegistrarPagamento] erro ao ajustar parcela parcial:", shrinkErr);
                            restante = 0;
                        }
                    }
                    if (aRemover.length > 0) {
                        const { error: delErr } = await ac
                            .from("contas_receber")
                            .update({ deleted_at: new Date().toISOString() })
                            .in("id", aRemover);
                        if (delErr) console.error("[RegistrarPagamento] erro ao baixar parcelas em aberto:", delErr);
                    }
                }
            }

            return cr;
        },
        onSuccess: () => {
            toast.success(modoQuitacao ? "Contrato quitado." : "Pagamento registrado e vinculado ao contrato");
            queryClient.invalidateQueries({ queryKey: ["client-contratos"] });
            queryClient.invalidateQueries({ queryKey: ["contas-receber"] });
            queryClient.invalidateQueries({ queryKey: ["vendas"] });
            onClose();
        },
        onError: (err: any) => {
            toast.error(err?.message || "Erro ao registrar pagamento");
            // Se o contrato sumiu/ficou inconsistente, recarrega a lista para
            // remover o card fantasma sem precisar de F5 manual.
            queryClient.invalidateQueries({ queryKey: ["client-contratos"] });
        },
    });

    const v = parseFloat(valor) || 0;
    const saldoApos = contrato ? contrato.saldo - v : 0;

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-lg p-0 gap-0">
                <div className="px-7 pt-6 pb-4 border-b border-[#eef0f3]">
                    <DialogTitle className="text-[16px] font-bold text-[#059669]">
                        {modoQuitacao ? "Quitar contrato" : "Registrar pagamento avulso"}
                    </DialogTitle>
                    <DialogDescription className="text-[11px] text-[#667085] mt-1">
                        {contrato?.procedimento && <>Contrato: <strong>{contrato.procedimento}</strong> · </>}
                        Saldo atual: <strong className="text-[#059669]">{formatBRL(contrato?.saldo || 0)}</strong>
                        {modoQuitacao && (
                            <span className="block mt-1 text-[#92400E]">
                                As parcelas em aberto serão removidas após o pagamento.
                            </span>
                        )}
                    </DialogDescription>
                </div>

                <div className="px-7 py-5 space-y-4 bg-[#fafbfc]">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label className="text-[11px] font-bold uppercase tracking-wide text-[#667085] mb-1.5 block">
                                Valor (R$)
                            </Label>
                            <Input
                                type="number"
                                step="0.01"
                                value={valor}
                                onChange={(e) => setValor(e.target.value)}
                                placeholder="0,00"
                                disabled={modoQuitacao}
                                className="h-10 bg-white tabular-nums font-semibold disabled:opacity-90 disabled:cursor-not-allowed"
                            />
                        </div>
                        <div>
                            <Label className="text-[11px] font-bold uppercase tracking-wide text-[#667085] mb-1.5 block">
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
                            <Label className="text-[11px] font-bold uppercase tracking-wide text-[#667085] mb-1.5 block">
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
                            <Label className="text-[11px] font-bold uppercase tracking-wide text-[#667085] mb-1.5 block">
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
                        <Label className="text-[11px] font-bold uppercase tracking-wide text-[#667085] mb-1.5 block">
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
                                <span className="text-[#059669]">Novo saldo</span>
                                <span style={{ color: saldoApos > 0 ? "#E53E3E" : "#039855" }}>
                                    {formatBRL(Math.max(0, saldoApos))}
                                </span>
                            </div>
                            {saldoApos < -0.01 && (
                                <p className="text-[11px] text-[#E53E3E] mt-1">
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
                        className="h-10 px-6 bg-[#059669] hover:bg-[#0f1f33] text-white"
                    >
                        {mutation.isPending
                            ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                            : <Check className="h-4 w-4 mr-1.5" />}
                        {modoQuitacao ? "Quitar contrato" : "Registrar pagamento"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
