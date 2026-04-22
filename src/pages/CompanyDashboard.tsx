import { useMemo, useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ComposedChart, Area, Line, Cell, ReferenceLine, LabelList,
    PieChart, Pie,
} from "recharts";
import { AlertTriangle, ArrowRight, ChevronDown, Calendar } from "lucide-react";
import {
    startOfMonth, endOfMonth, startOfYear, endOfYear, startOfWeek, endOfWeek,
    subMonths, subWeeks, subDays, addDays, format, differenceInDays,
} from "date-fns";
import { ptBR } from "date-fns/locale";

/* ── Design Tokens — alinhado ao Design System v1 ──────────── */
const C = {
    darkCard: "#1D2939",     // text-1 (neutro escuro, substitui navy)
    gold: "#059669",          // brand-mid (substitui ouro)
    goldBg: "#ECFDF4",        // brand-soft
    goldBorder: "#BFDBFE",    // brand border claro
    green: "#039855",         // success
    greenSoft: "#ECFDF3",     // success-bg
    greenBadge: "#039855",
    red: "#D92D20",           // error
    redSoft: "#FEF3F2",       // error-bg
    redBg: "#D92D20",
    text1: "#1D2939",
    text2: "#667085",
    textMuted: "#98A2B3",
    border: "#EAECF0",
    surface: "#FFFFFF",
} as const;

const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const fmtInt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
const fmtFull = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const fmtPct = (v: number) => `${v.toFixed(1)}%`;
const fmtShort = (v: number) => {
    if (!v || v === 0) return "";
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
};

/* ── Period Type ────────────────────────────────────────────── */
type Period = "hoje" | "mes" | "trimestre" | "mes_especifico" | "custom";

