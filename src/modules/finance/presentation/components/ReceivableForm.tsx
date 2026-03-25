
import { AccountsReceivable } from "../../domain/schemas/accounts-receivable.schema";
import { useReceivableForm } from "../hooks/useReceivableForm";
import { ReceivableMainTab } from "../partials/ReceivableMainTab";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DialogFooter } from "@/components/ui/dialog";

interface ReceivableFormProps {
    onSuccess?: () => void;
    initialData?: Partial<AccountsReceivable>;
    onCancel?: () => void;
}

export function ReceivableForm({ onSuccess, initialData, onCancel }: ReceivableFormProps) {
    const { form, save, dependencies, isLoading, isSubmitting } = useReceivableForm(initialData, onSuccess);

    if (isLoading) {
        return <div className="p-8 text-center">Carregando formulário...</div>;
    }

    return (
        <Form {...form}>
            <form onSubmit={save} className="space-y-4">
                <Tabs defaultValue="main" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 bg-[#F1F5F9]/50">
                        <TabsTrigger value="main">Principal</TabsTrigger>
                        <TabsTrigger value="details">Detalhes (Em Breve)</TabsTrigger>
                    </TabsList>

                    <TabsContent value="main">
                        <ReceivableMainTab
                            form={form}
                            categories={dependencies?.categories || []}
                            bankAccounts={dependencies?.bankAccounts || []}
                        />
                    </TabsContent>

                    <TabsContent value="details">
                        <div className="p-4 text-center text-muted-foreground text-sm">
                            Abas de Detalhes, Classificação e Impostos serão implementadas na próxima iteração.
                        </div>
                    </TabsContent>
                </Tabs>

                <DialogFooter className="gap-2 pt-6 border-t mt-6">
                    <Button type="button" variant="ghost" onClick={onCancel}>
                        Cancelar
                    </Button>
                    <Button type="submit" disabled={isSubmitting} className="w-32">
                        {isSubmitting ? "Salvando..." : "Salvar"}
                    </Button>
                </DialogFooter>
            </form>
        </Form>
    );
}
