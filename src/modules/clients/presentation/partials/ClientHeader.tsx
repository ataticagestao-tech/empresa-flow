
import { UseFormReturn } from "react-hook-form";
import { User, Globe } from "lucide-react";

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

import { ClientFormValues } from "../../domain/schemas/client.schema";
import { maskCNPJ, maskCPF } from "@/utils/masks";
import { toTitleCase } from "@/lib/format";
import { validarDocumento } from "@/lib/validators";

interface ClientHeaderProps {
    form: UseFormReturn<ClientFormValues>;
    isCnpjLoading: boolean;
    onCnpjLookup: () => void;
}

export function ClientHeader({ form, isCnpjLoading, onCnpjLookup }: ClientHeaderProps) {
    const cpfCnpjValue = form.watch("cpf_cnpj");
    const docInvalido = cpfCnpjValue && cpfCnpjValue.replace(/\D/g, '').length > 0 && !validarDocumento(cpfCnpjValue);

    return (
        <div className="flex flex-col md:flex-row gap-6 items-start bg-[#F8FAFC]/50 p-6 rounded-lg border border-[#F1F5F9] mb-6 transition-all hover:bg-[#F8FAFC]">
            {/* Área do Logo */}
            <div className="flex flex-col items-center gap-3 shrink-0 mx-auto md:mx-0">
                <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center border-4 border-[#F1F5F9] shadow-sm overflow-hidden group hover:border-green-100 transition-colors cursor-pointer">
                    <User className="w-10 h-10 text-muted-foreground group-hover:text-green-500 transition-colors" />
                </div>
                <button type="button" className="text-xs text-blue-600 font-semibold hover:underline">
                    Alterar Logo
                </button>
            </div>

            {/* Campos Principais */}
            <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-12 gap-4">

                {/* Linha 1: Razão Social e Tipo Pessoa */}
                <div className="md:col-span-8 space-y-1">
                    <FormField
                        control={form.control}
                        name="razao_social"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-muted-foreground text-xs font-bold uppercase">Razão Social / Nome Completo</FormLabel>
                                <FormControl>
                                    <Input
                                        className="h-10 border-[#E2E8F0] focus:border-green-500 focus:ring-green-500/20"
                                        placeholder="Digite o nome principal"
                                        {...field}
                                        onBlur={(e) => {
                                            field.onBlur();
                                            const formatado = toTitleCase(e.target.value);
                                            form.setValue('razao_social', formatado, { shouldValidate: false });
                                        }}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="md:col-span-4 space-y-1">
                    <FormField
                        control={form.control}
                        name="tipo_pessoa"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-muted-foreground text-xs font-bold uppercase">Tipo de Pessoa</FormLabel>
                                <FormControl>
                                    <div className="flex items-center gap-4 h-10 px-3 bg-white border border-[#E2E8F0] rounded-md">
                                        <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-green-700">
                                            <input
                                                type="radio"
                                                value="PF"
                                                checked={field.value === "PF"}
                                                onChange={() => {
                                                    field.onChange("PF");
                                                    form.setValue("cpf_cnpj", "");
                                                }}
                                                className="accent-green-600 w-4 h-4"
                                            />
                                            Física
                                        </label>
                                        <div className="w-px h-4 bg-[#E2E8F0]" />
                                        <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-green-700">
                                            <input
                                                type="radio"
                                                value="PJ"
                                                checked={field.value === "PJ"}
                                                onChange={() => {
                                                    field.onChange("PJ");
                                                    form.setValue("cpf_cnpj", "");
                                                }}
                                                className="accent-green-600 w-4 h-4"
                                            />
                                            Jurídica
                                        </label>
                                    </div>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                {/* Linha 2: Nome Fantasia e Documento */}
                <div className="md:col-span-8 space-y-1">
                    <FormField
                        control={form.control}
                        name="nome_fantasia"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-muted-foreground text-xs font-bold uppercase">Nome Fantasia (Opcional)</FormLabel>
                                <FormControl>
                                    <Input
                                        className="h-10 border-[#E2E8F0] focus:border-green-500 focus:ring-green-500/20"
                                        placeholder="Nome comercial"
                                        {...field}
                                        onBlur={(e) => {
                                            field.onBlur();
                                            if (e.target.value) {
                                                form.setValue('nome_fantasia', toTitleCase(e.target.value), { shouldValidate: false });
                                            }
                                        }}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="md:col-span-4 space-y-1">
                    <FormField
                        control={form.control}
                        name="cpf_cnpj"
                        render={({ field }) => {
                            const isPJ = form.watch("tipo_pessoa") === "PJ";
                            return (
                                <FormItem>
                                    <div className="flex justify-between items-center mb-1">
                                        <FormLabel className="text-muted-foreground text-xs font-bold uppercase">
                                            {isPJ ? "CNPJ" : "CPF"}
                                        </FormLabel>
                                        {isPJ && (
                                            <button
                                                type="button"
                                                className="text-[10px] uppercase font-bold text-green-600 flex items-center gap-1 hover:text-green-700 hover:bg-green-50 px-2 rounded transition-colors"
                                                onClick={onCnpjLookup}
                                                disabled={isCnpjLoading}
                                            >
                                                <Globe className="w-3 h-3" /> {isCnpjLoading ? "Buscando..." : "Consultar"}
                                            </button>
                                        )}
                                    </div>
                                    <FormControl>
                                        <Input
                                            className={`h-10 border-[#E2E8F0] focus:border-green-500 focus:ring-green-500/20 ${isCnpjLoading ? 'opacity-50' : ''}`}
                                            {...field}
                                            placeholder={isPJ ? "00.000.000/0000-00" : "000.000.000-00"}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                field.onChange(isPJ ? maskCNPJ(val) : maskCPF(val));
                                            }}
                                            maxLength={18}
                                        />
                                    </FormControl>
                                    <p className="text-[11px] text-muted-foreground mt-1">
                                        Opcional — usado para vincular pagamentos automaticamente
                                    </p>
                                    {docInvalido && (
                                        <p className="text-[11px] text-[#8b0000] mt-1">
                                            CPF ou CNPJ inválido — verifique os dígitos
                                        </p>
                                    )}
                                    <FormMessage />
                                </FormItem>
                            );
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