/* ── Main Component ─────────────────────────────────────────── */
export default function CompanyDashboard() {
    const { id: companyId } = useParams<{ id: string }>();
    const { selectedCompany } = useCompany();
    const { activeClient } = useAuth();
    const navigate = useNavigate();
    const db = activeClient as any;
    const cId = selectedCompany?.id || companyId;

    // Sincroniza URL quando o usuário troca de empresa no seletor do topo
    useEffect(() => {
        if (selectedCompany?.id && companyId && selectedCompany.id !== companyId) {
            navigate(`/dashboard/${selectedCompany.id}`, { replace: true });
        }
    }, [selectedCompany?.id, companyId, navigate]);

    const [period, setPeriod] = useState<Period>("mes");
    const [customStart, setCustomStart] = useState("");
    const [customEnd, setCustomEnd] = useState("");
    const [specificMonth, setSpecificMonth] = useState(() => new Date().getMonth());
    const [specificYear, setSpecificYear] = useState(() => new Date().getFullYear());
    const [periodMenuOpen, setPeriodMenuOpen] = useState(false);
    const periodMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!periodMenuOpen) return;
        const handler = (e: MouseEvent) => {
            if (periodMenuRef.current && !periodMenuRef.current.contains(e.target as Node)) {
                setPeriodMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [periodMenuOpen]);

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
            case "mes_especifico": {
                const d = new Date(specificYear, specificMonth, 1);
                return {
                    periodStart: format(startOfMonth(d), "yyyy-MM-dd"),
                    periodEnd: format(endOfMonth(d), "yyyy-MM-dd"),
                    periodLabel: format(d, "MMMM 'de' yyyy", { locale: ptBR }).replace(/^./, c => c.toUpperCase()),
                };
            }
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
    }, [period, today, todayStr, customStart, customEnd, specificMonth, specificYear]);

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

    // ─── Receita do período (fonte: tabela vendas) ─────────
    const { data: receitaPeriodo = 0 } = useQuery({
        queryKey: ["dash_receita_periodo", cId, periodStart, periodEnd],
        queryFn: async () => {
            const { data } = await db.from("vendas")
                .select("valor_total")
                .eq("company_id", cId)
                .in("status", ["confirmado"])
                .gte("data_venda", periodStart)
                .lte("data_venda", periodEnd)
                .limit(5000);
            return (data || []).reduce((s: number, r: any) => s + Number(r.valor_total || 0), 0);
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

    // ─── IDs das contas contábeis de CUSTO (name ILIKE %custo%) ─
    const { data: costAccountIds = [] } = useQuery({
        queryKey: ["dash_cost_ids", cId],
        queryFn: async () => {
            const { data } = await db.from("chart_of_accounts")
                .select("id, name")
                .eq("company_id", cId)
                .ilike("name", "%custo%");
            return (data || []).map((a: any) => a.id);
        },
        enabled: !!cId,
    });
    const isCost = (r: any) => r.conta_contabil_id && costAccountIds.includes(r.conta_contabil_id);

    // ─── Custos do período (contas_pagar pagas em contas "custo") ─
    const { data: custoPeriodo = 0 } = useQuery({
        queryKey: ["dash_custo_periodo", cId, periodStart, periodEnd, costAccountIds, transferAccountIds],
        queryFn: async () => {
            const { data } = await db.from("contas_pagar")
                .select("valor_pago, conta_contabil_id")
                .eq("company_id", cId).eq("status", "pago")
                .is("deleted_at", null)
                .gte("data_pagamento", periodStart).lte("data_pagamento", periodEnd)
                .limit(5000);
            return (data || [])
                .filter((r: any) => !isTransfer(r) && isCost(r))
                .reduce((s: number, r: any) => s + Number(r.valor_pago || 0), 0);
        },
        enabled: !!cId,
    });

    // despesaPeriodo já vem do bloco acima — subtrai o custo pra separar
    const despesaLiq = Math.max(0, despesaPeriodo - custoPeriodo);
    const resultadoPeriodo = receitaPeriodo - despesaPeriodo;
    const margemPeriodo = receitaPeriodo > 0 ? (resultadoPeriodo / receitaPeriodo) * 100 : 0;

    // ─── Previous period receita (para comparação) ─────────
    const prevMonthStart = format(startOfMonth(subMonths(today, 1)), "yyyy-MM-dd");
    const prevMonthEnd = format(endOfMonth(subMonths(today, 1)), "yyyy-MM-dd");
    const prevMonthLabel = format(subMonths(today, 1), "MMMM", { locale: ptBR });

    const { data: receitaPeriodoAnterior = 0 } = useQuery({
        queryKey: ["dash_receita_prev", cId, prevMonthStart],
        queryFn: async () => {
            const { data } = await db.from("vendas")
                .select("valor_total")
                .eq("company_id", cId)
                .in("status", ["confirmado"])
                .gte("data_venda", prevMonthStart)
                .lte("data_venda", prevMonthEnd)
                .limit(5000);
            return (data || []).reduce((s: number, r: any) => s + Number(r.valor_total || 0), 0);
        },
        enabled: !!cId,
    });

    // ─── Payables / Receivables filtrados pelo período principal ─
    const payables7d = useMemo(() =>
        payablesFiltered
            .filter((p: any) => p.data_vencimento >= periodStart && p.data_vencimento <= periodEnd)
            .sort((a: any, b: any) => a.data_vencimento.localeCompare(b.data_vencimento)),
        [payablesFiltered, periodStart, periodEnd]
    );
    const totalPagar7d = payables7d.reduce((s: number, p: any) => s + Number(p.valor || 0) - Number(p.valor_pago || 0), 0);
    const vencem_hoje_pagar = payables7d.filter((p: any) => p.data_vencimento === todayStr).length;

    const receivablesInPeriod = useMemo(() =>
        receivablesFiltered.filter((r: any) => r.data_vencimento >= periodStart && r.data_vencimento <= periodEnd),
        [receivablesFiltered, periodStart, periodEnd]
    );

    // ─── Receivables aging ──────────────────────────────────
    const receivablesAging = useMemo(() => {
        const buckets = { ate30: { total: 0, count: 0 }, de31a60: { total: 0, count: 0 }, acima60: { total: 0, count: 0 } };
        const overdue: any[] = [];
        let totalAberto = 0;
        let totalCount = 0;

        receivablesInPeriod.forEach((r: any) => {
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
    }, [receivablesInPeriod, today]);

    // ─── CR Buckets (mockup: em dia / a vencer em breve / acima de 90 dias) ─
    const crBuckets = useMemo(() => {
        const today30 = addDays(today, 30);
        const past90 = subDays(today, 90);
        const emDia = { total: 0, count: 0 };
        const aVencerBreve = { total: 0, count: 0 };
        const acima90 = { total: 0, count: 0 };
        receivablesInPeriod.forEach((r: any) => {
            const saldo = Number(r.valor || 0) - Number(r.valor_pago || 0);
            if (saldo <= 0) return;
            const venc = new Date(r.data_vencimento);
            if (venc > today30) { emDia.total += saldo; emDia.count++; }
            else if (venc >= today) { aVencerBreve.total += saldo; aVencerBreve.count++; }
            else if (venc < past90) { acima90.total += saldo; acima90.count++; }
        });
        return { emDia, aVencerBreve, acima90 };
    }, [receivablesInPeriod, today]);

    // ─── Trends vs período anterior ────────────────────────
    const trendFat = receitaPeriodoAnterior > 0
        ? ((receitaPeriodo - receitaPeriodoAnterior) / receitaPeriodoAnterior) * 100
        : 0;

    // ─── Alert banner ───────────────────────────────────────
    const alertItems: string[] = [];
    if (vencem_hoje_pagar > 0) alertItems.push(`${vencem_hoje_pagar} conta${vencem_hoje_pagar > 1 ? "s" : ""} a pagar vence${vencem_hoje_pagar > 1 ? "m" : ""} hoje`);
    if (receivablesAging.overdue.length > 0) alertItems.push(`${receivablesAging.overdue.length} titulo${receivablesAging.overdue.length > 1 ? "s" : ""} a receber com mais de 60 dias em atraso`);

    // ─── Faturamento por período (granularidade dinâmica) ──
    const periodDays = differenceInDays(new Date(periodEnd + "T00:00:00"), new Date(periodStart + "T00:00:00")) + 1;
    const chartGranularity: "day" | "week" | "month" = periodDays <= 45 ? "day" : periodDays <= 180 ? "week" : "month";

    const { data: chartRevExp } = useQuery({
        queryKey: ["dash_rev_exp", cId, periodStart, periodEnd, chartGranularity],
        queryFn: async () => {
            const buckets: { start: Date; end: Date; label: string }[] = [];
            const ps = new Date(periodStart + "T00:00:00");
            const pe = new Date(periodEnd + "T00:00:00");

            if (chartGranularity === "day") {
                for (let i = 0; i < periodDays; i++) {
                    const d = addDays(ps, i);
                    buckets.push({ start: d, end: d, label: format(d, "dd") });
                }
            } else if (chartGranularity === "week") {
                let d = startOfWeek(ps, { weekStartsOn: 1 });
                while (d <= pe) {
                    const weekEnd = endOfWeek(d, { weekStartsOn: 1 });
                    buckets.push({
                        start: d < ps ? ps : d,
                        end: weekEnd > pe ? pe : weekEnd,
                        label: format(d, "dd/MM"),
                    });
                    d = addDays(weekEnd, 1);
                }
            } else {
                let d = startOfMonth(ps);
                while (d <= pe) {
                    const mEnd = endOfMonth(d);
                    buckets.push({
                        start: d < ps ? ps : d,
                        end: mEnd > pe ? pe : mEnd,
                        label: format(d, "MMM/yy", { locale: ptBR }).replace(".", ""),
                    });
                    d = addDays(mEnd, 1);
                }
            }

            const rows: any[] = [];
            for (const b of buckets) {
                const ms = format(b.start, "yyyy-MM-dd");
                const me = format(b.end, "yyyy-MM-dd");

                const [{ data: rec }, { data: desp }] = await Promise.all([
                    db.from("vendas")
                        .select("valor_total")
                        .eq("company_id", cId)
                        .in("status", ["confirmado"])
                        .gte("data_venda", ms).lte("data_venda", me)
                        .limit(5000),
                    db.from("contas_pagar")
                        .select("valor_pago, conta_contabil_id")
                        .eq("company_id", cId).eq("status", "pago")
                        .is("deleted_at", null)
                        .gte("data_pagamento", ms).lte("data_pagamento", me)
                        .limit(5000),
                ]);

                const receita = (rec || [])
                    .reduce((s: number, r: any) => s + Number(r.valor_total || 0), 0);
                const despesa = (desp || [])
                    .filter((r: any) => !isTransfer(r))
                    .reduce((s: number, r: any) => s + Number(r.valor_pago || 0), 0);

                rows.push({
                    label: b.label,
                    Receita: receita,
                    Despesa: despesa,
                    Resultado: receita - despesa,
                });
            }
            return rows;
        },
        enabled: !!cId,
    });

    // ─── Principais destinos dos gastos (categorias de CP pagas) ─
    const { data: gastosCategorias = [] } = useQuery({
        queryKey: ["dash_gastos_categorias", cId, periodStart, periodEnd, transferAccountIds],
        queryFn: async () => {
            const [accRes, cpRes] = await Promise.all([
                db.from("chart_of_accounts").select("id, name").eq("company_id", cId),
                db.from("contas_pagar")
                    .select("valor_pago, conta_contabil_id")
                    .eq("company_id", cId).eq("status", "pago")
                    .is("deleted_at", null)
                    .gte("data_pagamento", periodStart).lte("data_pagamento", periodEnd)
                    .limit(10000),
            ]);
            const accMap: Record<string, string> = {};
            (accRes.data || []).forEach((a: any) => { accMap[a.id] = a.name; });

            const byCat: Record<string, number> = {};
            (cpRes.data || []).forEach((r: any) => {
                if (isTransfer(r)) return;
                const name = r.conta_contabil_id ? (accMap[r.conta_contabil_id] || "Sem categoria") : "Sem categoria";
                byCat[name] = (byCat[name] || 0) + Number(r.valor_pago || 0);
            });

            const sorted = Object.entries(byCat)
                .map(([name, total]) => ({ name, total }))
                .filter(r => r.total > 0)
                .sort((a, b) => b.total - a.total);
            const top = sorted.slice(0, 8);
            const rest = sorted.slice(8);
            const outros = rest.reduce((s, r) => s + r.total, 0);
            if (outros > 0) top.push({ name: "Outros", total: outros });
            return top;
        },
        enabled: !!cId,
    });

    // ─── Despesas diárias pelo período selecionado ──────────
    const { data: chartDespDiarias } = useQuery({
        queryKey: ["dash_desp_diarias", cId, periodStart, periodEnd, transferAccountIds, costAccountIds],
        queryFn: async () => {
            const { data } = await db.from("contas_pagar")
                .select("valor_pago, data_pagamento, conta_contabil_id")
                .eq("company_id", cId).eq("status", "pago")
                .is("deleted_at", null)
                .gte("data_pagamento", periodStart).lte("data_pagamento", periodEnd)
                .limit(10000);
            const byDay: Record<string, number> = {};
            (data || []).forEach((r: any) => {
                if (isTransfer(r)) return;
                const d = r.data_pagamento;
                byDay[d] = (byDay[d] || 0) + Number(r.valor_pago || 0);
            });
            const ps = new Date(periodStart + "T00:00:00");
            const pe = new Date(periodEnd + "T00:00:00");
            const dayCount = differenceInDays(pe, ps) + 1;
            const rows: any[] = [];
            for (let i = 0; i < dayCount; i++) {
                const d = addDays(ps, i);
                const ds = format(d, "yyyy-MM-dd");
                rows.push({ label: format(d, "dd"), despesa: byDay[ds] || 0 });
            }
            return rows;
        },
        enabled: !!cId,
    });

    // ─── Fluxo de Caixa pelo período selecionado ────────────
    const { data: chartCashflow } = useQuery({
        queryKey: ["dash_cashflow", cId, saldoCaixa, periodStart, periodEnd, receivablesFiltered?.length, payablesFiltered?.length],
        queryFn: async () => {
            const days: any[] = [];
            let balance = saldoCaixa || 0;
            let totalIn = 0, totalOut = 0;
            const ps = new Date(periodStart + "T00:00:00");
            const dayCount = differenceInDays(new Date(periodEnd + "T00:00:00"), ps) + 1;

            for (let i = 0; i < dayCount; i++) {
                const d = addDays(ps, i);
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
                    entradas: recDay,
                    saidas: -payDay,
                    saldo: balance,
                });
            }

            // ─── Linha de tendência (regressão linear) ─────
            const n = days.length;
            const sumX = days.reduce((s, _, i) => s + i, 0);
            const sumY = days.reduce((s, d) => s + d.saldo, 0);
            const sumXY = days.reduce((s, d, i) => s + i * d.saldo, 0);
            const sumX2 = days.reduce((s, _, i) => s + i * i, 0);
            const denom = n * sumX2 - sumX * sumX;
            const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
            const intercept = (sumY - slope * sumX) / n;
            days.forEach((d, i) => { d.tendencia = Math.round(slope * i + intercept); });

            const negativeDay = days.find((d) => d.saldo < 0);
            return { days, totalIn, totalOut, projected: balance, negativeDay, slope };
        },
        enabled: !!cId && saldoCaixa !== undefined,
    });

    // ─── Faturamento diário (heatmap do período selecionado) ───────────
    const { data: monthlySales } = useQuery({
        queryKey: ["dash_monthly_sales", cId, periodStart, periodEnd],
        queryFn: async () => {
            const { data } = await db.from("vendas")
                .select("id, valor_total, data_venda, vendas_itens(descricao, quantidade, valor_total)")
                .eq("company_id", cId)
                .in("status", ["confirmado"])
                .gte("data_venda", periodStart).lte("data_venda", periodEnd)
                .limit(10000);

            const byDay: Record<string, number> = {};
            let totalVendas = 0;
            let totalProdutos = 0;
            let totalFaturamento = 0;
            const productMap: Record<string, { descricao: string; quantidade: number; faturamento: number; vendas: Set<string> }> = {};

            (data || []).forEach((r: any) => {
                const d = r.data_venda;
                byDay[d] = (byDay[d] || 0) + Number(r.valor_total || 0);
                totalVendas += 1;
                totalFaturamento += Number(r.valor_total || 0);
                const itens = Array.isArray(r.vendas_itens) ? r.vendas_itens : [];
                itens.forEach((it: any) => {
                    const desc = (it.descricao || "Sem descrição").trim();
                    totalProdutos += Number(it.quantidade || 0);
                    if (!productMap[desc]) productMap[desc] = { descricao: desc, quantidade: 0, faturamento: 0, vendas: new Set() };
                    productMap[desc].quantidade += Number(it.quantidade || 0);
                    productMap[desc].faturamento += Number(it.valor_total || 0);
                    productMap[desc].vendas.add(r.id);
                });
            });

            const totalItensFaturamento = Object.values(productMap).reduce((s, p) => s + p.faturamento, 0);
            const denominator = totalFaturamento > 0 ? totalFaturamento : totalItensFaturamento;
            const semProdutoFaturamento = Math.max(0, totalFaturamento - totalItensFaturamento);

            const productBreakdown: {
                descricao: string; quantidade: number; faturamento: number; vendas: number; percentual: number; semProduto: boolean;
            }[] = Object.values(productMap)
                .map(p => ({
                    descricao: p.descricao,
                    quantidade: p.quantidade,
                    faturamento: p.faturamento,
                    vendas: p.vendas.size,
                    percentual: denominator > 0 ? (p.faturamento / denominator) * 100 : 0,
                    semProduto: false,
                }))
                .sort((a, b) => b.faturamento - a.faturamento);

            if (semProdutoFaturamento > 0.005) {
                productBreakdown.push({
                    descricao: "Sem produto cadastrado",
                    quantidade: 0,
                    faturamento: semProdutoFaturamento,
                    vendas: 0,
                    percentual: denominator > 0 ? (semProdutoFaturamento / denominator) * 100 : 0,
                    semProduto: true,
                });
            }

            return { byDay, totalVendas, totalProdutos, totalFaturamento, productBreakdown };
        },
        enabled: !!cId,
    });
    const dailyRevenue = monthlySales?.byDay;

    const heatmap = useMemo(() => {
        const rangeStart = new Date(periodStart + "T00:00:00");
        const rangeEnd = new Date(periodEnd + "T00:00:00");
        const days: { date: Date; dateStr: string; value: number }[] = [];
        let d = rangeStart;
        while (d <= rangeEnd) {
            const dateStr = format(d, "yyyy-MM-dd");
            days.push({ date: new Date(d), dateStr, value: dailyRevenue?.[dateStr] || 0 });
            d = addDays(d, 1);
        }
        const vals = days.map(x => x.value).filter(v => v > 0);
        const max = vals.length ? Math.max(...vals) : 0;
        const total = days.reduce((s, x) => s + x.value, 0);
        const daysWithSales = vals.length;
        const avg = daysWithSales > 0 ? total / daysWithSales : 0;
        const bestDay = days.reduce((b, x) => (x.value > (b?.value || 0) ? x : b), days[0]);

        // Organize em colunas por semana (0=Dom ... 6=Sáb)
        const weeks: (typeof days[number] | null)[][] = [];
        let col: (typeof days[number] | null)[] = Array(7).fill(null);
        days.forEach((day, idx) => {
            const dow = day.date.getDay();
            col[dow] = day;
            if (dow === 6 || idx === days.length - 1) {
                weeks.push(col);
                col = Array(7).fill(null);
            }
        });

        // Month labels: para cada coluna de semana, identificar se é o início de um novo mês
        const monthLabels: { weekIndex: number; label: string }[] = [];
        let lastMonth = -1;
        weeks.forEach((week, i) => {
            const firstDay = week.find((x): x is typeof days[number] => x !== null);
            if (!firstDay) return;
            const m = firstDay.date.getMonth();
            if (m !== lastMonth) {
                monthLabels.push({
                    weekIndex: i,
                    label: format(firstDay.date, "MMM", { locale: ptBR }).replace(".", "").replace(/^./, c => c.toUpperCase()),
                });
                lastMonth = m;
            }
        });

        // Faturamento e média diária por semana
        const weeklyAverages = weeks.map((week, i) => {
            const daysInWeek = week.filter((x): x is typeof days[number] => x !== null);
            const weekTotal = daysInWeek.reduce((s, x) => s + x.value, 0);
            const avg = daysInWeek.length > 0 ? weekTotal / daysInWeek.length : 0;
            return { label: `S${i + 1}`, avg, total: weekTotal };
        });

        return { days, weeks, max, total, daysWithSales, avg, bestDay, weeklyAverages, monthLabels };
    }, [dailyRevenue, periodStart, periodEnd]);

    const heatmapColor = (value: number, max: number) => {
        if (value === 0 || max === 0) return "#F3F4F6";
        const r = value / max;
        if (r < 0.25) return "#BBF7D0";
        if (r < 0.5) return "#86EFAC";
        if (r < 0.75) return "#4ADE80";
        return "#16A34A";
    };

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
            <div style={{ width: "100%", fontFamily: "var(--font-base)" }}>
                {/* ── Header: Company Name + Period Filter (mesmo nivel) ── */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 16 }}>
                    <div>
                        <button
                            onClick={() => navigate("/dashboard")}
                            style={{
                                display: "flex", alignItems: "center", gap: 10,
                                padding: 0, marginBottom: 4,
                                border: "none", background: "transparent",
                                fontSize: 28, fontWeight: 500, color: C.text1,
                                letterSpacing: "-0.02em", lineHeight: 1.1,
                                cursor: "pointer",
                            }}
                            title="Trocar empresa"
                        >
                            {companyName}
                        </button>
                        <p style={{ fontSize: 13, color: C.text2, margin: 0, fontWeight: 500 }}>
                            Análise ref. {format(new Date(periodStart + "T00:00:00"), "dd 'de' MMMM", { locale: ptBR })}
                            {" "}até{" "}
                            {format(new Date(periodEnd + "T00:00:00"), "dd 'de' MMMM, yyyy", { locale: ptBR })}
                        </p>
                        <p style={{ fontSize: 11.5, color: C.textMuted, margin: "4px 0 0" }}>
                            Atualizado as {format(today, "HH:mm")}
                        </p>
                    </div>

                    {/* Period Filter (ao lado do título) */}
                    <div ref={periodMenuRef} style={{ position: "relative", flexShrink: 0 }}>
                        <button
                            onClick={() => setPeriodMenuOpen((o) => !o)}
                            style={{
                                display: "flex", alignItems: "center", gap: 8,
                                padding: "8px 14px", borderRadius: 8,
                                border: `1px solid ${C.border}`, background: C.surface,
                                fontSize: 13, fontWeight: 600, color: C.text1,
                                cursor: "pointer",
                            }}
                        >
                            <Calendar size={14} style={{ color: C.textMuted }} />
                            {periodLabel}
                            {period === "custom" && customStart && customEnd && (
                                <span style={{ color: C.textMuted, fontWeight: 400 }}>
                                    · {format(new Date(customStart), "dd/MM")}–{format(new Date(customEnd), "dd/MM")}
                                </span>
                            )}
                            <ChevronDown size={14} style={{ color: C.textMuted, transform: periodMenuOpen ? "rotate(180deg)" : undefined, transition: "transform .15s" }} />
                        </button>

                        {periodMenuOpen && (
                            <div style={{
                                position: "absolute", top: "calc(100% + 6px)", right: 0,
                                background: C.surface, borderRadius: 10,
                                border: `1px solid ${C.border}`,
                                boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
                                padding: 6, minWidth: 200, zIndex: 20,
                            }}>
                                {([
                                    { key: "hoje", label: "Hoje" },
                                    { key: "mes", label: "Este mês" },
                                    { key: "trimestre", label: "Trimestre" },
                                    { key: "mes_especifico", label: "Mês" },
                                    { key: "custom", label: "Personalizado" },
                                ] as { key: Period; label: string }[]).map((p) => (
                                    <button
                                        key={p.key}
                                        onClick={() => {
                                            setPeriod(p.key);
                                            if (p.key !== "custom" && p.key !== "mes_especifico") setPeriodMenuOpen(false);
                                        }}
                                        style={{
                                            display: "flex", alignItems: "center", gap: 8, width: "100%",
                                            padding: "8px 12px", borderRadius: 6,
                                            background: period === p.key ? C.goldBg : "transparent",
                                            color: period === p.key ? "#059669" : C.text1,
                                            fontSize: 13, fontWeight: period === p.key ? 600 : 500,
                                            border: "none", cursor: "pointer", textAlign: "left",
                                        }}
                                    >
                                        {p.key === "custom" && <Calendar size={12} />}
                                        {p.label}
                                    </button>
                                ))}
                                {period === "mes_especifico" && (
                                    <div style={{ padding: "8px 8px 4px", borderTop: `1px solid ${C.border}`, marginTop: 6 }}>
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, padding: "0 4px" }}>
                                            <button
                                                onClick={() => setSpecificYear(y => y - 1)}
                                                style={{ padding: "2px 8px", fontSize: 13, border: "none", background: "transparent", color: C.text2, cursor: "pointer", borderRadius: 4 }}
                                            >‹</button>
                                            <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text1 }}>{specificYear}</span>
                                            <button
                                                onClick={() => setSpecificYear(y => y + 1)}
                                                style={{ padding: "2px 8px", fontSize: 13, border: "none", background: "transparent", color: C.text2, cursor: "pointer", borderRadius: 4 }}
                                            >›</button>
                                        </div>
                                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
                                            {["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"].map((m, i) => (
                                                <button
                                                    key={m}
                                                    onClick={() => {
                                                        setSpecificMonth(i);
                                                        setPeriodMenuOpen(false);
                                                    }}
                                                    style={{
                                                        padding: "6px 4px", fontSize: 12, borderRadius: 6,
                                                        border: "none", cursor: "pointer",
                                                        background: specificMonth === i ? C.goldBg : "transparent",
                                                        color: specificMonth === i ? "#059669" : C.text1,
                                                        fontWeight: specificMonth === i ? 600 : 500,
                                                    }}
                                                >
                                                    {m}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {period === "custom" && (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 8px 4px", borderTop: `1px solid ${C.border}`, marginTop: 6 }}>
                                        <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                                            style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13 }} />
                                        <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                                            style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13 }} />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
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

                {/* ── 4 KPI Cards (mockup v1) ── */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14, marginBottom: 16 }}>
                    {/* 1. Faturamento */}
                    <div className="kpi-card" style={{ background: C.surface, borderRadius: 12, padding: 20, border: `1px solid ${C.border}`, boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)", display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: C.text1, textTransform: "uppercase", letterSpacing: 0.6, whiteSpace: "nowrap" }}>Faturamento</div>
                            {receitaPeriodoAnterior > 0 && (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 600, padding: "3px 8px", borderRadius: 20, background: trendFat >= 0 ? "#ECFDF3" : "#FEF3F2", color: trendFat >= 0 ? "#039855" : "#D92D20", flexShrink: 0 }}>
                                    {trendFat >= 0 ? "▲" : "▼"} {Math.abs(trendFat).toFixed(1)}%
                                </span>
                            )}
                        </div>
                        <div style={{ fontSize: "clamp(18px, 1.8vw, 26px)", fontWeight: 800, color: C.gold, lineHeight: 1.1, marginBottom: 5, letterSpacing: "-0.5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fmt(receitaPeriodo)}</div>
                        <div style={{ fontSize: 12, color: C.textMuted }}>
                            {receitaPeriodoAnterior > 0 ? `${fmt(receitaPeriodoAnterior)} mês anterior` : `em ${periodLabel.toLowerCase()}`}
                        </div>
                    </div>

                    {/* 2. Custos Diretos */}
                    <div className="kpi-card" style={{ background: C.surface, borderRadius: 12, padding: 20, border: `1px solid ${C.border}`, boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)", display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: C.text1, textTransform: "uppercase", letterSpacing: 0.6, whiteSpace: "nowrap" }}>Custos Diretos</div>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 600, padding: "3px 8px", borderRadius: 20, background: C.border, color: C.text2, flexShrink: 0 }}>
                                {receitaPeriodo > 0 ? `${((custoPeriodo / receitaPeriodo) * 100).toFixed(2)}%` : "—"}
                            </span>
                        </div>
                        <div style={{ fontSize: "clamp(18px, 1.8vw, 26px)", fontWeight: 800, color: "#7F1D1D", lineHeight: 1.1, marginBottom: 5, letterSpacing: "-0.5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fmt(custoPeriodo)}</div>
                        <div style={{ fontSize: 12, color: C.textMuted }}>
                            {receitaPeriodo > 0 ? `${((custoPeriodo / receitaPeriodo) * 100).toFixed(2)}% do faturamento` : "—"}
                        </div>
                    </div>

                    {/* 3. Despesas */}
                    <div className="kpi-card" style={{ background: C.surface, borderRadius: 12, padding: 20, border: `1px solid ${C.border}`, boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)", display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: C.text1, textTransform: "uppercase", letterSpacing: 0.6, whiteSpace: "nowrap" }}>Despesas</div>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 600, padding: "3px 8px", borderRadius: 20, background: "#FEF3F2", color: "#D92D20", flexShrink: 0 }}>
                                ▼ {receitaPeriodo > 0 ? `${((despesaLiq / receitaPeriodo) * 100).toFixed(1)}%` : "—"}
                            </span>
                        </div>
                        <div style={{ fontSize: "clamp(18px, 1.8vw, 26px)", fontWeight: 800, color: "#7F1D1D", lineHeight: 1.1, marginBottom: 5, letterSpacing: "-0.5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fmt(despesaLiq)}</div>
                        <div style={{ fontSize: 12, color: C.textMuted }}>
                            {receitaPeriodo > 0 ? `${((despesaLiq / receitaPeriodo) * 100).toFixed(1)}% do faturamento` : "—"}
                        </div>
                    </div>

                    {/* 4. Resultado Líquido */}
                    <div className="kpi-card" style={{ background: C.surface, borderRadius: 12, padding: 20, border: `1px solid ${C.border}`, boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)", display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: C.text1, textTransform: "uppercase", letterSpacing: 0.6, whiteSpace: "nowrap" }}>Resultado Líquido</div>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 600, padding: "3px 8px", borderRadius: 20, background: resultadoPeriodo >= 0 ? "#ECFDF3" : "#FEF3F2", color: resultadoPeriodo >= 0 ? "#039855" : "#D92D20", flexShrink: 0 }}>
                                {resultadoPeriodo >= 0 ? "▲" : "▼"} {receitaPeriodo > 0 ? `${Math.abs((resultadoPeriodo / receitaPeriodo) * 100).toFixed(1)}%` : "—"}
                            </span>
                        </div>
                        <div style={{ fontSize: "clamp(18px, 1.8vw, 26px)", fontWeight: 800, color: resultadoPeriodo >= 0 ? "#039855" : "#D92D20", lineHeight: 1.1, marginBottom: 5, letterSpacing: "-0.5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fmt(resultadoPeriodo)}</div>
                        <div style={{ fontSize: 12, color: C.textMuted }}>
                            {receitaPeriodo > 0 ? `Margem ${((resultadoPeriodo / receitaPeriodo) * 100).toFixed(1)}%` : "—"}
                        </div>
                    </div>
                </div>

                {/* ── Heatmap: Faturamento Diário do Mês ── */}
                <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)", marginBottom: 16, overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
                        <div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: C.text1, textTransform: "uppercase", letterSpacing: "0.04em" }}>Faturamento Diário</div>
                            <div style={{ fontSize: 13, color: C.textMuted, marginTop: 2 }}>{format(new Date(periodStart + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR })} — {format(new Date(periodEnd + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR })}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: C.textMuted }}>
                            <span>Menos</span>
                            {["#F3F4F6", "#BBF7D0", "#86EFAC", "#4ADE80", "#16A34A"].map((c, i) => (
                                <span key={i} style={{ width: 14, height: 14, background: c, borderRadius: 3, border: c === "#F3F4F6" ? `1px solid ${C.border}` : "none" }} />
                            ))}
                            <span>Mais</span>
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: 32, padding: "20px 20px 24px 20px", alignItems: "flex-start" }}>
                        {/* Heatmap grid */}
                        <div style={{ display: "flex", gap: 8 }}>
                            {/* Day-of-week labels */}
                            <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: C.textMuted, paddingTop: 22 }}>
                                {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
                                    <div key={d} style={{ height: 36, display: "flex", alignItems: "center" }}>{d}</div>
                                ))}
                            </div>
                            {/* Weeks */}
                            <div style={{ display: "flex", flexDirection: "column" }}>
                                {/* Month labels row */}
                                <div style={{ display: "flex", gap: 4, height: 18, marginBottom: 4, position: "relative" }}>
                                    {heatmap.weeks.map((_, wi) => {
                                        const monthAtThisCol = heatmap.monthLabels.find(m => m.weekIndex === wi);
                                        return (
                                            <div key={wi} style={{ width: 36, fontSize: 11, fontWeight: 600, color: C.text2, textAlign: "left", marginLeft: wi > 0 && heatmap.monthLabels.some(m => m.weekIndex === wi) ? 8 : 0 }}>
                                                {monthAtThisCol?.label || ""}
                                            </div>
                                        );
                                    })}
                                </div>
                                <div style={{ display: "flex", gap: 4 }}>
                                {heatmap.weeks.map((week, wi) => (
                                    <div key={wi} style={{ display: "flex", flexDirection: "column", gap: 4, marginLeft: wi > 0 && heatmap.monthLabels.some(m => m.weekIndex === wi) ? 8 : 0 }}>
                                        {week.map((day, di) => day ? (
                                            <div
                                                key={di}
                                                title={`${format(day.date, "dd/MM")} · ${fmt(day.value)}`}
                                                style={{
                                                    width: 36, height: 36, borderRadius: 6,
                                                    background: heatmapColor(day.value, heatmap.max),
                                                    border: day.value === 0 ? `1px solid ${C.border}` : "none",
                                                    display: "flex", alignItems: "center", justifyContent: "center",
                                                    fontSize: 12.5, fontWeight: 600,
                                                    color: day.value === 0 ? C.textMuted : (day.value / (heatmap.max || 1)) >= 0.5 ? "#fff" : C.text1,
                                                }}
                                            >
                                                {format(day.date, "d")}
                                            </div>
                                        ) : (
                                            <div key={di} style={{ width: 36, height: 36 }} />
                                        ))}
                                    </div>
                                ))}
                                </div>
                            </div>
                        </div>
                        {/* Stats */}
                        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, alignSelf: "stretch" }}>
                            {/* Produtos vendidos - ranking */}
                            <div style={{ background: "#F9FAFB", borderRadius: 8, border: `1px solid ${C.border}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                                <div style={{ padding: "10px 14px 8px", borderBottom: `1px solid ${C.border}` }}>
                                    <div style={{ fontSize: 15, color: C.text1, fontWeight: 700, letterSpacing: "-0.01em" }}>PRODUTOS E SERVIÇOS <span style={{ fontSize: 12, color: C.textMuted, fontWeight: 500 }}>· {monthlySales?.productBreakdown?.length ?? 0} {(monthlySales?.productBreakdown?.length ?? 0) === 1 ? "item" : "itens"}</span></div>
                                </div>
                                {monthlySales?.productBreakdown && monthlySales.productBreakdown.length > 0 ? (
                                    <div style={{ flex: 1, overflowY: "auto" }}>
                                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                            <thead style={{ position: "sticky", top: 0, background: "#F9FAFB", zIndex: 1 }}>
                                                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                                                    <th style={{ textAlign: "left", padding: "6px 12px", fontSize: 10.5, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.3 }}>Produto</th>
                                                    <th style={{ textAlign: "right", padding: "6px 8px", fontSize: 10.5, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.3 }}>Vend.</th>
                                                    <th style={{ textAlign: "right", padding: "6px 8px", fontSize: 10.5, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.3 }}>Qtd</th>
                                                    <th style={{ textAlign: "right", padding: "6px 8px", fontSize: 10.5, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.3 }}>Fatur.</th>
                                                    <th style={{ textAlign: "right", padding: "6px 12px", fontSize: 10.5, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.3 }}>%</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {monthlySales.productBreakdown.map((p, idx) => (
                                                    <tr key={p.descricao + idx} style={{ borderBottom: idx === monthlySales.productBreakdown.length - 1 ? "none" : `1px solid ${C.border}`, background: p.semProduto ? "#FFFBEB" : "transparent" }}>
                                                        <td style={{ padding: "7px 12px", color: p.semProduto ? C.textMuted : C.text1, fontWeight: 500, fontStyle: p.semProduto ? "italic" : "normal", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 }}>{p.descricao}</td>
                                                        <td style={{ padding: "7px 8px", textAlign: "right", color: C.text2, fontVariantNumeric: "tabular-nums" }}>{p.semProduto ? "—" : p.vendas.toLocaleString("pt-BR")}</td>
                                                        <td style={{ padding: "7px 8px", textAlign: "right", color: C.text2, fontVariantNumeric: "tabular-nums" }}>{p.semProduto ? "—" : p.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</td>
                                                        <td style={{ padding: "7px 8px", textAlign: "right", color: C.text1, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmt(p.faturamento)}</td>
                                                        <td style={{ padding: "7px 12px", textAlign: "right", color: C.text1, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{p.percentual.toFixed(1)}%</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div style={{ padding: "20px 14px", textAlign: "center", color: C.textMuted, fontSize: 12 }}>
                                        Nenhum produto vendido neste mês
                                    </div>
                                )}
                            </div>
                            {/* Faturamento e média por semana */}
                            <div style={{ background: "#F9FAFB", borderRadius: 8, border: `1px solid ${C.border}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                                <div style={{ padding: "10px 14px 8px", borderBottom: `1px solid ${C.border}` }}>
                                    <div style={{ fontSize: 15, color: C.text1, fontWeight: 700, letterSpacing: "-0.01em" }}>FATURAMENTO POR SEMANA</div>
                                </div>
                                <div style={{ flex: 1, overflowY: "auto" }}>
                                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                        <thead style={{ position: "sticky", top: 0, background: "#F9FAFB", zIndex: 1 }}>
                                            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                                                <th style={{ textAlign: "left", padding: "6px 10px", fontSize: 10.5, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.3 }}>Semana</th>
                                                <th style={{ textAlign: "right", padding: "6px 10px", fontSize: 10.5, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.3 }}>Faturamento</th>
                                                <th style={{ textAlign: "right", padding: "6px 10px", fontSize: 10.5, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.3 }}>Média Diária</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {heatmap.weeklyAverages.map((w, idx) => (
                                                <tr key={w.label} style={{ borderBottom: `1px solid ${C.border}` }}>
                                                    <td style={{ padding: "7px 10px", color: C.text1, fontWeight: 500 }}>{w.label}</td>
                                                    <td style={{ padding: "7px 10px", textAlign: "right", color: C.text1, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtInt(w.total)}</td>
                                                    <td style={{ padding: "7px 10px", textAlign: "right", color: C.text2, fontVariantNumeric: "tabular-nums" }}>{fmtInt(w.avg)}</td>
                                                </tr>
                                            ))}
                                            <tr style={{ background: "#F3F4F6" }}>
                                                <td style={{ padding: "8px 10px", color: C.text1, fontWeight: 700, textTransform: "uppercase", fontSize: 10.5, letterSpacing: 0.3 }}>Total</td>
                                                <td style={{ padding: "8px 10px", textAlign: "right", color: C.text1, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtInt(heatmap.total)}</td>
                                                <td style={{ padding: "8px 10px", textAlign: "right", color: C.text1, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtInt(heatmap.days.length > 0 ? heatmap.total / heatmap.days.length : 0)}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Mid Row: Faturamento Diário + Contas a Receber ── */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 368px", gap: 16, marginBottom: 16 }}>
                    {/* Faturamento do período */}
                    <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                            <div>
                                <p style={{ fontSize: 15, fontWeight: 700, color: C.text1, margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                                    Faturamento {chartGranularity === "day" ? "Diário" : chartGranularity === "week" ? "Semanal" : "Mensal"}
                                </p>
                                <p style={{ fontSize: 13, color: C.textMuted, margin: "2px 0 0 0" }}>
                                    {periodLabel} · {(chartRevExp || []).length} {chartGranularity === "day" ? "dias" : chartGranularity === "week" ? "semanas" : "meses"}
                                </p>
                            </div>
                            <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: 11.5, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600 }}>Total no período</div>
                                <div style={{ fontSize: 20, fontWeight: 800, color: "#039855", letterSpacing: "-0.015em", marginTop: 2 }}>
                                    {fmt((chartRevExp || []).reduce((s: number, r: any) => s + (r.Receita || 0), 0))}
                                </div>
                            </div>
                        </div>

                        <ResponsiveContainer width="100%" height={320}>
                            <BarChart data={chartRevExp || []} margin={{ top: 12, right: 8, left: 0, bottom: 0 }} barCategoryGap="12%">
                                <defs>
                                    <linearGradient id="faturGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#10B981" stopOpacity={1} />
                                        <stop offset="100%" stopColor="#10B981" stopOpacity={0.55} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#EAECF0" vertical={false} />
                                <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.text2 }} axisLine={false} tickLine={false} interval={1} />
                                <YAxis tick={{ fontSize: 10, fill: C.textMuted }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [fmtFull(v), "Faturamento"]} cursor={{ fill: "rgba(16, 185, 129, 0.08)" }} />
                                <Bar dataKey="Receita" name="Faturamento" fill="url(#faturGrad)" radius={[6, 6, 0, 0]} maxBarSize={32}>
                                    <LabelList dataKey="Receita" position="top" fontSize={9} fill="#065F46" fontWeight={600} formatter={fmtShort} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Contas a Receber — Buckets (mockup) */}
                    <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
                            <div>
                                <div style={{ fontSize: 15, fontWeight: 700, color: C.text1, textTransform: "uppercase", letterSpacing: "0.04em" }}>Contas a Receber</div>
                                <div style={{ fontSize: 13, color: C.textMuted, marginTop: 2 }}>{periodLabel} · {receivablesAging.totalCount} títulos</div>
                            </div>
                            <button onClick={() => navigate("/contas-receber")} style={{ fontSize: 12.5, fontWeight: 600, color: C.gold, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                                Ver todos <ArrowRight size={13} />
                            </button>
                        </div>

                        <div style={{ flex: 1 }}>
                            {/* Em dia */}
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: `1px solid ${C.border}` }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#039855", flexShrink: 0 }} />
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text1 }}>Em dia</div>
                                        <div style={{ fontSize: 12, color: C.textMuted, marginTop: 1 }}>Vence em mais de 30 dias</div>
                                    </div>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: "#039855" }}>{fmt(crBuckets.emDia.total)}</div>
                                    <div style={{ fontSize: 13, color: C.textMuted, marginTop: 2 }}>{crBuckets.emDia.count} título{crBuckets.emDia.count !== 1 ? "s" : ""}</div>
                                </div>
                            </div>

                            {/* A vencer em breve */}
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: `1px solid ${C.border}` }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#F79009", flexShrink: 0 }} />
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text1 }}>A vencer em breve</div>
                                        <div style={{ fontSize: 12, color: C.textMuted, marginTop: 1 }}>Próximos 30 dias</div>
                                    </div>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: "#F79009" }}>{fmt(crBuckets.aVencerBreve.total)}</div>
                                    <div style={{ fontSize: 13, color: C.textMuted, marginTop: 2 }}>{crBuckets.aVencerBreve.count} título{crBuckets.aVencerBreve.count !== 1 ? "s" : ""}</div>
                                </div>
                            </div>

                            {/* Acima de 90 dias */}
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: crBuckets.acima90.count > 0 ? "#D92D20" : C.textMuted, flexShrink: 0 }} />
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text1 }}>Acima de 90 dias</div>
                                        <div style={{ fontSize: 12, color: C.textMuted, marginTop: 1 }}>Inadimplência crítica</div>
                                    </div>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: crBuckets.acima90.count > 0 ? "#D92D20" : C.textMuted }}>{fmt(crBuckets.acima90.total)}</div>
                                    <div style={{ fontSize: 13, color: C.textMuted, marginTop: 2 }}>{crBuckets.acima90.count} título{crBuckets.acima90.count !== 1 ? "s" : ""}</div>
                                </div>
                            </div>
                        </div>

                        {/* Footer total */}
                        <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, background: "#FAFAF8", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div>
                                <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 500 }}>Total em aberto</div>
                                <div style={{ marginTop: 2 }}>
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, padding: "3px 9px", borderRadius: 20, background: "#ECFDF3", color: "#027A48", border: "1.5px solid #A9EFC5" }}>
                                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#039855" }} />
                                        {crBuckets.acima90.count === 0 ? "Carteira saudável" : "Atenção necessária"}
                                    </span>
                                </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: C.text1 }}>{fmt(receivablesAging.totalAberto)}</div>
                                <div style={{ fontSize: 12, color: C.textMuted }}>{receivablesAging.totalCount} título{receivablesAging.totalCount !== 1 ? "s" : ""}</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Bottom Row: Despesas Diárias + A Pagar ── */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 368px", gap: 16 }}>
                    {/* Despesas Diárias do período */}
                    <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)", padding: 20, display: "flex", flexDirection: "column", minHeight: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                            <div>
                                <div style={{ fontSize: 15, fontWeight: 700, color: C.text1, textTransform: "uppercase", letterSpacing: "0.04em" }}>Despesas Diárias</div>
                                <div style={{ fontSize: 13, color: C.textMuted, marginTop: 2 }}>
                                    {periodLabel} · {(chartDespDiarias || []).length} dias
                                </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: 11.5, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600 }}>Total no período</div>
                                <div style={{ fontSize: 20, fontWeight: 800, color: "#7F1D1D", letterSpacing: "-0.015em", marginTop: 2 }}>
                                    {fmt((chartDespDiarias || []).reduce((s: number, r: any) => s + (r.despesa || 0), 0))}
                                </div>
                            </div>
                        </div>

                        <div style={{ flex: 1, minHeight: 240 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartDespDiarias || []} margin={{ top: 12, right: 8, left: 0, bottom: 0 }} barCategoryGap="12%">
                                    <defs>
                                        <linearGradient id="despGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#B91C1C" stopOpacity={1} />
                                            <stop offset="100%" stopColor="#B91C1C" stopOpacity={0.55} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#EAECF0" vertical={false} />
                                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.text2 }} axisLine={false} tickLine={false} interval={1} />
                                    <YAxis tick={{ fontSize: 10, fill: C.textMuted }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [fmtFull(v), "Despesa"]} cursor={{ fill: "rgba(185, 28, 28, 0.08)" }} />
                                    <Bar dataKey="despesa" name="Despesa" fill="url(#despGrad)" radius={[6, 6, 0, 0]} maxBarSize={32}>
                                        <LabelList dataKey="despesa" position="top" fontSize={9} fill="#7F1D1D" fontWeight={600} formatter={fmtShort} />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* A Pagar — Próximos 7 Dias (mockup list) */}
                    <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
                            <div>
                                <div style={{ fontSize: 15, fontWeight: 700, color: C.text1, textTransform: "uppercase", letterSpacing: "0.04em" }}>A Pagar</div>
                                <div style={{ fontSize: 13, color: C.textMuted, marginTop: 2 }}>{periodLabel} · {payables7d.length} título{payables7d.length !== 1 ? "s" : ""}</div>
                            </div>
                            <button onClick={() => navigate("/contas-pagar")} style={{ fontSize: 12.5, fontWeight: 600, color: C.gold, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                                Ver todos <ArrowRight size={13} />
                            </button>
                        </div>

                        <div style={{ flex: 1 }}>
                            {payables7d.length === 0 ? (
                                <p style={{ fontSize: 13, color: C.textMuted, textAlign: "center", padding: "32px 20px" }}>
                                    Nenhuma conta a pagar nos próximos 7 dias.
                                </p>
                            ) : (
                                payables7d.slice(0, 5).map((p: any) => {
                                    const saldo = Number(p.valor || 0) - Number(p.valor_pago || 0);
                                    const diff = differenceInDays(new Date(p.data_vencimento), today);
                                    const isLate = diff <= 1;
                                    const isWarn = diff > 1 && diff <= 3;
                                    const iconBg = isLate ? "#FEF3F2" : isWarn ? "#FFFAEB" : C.goldBg;
                                    const iconColor = isLate ? "#991B1B" : isWarn ? "#92400E" : "#059669";
                                    const initials = (p.credor_nome || "??").split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();
                                    const badgeBg = isLate ? "#FEF3F2" : isWarn ? "#FFFAEB" : "#F6F2EB";
                                    const badgeBorder = isLate ? "#FECDCA" : isWarn ? "#FEDF89" : C.border;
                                    const badgeColor = isLate ? "#B42318" : isWarn ? "#B54708" : C.text2;
                                    const badgeDot = isLate ? "#D92D20" : isWarn ? "#F79009" : C.textMuted;
                                    const badgeLabel = isLate ? "Urgente" : isWarn ? "Em breve" : "Normal";

                                    return (
                                        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 20px", borderBottom: `1px solid ${C.border}` }}>
                                            <div style={{ width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11.5, fontWeight: 700, background: iconBg, color: iconColor, flexShrink: 0 }}>
                                                {initials}
                                            </div>
                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                <div style={{ fontSize: 13, fontWeight: 600, color: C.text1, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.credor_nome}</div>
                                                <div style={{ fontSize: 12, color: C.textMuted, marginTop: 1 }}>{daysUntilDue(p.data_vencimento)}</div>
                                            </div>
                                            <div style={{ textAlign: "right" }}>
                                                <div style={{ fontSize: 13, fontWeight: 700, color: isLate ? "#D92D20" : C.text1 }}>{fmt(saldo)}</div>
                                                <div style={{ marginTop: 4 }}>
                                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, padding: "3px 9px", borderRadius: 20, background: badgeBg, color: badgeColor, border: `1.5px solid ${badgeBorder}` }}>
                                                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: badgeDot }} />
                                                        {badgeLabel}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Footer total */}
                        <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, background: "#FAFAF8", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 12, color: C.textMuted, fontWeight: 500 }}>Total a pagar</span>
                            <span style={{ fontSize: 14, fontWeight: 700, color: "#D92D20" }}>{fmt(totalPagar7d)}</span>
                        </div>
                    </div>
                </div>

                {/* ── Pizza: Principais Destinos dos Gastos ── */}
                <div style={{ marginTop: 16, background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)", padding: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                        <div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: C.text1, textTransform: "uppercase", letterSpacing: "0.04em" }}>Principais Destinos dos Gastos</div>
                            <div style={{ fontSize: 13, color: C.textMuted, marginTop: 2 }}>
                                {periodLabel} · {gastosCategorias.length} categoria{gastosCategorias.length !== 1 ? "s" : ""}
                            </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 11.5, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600 }}>Total</div>
                            <div style={{ fontSize: 20, fontWeight: 800, color: "#7F1D1D", letterSpacing: "-0.015em", marginTop: 2 }}>
                                {fmt(gastosCategorias.reduce((s: number, r: any) => s + r.total, 0))}
                            </div>
                        </div>
                    </div>

                    {gastosCategorias.length === 0 ? (
                        <p style={{ fontSize: 13, color: C.textMuted, textAlign: "center", padding: "60px 0" }}>
                            Nenhum gasto categorizado no período.
                        </p>
                    ) : (() => {
                        const palette = ["#059669", "#1E3A8A", "#0F172A", "#10B981", "#6B7280", "#D97706"];
                        const totalGeral = gastosCategorias.reduce((s: number, r: any) => s + r.total, 0);
                        return (
                            <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 32, alignItems: "center" }}>
                                <div style={{ position: "relative", width: "100%", height: 320 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                                            <Pie
                                                data={gastosCategorias}
                                                dataKey="total"
                                                nameKey="name"
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={65}
                                                outerRadius={120}
                                                paddingAngle={2}
                                                stroke="#FFFFFF"
                                                strokeWidth={2}
                                                label={(props: any) => {
                                                    const { cx, cy, midAngle, innerRadius, outerRadius, percent } = props;
                                                    if (percent < 0.06) return null;
                                                    const r = innerRadius + (outerRadius - innerRadius) * 0.55;
                                                    const x = cx + r * Math.cos(-midAngle * Math.PI / 180);
                                                    const y = cy + r * Math.sin(-midAngle * Math.PI / 180);
                                                    return (
                                                        <text x={x} y={y} fill="#FFFFFF" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>
                                                            {(percent * 100).toFixed(0)}%
                                                        </text>
                                                    );
                                                }}
                                                labelLine={false}
                                            >
                                                {gastosCategorias.map((_: any, idx: number) => (
                                                    <Cell key={idx} fill={palette[idx % palette.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#fff" }} labelStyle={{ color: "#fff", fontWeight: 600 }} formatter={(v: number) => [fmtFull(v), "Gasto"]} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    {/* Texto central do donut */}
                                    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                                        <div style={{ fontSize: 10.5, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.8 }}>Total gasto</div>
                                        <div style={{ fontSize: 18, fontWeight: 800, color: "#7F1D1D", letterSpacing: "-0.02em", marginTop: 2 }}>
                                            {fmt(totalGeral)}
                                        </div>
                                        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{gastosCategorias.length} categorias</div>
                                    </div>
                                </div>

                                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                    {gastosCategorias.map((c: any, idx: number) => {
                                        const pct = totalGeral > 0 ? (c.total / totalGeral) * 100 : 0;
                                        return (
                                            <div key={idx} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                                <span style={{ width: 12, height: 12, borderRadius: 3, background: palette[idx % palette.length], flexShrink: 0 }} />
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                                                        <span style={{ fontSize: 13, fontWeight: 600, color: C.text1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
                                                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text1, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{fmt(c.total)}</span>
                                                    </div>
                                                    <div style={{ marginTop: 3, height: 5, background: "#F1F5F9", borderRadius: 3, overflow: "hidden", position: "relative" }}>
                                                        <div style={{ width: `${pct}%`, height: "100%", background: palette[idx % palette.length], borderRadius: 3 }} />
                                                    </div>
                                                    <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 3 }}>{pct.toFixed(1)}% do total</div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })()}
                </div>
            </div>
        </AppLayout>
    );
}
