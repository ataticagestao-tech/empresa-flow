import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, AreaChart, Area,
} from "recharts";
import { AlertTriangle, ArrowRight, ChevronDown, Calendar } from "lucide-react";
import {
    startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, addDays, format,
    differenceInDays,
} from "date-fns";
import { ptBR } from "date-fns/locale";

/* ── Design Tokens ──────────────────────────────────────────── */
const C = {
    darkCard: "#1A1F36",
    gold: "#C5A24D",
    goldBg: "#FDF8EC",
    goldBorder: "#E8D5A0",
    green: "#2e7d32",
    greenSoft: "#e8f5e9",
    greenBadge: "#16a34a",
    red: "#c62828",
    redSoft: "#fde8e8",
    redBg: "#B91C1C",
    text1: "#0f172a",
    text2: "#475569",
    textMuted: "#94a3b8",
    border: "#e2e8f0",
    surface: "#ffffff",
} as const;

const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
const fmtFull = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const fmtPct = (v: number) => `${v.toFixed(1)}%`;

/* ── Period Type ────────────────────────────────────────────── */
type Period = "hoje" | "mes" | "trimestre" | "ano" | "custom";

/* ── Main Component ─────────────────────────────────────────── */
export default function CompanyDashboard() {
    const { id: companyId } = useParams<{ id: string }>();
    const { selectedCompany } = useCompany();
    const { activeClient } = useAuth();
    const navigate = useNavigate();
    const db = activeClient as any;
    const cId = companyId || selectedCompany?.id;

    const [period, setPeriod] = useState<Period>("mes");
    const [customStart, setCustomStart] = useState("");
    const [customEnd, setCustomEnd] = useState("");

    const today = useMemo(() => new Date(), []);
    const todayStr = format(today, "yyyy-MM-dd");

    // ─── Period date range ────────────────────────────────
    const { periodStart, periodEnd, periodLabel } = useMemo(() => {
        switch (period) {
            case "hoje":
                return { periodStart: todayStr, periodEnd: todayStr, periodLabel: "Hoje" };
            case "mes":
                return {
                    periodStart: format(startOfMonth(today), "yyyy-MM-dd"),
                    periodEnd: format(endOfMonth(today), "yyyy-MM-dd"),
                    periodLabel: "Mês",
                };
            case "trimestre":
                return {
                    periodStart: format(startOfMonth(subMonths(today, 2)), "yyyy-MM-dd"),
                    periodEnd: format(endOfMonth(today), "yyyy-MM-dd"),
                    periodLabel: "Trimestre",
                };
            case "ano":
                return {
                    periodStart: format(startOfYear(today), "yyyy-MM-dd"),
                    periodEnd: format(endOfYear(today), "yyyy-MM-dd"),
                    periodLabel: "Ano",
                };
            case "custom":
                return {
                    periodStart: customStart || todayStr,
                    periodEnd: customEnd || todayStr,
                    periodLabel: "Personalizado",
                };
            default:
                return {
                    periodStart: format(startOfMonth(today), "yyyy-MM-dd"),
                    periodEnd: format(endOfMonth(today), "yyyy-MM-dd"),
                    periodLabel: "Mês",
                };
        }
    }, [period, today, todayStr, customStart, customEnd]);

    // ─── Transfer account IDs (excluir de todos os cálculos) ─
    const { data: transferAccountIds = [] } = useQuery({
        queryKey: ["dash_transfer_ids", cId],
        queryFn: async () => {
            const { data } = await db.from("chart_of_accounts")
                .select("id, name")
                .eq("company_id", cId)
                .ilike("name", "%transfer%");
            return (data || []).map((a: any) => a.id);
        },
        enabled: !!cId,
    });

    const isTransfer = (r: any) =>
        r.conta_contabil_id && transferAccountIds.includes(r.conta_contabil_id);

    // ─── Bank Accounts ─────────────────────────────────────
    const { data: bankAccounts } = useQuery({
        queryKey: ["dash_banks", cId],
        queryFn: async () => {
            const { data } = await db.from("bank_accounts").select("id, name, current_balance").eq("company_id", cId);
            return data || [];
        },
        enabled: !!cId,
    });
    const saldoCaixa = useMemo(() => (bankAccounts || []).reduce((s: number, a: any) => s + Number(a.current_balance || 0), 0), [bankAccounts]);

    // ─── Receivables (all open, excl. transferências) ──────
    const { data: receivablesRaw } = useQuery({
        queryKey: ["dash_receivables", cId],
        queryFn: async () => {
            const { data } = await db.from("contas_receber")
                .select("id, pagador_nome, valor, valor_pago, data_vencimento, status, conta_contabil_id")
                .eq("company_id", cId).in("status", ["aberto", "parcial", "vencido"])
                .is("deleted_at", null)
                .limit(5000);
            return data || [];
        },
        enabled: !!cId,
    });
    const receivablesFiltered = useMemo(() =>
        (receivablesRaw || []).filter((r: any) => !isTransfer(r)),
        [receivablesRaw, transferAccountIds]
    );

    // ─── Payables (all open, excl. transferências) ─────────
    const { data: payablesRaw } = useQuery({
        queryKey: ["dash_payables", cId],
        queryFn: async () => {
            const { data } = await db.from("contas_pagar")
                .select("id, credor_nome, valor, valor_pago, data_vencimento, status, conta_contabil_id")
                .eq("company_id", cId).in("status", ["aberto", "parcial", "vencido"])
                .is("deleted_at", null)
                .limit(5000);
            return data || [];
        },
        enabled: !!cId,
    });
    const payablesFiltered = useMemo(() =>
        (payablesRaw || []).filter((p: any) => !isTransfer(p)),
        [payablesRaw, transferAccountIds]
    );

    // ─── Receita/Despesa do período selecionado ───────────
    const { data: receitaPeriodo = 0 } = useQuery({
        queryKey: ["dash_receita_periodo", cId, periodStart, periodEnd, transferAccountIds],
        queryFn: async () => {
            const { data } = await db.from("contas_receber")
                .select("valor_pago, conta_contabil_id")
                .eq("company_id", cId)
                .eq("status", "pago")
                .is("deleted_at", null)
                .gte("data_pagamento", periodStart)
                .lte("data_pagamento", periodEnd)
                .limit(5000);
            return (data || [])
                .filter((r: any) => !isTransfer(r))
                .reduce((s: number, r: any) => s + Number(r.valor_pago || 0), 0);
        },
        enabled: !!cId,
    });

    const { data: despesaPeriodo = 0 } = useQuery({
        queryKey: ["dash_despesa_periodo", cId, periodStart, periodEnd, transferAccountIds],
        queryFn: async () => {
            const { data } = await db.from("contas_pagar")
                .select("valor_pago, conta_contabil_id")
                .eq("company_id", cId).eq("status", "pago")
                .is("deleted_at", null)
                .gte("data_pagamento", periodStart).lte("data_pagamento", periodEnd)
                .limit(5000);
            return (data || [])
                .filter((r: any) => !isTransfer(r))
                .reduce((s: number, r: any) => s + Number(r.valor_pago || 0), 0);
        },
        enabled: !!cId,
    });

    const resultadoPeriodo = receitaPeriodo - despesaPeriodo;
    const margemPeriodo = receitaPeriodo > 0 ? (resultadoPeriodo / receitaPeriodo) * 100 : 0;

    // ─── Previous period receita (para comparação) ─────────
    const prevMonthStart = format(startOfMonth(subMonths(today, 1)), "yyyy-MM-dd");
    const prevMonthEnd = format(endOfMonth(subMonths(today, 1)), "yyyy-MM-dd");
    const prevMonthLabel = format(subMonths(today, 1), "MMMM", { locale: ptBR });

    const { data: receitaPeriodoAnterior = 0 } = useQuery({
        queryKey: ["dash_receita_prev", cId, prevMonthStart, transferAccountIds],
        queryFn: async () => {
            const { data } = await db.from("contas_receber")
                .select("valor_pago, conta_contabil_id")
                .eq("company_id", cId)
                .eq("status", "pago")
                .is("deleted_at", null)
                .gte("data_pagamento", prevMonthStart)
                .lte("data_pagamento", prevMonthEnd)
                .limit(5000);
            return (data || [])
                .filter((r: any) => !isTransfer(r))
                .reduce((s: number, r: any) => s + Number(r.valor_pago || 0), 0);
        },
        enabled: !!cId,
    });

    // ─── Payables next 7 days ───────────────────────────────
    const next7 = format(addDays(today, 7), "yyyy-MM-dd");
    const payables7d = useMemo(() =>
        payablesFiltered
            .filter((p: any) => p.data_vencimento <= next7)
            .sort((a: any, b: any) => a.data_vencimento.localeCompare(b.data_vencimento)),
        [payablesFiltered, next7]
    );
    const totalPagar7d = payables7d.reduce((s: number, p: any) => s + Number(p.valor || 0) - Number(p.valor_pago || 0), 0);
    const vencem_hoje_pagar = payables7d.filter((p: any) => p.data_vencimento === todayStr).length;

    // ─── Receivables aging ──────────────────────────────────
    const receivablesAging = useMemo(() => {
        const buckets = { ate30: { total: 0, count: 0 }, de31a60: { total: 0, count: 0 }, acima60: { total: 0, count: 0 } };
        const overdue: any[] = [];
        let totalAberto = 0;
        let totalCount = 0;

        receivablesFiltered.forEach((r: any) => {
            const saldo = Number(r.valor || 0) - Number(r.valor_pago || 0);
            if (saldo <= 0) return;
            totalAberto += saldo;
            totalCount++;

            const diasAtraso = differenceInDays(today, new Date(r.data_vencimento));
            if (diasAtraso > 60) {
                buckets.acima60.total += saldo;
                buckets.acima60.count++;
                overdue.push({ ...r, diasAtraso, saldo });
            } else if (diasAtraso > 30) {
                buckets.de31a60.total += saldo;
                buckets.de31a60.count++;
            } else {
                buckets.ate30.total += saldo;
                buckets.ate30.count++;
            }
        });

        overdue.sort((a, b) => b.diasAtraso - a.diasAtraso);
        return { buckets, overdue: overdue.slice(0, 5), totalAberto, totalCount };
    }, [receivablesFiltered, today]);

    // ─── Alert banner ───────────────────────────────────────
    const alertItems: string[] = [];
    if (vencem_hoje_pagar > 0) alertItems.push(`${vencem_hoje_pagar} conta${vencem_hoje_pagar > 1 ? "s" : ""} a pagar vence${vencem_hoje_pagar > 1 ? "m" : ""} hoje`);
    if (receivablesAging.overdue.length > 0) alertItems.push(`${receivablesAging.overdue.length} titulo${receivablesAging.overdue.length > 1 ? "s" : ""} a receber com mais de 60 dias em atraso`);

    // ─── Receita x Despesa 6 meses (chart) ──────────────────
    const { data: chartRevExp } = useQuery({
        queryKey: ["dash_rev_exp_6m", cId],
        queryFn: async () => {
            const months: any[] = [];
            for (let i = 5; i >= 0; i--) {
                const d = subMonths(today, i);
                const ms = format(startOfMonth(d), "yyyy-MM-dd");
                const me = format(endOfMonth(d), "yyyy-MM-dd");

                const [{ data: rec }, { data: desp }] = await Promise.all([
                    db.from("contas_receber")
                        .select("valor_pago, conta_contabil_id")
                        .eq("company_id", cId).eq("status", "pago")
                        .is("deleted_at", null)
                        .gte("data_pagamento", ms).lte("data_pagamento", me)
                        .limit(5000),
                    db.from("contas_pagar")
                        .select("valor_pago, conta_contabil_id")
                        .eq("company_id", cId).eq("status", "pago")
                        .is("deleted_at", null)
                        .gte("data_pagamento", ms).lte("data_pagamento", me)
                        .limit(5000),
                ]);

                const receita = (rec || [])
                    .filter((r: any) => !isTransfer(r))
                    .reduce((s: number, r: any) => s + Number(r.valor_pago || 0), 0);
                const despesa = (desp || [])
                    .filter((r: any) => !isTransfer(r))
                    .reduce((s: number, r: any) => s + Number(r.valor_pago || 0), 0);

                months.push({
                    mes: format(d, "MMM", { locale: ptBR }).replace(".", ""),
                    Receita: receita,
                    Despesa: despesa,
                });
            }
            return months;
        },
        enabled: !!cId,
    });

    // ─── Fluxo de Caixa 30 dias (chart) ─────────────────────
    const { data: chartCashflow } = useQuery({
        queryKey: ["dash_cashflow_30d", cId, saldoCaixa, receivablesFiltered?.length, payablesFiltered?.length],
        queryFn: async () => {
            const days: any[] = [];
            let balance = saldoCaixa || 0;
            let totalIn = 0, totalOut = 0;

            for (let i = 0; i < 30; i++) {
                const d = addDays(today, i);
                const ds = format(d, "yyyy-MM-dd");

                const recDay = receivablesFiltered.filter((r: any) => r.data_vencimento === ds)
                    .reduce((s: number, r: any) => s + Number(r.valor || 0) - Number(r.valor_pago || 0), 0);
                const payDay = payablesFiltered.filter((p: any) => p.data_vencimento === ds)
                    .reduce((s: number, p: any) => s + Number(p.valor || 0) - Number(p.valor_pago || 0), 0);

                balance += recDay - payDay;
                totalIn += recDay;
                totalOut += payDay;

                days.push({
                    dia: format(d, "dd/MM"),
                    saldo: balance,
                });
            }

            const negativeDay = days.find((d) => d.saldo < 0);
            return { days, totalIn, totalOut, projected: balance, negativeDay };
        },
        enabled: !!cId && saldoCaixa !== undefined,
    });

    const tooltipStyle = {
        backgroundColor: C.text1, color: "#fff", borderRadius: 8,
        border: "none", padding: "8px 14px", fontSize: 12,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    };

    const daysUntilDue = (dateStr: string) => {
        const diff = differenceInDays(new Date(dateStr), today);
        if (diff === 0) return "Vence hoje";
        if (diff < 0) return `${Math.abs(diff)} dias atras`;
        return `Vence em ${diff} dia${diff > 1 ? "s" : ""}`;
    };

    const companyName = selectedCompany?.razao_social || selectedCompany?.nome_fantasia || "Empresa";

    return (
        <AppLayout title="Dashboard">
            <div style={{ maxWidth: 1100, margin: "0 auto", fontFamily: "var(--font-base)" }}>

                {/* ── Header: Company + Period Filter ── */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                        {/* Company Selector */}
                        <button
                            onClick={() => navigate("/dashboard")}
                            style={{
                                display: "flex", alignItems: "center", gap: 6,
                                padding: "8px 16px", borderRadius: 8,
                                border: `1px solid ${C.border}`, background: C.surface,
                                fontSize: 14, fontWeight: 600, color: C.text1,
                                cursor: "pointer",
                            }}
                        >
                            {companyName}
                            <ChevronDown size={14} style={{ color: C.textMuted }} />
                        </button>

                        {/* Period Filter */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ display: "flex", gap: 0, borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border}` }}>
                                {([
                                    { key: "hoje", label: "Hoje" },
                                    { key: "mes", label: "Este mês" },
                                    { key: "trimestre", label: "Trimestre" },
                                    { key: "ano", label: "Ano" },
                                    { key: "custom", label: "Personalizado" },
                                ] as { key: Period; label: string }[]).map((p) => (
                                    <button key={p.key} onClick={() => setPeriod(p.key)} style={{
                                        padding: "8px 18px", fontSize: 13, fontWeight: period === p.key ? 700 : 400,
                                        background: period === p.key ? C.text1 : C.surface,
                                        color: period === p.key ? "#fff" : C.text2,
                                        border: "none", cursor: "pointer",
                                        borderRight: `1px solid ${C.border}`,
                                    }}>
                                        {p.key === "custom" && <Calendar size={12} style={{ marginRight: 4, verticalAlign: -1 }} />}
                                        {p.label}
                                    </button>
                                ))}
                            </div>
                            {period === "custom" && (
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                                        style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13 }} />
                                    <span style={{ fontSize: 12, color: C.textMuted }}>até</span>
                                    <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                                        style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13 }} />
                                </div>
                            )}
                        </div>
                    </div>
                    <span style={{ fontSize: 12, color: C.textMuted }}>
                        Atualizado as {format(today, "HH:mm")}
                    </span>
                </div>

                {/* ── Alert Banner ── */}
                {alertItems.length > 0 && (
                    <div style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "12px 18px", borderRadius: 10,
                        border: `1.5px solid ${C.redBg}`, background: C.redSoft,
                        marginBottom: 20,
                    }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.redBg, flexShrink: 0 }} />
                            <span style={{ fontSize: 13, color: C.red, fontWeight: 500 }}>
                                {alertItems.join("  ·  ")}
                            </span>
                        </div>
                        <button onClick={() => navigate("/contas-pagar")} style={{
                            fontSize: 13, fontWeight: 600, color: C.text1, background: "none", border: "none",
                            cursor: "pointer", display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
                        }}>
                            Ver pendentes <ArrowRight size={14} />
                        </button>
                    </div>
                )}

                {/* ── 4 KPI Cards ── */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
                    {/* Saldo em Caixa */}
                    <div style={{ background: C.darkCard, borderRadius: 12, padding: 20, color: "#fff" }}>
                        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: C.gold }}>
                            Saldo em Caixa
                        </p>
                        <p style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>{fmt(saldoCaixa)}</p>
                        <p style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>
                            {(bankAccounts || []).length} conta{(bankAccounts || []).length !== 1 ? "s" : ""} bancaria{(bankAccounts || []).length !== 1 ? "s" : ""}
                        </p>
                    </div>

                    {/* Receita do Período */}
                    <div style={{ background: C.darkCard, borderRadius: 12, padding: 20, color: "#fff" }}>
                        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: C.gold }}>
                            Receita — {periodLabel}
                        </p>
                        <p style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>{fmt(receitaPeriodo)}</p>
                        <p style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>
                            Despesas: {fmt(despesaPeriodo)}
                        </p>
                    </div>

                    {/* Resultado do Período */}
                    <div style={{ background: C.darkCard, borderRadius: 12, padding: 20, color: "#fff" }}>
                        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: C.gold }}>
                            Resultado — {periodLabel}
                        </p>
                        <p style={{ fontSize: 28, fontWeight: 800, marginTop: 6, color: resultadoPeriodo >= 0 ? "#4ade80" : "#f87171" }}>
                            {fmt(resultadoPeriodo)}
                        </p>
                        <p style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>
                            Margem {fmtPct(margemPeriodo)}
                        </p>
                        {receitaPeriodoAnterior > 0 && (
                            <span style={{
                                display: "inline-block", marginTop: 6, padding: "2px 10px",
                                borderRadius: 6, fontSize: 11, fontWeight: 600,
                                background: receitaPeriodo >= receitaPeriodoAnterior ? C.greenBadge : C.redBg,
                                color: "#fff",
                            }}>
                                {receitaPeriodo >= receitaPeriodoAnterior ? "\u25B2" : "\u25BC"} vs {prevMonthLabel}
                            </span>
                        )}
                    </div>

                    {/* A Pagar — 7 Dias */}
                    <div style={{ background: C.darkCard, borderRadius: 12, padding: 20, color: "#fff" }}>
                        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: C.gold }}>
                            A Pagar — 7 Dias
                        </p>
                        <p style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>{fmt(totalPagar7d)}</p>
                        <p style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>
                            {payables7d.length} titulo{payables7d.length !== 1 ? "s" : ""} vencendo
                        </p>
                        {vencem_hoje_pagar > 0 && (
                            <span style={{
                                display: "inline-block", marginTop: 6, padding: "2px 10px",
                                borderRadius: 6, fontSize: 11, fontWeight: 600,
                                background: C.redBg, color: "#fff",
                            }}>
                                {vencem_hoje_pagar} vence{vencem_hoje_pagar > 1 ? "m" : ""} hoje
                            </span>
                        )}
                    </div>
                </div>

                {/* ── 2 Charts ── */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                    {/* Receita x Despesa 6 meses */}
                    <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                            <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
                                Receita x Despesa — 6 Meses
                            </p>
                            <button onClick={() => navigate("/dre")} style={{
                                fontSize: 12, color: C.text2, background: "none", border: "none", cursor: "pointer",
                                display: "flex", alignItems: "center", gap: 2,
                            }}>
                                Ver DRE <ArrowRight size={12} />
                            </button>
                        </div>
                        <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={chartRevExp || []} barGap={4}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis dataKey="mes" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtFull(v)} />
                                <Bar dataKey="Receita" fill={C.text1} radius={[3, 3, 0, 0]} barSize={18} />
                                <Bar dataKey="Despesa" fill="#d1d5db" radius={[3, 3, 0, 0]} barSize={18} />
                            </BarChart>
                        </ResponsiveContainer>
                        <div style={{ display: "flex", gap: 20, marginTop: 8 }}>
                            <span style={{ fontSize: 11, color: C.text2, display: "flex", alignItems: "center", gap: 4 }}>
                                <span style={{ width: 10, height: 3, background: C.text1, borderRadius: 2, display: "inline-block" }} /> Receita
                            </span>
                            <span style={{ fontSize: 11, color: C.text2, display: "flex", alignItems: "center", gap: 4 }}>
                                <span style={{ width: 10, height: 3, background: "#d1d5db", borderRadius: 2, display: "inline-block" }} /> Despesa
                            </span>
                        </div>
                    </div>

                    {/* Fluxo de Caixa 30 dias — Dark Background */}
                    <div style={{ background: C.darkCard, borderRadius: 12, padding: 20, color: "#fff" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                            <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "#fff" }}>
                                Fluxo de Caixa — 30 Dias
                            </p>
                            <button onClick={() => navigate("/fluxo-caixa-projetado")} style={{
                                fontSize: 12, color: C.textMuted, background: "none", border: "none", cursor: "pointer",
                                display: "flex", alignItems: "center", gap: 2,
                            }}>
                                Ver completo <ArrowRight size={12} />
                            </button>
                        </div>
                        <ResponsiveContainer width="100%" height={160}>
                            <AreaChart data={chartCashflow?.days || []}>
                                <defs>
                                    <linearGradient id="cfGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={C.gold} stopOpacity={0.4} />
                                        <stop offset="100%" stopColor={C.gold} stopOpacity={0.05} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="dia" tick={{ fontSize: 10, fill: C.textMuted }} axisLine={false} tickLine={false} interval={6} />
                                <YAxis tick={{ fontSize: 10, fill: C.textMuted }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtFull(v)} />
                                <Area type="monotone" dataKey="saldo" stroke={C.gold} fill="url(#cfGrad)" strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>

                        {chartCashflow?.negativeDay && (
                            <div style={{
                                display: "flex", alignItems: "center", gap: 6, marginTop: 10,
                                padding: "6px 12px", borderRadius: 6,
                                background: C.goldBg, border: `1px solid ${C.goldBorder}`,
                                fontSize: 12, color: "#92400e",
                            }}>
                                <AlertTriangle size={14} />
                                Projecao indica possivel saldo negativo em {chartCashflow.negativeDay.dia}
                            </div>
                        )}

                        <div style={{ display: "flex", gap: 24, marginTop: 10, fontSize: 12, color: C.textMuted }}>
                            <span>Projetado: <strong style={{ color: "#fff" }}>{fmt(chartCashflow?.projected || 0)}</strong></span>
                            <span>Entradas: <strong style={{ color: "#fff" }}>{fmt(chartCashflow?.totalIn || 0)}</strong></span>
                        </div>
                        <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>
                            Saidas: <strong style={{ color: "#fff" }}>{fmt(chartCashflow?.totalOut || 0)}</strong>
                        </div>
                    </div>
                </div>

                {/* ── 2 Detail Cards ── */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

                    {/* A Pagar — Proximos 7 Dias */}
                    <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                            <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
                                A Pagar — Proximos 7 Dias
                            </p>
                            <button onClick={() => navigate("/contas-pagar")} style={{
                                fontSize: 12, color: C.text2, background: "none", border: "none", cursor: "pointer",
                                display: "flex", alignItems: "center", gap: 2,
                            }}>
                                Ver todos <ArrowRight size={12} />
                            </button>
                        </div>

                        {payables7d.length === 0 ? (
                            <p style={{ fontSize: 13, color: C.textMuted, textAlign: "center", padding: "24px 0" }}>
                                Nenhuma conta a pagar nos proximos 7 dias.
                            </p>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                {payables7d.slice(0, 6).map((p: any) => {
                                    const saldo = Number(p.valor || 0) - Number(p.valor_pago || 0);
                                    const isToday = p.data_vencimento === todayStr;
                                    return (
                                        <div key={p.id} style={{
                                            display: "flex", justifyContent: "space-between", alignItems: "center",
                                            padding: "10px 14px", borderRadius: 8,
                                            borderLeft: `3px solid ${isToday ? C.red : C.gold}`,
                                            background: isToday ? C.redSoft : "#fafafa",
                                        }}>
                                            <div>
                                                <p style={{ fontSize: 13, fontWeight: 600, color: C.text1 }}>{p.credor_nome}</p>
                                                <p style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                                                    {daysUntilDue(p.data_vencimento)}
                                                </p>
                                            </div>
                                            <p style={{ fontSize: 14, fontWeight: 700, color: C.text1 }}>{fmt(saldo)}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Contas a Receber — Em Aberto */}
                    <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                            <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
                                Contas a Receber — Em Aberto
                            </p>
                            <button onClick={() => navigate("/contas-receber")} style={{
                                fontSize: 12, color: C.text2, background: "none", border: "none", cursor: "pointer",
                                display: "flex", alignItems: "center", gap: 2,
                            }}>
                                Ver todos <ArrowRight size={12} />
                            </button>
                        </div>

                        {/* Aging Buckets */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
                            <div style={{ padding: "10px 12px", borderRadius: 8, background: "#16a34a", color: "#fff", textAlign: "center" }}>
                                <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>Ate 30 dias</p>
                                <p style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>{fmt(receivablesAging.buckets.ate30.total)}</p>
                                <p style={{ fontSize: 11, opacity: 0.8 }}>{receivablesAging.buckets.ate30.count} titulo{receivablesAging.buckets.ate30.count !== 1 ? "s" : ""}</p>
                            </div>
                            <div style={{ padding: "10px 12px", borderRadius: 8, background: "#ca8a04", color: "#fff", textAlign: "center" }}>
                                <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>31 a 60 dias</p>
                                <p style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>{fmt(receivablesAging.buckets.de31a60.total)}</p>
                                <p style={{ fontSize: 11, opacity: 0.8 }}>{receivablesAging.buckets.de31a60.count} titulo{receivablesAging.buckets.de31a60.count !== 1 ? "s" : ""}</p>
                            </div>
                            <div style={{ padding: "10px 12px", borderRadius: 8, background: C.redBg, color: "#fff", textAlign: "center" }}>
                                <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>Acima de 60 dias</p>
                                <p style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>{fmt(receivablesAging.buckets.acima60.total)}</p>
                                <p style={{ fontSize: 11, opacity: 0.8 }}>{receivablesAging.buckets.acima60.count} titulo{receivablesAging.buckets.acima60.count !== 1 ? "s" : ""}</p>
                            </div>
                        </div>

                        {/* Total */}
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600, color: C.text1, marginBottom: 12 }}>
                            <span>Total em aberto</span>
                            <span>{fmt(receivablesAging.totalAberto)} · {receivablesAging.totalCount} titulo{receivablesAging.totalCount !== 1 ? "s" : ""}</span>
                        </div>

                        {/* Overdue List */}
                        {receivablesAging.overdue.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
                                {receivablesAging.overdue.map((r: any) => (
                                    <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <div>
                                            <span style={{ fontSize: 13, fontWeight: 500, color: C.text1 }}>{r.pagador_nome}</span>
                                            <span style={{
                                                display: "inline-block", marginLeft: 8, padding: "1px 8px",
                                                borderRadius: 4, fontSize: 10, fontWeight: 600,
                                                border: `1px solid ${C.border}`, color: C.text2,
                                            }}>
                                                {r.diasAtraso} dias
                                            </span>
                                            <p style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>
                                                Venceu em {format(new Date(r.data_vencimento), "dd/MM/yyyy")}
                                            </p>
                                        </div>
                                        <p style={{ fontSize: 14, fontWeight: 700, color: C.red }}>{fmt(r.saldo)}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
