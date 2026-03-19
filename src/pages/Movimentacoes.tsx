import { useState, useMemo } from "react";
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
import { Search, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { format, startOfMonth, endOfMonth, parseISO, eachDayOfInterval, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";

interface MovementRow {
    id: string;
    date: string;
    description: string;
    category: string;
    account: string;
    amount: number;
    type: "credit" | "debit";
    source: string;
}

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
            const { data } = await (activeClient as any)
                .from("bank_accounts")
                .select("id, name")
                .eq("company_id", selectedCompany!.id);
            return data || [];
        },
        enabled: !!selectedCompany?.id
    });

    // Fetch all chart_of_accounts for category name resolution
    const { data: chartAccounts } = useQuery({
        queryKey: ["chart_of_accounts_map", selectedCompany?.id],
        queryFn: async () => {
            const { data } = await (activeClient as any)
                .from("chart_of_accounts")
                .select("id, code, name")
                .eq("company_id", selectedCompany!.id);
            return data || [];
        },
        enabled: !!selectedCompany?.id
    });

    // chart_of_accounts already loaded above — no separate categories query needed
    const categories: any[] = [];

    // Fetch movimentacoes (new table)
    const { data: rawMovimentacoes, isLoading: loadingMov } = useQuery({
        queryKey: ["movimentacoes", selectedCompany?.id, dateRange, isUsingSecondary],
        queryFn: async () => {
            const { data, error } = await (activeClient as any)
                .from("movimentacoes")
                .select("*")
                .eq("company_id", selectedCompany!.id)
                .gte("data", dateRange.start)
                .lte("data", dateRange.end)
                .order("data", { ascending: false });
            if (error) {
                console.error("movimentacoes query error:", error);
                return [];
            }
            return data || [];
        },
        enabled: !!selectedCompany?.id
    });

    // Fetch contas_pagar (paid = real movements) as fallback
    const { data: rawPayables, isLoading: loadingPay } = useQuery({
        queryKey: ["cp_movements", selectedCompany?.id, dateRange, isUsingSecondary],
        queryFn: async () => {
            const { data, error } = await (activeClient as any)
                .from("contas_pagar")
                .select("*")
                .eq("company_id", selectedCompany!.id)
                .eq("status", "pago")
                .gte("data_pagamento", dateRange.start)
                .lte("data_pagamento", dateRange.end)
                .order("data_pagamento", { ascending: false });
            if (error) {
                console.error("contas_pagar query error:", error);
                return [];
            }
            return data || [];
        },
        enabled: !!selectedCompany?.id
    });

    // Fetch contas_receber (paid = real movements) as fallback
    const { data: rawReceivables, isLoading: loadingRec } = useQuery({
        queryKey: ["cr_movements", selectedCompany?.id, dateRange, isUsingSecondary],
        queryFn: async () => {
            const { data, error } = await (activeClient as any)
                .from("contas_receber")
                .select("*")
                .eq("company_id", selectedCompany!.id)
                .eq("status", "pago")
                .gte("data_pagamento", dateRange.start)
                .lte("data_pagamento", dateRange.end)
                .order("data_pagamento", { ascending: false });
            if (error) {
                console.error("contas_receber query error:", error);
                return [];
            }
            return data || [];
        },
        enabled: !!selectedCompany?.id
    });

    const isLoading = loadingMov || loadingPay || loadingRec;

    // Build lookup maps
    const accountMap = useMemo(() => {
        const map: Record<string, string> = {};
        accounts?.forEach((a: any) => { map[a.id] = a.name; });
        return map;
    }, [accounts]);

    const categoryMap = useMemo(() => {
        const map: Record<string, string> = {};
        chartAccounts?.forEach((c: any) => { map[c.id] = `${c.code} - ${c.name}`; });
        categories?.forEach((c: any) => { if (!map[c.id]) map[c.id] = c.name; });
        return map;
    }, [chartAccounts, categories]);

    // Merge all sources into unified MovementRow[]
    const allMovements: MovementRow[] = useMemo(() => {
        const rows: MovementRow[] = [];
        const movIds = new Set<string>();

        // 1) Movimentacoes table (new)
        (rawMovimentacoes || []).forEach((m: any) => {
            movIds.add(m.id);
            rows.push({
                id: m.id,
                date: m.data,
                description: m.descricao || "",
                category: categoryMap[m.conta_contabil_id] || "",
                account: accountMap[m.conta_bancaria_id] || "",
                amount: Number(m.valor || 0),
                type: m.tipo === "credito" ? "credit" : "debit",
                source: "transaction",
            });
        });

        // 2) Contas Pagar (pagas) — fallback se não tem movimentação vinculada
        (rawPayables || []).forEach((p: any) => {
            if (p.id && movIds.has(p.id)) return;
            rows.push({
                id: `pay-${p.id}`,
                date: p.data_pagamento || p.data_vencimento,
                description: p.observacoes || p.credor_nome || "",
                category: categoryMap[p.conta_contabil_id] || "",
                account: accountMap[p.conta_bancaria_id] || "",
                amount: Number(p.valor || 0),
                type: "debit",
                source: "payable",
            });
        });

        // 3) Contas Receber (pagas) — fallback se não tem movimentação vinculada
        (rawReceivables || []).forEach((r: any) => {
            if (r.id && movIds.has(r.id)) return;
            rows.push({
                id: `rec-${r.id}`,
                date: r.data_pagamento || r.data_vencimento,
                description: r.observacoes || r.pagador_nome || "",
                category: categoryMap[r.conta_contabil_id] || "",
                account: "",
                amount: Number(r.valor || 0),
                type: "credit",
                source: "receivable",
            });
        });

        // Sort by date desc
        rows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        return rows;
    }, [rawMovimentacoes, rawPayables, rawReceivables, categoryMap, accountMap]);

    // Filter by account
    const accountFiltered = selectedAccount === "all"
        ? allMovements
        : allMovements.filter(m => {
            const accName = m.account;
            return accounts?.some((a: any) => a.id === selectedAccount && a.name === accName);
        });

    // Filter by search
    const filteredMovements = accountFiltered.filter((m) => {
        const needle = normalizeSearch(searchTerm);
        if (!needle) return true;
        const formattedDate = m.date ? format(parseISO(m.date), "dd/MM/yyyy") : "";
        const formattedAmount = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(m.amount);
        const typeLabel = m.type === "credit" ? "entrada" : "saida";
        return normalizeSearch(
            [formattedDate, m.description, m.category, m.account, typeLabel, formattedAmount].join(" ")
        ).includes(needle);
    });

    const totalIn = filteredMovements
        .filter(m => m.type === "credit")
        .reduce((acc, m) => acc + m.amount, 0);

    const totalOut = filteredMovements
        .filter(m => m.type === "debit")
        .reduce((acc, m) => acc + m.amount, 0);

    const balance = totalIn - totalOut;

    // Chart data — group by week
    const chartData = useMemo(() => {
        if (!dateRange.start || !dateRange.end) return [];
        const start = parseISO(dateRange.start);
        const end = parseISO(dateRange.end);
        const days = eachDayOfInterval({ start, end });

        // Group into ~weekly buckets (every 7 days)
        const buckets: { label: string; entradas: number; saidas: number }[] = [];
        let bucketStart = 0;
        const BUCKET_SIZE = days.length <= 14 ? 1 : days.length <= 35 ? 7 : 15;

        for (let i = 0; i < days.length; i += BUCKET_SIZE) {
            const bucketDays = days.slice(i, i + BUCKET_SIZE);
            const label = BUCKET_SIZE === 1
                ? format(bucketDays[0], "dd/MM", { locale: ptBR })
                : `${format(bucketDays[0], "dd/MM")} - ${format(bucketDays[bucketDays.length - 1], "dd/MM")}`;

            let entradas = 0;
            let saidas = 0;

            filteredMovements.forEach(m => {
                if (!m.date) return;
                const mDate = parseISO(m.date);
                if (bucketDays.some(d => isSameDay(d, mDate))) {
                    if (m.type === "credit") entradas += m.amount;
                    else saidas += m.amount;
                }
            });

            buckets.push({ label, entradas, saidas });
        }

        return buckets;
    }, [dateRange, filteredMovements]);

    const formatBRL = (value: number) =>
        new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

    const handleSearch = () => {
        // Search is reactive, but this provides a visual "click to search" action
        // The actual filtering happens automatically via searchTerm state
    };

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

                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                        <CardHeader className="py-4">
                            <CardTitle className="text-sm font-medium text-gray-500">Entradas</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-600 flex items-center gap-2">
                                <ArrowUpCircle className="h-6 w-6" />
                                {formatBRL(totalIn)}
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
                                {formatBRL(totalOut)}
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
                                {formatBRL(Math.abs(balance))}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Chart */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500">Entradas vs Saídas</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {chartData.length > 0 && (filteredMovements.length > 0) ? (
                            <ResponsiveContainer width="100%" height={260}>
                                <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                                    <YAxis
                                        tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
                                        tick={{ fontSize: 11 }}
                                        width={60}
                                    />
                                    <Tooltip
                                        formatter={(value: number) => formatBRL(value)}
                                        labelStyle={{ fontWeight: "bold" }}
                                    />
                                    <Legend />
                                    <Bar dataKey="entradas" name="Entradas" fill="#22c55e" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="saidas" name="Saídas" fill="#ef4444" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="text-center py-8 text-muted-foreground text-sm">
                                {isLoading ? "Carregando gráfico..." : "Nenhuma movimentação para exibir no gráfico."}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Table */}
                <Card>
                    <CardHeader className="flex flex-col md:flex-row items-center justify-between space-y-2 md:space-y-0 pb-4">
                        <div className="flex items-center gap-4 w-full md:w-auto">
                            <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                                <SelectTrigger className="w-[200px]">
                                    <SelectValue placeholder="Todas as Contas" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todas as Contas</SelectItem>
                                    {accounts?.map((acc: any) => (
                                        <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-center gap-2 w-full md:w-auto">
                            <div className="relative flex-1 md:w-72">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar lançamentos..."
                                    className="pl-8"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                                />
                            </div>
                            <Button onClick={handleSearch} size="sm" className="gap-1">
                                <Search className="w-4 h-4" />
                                Pesquisar
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xs text-muted-foreground mb-2">
                            {filteredMovements.length} movimentação{filteredMovements.length !== 1 ? "ões" : ""} encontrada{filteredMovements.length !== 1 ? "s" : ""}
                        </div>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Data</TableHead>
                                    <TableHead>Descrição</TableHead>
                                    <TableHead>Categoria</TableHead>
                                    <TableHead>Conta</TableHead>
                                    <TableHead>Origem</TableHead>
                                    <TableHead className="text-right">Valor</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                            Carregando movimentações...
                                        </TableCell>
                                    </TableRow>
                                ) : filteredMovements.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                            Nenhuma movimentação no período.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredMovements.map((m) => (
                                        <TableRow key={m.id}>
                                            <TableCell className="font-medium whitespace-nowrap">
                                                {m.date ? format(parseISO(m.date), "dd/MM/yyyy") : "-"}
                                            </TableCell>
                                            <TableCell>{m.description || "-"}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="font-normal text-gray-600">
                                                    {m.category || "Sem Categoria"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground text-sm">
                                                {m.account || "-"}
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant="secondary"
                                                    className={`text-xs ${
                                                        m.source === "payable" ? "bg-orange-50 text-orange-600" :
                                                        m.source === "receivable" ? "bg-green-50 text-green-600" :
                                                        "bg-blue-50 text-blue-600"
                                                    }`}
                                                >
                                                    {m.source === "payable" ? "Conta a Pagar" :
                                                     m.source === "receivable" ? "Conta a Receber" :
                                                     "Transação"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className={`text-right font-bold whitespace-nowrap ${m.type === "credit" ? "text-green-600" : "text-[#EF4444]"}`}>
                                                {m.type === "debit" ? "- " : "+ "}
                                                {formatBRL(m.amount)}
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
