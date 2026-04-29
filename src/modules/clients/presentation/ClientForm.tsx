
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";

import { useCompany } from "@/contexts/CompanyContext";
import { hasContratosByCompany } from "@/config/features";
import { useClientForm } from "./hooks/useClientForm";
import { ClientHeader } from "./partials/ClientHeader";
import { TabAddress } from "./partials/TabAddress";
import { TabContact } from "./partials/TabContact";
import { TabTax } from "./partials/TabTax";
import { TabContracts } from "./partials/TabContracts";

interface ClientFormProps {
    onSuccess: () => void;
    initialData?: any;
}

const cnaeOptions: Array<{ codigo: string; descricao: string; origem: "principal" | "secundario" }> = [];

export function ClientForm({ onSuccess, initialData }: ClientFormProps) {
    const { form, onSubmit, handleCepBlur, handleCnpjLookup, isLoadingAddress, isLoadingCnpj } = useClientForm({ onSuccess, initialData });
    const [activeTab, setActiveTab] = useState("endereco");
    const { selectedCompany } = useCompany();
    const showContracts = hasContratosByCompany(selectedCompany) && !!initialData?.id;

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

                <ClientHeader
                    form={form}
                    isCnpjLoading={isLoadingCnpj}
                    onCnpjLookup={handleCnpjLookup}
                />

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="justify-start border-b border-[#e0e0e0] rounded-none h-auto p-0 bg-transparent space-x-1">
                        <TabsTrigger
                            value="endereco"
                            className="border-b-2 border-transparent data-[state=active]:border-[#059669] data-[state=active]:text-[#059669] rounded-none px-4 py-2 text-xs font-semibold text-[#555] transition-all"
                        >
                            Endereço
                        </TabsTrigger>
                        <TabsTrigger
                            value="contato"
                            className="border-b-2 border-transparent data-[state=active]:border-[#059669] data-[state=active]:text-[#059669] rounded-none px-4 py-2 text-xs font-semibold text-[#555] transition-all"
                        >
                            Contatos
                        </TabsTrigger>
                        <TabsTrigger
                            value="fiscal"
                            className="border-b-2 border-transparent data-[state=active]:border-[#059669] data-[state=active]:text-[#059669] rounded-none px-4 py-2 text-xs font-semibold text-[#555] transition-all"
                        >
                            Dados Fiscais
                        </TabsTrigger>
                        {showContracts && (
                            <TabsTrigger
                                value="contratos"
                                className="border-b-2 border-transparent data-[state=active]:border-[#059669] data-[state=active]:text-[#059669] rounded-none px-4 py-2 text-xs font-semibold text-[#555] transition-all"
                            >
                                Contratos
                            </TabsTrigger>
                        )}
                    </TabsList>

                    <TabsContent value="endereco">
                        <TabAddress form={form} onCepBlur={handleCepBlur} isLoadingAddress={isLoadingAddress} />
                    </TabsContent>

                    <TabsContent value="contato">
                        <TabContact form={form} />
                    </TabsContent>

                    <TabsContent value="fiscal">
                        <TabTax form={form} cnaeOptions={cnaeOptions} />
                    </TabsContent>

                    {showContracts && (
                        <TabsContent value="contratos">
                            <TabContracts
                                clientId={initialData?.id}
                                clientName={initialData?.razao_social || initialData?.nome_fantasia}
                                clientCpfCnpj={initialData?.cpf_cnpj}
                            />
                        </TabsContent>
                    )}
                </Tabs>

                <div className="flex justify-end gap-3 pt-4 border-t border-[#e0e0e0]">
                    <Button type="button" variant="outline" onClick={() => onSuccess()} className="border-[#ccc] text-[#555] hover:bg-[#F6F2EB]">
                        Cancelar
                    </Button>
                    <Button type="submit" className="bg-[#059669] hover:bg-[#0f1f33] text-white min-w-[150px]">
                        Salvar Cliente
                    </Button>
                </div>
            </form>
        </Form>
    );
}
