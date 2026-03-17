import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

const bankAccountFormSchema = z.object({
    name: z.string().min(1, "Nome da conta é obrigatório"),
    type: z.string().min(1, "Tipo é obrigatório"),
    banco: z.string().optional(),
    agencia: z.string().optional(),
    conta: z.string().optional(),
    digito: z.string().optional(),
    initial_balance: z.string().optional(), // Input as string for easier handling
    pix_key: z.string().optional(),
    pix_type: z.string().optional(),
});

type BankAccountFormValues = z.infer<typeof bankAccountFormSchema>;

interface BankAccountFormProps {
    onSuccess: () => void;
    initialData?: any;
}

export function BankAccountForm({ onSuccess, initialData }: BankAccountFormProps) {
    const { toast } = useToast();
    const { selectedCompany } = useCompany();
    const { activeClient } = useAuth();
    const queryClient = useQueryClient();

    const form = useForm<BankAccountFormValues>({
        resolver: zodResolver(bankAccountFormSchema),
        defaultValues: {
            name: "",
            type: "checking",
            banco: "",
            agencia: "",
            conta: "",
            digito: "",
            initial_balance: "0,00",
            pix_key: "",
            pix_type: "cpf",
        },
    });

    useEffect(() => {
        if (initialData) {
            form.reset({
                name: initialData.name,
                type: initialData.type,
                banco: initialData.banco || "",
                agencia: initialData.agencia || "",
                conta: initialData.conta || "",
                digito: initialData.digito || "",
                initial_balance: initialData.initial_balance ? String(initialData.initial_balance).replace('.', ',') : "0,00",
                pix_key: initialData.pix_key || "",
                pix_type: initialData.pix_type || "cpf",
            });
        }
    }, [initialData, form]);

    const onSubmit = async (values: BankAccountFormValues) => {
        if (!selectedCompany) return;

        try {
            const balance = parseFloat(values.initial_balance?.replace(/\./g, '').replace(',', '.') || "0");

            const payload = {
                company_id: selectedCompany.id,
                name: values.name,
                type: values.type || "checking",
                banco: values.banco || null,
                agencia: values.agencia || null,
                conta: values.conta || null,
                digito: values.digito || null,
                initial_balance: balance,
                current_balance: balance,
                pix_key: values.pix_key || null,
                pix_type: values.pix_type || null,
            };

            let error;
            if (initialData?.id) {
                // Don't update current_balance on edit to avoid messing up transactions
                const { current_balance, ...updatePayload } = payload;
                const { error: err } = await activeClient
                    .from("bank_accounts")
                    .update(updatePayload)
                    .eq("id", initialData.id);
                error = err;
            } else {
                const { error: err } = await activeClient
                    .from("bank_accounts")
                    .insert(payload);
                error = err;
            }

            if (error) throw error;

            toast({
                title: "Sucesso",
                description: `Conta bancária ${initialData ? "atualizada" : "criada"} com sucesso!`,
            });

            queryClient.invalidateQueries({ queryKey: ["bank_accounts"] });
            onSuccess();
            if (!initialData) form.reset();
        } catch (err: any) {
            console.error(err);
            toast({
                title: "Erro",
                description: "Falha ao salvar conta bancária.",
                variant: "destructive",
            });
        }
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Nome da Conta (Apelido)</FormLabel>
                            <FormControl>
                                <Input placeholder="Ex: Conta Principal, Caixinha" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="type"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Tipo</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecione..." />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="checking">Conta Corrente</SelectItem>
                                        <SelectItem value="savings">Conta Poupança</SelectItem>
                                        <SelectItem value="investment">Investimento</SelectItem>
                                        <SelectItem value="cash">Caixa Físico</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="initial_balance"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Saldo Inicial</FormLabel>
                                <FormControl>
                                    <Input placeholder="0,00" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="grid grid-cols-3 gap-4">
                    <FormField
                        control={form.control}
                        name="banco"
                        render={({ field }) => (
                            <FormItem className="col-span-3">
                                <FormLabel>Banco</FormLabel>
                                <FormControl>
                                    <Input placeholder="Ex: Itaú, Nubank..." {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="agencia"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Agência</FormLabel>
                                <FormControl>
                                    <Input placeholder="" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="conta"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Conta</FormLabel>
                                <FormControl>
                                    <Input placeholder="" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="digito"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Dígito</FormLabel>
                                <FormControl>
                                    <Input placeholder="" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="pix_type"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Tipo Chave PIX</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecione..." />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="cpf">CPF</SelectItem>
                                        <SelectItem value="cnpj">CNPJ</SelectItem>
                                        <SelectItem value="email">E-mail</SelectItem>
                                        <SelectItem value="phone">Celular</SelectItem>
                                        <SelectItem value="random">Chave Aleatória</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="pix_key"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Chave PIX</FormLabel>
                                <FormControl>
                                    <Input placeholder="" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="flex justify-end space-x-2 pt-4">
                    <Button type="button" variant="outline" onClick={onSuccess}>Cancel</Button>
                    <Button type="submit">Salvar</Button>
                </div>
            </form>
        </Form>
    );
}
