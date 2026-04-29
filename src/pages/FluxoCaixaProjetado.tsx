import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format, addDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export default function FluxoCaixaProjetado() {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const [days, setDays] = useState(90);

    const today = new Date();
    const endDate = addDays(today, days);

    const { data: receivables = [] } = useQuery({
        queryKey: ["fc_receivables", selectedCompany?.id, days],
        queryFn: async () => {
            const { data: raw } = await (activeClient as any)
                .from("contas_receber")
                .select("id, pagador_nome, valor, data_vencimento, status")
                .eq("company_id", selectedCompany?.id)
                .eq("status", "aberto")
                .gte("data_vencimento", format(today, "yyyy-MM-dd"))
                .lte("data_vencimento", format(endDate, "yyyy-MM-dd"))
                .order("data_vencimento");
            const data = (raw || []).map((r: any) => ({ id: r.id, description: r.pagador_nome || "", amount: Number(r.valor || 0), due_date: r.data_vencimento, status: r.status }));
            return data || [];
        },
        enabled: !!selectedCompany?.id,
    });

    const { data: payables = [] } = useQuery({
        queryKey: ["fc_payables", selectedCompany?.id, days],
        queryFn: async () => {
            const { data: raw } = await (activeClient as any)
                .from("contas_pagar")
                .select("id, credor_nome, valor, data_vencimento, status")
                .eq("company_id", selectedCompany?.id)
                .eq("status", "aberto")
                .gte("data_vencimento", format(today, "yyyy-MM-dd"))
                .lte("data_vencimento", format(endDate, "yyyy-MM-dd"))
                .order("data_vencimento");
            const data = (raw || []).map((p: any) => ({ id: p.id, description: p.credor_nome || "", amount: Number(p.valor || 0), due_date: p.data_vencimento, status: p.status }));
            return data || [];
        },
        enabled: !!selectedCompany?.id,
    });

    const totalEntradas = receivables.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
    const totalSaidas = payables.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    const saldoProjetado = totalEntradas - totalSaidas;

    const allItems = useMemo(() => {
        const items = [
            ...receivables.map((r: any) => ({ ...r, tipo: "entrada" as const })),
            ...payables.map((p: any) => ({ ...p, tipo: "saida" as const })),
        ].sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));

        let acc = 0;
        return items.map(item => {
            acc += item.tipo === "entrada" ? Number(item.amount) : -Number(item.amount);
            return { ...item, saldo_acumulado: acc };
        });
    }, [receivables, payables]);

    const chartData = useMemo(() => {
        const byDate: Record<string, { entradas: number; saidas: number }> = {};
        allItems.forEach(item => {
            const d = item.due_date || "";
            if (!byDate[d]) byDate[d] = { entradas: 0, saidas: 0 };
            if (item.tipo === "entrada") byDate[d].entradas += Number(item.amount);
            else byDate[d].saidas += Number(item.amount);
        });
        let acc = 0;
        return Object.entries(byDate).sort().map(([date, vals]) => {
            acc += vals.entradas - vals.saidas;
            return { date: format(parseISO(date), "dd/MM", { locale: ptBR }), saldo: acc, entradas: vals.entradas, saidas: vals.saidas };
        });
    }, [allItems]);

    return (
        <AppLayout title="Fluxo de Caixa Projetado">
            <div style={{ fontFamily: "var(--font-base)", display: "flex", flexDirection: "column", gap: 20 }}>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Fluxo de Caixa Projetado</h2>
                        <p style={{ fontSize: 13, color: "#98A2B3" }}>Próximos {days} dias</p>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        {[30, 60, 90].map(d => (
                            <Button key={d} variant={days === d ? "default" : "outline"} size="sm" onClick={() => setDays(d)}>
                                {d} dias
                            </Button>
                        ))}
                    </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                    <Card style={{ padding: 20, borderRadius: 14, border: "1px solid #EAECF0" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ background: "#ECFDF3", borderRadius: 10, padding: 10 }}><TrendingUp size={20} color="#039855" /></div>
                            <div>
                                <p style={{ fontSize: 12, color: "#98A2B3", fontWeight: 600 }}>ENTRADAS PREVISTAS</p>
                                <p style={{ fontSize: 22, fontWeight: 800, color: "#039855" }}>{fmt(totalEntradas)}</p>
                                <p style={{ fontSize: 11, color: "#98A2B3" }}>{receivables.length} recebíveis</p>
                            </div>
                        </div>
                    </Card>
                    <Card style={{ padding: 20, borderRadius: 14, border: "1px solid #EAECF0" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ background: "#FEE2E2", borderRadius: 10, padding: 10 }}><TrendingDown size={20} color="#E53E3E" /></div>
                            <div>
                                <p style={{ fontSize: 12, color: "#98A2B3", fontWeight: 600 }}>SAÍDAS PREVISTAS</p>
                                <p style={{ fontSize: 22, fontWeight: 800, color: "#E53E3E" }}>{fmt(totalSaidas)}</p>
                                <p style={{ fontSize: 11, color: "#98A2B3" }}>{payables.length} contas a pagar</p>
                            </div>
                        </div>
                    </Card>
                    <Card style={{ padding: 20, borderRadius: 14, border: "1px solid #EAECF0" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ background: saldoProjetado >= 0 ? "#ECFDF4" : "#FEE2E2", borderRadius: 10, padding: 10 }}>
                                <DollarSign size={20} color={saldoProjetado >= 0 ? "#059669" : "#E53E3E"} />
                            </div>
                            <div>
                                <p style={{ fontSize: 12, color: "#98A2B3", fontWeight: 600 }}>SALDO PROJETADO</p>
                                <p style={{ fontSize: 22, fontWeight: 800, color: saldoProjetado >= 0 ? "#059669" : "#E53E3E" }}>{fmt(saldoProjetado)}</p>
                                <p style={{ fontSize: 11, color: "#98A2B3" }}>Entradas - Saídas</p>
                            </div>
                        </div>
                    </Card>
                </div>

                {chartData.length > 0 && (
                    <Card style={{ padding: 20, borderRadius: 14, border: "1px solid #EAECF0" }}>
                        <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Saldo Acumulado Projetado</p>
                        <ResponsiveContainer width="100%" height={280}>
                            <AreaChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#FFFFFF" />
                                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                                <Tooltip formatter={(v: number) => fmt(v)} />
                                <Area type="monotone" dataKey="saldo" stroke="#059669" fill="#ECFDF4" strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </Card>
                )}

                <Card style={{ borderRadius: 14, border: "1px solid #EAECF0", overflow: "hidden" }}>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Data</TableHead>
                                <TableHead>Descrição</TableHead>
                                <TableHead>Tipo</TableHead>
                                <TableHead className="text-right">Valor</TableHead>
                                <TableHead className="text-right">Saldo Acumulado</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {allItems.length === 0 ? (
                                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum lançamento futuro encontrado.</TableCell></TableRow>
                            ) : allItems.map((item, i) => (
                                <TableRow key={i}>
                                    <TableCell>{item.due_date ? format(parseISO(item.due_date), "dd/MM/yyyy") : "—"}</TableCell>
                                    <TableCell>{item.description || "—"}</TableCell>
                                    <TableCell>
                                        <Badge className={item.tipo === "entrada" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                                            {item.tipo === "entrada" ? "Entrada" : "Saída"}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right" style={{ color: item.tipo === "entrada" ? "#039855" : "#E53E3E" }}>
                                        {fmt(Number(item.amount))}
                                    </TableCell>
                                    <TableCell className="text-right" style={{ fontWeight: 600, color: item.saldo_acumulado >= 0 ? "#059669" : "#E53E3E" }}>
                                        {fmt(item.saldo_acumulado)}
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
