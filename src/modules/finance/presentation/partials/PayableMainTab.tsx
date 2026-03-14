
import { UseFormReturn } from "react-hook-form";
import { AccountsPayable } from "../../domain/schemas/accounts-payable.schema";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CalendarIcon, Plus, Loader2, Paperclip } from "lucide-react";
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

    const fileUrl = form.watch("file_url");

    return (
        <div className="space-y-4 pt-4">
            {/* Descrição */}
            <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Descrição</FormLabel>
                        <FormControl><Input placeholder="Ex: Aluguel" {...field} /></FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />

            {/* Valor + Fornecedor */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Valor (R$)</FormLabel>
                            <FormControl>
                                <Input
                                    type="number"
                                    step="0.01"
                                    {...field}
                                    onChange={e => {
                                        const val = parseFloat(e.target.value);
                                        field.onChange(isNaN(val) ? 0 : val);
                                    }}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="supplier_id"
                    render={({ field }) => (
                        <FormItem>
                            <div className="flex items-center justify-between">
                                <FormLabel>Fornecedor</FormLabel>
                                <Button type="button" variant="ghost" className="h-auto p-0 text-xs text-green-600" onClick={() => setIsSupplierSheetOpen(true)}>
                                    <Plus className="w-3" /> Novo
                                </Button>
                            </div>
                            <Select onValueChange={field.onChange} value={field.value || "none"}>
                                <FormControl>
                                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="none">-- Nenhum --</SelectItem>
                                    {suppliers?.map(s => (
                                        <SelectItem key={s.id} value={s.id}>{s.razao_social}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>

            {/* Vencimento + Previsão + Conta Corrente */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                    control={form.control}
                    name="due_date"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>Vencimento</FormLabel>
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
                    name="payment_date"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>Previsão de Pagamento</FormLabel>
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
                                    <Calendar mode="single" selected={field.value ?? undefined} onSelect={field.onChange} />
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
                        <FormItem>
                            <FormLabel>Conta Corrente</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || "none"}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger></FormControl>
                                <SelectContent>
                                    <SelectItem value="none">-- Nenhuma --</SelectItem>
                                    {bankAccounts?.map(b => (
                                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>

            {/* Competência + Forma Pagamento + Status */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                    control={form.control}
                    name="competencia"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Competência</FormLabel>
                            <FormControl>
                                <Input
                                    placeholder="MM/AAAA"
                                    maxLength={7}
                                    {...field}
                                    value={field.value || ""}
                                    onChange={e => {
                                        let v = e.target.value.replace(/\D/g, "");
                                        if (v.length > 2) v = v.slice(0, 2) + "/" + v.slice(2, 6);
                                        field.onChange(v);
                                    }}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="payment_method"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Forma de Pagamento</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || "none"}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger></FormControl>
                                <SelectContent>
                                    <SelectItem value="none">-- Nenhuma --</SelectItem>
                                    <SelectItem value="pix">PIX</SelectItem>
                                    <SelectItem value="boleto">Boleto</SelectItem>
                                    <SelectItem value="transferencia">Transferência</SelectItem>
                                    <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                                    <SelectItem value="cartao_debito">Cartão de Débito</SelectItem>
                                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                                    <SelectItem value="cheque">Cheque</SelectItem>
                                    <SelectItem value="debito_automatico">Débito Automático</SelectItem>
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Status</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                <SelectContent>
                                    <SelectItem value="pending">Pendente</SelectItem>
                                    <SelectItem value="paid">Pago</SelectItem>
                                    <SelectItem value="cancelled">Cancelado</SelectItem>
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>

            {/* Nota Fiscal + Código de Barras */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                    control={form.control}
                    name="invoice_number"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Nota Fiscal</FormLabel>
                            <FormControl><Input placeholder="Número da NF" {...field} value={field.value || ""} /></FormControl>
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
                            <FormControl><Input placeholder="Linha digitável do boleto" {...field} value={field.value || ""} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>

            {/* Chave PIX */}
            <FormField
                control={form.control}
                name="pix_key"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Chave PIX</FormLabel>
                        <FormControl><Input placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória" {...field} value={field.value || ""} /></FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />

            {/* Observações */}
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

            {/* Anexar Boleto/Arquivo */}
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
