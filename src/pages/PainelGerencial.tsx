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
} from "recharts";
import { TrendingUp, TrendingDown, AlertTriangle, Calendar } from "lucide-react";

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
}: {
  label: string;
  value: string;
  subtitle?: string;
  color?: string;
}) {
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

  const { data: bankAccounts, isLoading: loadBanks } = useQuery({
    queryKey: ["pg_banks", cId],
    queryFn: async () => {
      const { data } = await db
        .from("bank_accounts")
        .select("id, name, current_balance, is_active")
        .eq("company_id", cId)
        .eq("is_active", true);
      return data || [];
    },
    enabled: !!cId,
  });

  const saldoTotal = useMemo(
    () =>
      (bankAccounts || []).reduce(
        (s: number, a: any) => s + Number(a.current_balance || 0),
        0
      ),
    [bankAccounts]
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

  const despesasTotais = useMemo(
    () =>
      (movMes || [])
        .filter(
          (m: any) =>
            m.tipo === "debito" &&
            m.origem !== "transferencia" &&
            m.categoria !== "transferencia"
        )
        .reduce((s: number, m: any) => s + Number(m.valor || 0), 0),
    [movMes]
  );

  const resultadoDre = receitaBruta - despesasTotais;
  const margemLiquida =
    receitaBruta > 0 ? (resultadoDre / receitaBruta) * 100 : 0;

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
    loadVendas;

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
  // Chart colors
  // ────────────────────────────────────────────────────────────

  const CHART_COLORS = [C.green, C.red, C.gold, "#3b82f6", "#8b5cf6", "#06b6d4"];

  // ────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 pb-12">
        <div className="flex items-start justify-between gap-4 flex-wrap mt-6 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#1A1F36] mb-1">
              Painel Gerencial
            </h1>
            <p className="text-sm text-gray-500">
              Cockpit financeiro consolidado
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex border border-[#e2e8f0] rounded-lg overflow-hidden">
              <button
                onClick={() => setPeriodoTipo("mes")}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  periodoTipo === "mes"
                    ? "bg-[#1a2e4a] text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                Mês
              </button>
              <button
                onClick={() => setPeriodoTipo("custom")}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  periodoTipo === "custom"
                    ? "bg-[#1a2e4a] text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Calendar className="h-3 w-3 inline mr-1" />
                Personalizado
              </button>
            </div>
            {periodoTipo === "mes" ? (
              <select
                value={mesSelecionado}
                onChange={(e) => setMesSelecionado(e.target.value)}
                className="h-8 px-3 text-xs border border-[#e2e8f0] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
              >
                {mesesOpcoes.map((m) => (
                  <option key={m} value={m}>
                    {format(parse(m + "-01", "yyyy-MM-dd", new Date()), "MMMM yyyy", { locale: ptBR })}
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                  className="h-8 px-2 text-xs border border-[#e2e8f0] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
                />
                <span className="text-xs text-gray-400">a</span>
                <input
                  type="date"
                  value={dataFim}
                  onChange={(e) => setDataFim(e.target.value)}
                  className="h-8 px-2 text-xs border border-[#e2e8f0] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
                />
              </div>
            )}
          </div>
        </div>

        {/* ── SECTION 1: CAIXA E BANCOS ─────────────────────── */}
        <SectionTitle>Caixa e Bancos</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            label="Saldo Total em Caixa"
            value={fmt(saldoTotal)}
            color={saldoTotal >= 0 ? C.green : C.red}
          />
          <KpiCard
            label="Contas Ativas"
            value={String(contasAtivas)}
            color={C.text1}
          />
          <KpiCard
            label="Entradas Hoje"
            value={fmt(entradasHoje)}
            color={C.green}
          />
          <KpiCard
            label="Saidas Hoje"
            value={fmt(saidasHoje)}
            color={C.red}
          />
        </div>

        {/* ── SECTION 2: CONTAS A PAGAR ─────────────────────── */}
        <SectionTitle>Contas a Pagar</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <KpiCard
            label="Vence Hoje"
            value={fmt(cpVenceHoje)}
            color={cpVenceHoje > 0 ? C.gold : C.text1}
          />
          <KpiCard
            label="Vence esta Semana"
            value={fmt(cpVenceSemana)}
            color={C.text1}
          />
          <KpiCard
            label="Vence este Mes"
            value={fmt(cpVenceMes)}
            color={C.text1}
          />
          <KpiCard
            label="Em Atraso"
            value={fmt(cpVencido)}
            color={C.red}
            subtitle={cpVencido > 0 ? "Requer atencao imediata" : undefined}
          />
          <KpiCard
            label="Previsao Desembolso 30d"
            value={fmt(cpPrevisao30)}
            color={C.text1}
          />
        </div>

        {/* ── SECTION 3: CONTAS A RECEBER ───────────────────── */}
        <SectionTitle>Contas a Receber</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            label="Entradas Previstas (mes)"
            value={fmt(crPrevMes)}
            color={C.text1}
          />
          <KpiCard
            label="Recebido no Mes"
            value={fmt(crRecebidoMes)}
            color={C.green}
          />
          <KpiCard
            label="Inadimplencia"
            value={`${inadimplentes.count} titulos | ${fmt(inadimplentes.total)}`}
            color={inadimplentes.count > 0 ? C.red : C.green}
          />
          <KpiCard
            label="Previsto vs Realizado"
            value={fmtPct(previstoVsRealizado)}
            color={previstoVsRealizado >= 80 ? C.green : C.gold}
            subtitle={`${fmt(crRecebidoMes)} de ${fmt(crPrevMes)}`}
          />
        </div>

        {/* ── SECTION 4: FLUXO DE CAIXA ─────────────────────── */}
        <SectionTitle>Fluxo de Caixa - Projecoes</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <KpiCard
            label="Projecao 30 dias"
            value={fmt(projecao30)}
            color={projecao30 >= 0 ? C.green : C.red}
          />
          <KpiCard
            label="Projecao 60 dias"
            value={fmt(projecao60)}
            color={projecao60 >= 0 ? C.green : C.red}
          />
          <KpiCard
            label="Projecao 90 dias"
            value={fmt(projecao90)}
            color={projecao90 >= 0 ? C.green : C.red}
          />
        </div>

        {primeiroDiaNegativo && (
          <div className="bg-red-50 border border-red-300 rounded-lg p-4 mb-6 flex items-center gap-3">
            <AlertTriangle className="text-red-600 shrink-0" size={24} />
            <div>
              <p className="text-red-800 font-bold text-sm">
                ALERTA: Risco de falta de caixa em{" "}
                {format(
                  new Date(primeiroDiaNegativo + "T12:00:00"),
                  "dd/MM/yyyy"
                )}
              </p>
              <p className="text-red-600 text-xs mt-1">
                Revise pagamentos e antecipe recebimentos para evitar saldo
                negativo.
              </p>
            </div>
          </div>
        )}

        <div className="border border-[#ccc] rounded-lg overflow-hidden mb-6">
          <div className="bg-[#1a2e4a] px-4 py-2">
            <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">
              Saldo Projetado - Proximos 30 dias
            </h3>
          </div>
          <div className="p-4 bg-white">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={fluxoDiario}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10 }}
                  interval={4}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: number) =>
                    `${(v / 1000).toFixed(0)}k`
                  }
                />
                <Tooltip
                  formatter={(v: number) => [fmt(v), "Saldo"]}
                  labelStyle={{ fontWeight: "bold" }}
                />
                <Area
                  type="monotone"
                  dataKey="saldo"
                  stroke={C.green}
                  fill={C.green}
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── SECTION 5: DRE RESUMO ─────────────────────────── */}
        <SectionTitle>DRE Resumo - Mes Atual</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <KpiCard
            label="Receita Bruta"
            value={fmt(receitaBruta)}
            color={C.green}
          />
          <KpiCard
            label="Despesas Totais"
            value={fmt(despesasTotais)}
            color={C.red}
          />
          <KpiCard
            label="Resultado"
            value={fmt(resultadoDre)}
            color={resultadoDre >= 0 ? C.green : C.red}
          />
          <KpiCard
            label="Margem Liquida"
            value={fmtPct(margemLiquida)}
            color={margemLiquida >= 0 ? C.green : C.red}
            subtitle={
              margemLiquida > 15
                ? "Saudavel"
                : margemLiquida > 0
                  ? "Atencao"
                  : "Critico"
            }
          />
        </div>

        <div className="border border-[#ccc] rounded-lg overflow-hidden mb-6">
          <div className="bg-[#1a2e4a] px-4 py-2">
            <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">
              Evolucao Ultimos 6 Meses
            </h3>
          </div>
          <div className="p-4 bg-white">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={dre6m}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: number) =>
                    `${(v / 1000).toFixed(0)}k`
                  }
                />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Bar dataKey="receita" fill={C.green} name="Receita" radius={[4, 4, 0, 0]} />
                <Bar dataKey="despesa" fill={C.red} name="Despesa" radius={[4, 4, 0, 0]} />
                <Bar dataKey="resultado" fill={C.gold} name="Resultado" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── SECTION 6: INDICADORES GERENCIAIS ─────────────── */}
        <SectionTitle>Indicadores Gerenciais</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <KpiCard
            label="Faturamento (mes)"
            value={fmt(faturamento)}
            color={C.text1}
          />
          <KpiCard
            label="Ticket Medio"
            value={fmt(ticketMedio)}
            color={C.text1}
            subtitle={nVendas > 0 ? `${nVendas} vendas no mes` : "Sem vendas"}
          />
          <KpiCard
            label="Taxa de Inadimplencia"
            value={fmtPct(inadimplenciaRate)}
            color={inadimplenciaRate > 10 ? C.red : C.green}
            subtitle={inadimplenciaRate > 10 ? "Acima do limite" : "Dentro do aceitavel"}
          />
          <KpiCard
            label="Despesas / Receita"
            value={fmtPct(despesasReceita)}
            color={despesasReceita > 85 ? C.red : despesasReceita > 70 ? C.gold : C.green}
          />
          <div className="border border-[#ccc] rounded-lg overflow-hidden">
            <div className="bg-[#1a2e4a] px-4 py-2">
              <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">
                Evolucao Mensal
              </h3>
            </div>
            <div className="p-4 bg-white flex items-center gap-2">
              {evolucaoMensal >= 0 ? (
                <TrendingUp size={24} color={C.green} />
              ) : (
                <TrendingDown size={24} color={C.red} />
              )}
              <p
                className="text-xl font-bold"
                style={{ color: evolucaoMensal >= 0 ? C.green : C.red }}
              >
                {evolucaoMensal >= 0 ? "+" : ""}
                {fmtPct(evolucaoMensal)}
              </p>
              <p className="text-xs text-gray-500 ml-1">vs mes anterior</p>
            </div>
          </div>
          <KpiCard
            label="N. de Vendas"
            value={String(nVendas)}
            color={C.text1}
            subtitle={format(today, "MMMM yyyy", { locale: ptBR })}
          />
        </div>

        {/* ── SECTION 7: LEITURA GERENCIAL ──────────────────── */}
        <SectionTitle>Leitura Gerencial</SectionTitle>
        <div
          className="rounded-lg p-6"
          style={{ backgroundColor: C.darkCard }}
        >
          <h3 className="text-white text-sm font-bold mb-4 uppercase tracking-widest">
            Insights Automatizados
          </h3>
          <div className="space-y-3">
            {insights.map((ins, idx) => {
              const dotColor =
                ins.type === "danger"
                  ? "#ef4444"
                  : ins.type === "warning"
                    ? "#eab308"
                    : "#22c55e";
              return (
                <div key={idx} className="flex items-start gap-3">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full mt-1.5 shrink-0"
                    style={{ backgroundColor: dotColor }}
                  />
                  <p className="text-white text-sm leading-relaxed">
                    {ins.text}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
