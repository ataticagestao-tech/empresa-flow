
import { useFormContext } from "react-hook-form";
import { Company } from "../../domain/schemas/company.schema";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function CompanyNfseTab() {
    const { control, watch } = useFormContext<Company>();
    const enableNfse = watch("enable_nfse");

    return (
        <div className="space-y-6">
            <FormField
                control={control}
                name="enable_nfse"
                render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4 bg-white">
                        <div className="space-y-0.5">
                            <FormLabel className="text-base font-bold">Habilitar Emissão de NFS-e</FormLabel>
                            <div className="text-sm text-muted-foreground">
                                Ativa a integração com a prefeitura para emissão de notas de serviço.
                            </div>
                        </div>
                        <FormControl>
                            <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                            />
                        </FormControl>
                    </FormItem>
                )}
            />

            {enableNfse && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Configurações do Prestador</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                            control={control}
                            name="nfse_settings.provider"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Provedor / Sistema</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Ex: Ginfes, IssNet..." {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={control}
                            name="nfse_settings.environment"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Ambiente</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Selecione" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="homologacao">Homologação (Teste)</SelectItem>
                                            <SelectItem value="producao">Produção</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={control}
                            name="nfse_settings.login"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Usuário / Login</FormLabel>
                                    <FormControl>
                                        <Input {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={control}
                            name="nfse_settings.password"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Senha</FormLabel>
                                    <FormControl>
                                        <Input type="password" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* Endereço específico da NFSe (se diferente) */}
                        <div className="col-span-2 grid grid-cols-2 gap-4">
                            <FormField
                                control={control}
                                name="nfse_settings.city_code"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Código IBGE Município</FormLabel>
                                        <FormControl>
                                            <Input {...field} placeholder="Ex: 3550308" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={control}
                                name="nfse_settings.uf"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>UF</FormLabel>
                                        <FormControl>
                                            <Input {...field} maxLength={2} className="uppercase" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
