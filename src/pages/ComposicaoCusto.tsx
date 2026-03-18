import { useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Layers, Search, TrendingUp, DollarSign, Percent } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useState } from "react";

const T = {
    primary: "#3b5bdb", primaryLt: "#eef2ff",
    green: "#2e7d32", greenLt: "#e8f5e9",
    red: "#c62828", redLt: "#fde8e8",
    amber: "#f57f17", amberLt: "#fff8e1",
    text1: "#0f172a", text3: "#94a3b8",
    border: "#e2e8f0",
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
            <div style={{ fontFamily: FONT, display: "flex", flexDirection: "column", gap: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ background: T.primaryLt, borderRadius: 12, padding: 10 }}>
                        <Layers size={22} color={T.primary} />
                    </div>
                    <div>
                        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Composição de Custo</h2>
                        <p style={{ fontSize: 12, color: T.text3 }}>Custo total, margem e markup por produto</p>
                    </div>
                </div>

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
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
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
                    <div style={{ padding: "12px 20px", borderBottom: `1px solid ${T.border}` }}>
                        <div style={{ position: "relative", maxWidth: 300 }}>
                            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.text3 }} />
                            <Input placeholder="Buscar produto..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                                className="h-9 pl-8 text-sm" />
                        </div>
                    </div>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Produto</TableHead>
                                <TableHead className="text-right">Custo Insumos</TableHead>
                                <TableHead className="text-right">Mão de Obra</TableHead>
                                <TableHead className="text-right">Custo Total</TableHead>
                                <TableHead className="text-right">Preço Venda</TableHead>
                                <TableHead className="text-right">Lucro</TableHead>
                                <TableHead className="text-right">Margem</TableHead>
                                <TableHead className="text-right">Markup</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filtered.length === 0 ? (
                                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum produto encontrado.</TableCell></TableRow>
                            ) : filtered.map((r: any) => (
                                <TableRow key={r.id}>
                                    <TableCell className="font-medium">
                                        {r.description}
                                        {r.temFicha && <span style={{ fontSize: 10, color: T.green, marginLeft: 6 }}>● Ficha</span>}
                                    </TableCell>
                                    <TableCell className="text-right">{fmt(r.custoInsumos)}</TableCell>
                                    <TableCell className="text-right">{fmt(r.maoDeObra)}</TableCell>
                                    <TableCell className="text-right font-semibold" style={{ color: T.red }}>{fmt(r.custoTotal)}</TableCell>
                                    <TableCell className="text-right" style={{ color: T.primary }}>{fmt(Number(r.price))}</TableCell>
                                    <TableCell className="text-right font-semibold" style={{ color: r.lucro >= 0 ? T.green : T.red }}>{fmt(r.lucro)}</TableCell>
                                    <TableCell className="text-right" style={{ color: r.margem >= 30 ? T.green : r.margem >= 0 ? T.amber : T.red }}>
                                        {r.margem.toFixed(1)}%
                                    </TableCell>
                                    <TableCell className="text-right" style={{ color: T.text3 }}>{r.markup.toFixed(1)}%</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Card>
            </div>
        </AppLayout>
    );
}
