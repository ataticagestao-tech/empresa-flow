import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PagePanel } from "@/components/layout/PagePanel";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useToast } from "@/components/ui/use-toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  classificaFixoVariavel,
  isExcluidoDoResultado,
  isNaoDesembolsavel,
} from "@/modules/finance/domain/custoFixoVariavel";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";
import {
  Building2, Plus, Trash2, Edit2, RefreshCw, ArrowRightLeft,
  Loader2, FileText, BarChart3, GitMerge, ArrowLeft, ChevronRight,
  Eye, ChevronDown, Info, TrendingUp, TrendingDown, Wallet, Landmark,
  ArrowDownLeft, ArrowUpRight,
} from "lucide-react";

// ── Types ──

interface Grupo {
  id: string;
  owner_id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  created_at: string;
}

interface Transferencia {
  id: string;
  owner_id: string;
  company_origem_id: string;
  company_destino_id: string;
  valor: number;
  data: string;
  natureza: string;
  descricao: string | null;
  status: string;
  gera_juros: boolean;
  taxa_juros_mensal: number | null;
  eliminado_consolidado: boolean;
  created_at: string;
}

interface Relatorio {
  id: string;
  nome: string;
  tipo: string;
  empresas_ids: string[];
  competencia_inicio: string;
  competencia_fim: string;
  indicador: string | null;
  resultado_json: Record<string, unknown> | null;
  gerado_em: string | null;
  created_at: string;
}

function fmt(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
}

const naturezaLabels: Record<string, string> = {
  mutuo: "Mútuo", adiantamento: "Adiantamento", capital: "Capital",
  operacional: "Operacional", outros: "Outros",
};

const tipoLabels: Record<string, string> = {
  dre_comparativo: "DRE Comparativo",
  fluxo_caixa_comparativo: "Fluxo de Caixa Comparativo",
  indicadores_comparativos: "Indicadores Comparativos",
  ranking_empresas: "Ranking de Empresas",
  evolucao_historica: "Evolução Histórica",
};

const statusCfg: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pendente: { label: "Pendente", variant: "secondary" },
  aprovada: { label: "Aprovada", variant: "default" },
  concluida: { label: "Concluída", variant: "outline" },
  cancelada: { label: "Cancelada", variant: "destructive" },
};

