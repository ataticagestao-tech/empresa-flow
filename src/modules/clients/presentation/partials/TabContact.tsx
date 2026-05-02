
import { UseFormReturn } from "react-hook-form";
import { Mail, Phone, User } from "lucide-react";

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

import { ClientFormValues } from "../../domain/schemas/client.schema";
import { maskPhone, autoCorrectUrl } from "@/utils/masks";

interface TabContactProps {
    form: UseFormReturn<ClientFormValues>;
}

export function TabContact({ form }: TabContactProps) {
    return (
        <div className="pt-4 space-y-4 animate-in fade-in duration-300">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Email */}
                <div className="md:col-span-2">
                    <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-muted-foreground text-[10px] font-bold uppercase flex items-center gap-1">
                                    <Mail className="w-3 h-3" /> Email Principal
                                </FormLabel>
                                <FormControl>
                                    <Input className="h-9 border-[#EAECF0]" placeholder="exemplo@empresa.com.br" {...field} value={field.value ?? ""} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                {/* Telefones */}
                <FormField
                    control={form.control}
                    name="telefone"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel className="text-muted-foreground text-[10px] font-bold uppercase flex items-center gap-1">
                                <Phone className="w-3 h-3" /> Telefone Fixo <span className="text-red-500">*</span>
                            </FormLabel>
                            <FormControl>
                                <Input
                                    className="h-9 border-[#EAECF0]"
                                    {...field}
                                    onChange={(e) => field.onChange(maskPhone(e.target.value))}
                                    maxLength={15}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="celular"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel className="text-muted-foreground text-[10px] font-bold uppercase flex items-center gap-1">
                                <Phone className="w-3 h-3" /> Celular / WhatsApp
                            </FormLabel>
                            <FormControl>
                                <Input
                                    className="h-9 border-[#EAECF0]"
                                    {...field}
                                    onChange={(e) => field.onChange(maskPhone(e.target.value))}
                                    maxLength={15}
                                />
                            </FormControl>
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="contato_nome"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel className="text-muted-foreground text-[10px] font-bold uppercase flex items-center gap-1">
                                <User className="w-3 h-3" /> Nome do Contato
                            </FormLabel>
                            <FormControl>
                                <Input className="h-9 border-[#EAECF0]" placeholder="Pessoa de referência" {...field} />
                            </FormControl>
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="website"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel className="text-muted-foreground text-[10px] font-bold uppercase">Website</FormLabel>
                            <FormControl>
                                <Input
                                    className="h-9 border-[#EAECF0]"
                                    placeholder="www.seusite.com.br"
                                    {...field}
                                    onBlur={(e) => { field.onBlur(); field.onChange(autoCorrectUrl(e.target.value)); }}
                                />
                            </FormControl>
                        </FormItem>
                    )}
                />
            </div>

            <div className="bg-blue-50/50 p-4 rounded text-xs text-blue-700">
                <p><strong>Dica:</strong> É possível adicionar múltiplos contatos adicionais na aba "Contatos Adicionais" (se necessário futuramente).</p>
            </div>
        </div>
    );
}
