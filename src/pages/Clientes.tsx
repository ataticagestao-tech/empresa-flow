import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import {
    Plus, Search, Pencil, Trash2, MoreHorizontal, Bell,
    ArrowUpCircle, ArrowDownCircle, AlertTriangle, Users as UsersIcon, Eye,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ClientSheet } from "@/components/clients/ClientSheet";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useToast } from "@/components/ui/use-toast";
import { useSearchParams, useNavigate } from "react-router-dom";
import { maskCNPJ, maskCPF, maskPhone } from "@/utils/masks";
import { formatCurrency } from "@/utils/formatters";
import { logDeletion } from "@/lib/audit";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface FinancialSummary {
    totalReceber: number;
    totalReceberAberto: number;
    totalReceberVencido: number;
    totalPagar: number;
    totalPagarAberto: number;
    countReceber: number;
    countPagar: number;
    receivables: any[];
    payables: any[];
}

export default function Clientes() {
    const { selectedCompany } = useCompany();
    const { activeClient, isUsingSecondary, user } = useAuth();
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [editingClient, setEditingClient] = useState<any>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [detailClient, setDetailClient] = useState<any>(null);
    const { toast } = useToast();
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();

    const normalizeSearch = (value: unknown) =>
        String(value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

    const { data: clients, isLoading, refetch } = useQuery({
        queryKey: ["clients", selectedCompany?.id, isUsingSecondary],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
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

    const { data: receivables } = useQuery({
        queryKey: ["clients_receivables", selectedCompany?.id],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data, error } = await activeClient
                .from("contas_receber")
                .select("id, pagador_nome, pagador_cpf_cnpj, valor, valor_pago, data_vencimento, status")
                .eq("company_id", selectedCompany.id);
            if (error) throw error;
            return data || [];
        },
        enabled: !!selectedCompany?.id,
    });

    const { data: payables } = useQuery({
        queryKey: ["clients_payables", selectedCompany?.id],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data, error } = await activeClient
                .from("contas_pagar")
                .select("id, credor_nome, credor_cpf_cnpj, valor, valor_pago, data_vencimento, status")
                .eq("company_id", selectedCompany.id);
            if (error) throw error;
            return data || [];
        },
        enabled: !!selectedCompany?.id,
    });

    const financialByClient = useMemo(() => {
        const map = new Map<string, FinancialSummary>();

        const getKey = (client: any) => {
            if (client.cpf_cnpj) return client.cpf_cnpj.replace(/\D/g, "");
            return normalizeSearch(client.razao_social);
        };

        clients?.forEach((c: any) => {
            const key = getKey(c);
            if (!map.has(key)) {
                map.set(key, {
                    totalReceber: 0, totalReceberAberto: 0, totalReceberVencido: 0,
                    totalPagar: 0, totalPagarAberto: 0,
                    countReceber: 0, countPagar: 0,
                    receivables: [], payables: [],
                });
            }
        });

        const today = new Date().toISOString().split("T")[0];

        receivables?.forEach((r: any) => {
            const doc = r.pagador_cpf_cnpj?.replace(/\D/g, "");
            const nameKey = normalizeSearch(r.pagador_nome);
            const key = doc || nameKey;

            let found = map.get(key);
            if (!found && doc) {
                for (const [k, v] of map.entries()) {
                    if (k === doc || k === nameKey) { found = v; break; }
                }
            }
            if (!found) {
                found = {
                    totalReceber: 0, totalReceberAberto: 0, totalReceberVencido: 0,
                    totalPagar: 0, totalPagarAberto: 0,
                    countReceber: 0, countPagar: 0,
                    receivables: [], payables: [],
                };
                map.set(key, found);
            }

            const valor = Number(r.valor || 0);
            found.totalReceber += valor;
            found.countReceber++;
            found.receivables.push(r);
            if (r.status === "aberto" || r.status === "parcial") {
                found.totalReceberAberto += valor - Number(r.valor_pago || 0);
            }
            if ((r.status === "aberto" || r.status === "vencido") && r.data_vencimento < today) {
                found.totalReceberVencido += valor - Number(r.valor_pago || 0);
            }
        });

        payables?.forEach((p: any) => {
            const doc = p.credor_cpf_cnpj?.replace(/\D/g, "");
            const nameKey = normalizeSearch(p.credor_nome);
            const key = doc || nameKey;

            let found = map.get(key);
            if (!found && doc) {
                for (const [k, v] of map.entries()) {
                    if (k === doc || k === nameKey) { found = v; break; }
                }
            }
            if (!found) {
                found = {
                    totalReceber: 0, totalReceberAberto: 0, totalReceberVencido: 0,
                    totalPagar: 0, totalPagarAberto: 0,
                    countReceber: 0, countPagar: 0,
                    receivables: [], payables: [],
                };
                map.set(key, found);
            }

            const valor = Number(p.valor || 0);
            found.totalPagar += valor;
            found.countPagar++;
            found.payables.push(p);
            if (p.status === "aberto" || p.status === "parcial") {
                found.totalPagarAberto += valor - Number(p.valor_pago || 0);
            }
        });

        return map;
    }, [clients, receivables, payables]);

    const getClientFinancial = (client: any): FinancialSummary => {
        const doc = client.cpf_cnpj?.replace(/\D/g, "");
        const nameKey = normalizeSearch(client.razao_social);
        return financialByClient.get(doc || nameKey) || financialByClient.get(nameKey) || {
            totalReceber: 0, totalReceberAberto: 0, totalReceberVencido: 0,
            totalPagar: 0, totalPagarAberto: 0,
            countReceber: 0, countPagar: 0,
            receivables: [], payables: [],
        };
    };

    const totals = useMemo(() => {
        let totalReceberAberto = 0;
        let totalVencido = 0;
        let clientesInadimplentes = 0;

        clients?.forEach((c: any) => {
            const fin = getClientFinancial(c);
            totalReceberAberto += fin.totalReceberAberto;
            totalVencido += fin.totalReceberVencido;
            if (fin.totalReceberVencido > 0) clientesInadimplentes++;
        });

        return { totalReceberAberto, totalVencido, clientesInadimplentes };
    }, [clients, financialByClient]);

    useEffect(() => {
        if (searchParams.get("new") === "true") {
            handleNew();
            const newParams = new URLSearchParams(searchParams);
            newParams.delete("new");
            setSearchParams(newParams);
        }
    }, [searchParams, setSearchParams]);

    const handleEdit = (client: any) => { setEditingClient(client); setIsSheetOpen(true); };
    const handleNew = () => { setEditingClient(null); setIsSheetOpen(true); };

    const handleDelete = async (client: any) => {
        const ok = window.confirm(`Excluir o cliente "${client.razao_social}"?`);
        if (!ok) return;
        const { error } = await activeClient.from("clients").delete().eq("id", client.id);
        if (!error) {
            refetch();
            toast({ title: "Sucesso", description: "Cliente excluído" });
            if (user?.id) {
                await logDeletion(activeClient, {
                    userId: user.id, companyId: selectedCompany?.id || null,
                    entity: "clients", entityId: client.id,
                    payload: { razao_social: client.razao_social },
                });
            }
        } else {
            toast({ title: "Erro", description: "Erro ao excluir", variant: "destructive" });
        }
    };

    const getInitials = (name: string) =>
        name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

    const filteredClients = clients?.filter((client) => {
        const needle = normalizeSearch(searchTerm);
        if (!needle) return true;
        const doc = client.cpf_cnpj || "";
        const maskedDoc = doc ? (doc.length > 11 ? maskCNPJ(doc) : maskCPF(doc)) : "";
        return normalizeSearch(
            [client.razao_social, client.nome_fantasia, doc, maskedDoc, client.email,
             client.telefone, client.celular, client.category?.name].filter(Boolean).join(" ")
        ).includes(needle);
    });

    const statusBadge = (status: string) => {
        const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
            aberto: { label: "Aberto", variant: "outline" },
            pago: { label: "Pago", variant: "default" },
            vencido: { label: "Vencido", variant: "destructive" },
            parcial: { label: "Parcial", variant: "secondary" },
            cancelado: { label: "Cancelado", variant: "secondary" },
        };
        const info = map[status] || { label: status, variant: "outline" as const };
        return <Badge variant={info.variant} className="text-[10px]">{info.label}</Badge>;
    };

    const detailFinancial = detailClient ? getClientFinancial(detailClient) : null;

    return (
        <AppLayout title="Clientes">
            <div className="space-y-6 animate-in fade-in duration-500">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h2 className="text-lg font-bold tracking-tight text-foreground">Clientes</h2>
                        <p className="text-[12.5px] text-muted-foreground mt-0.5">
                            Base de clientes com resumo financeiro de contas a pagar e receber.
                        </p>
                    </div>
                    <Button onClick={handleNew}>
                        <Plus className="h-3.5 w-3.5" />
                        Novo Cliente
                    </Button>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card className="border-l-4 border-l-blue-500">
                        <CardContent className="pt-4 pb-3 px-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Total Clientes</p>
                                    <p className="text-2xl font-bold text-foreground mt-1">{clients?.length || 0}</p>
                                </div>
                                <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center">
                                    <UsersIcon className="h-5 w-5 text-blue-500" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="border-l-4 border-l-emerald-500">
                        <CardContent className="pt-4 pb-3 px-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">A Receber (Aberto)</p>
                                    <p className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(totals.totalReceberAberto)}</p>
                                </div>
                                <div className="h-10 w-10 rounded-full bg-emerald-50 flex items-center justify-center">
                                    <ArrowUpCircle className="h-5 w-5 text-emerald-500" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="border-l-4 border-l-red-500">
                        <CardContent className="pt-4 pb-3 px-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Vencido</p>
                                    <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(totals.totalVencido)}</p>
                                </div>
                                <div className="h-10 w-10 rounded-full bg-red-50 flex items-center justify-center">
                                    <AlertTriangle className="h-5 w-5 text-red-500" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="border-l-4 border-l-amber-500">
                        <CardContent className="pt-4 pb-3 px-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Inadimplentes</p>
                                    <p className="text-2xl font-bold text-amber-600 mt-1">{totals.clientesInadimplentes}</p>
                                </div>
                                <div className="h-10 w-10 rounded-full bg-amber-50 flex items-center justify-center">
                                    <Bell className="h-5 w-5 text-amber-500" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Table */}
                <Card>
                    <CardHeader className="flex flex-col sm:flex-row items-center justify-between space-y-4 sm:space-y-0 border-b border-[#F1F5F9]">
                        <div className="text-[12.5px] font-medium text-muted-foreground">
                            Total de {filteredClients?.length || 0} clientes
                        </div>
                        <div className="relative w-full sm:w-72">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                            <Input placeholder="Buscar clientes..." className="pl-8 h-8 text-[12.5px]"
                                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="w-[50px]"></TableHead>
                                    <TableHead>Razão Social / Nome</TableHead>
                                    <TableHead>CPF/CNPJ</TableHead>
                                    <TableHead>Contato</TableHead>
                                    <TableHead className="text-right">A Receber</TableHead>
                                    <TableHead className="text-right">A Pagar</TableHead>
                                    <TableHead className="text-center">Status</TableHead>
                                    <TableHead className="w-[60px] text-right"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {!selectedCompany?.id ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                                            Selecione uma empresa para visualizar os clientes.
                                        </TableCell>
                                    </TableRow>
                                ) : isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="h-24 text-center">
                                            <div className="flex items-center justify-center text-muted-foreground">
                                                <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent mr-2" />
                                                Carregando...
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : filteredClients?.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                                            Nenhum cliente encontrado.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredClients?.map((client) => {
                                        const fin = getClientFinancial(client);
                                        const hasOverdue = fin.totalReceberVencido > 0;
                                        return (
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
                                                        : "-"}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col text-[12.5px] text-foreground">
                                                        <span>{client.email || "-"}</span>
                                                        <span className="text-[11px] text-muted-foreground">
                                                            {client.celular ? maskPhone(client.celular) : (client.telefone ? maskPhone(client.telefone) : "")}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {fin.totalReceberAberto > 0 ? (
                                                        <span className="text-[12px] font-medium text-emerald-600">
                                                            {formatCurrency(fin.totalReceberAberto)}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[11px] text-muted-foreground">-</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {fin.totalPagarAberto > 0 ? (
                                                        <span className="text-[12px] font-medium text-orange-600">
                                                            {formatCurrency(fin.totalPagarAberto)}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[11px] text-muted-foreground">-</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    {hasOverdue ? (
                                                        <Badge variant="destructive" className="text-[10px]">
                                                            <AlertTriangle className="h-3 w-3 mr-1" />
                                                            Inadimplente
                                                        </Badge>
                                                    ) : fin.totalReceberAberto > 0 ? (
                                                        <Badge variant="outline" className="text-[10px] border-emerald-200 text-emerald-700">
                                                            Em dia
                                                        </Badge>
                                                    ) : (
                                                        <span className="text-[11px] text-muted-foreground">-</span>
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
                                                            <DropdownMenuItem onClick={() => setDetailClient(client)}>
                                                                <Eye className="mr-2 h-4 w-4 text-muted-foreground" />
                                                                Ver Financeiro
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => handleEdit(client)}>
                                                                <Pencil className="mr-2 h-4 w-4 text-muted-foreground" />
                                                                Editar
                                                            </DropdownMenuItem>
                                                            {hasOverdue && (
                                                                <DropdownMenuItem onClick={() => navigate("/regua-cobranca")}>
                                                                    <Bell className="mr-2 h-4 w-4 text-amber-500" />
                                                                    Régua de Cobrança
                                                                </DropdownMenuItem>
                                                            )}
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem onClick={() => handleDelete(client)} className="text-[#EF4444]">
                                                                <Trash2 className="mr-2 h-4 w-4" />
                                                                Excluir
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {/* Detail Dialog */}
                <Dialog open={!!detailClient} onOpenChange={(open) => !open && setDetailClient(null)}>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Avatar className="h-8 w-8 border border-[#E2E8F0]">
                                    <AvatarFallback className="bg-[#EFF6FF] text-[#2563EB] text-[11px] font-semibold">
                                        {detailClient ? getInitials(detailClient.razao_social) : ""}
                                    </AvatarFallback>
                                </Avatar>
                                {detailClient?.razao_social}
                            </DialogTitle>
                        </DialogHeader>

                        {detailFinancial && (
                            <div className="space-y-6 mt-2">
                                {/* Summary cards */}
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="rounded-lg border p-3 text-center">
                                        <p className="text-[10px] text-muted-foreground uppercase">A Receber</p>
                                        <p className="text-lg font-bold text-emerald-600">{formatCurrency(detailFinancial.totalReceberAberto)}</p>
                                        <p className="text-[10px] text-muted-foreground">{detailFinancial.countReceber} títulos</p>
                                    </div>
                                    <div className="rounded-lg border p-3 text-center">
                                        <p className="text-[10px] text-muted-foreground uppercase">Vencido</p>
                                        <p className="text-lg font-bold text-red-600">{formatCurrency(detailFinancial.totalReceberVencido)}</p>
                                    </div>
                                    <div className="rounded-lg border p-3 text-center">
                                        <p className="text-[10px] text-muted-foreground uppercase">A Pagar</p>
                                        <p className="text-lg font-bold text-orange-600">{formatCurrency(detailFinancial.totalPagarAberto)}</p>
                                        <p className="text-[10px] text-muted-foreground">{detailFinancial.countPagar} títulos</p>
                                    </div>
                                </div>

                                {/* Receivables */}
                                {detailFinancial.receivables.length > 0 && (
                                    <div>
                                        <h4 className="text-[12px] font-semibold text-foreground mb-2 flex items-center gap-1.5">
                                            <ArrowUpCircle className="h-3.5 w-3.5 text-emerald-500" />
                                            Contas a Receber ({detailFinancial.receivables.length})
                                        </h4>
                                        <div className="border rounded-lg overflow-hidden">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow className="hover:bg-transparent">
                                                        <TableHead className="text-[11px]">Vencimento</TableHead>
                                                        <TableHead className="text-[11px] text-right">Valor</TableHead>
                                                        <TableHead className="text-[11px] text-right">Pago</TableHead>
                                                        <TableHead className="text-[11px] text-center">Status</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {detailFinancial.receivables.map((r: any) => (
                                                        <TableRow key={r.id}>
                                                            <TableCell className="text-[11.5px]">
                                                                {r.data_vencimento ? new Date(r.data_vencimento + "T12:00:00").toLocaleDateString("pt-BR") : "-"}
                                                            </TableCell>
                                                            <TableCell className="text-[11.5px] text-right font-medium">
                                                                {formatCurrency(Number(r.valor || 0))}
                                                            </TableCell>
                                                            <TableCell className="text-[11.5px] text-right">
                                                                {formatCurrency(Number(r.valor_pago || 0))}
                                                            </TableCell>
                                                            <TableCell className="text-center">{statusBadge(r.status)}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </div>
                                )}

                                {/* Payables */}
                                {detailFinancial.payables.length > 0 && (
                                    <div>
                                        <h4 className="text-[12px] font-semibold text-foreground mb-2 flex items-center gap-1.5">
                                            <ArrowDownCircle className="h-3.5 w-3.5 text-orange-500" />
                                            Contas a Pagar ({detailFinancial.payables.length})
                                        </h4>
                                        <div className="border rounded-lg overflow-hidden">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow className="hover:bg-transparent">
                                                        <TableHead className="text-[11px]">Vencimento</TableHead>
                                                        <TableHead className="text-[11px] text-right">Valor</TableHead>
                                                        <TableHead className="text-[11px] text-right">Pago</TableHead>
                                                        <TableHead className="text-[11px] text-center">Status</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {detailFinancial.payables.map((p: any) => (
                                                        <TableRow key={p.id}>
                                                            <TableCell className="text-[11.5px]">
                                                                {p.data_vencimento ? new Date(p.data_vencimento + "T12:00:00").toLocaleDateString("pt-BR") : "-"}
                                                            </TableCell>
                                                            <TableCell className="text-[11.5px] text-right font-medium">
                                                                {formatCurrency(Number(p.valor || 0))}
                                                            </TableCell>
                                                            <TableCell className="text-[11.5px] text-right">
                                                                {formatCurrency(Number(p.valor_pago || 0))}
                                                            </TableCell>
                                                            <TableCell className="text-center">{statusBadge(p.status)}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </div>
                                )}

                                {/* Régua action */}
                                {detailFinancial.totalReceberVencido > 0 && (
                                    <Button
                                        variant="outline"
                                        className="w-full border-amber-200 text-amber-700 hover:bg-amber-50"
                                        onClick={() => { setDetailClient(null); navigate("/regua-cobranca"); }}
                                    >
                                        <Bell className="h-4 w-4 mr-2" />
                                        Configurar Régua de Cobrança
                                    </Button>
                                )}
                            </div>
                        )}
                    </DialogContent>
                </Dialog>

                <ClientSheet
                    isOpen={isSheetOpen}
                    onClose={() => { setIsSheetOpen(false); setEditingClient(null); }}
                    clientToEdit={editingClient}
                />
            </div>
        </AppLayout>
    );
}
