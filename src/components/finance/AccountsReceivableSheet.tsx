import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { AccountsReceivableForm } from "./AccountsReceivableForm";
import { AccountsReceivable } from "@/types/finance";

interface AccountsReceivableSheetProps {
    isOpen: boolean;
    onClose: () => void;
    dataToEdit?: AccountsReceivable;
}

export function AccountsReceivableSheet({ isOpen, onClose, dataToEdit }: AccountsReceivableSheetProps) {
    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent className="sm:max-w-[800px] overflow-y-auto">
                <SheetHeader className="mb-6">
                    <SheetTitle>{dataToEdit ? "Editar Conta a Receber" : "Nova Conta a Receber"}</SheetTitle>
                    <SheetDescription>
                        {dataToEdit
                            ? "Edite os dados do recebimento abaixo."
                            : "Preencha os dados para registrar um novo recebimento."}
                    </SheetDescription>
                </SheetHeader>
                <AccountsReceivableForm key={dataToEdit?.id || "new"} onSuccess={onClose} initialData={dataToEdit} />
            </SheetContent>
        </Sheet>
    );
}
