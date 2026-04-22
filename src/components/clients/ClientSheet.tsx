import {
    Dialog,
    DialogContent,
} from "@/components/ui/dialog";
import { ClientForm } from "./ClientForm";

interface ClientSheetProps {
    isOpen: boolean;
    onClose: () => void;
    clientToEdit?: any;
}

export function ClientSheet({ isOpen, onClose, clientToEdit }: ClientSheetProps) {
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto p-0">
                {/* Cabeçalho azul marinho */}
                <div className="bg-[#059669] px-6 py-4 rounded-t-lg">
                    <h2 className="text-[15px] font-bold text-white">
                        {clientToEdit ? "Editar Cliente" : "Novo Cliente"}
                    </h2>
                    <p className="text-[11px] text-[#BFDBFE] mt-0.5">
                        {clientToEdit
                            ? "Edite os dados do cliente abaixo."
                            : "Preencha os dados para cadastrar um novo cliente."}
                    </p>
                </div>
                <div className="p-6">
                    <ClientForm onSuccess={onClose} initialData={clientToEdit} />
                </div>
            </DialogContent>
        </Dialog>
    );
}
