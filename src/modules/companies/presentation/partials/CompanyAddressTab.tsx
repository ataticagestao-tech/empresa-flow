
import { useFormContext } from "react-hook-form";
import { Company } from "../../domain/schemas/company.schema";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { maskCEP, maskPhone } from "@/utils/masks";

export function CompanyAddressTab() {
    const { control } = useFormContext<Company>();

    return (
        <div className="bg-white p-4 rounded-xl border border-[#EAECF0]">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <FormField
                    control={control}
                    name="endereco_cep"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>CEP</FormLabel>
                            <FormControl>
                                <Input
                                    placeholder="00000-000"
                                    {...field}
                                    maxLength={9}
                                    onChange={(e) => {
                                        const masked = maskCEP(e.target.value);
                                        field.onChange(masked);
                                    }}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={control}
                    name="endereco_logradouro"
                    render={({ field }) => (
                        <FormItem className="col-span-3">
                            <FormLabel>Logradouro</FormLabel>
                            <FormControl>
                                <Input {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={control}
                    name="endereco_numero"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Número</FormLabel>
                            <FormControl>
                                <Input {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={control}
                    name="endereco_complemento"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Complemento</FormLabel>
                            <FormControl>
                                <Input {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={control}
                    name="endereco_bairro"
                    render={({ field }) => (
                        <FormItem className="col-span-2">
                            <FormLabel>Bairro</FormLabel>
                            <FormControl>
                                <Input {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={control}
                    name="endereco_cidade"
                    render={({ field }) => (
                        <FormItem className="col-span-3">
                            <FormLabel>Cidade</FormLabel>
                            <FormControl>
                                <Input {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={control}
                    name="endereco_estado"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>UF</FormLabel>
                            <FormControl>
                                <Input maxLength={2} className="uppercase" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>
        </div>
    );
}
