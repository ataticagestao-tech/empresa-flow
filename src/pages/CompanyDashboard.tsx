
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { useCompanies } from "@/hooks/useCompanies";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowUpRight, ArrowDownRight, TrendingUp, DollarSign, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { addDays, endOfMonth, format, startOfMonth } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    AreaChart,
    Area,
    LineChart,
    Line,
    ReferenceLine
} from "recharts";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { useFinanceDashboard } from "@/modules/finance/presentation/hooks/useFinanceDashboard";

const DRE_PAGE_SIZE = 10;
type DreTabValue = "periodo" | "anual";

const DRE_MONTHS = [
    { key: "01", label: "JAN" },
    { key: "02", label: "FEV" },
    { key: "03", label: "MAR" },
    { key: "04", label: "ABR" },
    { key: "05", label: "MAI" },
    { key: "06", label: "JUN" },
    { key: "07", label: "JUL" },
    { key: "08", label: "AGO" },
    { key: "09", label: "SET" },
    { key: "10", label: "OUT" },
    { key: "11", label: "NOV" },
    { key: "12", label: "DEZ" },
] as const;

type DreCategory = {
    id: string;
    name: string;
    total: number;
};

type DrePeriodOption = {
    value: string;
    label: string;
};

type DreDetailedGroup = {
    name: string;
    total: number;
    order: number;
    categories: DreCategory[];
};

type DrePeriodRow =
    | {
        type: "group";
        key: string;
        name: string;
        total: number;
    }
    | {
        type: "category";
        key: string;
        name: string;
        total: number;
    };

type DreAnnualRow = {
    id: string;
    name: string;
    groupName: string;
    groupOrder: number;
    months: Record<string, number>;
    total: number;
};

function createEmptyDreMonths(): Record<string, number> {
    return DRE_MONTHS.reduce<Record<string, number>>((acc, month) => {
        acc[month.key] = 0;
        return acc;
    }, {});
}

