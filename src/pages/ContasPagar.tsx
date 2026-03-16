import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import {
    Plus, Search, Pencil, Trash2, DollarSign, MoreHorizontal,
    CalendarDays, TrendingDown, CheckCircle2, AlertTriangle, X,
    Download, FileText, FileSpreadsheet, Sparkles, ChevronRight
} from "lucide-react";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AccountsPayableSheet } from "@/components/finance/AccountsPayableSheet";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import {
    format, isBefore, isToday, parseISO, startOfDay, endOfDay,
    startOfMonth, endOfMonth, subMonths, startOfYear,
    isAfter
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { AccountsPayable } from "@/types/finance";
import { logDeletion } from "@/lib/audit";
import { PaymentModal } from "@/components/transactions/PaymentModal";
import { BotaoPagarComRecibo } from "@/components/finance/BotaoPagarComRecibo";
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
    const [categoryFilter, setCategoryFilter] = useState("all");
    const [aiOpen, setAiOpen] = useState(false);

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
            // Category
            if (categoryFilter !== "all") {
                const catName = bill.category?.name || "Sem categoria";
                if (catName !== categoryFilter) return false;
            }
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
    }, [bills, dateRange, statusFilter, methodFilter, categoryFilter, searchTerm]);

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
        if (!dates.length) return [];
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

    // ── Unique categories for filter ──
    const uniqueCategories = useMemo(() => {
        if (!bills) return [];
        const set = new Set<string>();
        bills.forEach(b => { set.add(b.category?.name || "Sem categoria"); });
        return Array.from(set).sort();
    }, [bills]);

    // ── Pie: paid bills grouped by category (top 8 + "Outros") ──
    const PIE_COLORS = ["#3b5bdb", "#2e7d32", "#c62828", "#f57f17", "#7c3aed", "#0891b2", "#be185d", "#ea580c", "#4f46e5", "#059669"];
    const categoryPieData = useMemo(() => {
        const paid = filteredBills.filter(b => b.status === "paid");
        const map = new Map<string, number>();
        paid.forEach(b => {
            const cat = b.category?.name || "Sem categoria";
            map.set(cat, (map.get(cat) || 0) + Number(b.amount));
        });
        const sorted = Array.from(map.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);
        if (sorted.length <= 8) return sorted;
        const top = sorted.slice(0, 7);
        const rest = sorted.slice(7).reduce((s, d) => s + d.value, 0);
        return [...top, { name: "Outros", value: rest }];
    }, [filteredBills]);

    // ── AI Analysis with market context ──
    const SELIC = 14.25; // Taxa Selic vigente (mar/2026)
    const IPCA_12M = 5.06; // IPCA acumulado 12 meses
    const CDI_MENSAL = SELIC / 12;

    const aiAnalysis = useMemo(() => {
        if (!filteredBills.length) return null;
        const total = filteredBills.reduce((s, b) => s + Number(b.amount), 0);
        const paid = filteredBills.filter(b => b.status === "paid");
        const pending = filteredBills.filter(b => b.status === "pending");
        const overdue = pending.filter(b => isBefore(startOfDay(parseISO(b.due_date)), startOfDay(new Date())));
        const paidTotal = paid.reduce((s, b) => s + Number(b.amount), 0);
        const pendingTotal = pending.reduce((s, b) => s + Number(b.amount), 0);
        const overdueTotal = overdue.reduce((s, b) => s + Number(b.amount), 0);
        const paidPct = total > 0 ? ((paidTotal / total) * 100).toFixed(1) : "0";
        const avgTicket = filteredBills.length > 0 ? total / filteredBills.length : 0;

        // Top category
        const catMap = new Map<string, number>();
        filteredBills.forEach(b => {
            const cat = b.category?.name || "Sem categoria";
            catMap.set(cat, (catMap.get(cat) || 0) + Number(b.amount));
        });
        const topCat = Array.from(catMap.entries()).sort((a, b) => b[1] - a[1])[0];
        const topCatPct = topCat && total > 0 ? ((topCat[1] / total) * 100).toFixed(1) : "0";

        // Top suppliers
        const supMap = new Map<string, number>();
        filteredBills.forEach(b => {
            const sup = b.supplier?.nome_fantasia || b.supplier?.razao_social || "Sem fornecedor";
            supMap.set(sup, (supMap.get(sup) || 0) + Number(b.amount));
        });
        const topSuppliers = Array.from(supMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
        const top3Total = topSuppliers.reduce((s, [, v]) => s + v, 0);
        const top3Pct = total > 0 ? ((top3Total / total) * 100).toFixed(0) : "0";

        // Cost of delay: overdue bills accumulate interest at ~2% per month (market average)
        const overdueInterestMonth = overdueTotal * 0.02;

        const insights: { title: string; text: string; type: "success" | "warning" | "danger" | "info" }[] = [];

        // 1. Execution
        if (Number(paidPct) >= 90) {
            insights.push({
                title: "Execucao financeira",
                text: `${paidPct}% das obrigacoes liquidadas (${fmt(paidTotal)} de ${fmt(total)}). Performance acima da media de PMEs no Brasil, que gira entre 70% e 80% segundo o Sebrae. Manter esse ritmo reduz exposicao a encargos moratarios, que no cenario atual equivalem a ${CDI_MENSAL.toFixed(2)}% ao mes (base Selic ${SELIC}% a.a.).`,
                type: "success",
            });
        } else if (Number(paidPct) >= 60) {
            insights.push({
                title: "Execucao financeira abaixo do ideal",
                text: `Apenas ${paidPct}% das contas foram pagas. ${fmt(pendingTotal)} permanecem em aberto. Com Selic a ${SELIC}% a.a. e inflacao (IPCA) a ${IPCA_12M}%, cada mes de inadimplencia custa aproximadamente 2% sobre o saldo devedor entre juros, multa e correcao. Isso significa um custo estimado de ${fmt(pendingTotal * 0.02)} por mes se nada for pago.`,
                type: "warning",
            });
        } else {
            insights.push({
                title: "Execucao financeira critica",
                text: `Somente ${paidPct}% das contas liquidadas. ${fmt(pendingTotal)} em aberto representam risco direto ao fluxo de caixa. Com a Selic a ${SELIC}% a.a., o custo mensal estimado da inadimplencia e de ${fmt(pendingTotal * 0.02)}. Alem dos encargos, ha risco de protesto, restricao cadastral e perda de poder de negociacao com fornecedores. Acao imediata necessaria.`,
                type: "danger",
            });
        }

        // 2. Overdue
        if (overdue.length > 0) {
            insights.push({
                title: `Inadimplencia: ${overdue.length} conta${overdue.length > 1 ? "s" : ""} vencida${overdue.length > 1 ? "s" : ""}`,
                text: `Total vencido: ${fmt(overdueTotal)}. Custo estimado de permanencia em atraso: ${fmt(overdueInterestMonth)}/mes (juros mora de 1% + multa de 2% no primeiro mes, alem de correcao monetaria). Com a taxa basica a ${SELIC}%, renegociar divida com instituicao financeira sai mais caro do que liquidar com recurso proprio. Prioridade: quitar as de maior valor para reduzir exposicao.`,
                type: "danger",
            });
        } else if (pending.length === 0) {
            insights.push({
                title: "Sem pendencias no periodo",
                text: `Todas as obrigacoes foram liquidadas. Empresa esta em posicao de forca para negociar: solicitar descontos de 2% a 5% por antecipacao de pagamento ou alongar prazos sem custo adicional. No cenario atual de juros elevados, fornecedores tendem a aceitar antecipacao com desconto.`,
                type: "success",
            });
        }

        // 3. Category
        if (topCat && topCat[0] !== "Sem categoria") {
            if (Number(topCatPct) > 40) {
                insights.push({
                    title: `Concentracao excessiva: ${topCat[0]} (${topCatPct}%)`,
                    text: `A categoria "${topCat[0]}" absorve ${topCatPct}% do total de pagamentos (${fmt(topCat[1])}). Concentracao acima de 40% em uma unica linha de custo aumenta a vulnerabilidade a reajustes. Com IPCA a ${IPCA_12M}% nos ultimos 12 meses, recomenda-se: (1) buscar fornecedores alternativos, (2) negociar contratos de longo prazo com indice de reajuste travado, (3) avaliar se ha ineficiencia operacional nessa categoria.`,
                    type: "warning",
                });
            } else {
                insights.push({
                    title: `Principal categoria: ${topCat[0]} (${topCatPct}%)`,
                    text: `Distribuicao entre categorias esta equilibrada. "${topCat[0]}" e a maior, com ${topCatPct}% do total. Manter diversificacao abaixo de 40% por categoria reduz o impacto de reajustes setoriais. Monitorar mensalmente para identificar tendencias de concentracao.`,
                    type: "info",
                });
            }
        }

        // 4. Suppliers
        if (Number(top3Pct) >= 60 && topSuppliers.length >= 3) {
            insights.push({
                title: `Dependencia de fornecedores: ${top3Pct}% em 3 empresas`,
                text: `${topSuppliers.map(([n, v]) => `${n}: ${fmt(v)}`).join(" / ")}. Concentracao acima de 60% em tres fornecedores configura risco operacional. Se qualquer um reajustar precos em 10%, o impacto no caixa sera de ${fmt(top3Total * 0.10)}. Recomendacao: mapear fornecedores alternativos e distribuir volume de compras.`,
                type: "warning",
            });
        }

        // 5. Market
        insights.push({
            title: "Cenario macroeconomico",
            text: `Selic: ${SELIC}% a.a. (juros elevados). IPCA acumulado 12 meses: ${IPCA_12M}%. CDI mensal: ${CDI_MENSAL.toFixed(2)}%. Impacto pratico: cada R$ 10.000 em atraso gera custo de ${fmt(10000 * 0.02)}/mes. Por outro lado, antecipar pagamentos com desconto de 3% gera economia de R$ 300 por R$ 10.000 — rendimento superior ao CDI mensal de ${fmt(10000 * CDI_MENSAL / 100)}. Conclusao: priorizar antecipacao com desconto e liquidar atrasos antes de investir excedentes.`,
            type: "info",
        });

        // 6. Uncategorized
        const uncatCount = filteredBills.filter(b => !b.category?.name).length;
        if (uncatCount > 3) {
            insights.push({
                title: `${uncatCount} contas sem categoria`,
                text: `${((uncatCount / filteredBills.length) * 100).toFixed(0)}% dos lancamentos estao sem classificacao. Isso compromete a qualidade das analises por categoria, impede a identificacao de gargalos de custo e dificulta o planejamento orcamentario. Categorize esses lancamentos para obter uma visao precisa da composicao dos gastos.`,
                type: "danger",
            });
        }

        return { insights, paidPct: Number(paidPct), hasOverdue: overdue.length > 0, total, avgTicket, billCount: filteredBills.length };
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

    // ── Export helpers ──
    const buildExportRows = () => filteredBills.map(b => ({
        Status: getStatus(b.status, b.due_date).label,
        Descricao: b.description,
        Fornecedor: b.supplier?.nome_fantasia || b.supplier?.razao_social || "-",
        Categoria: b.category?.name || "-",
        Vencimento: b.due_date ? format(parseISO(b.due_date), "dd/MM/yyyy") : "-",
        "Forma Pgto.": b.payment_method ? PM_LABELS[b.payment_method] || b.payment_method : "-",
        Valor: Number(b.amount),
    }));

    const exportPDF = () => {
        const rows = buildExportRows();
        const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
        const empresa = selectedCompany?.razao_social || "Empresa";
        const periodo = dateLabel;

        // Header
        doc.setFontSize(16);
        doc.setTextColor(15, 23, 42);
        doc.text("Contas a Pagar", 14, 18);
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(`${empresa}  |  Periodo: ${periodo}  |  Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 25);

        // Summary
        doc.setFontSize(10);
        doc.setTextColor(15, 23, 42);
        doc.text(`A Pagar: ${fmt(stats.pendingTotal)}   |   Pago: ${fmt(stats.paidTotal)}   |   Vencido: ${fmt(stats.overdueTotal)}`, 14, 33);

        // Table
        const cols = ["Status", "Descricao", "Fornecedor", "Categoria", "Vencimento", "Forma Pgto.", "Valor"];
        const colWidths = [22, 80, 50, 40, 26, 26, 28];
        const startY = 40;
        const rowH = 7;
        const pageW = doc.internal.pageSize.getWidth();

        // Header row
        doc.setFillColor(241, 245, 249);
        doc.rect(14, startY, pageW - 28, rowH, "F");
        doc.setFontSize(7.5);
        doc.setTextColor(100);
        let xOff = 14;
        cols.forEach((col, i) => {
            doc.text(col.toUpperCase(), xOff + 2, startY + 5);
            xOff += colWidths[i];
        });

        // Data rows
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42);
        let y = startY + rowH;
        rows.forEach((row, idx) => {
            if (y > doc.internal.pageSize.getHeight() - 15) {
                doc.addPage();
                y = 15;
            }
            if (idx % 2 === 0) {
                doc.setFillColor(248, 249, 251);
                doc.rect(14, y, pageW - 28, rowH, "F");
            }
            xOff = 14;
            cols.forEach((col, i) => {
                let val = String(col === "Valor" ? fmt(row[col]) : row[col as keyof typeof row]);
                // Truncate long text
                const maxChars = Math.floor(colWidths[i] / 1.8);
                if (val.length > maxChars) val = val.substring(0, maxChars - 1) + "…";
                doc.text(val, xOff + 2, y + 5);
                xOff += colWidths[i];
            });
            y += rowH;
        });

        // Footer
        const totalPages = doc.getNumberOfPages();
        for (let p = 1; p <= totalPages; p++) {
            doc.setPage(p);
            doc.setFontSize(7);
            doc.setTextColor(150);
            doc.text(`Pagina ${p} de ${totalPages}`, pageW - 30, doc.internal.pageSize.getHeight() - 8);
        }

        doc.save(`contas-a-pagar_${format(new Date(), "yyyy-MM-dd")}.pdf`);
    };

    const exportExcel = () => {
        const rows = buildExportRows();
        const ws = XLSX.utils.json_to_sheet(rows.map(r => ({ ...r, Valor: r.Valor })));
        // Set column widths
        ws["!cols"] = [
            { wch: 12 }, { wch: 50 }, { wch: 30 }, { wch: 25 }, { wch: 12 }, { wch: 14 }, { wch: 15 },
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Contas a Pagar");

        // Summary sheet
        const summaryData = [
            { Resumo: "Empresa", Valor: selectedCompany?.razao_social || "" },
            { Resumo: "Periodo", Valor: dateLabel },
            { Resumo: "Total A Pagar", Valor: stats.pendingTotal },
            { Resumo: "Total Pago", Valor: stats.paidTotal },
            { Resumo: "Total Vencido", Valor: stats.overdueTotal },
            { Resumo: "Qtd. Contas", Valor: filteredBills.length },
        ];
        const ws2 = XLSX.utils.json_to_sheet(summaryData);
        ws2["!cols"] = [{ wch: 18 }, { wch: 30 }];
        XLSX.utils.book_append_sheet(wb, ws2, "Resumo");

        XLSX.writeFile(wb, `contas-a-pagar_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
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
                            <p style={{ fontSize: 12, color: "#000", opacity: 0.45 }}>{filteredBills.length} contas no periodo</p>
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
                                    border: `1px solid ${T.border}`, background: T.card, color: "#000", cursor: "pointer",
                                }}>
                                    <CalendarDays size={12} strokeWidth={1.5} color={T.primary} />
                                    {dateLabel}
                                </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="end">
                                <Calendar mode="range" selected={{ from: dateRange.from, to: dateRange.to } as DateRange} onSelect={handleCalendarSelect} numberOfMonths={2} defaultMonth={dateRange.from} />
                            </PopoverContent>
                        </Popover>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button style={{
                                    display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
                                    borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, color: "#000",
                                    cursor: "pointer", fontFamily: FONT, fontSize: 12, fontWeight: 500,
                                }}>
                                    <Download size={14} strokeWidth={1.5} color={T.primary} />
                                    Exportar
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-[180px]">
                                <DropdownMenuLabel style={{ fontSize: 11 }}>Exportar dados</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={exportPDF} style={{ gap: 8 }}>
                                    <FileText className="h-4 w-4" style={{ color: T.red }} />
                                    <span>Baixar PDF</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={exportExcel} style={{ gap: 8 }}>
                                    <FileSpreadsheet className="h-4 w-4" style={{ color: T.green }} />
                                    <span>Baixar Excel</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        {/* AI toggle */}
                        {aiAnalysis && (
                            <button onClick={() => setAiOpen(!aiOpen)} style={{
                                display: "flex", alignItems: "center", gap: 6, padding: "6px 14px",
                                borderRadius: 8, border: "none", cursor: "pointer", fontFamily: FONT, fontSize: 12, fontWeight: 600,
                                background: aiOpen ? T.primary : aiAnalysis.hasOverdue ? T.red : aiAnalysis.paidPct >= 80 ? T.green : T.amber,
                                color: "#fff", transition: "all 0.2s ease",
                            }}>
                                <Sparkles size={14} strokeWidth={1.5} />
                                Analise
                                <ChevronRight size={14} strokeWidth={2} style={{
                                    transform: aiOpen ? "rotate(90deg)" : "rotate(0deg)",
                                    transition: "transform 0.2s ease",
                                }} />
                            </button>
                        )}
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

                {/* ════════ AI PANEL (collapsible) ════════ */}
                {aiOpen && aiAnalysis && (
                    <div style={{
                        background: T.card, borderRadius: 14, border: `1px solid ${T.border}`,
                        padding: "20px 22px", animation: "fadeIn 0.2s ease",
                    }}>
                        <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${T.border}` }}>
                            <Sparkles size={16} strokeWidth={1.5} color={T.primary} />
                            <div style={{ flex: 1 }}>
                                <p style={{ fontSize: 13, fontWeight: 700, color: "#000" }}>Analise Financeira</p>
                                <p style={{ fontSize: 10, color: "#000", opacity: 0.5 }}>Selic {SELIC}% a.a. | IPCA {IPCA_12M}% | CDI {CDI_MENSAL.toFixed(2)}%/mes | {aiAnalysis.billCount} lancamentos | Ticket medio {fmt(aiAnalysis.avgTicket)}</p>
                            </div>
                            <div style={{
                                padding: "3px 10px", borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" as const,
                                background: aiAnalysis.hasOverdue ? T.red : aiAnalysis.paidPct >= 80 ? T.green : T.amber,
                                color: "#fff",
                            }}>
                                {aiAnalysis.hasOverdue ? "ATENCAO" : aiAnalysis.paidPct >= 80 ? "SAUDAVEL" : "MODERADO"}
                            </div>
                            <button onClick={() => setAiOpen(false)} style={{
                                width: 28, height: 28, borderRadius: 6, border: "none", background: T.hover,
                                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                            }}>
                                <X size={14} strokeWidth={2} color={T.text2} />
                            </button>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 8 }}>
                            {aiAnalysis.insights.map((item, i) => (
                                <div key={i} style={{
                                    padding: "10px 12px", borderRadius: 8,
                                    borderLeft: `3px solid ${item.type === "danger" ? T.red : item.type === "warning" ? T.amber : item.type === "success" ? T.green : T.primary}`,
                                    background: item.type === "danger" ? `${T.red}06` : item.type === "warning" ? `${T.amber}06` : "transparent",
                                }}>
                                    <p style={{ fontSize: 11, fontWeight: 700, color: "#000", marginBottom: 4, textTransform: "uppercase" as const, letterSpacing: "0.02em" }}>{item.title}</p>
                                    <p style={{ fontSize: 11.5, color: "#000", lineHeight: 1.6, opacity: 0.85 }}>{item.text}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

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
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 16 }}>

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
                                <div style={{ height: 220, position: "relative" }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={categoryPieData}
                                                cx="50%" cy="50%"
                                                innerRadius={55} outerRadius={90}
                                                paddingAngle={2}
                                                dataKey="value"
                                                stroke="none"
                                            >
                                                {categoryPieData.map((_, i) => (
                                                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                formatter={(v: number, name: string) => [fmt(v), name]}
                                                contentStyle={tooltipStyle}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    {/* Center label */}
                                    <div style={{
                                        position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
                                        textAlign: "center", pointerEvents: "none",
                                    }}>
                                        <p style={{ fontSize: 16, fontWeight: 700, color: "#000", lineHeight: 1.1 }}>
                                            {fmt(categoryPieData.reduce((s, d) => s + d.value, 0))}
                                        </p>
                                        <p style={{ fontSize: 9, color: T.text3, marginTop: 2 }}>Total pago</p>
                                    </div>
                                </div>
                                {/* Legend — scrollable list */}
                                <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 12, overflow: "auto", maxHeight: 140 }} className="scrollbar-thin">
                                    {categoryPieData.map((item, i) => {
                                        const total = categoryPieData.reduce((s, d) => s + d.value, 0);
                                        const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0";
                                        return (
                                            <div key={item.name} style={{
                                                display: "flex", alignItems: "center", gap: 8, padding: "4px 6px", borderRadius: 6,
                                                cursor: "pointer", transition: "background 0.15s",
                                            }}
                                                onMouseEnter={(e) => { e.currentTarget.style.background = T.hover; }}
                                                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                                                onClick={() => setCategoryFilter(categoryFilter === item.name ? "all" : item.name)}
                                            >
                                                <div style={{ width: 10, height: 10, borderRadius: 3, background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                                                <span style={{ fontSize: 11, color: T.text1, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, fontWeight: 500 }}>{item.name}</span>
                                                <span style={{ fontSize: 11, fontWeight: 700, color: T.text1, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" as const }}>{pct}%</span>
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

                        {/* Category filter */}
                        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={{
                            padding: "5px 10px", borderRadius: 6, border: `1px solid ${T.border}`,
                            background: T.card, fontSize: 11, fontFamily: FONT, color: T.text1, cursor: "pointer",
                            maxWidth: 160,
                        }}>
                            <option value="all">Categoria</option>
                            {uniqueCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>

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
                                                        <>
                                                            <DropdownMenuItem onClick={() => { setPaymentItem(bill); setIsPaymentModalOpen(true); }}>
                                                                <DollarSign className="mr-2 h-3.5 w-3.5" style={{ color: T.green }} /> Baixar
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem asChild onSelect={e => e.preventDefault()}>
                                                                <div style={{ padding: 0 }}>
                                                                    <BotaoPagarComRecibo
                                                                        contaId={bill.id}
                                                                        tipo="payable"
                                                                        descricao={bill.description}
                                                                        valor={Number(bill.amount)}
                                                                        fornecedorOuCliente={bill.supplier?.nome_fantasia || bill.supplier?.razao_social}
                                                                        vencimento={bill.due_date}
                                                                        categoria={bill.category?.name}
                                                                        onSuccess={() => refetch()}
                                                                    />
                                                                </div>
                                                            </DropdownMenuItem>
                                                        </>
                                                    )}
                                                    {bill.status === "paid" && (
                                                        <DropdownMenuItem asChild onSelect={e => e.preventDefault()}>
                                                            <div style={{ padding: 0 }}>
                                                                <BotaoPagarComRecibo
                                                                    contaId={bill.id}
                                                                    tipo="payable"
                                                                    descricao={bill.description}
                                                                    valor={Number(bill.amount)}
                                                                    fornecedorOuCliente={bill.supplier?.nome_fantasia || bill.supplier?.razao_social}
                                                                    vencimento={bill.due_date}
                                                                    categoria={bill.category?.name}
                                                                    onSuccess={() => refetch()}
                                                                    apenasRecibo
                                                                />
                                                            </div>
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
