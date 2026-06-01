import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ProductSheet } from "@/components/products/ProductSheet";
import { CategoriaContabilContent } from "@/components/products/CategoriaContabilContent";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { Product } from "@/types/product";
import { formatBRL, toTitleCase } from "@/lib/format";
import { useCompanies } from "@/hooks/useCompanies";
import { useConfirm } from "@/components/ui/confirm-dialog";

const initials = (str: string) => {
    if (!str) return "?";
    const parts = str.trim().split(/\s+/).slice(0, 2);
    return parts.map(p => p[0]?.toUpperCase()).join("") || "?";
};

const LB = "text-[11px] font-bold uppercase tracking-wider text-[#1D2939]";

export default function ProdutosDepartamentos() {
    const { selectedCompany } = useCompany();
    const { activeClient, isUsingSecondary, user } = useAuth();
    const queryClient = useQueryClient();
    const confirm = useConfirm();
    const { companies } = useCompanies(user?.id);

    const [activeTab, setActiveTab] = useState<"products" | "departments" | "categorias">("products");
    const [search, setSearch] = useState("");

    // Product state
    const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
    const [isProductSheetOpen, setIsProductSheetOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);

    // Department state
    const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
    const [deptName, setDeptName] = useState("");
    const [isCreatingDept, setIsCreatingDept] = useState(false);

    // Copy state
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

    const deleteProductMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await activeClient.from("products").delete().eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["products"] });
            toast.success("Produto excluído.");
            setSelectedProductId(null);
        },
        onError: () => toast.error("Erro ao excluir produto."),
    });

    const saveDeptMutation = useMutation({
        mutationFn: async () => {
            if (!selectedCompany?.id || !deptName.trim()) throw new Error("Nome obrigatório");
            const payload = { name: toTitleCase(deptName.trim()), company_id: selectedCompany.id };
            if (selectedDeptId && !isCreatingDept) {
                const { error } = await activeClient.from("departments").update(payload).eq("id", selectedDeptId);
                if (error) throw error;
                return selectedDeptId;
            } else {
                const { data, error } = await activeClient.from("departments").insert(payload).select("id").single();
                if (error) throw error;
                return (data as any)?.id ?? null;
            }
        },
        onSuccess: (id) => {
            queryClient.invalidateQueries({ queryKey: ["departments"] });
            toast.success(isCreatingDept ? "Departamento criado." : "Departamento atualizado.");
            setIsCreatingDept(false);
            if (id) setSelectedDeptId(id);
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
            toast.success("Departamento excluído.");
            setSelectedDeptId(null);
        },
        onError: () => toast.error("Erro ao excluir departamento."),
    });

    const { data: products = [], isLoading: productsLoading } = useQuery<Product[]>({
        queryKey: ["products", selectedCompany?.id, isUsingSecondary],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data, error } = await activeClient
                .from("products").select("*").eq("company_id", selectedCompany.id).order("code");
            if (error) throw error;
            return data as Product[];
        },
        enabled: !!selectedCompany?.id,
    });

    const { data: departments = [], isLoading: departmentsLoading } = useQuery<any[]>({
        queryKey: ["departments", selectedCompany?.id, isUsingSecondary],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data, error } = await activeClient
                .from("departments").select("*").eq("company_id", selectedCompany.id).order("name");
            if (error) throw error;
            return data as any[];
        },
        enabled: !!selectedCompany?.id,
    });

    const selectedProduct = products.find(p => p.id === selectedProductId) || null;
    const selectedDept = departments.find(d => d.id === selectedDeptId) || null;

    const filteredProducts = products.filter(p => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return [p.code, p.description, p.family, p.ncm].filter(Boolean).join(" ").toLowerCase().includes(q);
    });

    const filteredDepts = departments.filter(d => {
        if (!search.trim()) return true;
        return (d.name || "").toLowerCase().includes(search.toLowerCase());
    });

    const productsInDept = (deptName: string) => products.filter(p => p.family === deptName);

    const handleNewProduct = () => {
        setEditingProduct(null);
        setIsProductSheetOpen(true);
    };

    const handleEditProduct = (p: Product) => {
        setEditingProduct(p);
        setIsProductSheetOpen(true);
    };

    const startNewDept = () => {
        setSelectedDeptId(null);
        setIsCreatingDept(true);
        setDeptName("");
    };

    const startEditDept = (d: any) => {
        setSelectedDeptId(d.id);
        setIsCreatingDept(false);
        setDeptName(d.name);
    };

    return (
        <AppLayout title="Operacional">
            <div className="pt-0 pb-3">
            <div className="bg-white rounded-xl border border-[#EAECF0] shadow-sm p-4 space-y-3 min-h-[calc(100vh-150px)]">
                {/* Header + Tabs */}
                <div className="border border-[#ccc] rounded-lg overflow-hidden bg-white">
                    <div className="bg-[#071D41] px-4 py-3 flex items-center justify-between gap-3">
                        <div>
                            <h1 className="text-[16px] font-bold uppercase tracking-[0.5px] text-white">Operacional</h1>
                            <p className="text-[11px] text-white/80 mt-0.5">Catálogo de produtos, departamentos e classificação contábil</p>
                        </div>
                    </div>
                    <div className="flex px-4 border-b border-[#EAECF0]">
                        {[
                            { id: "products", label: "Produtos / Serviços" },
                            { id: "departments", label: "Departamentos" },
                            { id: "categorias", label: "Categoria Contábil" },
                        ].map(t => (
                            <button key={t.id} onClick={() => { setActiveTab(t.id as any); setSearch(""); }}
                                className={`px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-colors border-b-2 ${
                                    activeTab === t.id
                                        ? "text-[#059669] border-[#059669]"
                                        : "text-[#555] border-transparent hover:text-[#1D2939]"
                                }`}>
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                {activeTab === "categorias" && <CategoriaContabilContent />}

                {/* ════════════ PRODUTOS — split layout ════════════ */}
                {activeTab === "products" && (
                    <div className="flex gap-3 h-[calc(100vh-290px)] min-h-[460px]">
                        {/* LEFT */}
                        <div className="w-[380px] shrink-0 border border-[#ccc] rounded-lg overflow-hidden flex flex-col bg-white">
                            <div className="bg-[#071D41] px-3 py-2.5 flex items-center justify-between gap-2">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-white">Catálogo</span>
                                <div className="flex items-center gap-1.5">
                                    <button onClick={() => setIsCopyModalOpen(true)}
                                        className="text-[11px] font-bold text-white/90 hover:text-white px-2 py-1">
                                        Copiar de outra loja
                                    </button>
                                    <button onClick={handleNewProduct}
                                        className="text-[11px] font-bold text-[#064E3B] bg-[#ECFDF4] hover:bg-white rounded px-2 py-1">
                                        + Novo
                                    </button>
                                </div>
                            </div>
                            <div className="p-3 border-b border-[#EAECF0]">
                                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..."
                                    className="w-full border border-[#ccc] rounded-md px-3 py-2 text-sm focus:border-[#059669] focus:outline-none" />
                            </div>
                            <div className="flex-1 overflow-y-auto">
                                {productsLoading ? (
                                    <div className="p-3 space-y-2">
                                        {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                                    </div>
                                ) : filteredProducts.length === 0 ? (
                                    <div className="p-6 text-center text-sm text-[#555]">
                                        {search ? "Nenhum produto encontrado." : "Cadastre seu primeiro produto."}
                                    </div>
                                ) : (
                                    filteredProducts.map(p => {
                                        const tipoLabel = p.activity === "servico" ? "Serviço" : "Produto";
                                        return (
                                            <div key={p.id} onClick={() => setSelectedProductId(p.id)}
                                                className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer border-b border-[#EAECF0] transition-all ${
                                                    selectedProductId === p.id ? "bg-[#ECFDF4] border-l-2 border-l-[#059669]" : "hover:bg-[#F6F2EB]"
                                                }`}>
                                                <div className="w-9 h-9 rounded-full bg-[#059669] flex items-center justify-center text-[#064E3B] text-xs font-bold shrink-0">
                                                    {initials(p.description)}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[13px] font-semibold text-[#1D2939] truncate">{p.description}</p>
                                                    <p className="text-[11px] text-[#555] truncate">
                                                        {p.code ? `${p.code} · ` : ""}{p.family || "Sem departamento"}
                                                    </p>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className="text-[12px] font-bold text-[#1D2939] tabular-nums">{formatBRL(Number(p.price || 0))}</p>
                                                    <div className="flex items-center justify-end gap-1 mt-0.5">
                                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                                            p.activity === "servico" ? "bg-[#ECFDF4] text-[#059669]" : "bg-[#F6F2EB] text-[#555]"
                                                        }`}>{tipoLabel}</span>
                                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                                            p.is_active ? "bg-[#ECFDF3] text-[#039855]" : "bg-[#EAECF0] text-[#555]"
                                                        }`}>{p.is_active ? "Ativo" : "Inativo"}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        {/* RIGHT — produto detail */}
                        <div className="flex-1 border border-[#ccc] rounded-lg overflow-hidden flex flex-col bg-white">
                            {!selectedProduct ? (
                                <div className="flex-1 flex items-center justify-center text-sm text-[#555]">
                                    Selecione um produto ou clique em "+ Novo"
                                </div>
                            ) : (
                                <ProductDetailView
                                    product={selectedProduct}
                                    onEdit={() => handleEditProduct(selectedProduct)}
                                    onDelete={async () => {
                                        const ok = await confirm({
                                            title: `Excluir "${selectedProduct.description}"?`,
                                            description: "Esta ação não pode ser desfeita.",
                                            confirmLabel: "Sim, excluir",
                                            variant: "destructive",
                                        });
                                        if (ok) deleteProductMutation.mutate(selectedProduct.id);
                                    }}
                                />
                            )}
                        </div>
                    </div>
                )}

                {/* ════════════ DEPARTAMENTOS — split layout ════════════ */}
                {activeTab === "departments" && (
                    <div className="flex gap-3 h-[calc(100vh-290px)] min-h-[460px]">
                        {/* LEFT */}
                        <div className="w-[340px] shrink-0 border border-[#ccc] rounded-lg overflow-hidden flex flex-col bg-white">
                            <div className="bg-[#071D41] px-3 py-2.5 flex items-center justify-between gap-2">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-white">Departamentos</span>
                                <button onClick={startNewDept}
                                    className="text-[11px] font-bold text-[#064E3B] bg-[#ECFDF4] hover:bg-white rounded px-2 py-1">
                                    + Novo
                                </button>
                            </div>
                            <div className="p-3 border-b border-[#EAECF0]">
                                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..."
                                    className="w-full border border-[#ccc] rounded-md px-3 py-2 text-sm focus:border-[#059669] focus:outline-none" />
                            </div>
                            <div className="flex-1 overflow-y-auto">
                                {departmentsLoading ? (
                                    <div className="p-3 space-y-2">
                                        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                                    </div>
                                ) : filteredDepts.length === 0 ? (
                                    <div className="p-6 text-center text-sm text-[#555]">
                                        Nenhum departamento.
                                    </div>
                                ) : (
                                    filteredDepts.map(d => {
                                        const count = productsInDept(d.name).length;
                                        return (
                                            <div key={d.id} onClick={() => startEditDept(d)}
                                                className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer border-b border-[#EAECF0] transition-all ${
                                                    selectedDeptId === d.id && !isCreatingDept ? "bg-[#ECFDF4] border-l-2 border-l-[#059669]" : "hover:bg-[#F6F2EB]"
                                                }`}>
                                                <div className="w-9 h-9 rounded-full bg-[#059669] flex items-center justify-center text-[#064E3B] text-xs font-bold shrink-0">
                                                    {initials(d.name)}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[13px] font-semibold text-[#1D2939] truncate">{d.name}</p>
                                                    <p className="text-[11px] text-[#555]">{count} produto(s)</p>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        {/* RIGHT — dept form */}
                        <div className="flex-1 border border-[#ccc] rounded-lg overflow-hidden flex flex-col bg-white">
                            {!selectedDept && !isCreatingDept ? (
                                <div className="flex-1 flex items-center justify-center text-sm text-[#555]">
                                    Selecione um departamento ou clique em "+ Novo"
                                </div>
                            ) : (
                                <>
                                    <div className="bg-[#059669] px-4 py-2 flex items-center justify-end gap-1">
                                        {selectedDept && !isCreatingDept && (
                                            <button onClick={async () => {
                                                const ok = await confirm({
                                                    title: `Excluir "${selectedDept.name}"?`,
                                                    description: "Esta ação não pode ser desfeita.",
                                                    confirmLabel: "Sim, excluir",
                                                    variant: "destructive",
                                                });
                                                if (ok) deleteDeptMutation.mutate(selectedDept.id);
                                            }} className="text-[11px] font-bold text-[#991B1B] hover:bg-white/30 rounded px-2 py-1">
                                                Excluir
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-5 space-y-4">
                                        <div className="flex flex-col gap-1">
                                            <label className={LB}>Nome do Departamento <span className="text-[#E53E3E]">*</span></label>
                                            <input value={deptName} onChange={e => setDeptName(e.target.value)}
                                                placeholder="Ex: Administrativo, Comercial..."
                                                className="border border-[#ccc] rounded-md px-3 py-2 text-sm focus:border-[#059669] focus:outline-none w-full"
                                                autoFocus />
                                        </div>
                                        <button onClick={() => saveDeptMutation.mutate()}
                                            disabled={!deptName.trim() || saveDeptMutation.isPending}
                                            className="bg-[#059669] text-white text-sm font-bold px-6 py-2 rounded-md disabled:opacity-40">
                                            {saveDeptMutation.isPending ? "Salvando..." : isCreatingDept ? "Cadastrar" : "Salvar Alterações"}
                                        </button>

                                        {selectedDept && !isCreatingDept && (
                                            <div className="space-y-2 pt-4 border-t border-[#EAECF0]">
                                                <h4 className={LB}>Produtos neste departamento ({productsInDept(selectedDept.name).length})</h4>
                                                {productsInDept(selectedDept.name).length === 0 ? (
                                                    <p className="text-xs text-[#555]">Nenhum produto vinculado a este departamento.</p>
                                                ) : (
                                                    <div className="border border-[#ccc] rounded-md overflow-hidden">
                                                        {productsInDept(selectedDept.name).map(p => (
                                                            <div key={p.id} className="flex items-center justify-between px-3 py-2 border-b border-[#eee] last:border-0 hover:bg-[#FAFAF7]">
                                                                <div className="min-w-0 flex-1">
                                                                    <span className="text-[12px] text-[#555] tabular-nums mr-2">{p.code || "—"}</span>
                                                                    <span className="text-[13px] text-[#1D2939] truncate">{p.description}</span>
                                                                </div>
                                                                <span className="text-[12px] font-bold text-[#1D2939] tabular-nums whitespace-nowrap">{formatBRL(Number(p.price || 0))}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
            </div>

            <ProductSheet
                isOpen={isProductSheetOpen}
                onClose={() => {
                    setIsProductSheetOpen(false);
                    setEditingProduct(null);
                    queryClient.invalidateQueries({ queryKey: ["products"] });
                }}
                productToEdit={editingProduct}
            />

            {isCopyModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="bg-white rounded-lg w-full max-w-md shadow-xl overflow-hidden">
                        <div className="bg-[#071D41] px-4 py-3">
                            <h3 className="text-[12px] font-bold uppercase tracking-wider text-white">Copiar produtos de outra loja</h3>
                        </div>
                        <div className="p-5 space-y-4">
                            <p className="text-[12px] text-[#555]">Produtos com o mesmo código não serão duplicados.</p>
                            <div className="flex flex-col gap-1">
                                <label className={LB}>Loja de origem *</label>
                                <select value={selectedOrigemId} onChange={e => setSelectedOrigemId(e.target.value)}
                                    className="border border-[#ccc] rounded-md px-3 py-2 text-sm focus:border-[#059669] focus:outline-none">
                                    <option value="">Selecione...</option>
                                    {companies?.filter((c: any) => c.id !== selectedCompany?.id).map((c: any) => (
                                        <option key={c.id} value={c.id}>{c.razao_social || c.nome_fantasia || c.id}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex justify-end gap-2 pt-2 border-t border-[#EAECF0]">
                                <button onClick={() => { setIsCopyModalOpen(false); setSelectedOrigemId(""); }}
                                    className="px-4 py-2 text-[12px] font-bold text-[#555] border border-[#ccc] rounded hover:bg-[#F6F2EB]">
                                    Cancelar
                                </button>
                                <button onClick={() => copyProductsMutation.mutate()}
                                    disabled={!selectedOrigemId || copyProductsMutation.isPending}
                                    className="px-4 py-2 text-[12px] font-bold text-white bg-[#059669] rounded hover:bg-[#047857] disabled:opacity-50">
                                    {copyProductsMutation.isPending ? "Copiando..." : "Copiar"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </AppLayout>
    );
}

function ProductDetailView({ product: p, onEdit, onDelete }: { product: Product; onEdit: () => void; onDelete: () => void }) {
    const preco = Number(p.price || 0);
    const custo = Number(p.cost_price || 0);
    const liquido = preco - custo;
    const margem = preco > 0 ? ((liquido / preco) * 100).toFixed(1) : "—";

    const Field = ({ label, value, mono }: { label: string; value: any; mono?: boolean }) => (
        <div className="flex flex-col gap-1 min-w-0">
            <span className={LB}>{label}</span>
            <span className={`text-sm text-[#1D2939] truncate ${mono ? "tabular-nums font-mono" : ""}`} title={value || ""}>{value || "—"}</span>
        </div>
    );

    return (
        <>
            <div className="bg-[#059669] px-4 py-2 flex items-center gap-1">
                <button onClick={onEdit} className="text-[11px] font-bold text-white border border-white/40 hover:bg-white/20 rounded px-2 py-1">
                    Editar
                </button>
                <button onClick={onDelete} className="ml-auto text-[11px] font-bold text-[#991B1B] hover:bg-white/30 rounded px-2 py-1">
                    Excluir
                </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
                <div>
                    <h3 className="text-base font-bold text-[#1D2939]">{p.description}</h3>
                    <p className="text-xs text-[#555] mt-0.5">
                        {[
                            p.code,
                            p.activity === "servico" ? "Serviço" : "Produto",
                            p.family || null,
                            p.is_active ? "Ativo" : "Inativo",
                        ].filter(Boolean).join(" · ")}
                    </p>
                </div>

                <Section title="Identificação">
                    <div className="grid grid-cols-3 gap-4">
                        <Field label="Código" value={p.code} mono />
                        <Field label="Tipo" value={p.activity === "servico" ? "Serviço" : "Produto"} />
                        <Field label="Departamento" value={p.family} />
                    </div>
                </Section>

                <Section title="Preços">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="border-2 border-[#059669] rounded-lg p-3">
                            <p className="text-[11px] font-bold uppercase text-[#059669]">Preço de Venda</p>
                            <p className="text-xl font-bold text-[#1D2939] mt-1">{formatBRL(preco)}</p>
                        </div>
                        <div className="border border-[#ccc] rounded-lg p-3">
                            <p className="text-[11px] font-bold uppercase text-[#555]">Custo</p>
                            <p className="text-xl font-bold text-[#1D2939] mt-1">{formatBRL(custo)}</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-[#F6F2EB] rounded-md px-3 py-2">
                            <span className="text-[11px] font-bold uppercase text-[#555]">Líquido</span>
                            <p className="text-base font-bold text-[#059669] mt-0.5 tabular-nums">{formatBRL(liquido)}</p>
                        </div>
                        <div className="bg-[#F6F2EB] rounded-md px-3 py-2">
                            <span className="text-[11px] font-bold uppercase text-[#555]">Margem</span>
                            <p className="text-base font-bold text-[#1D2939] mt-0.5 tabular-nums">{margem}{margem !== "—" ? "%" : ""}</p>
                        </div>
                    </div>
                </Section>

                <Section title="Tributação">
                    <div className="grid grid-cols-3 gap-4">
                        <Field label="Regime" value={p.taxation_type} />
                        <Field label="NCM" value={p.ncm} mono />
                        <Field label="CEST" value={p.cest} mono />
                    </div>
                </Section>

                {(p as any).conta_contabil_id && (
                    <Section title="Categoria contábil">
                        <p className="text-sm text-[#1D2939]">Vinculada (vá em <strong>Categoria Contábil</strong> para alterar).</p>
                    </Section>
                )}

                {!(p as any).conta_contabil_id && (
                    <div className="bg-[#FEF3C7] border border-[#FBBF24] rounded-md px-3 py-2 text-[12px] text-[#92400E]">
                        <strong>Atenção:</strong> este produto não tem categoria contábil. Vendas vão pra conta padrão (a primeira do plano). Vá em <strong>Categoria Contábil</strong> para corrigir.
                    </div>
                )}
            </div>
        </>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <h4 className={LB}>{title}</h4>
                <div className="flex-1 h-px bg-[#EAECF0]" />
            </div>
            <div className="space-y-3">{children}</div>
        </div>
    );
}
