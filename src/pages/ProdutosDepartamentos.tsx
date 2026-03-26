import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Search, Pencil, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ProductSheet } from "@/components/products/ProductSheet";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { Product } from "@/types/product";
import { formatBRL } from "@/lib/format";

export default function ProdutosDepartamentos() {
    const { selectedCompany } = useCompany();
    const { activeClient, isUsingSecondary } = useAuth();
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState("");
    const [activeTab, setActiveTab] = useState<"products" | "departments">("products");

    // Product Sheet & Edit State
    const [isProductSheetOpen, setIsProductSheetOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);

    // Delete Mutation
    const deleteProductMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await activeClient.from("products").delete().eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["products"] });
            toast.success("Produto excluído!");
        },
        onError: () => toast.error("Erro ao excluir produto."),
    });

    const handleEdit = (product: Product) => {
        setEditingProduct(product);
        setIsProductSheetOpen(true);
    };

    const handleCreate = () => {
        setEditingProduct(null);
        setIsProductSheetOpen(true);
    };

    const normalizeSearch = (value: unknown) =>
        String(value ?? "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim();

    // Fetch Products
    const { data: products, isLoading: productsLoading } = useQuery({
        queryKey: ["products", selectedCompany?.id, isUsingSecondary],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data, error } = await activeClient
                .from("products")
                .select("*")
                .eq("company_id", selectedCompany.id)
                .order("code");
            if (error) throw error;
            return data;
        },
        enabled: !!selectedCompany?.id && activeTab === "products",
    });

    // Fetch Departments
    const { data: departments, isLoading: departmentsLoading } = useQuery({
        queryKey: ["departments", selectedCompany?.id, isUsingSecondary],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data, error } = await activeClient
                .from("departments")
                .select("*")
                .eq("company_id", selectedCompany.id)
                .order("name");
            if (error) throw error;
            return data;
        },
        enabled: !!selectedCompany?.id && activeTab === "departments",
    });

    // Count products per department
    const productCountByFamily = (familyName: string) =>
        products?.filter((p) => p.family === familyName).length || 0;

    const filteredProducts = products?.filter((p) => {
        const needle = normalizeSearch(searchTerm);
        if (!needle) return true;
        const statusLabel = p.is_active ? "Ativo" : "Inativo";
        const tipoLabel = p.activity === "servico" ? "Serviço" : "Produto";
        return normalizeSearch(
            [p.code, p.description, p.family, p.ncm, p.cest, statusLabel, tipoLabel, formatBRL(p.price)]
                .filter(Boolean)
                .join(" "),
        ).includes(needle);
    });

    const filteredDepartments = departments?.filter((d) => {
        const needle = normalizeSearch(searchTerm);
        if (!needle) return true;
        return normalizeSearch([d.name].filter(Boolean).join(" ")).includes(needle);
    });

    /* ── Badge helpers ── */
    const badgeBase = "text-[10px] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap";

    const StatusBadge = ({ active }: { active: boolean }) =>
        active ? (
            <span className={`${badgeBase} text-[#0a5c2e] border-[#0a5c2e] bg-[#e6f4ec]`}>Ativo</span>
        ) : (
            <span className={`${badgeBase} text-[#555] border-[#aaa] bg-[#f5f5f5]`}>Inativo</span>
        );

    const TipoBadge = ({ tipo }: { tipo: string | null }) =>
        tipo === "servico" ? (
            <span className={`${badgeBase} text-[#1a2e4a] border-[#1a2e4a] bg-[#f0f4f8]`}>Serviço</span>
        ) : (
            <span className={`${badgeBase} text-[#555] border-[#ccc] bg-[#f5f5f5]`}>Produto</span>
        );

    /* ── Thead style ── */
    const thClass = "text-[10px] font-bold uppercase tracking-[0.06em] text-[#555]";

    return (
        <AppLayout title="Operacional">
            <div className="space-y-4 animate-fade-in">
                {/* Cabeçalho */}
                <div className="mb-4">
                    <h1 className="text-xl font-bold text-[#0a0a0a]">Operacional</h1>
                    <p className="text-[12px] text-[#555] mt-1">
                        Catálogo de produtos e serviços da empresa
                    </p>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-b-[#0a0a0a] mb-4">
                    <button
                        onClick={() => setActiveTab("products")}
                        className={`px-5 py-2 text-[12px] font-bold -mb-[1.5px] transition-colors ${
                            activeTab === "products"
                                ? "text-[#1a2e4a] border-b-2 border-[#1a2e4a]"
                                : "text-[#555] font-semibold"
                        }`}
                    >
                        Produtos
                    </button>
                    <button
                        onClick={() => setActiveTab("departments")}
                        className={`px-5 py-2 text-[12px] font-bold -mb-[1.5px] transition-colors ${
                            activeTab === "departments"
                                ? "text-[#1a2e4a] border-b-2 border-[#1a2e4a]"
                                : "text-[#555] font-semibold"
                        }`}
                    >
                        Departamentos
                    </button>
                </div>

                {/* ════════════ ABA PRODUTOS ════════════ */}
                {activeTab === "products" && (
                    <div className="border border-[#ccc] rounded-lg overflow-hidden">
                        {/* Header do card */}
                        <div className="bg-[#1a2e4a] px-4 py-2.5 flex items-center justify-between">
                            <h3 className="text-[11px] font-bold text-white uppercase tracking-widest">
                                Catálogo de Produtos e Serviços
                            </h3>
                            <button
                                onClick={handleCreate}
                                className="text-[11px] font-bold bg-white text-[#1a2e4a] px-3 py-1.5 rounded hover:bg-gray-100 transition-colors"
                            >
                                + Novo produto
                            </button>
                        </div>

                        {/* Toolbar busca */}
                        <div className="px-4 py-3 border-b border-[#eee] bg-white">
                            <div className="relative w-full md:w-72">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[#999]" />
                                <input
                                    placeholder="Pesquisar produtos..."
                                    className="w-full pl-9 pr-3 py-2 text-[12px] border border-[#ccc] rounded focus:outline-none focus:border-[#1a2e4a]"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Tabela */}
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-b-[1.5px] border-[#0a0a0a]">
                                        <TableHead className={thClass}>Código</TableHead>
                                        <TableHead className={thClass}>Nome</TableHead>
                                        <TableHead className={thClass}>Família</TableHead>
                                        <TableHead className={thClass}>Tipo</TableHead>
                                        <TableHead className={thClass}>Custo</TableHead>
                                        <TableHead className={thClass}>Preço</TableHead>
                                        <TableHead className={thClass}>Líquido</TableHead>
                                        <TableHead className={thClass}>NCM/CEST</TableHead>
                                        <TableHead className={thClass}>Status</TableHead>
                                        <TableHead className={`${thClass} text-right`}>Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {productsLoading ? (
                                        <TableRow>
                                            <TableCell colSpan={10} className="text-center py-8 text-[12px] text-[#555]">
                                                Carregando...
                                            </TableCell>
                                        </TableRow>
                                    ) : filteredProducts?.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={10} className="text-center py-8 text-[12px] text-[#555]">
                                                Nenhum produto encontrado.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredProducts?.map((p) => {
                                            const preco = Number(p.price || 0);
                                            const custo = Number(p.cost_price || 0);
                                            const liquido = preco - custo;
                                            return (
                                                <TableRow key={p.id} className="border-b border-[#eee] hover:bg-[#fafafa]">
                                                    <TableCell className="font-mono text-[11px] font-bold text-[#1a2e4a]">
                                                        {p.code || "-"}
                                                    </TableCell>
                                                    <TableCell className="text-[12px] font-semibold text-[#0a0a0a]">
                                                        {p.description}
                                                    </TableCell>
                                                    <TableCell className="text-[12px] text-[#555]">
                                                        {p.family || "-"}
                                                    </TableCell>
                                                    <TableCell>
                                                        <TipoBadge tipo={p.activity} />
                                                    </TableCell>
                                                    <TableCell className="text-[12px] text-[#555]">
                                                        {formatBRL(custo)}
                                                    </TableCell>
                                                    <TableCell className="text-[12px] font-bold text-[#0a0a0a]">
                                                        {formatBRL(preco)}
                                                    </TableCell>
                                                    <TableCell className="text-[12px] font-bold text-[#1a2e4a]">
                                                        {formatBRL(liquido)}
                                                    </TableCell>
                                                    <TableCell className="text-[11px] text-[#777]">
                                                        <div className="flex flex-col leading-tight">
                                                            <span>NCM: {p.ncm || "-"}</span>
                                                            <span>CEST: {p.cest || "-"}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <StatusBadge active={p.is_active} />
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex justify-end gap-1">
                                                            <button
                                                                onClick={() => handleEdit(p)}
                                                                className="p-1.5 rounded hover:bg-[#f0f4f8] text-[#1a2e4a] transition-colors"
                                                                title="Editar"
                                                            >
                                                                <Pencil className="h-3.5 w-3.5" />
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    if (confirm("Excluir este produto?"))
                                                                        deleteProductMutation.mutate(p.id);
                                                                }}
                                                                className="p-1.5 rounded hover:bg-red-50 text-[#8b0000] transition-colors"
                                                                title="Excluir"
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                )}

                {/* ════════════ ABA DEPARTAMENTOS ════════════ */}
                {activeTab === "departments" && (
                    <div className="border border-[#ccc] rounded-lg overflow-hidden">
                        {/* Header do card */}
                        <div className="bg-[#1a2e4a] px-4 py-2.5 flex items-center justify-between">
                            <h3 className="text-[11px] font-bold text-white uppercase tracking-widest">
                                Departamentos / Centros de Custo
                            </h3>
                        </div>

                        {/* Toolbar busca */}
                        <div className="px-4 py-3 border-b border-[#eee] bg-white">
                            <div className="relative w-full md:w-72">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[#999]" />
                                <input
                                    placeholder="Pesquisar departamentos..."
                                    className="w-full pl-9 pr-3 py-2 text-[12px] border border-[#ccc] rounded focus:outline-none focus:border-[#1a2e4a]"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Tabela */}
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-b-[1.5px] border-[#0a0a0a]">
                                        <TableHead className={thClass}>Nome do Departamento</TableHead>
                                        <TableHead className={thClass}>Nº de Produtos</TableHead>
                                        <TableHead className={`${thClass} text-right`}>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {departmentsLoading ? (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-center py-8 text-[12px] text-[#555]">
                                                Carregando...
                                            </TableCell>
                                        </TableRow>
                                    ) : filteredDepartments?.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-center py-8 text-[12px] text-[#555]">
                                                Nenhum departamento encontrado.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredDepartments?.map((d) => (
                                            <TableRow key={d.id} className="border-b border-[#eee] hover:bg-[#fafafa]">
                                                <TableCell className="text-[13px] font-semibold text-[#0a0a0a]">
                                                    {d.name}
                                                </TableCell>
                                                <TableCell className="text-[12px] text-[#555]">
                                                    {productCountByFamily(d.name)} produto(s)
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <span className={`${badgeBase} text-[#0a5c2e] border-[#0a5c2e] bg-[#e6f4ec]`}>
                                                        Ativo
                                                    </span>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                )}
            </div>

            <ProductSheet
                isOpen={isProductSheetOpen}
                onClose={() => setIsProductSheetOpen(false)}
                product={editingProduct}
            />
        </AppLayout>
    );
}
