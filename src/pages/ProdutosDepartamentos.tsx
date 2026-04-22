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
import { Search, Pencil, Trash2, X, Copy } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ProductSheet } from "@/components/products/ProductSheet";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { Product } from "@/types/product";
import { formatBRL } from "@/lib/format";
import { useCompanies } from "@/hooks/useCompanies";
import { useConfirm } from "@/components/ui/confirm-dialog";

export default function ProdutosDepartamentos() {
    const { selectedCompany } = useCompany();
    const { activeClient, isUsingSecondary, user } = useAuth();
    const queryClient = useQueryClient();
    const confirm = useConfirm();
    const { companies } = useCompanies(user?.id);
    const [searchTerm, setSearchTerm] = useState("");
    const [activeTab, setActiveTab] = useState<"products" | "departments">("products");

    // Product Sheet & Edit State
    const [isProductSheetOpen, setIsProductSheetOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);

    // Department modal state
    const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
    const [editingDept, setEditingDept] = useState<any>(null);
    const [deptName, setDeptName] = useState("");

    // Copy products modal state
    const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
    const [selectedOrigemId, setSelectedOrigemId] = useState("");

    const copyProductsMutation = useMutation({
        mutationFn: async () => {
            if (!selectedCompany?.id || !selectedOrigemId) throw new Error("Selecione a loja de origem");
            const { data, error } = await activeClient.rpc("copiar_produtos_entre_empresas", {
                p_origem_id: selectedOrigemId,
                p_destino_id: selectedCompany.id,
            });
            if (error) throw error;
            return data as number;
        },
        onSuccess: (count) => {
            queryClient.invalidateQueries({ queryKey: ["products"] });
            toast.success(`${count} produto(s) copiado(s) com sucesso!`);
            setIsCopyModalOpen(false);
            setSelectedOrigemId("");
        },
        onError: (err: any) => toast.error(err?.message || "Erro ao copiar produtos"),
    });

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

    // Department CRUD
    const saveDeptMutation = useMutation({
        mutationFn: async () => {
            if (!selectedCompany?.id || !deptName.trim()) throw new Error("Nome obrigatório");
            const payload = { name: deptName.trim(), company_id: selectedCompany.id };
            if (editingDept) {
                const { error } = await activeClient.from("departments").update(payload).eq("id", editingDept.id);
                if (error) throw error;
            } else {
                const { error } = await activeClient.from("departments").insert(payload);
                if (error) throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["departments"] });
            toast.success(editingDept ? "Departamento atualizado!" : "Departamento criado!");
            setIsDeptModalOpen(false);
            setEditingDept(null);
            setDeptName("");
        },
        onError: () => toast.error("Erro ao salvar departamento."),
    });

    const deleteDeptMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await activeClient.from("departments").delete().eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["departments"] });
            toast.success("Departamento excluído!");
        },
        onError: () => toast.error("Erro ao excluir departamento."),
    });

    const handleOpenDeptModal = (dept?: any) => {
        setEditingDept(dept || null);
        setDeptName(dept?.name || "");
        setIsDeptModalOpen(true);
    };

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
            <span className={`${badgeBase} text-[#039855] border-[#039855] bg-[#ECFDF3]`}>Ativo</span>
        ) : (
            <span className={`${badgeBase} text-[#555] border-[#aaa] bg-[#F6F2EB]`}>Inativo</span>
        );

    const TipoBadge = ({ tipo }: { tipo: string | null }) =>
        tipo === "servico" ? (
            <span className={`${badgeBase} text-[#059669] border-[#059669] bg-[#ECFDF4]`}>Serviço</span>
        ) : (
            <span className={`${badgeBase} text-[#555] border-[#ccc] bg-[#F6F2EB]`}>Produto</span>
        );

    /* ── Thead style ── */
    const thClass = "text-[10px] font-bold uppercase tracking-[0.06em] text-[#555] !bg-white";

    return (
        <AppLayout title="Operacional">
            <div className="space-y-4 animate-fade-in">
                {/* Cabeçalho */}
                <div className="mb-4">
                    <h1 className="text-xl font-bold text-[#1D2939]">Operacional</h1>
                    <p className="text-[12px] text-[#555] mt-1">
                        Catálogo de produtos e serviços da empresa
                    </p>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-b-[#1D2939] mb-4">
                    <button
                        onClick={() => setActiveTab("products")}
                        className={`px-5 py-2 text-[12px] font-bold -mb-[1.5px] transition-colors ${
                            activeTab === "products"
                                ? "text-[#059669] border-b-2 border-[#059669]"
                                : "text-[#555] font-semibold"
                        }`}
                    >
                        Produtos
                    </button>
                    <button
                        onClick={() => setActiveTab("departments")}
                        className={`px-5 py-2 text-[12px] font-bold -mb-[1.5px] transition-colors ${
                            activeTab === "departments"
                                ? "text-[#059669] border-b-2 border-[#059669]"
                                : "text-[#555] font-semibold"
                        }`}
                    >
                        Departamentos
                    </button>
                </div>

                {/* ════════════ ABA PRODUTOS ════════════ */}
                {activeTab === "products" && (
                    <div className="border border-[#D0D5DD] rounded-lg overflow-hidden bg-white">
                        {/* Header do card */}
                        <div className="bg-white border-b border-[#EAECF0] px-4 py-3 flex items-center justify-between">
                            <h3 className="text-[12px] font-bold text-black uppercase tracking-widest">
                                Catálogo de Produtos e Serviços
                            </h3>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setIsCopyModalOpen(true)}
                                    className="text-[11px] font-semibold bg-white border border-[#D0D5DD] text-black px-3 py-1.5 rounded hover:bg-[#F6F2EB] transition-colors flex items-center gap-1.5"
                                >
                                    <Copy className="h-3 w-3" /> Copiar de outra loja
                                </button>
                                <button
                                    onClick={handleCreate}
                                    className="text-[11px] font-semibold bg-black text-white px-3 py-1.5 rounded hover:bg-[#1D2939] transition-colors"
                                >
                                    + Novo produto
                                </button>
                            </div>
                        </div>

                        {/* Toolbar busca */}
                        <div className="px-4 py-3 border-b border-[#eee] bg-white">
                            <div className="relative w-full md:w-72">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[#999]" />
                                <input
                                    placeholder="Pesquisar produtos..."
                                    className="w-full pl-9 pr-3 py-2 text-[12px] border border-[#ccc] rounded focus:outline-none focus:border-[#059669]"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Tabela */}
                        <div className="overflow-x-auto bg-white">
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-b-[1.5px] border-[#1D2939]">
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
                                                <TableRow key={p.id} className="border-b border-[#eee] hover:bg-[#F6F2EB]">
                                                    <TableCell className="font-mono text-[11px] font-bold text-[#059669]">
                                                        {p.code || "-"}
                                                    </TableCell>
                                                    <TableCell className="text-[12px] font-semibold text-[#1D2939]">
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
                                                    <TableCell className="text-[12px] font-bold text-[#1D2939]">
                                                        {formatBRL(preco)}
                                                    </TableCell>
                                                    <TableCell className="text-[12px] font-bold text-[#059669]">
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
                                                                className="p-1.5 rounded hover:bg-[#ECFDF4] text-[#059669] transition-colors"
                                                                title="Editar"
                                                            >
                                                                <Pencil className="h-3.5 w-3.5" />
                                                            </button>
                                                            <button
                                                                onClick={async () => {
                                                                    const ok = await confirm({
                                                                        title: "Excluir este produto?",
                                                                        description: "Esta ação não pode ser desfeita.",
                                                                        confirmLabel: "Sim, excluir",
                                                                        variant: "destructive",
                                                                    });
                                                                    if (ok) deleteProductMutation.mutate(p.id);
                                                                }}
                                                                className="p-1.5 rounded hover:bg-red-50 text-[#E53E3E] transition-colors"
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
                    <div className="border border-[#D0D5DD] rounded-lg overflow-hidden bg-white">
                        {/* Header do card */}
                        <div className="bg-white border-b border-[#EAECF0] px-4 py-3 flex items-center justify-between">
                            <h3 className="text-[12px] font-bold text-black uppercase tracking-widest">
                                Departamentos / Centros de Custo
                            </h3>
                            <button
                                onClick={() => handleOpenDeptModal()}
                                className="text-[11px] font-semibold bg-black text-white px-3 py-1.5 rounded hover:bg-[#1D2939] transition-colors"
                            >
                                + Novo departamento
                            </button>
                        </div>

                        {/* Toolbar busca */}
                        <div className="px-4 py-3 border-b border-[#eee] bg-white">
                            <div className="relative w-full md:w-72">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[#999]" />
                                <input
                                    placeholder="Pesquisar departamentos..."
                                    className="w-full pl-9 pr-3 py-2 text-[12px] border border-[#ccc] rounded focus:outline-none focus:border-[#059669]"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Tabela */}
                        <div className="overflow-x-auto bg-white">
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-b-[1.5px] border-[#1D2939]">
                                        <TableHead className={thClass}>Nome do Departamento</TableHead>
                                        <TableHead className={thClass}>Nº de Produtos</TableHead>
                                        <TableHead className={`${thClass} text-right`}>Ações</TableHead>
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
                                            <TableRow key={d.id} className="border-b border-[#eee] hover:bg-[#F6F2EB]">
                                                <TableCell className="text-[13px] font-semibold text-[#1D2939]">
                                                    {d.name}
                                                </TableCell>
                                                <TableCell className="text-[12px] text-[#555]">
                                                    {productCountByFamily(d.name)} produto(s)
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end gap-1">
                                                        <button
                                                            onClick={() => handleOpenDeptModal(d)}
                                                            className="p-1.5 rounded hover:bg-[#ECFDF4] text-[#059669] transition-colors"
                                                            title="Editar"
                                                        >
                                                            <Pencil className="h-3.5 w-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={async () => {
                                                                const ok = await confirm({
                                                                    title: "Excluir este departamento?",
                                                                    description: "Esta ação não pode ser desfeita.",
                                                                    confirmLabel: "Sim, excluir",
                                                                    variant: "destructive",
                                                                });
                                                                if (ok) deleteDeptMutation.mutate(d.id);
                                                            }}
                                                            className="p-1.5 rounded hover:bg-red-50 text-[#E53E3E] transition-colors"
                                                            title="Excluir"
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                )}

                {/* ════════════ MODAL DEPARTAMENTO ════════════ */}
                {isDeptModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                        <div className="bg-white rounded-lg w-full max-w-md shadow-xl overflow-hidden">
                            <div className="bg-[#2A2724] px-5 py-3 flex items-center justify-between">
                                <h3 className="text-[13px] font-bold text-white uppercase tracking-widest">
                                    {editingDept ? "Editar Departamento" : "Novo Departamento"}
                                </h3>
                                <button onClick={() => { setIsDeptModalOpen(false); setEditingDept(null); setDeptName(""); }} className="text-white/70 hover:text-white">
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                            <div className="p-5 space-y-4">
                                <div>
                                    <label className="block text-[11px] font-bold text-[#555] uppercase tracking-wider mb-1.5">
                                        Nome do Departamento <span className="text-[#E53E3E]">*</span>
                                    </label>
                                    <input
                                        value={deptName}
                                        onChange={(e) => setDeptName(e.target.value)}
                                        placeholder="Ex: Administrativo, Comercial..."
                                        className="w-full px-3 py-2 text-[13px] border border-[#ccc] rounded focus:outline-none focus:border-[#059669]"
                                        autoFocus
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && deptName.trim()) {
                                                e.preventDefault();
                                                saveDeptMutation.mutate();
                                            }
                                        }}
                                    />
                                </div>
                                <div className="flex justify-end gap-2 pt-2 border-t border-[#eee]">
                                    <button
                                        onClick={() => { setIsDeptModalOpen(false); setEditingDept(null); setDeptName(""); }}
                                        className="px-4 py-2 text-[12px] font-bold bg-white border border-[#ccc] text-[#1D2939] rounded hover:bg-gray-50"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={() => saveDeptMutation.mutate()}
                                        disabled={!deptName.trim() || saveDeptMutation.isPending}
                                        className="px-4 py-2 text-[12px] font-bold bg-[#059669] text-white rounded hover:bg-[#0f1f33] disabled:opacity-50"
                                    >
                                        {saveDeptMutation.isPending ? "Salvando..." : "Salvar"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ════════════ MODAL COPIAR PRODUTOS ════════════ */}
            {isCopyModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-white rounded-lg w-full max-w-md shadow-xl overflow-hidden">
                        <div className="bg-[#2A2724] px-5 py-3 flex items-center justify-between">
                            <h3 className="text-[13px] font-bold text-white uppercase tracking-widest">
                                Copiar Produtos de Outra Loja
                            </h3>
                            <button onClick={() => { setIsCopyModalOpen(false); setSelectedOrigemId(""); }} className="text-white/70 hover:text-white">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <p className="text-[12px] text-[#555]">
                                Selecione a loja de origem. Produtos com o mesmo codigo nao serao duplicados.
                            </p>
                            <div>
                                <label className="block text-[11px] font-bold text-[#555] uppercase tracking-wider mb-1.5">
                                    Loja de Origem <span className="text-[#E53E3E]">*</span>
                                </label>
                                <select
                                    value={selectedOrigemId}
                                    onChange={(e) => setSelectedOrigemId(e.target.value)}
                                    className="w-full px-3 py-2 text-[13px] border border-[#ccc] rounded focus:outline-none focus:border-[#059669]"
                                >
                                    <option value="">Selecione...</option>
                                    {companies
                                        ?.filter((c: any) => c.id !== selectedCompany?.id)
                                        .map((c: any) => (
                                            <option key={c.id} value={c.id}>
                                                {c.razao_social || c.nome_fantasia || c.id}
                                            </option>
                                        ))}
                                </select>
                            </div>
                            <div className="flex justify-end gap-2 pt-2 border-t border-[#eee]">
                                <button
                                    onClick={() => { setIsCopyModalOpen(false); setSelectedOrigemId(""); }}
                                    className="px-4 py-2 text-[12px] font-bold bg-white border border-[#ccc] text-[#1D2939] rounded hover:bg-gray-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={() => copyProductsMutation.mutate()}
                                    disabled={!selectedOrigemId || copyProductsMutation.isPending}
                                    className="px-4 py-2 text-[12px] font-bold bg-[#059669] text-white rounded hover:bg-[#0f1f33] disabled:opacity-50"
                                >
                                    {copyProductsMutation.isPending ? "Copiando..." : "Copiar Produtos"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <ProductSheet
                isOpen={isProductSheetOpen}
                onClose={() => setIsProductSheetOpen(false)}
                product={editingProduct}
            />
        </AppLayout>
    );
}
