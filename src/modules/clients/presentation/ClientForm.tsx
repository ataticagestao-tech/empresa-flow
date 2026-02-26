
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";

import { useClientForm } from "./hooks/useClientForm";
import { ClientHeader } from "./partials/ClientHeader";
import { TabAddress } from "./partials/TabAddress";
import { TabContact } from "./partials/TabContact";
import { TabTax } from "./partials/TabTax";

// Interfaces para props
interface ClientFormProps {
    onSuccess: () => void;
    initialData?: any;
}

// Mock de CNAEs (Temporário se não estiver vindo de hook)
const cnaeOptions = [
    { code: "1234-5/67", description: "Outros" }
];

/**
 * Formulário Principal de Clientes (Refatorado - Modular Domain-Driven).
 * Atua como Orquestrador de UI, delegando lógica para hooks e subcomponentes.
 */
export function ClientForm({ onSuccess, initialData }: ClientFormProps) {
    // Hook que centraliza toda a lógica de estado e regras de negócio
    const { form, onSubmit, handleCepBlur, handleCnpjLookup, isLoadingAddress, isLoadingCnpj } = useClientForm({ onSuccess, initialData });

    // Estado local apenas para controle visual de abas
    const [activeTab, setActiveTab] = useState("endereco");

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

                {/* 1. Cabeçalho (Dados Principais) */}
                <ClientHeader
                    form={form}
                    isCnpjLoading={isLoadingCnpj}
                    onCnpjLookup={handleCnpjLookup}
                />

                {/* 2. Conteúdo em Abas */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="justify-start border-b rounded-none h-auto p-0 bg-transparent space-x-2">
                        <TabsTrigger value="endereco" className="tab-trigger-style">Endereço</TabsTrigger>
                        <TabsTrigger value="contato" className="tab-trigger-style">Contatos</TabsTrigger>
                        <TabsTrigger value="fiscal" className="tab-trigger-style">Dados Fiscais</TabsTrigger>
                        {/* Outras abas podem ser adicionadas aqui no futuro */}
                    </TabsList>

                    <TabsContent value="endereco">
                        <TabAddress
                            form={form}
                            onCepBlur={handleCepBlur}
                            isLoadingAddress={isLoadingAddress}
                        />
                    </TabsContent>

                    <TabsContent value="contato">
                        <TabContact form={form} />
                    </TabsContent>

                    <TabsContent value="fiscal">
                        <TabTax form={form} cnaeOptions={cnaeOptions} />
                    </TabsContent>
                </Tabs>

                {/* 3. Rodapé com Ações */}
                <div className="flex justify-end gap-4 pt-4 border-t">
                    <Button type="button" variant="outline" onClick={() => onSuccess()}>Cancelar</Button>
                    <Button type="submit" className="bg-green-600 hover:bg-green-700 min-w-[150px]">
                        Salvar Cliente
                    </Button>
                </div>
            </form>
        </Form>
    );
}

// Estilos de utilidade locais (Tailwind class abstraction)
// const tabTriggerStyle = "border-b-2 border-transparent data-[state=active]:border-green-600 data-[state=active]:bg-green-50/10 data-[state=active]:text-green-700 rounded-none px-4 py-2 text-xs font-semibold transition-all";
