
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
        <div className="flex flex-col md:flex-row gap-6 items-start border border-[#ccc] rounded-lg p-5 bg-white">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-2 shrink-0 mx-auto md:mx-0">
                <div className="w-20 h-20 bg-[#059669] rounded-full flex items-center justify-center border-4 border-[#e0e0e0] shadow-sm overflow-hidden">
                    <User className="w-8 h-8 text-white" />
                </div>
                <button type="button" className="text-[10px] text-[#059669] font-bold uppercase tracking-wider hover:underline">
                    Alterar Logo
                </button>
            </div>

            {/* Campos Principais */}
            <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-12 gap-4">

                {/* Razão Social */}
                <div className="md:col-span-8 space-y-1">
                    <FormField
                        control={form.control}
                        name="razao_social"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-[#555] text-[10px] font-bold uppercase tracking-wider">
                                    Razão Social / Nome Completo
                                </FormLabel>
                                <FormControl>
                                    <Input
                                        className="h-10 border-[#ccc] focus:border-[#059669] focus:ring-[#059669]/20"
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

                {/* Tipo Pessoa */}
                <div className="md:col-span-4 space-y-1">
                    <FormField
                        control={form.control}
                        name="tipo_pessoa"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-[#555] text-[10px] font-bold uppercase tracking-wider">Tipo de Pessoa</FormLabel>
                                <FormControl>
                                    <div className="flex items-center gap-4 h-10 px-3 bg-white border border-[#ccc] rounded-md">
                                        <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-[#059669]">
                                            <input
                                                type="radio"
                                                value="PF"
                                                checked={field.value === "PF"}
                                                onChange={() => {
                                                    field.onChange("PF");
                                                    form.setValue("cpf_cnpj", "");
                                                }}
                                                className="accent-[#059669] w-4 h-4"
                                            />
                                            Física
                                        </label>
                                        <div className="w-px h-4 bg-[#ccc]" />
                                        <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-[#059669]">
                                            <input
                                                type="radio"
                                                value="PJ"
                                                checked={field.value === "PJ"}
                                                onChange={() => {
                                                    field.onChange("PJ");
                                                    form.setValue("cpf_cnpj", "");
                                                }}
                                                className="accent-[#059669] w-4 h-4"
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

                {/* Nome Fantasia */}
                <div className="md:col-span-8 space-y-1">
                    <FormField
                        control={form.control}
                        name="nome_fantasia"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-[#555] text-[10px] font-bold uppercase tracking-wider">Nome Fantasia (Opcional)</FormLabel>
                                <FormControl>
                                    <Input
                                        className="h-10 border-[#ccc] focus:border-[#059669] focus:ring-[#059669]/20"
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

                {/* CPF/CNPJ */}
                <div className="md:col-span-4 space-y-1">
                    <FormField
                        control={form.control}
                        name="cpf_cnpj"
                        render={({ field }) => {
                            const isPJ = form.watch("tipo_pessoa") === "PJ";
                            return (
                                <FormItem>
                                    <div className="flex justify-between items-center mb-1">
                                        <FormLabel className="text-[#555] text-[10px] font-bold uppercase tracking-wider">
                                            {isPJ ? "CNPJ" : "CPF"}
                                        </FormLabel>
                                        {isPJ && (
                                            <button
                                                type="button"
                                                className="text-[10px] uppercase font-bold text-[#059669] flex items-center gap-1 hover:text-[#0f1f33] hover:bg-[#ECFDF4] px-2 rounded transition-colors"
                                                onClick={onCnpjLookup}
                                                disabled={isCnpjLoading}
                                            >
                                                <Globe className="w-3 h-3" /> {isCnpjLoading ? "Buscando..." : "Consultar"}
                                            </button>
                                        )}
                                    </div>
                                    <FormControl>
                                        <Input
                                            className={`h-10 border-[#ccc] focus:border-[#059669] focus:ring-[#059669]/20 ${isCnpjLoading ? 'opacity-50' : ''}`}
                                            {...field}
                                            placeholder={isPJ ? "00.000.000/0000-00" : "000.000.000-00"}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                field.onChange(isPJ ? maskCNPJ(val) : maskCPF(val));
                                            }}
                                            maxLength={18}
                                        />
                                    </FormControl>
                                    <p className="text-[11px] text-[#555] mt-1">
                                        Opcional — usado para vincular pagamentos automaticamente
                                    </p>
                                    {docInvalido && (
                                        <p className="text-[11px] text-[#E53E3E] mt-1">
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