// ── Padrão de planilha: colunas ajustáveis + ocultáveis (hook reutilizável) ──
function useColunasAjustaveis(
  order: string[],
  defaults: Record<string, number>,
  storageKey: string,
) {
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    try {
      const s = localStorage.getItem(`${storageKey}_col_widths`);
      if (s) return { ...defaults, ...JSON.parse(s) };
    } catch { /* ignore */ }
    return defaults;
  });
  useEffect(() => { localStorage.setItem(`${storageKey}_col_widths`, JSON.stringify(colWidths)); }, [colWidths, storageKey]);

  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => {
    try {
      const s = localStorage.getItem(`${storageKey}_hidden_cols`);
      if (s) return new Set(JSON.parse(s) as string[]);
    } catch { /* ignore */ }
    return new Set();
  });
  useEffect(() => { localStorage.setItem(`${storageKey}_hidden_cols`, JSON.stringify([...hiddenCols])); }, [hiddenCols, storageKey]);

  const [colMenuOpen, setColMenuOpen] = useState(false);
  const isColVisible = (k: string) => !hiddenCols.has(k);
  const toggleColVisible = (k: string) => setHiddenCols((prev) => {
    const n = new Set(prev);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });
  const visibleCols = order.filter(isColVisible);

  const resizingRef = useRef<{ key: string; startX: number; startW: number } | null>(null);
  const startResize = (key: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { key, startX: e.clientX, startW: colWidths[key] ?? defaults[key] };
    const onMove = (ev: MouseEvent) => {
      const r = resizingRef.current;
      if (!r) return;
      const newW = Math.max(60, r.startW + (ev.clientX - r.startX));
      setColWidths((prev) => ({ ...prev, [r.key]: newW }));
    };
    const onUp = () => {
      resizingRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const tableStyle = {
    tableLayout: "fixed" as const,
    width: visibleCols.reduce((a, k) => a + (colWidths[k] ?? defaults[k]), 0),
    minWidth: "100%",
  };

  return { colWidths, defaults, colMenuOpen, setColMenuOpen, isColVisible, toggleColVisible, startResize, tableStyle };
}

// Botão "Colunas" + dropdown de checkboxes (cabeçalho escuro)
function ColunasMenu({
  labels, colMenuOpen, setColMenuOpen, isColVisible, toggleColVisible,
}: {
  labels: Record<string, string>;
  colMenuOpen: boolean;
  setColMenuOpen: (fn: (o: boolean) => boolean) => void;
  isColVisible: (k: string) => boolean;
  toggleColVisible: (k: string) => void;
}) {
  return (
    <div className="relative self-center">
      <button
        onClick={() => setColMenuOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/20 text-[12px] text-white hover:bg-white/10"
        title="Mostrar/ocultar colunas"
      >
        <Eye size={14} className="text-white/70" /> Colunas
        <ChevronDown size={13} className={`text-white/60 transition-transform ${colMenuOpen ? "rotate-180" : ""}`} />
      </button>
      {colMenuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setColMenuOpen(() => false)} />
          <div className="absolute right-0 mt-1 z-50 bg-white border border-[#EAECF0] rounded-lg shadow-xl py-1 min-w-[190px]">
            <p className="px-3 py-1.5 text-[11px] font-bold text-[#98A2B3] uppercase tracking-wider">Exibir colunas</p>
            {Object.entries(labels).map(([k, label]) => (
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
  );
}

export default function MultiEmpresa() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const path = location.pathname;

  // Dashboard consolidado de um grupo específico: /multiempresa/grupo/:id
  const grupoMatch = path.match(/\/multiempresa\/grupo\/([^/]+)/);

  const activeTab = path.includes("/transferencias")
    ? "transferencias"
    : path.includes("/relatorios")
    ? "relatorios"
    : "consolidado";

  const [tab, setTab] = useState(activeTab);
  useEffect(() => { setTab(activeTab); }, [activeTab]);

  if (grupoMatch) {
    return (
      <AppLayout>
        <GrupoDashboard grupoId={grupoMatch[1]} userId={user?.id} onBack={() => navigate("/multiempresa")} />
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Multi-empresa">
      <div>

        <PagePanel title="Multi-empresa">

        <div className="flex gap-1 bg-muted/50 p-1 rounded-lg w-fit">
          {[
            { key: "consolidado", label: "Consolidado", icon: Building2 },
            { key: "transferencias", label: "Transferências", icon: ArrowRightLeft },
            { key: "relatorios", label: "Relatórios", icon: BarChart3 },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                tab === key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {tab === "consolidado" && <ConsolidadoTab userId={user?.id} />}
        {tab === "transferencias" && <TransferenciasTab userId={user?.id} />}
        {tab === "relatorios" && <RelatoriosTab userId={user?.id} />}
        </PagePanel>
      </div>
    </AppLayout>
  );
}

// ── DASHBOARD CONSOLIDADO DO GRUPO ──

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface CompanyMetric {
  company_id: string;
  nome: string;
  faturamento: number;
  despesa: number;
  resultado: number;
  caixa: number;
  cr_aberto: number;
  cp_aberto: number;
}

interface ConsolidadoTotals {
  faturamento: number;
  despesa: number;
  resultado: number;
  caixa: number;
  cr_aberto: number;
  cp_aberto: number;
}

// Cálculo consolidado AO VIVO (mesma fonte-da-verdade do CompanyDashboard).
// Soma por company_id, ignorando registros apagados e contas de transferência.
async function calcConsolidadoLive(
  db: any,
  companyIds: string[],
  periodStart: string,
  periodEnd: string,
): Promise<{ rows: Omit<CompanyMetric, "nome">[]; totals: ConsolidadoTotals }> {
  if (companyIds.length === 0) {
    return { rows: [], totals: { faturamento: 0, despesa: 0, resultado: 0, caixa: 0, cr_aberto: 0, cp_aberto: 0 } };
  }

  // Contas contábeis de transferência (excluídas dos cálculos)
  const { data: transfAcc } = await db.from("chart_of_accounts")
    .select("id").in("company_id", companyIds).ilike("name", "%transfer%");
  const transferIds = new Set((transfAcc || []).map((a: any) => a.id));
  const naoTransfer = (r: any) => !(r.conta_contabil_id && transferIds.has(r.conta_contabil_id));

  // Supabase corta cada resposta em ~1000 linhas. Como somamos as vendas/CP/CR
  // de TODAS as empresas do grupo numa query só, precisamos paginar (range) até
  // esgotar — senão empresas inteiras ficam de fora e aparecem com R$ 0.
  const fetchAll = async (build: (from: number, to: number) => any, pageSize = 1000) => {
    const all: any[] = [];
    let from = 0;
    for (let guard = 0; guard < 2000; guard++) {
      const { data, error } = await build(from, from + pageSize - 1);
      if (error) break;
      const batch = data || [];
      all.push(...batch);
      if (batch.length < pageSize) break;
      from += pageSize;
    }
    return all;
  };

  const [vendasRows, cpCompRows, banksRes, crAbertoRows, cpAbertoRows] = await Promise.all([
    // Faturamento por data_venda — mesma base da página Vendas: soma valor_total
    // de todas as vendas não excluídas no período, SEM filtro de status (vendas
    // importadas podem ter status nulo; um filtro status<>cancelado excluiria
    // nulos por causa da lógica three-valued do Postgres).
    fetchAll((f, t) => db.from("vendas")
      .select("company_id, valor_total")
      .in("company_id", companyIds)
      .is("deleted_at", null)
      .gte("data_venda", periodStart).lte("data_venda", periodEnd)
      .order("id").range(f, t)),
    // Despesas (competência): CP por data_vencimento, valor cheio
    fetchAll((f, t) => db.from("contas_pagar")
      .select("company_id, valor, conta_contabil_id")
      .in("company_id", companyIds)
      .in("status", ["aberto", "parcial", "vencido", "pago"])
      .is("deleted_at", null)
      .gte("data_vencimento", periodStart).lte("data_vencimento", periodEnd)
      .order("id").range(f, t)),
    // Caixa atual (poucas linhas — sem paginação)
    db.from("bank_accounts").select("company_id, current_balance").in("company_id", companyIds),
    // CR em aberto
    fetchAll((f, t) => db.from("contas_receber")
      .select("company_id, valor, valor_pago, conta_contabil_id")
      .in("company_id", companyIds).in("status", ["aberto", "parcial", "vencido"])
      .is("deleted_at", null).order("id").range(f, t)),
    // CP em aberto
    fetchAll((f, t) => db.from("contas_pagar")
      .select("company_id, valor, valor_pago, conta_contabil_id")
      .in("company_id", companyIds).in("status", ["aberto", "parcial", "vencido"])
      .is("deleted_at", null).order("id").range(f, t)),
  ]);

  const base: Record<string, Omit<CompanyMetric, "nome">> = {};
  companyIds.forEach((id) => {
    base[id] = { company_id: id, faturamento: 0, despesa: 0, resultado: 0, caixa: 0, cr_aberto: 0, cp_aberto: 0 };
  });

  vendasRows.forEach((r: any) => {
    if (base[r.company_id]) base[r.company_id].faturamento += Number(r.valor_total || 0);
  });
  cpCompRows.filter(naoTransfer).forEach((r: any) => {
    if (base[r.company_id]) base[r.company_id].despesa += Number(r.valor || 0);
  });
  (banksRes.data || []).forEach((r: any) => {
    if (base[r.company_id]) base[r.company_id].caixa += Number(r.current_balance || 0);
  });
  crAbertoRows.filter(naoTransfer).forEach((r: any) => {
    if (base[r.company_id]) base[r.company_id].cr_aberto += Number(r.valor || 0) - Number(r.valor_pago || 0);
  });
  cpAbertoRows.filter(naoTransfer).forEach((r: any) => {
    if (base[r.company_id]) base[r.company_id].cp_aberto += Number(r.valor || 0) - Number(r.valor_pago || 0);
  });

  const rows = Object.values(base)
    .map((r) => ({ ...r, resultado: r.faturamento - r.despesa }))
    .sort((a, b) => b.faturamento - a.faturamento);

  const totals = rows.reduce<ConsolidadoTotals>(
    (acc, r) => ({
      faturamento: acc.faturamento + r.faturamento,
      despesa: acc.despesa + r.despesa,
      resultado: acc.resultado + r.resultado,
      caixa: acc.caixa + r.caixa,
      cr_aberto: acc.cr_aberto + r.cr_aberto,
      cp_aberto: acc.cp_aberto + r.cp_aberto,
    }),
    { faturamento: 0, despesa: 0, resultado: 0, caixa: 0, cr_aberto: 0, cp_aberto: 0 },
  );

  return { rows, totals };
}

// ── DASHBOARD COMPARATIVO DO GRUPO (passe único de dados) ──
//
// Em vez de chamar os hooks de Margens/Ponto-de-Equilíbrio (que rodavam ~6 meses ×
// N empresas, varrendo a tabela inteira de contas_pagar a cada chamada), este cálculo
// busca TUDO em ~8 queries paralelas filtradas por período e agrega no client.

const COMP_COLORS = [
  "#071D41", "#059669", "#B54708", "#6941C6", "#0E7490", "#B42318",
  "#CA8504", "#1570EF", "#DD2590", "#3538CD", "#475467", "#15803D",
];

/** Normaliza texto livre: minúsculas + sem acento (p/ casar nome de conta). */
function normalizeTxt(s: string | null | undefined): string {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** 'YYYY-MM-DD' → Date local (sem shift de timezone). */
function parseLocalDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Mês 'YYYY-MM' da competência intersecta o período [start..end]? */
function competenciaInPeriodo(competencia: string | null | undefined, start: string, end: string): boolean {
  const m = /^(\d{4})-(\d{2})/.exec(competencia || "");
  if (!m) return false;
  const first = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const s = parseLocalDate(start);
  const e = parseLocalDate(end);
  if (!s || !e) return false;
  return first <= e && last >= s;
}

/** Atribui a CP ao período: por competência se existir, senão por vencimento. */
function cpNoPeriodo(
  competencia: string | null | undefined,
  dataVencimento: string | null | undefined,
  start: string,
  end: string,
): boolean {
  if (competencia) return competenciaInPeriodo(competencia, start, end);
  return !!dataVencimento && dataVencimento >= start && dataVencimento <= end;
}

type CpClasse = "excluir" | "custo" | "despesa";

/** Custo (CMV/custo direto) vs Despesa (operacional+outras) vs Excluir (ativo/receita). */
function classificaCpClasse(accountType: string | null | undefined, dreGroup: string | null | undefined): CpClasse {
  const at = (accountType || "").toLowerCase();
  const norm = normalizeTxt(dreGroup);
  if (at === "asset" || at === "liability" || at === "equity" || at === "revenue") return "excluir";
  if (norm.includes("nao dre")) return "excluir";
  if (at === "cost" || norm.includes("custo") || norm.includes("cmv") || norm.includes("csp")) return "custo";
  return "despesa";
}

/** 'YYYY-MM' do mês seguinte ao último do período (limite superior generoso da competência). */
function mesSeguinte(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  return m >= 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

interface GrupoCompanyRow {
  company_id: string;
  nome: string;
  faturamento: number;
  despesa: number; // KPI: total CP por vencimento no período (compatível com o card atual)
  custo: number; // CP classe custo (competência)
  despesaOp: number; // CP classe despesa operacional/outras (competência)
  resultado: number; // faturamento − despesa (KPI)
  caixa: number;
  cr_aberto: number;
  cp_aberto: number;
  peFinanceiro: number | null; // faturamento mínimo p/ o caixa empatar
  caixaGerado: number; // entradas pagas − saídas pagas no período
  credito: number; // vendas no cartão de crédito (valor_total)
  debito: number; // vendas no cartão de débito (valor_total)
}

interface GrupoVendaPonto {
  company_id: string;
  date: string; // 'YYYY-MM-DD'
  valor: number;
}

interface GrupoDashboardData {
  rows: GrupoCompanyRow[];
  totals: ConsolidadoTotals;
  vendasDiarias: GrupoVendaPonto[];
}

/**
 * Calcula TODO o dashboard do grupo num passe só. Soma por company_id, ignora
 * registros apagados e contas de transferência.
 */
async function calcGrupoDashboard(
  db: any,
  companyIds: string[],
  periodStart: string,
  periodEnd: string,
): Promise<GrupoDashboardData> {
  const zeroTotals: ConsolidadoTotals = { faturamento: 0, despesa: 0, resultado: 0, caixa: 0, cr_aberto: 0, cp_aberto: 0 };
  if (companyIds.length === 0) return { rows: [], totals: zeroTotals, vendasDiarias: [] };

  // Paginação (Supabase corta em ~1000 linhas; somamos TODAS as empresas numa query só).
  const fetchAll = async (build: (from: number, to: number) => any, pageSize = 1000) => {
    const all: any[] = [];
    let from = 0;
    for (let guard = 0; guard < 2000; guard++) {
      const { data, error } = await build(from, from + pageSize - 1);
      if (error) break;
      const batch = data || [];
      all.push(...batch);
      if (batch.length < pageSize) break;
      from += pageSize;
    }
    return all;
  };

  const startMonth = periodStart.slice(0, 7);
  const limMonth = mesSeguinte(periodEnd.slice(0, 7));

  const [accRows, vendasRows, cpAttrRows, crPagRows, cpPagRows, banksRes, crAbertoRows, cpAbertoRows] =
    await Promise.all([
      // Plano de contas (classificação custo/despesa, fixo/variável, transferência)
      fetchAll((f, t) => db.from("chart_of_accounts")
        .select("id, company_id, account_type, dre_group, expense_nature, code, name")
        .in("company_id", companyIds).order("id").range(f, t)),
      // Vendas no período (faturamento + série temporal + crédito/débito) — sem filtro de status
      fetchAll((f, t) => db.from("vendas")
        .select("company_id, valor_total, data_venda, forma_pagamento")
        .in("company_id", companyIds).is("deleted_at", null)
        .gte("data_venda", periodStart).lte("data_venda", periodEnd)
        .order("id").range(f, t)),
      // CP atribuída ao período (competência OU vencimento) — KPI despesa + custo/despesa/PE
      fetchAll((f, t) => db.from("contas_pagar")
        .select("company_id, valor, competencia, data_vencimento, status, conta_contabil_id")
        .in("company_id", companyIds).is("deleted_at", null)
        .or(`and(data_vencimento.gte.${periodStart},data_vencimento.lte.${periodEnd}),and(competencia.gte.${startMonth},competencia.lt.${limMonth})`)
        .order("id").range(f, t)),
      // CR pagas no período (entradas de caixa)
      fetchAll((f, t) => db.from("contas_receber")
        .select("company_id, valor_pago, data_pagamento, conta_contabil_id")
        .in("company_id", companyIds).in("status", ["pago", "parcial"]).is("deleted_at", null)
        .gte("data_pagamento", periodStart).lte("data_pagamento", periodEnd)
        .order("id").range(f, t)),
      // CP pagas no período (saídas de caixa)
      fetchAll((f, t) => db.from("contas_pagar")
        .select("company_id, valor_pago, data_pagamento, conta_contabil_id")
        .in("company_id", companyIds).in("status", ["pago", "parcial"]).is("deleted_at", null)
        .gte("data_pagamento", periodStart).lte("data_pagamento", periodEnd)
        .order("id").range(f, t)),
      // Caixa atual
      db.from("bank_accounts").select("company_id, current_balance").in("company_id", companyIds),
      // CR em aberto
      fetchAll((f, t) => db.from("contas_receber")
        .select("company_id, valor, valor_pago, conta_contabil_id")
        .in("company_id", companyIds).in("status", ["aberto", "parcial", "vencido"]).is("deleted_at", null)
        .order("id").range(f, t)),
      // CP em aberto
      fetchAll((f, t) => db.from("contas_pagar")
        .select("company_id, valor, valor_pago, conta_contabil_id")
        .in("company_id", companyIds).in("status", ["aberto", "parcial", "vencido"]).is("deleted_at", null)
        .order("id").range(f, t)),
    ]);

  // Mapa do plano de contas + contas de transferência (excluídas dos cálculos)
  const accMap = new Map<string, any>();
  const transferIds = new Set<string>();
  accRows.forEach((a: any) => {
    accMap.set(a.id, a);
    if (normalizeTxt(a.name).includes("transfer")) transferIds.add(a.id);
  });
  const naoTransfer = (r: any) => !(r.conta_contabil_id && transferIds.has(r.conta_contabil_id));

  interface Acc {
    faturamento: number; despesa: number; custo: number; despesaOp: number;
    caixa: number; cr_aberto: number; cp_aberto: number; credito: number; debito: number;
    entradas: number; saidas: number; custoFixo: number; custoVar: number; naoDesemb: number;
  }
  const base: Record<string, Acc> = {};
  companyIds.forEach((id) => {
    base[id] = {
      faturamento: 0, despesa: 0, custo: 0, despesaOp: 0, caixa: 0, cr_aberto: 0, cp_aberto: 0,
      credito: 0, debito: 0, entradas: 0, saidas: 0, custoFixo: 0, custoVar: 0, naoDesemb: 0,
    };
  });

  // Vendas → faturamento, crédito/débito, série diária
  const vendasMap = new Map<string, number>(); // "company|date" → valor
  vendasRows.forEach((r: any) => {
    const b = base[r.company_id];
    if (!b) return;
    const v = Number(r.valor_total || 0);
    b.faturamento += v;
    if (r.forma_pagamento === "cartao_credito") b.credito += v;
    else if (r.forma_pagamento === "cartao_debito") b.debito += v;
    if (r.data_venda) {
      const k = `${r.company_id}|${r.data_venda}`;
      vendasMap.set(k, (vendasMap.get(k) || 0) + v);
    }
  });

  // CP atribuída → KPI despesa (vencimento) + custo/despesa (competência) + fixo/variável (PE)
  cpAttrRows.forEach((r: any) => {
    const b = base[r.company_id];
    if (!b) return;
    const acc = accMap.get(r.conta_contabil_id) || null;
    const valor = Number(r.valor || 0);

    // KPI "Despesas" (compatível com o card atual): CP por vencimento no período, valor cheio.
    if (
      r.data_vencimento && r.data_vencimento >= periodStart && r.data_vencimento <= periodEnd &&
      ["aberto", "parcial", "vencido", "pago"].includes(r.status) && naoTransfer(r)
    ) {
      b.despesa += valor;
    }

    // Atribuição por competência p/ Custo / Despesa operacional / PE
    if (valor === 0 || !cpNoPeriodo(r.competencia, r.data_vencimento, periodStart, periodEnd)) return;
    if (isExcluidoDoResultado(acc?.account_type, acc?.dre_group)) return;

    if (classificaCpClasse(acc?.account_type, acc?.dre_group) === "custo") b.custo += valor;
    else b.despesaOp += valor;

    const manual = acc?.expense_nature;
    const nat = manual === "fixa" || manual === "variavel"
      ? manual
      : classificaFixoVariavel(acc?.code, acc?.name, acc?.dre_group);
    if (nat === "variavel") b.custoVar += valor;
    else {
      b.custoFixo += valor;
      if (isNaoDesembolsavel(acc?.name, acc?.dre_group)) b.naoDesemb += valor;
    }
  });

  // Caixa gerado: entradas pagas − saídas pagas (exclui transferências)
  crPagRows.filter(naoTransfer).forEach((r: any) => { const b = base[r.company_id]; if (b) b.entradas += Number(r.valor_pago || 0); });
  cpPagRows.filter(naoTransfer).forEach((r: any) => { const b = base[r.company_id]; if (b) b.saidas += Number(r.valor_pago || 0); });

  // Caixa, CR/CP em aberto
  (banksRes.data || []).forEach((r: any) => { const b = base[r.company_id]; if (b) b.caixa += Number(r.current_balance || 0); });
  crAbertoRows.filter(naoTransfer).forEach((r: any) => { const b = base[r.company_id]; if (b) b.cr_aberto += Number(r.valor || 0) - Number(r.valor_pago || 0); });
  cpAbertoRows.filter(naoTransfer).forEach((r: any) => { const b = base[r.company_id]; if (b) b.cp_aberto += Number(r.valor || 0) - Number(r.valor_pago || 0); });

  const rows: GrupoCompanyRow[] = Object.entries(base).map(([company_id, b]) => {
    // PE Financeiro: receita = faturamento; mc% = (receita − custo variável) / receita.
    let peFinanceiro: number | null = null;
    if (b.faturamento > 0) {
      const mcPct = (b.faturamento - b.custoVar) / b.faturamento;
      if (mcPct > 0) peFinanceiro = (b.custoFixo - b.naoDesemb) / mcPct;
    }
    return {
      company_id, nome: "",
      faturamento: b.faturamento, despesa: b.despesa, custo: b.custo, despesaOp: b.despesaOp,
      resultado: b.faturamento - b.despesa, caixa: b.caixa, cr_aberto: b.cr_aberto, cp_aberto: b.cp_aberto,
      peFinanceiro, caixaGerado: b.entradas - b.saidas, credito: b.credito, debito: b.debito,
    };
  }).sort((a, b) => b.faturamento - a.faturamento);

  const totals = rows.reduce<ConsolidadoTotals>(
    (acc, r) => ({
      faturamento: acc.faturamento + r.faturamento,
      despesa: acc.despesa + r.despesa,
      resultado: acc.resultado + r.resultado,
      caixa: acc.caixa + r.caixa,
      cr_aberto: acc.cr_aberto + r.cr_aberto,
      cp_aberto: acc.cp_aberto + r.cp_aberto,
    }),
    { ...zeroTotals },
  );

  const vendasDiarias: GrupoVendaPonto[] = [...vendasMap.entries()].map(([k, valor]) => {
    const [company_id, date] = k.split("|");
    return { company_id, date, valor };
  });

  return { rows, totals, vendasDiarias };
}

// ── Componentes de gráfico (comparativos do grupo) ──

const shortName = (n: string) => (n.length > 16 ? n.slice(0, 15) + "…" : n);

// ── Tokens visuais (modelo do card "Receita vs. Despesas" do CompanyDashboard) ──
const CREME = "#F6F2EB";
const NAVY = "#071D41";
const AXIS = "#475569";
const GRID = "#EEF1F4";
const TXT2 = "#667085";
const whitePanel: React.CSSProperties = {
  background: "#FFFFFF", border: "var(--border-hairline)", borderRadius: 8,
  padding: 14, boxShadow: "0 4px 14px rgba(15, 23, 42, 0.10)",
};
const billoraCard: React.CSSProperties = {
  background: "#FFFFFF", borderRadius: 16, border: "var(--border-hairline)",
  boxShadow: "0 2px 8px rgba(15, 23, 42, 0.06)",
};
const TOOLTIP_STYLE: React.CSSProperties = {
  background: "#fff", border: "1px solid #EAECF0", borderRadius: 10,
  padding: "10px 14px", boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)", fontSize: 12,
};
const yTickFmt = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`);

/** Rótulo do eixo X "em pé" (horizontal): quebra nomes longos em linhas centradas e alinhadas. */
function WrappedAxisTick({ x, y, payload }: { x?: number; y?: number; payload?: { value?: string | number } }) {
  const words = String(payload?.value ?? "").split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > 11 && cur) { lines.push(cur); cur = w; } else cur = next;
  }
  if (cur) lines.push(cur);
  return (
    <g transform={`translate(${x ?? 0},${(y ?? 0) + 8})`}>
      {lines.map((ln, i) => (
        <text key={i} x={0} y={i * 12} textAnchor="middle" fill={TXT2} fontSize={10.5} fontWeight={500}>{ln}</text>
      ))}
    </g>
  );
}

interface CardStat { label: string; value: string; color?: string; }
interface CardLegend { label: string; color: string; }

/** KPI no padrão de widget do CompanyDashboard (card branco + chip de ícone + valor grande + sublinha). */
function KpiTile({
  icon: Icon, iconBg, iconColor, label, info, value, valueColor, sub,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  iconBg: string; iconColor: string; label: string; info?: string;
  value: string; valueColor?: string; sub?: string;
}) {
  return (
    <div style={{ ...billoraCard, padding: 16, display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: iconBg, color: iconColor, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon size={16} strokeWidth={2.25} />
        </div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "#1D2939", letterSpacing: "-0.015em", lineHeight: 1.15, display: "inline-flex", alignItems: "center", gap: 6 }}>
          {label}
          {info && <span title={info} style={{ display: "inline-flex", cursor: "help" }}><Info size={12} style={{ color: "#98A2B3" }} /></span>}
        </div>
      </div>
      <div style={{ fontSize: "clamp(14px, 1.15vw, 19px)", fontWeight: 800, color: valueColor || "#1D2939", lineHeight: 1.1, letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#98A2B3", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/** Card no padrão "Receita vs. Despesas": creme + header navy + médias + painel branco interno. */
function CompCard({
  title, subtitle, info, caption, stats, legend, headerRight, height = 240, children,
}: {
  title: string; subtitle?: string; info?: string; caption?: string;
  stats?: CardStat[]; legend?: CardLegend[]; headerRight?: React.ReactNode;
  height?: number; children: React.ReactNode;
}) {
  return (
    <div style={{ background: CREME, borderRadius: 10, border: "var(--border-hairline)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 16px", background: NAVY, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#fff", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>{title}</span>
            {info && <span title={info} style={{ display: "inline-flex", cursor: "help" }}><Info size={13} style={{ color: "rgba(255,255,255,0.6)" }} /></span>}
          </div>
          {subtitle && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", fontWeight: 500, marginTop: 2 }}>{subtitle}</div>}
        </div>
        {headerRight}
      </div>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {stats && stats.length > 0 && (
          <div style={{ display: "flex", gap: 12 }}>
            {stats.map((s) => (
              <div key={s.label} style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 9.5, color: TXT2, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 2 }}>{s.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: s.color || "#111827", fontVariantNumeric: "tabular-nums", lineHeight: 1.15, whiteSpace: "nowrap" }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}
        <div style={whitePanel}>
          {legend && legend.length > 0 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 24, marginBottom: 8, fontSize: 12, color: TXT2 }}>
              {legend.map((l) => (
                <span key={l.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 10, height: 10, background: l.color, borderRadius: 2 }} />{l.label}
                </span>
              ))}
            </div>
          )}
          <div style={{ height }}>{children}</div>
          {caption && <p style={{ marginTop: 8, fontSize: 11.5, color: TXT2, lineHeight: 1.35 }}>{caption}</p>}
        </div>
      </div>
    </div>
  );
}

/** Barras comparando empresas (uma barra por empresa) + médias + linha de média. */
function CompBarCard({
  title, subtitle, info, caption, rows, valueKey, color = "#039855", height = 240,
}: {
  title: string; subtitle?: string; info?: string; caption?: string; rows: GrupoCompanyRow[];
  valueKey: keyof GrupoCompanyRow; color?: string; height?: number;
}) {
  const allowNegative = valueKey === "caixaGerado";
  const data = rows
    .map((r) => ({ nome: r.nome, valor: Number(r[valueKey] ?? 0) }))
    .filter((d) => d.valor !== 0)
    .sort((a, b) => b.valor - a.valor);

  const vals = data.map((d) => d.valor);
  const media = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  const stats: CardStat[] = [
    { label: "Média", value: fmt(media) },
    { label: "Maior", value: vals.length ? fmt(Math.max(...vals)) : "—" },
    { label: "Menor", value: vals.length ? fmt(Math.min(...vals)) : "—" },
  ];

  return (
    <CompCard title={title} subtitle={subtitle} info={info} caption={caption} stats={stats} height={height}>
      {data.length === 0 ? (
        <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: TXT2 }}>Sem dados no período</div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 4 }} barCategoryGap="14%">
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="nome" interval={0} height={56} tick={<WrappedAxisTick />} axisLine={{ stroke: AXIS, strokeWidth: 1 }} tickLine={{ stroke: AXIS }} tickMargin={8} />
            <YAxis tick={{ fontSize: 9, fill: TXT2, fontWeight: 500 }} axisLine={{ stroke: AXIS, strokeWidth: 1 }} tickLine={{ stroke: AXIS }} width={40} tickFormatter={yTickFmt} />
            <ReTooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [fmt(v), title]} cursor={{ fill: "rgba(3, 152, 85, 0.08)" }} />
            <Bar dataKey="valor" radius={[4, 4, 0, 0]} fill={color} maxBarSize={64}>
              {allowNegative && data.map((d, i) => <Cell key={i} fill={d.valor >= 0 ? "#039855" : "#E53E3E"} />)}
            </Bar>
            {media !== 0 && (
              <ReferenceLine y={media} stroke="#475569" strokeWidth={1.5} strokeDasharray="5 5" label={{ value: "média", position: "insideTopRight", fill: "#475569", fontSize: 10, fontWeight: 600 }} />
            )}
          </BarChart>
        </ResponsiveContainer>
      )}
    </CompCard>
  );
}

/** Crédito × Débito por empresa (barras agrupadas). */
function CredDebCard({ rows, subtitle }: { rows: GrupoCompanyRow[]; subtitle?: string }) {
  const data = rows
    .map((r) => ({ nome: r.nome, Crédito: r.credito, Débito: r.debito }))
    .filter((d) => d.Crédito > 0 || d.Débito > 0)
    .sort((a, b) => b.Crédito + b.Débito - (a.Crédito + a.Débito));

  const credTot = data.reduce((s, d) => s + d.Crédito, 0);
  const debTot = data.reduce((s, d) => s + d.Débito, 0);
  const stats: CardStat[] = [
    { label: "Crédito total", value: fmt(credTot), color: "#1570EF" },
    { label: "Débito total", value: fmt(debTot), color: "#039855" },
  ];
  const legend: CardLegend[] = [{ label: "Crédito", color: "#1570EF" }, { label: "Débito", color: "#039855" }];

  return (
    <CompCard
      title="Crédito × Débito por loja" subtitle={subtitle}
      info="Vendas no cartão de crédito vs débito, por loja (pela forma de pagamento da venda)."
      caption="Muito crédito = recebimento mais lento e taxa maior da maquininha."
      stats={stats} legend={legend} height={240}
    >
      {data.length === 0 ? (
        <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: TXT2 }}>Nenhuma venda no cartão no período</div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 4 }} barCategoryGap="14%" barGap={1}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="nome" interval={0} height={56} tick={<WrappedAxisTick />} axisLine={{ stroke: AXIS, strokeWidth: 1 }} tickLine={{ stroke: AXIS }} tickMargin={8} />
            <YAxis tick={{ fontSize: 9, fill: TXT2, fontWeight: 500 }} axisLine={{ stroke: AXIS, strokeWidth: 1 }} tickLine={{ stroke: AXIS }} width={40} tickFormatter={yTickFmt} />
            <ReTooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, n: string) => [fmt(v), n]} cursor={{ fill: "rgba(21, 112, 239, 0.06)" }} />
            <Bar dataKey="Crédito" fill="#1570EF" radius={[4, 4, 0, 0]} maxBarSize={56} />
            <Bar dataKey="Débito" fill="#039855" radius={[4, 4, 0, 0]} maxBarSize={56} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </CompCard>
  );
}

/** Segunda-feira da semana de uma data 'YYYY-MM-DD'. */
function weekStartISO(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  if (!d) return dateStr;
  const offset = (d.getDay() + 6) % 7; // 0 = segunda
  d.setDate(d.getDate() - offset);
  return toISO(d);
}

/** Vendas no tempo, com granularidade Dia/Semana/Mês e uma linha por empresa. */
function VendasTempoCard({
  vendasDiarias, rows, nomeEmpresa,
}: {
  vendasDiarias: GrupoVendaPonto[]; rows: GrupoCompanyRow[]; nomeEmpresa: (id: string) => string;
}) {
  const [gran, setGran] = useState<"dia" | "semana" | "mes">("dia");

  // Limita às 5 maiores (por faturamento) p/ o gráfico não virar espaguete.
  const topIds = useMemo(() => rows.slice(0, 5).map((r) => r.company_id), [rows]);

  const { data, series } = useMemo(() => {
    const bucketKey = (date: string) =>
      gran === "dia" ? date : gran === "semana" ? weekStartISO(date) : date.slice(0, 7);
    const bucketLabel = (key: string) => {
      if (gran === "mes") {
        const [y, m] = key.split("-");
        return `${m}/${y.slice(2)}`;
      }
      const d = parseLocalDate(key);
      return d ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}` : key;
    };

    const top = new Set(topIds);
    // bucketKey → { companyId → soma }
    const buckets = new Map<string, Record<string, number>>();
    vendasDiarias.forEach((p) => {
      if (!top.has(p.company_id)) return;
      const k = bucketKey(p.date);
      const row = buckets.get(k) || {};
      row[p.company_id] = (row[p.company_id] || 0) + p.valor;
      buckets.set(k, row);
    });

    const sortedKeys = [...buckets.keys()].sort();
    const series = topIds.map((id, i) => ({ id, key: `c_${i}`, nome: shortName(nomeEmpresa(id)), color: COMP_COLORS[i % COMP_COLORS.length] }));
    const data = sortedKeys.map((k) => {
      const row: Record<string, number | string> = { bucket: bucketLabel(k) };
      const vals = buckets.get(k) || {};
      series.forEach((s) => { row[s.key] = vals[s.id] || 0; });
      return row;
    });
    return { data, series };
  }, [vendasDiarias, gran, topIds, nomeEmpresa]);

  const granBtns: { key: typeof gran; label: string }[] = [
    { key: "dia", label: "Dia" }, { key: "semana", label: "Semana" }, { key: "mes", label: "Mês" },
  ];
  const headerRight = (
    <div style={{ display: "flex", gap: 4 }}>
      {granBtns.map((g) => (
        <button
          key={g.key}
          onClick={() => setGran(g.key)}
          style={{
            padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: "pointer", border: "none",
            background: gran === g.key ? "#fff" : "transparent",
            color: gran === g.key ? NAVY : "rgba(255,255,255,0.7)",
          }}
        >
          {g.label}
        </button>
      ))}
    </div>
  );
  const legend: CardLegend[] = series.map((s) => ({ label: s.nome, color: s.color }));

  return (
    <CompCard
      title="Vendas no tempo" subtitle="Top 5 lojas · ritmo e tendência"
      headerRight={headerRight} legend={legend} height={300}
      caption="Troque Dia/Semana/Mês para enxergar o ritmo (ex.: picos de fim de semana) ou a tendência do período."
    >
      {data.length === 0 ? (
        <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: TXT2 }}>Sem vendas no período</div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: TXT2, fontWeight: 500 }} axisLine={{ stroke: AXIS, strokeWidth: 1 }} tickLine={{ stroke: AXIS }} interval="preserveStartEnd" minTickGap={24} tickMargin={8} />
            <YAxis tick={{ fontSize: 9, fill: TXT2, fontWeight: 500 }} axisLine={{ stroke: AXIS, strokeWidth: 1 }} tickLine={{ stroke: AXIS }} width={40} tickFormatter={yTickFmt} />
            <ReTooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, n: string) => [fmt(v), n]} />
            {series.map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.nome} stroke={s.color} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </CompCard>
  );
}

