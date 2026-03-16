
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { AccountsPayable } from "../../domain/schemas/accounts-payable.schema";
import { usePayableForm } from "../hooks/usePayableForm";
import { PayableMainTab } from "../partials/PayableMainTab";
import { Loader2 } from "lucide-react";

interface PayableFormProps {
    onSuccess: () => void;
    initialData?: AccountsPayable;
}

export function PayableForm({ onSuccess, initialData }: PayableFormProps) {
    const { form, save, isSaving, handleFileUpload, isUploading } = usePayableForm(initialData, onSuccess);

    return (
        <Form {...form}>
            <form onSubmit={save} className="space-y-4">
                <PayableMainTab form={form} handleFileUpload={handleFileUpload} isUploading={isUploading} />

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
