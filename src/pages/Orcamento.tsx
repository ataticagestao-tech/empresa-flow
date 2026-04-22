import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Calculator, Pencil, DollarSign, PieChart, CheckCircle2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function getBudgetKey(companyId: string, month: string) {
    return `budget_${companyId}_${month}`;
}

export default function Orcamento() {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const [currentMonth, setCurrentMonth] = useState(format(new Date(), "yyyy-MM"));
    const [editDialog, setEditDialog] = useState(false);
    const [editCategory, setEditCategory] = useState<{ id: string; name: string; code: string } | null>(null);
    const [editValue, setEditValue] = useState("");

    const monthStart = startOfMonth(new Date(currentMonth + "-01"));
    const monthEnd = endOfMonth(monthStart);

    const { data: categories = [] } = useQuery({
        queryKey: ["budget_categories", selectedCompany?.id],
        queryFn: async () => {
            const { data } = await (activeClient as any)
                .from("chart_of_accounts")
                .select("id, code, name, account_type")
                .eq("company_id", selectedCompany?.id)
                .eq("is_analytical", true)
                .in("account_type", ["expense", "cost"])
                .order("code");
            return data || [];
        },
        enabled: !!selectedCompany?.id,
    });

    const { data: payables = [] } = useQuery({
        queryKey: ["budget_payables", selectedCompany?.id, currentMonth],
        queryFn: async () => {
            const { data } = await (activeClient as any)
                .from("contas_pagar")
                .select("id, valor, conta_contabil_id, status")
                .eq("company_id", selectedCompany?.id)
                .gte("data_vencimento", format(monthStart, "yyyy-MM-dd"))
                .lte("data_vencimento", format(monthEnd, "yyyy-MM-dd"));
            return data || [];
        },
        enabled: !!selectedCompany?.id,
    });

    const budgets = useMemo(() => {
        if (!selectedCompany?.id) return {};
        const key = getBudgetKey(selectedCompany.id, currentMonth);
        try { return JSON.parse(localStorage.getItem(key) || "{}"); } catch { return {}; }
    }, [selectedCompany?.id, currentMonth, editDialog]);

    const saveBudget = (categoryId: string, value: number) => {
        if (!selectedCompany?.id) return;
        const key = getBudgetKey(selectedCompany.id, currentMonth);
        const current = { ...budgets, [categoryId]: value };
        localStorage.setItem(key, JSON.stringify(current));
    };

    const rows = useMemo(() => {
        return categories.map((cat: any) => {
            const orcado = budgets[cat.id] || 0;
            const realizado = payables
                .filter((p: any) => p.conta_contabil_id === cat.id)
                .reduce((s: number, p: any) => s + Number(p.valor || 0), 0);
            const disponivel = orcado - realizado;
            const pct = orcado > 0 ? (realizado / orcado) * 100 : 0;
            return { ...cat, orcado, realizado, disponivel, pct };
        }).filter((r: any) => r.orcado > 0 || r.realizado > 0);
    }, [categories, payables, budgets]);

    const totalOrcado = rows.reduce((s: number, r: any) => s + r.orcado, 0);
    const totalRealizado = rows.reduce((s: number, r: any) => s + r.realizado, 0);
    const totalDisponivel = totalOrcado - totalRealizado;
    const totalPct = totalOrcado > 0 ? (totalRealizado / totalOrcado) * 100 : 0;

    const chartData = rows.slice(0, 10).map((r: any) => ({
        name: r.name.length > 15 ? r.name.substring(0, 15) + "..." : r.name,
        Orçado: r.orcado,
        Realizado: r.realizado,
    }));

    const handleEdit = (cat: any) => {
        setEditCategory(cat);
        setEditValue(budgets[cat.id] ? String(budgets[cat.id]) : "");
        setEditDialog(true);
    };

    const handleSave = () => {
        if (editCategory) {
            saveBudget(editCategory.id, parseFloat(editValue.replace(",", ".")) || 0);
            setEditDialog(false);
        }
    };

    const months = Array.from({ length: 12 }, (_, i) => {
        const d = new Date(2026, i, 1);
        return { value: format(d, "yyyy-MM"), label: format(d, "MMMM yyyy", { locale: ptBR }) };
    });

    return (
        <AppLayout title="Orçamento">
            <div style={{ fontFamily: "var(--font-base)", display: "flex", flexDirection: "column", gap: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Orçamento</h2>
                        <p style={{ fontSize: 13, color: "#98A2B3" }}>{format(monthStart, "MMMM yyyy", { locale: ptBR })}</p>
                    </div>
                    <select value={currentMonth} onChange={e => setCurrentMonth(e.target.value)}
                        style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #EAECF0", fontSize: 13 }}>
                        {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
                    {[
                        { label: "ORÇAMENTO TOTAL", value: fmt(totalOrcado), icon: Calculator, color: "#059669", bg: "#ECFDF4" },
                        { label: "REALIZADO", value: fmt(totalRealizado), icon: DollarSign, color: "#D92D20", bg: "#FEF3F2" },
                        { label: "DISPONÍVEL", value: fmt(totalDisponivel), icon: CheckCircle2, color: "#039855", bg: "#ECFDF3" },
                        { label: "% UTILIZADO", value: `${totalPct.toFixed(1)}%`, icon: PieChart, color: totalPct > 100 ? "#D92D20" : "#f57f17", bg: totalPct > 100 ? "#FEF3F2" : "#fff8e1" },
                    ].map((kpi, i) => (
                        <Card key={i} style={{ padding: 20, borderRadius: 14, border: "1px solid #EAECF0" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <div style={{ background: kpi.bg, borderRadius: 10, padding: 10 }}><kpi.icon size={20} color={kpi.color} /></div>
                                <div>
                                    <p style={{ fontSize: 11, color: "#98A2B3", fontWeight: 600 }}>{kpi.label}</p>
                                    <p style={{ fontSize: 20, fontWeight: 800, color: kpi.color }}>{kpi.value}</p>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>

                {chartData.length > 0 && (
                    <Card style={{ padding: 20, borderRadius: 14, border: "1px solid #EAECF0" }}>
                        <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Orçado vs Realizado</p>
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#F6F2EB" />
                                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                                <Tooltip formatter={(v: number) => fmt(v)} />
                                <Legend />
                                <Bar dataKey="Orçado" fill="#059669" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="Realizado" fill="#D92D20" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </Card>
                )}

                <Card style={{ borderRadius: 14, border: "1px solid #EAECF0", overflow: "hidden" }}>
                    <div style={{ padding: "16px 20px", borderBottom: "1px solid #EAECF0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <p style={{ fontWeight: 700, fontSize: 14 }}>Detalhamento por Categoria</p>
                        <Button size="sm" variant="outline" onClick={() => { setEditCategory(null); setEditValue(""); setEditDialog(true); }}>
                            Definir Orçamento
                        </Button>
                    </div>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Categoria</TableHead>
                                <TableHead className="text-right">Orçado</TableHead>
                                <TableHead className="text-right">Realizado</TableHead>
                                <TableHead className="text-right">Disponível</TableHead>
                                <TableHead style={{ width: 200 }}>% Utilizado</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.length === 0 ? (
                                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Defina orçamentos para suas categorias de despesa.</TableCell></TableRow>
                            ) : rows.map((r: any) => (
                                <TableRow key={r.id}>
                                    <TableCell className="font-medium">{r.code} - {r.name}</TableCell>
                                    <TableCell className="text-right">{fmt(r.orcado)}</TableCell>
                                    <TableCell className="text-right" style={{ color: "#D92D20" }}>{fmt(r.realizado)}</TableCell>
                                    <TableCell className="text-right" style={{ color: r.disponivel >= 0 ? "#039855" : "#D92D20" }}>{fmt(r.disponivel)}</TableCell>
                                    <TableCell>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <Progress value={Math.min(r.pct, 100)} className="h-2" />
                                            <span style={{ fontSize: 12, color: r.pct > 100 ? "#D92D20" : "#667085", minWidth: 40 }}>{r.pct.toFixed(0)}%</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(r)}>
                                            <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Card>

                <Dialog open={editDialog} onOpenChange={setEditDialog}>
                    <DialogContent className="max-w-sm">
                        <DialogHeader>
                            <DialogTitle>Definir Orçamento</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-2">
                            {!editCategory && (
                                <div className="space-y-2">
                                    <Label>Categoria</Label>
                                    <select className="w-full border rounded-md p-2 text-sm" onChange={e => {
                                        const cat = categories.find((c: any) => c.id === e.target.value);
                                        if (cat) setEditCategory(cat);
                                    }}>
                                        <option value="">Selecione...</option>
                                        {categories.map((c: any) => (
                                            <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            {editCategory && (
                                <p className="text-sm font-medium">{editCategory.code} - {editCategory.name}</p>
                            )}
                            <div className="space-y-2">
                                <Label>Valor Orçado (R$)</Label>
                                <Input value={editValue} onChange={e => setEditValue(e.target.value)} placeholder="0,00" />
                            </div>
                            <Button className="w-full" onClick={handleSave} disabled={!editCategory}>Salvar</Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
        </AppLayout>
    );
}
