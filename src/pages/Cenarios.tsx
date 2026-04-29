import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TrendingUp, TrendingDown, DollarSign, GitBranch } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { format, startOfMonth, endOfMonth } from "date-fns";

const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

interface ScenarioConfig {
    name: string;
    revenueVar: number;
    expenseVar: number;
    newClients: number;
    extraTicket: number;
    color: string;
    borderColor: string;
    bgColor: string;
}

const defaultScenarios: ScenarioConfig[] = [
    { name: "Pessimista", revenueVar: -20, expenseVar: 10, newClients: 0, extraTicket: 0, color: "#E53E3E", borderColor: "#E53E3E", bgColor: "#FEE2E2" },
    { name: "Realista", revenueVar: 0, expenseVar: 0, newClients: 2, extraTicket: 0, color: "#1E3A8A", borderColor: "#1E3A8A", bgColor: "#EFF6FF" },
    { name: "Otimista", revenueVar: 20, expenseVar: -10, newClients: 5, extraTicket: 500, color: "#059669", borderColor: "#059669", bgColor: "#ECFDF4" },
];

export default function Cenarios() {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const [scenarios, setScenarios] = useState<ScenarioConfig[]>(defaultScenarios);

    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    const { data: baseReceita = 0 } = useQuery({
        queryKey: ["cenario_receita", selectedCompany?.id],
        queryFn: async () => {
            const { data } = await (activeClient as any)
                .from("contas_receber")
                .select("valor")
                .eq("company_id", selectedCompany?.id)
                .gte("data_vencimento", format(monthStart, "yyyy-MM-dd"))
                .lte("data_vencimento", format(monthEnd, "yyyy-MM-dd"))
                .limit(5000);
            return (data || []).reduce((s: number, r: any) => s + Number(r.valor || 0), 0);
        },
        enabled: !!selectedCompany?.id,
    });

    const { data: baseDespesa = 0 } = useQuery({
        queryKey: ["cenario_despesa", selectedCompany?.id],
        queryFn: async () => {
            const { data } = await (activeClient as any)
                .from("contas_pagar")
                .select("valor")
                .eq("company_id", selectedCompany?.id)
                .gte("data_vencimento", format(monthStart, "yyyy-MM-dd"))
                .lte("data_vencimento", format(monthEnd, "yyyy-MM-dd"))
                .limit(5000);
            return (data || []).reduce((s: number, r: any) => s + Number(r.valor || 0), 0);
        },
        enabled: !!selectedCompany?.id,
    });

    const ticketMedio = baseReceita > 0 ? baseReceita / 10 : 1000; // estimativa

    const results = useMemo(() => {
        return scenarios.map(s => {
            const receita = baseReceita * (1 + s.revenueVar / 100) + (s.newClients * ticketMedio) + (s.newClients * s.extraTicket);
            const despesa = baseDespesa * (1 + s.expenseVar / 100);
            const resultado = receita - despesa;
            const margem = receita > 0 ? (resultado / receita) * 100 : 0;
            return { ...s, receita, despesa, resultado, margem };
        });
    }, [scenarios, baseReceita, baseDespesa, ticketMedio]);

    const chartData = [
        { name: "Receita", ...Object.fromEntries(results.map(r => [r.name, r.receita])) },
        { name: "Despesa", ...Object.fromEntries(results.map(r => [r.name, r.despesa])) },
        { name: "Resultado", ...Object.fromEntries(results.map(r => [r.name, r.resultado])) },
    ];

    const updateScenario = (index: number, field: keyof ScenarioConfig, value: any) => {
        const updated = [...scenarios];
        (updated[index] as any)[field] = value;
        setScenarios(updated);
    };

    return (
        <AppLayout title="Cenários Financeiros">
            <div style={{ fontFamily: "var(--font-base)", display: "flex", flexDirection: "column", gap: 20 }}>

                <div>
                    <h2 style={{ fontSize: 20, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                        <GitBranch size={24} color="#059669" /> Cenários Financeiros
                    </h2>
                    <p style={{ fontSize: 13, color: "#98A2B3" }}>
                        Base: Receita {fmt(baseReceita)} | Despesa {fmt(baseDespesa)} ({format(now, "MMMM/yyyy")})
                    </p>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                    {results.map((r, i) => (
                        <Card key={i} style={{ padding: 20, borderRadius: 14, border: `2px solid ${r.borderColor}`, background: r.bgColor + "33" }}>
                            <h3 style={{ fontSize: 16, fontWeight: 700, color: r.color, marginBottom: 16 }}>{r.name}</h3>

                            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
                                <div>
                                    <Label className="text-xs">Variação Receita (%)</Label>
                                    <Input type="number" value={scenarios[i].revenueVar} className="h-8 text-sm"
                                        onChange={e => updateScenario(i, "revenueVar", Number(e.target.value))} />
                                </div>
                                <div>
                                    <Label className="text-xs">Variação Despesa (%)</Label>
                                    <Input type="number" value={scenarios[i].expenseVar} className="h-8 text-sm"
                                        onChange={e => updateScenario(i, "expenseVar", Number(e.target.value))} />
                                </div>
                                <div>
                                    <Label className="text-xs">Novos Clientes</Label>
                                    <Input type="number" value={scenarios[i].newClients} className="h-8 text-sm"
                                        onChange={e => updateScenario(i, "newClients", Number(e.target.value))} />
                                </div>
                                <div>
                                    <Label className="text-xs">Ticket Extra (R$)</Label>
                                    <Input type="number" value={scenarios[i].extraTicket} className="h-8 text-sm"
                                        onChange={e => updateScenario(i, "extraTicket", Number(e.target.value))} />
                                </div>
                            </div>

                            <div style={{ borderTop: `1px solid ${r.borderColor}40`, paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                    <span style={{ fontSize: 12, color: "#667085" }}>Receita</span>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: "#039855" }}>{fmt(r.receita)}</span>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                    <span style={{ fontSize: 12, color: "#667085" }}>Despesa</span>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: "#E53E3E" }}>{fmt(r.despesa)}</span>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #EAECF0", paddingTop: 8 }}>
                                    <span style={{ fontSize: 13, fontWeight: 700 }}>Resultado</span>
                                    <span style={{ fontSize: 15, fontWeight: 800, color: r.resultado >= 0 ? "#039855" : "#E53E3E" }}>{fmt(r.resultado)}</span>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                    <span style={{ fontSize: 12, color: "#98A2B3" }}>Margem</span>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: r.margem >= 0 ? "#039855" : "#E53E3E" }}>{r.margem.toFixed(1)}%</span>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>

                <Card style={{ padding: 20, borderRadius: 14, border: "1px solid #EAECF0" }}>
                    <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Comparativo de Cenários</p>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#F6F2EB" />
                            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                            <Tooltip formatter={(v: number) => fmt(v)} />
                            <Legend />
                            <Bar dataKey="Pessimista" fill="#E53E3E" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="Realista" fill="#1E3A8A" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="Otimista" fill="#059669" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </Card>
            </div>
        </AppLayout>
    );
}
