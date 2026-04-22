import { useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, TrendingDown, DollarSign, Target } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export default function PrevisaoReceitas() {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();

    const now = new Date();
    const sixMonthsAgo = startOfMonth(subMonths(now, 5));

    const { data: receivables = [] } = useQuery({
        queryKey: ["prev_receivables", selectedCompany?.id],
        queryFn: async () => {
            const { data } = await (activeClient as any)
                .from("contas_receber")
                .select("id, valor, data_vencimento, data_pagamento, status")
                .eq("company_id", selectedCompany?.id)
                .gte("data_vencimento", format(sixMonthsAgo, "yyyy-MM-dd"))
                .order("data_vencimento");
            return data || [];
        },
        enabled: !!selectedCompany?.id,
    });

    const monthlyData = useMemo(() => {
        const months: { key: string; label: string; real: number; count: number }[] = [];
        for (let i = 5; i >= 0; i--) {
            const d = subMonths(now, i);
            const key = format(d, "yyyy-MM");
            const label = format(d, "MMM/yy", { locale: ptBR });
            const monthRecv = receivables.filter((r: any) => {
                const rd = r.data_pagamento || r.data_vencimento;
                return rd && rd.startsWith(key) && (r.status === "pago" || r.data_pagamento);
            });
            const real = monthRecv.reduce((s: number, r: any) => s + Number(r.valor || 0), 0);
            months.push({ key, label, real, count: monthRecv.length });
        }
        return months;
    }, [receivables]);

    const avgLast3 = useMemo(() => {
        const last3 = monthlyData.slice(-3);
        const sum = last3.reduce((s, m) => s + m.real, 0);
        return last3.length > 0 ? sum / last3.length : 0;
    }, [monthlyData]);

    const projections = useMemo(() => {
        return [1, 2, 3].map(i => {
            const d = subMonths(now, -i);
            return {
                key: format(d, "yyyy-MM"),
                label: format(d, "MMM/yy", { locale: ptBR }),
                previsto: avgLast3,
            };
        });
    }, [avgLast3]);

    const trend = useMemo(() => {
        if (monthlyData.length < 2) return 0;
        const prev = monthlyData[monthlyData.length - 2]?.real || 1;
        const curr = monthlyData[monthlyData.length - 1]?.real || 0;
        return prev > 0 ? ((curr - prev) / prev) * 100 : 0;
    }, [monthlyData]);

    const chartData = [
        ...monthlyData.map(m => ({ name: m.label, real: m.real, previsto: null as number | null })),
        ...projections.map(p => ({ name: p.label, real: null as number | null, previsto: p.previsto })),
    ];

    const mediamensal = monthlyData.length > 0 ? monthlyData.reduce((s, m) => s + m.real, 0) / monthlyData.length : 0;
    const previsaoTrimestre = avgLast3 * 3;

    return (
        <AppLayout title="Previsão de Receitas">
            <div style={{ fontFamily: "var(--font-base)", display: "flex", flexDirection: "column", gap: 20 }}>
                <div>
                    <h2 style={{ fontSize: 20, fontWeight: 700 }}>Previsão de Receitas</h2>
                    <p style={{ fontSize: 13, color: "#98A2B3" }}>Baseada nos últimos 6 meses + projeção 3 meses</p>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
                    {[
                        { label: "RECEITA MÉDIA MENSAL", value: fmt(mediamensal), icon: DollarSign, color: "#059669", bg: "#ECFDF4" },
                        { label: "TENDÊNCIA", value: `${trend >= 0 ? "+" : ""}${trend.toFixed(1)}%`, icon: trend >= 0 ? TrendingUp : TrendingDown, color: trend >= 0 ? "#039855" : "#D92D20", bg: trend >= 0 ? "#ECFDF3" : "#FEF3F2" },
                        { label: "PREVISÃO PRÓXIMO MÊS", value: fmt(avgLast3), icon: Target, color: "#059669", bg: "#ECFDF4" },
                        { label: "PREVISÃO TRIMESTRE", value: fmt(previsaoTrimestre), icon: TrendingUp, color: "#039855", bg: "#ECFDF3" },
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

                <Card style={{ padding: 20, borderRadius: 14, border: "1px solid #EAECF0" }}>
                    <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Histórico + Projeção</p>
                    <ResponsiveContainer width="100%" height={280}>
                        <AreaChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#F6F2EB" />
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                            <Tooltip formatter={(v: number) => fmt(v)} />
                            <Area type="monotone" dataKey="real" stroke="#039855" fill="#ECFDF3" strokeWidth={2} name="Real" />
                            <Area type="monotone" dataKey="previsto" stroke="#059669" fill="#ECFDF4" strokeWidth={2} strokeDasharray="5 5" name="Previsto" />
                        </AreaChart>
                    </ResponsiveContainer>
                </Card>

                <Card style={{ borderRadius: 14, border: "1px solid #EAECF0", overflow: "hidden" }}>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Mês</TableHead>
                                <TableHead className="text-right">Receita Real</TableHead>
                                <TableHead className="text-right">Receita Prevista</TableHead>
                                <TableHead className="text-right">Diferença</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {monthlyData.map((m, i) => {
                                const diff = m.real - mediamensal;
                                return (
                                    <TableRow key={m.key}>
                                        <TableCell className="font-medium capitalize">{m.label}</TableCell>
                                        <TableCell className="text-right">{fmt(m.real)}</TableCell>
                                        <TableCell className="text-right text-muted-foreground">{fmt(mediamensal)}</TableCell>
                                        <TableCell className="text-right" style={{ color: diff >= 0 ? "#039855" : "#D92D20" }}>
                                            {diff >= 0 ? "+" : ""}{fmt(diff)}
                                        </TableCell>
                                        <TableCell>
                                            <Badge className={diff >= 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                                                {diff >= 0 ? "Acima" : "Abaixo"}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {projections.map(p => (
                                <TableRow key={p.key} className="bg-blue-50/30">
                                    <TableCell className="font-medium capitalize">{p.label}</TableCell>
                                    <TableCell className="text-right text-muted-foreground">—</TableCell>
                                    <TableCell className="text-right" style={{ color: "#059669", fontWeight: 600 }}>{fmt(p.previsto)}</TableCell>
                                    <TableCell className="text-right">—</TableCell>
                                    <TableCell><Badge className="bg-blue-100 text-blue-700">Projeção</Badge></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Card>
            </div>
        </AppLayout>
    );
}
