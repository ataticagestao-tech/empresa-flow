
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { useCompanies } from "@/hooks/useCompanies";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, ArrowDownRight, TrendingUp, Wallet, CalendarDays, BarChart3 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, AreaChart, Area, ReferenceLine
} from "recharts";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useFinanceDashboard, type DashboardDateRange } from "@/modules/finance/presentation/hooks/useFinanceDashboard";
import { startOfMonth, endOfMonth, subMonths, startOfYear, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const fmtCompact = (v: number) => new Intl.NumberFormat('pt-BR', { compactDisplay: "short", notation: "compact", currency: 'BRL', style: 'currency' }).format(v);

const presets = [
    { label: "Este mês", get: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }) },
    { label: "Mês passado", get: () => ({ from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) }) },
    { label: "Últimos 3 meses", get: () => ({ from: startOfMonth(subMonths(new Date(), 2)), to: endOfMonth(new Date()) }) },
    { label: "Este ano", get: () => ({ from: startOfYear(new Date()), to: endOfMonth(new Date()) }) },
];

export default function CompanyDashboard() {
    const { id } = useParams<{ id: string }>();
    const { user, activeClient, isUsingSecondary } = useAuth();
    const { companies } = useCompanies(user?.id);
    const { setSelectedCompany, selectedCompany } = useCompany();

    const [dateRange, setDateRange] = useState<DashboardDateRange>({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date()),
    });
    const [calendarRange, setCalendarRange] = useState<DateRange | undefined>({
        from: dateRange.from,
        to: dateRange.to,
    });
    const [activePreset, setActivePreset] = useState("Este mês");

    useEffect(() => {
        if (id && companies) {
            const company = companies.find(c => c.id === id);
            if (company) setSelectedCompany(company);
        }
    }, [id, companies, setSelectedCompany]);

    const companyId = selectedCompany?.id || null;

    const {
        accountsBalance, receivablesSummary, payablesSummary, cashFlowData, dreSummary
    } = useFinanceDashboard(dateRange);

    const activityProfileLabel = useMemo(() => {
        const p = selectedCompany?.activity_profile || "comercio";
        if (p === "servico") return "Serviço";
        if (p === "mista") return "Mista";
        return "Comércio";
    }, [selectedCompany?.activity_profile]);

    const chartData = (cashFlowData || []).map((d: any) => ({
        ...d,
        despesas_neg: -(d.despesas || 0),
    }));

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

    const handlePreset = (preset: typeof presets[number]) => {
        const range = preset.get();
        setDateRange(range);
        setCalendarRange({ from: range.from, to: range.to });
        setActivePreset(preset.label);
    };

    const handleCalendarSelect = (range: DateRange | undefined) => {
        setCalendarRange(range);
        if (range?.from && range?.to) {
            setDateRange({ from: range.from, to: range.to });
            setActivePreset("");
        }
    };

    if (!selectedCompany) {
        return (
            <AppLayout title="Dashboard">
                <div className="flex flex-col items-center justify-center h-full py-20">
                    <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mb-4" />
                    <p className="text-muted-foreground text-sm">Carregando dados da empresa...</p>
                </div>
            </AppLayout>
        );
    }

    const totalReceivables = (receivablesSummary?.overdue || 0) + (receivablesSummary?.today || 0) + (receivablesSummary?.period || 0);
    const totalPayables = (payablesSummary?.overdue || 0) + (payablesSummary?.today || 0) + (payablesSummary?.period || 0);
    const projectedBalance = chartData[chartData.length - 1]?.saldo_acumulado || 0;
    const dreTotal = dreSummary?.reduce((acc: number, curr: any) => acc + curr.total, 0) ?? 0;

    const dateLabel = `${format(dateRange.from, "dd MMM", { locale: ptBR })} – ${format(dateRange.to, "dd MMM yyyy", { locale: ptBR })}`;

    const kpis = [
        { id: "balance", label: "Saldo Bancário", value: fmt(accountsBalance || 0), detail: "Conforme conciliação", icon: Wallet, color: "text-primary", iconBg: "bg-primary/10", iconColor: "text-primary", accent: "border-l-[3px] border-l-primary" },
        { id: "receivables", label: "A Receber", value: fmt(totalReceivables), detail: `Vencidos: ${fmtCompact(receivablesSummary?.overdue || 0)} · Hoje: ${fmtCompact(receivablesSummary?.today || 0)}`, icon: ArrowUpRight, color: "text-[#2E6E4C]", iconBg: "bg-[#2E6E4C]/10", iconColor: "text-[#2E6E4C]", accent: "border-l-[3px] border-l-[#2E6E4C]" },
        { id: "payables", label: "A Pagar", value: fmt(totalPayables), detail: `Vencidos: ${fmtCompact(payablesSummary?.overdue || 0)} · Hoje: ${fmtCompact(payablesSummary?.today || 0)}`, icon: ArrowDownRight, color: "text-[#A8311E]", iconBg: "bg-[#A8311E]/10", iconColor: "text-[#A8311E]", accent: "border-l-[3px] border-l-[#A8311E]" },
        { id: "projection", label: "Projeção", value: fmt(projectedBalance), detail: "Saldo estimado fim do período", icon: TrendingUp, color: projectedBalance >= 0 ? "text-[#2E6E4C]" : "text-[#A8311E]", iconBg: "bg-[#8A5E00]/10", iconColor: "text-[#8A5E00]", accent: "border-l-[3px] border-l-[#8A5E00]" },
    ];

    return (
        <AppLayout title={`${selectedCompany.nome_fantasia || selectedCompany.razao_social}`}>
            <div className="space-y-6 animate-fade-in">

                {/* Page Header */}
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <h2 className="text-lg font-bold text-foreground tracking-tight">
                            {selectedCompany.nome_fantasia || selectedCompany.razao_social}
                        </h2>
                        <p className="text-[12.5px] text-muted-foreground mt-0.5">
                            Visão financeira consolidada
                        </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Preset buttons */}
                        <div className="flex gap-1.5">
                            {presets.map((p) => (
                                <Button
                                    key={p.label}
                                    variant={activePreset === p.label ? "default" : "secondary"}
                                    size="sm"
                                    className="text-[11.5px] h-8 px-3"
                                    onClick={() => handlePreset(p)}
                                >
                                    {p.label}
                                </Button>
                            ))}
                        </div>

                        {/* Date range picker */}
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="secondary" size="sm" className="h-8 gap-1.5 text-[11.5px] px-3">
                                    <CalendarDays className="h-3.5 w-3.5" />
                                    {dateLabel}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="end">
                                <Calendar
                                    mode="range"
                                    selected={calendarRange}
                                    onSelect={handleCalendarSelect}
                                    numberOfMonths={2}
                                    defaultMonth={dateRange.from}
                                />
                            </PopoverContent>
                        </Popover>

                        <div className="flex gap-1.5">
                            <Badge variant="secondary">{activityProfileLabel}</Badge>
                            {selectedCompany.enable_nfse && <Badge variant="success">NFS-e</Badge>}
                        </div>
                    </div>
                </div>

                {/* KPI Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    {kpis.map((kpi) => (
                        <Card key={kpi.id} className={`${kpi.accent} hover:shadow-md transition-shadow duration-200`}>
                            <CardContent className="p-[22px]">
                                <div className="flex items-start justify-between mb-3">
                                    <p className={`text-[11px] font-bold uppercase tracking-[0.8px] ${kpi.color}`}>{kpi.label}</p>
                                    <div className={`rounded-lg p-1.5 ${kpi.iconBg}`}>
                                        <kpi.icon className={`h-4 w-4 ${kpi.iconColor}`} />
                                    </div>
                                </div>
                                <p className={`kpi-value ${kpi.color}`}>{kpi.value}</p>
                                <p className="text-[11.5px] text-muted-foreground mt-1.5">{kpi.detail}</p>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Charts */}
                <div className="grid gap-5 lg:grid-cols-1">
                    <Card className="overflow-hidden">
                        <CardHeader className="bg-gradient-to-r from-primary/[0.03] to-transparent">
                            <div className="flex items-center gap-2">
                                <div className="rounded-md bg-primary/10 p-1.5">
                                    <BarChart3 className="h-3.5 w-3.5 text-primary" />
                                </div>
                                <div>
                                    <CardTitle className="text-[13px] font-bold tracking-tight">Fluxo de Caixa Diário</CardTitle>
                                    <CardDescription className="text-[11px]">Entradas e saídas previstas — {dateLabel}</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-4 mb-4">
                                <div className="flex items-center gap-1.5">
                                    <div className="w-2.5 h-2.5 rounded-sm bg-[#2E6E4C]" />
                                    <span className="text-[11px] text-muted-foreground font-medium">Entradas</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className="w-2.5 h-2.5 rounded-sm bg-[#A8311E]" />
                                    <span className="text-[11px] text-muted-foreground font-medium">Saídas</span>
                                </div>
                            </div>
                            <div className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }} stackOffset="sign">
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                                        <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} />
                                        <YAxis fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => { const abs = Math.abs(val); return abs >= 1000 ? `R$${(abs / 1000).toFixed(0)}k` : `R$${abs}`; }} />
                                        <Tooltip
                                            formatter={(value: number, name: string) => [fmt(Math.abs(value)), name === "despesas_neg" ? "Saídas" : "Entradas"]}
                                            contentStyle={{ borderRadius: '10px', border: '1px solid hsl(30 14% 93%)', boxShadow: '0 4px 16px rgba(0,0,0,0.06)', fontSize: '12px' }}
                                        />
                                        <ReferenceLine y={0} stroke="#0A0A0A" strokeOpacity={0.15} strokeWidth={1} />
                                        <Bar dataKey="receitas" name="Entradas" fill="#2E6E4C" radius={[4, 4, 0, 0]} maxBarSize={32} stackId="flow" />
                                        <Bar dataKey="despesas_neg" name="despesas_neg" fill="#A8311E" radius={[0, 0, 4, 4]} maxBarSize={32} stackId="flow" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>

                </div>

                {/* Projeção + DRE + Config */}
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 pb-8">
                    <Card className="overflow-hidden">
                        <CardHeader className="bg-gradient-to-r from-[#1C3D6B]/[0.03] to-transparent">
                            <div className="flex items-center gap-2">
                                <div className="rounded-md bg-[#1C3D6B]/10 p-1.5">
                                    <TrendingUp className="h-3.5 w-3.5 text-[#1C3D6B]" />
                                </div>
                                <div>
                                    <CardTitle className="text-[13px] font-bold tracking-tight">Projeção de Saldo</CardTitle>
                                    <CardDescription className="text-[11px]">Evolução do saldo acumulado</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="h-[280px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorSaldo" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#1C3D6B" stopOpacity={0.2} />
                                            <stop offset="95%" stopColor="#1C3D6B" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                                    <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={30} />
                                    <YAxis fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `${val >= 0 ? '' : '-'}${Math.abs(val) / 1000}k`} />
                                    <Tooltip
                                        formatter={(value) => fmt(value as number)}
                                        labelStyle={{ color: '#555' }}
                                        contentStyle={{ borderRadius: '10px', border: '1px solid hsl(30 14% 93%)', boxShadow: '0 4px 16px rgba(0,0,0,0.06)', fontSize: '12px' }}
                                    />
                                    <ReferenceLine y={0} stroke="#555" strokeDasharray="3 3" />
                                    <Area type="monotone" dataKey="saldo_acumulado" name="Saldo Acumulado" stroke="#1C3D6B" strokeWidth={2} fillOpacity={1} fill="url(#colorSaldo)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                    <Card className="overflow-hidden">
                        <CardHeader className="border-b border-border-light bg-gradient-to-r from-[#2E6E4C]/[0.03] to-transparent">
                            <div className="flex items-center gap-2">
                                <div className="rounded-md bg-[#2E6E4C]/10 p-1.5">
                                    <TrendingUp className="h-3.5 w-3.5 text-[#2E6E4C]" />
                                </div>
                                <div>
                                    <CardTitle className="text-[13px] font-bold tracking-tight">Resultado do Período (DRE)</CardTitle>
                                    <CardDescription className="text-[11px]">Resumo baseado no Plano de Contas</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Grupo/Categoria</TableHead>
                                        <TableHead className="text-right">Valor</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(!dreSummary || dreSummary.length === 0) ? (
                                        <TableRow>
                                            <TableCell colSpan={2} className="text-center py-8 text-muted-foreground italic">
                                                Nenhuma transação categorizada neste período.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        dreSummary.map((group: any) => (
                                            <TableRow key={group.name}>
                                                <TableCell className="py-3 font-medium text-foreground">{group.name}</TableCell>
                                                <TableCell className={`py-3 text-right font-bold ${group.total >= 0 ? 'text-[#2E6E4C]' : 'text-destructive'}`}>
                                                    {fmt(group.total)}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                    {dreSummary && dreSummary.length > 0 && (
                                        <TableRow className="bg-surface-2">
                                            <TableCell className="py-4 font-black text-foreground">RESULTADO LÍQUIDO</TableCell>
                                            <TableCell className={`py-4 text-right font-black ${dreTotal >= 0 ? 'text-[#2E6E4C]' : 'text-destructive'}`}>
                                                {fmt(dreTotal)}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    <Card className="overflow-hidden">
                        <CardHeader className="border-b border-border-light bg-gradient-to-r from-primary/[0.03] to-transparent">
                            <div className="flex items-center gap-2">
                                <div className="rounded-md bg-primary/10 p-1.5">
                                    <Wallet className="h-3.5 w-3.5 text-primary" />
                                </div>
                                <CardTitle className="text-[13px] font-bold tracking-tight">Status de Configuração</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-5">
                            <div className="flex flex-col gap-4">
                                <div className="flex justify-between items-center py-2 border-b border-border-light">
                                    <span className="text-[12.5px] text-foreground font-medium">NFS-e Configurada</span>
                                    <Badge variant={isNfseConfigured ? 'success' : 'secondary'}>
                                        {isNfseConfigured ? 'Ativo' : 'Pendente'}
                                    </Badge>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-border-light">
                                    <span className="text-[12.5px] text-foreground font-medium">Plano de Contas</span>
                                    <Badge variant={dreSummary && dreSummary.length > 0 ? 'info' : 'secondary'}>
                                        {dreSummary && dreSummary.length > 0 ? 'Em Uso' : 'Configurado'}
                                    </Badge>
                                </div>
                                <div className="flex justify-between items-center py-2">
                                    <span className="text-[12.5px] text-foreground font-medium">Certificado Digital</span>
                                    <Badge variant="secondary">Não Detectado</Badge>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </AppLayout>
    );
}
