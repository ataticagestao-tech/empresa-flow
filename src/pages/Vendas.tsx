import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    ShoppingCart, Plus, Search, Pencil, Trash2, DollarSign,
    TrendingUp, Package, MoreHorizontal, Download, FileText, FileSpreadsheet,
} from "lucide-react";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
    PieChart, Pie, Cell,
} from "recharts";
import {
    format, parseISO, startOfMonth, endOfMonth, subMonths, startOfYear, startOfDay, endOfDay,
    isBefore, isAfter,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarDays } from "lucide-react";
import type { DateRange } from "react-day-picker";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";
import { useToast } from "@/hooks/use-toast";

const T = {
    primary: "#3b5bdb", primaryLt: "#eef2ff",
    green: "#2e7d32", greenLt: "#e8f5e9",
    red: "#c62828", redLt: "#fde8e8",
    amber: "#f57f17", amberLt: "#fff8e1",
    text1: "#0f172a", text2: "#475569", text3: "#94a3b8",
    border: "#e2e8f0", hover: "#f1f5f9",
} as const;
const FONT = "var(--font-base)";
const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const PM_LABELS: Record<string, string> = {
    pix: "Pix", boleto: "Boleto", transfer: "Transferência", cash: "Dinheiro", card: "Cartão", other: "Outro",
};

const presets = [
    { label: "Este mês", get: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }) },
    { label: "Mês passado", get: () => ({ from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) }) },
    { label: "3 meses", get: () => ({ from: startOfMonth(subMonths(new Date(), 2)), to: endOfMonth(new Date()) }) },
    { label: "Este ano", get: () => ({ from: startOfYear(new Date()), to: endOfMonth(new Date()) }) },
];

interface SaleItem {
    product_id: string;
    description: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
}

interface SaleForm {
    items: SaleItem[];
    client_id: string;
    payment_method: string;
    due_date: string;
    observations: string;
}

const emptyForm: SaleForm = {
    items: [],
    client_id: "", payment_method: "pix",
    due_date: format(new Date(), "yyyy-MM-dd"), observations: "",
};

const PIE_COLORS = ["#3b5bdb", "#2e7d32", "#c62828", "#f57f17", "#7c3aed", "#0891b2", "#be185d", "#ea580c"];