/** Custo × Despesa por loja (barras agrupadas). */
function CompGroupedBarCard({ title, subtitle, info, caption, rows }: { title: string; subtitle?: string; info?: string; caption?: string; rows: GrupoCompanyRow[] }) {
  const data = rows
    .map((r) => ({ nome: r.nome, Custo: r.custo, Despesa: r.despesaOp }))
    .filter((d) => d.Custo > 0 || d.Despesa > 0)
    .sort((a, b) => b.Custo + b.Despesa - (a.Custo + a.Despesa));

  const custoTot = data.reduce((s, d) => s + d.Custo, 0);
  const despTot = data.reduce((s, d) => s + d.Despesa, 0);
  const stats: CardStat[] = [
    { label: "Custo total", value: fmt(custoTot), color: "#B54708" },
    { label: "Despesa total", value: fmt(despTot), color: "#EF9F27" },
  ];
  const legend: CardLegend[] = [{ label: "Custo", color: "#B54708" }, { label: "Despesa", color: "#EF9F27" }];

  return (
    <CompCard title={title} subtitle={subtitle} info={info} caption={caption} stats={stats} legend={legend} height={240}>
      {data.length === 0 ? (
        <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: TXT2 }}>Sem dados no período</div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 4 }} barCategoryGap="14%" barGap={1}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="nome" interval={0} height={56} tick={<WrappedAxisTick />} axisLine={{ stroke: AXIS, strokeWidth: 1 }} tickLine={{ stroke: AXIS }} tickMargin={8} />
            <YAxis tick={{ fontSize: 9, fill: TXT2, fontWeight: 500 }} axisLine={{ stroke: AXIS, strokeWidth: 1 }} tickLine={{ stroke: AXIS }} width={40} tickFormatter={yTickFmt} />
            <ReTooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, n: string) => [fmt(v), n]} cursor={{ fill: "rgba(181, 71, 8, 0.06)" }} />
            <Bar dataKey="Custo" fill="#B54708" radius={[4, 4, 0, 0]} maxBarSize={56} />
            <Bar dataKey="Despesa" fill="#EF9F27" radius={[4, 4, 0, 0]} maxBarSize={56} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </CompCard>
  );
}

