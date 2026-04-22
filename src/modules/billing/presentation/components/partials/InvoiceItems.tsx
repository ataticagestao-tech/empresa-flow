
import { UseFormReturn, useFieldArray } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InvoiceFormValues } from "../../domain/schemas/invoice.schema";
import { formatCurrency } from "@/utils/formatters";

interface InvoiceItemsProps {
    form: UseFormReturn<InvoiceFormValues>;
}

export function InvoiceItems({ form }: InvoiceItemsProps) {
    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "items",
    });

    const addItem = () => {
        append({
            description: "",
            quantity: 1,
            unitPrice: 0,
        });
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-sm font-semibold text-muted-foreground">Itens / Serviços</h3>
                <Button type="button" size="sm" variant="outline" onClick={addItem} className="text-xs gap-1">
                    <Plus className="w-3 h-3" /> Adicionar Item
                </Button>
            </div>

            <div className="border rounded-md overflow-hidden bg-white shadow-sm">
                <Table>
                    <TableHeader className="bg-[#F6F2EB]">
                        <TableRow>
                            <TableHead className="w-[40%]">Descrição</TableHead>
                            <TableHead className="w-[15%] text-right">Qtd</TableHead>
                            <TableHead className="w-[20%] text-right">Valor Unit.</TableHead>
                            <TableHead className="w-[20%] text-right">Total</TableHead>
                            <TableHead className="w-[5%]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {fields.map((field, index) => {
                            // Cálculos em tempo real para feedback visual
                            const qtd = form.watch(`items.${index}.quantity`) || 0;
                            const price = form.watch(`items.${index}.unitPrice`) || 0;
                            const total = qtd * price;

                            return (
                                <TableRow key={field.id}>
                                    <TableCell>
                                        <FormField
                                            control={form.control}
                                            name={`items.${index}.description`}
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormControl>
                                                        <Input className="h-8 text-xs" placeholder="Ex: Consultoria Técnica" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <FormField
                                            control={form.control}
                                            name={`items.${index}.quantity`}
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormControl>
                                                        <Input
                                                            type="number"
                                                            className="h-8 text-xs text-right"
                                                            {...field}
                                                            onChange={e => field.onChange(Number(e.target.value))}
                                                        />
                                                    </FormControl>
                                                </FormItem>
                                            )}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <FormField
                                            control={form.control}
                                            name={`items.${index}.unitPrice`}
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormControl>
                                                        <Input
                                                            type="number"
                                                            className="h-8 text-xs text-right"
                                                            step="0.01"
                                                            {...field}
                                                            onChange={e => field.onChange(Number(e.target.value))}
                                                        />
                                                    </FormControl>
                                                </FormItem>
                                            )}
                                        />
                                    </TableCell>
                                    <TableCell className="text-right text-xs font-medium text-muted-foreground">
                                        {formatCurrency(total)}
                                    </TableCell>
                                    <TableCell>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                                            onClick={() => remove(index)}
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            );
                        })}

                        {fields.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-xs">
                                    Nenhum item adicionado à fatura.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
