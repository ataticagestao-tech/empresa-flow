import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import {
    Plus, Search, Pencil, Trash2, DollarSign, MoreHorizontal,
    CalendarDays, TrendingDown, CheckCircle2, AlertTriangle, X
} from "lucide-react";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AccountsPayableSheet } from "@/components/finance/AccountsPayableSheet";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import {
    format, isBefore, isToday, parseISO, startOfDay, endOfDay,
    startOfMonth, endOfMonth, subMonths, startOfYear, eachDayOfInterval,
    isAfter
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
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    Area, AreaChart, Line, PieChart, Pie, Cell
} from "recharts";
import type { DateRange } from "react-day-picker";

/* ── Tokens ────────────────────────────────────── */
const T = {
    primary: "#3b5bdb", primaryLt: "#eef2ff",
    green: "#2e7d32", greenLt: "#e8f5e9",
    red: "#c62828", redLt: "#fde8e8",
    amber: "#f57f17", amberLt: "#fff8e1",
    text1: "#0f172a", text2: "#475569", text3: "#94a3b8",
    bg: "#f8f9fb", card: "#ffffff", border: "#e2e8f0", hover: "#f1f5f9",
} as const;
const FONT = "var(--font-base)";
const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const fmtShort = (v: number) => {
    if (v >= 1000) return `R$ ${(v / 1000).toFixed(1)}k`;
    return fmt(v);
};

const presets = [
    { label: "Este mes", get: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }) },
    { label: "Mes passado", get: () => ({ from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) }) },
    { label: "3 meses", get: () => ({ from: startOfMonth(subMonths(new Date(), 2)), to: endOfMonth(new Date()) }) },
    { label: "Este ano", get: () => ({ from: startOfYear(new Date()), to: endOfMonth(new Date()) }) },
];

const PM_LABELS: Record<string, string> = {
    pix: "Pix", boleto: "Boleto", transfer: "Transferencia", cash: "Dinheiro", card: "Cartao", other: "Outro",
};

const tooltipStyle = {
    backgroundColor: "#1e293b", color: "#fff", borderRadius: 8, border: "none",
    padding: "10px 14px", fontSize: 12, fontFamily: FONT, boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
} as const;

