import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import {
    Plus, Search, Pencil, Trash2, DollarSign, MoreHorizontal,
    CalendarDays, TrendingDown, Clock, CheckCircle2, AlertTriangle, X, ChevronDown
} from "lucide-react";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AccountsPayableSheet } from "@/components/finance/AccountsPayableSheet";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import {
    format, isBefore, isToday, parseISO, startOfDay,
    startOfMonth, endOfMonth, subMonths, startOfYear, isWithinInterval, eachDayOfInterval
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { AccountsPayable } from "@/types/finance";
import { logDeletion } from "@/lib/audit";
import { PaymentModal } from "@/components/transactions/PaymentModal";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts";
import type { DateRange } from "react-day-picker";

/* ── Design Tokens ────────────────────────────── */
const T = {
    primary:   "#3b5bdb",
    primaryLt: "#eef2ff",
    green:     "#2e7d32",
    greenLt:   "#e8f5e9",
    red:       "#c62828",
    redLt:     "#fde8e8",
    amber:     "#f57f17",
    amberLt:   "#fff8e1",
    text1:     "#0f172a",
    text2:     "#475569",
    text3:     "#94a3b8",
    bg:        "#f8f9fb",
    card:      "#ffffff",
    border:    "#e2e8f0",
    hover:     "#f1f5f9",
} as const;

const FONT = "var(--font-base)";
const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const cardBase = {
    background: T.card, borderRadius: 14, padding: 20, border: `1px solid ${T.border}`,
} as const;

const tooltipStyle = {
    backgroundColor: T.text1, color: "#fff", borderRadius: 8, border: "none",
    padding: "8px 14px", fontSize: 12, fontFamily: FONT,
} as const;

/* ── Presets ───────────────────────────────────── */
const presets = [
    { label: "Este mes", get: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }) },
    { label: "Mes passado", get: () => ({ from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) }) },
    { label: "3 meses", get: () => ({ from: startOfMonth(subMonths(new Date(), 2)), to: endOfMonth(new Date()) }) },
    { label: "Este ano", get: () => ({ from: startOfYear(new Date()), to: endOfMonth(new Date()) }) },
];

const PAYMENT_METHODS: Record<string, string> = {
    pix: "Pix", boleto: "Boleto", transfer: "Transferencia", cash: "Dinheiro", card: "Cartao", other: "Outro",
};

