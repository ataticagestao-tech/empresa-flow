
import { useEffect, useMemo, useState, useCallback, useSyncExternalStore } from "react";
import { useParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { useCompanies } from "@/hooks/useCompanies";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import {
    Landmark, TrendingUp, TrendingDown, LineChart, DollarSign, Target,
    ShoppingBag, AlertTriangle, Users, PieChart, ArrowUpRight, ArrowDownRight,
    CalendarDays, BarChart2, Zap, Activity, Clock, Settings2, MoreHorizontal,
    Building2, CreditCard, Wallet, ChevronDown, ChevronUp
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, AreaChart, Area, ReferenceLine
} from "recharts";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useFinanceDashboard, type DashboardDateRange } from "@/modules/finance/presentation/hooks/useFinanceDashboard";
import { useOperationalDashboard } from "@/modules/finance/presentation/hooks/useOperationalDashboard";
import { useBankMovements } from "@/modules/finance/presentation/hooks/useBankMovements";
import { useRevenueDashboard } from "@/modules/finance/presentation/hooks/useRevenueDashboard";
import { startOfMonth, endOfMonth, subMonths, startOfYear, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";

/* ── Design Tokens ─────────────────────────────────────────── */
const C = {
    bgBase:     "#F0F2F5",
    surface:    "#FFFFFF",
    darkCard:   "#1A1F36",
    blue:       "#2563EB",
    blueLight:  "#EFF6FF",
    blueVivid:  "#3B82F6",
    blueDark:   "#1E40AF",
    green:      "#22C55E",
    greenSoft:  "#DCFCE7",
    red:        "#EF4444",
    redSoft:    "#FEE2E2",
    text1:      "#0F172A",
    text2:      "#475569",
    textMuted:  "#94A3B8",
    border:     "#E2E8F0",
    borderLight:"#F1F5F9",
} as const;

const FONT = "'Inter', -apple-system, sans-serif";

/* ── Card base styles ──────────────────────────────────────── */
const cardStyle = {
    background: C.surface,
    borderRadius: 16,
    padding: 20,
    border: `1px solid ${C.borderLight}`,
    boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)",
    transition: "box-shadow 0.2s ease, transform 0.2s ease",
} as const;

const darkCardStyle = {
    ...cardStyle,
    background: C.darkCard,
    border: "none",
    color: "#fff",
} as const;

/* ── Formatters ────────────────────────────────────────────── */
const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const fmtCompact = (v: number) =>
    new Intl.NumberFormat("pt-BR", { notation: "compact", compactDisplay: "short", style: "currency", currency: "BRL" }).format(v);
const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

/* ── Responsive hook ───────────────────────────────────────── */
function useWindowWidth() {
    const subscribe = useCallback((cb: () => void) => {
        window.addEventListener("resize", cb);
        return () => window.removeEventListener("resize", cb);
    }, []);
    return useSyncExternalStore(subscribe, () => window.innerWidth);
}

/* ── Tooltip style (dark) ──────────────────────────────────── */
const tooltipStyle = {
    backgroundColor: C.text1,
    color: "#fff",
    borderRadius: 10,
    border: "none",
    padding: "8px 14px",
    fontSize: 12,
    fontFamily: FONT,
    boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
} as const;

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
    { id: "receitas", label: "Receitas", icon: TrendingUp },
    { id: "operacional", label: "Operacional", icon: Zap },
    { id: "bancos", label: "Bancos", icon: Building2 },
    { id: "config", label: "Config", icon: Settings2 },
] as const;
type TabId = (typeof TABS)[number]["id"];

/* ── Delta Badge ────────────────────────────────────────────── */
function DeltaBadge({ value, label }: { value: number; label?: string }) {
    const isPositive = value >= 0;
    return (
        <span style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            padding: "3px 8px", borderRadius: 20,
            fontSize: 11, fontWeight: 600, fontFamily: FONT,
            background: isPositive ? C.greenSoft : C.redSoft,
            color: isPositive ? "#16A34A" : "#DC2626",
        }}>
            {isPositive ? <ArrowUpRight size={12} strokeWidth={2} /> : <ArrowDownRight size={12} strokeWidth={2} />}
            {fmtPct(value)}
            {label && <span style={{ fontWeight: 400, marginLeft: 2 }}>{label}</span>}
        </span>
    );
}

/* ── Icon Badge ─────────────────────────────────────────────── */
function IconBadge({ icon: Icon, color = C.blue, bg = C.blueLight, size = 16 }: { icon: any; color?: string; bg?: string; size?: number }) {
    return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: size + 16, height: size + 16, borderRadius: 10, background: bg }}>
            <Icon size={size} strokeWidth={1.5} color={color} />
        </div>
    );
}

