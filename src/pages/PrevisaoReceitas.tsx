import { useMemo, useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PagePanel } from "@/components/layout/PagePanel";
import { KpiCard, KpiCardGrid } from "@/components/ui/kpi-card";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eye, ChevronDown } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format, subMonths, startOfMonth } from "date-fns";
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

    // ─── Padrão de planilha: colunas ajustáveis + ocultáveis ─────
    const COL_ORDER = ['mes', 'real', 'prevista', 'diferenca', 'status'];
    const COL_LABELS: Record<string, string> = {
        mes: 'Mês', real: 'Receita Real', prevista: 'Receita Prevista', diferenca: 'Diferença', status: 'Status',
    };
    const COL_WIDTHS_DEFAULT: Record<string, number> = {
        mes: 140, real: 150, prevista: 150, diferenca: 150, status: 120,
    };
    const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
        try {
            const s = localStorage.getItem('previsaoreceitas_col_widths');
            if (s) return { ...COL_WIDTHS_DEFAULT, ...JSON.parse(s) };
        } catch { /* ignore */ }
        return COL_WIDTHS_DEFAULT;
    });
    useEffect(() => { localStorage.setItem('previsaoreceitas_col_widths', JSON.stringify(colWidths)); }, [colWidths]);
    const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => {
        try {
            const s = localStorage.getItem('previsaoreceitas_hidden_cols');
            if (s) return new Set(JSON.parse(s) as string[]);
        } catch { /* ignore */ }
        return new Set();
    });
    useEffect(() => { localStorage.setItem('previsaoreceitas_hidden_cols', JSON.stringify([...hiddenCols])); }, [hiddenCols]);
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

    return (
        <AppLayout title="Previsão de Receitas">
            <div className="animate-fade-in" style={{ fontFamily: "var(--font-base)" }}>
                <PagePanel title="Previsão de Receitas" subtitle="Baseada nos últimos 6 meses + projeção 3 meses">

                <KpiCardGrid>
                    {[
                        { label: "Receita média mensal", value: fmt(mediamensal), color: "#059669" },
                        { label: "Tendência", value: `${trend >= 0 ? "+" : ""}${trend.toFixed(1)}%`, color: trend >= 0 ? "#039855" : "#E53E3E" },
                        { label: "Previsão próximo mês", value: fmt(avgLast3), color: "#059669" },
                        { label: "Previsão trimestre", value: fmt(previsaoTrimestre), color: "#039855" },
                    ].map((kpi, i) => (
                        <KpiCard key={i} label={kpi.label} value={kpi.value} valueColor={kpi.color} />
                    ))}
                </KpiCardGrid>

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
                    <div className="flex items-center justify-between px-4 py-3" style={{ background: "#000000" }}>
                        <h3 className="font-extrabold text-white m-0" style={{ fontSize: 16, letterSpacing: "-0.01em" }}>
                            Detalhamento mensal
                        </h3>
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
                                        <p className="px-3 py-1.5 text-[11px] font-bold text-[#98A2B3] uppercase tracking-wider">Exibir colunas</p>
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
                    <div className="bg-white overflow-x-auto">
                        <table className="text-sm" style={{ tableLayout: 'fixed', width: visibleCols.reduce((a, k) => a + (colWidths[k] ?? COL_WIDTHS_DEFAULT[k]), 0), minWidth: '100%' }}>
                            <colgroup>
                                {COL_ORDER.map(k => (
                                    <col key={k} className={isColVisible(k) ? '' : 'hidden'} style={{ width: colWidths[k] ?? COL_WIDTHS_DEFAULT[k] }} />
                                ))}
                            </colgroup>
                            <thead>
                                <tr className="bg-white text-[13px] font-bold text-[#1D2939] uppercase tracking-wider whitespace-nowrap border-b-2 border-[#D0D5DD]">
                                    <th className={`text-left px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('mes') ? '' : 'hidden'}`}>
                                        <span onMouseDown={startResize('mes')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                        Mês
                                    </th>
                                    <th className={`text-right px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('real') ? '' : 'hidden'}`}>
                                        <span onMouseDown={startResize('real')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                        Receita Real
                                    </th>
                                    <th className={`text-right px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('prevista') ? '' : 'hidden'}`}>
                                        <span onMouseDown={startResize('prevista')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                        Receita Prevista
                                    </th>
                                    <th className={`text-right px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('diferenca') ? '' : 'hidden'}`}>
                                        <span onMouseDown={startResize('diferenca')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                        Diferença
                                    </th>
                                    <th className={`text-left px-3 py-3 relative ${isColVisible('status') ? '' : 'hidden'}`}>
                                        Status
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {monthlyData.map((m) => {
                                    const diff = m.real - mediamensal;
                                    return (
                                        <tr key={m.key} className="border-b border-[#F1F3F5]">
                                            <td className={`px-3 py-1 font-medium capitalize text-[#1D2939] truncate border-r border-[#F1F3F5] ${isColVisible('mes') ? '' : 'hidden'}`} title={m.label}>{m.label}</td>
                                            <td className={`px-3 py-1 text-right text-[#1D2939] border-r border-[#F1F3F5] ${isColVisible('real') ? '' : 'hidden'}`}>{fmt(m.real)}</td>
                                            <td className={`px-3 py-1 text-right text-[#667085] border-r border-[#F1F3F5] ${isColVisible('prevista') ? '' : 'hidden'}`}>{fmt(mediamensal)}</td>
                                            <td className={`px-3 py-1 text-right border-r border-[#F1F3F5] ${isColVisible('diferenca') ? '' : 'hidden'}`} style={{ color: diff >= 0 ? "#039855" : "#E53E3E" }}>
                                                {diff >= 0 ? "+" : ""}{fmt(diff)}
                                            </td>
                                            <td className={`px-3 py-1 ${isColVisible('status') ? '' : 'hidden'}`}>
                                                <Badge className={diff >= 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                                                    {diff >= 0 ? "Acima" : "Abaixo"}
                                                </Badge>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {projections.map(p => (
                                    <tr key={p.key} className="bg-blue-50/30 border-b border-[#F1F3F5]">
                                        <td className={`px-3 py-1 font-medium capitalize text-[#1D2939] truncate border-r border-[#F1F3F5] ${isColVisible('mes') ? '' : 'hidden'}`} title={p.label}>{p.label}</td>
                                        <td className={`px-3 py-1 text-right text-[#667085] border-r border-[#F1F3F5] ${isColVisible('real') ? '' : 'hidden'}`}>—</td>
                                        <td className={`px-3 py-1 text-right border-r border-[#F1F3F5] ${isColVisible('prevista') ? '' : 'hidden'}`} style={{ color: "#059669", fontWeight: 600 }}>{fmt(p.previsto)}</td>
                                        <td className={`px-3 py-1 text-right border-r border-[#F1F3F5] ${isColVisible('diferenca') ? '' : 'hidden'}`}>—</td>
                                        <td className={`px-3 py-1 ${isColVisible('status') ? '' : 'hidden'}`}><Badge className="bg-blue-100 text-blue-700">Projeção</Badge></td>
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
