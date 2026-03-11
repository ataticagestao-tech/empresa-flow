import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Plus, Search, Pencil, Trash2, DollarSign, MoreHorizontal } from "lucide-react";
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
import { AccountsReceivableSheet } from "@/components/finance/AccountsReceivableSheet";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { format, isBefore, isToday, parseISO, startOfDay } from "date-fns";
import { AccountsReceivable } from "@/types/finance";
import { Badge } from "@/components/ui/badge";
import { logDeletion } from "@/lib/audit";

import { PaymentModal } from "@/components/transactions/PaymentModal";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export default function ContasReceber() {
    const { selectedCompany } = useCompany();
    const { activeClient, isUsingSecondary, user } = useAuth();
    const queryClient = useQueryClient();
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<AccountsReceivable | undefined>(undefined);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [paymentItem, setPaymentItem] = useState<AccountsReceivable | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("all");

    const normalizeSearch = (value: unknown) =>
        String(value ?? "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim();

    const { data: bills, isLoading, refetch } = useQuery({
        queryKey: ["accounts_receivable", selectedCompany?.id, isUsingSecondary],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data, error } = await activeClient
                .from("accounts_receivable")
                .select(`
            *,
            client:clients(razao_social, nome_fantasia),
            category:categories(name)
        `)
                .eq("company_id", selectedCompany.id)
                .order("due_date", { ascending: true }).range(0, 9999);

            if (error) throw error;
            return data as unknown as AccountsReceivable[];
        },
        enabled: !!selectedCompany?.id,
    });

    const handleEdit = (item: AccountsReceivable) => {
        setEditingItem(item);
        setIsSheetOpen(true);
    };

    const handleNew = () => {
        setEditingItem(undefined);
        setIsSheetOpen(true);
    };

    const filteredBills = bills?.filter(bill => {
        const needle = normalizeSearch(searchTerm);
        const formattedDueDate = bill.due_date ? format(new Date(bill.due_date), "dd/MM/yyyy") : "";
        const formattedAmount = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(bill.amount);
        const matchesSearch = !needle
            ? true
            : normalizeSearch(
                [
                    formattedDueDate,
                    bill.description,
                    bill.client?.razao_social,
                    bill.client?.nome_fantasia,
                    bill.amount,
                    formattedAmount,
                    bill.category?.name,
                    bill.status,
                ]
                    .filter(Boolean)
                    .join(" "),
            ).includes(needle);

        const matchesStatus = statusFilter === 'all' || bill.status === statusFilter;

        return matchesSearch && matchesStatus;
    });

    const getStatusBadge = (status: string, dueDate: string) => {
        const today = new Date();
        const due = new Date(dueDate);
        const isOverdue = isBefore(due, today) && !isToday(due) && status === 'pending';

        if (status === 'paid') return <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 border-0">Recebido</Badge>;
        if (status === 'cancelled') return <Badge variant="secondary" className="bg-[#F1F5F9] text-muted-foreground">Cancelado</Badge>;
        if (isOverdue) return <Badge variant="destructive" className="bg-red-500/15 text-red-700 hover:bg-red-500/25 border-0">Atrasado</Badge>;
        if (isToday(due)) return <Badge className="bg-orange-500/15 text-orange-700 hover:bg-orange-500/25 border-0">Vence Hoje</Badge>;

        return <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50">A Receber</Badge>;
    };

    const handleDelete = async (bill: AccountsReceivable) => {
        const ok = window.confirm(`Excluir o recebimento "${bill.description}"?`);
        if (!ok) return;
        const { error } = await activeClient.from("accounts_receivable").delete().eq("id", bill.id);
        if (!error) {
            refetch();
            if (user?.id) {
                await logDeletion(activeClient, {
                    userId: user.id,
                    companyId: selectedCompany?.id || null,
                    entity: "accounts_receivable",
                    entityId: bill.id,
                    payload: { description: bill.description, amount: bill.amount },
                });
            }
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

    return (
        <AppLayout title="Contas a Receber">
            <div className="space-y-6 animate-in fade-in duration-500">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h2 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
                            Contas a Receber
                        </h2>
                        <p className="text-muted-foreground mt-1">Gerencie seus recebimentos e faturamento.</p>
                    </div>
                    <Button onClick={handleNew} className="bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-all">
                        <Plus className="mr-2 h-4 w-4" />
                        Novo Recebimento
                    </Button>
                </div>

                <div className="grid gap-6 md:grid-cols-3">
                    <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white overflow-hidden relative">
                        <div className="absolute right-0 top-0 h-full w-32 bg-white/10 skew-x-12 translate-x-16"></div>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg font-medium text-blue-100">Total a Receber</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold tracking-tight">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                                    bills?.filter(b => b.status === 'pending').reduce((acc, curr) => acc + Number(curr.amount), 0) || 0
                                )}
                            </div>
                            <p className="text-xs text-blue-100 mt-1">
                                {bills?.filter(b => b.status === 'pending').length || 0} recebimentos pendentes
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="border-0 shadow-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white overflow-hidden relative">
                        <div className="absolute right-0 top-0 h-full w-32 bg-white/10 skew-x-12 translate-x-16"></div>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg font-medium text-emerald-100">Total Recebido</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold tracking-tight">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                                    bills?.filter(b => b.status === 'paid').reduce((acc, curr) => acc + Number(curr.amount), 0) || 0
                                )}
                            </div>
                            <p className="text-xs text-emerald-100 mt-1">
                                {bills?.filter(b => b.status === 'paid').length || 0} recebimentos confirmados
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="border-0 shadow-lg bg-gradient-to-br from-orange-500 to-amber-600 text-white overflow-hidden relative">
                        <div className="absolute right-0 top-0 h-full w-32 bg-white/10 skew-x-12 translate-x-16"></div>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg font-medium text-orange-100">Total Vencido</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold tracking-tight">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                                    bills?.filter(b => {
                                        if (b.status !== 'pending' || !b.due_date) return false;
                                        const due = startOfDay(parseISO(b.due_date));
                                        const today = startOfDay(new Date());
                                        return isBefore(due, today);
                                    }).reduce((acc, curr) => acc + Number(curr.amount), 0) || 0
                                )}
                            </div>
                            <p className="text-xs text-orange-100 mt-1">
                                {bills?.filter(b => {
                                    if (b.status !== 'pending') return false;
                                    const due = new Date(b.due_date);
                                    const today = new Date();
                                    return isBefore(due, today) && !isToday(due);
                                }).length || 0} cobranças atrasadas
                            </p>
                        </CardContent>
                    </Card>
                </div>

                <Card className="border-0 shadow-lg ">
                    <CardHeader className="flex flex-col sm:flex-row items-center justify-between space-y-4 sm:space-y-0 pb-6 border-b border-[#F1F5F9]">
                        <div className="flex bg-[#F1F5F9]/50 p-1 rounded-lg">
                            {['all', 'pending', 'paid'].map((filter) => (
                                <Button
                                    key={filter}
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setStatusFilter(filter)}
                                    className={cn(
                                        "rounded-md px-4 py-1.5 text-sm font-medium transition-all",
                                        statusFilter === filter
                                            ? "bg-white text-foreground shadow-sm"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    {filter === 'all' && 'Todas'}
                                    {filter === 'pending' && 'A Receber'}
                                    {filter === 'paid' && 'Recebidas'}
                                </Button>
                            ))}
                        </div>
                        <div className="relative w-full sm:w-80">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar recebimentos..."
                                className="pl-9 border-[#E2E8F0] focus:border-slate-400 focus:ring-slate-400/20 bg-white"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="rounded-md border border-[#F1F5F9] overflow-hidden">
                            <Table>
                                <TableHeader className="bg-[#F8FAFC]">
                                    <TableRow className="hover:bg-transparent border-[#F1F5F9]">
                                        <TableHead className="w-[120px] font-semibold text-muted-foreground">Status</TableHead>
                                        <TableHead className="font-semibold text-muted-foreground">Descrição</TableHead>
                                        <TableHead className="font-semibold text-muted-foreground">Cliente</TableHead>
                                        <TableHead className="w-[120px] font-semibold text-muted-foreground cursor-help" title="Data de Vencimento">Vencimento</TableHead>
                                        <TableHead className="text-right font-semibold text-muted-foreground">Valor</TableHead>
                                        <TableHead className="w-[80px] text-right"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="h-24 text-center">
                                                <div className="flex items-center justify-center text-muted-foreground">
                                                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent mr-2"></div>
                                                    Carregando...
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : filteredBills?.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                                                Nenhum recebimento encontrado.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredBills?.map((bill) => (
                                            <TableRow
                                                key={bill.id}
                                                className="transition-colors border-[#F1F5F9] group"
                                            >
                                                <TableCell>
                                                    {getStatusBadge(bill.status, bill.due_date)}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="font-medium text-foreground">{bill.description}</div>
                                                    <div className="text-xs text-muted-foreground">{bill.category?.name}</div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <Avatar className="h-6 w-6">
                                                            <AvatarFallback className="text-[10px] bg-[#F1F5F9] text-muted-foreground">
                                                                {getInitials(bill.client?.razao_social || "?")}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <span className="text-sm text-muted-foreground truncate max-w-[150px]" title={bill.client?.razao_social}>
                                                            {bill.client?.nome_fantasia || bill.client?.razao_social || "-"}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="font-medium text-muted-foreground">
                                                    {format(new Date(bill.due_date), "dd/MM/yyyy")}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <span className={cn(
                                                        "font-bold",
                                                        bill.status === 'paid' ? "text-emerald-700" : "text-foreground"
                                                    )}>
                                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(bill.amount)}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <span className="sr-only">Abrir menu</span>
                                                                <MoreHorizontal className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-[160px]">
                                                            <DropdownMenuLabel>Ações</DropdownMenuLabel>
                                                            <DropdownMenuItem onClick={() => handleEdit(bill)}>
                                                                <Pencil className="mr-2 h-4 w-4 text-emerald-500" />
                                                                Editar
                                                            </DropdownMenuItem>
                                                            {bill.status === 'pending' && (
                                                                <DropdownMenuItem onClick={() => {
                                                                    setPaymentItem(bill);
                                                                    setIsPaymentModalOpen(true);
                                                                }}>
                                                                    <DollarSign className="mr-2 h-4 w-4 text-emerald-600" />
                                                                    Receber
                                                                </DropdownMenuItem>
                                                            )}
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem onClick={() => handleDelete(bill)} className="text-[#EF4444]">
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
                        </div>
                    </CardContent>
                </Card>

                <AccountsReceivableSheet
                    isOpen={isSheetOpen}
                    onClose={() => {
                        setIsSheetOpen(false);
                        setEditingItem(undefined);
                    }}
                    dataToEdit={editingItem}
                />

                {paymentItem && (
                    <PaymentModal
                        isOpen={isPaymentModalOpen}
                        onClose={() => {
                            setIsPaymentModalOpen(false);
                            setPaymentItem(null);
                        }}
                        accountingId={paymentItem.id}
                        type="receivable"
                        initialAmount={paymentItem.amount}
                        description={`Recebimento: ${paymentItem.description}`}
                        onSuccess={() => {
                            if (!selectedCompany?.id) return;
                            queryClient.invalidateQueries({ queryKey: ["accounts_receivable"] });
                            queryClient.invalidateQueries({ queryKey: ["transactions"] });
                            queryClient.invalidateQueries({ queryKey: ["bank_accounts"] });
                            setIsPaymentModalOpen(false);
                            setPaymentItem(null);
                        }}
                    />
                )}
            </div>
        </AppLayout>
    );
}
