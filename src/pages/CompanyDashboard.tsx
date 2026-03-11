
import { useEffect, useMemo, useState, useCallback, useSyncExternalStore } from "react";
import { useParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { useCompanies } from "@/hooks/useCompanies";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import {
    Landmark, TrendingUp, TrendingDown, LineChart,
    CalendarDays, BarChart2, Zap, Activity, Clock, Settings2
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, AreaChart, Area, ReferenceLine
} from "recharts";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useFinanceDashboard, type DashboardDateRange } from "@/modules/finance/presentation/hooks/useFinanceDashboard";
import { startOfMonth, endOfMonth, subMonths, startOfYear, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";

/* ── Design Tokens ─────────────────────────────────────────── */
const C = {
    bg:        "#F7F6F3",
    surface:   "#FFFFFF",
    border:    "#E8E4DC",
    text1:     "#1A1917",
    text2:     "#6B6760",
    textMuted: "#A8A39C",
    accent:    "#1C3A5E",
    positive:  "#2D6A4F",
    negative:  "#8B2020",
    warning:   "#7A5C1E",
    accentLt:  "#EEF2F7",
} as const;

/* ── Formatters ────────────────────────────────────────────── */
const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const fmtCompact = (v: number) =>
    new Intl.NumberFormat("pt-BR", { notation: "compact", compactDisplay: "short", style: "currency", currency: "BRL" }).format(v);

/* ── Responsive hook ───────────────────────────────────────── */
function useWindowWidth() {
    const subscribe = useCallback((cb: () => void) => {
        window.addEventListener("resize", cb);
        return () => window.removeEventListener("resize", cb);
    }, []);
    return useSyncExternalStore(subscribe, () => window.innerWidth);
}

/* ── Date Presets ───────────────────────────────────────────── */
const presets = [
    { label: "Este mes", get: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }) },
    { label: "Mes passado", get: () => ({ from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) }) },
    { label: "3 meses", get: () => ({ from: startOfMonth(subMonths(new Date(), 2)), to: endOfMonth(new Date()) }) },
    { label: "Este ano", get: () => ({ from: startOfYear(new Date()), to: endOfMonth(new Date()) }) },
];

/* ── Tab config ─────────────────────────────────────────────── */
const TABS = [
    { id: "financeiro", label: "Financeiro", icon: BarChart2 },
    { id: "operacional", label: "Operacional", icon: Zap },
    { id: "config", label: "Config", icon: Settings2 },
] as const;

type TabId = (typeof TABS)[number]["id"];

/* ── Tooltip dark style ─────────────────────────────────────── */
const tooltipStyle = {
    backgroundColor: C.text1,
    color: "#fff",
    borderRadius: 8,
    border: "none",
    padding: "8px 12px",
    fontSize: 12,
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
} as const;

/* ════════════════════════════════════════════════════════════ */

