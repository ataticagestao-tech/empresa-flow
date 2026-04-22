import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Plus, Search, Pencil, Trash2, Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CategorySheet } from "@/components/categories/CategorySheet";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { Badge } from "@/components/ui/badge";
import { logDeletion } from "@/lib/audit";
import { useConfirm } from "@/components/ui/confirm-dialog";

export default function Categorias() {
    const { selectedCompany } = useCompany();
    const { activeClient, isUsingSecondary, user } = useAuth();
    const queryClient = useQueryClient();
    const confirm = useConfirm();
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<any>(null);
    const [searchTerm, setSearchTerm] = useState("");

    const normalizeSearch = (value: unknown) =>
        String(value ?? "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim();

    const { data: categories, isLoading } = useQuery({
        queryKey: ["categories", selectedCompany?.id, isUsingSecondary],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data, error } = await activeClient
                .from("categories")
                .select("*")
                .eq("company_id", selectedCompany.id)
                .order("name");

            if (error) throw error;
            return data;
        },
        enabled: !!selectedCompany?.id,
    });

    const handleEdit = (item: any) => {
        setEditingItem(item);
        setIsSheetOpen(true);
    };

    const handleNew = () => {
        setEditingItem(null);
        setIsSheetOpen(true);
    };

    const handleDelete = async (cat: any) => {
        const ok = await confirm({
            title: `Excluir a categoria "${cat.name}"?`,
            description: "Esta ação não pode ser desfeita.",
            confirmLabel: "Sim, excluir",
            variant: "destructive",
        });
        if (!ok) return;
        const { error } = await activeClient.from("categories").delete().eq("id", cat.id);
        if (!error) {
            queryClient.invalidateQueries({ queryKey: ["categories", selectedCompany?.id, isUsingSecondary] });
            if (user?.id) {
                await logDeletion(activeClient, {
                    userId: user.id,
                    companyId: selectedCompany?.id || null,
                    entity: "categories",
                    entityId: cat.id,
                    payload: { name: cat.name },
                });
            }
        }
    };
    const filteredCategories = categories?.filter((cat) => {
        const needle = normalizeSearch(searchTerm);
        if (!needle) return true;
        const typeLabel = cat.type === "income" ? "Receita" : "Despesa";
        return normalizeSearch(
            [cat.name, cat.type, typeLabel, cat.description].filter(Boolean).join(" "),
        ).includes(needle);
    });

    return (
        <AppLayout title="Categorias">
            <div className="space-y-6 animate-fade-in">

                <div className="flex justify-between items-center">
                    <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
                        <Tag className="h-8 w-8 text-primary" />
                        Categorias
                    </h2>
                    <Button onClick={handleNew}>
                        <Plus className="mr-2 h-4 w-4" />
                        Nova Categoria
                    </Button>
                </div>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                        <CardTitle>Listagem de Categorias</CardTitle>
                        <div className="relative w-72">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar por nome..."
                                className="pl-8"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nome</TableHead>
                                    <TableHead>Tipo</TableHead>
                                    <TableHead>Descrição</TableHead>
                                    <TableHead className="text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                                            Carregando categorias...
                                        </TableCell>
                                    </TableRow>
                                ) : filteredCategories?.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                                            Nenhuma categoria encontrada.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredCategories?.map((cat) => (
                                        <TableRow key={cat.id}>
                                            <TableCell className="font-medium">{cat.name}</TableCell>
                                            <TableCell>
                                                <Badge variant={cat.type === 'income' ? 'default' : 'destructive'}>
                                                    {cat.type === 'income' ? 'Receita' : 'Despesa'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>{cat.description || "-"}</TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="icon" onClick={() => handleEdit(cat)}>
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" onClick={() => handleDelete(cat)}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                <CategorySheet
                    isOpen={isSheetOpen}
                    onClose={() => {
                        setIsSheetOpen(false);
                        setEditingItem(null);
                    }}
                    dataToEdit={editingItem}
                />
            </div>
        </AppLayout>
    );
}
