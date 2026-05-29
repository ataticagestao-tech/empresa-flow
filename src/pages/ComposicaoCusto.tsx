import { useMemo, useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PagePanel } from "@/components/layout/PagePanel";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, TrendingUp, DollarSign, Percent, Eye, ChevronDown } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

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

export default function ComposicaoCusto() {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const [searchTerm, setSearchTerm] = useState("");

    // ─── Padrão de planilha: colunas ajustáveis + ocultáveis ─────
    const COL_ORDER = ['produto', 'custoInsumos', 'maoDeObra', 'custoTotal', 'precoVenda', 'lucro', 'margem', 'markup'];
    const COL_LABELS: Record<string, string> = {
        produto: 'Produto', custoInsumos: 'Custo Insumos', maoDeObra: 'Mão de Obra',
        custoTotal: 'Custo Total', precoVenda: 'Preço Venda', lucro: 'Lucro',
        margem: 'Margem', markup: 'Markup',
    };
    const COL_WIDTHS_DEFAULT: Record<string, number> = {
        produto: 280, custoInsumos: 130, maoDeObra: 120, custoTotal: 130,
        precoVenda: 130, lucro: 130, margem: 100, markup: 100,
    };
    const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
        try {
            const s = localStorage.getItem('composicaocusto_col_widths');
            if (s) return { ...COL_WIDTHS_DEFAULT, ...JSON.parse(s) };
        } catch { /* ignore */ }
        return COL_WIDTHS_DEFAULT;
    });
    useEffect(() => { localStorage.setItem('composicaocusto_col_widths', JSON.stringify(colWidths)); }, [colWidths]);
    const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => {
        try {
            const s = localStorage.getItem('composicaocusto_hidden_cols');
            if (s) return new Set(JSON.parse(s) as string[]);
        } catch { /* ignore */ }
        return new Set();
    });
    useEffect(() => { localStorage.setItem('composicaocusto_hidden_cols', JSON.stringify([...hiddenCols])); }, [hiddenCols]);
    const [colMenuOpen, setColMenuOpen] = useState(false);
    const isColVisible = (k: string) => !hiddenCols.has(k);
    const toggleColVisible = (k: string) => setHiddenCols(prev => {
        const n = new Set(prev);
        if (n.has(k)) n.delete(k); else n.add(k);
        return n;
    });
    const visibleCols = COL_ORDER.filter(isColVisible);
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
        queryKey: ["comp_products", selectedCompany?.id],
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

    const rows = useMemo(() => {
        return products.map((p: any) => {
            const ficha = fichas.find(f => f.product_id === p.id);
            const custoInsumos = ficha ? ficha.items.reduce((s, i) => s + i.quantidade * i.custo_unitario, 0) : 0;
            const maoDeObra = ficha?.mao_de_obra || 0;
            const custoFicha = custoInsumos + maoDeObra;
            const custoCadastro = Number(p.cost_price || 0);
            const custoTotal = custoFicha > 0 ? custoFicha : custoCadastro;
            const preco = Number(p.price || 0);
            const lucro = preco - custoTotal;
            const margem = preco > 0 ? (lucro / preco) * 100 : 0;
            const markup = custoTotal > 0 ? ((preco - custoTotal) / custoTotal) * 100 : 0;

            return {
                ...p, custoInsumos, maoDeObra, custoTotal, lucro, margem, markup,
                temFicha: !!ficha,
            };
        });
    }, [products, fichas]);

    const filtered = useMemo(() => {
        if (!searchTerm.trim()) return rows;
        const needle = searchTerm.toLowerCase();
        return rows.filter((r: any) => r.description.toLowerCase().includes(needle));
    }, [rows, searchTerm]);

    // KPIs
    const avgMargem = filtered.length > 0 ? filtered.reduce((s: number, r: any) => s + r.margem, 0) / filtered.length : 0;
    const totalCusto = filtered.reduce((s: number, r: any) => s + r.custoTotal, 0);
    const totalPreco = filtered.reduce((s: number, r: any) => s + Number(r.price), 0);
    const totalLucro = totalPreco - totalCusto;

    // Chart: top 10 by cost
    const chartData = filtered.slice(0, 10).map((r: any) => ({
        name: r.description.length > 18 ? r.description.substring(0, 18) + "..." : r.description,
        Custo: r.custoTotal,
        Preço: Number(r.price),
        Lucro: r.lucro,
    }));

    return (
        <AppLayout title="Composição de Custo">
            <div style={{ fontFamily: FONT }} className="animate-fade-in">

                <PagePanel title="Composição de Custo" subtitle="Custo total, margem e markup por produto">

                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
                    {[
                        { label: "CUSTO TOTAL (CATÁLOGO)", value: fmt(totalCusto), icon: DollarSign, color: T.red, bg: T.redLt },
                        { label: "PREÇO TOTAL (CATÁLOGO)", value: fmt(totalPreco), icon: TrendingUp, color: T.primary, bg: T.primaryLt },
                        { label: "LUCRO BRUTO TOTAL", value: fmt(totalLucro), icon: DollarSign, color: T.green, bg: T.greenLt },
                        { label: "MARGEM MÉDIA", value: `${avgMargem.toFixed(1)}%`, icon: Percent, color: avgMargem >= 30 ? T.green : T.amber, bg: avgMargem >= 30 ? T.greenLt : T.amberLt },
                    ].map((kpi, i) => (
                        <Card key={i} style={{ padding: 20, borderRadius: 14, border: `1px solid ${T.border}` }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <div style={{ background: kpi.bg, borderRadius: 10, padding: 10 }}><kpi.icon size={20} color={kpi.color} /></div>
                                <div>
                                    <p style={{ fontSize: 11, color: T.text3, fontWeight: 600 }}>{kpi.label}</p>
                                    <p style={{ fontSize: 20, fontWeight: 800, color: kpi.color }}>{kpi.value}</p>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>

                {chartData.length > 0 && (
                    <Card style={{ padding: 20, borderRadius: 14, border: `1px solid ${T.border}` }}>
                        <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Custo vs Preço vs Lucro</p>
                        <ResponsiveContainer width="100%" height={280}>
                            <BarChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#F6F2EB" />
                                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                                <Tooltip formatter={(v: number) => fmt(v)} />
                                <Legend />
                                <Bar dataKey="Custo" fill={T.red} radius={[4, 4, 0, 0]} />
                                <Bar dataKey="Preço" fill={T.primary} radius={[4, 4, 0, 0]} />
                                <Bar dataKey="Lucro" fill={T.green} radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </Card>
                )}

                <Card style={{ borderRadius: 14, border: `1px solid ${T.border}`, overflow: "hidden" }}>
                    <div className="px-5 py-4 flex items-center justify-between" style={{ backgroundColor: '#000000' }}>
                        <div className="flex items-center gap-3 flex-1">
                            <div style={{ position: "relative", maxWidth: 300, flex: 1 }}>
                                <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.5)", zIndex: 1 }} />
                                <Input placeholder="Buscar produto..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                                    className="h-9 pl-8 text-sm bg-white/10 border-white/20 text-white placeholder:text-white/40" />
                            </div>
                        </div>
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
                                        <div className="fixed inset-0 z-20" onClick={() => setColMenuOpen(false)} />
                                        <div className="absolute right-0 mt-1 z-30 bg-white border border-[#EAECF0] rounded-lg shadow-xl py-1 min-w-[190px]">
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
                    <div className="bg-white overflow-x-auto">
                        <table className="text-sm" style={{ tableLayout: 'fixed', width: visibleCols.reduce((a, k) => a + (colWidths[k] ?? COL_WIDTHS_DEFAULT[k]), 0), minWidth: '100%' }}>
                            <colgroup>
                                {COL_ORDER.map(k => (
                                    <col key={k} className={isColVisible(k) ? '' : 'hidden'} style={{ width: colWidths[k] ?? COL_WIDTHS_DEFAULT[k] }} />
                                ))}
                            </colgroup>
                            <thead>
                                <tr className="bg-white text-[15px] font-bold text-black uppercase tracking-wider border-b-2 border-[#D0D5DD]">
                                    <th className={`text-left px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('produto') ? '' : 'hidden'}`}>
                                        <span onMouseDown={startResize('produto')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                        Produto
                                    </th>
                                    <th className={`text-right px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('custoInsumos') ? '' : 'hidden'}`}>
                                        <span onMouseDown={startResize('custoInsumos')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                        Custo Insumos
                                    </th>
                                    <th className={`text-right px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('maoDeObra') ? '' : 'hidden'}`}>
                                        <span onMouseDown={startResize('maoDeObra')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                        Mão de Obra
                                    </th>
                                    <th className={`text-right px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('custoTotal') ? '' : 'hidden'}`}>
                                        <span onMouseDown={startResize('custoTotal')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                        Custo Total
                                    </th>
                                    <th className={`text-right px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('precoVenda') ? '' : 'hidden'}`}>
                                        <span onMouseDown={startResize('precoVenda')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                        Preço Venda
                                    </th>
                                    <th className={`text-right px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('lucro') ? '' : 'hidden'}`}>
                                        <span onMouseDown={startResize('lucro')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                        Lucro
                                    </th>
                                    <th className={`text-right px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('margem') ? '' : 'hidden'}`}>
                                        <span onMouseDown={startResize('margem')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                        Margem
                                    </th>
                                    <th className={`text-right px-3 py-3 relative ${isColVisible('markup') ? '' : 'hidden'}`}>
                                        <span onMouseDown={startResize('markup')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                        Markup
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.length === 0 ? (
                                    <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum produto encontrado.</td></tr>
                                ) : filtered.map((r: any) => (
                                    <tr key={r.id} className="border-b border-[#F1F3F5] hover:bg-[#F6F2EB] transition-colors text-[12px]">
                                        <td className={`px-3 py-1 font-medium text-[#1D2939] truncate border-r border-[#F1F3F5] ${isColVisible('produto') ? '' : 'hidden'}`} title={r.description}>
                                            {r.description}
                                            {r.temFicha && <span style={{ fontSize: 10, color: T.green, marginLeft: 6 }}>● Ficha</span>}
                                        </td>
                                        <td className={`px-3 py-1 text-right truncate border-r border-[#F1F3F5] ${isColVisible('custoInsumos') ? '' : 'hidden'}`}>{fmt(r.custoInsumos)}</td>
                                        <td className={`px-3 py-1 text-right truncate border-r border-[#F1F3F5] ${isColVisible('maoDeObra') ? '' : 'hidden'}`}>{fmt(r.maoDeObra)}</td>
                                        <td className={`px-3 py-1 text-right font-semibold truncate border-r border-[#F1F3F5] ${isColVisible('custoTotal') ? '' : 'hidden'}`} style={{ color: T.red }}>{fmt(r.custoTotal)}</td>
                                        <td className={`px-3 py-1 text-right truncate border-r border-[#F1F3F5] ${isColVisible('precoVenda') ? '' : 'hidden'}`} style={{ color: T.primary }}>{fmt(Number(r.price))}</td>
                                        <td className={`px-3 py-1 text-right font-semibold truncate border-r border-[#F1F3F5] ${isColVisible('lucro') ? '' : 'hidden'}`} style={{ color: r.lucro >= 0 ? T.green : T.red }}>{fmt(r.lucro)}</td>
                                        <td className={`px-3 py-1 text-right truncate border-r border-[#F1F3F5] ${isColVisible('margem') ? '' : 'hidden'}`} style={{ color: r.margem >= 30 ? T.green : r.margem >= 0 ? T.amber : T.red }}>
                                            {r.margem.toFixed(1)}%
                                        </td>
                                        <td className={`px-3 py-1 text-right truncate ${isColVisible('markup') ? '' : 'hidden'}`} style={{ color: T.text3 }}>{r.markup.toFixed(1)}%</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
                </PagePanel>
            </div>
        </AppLayout>
    );
}