export default function ContasPagar() {
    const { selectedCompany } = useCompany();
    const { activeClient, isUsingSecondary, user } = useAuth();
    const queryClient = useQueryClient();

    // UI state
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<AccountsPayable | undefined>(undefined);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [paymentItem, setPaymentItem] = useState<AccountsPayable | null>(null);

    // Filters
    const [dateRange, setDateRange] = useState(() => presets[2].get());
    const [activePreset, setActivePreset] = useState("3 meses");
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [methodFilter, setMethodFilter] = useState<string>("all");
    const [showFilters, setShowFilters] = useState(false);

    const dateLabel = `${format(dateRange.from, "dd MMM", { locale: ptBR })} - ${format(dateRange.to, "dd MMM yyyy", { locale: ptBR })}`;

    const handlePreset = (p: typeof presets[0]) => {
        setActivePreset(p.label);
        setDateRange(p.get());
    };

    const handleCalendarSelect = (range: DateRange | undefined) => {
        if (range?.from) {
            setActivePreset("");
            setDateRange({ from: range.from, to: range.to || range.from });
        }
    };

    // Data
    const { data: bills, isLoading, refetch } = useQuery({
        queryKey: ["accounts_payable", selectedCompany?.id, isUsingSecondary],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data, error } = await activeClient
                .from("accounts_payable")
                .select(`*, supplier:suppliers(razao_social, nome_fantasia), category:categories(name)`)
                .eq("company_id", selectedCompany.id)
                .order("due_date", { ascending: true })
                .range(0, 9999);
            if (error) throw error;
            return data as unknown as AccountsPayable[];
        },
        enabled: !!selectedCompany?.id,
    });

    const normalizeSearch = (value: unknown) =>
        String(value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

    // Filter bills by date range + search + status + payment method
    const filteredBills = useMemo(() => {
        if (!bills) return [];
        return bills.filter((bill) => {
            // Date filter
            if (bill.due_date) {
                const due = parseISO(bill.due_date);
                if (!isWithinInterval(due, { start: startOfDay(dateRange.from), end: endOfMonth(dateRange.to) })) return false;
            }
            // Status filter
            if (statusFilter !== "all") {
                if (statusFilter === "overdue") {
                    if (bill.status !== "pending") return false;
                    const due = startOfDay(parseISO(bill.due_date));
                    if (!isBefore(due, startOfDay(new Date()))) return false;
                } else if (bill.status !== statusFilter) return false;
            }
            // Payment method filter
            if (methodFilter !== "all" && bill.payment_method !== methodFilter) return false;
            // Search
            if (searchTerm.trim()) {
                const needle = normalizeSearch(searchTerm);
                const haystack = normalizeSearch([
                    bill.description, bill.supplier?.razao_social, bill.supplier?.nome_fantasia,
                    bill.category?.name, fmt(bill.amount),
                    bill.due_date ? format(parseISO(bill.due_date), "dd/MM/yyyy") : "",
                ].filter(Boolean).join(" "));
                if (!haystack.includes(needle)) return false;
            }
            return true;
        });
    }, [bills, dateRange, statusFilter, methodFilter, searchTerm]);

    // KPIs from filtered data
    const kpis = useMemo(() => {
        const pending = filteredBills.filter(b => b.status === "pending");
        const paid = filteredBills.filter(b => b.status === "paid");
        const overdue = pending.filter(b => {
            const due = startOfDay(parseISO(b.due_date));
            return isBefore(due, startOfDay(new Date()));
        });
        return {
            totalPending: pending.reduce((s, b) => s + Number(b.amount), 0),
            pendingCount: pending.length,
            totalPaid: paid.reduce((s, b) => s + Number(b.amount), 0),
            paidCount: paid.length,
            totalOverdue: overdue.reduce((s, b) => s + Number(b.amount), 0),
            overdueCount: overdue.length,
            total: filteredBills.reduce((s, b) => s + Number(b.amount), 0),
            count: filteredBills.length,
        };
    }, [filteredBills]);

    // Chart data — aggregate by day
    const chartData = useMemo(() => {
        if (!filteredBills.length) return [];
        const days = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
        const byDay = new Map<string, { pending: number; paid: number; overdue: number }>();
        days.forEach(d => byDay.set(format(d, "yyyy-MM-dd"), { pending: 0, paid: 0, overdue: 0 }));

        filteredBills.forEach(b => {
            const key = b.due_date ? format(parseISO(b.due_date), "yyyy-MM-dd") : null;
            if (!key || !byDay.has(key)) return;
            const entry = byDay.get(key)!;
            const amount = Number(b.amount);
            if (b.status === "paid") {
                entry.paid += amount;
            } else if (b.status === "pending") {
                const due = startOfDay(parseISO(b.due_date));
                if (isBefore(due, startOfDay(new Date()))) {
                    entry.overdue += amount;
                } else {
                    entry.pending += amount;
                }
            }
        });

        // Accumulate for the line
        let acc = 0;
        return Array.from(byDay.entries()).map(([date, vals]) => {
            const total = vals.pending + vals.paid + vals.overdue;
            acc += total;
            return {
                date: format(parseISO(date), "dd/MM", { locale: ptBR }),
                pending: vals.pending,
                paid: vals.paid,
                overdue: vals.overdue,
                total,
                acumulado: acc,
            };
        });
    }, [filteredBills, dateRange]);

    // Handlers
    const handleEdit = (item: AccountsPayable) => { setEditingItem(item); setIsSheetOpen(true); };
    const handleNew = () => { setEditingItem(undefined); setIsSheetOpen(true); };
    const handleDelete = async (bill: AccountsPayable) => {
        if (!window.confirm(`Excluir a conta "${bill.description}"?`)) return;
        const { error } = await activeClient.from("accounts_payable").delete().eq("id", bill.id);
        if (!error) {
            refetch();
            if (user?.id) {
                await logDeletion(activeClient, {
                    userId: user.id, companyId: selectedCompany?.id || null,
                    entity: "accounts_payable", entityId: bill.id,
                    payload: { description: bill.description, amount: bill.amount },
                });
            }
        }
    };

    const getStatusInfo = (status: string, dueDate: string) => {
        const today = startOfDay(new Date());
        const due = startOfDay(parseISO(dueDate));
        const isOverdue = isBefore(due, today) && !isToday(due) && status === "pending";

        if (status === "paid") return { label: "Pago", bg: T.greenLt, color: T.green, dot: T.green };
        if (status === "cancelled") return { label: "Cancelado", bg: T.hover, color: T.text3, dot: T.text3 };
        if (isOverdue) return { label: "Atrasado", bg: T.redLt, color: T.red, dot: T.red };
        if (isToday(due)) return { label: "Vence Hoje", bg: T.amberLt, color: T.amber, dot: T.amber };
        return { label: "A Pagar", bg: T.primaryLt, color: T.primary, dot: T.primary };
    };

    const calendarRange: DateRange = { from: dateRange.from, to: dateRange.to };

    return (
        <AppLayout title="Contas a Pagar">
            <div className="animate-fade-in" style={{ fontFamily: FONT, display: "flex", flexDirection: "column", gap: 20 }}>

                {/* ── Header ──────────────────────── */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                    <div>
                        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#000" }}>Contas a Pagar</h2>
                        <p style={{ fontSize: 13, color: T.text2, marginTop: 4 }}>Gerencie pagamentos e compromissos financeiros</p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        {/* Presets */}
                        <div style={{ display: "flex", background: T.hover, borderRadius: 10, padding: 3, gap: 2 }}>
                            {presets.map((p) => (
                                <button key={p.label} onClick={() => handlePreset(p)} style={{
                                    padding: "6px 14px", borderRadius: 8, border: "none", fontSize: 12,
                                    fontWeight: activePreset === p.label ? 600 : 400, fontFamily: FONT,
                                    background: activePreset === p.label ? T.card : "transparent",
                                    color: activePreset === p.label ? "#000" : T.text3, cursor: "pointer",
                                    boxShadow: activePreset === p.label ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
                                    transition: "all 0.15s ease",
                                }}>{p.label}</button>
                            ))}
                        </div>
                        <Popover>
                            <PopoverTrigger asChild>
                                <button style={{
                                    display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
                                    fontSize: 12, fontWeight: 500, fontFamily: FONT, borderRadius: 8,
                                    border: `1px solid ${T.border}`, background: T.card, color: T.text1, cursor: "pointer",
                                }}>
                                    <CalendarDays size={14} strokeWidth={1.5} color={T.primary} />
                                    {dateLabel}
                                </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="end">
                                <Calendar mode="range" selected={calendarRange} onSelect={handleCalendarSelect} numberOfMonths={2} defaultMonth={dateRange.from} />
                            </PopoverContent>
                        </Popover>
                        <button onClick={handleNew} style={{
                            display: "flex", alignItems: "center", gap: 8, padding: "8px 18px",
                            borderRadius: 10, border: "none", background: T.primary, color: "#fff",
                            cursor: "pointer", fontFamily: FONT, fontSize: 13, fontWeight: 600,
                        }}>
                            <Plus size={16} strokeWidth={2} />
                            Nova Conta
                        </button>
                    </div>
                </div>

                {/* ── KPI Cards ───────────────────── */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
                    {[
                        { label: "Total a Pagar", value: fmt(kpis.totalPending), icon: TrendingDown, iconColor: T.red, iconBg: T.redLt, detail: `${kpis.pendingCount} pendentes`, borderColor: T.red },
                        { label: "Total Pago", value: fmt(kpis.totalPaid), icon: CheckCircle2, iconColor: T.green, iconBg: T.greenLt, detail: `${kpis.paidCount} pagas`, borderColor: T.green },
                        { label: "Vencido", value: fmt(kpis.totalOverdue), icon: AlertTriangle, iconColor: T.amber, iconBg: T.amberLt, detail: `${kpis.overdueCount} atrasadas`, borderColor: T.amber },
                        { label: "Total Periodo", value: fmt(kpis.total), icon: DollarSign, iconColor: T.primary, iconBg: T.primaryLt, detail: `${kpis.count} contas`, borderColor: T.primary },
                    ].map((kpi) => (
                        <div key={kpi.label} style={{ ...cardBase, borderLeft: `4px solid ${kpi.borderColor}`, paddingLeft: 18 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                                <div style={{ width: 34, height: 34, borderRadius: 8, background: kpi.iconBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <kpi.icon size={17} strokeWidth={1.5} color={kpi.iconColor} />
                                </div>
                            </div>
                            <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: T.text2, marginBottom: 6 }}>{kpi.label}</p>
                            <p style={{ fontSize: 24, fontWeight: 700, color: "#000", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{kpi.value}</p>
                            <p style={{ fontSize: 12, color: T.text2, marginTop: 6, fontWeight: 500 }}>{kpi.detail}</p>
                        </div>
                    ))}
                </div>

                {/* ── Line Chart ──────────────────── */}
                <div style={cardBase}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                        <div>
                            <p style={{ fontSize: 16, fontWeight: 700, color: "#000" }}>Fluxo de Contas a Pagar</p>
                            <p style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>{dateLabel}</p>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <div style={{ width: 10, height: 10, borderRadius: 3, background: T.red }} />
                                <span style={{ fontSize: 11, fontWeight: 500, color: T.text2 }}>A Pagar</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <div style={{ width: 10, height: 10, borderRadius: 3, background: T.green }} />
                                <span style={{ fontSize: 11, fontWeight: 500, color: T.text2 }}>Pago</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <div style={{ width: 10, height: 10, borderRadius: 3, background: T.primary }} />
                                <span style={{ fontSize: 11, fontWeight: 500, color: T.text2 }}>Acumulado</span>
                            </div>
                        </div>
                    </div>
                    {chartData.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "40px 0", color: T.text3 }}>
                            <TrendingDown size={32} strokeWidth={1} color={T.border} style={{ margin: "0 auto 8px" }} />
                            <p style={{ fontSize: 13 }}>Sem dados no periodo selecionado</p>
                        </div>
                    ) : (
                        <div style={{ height: 260 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="gradPending" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={T.red} stopOpacity={0.15} />
                                            <stop offset="95%" stopColor={T.red} stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="gradPaid" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={T.green} stopOpacity={0.15} />
                                            <stop offset="95%" stopColor={T.green} stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke={T.hover} />
                                    <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: T.text3, fontSize: 11 }} dy={8} interval="preserveStartEnd" minTickGap={40} />
                                    <YAxis tickLine={false} axisLine={false} tick={{ fill: T.text3, fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} width={40} />
                                    <Tooltip formatter={(v: number, n: string) => [fmt(v), n === "pending" ? "A Pagar" : n === "paid" ? "Pago" : n === "overdue" ? "Atrasado" : "Acumulado"]} contentStyle={tooltipStyle} />
                                    <ReferenceLine y={0} stroke={T.border} />
                                    <Area type="monotone" dataKey="pending" name="pending" stroke={T.red} strokeWidth={2} fillOpacity={1} fill="url(#gradPending)" dot={false} />
                                    <Area type="monotone" dataKey="paid" name="paid" stroke={T.green} strokeWidth={2} fillOpacity={1} fill="url(#gradPaid)" dot={false} />
                                    <Area type="monotone" dataKey="acumulado" name="acumulado" stroke={T.primary} strokeWidth={2} strokeDasharray="6 3" fillOpacity={0} dot={false} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>

                {/* ── Filters Bar ─────────────────── */}
                <div style={cardBase}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        {/* Status pills */}
                        <div style={{ display: "flex", background: T.hover, borderRadius: 8, padding: 3, gap: 2 }}>
                            {[
                                { key: "all", label: "Todas" },
                                { key: "pending", label: "A Pagar" },
                                { key: "paid", label: "Pagas" },
                                { key: "overdue", label: "Atrasadas" },
                            ].map((f) => (
                                <button key={f.key} onClick={() => setStatusFilter(f.key)} style={{
                                    padding: "5px 12px", borderRadius: 6, border: "none", fontSize: 12,
                                    fontWeight: statusFilter === f.key ? 600 : 400, fontFamily: FONT,
                                    background: statusFilter === f.key ? T.card : "transparent",
                                    color: statusFilter === f.key ? "#000" : T.text3, cursor: "pointer",
                                    boxShadow: statusFilter === f.key ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                                    transition: "all 0.15s ease",
                                }}>{f.label}</button>
                            ))}
                        </div>

                        {/* Search */}
                        <div style={{
                            display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 200,
                            padding: "6px 12px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.card,
                        }}>
                            <Search size={14} strokeWidth={1.5} color={T.text3} />
                            <input
                                type="text" placeholder="Buscar por descricao, fornecedor, valor..."
                                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                                style={{ border: "none", outline: "none", background: "transparent", fontSize: 12, fontFamily: FONT, color: T.text1, width: "100%" }}
                            />
                            {searchTerm && (
                                <button onClick={() => setSearchTerm("")} style={{ border: "none", background: "none", cursor: "pointer", padding: 0 }}>
                                    <X size={14} color={T.text3} />
                                </button>
                            )}
                        </div>

                        {/* Payment method filter */}
                        <select
                            value={methodFilter}
                            onChange={(e) => setMethodFilter(e.target.value)}
                            style={{
                                padding: "6px 12px", borderRadius: 8, border: `1px solid ${T.border}`,
                                background: T.card, fontSize: 12, fontFamily: FONT, color: T.text1, cursor: "pointer",
                                appearance: "auto",
                            }}
                        >
                            <option value="all">Forma de pagamento</option>
                            {Object.entries(PAYMENT_METHODS).map(([k, v]) => (
                                <option key={k} value={k}>{v}</option>
                            ))}
                        </select>

                        {/* Count */}
                        <span style={{ fontSize: 12, fontWeight: 600, color: T.text3 }}>
                            {filteredBills.length} conta{filteredBills.length !== 1 ? "s" : ""}
                        </span>
                    </div>
                </div>

                {/* ── Table ───────────────────────── */}
                <div style={{ ...cardBase, padding: 0, overflow: "hidden" }}>
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent" style={{ borderBottom: `2px solid ${T.border}` }}>
                                <TableHead style={{ padding: "12px 20px", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.06em" }}>Status</TableHead>
                                <TableHead style={{ padding: "12px 16px", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.06em" }}>Descricao</TableHead>
                                <TableHead style={{ padding: "12px 16px", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.06em" }} className="hidden md:table-cell">Fornecedor</TableHead>
                                <TableHead style={{ padding: "12px 16px", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.06em" }} className="hidden lg:table-cell">Pagamento</TableHead>
                                <TableHead style={{ padding: "12px 16px", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.06em" }}>Vencimento</TableHead>
                                <TableHead style={{ padding: "12px 20px", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "right" }}>Valor</TableHead>
                                <TableHead style={{ padding: "12px 16px", width: 60 }}></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={7} style={{ textAlign: "center", padding: "40px 0" }}>
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: T.text3 }}>
                                            <div style={{ width: 20, height: 20, border: `2px solid ${T.border}`, borderTopColor: T.primary, borderRadius: 99, animation: "spin 0.8s linear infinite" }} />
                                            <span style={{ fontSize: 13 }}>Carregando...</span>
                                        </div>
                                        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                                    </TableCell>
                                </TableRow>
                            ) : filteredBills.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} style={{ textAlign: "center", padding: "48px 0", color: T.text3 }}>
                                        <TrendingDown size={32} strokeWidth={1} color={T.border} style={{ margin: "0 auto 8px" }} />
                                        <p style={{ fontSize: 14, fontWeight: 600, color: T.text1 }}>Nenhuma conta encontrada</p>
                                        <p style={{ fontSize: 12, color: T.text3, marginTop: 4 }}>Ajuste os filtros ou cadastre uma nova conta</p>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredBills.map((bill) => {
                                    const st = getStatusInfo(bill.status, bill.due_date);
                                    return (
                                        <TableRow key={bill.id} className="group" style={{ borderBottom: `1px solid ${T.hover}`, transition: "background 0.1s ease" }}>
                                            <TableCell style={{ padding: "14px 20px" }}>
                                                <span style={{
                                                    display: "inline-flex", alignItems: "center", gap: 5,
                                                    padding: "3px 10px", borderRadius: 9999, fontSize: 11, fontWeight: 500,
                                                    background: st.bg, color: st.color,
                                                }}>
                                                    <div style={{ width: 6, height: 6, borderRadius: 99, background: st.dot }} />
                                                    {st.label}
                                                </span>
                                            </TableCell>
                                            <TableCell style={{ padding: "14px 16px" }}>
                                                <p style={{ fontSize: 13, fontWeight: 600, color: "#000" }}>{bill.description}</p>
                                                {bill.category?.name && <p style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{bill.category.name}</p>}
                                            </TableCell>
                                            <TableCell style={{ padding: "14px 16px" }} className="hidden md:table-cell">
                                                <span style={{ fontSize: 12, color: T.text2 }}>
                                                    {bill.supplier?.nome_fantasia || bill.supplier?.razao_social || "-"}
                                                </span>
                                            </TableCell>
                                            <TableCell style={{ padding: "14px 16px" }} className="hidden lg:table-cell">
                                                <span style={{ fontSize: 12, color: T.text2 }}>
                                                    {bill.payment_method ? PAYMENT_METHODS[bill.payment_method] || bill.payment_method : "-"}
                                                </span>
                                            </TableCell>
                                            <TableCell style={{ padding: "14px 16px" }}>
                                                <span style={{ fontSize: 12, fontWeight: 500, color: T.text1, fontVariantNumeric: "tabular-nums" }}>
                                                    {format(parseISO(bill.due_date), "dd/MM/yyyy")}
                                                </span>
                                            </TableCell>
                                            <TableCell style={{ padding: "14px 20px", textAlign: "right" }}>
                                                <span style={{
                                                    fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                                                    color: bill.status === "paid" ? T.green : "#000",
                                                }}>{fmt(bill.amount)}</span>
                                            </TableCell>
                                            <TableCell style={{ padding: "14px 16px" }}>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-[160px]">
                                                        <DropdownMenuLabel>Acoes</DropdownMenuLabel>
                                                        <DropdownMenuItem onClick={() => handleEdit(bill)}>
                                                            <Pencil className="mr-2 h-4 w-4" style={{ color: T.primary }} />
                                                            Editar
                                                        </DropdownMenuItem>
                                                        {bill.status === "pending" && (
                                                            <DropdownMenuItem onClick={() => { setPaymentItem(bill); setIsPaymentModalOpen(true); }}>
                                                                <DollarSign className="mr-2 h-4 w-4" style={{ color: T.green }} />
                                                                Baixar
                                                            </DropdownMenuItem>
                                                        )}
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem onClick={() => handleDelete(bill)} style={{ color: T.red }}>
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
                </div>

                {/* ── Sheets/Modals ────────────────── */}
                <AccountsPayableSheet
                    isOpen={isSheetOpen}
                    onClose={() => { setIsSheetOpen(false); setEditingItem(undefined); }}
                    dataToEdit={editingItem}
                />
                {paymentItem && (
                    <PaymentModal
                        isOpen={isPaymentModalOpen}
                        onClose={() => { setIsPaymentModalOpen(false); setPaymentItem(null); }}
                        accountingId={paymentItem.id}
                        type="payable"
                        initialAmount={paymentItem.amount}
                        description={`Pagamento: ${paymentItem.description}`}
                        onSuccess={() => {
                            queryClient.invalidateQueries({ queryKey: ["accounts_payable"] });
                            queryClient.invalidateQueries({ queryKey: ["transactions"] });
                            queryClient.invalidateQueries({ queryKey: ["bank_accounts"] });
                            setIsPaymentModalOpen(false);
                            setPaymentItem(null);
                        }}
                    />
                )}

                <div style={{ height: 40 }} />
            </div>
        </AppLayout>
    );
}
