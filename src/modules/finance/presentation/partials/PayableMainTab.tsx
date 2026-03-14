
import { UseFormReturn } from "react-hook-form";
import { AccountsPayable } from "../../domain/schemas/accounts-payable.schema";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useCategorySuggestion } from "../hooks/useCategorySuggestion";
import { CategorySuggestions } from "../components/CategorySuggestions";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon, Plus, Loader2, Paperclip, Check, ChevronsUpDown, AlertTriangle } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { SupplierSheet } from "@/components/suppliers/SupplierSheet";

interface PayableMainTabProps {
    form: UseFormReturn<AccountsPayable>;
    handleFileUpload?: (file: File) => Promise<void>;
    isUploading?: boolean;
}

export function PayableMainTab({ form, handleFileUpload, isUploading }: PayableMainTabProps) {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const [isSupplierSheetOpen, setIsSupplierSheetOpen] = useState(false);
    const [supplierOpen, setSupplierOpen] = useState(false);
    const [categoryOpen, setCategoryOpen] = useState(false);
    const [paymentMethodOpen, setPaymentMethodOpen] = useState(false);
    const [bankAccountOpen, setBankAccountOpen] = useState(false);
    const [competenciaOpen, setCompetenciaOpen] = useState(false);
    const [competenciaYear, setCompetenciaYear] = useState(new Date().getFullYear());

    const MONTHS = [
        "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
        "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ];

    const PAYMENT_METHODS = [
        { value: "pix", label: "PIX" },
        { value: "boleto", label: "Boleto" },
        { value: "transferencia", label: "Transferência" },
        { value: "cartao_credito", label: "Cartão de Crédito" },
        { value: "cartao_debito", label: "Cartão de Débito" },
        { value: "dinheiro", label: "Dinheiro" },
        { value: "cheque", label: "Cheque" },
        { value: "debito_automatico", label: "Débito Automático" },
    ];

    const { data: suppliers } = useQuery({
        queryKey: ["suppliers", selectedCompany?.id],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data } = await activeClient
                .from("suppliers")
                .select("id, razao_social")
                .eq("company_id", selectedCompany.id);
            return data || [];
        },
        enabled: !!selectedCompany?.id
    });

    const { data: bankAccounts } = useQuery({
        queryKey: ["bank_accounts", selectedCompany?.id],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data } = await activeClient
                .from("bank_accounts")
                .select("id, name")
                .eq("company_id", selectedCompany.id);
            return data || [];
        },
        enabled: !!selectedCompany?.id
    });

    // Categorias (plano de contas - despesas analíticas)
    const { data: categories } = useQuery({
        queryKey: ["chart_of_accounts", selectedCompany?.id, "despesa"],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data, error } = await activeClient
                .from("chart_of_accounts")
                .select("*")
                .eq("company_id", selectedCompany.id)
                .order("code");
            if (error) return [];
            return (data || []).filter((c: any) => {
                const isDespesa = c.type === "despesa" || c.account_type === "expense";
                const isAnalytic = c.is_analytic === true || c.is_analytical === true;
                return isDespesa && isAnalytic;
            });
        },
        enabled: !!selectedCompany?.id
    });

    const description = form.watch("description") || "";
    const { suggestions } = useCategorySuggestion(description, categories || [], "despesa");

    const fileUrl = form.watch("file_url");

    return (
        <div className="space-y-4 pt-4">
            {/* 1. Fornecedor (obrigatório) — combobox com busca */}
            <FormField
                control={form.control}
                name="supplier_id"
                render={({ field }) => (
                    <FormItem className="flex flex-col">
                        <div className="flex items-center justify-between">
                            <FormLabel>Fornecedor *</FormLabel>
                            <Button type="button" variant="ghost" className="h-auto p-0 text-xs text-green-600" onClick={() => setIsSupplierSheetOpen(true)}>
                                <Plus className="w-3" /> Novo
                            </Button>
                        </div>
                        <Popover open={supplierOpen} onOpenChange={setSupplierOpen}>
                            <PopoverTrigger asChild>
                                <FormControl>
                                    <Button variant="outline" role="combobox" className={cn("w-full justify-between font-normal", !field.value && "text-muted-foreground")}>
                                        {field.value ? suppliers?.find(s => s.id === field.value)?.razao_social || "Selecione..." : "Selecione o fornecedor..."}
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                                <Command>
                                    <CommandInput placeholder="Buscar fornecedor..." />
                                    <CommandList>
                                        <CommandEmpty>Nenhum fornecedor encontrado.</CommandEmpty>
                                        <CommandGroup>
                                            {suppliers?.map(s => (
                                                <CommandItem key={s.id} value={s.razao_social} onSelect={() => { field.onChange(s.id); setSupplierOpen(false); }}>
                                                    <Check className={cn("mr-2 h-4 w-4", field.value === s.id ? "opacity-100" : "opacity-0")} />
                                                    {s.razao_social}
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                        <FormMessage />
                    </FormItem>
                )}
            />

            {/* 2. Descrição (obrigatório) + Valor (obrigatório) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                    <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Descrição *</FormLabel>
                                <FormControl><Input placeholder="Ex: Aluguel janeiro" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Valor (R$) *</FormLabel>
                            <FormControl>
                                <Input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    placeholder="0,00"
                                    value={field.value || ""}
                                    onChange={e => {
                                        const val = parseFloat(e.target.value);
                                        field.onChange(isNaN(val) ? undefined : val);
                                    }}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>

            {/* 3. Vencimento (obrigatório) + Competência (obrigatório — picker mês/ano) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                    control={form.control}
                    name="due_date"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>Vencimento *</FormLabel>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <FormControl>
                                        <Button variant="outline" className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                            {field.value ? format(field.value, "dd/MM/yyyy") : <span>Selecione</span>}
                                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                        </Button>
                                    </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                                </PopoverContent>
                            </Popover>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="competencia"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>Competência *</FormLabel>
                            <Popover open={competenciaOpen} onOpenChange={setCompetenciaOpen}>
                                <PopoverTrigger asChild>
                                    <FormControl>
                                        <Button variant="outline" className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                            {field.value || <span>Selecione mês/ano</span>}
                                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                        </Button>
                                    </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-[280px] p-3" align="start">
                                    <div className="flex items-center justify-between mb-3">
                                        <Button type="button" variant="ghost" size="sm" onClick={() => setCompetenciaYear(y => y - 1)}>
                                            &lt;
                                        </Button>
                                        <span className="text-sm font-semibold">{competenciaYear}</span>
                                        <Button type="button" variant="ghost" size="sm" onClick={() => setCompetenciaYear(y => y + 1)}>
                                            &gt;
                                        </Button>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        {MONTHS.map((month, idx) => {
                                            const val = `${String(idx + 1).padStart(2, "0")}/${competenciaYear}`;
                                            const isSelected = field.value === val;
                                            return (
                                                <Button
                                                    key={idx}
                                                    type="button"
                                                    variant={isSelected ? "default" : "outline"}
                                                    size="sm"
                                                    className={cn("text-xs", isSelected && "bg-primary text-white")}
                                                    onClick={() => { field.onChange(val); setCompetenciaOpen(false); }}
                                                >
                                                    {month.slice(0, 3)}
                                                </Button>
                                            );
                                        })}
                                    </div>
                                </PopoverContent>
                            </Popover>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>

            {/* 4. Categoria no Plano de Contas (obrigatório) — combobox com busca */}
            <FormField
                control={form.control}
                name="category_id"
                render={({ field }) => (
                    <FormItem className="flex flex-col">
                        <FormLabel>Categoria (Plano de Contas) *</FormLabel>
                        <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
                            <PopoverTrigger asChild>
                                <FormControl>
                                    <Button variant="outline" role="combobox" className={cn("w-full justify-between font-normal", !field.value && "text-muted-foreground")}>
                                        {field.value ? (() => { const c = categories?.find((c: any) => c.id === field.value); return c ? `${c.code} - ${c.name}` : "Selecione..."; })() : "Selecione a categoria..."}
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                                <Command>
                                    <CommandInput placeholder="Buscar categoria..." />
                                    <CommandList>
                                        <CommandEmpty>Nenhuma categoria encontrada.</CommandEmpty>
                                        <CommandGroup>
                                            {categories?.map((c: any) => (
                                                <CommandItem key={c.id} value={`${c.code} - ${c.name}`} onSelect={() => { field.onChange(c.id); setCategoryOpen(false); }}>
                                                    <Check className={cn("mr-2 h-4 w-4", field.value === c.id ? "opacity-100" : "opacity-0")} />
                                                    {c.code} - {c.name}
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                        <CategorySuggestions
                            suggestions={suggestions}
                            onSelect={(id) => { form.setValue("category_id", id); setCategoryOpen(false); }}
                            currentValue={form.watch("category_id")}
                        />
                        <FormMessage />
                    </FormItem>
                )}
            />

            {/* 5. Chave PIX (tipo + valor) + Código de Barras (ao menos 1 obrigatório) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <FormField
                        control={form.control}
                        name="pix_key_type"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Tipo de Chave PIX *</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value || ""}>
                                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione o tipo..." /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        <SelectItem value="cpf">CPF</SelectItem>
                                        <SelectItem value="cnpj">CNPJ</SelectItem>
                                        <SelectItem value="telefone">Telefone</SelectItem>
                                        <SelectItem value="email">E-mail</SelectItem>
                                        <SelectItem value="aleatoria">Chave Aleatória</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="pix_key"
                        render={({ field }) => {
                            const pixType = form.watch("pix_key_type");
                            const placeholders: Record<string, string> = {
                                cpf: "000.000.000-00",
                                cnpj: "00.000.000/0000-00",
                                telefone: "+55 11 99999-9999",
                                email: "exemplo@email.com",
                                aleatoria: "Chave aleatória",
                            };
                            const masks: Record<string, (v: string) => string> = {
                                cpf: (v) => {
                                    v = v.replace(/\D/g, "").slice(0, 11);
                                    if (v.length > 9) return v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, "$1.$2.$3-$4");
                                    if (v.length > 6) return v.replace(/(\d{3})(\d{3})(\d{1,3})/, "$1.$2.$3");
                                    if (v.length > 3) return v.replace(/(\d{3})(\d{1,3})/, "$1.$2");
                                    return v;
                                },
                                cnpj: (v) => {
                                    v = v.replace(/\D/g, "").slice(0, 14);
                                    if (v.length > 12) return v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{1,2})/, "$1.$2.$3/$4-$5");
                                    if (v.length > 8) return v.replace(/(\d{2})(\d{3})(\d{3})(\d{1,4})/, "$1.$2.$3/$4");
                                    if (v.length > 5) return v.replace(/(\d{2})(\d{3})(\d{1,3})/, "$1.$2.$3");
                                    if (v.length > 2) return v.replace(/(\d{2})(\d{1,3})/, "$1.$2");
                                    return v;
                                },
                                telefone: (v) => {
                                    v = v.replace(/\D/g, "").slice(0, 13);
                                    if (v.length > 10) return v.replace(/(\d{2})(\d{2})(\d{5})(\d{1,4})/, "+$1 $2 $3-$4");
                                    if (v.length > 7) return v.replace(/(\d{2})(\d{2})(\d{1,5})/, "+$1 $2 $3");
                                    if (v.length > 2) return v.replace(/(\d{2})(\d{1,2})/, "+$1 $2");
                                    return v;
                                },
                            };
                            return (
                                <FormItem>
                                    <FormControl>
                                        <Input
                                            placeholder={placeholders[pixType || ""] || "Selecione o tipo acima"}
                                            {...field}
                                            value={field.value || ""}
                                            onChange={e => {
                                                const mask = pixType ? masks[pixType] : undefined;
                                                field.onChange(mask ? mask(e.target.value) : e.target.value);
                                            }}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            );
                        }}
                    />
                </div>

                <FormField
                    control={form.control}
                    name="barcode"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Código de Barras *</FormLabel>
                            <FormControl><Input placeholder="Linha digitável do boleto" {...field} value={field.value || ""} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>
            <p className="text-xs text-muted-foreground -mt-2">* Preencha pelo menos um: Chave PIX ou Código de Barras</p>

            {/* 6. Forma de Pagamento + Conta Corrente (sem Status) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                    control={form.control}
                    name="payment_method"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>Forma de Pagamento</FormLabel>
                            <Popover open={paymentMethodOpen} onOpenChange={setPaymentMethodOpen}>
                                <PopoverTrigger asChild>
                                    <FormControl>
                                        <Button variant="outline" role="combobox" className={cn("w-full justify-between font-normal", (!field.value || field.value === "none") && "text-muted-foreground")}>
                                            {field.value && field.value !== "none" ? PAYMENT_METHODS.find(m => m.value === field.value)?.label || "Selecione..." : "Selecione..."}
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                                    <Command>
                                        <CommandInput placeholder="Buscar forma..." />
                                        <CommandList>
                                            <CommandEmpty>Nenhuma forma encontrada.</CommandEmpty>
                                            <CommandGroup>
                                                {PAYMENT_METHODS.map(m => (
                                                    <CommandItem key={m.value} value={m.label} onSelect={() => { field.onChange(m.value); setPaymentMethodOpen(false); }}>
                                                        <Check className={cn("mr-2 h-4 w-4", field.value === m.value ? "opacity-100" : "opacity-0")} />
                                                        {m.label}
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="bank_account_id"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>Conta Corrente</FormLabel>
                            <Popover open={bankAccountOpen} onOpenChange={setBankAccountOpen}>
                                <PopoverTrigger asChild>
                                    <FormControl>
                                        <Button variant="outline" role="combobox" className={cn("w-full justify-between font-normal", (!field.value || field.value === "none") && "text-muted-foreground")}>
                                            {field.value && field.value !== "none" ? bankAccounts?.find(b => b.id === field.value)?.name || "Selecione..." : "Selecione..."}
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                                    <Command>
                                        <CommandInput placeholder="Buscar conta..." />
                                        <CommandList>
                                            <CommandEmpty>Nenhuma conta encontrada.</CommandEmpty>
                                            <CommandGroup>
                                                {bankAccounts?.map(b => (
                                                    <CommandItem key={b.id} value={b.name} onSelect={() => { field.onChange(b.id); setBankAccountOpen(false); }}>
                                                        <Check className={cn("mr-2 h-4 w-4", field.value === b.id ? "opacity-100" : "opacity-0")} />
                                                        {b.name}
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>

            {/* 7. Nota Fiscal — destaque alerta */}
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
                <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <span className="text-sm font-semibold text-amber-800">Nota Fiscal</span>
                </div>
                <FormField
                    control={form.control}
                    name="invoice_number"
                    render={({ field }) => (
                        <FormItem>
                            <FormControl><Input placeholder="Número da NF (importante para controle fiscal)" className="border-amber-200 focus:border-amber-400" {...field} value={field.value || ""} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>

            {/* 8. Detalhes Adicionais */}
            <FormField
                control={form.control}
                name="observations"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Detalhes Adicionais</FormLabel>
                        <FormControl><Textarea placeholder="Observações sobre esta conta..." {...field} value={field.value || ""} /></FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />

            {/* 9. Anexar Boleto */}
            {handleFileUpload && (
                <div className="flex items-center gap-2 p-4 border border-dashed rounded-lg bg-[#F8FAFC]">
                    <Input
                        type="file"
                        className="hidden"
                        id="file-upload-payable"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload(file);
                        }}
                        disabled={isUploading}
                    />
                    <Button type="button" variant="secondary" onClick={() => document.getElementById("file-upload-payable")?.click()} disabled={isUploading}>
                        {isUploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Paperclip className="w-4 h-4 mr-2" />}
                        {fileUrl ? "Trocar Arquivo" : "Anexar Boleto"}
                    </Button>
                    {fileUrl && (
                        <div className="flex flex-col ml-2">
                            <span className="text-xs text-green-600 font-medium">Anexado</span>
                            <a href={fileUrl || "#"} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline">
                                Visualizar
                            </a>
                        </div>
                    )}
                </div>
            )}

            <SupplierSheet isOpen={isSupplierSheetOpen} onClose={() => setIsSupplierSheetOpen(false)} />
        </div>
    );
}
