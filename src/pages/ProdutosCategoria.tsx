import { AppLayout } from "@/components/layout/AppLayout";
import { PageToolbar } from "@/components/layout/PageToolbar";
import { CategoriaContabilContent } from "@/components/products/CategoriaContabilContent";

export default function ProdutosCategoria() {
    return (
        <AppLayout title="Categoria contábil dos produtos">
            <PageToolbar title="Categoria contábil dos produtos" />
            <CategoriaContabilContent />
        </AppLayout>
    );
}
