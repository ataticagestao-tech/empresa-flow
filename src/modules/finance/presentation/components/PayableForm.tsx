
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccountsPayable } from "../../domain/schemas/accounts-payable.schema";
import { usePayableForm } from "../hooks/usePayableForm";
import { PayableMainTab } from "../partials/PayableMainTab";
import { PayableRecurrenceTab } from "../partials/PayableRecurrenceTab";
import { useState } from "react";
import { Loader2 } from "lucide-react";

interface PayableFormProps {
    onSuccess: () => void;
    initialData?: AccountsPayable;
}

export function PayableForm({ onSuccess, initialData }: PayableFormProps) {
    const { form, save, isSaving, handleFileUpload, isUploading } = usePayableForm(initialData, onSuccess);
    const [activeTab, setActiveTab] = useState("principal");

    return (
        <Form {...form}>
            <form onSubmit={save} className="space-y-4">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent space-x-2">
                        <TabsTrigger value="principal" className="border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-primary/5 rounded-none px-4 py-2">
                            Principal
                        </TabsTrigger>
                        <TabsTrigger value="recorrencia" className="border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-primary/5 rounded-none px-4 py-2">
                            Recorrência
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="principal">
                        <PayableMainTab form={form} handleFileUpload={handleFileUpload} isUploading={isUploading} />
                    </TabsContent>

                    <TabsContent value="recorrencia">
                        <PayableRecurrenceTab form={form} />
                    </TabsContent>
                </Tabs>

                <div className="flex justify-end gap-2 pt-4 border-t sticky bottom-0 bg-white p-4">
                    <Button type="button" variant="outline" onClick={() => onSuccess()}>
                        Cancelar
                    </Button>
                    <Button type="submit" className="bg-primary hover:bg-primary/90 text-white" disabled={isSaving}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Salvar
                    </Button>
                </div>
            </form>
        </Form>
    );
}
