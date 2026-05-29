import { useState, useMemo, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PagePanel } from "@/components/layout/PagePanel";
import { KpiCard, KpiCardGrid } from "@/components/ui/kpi-card";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Eye, ChevronDown } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format, addDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export default function FluxoCaixaProjetado() {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const [days, setDays] = useState(90);

    // ─── Padrão de planilha: colunas ajustáveis + ocultáveis ─────
    const COL_ORDER = ['data', 'descricao', 'tipo', 'valor', 'saldo'];
    const COL_LABELS: Record<string, string> = {
        data: 'Data', descricao: 'Descrição', tipo: 'Tipo', valor: 'Valor', saldo: 'Saldo Acumulado',
    };
    const COL_WIDTHS_DEFAULT: Record<string, number> = {
        data: 120, descricao: 280, tipo: 110, valor: 140, saldo: 160,
    };
    const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
        try {
            const s = localStorage.getItem('fluxoprojetado_col_widths');
            if (s) return { ...COL_WIDTHS_DEFAULT, ...JSON.parse(s) };
        } catch { /* ignore */ }
        return COL_WIDTHS_DEFAULT;
    });
    useEffect(() => { localStorage.setItem('fluxoprojetado_col_widths', JSON.stringify(colWidths)); }, [colWidths]);
    const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => {
        try {
            const s = localStorage.getItem('fluxoprojetado_hidden_cols');
            if (s) return new Set(JSON.parse(s) as string[]);
        } catch { /* ignore */ }
        return new Set();
    });
    useEffect(() => { localStorage.setItem('fluxoprojetado_hidden_cols', JSON.stringify([...hiddenCols])); }, [hiddenCols]);
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
            <div style={{ fontFamily: "var(--font-base)" }}>

                <PagePanel title="Fluxo de Caixa Projetado" subtitle={`Próximos ${days} dias`}>
                    <div className="flex flex-wrap items-center gap-2 justify-end">
                        <SegmentedControl<"30" | "60" | "90">
                            value={String(days) as "30" | "60" | "90"}
                            onChange={(v) => setDays(Number(v))}
                            options={[
                                { value: "30", label: "30 dias" },
                                { value: "60", label: "60 dias" },
                                { value: "90", label: "90 dias" },
                            ]}
                        />
                    </div>

                <KpiCardGrid className="lg:grid-cols-3">
                    <KpiCard
                        label="Entradas previstas"
                        value={fmt(totalEntradas)}
                        valueColor="#039855"
                        sub={`${receivables.length} recebíveis`}
                    />
                    <KpiCard
                        label="Saídas previstas"
                        value={fmt(totalSaidas)}
                        valueColor="#E53E3E"
                        sub={`${payables.length} contas a pagar`}
                    />
                    <KpiCard
                        label="Saldo projetado"
                        value={fmt(saldoProjetado)}
                        valueColor={saldoProjetado >= 0 ? "#059669" : "#E53E3E"}
                        sub="Entradas - Saídas"
                    />
                </KpiCardGrid>

                {chartData.length > 0 && (
                    <Card style={{ padding: 20, borderRadius: 14, border: "1px solid #EAECF0" }}>
                        <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Saldo Acumulado Projetado</p>
                        <ResponsiveContainer width="100%" height={280}>
                            <AreaChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#F6F2EB" />
                                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                                <Tooltip formatter={(v: number) => fmt(v)} />
                                <Area type="monotone" dataKey="saldo" stroke="#059669" fill="#ECFDF4" strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </Card>
                )}

                <Card style={{ borderRadius: 14, border: "1px solid #EAECF0", overflow: "hidden", padding: 0 }}>
                    <div className="flex items-center justify-between px-4 py-3" style={{ background: "#000000" }}>
                        <h3 className="font-extrabold text-white m-0" style={{ fontSize: 16, letterSpacing: "-0.015em", lineHeight: 1.15 }}>
                            Lançamentos Projetados
                        </h3>
                        <div className="flex items-center gap-3">
                            <span className="text-[13px] text-white/70 font-medium">
                                {allItems.length} registro{allItems.length !== 1 ? "s" : ""}
                            </span>
                            <div className="relative self-center">
                                <button
                                    onClick={() => setColMenuOpen(o => !o)}
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/20 text-[12px] text-white hover:bg-white/10"
                                    title="Mostrar/ocultar colunas"
                                >
                                    <Eye size={14} className="text-white/70" /> Colunas
                                    <ChevronDown size={13} className={`text-white/60 transition-transform ${colMenuOpen ? "rotate-180" : ""}`} />
                                </button>
                                {colMenuOpen && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setColMenuOpen(false)} />
                                        <div className="absolute right-0 mt-1 z-50 bg-white border border-[#EAECF0] rounded-lg shadow-xl py-1 min-w-[190px]">
                                            <p className="px-3 py-1.5 text-[10px] font-bold text-[#98A2B3] uppercase tracking-wider">Exibir colunas</p>
                                            {COL_ORDER.map(k => (
                                                <label key={k} className="flex items-center gap-2 px-3 py-1.5 text-[13px] text-[#1D2939] hover:bg-[#F6F2EB] cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={isColVisible(k)}
                                                        onChange={() => toggleColVisible(k)}
                                                        className="w-4 h-4 rounded border-[#D0D5DD] text-[#059669] focus:ring-[#059669]/30"
                                                    />
                                                    {COL_LABELS[k]}
                                                </label>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="bg-white overflow-x-auto">
                        <table className="text-sm" style={{ tableLayout: "fixed", width: visibleCols.reduce((a, k) => a + (colWidths[k] ?? COL_WIDTHS_DEFAULT[k]), 0), minWidth: "100%" }}>
                            <colgroup>
                                {COL_ORDER.map(k => (
                                    <col key={k} className={isColVisible(k) ? "" : "hidden"} style={{ width: colWidths[k] ?? COL_WIDTHS_DEFAULT[k] }} />
                                ))}
                            </colgroup>
                            <thead>
                                <tr className="bg-white text-[15px] font-bold text-black uppercase tracking-wider border-b-2 border-[#D0D5DD] whitespace-nowrap">
                                    <th className={`text-left px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible("data") ? "" : "hidden"}`}>
                                        <span onMouseDown={startResize("data")} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                        Data
                                    </th>
                                    <th className={`text-left px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible("descricao") ? "" : "hidden"}`}>
                                        <span onMouseDown={startResize("descricao")} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                        Descrição
                                    </th>
                                    <th className={`text-center px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible("tipo") ? "" : "hidden"}`}>
                                        <span onMouseDown={startResize("tipo")} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                        Tipo
                                    </th>
                                    <th className={`text-right px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible("valor") ? "" : "hidden"}`}>
                                        <span onMouseDown={startResize("valor")} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                        Valor
                                    </th>
                                    <th className={`text-right px-3 py-3 relative ${isColVisible("saldo") ? "" : "hidden"}`}>
                                        Saldo Acumulado
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {allItems.length === 0 ? (
                                    <tr><td colSpan={visibleCols.length} className="text-center py-8 text-[#667085]">Nenhum lançamento futuro encontrado.</td></tr>
                                ) : allItems.map((item, i) => (
                                    <tr key={i} className="border-b border-[#F1F3F5] hover:bg-[#FAFAFA]">
                                        <td className={`px-3 py-1 text-left text-[#667085] truncate border-r border-[#F1F3F5] ${isColVisible("data") ? "" : "hidden"}`}>{item.due_date ? format(parseISO(item.due_date), "dd/MM/yyyy") : "—"}</td>
                                        <td className={`px-3 py-1 text-left text-[#1D2939] truncate border-r border-[#F1F3F5] ${isColVisible("descricao") ? "" : "hidden"}`} title={item.description || ""}>{item.description || "—"}</td>
                                        <td className={`px-3 py-1 text-center border-r border-[#F1F3F5] ${isColVisible("tipo") ? "" : "hidden"}`}>
                                            <Badge className={item.tipo === "entrada" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                                                {item.tipo === "entrada" ? "Entrada" : "Saída"}
                                            </Badge>
                                        </td>
                                        <td className={`px-3 py-1 text-right border-r border-[#F1F3F5] ${isColVisible("valor") ? "" : "hidden"}`} style={{ color: item.tipo === "entrada" ? "#039855" : "#E53E3E" }}>
                                            {fmt(Number(item.amount))}
                                        </td>
                                        <td className={`px-3 py-1 text-right ${isColVisible("saldo") ? "" : "hidden"}`} style={{ fontWeight: 600, color: item.saldo_acumulado >= 0 ? "#059669" : "#E53E3E" }}>
                                            {fmt(item.saldo_acumulado)}
                                        </td>
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
