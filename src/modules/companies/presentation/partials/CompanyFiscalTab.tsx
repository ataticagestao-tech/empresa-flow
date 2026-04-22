
import { useFormContext } from "react-hook-form";
import { Company } from "../../domain/schemas/company.schema";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { UploadCloud, Search } from "lucide-react";
import { maskCNPJ } from "@/utils/masks";

interface CompanyFiscalTabProps {
    onCnpjFileSelect?: (file: File) => void;
    onCnpjSearch?: (cnpj: string) => void;
    isSearching?: boolean;
}

export function CompanyFiscalTab({ onCnpjFileSelect, onCnpjSearch, isSearching }: CompanyFiscalTabProps) {
    const { control, getValues } = useFormContext<Company>();

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-4 rounded-xl border border-[#EAECF0]">
            {onCnpjFileSelect && (
                <div className="col-span-2 mb-4 p-4 border border-dashed border-green-300 bg-green-50 rounded-lg flex items-center justify-between">
                    <div>
                        <h4 className="font-semibold text-green-800">Preenchimento Automático</h4>
                        <p className="text-xs text-green-600">Importe o Cartão CNPJ para preencher os dados automaticamente.</p>
                    </div>
                    <div className="relative">
                        <Input
                            type="file"
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            accept=".pdf,image/*"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) onCnpjFileSelect(file);
                            }}
                        />
                        <Button type="button" variant="outline" className="border-green-600 text-green-700 hover:bg-green-100">
                            <UploadCloud className="w-4 h-4 mr-2" />
                            Importar Cartão
                        </Button>
                    </div>
                </div>
            )}

            <FormField
                control={control}
                name="razao_social"
                render={({ field }) => (
                    <FormItem className="col-span-2">
                        <FormLabel>Razão Social *</FormLabel>
                        <FormControl>
                            <Input placeholder="Nome oficial da empresa" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />

            <FormField
                control={control}
                name="nome_fantasia"
                render={({ field }) => (
                    <FormItem className="col-span-2">
                        <FormLabel>Nome Fantasia</FormLabel>
                        <FormControl>
                            <Input placeholder="Nome comercial" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />

            <FormField
                control={control}
                name="cnpj"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>CNPJ *</FormLabel>
                        <div className="flex gap-2">
                            <FormControl>
                                <Input
                                    placeholder="00.000.000/0000-00"
                                    {...field}
                                    maxLength={18}
                                    onChange={(e) => {
                                        const masked = maskCNPJ(e.target.value);
                                        field.onChange(masked);
                                    }}
                                />
                            </FormControl>
                            <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                className="shrink-0 border-green-200 text-green-600 hover:bg-green-50"
                                onClick={() => onCnpjSearch?.(getValues("cnpj"))}
                                disabled={isSearching}
                                title="Buscar dados do CNPJ"
                            >
                                {isSearching ? (
                                    <div className="w-4 h-4 border-2 border-green-600/30 border-t-green-600 rounded-full animate-spin" />
                                ) : (
                                    <Search className="w-4 h-4" />
                                )}
                            </Button>
                        </div>
                        <FormMessage />
                    </FormItem>
                )}
            />

            {/* Campos de CNAE - Adicionados para exibir o que foi extraído */}
            <div className="col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                    control={control}
                    name="cnae_principal_desc"
                    render={({ field }) => (
                        <FormItem className="col-span-2">
                            <FormLabel>CNAE Principal</FormLabel>
                            <FormControl>
                                <Input placeholder="Código e Descrição" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={control}
                    name="cnae_secundario_desc"
                    render={({ field }) => (
                        <FormItem className="col-span-2">
                            <FormLabel>CNAEs Secundários</FormLabel>
                            <FormControl>
                                <Input placeholder="Códigos e Descrições" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>

            {/* Novos Campos Extraídos */}
            <div className="col-span-2 grid grid-cols-1 md:grid-cols-4 gap-4">
                <FormField
                    control={control}
                    name="porte"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Porte</FormLabel>
                            <FormControl>
                                <Input placeholder="ME, EPP..." {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={control}
                    name="data_abertura"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Data Abertura</FormLabel>
                            <FormControl>
                                <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={control}
                    name="situacao_cadastral"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Situação</FormLabel>
                            <FormControl>
                                <Input placeholder="ATIVA..." {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={control}
                    name="data_situacao_cadastral"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Data Situação</FormLabel>
                            <FormControl>
                                <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>

            <FormField
                control={control}
                name="natureza_juridica"
                render={({ field }) => (
                    <FormItem className="col-span-2">
                        <FormLabel>Natureza Jurídica</FormLabel>
                        <FormControl>
                            <Input placeholder="Código e Descrição" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />

            <FormField
                control={control}
                name="inscricao_estadual"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Inscrição Estadual</FormLabel>
                        <FormControl>
                            <Input {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />

            <FormField
                control={control}
                name="inscricao_municipal"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Inscrição Municipal</FormLabel>
                        <FormControl>
                            <Input {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />

            <FormField
                control={control}
                name="regime_tributario"
                render={({ field }) => (
                    <FormItem className="col-span-2">
                        <FormLabel>Regime Tributário</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione..." />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                <SelectItem value="simples">Simples Nacional</SelectItem>
                                <SelectItem value="presumido">Lucro Presumido</SelectItem>
                                <SelectItem value="real">Lucro Real</SelectItem>
                                <SelectItem value="mei">MEI</SelectItem>
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )}
            />
            {/* Responsáveis */}
            <div className="col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-[#EAECF0] mt-2">
                <FormField
                    control={control}
                    name="responsavel_legal"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Responsável Legal</FormLabel>
                            <FormControl>
                                <Input placeholder="Nome do responsável legal" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={control}
                    name="contador_responsavel"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Contador Responsável</FormLabel>
                            <FormControl>
                                <Input placeholder="Nome do contador" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>
        </div>
    );
}