/* ── Bank Account Card (expandable) ─────────────────────────── */
function BankAccountCard({ account, isMobile, fmt, fmtCompact }: {
    account: {
        id: string; name: string; banco: string; agencia: string;
        conta: string; current_balance: number; is_active: boolean;
        totalIn: number; totalOut: number; net: number; movementCount: number;
        movements: { id: string; date: string; amount: number; description: string; type: string }[];
    };
    isMobile: boolean;
    fmt: (v: number) => string;
    fmtCompact: (v: number) => string;
}) {
    const [expanded, setExpanded] = useState(false);
    const recentMovements = account.movements.slice(0, 10);

    return (
        <div style={{
            background: C.surface, borderRadius: 16, border: `1px solid ${C.borderLight}`,
            boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)",
            overflow: "hidden",
        }}>
            {/* Header */}
            <button
                onClick={() => setExpanded(!expanded)}
                style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: 20, border: "none", background: "transparent", cursor: "pointer",
                    textAlign: "left", fontFamily: FONT,
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                        width: 40, height: 40, borderRadius: 12,
                        background: C.blueLight, display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                        <Building2 size={18} strokeWidth={1.5} color={C.blue} />
                    </div>
                    <div>
                        <p style={{ fontSize: 14, fontWeight: 600, color: C.text1 }}>{account.name}</p>
                        <p style={{ fontSize: 12, color: C.textMuted, marginTop: 1 }}>
                            {account.banco}{account.agencia ? ` - Ag ${account.agencia}` : ""}{account.conta ? ` / CC ${account.conta}` : ""}
                        </p>
                    </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 12 : 32 }}>
                    {!isMobile && (
                        <>
                            <div style={{ textAlign: "right" }}>
                                <p style={{ fontSize: 11, color: C.textMuted }}>Entradas</p>
                                <p style={{ fontSize: 14, fontWeight: 600, color: C.green, fontVariantNumeric: "tabular-nums" }}>{fmtCompact(account.totalIn)}</p>
                            </div>
                            <div style={{ textAlign: "right" }}>
                                <p style={{ fontSize: 11, color: C.textMuted }}>Saidas</p>
                                <p style={{ fontSize: 14, fontWeight: 600, color: C.red, fontVariantNumeric: "tabular-nums" }}>{fmtCompact(account.totalOut)}</p>
                            </div>
                        </>
                    )}
                    <div style={{ textAlign: "right" }}>
                        <p style={{ fontSize: 11, color: C.textMuted }}>Saldo</p>
                        <p style={{ fontSize: 16, fontWeight: 700, color: C.text1, fontVariantNumeric: "tabular-nums" }}>{fmt(account.current_balance)}</p>
                    </div>
                    {expanded ? <ChevronUp size={16} color={C.textMuted} /> : <ChevronDown size={16} color={C.textMuted} />}
                </div>
            </button>

            {/* Expanded: stats + movements */}
            {expanded && (
                <div style={{ borderTop: `1px solid ${C.borderLight}` }}>
                    {/* Quick stats on mobile */}
                    {isMobile && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0, borderBottom: `1px solid ${C.borderLight}` }}>
                            {[
                                { label: "Entradas", value: fmtCompact(account.totalIn), color: C.green },
                                { label: "Saidas", value: fmtCompact(account.totalOut), color: C.red },
                                { label: "Liquido", value: fmtCompact(account.net), color: account.net >= 0 ? C.green : C.red },
                            ].map((s) => (
                                <div key={s.label} style={{ padding: "12px 16px", textAlign: "center" }}>
                                    <p style={{ fontSize: 11, color: C.textMuted }}>{s.label}</p>
                                    <p style={{ fontSize: 14, fontWeight: 600, color: s.color, fontVariantNumeric: "tabular-nums" }}>{s.value}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Movement count + flow bar */}
                    <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.borderLight}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 500, color: C.text2 }}>{account.movementCount} movimentacoes no periodo</span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: account.net >= 0 ? C.green : C.red, fontVariantNumeric: "tabular-nums" }}>
                                Liquido: {fmt(account.net)}
                            </span>
                        </div>
                        {/* Stacked bar */}
                        {(account.totalIn + account.totalOut) > 0 && (
                            <div style={{ display: "flex", height: 6, borderRadius: 99, overflow: "hidden", background: C.borderLight }}>
                                <div style={{ width: `${(account.totalIn / (account.totalIn + account.totalOut)) * 100}%`, background: C.green, borderRadius: "99px 0 0 99px" }} />
                                <div style={{ width: `${(account.totalOut / (account.totalIn + account.totalOut)) * 100}%`, background: C.red, borderRadius: "0 99px 99px 0" }} />
                            </div>
                        )}
                    </div>

                    {/* Recent movements list */}
                    {recentMovements.length === 0 ? (
                        <div style={{ padding: "24px 20px", textAlign: "center" }}>
                            <p style={{ fontSize: 13, color: C.textMuted, fontStyle: "italic" }}>Nenhuma movimentacao neste periodo</p>
                        </div>
                    ) : (
                        <div>
                            <div style={{ padding: "10px 20px", display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${C.borderLight}` }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Ultimas movimentacoes</span>
                                <span style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Valor</span>
                            </div>
                            {recentMovements.map((mov) => (
                                <div
                                    key={mov.id}
                                    style={{
                                        display: "flex", justifyContent: "space-between", alignItems: "center",
                                        padding: "10px 20px",
                                        borderBottom: `1px solid ${C.borderLight}`,
                                    }}
                                >
                                    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                                        <div style={{
                                            width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                                            display: "flex", alignItems: "center", justifyContent: "center",
                                            background: mov.type === "credit" ? C.greenSoft : C.redSoft,
                                        }}>
                                            {mov.type === "credit"
                                                ? <ArrowUpRight size={14} strokeWidth={2} color={C.green} />
                                                : <ArrowDownRight size={14} strokeWidth={2} color={C.red} />
                                            }
                                        </div>
                                        <div style={{ minWidth: 0 }}>
                                            <p style={{ fontSize: 13, fontWeight: 500, color: C.text1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                                                {mov.description || "Sem descricao"}
                                            </p>
                                            <p style={{ fontSize: 11, color: C.textMuted }}>
                                                {format(new Date(mov.date), "dd/MM/yyyy")}
                                            </p>
                                        </div>
                                    </div>
                                    <span style={{
                                        fontSize: 14, fontWeight: 600, flexShrink: 0, marginLeft: 12,
                                        color: mov.type === "credit" ? C.green : C.red,
                                        fontVariantNumeric: "tabular-nums",
                                    }}>
                                        {mov.type === "credit" ? "+" : "-"}{fmt(mov.amount)}
                                    </span>
                                </div>
                            ))}
                            {account.movements.length > 10 && (
                                <div style={{ padding: "12px 20px", textAlign: "center" }}>
                                    <span style={{ fontSize: 12, color: C.blue, fontWeight: 500 }}>
                                        + {account.movements.length - 10} movimentacoes
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/* ════════════════════════════════════════════════════════════ */

export default function CompanyDashboard() {
    const { id } = useParams<{ id: string }>();
    const { user, activeClient, isUsingSecondary } = useAuth();
    const { companies } = useCompanies(user?.id);
    const { setSelectedCompany, selectedCompany } = useCompany();
    const width = useWindowWidth();
    const isMobile = width < 768;
    const isTablet = width >= 768 && width < 1280;

    const [activeTab, setActiveTab] = useState<TabId>("financeiro");
    const [dateRange, setDateRange] = useState<DashboardDateRange>({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) });
    const [calendarRange, setCalendarRange] = useState<DateRange | undefined>({ from: dateRange.from, to: dateRange.to });
    const [activePreset, setActivePreset] = useState("Este mes");

    useEffect(() => {
        if (id && companies) {
            const company = companies.find(c => c.id === id);
            if (company) setSelectedCompany(company);
        }
    }, [id, companies, setSelectedCompany]);

    const companyId = selectedCompany?.id || null;
    const { accountsBalance, receivablesSummary, payablesSummary, cashFlowData, dreSummary } = useFinanceDashboard(dateRange);
    const op = useOperationalDashboard(dateRange);
    const bank = useBankMovements(dateRange);
    const rev = useRevenueDashboard(dateRange);

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

    const handlePreset = (p: typeof presets[number]) => {
        const r = p.get();
        setDateRange(r);
        setCalendarRange({ from: r.from, to: r.to });
        setActivePreset(p.label);
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
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: "80px 0" }}>
                    <div style={{ width: 32, height: 32, border: `3px solid ${C.blue}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                    <p style={{ fontSize: 13, color: C.text2, marginTop: 12, fontFamily: FONT }}>Carregando dados...</p>
                </div>
            </AppLayout>
        );
    }

    const totalReceivables = (receivablesSummary?.overdue || 0) + (receivablesSummary?.today || 0) + (receivablesSummary?.period || 0);
    const totalPayables = (payablesSummary?.overdue || 0) + (payablesSummary?.today || 0) + (payablesSummary?.period || 0);
    const projectedBalance = chartData[chartData.length - 1]?.saldo_acumulado || 0;
    const dreTotal = dreSummary?.reduce((acc: number, curr: any) => acc + curr.total, 0) ?? 0;

    const dateLabel = `${format(dateRange.from, "dd MMM", { locale: ptBR })} - ${format(dateRange.to, "dd MMM yyyy", { locale: ptBR })}`;
    const chartHeight = isMobile ? 160 : isTablet ? 200 : 240;

    /* ── KPI data ──────────────────────────────────────────── */
    const kpis = [
        { id: "balance",     label: "Saldo Bancario",  value: fmt(accountsBalance || 0),    icon: Landmark,     iconBg: C.blueLight, iconColor: C.blue,  detail: "Conciliado" },
        { id: "receivables", label: "A Receber",        value: fmt(totalReceivables),         icon: TrendingUp,   iconBg: C.greenSoft, iconColor: C.green, detail: `Vencidos: ${fmtCompact(receivablesSummary?.overdue || 0)}` },
        { id: "payables",    label: "A Pagar",          value: fmt(totalPayables),            icon: TrendingDown,  iconBg: C.redSoft,   iconColor: C.red,   detail: `Vencidos: ${fmtCompact(payablesSummary?.overdue || 0)}` },
        { id: "projection",  label: "Projecao",         value: fmt(projectedBalance),         icon: LineChart,    iconBg: C.blueLight, iconColor: C.blue,  detail: "Fim do periodo" },
    ];

    return (
        <AppLayout title={`${selectedCompany.nome_fantasia || selectedCompany.razao_social}`}>
            <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: FONT }}>

                {/* ── Page Header ─────────────────────────────── */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                    <div>
                        <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text1, letterSpacing: "-0.02em" }}>
                            {selectedCompany.nome_fantasia || selectedCompany.razao_social}
                        </h2>
                        <p style={{ fontSize: 13, color: C.text2, marginTop: 2 }}>Visao financeira consolidada</p>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        {/* Toggle presets */}
                        <div style={{ display: "flex", background: C.borderLight, borderRadius: 10, padding: 3, gap: 2 }}>
                            {presets.map((p) => (
                                <button
                                    key={p.label}
                                    onClick={() => handlePreset(p)}
                                    style={{
                                        padding: "5px 12px", borderRadius: 8, border: "none",
                                        fontSize: 12, fontWeight: activePreset === p.label ? 500 : 400,
                                        fontFamily: FONT, cursor: "pointer",
                                        background: activePreset === p.label ? C.surface : "transparent",
                                        color: activePreset === p.label ? C.text1 : C.textMuted,
                                        boxShadow: activePreset === p.label ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                                        transition: "all 0.15s ease",
                                    }}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>

                        <Popover>
                            <PopoverTrigger asChild>
                                <button style={{
                                    display: "flex", alignItems: "center", gap: 6,
                                    padding: "6px 12px", fontSize: 12, fontWeight: 500, fontFamily: FONT,
                                    borderRadius: 10, border: `1px solid ${C.border}`,
                                    background: C.surface, color: C.text2, cursor: "pointer",
                                }}>
                                    <CalendarDays size={14} strokeWidth={1.5} color={C.textMuted} />
                                    {dateLabel}
                                </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="end">
                                <Calendar mode="range" selected={calendarRange} onSelect={handleCalendarSelect} numberOfMonths={isMobile ? 1 : 2} defaultMonth={dateRange.from} />
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>

                {/* ── KPI Cards ───────────────────────────────── */}
                <div style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr 1fr" : "1fr 1fr 1fr 1fr",
                    gap: 16,
                }}>
                    {kpis.map((kpi) => (
                        <div key={kpi.id} style={cardStyle}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                                <IconBadge icon={kpi.icon} color={kpi.iconColor} bg={kpi.iconBg} size={18} />
                                <MoreHorizontal size={16} strokeWidth={1.5} color={C.textMuted} style={{ cursor: "pointer" }} />
                            </div>
                            <p style={{ fontSize: 12, fontWeight: 500, color: C.textMuted, marginBottom: 6 }}>{kpi.label}</p>
                            <p style={{ fontSize: 28, fontWeight: 700, color: C.text1, letterSpacing: "-0.02em", lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
                                {kpi.value}
                            </p>
                            <p style={{ fontSize: 11, color: C.textMuted, marginTop: 8 }}>{kpi.detail}</p>
                        </div>
                    ))}
                </div>

                {/* ── Tab Bar ─────────────────────────────────── */}
                <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, gap: 0 }}>
                    {TABS.map((tab) => {
                        const isActive = activeTab === tab.id;
                        const TabIcon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                style={{
                                    display: "flex", alignItems: "center", gap: 8,
                                    padding: "12px 24px", border: "none",
                                    fontSize: 13, fontWeight: isActive ? 600 : 400, fontFamily: FONT,
                                    color: isActive ? C.blue : C.textMuted,
                                    background: "transparent", cursor: "pointer",
                                    borderBottom: isActive ? `2px solid ${C.blue}` : "2px solid transparent",
                                    transition: "all 0.15s ease",
                                    marginBottom: -1,
                                }}
                            >
                                <TabIcon size={14} strokeWidth={1.5} />
                                {(!isMobile || isActive) && <span>{tab.label}</span>}
                            </button>
                        );
                    })}
                </div>

                {/* ══════════════════════════════════════════════ */}
                {/* TAB: FINANCEIRO                                */}
                {/* ══════════════════════════════════════════════ */}
                {activeTab === "financeiro" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                        {/* ── Row 1: Cash Flow (wide) + Hero KPI ─── */}
                        <div style={{
                            display: "grid",
                            gridTemplateColumns: isMobile ? "1fr" : "1fr 280px",
                            gap: 16,
                        }}>
                            {/* Cash Flow Chart */}
                            <div style={cardStyle}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                                    <div>
                                        <p style={{ fontSize: 14, fontWeight: 600, color: C.text1 }}>Fluxo de Caixa</p>
                                        <p style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{dateLabel}</p>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                            <div style={{ width: 8, height: 8, borderRadius: 2, background: C.green }} />
                                            <span style={{ fontSize: 11, color: C.text2, fontWeight: 500 }}>Entradas</span>
                                        </div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                            <div style={{ width: 8, height: 8, borderRadius: 2, background: C.red }} />
                                            <span style={{ fontSize: 11, color: C.text2, fontWeight: 500 }}>Saidas</span>
                                        </div>
                                    </div>
                                </div>
                                <div style={{ height: chartHeight }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={chartData} margin={{ top: 8, right: 8, left: -4, bottom: 0 }} stackOffset="sign" barCategoryGap="30%">
                                            <CartesianGrid strokeDasharray="4 4" vertical={false} stroke={C.borderLight} />
                                            <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: C.textMuted, fontSize: 11 }} dy={8} />
                                            <YAxis tickLine={false} axisLine={false} tick={{ fill: C.textMuted, fontSize: 11 }} tickFormatter={(v) => { const a = Math.abs(v); return a >= 1000 ? `${(a / 1000).toFixed(0)}k` : `${a}`; }} width={40} />
                                            <Tooltip formatter={(v: number, n: string) => [fmt(Math.abs(v)), n === "despesas_neg" ? "Saidas" : "Entradas"]} contentStyle={tooltipStyle} cursor={{ fill: "rgba(37,99,235,0.04)" }} />
                                            <ReferenceLine y={0} stroke={C.border} strokeWidth={1} />
                                            <Bar dataKey="receitas" name="Entradas" fill={C.green} radius={[6, 6, 0, 0]} maxBarSize={22} stackId="flow" />
                                            <Bar dataKey="despesas_neg" name="despesas_neg" fill={C.red} radius={[0, 0, 6, 6]} maxBarSize={22} stackId="flow" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Hero KPI — Projecao (dark card) */}
                            <div style={{ ...darkCardStyle, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                                <div>
                                    <p style={{ fontSize: 12, fontWeight: 500, color: C.textMuted }}>Projecao de Saldo</p>
                                    <p style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>Fim do periodo</p>
                                </div>
                                <div>
                                    <p style={{ fontSize: isMobile ? 32 : 40, fontWeight: 800, color: "#fff", letterSpacing: "-0.03em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                                        {fmtCompact(projectedBalance)}
                                    </p>
                                    <div style={{ marginTop: 12 }}>
                                        <DeltaBadge value={projectedBalance >= 0 ? 100 : -100} />
                                    </div>
                                </div>
                                {/* Progress bar */}
                                <div>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                                        <span style={{ fontSize: 11, color: "#64748B" }}>Cobertura</span>
                                        <span style={{ fontSize: 11, color: "#94A3B8", fontWeight: 600 }}>
                                            {totalPayables > 0 ? Math.min(100, Math.round(((accountsBalance || 0) / totalPayables) * 100)) : 100}%
                                        </span>
                                    </div>
                                    <div style={{ height: 6, borderRadius: 99, background: "#2D3561" }}>
                                        <div style={{
                                            height: 6, borderRadius: 99, background: C.blue,
                                            width: `${totalPayables > 0 ? Math.min(100, Math.round(((accountsBalance || 0) / totalPayables) * 100)) : 100}%`,
                                            transition: "width 0.4s ease",
                                        }} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ── Row 2: Projecao Chart + DRE ──────── */}
                        <div style={{
                            display: "grid",
                            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                            gap: 16,
                        }}>
                            {/* Projecao de Saldo — Area Chart */}
                            <div style={cardStyle}>
                                <p style={{ fontSize: 14, fontWeight: 600, color: C.text1, marginBottom: 16 }}>Saldo Acumulado</p>
                                <div style={{ height: chartHeight }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor={C.blue} stopOpacity={0.15} />
                                                    <stop offset="95%" stopColor={C.blue} stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="4 4" vertical={false} stroke={C.borderLight} />
                                            <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: C.textMuted, fontSize: 11 }} interval="preserveStartEnd" minTickGap={30} />
                                            <YAxis tickLine={false} axisLine={false} tick={{ fill: C.textMuted, fontSize: 11 }} tickFormatter={(v) => `${v >= 0 ? "" : "-"}${Math.abs(v) >= 1000 ? `${(Math.abs(v) / 1000).toFixed(0)}k` : Math.abs(v)}`} />
                                            <Tooltip formatter={(v) => fmt(v as number)} contentStyle={tooltipStyle} />
                                            <ReferenceLine y={0} stroke={C.border} strokeDasharray="4 4" />
                                            <Area type="monotone" dataKey="saldo_acumulado" name="Saldo" stroke={C.blue} strokeWidth={2} fillOpacity={1} fill="url(#blueGrad)" dot={false} activeDot={{ r: 5, fill: C.surface, stroke: C.blue, strokeWidth: 2 }} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* DRE */}
                            <div style={cardStyle}>
                                <p style={{ fontSize: 14, fontWeight: 600, color: C.text1, marginBottom: 16 }}>Resultado (DRE)</p>

                                {(!dreSummary || dreSummary.length === 0) ? (
                                    <p style={{ fontSize: 13, color: C.textMuted, textAlign: "center", padding: "40px 0", fontStyle: "italic" }}>
                                        Nenhuma transacao categorizada neste periodo.
                                    </p>
                                ) : (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                                        {dreSummary.map((g: any) => (
                                            <div key={g.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.borderLight}` }}>
                                                <span style={{ fontSize: 13, fontWeight: 500, color: C.text1 }}>{g.name}</span>
                                                <span style={{ fontSize: 14, fontWeight: 600, color: g.total >= 0 ? C.green : C.red, fontVariantNumeric: "tabular-nums" }}>
                                                    {fmt(g.total)}
                                                </span>
                                            </div>
                                        ))}
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0 0" }}>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: C.text1 }}>RESULTADO LIQUIDO</span>
                                            <span style={{ fontSize: 18, fontWeight: 800, color: dreTotal >= 0 ? C.green : C.red, fontVariantNumeric: "tabular-nums" }}>
                                                {fmt(dreTotal)}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ── Row 3: Contas Vencidas + Saude + Config */}
                        <div style={{
                            display: "grid",
                            gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr 1fr" : "1fr 1fr 1fr",
                            gap: 16,
                        }}>
                            {/* Contas Vencidas */}
                            <div style={cardStyle}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                                    <IconBadge icon={Clock} color={C.red} bg={C.redSoft} size={16} />
                                    <p style={{ fontSize: 14, fontWeight: 600, color: C.text1 }}>Contas Vencidas</p>
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <span style={{ fontSize: 13, color: C.text2 }}>A Receber vencidas</span>
                                        <span style={{ fontSize: 16, fontWeight: 700, color: C.red, fontVariantNumeric: "tabular-nums" }}>{fmt(receivablesSummary?.overdue || 0)}</span>
                                    </div>
                                    <div style={{ height: 1, background: C.borderLight }} />
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <span style={{ fontSize: 13, color: C.text2 }}>A Pagar vencidas</span>
                                        <span style={{ fontSize: 16, fontWeight: 700, color: C.red, fontVariantNumeric: "tabular-nums" }}>{fmt(payablesSummary?.overdue || 0)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Saude Financeira */}
                            <div style={cardStyle}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                                    <IconBadge icon={Activity} color={C.green} bg={C.greenSoft} size={16} />
                                    <p style={{ fontSize: 14, fontWeight: 600, color: C.text1 }}>Saude Financeira</p>
                                </div>
                                {(() => {
                                    const score = totalPayables > 0 ? Math.min(100, Math.round(((accountsBalance || 0) / totalPayables) * 100)) : 100;
                                    const scoreColor = score >= 70 ? C.green : score >= 40 ? "#F59E0B" : C.red;
                                    const scoreLabel = score >= 70 ? "Saudavel" : score >= 40 ? "Atencao" : "Critico";
                                    return (
                                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "8px 0" }}>
                                            <div style={{ position: "relative", width: 100, height: 100 }}>
                                                <svg viewBox="0 0 100 100" width={100} height={100}>
                                                    <circle cx="50" cy="50" r="42" fill="none" stroke={C.borderLight} strokeWidth="8" strokeDasharray="198 66" strokeLinecap="round" transform="rotate(135 50 50)" />
                                                    <circle cx="50" cy="50" r="42" fill="none" stroke={scoreColor} strokeWidth="8" strokeDasharray={`${(score / 100) * 198} ${264 - (score / 100) * 198}`} strokeLinecap="round" transform="rotate(135 50 50)" />
                                                </svg>
                                                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                                                    <span style={{ fontSize: 24, fontWeight: 800, color: C.text1 }}>{score}</span>
                                                </div>
                                            </div>
                                            <span style={{
                                                fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20,
                                                background: score >= 70 ? C.greenSoft : score >= 40 ? "#FEF3C7" : C.redSoft,
                                                color: score >= 70 ? "#16A34A" : score >= 40 ? "#92400E" : "#DC2626",
                                            }}>
                                                {scoreLabel}
                                            </span>
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* Config */}
                            <div style={cardStyle}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                                    <IconBadge icon={Settings2} color={C.blue} bg={C.blueLight} size={16} />
                                    <p style={{ fontSize: 14, fontWeight: 600, color: C.text1 }}>Configuracao</p>
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                                    {[
                                        { label: "NFS-e", ok: isNfseConfigured },
                                        { label: "Plano de Contas", ok: dreSummary && dreSummary.length > 0 },
                                        { label: "Certificado Digital", ok: false },
                                    ].map((item, i, arr) => (
                                        <div key={item.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: i < arr.length - 1 ? `1px solid ${C.borderLight}` : "none" }}>
                                            <span style={{ fontSize: 13, color: C.text2 }}>{item.label}</span>
                                            <span style={{
                                                fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20,
                                                background: item.ok ? C.greenSoft : C.borderLight,
                                                color: item.ok ? "#16A34A" : C.textMuted,
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

                {/* ══════════════════════════════════════════════ */}
                {/* TAB: RECEITAS                                    */}
                {/* ══════════════════════════════════════════════ */}
                {activeTab === "receitas" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                        {/* KPIs row */}
                        <div style={{
                            display: "grid",
                            gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr 1fr" : "1fr 1fr 1fr",
                            gap: 16,
                        }}>
                            <div style={cardStyle}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                                    <IconBadge icon={DollarSign} color={C.green} bg={C.greenSoft} size={18} />
                                </div>
                                <p style={{ fontSize: 12, fontWeight: 500, color: C.textMuted, marginBottom: 6 }}>Receita Total</p>
                                <p style={{ fontSize: 28, fontWeight: 700, color: C.text1, letterSpacing: "-0.02em", lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
                                    {fmt(rev.totalRevenue)}
                                </p>
                                <p style={{ fontSize: 11, color: C.textMuted, marginTop: 8 }}>{dateLabel}</p>
                            </div>
                            <div style={cardStyle}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                                    <IconBadge icon={ShoppingBag} color={C.blue} bg={C.blueLight} size={18} />
                                </div>
                                <p style={{ fontSize: 12, fontWeight: 500, color: C.textMuted, marginBottom: 6 }}>Transacoes</p>
                                <p style={{ fontSize: 28, fontWeight: 700, color: C.text1, letterSpacing: "-0.02em", lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
                                    {rev.totalTransactions}
                                </p>
                                <p style={{ fontSize: 11, color: C.textMuted, marginTop: 8 }}>Vendas no periodo</p>
                            </div>
                            <div style={cardStyle}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                                    <IconBadge icon={Target} color={C.blue} bg={C.blueLight} size={18} />
                                </div>
                                <p style={{ fontSize: 12, fontWeight: 500, color: C.textMuted, marginBottom: 6 }}>Ticket Medio</p>
                                <p style={{ fontSize: 28, fontWeight: 700, color: C.text1, letterSpacing: "-0.02em", lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
                                    {fmt(rev.totalTransactions > 0 ? rev.totalRevenue / rev.totalTransactions : 0)}
                                </p>
                                <p style={{ fontSize: 11, color: C.textMuted, marginTop: 8 }}>Por transacao</p>
                            </div>
                        </div>

                        {/* Row: Vendas por Servico + Forma de Pagamento */}
                        <div style={{
                            display: "grid",
                            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                            gap: 16,
                        }}>
                            {/* Vendas por Servico */}
                            <div style={cardStyle}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                                    <IconBadge icon={PieChart} color={C.blue} bg={C.blueLight} size={16} />
                                    <p style={{ fontSize: 14, fontWeight: 600, color: C.text1 }}>Vendas por Servico</p>
                                </div>
                                {rev.revenueByService.length === 0 ? (
                                    <p style={{ fontSize: 13, color: C.textMuted, textAlign: "center", padding: "24px 0", fontStyle: "italic" }}>Nenhuma receita no periodo</p>
                                ) : (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                                        {/* Header */}
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 70px", gap: 8, padding: "0 0 10px", borderBottom: `1px solid ${C.borderLight}` }}>
                                            <span style={{ fontSize: 10, fontWeight: 600, color: C.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Servico</span>
                                            <span style={{ fontSize: 10, fontWeight: 600, color: C.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.05em", textAlign: "right" }}>Valor</span>
                                            <span style={{ fontSize: 10, fontWeight: 600, color: C.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.05em", textAlign: "right" }}>%</span>
                                        </div>
                                        {rev.revenueByService.map((s, i) => {
                                            const barColors = [C.blue, C.blueVivid, C.blueDark, C.green, "#8B5CF6", "#EC4899", "#F59E0B", "#14B8A6"];
                                            const barColor = barColors[i % barColors.length];
                                            return (
                                                <div key={s.name} style={{ display: "grid", gridTemplateColumns: "1fr 100px 70px", gap: 8, alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${C.borderLight}` }}>
                                                    <div style={{ minWidth: 0 }}>
                                                        <p style={{ fontSize: 13, fontWeight: 500, color: C.text1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{s.name}</p>
                                                        <div style={{ height: 4, borderRadius: 99, background: C.borderLight, marginTop: 6, maxWidth: 160 }}>
                                                            <div style={{ height: 4, borderRadius: 99, background: barColor, width: `${s.percentage}%`, transition: "width 0.4s ease" }} />
                                                        </div>
                                                    </div>
                                                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text1, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtCompact(s.total)}</span>
                                                    <span style={{ fontSize: 12, fontWeight: 600, color: C.blue, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{s.percentage.toFixed(1)}%</span>
                                                </div>
                                            );
                                        })}
                                        {/* Total row */}
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 70px", gap: 8, padding: "14px 0 0" }}>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: C.text1 }}>TOTAL</span>
                                            <span style={{ fontSize: 14, fontWeight: 800, color: C.green, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(rev.totalRevenue)}</span>
                                            <span style={{ fontSize: 12, fontWeight: 700, color: C.text1, textAlign: "right" }}>100%</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Forma de Pagamento */}
                            <div style={cardStyle}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                                    <IconBadge icon={CreditCard} color={C.green} bg={C.greenSoft} size={16} />
                                    <p style={{ fontSize: 14, fontWeight: 600, color: C.text1 }}>Forma de Pagamento</p>
                                </div>
                                {rev.revenueByPaymentMethod.length === 0 ? (
                                    <p style={{ fontSize: 13, color: C.textMuted, textAlign: "center", padding: "24px 0", fontStyle: "italic" }}>Nenhum dado no periodo</p>
                                ) : (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                                        {/* Stacked bar overview */}
                                        <div style={{ display: "flex", height: 10, borderRadius: 99, overflow: "hidden", marginBottom: 20 }}>
                                            {rev.revenueByPaymentMethod.map((pm, i) => {
                                                const pmColors = [C.green, C.blue, "#8B5CF6", "#F59E0B", "#EC4899", C.red, "#14B8A6", "#6366F1"];
                                                return (
                                                    <div
                                                        key={pm.method}
                                                        style={{
                                                            width: `${pm.percentage}%`,
                                                            background: pmColors[i % pmColors.length],
                                                            transition: "width 0.4s ease",
                                                        }}
                                                    />
                                                );
                                            })}
                                        </div>
                                        {/* Items */}
                                        {rev.revenueByPaymentMethod.map((pm, i) => {
                                            const pmColors = [C.green, C.blue, "#8B5CF6", "#F59E0B", "#EC4899", C.red, "#14B8A6", "#6366F1"];
                                            const dotColor = pmColors[i % pmColors.length];
                                            return (
                                                <div key={pm.method} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${C.borderLight}` }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                        <div style={{ width: 10, height: 10, borderRadius: 99, background: dotColor, flexShrink: 0 }} />
                                                        <div>
                                                            <p style={{ fontSize: 13, fontWeight: 500, color: C.text1 }}>{pm.method}</p>
                                                            <p style={{ fontSize: 11, color: C.textMuted }}>{pm.count} transacao{pm.count !== 1 ? "es" : ""}</p>
                                                        </div>
                                                    </div>
                                                    <div style={{ textAlign: "right" }}>
                                                        <p style={{ fontSize: 14, fontWeight: 600, color: C.text1, fontVariantNumeric: "tabular-nums" }}>{fmt(pm.total)}</p>
                                                        <p style={{ fontSize: 11, fontWeight: 600, color: dotColor }}>{pm.percentage.toFixed(1)}%</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Revenue chart (bar) */}
                        <div style={cardStyle}>
                            <p style={{ fontSize: 14, fontWeight: 600, color: C.text1, marginBottom: 16 }}>Receitas no Periodo</p>
                            <div style={{ height: chartHeight }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData.filter((d: any) => d.receitas > 0)} margin={{ top: 8, right: 8, left: -4, bottom: 0 }} barCategoryGap="30%">
                                        <CartesianGrid strokeDasharray="4 4" vertical={false} stroke={C.borderLight} />
                                        <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: C.textMuted, fontSize: 11 }} dy={8} />
                                        <YAxis tickLine={false} axisLine={false} tick={{ fill: C.textMuted, fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} width={40} />
                                        <Tooltip formatter={(v: number) => [fmt(v), "Receita"]} contentStyle={tooltipStyle} cursor={{ fill: "rgba(34,197,94,0.04)" }} />
                                        <Bar dataKey="receitas" name="Receitas" fill={C.green} radius={[6, 6, 0, 0]} maxBarSize={28} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                )}

                {/* ══════════════════════════════════════════════ */}
                {/* TAB: OPERACIONAL                                */}
                {/* ══════════════════════════════════════════════ */}
                {activeTab === "operacional" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                        {/* Op KPIs */}
                        <div style={{
                            display: "grid",
                            gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr 1fr" : "1fr 1fr 1fr 1fr",
                            gap: 16,
                        }}>
                            {[
                                { label: "Faturamento", value: fmt(op.revenue), icon: DollarSign, iconBg: C.blueLight, iconColor: C.blue, delta: op.revenue > 0 ? 12.3 : 0, detail: `${op.salesCount} transacoes` },
                                { label: "Ticket Medio", value: fmt(op.avgTicket), icon: Target, iconBg: C.blueLight, iconColor: C.blue, delta: 0, detail: "Por venda" },
                                { label: "N. de Vendas", value: String(op.salesCount), icon: ShoppingBag, iconBg: C.greenSoft, iconColor: C.green, delta: 0, detail: fmtCompact(op.revenue) },
                                { label: "Margem", value: `${op.margin.toFixed(1)}%`, icon: BarChart2, iconBg: op.margin >= 0 ? C.greenSoft : C.redSoft, iconColor: op.margin >= 0 ? C.green : C.red, delta: op.margin, detail: `Despesas: ${fmtCompact(op.expenses)}` },
                            ].map((kpi) => (
                                <div key={kpi.label} style={cardStyle}>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                                        <IconBadge icon={kpi.icon} color={kpi.iconColor} bg={kpi.iconBg} size={18} />
                                        <MoreHorizontal size={16} strokeWidth={1.5} color={C.textMuted} />
                                    </div>
                                    <p style={{ fontSize: 12, fontWeight: 500, color: C.textMuted, marginBottom: 6 }}>{kpi.label}</p>
                                    <p style={{ fontSize: 28, fontWeight: 700, color: C.text1, letterSpacing: "-0.02em", lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
                                        {kpi.value}
                                    </p>
                                    <p style={{ fontSize: 11, color: C.textMuted, marginTop: 8 }}>{kpi.detail}</p>
                                </div>
                            ))}
                        </div>

                        {/* Inadimplencia + Resumo */}
                        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                            {/* Inadimplencia */}
                            <div style={cardStyle}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                                    <IconBadge icon={AlertTriangle} color="#F59E0B" bg="#FEF3C7" size={16} />
                                    <p style={{ fontSize: 14, fontWeight: 600, color: C.text1 }}>Inadimplencia</p>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                                    <div style={{ position: "relative", width: 104, height: 104, flexShrink: 0 }}>
                                        <svg viewBox="0 0 104 104" width={104} height={104}>
                                            <circle cx="52" cy="52" r="42" fill="none" stroke={C.borderLight} strokeWidth="12" />
                                            <circle cx="52" cy="52" r="42" fill="none" stroke={op.defaultRate.rate > 20 ? C.red : op.defaultRate.rate > 10 ? "#F59E0B" : C.green} strokeWidth="12" strokeDasharray={`${(op.defaultRate.rate / 100) * 264} ${264 - (op.defaultRate.rate / 100) * 264}`} strokeLinecap="round" transform="rotate(-90 52 52)" />
                                        </svg>
                                        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                            <span style={{ fontSize: 20, fontWeight: 700, color: C.text1 }}>{op.defaultRate.rate.toFixed(1)}%</span>
                                        </div>
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                        <div>
                                            <p style={{ fontSize: 11, color: C.textMuted }}>Titulos vencidos</p>
                                            <p style={{ fontSize: 18, fontWeight: 700, color: C.red }}>{op.defaultRate.overdueCount}</p>
                                        </div>
                                        <div>
                                            <p style={{ fontSize: 11, color: C.textMuted }}>Total de titulos</p>
                                            <p style={{ fontSize: 18, fontWeight: 700, color: C.text1 }}>{op.defaultRate.totalCount}</p>
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        <div style={{ width: 8, height: 8, borderRadius: 99, background: op.defaultRate.rate > 20 ? C.red : op.defaultRate.rate > 10 ? "#F59E0B" : C.green }} />
                                        <span style={{ fontSize: 11, color: C.text2 }}>Inadimplente</span>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        <div style={{ width: 8, height: 8, borderRadius: 99, background: C.borderLight }} />
                                        <span style={{ fontSize: 11, color: C.text2 }}>Adimplente</span>
                                    </div>
                                </div>
                            </div>

                            {/* Resumo Financeiro */}
                            <div style={cardStyle}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                                    <IconBadge icon={Activity} color={C.blue} bg={C.blueLight} size={16} />
                                    <p style={{ fontSize: 14, fontWeight: 600, color: C.text1 }}>Resumo</p>
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <ArrowUpRight size={14} strokeWidth={2} color={C.green} />
                                            <span style={{ fontSize: 13, color: C.text1 }}>Receitas</span>
                                        </div>
                                        <span style={{ fontSize: 15, fontWeight: 700, color: C.green, fontVariantNumeric: "tabular-nums" }}>{fmt(op.revenue)}</span>
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <ArrowDownRight size={14} strokeWidth={2} color={C.red} />
                                            <span style={{ fontSize: 13, color: C.text1 }}>Despesas</span>
                                        </div>
                                        <span style={{ fontSize: 15, fontWeight: 700, color: C.red, fontVariantNumeric: "tabular-nums" }}>{fmt(op.expenses)}</span>
                                    </div>
                                    <div style={{ height: 1, background: C.borderLight }} />
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text1 }}>RESULTADO</span>
                                        <span style={{ fontSize: 20, fontWeight: 800, color: (op.revenue - op.expenses) >= 0 ? C.green : C.red, fontVariantNumeric: "tabular-nums" }}>{fmt(op.revenue - op.expenses)}</span>
                                    </div>
                                    <div>
                                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                            <span style={{ fontSize: 11, color: C.textMuted }}>Margem</span>
                                            <DeltaBadge value={op.margin} />
                                        </div>
                                        <div style={{ height: 6, borderRadius: 99, background: C.borderLight }}>
                                            <div style={{ height: 6, borderRadius: 99, background: op.margin >= 0 ? C.green : C.red, width: `${Math.min(100, Math.max(0, op.margin))}%`, transition: "width 0.4s ease" }} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Rankings */}
                        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                            {/* Top Clientes */}
                            <div style={cardStyle}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                                    <IconBadge icon={Users} color={C.blue} bg={C.blueLight} size={16} />
                                    <p style={{ fontSize: 14, fontWeight: 600, color: C.text1 }}>Top Clientes</p>
                                </div>
                                {op.topClients.length === 0 ? (
                                    <p style={{ fontSize: 13, color: C.textMuted, textAlign: "center", padding: "24px 0", fontStyle: "italic" }}>Nenhum dado no periodo</p>
                                ) : (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                        {op.topClients.map((c, i) => {
                                            const max = op.topClients[0]?.total || 1;
                                            const opacities = [1, 0.85, 0.7, 0.55, 0.4];
                                            return (
                                                <div key={c.name}>
                                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                                                        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                                                            <span style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, width: 16 }}>{i + 1}</span>
                                                            <span style={{ fontSize: 13, fontWeight: 500, color: C.text1 }}>{c.name}</span>
                                                        </div>
                                                        <span style={{ fontSize: 12, fontWeight: 600, color: C.text2, fontVariantNumeric: "tabular-nums" }}>{fmtCompact(c.total)}</span>
                                                    </div>
                                                    <div style={{ height: 4, borderRadius: 99, background: C.borderLight }}>
                                                        <div style={{ height: 4, borderRadius: 99, background: C.blue, opacity: opacities[i] ?? 0.3, width: `${(c.total / max) * 100}%`, transition: "width 0.4s ease" }} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Top Despesas */}
                            <div style={cardStyle}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                                    <IconBadge icon={PieChart} color={C.red} bg={C.redSoft} size={16} />
                                    <p style={{ fontSize: 14, fontWeight: 600, color: C.text1 }}>Top Despesas</p>
                                </div>
                                {op.topExpenses.length === 0 ? (
                                    <p style={{ fontSize: 13, color: C.textMuted, textAlign: "center", padding: "24px 0", fontStyle: "italic" }}>Nenhum dado no periodo</p>
                                ) : (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                        {op.topExpenses.map((e, i) => {
                                            const max = op.topExpenses[0]?.total || 1;
                                            const opacities = [1, 0.85, 0.7, 0.55, 0.4];
                                            return (
                                                <div key={e.name}>
                                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                                                        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                                                            <span style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, width: 16 }}>{i + 1}</span>
                                                            <span style={{ fontSize: 13, fontWeight: 500, color: C.text1 }}>{e.name}</span>
                                                        </div>
                                                        <span style={{ fontSize: 12, fontWeight: 600, color: C.text2, fontVariantNumeric: "tabular-nums" }}>{fmtCompact(e.total)}</span>
                                                    </div>
                                                    <div style={{ height: 4, borderRadius: 99, background: C.borderLight }}>
                                                        <div style={{ height: 4, borderRadius: 99, background: C.red, opacity: opacities[i] ?? 0.3, width: `${(e.total / max) * 100}%`, transition: "width 0.4s ease" }} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* ══════════════════════════════════════════════ */}
                {/* TAB: BANCOS                                     */}
                {/* ══════════════════════════════════════════════ */}
                {activeTab === "bancos" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                        {/* Totals row */}
                        <div style={{
                            display: "grid",
                            gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr 1fr" : "1fr 1fr 1fr 1fr",
                            gap: 16,
                        }}>
                            {[
                                { label: "Saldo Total", value: fmt(bank.totalBalance), icon: Wallet, iconBg: C.blueLight, iconColor: C.blue },
                                { label: "Entradas", value: fmt(bank.totalIn), icon: ArrowUpRight, iconBg: C.greenSoft, iconColor: C.green },
                                { label: "Saidas", value: fmt(bank.totalOut), icon: ArrowDownRight, iconBg: C.redSoft, iconColor: C.red },
                                { label: "Movimentacoes", value: String(bank.totalMovements), icon: CreditCard, iconBg: C.blueLight, iconColor: C.blue },
                            ].map((kpi) => (
                                <div key={kpi.label} style={cardStyle}>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                                        <IconBadge icon={kpi.icon} color={kpi.iconColor} bg={kpi.iconBg} size={18} />
                                    </div>
                                    <p style={{ fontSize: 12, fontWeight: 500, color: C.textMuted, marginBottom: 6 }}>{kpi.label}</p>
                                    <p style={{ fontSize: 28, fontWeight: 700, color: C.text1, letterSpacing: "-0.02em", lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
                                        {kpi.value}
                                    </p>
                                </div>
                            ))}
                        </div>

                        {/* Per-bank cards */}
                        {bank.accounts.length === 0 ? (
                            <div style={{ ...cardStyle, padding: 40, textAlign: "center" }}>
                                <IconBadge icon={Building2} color={C.textMuted} bg={C.borderLight} size={24} />
                                <p style={{ fontSize: 14, fontWeight: 600, color: C.text1, marginTop: 16 }}>Nenhuma conta bancaria cadastrada</p>
                                <p style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>Cadastre contas em Financeiro &gt; Contas Bancarias</p>
                            </div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                                {bank.accountSummaries.map((acc) => (
                                    <BankAccountCard
                                        key={acc.id}
                                        account={acc}
                                        isMobile={isMobile}
                                        fmt={fmt}
                                        fmtCompact={fmtCompact}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ══════════════════════════════════════════════ */}
                {/* TAB: CONFIG                                    */}
                {/* ══════════════════════════════════════════════ */}
                {activeTab === "config" && (
                    <div style={{ ...cardStyle, padding: 40, textAlign: "center" }}>
                        <IconBadge icon={Settings2} color={C.textMuted} bg={C.borderLight} size={24} />
                        <p style={{ fontSize: 14, fontWeight: 600, color: C.text1, marginTop: 16 }}>Configuracoes da Empresa</p>
                        <p style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>Em desenvolvimento</p>
                    </div>
                )}

                <div style={{ height: 40 }} />
            </div>
        </AppLayout>
    );
}
