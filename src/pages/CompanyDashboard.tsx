import { useMemo, useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ComposedChart, Area, Line, Cell, ReferenceLine, LabelList,
} from "recharts";
import { AlertTriangle, ArrowRight, ChevronDown, Calendar, Info, Building2, CalendarClock, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { SectionTitle } from "@/components/ui/section-title";
import {
    startOfMonth, endOfMonth, startOfYear, endOfYear, startOfWeek, endOfWeek,
    subMonths, subWeeks, subDays, addDays, format, differenceInDays, differenceInCalendarDays,
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
    red: "#E53E3E",           // error
    redSoft: "#FEE2E2",       // error-bg
    redBg: "#E53E3E",
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
    const [regime, setRegime] = useState<"caixa" | "competencia">("competencia");
    const [productsPage, setProductsPage] = useState(0);
    const [payablesPage, setPayablesPage] = useState(0);
    const PRODUCTS_PER_PAGE = 5;
    const PAYABLES_PER_PAGE = 5;
    const periodMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => { setProductsPage(0); setPayablesPage(0); }, [period, regime, specificMonth, specificYear, customStart, customEnd]);

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

    // ─── Helper: receita em REGIME DE CAIXA com regra cartão = pago ──
    // Cartão de crédito (e parcelado) conta como receita no DIA DA VENDA,
    // não no dia do repasse da operadora. Demais formas: pelo data_pagamento.
    // Retorna lista de itens { valor, data, venda_id, conta_contabil_id, forma_recebimento }.
    const fetchReceitaCaixaItens = async (start: string, end: string) => {
        // 1. CRs pagos (não cartão de crédito) — por data_pagamento
        const { data: pagos } = await db.from("contas_receber")
            .select("valor_pago, data_pagamento, conta_contabil_id, venda_id, forma_recebimento")
            .eq("company_id", cId).eq("status", "pago")
            .is("deleted_at", null)
            .gte("data_pagamento", start).lte("data_pagamento", end)
            .limit(10000);
        const pagosItens = (pagos || [])
            .filter((r: any) => !isTransfer(r))
            .filter((r: any) => r.forma_recebimento !== "cartao_credito" && r.forma_recebimento !== "parcelado")
            .map((r: any) => ({
                valor: Number(r.valor_pago || 0),
                data: r.data_pagamento as string,
                venda_id: r.venda_id as string | null,
                conta_contabil_id: r.conta_contabil_id as string | null,
                forma_recebimento: r.forma_recebimento as string | null,
            }));

        // 2. CRs cartão de crédito / parcelado — por data_venda da venda
        //    (independente do status: aberto ou pago — cliente já pagou no ato)
        const { data: vendasPeriodo } = await db.from("vendas")
            .select("id, data_venda")
            .eq("company_id", cId)
            .gte("data_venda", start).lte("data_venda", end)
            .limit(10000);
        const vendaDataMap: Record<string, string> = {};
        (vendasPeriodo || []).forEach((v: any) => { vendaDataMap[v.id] = v.data_venda });
        const vendaIds = Object.keys(vendaDataMap);

        const cartaoItens: typeof pagosItens = [];
        if (vendaIds.length > 0) {
            const CHUNK = 300;
            for (let i = 0; i < vendaIds.length; i += CHUNK) {
                const slice = vendaIds.slice(i, i + CHUNK);
                const { data: crs } = await db.from("contas_receber")
                    .select("valor, conta_contabil_id, venda_id, forma_recebimento")
                    .in("venda_id", slice)
                    .in("forma_recebimento", ["cartao_credito", "parcelado"])
                    .is("deleted_at", null)
                    .limit(10000);
                (crs || []).forEach((r: any) => {
                    if (isTransfer(r)) return;
                    cartaoItens.push({
                        valor: Number(r.valor || 0),
                        data: vendaDataMap[r.venda_id],
                        venda_id: r.venda_id,
                        conta_contabil_id: r.conta_contabil_id,
                        forma_recebimento: r.forma_recebimento,
                    });
                });
            }
        }

        return [...pagosItens, ...cartaoItens];
    };

    // ─── Receita do período (depende do regime) ────────────
    // Competência: vendas confirmadas por data_venda (o que foi vendido).
    // Caixa: contas_receber pagas por data_pagamento + cartão de crédito por data_venda
    //        (cliente já pagou no ato, repasse da operadora é tratado em CR separadamente).
    const { data: receitaPeriodo = 0 } = useQuery({
        queryKey: ["dash_receita_periodo", cId, periodStart, periodEnd, regime, transferAccountIds],
        queryFn: async () => {
            if (regime === "competencia") {
                const { data } = await db.from("vendas")
                    .select("valor_liquido")
                    .eq("company_id", cId).eq("status", "confirmado")
                    .gte("data_venda", periodStart).lte("data_venda", periodEnd)
                    .limit(10000);
                return (data || [])
                    .reduce((s: number, r: any) => s + Number(r.valor_liquido || 0), 0);
            }
            const itens = await fetchReceitaCaixaItens(periodStart, periodEnd);
            return itens.reduce((s, r) => s + r.valor, 0);
        },
        enabled: !!cId,
    });

    // ─── Despesa do período (depende do regime) ────────────
    // Competência: contas_pagar (aberto/parcial/vencido/pago) por data_vencimento, valor cheio.
    // Caixa: contas_pagar pagas por data_pagamento, valor efetivamente pago.
    const { data: despesaPeriodo = 0 } = useQuery({
        queryKey: ["dash_despesa_periodo", cId, periodStart, periodEnd, regime, transferAccountIds],
        queryFn: async () => {
            if (regime === "competencia") {
                const { data } = await db.from("contas_pagar")
                    .select("valor, conta_contabil_id")
                    .eq("company_id", cId)
                    .in("status", ["aberto", "parcial", "vencido", "pago"])
                    .is("deleted_at", null)
                    .gte("data_vencimento", periodStart).lte("data_vencimento", periodEnd)
                    .limit(10000);
                return (data || [])
                    .filter((r: any) => !isTransfer(r))
                    .reduce((s: number, r: any) => s + Number(r.valor || 0), 0);
            }
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

    // ─── Previous period (comparação alinhada por dia) ──────
    // Espelha o período atual deslocado 1 mês pra trás, capando o fim no dia
    // de hoje quando o período atual ainda está em andamento. Ex.: período
    // 01-31/05 com hoje=07/05 → comparação 01-07/04 vs 01-07/05.
    const periodStartDate = new Date(periodStart + "T00:00:00");
    const periodEndDate = new Date(periodEnd + "T00:00:00");
    const effectivePeriodEnd = periodEndDate > today ? today : periodEndDate;
    const prevMonthStart = format(subMonths(periodStartDate, 1), "yyyy-MM-dd");
    // prevMonthEnd: alinhado por dia (capa no hoje quando período em andamento) — usado nos KPIs
    const prevMonthEnd = format(subMonths(effectivePeriodEnd, 1), "yyyy-MM-dd");
    // prevMonthEndFull: cobertura total do mês anterior (sem capar) — usado nos gráficos com agregação semanal/mensal
    const prevMonthEndFull = format(subMonths(periodEndDate, 1), "yyyy-MM-dd");

    const { data: receitaPeriodoAnterior = 0 } = useQuery({
        queryKey: ["dash_receita_prev", cId, prevMonthStart, prevMonthEnd, regime, transferAccountIds],
        queryFn: async () => {
            if (regime === "competencia") {
                const { data } = await db.from("vendas")
                    .select("valor_liquido")
                    .eq("company_id", cId).eq("status", "confirmado")
                    .gte("data_venda", prevMonthStart).lte("data_venda", prevMonthEnd)
                    .limit(10000);
                return (data || [])
                    .reduce((s: number, r: any) => s + Number(r.valor_liquido || 0), 0);
            }
            const itens = await fetchReceitaCaixaItens(prevMonthStart, prevMonthEnd);
            return itens.reduce((s, r) => s + r.valor, 0);
        },
        enabled: !!cId,
    });

    const { data: despesaPeriodoAnterior = 0 } = useQuery({
        queryKey: ["dash_despesa_prev", cId, prevMonthStart, prevMonthEnd, regime, transferAccountIds],
        queryFn: async () => {
            if (regime === "competencia") {
                const { data } = await db.from("contas_pagar")
                    .select("valor, conta_contabil_id")
                    .eq("company_id", cId)
                    .in("status", ["aberto", "parcial", "vencido", "pago"])
                    .is("deleted_at", null)
                    .gte("data_vencimento", prevMonthStart).lte("data_vencimento", prevMonthEnd)
                    .limit(10000);
                return (data || [])
                    .filter((r: any) => !isTransfer(r))
                    .reduce((s: number, r: any) => s + Number(r.valor || 0), 0);
            }
            const { data } = await db.from("contas_pagar")
                .select("valor_pago, conta_contabil_id")
                .eq("company_id", cId).eq("status", "pago")
                .is("deleted_at", null)
                .gte("data_pagamento", prevMonthStart).lte("data_pagamento", prevMonthEnd)
                .limit(5000);
            return (data || [])
                .filter((r: any) => !isTransfer(r))
                .reduce((s: number, r: any) => s + Number(r.valor_pago || 0), 0);
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

            const diasAtraso = differenceInCalendarDays(today, new Date(r.data_vencimento + "T00:00:00"));
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
            const venc = new Date(r.data_vencimento + "T00:00:00");
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
    const trendDesp = despesaPeriodoAnterior > 0
        ? ((despesaPeriodo - despesaPeriodoAnterior) / despesaPeriodoAnterior) * 100
        : 0;
    const resultadoPeriodoAnterior = receitaPeriodoAnterior - despesaPeriodoAnterior;
    const trendResultado = resultadoPeriodoAnterior !== 0
        ? ((resultadoPeriodo - resultadoPeriodoAnterior) / Math.abs(resultadoPeriodoAnterior)) * 100
        : 0;

    // ─── Alert banner ───────────────────────────────────────
    const alertItems: string[] = [];
    if (vencem_hoje_pagar > 0) alertItems.push(`${vencem_hoje_pagar} conta${vencem_hoje_pagar > 1 ? "s" : ""} a pagar vence${vencem_hoje_pagar > 1 ? "m" : ""} hoje`);
    if (receivablesAging.overdue.length > 0) alertItems.push(`${receivablesAging.overdue.length} titulo${receivablesAging.overdue.length > 1 ? "s" : ""} a receber com mais de 60 dias em atraso`);

    // ─── Faturamento por período (granularidade dinâmica) ──
    // Períodos curtos (≤14 dias): barras diárias. Médios: semanais. Longos: mensais.
    // Threshold mais conservador pra evitar muitas barras finas no mês completo.
    const periodDays = differenceInCalendarDays(new Date(periodEnd + "T00:00:00"), new Date(periodStart + "T00:00:00")) + 1;
    const chartGranularity: "day" | "week" | "month" = periodDays <= 14 ? "day" : periodDays <= 180 ? "week" : "month";

// ─── Despesas diárias pelo período selecionado ──────────
    // Competência: por data_vencimento, valor cheio.
    // Caixa: por data_pagamento, valor pago.
    // Retorna mapas byDay (atual e anterior) — agregação por bucket vem em useMemo abaixo.
    const { data: despesaDailyMaps } = useQuery({
        queryKey: ["dash_desp_daily_maps", cId, periodStart, periodEnd, prevMonthStart, prevMonthEndFull, regime, transferAccountIds],
        queryFn: async () => {
            const dateField = regime === "competencia" ? "data_vencimento" : "data_pagamento";
            const valorField = regime === "competencia" ? "valor" : "valor_pago";
            const buildQuery = (from: string, to: string) => {
                let q = db.from("contas_pagar")
                    .select(`${valorField}, ${dateField}, conta_contabil_id`)
                    .eq("company_id", cId)
                    .is("deleted_at", null)
                    .gte(dateField, from).lte(dateField, to)
                    .limit(10000);
                q = regime === "competencia"
                    ? q.in("status", ["aberto", "parcial", "vencido", "pago"])
                    : q.eq("status", "pago");
                return q;
            };
            const [{ data: dataAtual }, { data: dataPrev }] = await Promise.all([
                buildQuery(periodStart, periodEnd),
                buildQuery(prevMonthStart, prevMonthEndFull),
            ]);
            const byDay: Record<string, number> = {};
            (dataAtual || []).forEach((r: any) => {
                if (isTransfer(r)) return;
                const d = r[dateField];
                byDay[d] = (byDay[d] || 0) + Number(r[valorField] || 0);
            });
            const prevByDay: Record<string, number> = {};
            (dataPrev || []).forEach((r: any) => {
                if (isTransfer(r)) return;
                const d = r[dateField];
                prevByDay[d] = (prevByDay[d] || 0) + Number(r[valorField] || 0);
            });
            return { byDay, prevByDay };
        },
        enabled: !!cId,
    });

    // Agrega Despesa por bucket (day/week/month) com base no chartGranularity.
    const chartDespDiarias = useMemo(() => {
        const ps = new Date(periodStart + "T00:00:00");
        const pe = new Date(periodEnd + "T00:00:00");
        const prevPs = new Date(prevMonthStart + "T00:00:00");
        const byDay = (despesaDailyMaps?.byDay || {}) as Record<string, number>;
        const prevByDayMap = (despesaDailyMaps?.prevByDay || {}) as Record<string, number>;
        const sumRange = (map: Record<string, number>, from: Date, to: Date) => {
            let s = 0;
            let d = from;
            while (d <= to) {
                s += map[format(d, "yyyy-MM-dd")] || 0;
                d = addDays(d, 1);
            }
            return s;
        };
        const buckets: { start: Date; end: Date; label: string }[] = [];

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

        return buckets.map((b) => {
            const offsetStart = differenceInCalendarDays(b.start, ps);
            const offsetEnd = differenceInCalendarDays(b.end, ps);
            const prevStart = addDays(prevPs, offsetStart);
            const prevEnd = addDays(prevPs, offsetEnd);
            return {
                label: b.label,
                despesa: sumRange(byDay, b.start, b.end),
                despesaAnterior: sumRange(prevByDayMap, prevStart, prevEnd),
            };
        });
    }, [despesaDailyMaps, periodStart, periodEnd, prevMonthStart, periodDays, chartGranularity]);

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

    // ─── Faturamento/Recebimentos diário (heatmap + produtos) ───
    // Competência: vendas confirmadas por data_venda, com breakdown de produtos.
    // Caixa: contas_receber pagas por data_pagamento. Produtos vêm da venda
    // original via 'venda_id' (rateio: cada CR distribui seu valor_pago entre
    // os itens da venda proporcional ao share de cada item no valor_total).
    const { data: monthlySales } = useQuery({
        queryKey: ["dash_monthly_sales", cId, periodStart, periodEnd, regime, transferAccountIds],
        queryFn: async () => {
            const byDay: Record<string, number> = {};

            if (regime === "caixa") {
                const itensCaixa = await fetchReceitaCaixaItens(periodStart, periodEnd);

                let totalRec = 0;
                const validCRs: { valor_pago: number; venda_id: string | null }[] = [];
                itensCaixa.forEach((r) => {
                    const v = Number(r.valor || 0);
                    if (v <= 0 || !r.data) return;
                    byDay[r.data] = (byDay[r.data] || 0) + v;
                    totalRec += v;
                    validCRs.push({ valor_pago: v, venda_id: r.venda_id });
                });

                // Carrega vendas originais pra montar breakdown de produtos
                const vendaIds = Array.from(new Set(validCRs.map(r => r.venda_id).filter(Boolean) as string[]));
                const vendasMap: Record<string, { valor_total: number; procedimento: string | null; itens: { descricao: string; valor_total: number }[] }> = {};
                if (vendaIds.length > 0) {
                    const { data: vendas } = await db.from("vendas")
                        .select("id, valor_total, procedimento, vendas_itens(descricao, valor_total)")
                        .in("id", vendaIds);
                    (vendas || []).forEach((v: any) => {
                        vendasMap[v.id] = {
                            valor_total: Number(v.valor_total || 0),
                            procedimento: v.procedimento || null,
                            itens: Array.isArray(v.vendas_itens)
                                ? v.vendas_itens.map((it: any) => ({ descricao: (it.descricao || "Sem descrição").trim(), valor_total: Number(it.valor_total || 0) }))
                                : [],
                        };
                    });
                }

                const productMap: Record<string, { descricao: string; faturamento: number; vendas: Set<string> }> = {};
                let semVendaTotal = 0;
                validCRs.forEach((cr) => {
                    if (!cr.venda_id || !vendasMap[cr.venda_id]) {
                        semVendaTotal += cr.valor_pago;
                        return;
                    }
                    const venda = vendasMap[cr.venda_id];
                    const totalItens = venda.itens.reduce((s, it) => s + it.valor_total, 0);

                    if (venda.itens.length > 0 && totalItens > 0) {
                        // Rateia o valor_pago entre os itens proporcional ao share de cada um
                        venda.itens.forEach((it) => {
                            const itemShare = it.valor_total / totalItens;
                            const fat = cr.valor_pago * itemShare;
                            if (!productMap[it.descricao]) productMap[it.descricao] = { descricao: it.descricao, faturamento: 0, vendas: new Set() };
                            productMap[it.descricao].faturamento += fat;
                            productMap[it.descricao].vendas.add(cr.venda_id!);
                        });
                    } else if (venda.procedimento) {
                        const desc = venda.procedimento.trim();
                        if (!productMap[desc]) productMap[desc] = { descricao: desc, faturamento: 0, vendas: new Set() };
                        productMap[desc].faturamento += cr.valor_pago;
                        productMap[desc].vendas.add(cr.venda_id!);
                    } else {
                        semVendaTotal += cr.valor_pago;
                    }
                });

                const productBreakdown = Object.values(productMap)
                    .map(p => ({
                        descricao: p.descricao,
                        quantidade: 0,
                        faturamento: p.faturamento,
                        vendas: p.vendas.size,
                        percentual: totalRec > 0 ? (p.faturamento / totalRec) * 100 : 0,
                        semProduto: false,
                    }))
                    .sort((a, b) => b.faturamento - a.faturamento);

                if (semVendaTotal > 0) {
                    productBreakdown.push({
                        descricao: "Recebimento sem venda vinculada",
                        quantidade: 0,
                        faturamento: semVendaTotal,
                        vendas: 0,
                        percentual: totalRec > 0 ? (semVendaTotal / totalRec) * 100 : 0,
                        semProduto: true,
                    });
                }

                return {
                    byDay,
                    totalVendas: vendaIds.length,
                    totalProdutos: 0,
                    totalFaturamento: totalRec,
                    productBreakdown,
                };
            }

            const { data: vendas } = await db.from("vendas")
                .select("id, valor_total, valor_liquido, data_venda, procedimento, tipo, vendas_itens(descricao, quantidade, valor_total)")
                .eq("company_id", cId).eq("status", "confirmado")
                .gte("data_venda", periodStart).lte("data_venda", periodEnd)
                .limit(10000);

            let totalVendas = 0;
            let totalProdutos = 0;
            let totalFaturamento = 0;
            const productMap: Record<string, { descricao: string; quantidade: number; faturamento: number; vendas: Set<string> }> = {};

            (vendas || []).forEach((v: any) => {
                const valor = Number(v.valor_liquido || 0);
                if (valor <= 0 || !v.data_venda) return;
                byDay[v.data_venda] = (byDay[v.data_venda] || 0) + valor;
                totalFaturamento += valor;
                totalVendas += 1;

                const itens = Array.isArray(v.vendas_itens) ? v.vendas_itens : [];
                const totalItensVenda = itens.reduce((s: number, it: any) => s + Number(it.valor_total || 0), 0);

                if (itens.length > 0 && totalItensVenda > 0) {
                    // Distribui o valor_liquido entre itens proporcional ao share
                    itens.forEach((it: any) => {
                        const desc = (it.descricao || "Sem descrição").trim();
                        const share = Number(it.valor_total || 0) / totalItensVenda;
                        const fatLine = valor * share;
                        const qtdLine = Number(it.quantidade || 0);
                        if (!productMap[desc]) productMap[desc] = { descricao: desc, quantidade: 0, faturamento: 0, vendas: new Set() };
                        productMap[desc].faturamento += fatLine;
                        productMap[desc].quantidade += qtdLine;
                        productMap[desc].vendas.add(v.id);
                        totalProdutos += qtdLine;
                    });
                } else if (v.procedimento) {
                    // Venda tipo=contrato sem itens — usa procedimento como produto
                    const desc = String(v.procedimento).trim();
                    if (!productMap[desc]) productMap[desc] = { descricao: desc, quantidade: 0, faturamento: 0, vendas: new Set() };
                    productMap[desc].faturamento += valor;
                    productMap[desc].vendas.add(v.id);
                }
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

    // ─── Faturamento/Recebimentos diário do mês anterior (cobertura total) ───
    // Usa prevMonthEndFull (não capa no hoje) pra que os buckets semanais/mensais
    // do gráfico encontrem dados completos do mês anterior.
    const { data: prevByDay = {} } = useQuery({
        queryKey: ["dash_prev_byday", cId, prevMonthStart, prevMonthEndFull, regime, transferAccountIds],
        queryFn: async () => {
            const byDay: Record<string, number> = {};
            if (regime === "competencia") {
                const { data } = await db.from("vendas")
                    .select("valor_liquido, data_venda")
                    .eq("company_id", cId).eq("status", "confirmado")
                    .gte("data_venda", prevMonthStart).lte("data_venda", prevMonthEndFull)
                    .limit(10000);
                (data || []).forEach((r: any) => {
                    const v = Number(r.valor_liquido || 0);
                    if (v > 0 && r.data_venda) byDay[r.data_venda] = (byDay[r.data_venda] || 0) + v;
                });
            } else {
                const itensCaixa = await fetchReceitaCaixaItens(prevMonthStart, prevMonthEndFull);
                itensCaixa.forEach((r) => {
                    const v = Number(r.valor || 0);
                    if (v > 0 && r.data) byDay[r.data] = (byDay[r.data] || 0) + v;
                });
            }
            return byDay;
        },
        enabled: !!cId,
    });

    // Faturamento por bucket — Receita atual e Receita do mesmo intervalo
    // do mês anterior (alinhado por dia). Deriva de dailyRevenue + prevByDay
    // pra evitar queries extras.
    const chartRevExp = useMemo(() => {
        const ps = new Date(periodStart + "T00:00:00");
        const pe = new Date(periodEnd + "T00:00:00");
        const prevPs = new Date(prevMonthStart + "T00:00:00");
        const sumRange = (map: Record<string, number>, from: Date, to: Date) => {
            let s = 0;
            let d = from;
            while (d <= to) {
                s += map[format(d, "yyyy-MM-dd")] || 0;
                d = addDays(d, 1);
            }
            return s;
        };
        const buckets: { start: Date; end: Date; label: string }[] = [];

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

        return buckets.map((b) => {
            const offsetStart = differenceInCalendarDays(b.start, ps);
            const offsetEnd = differenceInCalendarDays(b.end, ps);
            const prevStart = addDays(prevPs, offsetStart);
            const prevEnd = addDays(prevPs, offsetEnd);
            return {
                label: b.label,
                Receita: sumRange(dailyRevenue || {}, b.start, b.end),
                ReceitaAnterior: sumRange(prevByDay as Record<string, number>, prevStart, prevEnd),
            };
        });
    }, [dailyRevenue, prevByDay, periodStart, periodEnd, prevMonthStart, periodDays, chartGranularity]);

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
        if (r < 0.25) return "#D1FAE5";
        if (r < 0.5) return "#6EE7B7";
        if (r < 0.75) return "#34D399";
        return "#059669";
    };

    const tooltipStyle = {
        backgroundColor: C.text1, color: "#fff", borderRadius: 8,
        border: "none", padding: "8px 14px", fontSize: 12,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    };

    const daysUntilDue = (dateStr: string) => {
        const diff = differenceInCalendarDays(new Date(dateStr + "T00:00:00"), today);
        if (diff === 0) return "Vence hoje";
        if (diff < 0) return `${Math.abs(diff)} dia${Math.abs(diff) > 1 ? "s" : ""} atrás`;
        return `Vence em ${diff} dia${diff > 1 ? "s" : ""}`;
    };

    const companyName = selectedCompany?.razao_social || selectedCompany?.nome_fantasia || "Empresa";

    return (
        <AppLayout title="Dashboard">
            <div style={{ width: "100%", fontFamily: "var(--font-base)" }}>
                {/* ── Header: Company Name + Period Filter (mesmo nivel) ── */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 20 }}>
                    <div>
                        <button
                            onClick={() => navigate("/dashboard")}
                            style={{
                                display: "flex", alignItems: "center", gap: 8,
                                padding: 0, marginBottom: 6,
                                border: "none", background: "transparent",
                                fontSize: 30, fontWeight: 700, color: C.text1,
                                letterSpacing: "-0.025em", lineHeight: 1.1,
                                cursor: "pointer",
                            }}
                            title="Trocar empresa"
                        >
                            {companyName}
                            <ChevronDown size={20} style={{ color: C.textMuted, marginTop: 4 }} strokeWidth={2} />
                        </button>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 12.5, color: C.textMuted, fontWeight: 500 }}>
                            <span>
                                {format(new Date(periodStart + "T00:00:00"), "dd 'de' MMM", { locale: ptBR })}
                                {" — "}
                                {format(effectivePeriodEnd, "dd 'de' MMM, yyyy", { locale: ptBR })}
                            </span>
                            <span style={{ width: 3, height: 3, borderRadius: "50%", background: C.textMuted, opacity: 0.5 }} />
                            <span>Atualizado às {format(today, "HH:mm")}</span>
                        </div>
                    </div>

                    {/* Regime + Period Filter (ao lado do título) */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                        {/* Regime toggle */}
                        <div style={{ display: "inline-flex", border: `1px solid ${C.border}`, borderRadius: 8, background: C.surface, overflow: "hidden" }}>
                            {([
                                { key: "caixa", label: "Caixa", title: "Regime de caixa: conta o que efetivamente entrou e saiu (recebimentos e pagamentos por data de pagamento)." },
                                { key: "competencia", label: "Competência", title: "Regime de competência: conta o que foi vendido e o que foi devido no período (vendas por data de venda; despesas por data de vencimento), independente do pagamento." },
                            ] as { key: "caixa" | "competencia"; label: string; title: string }[]).map((r) => (
                                <button
                                    key={r.key}
                                    onClick={() => setRegime(r.key)}
                                    title={r.title}
                                    style={{
                                        padding: "8px 14px",
                                        border: "none",
                                        background: regime === r.key ? C.goldBg : "transparent",
                                        color: regime === r.key ? "#059669" : C.text2,
                                        fontSize: 13,
                                        fontWeight: regime === r.key ? 600 : 500,
                                        cursor: "pointer",
                                    }}
                                >
                                    {r.label}
                                </button>
                            ))}
                        </div>

                    <div ref={periodMenuRef} style={{ position: "relative" }}>
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
                </div>

                {/* ── Alert Banner ── */}
                {alertItems.length > 0 && (
                    <div style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "12px 18px", borderRadius: 10,
                        border: `1px solid #FECACA`, background: C.redSoft,
                        marginBottom: 20,
                    }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <AlertTriangle size={16} style={{ color: C.red, flexShrink: 0 }} strokeWidth={2.25} />
                            <span style={{ fontSize: 13, color: "#991B1B", fontWeight: 500 }}>
                                {alertItems.join("  ·  ")}
                            </span>
                        </div>
                        <button onClick={() => navigate("/contas-pagar")} style={{
                            fontSize: 13, fontWeight: 600, color: "#991B1B", background: "none", border: "none",
                            cursor: "pointer", display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
                        }}>
                            Ver pendentes <ArrowRight size={14} />
                        </button>
                    </div>
                )}

                {/* ── 3 KPI Cards (mockup v1) ── */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14, marginBottom: 16 }}>
                    {/* 1. Faturamento */}
                    <div className="kpi-card" style={{ background: C.surface, borderRadius: 12, padding: 20, border: `1px solid ${C.border}`, boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)", display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: "#ECFDF5", color: "#059669", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <TrendingUp size={16} strokeWidth={2.25} />
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: C.text2, textTransform: "uppercase", letterSpacing: 0.6, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6 }}>
                                {regime === "competencia" ? "Faturamento" : "Recebimentos"}
                                <span title={regime === "competencia"
                                    ? "Vendas confirmadas no período (regime de competência). Fonte: 'vendas.valor_liquido' por 'data_venda', status='confirmado'."
                                    : "Recebimentos efetivos no período (regime de caixa). Fonte: 'contas_receber.valor_pago' por 'data_pagamento', status='pago'. Exclui transferências."
                                } style={{ display: "inline-flex", cursor: "help" }}>
                                    <Info size={12} style={{ color: C.textMuted }} />
                                </span>
                            </div>
                        </div>
                        <div style={{ fontSize: "clamp(24px, 2.1vw, 30px)", fontWeight: 700, color: C.text1, lineHeight: 1.1, letterSpacing: "-0.025em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontVariantNumeric: "tabular-nums" }}>{fmt(receitaPeriodo)}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                            {receitaPeriodoAnterior > 0 ? (
                                <>
                                    <span title="Variação percentual em relação ao mês passado, comparando o mesmo intervalo de dias. Cálculo: (período atual − período anterior) ÷ período anterior × 100." style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, fontWeight: 600, color: trendFat >= 0 ? "#039855" : "#E53E3E", flexShrink: 0 }}>
                                        {trendFat >= 0 ? "▲" : "▼"} {Math.abs(trendFat).toFixed(1)}%
                                    </span>
                                    <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>vs. {fmt(receitaPeriodoAnterior)} mês ant.</span>
                                </>
                            ) : (
                                <span>em {periodLabel.toLowerCase()}</span>
                            )}
                        </div>
                    </div>

                    {/* 2. Despesas */}
                    <div className="kpi-card" style={{ background: C.surface, borderRadius: 12, padding: 20, border: `1px solid ${C.border}`, boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)", display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: "#FEF2F2", color: "#B91C1C", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <TrendingDown size={16} strokeWidth={2.25} />
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: C.text2, textTransform: "uppercase", letterSpacing: 0.6, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6 }}>
                                {regime === "competencia" ? "Despesas" : "Pagamentos"}
                                <span title={regime === "competencia"
                                    ? "Despesas do período por regime de competência: soma do valor cheio de TODAS as contas a pagar (aberto, parcial, vencido, pago) com 'data_vencimento' no período. Exclui transferências."
                                    : "Pagamentos efetivos do período (regime de caixa): soma das contas pagas. Fonte: 'contas_pagar.valor_pago' por 'data_pagamento', status='pago'. Exclui transferências."
                                } style={{ display: "inline-flex", cursor: "help" }}>
                                    <Info size={12} style={{ color: C.textMuted }} />
                                </span>
                            </div>
                        </div>
                        <div style={{ fontSize: "clamp(24px, 2.1vw, 30px)", fontWeight: 700, color: C.text1, lineHeight: 1.1, letterSpacing: "-0.025em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontVariantNumeric: "tabular-nums" }}>{fmt(despesaPeriodo)}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                            {despesaPeriodoAnterior > 0 ? (
                                <>
                                    <span title="Variação percentual em relação ao mês passado, comparando o mesmo intervalo de dias. Cálculo: (período atual − período anterior) ÷ período anterior × 100." style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, fontWeight: 600, color: trendDesp <= 0 ? "#039855" : "#E53E3E", flexShrink: 0 }}>
                                        {trendDesp <= 0 ? "▼" : "▲"} {Math.abs(trendDesp).toFixed(1)}%
                                    </span>
                                    <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>vs. {fmt(despesaPeriodoAnterior)} mês ant.</span>
                                </>
                            ) : (
                                <span>{receitaPeriodo > 0 ? `${((despesaPeriodo / receitaPeriodo) * 100).toFixed(1)}% ${regime === "competencia" ? "do faturamento" : "dos recebimentos"}` : "—"}</span>
                            )}
                        </div>
                    </div>

                    {/* 3. Resultado Líquido */}
                    <div className="kpi-card" style={{ background: C.surface, borderRadius: 12, padding: 20, border: `1px solid ${C.border}`, boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)", display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: resultadoPeriodo >= 0 ? "#ECFDF5" : "#FEF2F2", color: resultadoPeriodo >= 0 ? "#059669" : "#B91C1C", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <Wallet size={16} strokeWidth={2.25} />
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: C.text2, textTransform: "uppercase", letterSpacing: 0.6, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6 }}>
                                {regime === "competencia" ? "Resultado Líquido" : "Resultado de Caixa"}
                                <span title={regime === "competencia"
                                    ? "Resultado contábil do período (DRE): Faturamento − Despesas, ambos em regime de competência. Reflete o lucro do período independente do que entrou ou saiu de caixa."
                                    : "Resultado de caixa do período: Recebimentos − Pagamentos, ambos em regime de caixa. Reflete a variação efetiva do caixa no período."
                                } style={{ display: "inline-flex", cursor: "help" }}>
                                    <Info size={12} style={{ color: C.textMuted }} />
                                </span>
                            </div>
                        </div>
                        <div style={{ fontSize: "clamp(24px, 2.1vw, 30px)", fontWeight: 700, color: resultadoPeriodo >= 0 ? "#039855" : "#E53E3E", lineHeight: 1.1, letterSpacing: "-0.025em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontVariantNumeric: "tabular-nums" }}>{fmt(resultadoPeriodo)}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                            {resultadoPeriodoAnterior !== 0 ? (
                                <>
                                    <span title="Variação percentual em relação ao mês passado, comparando o mesmo intervalo de dias. Cálculo: (período atual − período anterior) ÷ período anterior × 100." style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, fontWeight: 600, color: trendResultado >= 0 ? "#039855" : "#E53E3E", flexShrink: 0 }}>
                                        {trendResultado >= 0 ? "▲" : "▼"} {Math.abs(trendResultado).toFixed(1)}%
                                    </span>
                                    <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>vs. {fmt(resultadoPeriodoAnterior)} mês ant.</span>
                                </>
                            ) : (
                                <span>{receitaPeriodo > 0 ? `Margem ${((resultadoPeriodo / receitaPeriodo) * 100).toFixed(1)}%` : "—"}</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Heatmap: Faturamento Diário do Mês ── */}
                <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)", marginBottom: 16, overflow: "hidden" }}>
                    <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
                        <SectionTitle
                            title={regime === "competencia" ? "Faturamento Diário" : "Recebimentos Diários"}
                            subtitle={`${format(new Date(periodStart + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR })} — ${format(new Date(periodEnd + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR })}`}
                            info={regime === "competencia"
                                ? "Vendas confirmadas distribuídas por dia (regime de competência). Cada célula soma 'vendas.valor_liquido' por 'data_venda'."
                                : "Recebimentos por dia (regime de caixa). Cada célula soma 'contas_receber.valor_pago' por 'data_pagamento'. Exclui transferências."}
                            action={
                                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: C.textMuted }}>
                                    <span>Menos</span>
                                    {["#F3F4F6", "#D1FAE5", "#6EE7B7", "#34D399", "#059669"].map((c, i) => (
                                        <span key={i} style={{ width: 14, height: 14, background: c, borderRadius: 3, border: c === "#F3F4F6" ? `1px solid ${C.border}` : "none" }} />
                                    ))}
                                    <span>Mais</span>
                                </div>
                            }
                        />
                    </div>
                    {/* Mini-stats strip */}
                    {heatmap.total > 0 && (
                        <div style={{ display: "flex", gap: 0, padding: "0 20px", borderBottom: `1px solid ${C.border}`, background: "#FAFBFC" }}>
                            {[
                                { label: "Total", value: fmt(heatmap.total) },
                                { label: "Média diária", value: fmt(heatmap.avg) },
                                { label: "Melhor dia", value: heatmap.bestDay && heatmap.bestDay.value > 0 ? `${format(heatmap.bestDay.date, "dd/MM")} · ${fmt(heatmap.bestDay.value)}` : "—" },
                                { label: "Dias com vendas", value: `${heatmap.daysWithSales} / ${heatmap.days.length}` },
                            ].map((s, i, arr) => (
                                <div key={s.label} style={{ flex: 1, padding: "14px 20px", borderRight: i < arr.length - 1 ? `1px solid ${C.border}` : "none" }}>
                                    <div style={{ fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 500, marginBottom: 3 }}>{s.label}</div>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text1, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
                                </div>
                            ))}
                        </div>
                    )}
                    <div style={{ display: "flex", gap: 32, padding: 20, alignItems: "flex-start" }}>
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
                                <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
                                    <div style={{ fontSize: 13, color: C.text1, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>Produtos e serviços <span style={{ color: C.textMuted, fontWeight: 500 }}>· {monthlySales?.productBreakdown?.length ?? 0} {(monthlySales?.productBreakdown?.length ?? 0) === 1 ? "item" : "itens"}</span></div>
                                </div>
                                {monthlySales?.productBreakdown && monthlySales.productBreakdown.length > 0 ? (() => {
                                    const totalItems = monthlySales.productBreakdown.length;
                                    const totalPages = Math.max(1, Math.ceil(totalItems / PRODUCTS_PER_PAGE));
                                    const page = Math.min(productsPage, totalPages - 1);
                                    const startIdx = page * PRODUCTS_PER_PAGE;
                                    const pageItems = monthlySales.productBreakdown.slice(startIdx, startIdx + PRODUCTS_PER_PAGE);
                                    return (
                                        <>
                                            <div style={{ flex: 1, overflowY: "auto" }}>
                                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                                    <thead style={{ position: "sticky", top: 0, background: "#F9FAFB", zIndex: 1 }}>
                                                        <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                                                            <th style={{ textAlign: "left", padding: "8px 16px", fontSize: 10.5, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.4 }}>Produto</th>
                                                            <th style={{ textAlign: "right", padding: "8px 10px", fontSize: 10.5, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.4 }}>Vendas</th>
                                                            <th style={{ textAlign: "right", padding: "8px 10px", fontSize: 10.5, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.4 }}>Faturamento</th>
                                                            <th style={{ textAlign: "right", padding: "8px 16px", fontSize: 10.5, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.4 }}>%</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {pageItems.map((p, idx) => (
                                                            <tr key={p.descricao + (startIdx + idx)} style={{ borderBottom: idx === pageItems.length - 1 ? "none" : `1px solid ${C.border}`, background: p.semProduto ? "#FFF0EB" : "transparent" }}>
                                                                <td style={{ padding: "10px 16px", color: p.semProduto ? C.textMuted : C.text1, fontWeight: 500, fontStyle: p.semProduto ? "italic" : "normal", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }} title={p.descricao}>{p.descricao}</td>
                                                                <td style={{ padding: "10px 10px", textAlign: "right", color: C.text2, fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>{p.semProduto ? "—" : p.vendas.toLocaleString("pt-BR")}</td>
                                                                <td style={{ padding: "10px 10px", textAlign: "right", color: C.text1, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(p.faturamento)}</td>
                                                                <td style={{ padding: "10px 16px", textAlign: "right", color: C.textMuted, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{p.percentual.toFixed(1)}%</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                            {totalPages > 1 && (
                                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", borderTop: `1px solid ${C.border}`, background: "#F9FAFB" }}>
                                                    <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 500 }}>
                                                        Página {page + 1} de {totalPages} · {startIdx + 1}–{Math.min(startIdx + PRODUCTS_PER_PAGE, totalItems)} de {totalItems}
                                                    </span>
                                                    <div style={{ display: "flex", gap: 6 }}>
                                                        <button
                                                            onClick={() => setProductsPage((p) => Math.max(0, p - 1))}
                                                            disabled={page === 0}
                                                            style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", border: `1px solid ${C.border}`, borderRadius: 4, background: page === 0 ? "#F3F4F6" : "white", color: page === 0 ? C.textMuted : C.text1, cursor: page === 0 ? "not-allowed" : "pointer" }}
                                                        >
                                                            Anterior
                                                        </button>
                                                        <button
                                                            onClick={() => setProductsPage((p) => Math.min(totalPages - 1, p + 1))}
                                                            disabled={page >= totalPages - 1}
                                                            style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", border: `1px solid ${C.border}`, borderRadius: 4, background: page >= totalPages - 1 ? "#F3F4F6" : "white", color: page >= totalPages - 1 ? C.textMuted : C.text1, cursor: page >= totalPages - 1 ? "not-allowed" : "pointer" }}
                                                        >
                                                            Próxima
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    );
                                })() : (
                                    <div style={{ padding: "28px 14px", textAlign: "center", color: C.textMuted, fontSize: 13 }}>
                                        {regime === "competencia" ? "Nenhum produto vendido neste mês" : "Nenhum recebimento vinculado a venda no período"}
                                    </div>
                                )}
                            </div>
                            {/* Distribuição de produtos e serviços (pizza) */}
                            <div style={{ background: "#F9FAFB", borderRadius: 8, border: `1px solid ${C.border}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                                <div style={{ padding: "10px 14px 8px", borderBottom: `1px solid ${C.border}` }}>
                                    <div style={{ fontSize: 13, color: C.text1, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>Distribuição</div>
                                    <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 500, marginTop: 2 }}>Participação no faturamento</div>
                                </div>
                                {(() => {
                                    const items = monthlySales?.productBreakdown ?? [];
                                    if (items.length === 0) {
                                        return (
                                            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 14px", color: C.textMuted, fontSize: 12, textAlign: "center" }}>
                                                Sem produtos para exibir
                                            </div>
                                        );
                                    }
                                    const palette = ["#039855", "#10B981", "#34D399", "#6EE7B7", "#A7F3D0", "#EA580C", "#9CA3AF"];
                                    const TOP = 5;
                                    const sorted = [...items].sort((a, b) => b.faturamento - a.faturamento);
                                    const top = sorted.slice(0, TOP);
                                    const rest = sorted.slice(TOP);
                                    const restTotal = rest.reduce((s, p) => s + p.faturamento, 0);
                                    const restPct = rest.reduce((s, p) => s + p.percentual, 0);
                                    const data = [
                                        ...top.map((p, i) => ({ name: p.descricao, value: p.faturamento, percent: p.percentual, color: palette[i % palette.length], semProduto: p.semProduto })),
                                        ...(restTotal > 0 ? [{ name: `Outros (${rest.length})`, value: restTotal, percent: restPct, color: palette[palette.length - 1], semProduto: false }] : []),
                                    ];
                                    const maxValue = Math.max(...data.map(d => d.value));
                                    return (
                                        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "10px 14px 12px", minHeight: 0, gap: 8, maxHeight: 260, overflowY: "auto" }}>
                                            {data.map((d, i) => {
                                                const pct = maxValue > 0 ? (d.value / maxValue) * 100 : 0;
                                                return (
                                                    <div key={i} title={`${d.name} · ${fmt(d.value)} · ${d.percent.toFixed(1)}%`}>
                                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, fontSize: 11 }}>
                                                            <span style={{ color: C.text1, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontStyle: d.semProduto ? "italic" : "normal", minWidth: 0 }}>{d.name}</span>
                                                            <span style={{ color: C.text1, fontWeight: 600, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{d.percent.toFixed(1)}%</span>
                                                        </div>
                                                        <div style={{ marginTop: 3, height: 6, background: "#F1F5F9", borderRadius: 3, overflow: "hidden" }}>
                                                            <div style={{ width: `${pct}%`, height: "100%", background: d.color, borderRadius: 3 }} />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Mid Row: Faturamento Diário + Contas a Receber ── */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 368px", gap: 16, marginBottom: 16, alignItems: "start" }}>
                    {/* Faturamento do período */}
                    <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)" }}>
                        <div style={{ marginBottom: 16 }}>
                            <SectionTitle
                                title={`${regime === "competencia" ? "Faturamento" : "Recebimentos"} ${chartGranularity === "day" ? (regime === "competencia" ? "Diário" : "Diários") : chartGranularity === "week" ? (regime === "competencia" ? "Semanal" : "Semanais") : (regime === "competencia" ? "Mensal" : "Mensais")}`}
                                subtitle={`${periodLabel} · ${(chartRevExp || []).length} ${chartGranularity === "day" ? "dias" : chartGranularity === "week" ? "semanas" : "meses"}`}
                                info={regime === "competencia"
                                    ? "Vendas confirmadas agrupadas por dia/semana/mês (competência). Fonte: 'vendas.valor_liquido' por 'data_venda'."
                                    : "Recebimentos efetivos agrupados por dia/semana/mês (caixa). Fonte: 'contas_receber.valor_pago' por 'data_pagamento'. Exclui transferências."}
                                action={
                                    <div style={{ textAlign: "right" }}>
                                        <div style={{ fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 500 }}>Total no período</div>
                                        <div style={{ fontSize: 20, fontWeight: 700, color: "#039855", letterSpacing: "-0.015em", marginTop: 2 }}>
                                            {fmt((chartRevExp || []).reduce((s: number, r: any) => s + (r.Receita || 0), 0))}
                                        </div>
                                    </div>
                                }
                            />
                        </div>

                        <ResponsiveContainer width="100%" height={340}>
                            <BarChart data={chartRevExp || []} margin={{ top: 52, right: 16, left: 8, bottom: 4 }} barCategoryGap="14%" barGap={2}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                                <XAxis
                                    dataKey="label"
                                    tick={{ fontSize: 11, fill: C.text2, fontWeight: 500 }}
                                    axisLine={{ stroke: C.text2, strokeWidth: 1 }}
                                    tickLine={{ stroke: C.text2 }}
                                    interval={chartGranularity === "day" ? 1 : 0}
                                    tickMargin={8}
                                />
                                <YAxis
                                    tick={{ fontSize: 10.5, fill: C.textMuted, fontWeight: 500 }}
                                    axisLine={{ stroke: C.text2, strokeWidth: 1 }}
                                    tickLine={{ stroke: C.text2 }}
                                    tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`}
                                    width={42}
                                />
                                <Tooltip
                                    contentStyle={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)", fontSize: 12 }}
                                    itemStyle={{ color: C.text1, padding: "2px 0" }}
                                    labelStyle={{ color: C.text2, fontSize: 11, fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.4 }}
                                    formatter={(v: number, name: string) => [fmtFull(v), name]}
                                    labelFormatter={(label) => chartGranularity === "day" ? `Dia ${label}` : chartGranularity === "week" ? `Semana de ${label}` : `${label}`}
                                    cursor={{ fill: "rgba(15, 23, 42, 0.03)" }}
                                />
                                <Bar dataKey="ReceitaAnterior" name={(regime === "competencia" ? "Faturamento" : "Recebimentos") + " mês anterior"} fill="#E5E7EB" radius={[4, 4, 0, 0]} maxBarSize={40}>
                                    <LabelList dataKey="ReceitaAnterior" position="top" fontSize={10} fill={C.text2} fontWeight={500} formatter={fmtShort} />
                                </Bar>
                                <Bar dataKey="Receita" name={(regime === "competencia" ? "Faturamento" : "Recebimentos") + " atual"} fill="#059669" radius={[4, 4, 0, 0]} maxBarSize={40}>
                                    <LabelList dataKey="Receita" position="top" fontSize={10} fill={C.text1} fontWeight={600} formatter={fmtShort} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24, fontSize: 12, color: C.text2, marginTop: 10 }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                <span style={{ width: 10, height: 10, background: "#E5E7EB", borderRadius: 2, border: `1px solid ${C.border}` }} />
                                Mês anterior
                            </span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                <span style={{ width: 10, height: 10, background: "#059669", borderRadius: 2 }} />
                                Atual
                            </span>
                        </div>
                    </div>

                    {/* Contas a Receber — Buckets (mockup) */}
                    <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
                            <SectionTitle
                                title="Contas a Receber"
                                subtitle={`${periodLabel} · ${receivablesAging.totalCount} títulos`}
                                info="Títulos com status 'aberto', 'parcial' ou 'vencido' cujo vencimento cai dentro do período. Saldo = valor − valor_pago. Exclui transferências entre contas. Fonte: tabela 'contas_receber'."
                                action={
                                    <button onClick={() => navigate("/contas-receber")} style={{ fontSize: 12.5, fontWeight: 600, color: C.gold, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                                        Ver todos <ArrowRight size={13} />
                                    </button>
                                }
                            />
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
                                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#EA580C", flexShrink: 0 }} />
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text1 }}>A vencer em breve</div>
                                        <div style={{ fontSize: 12, color: C.textMuted, marginTop: 1 }}>Próximos 30 dias</div>
                                    </div>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: "#EA580C" }}>{fmt(crBuckets.aVencerBreve.total)}</div>
                                    <div style={{ fontSize: 13, color: C.textMuted, marginTop: 2 }}>{crBuckets.aVencerBreve.count} título{crBuckets.aVencerBreve.count !== 1 ? "s" : ""}</div>
                                </div>
                            </div>

                            {/* Acima de 90 dias */}
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: crBuckets.acima90.count > 0 ? "#E53E3E" : C.textMuted, flexShrink: 0 }} />
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text1 }}>Acima de 90 dias</div>
                                        <div style={{ fontSize: 12, color: C.textMuted, marginTop: 1 }}>Inadimplência crítica</div>
                                    </div>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: crBuckets.acima90.count > 0 ? "#E53E3E" : C.textMuted }}>{fmt(crBuckets.acima90.total)}</div>
                                    <div style={{ fontSize: 13, color: C.textMuted, marginTop: 2 }}>{crBuckets.acima90.count} título{crBuckets.acima90.count !== 1 ? "s" : ""}</div>
                                </div>
                            </div>
                        </div>

                        {/* Footer total */}
                        <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, background: "#FAFAF8", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div>
                                <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 500 }}>Total em aberto</div>
                                <div style={{ marginTop: 2 }}>
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, padding: "3px 9px", borderRadius: 20, background: "#ECFDF4", color: "#027A48", border: "1.5px solid #A9EFC5" }}>
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
                <div style={{ display: "grid", gridTemplateColumns: "1fr 368px", gap: 16, alignItems: "start" }}>
                    {/* Despesas Diárias do período */}
                    <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)", padding: 20, display: "flex", flexDirection: "column", minHeight: 0 }}>
                        <div style={{ marginBottom: 16 }}>
                            <SectionTitle
                                title={`${regime === "competencia" ? "Despesas" : "Pagamentos"} ${chartGranularity === "day" ? (regime === "competencia" ? "Diárias" : "Diários") : chartGranularity === "week" ? "Semanais" : "Mensais"}`}
                                subtitle={`${periodLabel} · ${(chartDespDiarias || []).length} ${chartGranularity === "day" ? "dias" : chartGranularity === "week" ? "semanas" : "meses"}`}
                                info={regime === "competencia"
                                    ? "Despesas agrupadas por dia/semana/mês conforme o tamanho do período (regime de competência). Valor cheio das contas a pagar (todos status abertos+pago) por 'data_vencimento'. Exclui transferências."
                                    : "Pagamentos agrupados por dia/semana/mês conforme o tamanho do período (regime de caixa). Valor efetivamente pago das contas. Fonte: 'contas_pagar.valor_pago' por 'data_pagamento', status='pago'. Exclui transferências."}
                                action={
                                    <div style={{ textAlign: "right" }}>
                                        <div style={{ fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 500 }}>Total no período</div>
                                        <div style={{ fontSize: 20, fontWeight: 700, color: "#7F1D1D", letterSpacing: "-0.015em", marginTop: 2 }}>
                                            {fmt((chartDespDiarias || []).reduce((s: number, r: any) => s + (r.despesa || 0), 0))}
                                        </div>
                                    </div>
                                }
                            />
                        </div>

                        <div style={{ height: 340 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartDespDiarias || []} margin={{ top: 52, right: 16, left: 8, bottom: 4 }} barCategoryGap="14%" barGap={2}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                                    <XAxis
                                        dataKey="label"
                                        tick={{ fontSize: 11, fill: C.text2, fontWeight: 500 }}
                                        axisLine={{ stroke: C.text2, strokeWidth: 1 }}
                                        tickLine={{ stroke: C.text2 }}
                                        interval={chartGranularity === "day" ? 1 : 0}
                                        tickMargin={8}
                                    />
                                    <YAxis
                                        tick={{ fontSize: 10.5, fill: C.textMuted, fontWeight: 500 }}
                                        axisLine={{ stroke: C.text2, strokeWidth: 1 }}
                                        tickLine={{ stroke: C.text2 }}
                                        tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`}
                                        width={42}
                                    />
                                    <Tooltip
                                        contentStyle={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)", fontSize: 12 }}
                                        itemStyle={{ color: C.text1, padding: "2px 0" }}
                                        labelStyle={{ color: C.text2, fontSize: 11, fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.4 }}
                                        formatter={(v: number, name: string) => [fmtFull(v), name]}
                                        labelFormatter={(label) => chartGranularity === "day" ? `Dia ${label}` : chartGranularity === "week" ? `Semana de ${label}` : `${label}`}
                                        cursor={{ fill: "rgba(15, 23, 42, 0.03)" }}
                                    />
                                    <Bar dataKey="despesaAnterior" name={(regime === "competencia" ? "Despesa" : "Pagamento") + " mês anterior"} fill="#E5E7EB" radius={[4, 4, 0, 0]} maxBarSize={40}>
                                        <LabelList dataKey="despesaAnterior" position="top" fontSize={10} fill={C.text2} fontWeight={500} formatter={fmtShort} />
                                    </Bar>
                                    <Bar dataKey="despesa" name={(regime === "competencia" ? "Despesa" : "Pagamento") + " atual"} fill="#059669" radius={[4, 4, 0, 0]} maxBarSize={40}>
                                        <LabelList dataKey="despesa" position="top" fontSize={10} fill={C.text1} fontWeight={600} formatter={fmtShort} />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24, fontSize: 12, color: C.text2, marginTop: 10 }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                <span style={{ width: 10, height: 10, background: "#E5E7EB", borderRadius: 2, border: `1px solid ${C.border}` }} />
                                Mês anterior
                            </span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                <span style={{ width: 10, height: 10, background: "#059669", borderRadius: 2 }} />
                                Atual
                            </span>
                        </div>
                    </div>

                    {/* A Pagar — Próximos 7 Dias (mockup list) */}
                    <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
                            <SectionTitle
                                title="A Pagar"
                                subtitle={`${periodLabel} · ${payables7d.length} título${payables7d.length !== 1 ? "s" : ""}`}
                                info="Títulos com status 'aberto', 'parcial' ou 'vencido' cujo vencimento cai dentro do período (regime de competência). Saldo = valor − valor_pago. Exclui transferências entre contas. Fonte: tabela 'contas_pagar'."
                                action={
                                    <button onClick={() => navigate("/contas-pagar")} style={{ fontSize: 12.5, fontWeight: 600, color: C.gold, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                                        Ver todos <ArrowRight size={13} />
                                    </button>
                                }
                            />
                        </div>

                        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                            {payables7d.length === 0 ? (
                                <p style={{ fontSize: 13, color: C.textMuted, textAlign: "center", padding: "32px 20px" }}>
                                    Nenhuma conta a pagar nos próximos 7 dias.
                                </p>
                            ) : (() => {
                                const totalPagesPay = Math.max(1, Math.ceil(payables7d.length / PAYABLES_PER_PAGE));
                                const pagePay = Math.min(payablesPage, totalPagesPay - 1);
                                const startPay = pagePay * PAYABLES_PER_PAGE;
                                const pagePayItems = payables7d.slice(startPay, startPay + PAYABLES_PER_PAGE);
                                return (
                                    <>
                                        <div style={{ flex: 1 }}>
                                            {pagePayItems.map((p: any) => {
                                                const saldo = Number(p.valor || 0) - Number(p.valor_pago || 0);
                                                const diff = differenceInCalendarDays(new Date(p.data_vencimento + "T00:00:00"), today);
                                                const isLate = diff <= 0;
                                                const isWarn = diff > 0 && diff <= 3;
                                                const dueColor = isLate ? "#E53E3E" : isWarn ? "#B45309" : "#039855";

                                                return (
                                                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: `1px solid ${C.border}` }}>
                                                        <div style={{ width: 36, height: 36, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: "#F3F4F6", color: "#6B7280", flexShrink: 0 }}>
                                                            <Building2 size={18} strokeWidth={1.75} />
                                                        </div>
                                                        <div style={{ minWidth: 0, flex: 1 }}>
                                                            <div style={{ fontSize: 13, fontWeight: 600, color: C.text1, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.credor_nome}</div>
                                                            <div style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: dueColor, marginTop: 1, fontWeight: 500 }}>
                                                                <CalendarClock size={11.5} />
                                                                {daysUntilDue(p.data_vencimento)}
                                                            </div>
                                                        </div>
                                                        <div style={{ textAlign: "right" }}>
                                                            <div style={{ fontSize: 13, fontWeight: 700, color: isLate ? "#E53E3E" : C.text1 }}>{fmt(saldo)}</div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        {totalPagesPay > 1 && (
                                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 20px", borderTop: `1px solid ${C.border}`, background: "#F9FAFB" }}>
                                                <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 500 }}>
                                                    Página {pagePay + 1} de {totalPagesPay} · {startPay + 1}–{Math.min(startPay + PAYABLES_PER_PAGE, payables7d.length)} de {payables7d.length}
                                                </span>
                                                <div style={{ display: "flex", gap: 6 }}>
                                                    <button
                                                        onClick={() => setPayablesPage((p) => Math.max(0, p - 1))}
                                                        disabled={pagePay === 0}
                                                        style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", border: `1px solid ${C.border}`, borderRadius: 4, background: pagePay === 0 ? "#F3F4F6" : "white", color: pagePay === 0 ? C.textMuted : C.text1, cursor: pagePay === 0 ? "not-allowed" : "pointer" }}
                                                    >
                                                        Anterior
                                                    </button>
                                                    <button
                                                        onClick={() => setPayablesPage((p) => Math.min(totalPagesPay - 1, p + 1))}
                                                        disabled={pagePay >= totalPagesPay - 1}
                                                        style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", border: `1px solid ${C.border}`, borderRadius: 4, background: pagePay >= totalPagesPay - 1 ? "#F3F4F6" : "white", color: pagePay >= totalPagesPay - 1 ? C.textMuted : C.text1, cursor: pagePay >= totalPagesPay - 1 ? "not-allowed" : "pointer" }}
                                                    >
                                                        Próxima
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                        </div>

                        {/* Footer total */}
                        <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, background: "#FAFAF8", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 12, color: C.textMuted, fontWeight: 500 }}>Total a pagar</span>
                            <span style={{ fontSize: 14, fontWeight: 700, color: "#E53E3E" }}>{fmt(totalPagar7d)}</span>
                        </div>
                    </div>
                </div>

            </div>
        </AppLayout>
    );
}

