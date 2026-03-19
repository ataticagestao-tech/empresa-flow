import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { AccountsPayableForm } from "./AccountsPayableForm";
import { AccountsPayable } from "@/types/finance";

interface AccountsPayableSheetProps {
    isOpen: boolean;
    onClose: () => void;
    dataToEdit?: AccountsPayable;
}

export function AccountsPayableSheet({ isOpen, onClose, dataToEdit }: AccountsPayableSheetProps) {
    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent className="sm:max-w-[800px] overflow-y-auto">
                <SheetHeader className="mb-6">
                    <SheetTitle>{dataToEdit ? "Editar Conta a Pagar" : "Nova Conta a Pagar"}</SheetTitle>
                    <SheetDescription>
                        {dataToEdit
                            ? "Edite os dados da conta abaixo."
                            : "Preencha os dados para registrar uma nova conta a pagar."}
                    </SheetDescription>
                </SheetHeader>
                <AccountsPayableForm key={dataToEdit?.id || "new"} onSuccess={onClose} initialData={dataToEdit} />
            </SheetContent>
        </Sheet>
    );
}
