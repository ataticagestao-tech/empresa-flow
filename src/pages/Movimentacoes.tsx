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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ArrowUpCircle, ArrowDownCircle, Filter, Calendar as CalendarIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Transaction } from "@/types/finance";

export default function Movimentacoes() {
    const { selectedCompany } = useCompany();
    const { activeClient, isUsingSecondary } = useAuth();
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedAccount, setSelectedAccount] = useState<string>("all");
    const [dateRange, setDateRange] = useState({
        start: format(startOfMonth(new Date()), "yyyy-MM-dd"),
        end: format(endOfMonth(new Date()), "yyyy-MM-dd")
    });

    const normalizeSearch = (value: unknown) =>
        String(value ?? "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim();

    // Fetch Bank Accounts for filter
    const { data: accounts } = useQuery({
        queryKey: ["bank_accounts", selectedCompany?.id, isUsingSecondary],
        queryFn: async () => {
            const { data } = await activeClient
                .from("bank_accounts")
                .select("id, name")
                .eq("company_id", selectedCompany!.id);
            return data || [];
        },
        enabled: !!selectedCompany?.id
    });

    // Fetch Transactions
    const { data: transactions, isLoading } = useQuery({
        queryKey: ["transactions", selectedCompany?.id, selectedAccount, dateRange, isUsingSecondary],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];

            let query = (activeClient as any)
                .from("transactions")
                .select(`
            *,
            bank_account:bank_accounts(name),
            category:categories(name)
        `)
                .eq("company_id", selectedCompany.id)
                .gte("date", dateRange.start)
                .lte("date", dateRange.end)
                .order("date", { ascending: false })
                .order("created_at", { ascending: false });

            if (selectedAccount !== "all") {
                query = query.eq("bank_account_id", selectedAccount);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data as unknown as Transaction[];
        },
        enabled: !!selectedCompany?.id,
    });

    const filteredTransactions = transactions?.filter((t) => {
        const needle = normalizeSearch(searchTerm);
        if (!needle) return true;
        const formattedDate = t.date ? format(new Date(t.date), "dd/MM/yyyy") : "";
        const amountValue = Number(t.amount || 0);
        const formattedAmount = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amountValue);
        const numberAmount = new Intl.NumberFormat("pt-BR").format(amountValue);
        const amountRaw = String(amountValue);
        const amountComma = amountRaw.replace(".", ",");
        const typeLabel = t.type === "credit" ? "Entrada" : t.type === "debit" ? "Saída" : t.type;
        return normalizeSearch(
            [
                formattedDate,
                t.description,
                t.category?.name,
                t.bank_account?.name,
                t.type,
                typeLabel,
                amountValue,
                formattedAmount,
                numberAmount,
                amountRaw,
                amountComma,
            ]
                .filter(Boolean)
                .join(" "),
        ).includes(needle);
    });

    const totalIn = filteredTransactions
        ?.filter(t => t.type === 'credit')
        .reduce((acc, curr) => acc + Number(curr.amount), 0) || 0;

    const totalOut = filteredTransactions
        ?.filter(t => t.type === 'debit')
        .reduce((acc, curr) => acc + Number(curr.amount), 0) || 0;

    const balance = totalIn - totalOut;

    return (
        <AppLayout title="Movimentações">
            <div className="space-y-6 animate-fade-in">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <h2 className="text-lg font-bold tracking-tight text-gray-800">
                        Extrato de Movimentações
                    </h2>
                    <div className="flex flex-wrap gap-2 items-center">
                        <div className="flex items-center gap-2 bg-white p-2 rounded-md border shadow-sm">
                            <span className="text-sm text-gray-500">Período:</span>
                            <Input
                                type="date"
                                value={dateRange.start}
                                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                className="h-8 w-36"
                            />
                            <span className="text-gray-400">a</span>
                            <Input
                                type="date"
                                value={dateRange.end}
                                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                className="h-8 w-36"
                            />
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                        <CardHeader className="py-4">
                            <CardTitle className="text-sm font-medium text-gray-500">Entradas</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-600 flex items-center gap-2">
                                <ArrowUpCircle className="h-6 w-6" />
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalIn)}
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="py-4">
                            <CardTitle className="text-sm font-medium text-gray-500">Saídas</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-[#EF4444] flex items-center gap-2">
                                <ArrowDownCircle className="h-6 w-6" />
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalOut)}
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="py-4">
                            <CardTitle className="text-sm font-medium text-gray-500">Saldo do Período</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className={`text-2xl font-bold flex items-center gap-2 ${balance >= 0 ? 'text-blue-600' : 'text-[#EF4444]'}`}>
                                {balance >= 0 ? <ArrowUpCircle className="h-6 w-6" /> : <ArrowDownCircle className="h-6 w-6" />}
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.abs(balance))}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader className="flex flex-col md:flex-row items-center justify-between space-y-2 md:space-y-0 pb-4">
                        <div className="flex items-center gap-4 w-full md:w-auto">
                            <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                                <SelectTrigger className="w-[200px]">
                                    <SelectValue placeholder="Todas as Contas" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todas as Contas</SelectItem>
                                    {accounts?.map(acc => (
                                        <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="relative w-full md:w-72">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar lançamentos..."
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
                                    <TableHead>Data</TableHead>
                                    <TableHead>Descrição</TableHead>
                                    <TableHead>Categoria</TableHead>
                                    <TableHead>Conta</TableHead>
                                    <TableHead className="text-right">Valor</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                            Carregando movimentações...
                                        </TableCell>
                                    </TableRow>
                                ) : filteredTransactions?.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                            Nenhuma movimentação no período.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredTransactions?.map((t) => (
                                        <TableRow key={t.id}>
                                            <TableCell className="font-medium">
                                                {format(new Date(t.date), "dd/MM/yyyy")}
                                            </TableCell>
                                            <TableCell>{t.description}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="font-normal text-gray-600">
                                                    {t.category?.name || "Sem Categoria"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground text-sm">
                                                {t.bank_account?.name}
                                            </TableCell>
                                            <TableCell className={`text-right font-bold ${t.type === 'credit' ? 'text-green-600' : 'text-[#EF4444]'}`}>
                                                {t.type === 'debit' ? '- ' : '+ '}
                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(t.amount))}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
