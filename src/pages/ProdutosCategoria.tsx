import { AppLayout } from "@/components/layout/AppLayout";
import { PagePanel } from "@/components/layout/PagePanel";
import { CategoriaContabilContent } from "@/components/products/CategoriaContabilContent";

export default function ProdutosCategoria() {
    return (
        <AppLayout title="Categoria contábil dos produtos">
            <PagePanel title="Categoria contábil dos produtos" subtitle="Vincule cada produto à conta de receita correta">
                <CategoriaContabilContent />
            </PagePanel>
        </AppLayout>
    );
}
