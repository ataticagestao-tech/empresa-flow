import { useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  addDays,
  differenceInDays,
  parse,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Legend,
  Line,
  ComposedChart,
} from "recharts";
import { AlertTriangle, Calendar } from "lucide-react";

/* ── Design Tokens ──────────────────────────────────────────── */
const C = {
  darkCard: "#1A1F36",
  gold: "#C5A24D",
  green: "#2e7d32",
  red: "#c62828",
  text1: "#0f172a",
  text2: "#475569",
  textMuted: "#94a3b8",
  border: "#e2e8f0",
} as const;

/* ── Formatters ─────────────────────────────────────────────── */
const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(v);

const fmtPct = (v: number) => `${v.toFixed(1)}%`;

/* ── KPI Card ───────────────────────────────────────────────── */
function KpiCard({
  label,
  value,
  subtitle,
  color = C.text1,
  delta,
  deltaLabel,
}: {
  label: string;
  value: string;
  subtitle?: string;
  color?: string;
  delta?: number | null;
  deltaLabel?: string;
}) {
  const hasDelta = delta !== undefined && delta !== null && isFinite(delta);
  return (
    <div className="border border-[#ccc] rounded-lg overflow-hidden">
      <div className="bg-[#1a2e4a] px-4 py-2">
        <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">
          {label}
        </h3>
      </div>
      <div className="p-4 bg-white">
        <p className="text-xl font-bold" style={{ color }}>
          {value}
        </p>
        {hasDelta && (
          <p className="text-xs mt-1.5 flex items-center gap-1">
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
              style={{
                backgroundColor: delta > 0 ? "#e8f5e9" : delta < 0 ? "#fde8e8" : "#f1f5f9",
                color: delta > 0 ? C.green : delta < 0 ? C.red : C.textMuted,
              }}
            >
              {delta > 0 ? "▲" : delta < 0 ? "▼" : "—"} {Math.abs(delta).toFixed(1)}%
            </span>
            <span className="text-gray-400">{deltaLabel || "vs mês anterior"}</span>
          </p>
        )}
        {subtitle && (
          <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

/* ── Section Header ─────────────────────────────────────────── */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-bold text-[#1A1F36] mt-8 mb-4">{children}</h2>
  );
}

/* ── Main Component ─────────────────────────────────────────── */
export default function PainelGerencial() {
  const { selectedCompany } = useCompany();
  const { activeClient } = useAuth();
  const db = activeClient as any;
  const cId = selectedCompany?.id;

  const realToday = useMemo(() => new Date(), []);
  const realTodayStr = format(realToday, "yyyy-MM-dd");

  // ── Filtro de período ───────────────────────────────────────
  type PeriodoTipo = "mes" | "custom";
  const [periodoTipo, setPeriodoTipo] = useState<PeriodoTipo>("mes");
  const [mesSelecionado, setMesSelecionado] = useState(format(realToday, "yyyy-MM"));
  const [dataInicio, setDataInicio] = useState(format(startOfMonth(realToday), "yyyy-MM-dd"));
  const [dataFim, setDataFim] = useState(format(endOfMonth(realToday), "yyyy-MM-dd"));

  const mesesOpcoes = useMemo(() => {
    const opts: string[] = [];
    for (let i = 0; i < 24; i++) {
      opts.push(format(subMonths(realToday, i), "yyyy-MM"));
    }
    return opts;
  }, []);

  // Datas derivadas do filtro
  const monthStart = useMemo(() => {
    if (periodoTipo === "custom") return dataInicio;
    const d = parse(mesSelecionado + "-01", "yyyy-MM-dd", new Date());
    return format(startOfMonth(d), "yyyy-MM-dd");
  }, [periodoTipo, mesSelecionado, dataInicio]);

  const monthEnd = useMemo(() => {
    if (periodoTipo === "custom") return dataFim;
    const d = parse(mesSelecionado + "-01", "yyyy-MM-dd", new Date());
    return format(endOfMonth(d), "yyyy-MM-dd");
  }, [periodoTipo, mesSelecionado, dataFim]);

  // "hoje" relativo ao período (para vencimentos usa hoje real)
  const todayStr = realTodayStr;
  const today = realToday;
  const next7Str = format(addDays(realToday, 7), "yyyy-MM-dd");
  const next30Str = format(addDays(realToday, 30), "yyyy-MM-dd");
  const next60Str = format(addDays(realToday, 60), "yyyy-MM-dd");
  const next90Str = format(addDays(realToday, 90), "yyyy-MM-dd");

  // ────────────────────────────────────────────────────────────
  // SECTION 1: CAIXA E BANCOS
  // ────────────────────────────────────────────────────────────

  // Saldo via view v_saldo_contas_bancarias (saldo_inicial + movimentações = saldo real)
  const { data: bankSaldos, isLoading: loadBanks } = useQuery({
    queryKey: ["pg_banks_saldo", cId],
    queryFn: async () => {
      const { data } = await db
        .from("v_saldo_contas_bancarias")
        .select("conta_bancaria_id, nome, saldo_atual")
        .eq("company_id", cId);
      return data || [];
    },
    enabled: !!cId,
  });

  // Contagem de contas ativas (tabela real)
  const { data: bankAccounts } = useQuery({
    queryKey: ["pg_banks_count", cId],
    queryFn: async () => {
      const { data } = await db
        .from("bank_accounts")
        .select("id")
        .eq("company_id", cId)
        .eq("is_active", true);
      return data || [];
    },
    enabled: !!cId,
  });

  const saldoTotal = useMemo(
    () =>
      (bankSaldos || []).reduce(
        (s: number, a: any) => s + Number(a.saldo_atual || 0),
        0
      ),
    [bankSaldos]
  );
  const contasAtivas = (bankAccounts || []).length;

  const { data: movHoje, isLoading: loadMovHoje } = useQuery({
    queryKey: ["pg_mov_hoje", cId, todayStr],
    queryFn: async () => {
      const { data } = await db
        .from("movimentacoes")
        .select("tipo, valor")
        .eq("company_id", cId)
        .eq("data", todayStr);
      return data || [];
    },
    enabled: !!cId,
  });

  const entradasHoje = useMemo(
    () =>
      (movHoje || [])
        .filter((m: any) => m.tipo === "credito")
        .reduce((s: number, m: any) => s + Number(m.valor || 0), 0),
    [movHoje]
  );
  const saidasHoje = useMemo(
    () =>
      (movHoje || [])
        .filter((m: any) => m.tipo === "debito")
        .reduce((s: number, m: any) => s + Number(m.valor || 0), 0),
    [movHoje]
  );

  // ────────────────────────────────────────────────────────────
  // SECTION 2: CONTAS A PAGAR
  // ────────────────────────────────────────────────────────────

  const { data: cpAberto, isLoading: loadCp } = useQuery({
    queryKey: ["pg_cp_aberto", cId],
    queryFn: async () => {
      const { data } = await db
        .from("contas_pagar")
        .select("id, valor, data_vencimento, status")
        .eq("company_id", cId)
        .in("status", ["aberto", "parcial"])
        .is("deleted_at", null)
        .limit(5000);
      return data || [];
    },
    enabled: !!cId,
  });

  const cpVenceHoje = useMemo(
    () =>
      (cpAberto || [])
        .filter((p: any) => p.data_vencimento === todayStr)
        .reduce((s: number, p: any) => s + Number(p.valor || 0), 0),
    [cpAberto, todayStr]
  );

  const cpVenceSemana = useMemo(
    () =>
      (cpAberto || [])
        .filter(
          (p: any) =>
            p.data_vencimento >= todayStr && p.data_vencimento <= next7Str
        )
        .reduce((s: number, p: any) => s + Number(p.valor || 0), 0),
    [cpAberto, todayStr, next7Str]
  );

  const cpVenceMes = useMemo(
    () =>
      (cpAberto || [])
        .filter(
          (p: any) =>
            p.data_vencimento >= monthStart && p.data_vencimento <= monthEnd
        )
        .reduce((s: number, p: any) => s + Number(p.valor || 0), 0),
    [cpAberto, monthStart, monthEnd]
  );

  const cpVencido = useMemo(
    () =>
      (cpAberto || [])
        .filter((p: any) => p.data_vencimento < todayStr)
        .reduce((s: number, p: any) => s + Number(p.valor || 0), 0),
    [cpAberto, todayStr]
  );

  const cpPrevisao30 = useMemo(
    () =>
      (cpAberto || [])
        .filter(
          (p: any) =>
            p.data_vencimento >= todayStr && p.data_vencimento <= next30Str
        )
        .reduce((s: number, p: any) => s + Number(p.valor || 0), 0),
    [cpAberto, todayStr, next30Str]
  );

  // ────────────────────────────────────────────────────────────
  // SECTION 3: CONTAS A RECEBER
  // ────────────────────────────────────────────────────────────

  const { data: crAberto, isLoading: loadCr } = useQuery({
    queryKey: ["pg_cr_aberto", cId],
    queryFn: async () => {
      const { data } = await db
        .from("contas_receber")
        .select("id, valor, data_vencimento, status")
        .eq("company_id", cId)
        .in("status", ["aberto", "parcial", "vencido"])
        .is("deleted_at", null)
        .limit(5000);
      return data || [];
    },
    enabled: !!cId,
  });

  const crPrevMes = useMemo(
    () =>
      (crAberto || [])
        .filter(
          (r: any) =>
            r.data_vencimento >= monthStart && r.data_vencimento <= monthEnd
        )
        .reduce((s: number, r: any) => s + Number(r.valor || 0), 0),
    [crAberto, monthStart, monthEnd]
  );

  const { data: crRecebidoMes = 0, isLoading: loadCrPago } = useQuery({
    queryKey: ["pg_cr_pago_mes", cId, monthStart, monthEnd],
    queryFn: async () => {
      const { data } = await db
        .from("contas_receber")
        .select("valor")
        .eq("company_id", cId)
        .eq("status", "pago")
        .is("deleted_at", null)
        .gte("data_pagamento", monthStart)
        .lte("data_pagamento", monthEnd)
        .limit(5000);
      return (data || []).reduce(
        (s: number, r: any) => s + Number(r.valor || 0),
        0
      );
    },
    enabled: !!cId,
  });

  const inadimplentes = useMemo(() => {
    const items = (crAberto || []).filter(
      (r: any) =>
        (r.status === "aberto" || r.status === "parcial") &&
        r.data_vencimento < todayStr
    );
    return {
      count: items.length,
      total: items.reduce(
        (s: number, r: any) => s + Number(r.valor || 0),
        0
      ),
    };
  }, [crAberto, todayStr]);

  const totalReceber = useMemo(
    () =>
      (crAberto || []).reduce(
        (s: number, r: any) => s + Number(r.valor || 0),
        0
      ),
    [crAberto]
  );

  const previstoVsRealizado =
    crPrevMes > 0 ? (crRecebidoMes / crPrevMes) * 100 : 0;

  // ────────────────────────────────────────────────────────────
  // SECTION 4: FLUXO DE CAIXA
  // ────────────────────────────────────────────────────────────

  const crProx30 = useMemo(
    () =>
      (crAberto || [])
        .filter(
          (r: any) =>
            r.data_vencimento >= todayStr && r.data_vencimento <= next30Str
        )
        .reduce((s: number, r: any) => s + Number(r.valor || 0), 0),
    [crAberto, todayStr, next30Str]
  );
  const crProx60 = useMemo(
    () =>
      (crAberto || [])
        .filter(
          (r: any) =>
            r.data_vencimento >= todayStr && r.data_vencimento <= next60Str
        )
        .reduce((s: number, r: any) => s + Number(r.valor || 0), 0),
    [crAberto, todayStr, next60Str]
  );
  const crProx90 = useMemo(
    () =>
      (crAberto || [])
        .filter(
          (r: any) =>
            r.data_vencimento >= todayStr && r.data_vencimento <= next90Str
        )
        .reduce((s: number, r: any) => s + Number(r.valor || 0), 0),
    [crAberto, todayStr, next90Str]
  );

  const cpProx60 = useMemo(
    () =>
      (cpAberto || [])
        .filter(
          (p: any) =>
            p.data_vencimento >= todayStr && p.data_vencimento <= next60Str
        )
        .reduce((s: number, p: any) => s + Number(p.valor || 0), 0),
    [cpAberto, todayStr, next60Str]
  );
  const cpProx90 = useMemo(
    () =>
      (cpAberto || [])
        .filter(
          (p: any) =>
            p.data_vencimento >= todayStr && p.data_vencimento <= next90Str
        )
        .reduce((s: number, p: any) => s + Number(p.valor || 0), 0),
    [cpAberto, todayStr, next90Str]
  );

  const projecao30 = saldoTotal + crProx30 - cpPrevisao30;
  const projecao60 = saldoTotal + crProx60 - cpProx60;
  const projecao90 = saldoTotal + crProx90 - cpProx90;

  // Daily projected balance for area chart (next 30 days)
  const fluxoDiario = useMemo(() => {
    const days: { date: string; label: string; saldo: number }[] = [];
    let acumulado = saldoTotal;
    for (let i = 0; i <= 30; i++) {
      const d = format(addDays(today, i), "yyyy-MM-dd");
      const label = format(addDays(today, i), "dd/MM");
      const entradas = (crAberto || [])
        .filter((r: any) => r.data_vencimento === d)
        .reduce((s: number, r: any) => s + Number(r.valor || 0), 0);
      const saidas = (cpAberto || [])
        .filter((p: any) => p.data_vencimento === d)
        .reduce((s: number, p: any) => s + Number(p.valor || 0), 0);
      acumulado += entradas - saidas;
      days.push({ date: d, label, saldo: acumulado });
    }
    return days;
  }, [saldoTotal, crAberto, cpAberto, today]);

  const primeiroDiaNegativo = useMemo(() => {
    const neg = fluxoDiario.find((d) => d.saldo < 0);
    return neg ? neg.date : null;
  }, [fluxoDiario]);

  // ────────────────────────────────────────────────────────────
  // SECTION 5: DRE RESUMO
  // ────────────────────────────────────────────────────────────

  const { data: movMes, isLoading: loadDre } = useQuery({
    queryKey: ["pg_mov_mes", cId, monthStart, monthEnd],
    queryFn: async () => {
      const { data } = await db
        .from("movimentacoes")
        .select("tipo, valor, origem, categoria")
        .eq("company_id", cId)
        .gte("data", monthStart)
        .lte("data", monthEnd)
        .limit(10000);
      return data || [];
    },
    enabled: !!cId,
  });

  const receitaBruta = useMemo(
    () =>
      (movMes || [])
        .filter(
          (m: any) => m.tipo === "credito" && m.origem === "conta_receber"
        )
        .reduce((s: number, m: any) => s + Number(m.valor || 0), 0),
    [movMes]
  );

  // Despesas totais: soma das contas_pagar pagas no período
  const { data: cpPagoMes = 0 } = useQuery({
    queryKey: ["pg_cp_pago_mes", cId, monthStart, monthEnd],
    queryFn: async () => {
      const { data } = await db
        .from("contas_pagar")
        .select("valor, valor_pago")
        .eq("company_id", cId)
        .eq("status", "pago")
        .is("deleted_at", null)
        .gte("data_pagamento", monthStart)
        .lte("data_pagamento", monthEnd)
        .limit(10000);
      return (data || []).reduce(
        (s: number, r: any) => s + Number(r.valor_pago || r.valor || 0),
        0
      );
    },
    enabled: !!cId,
  });

  const despesasTotais = cpPagoMes;

  // resultadoDre movido para depois de faturamento (SECTION 6)

  // Last 6 months evolution
  const { data: dre6m = [], isLoading: loadDre6m } = useQuery({
    queryKey: ["pg_dre_6m", cId],
    queryFn: async () => {
      const months: {
        label: string;
        receita: number;
        despesa: number;
        resultado: number;
      }[] = [];
      for (let i = 5; i >= 0; i--) {
        const mDate = subMonths(today, i);
        const mStart = format(startOfMonth(mDate), "yyyy-MM-dd");
        const mEnd = format(endOfMonth(mDate), "yyyy-MM-dd");
        const mLabel = format(mDate, "MMM/yy", { locale: ptBR });

        const { data } = await db
          .from("movimentacoes")
          .select("tipo, valor, origem, categoria")
          .eq("company_id", cId)
          .gte("data", mStart)
          .lte("data", mEnd)
          .limit(10000);

        const rows = data || [];
        const rec = rows
          .filter(
            (m: any) => m.tipo === "credito" && m.origem === "conta_receber"
          )
          .reduce((s: number, m: any) => s + Number(m.valor || 0), 0);
        const desp = rows
          .filter(
            (m: any) =>
              m.tipo === "debito" &&
              m.origem !== "transferencia" &&
              m.categoria !== "transferencia"
          )
          .reduce((s: number, m: any) => s + Number(m.valor || 0), 0);

        months.push({
          label: mLabel,
          receita: rec,
          despesa: desp,
          resultado: rec - desp,
        });
      }
      return months;
    },
    enabled: !!cId,
  });

  // ────────────────────────────────────────────────────────────
  // SECTION 6: INDICADORES GERENCIAIS
  // ────────────────────────────────────────────────────────────

  const { data: vendasMes, isLoading: loadVendas } = useQuery({
    queryKey: ["pg_vendas_mes", cId, monthStart, monthEnd],
    queryFn: async () => {
      const { data } = await db
        .from("vendas")
        .select("id, valor_total")
        .eq("company_id", cId)
        .eq("status", "confirmado")
        .gte("data_venda", monthStart)
        .lte("data_venda", monthEnd)
        .limit(5000);
      return data || [];
    },
    enabled: !!cId,
  });

  const faturamento = useMemo(
    () =>
      (vendasMes || []).reduce(
        (s: number, v: any) => s + Number(v.valor_total || 0),
        0
      ),
    [vendasMes]
  );
  const nVendas = (vendasMes || []).length;
  const ticketMedio = nVendas > 0 ? faturamento / nVendas : 0;
  const resultadoDre = faturamento - despesasTotais;
  const margemLiquida =
    faturamento > 0 ? (resultadoDre / faturamento) * 100 : 0;
  const inadimplenciaRate =
    totalReceber > 0 ? (inadimplentes.total / totalReceber) * 100 : 0;
  const despesasReceita =
    receitaBruta > 0 ? (despesasTotais / receitaBruta) * 100 : 0;

  // Previous month faturamento for evolution
  const prevMonthStart = format(
    startOfMonth(subMonths(today, 1)),
    "yyyy-MM-dd"
  );
  const prevMonthEnd = format(endOfMonth(subMonths(today, 1)), "yyyy-MM-dd");

  const { data: faturamentoAnterior = 0 } = useQuery({
    queryKey: ["pg_vendas_prev", cId, prevMonthStart, prevMonthEnd],
    queryFn: async () => {
      const { data } = await db
        .from("vendas")
        .select("valor_total")
        .eq("company_id", cId)
        .eq("status", "confirmado")
        .gte("data_venda", prevMonthStart)
        .lte("data_venda", prevMonthEnd)
        .limit(5000);
      return (data || []).reduce(
        (s: number, v: any) => s + Number(v.valor_total || 0),
        0
      );
    },
    enabled: !!cId,
  });

  const evolucaoMensal =
    faturamentoAnterior > 0
      ? ((faturamento - faturamentoAnterior) / faturamentoAnterior) * 100
      : 0;

  // ────────────────────────────────────────────────────────────
  // COMPARATIVOS MÊS ANTERIOR (para deltas nos KPIs)
  // ────────────────────────────────────────────────────────────

  // CR previsto mês anterior
  const { data: prevCrPrev = 0 } = useQuery({
    queryKey: ["pg_prev_cr_prev", cId, prevMonthStart, prevMonthEnd],
    queryFn: async () => {
      const { data } = await db
        .from("contas_receber").select("valor").eq("company_id", cId)
        .in("status", ["aberto", "parcial", "vencido", "pago"])
        .is("deleted_at", null)
        .gte("data_vencimento", prevMonthStart).lte("data_vencimento", prevMonthEnd).limit(5000);
      return (data || []).reduce((s: number, r: any) => s + Number(r.valor || 0), 0);
    },
    enabled: !!cId,
  });

  // CR recebido mês anterior
  const { data: prevCrRecebido = 0 } = useQuery({
    queryKey: ["pg_prev_cr_receb", cId, prevMonthStart, prevMonthEnd],
    queryFn: async () => {
      const { data } = await db
        .from("contas_receber").select("valor").eq("company_id", cId)
        .eq("status", "pago").is("deleted_at", null)
        .gte("data_pagamento", prevMonthStart).lte("data_pagamento", prevMonthEnd).limit(5000);
      return (data || []).reduce((s: number, r: any) => s + Number(r.valor || 0), 0);
    },
    enabled: !!cId,
  });

  // CP vence mês anterior
  const { data: prevCpMes = 0 } = useQuery({
    queryKey: ["pg_prev_cp_mes", cId, prevMonthStart, prevMonthEnd],
    queryFn: async () => {
      const { data } = await db
        .from("contas_pagar").select("valor").eq("company_id", cId)
        .in("status", ["aberto", "parcial", "pago"])
        .is("deleted_at", null)
        .gte("data_vencimento", prevMonthStart).lte("data_vencimento", prevMonthEnd).limit(5000);
      return (data || []).reduce((s: number, p: any) => s + Number(p.valor || 0), 0);
    },
    enabled: !!cId,
  });

  // Inadimplência mês anterior (títulos vencidos no mês anterior)
  const { data: prevInadTotal = 0 } = useQuery({
    queryKey: ["pg_prev_inad", cId, prevMonthEnd],
    queryFn: async () => {
      const { data } = await db
        .from("contas_receber").select("valor").eq("company_id", cId)
        .in("status", ["aberto", "parcial"])
        .is("deleted_at", null)
        .lt("data_vencimento", prevMonthEnd).limit(5000);
      return (data || []).reduce((s: number, r: any) => s + Number(r.valor || 0), 0);
    },
    enabled: !!cId,
  });

  // Receita bruta mês anterior (movimentações)
  const { data: prevReceitaBruta = 0 } = useQuery({
    queryKey: ["pg_prev_receita", cId, prevMonthStart, prevMonthEnd],
    queryFn: async () => {
      const { data } = await db
        .from("movimentacoes").select("valor").eq("company_id", cId)
        .eq("tipo", "credito").eq("origem", "conta_receber")
        .gte("data", prevMonthStart).lte("data", prevMonthEnd).limit(10000);
      return (data || []).reduce((s: number, m: any) => s + Number(m.valor || 0), 0);
    },
    enabled: !!cId,
  });

  // Despesas mês anterior
  const { data: prevDespesas = 0 } = useQuery({
    queryKey: ["pg_prev_despesas", cId, prevMonthStart, prevMonthEnd],
    queryFn: async () => {
      const { data } = await db
        .from("movimentacoes").select("valor, origem, categoria").eq("company_id", cId)
        .eq("tipo", "debito")
        .gte("data", prevMonthStart).lte("data", prevMonthEnd).limit(10000);
      return (data || []).filter((m: any) => m.origem !== "transferencia" && m.categoria !== "transferencia")
        .reduce((s: number, m: any) => s + Number(m.valor || 0), 0);
    },
    enabled: !!cId,
  });

  // Helper: calcula delta %
  const pctDelta = (atual: number, anterior: number) =>
    anterior > 0 ? ((atual - anterior) / anterior) * 100 : atual > 0 ? 100 : null;

  const deltaFaturamento = pctDelta(faturamento, faturamentoAnterior);
  const deltaCrPrev = pctDelta(crPrevMes, prevCrPrev);
  const deltaCrRecebido = pctDelta(crRecebidoMes, prevCrRecebido);
  const deltaInad = pctDelta(inadimplentes.total, prevInadTotal);
  const deltaCpMes = pctDelta(cpVenceMes, prevCpMes);
  const deltaCpAtraso = pctDelta(cpVencido, prevCpMes > 0 ? prevCpMes : 1);
  const deltaReceita = pctDelta(receitaBruta, prevReceitaBruta);
  const deltaDespesas = pctDelta(despesasTotais, prevDespesas);
  const prevResultado = prevReceitaBruta - prevDespesas;
  const deltaResultado = pctDelta(resultadoDre, Math.abs(prevResultado) > 0 ? prevResultado : 1);

  // ────────────────────────────────────────────────────────────
  // SECTION 7: LEITURA GERENCIAL
  // ────────────────────────────────────────────────────────────

  const insights = useMemo(() => {
    const list: { text: string; type: "danger" | "warning" | "success" }[] = [];

    if (inadimplenciaRate > 10)
      list.push({
        text: `Inadimplencia em ${fmtPct(inadimplenciaRate)} - acionar cobranca dos ${inadimplentes.count} titulos vencidos (${fmt(inadimplentes.total)})`,
        type: "danger",
      });
    if (despesasReceita > 85)
      list.push({
        text: `Despesas consomem ${fmtPct(despesasReceita)} da receita - avaliar cortes imediatos`,
        type: "danger",
      });
    if (projecao30 < 0)
      list.push({
        text: `Projecao de caixa negativa em 30 dias (${fmt(projecao30)}) - travar gastos nao essenciais`,
        type: "danger",
      });
    if (cpVencido > 0)
      list.push({
        text: `${fmt(cpVencido)} em contas a pagar vencidas - renegociar ou priorizar pagamento`,
        type: "warning",
      });
    if (primeiroDiaNegativo)
      list.push({
        text: `ALERTA: Risco de falta de caixa em ${format(new Date(primeiroDiaNegativo + "T12:00:00"), "dd/MM/yyyy")}`,
        type: "danger",
      });
    if (margemLiquida > 15)
      list.push({
        text: `Margem liquida saudavel em ${fmtPct(margemLiquida)}`,
        type: "success",
      });
    if (evolucaoMensal > 5)
      list.push({
        text: `Faturamento cresceu ${fmtPct(evolucaoMensal)} vs mes anterior`,
        type: "success",
      });
    if (evolucaoMensal < -5)
      list.push({
        text: `Faturamento caiu ${fmtPct(Math.abs(evolucaoMensal))} vs mes anterior - investigar causas`,
        type: "warning",
      });
    if (previstoVsRealizado > 80 && crPrevMes > 0)
      list.push({
        text: `Recebimentos no mes atingiram ${fmtPct(previstoVsRealizado)} do previsto`,
        type: "success",
      });
    if (previstoVsRealizado < 50 && crPrevMes > 0)
      list.push({
        text: `Recebimentos no mes apenas ${fmtPct(previstoVsRealizado)} do previsto - intensificar cobranca`,
        type: "warning",
      });

    if (list.length === 0)
      list.push({
        text: "Sem alertas relevantes no momento. Indicadores dentro dos parametros normais.",
        type: "success",
      });

    return list;
  }, [
    inadimplenciaRate,
    inadimplentes,
    despesasReceita,
    projecao30,
    cpVencido,
    primeiroDiaNegativo,
    margemLiquida,
    evolucaoMensal,
    previstoVsRealizado,
    crPrevMes,
  ]);

  // ────────────────────────────────────────────────────────────
  // FATURAMENTO DIÁRIO (gráfico barras + média acumulada)
  // ────────────────────────────────────────────────────────────

  const { data: vendasDiarias = [], isLoading: loadVendasDiarias } = useQuery({
    queryKey: ["pg_vendas_diarias", cId, monthStart, monthEnd],
    queryFn: async () => {
      const { data } = await db
        .from("vendas")
        .select("data_venda, valor_total")
        .eq("company_id", cId)
        .eq("status", "confirmado")
        .gte("data_venda", monthStart)
        .lte("data_venda", monthEnd)
        .order("data_venda")
        .limit(10000);
      // Agrupar por dia
      const porDia: Record<string, number> = {};
      (data || []).forEach((v: any) => {
        const d = v.data_venda;
        porDia[d] = (porDia[d] || 0) + Number(v.valor_total || 0);
      });
      let acum = 0;
      let count = 0;
      return Object.entries(porDia)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([dia, total]) => {
          acum += total;
          count++;
          return {
            dia: dia.slice(8, 10), // DD
            faturamento: total,
            media: acum / count,
          };
        });
    },
    enabled: !!cId,
  });

  // ────────────────────────────────────────────────────────────
  // RECEBIMENTOS PREVISTO VS REALIZADO (6 meses)
  // ────────────────────────────────────────────────────────────

  const { data: recebMensal = [], isLoading: loadRecebMensal } = useQuery({
    queryKey: ["pg_receb_mensal", cId],
    queryFn: async () => {
      const meses: { label: string; previsto: number; realizado: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const mDate = subMonths(today, i);
        const mStart = format(startOfMonth(mDate), "yyyy-MM-dd");
        const mEnd = format(endOfMonth(mDate), "yyyy-MM-dd");
        const mLabel = format(mDate, "MMM", { locale: ptBR });

        const [prevRes, realRes] = await Promise.all([
          db.from("contas_receber").select("valor").eq("company_id", cId)
            .in("status", ["aberto", "parcial", "vencido", "pago"])
            .is("deleted_at", null)
            .gte("data_vencimento", mStart).lte("data_vencimento", mEnd).limit(5000),
          db.from("contas_receber").select("valor").eq("company_id", cId)
            .eq("status", "pago").is("deleted_at", null)
            .gte("data_pagamento", mStart).lte("data_pagamento", mEnd).limit(5000),
        ]);

        const prev = (prevRes.data || []).reduce((s: number, r: any) => s + Number(r.valor || 0), 0);
        const real = (realRes.data || []).reduce((s: number, r: any) => s + Number(r.valor || 0), 0);
        meses.push({ label: mLabel, previsto: prev, realizado: real });
      }
      return meses;
    },
    enabled: !!cId,
  });

  // ────────────────────────────────────────────────────────────
  // COMPOSIÇÃO DO CONTAS A RECEBER (donut)
  // ────────────────────────────────────────────────────────────

  const crAVencer = useMemo(
    () => (crAberto || [])
      .filter((r: any) => r.data_vencimento >= todayStr)
      .reduce((s: number, r: any) => s + Number(r.valor || 0), 0),
    [crAberto, todayStr]
  );

  const composicaoCR = useMemo(() => [
    { name: `Recebido ${fmt(crRecebidoMes)}`, value: crRecebidoMes, color: C.green },
    { name: `A vencer ${fmt(crAVencer)}`, value: crAVencer, color: C.gold },
    { name: `Inadimplente ${fmt(inadimplentes.total)}`, value: inadimplentes.total, color: C.red },
  ], [crRecebidoMes, crAVencer, inadimplentes.total]);

  // ────────────────────────────────────────────────────────────
  // FLUXO DE CAIXA — projeção 90 dias (semanal)
  // ────────────────────────────────────────────────────────────

  const fluxoSemanal = useMemo(() => {
    const weeks: { label: string; saldo: number; entradas: number; saidas: number }[] = [];
    let acumulado = saldoTotal;
    for (let w = 0; w <= 12; w++) {
      const wStart = addDays(today, w * 7);
      const wEnd = addDays(today, (w + 1) * 7 - 1);
      const wStartStr = format(wStart, "yyyy-MM-dd");
      const wEndStr = format(wEnd, "yyyy-MM-dd");
      const ent = (crAberto || [])
        .filter((r: any) => r.data_vencimento >= wStartStr && r.data_vencimento <= wEndStr)
        .reduce((s: number, r: any) => s + Number(r.valor || 0), 0);
      const sai = (cpAberto || [])
        .filter((p: any) => p.data_vencimento >= wStartStr && p.data_vencimento <= wEndStr)
        .reduce((s: number, p: any) => s + Number(p.valor || 0), 0);
      acumulado += ent - sai;
      weeks.push({
        label: w === 0 ? "Hoje" : `Sem ${w}`,
        saldo: acumulado,
        entradas: ent,
        saidas: sai,
      });
    }
    return weeks;
  }, [saldoTotal, crAberto, cpAberto, today]);

  // ────────────────────────────────────────────────────────────
  // Loading state
  // ────────────────────────────────────────────────────────────

  const isLoading =
    loadBanks ||
    loadMovHoje ||
    loadCp ||
    loadCr ||
    loadCrPago ||
    loadDre ||
    loadDre6m ||
    loadVendas ||
    loadVendasDiarias ||
    loadRecebMensal;

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64 text-gray-400 text-lg">
          Carregando...
        </div>
      </AppLayout>
    );
  }

  // ────────────────────────────────────────────────────────────
  // Periodo label
  // ────────────────────────────────────────────────────────────

  const periodoLabel = periodoTipo === "mes"
    ? format(parse(mesSelecionado + "-01", "yyyy-MM-dd", new Date()), "MMMM yyyy", { locale: ptBR })
    : `${format(new Date(dataInicio + "T12:00:00"), "dd/MM/yyyy")} a ${format(new Date(dataFim + "T12:00:00"), "dd/MM/yyyy")}`;

  const fmtR = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  // ────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 pb-12">

        {/* ── HEADER + FILTRO ─────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap mt-6 mb-2">
          <p className="text-sm text-gray-500">
            Cockpit financeiro consolidado &mdash; {format(realToday, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex border border-[#e2e8f0] rounded-lg overflow-hidden">
              <button
                onClick={() => setPeriodoTipo("mes")}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${periodoTipo === "mes" ? "bg-[#1a2e4a] text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              >Mês</button>
              <button
                onClick={() => setPeriodoTipo("custom")}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${periodoTipo === "custom" ? "bg-[#1a2e4a] text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              ><Calendar className="h-3 w-3 inline mr-1" />Personalizado</button>
            </div>
            {periodoTipo === "mes" ? (
              <select value={mesSelecionado} onChange={(e) => setMesSelecionado(e.target.value)}
                className="h-8 px-3 text-xs border border-[#e2e8f0] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20">
                {mesesOpcoes.map((m) => (
                  <option key={m} value={m}>{format(parse(m + "-01", "yyyy-MM-dd", new Date()), "MMMM yyyy", { locale: ptBR })}</option>
                ))}
              </select>
            ) : (
              <div className="flex items-center gap-1.5">
                <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)}
                  className="h-8 px-2 text-xs border border-[#e2e8f0] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20" />
                <span className="text-xs text-gray-400">a</span>
                <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)}
                  className="h-8 px-2 text-xs border border-[#e2e8f0] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20" />
              </div>
            )}
          </div>
        </div>

        {/* ── TOP KPIs ────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <KpiCard label="Faturamento" value={fmt(faturamento)} color={C.green} subtitle={`${nVendas} vendas | TM ${fmt(ticketMedio)}`} delta={deltaFaturamento} />
          <KpiCard label="Despesas totais" value={fmt(despesasTotais)} color={C.red} delta={deltaDespesas} deltaLabel={deltaDespesas && deltaDespesas > 0 ? "↑ vs mês anterior" : "vs mês anterior"} />
          <KpiCard label="Resultado" value={fmt(resultadoDre)} color={resultadoDre >= 0 ? C.green : C.red} delta={deltaResultado} />
        </div>

        {/* ── INADIMPLÊNCIA ALERTA ────────────────────────────── */}
        {inadimplentes.total > 0 && (
          <div className="border-2 border-red-300 bg-red-50 rounded-lg px-5 py-4 mb-6 flex items-center justify-between">
            <div>
              <p className="text-sm text-red-700">
                <span className="font-bold">Inadimplência</span> &mdash; {inadimplentes.count.toLocaleString("pt-BR")} títulos em aberto
              </p>
              {deltaInad !== null && isFinite(deltaInad) && (
                <p className="text-xs text-red-500 mt-1">
                  {deltaInad > 0 ? "▲" : "▼"} {Math.abs(deltaInad).toFixed(1)}% vs mês anterior
                </p>
              )}
            </div>
            <p className="text-xl font-bold text-red-700">{fmtR(inadimplentes.total)}</p>
          </div>
        )}

        {/* ── FATURAMENTO DIÁRIO ──────────────────────────────── */}
        <SectionTitle>Faturamento diário &mdash; {periodoLabel}</SectionTitle>
        <div className="border border-[#ccc] rounded-lg overflow-hidden bg-white p-4 mb-8">
          {vendasDiarias.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={vendasDiarias}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="dia" tick={{ fontSize: 11 }} label={{ value: "Dia do mês", position: "insideBottom", offset: -5, fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `R$ ${(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`} />
                <Tooltip formatter={(v: number, name: string) => [fmtR(v), name === "faturamento" ? "Faturamento dia" : "Média diária acumulada"]} />
                <Legend formatter={(v: string) => v === "faturamento" ? "Faturamento dia" : "Média diária acumulada"} />
                <Bar dataKey="faturamento" fill="#1a2e4a" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="media" stroke={C.gold} strokeWidth={2} dot={{ r: 4, fill: C.gold }} name="media" />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-gray-400 py-8">Sem vendas no período</p>
          )}
        </div>

        {/* ── CONTAS A PAGAR — AGING ──────────────────────────── */}
        <SectionTitle>Contas a pagar &mdash; aging</SectionTitle>
        <div className="border border-[#ccc] rounded-lg overflow-hidden bg-white p-4 mb-8">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={[
              { faixa: "Vence hoje", valor: cpVenceHoje },
              { faixa: "Esta semana", valor: cpVenceSemana },
              { faixa: "Este mês", valor: cpVenceMes },
              { faixa: "Em atraso", valor: cpVencido },
              { faixa: "Próx. 30d", valor: cpPrevisao30 },
            ]}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="faixa" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`} />
              <Tooltip formatter={(v: number) => [fmtR(v), "Valor (R$)"]} />
              <Legend formatter={() => "Valor (R$)"} />
              <Bar dataKey="valor" fill="#1a2e4a" radius={[4, 4, 0, 0]} name="valor" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ── RECEBIMENTOS PREVISTO VS REALIZADO + COMPOSIÇÃO CR ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Previsto vs Realizado */}
          <div>
            <SectionTitle>Recebimentos &mdash; previsto vs realizado</SectionTitle>
            <div className="border border-[#ccc] rounded-lg overflow-hidden bg-white p-4">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={recebMensal}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`} />
                  <Tooltip formatter={(v: number) => fmtR(v)} />
                  <Legend />
                  <Bar dataKey="previsto" fill={C.gold} name="Previsto" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="realizado" fill={C.green} name="Realizado" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Composição do CR */}
          <div>
            <SectionTitle>Composição do contas a receber</SectionTitle>
            <div className="border border-[#ccc] rounded-lg overflow-hidden bg-white p-4">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={composicaoCR}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={110}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                  >
                    {composicaoCR.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Legend formatter={(value: string) => <span className="text-xs">{value}</span>} />
                  <Tooltip formatter={(v: number) => fmtR(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ── FLUXO DE CAIXA — projeção 90 dias ───────────────── */}
        <SectionTitle>Fluxo de caixa &mdash; projeção 90 dias</SectionTitle>

        {primeiroDiaNegativo && (
          <div className="bg-red-50 border border-red-300 rounded-lg p-4 mb-4 flex items-center gap-3">
            <AlertTriangle className="text-red-600 shrink-0" size={24} />
            <div>
              <p className="text-red-800 font-bold text-sm">
                ALERTA: Risco de falta de caixa em {format(new Date(primeiroDiaNegativo + "T12:00:00"), "dd/MM/yyyy")}
              </p>
              <p className="text-red-600 text-xs mt-1">
                Revise pagamentos e antecipe recebimentos para evitar saldo negativo.
              </p>
            </div>
          </div>
        )}

        <div className="border border-[#ccc] rounded-lg overflow-hidden bg-white p-4 mb-8">
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={fluxoSemanal}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `R$ ${(v / 1000).toFixed(0)}.000`} />
              <Tooltip formatter={(v: number, name: string) => [
                fmtR(v),
                name === "saldo" ? "Saldo projetado" : name === "entradas" ? "Entradas" : "Saídas"
              ]} />
              <Legend formatter={(v: string) => v === "saldo" ? "Saldo projetado" : v === "entradas" ? "Entradas" : "Saídas"} />
              <Area type="monotone" dataKey="saldo" stroke="#1a2e4a" fill="#1a2e4a" fillOpacity={0.08} strokeWidth={2.5} name="saldo" />
              <Bar dataKey="entradas" fill={C.green} radius={[2, 2, 0, 0]} name="entradas" barSize={8} />
              <Bar dataKey="saidas" fill={C.red} radius={[2, 2, 0, 0]} name="saidas" barSize={8} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* ── LEITURA GERENCIAL ────────────────────────────────── */}
        <SectionTitle>Leitura Gerencial</SectionTitle>
        <div className="rounded-lg p-6 mb-4" style={{ backgroundColor: C.darkCard }}>
          <h3 className="text-white text-sm font-bold mb-4 uppercase tracking-widest">
            Insights Automatizados
          </h3>
          <div className="space-y-3">
            {insights.map((ins, idx) => {
              const dotColor = ins.type === "danger" ? "#ef4444" : ins.type === "warning" ? "#eab308" : "#22c55e";
              return (
                <div key={idx} className="flex items-start gap-3">
                  <span className="inline-block w-2.5 h-2.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: dotColor }} />
                  <p className="text-white text-sm leading-relaxed">{ins.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
