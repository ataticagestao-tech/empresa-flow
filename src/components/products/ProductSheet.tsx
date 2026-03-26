import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { ProductForm } from "./ProductForm";
import { Product } from "@/types/product";

interface ProductSheetProps {
    isOpen: boolean;
    onClose: () => void;
    product?: Product | null;
}

export function ProductSheet({ isOpen, onClose, product }: ProductSheetProps) {
    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent className="sm:max-w-[600px] overflow-y-auto p-0">
                <SheetHeader className="bg-[#1a2e4a] px-5 py-3.5">
                    <SheetTitle className="text-white text-[13px] font-bold uppercase tracking-widest">
                        {product ? "Editar Produto" : "Novo Produto"}
                    </SheetTitle>
                </SheetHeader>
                <div className="mt-2">
                    <ProductForm
                        product={product || undefined}
                        onSuccess={onClose}
                        onCancel={onClose}
                    />
                </div>
            </SheetContent>
        </Sheet>
    );
}
