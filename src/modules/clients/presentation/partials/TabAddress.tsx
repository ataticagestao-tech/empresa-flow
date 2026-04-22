
import { UseFormReturn } from "react-hook-form";

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { ClientFormValues } from "../../domain/schemas/client.schema";
import { maskCEP } from "@/utils/masks";

interface TabAddressProps {
    form: UseFormReturn<ClientFormValues>;
    onCepBlur: () => void;
    isLoadingAddress: boolean;
}

export function TabAddress({ form, onCepBlur, isLoadingAddress }: TabAddressProps) {
    return (
        <div className="pt-4 space-y-4 animate-in fade-in duration-300">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

                {/* Logradouro (Busca automática) */}
                <div className="md:col-span-3">
                    <FormField
                        control={form.control}
                        name="endereco_logradouro"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-muted-foreground text-[10px] font-bold uppercase">Endereço</FormLabel>
                                <FormControl>
                                    <Input className="h-9 border-[#EAECF0]" {...field} value={field.value ?? ""} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                {/* Número */}
                <FormField
                    control={form.control}
                    name="endereco_numero"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel className="text-muted-foreground text-[10px] font-bold uppercase">Número</FormLabel>
                            <FormControl>
                                <Input className="h-9 border-[#EAECF0]" {...field} value={field.value ?? ""} />
                            </FormControl>
                        </FormItem>
                    )}
                />

                {/* Bairro */}
                <div className="md:col-span-2">
                    <FormField
                        control={form.control}
                        name="endereco_bairro"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-muted-foreground text-[10px] font-bold uppercase">Bairro</FormLabel>
                                <FormControl>
                                    <Input className="h-9 border-[#EAECF0]" {...field} value={field.value ?? ""} />
                                </FormControl>
                            </FormItem>
                        )}
                    />
                </div>

                {/* Estado/UF */}
                <FormField
                    control={form.control}
                    name="endereco_estado"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel className="text-muted-foreground text-[10px] font-bold uppercase">Estado</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value ?? ""}>
                                <FormControl>
                                    <SelectTrigger className="h-9 border-[#EAECF0]">
                                        <SelectValue placeholder="UF" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {['SP', 'RJ', 'MG', 'PR', 'SC', 'RS', 'BA', 'PE', 'CE', 'DF', 'GO'].map(uf => (
                                        <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </FormItem>
                    )}
                />

                {/* Cidade */}
                <div className="md:col-span-2">
                    <FormField
                        control={form.control}
                        name="endereco_cidade"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-muted-foreground text-[10px] font-bold uppercase">Cidade</FormLabel>
                                <FormControl>
                                    <Input className="h-9 border-[#EAECF0]" {...field} value={field.value ?? ""} />
                                </FormControl>
                            </FormItem>
                        )}
                    />
                </div>

                {/* CEP (Dispara busca no Blur) */}
                <FormField
                    control={form.control}
                    name="cep"
                    render={({ field }) => (
                        <FormItem>
                            <div className="flex justify-between">
                                <FormLabel className="text-muted-foreground text-[10px] font-bold uppercase">CEP</FormLabel>
                                {isLoadingAddress && <span className="text-[10px] text-blue-500 animate-pulse">Buscando...</span>}
                            </div>
                            <FormControl>
                                <Input
                                    className="h-9 border-[#EAECF0] bg-blue-50/30"
                                    {...field}
                                    value={field.value ?? ""}
                                    onChange={(e) => field.onChange(maskCEP(e.target.value))}
                                    onBlur={() => {
                                        field.onBlur();
                                        onCepBlur();
                                    }}
                                    maxLength={9}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>
        </div>
    );
}
