
import { FormProvider } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompanyForm } from "./hooks/useCompanyForm";
import { CompanyFiscalTab } from "./partials/CompanyFiscalTab";
import { CompanyAddressTab } from "./partials/CompanyAddressTab";
import { CompanyDocumentsTab } from "./partials/CompanyDocumentsTab";
import { CompanyNfseTab } from "./partials/CompanyNfseTab";
import { Building2, FileText, MapPin, Landmark, ListTree, ShieldCheck } from "lucide-react";
import { ChartOfAccountsManager } from "@/components/companies/ChartOfAccountsManager";
import { useAdmin } from "@/contexts/AdminContext";
import { PLAN_ORDER, PLANS, type PlanoId } from "@/config/entitlements";

interface CompanyFormProps {
    companyId?: string;
    onSuccess?: (company: any) => void;
    onCancel?: () => void;
}

export function CompanyForm({ companyId, onSuccess, onCancel }: CompanyFormProps) {
    const { form, onSubmit, isLoading, isSearchingCnpj, ...files } = useCompanyForm(companyId);
    const { isSuperAdmin } = useAdmin();

    const planoValue = ((form.watch("plano") as string | null | undefined) ?? "__none__");

    const handleSubmit = async (data: any) => {
        const result = await onSubmit(data);
        if (result && onSuccess) {
            onSuccess(result);
        }
    };

    return (
        <FormProvider {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col h-full overflow-hidden bg-white">
                <div className="flex-1 overflow-y-auto p-6 min-h-0 custom-scrollbar">
                    {isSuperAdmin && (
                        <div className="mb-6 rounded-xl border border-[#EAECF0] bg-[#FBFAF7] p-4">
                            <div className="flex items-center gap-2 mb-1">
                                <ShieldCheck className="w-4 h-4 text-green-700" />
                                <span className="text-sm font-semibold text-[#1D2939]">Plano Tática (interno)</span>
                            </div>
                            <p className="text-xs text-muted-foreground mb-3">
                                Define os módulos e limites liberados para esta empresa-cliente. Visível só para a equipe Tática.
                            </p>
                            <Select
                                value={planoValue}
                                onValueChange={(v) =>
                                    form.setValue("plano", v === "__none__" ? null : (v as PlanoId), { shouldDirty: true })
                                }
                            >
                                <SelectTrigger className="bg-white max-w-sm">
                                    <SelectValue placeholder="Selecione o pacote" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">Sem plano (acesso total)</SelectItem>
                                    {PLAN_ORDER.map((id) => (
                                        <SelectItem key={id} value={id}>
                                            {PLANS[id].label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {planoValue !== "__none__" && (
                                <p className="text-xs text-muted-foreground mt-2">
                                    {PLANS[planoValue as PlanoId].resumo}
                                </p>
                            )}
                        </div>
                    )}
                    <Tabs defaultValue="fiscal" className="w-full">
                        <TabsList className="w-full justify-start overflow-x-auto h-12 bg-[#F6F2EB] p-1 mb-6 rounded-xl shrink-0">
                            <TabsTrigger value="fiscal" className="data-[state=active]:bg-white data-[state=active]:text-green-700 data-[state=active]:shadow-sm rounded-lg px-4 py-2 gap-2 whitespace-nowrap">
                                <Building2 className="w-4 h-4" /> Dados Fiscais
                            </TabsTrigger>
                            <TabsTrigger value="address" className="data-[state=active]:bg-white data-[state=active]:text-green-700 data-[state=active]:shadow-sm rounded-lg px-4 py-2 gap-2 whitespace-nowrap">
                                <MapPin className="w-4 h-4" /> Endereço
                            </TabsTrigger>
                            <TabsTrigger value="documents" className="data-[state=active]:bg-white data-[state=active]:text-green-700 data-[state=active]:shadow-sm rounded-lg px-4 py-2 gap-2 whitespace-nowrap">
                                <FileText className="w-4 h-4" /> Documentos
                            </TabsTrigger>
                            <TabsTrigger value="nfse" className="data-[state=active]:bg-white data-[state=active]:text-green-700 data-[state=active]:shadow-sm rounded-lg px-4 py-2 gap-2 whitespace-nowrap">
                                <Landmark className="w-4 h-4" /> NFS-e / Prefeitura
                            </TabsTrigger>
                            <TabsTrigger value="plano_contas" className="data-[state=active]:bg-white data-[state=active]:text-green-700 data-[state=active]:shadow-sm rounded-lg px-4 py-2 gap-2 whitespace-nowrap">
                                <ListTree className="w-4 h-4" /> Plano de Contas
                            </TabsTrigger>
                        </TabsList>

                        <div className="mt-2 space-y-4 pb-4">
                            <TabsContent value="fiscal" className="mt-0">
                                <CompanyFiscalTab
                                    onCnpjFileSelect={files.processCnpjFile}
                                    onCnpjSearch={files.fetchCnpjData}
                                    isSearching={isSearchingCnpj}
                                />
                            </TabsContent>
                            <TabsContent value="address">
                                <CompanyAddressTab />
                            </TabsContent>
                            <TabsContent value="documents">
                                <CompanyDocumentsTab
                                    {...files}
                                    isLoading={isLoading}
                                />
                            </TabsContent>
                            <TabsContent value="nfse">
                                <CompanyNfseTab />
                            </TabsContent>
                            <TabsContent value="plano_contas">
                                <div className="rounded-xl border border-[#EAECF0] bg-white p-6">
                                    {companyId ? (
                                        <ChartOfAccountsManager companyId={companyId} />
                                    ) : (
                                        <div className="text-center text-muted-foreground py-8">
                                            Salve a empresa primeiro para gerenciar o plano de contas.
                                        </div>
                                    )}
                                </div>
                            </TabsContent>
                        </div>
                    </Tabs>
                </div>

                {/* Footer Fixo */}
                <div className="border-t border-[#F6F2EB] p-4 flex items-center justify-end gap-3 bg-[#F6F2EB]/50 shrink-0">
                    {onCancel && (
                        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
                            Cancelar
                        </Button>
                    )}
                    <Button
                        type="submit"
                        disabled={isLoading}
                        className="bg-green-600 hover:bg-green-700 text-white font-semibold min-w-[140px]"
                    >
                        {isLoading ? (
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Salvando...
                            </div>
                        ) : (
                            companyId ? "Salvar Alterações" : "Cadastrar Empresa"
                        )}
                    </Button>
                </div>
            </form>
        </FormProvider>
    );
}
