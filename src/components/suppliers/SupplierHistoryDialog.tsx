import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SupplierHistoryContent } from "./SupplierHistoryContent";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    supplier: any | null;
}

export function SupplierHistoryDialog({ open, onOpenChange, supplier }: Props) {
    if (!supplier) return null;
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="truncate">{supplier.razao_social}</DialogTitle>
                    <DialogDescription>
                        {supplier.nome_fantasia ? `${supplier.nome_fantasia} · ` : ""}
                        {supplier.cpf_cnpj || "Sem CPF/CNPJ cadastrado"}
                    </DialogDescription>
                </DialogHeader>
                <SupplierHistoryContent supplier={supplier} />
            </DialogContent>
        </Dialog>
    );
}