export default function CompanyDashboard() {
    const { id } = useParams<{ id: string }>();
    const { user, activeClient, isUsingSecondary } = useAuth();
    const { companies } = useCompanies(user?.id);
    const { setSelectedCompany, selectedCompany } = useCompany();
    const width = useWindowWidth();
    const isMobile = width < 768;
    const isTablet = width >= 768 && width < 1200;

    const [activeTab, setActiveTab] = useState<TabId>("financeiro");
    const [dateRange, setDateRange] = useState<DashboardDateRange>({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date()),
    });
    const [calendarRange, setCalendarRange] = useState<DateRange | undefined>({
        from: dateRange.from,
        to: dateRange.to,
    });
    const [activePreset, setActivePreset] = useState("Este mes");

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

    const chartData = useMemo(
        () => (cashFlowData || []).map((d: any) => ({ ...d, despesas_neg: -(d.despesas || 0) })),
        [cashFlowData]
    );

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
                    <div className="animate-spin h-8 w-8 border-2 border-t-transparent rounded-full mb-4" style={{ borderColor: C.accent, borderTopColor: "transparent" }} />
                    <p style={{ color: C.text2, fontSize: 13 }}>Carregando dados da empresa...</p>
                </div>
            </AppLayout>
        );
    }

    const totalReceivables = (receivablesSummary?.overdue || 0) + (receivablesSummary?.today || 0) + (receivablesSummary?.period || 0);
    const totalPayables = (payablesSummary?.overdue || 0) + (payablesSummary?.today || 0) + (payablesSummary?.period || 0);
    const projectedBalance = chartData[chartData.length - 1]?.saldo_acumulado || 0;
    const dreTotal = dreSummary?.reduce((acc: number, curr: any) => acc + curr.total, 0) ?? 0;

    const dateLabel = `${format(dateRange.from, "dd MMM", { locale: ptBR })} - ${format(dateRange.to, "dd MMM yyyy", { locale: ptBR })}`;

    const chartHeight = isMobile ? 140 : isTablet ? 180 : 200;

    /* ── KPI Definitions ─────────────────────────────────────── */
    const kpis = [
        {
            id: "balance",
            label: "SALDO BANCARIO",
            value: fmt(accountsBalance || 0),
            detail: "Conforme conciliacao",
            icon: Landmark,
            themeColor: C.accent,
        },
        {
            id: "receivables",
            label: "A RECEBER",
            value: fmt(totalReceivables),
            detail: `Vencidos: ${fmtCompact(receivablesSummary?.overdue || 0)} / Hoje: ${fmtCompact(receivablesSummary?.today || 0)}`,
            icon: TrendingUp,
            themeColor: C.positive,
        },
        {
            id: "payables",
            label: "A PAGAR",
            value: fmt(totalPayables),
            detail: `Vencidos: ${fmtCompact(payablesSummary?.overdue || 0)} / Hoje: ${fmtCompact(payablesSummary?.today || 0)}`,
            icon: TrendingDown,
            themeColor: C.negative,
        },
        {
            id: "projection",
            label: "PROJECAO",
            value: fmt(projectedBalance),
            detail: "Saldo estimado fim do periodo",
            icon: LineChart,
            themeColor: C.warning,
        },
    ];

    return (
        <AppLayout title={`${selectedCompany.nome_fantasia || selectedCompany.razao_social}`}>
            <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: 24 }}>

                {/* ── Page Header ─────────────────────────────── */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                    <div>
                        <h2 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 22, fontWeight: 400, color: C.text1, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
                            {selectedCompany.nome_fantasia || selectedCompany.razao_social}
                        </h2>
                        <p style={{ fontSize: 13, color: C.text2, marginTop: 4 }}>
                            Visao financeira consolidada
                        </p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        {/* Presets */}
                        <div style={{ display: "flex", gap: 4 }}>
                            {presets.map((p) => (
                                <button
                                    key={p.label}
                                    onClick={() => handlePreset(p)}
                                    style={{
                                        padding: "6px 14px",
                                        fontSize: 11,
                                        fontWeight: 500,
                                        fontFamily: "'DM Sans', system-ui, sans-serif",
                                        borderRadius: 6,
                                        border: `1px solid ${activePreset === p.label ? C.accent : C.border}`,
                                        background: activePreset === p.label ? C.accent : C.surface,
                                        color: activePreset === p.label ? "#fff" : C.text2,
                                        cursor: "pointer",
                                        transition: "all 0.2s ease",
                                    }}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>

                        {/* Calendar picker */}
                        <Popover>
                            <PopoverTrigger asChild>
                                <button
                                    style={{
                                        display: "flex", alignItems: "center", gap: 6,
                                        padding: "6px 12px", fontSize: 11, fontWeight: 500,
                                        fontFamily: "'DM Sans', system-ui, sans-serif",
                                        borderRadius: 6, border: `1px solid ${C.border}`,
                                        background: C.surface, color: C.text2, cursor: "pointer",
                                    }}
                                >
                                    <CalendarDays size={14} color={C.textMuted} />
                                    {dateLabel}
                                </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="end">
                                <Calendar
                                    mode="range"
                                    selected={calendarRange}
                                    onSelect={handleCalendarSelect}
                                    numberOfMonths={isMobile ? 1 : 2}
                                    defaultMonth={dateRange.from}
                                />
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>

                {/* ── KPI Grid ────────────────────────────────── */}
                <div style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr 1fr" : "1fr 1fr 1fr 1fr",
                    gap: 16,
                }}>
                    {kpis.map((kpi) => (
                        <div
                            key={kpi.id}
                            style={{
                                background: C.surface,
                                borderRadius: 12,
                                border: `1px solid ${C.border}`,
                                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                                padding: 24,
                                position: "relative",
                                overflow: "hidden",
                            }}
                        >
                            {/* Top accent line */}
                            <div style={{
                                position: "absolute", top: 0, left: 0, right: 0,
                                height: 3, background: kpi.themeColor,
                            }} />
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                <div>
                                    <p style={{
                                        fontFamily: "'DM Sans', system-ui, sans-serif",
                                        fontSize: 10, fontWeight: 600,
                                        letterSpacing: "0.12em", textTransform: "uppercase" as const,
                                        color: kpi.themeColor, marginBottom: 8,
                                    }}>
                                        {kpi.label}
                                    </p>
                                    <p style={{
                                        fontFamily: "'DM Serif Display', Georgia, serif",
                                        fontSize: isMobile ? 22 : 28, fontWeight: 400,
                                        letterSpacing: "-0.04em", color: C.text1, lineHeight: 1.1,
                                        fontVariantNumeric: "tabular-nums",
                                    }}>
                                        {kpi.value}
                                    </p>
                                    <p style={{ fontSize: 11, color: C.textMuted, marginTop: 8 }}>
                                        {kpi.detail}
                                    </p>
                                </div>
                                <kpi.icon size={18} color={kpi.themeColor} style={{ opacity: 0.5, flexShrink: 0, marginTop: 2 }} />
                            </div>
                        </div>
                    ))}
                </div>

                {/* ── Tab Navigation ──────────────────────────── */}
                <div style={{
                    display: "flex",
                    borderBottom: `1px solid ${C.border}`,
                    gap: 0,
                }}>
                    {TABS.map((tab) => {
                        const isActive = activeTab === tab.id;
                        const TabIcon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                style={{
                                    display: "flex", alignItems: "center", gap: 8,
                                    padding: "14px 28px",
                                    fontSize: 13, fontWeight: isActive ? 600 : 400,
                                    fontFamily: "'DM Sans', system-ui, sans-serif",
                                    color: isActive ? C.accent : C.textMuted,
                                    background: isActive ? C.surface : C.bg,
                                    border: "none",
                                    borderBottom: isActive ? `2px solid ${C.accent}` : "2px solid transparent",
                                    cursor: "pointer",
                                    transition: "all 0.2s ease",
                                }}
                            >
                                <TabIcon size={14} />
                                {(!isMobile || isActive) && <span>{tab.label}</span>}
                            </button>
                        );
                    })}
                </div>

                {/* ── Tab Content: Financeiro ─────────────────── */}
                {activeTab === "financeiro" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

                        {/* Cash Flow Chart */}
                        <div style={{
                            background: C.surface, borderRadius: 12,
                            border: `1px solid ${C.border}`,
                            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                            padding: 24,
                        }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
                                <div>
                                    <p className="section-title" style={{ marginBottom: 4 }}>FLUXO DE CAIXA DIARIO</p>
                                    <p style={{ fontSize: 13, color: C.textMuted }}>{dateLabel}</p>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        <div style={{ width: 8, height: 8, borderRadius: 2, background: C.positive }} />
                                        <span style={{ fontSize: 11, color: C.text2, fontWeight: 500 }}>Entradas</span>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        <div style={{ width: 8, height: 8, borderRadius: 2, background: C.negative }} />
                                        <span style={{ fontSize: 11, color: C.text2, fontWeight: 500 }}>Saidas</span>
                                    </div>
                                </div>
                            </div>
                            <div style={{ height: chartHeight + 100 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} stackOffset="sign" barCategoryGap="25%">
                                        <CartesianGrid strokeDasharray="4 4" vertical={false} stroke={C.border} />
                                        <XAxis
                                            dataKey="date"
                                            tickLine={false}
                                            axisLine={false}
                                            tick={{ fill: C.textMuted, fontSize: 11 }}
                                            dy={8}
                                        />
                                        <YAxis
                                            tickLine={false}
                                            axisLine={false}
                                            tick={{ fill: C.textMuted, fontSize: 11 }}
                                            tickFormatter={(val) => {
                                                const abs = Math.abs(val);
                                                return abs >= 1000 ? `${(abs / 1000).toFixed(0)}k` : `${abs}`;
                                            }}
                                            width={40}
                                        />
                                        <Tooltip
                                            formatter={(value: number, name: string) => [
                                                fmt(Math.abs(value)),
                                                name === "despesas_neg" ? "Saidas" : "Entradas"
                                            ]}
                                            contentStyle={tooltipStyle}
                                            cursor={{ fill: "rgba(0,0,0,0.02)" }}
                                        />
                                        <ReferenceLine y={0} stroke={C.border} strokeWidth={1} />
                                        <Bar dataKey="receitas" name="Entradas" fill={C.positive} radius={[4, 4, 0, 0]} maxBarSize={24} stackId="flow" />
                                        <Bar dataKey="despesas_neg" name="despesas_neg" fill={C.negative} radius={[0, 0, 4, 4]} maxBarSize={24} stackId="flow" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Second row: Projecao + DRE */}
                        <div style={{
                            display: "grid",
                            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                            gap: 16,
                        }}>
                            {/* Projecao de Saldo */}
                            <div style={{
                                background: C.surface, borderRadius: 12,
                                border: `1px solid ${C.border}`,
                                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                                padding: 24,
                            }}>
                                <p className="section-title" style={{ marginBottom: 4 }}>PROJECAO DE SALDO</p>
                                <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 16 }}>Evolucao do saldo acumulado</p>
                                <div style={{ height: chartHeight + 60 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="colorSaldo" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor={C.accent} stopOpacity={0.12} />
                                                    <stop offset="95%" stopColor={C.accent} stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="4 4" vertical={false} stroke={C.border} />
                                            <XAxis
                                                dataKey="date"
                                                tickLine={false}
                                                axisLine={false}
                                                tick={{ fill: C.textMuted, fontSize: 11 }}
                                                interval="preserveStartEnd"
                                                minTickGap={30}
                                            />
                                            <YAxis
                                                tickLine={false}
                                                axisLine={false}
                                                tick={{ fill: C.textMuted, fontSize: 11 }}
                                                tickFormatter={(val) =>
                                                    `${val >= 0 ? "" : "-"}${Math.abs(val) >= 1000 ? `${(Math.abs(val) / 1000).toFixed(0)}k` : Math.abs(val)}`
                                                }
                                            />
                                            <Tooltip
                                                formatter={(value) => fmt(value as number)}
                                                contentStyle={tooltipStyle}
                                            />
                                            <ReferenceLine y={0} stroke={C.border} strokeDasharray="4 4" />
                                            <Area
                                                type="monotone"
                                                dataKey="saldo_acumulado"
                                                name="Saldo Acumulado"
                                                stroke={C.accent}
                                                strokeWidth={2}
                                                fillOpacity={1}
                                                fill="url(#colorSaldo)"
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* DRE */}
                            <div style={{
                                background: C.surface, borderRadius: 12,
                                border: `1px solid ${C.border}`,
                                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                                padding: 24,
                            }}>
                                <p className="section-title" style={{ marginBottom: 4 }}>RESULTADO DO PERIODO (DRE)</p>
                                <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 16 }}>Baseado no Plano de Contas</p>

                                {(!dreSummary || dreSummary.length === 0) ? (
                                    <p style={{ fontSize: 13, color: C.textMuted, textAlign: "center", padding: "40px 0", fontStyle: "italic" }}>
                                        Nenhuma transacao categorizada neste periodo.
                                    </p>
                                ) : (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                                        {dreSummary.map((group: any) => (
                                            <div
                                                key={group.name}
                                                style={{
                                                    display: "flex", justifyContent: "space-between", alignItems: "center",
                                                    padding: "12px 0",
                                                    borderBottom: `1px solid ${C.border}`,
                                                }}
                                            >
                                                <span style={{ fontSize: 13, fontWeight: 500, color: C.text1 }}>{group.name}</span>
                                                <span style={{
                                                    fontFamily: "'DM Serif Display', Georgia, serif",
                                                    fontSize: 14, fontWeight: 400,
                                                    color: group.total >= 0 ? C.positive : C.negative,
                                                    fontVariantNumeric: "tabular-nums",
                                                }}>
                                                    {fmt(group.total)}
                                                </span>
                                            </div>
                                        ))}
                                        {/* Total row */}
                                        <div style={{
                                            display: "flex", justifyContent: "space-between", alignItems: "center",
                                            padding: "16px 0 4px",
                                        }}>
                                            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: C.text1 }}>
                                                RESULTADO LIQUIDO
                                            </span>
                                            <span style={{
                                                fontFamily: "'DM Serif Display', Georgia, serif",
                                                fontSize: 18, fontWeight: 400,
                                                color: dreTotal >= 0 ? C.positive : C.negative,
                                                fontVariantNumeric: "tabular-nums",
                                            }}>
                                                {fmt(dreTotal)}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Third row: Contas Vencidas + Saude Financeira */}
                        <div style={{
                            display: "grid",
                            gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr 1fr" : "1fr 1fr 1fr",
                            gap: 16,
                        }}>
                            {/* Contas Vencidas */}
                            <div style={{
                                background: C.surface, borderRadius: 12,
                                border: `1px solid ${C.border}`,
                                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                                padding: 24,
                            }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                                    <Clock size={15} color={C.textMuted} />
                                    <p className="section-title" style={{ margin: 0 }}>CONTAS VENCIDAS</p>
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                                    <div>
                                        <p style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>A Receber vencidas</p>
                                        <p style={{
                                            fontFamily: "'DM Serif Display', Georgia, serif",
                                            fontSize: 20, color: C.negative, fontVariantNumeric: "tabular-nums",
                                        }}>
                                            {fmt(receivablesSummary?.overdue || 0)}
                                        </p>
                                    </div>
                                    <div style={{ height: 1, background: C.border }} />
                                    <div>
                                        <p style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>A Pagar vencidas</p>
                                        <p style={{
                                            fontFamily: "'DM Serif Display', Georgia, serif",
                                            fontSize: 20, color: C.negative, fontVariantNumeric: "tabular-nums",
                                        }}>
                                            {fmt(payablesSummary?.overdue || 0)}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Saude Financeira */}
                            <div style={{
                                background: C.surface, borderRadius: 12,
                                border: `1px solid ${C.border}`,
                                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                                padding: 24,
                            }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                                    <Activity size={15} color={C.textMuted} />
                                    <p className="section-title" style={{ margin: 0 }}>SAUDE FINANCEIRA</p>
                                </div>
                                {(() => {
                                    const score = totalPayables > 0
                                        ? Math.min(100, Math.round(((accountsBalance || 0) / totalPayables) * 100))
                                        : 100;
                                    const scoreColor = score >= 70 ? C.positive : score >= 40 ? C.warning : C.negative;
                                    const scoreLabel = score >= 70 ? "Saudavel" : score >= 40 ? "Atencao" : "Critico";
                                    return (
                                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "16px 0" }}>
                                            <div style={{ position: "relative", width: 100, height: 100 }}>
                                                <svg viewBox="0 0 100 100" width={100} height={100}>
                                                    {/* Track */}
                                                    <circle cx="50" cy="50" r="42" fill="none" stroke={C.border} strokeWidth="6"
                                                        strokeDasharray="198 66" strokeLinecap="round"
                                                        transform="rotate(135 50 50)" />
                                                    {/* Fill */}
                                                    <circle cx="50" cy="50" r="42" fill="none" stroke={scoreColor} strokeWidth="6"
                                                        strokeDasharray={`${(score / 100) * 198} ${264 - (score / 100) * 198}`}
                                                        strokeLinecap="round"
                                                        transform="rotate(135 50 50)" />
                                                </svg>
                                                <div style={{
                                                    position: "absolute", inset: 0,
                                                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                                                }}>
                                                    <span style={{
                                                        fontFamily: "'DM Serif Display', Georgia, serif",
                                                        fontSize: 18, color: C.text1,
                                                    }}>
                                                        {score}
                                                    </span>
                                                </div>
                                            </div>
                                            <span style={{ fontSize: 9, color: C.textMuted, letterSpacing: "0.12em", textTransform: "uppercase" as const, fontWeight: 600 }}>
                                                {scoreLabel}
                                            </span>
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* Status de Config */}
                            <div style={{
                                background: C.surface, borderRadius: 12,
                                border: `1px solid ${C.border}`,
                                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                                padding: 24,
                            }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                                    <Settings2 size={15} color={C.textMuted} />
                                    <p className="section-title" style={{ margin: 0 }}>CONFIGURACAO</p>
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                                    {[
                                        { label: "NFS-e Configurada", ok: isNfseConfigured },
                                        { label: "Plano de Contas", ok: dreSummary && dreSummary.length > 0 },
                                        { label: "Certificado Digital", ok: false },
                                    ].map((item, i, arr) => (
                                        <div
                                            key={item.label}
                                            style={{
                                                display: "flex", justifyContent: "space-between", alignItems: "center",
                                                padding: "12px 0",
                                                borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none",
                                            }}
                                        >
                                            <span style={{ fontSize: 13, color: C.text1 }}>{item.label}</span>
                                            <span style={{
                                                fontSize: 11, fontWeight: 600,
                                                padding: "2px 10px", borderRadius: 99,
                                                background: item.ok ? `${C.positive}12` : `${C.textMuted}15`,
                                                color: item.ok ? C.positive : C.textMuted,
                                            }}>
                                                {item.ok ? "Ativo" : "Pendente"}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Tab Content: Operacional ────────────────── */}
                {activeTab === "operacional" && (
                    <div style={{
                        background: C.surface, borderRadius: 12,
                        border: `1px solid ${C.border}`,
                        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                        padding: 40, textAlign: "center",
                    }}>
                        <Zap size={24} color={C.textMuted} style={{ margin: "0 auto 12px" }} />
                        <p style={{ fontSize: 13, color: C.text2, fontWeight: 500 }}>Modulo Operacional</p>
                        <p style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>Em desenvolvimento</p>
                    </div>
                )}

                {/* ── Tab Content: Config ──────────────────────── */}
                {activeTab === "config" && (
                    <div style={{
                        background: C.surface, borderRadius: 12,
                        border: `1px solid ${C.border}`,
                        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                        padding: 40, textAlign: "center",
                    }}>
                        <Settings2 size={24} color={C.textMuted} style={{ margin: "0 auto 12px" }} />
                        <p style={{ fontSize: 13, color: C.text2, fontWeight: 500 }}>Configuracoes da Empresa</p>
                        <p style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>Em desenvolvimento</p>
                    </div>
                )}

                {/* Bottom spacer */}
                <div style={{ height: 40 }} />
            </div>
        </AppLayout>
    );
}
