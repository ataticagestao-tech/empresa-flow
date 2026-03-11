import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Package, Layers, CheckCircle2, XCircle, Plus, Pencil, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ProductSheet } from "@/components/products/ProductSheet";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { Badge } from "@/components/ui/badge";
import { Product } from "@/types/product";

export default function ProdutosDepartamentos() {
    const { selectedCompany } = useCompany();
    const { activeClient, isUsingSecondary } = useAuth();
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState("");
    const [activeTab, setActiveTab] = useState("products");

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
        onError: () => toast.error("Erro ao excluir produto.")
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
                .order("description");
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

    const filteredProducts = products?.filter((p) => {
        const needle = normalizeSearch(searchTerm);
        if (!needle) return true;
        const statusLabel = p.is_active ? "Ativo" : "Inativo";
        const priceValue = Number(p.price || 0);
        const formattedPrice = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(priceValue);
        const numberPrice = new Intl.NumberFormat("pt-BR").format(priceValue);
        const priceRaw = String(priceValue);
        const priceComma = priceRaw.replace(".", ",");
        return normalizeSearch(
            [
                p.code,
                p.description,
                p.family,
                p.ncm,
                p.cest,
                p.is_active,
                statusLabel,
                priceValue,
                formattedPrice,
                numberPrice,
                priceRaw,
                priceComma,
            ]
                .filter(Boolean)
                .join(" "),
        ).includes(needle);
    });

    const filteredDepartments = departments?.filter((d) => {
        const needle = normalizeSearch(searchTerm);
        if (!needle) return true;
        return normalizeSearch([d.name].filter(Boolean).join(" ")).includes(needle);
    });

    return (
        <AppLayout title="Operacional">
            <div className="space-y-6 animate-fade-in">
                <div className="flex justify-between items-center">
                    <h2 className="text-lg font-bold tracking-tight text-foreground">Operacional</h2>
                </div>

                <Tabs defaultValue="products" className="w-full" onValueChange={setActiveTab}>
                    <TabsList className="grid w-full grid-cols-2 md:w-[400px] mb-8">
                        <TabsTrigger value="products" className="flex items-center gap-2">
                            <Package className="h-4 w-4" />
                            Produtos
                        </TabsTrigger>
                        <TabsTrigger value="departments" className="flex items-center gap-2">
                            <Layers className="h-4 w-4" />
                            Departamentos
                        </TabsTrigger>
                    </TabsList>

                    <div className="flex justify-end mb-4">
                        <div className="relative w-full md:w-72">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Pesquisar..."
                                className="pl-8"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <TabsContent value="products">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle>Catálogo de Produtos</CardTitle>
                                <Button onClick={handleCreate} size="sm">
                                    <Plus className="h-4 w-4 mr-2" /> Novo Produto
                                </Button>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Código</TableHead>
                                            <TableHead>Descrição</TableHead>
                                            <TableHead>Atividade</TableHead>
                                            <TableHead>Tributação</TableHead>
                                            <TableHead>Custo</TableHead>
                                            <TableHead>Preço</TableHead>
                                            <TableHead>Líquido</TableHead>
                                            <TableHead>NCM/CEST</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-right">Ações</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {productsLoading ? (
                                            <TableRow><TableCell colSpan={10} className="text-center py-8">Carregando...</TableCell></TableRow>
                                        ) : filteredProducts?.length === 0 ? (
                                            <TableRow><TableCell colSpan={10} className="text-center py-8">Nenhum produto encontrado.</TableCell></TableRow>
                                        ) : (
                                            filteredProducts?.map((p) => (
                                                <TableRow key={p.id}>
                                                    <TableCell className="font-mono text-xs">{p.code || "-"}</TableCell>
                                                    <TableCell className="font-bold">{p.description}</TableCell>
                                                    <TableCell>{p.activity || "-"}</TableCell>
                                                    <TableCell>{p.taxation_type || "-"}</TableCell>
                                                    <TableCell>
                                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(p.cost_price || 0))}
                                                    </TableCell>
                                                    <TableCell className="font-bold text-green-600">
                                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(p.price || 0))}
                                                    </TableCell>
                                                    <TableCell className="font-bold text-blue-600">
                                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(p.price || 0) - Number(p.cost_price || 0))}
                                                    </TableCell>
                                                    <TableCell className="text-xs text-muted-foreground">
                                                        <div className="flex flex-col">
                                                            <span>NCM: {p.ncm || "-"}</span>
                                                            <span>CEST: {p.cest || "-"}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        {p.is_active ? (
                                                            <div className="flex items-center gap-1 text-green-600 font-medium">
                                                                <CheckCircle2 className="h-4 w-4" /> Ativo
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center gap-1 text-red-400 font-medium">
                                                                <XCircle className="h-4 w-4" /> Inativo
                                                            </div>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex justify-end gap-2">
                                                            <Button variant="ghost" size="icon" onClick={() => handleEdit(p)}>
                                                                <Pencil className="h-4 w-4" />
                                                            </Button>
                                                            <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600" onClick={() => {
                                                                if (confirm("Excluir este produto?")) deleteProductMutation.mutate(p.id);
                                                            }}>
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="departments">
                        <Card>
                            <CardHeader>
                                <CardTitle>Departamentos / Centros de Custo</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Nome do Departamento</TableHead>
                                            <TableHead className="text-right">Ações</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {departmentsLoading ? (
                                            <TableRow><TableCell colSpan={2} className="text-center py-8">Carregando...</TableCell></TableRow>
                                        ) : filteredDepartments?.length === 0 ? (
                                            <TableRow><TableCell colSpan={2} className="text-center py-8">Nenhum departamento encontrado.</TableCell></TableRow>
                                        ) : (
                                            filteredDepartments?.map((d) => (
                                                <TableRow key={d.id}>
                                                    <TableCell className="font-bold text-lg">{d.name}</TableCell>
                                                    <TableCell className="text-right">
                                                        <Badge variant="secondary">Ativo</Badge>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>

            <ProductSheet
                isOpen={isProductSheetOpen}
                onClose={() => setIsProductSheetOpen(false)}
                product={editingProduct}
            />
        </AppLayout>
    );
}
