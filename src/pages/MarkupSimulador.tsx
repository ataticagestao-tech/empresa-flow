import { useState, useEffect, useMemo, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PagePanel } from "@/components/layout/PagePanel";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, DollarSign, TrendingUp, Percent, AlertTriangle, Eye, ChevronDown } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

const T = {
    primary: "#059669", primaryLt: "#ECFDF4",
    green: "#039855", greenLt: "#ECFDF3",
    red: "#E53E3E", redLt: "#FEE2E2",
    amber: "#f57f17", amberLt: "#fff8e1",
    text1: "#1D2939", text3: "#98A2B3",
    border: "#EAECF0",
} as const;
const FONT = "var(--font-base)";
const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

interface FichaItem { insumo: string; quantidade: number; unidade: string; custo_unitario: number; }
interface Ficha { product_id: string; product_name: string; items: FichaItem[]; mao_de_obra: number; tempo_minutos: number; }

function loadFichas(companyId: string): Ficha[] {
    try { return JSON.parse(localStorage.getItem(`fichas_tecnicas_${companyId}`) || "[]"); } catch { return []; }
}

export default function MarkupSimulador() {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();

    const [searchTerm, setSearchTerm] = useState("");
    const [targetMargin, setTargetMargin] = useState("30");
    const [selectedProductId, setSelectedProductId] = useState("");

    // Custom simulation
    const [simCusto, setSimCusto] = useState("");
    const [simMargem, setSimMargem] = useState("30");
    const [simImpostos, setSimImpostos] = useState("6");
    const [simComissao, setSimComissao] = useState("5");
    const [simDespesas, setSimDespesas] = useState("10");

    // ─── Padrão de planilha: colunas ajustáveis + ocultáveis ─────
    const MK_COL_ORDER = ['produto', 'custo', 'preco', 'margem', 'markup', 'ideal', 'ajuste', 'status'];
    const COL_LABELS: Record<string, string> = {
        produto: 'Produto', custo: 'Custo', preco: 'Preço Atual', margem: 'Margem',
        markup: 'Markup', ideal: 'Preço Ideal', ajuste: 'Ajuste', status: 'Status',
    };
    const COL_WIDTHS_DEFAULT: Record<string, number> = {
        produto: 240, custo: 110, preco: 120, margem: 100, markup: 100, ideal: 130, ajuste: 120, status: 110,
    };
    const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
        try {
            const s = localStorage.getItem('markup_col_widths');
            if (s) return { ...COL_WIDTHS_DEFAULT, ...JSON.parse(s) };
        } catch { /* ignore */ }
        return COL_WIDTHS_DEFAULT;
    });
    useEffect(() => { localStorage.setItem('markup_col_widths', JSON.stringify(colWidths)); }, [colWidths]);
    const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => {
        try {
            const s = localStorage.getItem('markup_hidden_cols');
            if (s) return new Set(JSON.parse(s) as string[]);
        } catch { /* ignore */ }
        return new Set();
    });
    useEffect(() => { localStorage.setItem('markup_hidden_cols', JSON.stringify([...hiddenCols])); }, [hiddenCols]);
    const [colMenuOpen, setColMenuOpen] = useState(false);
    const isColVisible = (k: string) => !hiddenCols.has(k);
    const toggleColVisible = (k: string) => setHiddenCols(prev => {
        const n = new Set(prev);
        if (n.has(k)) n.delete(k); else n.add(k);
        return n;
    });
    const visibleMkCols = MK_COL_ORDER.filter(isColVisible);
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

    const { data: products = [] } = useQuery({
        queryKey: ["mk_products", selectedCompany?.id],
        queryFn: async () => {
            const { data } = await (activeClient as any)
                .from("products")
                .select("id, code, description, price, cost_price")
                .eq("company_id", selectedCompany?.id)
                .eq("is_active", true)
                .order("description");
            return data || [];
        },
        enabled: !!selectedCompany?.id,
    });

    const fichas = useMemo(() => {
        if (!selectedCompany?.id) return [];
        return loadFichas(selectedCompany.id);
    }, [selectedCompany?.id]);

    const target = parseFloat(targetMargin) || 30;

    const rows = useMemo(() => {
        return products.map((p: any) => {
            const ficha = fichas.find(f => f.product_id === p.id);
            const custoInsumos = ficha ? ficha.items.reduce((s, i) => s + i.quantidade * i.custo_unitario, 0) : 0;
            const maoDeObra = ficha?.mao_de_obra || 0;
            const custoFicha = custoInsumos + maoDeObra;
            const custo = custoFicha > 0 ? custoFicha : Number(p.cost_price || 0);
            const preco = Number(p.price || 0);
            const lucro = preco - custo;
            const margem = preco > 0 ? (lucro / preco) * 100 : 0;
            const markup = custo > 0 ? ((preco - custo) / custo) * 100 : 0;

            // Ideal price for target margin
            const precoIdeal = custo > 0 ? custo / (1 - target / 100) : 0;
            const ajuste = precoIdeal - preco;

            return { ...p, custo, lucro, margem, markup, precoIdeal, ajuste, temFicha: !!ficha };
        });
    }, [products, fichas, target]);

    const filtered = useMemo(() => {
        if (!searchTerm.trim()) return rows;
        const needle = searchTerm.toLowerCase();
        return rows.filter((r: any) => r.description.toLowerCase().includes(needle));
    }, [rows, searchTerm]);

    // KPIs
    const abaixoMeta = filtered.filter((r: any) => r.margem < target && r.custo > 0).length;
    const acimaMeta = filtered.filter((r: any) => r.margem >= target && r.custo > 0).length;
    const semCusto = filtered.filter((r: any) => r.custo === 0).length;
    const avgMargem = filtered.length > 0 ? filtered.reduce((s: number, r: any) => s + r.margem, 0) / filtered.length : 0;

    // Chart
    const chartData = filtered.filter((r: any) => r.custo > 0).slice(0, 12).map((r: any) => ({
        name: r.description.length > 15 ? r.description.substring(0, 15) + "..." : r.description,
        Margem: Number(r.margem.toFixed(1)),
    }));

    // Simulator
    const simCustoNum = parseFloat(simCusto.replace(",", ".")) || 0;
    const simMargemNum = parseFloat(simMargem) || 0;
    const simImpostosNum = parseFloat(simImpostos) || 0;
    const simComissaoNum = parseFloat(simComissao) || 0;
    const simDespesasNum = parseFloat(simDespesas) || 0;
    const simTotalPct = simMargemNum + simImpostosNum + simComissaoNum + simDespesasNum;
    const simPrecoIdeal = simTotalPct < 100 ? simCustoNum / (1 - simTotalPct / 100) : 0;
    const simMarkup = simCustoNum > 0 ? ((simPrecoIdeal - simCustoNum) / simCustoNum) * 100 : 0;
    const simLucro = simPrecoIdeal - simCustoNum - (simPrecoIdeal * (simImpostosNum + simComissaoNum + simDespesasNum) / 100);

    // Selected product detail
    const selectedProduct = selectedProductId ? rows.find((r: any) => r.id === selectedProductId) : null;

    return (
        <AppLayout title="Markup / Simulador">
            <div style={{ fontFamily: FONT }} className="animate-fade-in">

                <PagePanel title="Markup / Simulador" subtitle="Calcule o preço ideal baseado no custo e margem desejada">
                    <div className="flex flex-wrap items-center gap-2 justify-end">
                        <Label className="text-sm whitespace-nowrap">Margem alvo:</Label>
                        <Input type="number" value={targetMargin} onChange={e => setTargetMargin(e.target.value)}
                            className="h-9 w-20 text-sm text-center" min="0" max="99" />
                        <span className="text-sm text-muted-foreground">%</span>
                    </div>

                {/* KPIs */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
                    {[
                        { label: "MARGEM MÉDIA", value: `${avgMargem.toFixed(1)}%`, icon: Percent, color: avgMargem >= target ? T.green : T.amber, bg: avgMargem >= target ? T.greenLt : T.amberLt },
                        { label: "ACIMA DA META", value: `${acimaMeta}`, icon: TrendingUp, color: T.green, bg: T.greenLt },
                        { label: "ABAIXO DA META", value: `${abaixoMeta}`, icon: AlertTriangle, color: T.red, bg: T.redLt },
                        { label: "SEM CUSTO DEFINIDO", value: `${semCusto}`, icon: DollarSign, color: T.amber, bg: T.amberLt },
                    ].map((kpi, i) => (
                        <Card key={i} style={{ padding: 20, borderRadius: 14, border: `1px solid ${T.border}` }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <div style={{ background: kpi.bg, borderRadius: 10, padding: 10 }}><kpi.icon size={20} color={kpi.color} /></div>
                                <div>
                                    <p style={{ fontSize: 11, color: T.text3, fontWeight: 600 }}>{kpi.label}</p>
                                    <p style={{ fontSize: 22, fontWeight: 800, color: kpi.color }}>{kpi.value}</p>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>

                {/* Chart + Simulator side by side */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    {chartData.length > 0 && (
                        <Card style={{ padding: 20, borderRadius: 14, border: `1px solid ${T.border}` }}>
                            <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Margem por Produto</p>
                            <ResponsiveContainer width="100%" height={280}>
                                <BarChart data={chartData} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#F6F2EB" />
                                    <XAxis type="number" tick={{ fontSize: 11 }} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
                                    <Tooltip formatter={(v: number) => `${v}%`} />
                                    <ReferenceLine x={target} stroke={T.red} strokeDasharray="5 5" label={{ value: `Meta ${target}%`, fontSize: 10, fill: T.red }} />
                                    <Bar dataKey="Margem" fill={T.primary} radius={[0, 4, 4, 0]}
                                        label={{ position: "right", fontSize: 10, formatter: (v: number) => `${v}%` }} />
                                </BarChart>
                            </ResponsiveContainer>
                        </Card>
                    )}

                    <Card style={{ padding: 20, borderRadius: 14, border: `1px solid ${T.border}` }}>
                        <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Simulador de Preço</p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            <div>
                                <Label className="text-xs">Produto (opcional)</Label>
                                <Select value={selectedProductId} onValueChange={v => {
                                    setSelectedProductId(v);
                                    const p = rows.find((r: any) => r.id === v);
                                    if (p) setSimCusto(String(p.custo));
                                }}>
                                    <SelectTrigger className="text-sm h-8"><SelectValue placeholder="Simular manualmente..." /></SelectTrigger>
                                    <SelectContent>
                                        {products.map((p: any) => (
                                            <SelectItem key={p.id} value={p.id}>{p.description}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label className="text-xs">Custo (R$)</Label>
                                    <Input value={simCusto} onChange={e => setSimCusto(e.target.value)} placeholder="0,00" className="h-8 text-sm" />
                                </div>
                                <div>
                                    <Label className="text-xs">Margem Desejada (%)</Label>
                                    <Input value={simMargem} onChange={e => setSimMargem(e.target.value)} className="h-8 text-sm" />
                                </div>
                                <div>
                                    <Label className="text-xs">Impostos (%)</Label>
                                    <Input value={simImpostos} onChange={e => setSimImpostos(e.target.value)} className="h-8 text-sm" />
                                </div>
                                <div>
                                    <Label className="text-xs">Comissão (%)</Label>
                                    <Input value={simComissao} onChange={e => setSimComissao(e.target.value)} className="h-8 text-sm" />
                                </div>
                                <div>
                                    <Label className="text-xs">Despesas Fixas (%)</Label>
                                    <Input value={simDespesas} onChange={e => setSimDespesas(e.target.value)} className="h-8 text-sm" />
                                </div>
                                <div>
                                    <Label className="text-xs">Total % sobre preço</Label>
                                    <div style={{ padding: "6px 12px", background: T.amberLt, borderRadius: 6, fontSize: 14, fontWeight: 700, color: T.amber }}>
                                        {simTotalPct.toFixed(1)}%
                                    </div>
                                </div>
                            </div>
                            {simCustoNum > 0 && (
                                <div style={{ background: T.greenLt, borderRadius: 10, padding: 16, display: "flex", flexDirection: "column", gap: 6 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                                        <span style={{ fontSize: 12, color: T.text3 }}>Preço Ideal de Venda</span>
                                        <span style={{ fontSize: 20, fontWeight: 800, color: T.green }}>{fmt(simPrecoIdeal)}</span>
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                                        <span style={{ fontSize: 12, color: T.text3 }}>Markup</span>
                                        <span style={{ fontSize: 14, fontWeight: 600 }}>{simMarkup.toFixed(1)}%</span>
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                                        <span style={{ fontSize: 12, color: T.text3 }}>Lucro Líquido</span>
                                        <span style={{ fontSize: 14, fontWeight: 600, color: simLucro >= 0 ? T.green : T.red }}>{fmt(simLucro)}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </Card>
                </div>

                {/* Full table */}
                <div className="bg-white border border-[#EAECF0] rounded-xl overflow-hidden">
                    {/* Cabecalho do container — titulo preto + menu de colunas */}
                    <div className="px-5 py-4 flex items-baseline justify-between" style={{ backgroundColor: '#000000' }}>
                        <h3 className="font-extrabold text-white m-0" style={{ fontSize: 22, letterSpacing: '-0.015em', lineHeight: 1.15 }}>
                            Produtos
                        </h3>
                        <div className="flex items-center gap-3">
                            <span className="text-[13px] text-white/70 font-medium">
                                {filtered.length} registro{filtered.length !== 1 ? 's' : ''}
                            </span>
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
                        </div>
                    </div>
                    <div style={{ padding: "12px 20px", borderBottom: `1px solid ${T.border}` }}>
                        <div style={{ position: "relative", maxWidth: 300 }}>
                            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.text3 }} />
                            <Input placeholder="Buscar produto..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                                className="h-9 pl-8 text-sm" />
                        </div>
                    </div>
                    <div className="bg-white overflow-x-auto">
                        {filtered.length === 0 ? (
                            <div className="text-center py-8 text-[#555] text-sm">Nenhum produto encontrado.</div>
                        ) : (
                            <table className="text-sm" style={{ tableLayout: 'fixed', width: visibleMkCols.reduce((a, k) => a + (colWidths[k] ?? COL_WIDTHS_DEFAULT[k]), 0), minWidth: '100%' }}>
                                <colgroup>
                                    {MK_COL_ORDER.map(k => (
                                        <col key={k} className={isColVisible(k) ? '' : 'hidden'} style={{ width: colWidths[k] ?? COL_WIDTHS_DEFAULT[k] }} />
                                    ))}
                                </colgroup>
                                <thead>
                                    <tr className="bg-white text-[15px] font-bold text-black uppercase tracking-wider border-b-2 border-[#D0D5DD] whitespace-nowrap">
                                        <th className={`text-left px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('produto') ? '' : 'hidden'}`}>
                                            <span onMouseDown={startResize('produto')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                            Produto
                                        </th>
                                        <th className={`text-right px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('custo') ? '' : 'hidden'}`}>
                                            <span onMouseDown={startResize('custo')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                            Custo
                                        </th>
                                        <th className={`text-right px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('preco') ? '' : 'hidden'}`}>
                                            <span onMouseDown={startResize('preco')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                            Preço Atual
                                        </th>
                                        <th className={`text-right px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('margem') ? '' : 'hidden'}`}>
                                            <span onMouseDown={startResize('margem')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                            Margem
                                        </th>
                                        <th className={`text-right px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('markup') ? '' : 'hidden'}`}>
                                            <span onMouseDown={startResize('markup')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                            Markup
                                        </th>
                                        <th className={`text-right px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('ideal') ? '' : 'hidden'}`}>
                                            <span onMouseDown={startResize('ideal')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                            Preço Ideal ({target}%)
                                        </th>
                                        <th className={`text-right px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('ajuste') ? '' : 'hidden'}`}>
                                            <span onMouseDown={startResize('ajuste')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                            Ajuste
                                        </th>
                                        <th className={`text-left px-3 py-3 relative ${isColVisible('status') ? '' : 'hidden'}`}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((r: any) => (
                                        <tr key={r.id} className="border-b border-[#F1F3F5] hover:bg-[#F6F2EB] transition-colors text-[12px]">
                                            <td className={`px-3 py-1 font-medium text-[#1D2939] truncate border-r border-[#F1F3F5] ${isColVisible('produto') ? '' : 'hidden'}`} title={r.description}>
                                                {r.description}
                                                {r.temFicha && <span style={{ fontSize: 10, color: T.green, marginLeft: 6 }}>● Ficha</span>}
                                            </td>
                                            <td className={`px-3 py-1 text-right truncate border-r border-[#F1F3F5] ${isColVisible('custo') ? '' : 'hidden'}`}>{r.custo > 0 ? fmt(r.custo) : <span style={{ color: T.text3 }}>—</span>}</td>
                                            <td className={`px-3 py-1 text-right truncate border-r border-[#F1F3F5] ${isColVisible('preco') ? '' : 'hidden'}`}>{fmt(Number(r.price))}</td>
                                            <td className={`px-3 py-1 text-right font-semibold truncate border-r border-[#F1F3F5] ${isColVisible('margem') ? '' : 'hidden'}`} style={{ color: r.margem >= target ? T.green : r.margem >= 0 ? T.amber : T.red }}>
                                                {r.custo > 0 ? `${r.margem.toFixed(1)}%` : "—"}
                                            </td>
                                            <td className={`px-3 py-1 text-right truncate border-r border-[#F1F3F5] ${isColVisible('markup') ? '' : 'hidden'}`} style={{ color: T.text3 }}>{r.custo > 0 ? `${r.markup.toFixed(1)}%` : "—"}</td>
                                            <td className={`px-3 py-1 text-right font-semibold truncate border-r border-[#F1F3F5] ${isColVisible('ideal') ? '' : 'hidden'}`} style={{ color: T.primary }}>
                                                {r.custo > 0 ? fmt(r.precoIdeal) : "—"}
                                            </td>
                                            <td className={`px-3 py-1 text-right truncate border-r border-[#F1F3F5] ${isColVisible('ajuste') ? '' : 'hidden'}`} style={{ color: r.ajuste > 0 ? T.red : T.green }}>
                                                {r.custo > 0 ? `${r.ajuste > 0 ? "+" : ""}${fmt(r.ajuste)}` : "—"}
                                            </td>
                                            <td className={`px-3 py-1 text-left ${isColVisible('status') ? '' : 'hidden'}`}>
                                                {r.custo === 0 ? (
                                                    <Badge className="bg-gray-100 text-gray-500">Sem custo</Badge>
                                                ) : r.margem >= target ? (
                                                    <Badge className="bg-green-100 text-green-700">OK</Badge>
                                                ) : (
                                                    <Badge className="bg-red-100 text-red-700">Revisar</Badge>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
                </PagePanel>
            </div>
        </AppLayout>
    );
}