export default function CompanyDashboard() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { user, activeClient, isUsingSecondary } = useAuth();
    const { companies } = useCompanies(user?.id);
    const { setSelectedCompany, selectedCompany } = useCompany();
    const now = useMemo(() => new Date(), []);
    const [drePeriodValue, setDrePeriodValue] = useState(format(now, "yyyy-MM"));
    const [drePeriodPage, setDrePeriodPage] = useState(1);
    const [dreAnnualPage, setDreAnnualPage] = useState(1);
    const [dreAnnualYear, setDreAnnualYear] = useState(format(now, "yyyy"));
    const [dreTab, setDreTab] = useState<DreTabValue>("periodo");
    const currencyFormatter = useMemo(
        () => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }),
        [],
    );
    const dashboardSurfaceCardClass =
        "border border-[#173B5B]/10 bg-[#123754] shadow-[0_20px_48px_rgba(18,55,84,0.18)] backdrop-blur-sm";
    const dashboardCardHeaderClass = "border-b border-white/10 bg-black/20";
    const dreTabsListClass = "grid h-auto w-full grid-cols-2 rounded-xl border border-white/10 bg-[#0F2E49] p-1";
    const dreTabsTriggerClass =
        "rounded-lg text-white/55 data-[state=active]:bg-[#123754] data-[state=active]:text-white data-[state=active]:shadow-none focus-visible:ring-white/20 focus-visible:ring-offset-[#123754]";
    const dreTableContainerClass = "rounded-none border-y border-white/10 bg-[#123754] ring-0 shadow-none";
    const dreTableHeaderClass = "bg-[#0F2E49] text-white/80 [&_tr]:border-white/10";
    const dreTableHeaderRowClass = "border-white/10 bg-transparent hover:bg-transparent odd:!bg-[#0F2E49] even:!bg-[#0F2E49]";
    const dreTableEmptyRowClass = "border-white/5 odd:!bg-[#123754] even:!bg-[#123754] hover:!bg-[#123754]";
    const dreTableGroupRowClass = "border-white/10 odd:!bg-[#173B5B] even:!bg-[#173B5B] hover:!bg-[#173B5B]";
    const dreTableItemRowClass = "border-white/5 odd:!bg-[#123754] even:!bg-[#163E60] hover:!bg-[#1B486E]";
    const dreTableTotalRowClass = "border-white/10 odd:!bg-[#1A476C] even:!bg-[#1A476C] hover:!bg-[#1A476C]";
    const chartGridStroke = "rgba(255,255,255,0.10)";
    const chartAxisStyle = { fill: "rgba(255,255,255,0.58)" };
    const chartTooltipStyle = {
        borderRadius: "12px",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 12px 30px rgba(15,23,42,0.28)",
        backgroundColor: "#0F2740",
        color: "#F8FAFC",
    };

    // Sincroniza empresa selecionada via URL
    useEffect(() => {
        if (id && companies) {
            const company = companies.find(c => c.id === id);
            if (company) {
                setSelectedCompany(company);
            }
        }
    }, [id, companies, setSelectedCompany]);

    const companyId = selectedCompany?.id || null;

    // Hook novo de Dashboard Financeiro
    const {
        accountsBalance,
        receivablesSummary,
        payablesSummary,
        cashFlowData,
        dreSummary
    } = useFinanceDashboard();

    const { data: drePeriodOptions = [] } = useQuery<DrePeriodOption[]>({
        queryKey: ["dashboard_dre_period_options", companyId, isUsingSecondary],
        queryFn: async () => {
            if (!companyId) return [];

            const { data, error } = await (activeClient as any)
                .from("transactions")
                .select("date")
                .eq("company_id", companyId)
                .order("date", { ascending: false });

            if (error) throw error;

            const uniquePeriods = new Set<string>();

            (data || []).forEach((transaction: any) => {
                const period = String(transaction?.date || "").slice(0, 7);
                if (/^\d{4}-\d{2}$/.test(period)) {
                    uniquePeriods.add(period);
                }
            });

            return Array.from(uniquePeriods).map((period) => {
                const [year, month] = period.split("-");
                const monthLabel = DRE_MONTHS.find((item) => item.key === month)?.label || month;
                return {
                    value: period,
                    label: `${monthLabel}/${year}`,
                };
            });
        },
        enabled: Boolean(companyId),
    });

    useEffect(() => {
        if (drePeriodOptions.length === 0) return;
        if (drePeriodOptions.some((item) => item.value === drePeriodValue)) return;
        setDrePeriodValue(drePeriodOptions[0].value);
    }, [drePeriodOptions, drePeriodValue]);

    const { data: dreDetailed = [], isLoading: isLoadingDreDetailed } = useQuery<DreDetailedGroup[]>({
        queryKey: ["dashboard_dre_detailed", companyId, drePeriodValue, isUsingSecondary],
        queryFn: async () => {
            if (!companyId) return [];
            if (!/^\d{4}-\d{2}$/.test(drePeriodValue)) return [];

            const [selectedYear, selectedMonth] = drePeriodValue.split("-");
            if (!selectedYear || !selectedMonth) return [];
            if (!DRE_MONTHS.some((month) => month.key === selectedMonth)) return [];

            const selectedDate = new Date(Number(selectedYear), Number(selectedMonth) - 1, 1);
            const periodStart = startOfMonth(selectedDate);
            const periodEndExclusive = addDays(endOfMonth(selectedDate), 1);
            const start = format(periodStart, "yyyy-MM-dd");
            const endExclusive = format(periodEndExclusive, "yyyy-MM-dd");

            const { data, error } = await (activeClient as any)
                .from("transactions")
                .select(`
                    amount,
                    type,
                    category:chart_of_accounts (
                        id,
                        name,
                        dre_group,
                        dre_order
                    )
                `)
                .eq("company_id", companyId)
                .gte("date", start)
                .lt("date", endExclusive);

            if (error) throw error;

            const groups = new Map<string, {
                name: string;
                order: number;
                total: number;
                categories: Map<string, DreCategory>;
            }>();

            (data || []).forEach((transaction: any) => {
                const category = Array.isArray(transaction.category) ? transaction.category[0] : transaction.category;
                const groupName = String(category?.dre_group || "Outros");
                const groupOrder = Number(category?.dre_order ?? 99);
                const categoryId = String(category?.id || `sem-categoria-${groupName}`);
                const categoryName = String(category?.name || "Sem categoria");
                const signal = transaction.type === "credit" ? 1 : -1;
                const value = Number(transaction.amount || 0) * signal;

                if (!groups.has(groupName)) {
                    groups.set(groupName, {
                        name: groupName,
                        order: groupOrder,
                        total: 0,
                        categories: new Map<string, DreCategory>(),
                    });
                }

                const groupEntry = groups.get(groupName)!;
                groupEntry.total += value;

                if (!groupEntry.categories.has(categoryId)) {
                    groupEntry.categories.set(categoryId, {
                        id: categoryId,
                        name: categoryName,
                        total: 0,
                    });
                }

                const categoryEntry = groupEntry.categories.get(categoryId)!;
                categoryEntry.total += value;
            });

            return Array.from(groups.values())
                .map((group) => ({
                    name: group.name,
                    total: group.total,
                    order: group.order,
                    categories: Array.from(group.categories.values()).sort((a, b) =>
                        a.name.localeCompare(b.name, "pt-BR"),
                    ),
                }))
                .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "pt-BR"));
        },
        enabled: Boolean(companyId) && /^\d{4}-\d{2}$/.test(drePeriodValue),
    });

    const { data: dreAnnualRows = [], isLoading: isLoadingDreAnnual } = useQuery<DreAnnualRow[]>({
        queryKey: ["dashboard_dre_annual_rows", companyId, dreAnnualYear, isUsingSecondary],
        queryFn: async () => {
            if (!companyId || !/^\d{4}$/.test(dreAnnualYear)) return [];
            const year = Number(dreAnnualYear);
            const start = `${year}-01-01`;
            const end = `${year}-12-31`;

            const { data: accounts, error: accountsError } = await (activeClient as any)
                .from("chart_of_accounts")
                .select("id, name, dre_group, dre_order")
                .eq("company_id", companyId)
                .eq("show_in_dre", true)
                .order("dre_order", { ascending: true })
                .order("name", { ascending: true });

            if (accountsError) throw accountsError;

            const { data: transactions, error: transactionsError } = await (activeClient as any)
                .from("transactions")
                .select(`
                    amount,
                    type,
                    date,
                    category:chart_of_accounts (
                        id,
                        name,
                        dre_group,
                        dre_order
                    )
                `)
                .eq("company_id", companyId)
                .gte("date", start)
                .lte("date", end);

            if (transactionsError) throw transactionsError;

            const rows = new Map<string, DreAnnualRow>();

            const ensureRow = (category: any) => {
                const id = String(category?.id || `sem-categoria-${String(category?.name || "outros")}`);
                if (rows.has(id)) {
                    return rows.get(id)!;
                }

                const row: DreAnnualRow = {
                    id,
                    name: String(category?.name || "Sem categoria"),
                    groupName: String(category?.dre_group || "Outros"),
                    groupOrder: Number(category?.dre_order ?? 99),
                    months: createEmptyDreMonths(),
                    total: 0,
                };
                rows.set(id, row);
                return row;
            };

            (accounts || []).forEach((category: any) => {
                ensureRow(category);
            });

            (transactions || []).forEach((transaction: any) => {
                const category = Array.isArray(transaction.category) ? transaction.category[0] : transaction.category;
                const row = ensureRow(category);
                const month = String(transaction.date || "").slice(5, 7);
                if (!DRE_MONTHS.some((item) => item.key === month)) return;

                const signal = transaction.type === "credit" ? 1 : -1;
                const value = Number(transaction.amount || 0) * signal;
                row.months[month] = Number(row.months[month] || 0) + value;
                row.total += value;
            });

            return Array.from(rows.values()).sort(
                (a, b) =>
                    a.groupOrder - b.groupOrder ||
                    a.groupName.localeCompare(b.groupName, "pt-BR") ||
                    a.name.localeCompare(b.name, "pt-BR"),
            );
        },
        enabled: Boolean(companyId) && /^\d{4}$/.test(dreAnnualYear),
    });

    const activityProfileLabel = useMemo(() => {
        const p = selectedCompany?.activity_profile || "comercio";
        if (p === "servico") return "Serviço";
        if (p === "mista") return "Mista";
        return "Comércio";
    }, [selectedCompany?.activity_profile]);

    // Dados para gráfico (já vêm formatados do hook, mas garantindo array vazio)
    const chartData = cashFlowData || [];

    const drePeriodRows = useMemo<DrePeriodRow[]>(
        () =>
            dreDetailed.flatMap((group) => [
                { type: "group", key: `group-${group.name}`, name: group.name, total: group.total } as const,
                ...group.categories.map((category) => ({
                    type: "category",
                    key: `category-${category.id}`,
                    name: category.name,
                    total: category.total,
                })) as DrePeriodRow[],
            ]),
        [dreDetailed],
    );

    const drePeriodNetTotal = useMemo(
        () => dreDetailed.reduce((acc, group) => acc + Number(group.total || 0), 0),
        [dreDetailed],
    );
    const drePeriodTotalPages = Math.max(1, Math.ceil(drePeriodRows.length / DRE_PAGE_SIZE));
    const drePeriodVisibleRows = useMemo(
        () => drePeriodRows.slice((drePeriodPage - 1) * DRE_PAGE_SIZE, drePeriodPage * DRE_PAGE_SIZE),
        [drePeriodPage, drePeriodRows],
    );

    const dreAnnualTotalPages = Math.max(1, Math.ceil(dreAnnualRows.length / DRE_PAGE_SIZE));
    const dreAnnualVisibleRows = useMemo(
        () => dreAnnualRows.slice((dreAnnualPage - 1) * DRE_PAGE_SIZE, dreAnnualPage * DRE_PAGE_SIZE),
        [dreAnnualPage, dreAnnualRows],
    );
    const dreAnnualNetTotal = useMemo(
        () => dreAnnualRows.reduce((acc, row) => acc + Number(row.total || 0), 0),
        [dreAnnualRows],
    );

    // Settings (mantido do original para status de configuração)
    const { data: nfseSettings } = useQuery({
        queryKey: ["company_nfse_settings", companyId, isUsingSecondary],
        queryFn: async () => {
            if (!companyId) return null;
            const { data, error } = await (activeClient as any)
                .from("company_nfse_settings")
                .select("provider, city_name, city_ibge_code, uf, environment")
                .eq("company_id", companyId)
                .maybeSingle();
            if (error) throw error;
            return data as any;
        },
        enabled: Boolean(companyId) && Boolean(selectedCompany?.enable_nfse),
    });

    const isNfseConfigured = useMemo(() => {
        if (!selectedCompany?.enable_nfse) return false;
        const provider = String((nfseSettings as any)?.provider || "").trim();
        const city = String((nfseSettings as any)?.city_name || "").trim();
        const ibge = String((nfseSettings as any)?.city_ibge_code || "").trim();
        return Boolean(provider && (ibge || city));
    }, [nfseSettings, selectedCompany?.enable_nfse]);

    useEffect(() => {
        setDrePeriodPage(1);
    }, [drePeriodValue, drePeriodRows.length]);

    useEffect(() => {
        if (drePeriodPage > drePeriodTotalPages) {
            setDrePeriodPage(drePeriodTotalPages);
        }
    }, [drePeriodPage, drePeriodTotalPages]);

    useEffect(() => {
        setDreAnnualPage(1);
    }, [dreAnnualYear, dreAnnualRows.length]);

    useEffect(() => {
        if (dreAnnualPage > dreAnnualTotalPages) {
            setDreAnnualPage(dreAnnualTotalPages);
        }
    }, [dreAnnualPage, dreAnnualTotalPages]);

    if (!selectedCompany) {
        return (
            <AppLayout title="Detalhes da Empresa">
                <div className="flex flex-col items-center justify-center h-full py-20">
                    <div className="animate-spin h-8 w-8 border-4 border-emerald-600 border-t-transparent rounded-full mb-4"></div>
                    <p className="text-slate-500">Carregando dados da empresa...</p>
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout title={`${selectedCompany.nome_fantasia || selectedCompany.razao_social} - Dashboard`}>
            <div className="space-y-6 animate-fade-in">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <Button
                        variant="ghost"
                        className="pl-0 hover:bg-transparent hover:text-emerald-600"
                        onClick={() => navigate('/dashboard')}
                    >
                        <ArrowLeft className="mr-2 h-4 w-4" /> Voltar para Lista
                    </Button>
                    <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary" className="bg-slate-100 text-slate-600">
                            {activityProfileLabel}
                        </Badge>
                        {selectedCompany.enable_nfse && <Badge variant="outline" className="border-emerald-200 text-emerald-700 bg-emerald-50">NFS-e</Badge>}
                    </div>
                </div>

                {/* KPIs */}
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">

                    {/* Saldo em Banco */}
                    <Card className={`overflow-hidden relative group hover:shadow-xl transition-all duration-300 border-l-4 border-l-blue-400 ${dashboardSurfaceCardClass}`}>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-white/60">Saldo Bancário (Atual)</CardTitle>
                            <Wallet className="h-4 w-4 text-blue-300 group-hover:text-blue-200 transition-colors" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-white">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(accountsBalance || 0)}
                            </div>
                            <p className="text-xs text-white/45 mt-1">Conforme conciliação</p>
                        </CardContent>
                    </Card>

                    {/* A Receber */}
                    <Card className={`border-l-4 border-l-emerald-400 hover:shadow-xl transition-all ${dashboardSurfaceCardClass}`}>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-emerald-300">A Receber (Pendentes)</CardTitle>
                            <ArrowUpRight className="h-4 w-4 text-emerald-300" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-emerald-300">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((receivablesSummary?.overdue || 0) + (receivablesSummary?.today || 0) + (receivablesSummary?.month || 0))}
                            </div>
                            <div className="flex gap-2 mt-1 text-xs">
                                <span className="text-red-300 font-medium">Vencidos: {new Intl.NumberFormat('pt-BR', { compactDisplay: "short", notation: "compact", currency: 'BRL', style: 'currency' }).format(receivablesSummary?.overdue || 0)}</span>
                                <span className="text-emerald-200">Hoje: {new Intl.NumberFormat('pt-BR', { compactDisplay: "short", notation: "compact", currency: 'BRL', style: 'currency' }).format(receivablesSummary?.today || 0)}</span>
                            </div>
                        </CardContent>
                    </Card>

                    {/* A Pagar */}
                    <Card className={`border-l-4 border-l-red-400 hover:shadow-xl transition-all ${dashboardSurfaceCardClass}`}>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-red-300">A Pagar (Pendentes)</CardTitle>
                            <ArrowDownRight className="h-4 w-4 text-red-300" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-red-300">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((payablesSummary?.overdue || 0) + (payablesSummary?.today || 0) + (payablesSummary?.month || 0))}
                            </div>
                            <div className="flex gap-2 mt-1 text-xs">
                                <span className="text-red-300 font-medium">Vencidos: {new Intl.NumberFormat('pt-BR', { compactDisplay: "short", notation: "compact", currency: 'BRL', style: 'currency' }).format(payablesSummary?.overdue || 0)}</span>
                                <span className="text-white/55">Hoje: {new Intl.NumberFormat('pt-BR', { compactDisplay: "short", notation: "compact", currency: 'BRL', style: 'currency' }).format(payablesSummary?.today || 0)}</span>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Projeção (Saldo Final do Mês) */}
                    <Card className={`border-l-4 border-l-purple-400 hover:shadow-xl transition-all ${dashboardSurfaceCardClass}`}>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-white/60">Projeção (Fim do Mês)</CardTitle>
                            <TrendingUp className="h-4 w-4 text-purple-300" />
                        </CardHeader>
                        <CardContent>
                            <div className={`text-2xl font-bold ${(chartData[chartData.length - 1]?.saldo_acumulado || 0) >= 0 ? 'text-purple-300' : 'text-red-300'}`}>
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                                    chartData[chartData.length - 1]?.saldo_acumulado || 0
                                )}
                            </div>
                            <p className="text-xs text-white/45 mt-1">Saldo Estimado</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Gráficos */}
                <div className="grid gap-6 lg:grid-cols-3">

                    {/* Fluxo de Caixa Diário (Bars) */}
                    <Card className={`lg:col-span-2 ${dashboardSurfaceCardClass}`}>
                        <CardHeader className={dashboardCardHeaderClass}>
                            <CardTitle className="text-white">Fluxo de Caixa Diário (Este Mês)</CardTitle>
                            <CardDescription className="text-white/60">Entradas e Saídas previstas dia a dia</CardDescription>
                        </CardHeader>
                        <CardContent className="h-[260px] sm:h-[320px] md:h-[350px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                    <CartesianGrid stroke={chartGridStroke} strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} tick={chartAxisStyle} />
                                    <YAxis
                                        fontSize={11}
                                        tickLine={false}
                                        axisLine={false}
                                        tick={chartAxisStyle}
                                        tickFormatter={(val) => `R$${val / 1000}k`}
                                    />
                                    <Tooltip
                                        formatter={(value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value as number)}
                                        labelStyle={{ color: '#E2E8F0' }}
                                        itemStyle={{ color: '#F8FAFC' }}
                                        contentStyle={chartTooltipStyle}
                                    />
                                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
                                    <Bar dataKey="receitas" name="Receitas" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                    <Bar dataKey="despesas" name="Despesas" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    {/* Saldo Acumulado (Line) */}
                    <Card className={dashboardSurfaceCardClass}>
                        <CardHeader className={dashboardCardHeaderClass}>
                            <CardTitle className="text-white">Projeção de Saldo</CardTitle>
                            <CardDescription className="text-white/60">Evolução do Saldo Acumulado</CardDescription>
                        </CardHeader>
                        <CardContent className="h-[260px] sm:h-[320px] md:h-[350px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorSaldo" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid stroke={chartGridStroke} strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={30} tick={chartAxisStyle} />
                                    <YAxis
                                        fontSize={10}
                                        tickLine={false}
                                        axisLine={false}
                                        tick={chartAxisStyle}
                                        tickFormatter={(val) => `${val >= 0 ? '' : '-'}${Math.abs(val) / 1000}k`}
                                    />
                                    <Tooltip
                                        formatter={(value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value as number)}
                                        labelStyle={{ color: '#E2E8F0' }}
                                        itemStyle={{ color: '#F8FAFC' }}
                                        contentStyle={chartTooltipStyle}
                                    />
                                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.18)" strokeDasharray="3 3" />
                                    <Area
                                        type="monotone"
                                        dataKey="saldo_acumulado"
                                        name="Saldo Acumulado"
                                        stroke="#8b5cf6"
                                        strokeWidth={2}
                                        fillOpacity={1}
                                        fill="url(#colorSaldo)"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid grid-cols-1 gap-6 pb-12">
                    <Card className={`overflow-hidden ${dashboardSurfaceCardClass}`}>
                        <CardHeader className={dashboardCardHeaderClass}>
                            <CardTitle className="text-white flex items-center gap-2">
                                <TrendingUp className="w-5 h-5 text-emerald-400" />
                                Resultado do Mês (DRE)
                            </CardTitle>
                            <CardDescription className="text-white/60">Resumo baseado no Plano de Contas</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Tabs
                                value={dreTab}
                                onValueChange={(value) => setDreTab((value === "anual" ? "anual" : "periodo") as DreTabValue)}
                                className="w-full"
                            >
                                <div className="px-4 pt-4">
                                    <TabsList className={dreTabsListClass}>
                                        <TabsTrigger value="periodo" className={dreTabsTriggerClass}>DRE do período</TabsTrigger>
                                        <TabsTrigger value="anual" className={dreTabsTriggerClass}>DRE anual (planilha)</TabsTrigger>
                                    </TabsList>
                                </div>

                                <TabsContent value="periodo" className="mt-4 mb-0">
                                    <div className="flex flex-col gap-3 px-4 pb-3 border-b border-white/10 md:flex-row md:items-center md:justify-between">
                                        <p className="text-sm text-white/65">
                                            Visão do período selecionado por categoria do plano de contas.
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-white/55">Período:</span>
                                            <Select value={drePeriodValue} onValueChange={setDrePeriodValue}>
                                                <SelectTrigger className="h-8 w-[150px] border-white/10 bg-white/5 text-white">
                                                    <SelectValue placeholder="Selecione" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {drePeriodOptions.map((period) => (
                                                        <SelectItem key={period.value} value={period.value}>
                                                            {period.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <Table className="bg-[#123754] text-white" containerClassName={dreTableContainerClass}>
                                        <TableHeader className={dreTableHeaderClass}>
                                            <TableRow className={dreTableHeaderRowClass}>
                                                <TableHead className="font-bold text-white/80">Grupo/Categoria</TableHead>
                                                <TableHead className="text-right font-bold text-white/80">Valor</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {isLoadingDreDetailed ? (
                                                <TableRow className={dreTableEmptyRowClass}>
                                                    <TableCell colSpan={2} className="text-center py-8 text-white/45 italic">
                                                        Carregando DRE do período...
                                                    </TableCell>
                                                </TableRow>
                                            ) : drePeriodOptions.length === 0 ? (
                                                <TableRow className={dreTableEmptyRowClass}>
                                                    <TableCell colSpan={2} className="text-center py-8 text-white/45 italic">
                                                        Sem períodos com movimentação para esta empresa.
                                                    </TableCell>
                                                </TableRow>
                                            ) : drePeriodRows.length === 0 ? (
                                                <TableRow className={dreTableEmptyRowClass}>
                                                    <TableCell colSpan={2} className="text-center py-8 text-white/45 italic">
                                                        Nenhuma transação categorizada no período selecionado.
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                drePeriodVisibleRows.map((row) => (
                                                    <TableRow
                                                        key={row.key}
                                                        className={row.type === "group" ? dreTableGroupRowClass : dreTableItemRowClass}
                                                    >
                                                        <TableCell
                                                            className={row.type === "group" ? "py-3 font-semibold text-white" : "py-2 pl-8 text-white/80"}
                                                        >
                                                            {row.type === "group" ? row.name : `- ${row.name}`}
                                                        </TableCell>
                                                        <TableCell
                                                            className={`text-right ${row.type === "group" ? "py-3 font-semibold" : "py-2"} ${row.total >= 0 ? "text-emerald-300" : "text-red-300"}`}
                                                        >
                                                            {currencyFormatter.format(row.total)}
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                            {drePeriodRows.length > 0 && (
                                                <TableRow className={dreTableTotalRowClass}>
                                                    <TableCell className="py-4 font-black text-white">RESULTADO LÍQUIDO</TableCell>
                                                    <TableCell className={`py-4 text-right font-black ${drePeriodNetTotal >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                                                        {currencyFormatter.format(drePeriodNetTotal)}
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>

                                    {drePeriodRows.length > DRE_PAGE_SIZE && (
                                        <div className="flex items-center justify-between px-4 py-3 border-t border-white/10 bg-black/20">
                                            <span className="text-xs text-white/55">
                                                Página {drePeriodPage} de {drePeriodTotalPages} ({drePeriodRows.length} linhas)
                                            </span>
                                            <div className="flex gap-2">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={drePeriodPage <= 1}
                                                    onClick={() => setDrePeriodPage((prev) => Math.max(1, prev - 1))}
                                                >
                                                    Anterior
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={drePeriodPage >= drePeriodTotalPages}
                                                    onClick={() => setDrePeriodPage((prev) => Math.min(drePeriodTotalPages, prev + 1))}
                                                >
                                                    Próxima
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </TabsContent>

                                <TabsContent value="anual" className="mt-4 mb-0">
                                    <div className="flex flex-col gap-3 px-4 pb-3 border-b border-white/10 md:flex-row md:items-center md:justify-between">
                                        <p className="text-sm text-white/65">
                                            Visão geral anual por categoria do plano de contas.
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-white/55">Ano:</span>
                                            <Input
                                                value={dreAnnualYear}
                                                onChange={(event) => setDreAnnualYear(event.target.value.replace(/\D/g, "").slice(0, 4))}
                                                onBlur={() => {
                                                    if (!/^\d{4}$/.test(dreAnnualYear)) {
                                                        setDreAnnualYear(String(new Date().getFullYear()));
                                                    }
                                                }}
                                                className="h-8 w-24 border-white/10 bg-white/5 text-white placeholder:text-white/30"
                                                inputMode="numeric"
                                                maxLength={4}
                                            />
                                        </div>
                                    </div>

                                    <div className="overflow-x-auto bg-[#123754]">
                                        <Table className="bg-[#123754] text-white" containerClassName={dreTableContainerClass}>
                                            <TableHeader className={dreTableHeaderClass}>
                                                <TableRow className={dreTableHeaderRowClass}>
                                                    <TableHead className="font-bold min-w-[220px] text-white/80">Grupo/Categoria</TableHead>
                                                    {DRE_MONTHS.map((month) => (
                                                        <TableHead key={month.key} className="text-right font-bold min-w-[110px] text-white/80">
                                                            {month.label}
                                                        </TableHead>
                                                    ))}
                                                    <TableHead className="text-right font-bold min-w-[130px] text-white/80">Total</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {!/^\d{4}$/.test(dreAnnualYear) ? (
                                                    <TableRow className={dreTableEmptyRowClass}>
                                                        <TableCell colSpan={14} className="text-center py-8 text-white/45 italic">
                                                            Informe um ano válido com 4 dígitos.
                                                        </TableCell>
                                                    </TableRow>
                                                ) : isLoadingDreAnnual ? (
                                                    <TableRow className={dreTableEmptyRowClass}>
                                                        <TableCell colSpan={14} className="text-center py-8 text-white/45 italic">
                                                            Carregando DRE anual...
                                                        </TableCell>
                                                    </TableRow>
                                                ) : dreAnnualRows.length === 0 ? (
                                                    <TableRow className={dreTableEmptyRowClass}>
                                                        <TableCell colSpan={14} className="text-center py-8 text-white/45 italic">
                                                            Nenhuma categoria encontrada para o ano selecionado.
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    dreAnnualVisibleRows.map((row) => (
                                                        <TableRow key={row.id} className={dreTableItemRowClass}>
                                                            <TableCell className="py-2">
                                                                <div className="font-medium text-white/85">{row.name}</div>
                                                                <div className="text-xs text-white/45">{row.groupName}</div>
                                                            </TableCell>
                                                            {DRE_MONTHS.map((month) => {
                                                                const monthValue = Number(row.months[month.key] || 0);
                                                                return (
                                                                    <TableCell
                                                                        key={`${row.id}-${month.key}`}
                                                                        className={`py-2 text-right ${monthValue >= 0 ? "text-emerald-300" : "text-red-300"}`}
                                                                    >
                                                                        {currencyFormatter.format(monthValue)}
                                                                    </TableCell>
                                                                );
                                                            })}
                                                            <TableCell className={`py-2 text-right font-semibold ${row.total >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                                                                {currencyFormatter.format(row.total)}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))
                                                )}
                                                {dreAnnualRows.length > 0 && (
                                                    <TableRow className={dreTableTotalRowClass}>
                                                        <TableCell className="py-4 font-black text-white">RESULTADO ANUAL</TableCell>
                                                        {DRE_MONTHS.map((month) => {
                                                            const monthTotal = dreAnnualRows.reduce(
                                                                (acc, row) => acc + Number(row.months[month.key] || 0),
                                                                0,
                                                            );
                                                            return (
                                                                <TableCell
                                                                    key={`total-${month.key}`}
                                                                    className={`py-4 text-right font-black ${monthTotal >= 0 ? "text-emerald-300" : "text-red-300"}`}
                                                                >
                                                                    {currencyFormatter.format(monthTotal)}
                                                                </TableCell>
                                                            );
                                                        })}
                                                        <TableCell className={`py-4 text-right font-black ${dreAnnualNetTotal >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                                                            {currencyFormatter.format(dreAnnualNetTotal)}
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>

                                    {dreAnnualRows.length > DRE_PAGE_SIZE && (
                                        <div className="flex items-center justify-between px-4 py-3 border-t border-white/10 bg-black/20">
                                            <span className="text-xs text-white/55">
                                                Página {dreAnnualPage} de {dreAnnualTotalPages} ({dreAnnualRows.length} linhas)
                                            </span>
                                            <div className="flex gap-2">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={dreAnnualPage <= 1}
                                                    onClick={() => setDreAnnualPage((prev) => Math.max(1, prev - 1))}
                                                >
                                                    Anterior
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={dreAnnualPage >= dreAnnualTotalPages}
                                                    onClick={() => setDreAnnualPage((prev) => Math.min(dreAnnualTotalPages, prev + 1))}
                                                >
                                                    Próxima
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </TabsContent>
                            </Tabs>
                        </CardContent>
                    </Card>

                    <Card className={dashboardSurfaceCardClass}>
                        <CardHeader className={dashboardCardHeaderClass}>
                            <CardTitle className="text-white">Status de Configuração</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6">
                            <div className="flex flex-col gap-4">
                                <div className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-white/10">
                                    <span className="text-sm text-white/75 font-medium">NFS-e Configurada</span>
                                    <Badge variant={isNfseConfigured ? 'default' : 'secondary'} className={isNfseConfigured ? 'bg-green-100 text-green-700' : ''}>
                                        {isNfseConfigured ? 'Ativo' : 'Pendente'}
                                    </Badge>
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-white/10">
                                    <span className="text-sm text-white/75 font-medium">Plano de Contas</span>
                                    <Badge variant={dreSummary && dreSummary.length > 0 ? 'default' : 'secondary'} className={dreSummary && dreSummary.length > 0 ? 'bg-blue-100 text-blue-700' : ''}>
                                        {dreSummary && dreSummary.length > 0 ? 'Em Uso' : 'Configurado'}
                                    </Badge>
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-2 py-2">
                                    <span className="text-sm text-white/75 font-medium">Certificado Digital</span>
                                    <Badge variant="outline" className="border-white/15 text-white/55">Não Detectado</Badge>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </AppLayout>
    );
}
