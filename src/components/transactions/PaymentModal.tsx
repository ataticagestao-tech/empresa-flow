import { useState } from "react";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";

const paymentSchema = z.object({
    bank_account_id: z.string().min(1, "Selecione uma conta bancária"),
    amount: z.string().min(1, "Valor é obrigatório"),
    date: z.string().min(1, "Data é obrigatória"),
});

type PaymentFormValues = z.infer<typeof paymentSchema>;

interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    accountingId: string;
    type: "payable" | "receivable";
    initialAmount: number;
    description: string;
    onSuccess: () => void;
}

export function PaymentModal({
    isOpen,
    onClose,
    accountingId,
    type,
    initialAmount,
    description,
    onSuccess,
}: PaymentModalProps) {
    const { toast } = useToast();
    const { selectedCompany } = useCompany();
    const { activeClient, isUsingSecondary } = useAuth();
    const [isProcessing, setIsProcessing] = useState(false);

    // Fetch Bank Accounts
    const { data: bankAccounts } = useQuery({
        queryKey: ["bank_accounts", selectedCompany?.id, isUsingSecondary],
        queryFn: async () => {
            const { data } = await activeClient
                .from("bank_accounts")
                .select("id, name, current_balance, banco")
                .eq("company_id", selectedCompany!.id);
            return data || [];
        },
        enabled: !!selectedCompany?.id && isOpen,
    });

    const form = useForm<PaymentFormValues>({
        resolver: zodResolver(paymentSchema),
        defaultValues: {
            bank_account_id: "",
            amount: initialAmount.toString(),
            date: format(new Date(), "yyyy-MM-dd"),
        },
    });

    const onSubmit = async (values: PaymentFormValues) => {
        setIsProcessing(true);
        try {
            const rpcName = type === "payable" ? "quitar_conta_pagar" : "quitar_conta_receber";
            const idParam = type === "payable" ? "p_conta_pagar_id" : "p_conta_receber_id";
            const formaParam = type === "payable" ? "p_forma_pagamento" : "p_forma_recebimento";

            const { data, error } = await activeClient.rpc(rpcName, {
                [idParam]: accountingId,
                p_valor_pago: parseFloat(values.amount),
                p_data_pagamento: values.date,
                p_conta_bancaria_id: values.bank_account_id,
                [formaParam]: "pix",
            });

            if (error) throw error;

            const result = data as any;
            const statusMsg = result?.novo_status === "pago" ? "quitada" : "parcialmente paga";

            toast({
                title: "Sucesso",
                description: `Conta ${statusMsg} com sucesso!`,
            });
            onSuccess();
            onClose();
        } catch (err: any) {
            console.error(err);
            const msg = err.message || "Erro ao processar";
            let userMsg = msg;
            if (msg.includes("CR_JA_PAGO") || msg.includes("CP_JA_PAGO")) userMsg = "Esta conta ja foi quitada";
            else if (msg.includes("NOT_FOUND")) userMsg = "Conta nao encontrada";
            else if (msg.includes("VALOR_INVALIDO")) userMsg = "Valor invalido";
            toast({
                title: "Erro",
                description: userMsg,
                variant: "destructive",
            });
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{type === 'payable' ? 'Pagar Conta' : 'Receber Conta'}</DialogTitle>
                    <DialogDescription>
                        {description}
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

                        <FormField
                            control={form.control}
                            name="bank_account_id"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Conta Bancária / Caixa</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Selecione a conta..." />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {bankAccounts?.map((account) => (
                                                <SelectItem key={account.id} value={account.id}>
                                                    {account.name} ({account.banco}) - Saldo: R$ {account.current_balance}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="amount"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Valor Pago (R$)</FormLabel>
                                        <FormControl>
                                            <Input type="number" step="0.01" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="date"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Data Pagamento</FormLabel>
                                        <FormControl>
                                            <Input type="date" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
                            <Button type="submit" disabled={isProcessing}>
                                {isProcessing ? "Processando..." : "Confirmar Baixa"}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
