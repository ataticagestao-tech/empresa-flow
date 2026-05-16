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
import { useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { BANKS } from "@/lib/banks";

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
    // Importação automática de extrato via email
    ofx_acctid: z.string().optional(),
    auto_conciliacao_policy: z.string().optional(),
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
            ofx_acctid: "",
            auto_conciliacao_policy: "off",
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
                ofx_acctid: initialData.ofx_acctid || "",
                auto_conciliacao_policy: initialData.auto_conciliacao_policy || "off",
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
                ofx_acctid: values.ofx_acctid?.trim() || null,
                auto_conciliacao_policy: values.auto_conciliacao_policy || "off",
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
                                        <SelectItem value="credit_card">Cartão de Crédito</SelectItem>
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
                        render={({ field }) => {
                            const [bankOpen, setBankOpen] = useState(false);
                            return (
                                <FormItem className="col-span-3">
                                    <FormLabel>Instituição Financeira</FormLabel>
                                    <Popover open={bankOpen} onOpenChange={setBankOpen}>
                                        <PopoverTrigger asChild>
                                            <FormControl>
                                                <Button
                                                    variant="outline"
                                                    role="combobox"
                                                    aria-expanded={bankOpen}
                                                    className={cn("w-full justify-between font-normal", !field.value && "text-muted-foreground")}
                                                >
                                                    {field.value || "Selecione o banco..."}
                                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                </Button>
                                            </FormControl>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[400px] p-0" align="start">
                                            <Command>
                                                <CommandInput placeholder="Buscar banco..." />
                                                <CommandList className="max-h-[250px]">
                                                    <CommandEmpty>Nenhum banco encontrado.</CommandEmpty>
                                                    <CommandGroup>
                                                        {BANKS.map((bank) => (
                                                            <CommandItem
                                                                key={bank.code}
                                                                value={`${bank.code} ${bank.name}`}
                                                                onSelect={() => {
                                                                    field.onChange(`${bank.code} - ${bank.name}`);
                                                                    setBankOpen(false);
                                                                }}
                                                            >
                                                                <Check className={cn("mr-2 h-4 w-4", field.value === `${bank.code} - ${bank.name}` ? "opacity-100" : "opacity-0")} />
                                                                {bank.code} - {bank.name}
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                    <FormMessage />
                                </FormItem>
                            );
                        }}
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

                {/* ── Importação automática de extrato via email ──────── */}
                <div className="border-t pt-4 mt-2">
                    <div className="text-sm font-medium mb-1">Importação automática de extrato</div>
                    <p className="text-xs text-muted-foreground mb-3">
                        Quando o banco envia o OFX por email diariamente, o sistema importa sozinho e
                        identifica esta conta pelo ID interno do OFX (ACCTID).
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                        <FormField
                            control={form.control}
                            name="ofx_acctid"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>ID da conta no OFX (ACCTID)</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Ex: 12345-6" {...field} />
                                    </FormControl>
                                    <p className="text-[11px] text-muted-foreground mt-1">
                                        Abra um OFX recente em editor de texto e procure por
                                        <code className="mx-1">&lt;ACCTID&gt;</code>.
                                    </p>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="auto_conciliacao_policy"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Auto-conciliar ao importar?</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value || "off"}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="off">Não — só importar</SelectItem>
                                            <SelectItem value="rule_only">Sim, só via regra de alta confiança</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <p className="text-[11px] text-muted-foreground mt-1">
                                        "Regra de alta confiança" = regra aprendida marcada como
                                        Alta + ação auto-conciliar.
                                    </p>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                </div>

                <div className="flex justify-end space-x-2 pt-4">
                    <Button type="button" variant="outline" onClick={onSuccess}>Cancel</Button>
                    <Button type="submit">Salvar</Button>
                </div>
            </form>
        </Form>
    );
}
