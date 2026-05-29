import { useState, useMemo, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PagePanel } from "@/components/layout/PagePanel";
import { KpiCard, KpiCardGrid } from "@/components/ui/kpi-card";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Pencil, Eye, ChevronDown } from "lucide-react";
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

    // ─── Padrão de planilha: colunas ajustáveis + ocultáveis ─────
    const ORC_COL_ORDER = ['categoria', 'orcado', 'realizado', 'disponivel', 'pct', 'acoes'];
    const COL_LABELS: Record<string, string> = {
        categoria: 'Categoria', orcado: 'Orçado', realizado: 'Realizado',
        disponivel: 'Disponível', pct: '% Utilizado', acoes: 'Ações',
    };
    const COL_WIDTHS_DEFAULT: Record<string, number> = {
        categoria: 280, orcado: 130, realizado: 130, disponivel: 130, pct: 220, acoes: 70,
    };
    const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
        try {
            const s = localStorage.getItem('orcamento_col_widths');
            if (s) return { ...COL_WIDTHS_DEFAULT, ...JSON.parse(s) };
        } catch { /* ignore */ }
        return COL_WIDTHS_DEFAULT;
    });
    useEffect(() => { localStorage.setItem('orcamento_col_widths', JSON.stringify(colWidths)); }, [colWidths]);
    const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => {
        try {
            const s = localStorage.getItem('orcamento_hidden_cols');
            if (s) return new Set(JSON.parse(s) as string[]);
        } catch { /* ignore */ }
        return new Set();
    });
    useEffect(() => { localStorage.setItem('orcamento_hidden_cols', JSON.stringify([...hiddenCols])); }, [hiddenCols]);
    const [colMenuOpen, setColMenuOpen] = useState(false);
    const isColVisible = (k: string) => !hiddenCols.has(k);
    const toggleColVisible = (k: string) => setHiddenCols(prev => {
        const n = new Set(prev);
        if (n.has(k)) n.delete(k); else n.add(k);
        return n;
    });
    const visibleOrcCols = ORC_COL_ORDER.filter(isColVisible);
    const resizingRef = useRef<{ key: string; startX: number; startW: number } | null>(null);
    const startResize = (key: string) => (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        resizingRef.current = { key, startX: e.clientX, startW: colWidths[key] ?? COL_WIDTHS_DEFAULT[key] };
        const onMove = (ev: MouseEvent) => {
            const r = resizingRef.current;
            if (!r) return;
            const newW = Math.max(60, r.startW + (ev.clientX - r.startX));
            setColWidths(prev => ({ ...prev, [r.key]: newW }));
        };
        const onUp = () => {
            resizingRef.current = null;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    const monthStart = startOfMonth(new Date(currentMonth + "-01T00:00:00"));
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
            <div className="animate-fade-in" style={{ fontFamily: "var(--font-base)" }}>
                <PagePanel title="Orçamento" subtitle={format(monthStart, "MMMM yyyy", { locale: ptBR })}>
                    <div className="flex flex-wrap items-center gap-2 justify-end">
                        <select value={currentMonth} onChange={e => setCurrentMonth(e.target.value)}
                            style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #EAECF0", fontSize: 13 }}>
                            {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                    </div>

                <KpiCardGrid>
                    {[
                        { label: "Orçamento total", value: fmt(totalOrcado), color: "#059669" },
                        { label: "Realizado", value: fmt(totalRealizado), color: "#E53E3E" },
                        { label: "Disponível", value: fmt(totalDisponivel), color: "#039855" },
                        { label: "% utilizado", value: `${totalPct.toFixed(1)}%`, color: totalPct > 100 ? "#E53E3E" : "#f57f17" },
                    ].map((kpi, i) => (
                        <KpiCard key={i} label={kpi.label} value={kpi.value} valueColor={kpi.color} />
                    ))}
                </KpiCardGrid>

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
                                <Bar dataKey="Realizado" fill="#E53E3E" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </Card>
                )}

                <Card style={{ borderRadius: 14, border: "1px solid #EAECF0", overflow: "hidden" }}>
                    <div style={{ padding: "16px 20px", background: "#000000", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                        <p style={{ fontWeight: 700, fontSize: 14, color: "#FFFFFF" }}>Detalhamento por Categoria</p>
                        <div className="flex items-center gap-2">
                            <div className="relative self-center">
                                <button
                                    onClick={() => setColMenuOpen(o => !o)}
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/20 text-[12px] text-white hover:bg-white/10"
                                    title="Mostrar/ocultar colunas"
                                >
                                    <Eye size={14} className="text-white/70" /> Colunas
                                    <ChevronDown size={13} className={`text-white/60 transition-transform ${colMenuOpen ? 'rotate-180' : ''}`} />
                                </button>
                                {colMenuOpen && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setColMenuOpen(false)} />
                                        <div className="absolute right-0 mt-1 z-50 bg-white border border-[#EAECF0] rounded-lg shadow-xl py-1 min-w-[190px]">
                                            <p className="px-3 py-1.5 text-[10px] font-bold text-[#98A2B3] uppercase tracking-wider">Exibir colunas</p>
                                            {Object.entries(COL_LABELS).map(([k, label]) => (
                                                <label key={k} className="flex items-center gap-2 px-3 py-1.5 text-[13px] text-[#1D2939] hover:bg-[#F6F2EB] cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={isColVisible(k)}
                                                        onChange={() => toggleColVisible(k)}
                                                        className="w-4 h-4 rounded border-[#D0D5DD] text-[#059669] focus:ring-[#059669]/30"
                                                    />
                                                    {label}
                                                </label>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                            <Button size="sm" variant="outline" className="bg-white" onClick={() => { setEditCategory(null); setEditValue(""); setEditDialog(true); }}>
                                Definir Orçamento
                            </Button>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="text-sm" style={{ tableLayout: 'fixed', width: visibleOrcCols.reduce((a, k) => a + (colWidths[k] ?? COL_WIDTHS_DEFAULT[k]), 0), minWidth: '100%' }}>
                            <colgroup>
                                {ORC_COL_ORDER.map(k => (
                                    <col key={k} className={isColVisible(k) ? '' : 'hidden'} style={{ width: colWidths[k] ?? COL_WIDTHS_DEFAULT[k] }} />
                                ))}
                            </colgroup>
                            <thead>
                                <tr className="bg-white text-[12px] font-bold text-[#1D2939] uppercase tracking-wider border-b-2 border-[#EAECF0] whitespace-nowrap">
                                    <th className={`text-left px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('categoria') ? '' : 'hidden'}`}>
                                        <span onMouseDown={startResize('categoria')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                        Categoria
                                    </th>
                                    <th className={`text-right px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('orcado') ? '' : 'hidden'}`}>
                                        <span onMouseDown={startResize('orcado')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                        Orçado
                                    </th>
                                    <th className={`text-right px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('realizado') ? '' : 'hidden'}`}>
                                        <span onMouseDown={startResize('realizado')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                        Realizado
                                    </th>
                                    <th className={`text-right px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('disponivel') ? '' : 'hidden'}`}>
                                        <span onMouseDown={startResize('disponivel')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                        Disponível
                                    </th>
                                    <th className={`text-left px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('pct') ? '' : 'hidden'}`}>
                                        <span onMouseDown={startResize('pct')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                        % Utilizado
                                    </th>
                                    <th className={`text-center px-3 py-3 relative ${isColVisible('acoes') ? '' : 'hidden'}`}>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.length === 0 ? (
                                    <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Defina orçamentos para suas categorias de despesa.</td></tr>
                                ) : rows.map((r: any) => (
                                    <tr key={r.id} className="border-b border-[#F1F3F5] hover:bg-[#FAFAFA]">
                                        <td className={`px-3 py-1 font-medium truncate border-r border-[#F1F3F5] ${isColVisible('categoria') ? '' : 'hidden'}`} title={`${r.code} - ${r.name}`}>{r.code} - {r.name}</td>
                                        <td className={`px-3 py-1 text-right border-r border-[#F1F3F5] ${isColVisible('orcado') ? '' : 'hidden'}`}>{fmt(r.orcado)}</td>
                                        <td className={`px-3 py-1 text-right border-r border-[#F1F3F5] ${isColVisible('realizado') ? '' : 'hidden'}`} style={{ color: "#E53E3E" }}>{fmt(r.realizado)}</td>
                                        <td className={`px-3 py-1 text-right border-r border-[#F1F3F5] ${isColVisible('disponivel') ? '' : 'hidden'}`} style={{ color: r.disponivel >= 0 ? "#039855" : "#E53E3E" }}>{fmt(r.disponivel)}</td>
                                        <td className={`px-3 py-1 border-r border-[#F1F3F5] ${isColVisible('pct') ? '' : 'hidden'}`}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                <Progress value={Math.min(r.pct, 100)} className="h-2" />
                                                <span style={{ fontSize: 12, color: r.pct > 100 ? "#E53E3E" : "#667085", minWidth: 40 }}>{r.pct.toFixed(0)}%</span>
                                            </div>
                                        </td>
                                        <td className={`px-3 py-1 text-center ${isColVisible('acoes') ? '' : 'hidden'}`}>
                                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(r)}>
                                                <Pencil className="h-3.5 w-3.5" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
                </PagePanel>

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
