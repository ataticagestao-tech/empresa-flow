
import { UseFormReturn } from "react-hook-form";
import { Landmark } from "lucide-react";

import { FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

import { ClientFormValues } from "../../domain/schemas/client.schema";

interface TabTaxProps {
    form: UseFormReturn<ClientFormValues>;
    cnaeOptions: Array<{ codigo: string; descricao: string; origem: "principal" | "secundario" }>;
}

export function TabTax({ form, cnaeOptions }: TabTaxProps) {
    return (
        <div className="pt-4 space-y-4 animate-in fade-in duration-300">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Inscrições */}
                <FormField
                    control={form.control}
                    name="inscricao_estadual"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel className="text-muted-foreground text-[10px] font-bold uppercase">Inscrição Estadual</FormLabel>
                            <FormControl>
                                <Input className="h-9 border-[#EAECF0]" placeholder="Isento se vazio" {...field} />
                            </FormControl>
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="inscricao_municipal"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel className="text-muted-foreground text-[10px] font-bold uppercase">Inscrição Municipal</FormLabel>
                            <FormControl>
                                <Input className="h-9 border-[#EAECF0]" {...field} />
                            </FormControl>
                        </FormItem>
                    )}
                />

                {/* CNAE com Select Dinâmico (populado pela API) */}
                <div className="md:col-span-2">
                    <FormField
                        control={form.control}
                        name="cnae"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-muted-foreground text-[10px] font-bold uppercase flex items-center gap-2">
                                    <Landmark className="w-3 h-3" /> Atividade Principal (CNAE)
                                </FormLabel>
                                <Select onValueChange={field.onChange} value={field.value || undefined}>
                                    <FormControl>
                                        <SelectTrigger className="h-9 border-[#EAECF0]">
                                            <SelectValue placeholder="Selecione o CNAE..." />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent className="max-h-[200px]">
                                        {cnaeOptions.length === 0 && (
                                            <SelectItem value="empty" disabled>Nenhum CNAE encontrado (Consulte o CNPJ primeiro)</SelectItem>
                                        )}
                                        {cnaeOptions.map((cnae) => (
                                            <SelectItem key={cnae.codigo} value={cnae.codigo}>
                                                <span className="font-mono text-xs text-muted-foreground mr-2">{cnae.codigo}</span>
                                                {cnae.descricao}
                                                {cnae.origem === 'principal' && <span className="ml-2 text-[10px] bg-green-100 text-green-700 px-1 rounded">Principal</span>}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </FormItem>
                        )}
                    />
                </div>

                {/* Checkboxes Fiscais */}
                <div className="md:col-span-2 flex flex-wrap gap-6 pt-2">
                    <FormField
                        control={form.control}
                        name="optante_simples"
                        render={({ field }) => (
                            <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                                <FormControl>
                                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                                </FormControl>
                                <FormLabel className="text-sm font-medium leading-none cursor-pointer">
                                    Optante pelo Simples Nacional
                                </FormLabel>
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="contribuinte"
                        render={({ field }) => (
                            <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                                <FormControl>
                                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                                </FormControl>
                                <FormLabel className="text-sm font-medium leading-none cursor-pointer">
                                    Contribuinte ICMS
                                </FormLabel>
                            </FormItem>
                        )}
                    />
                </div>
            </div>
        </div>
    );
}
