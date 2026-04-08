
import { UseFormReturn } from "react-hook-form";
import { AccountsPayable } from "../../domain/schemas/accounts-payable.schema";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon, Plus, Loader2, Paperclip, Check, ChevronsUpDown, Upload } from "lucide-react";
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
                const isDespesa = c.type === "despesa" || c.account_type === "expense" || c.account_type === "cost";
                const isAnalytic = c.is_analytic === true || c.is_analytical === true;
                return isDespesa && isAnalytic;
            });
        },
        enabled: !!selectedCompany?.id
    });

    const fileUrl = form.watch("file_url");

    return (
        <div className="space-y-4 pt-4">
            {/* Descrição + Valor */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                    <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Descrição <span className="text-red-500">*</span></FormLabel>
                                <FormControl><Input className="bg-white" placeholder="Ex: Aluguel janeiro" {...field} /></FormControl>
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
                            <FormLabel>Valor (R$) <span className="text-red-500">*</span></FormLabel>
                            <FormControl>
                                <Input
                                    className="bg-white"
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

            {/* Vencimento + Competência */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                    control={form.control}
                    name="due_date"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>Vencimento <span className="text-red-500">*</span></FormLabel>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <FormControl>
                                        <Button variant="outline" className={cn("w-full pl-3 text-left font-normal bg-white", !field.value && "text-muted-foreground")}>
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
                            <FormLabel>Competência</FormLabel>
                            <Popover open={competenciaOpen} onOpenChange={setCompetenciaOpen}>
                                <PopoverTrigger asChild>
                                    <FormControl>
                                        <Button variant="outline" className={cn("w-full pl-3 text-left font-normal bg-white", !field.value && "text-muted-foreground")}>
                                            {field.value || <span>Selecione mês/ano</span>}
                                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                        </Button>
                                    </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-[280px] p-3" align="start">
                                    <div className="flex items-center justify-between mb-3">
                                        <Button type="button" variant="ghost" size="sm" onClick={() => setCompetenciaYear(y => y - 1)}>&lt;</Button>
                                        <span className="text-sm font-semibold">{competenciaYear}</span>
                                        <Button type="button" variant="ghost" size="sm" onClick={() => setCompetenciaYear(y => y + 1)}>&gt;</Button>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        {MONTHS.map((month, idx) => {
                                            const val = `${String(idx + 1).padStart(2, "0")}/${competenciaYear}`;
                                            const isSelected = field.value === val;
                                            return (
                                                <Button key={idx} type="button" variant={isSelected ? "default" : "outline"} size="sm"
                                                    className={cn("text-xs", isSelected && "bg-primary text-white")}
                                                    onClick={() => { field.onChange(val); setCompetenciaOpen(false); }}>
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

            {/* Fornecedor + Categoria */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                    control={form.control}
                    name="supplier_id"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <div className="flex items-center justify-between">
                                <FormLabel>Fornecedor</FormLabel>
                                <Button type="button" variant="ghost" className="h-auto p-0 text-xs text-green-600" onClick={() => setIsSupplierSheetOpen(true)}>
                                    <Plus className="w-3" /> Novo
                                </Button>
                            </div>
                            <Popover open={supplierOpen} onOpenChange={setSupplierOpen}>
                                <PopoverTrigger asChild>
                                    <FormControl>
                                        <Button variant="outline" role="combobox" className={cn("w-full justify-between font-normal bg-white", !field.value && "text-muted-foreground")}>
                                            {field.value ? suppliers?.find(s => s.id === field.value)?.razao_social || "Selecione..." : "Selecione..."}
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                                    <Command>
                                        <CommandInput placeholder="Buscar fornecedor..." />
                                        <CommandList>
                                            <CommandEmpty>Nenhum encontrado.</CommandEmpty>
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

                <FormField
                    control={form.control}
                    name="category_id"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>Categoria</FormLabel>
                            <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
                                <PopoverTrigger asChild>
                                    <FormControl>
                                        <Button variant="outline" role="combobox" className={cn("w-full justify-between font-normal bg-white", !field.value && "text-muted-foreground")}>
                                            {field.value ? (() => { const c = categories?.find((c: any) => c.id === field.value); return c ? `${c.code} - ${c.name}` : "Selecione..."; })() : "Selecione..."}
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                                    <Command>
                                        <CommandInput placeholder="Buscar categoria..." />
                                        <CommandList>
                                            <CommandEmpty>Nenhuma encontrada.</CommandEmpty>
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
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>

            {/* Forma de Pagamento + Conta Corrente */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                    control={form.control}
                    name="payment_method"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Forma de Pagamento</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                                <FormControl><SelectTrigger className="bg-white"><SelectValue placeholder="Selecione..." /></SelectTrigger></FormControl>
                                <SelectContent>
                                    {PAYMENT_METHODS.map(m => (
                                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>

            {/* Conta Corrente + Código de Barras */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                    control={form.control}
                    name="bank_account_id"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Conta Corrente</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                                <FormControl><SelectTrigger className="bg-white"><SelectValue placeholder="Selecione..." /></SelectTrigger></FormControl>
                                <SelectContent>
                                    {bankAccounts?.map(b => (
                                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="barcode"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Código de Barras</FormLabel>
                            <FormControl><Input className="bg-white" placeholder="Linha digitável do boleto" {...field} value={field.value || ""} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>

            {/* Observações */}
            <FormField
                control={form.control}
                name="observations"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Observações</FormLabel>
                        <FormControl><Textarea className="bg-white" rows={2} placeholder="Observações sobre esta conta..." {...field} value={field.value || ""} /></FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />

            {/* Anexar Arquivo */}
            {handleFileUpload && (
                <div className="rounded-lg border border-dashed border-muted-foreground/30 p-4">
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
                    {!fileUrl ? (
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full bg-white"
                            onClick={() => document.getElementById("file-upload-payable")?.click()}
                            disabled={isUploading}
                        >
                            {isUploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Paperclip className="w-4 h-4 mr-2" />}
                            Anexar Boleto / Comprovante
                        </Button>
                    ) : (
                        <div className="flex items-center gap-3">
                            <Check className="h-4 w-4 text-green-600" />
                            <a href={fileUrl || "#"} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline flex-1">
                                Arquivo anexado — clique para visualizar
                            </a>
                            <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById("file-upload-payable")?.click()} disabled={isUploading}>
                                Trocar
                            </Button>
                        </div>
                    )}
                </div>
            )}

            <SupplierSheet isOpen={isSupplierSheetOpen} onClose={() => setIsSupplierSheetOpen(false)} />
        </div>
    );
}