// ── Leitura do mês (frases automáticas) + Ranking semáforo ──

type LeituraTone = "good" | "warn" | "bad" | "info" | "star";
const TONE_EMOJI: Record<LeituraTone, string> = { good: "✅", warn: "⚠️", bad: "🔴", info: "💡", star: "🏆" };
const TONE_COLOR: Record<LeituraTone, string> = { good: "#039855", warn: "#B54708", bad: "#B42318", info: "#1D2939", star: "#1D2939" };

interface Leitura { tone: LeituraTone; text: string; }

/** Gera as frases de leitura a partir dos números do grupo (puro, sem DB). */
function gerarLeitura(rows: GrupoCompanyRow[], totals: ConsolidadoTotals, periodLabel: string): Leitura[] {
  const out: Leitura[] = [];
  if (rows.length === 0) return out;
  const margem = totals.faturamento > 0 ? (totals.resultado / totals.faturamento) * 100 : 0;
  const periodo = periodLabel.toLowerCase();

  if (totals.resultado >= 0)
    out.push({ tone: "good", text: `O grupo teve LUCRO de ${fmt(totals.resultado)} (margem ${margem.toFixed(1)}%) em ${periodo}.` });
  else
    out.push({ tone: "bad", text: `O grupo teve PREJUÍZO de ${fmt(Math.abs(totals.resultado))} em ${periodo}.` });

  if (totals.cp_aberto > totals.caixa)
    out.push({ tone: "warn", text: `Contas a pagar em aberto (${fmt(totals.cp_aberto)}) maiores que o caixa (${fmt(totals.caixa)}) — atenção ao fôlego de caixa.` });

  const prejuizo = [...rows].filter((r) => r.resultado < 0).sort((a, b) => a.resultado - b.resultado);
  if (prejuizo.length === 0)
    out.push({ tone: "good", text: `Todas as ${rows.length} lojas fecharam no azul.` });
  else
    out.push({ tone: "bad", text: `${prejuizo.length} ${prejuizo.length > 1 ? "lojas no prejuízo" : "loja no prejuízo"}: ${prejuizo.slice(0, 3).map((r) => r.nome).join(", ")}${prejuizo.length > 3 ? "…" : ""}.` });

  const queimou = [...rows].filter((r) => r.caixaGerado < 0).sort((a, b) => a.caixaGerado - b.caixaGerado);
  if (queimou.length > 0)
    out.push({ tone: "warn", text: `${queimou.length} ${queimou.length > 1 ? "lojas queimaram" : "loja queimou"} caixa (gastou mais do que entrou): ${queimou.slice(0, 3).map((r) => r.nome).join(", ")}${queimou.length > 3 ? "…" : ""}.` });

  const abaixoPE = rows.filter((r) => r.peFinanceiro != null && r.faturamento > 0 && r.faturamento < (r.peFinanceiro as number));
  if (abaixoPE.length > 0)
    out.push({ tone: "warn", text: `${abaixoPE.length} loja(s) faturando ABAIXO do ponto de equilíbrio (não cobrem os custos fixos): ${abaixoPE.slice(0, 3).map((r) => r.nome).join(", ")}${abaixoPE.length > 3 ? "…" : ""}.` });

  const top = rows[0];
  if (top && top.faturamento > 0)
    out.push({ tone: "star", text: `Destaque de faturamento: ${top.nome} (${fmt(top.faturamento)}).` });

  if (rows.length >= 4 && totals.faturamento > 0) {
    const top2 = rows.slice(0, 2).reduce((s, r) => s + r.faturamento, 0);
    const pct = (top2 / totals.faturamento) * 100;
    if (pct >= 55) out.push({ tone: "info", text: `Faturamento concentrado: as 2 maiores respondem por ${pct.toFixed(0)}% do total do grupo.` });
  }

  if (totals.cr_aberto === 0)
    out.push({ tone: "info", text: `Nenhuma conta a receber em aberto. Se você vende a prazo, confira se as vendas estão gerando CR no sistema.` });

  return out;
}