export default function ContasPagar() {
    const { selectedCompany } = useCompany();
    const { activeClient, isUsingSecondary, user } = useAuth();
    const queryClient = useQueryClient();

    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<AccountsPayable | undefined>();
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [paymentItem, setPaymentItem] = useState<AccountsPayable | null>(null);

    // Filters — default to Este ano para mostrar todos os dados
    const [dateRange, setDateRange] = useState(() => presets[3].get());
    const [activePreset, setActivePreset] = useState("Este ano");
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [methodFilter, setMethodFilter] = useState("all");

    const dateLabel = `${format(dateRange.from, "dd MMM", { locale: ptBR })} - ${format(dateRange.to, "dd MMM yyyy", { locale: ptBR })}`;

    const handlePreset = (p: typeof presets[0]) => { setActivePreset(p.label); setDateRange(p.get()); };
    const handleCalendarSelect = (range: DateRange | undefined) => {
        if (range?.from) { setActivePreset(""); setDateRange({ from: range.from, to: range.to || range.from }); }
    };

    const { data: bills, isLoading, refetch } = useQuery({
        queryKey: ["accounts_payable", selectedCompany?.id, isUsingSecondary],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data: rows, error } = await (activeClient as any)
                .from("accounts_payable")
                .select("*")
                .eq("company_id", selectedCompany.id)
                .order("due_date", { ascending: true });
            if (error || !rows) { console.error("accounts_payable error:", error); return []; }

            // Hydrate categories and suppliers
            const catIds = [...new Set(rows.map((b: any) => b.category_id).filter(Boolean))] as string[];
            const supIds = [...new Set(rows.map((b: any) => b.supplier_id).filter(Boolean))] as string[];
            const catMap: Record<string, string> = {};
            const supMap: Record<string, { razao_social: string; nome_fantasia?: string }> = {};

            if (catIds.length) {
                const { data: cats } = await (activeClient as any)
                    .from("chart_of_accounts").select("id, name").in("id", catIds);
                if (cats) cats.forEach((c: any) => { catMap[c.id] = c.name; });
                // Also try categories table
                if (!cats || cats.length === 0) {
                    const { data: cats2 } = await (activeClient as any)
                        .from("categories").select("id, name").in("id", catIds);
                    if (cats2) cats2.forEach((c: any) => { catMap[c.id] = c.name; });
                }
            }
            if (supIds.length) {
                const { data: sups } = await (activeClient as any)
                    .from("suppliers").select("id, razao_social, nome_fantasia").in("id", supIds);
                if (sups) sups.forEach((s: any) => { supMap[s.id] = { razao_social: s.razao_social, nome_fantasia: s.nome_fantasia }; });
            }

            return rows.map((b: any) => ({
                ...b,
                category: b.category_id && catMap[b.category_id] ? { name: catMap[b.category_id] } : undefined,
                supplier: b.supplier_id && supMap[b.supplier_id] ? supMap[b.supplier_id] : undefined,
            })) as AccountsPayable[];
        },
        enabled: !!selectedCompany?.id,
    });

    const normalizeSearch = (value: unknown) =>
        String(value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

    // ── FIXED filter: use proper date comparison ──
    const filteredBills = useMemo(() => {
        if (!bills) return [];
        const rangeStart = startOfDay(dateRange.from);
        const rangeEnd = endOfDay(dateRange.to);

        return bills.filter((bill) => {
            // Date
            if (bill.due_date) {
                const due = parseISO(bill.due_date);
                if (isBefore(due, rangeStart) || isAfter(due, rangeEnd)) return false;
            }
            // Status
            if (statusFilter !== "all") {
                if (statusFilter === "overdue") {
                    if (bill.status !== "pending") return false;
                    if (!isBefore(startOfDay(parseISO(bill.due_date)), startOfDay(new Date()))) return false;
                } else if (bill.status !== statusFilter) return false;
            }
            // Payment method
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

    // ── KPIs ──
    const stats = useMemo(() => {
        const pending = filteredBills.filter(b => b.status === "pending");
        const paid = filteredBills.filter(b => b.status === "paid");
        const overdue = pending.filter(b => isBefore(startOfDay(parseISO(b.due_date)), startOfDay(new Date())));
        return {
            pendingTotal: pending.reduce((s, b) => s + Number(b.amount), 0),
            pendingCount: pending.length,
            paidTotal: paid.reduce((s, b) => s + Number(b.amount), 0),
            paidCount: paid.length,
            overdueTotal: overdue.reduce((s, b) => s + Number(b.amount), 0),
            overdueCount: overdue.length,
        };
    }, [filteredBills]);

    // ── Chart: smart grouping (by day if ≤2 months, otherwise by month) ──
    const chartData = useMemo(() => {
        if (!filteredBills.length) return [];

        // Detect date span to decide grouping
        const dates = filteredBills.filter(b => b.due_date).map(b => parseISO(b.due_date));
        const minDate = dates.reduce((a, b) => (a < b ? a : b));
        const maxDate = dates.reduce((a, b) => (a > b ? a : b));
        const spanMonths = (maxDate.getFullYear() - minDate.getFullYear()) * 12 + maxDate.getMonth() - minDate.getMonth();
        const groupByDay = spanMonths <= 2;

        const buckets = new Map<string, { label: string; pending: number; paid: number; overdue: number }>();
        filteredBills.forEach(b => {
            if (!b.due_date) return;
            const d = parseISO(b.due_date);
            const key = groupByDay ? format(d, "yyyy-MM-dd") : format(d, "yyyy-MM");
            const label = groupByDay ? format(d, "dd MMM", { locale: ptBR }) : format(d, "MMM yy", { locale: ptBR });
            if (!buckets.has(key)) buckets.set(key, { label, pending: 0, paid: 0, overdue: 0 });
            const entry = buckets.get(key)!;
            const amount = Number(b.amount);
            if (b.status === "paid") {
                entry.paid += amount;
            } else if (b.status === "pending") {
                if (isBefore(startOfDay(d), startOfDay(new Date()))) {
                    entry.overdue += amount;
                } else {
                    entry.pending += amount;
                }
            }
        });

        let acc = 0;
        return Array.from(buckets.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([, vals]) => {
                const total = vals.pending + vals.paid + vals.overdue;
                acc += total;
                return { ...vals, total, acumulado: acc };
            });
    }, [filteredBills]);

    // ── Pie: paid bills grouped by category ──
    const PIE_COLORS = ["#3b5bdb", "#2e7d32", "#c62828", "#f57f17", "#7c3aed", "#0891b2", "#be185d", "#ea580c", "#4f46e5", "#059669"];
    const categoryPieData = useMemo(() => {
        const paid = filteredBills.filter(b => b.status === "paid");
        const map = new Map<string, number>();
        paid.forEach(b => {
            const cat = b.category?.name || "Sem categoria";
            map.set(cat, (map.get(cat) || 0) + Number(b.amount));
        });
        return Array.from(map.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);
    }, [filteredBills]);

    // Handlers
    const handleEdit = (item: AccountsPayable) => { setEditingItem(item); setIsSheetOpen(true); };
    const handleNew = () => { setEditingItem(undefined); setIsSheetOpen(true); };
    const handleDelete = async (bill: AccountsPayable) => {
        if (!window.confirm(`Excluir "${bill.description}"?`)) return;
        const { error } = await activeClient.from("accounts_payable").delete().eq("id", bill.id);
        if (!error) {
            refetch();
            if (user?.id) await logDeletion(activeClient, {
                userId: user.id, companyId: selectedCompany?.id || null,
                entity: "accounts_payable", entityId: bill.id,
                payload: { description: bill.description, amount: bill.amount },
            });
        }
    };

    const getStatus = (status: string, dueDate: string) => {
        const today = startOfDay(new Date());
        const due = startOfDay(parseISO(dueDate));
        if (status === "paid") return { label: "Pago", bg: T.greenLt, color: T.green };
        if (status === "cancelled") return { label: "Cancelado", bg: T.hover, color: T.text3 };
        if (isBefore(due, today) && !isToday(due)) return { label: "Atrasado", bg: T.redLt, color: T.red };
        if (isToday(due)) return { label: "Vence Hoje", bg: T.amberLt, color: T.amber };
        return { label: "A Pagar", bg: T.primaryLt, color: T.primary };
    };

    return (
        <AppLayout title="Contas a Pagar">
            <div className="animate-fade-in" style={{ fontFamily: FONT, display: "flex", flexDirection: "column", gap: 20 }}>

                {/* ════════ HEADER BAR ════════ */}
                <div style={{
                    background: T.card, borderRadius: 14, border: `1px solid ${T.border}`,
                    padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
                    gap: 12, flexWrap: "wrap",
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: T.redLt, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <TrendingDown size={20} strokeWidth={1.5} color={T.red} />
                        </div>
                        <div>
                            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#000", lineHeight: 1.2 }}>Contas a Pagar</h2>
                            <p style={{ fontSize: 12, color: T.text3 }}>{filteredBills.length} contas no periodo</p>
                        </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <div style={{ display: "flex", background: T.hover, borderRadius: 8, padding: 2, gap: 1 }}>
                            {presets.map((p) => (
                                <button key={p.label} onClick={() => handlePreset(p)} style={{
                                    padding: "5px 12px", borderRadius: 6, border: "none", fontSize: 11,
                                    fontWeight: activePreset === p.label ? 600 : 400, fontFamily: FONT,
                                    background: activePreset === p.label ? T.card : "transparent",
                                    color: activePreset === p.label ? "#000" : T.text3, cursor: "pointer",
                                    boxShadow: activePreset === p.label ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                                }}>{p.label}</button>
                            ))}
                        </div>
                        <Popover>
                            <PopoverTrigger asChild>
                                <button style={{
                                    display: "flex", alignItems: "center", gap: 6, padding: "5px 12px",
                                    fontSize: 11, fontWeight: 500, fontFamily: FONT, borderRadius: 6,
                                    border: `1px solid ${T.border}`, background: T.card, color: T.text1, cursor: "pointer",
                                }}>
                                    <CalendarDays size={12} strokeWidth={1.5} color={T.primary} />
                                    {dateLabel}
                                </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="end">
                                <Calendar mode="range" selected={{ from: dateRange.from, to: dateRange.to } as DateRange} onSelect={handleCalendarSelect} numberOfMonths={2} defaultMonth={dateRange.from} />
                            </PopoverContent>
                        </Popover>
                        <button onClick={handleNew} style={{
                            display: "flex", alignItems: "center", gap: 6, padding: "6px 16px",
                            borderRadius: 8, border: "none", background: T.primary, color: "#fff",
                            cursor: "pointer", fontFamily: FONT, fontSize: 12, fontWeight: 600,
                        }}>
                            <Plus size={14} strokeWidth={2} />
                            Nova Conta
                        </button>
                    </div>
                </div>

                {/* ════════ SUMMARY STRIP ════════ */}
                <div style={{
                    display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 0,
                    background: T.card, borderRadius: 14, border: `1px solid ${T.border}`, overflow: "hidden",
                }}>
                    {[
                        { label: "A Pagar", value: stats.pendingTotal, count: stats.pendingCount, color: T.red, icon: TrendingDown },
                        { label: "Pago", value: stats.paidTotal, count: stats.paidCount, color: T.green, icon: CheckCircle2 },
                        { label: "Vencido", value: stats.overdueTotal, count: stats.overdueCount, color: T.amber, icon: AlertTriangle },
                    ].map((item, i, arr) => (
                        <div key={item.label} style={{
                            padding: "18px 24px",
                            borderRight: i < arr.length - 1 ? `1px solid ${T.border}` : "none",
                            display: "flex", alignItems: "center", gap: 14,
                        }}>
                            <div style={{
                                width: 42, height: 42, borderRadius: 10,
                                background: `${item.color}12`,
                                display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                                <item.icon size={20} strokeWidth={1.5} color={item.color} />
                            </div>
                            <div>
                                <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: T.text3, marginBottom: 2 }}>{item.label}</p>
                                <p style={{ fontSize: 20, fontWeight: 700, color: "#000", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{fmt(item.value)}</p>
                                <p style={{ fontSize: 11, color: item.color, fontWeight: 600, marginTop: 2 }}>{item.count} conta{item.count !== 1 ? "s" : ""}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* ════════ CHARTS ROW ════════ */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 16 }}>

                    {/* ── Area Chart: Fluxo ── */}
                    <div style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.border}`, padding: 24 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                            <p style={{ fontSize: 15, fontWeight: 700, color: "#000" }}>Fluxo de Pagamentos</p>
                            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                                {[
                                    { label: "A Pagar", color: T.red },
                                    { label: "Pago", color: T.green },
                                    { label: "Atrasado", color: T.amber },
                                    { label: "Acumulado", color: T.primary },
                                ].map((l) => (
                                    <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                        <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color }} />
                                        <span style={{ fontSize: 11, fontWeight: 500, color: T.text2 }}>{l.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {chartData.length === 0 ? (
                            <div style={{ textAlign: "center", padding: "48px 0", color: T.text3 }}>
                                <TrendingDown size={36} strokeWidth={1} color={T.border} style={{ margin: "0 auto 12px" }} />
                                <p style={{ fontSize: 14, fontWeight: 600, color: T.text1 }}>Sem dados no periodo</p>
                                <p style={{ fontSize: 12, color: T.text3, marginTop: 4 }}>Selecione outro periodo ou cadastre contas</p>
                            </div>
                        ) : (
                            <div style={{ height: 300 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={chartData} margin={{ top: 8, right: 12, left: -4, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="gradPaid" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor={T.green} stopOpacity={0.25} />
                                                <stop offset="100%" stopColor={T.green} stopOpacity={0.02} />
                                            </linearGradient>
                                            <linearGradient id="gradPending" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor={T.red} stopOpacity={0.2} />
                                                <stop offset="100%" stopColor={T.red} stopOpacity={0.02} />
                                            </linearGradient>
                                            <linearGradient id="gradOverdue" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor={T.amber} stopOpacity={0.2} />
                                                <stop offset="100%" stopColor={T.amber} stopOpacity={0.02} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={`${T.border}80`} />
                                        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: T.text3, fontSize: 11 }} dy={8} />
                                        <YAxis tickLine={false} axisLine={false} tick={{ fill: T.text3, fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} width={48} />
                                        <Tooltip
                                            formatter={(v: number, n: string) => [fmt(v), n === "paid" ? "Pago" : n === "pending" ? "A Pagar" : n === "overdue" ? "Atrasado" : "Acumulado"]}
                                            contentStyle={tooltipStyle}
                                            cursor={{ stroke: T.text3, strokeDasharray: "4 4" }}
                                        />
                                        <Area type="monotone" dataKey="paid" name="paid" stroke={T.green} strokeWidth={2.5} fill="url(#gradPaid)" dot={{ r: 4, fill: T.card, stroke: T.green, strokeWidth: 2 }} activeDot={{ r: 6, fill: T.green, stroke: T.card, strokeWidth: 2 }} />
                                        <Area type="monotone" dataKey="pending" name="pending" stroke={T.red} strokeWidth={2.5} fill="url(#gradPending)" dot={{ r: 4, fill: T.card, stroke: T.red, strokeWidth: 2 }} activeDot={{ r: 6, fill: T.red, stroke: T.card, strokeWidth: 2 }} />
                                        <Area type="monotone" dataKey="overdue" name="overdue" stroke={T.amber} strokeWidth={2.5} fill="url(#gradOverdue)" dot={{ r: 4, fill: T.card, stroke: T.amber, strokeWidth: 2 }} activeDot={{ r: 6, fill: T.amber, stroke: T.card, strokeWidth: 2 }} />
                                        <Line type="monotone" dataKey="acumulado" name="acumulado" stroke={T.primary} strokeWidth={2} strokeDasharray="8 4" dot={false} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>

                    {/* ── Pie Chart: Pagamentos por Categoria ── */}
                    <div style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.border}`, padding: 24, display: "flex", flexDirection: "column" }}>
                        <p style={{ fontSize: 15, fontWeight: 700, color: "#000", marginBottom: 16 }}>Pagamentos por Categoria</p>

                        {categoryPieData.length === 0 ? (
                            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: T.text3 }}>
                                <p style={{ fontSize: 13 }}>Sem pagamentos no periodo</p>
                            </div>
                        ) : (
                            <>
                                <div style={{ height: 200 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={categoryPieData}
                                                cx="50%" cy="50%"
                                                innerRadius={50} outerRadius={85}
                                                paddingAngle={2}
                                                dataKey="value"
                                                stroke="none"
                                            >
                                                {categoryPieData.map((_, i) => (
                                                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                formatter={(v: number) => fmt(v)}
                                                contentStyle={tooltipStyle}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                {/* Legend */}
                                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8, overflow: "auto", maxHeight: 120 }}>
                                    {categoryPieData.map((item, i) => {
                                        const total = categoryPieData.reduce((s, d) => s + d.value, 0);
                                        const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0";
                                        return (
                                            <div key={item.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                <div style={{ width: 8, height: 8, borderRadius: 2, background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                                                <span style={{ fontSize: 11, color: T.text2, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{item.name}</span>
                                                <span style={{ fontSize: 11, fontWeight: 600, color: T.text1, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" as const }}>{pct}%</span>
                                                <span style={{ fontSize: 10, color: T.text3, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" as const }}>{fmt(item.value)}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* ════════ FILTER + TABLE ════════ */}
                <div style={{
                    background: T.card, borderRadius: 14, border: `1px solid ${T.border}`, overflow: "hidden",
                }}>
                    {/* Filter bar */}
                    <div style={{
                        padding: "14px 20px", borderBottom: `1px solid ${T.border}`,
                        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                    }}>
                        {/* Status pills */}
                        <div style={{ display: "flex", background: T.hover, borderRadius: 6, padding: 2, gap: 1 }}>
                            {[
                                { key: "all", label: "Todas", count: filteredBills.length },
                                { key: "pending", label: "A Pagar", count: stats.pendingCount },
                                { key: "paid", label: "Pagas", count: stats.paidCount },
                                { key: "overdue", label: "Atrasadas", count: stats.overdueCount },
                            ].map((f) => (
                                <button key={f.key} onClick={() => setStatusFilter(f.key)} style={{
                                    padding: "4px 10px", borderRadius: 4, border: "none", fontSize: 11,
                                    fontWeight: statusFilter === f.key ? 600 : 400, fontFamily: FONT,
                                    background: statusFilter === f.key ? T.card : "transparent",
                                    color: statusFilter === f.key ? "#000" : T.text3, cursor: "pointer",
                                    boxShadow: statusFilter === f.key ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                                    display: "flex", alignItems: "center", gap: 4,
                                }}>
                                    {f.label}
                                    <span style={{
                                        fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                                        background: statusFilter === f.key ? T.primaryLt : "transparent",
                                        color: statusFilter === f.key ? T.primary : T.text3,
                                    }}>{f.count}</span>
                                </button>
                            ))}
                        </div>

                        {/* Search */}
                        <div style={{
                            display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 180,
                            padding: "5px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.card,
                        }}>
                            <Search size={13} strokeWidth={1.5} color={T.text3} />
                            <input
                                type="text" placeholder="Buscar descricao, fornecedor, valor..."
                                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                                style={{ border: "none", outline: "none", background: "transparent", fontSize: 11, fontFamily: FONT, color: T.text1, width: "100%" }}
                            />
                            {searchTerm && <button onClick={() => setSearchTerm("")} style={{ border: "none", background: "none", cursor: "pointer", padding: 0 }}><X size={12} color={T.text3} /></button>}
                        </div>

                        {/* Payment method */}
                        <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)} style={{
                            padding: "5px 10px", borderRadius: 6, border: `1px solid ${T.border}`,
                            background: T.card, fontSize: 11, fontFamily: FONT, color: T.text1, cursor: "pointer",
                        }}>
                            <option value="all">Forma pgto.</option>
                            {Object.entries(PM_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                    </div>

                    {/* Table */}
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent" style={{ borderBottom: `1px solid ${T.border}` }}>
                                {["Status", "Descricao", "Fornecedor", "Categoria", "Vencimento", "Valor", ""].map((h, i) => (
                                    <TableHead
                                        key={h || i}
                                        className={i === 2 ? "hidden md:table-cell" : i === 3 ? "hidden lg:table-cell" : ""}
                                        style={{
                                            padding: "10px 16px", fontSize: 10, fontWeight: 700,
                                            color: T.text3, textTransform: "uppercase" as const, letterSpacing: "0.06em",
                                            textAlign: i === 5 ? "right" : "left",
                                            ...(i === 6 ? { width: 50 } : {}),
                                        }}
                                    >{h}</TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={7} style={{ textAlign: "center", padding: "40px 0" }}>
                                        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: T.text3 }}>
                                            <div style={{ width: 18, height: 18, border: `2px solid ${T.border}`, borderTopColor: T.primary, borderRadius: 99, animation: "spin 0.8s linear infinite" }} />
                                            <span style={{ fontSize: 12 }}>Carregando...</span>
                                        </div>
                                        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                                    </TableCell>
                                </TableRow>
                            ) : filteredBills.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} style={{ textAlign: "center", padding: "48px 0" }}>
                                        <TrendingDown size={28} strokeWidth={1} color={T.border} style={{ margin: "0 auto 8px" }} />
                                        <p style={{ fontSize: 13, fontWeight: 600, color: T.text1 }}>Nenhuma conta encontrada</p>
                                        <p style={{ fontSize: 11, color: T.text3, marginTop: 4 }}>Ajuste os filtros ou cadastre uma nova conta</p>
                                    </TableCell>
                                </TableRow>
                            ) : filteredBills.map((bill) => {
                                const st = getStatus(bill.status, bill.due_date);
                                return (
                                    <TableRow key={bill.id} className="group" style={{ borderBottom: `1px solid ${T.hover}` }}>
                                        <TableCell style={{ padding: "12px 16px" }}>
                                            <span style={{
                                                display: "inline-flex", alignItems: "center", gap: 5,
                                                padding: "2px 9px", borderRadius: 9999, fontSize: 10, fontWeight: 600,
                                                background: st.bg, color: st.color,
                                            }}>
                                                <div style={{ width: 5, height: 5, borderRadius: 99, background: st.color }} />
                                                {st.label}
                                            </span>
                                        </TableCell>
                                        <TableCell style={{ padding: "12px 16px" }}>
                                            <p style={{ fontSize: 13, fontWeight: 600, color: "#000", lineHeight: 1.3 }}>{bill.description}</p>
                                        </TableCell>
                                        <TableCell className="hidden md:table-cell" style={{ padding: "12px 16px" }}>
                                            <span style={{ fontSize: 12, color: T.text2 }}>{bill.supplier?.nome_fantasia || bill.supplier?.razao_social || "-"}</span>
                                        </TableCell>
                                        <TableCell className="hidden lg:table-cell" style={{ padding: "12px 16px" }}>
                                            <span style={{
                                                fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 4,
                                                background: T.primaryLt, color: T.primary,
                                            }}>
                                                {bill.category?.name || "-"}
                                            </span>
                                        </TableCell>
                                        <TableCell style={{ padding: "12px 16px" }}>
                                            <span style={{ fontSize: 12, fontWeight: 500, color: T.text1, fontVariantNumeric: "tabular-nums" }}>
                                                {format(parseISO(bill.due_date), "dd/MM/yyyy")}
                                            </span>
                                        </TableCell>
                                        <TableCell style={{ padding: "12px 16px", textAlign: "right" }}>
                                            <span style={{
                                                fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                                                color: bill.status === "paid" ? T.green : "#000",
                                            }}>{fmt(bill.amount)}</span>
                                        </TableCell>
                                        <TableCell style={{ padding: "12px 8px" }}>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-[150px]">
                                                    <DropdownMenuLabel style={{ fontSize: 11 }}>Acoes</DropdownMenuLabel>
                                                    <DropdownMenuItem onClick={() => handleEdit(bill)}>
                                                        <Pencil className="mr-2 h-3.5 w-3.5" style={{ color: T.primary }} /> Editar
                                                    </DropdownMenuItem>
                                                    {bill.status === "pending" && (
                                                        <DropdownMenuItem onClick={() => { setPaymentItem(bill); setIsPaymentModalOpen(true); }}>
                                                            <DollarSign className="mr-2 h-3.5 w-3.5" style={{ color: T.green }} /> Baixar
                                                        </DropdownMenuItem>
                                                    )}
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem onClick={() => handleDelete(bill)} style={{ color: T.red }}>
                                                        <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>

                {/* Modals */}
                <AccountsPayableSheet isOpen={isSheetOpen} onClose={() => { setIsSheetOpen(false); setEditingItem(undefined); }} dataToEdit={editingItem} />
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
                <div style={{ height: 20 }} />
            </div>
        </AppLayout>
    );
}