export default function Vendas() {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const { toast } = useToast();

    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<SaleForm>(emptyForm);
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [dateRange, setDateRange] = useState(() => presets[0].get());
    const [activePreset, setActivePreset] = useState("Este mês");

    // Add client inline
    const [clientDialogOpen, setClientDialogOpen] = useState(false);
    const [newClientName, setNewClientName] = useState("");
    const [newClientPhone, setNewClientPhone] = useState("");
    const [newClientEmail, setNewClientEmail] = useState("");
    const [newClientDoc, setNewClientDoc] = useState("");

    const handlePreset = (p: typeof presets[0]) => { setActivePreset(p.label); setDateRange(p.get()); };
    const handleCalendarSelect = (range: DateRange | undefined) => {
        if (range?.from) { setActivePreset(""); setDateRange({ from: range.from, to: range.to || range.from }); }
    };

    // Fetch sales (accounts_receivable marked as sales or all)
    const { data: sales = [], isLoading, refetch } = useQuery({
        queryKey: ["vendas", selectedCompany?.id],
        queryFn: async () => {
            const { data: rows } = await (activeClient as any)
                .from("accounts_receivable")
                .select("*")
                .eq("company_id", selectedCompany?.id)
                .order("due_date", { ascending: false });

            if (!rows) return [];

            const catIds = [...new Set(rows.map((r: any) => r.category_id).filter(Boolean))] as string[];
            const cliIds = [...new Set(rows.map((r: any) => r.client_id).filter(Boolean))] as string[];
            const catMap: Record<string, string> = {};
            const cliMap: Record<string, { razao_social: string; nome_fantasia?: string }> = {};

            if (catIds.length) {
                const { data: cats } = await (activeClient as any)
                    .from("chart_of_accounts").select("id, name").in("id", catIds);
                if (cats) cats.forEach((c: any) => { catMap[c.id] = c.name; });
                if (!cats || cats.length === 0) {
                    const { data: cats2 } = await (activeClient as any)
                        .from("categories").select("id, name").in("id", catIds);
                    if (cats2) cats2.forEach((c: any) => { catMap[c.id] = c.name; });
                }
            }
            if (cliIds.length) {
                const { data: clis } = await (activeClient as any)
                    .from("clients").select("id, razao_social, nome_fantasia").in("id", cliIds);
                if (clis) clis.forEach((c: any) => { cliMap[c.id] = { razao_social: c.razao_social, nome_fantasia: c.nome_fantasia }; });
            }

            return rows.map((r: any) => ({
                ...r,
                category_name: catMap[r.category_id] || "",
                client_name: cliMap[r.client_id]?.nome_fantasia || cliMap[r.client_id]?.razao_social || "",
            }));
        },
        enabled: !!selectedCompany?.id,
    });

    // Fetch clients for select
    const { data: clients = [], refetch: refetchClients } = useQuery({
        queryKey: ["vendas_clients", selectedCompany?.id],
        queryFn: async () => {
            const { data } = await (activeClient as any)
                .from("clients").select("id, razao_social, nome_fantasia")
                .eq("company_id", selectedCompany?.id).order("razao_social");
            return data || [];
        },
        enabled: !!selectedCompany?.id,
    });

    // Save new client inline
    const saveNewClient = async () => {
        if (!newClientName.trim() || !selectedCompany?.id) return;
        const { data, error } = await (activeClient as any)
            .from("clients")
            .insert({
                company_id: selectedCompany.id,
                razao_social: newClientName.trim(),
                nome_fantasia: newClientName.trim(),
                phone: newClientPhone || null,
                email: newClientEmail || null,
                cpf_cnpj: newClientDoc || null,
            })
            .select("id")
            .single();
        if (error) {
            toast({ title: "Erro ao cadastrar cliente", description: error.message, variant: "destructive" });
            return;
        }
        toast({ title: "Cliente cadastrado" });
        await refetchClients();
        setForm({ ...form, client_id: data.id });
        setClientDialogOpen(false);
        setNewClientName(""); setNewClientPhone(""); setNewClientEmail(""); setNewClientDoc("");
    };

    // Fetch categories (revenue type)
    const { data: categories = [] } = useQuery({
        queryKey: ["vendas_categories", selectedCompany?.id],
        queryFn: async () => {
            const { data } = await (activeClient as any)
                .from("chart_of_accounts").select("id, code, name")
                .eq("company_id", selectedCompany?.id)
                .eq("account_type", "revenue")
                .eq("is_analytical", true)
                .order("code");
            return data || [];
        },
        enabled: !!selectedCompany?.id,
    });

    // Fetch products from Operacional
    const { data: products = [] } = useQuery({
        queryKey: ["vendas_products", selectedCompany?.id],
        queryFn: async () => {
            const { data } = await (activeClient as any)
                .from("products")
                .select("id, code, description, price, cost_price, activity, is_active")
                .eq("company_id", selectedCompany?.id)
                .eq("is_active", true)
                .order("description");
            return data || [];
        },
        enabled: !!selectedCompany?.id,
    });

    // Add product to items list
    const handleAddProduct = (productId: string) => {
        const product = products.find((p: any) => p.id === productId);
        if (!product) return;
        const existing = form.items.find(i => i.product_id === productId);
        if (existing) {
            // Increment quantity if already in list
            setForm({
                ...form,
                items: form.items.map(i =>
                    i.product_id === productId
                        ? { ...i, quantity: i.quantity + 1, subtotal: (i.quantity + 1) * i.unit_price }
                        : i
                ),
            });
        } else {
            const price = Number(product.price);
            setForm({
                ...form,
                items: [...form.items, {
                    product_id: productId,
                    description: product.description,
                    quantity: 1,
                    unit_price: price,
                    subtotal: price,
                }],
            });
        }
    };

    // Update item quantity or price
    const updateItem = (index: number, field: "quantity" | "unit_price", value: number) => {
        const items = [...form.items];
        items[index] = { ...items[index], [field]: value, subtotal: field === "quantity" ? value * items[index].unit_price : items[index].quantity * value };
        setForm({ ...form, items });
    };

    // Remove item
    const removeItem = (index: number) => {
        setForm({ ...form, items: form.items.filter((_, i) => i !== index) });
    };

    // Total of all items
    const formTotal = form.items.reduce((s, i) => s + i.subtotal, 0);

    // Save mutation
    const saveMutation = useMutation({
        mutationFn: async () => {
            const description = form.items.map(i => `${i.quantity}x ${i.description}`).join(", ");
            const payload = {
                company_id: selectedCompany?.id,
                description,
                amount: formTotal,
                client_id: form.client_id || null,
                category_id: null,
                payment_method: form.payment_method,
                due_date: form.due_date,
                status: "pending",
                observations: form.observations || null,
            };

            if (editingId) {
                const { error } = await (activeClient as any)
                    .from("accounts_receivable").update(payload).eq("id", editingId);
                if (error) throw error;
            } else {
                const { error } = await (activeClient as any)
                    .from("accounts_receivable").insert(payload);
                if (error) throw error;
            }
        },
        onSuccess: () => {
            toast({ title: editingId ? "Venda atualizada" : "Venda registrada" });
            setDialogOpen(false);
            setEditingId(null);
            setForm(emptyForm);
            refetch();
        },
        onError: (err: any) => {
            toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
        },
    });

    // Delete
    const handleDelete = async (id: string, desc: string) => {
        if (!window.confirm(`Excluir venda "${desc}"?`)) return;
        const { error } = await (activeClient as any).from("accounts_receivable").delete().eq("id", id);
        if (!error) refetch();
    };

    // Edit
    const handleEdit = (sale: any) => {
        setEditingId(sale.id);
        // Parse description back into items if possible
        const items: SaleItem[] = [{
            product_id: "",
            description: sale.description || "",
            quantity: 1,
            unit_price: Number(sale.amount || 0),
            subtotal: Number(sale.amount || 0),
        }];
        setForm({
            items,
            client_id: sale.client_id || "",
            payment_method: sale.payment_method || "pix",
            due_date: sale.due_date || format(new Date(), "yyyy-MM-dd"),
            observations: sale.observations || "",
        });
        setDialogOpen(true);
    };

    // Filter
    const normalizeSearch = (v: unknown) =>
        String(v ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

    const filtered = useMemo(() => {
        const rangeStart = startOfDay(dateRange.from);
        const rangeEnd = endOfDay(dateRange.to);

        return sales.filter((s: any) => {
            if (s.due_date) {
                const d = parseISO(s.due_date);
                if (isBefore(d, rangeStart) || isAfter(d, rangeEnd)) return false;
            }
            if (statusFilter !== "all" && s.status !== statusFilter) return false;
            if (searchTerm.trim()) {
                const needle = normalizeSearch(searchTerm);
                const haystack = normalizeSearch([s.description, s.client_name, s.category_name, fmt(Number(s.amount))].join(" "));
                if (!haystack.includes(needle)) return false;
            }
            return true;
        });
    }, [sales, dateRange, statusFilter, searchTerm]);

    // KPIs
    const stats = useMemo(() => {
        const total = filtered.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
        const paid = filtered.filter((r: any) => r.status === "paid");
        const paidTotal = paid.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
        const pending = filtered.filter((r: any) => r.status === "pending");
        const pendingTotal = pending.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
        const avgTicket = filtered.length > 0 ? total / filtered.length : 0;
        return { total, paidTotal, paidCount: paid.length, pendingTotal, pendingCount: pending.length, count: filtered.length, avgTicket };
    }, [filtered]);

    // Chart: monthly bar
    const chartData = useMemo(() => {
        const map = new Map<string, { label: string; recebido: number; pendente: number }>();
        filtered.forEach((s: any) => {
            if (!s.due_date) return;
            const key = s.due_date.substring(0, 7);
            const label = format(parseISO(s.due_date), "MMM/yy", { locale: ptBR });
            if (!map.has(key)) map.set(key, { label, recebido: 0, pendente: 0 });
            const entry = map.get(key)!;
            if (s.status === "paid") entry.recebido += Number(s.amount);
            else entry.pendente += Number(s.amount);
        });
        return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
    }, [filtered]);

    // Pie: by category
    const pieData = useMemo(() => {
        const map = new Map<string, number>();
        filtered.forEach((s: any) => {
            const cat = s.category_name || "Sem categoria";
            map.set(cat, (map.get(cat) || 0) + Number(s.amount));
        });
        return Array.from(map.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8);
    }, [filtered]);

    // Export PDF
    const exportPDF = () => {
        const doc = new jsPDF();
        doc.setFontSize(16);
        doc.text("Relatório de Vendas", 14, 20);
        doc.setFontSize(10);
        doc.text(`Período: ${format(dateRange.from, "dd/MM/yyyy")} - ${format(dateRange.to, "dd/MM/yyyy")}`, 14, 28);
        doc.text(`Total: ${fmt(stats.total)} | ${stats.count} vendas`, 14, 34);

        let y = 44;
        doc.setFontSize(8);
        doc.text("Data", 14, y); doc.text("Descrição", 40, y); doc.text("Cliente", 100, y); doc.text("Valor", 160, y); doc.text("Status", 185, y);
        y += 6;

        filtered.forEach((s: any) => {
            if (y > 280) { doc.addPage(); y = 20; }
            doc.text(s.due_date ? format(parseISO(s.due_date), "dd/MM/yyyy") : "—", 14, y);
            doc.text((s.description || "—").substring(0, 30), 40, y);
            doc.text((s.client_name || "—").substring(0, 30), 100, y);
            doc.text(fmt(Number(s.amount)), 160, y);
            doc.text(s.status === "paid" ? "Recebido" : "Pendente", 185, y);
            y += 5;
        });
        doc.save("vendas.pdf");
    };

    // Export Excel
    const exportExcel = () => {
        const wsData = filtered.map((s: any) => ({
            Data: s.due_date ? format(parseISO(s.due_date), "dd/MM/yyyy") : "",
            Descrição: s.description || "",
            Cliente: s.client_name || "",
            Categoria: s.category_name || "",
            Valor: Number(s.amount),
            "Forma Pgto": PM_LABELS[s.payment_method] || s.payment_method || "",
            Status: s.status === "paid" ? "Recebido" : s.status === "pending" ? "Pendente" : s.status,
        }));
        const ws = XLSX.utils.json_to_sheet(wsData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Vendas");
        XLSX.writeFile(wb, "vendas.xlsx");
    };

    const dateLabel = `${format(dateRange.from, "dd MMM", { locale: ptBR })} - ${format(dateRange.to, "dd MMM yyyy", { locale: ptBR })}`;

    const statusBadge = (status: string) => {
        if (status === "paid") return <Badge className="bg-green-100 text-green-700">Recebido</Badge>;
        if (status === "cancelled") return <Badge className="bg-gray-100 text-gray-500">Cancelado</Badge>;
        return <Badge className="bg-amber-100 text-amber-700">Pendente</Badge>;
    };

    return (
        <AppLayout title="Vendas">
            <div style={{ fontFamily: FONT, display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ background: T.primaryLt, borderRadius: 12, padding: 10 }}>
                            <ShoppingCart size={22} color={T.primary} />
                        </div>
                        <div>
                            <h2 style={{ fontSize: 20, fontWeight: 700, color: T.text1 }}>Vendas</h2>
                            <p style={{ fontSize: 12, color: T.text3 }}>{stats.count} vendas no período</p>
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        {presets.map(p => (
                            <Button key={p.label} variant={activePreset === p.label ? "default" : "outline"} size="sm"
                                onClick={() => handlePreset(p)} style={{ fontSize: 12 }}>{p.label}</Button>
                        ))}
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" size="sm" style={{ fontSize: 12, gap: 4 }}>
                                    <CalendarDays size={14} /> {dateLabel}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="end">
                                <Calendar mode="range" selected={{ from: dateRange.from, to: dateRange.to }}
                                    onSelect={handleCalendarSelect} locale={ptBR} numberOfMonths={2} />
                            </PopoverContent>
                        </Popover>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm"><Download size={14} /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                                <DropdownMenuItem onClick={exportPDF}><FileText className="mr-2 h-4 w-4" /> PDF</DropdownMenuItem>
                                <DropdownMenuItem onClick={exportExcel}><FileSpreadsheet className="mr-2 h-4 w-4" /> Excel</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button size="sm" onClick={() => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); }}
                            style={{ gap: 6 }}><Plus size={16} /> Nova Venda</Button>
                    </div>
                </div>

                {/* KPIs */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
                    {[
                        { label: "TOTAL VENDAS", value: fmt(stats.total), sub: `${stats.count} vendas`, icon: ShoppingCart, color: T.primary, bg: T.primaryLt },
                        { label: "RECEBIDO", value: fmt(stats.paidTotal), sub: `${stats.paidCount} recebidos`, icon: DollarSign, color: T.green, bg: T.greenLt },
                        { label: "PENDENTE", value: fmt(stats.pendingTotal), sub: `${stats.pendingCount} pendentes`, icon: TrendingUp, color: T.amber, bg: T.amberLt },
                        { label: "TICKET MÉDIO", value: fmt(stats.avgTicket), sub: "por venda", icon: Package, color: T.primary, bg: T.primaryLt },
                    ].map((kpi, i) => (
                        <Card key={i} style={{ padding: 20, borderRadius: 14, border: `1px solid ${T.border}` }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <div style={{ background: kpi.bg, borderRadius: 10, padding: 10 }}>
                                    <kpi.icon size={20} color={kpi.color} />
                                </div>
                                <div>
                                    <p style={{ fontSize: 11, color: T.text3, fontWeight: 600 }}>{kpi.label}</p>
                                    <p style={{ fontSize: 20, fontWeight: 800, color: kpi.color }}>{kpi.value}</p>
                                    <p style={{ fontSize: 11, color: T.text3 }}>{kpi.sub}</p>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>

                {/* Charts */}
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
                    <Card style={{ padding: 20, borderRadius: 14, border: `1px solid ${T.border}` }}>
                        <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Vendas por Mês</p>
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                                <Tooltip formatter={(v: number) => fmt(v)} />
                                <Legend />
                                <Bar dataKey="recebido" fill={T.green} name="Recebido" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="pendente" fill={T.amber} name="Pendente" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </Card>
                    <Card style={{ padding: 20, borderRadius: 14, border: `1px solid ${T.border}` }}>
                        <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Por Categoria</p>
                        {pieData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={260}>
                                <PieChart>
                                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={90}
                                        paddingAngle={2} dataKey="value" nameKey="name">
                                        {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                                    </Pie>
                                    <Tooltip formatter={(v: number) => fmt(v)} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div style={{ height: 260, display: "flex", alignItems: "center", justifyContent: "center", color: T.text3, fontSize: 13 }}>
                                Sem dados para exibir
                            </div>
                        )}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                            {pieData.map((d, i) => (
                                <span key={i} style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 4 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: 2, background: PIE_COLORS[i % PIE_COLORS.length] }} />
                                    {d.name}
                                </span>
                            ))}
                        </div>
                    </Card>
                </div>

                {/* Filters + Table */}
                <Card style={{ borderRadius: 14, border: `1px solid ${T.border}`, overflow: "hidden" }}>
                    <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
                            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.text3 }} />
                            <Input placeholder="Buscar vendas..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                                className="h-9 pl-8 text-sm" />
                        </div>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-[140px] h-9 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos</SelectItem>
                                <SelectItem value="pending">Pendente</SelectItem>
                                <SelectItem value="paid">Recebido</SelectItem>
                                <SelectItem value="cancelled">Cancelado</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Data</TableHead>
                                <TableHead>Produto/Serviço</TableHead>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Forma Pgto</TableHead>
                                <TableHead className="text-right">Valor</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="w-[50px]" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                            ) : filtered.length === 0 ? (
                                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhuma venda encontrada.</TableCell></TableRow>
                            ) : filtered.map((s: any) => (
                                <TableRow key={s.id} className="hover:bg-slate-50/50">
                                    <TableCell className="text-sm">{s.due_date ? format(parseISO(s.due_date), "dd/MM/yyyy") : "—"}</TableCell>
                                    <TableCell className="font-medium text-sm">{s.description || "—"}</TableCell>
                                    <TableCell className="text-sm">{s.client_name || "—"}</TableCell>
                                    <TableCell className="text-sm">{PM_LABELS[s.payment_method] || s.payment_method || "—"}</TableCell>
                                    <TableCell className="text-right font-semibold" style={{ color: T.green }}>{fmt(Number(s.amount))}</TableCell>
                                    <TableCell>{statusBadge(s.status)}</TableCell>
                                    <TableCell>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => handleEdit(s)}><Pencil className="mr-2 h-3.5 w-3.5" /> Editar</DropdownMenuItem>
                                                <DropdownMenuItem className="text-red-600" onClick={() => handleDelete(s.id, s.description)}>
                                                    <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Card>

                {/* Dialog - Nova/Editar Venda */}
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>{editingId ? "Editar Venda" : "Nova Venda"}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-2">
                            {/* Product selector */}
                            <div className="space-y-2">
                                <Label>Adicionar Produto / Serviço</Label>
                                <Select value="" onValueChange={handleAddProduct}>
                                    <SelectTrigger className="text-sm">
                                        <SelectValue placeholder="Selecione um produto para adicionar..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {products.map((p: any) => (
                                            <SelectItem key={p.id} value={p.id}>
                                                {p.code ? `${p.code} - ` : ""}{p.description} — {fmt(Number(p.price))}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {products.length === 0 && (
                                    <p className="text-xs text-muted-foreground">
                                        Nenhum produto cadastrado. Cadastre em Operacional &gt; Produtos.
                                    </p>
                                )}
                            </div>

                            {/* Items list */}
                            {form.items.length > 0 && (
                                <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
                                    <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                                        <thead>
                                            <tr style={{ background: "#f8fafc", borderBottom: `1px solid ${T.border}` }}>
                                                <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, fontSize: 11, color: T.text3 }}>PRODUTO</th>
                                                <th style={{ padding: "8px 12px", textAlign: "center", fontWeight: 600, fontSize: 11, color: T.text3, width: 80 }}>QTD</th>
                                                <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, fontSize: 11, color: T.text3, width: 120 }}>UNIT.</th>
                                                <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, fontSize: 11, color: T.text3, width: 120 }}>SUBTOTAL</th>
                                                <th style={{ width: 40 }} />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {form.items.map((item, i) => (
                                                <tr key={i} style={{ borderBottom: `1px solid ${T.border}` }}>
                                                    <td style={{ padding: "8px 12px", fontWeight: 500 }}>{item.description}</td>
                                                    <td style={{ padding: "4px 8px", textAlign: "center" }}>
                                                        <Input type="number" min={1} value={item.quantity}
                                                            onChange={e => updateItem(i, "quantity", Number(e.target.value) || 1)}
                                                            className="h-7 w-16 text-center text-sm mx-auto" />
                                                    </td>
                                                    <td style={{ padding: "4px 8px", textAlign: "right" }}>
                                                        <Input type="number" value={item.unit_price} step="0.01"
                                                            onChange={e => updateItem(i, "unit_price", Number(e.target.value) || 0)}
                                                            className="h-7 w-24 text-right text-sm ml-auto" />
                                                    </td>
                                                    <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: T.green }}>
                                                        {fmt(item.subtotal)}
                                                    </td>
                                                    <td style={{ padding: "4px 8px" }}>
                                                        <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:text-red-700"
                                                            onClick={() => removeItem(i)}>
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {/* Total bar */}
                                    <div style={{
                                        display: "flex", justifyContent: "space-between", alignItems: "center",
                                        padding: "12px 16px", background: T.greenLt, borderTop: `1px solid ${T.border}`,
                                    }}>
                                        <span style={{ fontSize: 14, fontWeight: 700, color: T.text1 }}>
                                            TOTAL ({form.items.length} {form.items.length === 1 ? "item" : "itens"})
                                        </span>
                                        <span style={{ fontSize: 20, fontWeight: 800, color: T.green }}>
                                            {fmt(formTotal)}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {form.items.length === 0 && (
                                <div style={{
                                    padding: "24px 16px", textAlign: "center", border: `2px dashed ${T.border}`,
                                    borderRadius: 10, color: T.text3, fontSize: 13,
                                }}>
                                    Selecione produtos acima para adicionar à venda
                                </div>
                            )}

                            {/* Client, payment, date */}
                            <div className="space-y-2">
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <Label>Cliente</Label>
                                    <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 text-primary"
                                        onClick={() => setClientDialogOpen(true)}>
                                        <Plus size={12} /> Novo Cliente
                                    </Button>
                                </div>
                                <Select value={form.client_id} onValueChange={v => setForm({ ...form, client_id: v })}>
                                    <SelectTrigger className="text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                                    <SelectContent>
                                        {clients.map((c: any) => (
                                            <SelectItem key={c.id} value={c.id}>{c.nome_fantasia || c.razao_social}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Forma de Pagamento</Label>
                                    <Select value={form.payment_method} onValueChange={v => setForm({ ...form, payment_method: v })}>
                                        <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {Object.entries(PM_LABELS).map(([k, v]) => (
                                                <SelectItem key={k} value={k}>{v}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Data</Label>
                                    <Input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Observações</Label>
                                <Input value={form.observations} onChange={e => setForm({ ...form, observations: e.target.value })}
                                    placeholder="Opcional" />
                            </div>
                            <Button className="w-full" onClick={() => saveMutation.mutate()}
                                disabled={form.items.length === 0 || saveMutation.isPending}>
                                {saveMutation.isPending ? "Salvando..." : editingId ? "Atualizar Venda" : `Registrar Venda — ${fmt(formTotal)}`}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Dialog - Novo Cliente */}
                <Dialog open={clientDialogOpen} onOpenChange={setClientDialogOpen}>
                    <DialogContent className="max-w-sm">
                        <DialogHeader>
                            <DialogTitle>Novo Cliente</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-2">
                            <div className="space-y-2">
                                <Label>Nome *</Label>
                                <Input value={newClientName} onChange={e => setNewClientName(e.target.value)}
                                    placeholder="Nome do cliente" />
                            </div>
                            <div className="space-y-2">
                                <Label>CPF / CNPJ</Label>
                                <Input value={newClientDoc} onChange={e => setNewClientDoc(e.target.value)}
                                    placeholder="Opcional" />
                            </div>
                            <div className="space-y-2">
                                <Label>Telefone</Label>
                                <Input value={newClientPhone} onChange={e => setNewClientPhone(e.target.value)}
                                    placeholder="Opcional" />
                            </div>
                            <div className="space-y-2">
                                <Label>E-mail</Label>
                                <Input value={newClientEmail} onChange={e => setNewClientEmail(e.target.value)}
                                    placeholder="Opcional" />
                            </div>
                            <Button className="w-full" onClick={saveNewClient} disabled={!newClientName.trim()}>
                                Cadastrar Cliente
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
        </AppLayout>
    );
}
