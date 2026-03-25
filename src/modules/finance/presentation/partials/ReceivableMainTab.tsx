
import { UseFormReturn } from "react-hook-form";
import { AccountsReceivable } from "../../../domain/schemas/accounts-receivable.schema";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ClientSelect } from "@/modules/clients/presentation/components/ClientSelect";
import { useCategorySuggestion } from "../hooks/useCategorySuggestion";
import { CategorySuggestions } from "../components/CategorySuggestions";

interface ReceivableMainTabProps {
    form: UseFormReturn<AccountsReceivable>;
    categories: any[];
    bankAccounts: any[];
}

export function ReceivableMainTab({ form, categories, bankAccounts }: ReceivableMainTabProps) {
    const description = form.watch("description") || "";
    const { suggestions } = useCategorySuggestion(description, categories || [], "receita");

    return (
        <div className="space-y-4 pt-4">
            <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Descrição</FormLabel>
                        <FormControl>
                            <Input placeholder="Ex: Venda de Serviços" {...field} className="font-medium" />
                        </FormControl>
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
                            <FormLabel>Valor (R$) *</FormLabel>
                            <FormControl>
                                <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    className="font-bold text-lg"
                                    placeholder="0,00"
                                    value={field.value || ""}
                                    onChange={e => {
                                        const raw = e.target.value;
                                        if (raw === "") { field.onChange(undefined); return; }
                                        const val = parseFloat(raw);
                                        field.onChange(isNaN(val) ? undefined : val);
                                    }}
                                    onBlur={field.onBlur}
                                    name={field.name}
                                    ref={field.ref}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="due_date"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>Vencimento</FormLabel>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <FormControl>
                                        <Button
                                            variant={"outline"}
                                            className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                                        >
                                            {field.value ? format(field.value, "dd/MM/yyyy") : <span>Selecione</span>}
                                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                        </Button>
                                    </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={(date) => date < new Date("1900-01-01")} initialFocus />
                                </PopoverContent>
                            </Popover>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <FormLabel>Cliente</FormLabel>
                    {/* Reutilizando o componente ClientSelect super poderoso do outro módulo! */}
                    <ClientSelect
                        value={form.watch("client_id")}
                        onChange={(id) => form.setValue("client_id", id)}
                    />
                </div>

                <FormField
                    control={form.control}
                    name="category_id"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Categoria</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecione..." />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="none">-- Nenhuma --</SelectItem>
                                    {categories?.map((c) => (
                                        <SelectItem key={c.id} value={c.id}>{c.code} - {c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <CategorySuggestions
                                suggestions={suggestions}
                                onSelect={(id) => form.setValue("category_id", id)}
                                currentValue={form.watch("category_id")}
                            />
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>

            {/* Campo Condicional de Recebimento */}
            <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                                <SelectTrigger>
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                <SelectItem value="pending">Pendente (A Receber)</SelectItem>
                                <SelectItem value="paid">Recebido</SelectItem>
                                <SelectItem value="cancelled">Cancelado</SelectItem>
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )}
            />
        </div>
    );
}
