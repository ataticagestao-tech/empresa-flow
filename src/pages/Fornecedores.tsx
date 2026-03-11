import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
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
import { SupplierSheet } from "@/components/suppliers/SupplierSheet";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useSearchParams } from "react-router-dom";
import { maskCNPJ, maskCPF, maskPhone } from "@/utils/masks";
import { logDeletion } from "@/lib/audit";

export default function Fornecedores() {
    const { selectedCompany } = useCompany();
    const { activeClient, isUsingSecondary, user } = useAuth();
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState<any>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [searchParams, setSearchParams] = useSearchParams();

    const normalizeSearch = (value: unknown) =>
        String(value ?? "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim();

    const { data: suppliers, isLoading, refetch } = useQuery({
        queryKey: ["suppliers", selectedCompany?.id, isUsingSecondary],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data, error } = await activeClient
                .from("suppliers")
                .select("*")
                .eq("company_id", selectedCompany.id)
                .order("razao_social");

            if (error) throw error;
            return data;
        },
        enabled: !!selectedCompany?.id,
    });

    useEffect(() => {
        if (searchParams.get("new") === "true") {
            handleNew();
            const newParams = new URLSearchParams(searchParams);
            newParams.delete("new");
            setSearchParams(newParams);
        }
    }, [searchParams, setSearchParams]);

    const handleEdit = (supplier: any) => {
        setEditingSupplier(supplier);
        setIsSheetOpen(true);
    };

    const handleNew = () => {
        setEditingSupplier(null);
        setIsSheetOpen(true);
    };

    const handleDelete = async (supplier: any) => {
        const ok = window.confirm(`Excluir o fornecedor "${supplier.razao_social}"?`);
        if (!ok) return;
        const { error } = await activeClient.from("suppliers").delete().eq("id", supplier.id);
        if (!error) {
            refetch();
            if (user?.id) {
                await logDeletion(activeClient, {
                    userId: user.id,
                    companyId: selectedCompany?.id || null,
                    entity: "suppliers",
                    entityId: supplier.id,
                    payload: { razao_social: supplier.razao_social },
                });
            }
        }
    };
    const filteredSuppliers = suppliers?.filter((supplier) => {
        const needle = normalizeSearch(searchTerm);
        if (!needle) return true;

        const doc = supplier.cpf_cnpj || "";
        const maskedDoc = doc ? (doc.length > 11 ? maskCNPJ(doc) : maskCPF(doc)) : "";
        const phone = supplier.telefone || "";
        const cell = supplier.celular || "";
        const maskedPhone = phone ? maskPhone(phone) : "";
        const maskedCell = cell ? maskPhone(cell) : "";

        return normalizeSearch(
            [
                supplier.razao_social,
                supplier.nome_fantasia,
                doc,
                maskedDoc,
                supplier.email,
                phone,
                cell,
                maskedPhone,
                maskedCell,
            ]
                .filter(Boolean)
                .join(" "),
        ).includes(needle);
    });

    return (
        <AppLayout title="Fornecedores">
            <div className="space-y-6 animate-fade-in">
                <div className="flex justify-between items-center">
                    <h2 className="text-lg font-bold tracking-tight">Fornecedores</h2>
                    <Button onClick={handleNew}>
                        <Plus className="mr-2 h-4 w-4" />
                        Novo Fornecedor
                    </Button>
                </div>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                        <CardTitle>Listagem de Fornecedores</CardTitle>
                        <div className="relative w-72">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar por nome ou CPF/CNPJ..."
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
                                    <TableHead>Razão Social / Nome</TableHead>
                                    <TableHead>Nome Fantasia</TableHead>
                                    <TableHead>CPF/CNPJ</TableHead>
                                    <TableHead>Contato</TableHead>
                                    <TableHead className="text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                            Carregando fornecedores...
                                        </TableCell>
                                    </TableRow>
                                ) : filteredSuppliers?.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                            Nenhum fornecedor encontrado.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredSuppliers?.map((supplier) => (
                                        <TableRow key={supplier.id}>
                                            <TableCell className="font-medium">{supplier.razao_social}</TableCell>
                                            <TableCell>{supplier.nome_fantasia || "-"}</TableCell>
                                            <TableCell>
                                                {supplier.cpf_cnpj
                                                    ? (supplier.cpf_cnpj.length > 11 ? maskCNPJ(supplier.cpf_cnpj) : maskCPF(supplier.cpf_cnpj))
                                                    : "-"
                                                }
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col text-sm">
                                                    <span>{supplier.email}</span>
                                                    <span className="text-muted-foreground">
                                                        {supplier.celular ? maskPhone(supplier.celular) : (supplier.telefone ? maskPhone(supplier.telefone) : "-")}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="icon" onClick={() => handleEdit(supplier)}>
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" onClick={() => handleDelete(supplier)}>
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

                <SupplierSheet
                    isOpen={isSheetOpen}
                    onClose={() => {
                        setIsSheetOpen(false);
                        setEditingSupplier(null);
                    }}
                    supplierToEdit={editingSupplier}
                />
            </div>
        </AppLayout>
    );
}
