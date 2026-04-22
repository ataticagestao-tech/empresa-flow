import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link2, Link2Off, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/contexts/AuthContext";
import { useClientContratos } from "../hooks/useClientContratos";
import { formatBRL } from "@/lib/format";

interface Props {
    crId: string;
    crVendaId: string | null;
    clientCpfCnpj: string | null | undefined;
    onChanged?: () => void;
}

export function LinkCRToContract({ crId, crVendaId, clientCpfCnpj, onChanged }: Props) {
    const { activeClient } = useAuth();
    const queryClient = useQueryClient();
    const { contratos, isLoading } = useClientContratos(clientCpfCnpj);
    const [open, setOpen] = useState(false);

    const linkedTo = contratos.find((c) => c.id === crVendaId) || null;

    const mutation = useMutation({
        mutationFn: async (vendaId: string | null) => {
            const ac = activeClient as any;
            const { error } = await ac
                .from("contas_receber")
                .update({ venda_id: vendaId })
                .eq("id", crId);
            if (error) throw error;
            return vendaId;
        },
        onSuccess: (vendaId) => {
            toast.success(vendaId ? "Lançamento vinculado ao contrato" : "Vínculo removido");
            queryClient.invalidateQueries({ queryKey: ["client-contratos"] });
            setOpen(false);
            onChanged?.();
        },
        onError: (e: any) => toast.error(e?.message || "Erro ao vincular"),
    });

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                {linkedTo ? (
                    <button
                        type="button"
                        className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded border border-[#059669]/25 bg-[#059669]/5 text-[#059669] hover:bg-[#059669]/10 transition-colors cursor-pointer"
                        title="Vinculado — clique para gerenciar"
                    >
                        <Link2 className="h-3 w-3" />
                        <span className="max-w-[100px] truncate">{linkedTo.procedimento || "Contrato"}</span>
                    </button>
                ) : (
                    <button
                        type="button"
                        className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded border border-transparent text-[#888] hover:text-[#059669] hover:border-[#EAECF0] hover:bg-white transition-colors cursor-pointer"
                        title="Vincular a um contrato"
                    >
                        <Link2 className="h-3 w-3" /> Vincular
                    </button>
                )}
            </PopoverTrigger>

            <PopoverContent className="w-80 p-0" align="end">
                <div className="px-4 py-3 border-b border-[#eef0f3]">
                    <p className="text-[12px] font-bold text-[#059669]">
                        {linkedTo ? "Alterar vínculo" : "Vincular ao contrato"}
                    </p>
                    <p className="text-[10px] text-[#888] mt-0.5">
                        O pagamento deste lançamento será abatido do saldo do contrato selecionado.
                    </p>
                </div>

                <div className="max-h-[280px] overflow-y-auto">
                    {isLoading ? (
                        <div className="py-6 text-center">
                            <Loader2 className="h-4 w-4 mx-auto animate-spin text-[#888]" />
                        </div>
                    ) : contratos.length === 0 ? (
                        <div className="py-6 text-center text-[11px] text-[#888]">
                            <FileText className="h-5 w-5 mx-auto text-[#ccc] mb-1" />
                            Nenhum contrato cadastrado
                        </div>
                    ) : (
                        contratos.map((c) => {
                            const selected = c.id === crVendaId;
                            return (
                                <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => mutation.mutate(c.id)}
                                    disabled={mutation.isPending || selected}
                                    className={`w-full text-left px-4 py-2.5 border-b border-[#f3f4f6] last:border-b-0 transition-colors ${
                                        selected
                                            ? "bg-[#059669]/5 cursor-default"
                                            : "hover:bg-[#f8f9fa] cursor-pointer"
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[12px] font-bold text-[#059669] truncate">
                                            {c.procedimento || c.descricao}
                                        </span>
                                        {selected && (
                                            <span className="text-[9px] font-bold uppercase text-[#039855]">
                                                Atual
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-[10px] text-[#666] mt-0.5 flex gap-3">
                                        <span>Total: <strong>{formatBRL(c.valor_total)}</strong></span>
                                        <span className={c.saldo > 0 ? "text-[#D92D20]" : "text-[#039855]"}>
                                            Saldo: <strong>{formatBRL(c.saldo)}</strong>
                                        </span>
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>

                {linkedTo && (
                    <div className="px-4 py-2 border-t border-[#eef0f3] bg-[#fafbfc]">
                        <button
                            type="button"
                            onClick={() => mutation.mutate(null)}
                            disabled={mutation.isPending}
                            className="w-full inline-flex items-center justify-center gap-1.5 text-[11px] font-medium text-[#D92D20] hover:bg-[#FEF3F2] py-1.5 rounded transition-colors cursor-pointer"
                        >
                            <Link2Off className="h-3 w-3" /> Desvincular do contrato
                        </button>
                    </div>
                )}

                {mutation.isPending && (
                    <div className="px-4 py-2 border-t border-[#eef0f3] bg-white flex items-center justify-center gap-1.5 text-[10px] text-[#888]">
                        <Loader2 className="h-3 w-3 animate-spin" /> Salvando...
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}
