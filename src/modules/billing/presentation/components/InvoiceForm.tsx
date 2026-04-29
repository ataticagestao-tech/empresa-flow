
import { Save, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
// import { DatePicker } from "@/components/ui/date-picker"; // Assumindo componente existente ou Input Date por enquanto
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";

import { Invoice } from "../../domain/schemas/invoice.schema";
import { useInvoiceForm } from "../hooks/useInvoiceForm";
import { InvoiceItems } from "./partials/InvoiceItems";
import { ClientSelect } from "@/modules/clients/presentation/components/ClientSelect";
import { formatCurrency } from "@/utils/formatters";

interface InvoiceFormProps {
    initialData?: Partial<Invoice>;
    onSuccess: (data: Invoice) => void;
}

export function InvoiceForm({ initialData, onSuccess }: InvoiceFormProps) {
    const { form, onSubmit, isSaving, totalTax, taxesDetail } = useInvoiceForm({ initialData, onSuccess });

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-5xl mx-auto py-6 animate-in fade-in transition-all">

                {/* Header com Totais */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2 bg-white p-4 rounded-lg border">
                    <div>
                        <h2 className="text-xl font-bold tracking-tight text-foreground">Nova Fatura de Serviço</h2>
                        <p className="text-sm text-muted-foreground">Preencha os dados abaixo para emitir a NFS-e</p>
                    </div>
                    <div className="text-right flex gap-6">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase">Impostos (Estimado)</p>
                            <p className="text-lg font-mono font-bold text-[#E53E3E]">
                                {formatCurrency(totalTax)}
                            </p>
                        </div>
                        <div className="border-l pl-6">
                            <p className="text-xs text-muted-foreground font-medium uppercase">Total Geral</p>
                            <p className="text-xl font-bold text-green-700">
                                {/* Cálculo simples para display. Idealmente viria do hook também */}
                                {formatCurrency((form.watch("items") || []).reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0))}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Seção 1: Dados Gerais */}
                <Card>
                    <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Cliente (Idealmente um Combobox com busca) */}
                        <div className="md:col-span-1">
                            <FormField
                                control={form.control}
                                name="clientId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-xs font-bold uppercase text-muted-foreground">Cliente</FormLabel>
                                        <FormControl>
                                            <ClientSelect
                                                value={field.value}
                                                onChange={field.onChange}
                                                error={!!form.formState.errors.clientId}
                                            />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                        </div>

                        {/* Data Emissão */}
                        <FormField
                            control={form.control}
                            name="issueDate"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs font-bold uppercase text-muted-foreground">Data de Emissão</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="date"
                                            className="h-9"
                                            value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''}
                                            onChange={e => field.onChange(new Date(e.target.value))}
                                        />
                                    </FormControl>
                                </FormItem>
                            )}
                        />

                        {/* Pagamento */}
                        <FormField
                            control={form.control}
                            name="paymentMethod"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs font-bold uppercase text-muted-foreground">Método de Pagamento</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger className="h-9">
                                                <SelectValue placeholder="Selecione" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="BOLETO">Boleto Bancário</SelectItem>
                                            <SelectItem value="PIX">PIX</SelectItem>
                                            <SelectItem value="CREDIT_CARD">Cartão de Crédito</SelectItem>
                                            <SelectItem value="TRANSFER">Transferência</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </FormItem>
                            )}
                        />
                    </CardContent>
                </Card>

                {/* Seção 2: Itens da Fatura (Modularizado) */}
                <InvoiceItems form={form} />

                {/* Rodapé de Ações */}
                <div className="flex justify-end gap-4 pt-4 border-t">
                    <Button type="button" variant="ghost">Salvar Rascunho</Button>
                    <Button type="submit" className="bg-green-600 hover:bg-green-700 min-w-[200px]" disabled={isSaving}>
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                        {isSaving ? "Processando..." : "Emitir Fatura"}
                    </Button>
                </div>

            </form>
        </Form>
    );
}
