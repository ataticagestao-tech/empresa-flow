import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Target, Search, DollarSign, TrendingUp, Percent, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

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
            <div style={{ fontFamily: FONT, display: "flex", flexDirection: "column", gap: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ background: T.primaryLt, borderRadius: 12, padding: 10 }}>
                            <Target size={22} color={T.primary} />
                        </div>
                        <div>
                            <h2 style={{ fontSize: 20, fontWeight: 700 }}>Markup / Simulador</h2>
                            <p style={{ fontSize: 12, color: T.text3 }}>Calcule o preço ideal baseado no custo e margem desejada</p>
                        </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Label className="text-sm whitespace-nowrap">Margem alvo:</Label>
                        <Input type="number" value={targetMargin} onChange={e => setTargetMargin(e.target.value)}
                            className="h-9 w-20 text-sm text-center" min="0" max="99" />
                        <span className="text-sm text-muted-foreground">%</span>
                    </div>
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
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
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
                                <TableHead className="text-right">Custo</TableHead>
                                <TableHead className="text-right">Preço Atual</TableHead>
                                <TableHead className="text-right">Margem</TableHead>
                                <TableHead className="text-right">Markup</TableHead>
                                <TableHead className="text-right">Preço Ideal ({target}%)</TableHead>
                                <TableHead className="text-right">Ajuste</TableHead>
                                <TableHead>Status</TableHead>
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
                                    <TableCell className="text-right">{r.custo > 0 ? fmt(r.custo) : <span style={{ color: T.text3 }}>—</span>}</TableCell>
                                    <TableCell className="text-right">{fmt(Number(r.price))}</TableCell>
                                    <TableCell className="text-right font-semibold" style={{ color: r.margem >= target ? T.green : r.margem >= 0 ? T.amber : T.red }}>
                                        {r.custo > 0 ? `${r.margem.toFixed(1)}%` : "—"}
                                    </TableCell>
                                    <TableCell className="text-right" style={{ color: T.text3 }}>{r.custo > 0 ? `${r.markup.toFixed(1)}%` : "—"}</TableCell>
                                    <TableCell className="text-right font-semibold" style={{ color: T.primary }}>
                                        {r.custo > 0 ? fmt(r.precoIdeal) : "—"}
                                    </TableCell>
                                    <TableCell className="text-right" style={{ color: r.ajuste > 0 ? T.red : T.green }}>
                                        {r.custo > 0 ? `${r.ajuste > 0 ? "+" : ""}${fmt(r.ajuste)}` : "—"}
                                    </TableCell>
                                    <TableCell>
                                        {r.custo === 0 ? (
                                            <Badge className="bg-gray-100 text-gray-500">Sem custo</Badge>
                                        ) : r.margem >= target ? (
                                            <Badge className="bg-green-100 text-green-700">OK</Badge>
                                        ) : (
                                            <Badge className="bg-red-100 text-red-700">Revisar</Badge>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Card>
            </div>
        </AppLayout>
    );
}