function LeituraCard({ leitura, periodLabel }: { leitura: Leitura[]; periodLabel: string }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="px-5 py-3.5" style={{ backgroundColor: "#071D41" }}>
        <h3 className="font-extrabold text-white m-0" style={{ fontSize: 14, letterSpacing: "-0.01em", textTransform: "uppercase" }}>Leitura de {periodLabel}</h3>
      </div>
      <div className="bg-white p-4">
        {leitura.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem dados para ler no período.</p>
        ) : (
          <ul className="space-y-2">
            {leitura.map((l, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[14px] leading-snug" style={{ color: TONE_COLOR[l.tone] }}>
                <span className="shrink-0" style={{ fontSize: 15 }}>{TONE_EMOJI[l.tone]}</span>
                <span>{l.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

/** Status semáforo de uma loja (pior = rank menor, vai primeiro). */
function statusLoja(r: GrupoCompanyRow): { label: string; bg: string; color: string; rank: number } {
  const margem = r.faturamento > 0 ? r.resultado / r.faturamento : 0;
  if (r.resultado < 0 || r.caixaGerado < 0)
    return { label: "Atenção", bg: "#FEF3F2", color: "#B42318", rank: 0 };
  if (margem < 0.08 || (r.peFinanceiro != null && r.faturamento > 0 && r.faturamento < r.peFinanceiro))
    return { label: "Vigiar", bg: "#FFFAEB", color: "#B54708", rank: 1 };
  return { label: "Vai bem", bg: "#ECFDF3", color: "#039855", rank: 2 };
}

function RankingCard({ rows }: { rows: GrupoCompanyRow[] }) {
  const ordered = [...rows]
    .map((r) => ({ r, s: statusLoja(r) }))
    .sort((a, b) => a.s.rank - b.s.rank || a.r.resultado - b.r.resultado);

  return (
    <Card className="overflow-hidden p-0">
      <div className="px-5 py-3.5 flex items-center gap-2" style={{ backgroundColor: "#071D41" }}>
        <h3 className="font-extrabold text-white m-0" style={{ fontSize: 14, letterSpacing: "-0.01em", textTransform: "uppercase" }}>Onde olhar primeiro</h3>
        <span className="text-[12px] text-white/60">(do pior pro melhor)</span>
      </div>
      <div className="bg-white overflow-x-auto">
        <table className="text-sm w-full">
          <thead>
            <tr className="text-[12px] font-bold text-black uppercase tracking-wider border-b-2 border-[#D0D5DD] whitespace-nowrap">
              <th className="text-left px-3 py-2.5">Loja</th>
              <th className="text-right px-3 py-2.5">Faturamento</th>
              <th className="text-right px-3 py-2.5">Resultado</th>
              <th className="text-right px-3 py-2.5">Caixa gerado</th>
              <th className="text-center px-3 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map(({ r, s }) => (
              <tr key={r.company_id} className="border-b border-[#F1F3F5] hover:bg-[#FAFAFA]">
                <td className="px-3 py-1.5 font-medium text-[#1D2939] truncate" title={r.nome}>{r.nome}</td>
                <td className="px-3 py-1.5 text-right text-[#1D2939]">{fmt(r.faturamento)}</td>
                <td className={`px-3 py-1.5 text-right font-semibold ${r.resultado >= 0 ? "text-blue-600" : "text-red-600"}`}>{fmt(r.resultado)}</td>
                <td className={`px-3 py-1.5 text-right ${r.caixaGerado >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmt(r.caixaGerado)}</td>
                <td className="px-3 py-1.5 text-center">
                  <span className="inline-block px-2 py-0.5 rounded-full text-[12px] font-semibold" style={{ background: s.bg, color: s.color }}>{s.label}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function GrupoDashboard({ grupoId, userId, onBack }: { grupoId: string; userId?: string; onBack: () => void }) {
  const { activeClient } = useAuth();
  const { companies } = useCompany();
  const { toast } = useToast();
  const confirm = useConfirm();
  const db = activeClient as any;

  // Padrão de planilha (tabela "Empresas do grupo")
  const EMP_COL_ORDER = ["empresa", "faturamento", "despesas", "resultado", "caixa", "cr", "cp", "acoes"];
  const EMP_COL_LABELS: Record<string, string> = {
    empresa: "Empresa", faturamento: "Faturamento", despesas: "Despesas", resultado: "Resultado",
    caixa: "Caixa", cr: "CR aberto", cp: "CP aberto", acoes: "Ações",
  };
  const EMP_COL_WIDTHS_DEFAULT: Record<string, number> = {
    empresa: 220, faturamento: 130, despesas: 130, resultado: 130, caixa: 130, cr: 120, cp: 120, acoes: 80,
  };
  const empCols = useColunasAjustaveis(EMP_COL_ORDER, EMP_COL_WIDTHS_DEFAULT, "multiempresa_empresas");

  const [periodo, setPeriodo] = useState<"mes" | "mes_anterior" | "ano" | "mes_especifico">("mes");
  const now = new Date();
  const [mesEspecifico, setMesEspecifico] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [addOpen, setAddOpen] = useState(false);
  const [addCompanyId, setAddCompanyId] = useState("");

  const { periodStart, periodEnd, periodLabel } = useMemo(() => {
    const t = new Date();
    if (periodo === "mes")
      return { periodStart: toISO(new Date(t.getFullYear(), t.getMonth(), 1)), periodEnd: toISO(new Date(t.getFullYear(), t.getMonth() + 1, 0)), periodLabel: "Mês atual" };
    if (periodo === "mes_anterior")
      return { periodStart: toISO(new Date(t.getFullYear(), t.getMonth() - 1, 1)), periodEnd: toISO(new Date(t.getFullYear(), t.getMonth(), 0)), periodLabel: "Mês anterior" };
    if (periodo === "ano")
      return { periodStart: toISO(new Date(t.getFullYear(), 0, 1)), periodEnd: toISO(new Date(t.getFullYear(), 11, 31)), periodLabel: "Ano atual" };
    const [y, m] = mesEspecifico.split("-").map(Number);
    return { periodStart: toISO(new Date(y, m - 1, 1)), periodEnd: toISO(new Date(y, m, 0)), periodLabel: mesEspecifico };
  }, [periodo, mesEspecifico]);

  // Grupo
  const { data: grupo } = useQuery({
    queryKey: ["grupo_dash_info", grupoId],
    queryFn: async () => {
      const { data } = await db.from("grupos_empresariais").select("*").eq("id", grupoId).single();
      return data as Grupo | null;
    },
  });

  // Membros do grupo
  const { data: members = [], refetch: refetchMembers } = useQuery({
    queryKey: ["grupo_dash_members", grupoId],
    queryFn: async () => {
      const { data } = await db.from("grupos_empresas").select("id, company_id, papel").eq("grupo_id", grupoId);
      return (data || []) as { id: string; company_id: string; papel: string }[];
    },
  });

  const companyIds = useMemo(() => members.map((m) => m.company_id), [members]);
  const nomeEmpresa = useCallback(
    (id: string) => {
      const c = companies.find((x) => x.id === id);
      return c?.nome_fantasia || c?.razao_social || id.slice(0, 8);
    },
    [companies],
  );
  const empresasDisponiveis = useMemo(
    () => companies.filter((c) => !companyIds.includes(c.id)),
    [companies, companyIds],
  );

  // Dashboard consolidado (passe único de dados; mesma fonte-da-verdade do CompanyDashboard)
  const { data: metrics, isFetching } = useQuery({
    queryKey: ["grupo_dash_v2", grupoId, companyIds.join(","), periodStart, periodEnd],
    enabled: companyIds.length > 0,
    queryFn: async () => {
      const { rows, totals, vendasDiarias } = await calcGrupoDashboard(db, companyIds, periodStart, periodEnd);
      return { rows: rows.map((r) => ({ ...r, nome: nomeEmpresa(r.company_id) })), totals, vendasDiarias };
    },
  });

  const handleAddMember = async () => {
    if (!addCompanyId) return;
    try {
      await db.from("grupos_empresas").insert({ grupo_id: grupoId, company_id: addCompanyId });
      setAddOpen(false); setAddCompanyId("");
      refetchMembers();
      toast({ title: "Empresa adicionada ao grupo" });
    } catch { toast({ title: "Erro ao adicionar empresa", variant: "destructive" }); }
  };

  const handleRemoveMember = async (id: string, nome: string) => {
    const ok = await confirm({
      title: `Remover ${nome} do grupo?`,
      description: "A empresa deixa de ser incluída no consolidado deste grupo.",
      confirmLabel: "Remover",
      variant: "destructive",
    });
    if (!ok) return;
    await db.from("grupos_empresas").delete().eq("id", id);
    refetchMembers();
  };

  const margem = metrics && metrics.totals.faturamento > 0
    ? (metrics.totals.resultado / metrics.totals.faturamento) * 100 : 0;

  const dashRows = metrics?.rows || [];
  const leitura = useMemo(
    () => (metrics ? gerarLeitura(metrics.rows, metrics.totals, periodLabel) : []),
    [metrics, periodLabel],
  );

  const exportarPDF = () => {
    if (!metrics) return;
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const W = 210, H = 297, M = 18, FOOTER_H = 14, contentW = W - M * 2;
    const nome = grupo?.nome || "Grupo";
    const emissao = new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

    const drawHeader = (): number => {
      doc.setFillColor(7, 29, 65); doc.rect(0, 0, W, 4, "F");
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(110, 110, 110);
      doc.text("TÁTICA GESTÃO", M, 11);
      doc.text(`Emitido em ${emissao}`, W - M, 11, { align: "right" });
      doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(7, 29, 65);
      doc.text(`Consolidado — ${nome}`, M, 19);
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(80, 80, 80);
      doc.text(`${companyIds.length} empresa(s) · ${periodLabel}`, M, 24.5);
      doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.3); doc.line(M, 28, W - M, 28);
      return 36;
    };

    let y = drawHeader();
    const t = metrics.totals;

    // ── KPIs (2 linhas × 3 colunas) ──
    const kpis: [string, string][] = [
      ["Faturamento", fmt(t.faturamento)],
      ["Despesas", fmt(t.despesa)],
      [`Resultado (${margem.toFixed(1)}%)`, fmt(t.resultado)],
      ["Caixa total", fmt(t.caixa)],
      ["CR em aberto", fmt(t.cr_aberto)],
      ["CP em aberto", fmt(t.cp_aberto)],
    ];
    const colW = contentW / 3;
    kpis.forEach(([label, value], i) => {
      const x = M + (i % 3) * colW;
      const cy = y + Math.floor(i / 3) * 15;
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(110, 110, 110);
      doc.text(label.toUpperCase(), x, cy);
      doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(40, 40, 40);
      doc.text(value, x, cy + 6);
    });
    y += 15 * 2 + 4;

    // ── Leitura do período ──
    doc.setDrawColor(220, 220, 220); doc.line(M, y, W - M, y); y += 7;
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(7, 29, 65);
    doc.text("Leitura do período", M, y); y += 6;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(50, 50, 50);
    leitura.forEach((l) => {
      const lines = doc.splitTextToSize(`• ${l.text}`, contentW) as string[];
      if (y + lines.length * 5 > H - FOOTER_H) { doc.addPage(); y = drawHeader(); }
      doc.text(lines, M, y);
      y += lines.length * 5 + 1.5;
    });
    y += 5;

    // ── Tabela por loja (do pior pro melhor) ──
    const colFatR = 80, colDespR = 110, colResR = 140, colCxR = 170, statusR = W - M;
    const drawTableHead = () => {
      doc.setFillColor(242, 245, 249); doc.rect(M, y, contentW, 8, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(40, 40, 40);
      doc.text("Loja", M + 2, y + 5.3);
      doc.text("Faturam.", colFatR - 2, y + 5.3, { align: "right" });
      doc.text("Despesa", colDespR - 2, y + 5.3, { align: "right" });
      doc.text("Result.", colResR - 2, y + 5.3, { align: "right" });
      doc.text("Cx gerado", colCxR - 2, y + 5.3, { align: "right" });
      doc.text("Status", statusR, y + 5.3, { align: "right" });
      y += 9;
    };

    if (y + 18 > H - FOOTER_H) { doc.addPage(); y = drawHeader(); }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(7, 29, 65);
    doc.text("Lojas (do pior pro melhor)", M, y); y += 4;
    drawTableHead();

    const ranking = [...metrics.rows]
      .map((r) => ({ r, s: statusLoja(r) }))
      .sort((a, b) => a.s.rank - b.s.rank || a.r.resultado - b.r.resultado);

    ranking.forEach(({ r, s }) => {
      if (y + 7 > H - FOOTER_H) { doc.addPage(); y = drawHeader(); drawTableHead(); }
      const nm = r.nome.length > 26 ? r.nome.slice(0, 25) + "…" : r.nome;
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(40, 40, 40);
      doc.text(nm, M + 2, y + 4.5);
      doc.text(fmt(r.faturamento), colFatR - 2, y + 4.5, { align: "right" });
      doc.text(fmt(r.despesa), colDespR - 2, y + 4.5, { align: "right" });
      doc.setTextColor(r.resultado >= 0 ? 40 : 197, r.resultado >= 0 ? 40 : 48, r.resultado >= 0 ? 40 : 48);
      doc.text(fmt(r.resultado), colResR - 2, y + 4.5, { align: "right" });
      doc.setTextColor(r.caixaGerado >= 0 ? 40 : 197, r.caixaGerado >= 0 ? 40 : 48, r.caixaGerado >= 0 ? 40 : 48);
      doc.text(fmt(r.caixaGerado), colCxR - 2, y + 4.5, { align: "right" });
      doc.setTextColor(110, 110, 110);
      doc.text(s.label, statusR, y + 4.5, { align: "right" });
      doc.setDrawColor(238, 241, 244); doc.line(M, y + 6.5, W - M, y + 6.5);
      y += 7;
    });

    // Linha de total
    if (y + 8 > H - FOOTER_H) { doc.addPage(); y = drawHeader(); }
    doc.setFillColor(246, 242, 235); doc.rect(M, y, contentW, 7, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(40, 40, 40);
    doc.text("Total consolidado", M + 2, y + 4.7);
    doc.text(fmt(t.faturamento), colFatR - 2, y + 4.7, { align: "right" });
    doc.text(fmt(t.despesa), colDespR - 2, y + 4.7, { align: "right" });
    doc.text(fmt(t.resultado), colResR - 2, y + 4.7, { align: "right" });

    // ── Rodapé com paginação ──
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.3); doc.line(M, H - FOOTER_H + 2, W - M, H - FOOTER_H + 2);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(110, 110, 110);
      doc.text("Tática Gestão — relatório gerado automaticamente", M, H - 6);
      doc.text(`Página ${p} de ${totalPages}`, W - M, H - 6, { align: "right" });
    }

    const safe = nome.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "");
    doc.save(`Consolidado_${safe}_${periodLabel.replace(/\s+/g, "_")}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2"><GitMerge className="h-5 w-5 text-primary" /> {grupo?.nome || "Grupo"}</h2>
            <p className="text-sm text-muted-foreground">Consolidado de {companyIds.length} empresa(s) · {periodLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={periodo} onValueChange={(v) => setPeriodo(v as typeof periodo)}>
            <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mes">Mês atual</SelectItem>
              <SelectItem value="mes_anterior">Mês anterior</SelectItem>
              <SelectItem value="ano">Ano atual</SelectItem>
              <SelectItem value="mes_especifico">Mês específico</SelectItem>
            </SelectContent>
          </Select>
          {periodo === "mes_especifico" && (
            <Input type="month" className="w-[150px]" value={mesEspecifico} onChange={(e) => setMesEspecifico(e.target.value)} />
          )}
          <Button variant="outline" onClick={exportarPDF} disabled={!metrics || companyIds.length === 0} title="Exportar este consolidado em PDF">
            <FileText className="h-4 w-4 mr-2" /> Exportar PDF
          </Button>
        </div>
      </div>

      {companyIds.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Building2 className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p className="mb-4">Nenhuma empresa vinculada a este grupo</p>
          <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-2" /> Adicionar empresa</Button>
        </CardContent></Card>
      ) : (
        <>
          {/* KPIs consolidados — padrão de widget (card branco + chip de ícone) */}
          {(() => {
            const t = metrics?.totals || { faturamento: 0, despesa: 0, resultado: 0, caixa: 0, cr_aberto: 0, cp_aberto: 0 };
            const pctDesp = t.faturamento > 0 ? `${((t.despesa / t.faturamento) * 100).toFixed(0)}% do faturamento` : "no período";
            return (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <KpiTile icon={TrendingUp} iconBg="#ECFDF5" iconColor="#059669" label="Faturamento" value={fmt(t.faturamento)} valueColor="#039855" sub={`em ${periodLabel.toLowerCase()}`} info="Soma das vendas (valor total) do grupo no período." />
                <KpiTile icon={TrendingDown} iconBg="#FEF2F2" iconColor="#B91C1C" label="Despesas" value={fmt(t.despesa)} valueColor="#DC2626" sub={pctDesp} info="Contas a pagar por vencimento no período (valor cheio). Exclui transferências." />
                <KpiTile icon={Wallet} iconBg={t.resultado >= 0 ? "#ECFDF5" : "#FEF2F2"} iconColor={t.resultado >= 0 ? "#059669" : "#B91C1C"} label="Resultado" value={fmt(t.resultado)} valueColor={t.resultado >= 0 ? "#039855" : "#E53E3E"} sub={`${margem.toFixed(1)}% de margem`} info="Faturamento − Despesas do período (competência)." />
                <KpiTile icon={Landmark} iconBg="#F2F4F7" iconColor="#475467" label="Caixa Total" value={fmt(t.caixa)} sub="saldo atual das contas" info="Saldo somado das contas bancárias das empresas do grupo." />
                <KpiTile icon={ArrowDownLeft} iconBg="#ECFDF3" iconColor="#039855" label="CR em aberto" value={fmt(t.cr_aberto)} valueColor="#059669" sub="total a receber" info="Contas a receber em aberto (aberto/parcial/vencido). Exclui transferências." />
                <KpiTile icon={ArrowUpRight} iconBg="#FFFAEB" iconColor="#B45309" label="CP em aberto" value={fmt(t.cp_aberto)} valueColor="#B45309" sub="total a pagar" info="Contas a pagar em aberto (aberto/parcial/vencido). Exclui transferências." />
              </div>
            );
          })()}

          {/* Leitura do mês — o que os números dizem, em palavras */}
          <LeituraCard leitura={leitura} periodLabel={periodLabel} />

          {/* Ranking semáforo — onde olhar primeiro */}
          <RankingCard rows={dashRows} />

          {/* Gráficos de apoio (cada um responde uma pergunta) */}
          <div className="flex items-center gap-2 pt-1">
            <h3 className="font-semibold text-[15px]">Gráficos de apoio</h3>
            {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CompBarCard title="Faturamento por loja" subtitle={`Por loja · ${periodLabel}`} caption="Linha tracejada = média do grupo. Quem está acima/abaixo da média." info="Soma das vendas (valor total) por loja, igual à página Vendas." rows={dashRows} valueKey="faturamento" color="#039855" />
            <CompBarCard title="Geração de caixa por loja" subtitle={`Por loja · ${periodLabel}`} caption="Verde = gerou caixa; vermelho = queimou (gastou mais do que entrou)." info="Entradas pagas − saídas pagas no período (regime de caixa, exclui transferências)." rows={dashRows} valueKey="caixaGerado" />
            <CompGroupedBarCard title="Custo × Despesa por loja" subtitle={`Por loja · ${periodLabel}`} caption="Custo = CMV/custo direto; Despesa = operacional. Para onde vai o dinheiro de cada loja (por competência)." info="Onde cada loja gasta." rows={dashRows} />
            <CredDebCard rows={dashRows} subtitle={`Por loja · ${periodLabel}`} />
          </div>

          {/* Vendas no tempo (Dia/Semana/Mês) */}
          <VendasTempoCard vendasDiarias={metrics?.vendasDiarias || []} rows={dashRows} nomeEmpresa={nomeEmpresa} />

          {/* Tabela por empresa — padrão de planilha */}
          <Card className="overflow-hidden p-0">
            <div className="px-5 py-4 flex items-center justify-between flex-shrink-0" style={{ backgroundColor: "#071D41" }}>
              <h3 className="font-extrabold text-white m-0" style={{ fontSize: 18, letterSpacing: "-0.015em", lineHeight: 1.15 }}>Empresas do grupo</h3>
              <div className="flex items-center gap-3">
                <Button size="sm" variant="outline" className="bg-transparent border-white/20 text-white hover:bg-white/10 hover:text-white" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-2" /> Adicionar</Button>
                <ColunasMenu labels={EMP_COL_LABELS} colMenuOpen={empCols.colMenuOpen} setColMenuOpen={empCols.setColMenuOpen} isColVisible={empCols.isColVisible} toggleColVisible={empCols.toggleColVisible} />
              </div>
            </div>
            <div className="bg-white overflow-x-auto">
              <table className="text-sm w-full" style={empCols.tableStyle}>
                <colgroup>
                  {EMP_COL_ORDER.map((k) => (
                    <col key={k} className={empCols.isColVisible(k) ? "" : "hidden"} style={{ width: empCols.colWidths[k] ?? EMP_COL_WIDTHS_DEFAULT[k] }} />
                  ))}
                </colgroup>
                <thead>
                  <tr className="bg-white text-[13px] font-bold text-black uppercase tracking-wider border-b-2 border-[#D0D5DD] whitespace-nowrap">
                    <th className={`text-left px-3 py-2.5 relative border-r border-[#EAECF0] ${empCols.isColVisible("empresa") ? "" : "hidden"}`}>
                      Empresa<span onMouseDown={empCols.startResize("empresa")} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                    </th>
                    <th className={`text-right px-3 py-2.5 relative border-r border-[#EAECF0] ${empCols.isColVisible("faturamento") ? "" : "hidden"}`}>
                      Faturamento<span onMouseDown={empCols.startResize("faturamento")} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                    </th>
                    <th className={`text-right px-3 py-2.5 relative border-r border-[#EAECF0] ${empCols.isColVisible("despesas") ? "" : "hidden"}`}>
                      Despesas<span onMouseDown={empCols.startResize("despesas")} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                    </th>
                    <th className={`text-right px-3 py-2.5 relative border-r border-[#EAECF0] ${empCols.isColVisible("resultado") ? "" : "hidden"}`}>
                      Resultado<span onMouseDown={empCols.startResize("resultado")} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                    </th>
                    <th className={`text-right px-3 py-2.5 relative border-r border-[#EAECF0] ${empCols.isColVisible("caixa") ? "" : "hidden"}`}>
                      Caixa<span onMouseDown={empCols.startResize("caixa")} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                    </th>
                    <th className={`text-right px-3 py-2.5 relative border-r border-[#EAECF0] ${empCols.isColVisible("cr") ? "" : "hidden"}`}>
                      CR aberto<span onMouseDown={empCols.startResize("cr")} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                    </th>
                    <th className={`text-right px-3 py-2.5 relative border-r border-[#EAECF0] ${empCols.isColVisible("cp") ? "" : "hidden"}`}>
                      CP aberto<span onMouseDown={empCols.startResize("cp")} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                    </th>
                    <th className={`text-center px-3 py-2.5 relative ${empCols.isColVisible("acoes") ? "" : "hidden"}`}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {(metrics?.rows || []).map((r) => (
                    <tr key={r.company_id} className="border-b border-[#F1F3F5] hover:bg-[#FAFAFA]">
                      <td className={`px-3 py-1 font-medium text-[#1D2939] truncate border-r border-[#F1F3F5] ${empCols.isColVisible("empresa") ? "" : "hidden"}`} title={r.nome}>{r.nome}</td>
                      <td className={`px-3 py-1 text-right text-[#1D2939] truncate border-r border-[#F1F3F5] ${empCols.isColVisible("faturamento") ? "" : "hidden"}`}>{fmt(r.faturamento)}</td>
                      <td className={`px-3 py-1 text-right text-[#1D2939] truncate border-r border-[#F1F3F5] ${empCols.isColVisible("despesas") ? "" : "hidden"}`}>{fmt(r.despesa)}</td>
                      <td className={`px-3 py-1 text-right font-semibold truncate border-r border-[#F1F3F5] ${r.resultado >= 0 ? "text-blue-600" : "text-orange-600"} ${empCols.isColVisible("resultado") ? "" : "hidden"}`}>{fmt(r.resultado)}</td>
                      <td className={`px-3 py-1 text-right text-[#1D2939] truncate border-r border-[#F1F3F5] ${empCols.isColVisible("caixa") ? "" : "hidden"}`}>{fmt(r.caixa)}</td>
                      <td className={`px-3 py-1 text-right text-emerald-600 truncate border-r border-[#F1F3F5] ${empCols.isColVisible("cr") ? "" : "hidden"}`}>{fmt(r.cr_aberto)}</td>
                      <td className={`px-3 py-1 text-right text-amber-600 truncate border-r border-[#F1F3F5] ${empCols.isColVisible("cp") ? "" : "hidden"}`}>{fmt(r.cp_aberto)}</td>
                      <td className={`px-3 py-1 text-center ${empCols.isColVisible("acoes") ? "" : "hidden"}`}>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRemoveMember(members.find((m) => m.company_id === r.company_id)!.id, r.nome)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {metrics && (
                    <tr className="bg-[#F6F2EB] font-semibold border-t border-[#EAECF0]">
                      <td className={`px-3 py-1.5 text-[#1D2939] truncate border-r border-[#F1F3F5] ${empCols.isColVisible("empresa") ? "" : "hidden"}`}>Total consolidado</td>
                      <td className={`px-3 py-1.5 text-right text-[#1D2939] truncate border-r border-[#F1F3F5] ${empCols.isColVisible("faturamento") ? "" : "hidden"}`}>{fmt(metrics.totals.faturamento)}</td>
                      <td className={`px-3 py-1.5 text-right text-[#1D2939] truncate border-r border-[#F1F3F5] ${empCols.isColVisible("despesas") ? "" : "hidden"}`}>{fmt(metrics.totals.despesa)}</td>
                      <td className={`px-3 py-1.5 text-right truncate border-r border-[#F1F3F5] ${metrics.totals.resultado >= 0 ? "text-blue-600" : "text-orange-600"} ${empCols.isColVisible("resultado") ? "" : "hidden"}`}>{fmt(metrics.totals.resultado)}</td>
                      <td className={`px-3 py-1.5 text-right text-[#1D2939] truncate border-r border-[#F1F3F5] ${empCols.isColVisible("caixa") ? "" : "hidden"}`}>{fmt(metrics.totals.caixa)}</td>
                      <td className={`px-3 py-1.5 text-right text-emerald-600 truncate border-r border-[#F1F3F5] ${empCols.isColVisible("cr") ? "" : "hidden"}`}>{fmt(metrics.totals.cr_aberto)}</td>
                      <td className={`px-3 py-1.5 text-right text-amber-600 truncate border-r border-[#F1F3F5] ${empCols.isColVisible("cp") ? "" : "hidden"}`}>{fmt(metrics.totals.cp_aberto)}</td>
                      <td className={`px-3 py-1.5 ${empCols.isColVisible("acoes") ? "" : "hidden"}`}></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* Sheet adicionar empresa */}
      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent>
          <SheetHeader><SheetTitle>Adicionar empresa ao grupo</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-6">
            {empresasDisponiveis.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todas as suas empresas já estão neste grupo.</p>
            ) : (
              <>
                <div>
                  <Label>Empresa</Label>
                  <Select value={addCompanyId} onValueChange={setAddCompanyId}>
                    <SelectTrigger><SelectValue placeholder="Selecione uma empresa" /></SelectTrigger>
                    <SelectContent>
                      {empresasDisponiveis.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.nome_fantasia || c.razao_social}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setAddOpen(false)}>Cancelar</Button>
                  <Button className="flex-1" onClick={handleAddMember} disabled={!addCompanyId}>Adicionar</Button>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ── CONSOLIDADO ──

// Card de um grupo na lista. Os KPIs do mês carregam por card (paralelo + cache),
// então a lista aparece instantaneamente em vez de travar até calcular tudo.
function GrupoCard({
  grupo, companyIds, periodStart, periodEnd, onOpen, onEdit, onDelete,
}: {
  grupo: Grupo;
  companyIds: string[];
  periodStart: string;
  periodEnd: string;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { activeClient } = useAuth();
  const db = activeClient as any;

  const { data: totals, isFetching, refetch } = useQuery({
    queryKey: ["multiempresa_card", grupo.id, companyIds.join(","), periodStart, periodEnd],
    enabled: companyIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => (await calcConsolidadoLive(db, companyIds, periodStart, periodEnd)).totals,
  });

  return (
    <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={onOpen}>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold flex items-center gap-1">{grupo.nome}<ChevronRight className="h-4 w-4 text-muted-foreground" /></h3>
            {grupo.descricao && <p className="text-sm text-muted-foreground">{grupo.descricao}</p>}
          </div>
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" onClick={onOpen} title="Abrir dashboard"><BarChart3 className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isFetching} title="Atualizar"><RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /></Button>
            <Button variant="ghost" size="icon" onClick={onEdit}><Edit2 className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={onDelete}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        </div>

        {companyIds.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma empresa vinculada. Abra o dashboard do grupo para adicionar empresas.</p>
        ) : !totals ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-lg bg-muted/40 animate-pulse" style={{ height: 58 }} />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3">
                <p className="text-xs text-green-600 font-medium">Faturamento</p>
                <p className="text-lg font-bold text-green-700">{fmt(totals.faturamento)}</p>
              </div>
              <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-3">
                <p className="text-xs text-red-600 font-medium">Despesas</p>
                <p className="text-lg font-bold text-red-700">{fmt(totals.despesa)}</p>
              </div>
              <div className={`rounded-lg p-3 ${totals.resultado >= 0 ? "bg-blue-50 dark:bg-blue-950/30" : "bg-orange-50 dark:bg-orange-950/30"}`}>
                <p className={`text-xs font-medium ${totals.resultado >= 0 ? "text-blue-600" : "text-orange-600"}`}>Resultado</p>
                <p className={`text-lg font-bold ${totals.resultado >= 0 ? "text-blue-700" : "text-orange-700"}`}>{fmt(totals.resultado)}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground font-medium">Caixa Total</p>
                <p className="text-lg font-bold">{fmt(totals.caixa)}</p>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-3">
                <p className="text-xs text-emerald-600 font-medium">CR Aberto</p>
                <p className="text-sm font-semibold text-emerald-700">{fmt(totals.cr_aberto)}</p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3">
                <p className="text-xs text-amber-600 font-medium">CP Aberto</p>
                <p className="text-sm font-semibold text-amber-700">{fmt(totals.cp_aberto)}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{companyIds.length} empresa(s) · mês atual · clique no card para ver o dashboard completo</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ConsolidadoTab({ userId }: { userId?: string }) {
  const { activeClient } = useAuth();
  const { toast } = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const db = activeClient as any;

  const [showForm, setShowForm] = useState(false);
  const [editGrupo, setEditGrupo] = useState<Grupo | null>(null);
  const [form, setForm] = useState({ nome: "", descricao: "" });
  const [saving, setSaving] = useState(false);

  // Grupos + membros: 2 queries rápidas. Os cards renderizam na hora; os KPIs por card.
  const { data: gruposData, isLoading, refetch } = useQuery({
    queryKey: ["multiempresa_grupos", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: gData } = await db.from("grupos_empresariais").select("*").eq("owner_id", userId).order("nome");
      const lista = (gData || []) as Grupo[];
      const byGrupo: Record<string, string[]> = {};
      const grupoIds = lista.map((g) => g.id);
      if (grupoIds.length > 0) {
        const { data: memData } = await db.from("grupos_empresas").select("grupo_id, company_id").in("grupo_id", grupoIds);
        (memData || []).forEach((m: any) => { (byGrupo[m.grupo_id] ||= []).push(m.company_id); });
      }
      return { lista, byGrupo };
    },
  });
  const grupos = gruposData?.lista || [];
  const byGrupo = gruposData?.byGrupo || {};

  const now = new Date();
  const periodStart = toISO(new Date(now.getFullYear(), now.getMonth(), 1));
  const periodEnd = toISO(new Date(now.getFullYear(), now.getMonth() + 1, 0));

  const handleSave = async () => {
    if (!userId || !form.nome.trim()) return;
    setSaving(true);
    try {
      if (editGrupo) {
        await db.from("grupos_empresariais").update({ nome: form.nome, descricao: form.descricao || null }).eq("id", editGrupo.id);
      } else {
        await db.from("grupos_empresariais").insert({ owner_id: userId, nome: form.nome, descricao: form.descricao || null });
      }
      setShowForm(false); setForm({ nome: "", descricao: "" }); setEditGrupo(null);
      refetch();
      toast({ title: editGrupo ? "Grupo atualizado" : "Grupo criado" });
    } catch { toast({ title: "Erro ao salvar", variant: "destructive" }); } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "Excluir este grupo?",
      description: "Todas as consolidações e relatórios vinculados podem ser afetados.",
      confirmLabel: "Sim, excluir",
      variant: "destructive",
    });
    if (!ok) return;
    await db.from("grupos_empresariais").delete().eq("id", id);
    refetch();
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Grupos Empresariais</h2>
        <Button onClick={() => { setForm({ nome: "", descricao: "" }); setEditGrupo(null); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Novo Grupo
        </Button>
      </div>

      {grupos.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Building2 className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>Nenhum grupo empresarial cadastrado</p>
        </CardContent></Card>
      ) : grupos.map((grupo) => (
        <GrupoCard
          key={grupo.id}
          grupo={grupo}
          companyIds={byGrupo[grupo.id] || []}
          periodStart={periodStart}
          periodEnd={periodEnd}
          onOpen={() => navigate(`/multiempresa/grupo/${grupo.id}`)}
          onEdit={() => { setEditGrupo(grupo); setForm({ nome: grupo.nome, descricao: grupo.descricao || "" }); setShowForm(true); }}
          onDelete={() => handleDelete(grupo.id)}
        />
      ))}

      <Sheet open={showForm} onOpenChange={setShowForm}>
        <SheetContent>
          <SheetHeader><SheetTitle>{editGrupo ? "Editar Grupo" : "Novo Grupo"}</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-6">
            <div><Label>Nome</Label><Input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Ex: Grupo Clínicas SP" /></div>
            <div><Label>Descrição</Label><Input value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} /></div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving || !form.nome.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ── TRANSFERÊNCIAS ──

function TransferenciasTab({ userId }: { userId?: string }) {
  const { toast } = useToast();
  // Padrão de planilha (tabela de transferências)
  const TR_COL_ORDER = ["data", "rota", "natureza", "valor", "status", "acoes"];
  const TR_COL_LABELS: Record<string, string> = {
    data: "Data", rota: "Origem → Destino", natureza: "Natureza", valor: "Valor", status: "Status", acoes: "Ações",
  };
  const TR_COL_WIDTHS_DEFAULT: Record<string, number> = {
    data: 100, rota: 240, natureza: 130, valor: 130, status: 110, acoes: 160,
  };
  const trCols = useColunasAjustaveis(TR_COL_ORDER, TR_COL_WIDTHS_DEFAULT, "multiempresa_transferencias");

  const [transferencias, setTransferencias] = useState<Transferencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    company_origem_id: "", company_destino_id: "", valor: "",
    data: new Date().toISOString().slice(0, 10), natureza: "operacional",
    descricao: "", gera_juros: false, taxa_juros_mensal: "",
  });

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      let q = supabase.from("transferencias_intercompany").select("*").eq("owner_id", userId).order("data", { ascending: false });
      if (filterStatus !== "all") q = q.eq("status", filterStatus);
      const { data } = await q;
      setTransferencias(data || []);
    } catch { /* */ } finally { setLoading(false); }
  }, [userId, filterStatus]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async () => {
    if (!userId || !form.company_origem_id || !form.company_destino_id || !form.valor) return;
    if (form.company_origem_id === form.company_destino_id) {
      toast({ title: "Origem e destino devem ser diferentes", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      await supabase.from("transferencias_intercompany").insert({
        owner_id: userId, company_origem_id: form.company_origem_id,
        company_destino_id: form.company_destino_id, valor: parseFloat(form.valor),
        data: form.data, natureza: form.natureza, descricao: form.descricao || null,
        gera_juros: form.gera_juros,
        taxa_juros_mensal: form.taxa_juros_mensal ? parseFloat(form.taxa_juros_mensal) : null,
        status: "pendente",
      });
      setShowForm(false);
      setForm({ company_origem_id: "", company_destino_id: "", valor: "", data: new Date().toISOString().slice(0, 10), natureza: "operacional", descricao: "", gera_juros: false, taxa_juros_mensal: "" });
      fetchData();
      toast({ title: "Transferência criada" });
    } catch { toast({ title: "Erro ao criar", variant: "destructive" }); } finally { setSaving(false); }
  };

  const handleAprovar = async (id: string, status: string) => {
    await supabase.from("transferencias_intercompany").update({ status, aprovado_por: userId, aprovado_em: new Date().toISOString() }).eq("id", id);
    fetchData();
  };

  const handleConcluir = async (id: string) => {
    await supabase.from("transferencias_intercompany").update({ status: "concluida", eliminado_consolidado: true }).eq("id", id);
    fetchData();
  };

  const totPendentes = transferencias.filter((t) => t.status === "pendente").reduce((s, t) => s + t.valor, 0);
  const totConcluidas = transferencias.filter((t) => t.status === "concluida").reduce((s, t) => s + t.valor, 0);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="p-4"><p className="text-xs text-amber-600 font-medium">Pendentes</p><p className="text-xl font-bold text-amber-700">{fmt(totPendentes)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-green-600 font-medium">Concluídas</p><p className="text-xl font-bold text-green-700">{fmt(totConcluidas)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground font-medium">Total</p><p className="text-xl font-bold">{transferencias.length}</p></CardContent></Card>
      </div>

      <div className="flex items-center justify-between">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="aprovada">Aprovada</SelectItem>
            <SelectItem value="concluida">Concluída</SelectItem>
            <SelectItem value="cancelada">Cancelada</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4 mr-2" /> Nova Transferência</Button>
      </div>

      {transferencias.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <ArrowRightLeft className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>Nenhuma transferência registrada</p>
        </CardContent></Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="px-5 py-4 flex items-center justify-between flex-shrink-0" style={{ backgroundColor: "#071D41" }}>
            <h3 className="font-extrabold text-white m-0" style={{ fontSize: 18, letterSpacing: "-0.015em", lineHeight: 1.15 }}>Transferências</h3>
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-white/70 font-medium">{transferencias.length} registro{transferencias.length !== 1 ? "s" : ""}</span>
              <ColunasMenu labels={TR_COL_LABELS} colMenuOpen={trCols.colMenuOpen} setColMenuOpen={trCols.setColMenuOpen} isColVisible={trCols.isColVisible} toggleColVisible={trCols.toggleColVisible} />
            </div>
          </div>
          <div className="bg-white overflow-x-auto">
            <table className="text-sm w-full" style={trCols.tableStyle}>
              <colgroup>
                {TR_COL_ORDER.map((k) => (
                  <col key={k} className={trCols.isColVisible(k) ? "" : "hidden"} style={{ width: trCols.colWidths[k] ?? TR_COL_WIDTHS_DEFAULT[k] }} />
                ))}
              </colgroup>
              <thead>
                <tr className="bg-white text-[13px] font-bold text-black uppercase tracking-wider border-b-2 border-[#D0D5DD] whitespace-nowrap">
                  <th className={`text-left px-3 py-2.5 relative border-r border-[#EAECF0] ${trCols.isColVisible("data") ? "" : "hidden"}`}>
                    Data<span onMouseDown={trCols.startResize("data")} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                  </th>
                  <th className={`text-left px-3 py-2.5 relative border-r border-[#EAECF0] ${trCols.isColVisible("rota") ? "" : "hidden"}`}>
                    Origem → Destino<span onMouseDown={trCols.startResize("rota")} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                  </th>
                  <th className={`text-left px-3 py-2.5 relative border-r border-[#EAECF0] ${trCols.isColVisible("natureza") ? "" : "hidden"}`}>
                    Natureza<span onMouseDown={trCols.startResize("natureza")} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                  </th>
                  <th className={`text-right px-3 py-2.5 relative border-r border-[#EAECF0] ${trCols.isColVisible("valor") ? "" : "hidden"}`}>
                    Valor<span onMouseDown={trCols.startResize("valor")} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                  </th>
                  <th className={`text-left px-3 py-2.5 relative border-r border-[#EAECF0] ${trCols.isColVisible("status") ? "" : "hidden"}`}>
                    Status<span onMouseDown={trCols.startResize("status")} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                  </th>
                  <th className={`text-left px-3 py-2.5 relative ${trCols.isColVisible("acoes") ? "" : "hidden"}`}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {transferencias.map((t) => {
                  const sc = statusCfg[t.status] || statusCfg.pendente;
                  return (
                    <tr key={t.id} className="border-b border-[#F1F3F5] hover:bg-[#FAFAFA]">
                      <td className={`px-3 py-1 text-[#1D2939] truncate border-r border-[#F1F3F5] ${trCols.isColVisible("data") ? "" : "hidden"}`}>{fmtDate(t.data)}</td>
                      <td className={`px-3 py-1 truncate border-r border-[#F1F3F5] ${trCols.isColVisible("rota") ? "" : "hidden"}`} title={t.descricao || undefined}>
                        <span className="font-mono text-xs">{t.company_origem_id.slice(0, 8)}</span>
                        <span className="mx-1 text-muted-foreground">→</span>
                        <span className="font-mono text-xs">{t.company_destino_id.slice(0, 8)}</span>
                        {t.descricao && <span className="text-xs text-muted-foreground ml-2">{t.descricao}</span>}
                      </td>
                      <td className={`px-3 py-1 truncate border-r border-[#F1F3F5] ${trCols.isColVisible("natureza") ? "" : "hidden"}`}><Badge variant="outline">{naturezaLabels[t.natureza] || t.natureza}</Badge></td>
                      <td className={`px-3 py-1 text-right font-semibold text-[#1D2939] truncate border-r border-[#F1F3F5] ${trCols.isColVisible("valor") ? "" : "hidden"}`}>{fmt(t.valor)}</td>
                      <td className={`px-3 py-1 truncate border-r border-[#F1F3F5] ${trCols.isColVisible("status") ? "" : "hidden"}`}><Badge variant={sc.variant}>{sc.label}</Badge></td>
                      <td className={`px-3 py-1 ${trCols.isColVisible("acoes") ? "" : "hidden"}`}>
                        {t.status === "pendente" && (
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" className="h-7" onClick={() => handleAprovar(t.id, "aprovada")}>Aprovar</Button>
                            <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => handleAprovar(t.id, "cancelada")}>Cancelar</Button>
                          </div>
                        )}
                        {t.status === "aprovada" && <Button size="sm" variant="ghost" className="h-7" onClick={() => handleConcluir(t.id)}>Concluir</Button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Sheet open={showForm} onOpenChange={setShowForm}>
        <SheetContent>
          <SheetHeader><SheetTitle>Nova Transferência</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-6">
            <div><Label>Empresa Origem (ID)</Label><Input value={form.company_origem_id} onChange={(e) => setForm((f) => ({ ...f, company_origem_id: e.target.value }))} placeholder="UUID" /></div>
            <div><Label>Empresa Destino (ID)</Label><Input value={form.company_destino_id} onChange={(e) => setForm((f) => ({ ...f, company_destino_id: e.target.value }))} placeholder="UUID" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Valor</Label><Input type="number" step="0.01" value={form.valor} onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))} /></div>
              <div><Label>Data</Label><Input type="date" value={form.data} onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))} /></div>
            </div>
            <div>
              <Label>Natureza</Label>
              <Select value={form.natureza} onValueChange={(v) => setForm((f) => ({ ...f, natureza: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mutuo">Mútuo</SelectItem>
                  <SelectItem value="adiantamento">Adiantamento</SelectItem>
                  <SelectItem value="capital">Capital</SelectItem>
                  <SelectItem value="operacional">Operacional</SelectItem>
                  <SelectItem value="outros">Outros</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Descrição</Label><Input value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} /></div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ── RELATÓRIOS ──

function RelatoriosTab({ userId }: { userId?: string }) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [relatorios, setRelatorios] = useState<Relatorio[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const now = new Date();
  const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [form, setForm] = useState({ nome: "", tipo: "dre_comparativo", empresas_ids: "", competencia_inicio: mesAtual, competencia_fim: mesAtual, indicador: "" });

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data } = await supabase.from("relatorios_comparativos").select("*").eq("owner_id", userId).order("created_at", { ascending: false });
      setRelatorios(data || []);
    } catch { /* */ } finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async () => {
    if (!userId || !form.nome.trim()) return;
    setSaving(true);
    try {
      const ids = form.empresas_ids.split(",").map((s) => s.trim()).filter(Boolean);
      await supabase.from("relatorios_comparativos").insert({
        owner_id: userId, nome: form.nome, tipo: form.tipo, empresas_ids: ids,
        competencia_inicio: form.competencia_inicio, competencia_fim: form.competencia_fim,
        indicador: form.indicador || null, gerado_por: userId, gerado_em: new Date().toISOString(),
      });
      setShowForm(false);
      setForm({ nome: "", tipo: "dre_comparativo", empresas_ids: "", competencia_inicio: mesAtual, competencia_fim: mesAtual, indicador: "" });
      fetchData();
      toast({ title: "Relatório gerado" });
    } catch { toast({ title: "Erro ao gerar", variant: "destructive" }); } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "Excluir este relatório?",
      description: "Esta ação não pode ser desfeita.",
      confirmLabel: "Sim, excluir",
      variant: "destructive",
    });
    if (!ok) return;
    await supabase.from("relatorios_comparativos").delete().eq("id", id);
    fetchData();
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Relatórios Gerados</h2>
        <Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4 mr-2" /> Novo Relatório</Button>
      </div>

      {relatorios.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>Nenhum relatório comparativo gerado</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-4">
          {relatorios.map((r) => (
            <Card key={r.id}><CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{r.nome}</h3>
                  <div className="flex items-center gap-3 mt-1">
                    <Badge variant="secondary">{tipoLabels[r.tipo] || r.tipo}</Badge>
                    <span className="text-xs text-muted-foreground">{r.competencia_inicio} → {r.competencia_fim}</span>
                    <span className="text-xs text-muted-foreground">{r.empresas_ids.length} empresa(s)</span>
                  </div>
                  {r.gerado_em && <p className="text-xs text-muted-foreground mt-1">Gerado em: {new Date(r.gerado_em).toLocaleString("pt-BR")}</p>}
                </div>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </CardContent></Card>
          ))}
        </div>
      )}

      <Sheet open={showForm} onOpenChange={setShowForm}>
        <SheetContent>
          <SheetHeader><SheetTitle>Novo Relatório Comparativo</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-6">
            <div><Label>Nome</Label><Input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Ex: DRE Comparativo Q1" /></div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm((f) => ({ ...f, tipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(tipoLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>IDs das Empresas (vírgula)</Label><Input value={form.empresas_ids} onChange={(e) => setForm((f) => ({ ...f, empresas_ids: e.target.value }))} placeholder="uuid1, uuid2" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Início</Label><Input type="month" value={form.competencia_inicio} onChange={(e) => setForm((f) => ({ ...f, competencia_inicio: e.target.value }))} /></div>
              <div><Label>Fim</Label><Input type="month" value={form.competencia_fim} onChange={(e) => setForm((f) => ({ ...f, competencia_fim: e.target.value }))} /></div>
            </div>
            <div><Label>Indicador (opcional)</Label><Input value={form.indicador} onChange={(e) => setForm((f) => ({ ...f, indicador: e.target.value }))} /></div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving || !form.nome.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Gerar"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
