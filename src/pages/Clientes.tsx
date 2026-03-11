import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Plus, Search, Pencil, Trash2, MoreHorizontal, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ClientSheet } from "@/components/clients/ClientSheet";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useToast } from "@/components/ui/use-toast";
import { useSearchParams } from "react-router-dom";
import { maskCNPJ, maskCPF, maskPhone } from "@/utils/masks";
import { logDeletion } from "@/lib/audit";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

export default function Clientes() {
    const { selectedCompany } = useCompany();
    const { activeClient, isUsingSecondary, user } = useAuth();
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [editingClient, setEditingClient] = useState<any>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const { toast } = useToast();
    const [searchParams, setSearchParams] = useSearchParams();

    const normalizeSearch = (value: unknown) =>
        String(value ?? "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim();

    const { data: clients, isLoading, refetch } = useQuery({
        queryKey: ["clients", selectedCompany?.id, isUsingSecondary],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            // Join with category if possible, or just fetch all
            // Using standard select for now, assuming categories are joined or we adding it
            const { data, error } = await activeClient
                .from("clients")
                .select("*, category:client_categories(name)")
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

    const handleEdit = (client: any) => {
        setEditingClient(client);
        setIsSheetOpen(true);
    };

    const handleNew = () => {
        setEditingClient(null);
        setIsSheetOpen(true);
    };

    const handleDelete = async (client: any) => {
        const ok = window.confirm(`Excluir o cliente "${client.razao_social}"?`);
        if (!ok) return;
        const { error } = await activeClient.from("clients").delete().eq("id", client.id);
        if (!error) {
            refetch();
            toast({
                title: "Sucesso",
                description: "Cliente excluído",
            });
            if (user?.id) {
                await logDeletion(activeClient, {
                    userId: user.id,
                    companyId: selectedCompany?.id || null,
                    entity: "clients",
                    entityId: client.id,
                    payload: { razao_social: client.razao_social },
                });
            }
        } else {
            toast({
                title: "Erro",
                description: "Erro ao excluir",
                variant: "destructive",
            });
        }
    };

    const getInitials = (name: string) => {
        return name
            .split(" ")
            .map((n) => n[0])
            .slice(0, 2)
            .join("")
            .toUpperCase();
    };

    const filteredClients = clients?.filter((client) => {
        const needle = normalizeSearch(searchTerm);
        if (!needle) return true;

        const doc = client.cpf_cnpj || "";
        const maskedDoc = doc ? (doc.length > 11 ? maskCNPJ(doc) : maskCPF(doc)) : "";
        const phone = client.telefone || "";
        const cell = client.celular || "";
        const maskedPhone = phone ? maskPhone(phone) : "";
        const maskedCell = cell ? maskPhone(cell) : "";

        return normalizeSearch(
            [
                client.razao_social,
                client.nome_fantasia,
                doc,
                maskedDoc,
                client.email,
                phone,
                cell,
                maskedPhone,
                maskedCell,
                client.category?.name // Search by category
            ]
                .filter(Boolean)
                .join(" "),
        ).includes(needle);
    });

    return (
        <AppLayout title="Clientes">
            <div className="space-y-6 animate-in fade-in duration-500">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h2 className="text-lg font-bold tracking-tight text-foreground">
                            Clientes
                        </h2>
                        <p className="text-[12.5px] text-muted-foreground mt-0.5">Gerencie a base de clientes da sua empresa.</p>
                    </div>
                    <Button onClick={handleNew}>
                        <Plus className="h-3.5 w-3.5" />
                        Novo Cliente
                    </Button>
                </div>

                <Card>
                    <CardHeader className="flex flex-col sm:flex-row items-center justify-between space-y-4 sm:space-y-0 border-b border-[#F1F5F9]">
                        <div className="text-[12.5px] font-medium text-muted-foreground">
                            Total de {filteredClients?.length || 0} clientes
                        </div>
                        <div className="relative w-full sm:w-72">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                            <Input
                                placeholder="Buscar clientes..."
                                className="pl-8 h-8 text-[12.5px]"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="w-[60px]"></TableHead>
                                        <TableHead>Razão Social / Nome</TableHead>
                                        <TableHead>CPF/CNPJ</TableHead>
                                        <TableHead>Contato</TableHead>
                                        <TableHead>Categoria</TableHead>
                                        <TableHead className="w-[60px] text-right"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {!selectedCompany?.id ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                                Selecione uma empresa para visualizar os clientes.
                                            </TableCell>
                                        </TableRow>
                                    ) : isLoading ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="h-24 text-center">
                                                <div className="flex items-center justify-center text-muted-foreground">
                                                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent mr-2"></div>
                                                    Carregando...
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : filteredClients?.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                                                Nenhum cliente encontrado.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredClients?.map((client) => (
                                            <TableRow key={client.id} className="group">
                                                <TableCell>
                                                    <Avatar className="h-8 w-8 border border-[#E2E8F0]">
                                                        <AvatarFallback className="bg-[#EFF6FF] text-[#2563EB] text-[11px] font-semibold">
                                                            {getInitials(client.razao_social)}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="font-semibold text-[12.5px] text-foreground">{client.razao_social}</div>
                                                    {client.nome_fantasia && (
                                                        <div className="text-[11px] text-muted-foreground mt-0.5">{client.nome_fantasia}</div>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-muted-foreground font-mono text-[11.5px]">
                                                    {client.cpf_cnpj
                                                        ? (client.cpf_cnpj.length > 11 ? maskCNPJ(client.cpf_cnpj) : maskCPF(client.cpf_cnpj))
                                                        : "-"
                                                    }
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col text-[12.5px] text-foreground">
                                                        <span>{client.email}</span>
                                                        <span className="text-[11px] text-muted-foreground">
                                                            {client.celular ? maskPhone(client.celular) : (client.telefone ? maskPhone(client.telefone) : "-")}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    {client.category ? (
                                                        <Badge variant="default">
                                                            {client.category.name}
                                                        </Badge>
                                                    ) : (
                                                        <span className="text-muted-foreground text-[11px]">-</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <span className="sr-only">Abrir menu</span>
                                                                <MoreHorizontal className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuLabel>Ações</DropdownMenuLabel>
                                                            <DropdownMenuItem onClick={() => handleEdit(client)}>
                                                                <Pencil className="mr-2 h-4 w-4 text-muted-foreground" />
                                                                Editar
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem onClick={() => handleDelete(client)} className="text-[#EF4444]">
                                                                <Trash2 className="mr-2 h-4 w-4" />
                                                                Excluir
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                    </CardContent>
                </Card>

                <ClientSheet
                    isOpen={isSheetOpen}
                    onClose={() => {
                        setIsSheetOpen(false);
                        setEditingClient(null);
                    }}
                    clientToEdit={editingClient}
                />
            </div>
        </AppLayout>
    );
}
