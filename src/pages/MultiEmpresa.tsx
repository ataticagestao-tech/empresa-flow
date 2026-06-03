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
import { useIndicadores } from "@/hooks/useIndicadores";
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
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, Cell, ReferenceLine, LabelList,
  PieChart, Pie, ComposedChart, Line,
} from "recharts";
import {
  Building2, Plus, Trash2, Edit2, RefreshCw, ArrowRightLeft,
  Loader2, FileText, BarChart3, GitMerge, ArrowLeft, ChevronRight,
  Eye, ChevronDown, Info, TrendingUp, TrendingDown, Wallet, Landmark,
  ArrowDownLeft, ArrowUpRight, Activity, Users, CreditCard, Receipt, Coins,
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

type CpClasse = "excluir" | "imposto" | "custo" | "despesa";

/** Imposto sobre vendas (dedução da receita): Simples Nacional, DAS/DARF, ISS/ICMS, tributos.
 * NÃO inclui encargos de folha (FGTS/INSS), que são despesa de pessoal. */
function isImpostoVendas(name: string | null | undefined, dreGroup: string | null | undefined): boolean {
  if (normalizeTxt(dreGroup).includes("deduc")) return true;
  const n = normalizeTxt(name);
  if (!n || n.includes("fgts") || n.includes("inss")) return false;
  return n.includes("simples nacional") || n.includes("darf") || n.includes("das/darf")
    || n.includes("imposto sobre") || n.includes("tributos");
}

/** Imposto s/ vendas (dedução) vs Custo (CMV/maquininha) vs Despesa (operacional) vs Excluir. */
function classificaCpClasse(accountType: string | null | undefined, dreGroup: string | null | undefined, name?: string | null): CpClasse {
  const at = (accountType || "").toLowerCase();
  const norm = normalizeTxt(dreGroup);
  if (at === "asset" || at === "liability" || at === "equity" || at === "revenue") return "excluir";
  if (norm.includes("nao dre")) return "excluir";
  if (isImpostoVendas(name, dreGroup)) return "imposto";       // dedução da receita
  if (isTaxaCartao(name)) return "custo";                      // MDR/maquininha = custo variável de vender
  if (at === "cost" || norm.includes("custo") || norm.includes("cmv") || norm.includes("csp")) return "custo";
  return "despesa";
}

/** Conta de taxa de cartão/maquininha (a "taxa lançada na DRE"). Casa os nomes reais do
 * plano de contas: "Taxa da Maquininha - MDR …", "Taxas de Maquininha / Antecipação",
 * "Taxas de operadora / maquininha". */
function isTaxaCartao(name: string | null | undefined): boolean {
  const n = normalizeTxt(name);
  if (!n) return false;
  if (n.includes("maquininha") || n.includes("maquina") || n.includes("mdr")) return true;
  const temTaxa = n.includes("taxa") || n.includes("tarifa");
  return temTaxa && (n.includes("operadora") || n.includes("cart") || n.includes("adquir") || n.includes("antecipac"));
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
  imposto: number; // CP classe imposto sobre vendas / dedução (competência)
  resultado: number; // faturamento − despesa (KPI)
  caixa: number;
  cr_aberto: number;
  cp_aberto: number;
  peFinanceiro: number | null; // faturamento mínimo p/ o caixa empatar
  caixaGerado: number; // entradas pagas − saídas pagas no período
  credito: number; // vendas no cartão de crédito (valor_total)
  debito: number; // vendas no cartão de débito (valor_total)
  taxasCartao: number; // CP lançada em contas de taxa de maquininha/MDR no período (a "taxa na DRE")
}

interface GrupoVendaPonto {
  company_id: string;
  date: string; // 'YYYY-MM-DD'
  valor: number;
}

interface DespesaCategoria {
  nome: string;
  valor: number;
}

interface DreCategoria {
  nome: string; // nome da conta contábil
  classe: "imposto" | "custo" | "despesa";
  porEmpresa: Record<string, number>; // company_id → valor (competência)
}

interface GrupoDashboardData {
  rows: GrupoCompanyRow[];
  totals: ConsolidadoTotals;
  vendasDiarias: GrupoVendaPonto[];
  despesasPorCategoria: DespesaCategoria[]; // grupo-todo, maior → menor (custo + despesa operacional)
  dreCategorias: DreCategoria[]; // categorias da DRE (custo/despesa) com valor por empresa
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
  if (companyIds.length === 0) return { rows: [], totals: zeroTotals, vendasDiarias: [], despesasPorCategoria: [], dreCategorias: [] };

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
    faturamento: number; despesa: number; custo: number; despesaOp: number; imposto: number;
    caixa: number; cr_aberto: number; cp_aberto: number; credito: number; debito: number;
    entradas: number; saidas: number; custoFixo: number; custoVar: number; naoDesemb: number;
    taxasCartao: number;
  }
  const base: Record<string, Acc> = {};
  companyIds.forEach((id) => {
    base[id] = {
      faturamento: 0, despesa: 0, custo: 0, despesaOp: 0, imposto: 0, caixa: 0, cr_aberto: 0, cp_aberto: 0,
      credito: 0, debito: 0, entradas: 0, saidas: 0, custoFixo: 0, custoVar: 0, naoDesemb: 0,
      taxasCartao: 0,
    };
  });
  // Despesa por categoria (grupo-todo) p/ o gráfico "o que consome a margem".
  const despCat = new Map<string, number>();
  // Despesa por categoria POR EMPRESA + classe (custo/despesa) p/ a DRE detalhada.
  const dreCatByCompany = new Map<string, Map<string, number>>(); // company_id → (categoria → valor)
  const catClasse = new Map<string, "imposto" | "custo" | "despesa">();

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
    if (naoTransfer(r) === false) return;
    if (isExcluidoDoResultado(acc?.account_type, acc?.dre_group)) return;

    const classe = classificaCpClasse(acc?.account_type, acc?.dre_group, acc?.name);
    if (classe === "excluir") return;
    if (classe === "imposto") b.imposto += valor;
    else if (classe === "custo") b.custo += valor;
    else b.despesaOp += valor;

    // Taxa de cartão lançada na DRE (subconjunto da despesa) — alimenta o painel de taxas.
    if (isTaxaCartao(acc?.name)) b.taxasCartao += valor;

    // Despesa por categoria: grupo-todo (gráfico) + por empresa (DRE detalhada).
    const catNome = (acc?.name || "Sem categoria").trim();
    despCat.set(catNome, (despCat.get(catNome) || 0) + valor);
    catClasse.set(catNome, classe);
    let perCompCat = dreCatByCompany.get(r.company_id);
    if (!perCompCat) { perCompCat = new Map(); dreCatByCompany.set(r.company_id, perCompCat); }
    perCompCat.set(catNome, (perCompCat.get(catNome) || 0) + valor);

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
      faturamento: b.faturamento, despesa: b.despesa, custo: b.custo, despesaOp: b.despesaOp, imposto: b.imposto,
      resultado: b.faturamento - b.despesa, caixa: b.caixa, cr_aberto: b.cr_aberto, cp_aberto: b.cp_aberto,
      peFinanceiro, caixaGerado: b.entradas - b.saidas, credito: b.credito, debito: b.debito,
      taxasCartao: b.taxasCartao,
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

  const despesasPorCategoria: DespesaCategoria[] = [...despCat.entries()]
    .map(([nome, valor]) => ({ nome, valor }))
    .filter((d) => d.valor > 0)
    .sort((a, b) => b.valor - a.valor);

  // DRE detalhada: categorias (conta contábil) com valor por empresa + classe.
  // Ordem dos blocos: Impostos → Custos → Despesas; dentro de cada bloco, do maior pro menor.
  const ordemClasse = { imposto: 0, custo: 1, despesa: 2 } as const;
  const dreCategorias: DreCategoria[] = [...catClasse.entries()]
    .map(([nome, classe]) => {
      const porEmpresa: Record<string, number> = {};
      let total = 0;
      dreCatByCompany.forEach((m, cid) => { const v = m.get(nome) || 0; if (v) { porEmpresa[cid] = v; total += v; } });
      return { nome, classe, porEmpresa, total };
    })
    .filter((c) => c.total > 0)
    .sort((a, b) => (a.classe === b.classe ? b.total - a.total : ordemClasse[a.classe] - ordemClasse[b.classe]))
    .map(({ nome, classe, porEmpresa }) => ({ nome, classe, porEmpresa }));

  return { rows, totals, vendasDiarias, despesasPorCategoria, dreCategorias };
}

// ── Componentes de gráfico (comparativos do grupo) ──

const shortName = (n: string) => (n.length > 16 ? n.slice(0, 15) + "…" : n);

// ── Tokens visuais ──
const NAVY = "#071D41";
const AXIS = "#475569";
const GRID = "#EEF1F4";
const TXT2 = "#667085";
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
  icon: React.ElementType;
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

/** Card no MODELO DE TABELA do sistema: header navy #071D41 + corpo branco flush (igual "Empresas do grupo"). */
function CompCard({
  title, subtitle, info, caption, stats, legend, headerRight, height = 240, children,
}: {
  title: string; subtitle?: string; info?: string; caption?: string;
  stats?: CardStat[]; legend?: CardLegend[]; headerRight?: React.ReactNode;
  height?: number; children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="px-5 py-3.5 flex items-start justify-between gap-3" style={{ backgroundColor: NAVY }}>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-extrabold text-white m-0" style={{ fontSize: 14, letterSpacing: "-0.01em", textTransform: "uppercase" }}>{title}</h3>
            {info && <span title={info} className="inline-flex cursor-help"><Info size={13} className="text-white/60" /></span>}
          </div>
          {subtitle && <div className="text-white/65" style={{ fontSize: 11, fontWeight: 500, marginTop: 2 }}>{subtitle}</div>}
        </div>
        {headerRight}
      </div>
      <div className="bg-white px-5 py-4 flex flex-col gap-3">
        {stats && stats.length > 0 && (
          <div className="flex gap-4 pb-3" style={{ borderBottom: "1px solid #F1F3F5" }}>
            {stats.map((s) => (
              <div key={s.label} style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 9.5, color: TXT2, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 2 }}>{s.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: s.color || "#1D2939", fontVariantNumeric: "tabular-nums", lineHeight: 1.15, whiteSpace: "nowrap" }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}
        {legend && legend.length > 0 && (
          <div className="flex justify-center gap-6" style={{ fontSize: 12, color: TXT2 }}>
            {legend.map((l) => (
              <span key={l.label} className="inline-flex items-center gap-1.5">
                <span style={{ width: 10, height: 10, background: l.color, borderRadius: 2 }} />{l.label}
              </span>
            ))}
          </div>
        )}
        <div style={{ height }}>{children}</div>
        {caption && <p style={{ fontSize: 11.5, color: TXT2, lineHeight: 1.35 }}>{caption}</p>}
      </div>
    </Card>
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

  const { data, series, monthStarts } = useMemo(() => {
    const bucketKey = (date: string) =>
      gran === "dia" ? date : gran === "semana" ? weekStartISO(date) : date.slice(0, 7);

    const top = new Set(topIds);
    // bucketKey (cru) → { companyId → soma }
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
      const row: Record<string, number | string> = { bucket: k };
      const vals = buckets.get(k) || {};
      let total = 0;
      series.forEach((s) => { const v = vals[s.id] || 0; row[s.key] = v; total += v; });
      row._total = total;
      return row;
    });
    // No modo Dia, marca a 1ª data de cada mês (p/ destacar o mês no eixo).
    const monthStarts = new Set<string>();
    if (gran === "dia") {
      let prevMonth = "";
      sortedKeys.forEach((k) => { const m = k.slice(0, 7); if (m !== prevMonth) { monthStarts.add(k); prevMonth = m; } });
    }
    return { data, series, monthStarts };
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

  // Rótulo de % dentro de cada segmento (só quando o pedaço cabe, p/ não poluir).
  const renderPct = (props: { x?: number; y?: number; width?: number; height?: number; value?: number; index?: number }) => {
    const { x = 0, y = 0, width = 0, height = 0, value = 0, index = 0 } = props;
    const total = Number((data[index] as { _total?: number } | undefined)?._total) || 0;
    const v = Number(value) || 0;
    if (!total || v <= 0 || height < 13) return null;
    const pct = (v / total) * 100;
    if (pct < 7) return null;
    return (
      <text x={x + width / 2} y={y + height / 2} textAnchor="middle" dominantBaseline="central" fontSize={9} fontWeight={700} fill="#fff">
        {pct.toFixed(0)}%
      </text>
    );
  };

  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

  // Rótulo do eixo X: Dia = só o número (mês em negrito na virada); Semana = dd/mm; Mês = mm/aa.
  const renderTimeTick = (props: { x?: number; y?: number; payload?: { value?: string } }) => {
    const { x = 0, y = 0, payload } = props;
    const key = String(payload?.value ?? "");
    let main = key, sub = "";
    if (gran === "mes") {
      const [yy, mm] = key.split("-");
      main = `${mm}/${(yy || "").slice(2)}`;
    } else {
      const d = parseLocalDate(key);
      if (d) {
        if (gran === "semana") {
          main = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
        } else {
          main = String(d.getDate());
          if (monthStarts.has(key)) sub = `${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
        }
      }
    }
    return (
      <g transform={`translate(${x},${y + 8})`}>
        <text x={0} y={0} textAnchor="middle" fontSize={10} fontWeight={500} fill={TXT2}>{main}</text>
        {sub && <text x={0} y={13} textAnchor="middle" fontSize={9.5} fontWeight={700} fill="#1D2939">{sub}</text>}
      </g>
    );
  };

  // No modo Dia mostra TODOS os dias (1,2,3,4…); só amostra se o período for muito longo (ex.: ano).
  const dayTicks = useMemo(() => {
    if (gran !== "dia") return undefined;
    const keys = data.map((d) => String(d.bucket));
    if (keys.length <= 70) return keys;
    const step = Math.ceil(keys.length / 60);
    return keys.filter((k, i) => monthStarts.has(k) || i % step === 0);
  }, [gran, data, monthStarts]);

  const labelFmt = (key: string | number) => {
    const s = String(key);
    if (gran === "mes") { const [yy, mm] = s.split("-"); return `${MESES[Number(mm) - 1] ?? mm}/${(yy || "").slice(2)}`; }
    const d = parseLocalDate(s);
    if (!d) return s;
    const f = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
    return gran === "semana" ? `Semana de ${f}` : f;
  };

  // Média por período (média das colunas) + total — alimenta a faixa e a linha tracejada.
  const totalPeriodo = data.reduce((s, d) => s + (Number((d as { _total?: number })._total) || 0), 0);
  const media = data.length ? totalPeriodo / data.length : 0;
  const granLabel = gran === "dia" ? "dia" : gran === "semana" ? "semana" : "mês";
  const stats: CardStat[] = [
    { label: `Média / ${granLabel}`, value: fmt(media) },
    { label: "Total no período", value: fmt(totalPeriodo) },
  ];

  return (
    <CompCard
      title="Vendas no tempo" subtitle="Top 5 lojas · contribuição por período"
      headerRight={headerRight} stats={stats} legend={legend} height={300}
      caption="Cada coluna = vendas do período; as cores mostram quanto cada loja contribuiu. A linha tracejada é a média por período."
    >
      {data.length === 0 ? (
        <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: TXT2 }}>Sem vendas no período</div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 4 }} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="bucket" tick={renderTimeTick} height={gran === "dia" ? 42 : 28} axisLine={{ stroke: AXIS, strokeWidth: 1 }} tickLine={{ stroke: AXIS }} interval={gran === "dia" ? 0 : "preserveStartEnd"} ticks={gran === "dia" ? dayTicks : undefined} minTickGap={gran === "dia" ? 0 : 16} tickMargin={8} />
            <YAxis tick={{ fontSize: 9, fill: TXT2, fontWeight: 500 }} axisLine={{ stroke: AXIS, strokeWidth: 1 }} tickLine={{ stroke: AXIS }} width={40} tickFormatter={yTickFmt} />
            <ReTooltip contentStyle={TOOLTIP_STYLE} labelFormatter={labelFmt} formatter={(v: number, n: string) => [fmt(v), n]} cursor={{ fill: "rgba(3, 152, 85, 0.06)" }} />
            {series.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} name={s.nome} stackId="lojas" fill={s.color} maxBarSize={48} radius={i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}>
                <LabelList dataKey={s.key} content={renderPct} />
              </Bar>
            ))}
            {media > 0 && (
              <ReferenceLine y={media} stroke="#475569" strokeWidth={1.5} strokeDasharray="5 5" label={{ value: "média", position: "insideTopRight", fill: "#475569", fontSize: 10, fontWeight: 600 }} />
            )}
          </BarChart>
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

// ── Funcionários por empresa (agregado p/ "faturamento por funcionário") ──

interface FuncAgg { clt: number; pj: number; autonomo: number; estagio: number; temporario: number; total: number; }
type FuncByCompany = Record<string, FuncAgg>;
const FUNC_TIPO_LABEL: Record<string, string> = { clt: "CLT", pj: "PJ", autonomo: "Autônomo", estagio: "Estágio", temporario: "Temporário" };

const pctTxt = (v: number, d = 1) => `${v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d })}%`;

// ── 1º DRE comparativa: lojas lado a lado (1 período) ──

/** DRE por competência DETALHADA por categoria (conta contábil), com uma coluna por loja
 * selecionada + TOTAL. Custos e Despesas abrem nas suas categorias. Lojas ligam/desligam. */
function DREComparativaCard({ rows, categorias, periodLabel }: { rows: GrupoCompanyRow[]; categorias: DreCategoria[]; periodLabel: string }) {
  // Rastreamos as DEselecionadas: assim toda loja nova já entra ligada por padrão.
  const [excluidas, setExcluidas] = useState<Set<string>>(new Set());
  const [detalhar, setDetalhar] = useState(true); // abre detalhado por categoria
  const isOn = (id: string) => !excluidas.has(id);
  const toggle = (id: string) =>
    setExcluidas((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const sel = rows.filter((r) => isOn(r.company_id));
  const total = sel.reduce(
    (a, r) => ({ faturamento: a.faturamento + r.faturamento, custo: a.custo + r.custo, despesaOp: a.despesaOp + r.despesaOp, imposto: a.imposto + r.imposto }),
    { faturamento: 0, custo: 0, despesaOp: 0, imposto: 0 },
  );
  type DreLin = { faturamento: number; custo: number; despesaOp: number; imposto: number };
  const receitaLiq = (r: DreLin) => r.faturamento - r.imposto;
  const resultadoDe = (r: DreLin) => r.faturamento - r.imposto - r.custo - r.despesaOp;
  const margemDe = (res: number, f: number) => (f > 0 ? (res / f) * 100 : 0);

  const impostos = categorias.filter((c) => c.classe === "imposto");
  const custos = categorias.filter((c) => c.classe === "custo");
  const despesas = categorias.filter((c) => c.classe === "despesa");
  const catTotalSel = (c: DreCategoria) => sel.reduce((s, r) => s + (c.porEmpresa[r.company_id] || 0), 0);

  const colCount = sel.length + 2; // DRE + lojas + TOTAL

  // Linha principal. tipo: rec = Receita; neg = dedução/custo/despesa; sub = subtotal (Receita líquida); res = Resultado.
  const renderLinha = (label: string, valor: (r: DreLin) => number, tipo: "rec" | "neg" | "sub" | "res") => (
    <tr key={label} className={`border-b border-[#F1F3F5] ${tipo === "res" ? "bg-[#FAFAFA]" : ""}`}>
      <td className={`px-3 py-1.5 sticky left-0 ${tipo === "res" ? "bg-[#FAFAFA] font-bold text-[#1D2939]" : "bg-white"} ${tipo === "rec" || tipo === "neg" || tipo === "sub" ? "font-semibold text-[#1D2939]" : ""}`}>{label}</td>
      {sel.map((r) => {
        const v = valor(r);
        const color = tipo === "res" ? (v >= 0 ? "#1570EF" : "#E53E3E") : tipo === "neg" ? "#B54708" : "#1D2939";
        return <td key={r.company_id} className="text-right px-3 py-1.5 whitespace-nowrap tabular-nums" style={{ color, fontWeight: tipo === "res" ? 700 : 600 }}>{tipo === "neg" ? `(${fmt(v)})` : fmt(v)}</td>;
      })}
      {(() => {
        const v = valor(total);
        const color = tipo === "res" ? (v >= 0 ? "#1570EF" : "#E53E3E") : tipo === "neg" ? "#B54708" : "#1D2939";
        return <td className="text-right px-3 py-1.5 whitespace-nowrap tabular-nums bg-[#F6F2EB]" style={{ color, fontWeight: 700 }}>{tipo === "neg" ? `(${fmt(v)})` : fmt(v)}</td>;
      })()}
    </tr>
  );

  // Linha de categoria (indentada, sob Custos/Despesas)
  const renderCatRow = (c: DreCategoria) => {
    const tSel = catTotalSel(c);
    if (tSel <= 0) return null;
    return (
      <tr key={c.classe + "|" + c.nome} className="border-b border-[#F7F7F7]">
        <td className="px-3 py-1 sticky left-0 bg-white truncate" style={{ paddingLeft: 28, color: "#667085", fontSize: 12.5, maxWidth: 260 }} title={c.nome}>{c.nome}</td>
        {sel.map((r) => {
          const v = c.porEmpresa[r.company_id] || 0;
          return <td key={r.company_id} className="text-right px-3 py-1 whitespace-nowrap tabular-nums" style={{ color: v ? "#98623A" : "#CBD2DA", fontSize: 12.5 }}>{v ? `(${fmt(v)})` : "—"}</td>;
        })}
        <td className="text-right px-3 py-1 whitespace-nowrap tabular-nums bg-[#FBF8F3]" style={{ color: "#98623A", fontSize: 12.5, fontWeight: 600 }}>{`(${fmt(tSel)})`}</td>
      </tr>
    );
  };

  return (
    <Card className="overflow-hidden p-0" data-pdf-chart>
      <div className="px-5 py-3.5 flex items-start justify-between gap-3" style={{ backgroundColor: NAVY }}>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-extrabold text-white m-0" style={{ fontSize: 14, letterSpacing: "-0.01em", textTransform: "uppercase" }}>DRE comparativa — lojas lado a lado</h3>
            <span title="Demonstrativo de Resultado por competência. Receita = vendas; Custos/Despesas = contas a pagar classificadas no plano de contas, abertas por categoria. Marque/desmarque lojas e troque o período no topo." className="inline-flex cursor-help"><Info size={13} className="text-white/60" /></span>
          </div>
          <div className="text-white/65" style={{ fontSize: 11, fontWeight: 500, marginTop: 2 }}>{periodLabel} · regime de competência · {sel.length} de {rows.length} loja(s)</div>
        </div>
        <button
          onClick={() => setDetalhar((d) => !d)}
          className="self-center rounded-lg text-[12px] font-medium px-2.5 py-1.5 whitespace-nowrap"
          style={{ background: detalhar ? "#fff" : "transparent", color: detalhar ? NAVY : "rgba(255,255,255,0.85)", border: "1px solid rgba(255,255,255,0.25)" }}
          title="Mostrar/ocultar as categorias dentro de Custos e Despesas"
        >
          {detalhar ? "Ocultar categorias" : "Detalhar categorias"}
        </button>
      </div>
      <div className="bg-white px-5 py-4 flex flex-col gap-3">
        {/* Chips de seleção de lojas */}
        <div className="flex flex-wrap gap-2">
          {rows.map((r) => (
            <button
              key={r.company_id}
              onClick={() => toggle(r.company_id)}
              className="px-2.5 py-1 rounded-full text-[12px] font-medium border transition-colors"
              style={isOn(r.company_id)
                ? { background: "#071D41", color: "#fff", borderColor: "#071D41" }
                : { background: "#fff", color: TXT2, borderColor: "#D0D5DD" }}
              title={isOn(r.company_id) ? "Clique para tirar da comparação" : "Clique para incluir"}
            >
              {r.nome}
            </button>
          ))}
        </div>

        {sel.length === 0 ? (
          <div style={{ padding: "32px 0", textAlign: "center", fontSize: 13, color: TXT2 }}>Selecione ao menos uma loja.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-sm" style={{ minWidth: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr className="text-[12px] font-bold text-black uppercase tracking-wider border-b-2 border-[#D0D5DD]">
                  <th className="text-left px-3 py-2.5 sticky left-0 bg-white" style={{ minWidth: 200 }}>DRE</th>
                  {sel.map((r) => (
                    <th key={r.company_id} className="text-right px-3 py-2.5 whitespace-nowrap" style={{ minWidth: 120 }} title={r.nome}>{shortName(r.nome)}</th>
                  ))}
                  <th className="text-right px-3 py-2.5 whitespace-nowrap bg-[#F6F2EB]" style={{ minWidth: 120 }}>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {renderLinha("Receita", (r) => r.faturamento, "rec")}
                {/* Impostos sobre vendas (dedução) — só aparece se houver */}
                {impostos.some((c) => catTotalSel(c) > 0) && <>
                  {renderLinha("(−) Impostos s/ vendas", (r) => r.imposto, "neg")}
                  {detalhar && impostos.map(renderCatRow)}
                  {renderLinha("= Receita líquida", (r) => receitaLiq(r), "sub")}
                </>}
                {renderLinha("(−) Custos", (r) => r.custo, "neg")}
                {detalhar && (custos.some((c) => catTotalSel(c) > 0)
                  ? custos.map(renderCatRow)
                  : <tr key="sem-custo"><td colSpan={colCount} className="px-3 py-1 sticky left-0 bg-white" style={{ paddingLeft: 28, color: "#98A2B3", fontSize: 12 }}>Sem custos classificados no período</td></tr>)}
                {renderLinha("(−) Despesas", (r) => r.despesaOp, "neg")}
                {detalhar && (despesas.some((c) => catTotalSel(c) > 0)
                  ? despesas.map(renderCatRow)
                  : <tr key="sem-desp"><td colSpan={colCount} className="px-3 py-1 sticky left-0 bg-white" style={{ paddingLeft: 28, color: "#98A2B3", fontSize: 12 }}>Sem despesas classificadas no período</td></tr>)}
                {renderLinha("= Resultado", (r) => resultadoDe(r), "res")}
                {/* Margem % */}
                <tr className="border-b border-[#F1F3F5]">
                  <td className="px-3 py-1.5 sticky left-0 bg-white text-[#475467]">Margem %</td>
                  {sel.map((r) => {
                    const mg = margemDe(resultadoDe(r), r.faturamento);
                    return <td key={r.company_id} className="text-right px-3 py-1.5 whitespace-nowrap tabular-nums" style={{ color: mg >= 0 ? "#039855" : "#E53E3E", fontWeight: 600 }}>{pctTxt(mg)}</td>;
                  })}
                  {(() => {
                    const mg = margemDe(resultadoDe(total), total.faturamento);
                    return <td className="text-right px-3 py-1.5 whitespace-nowrap tabular-nums bg-[#F6F2EB]" style={{ color: mg >= 0 ? "#039855" : "#E53E3E", fontWeight: 700 }}>{pctTxt(mg)}</td>;
                  })()}
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p style={{ fontSize: 11.5, color: TXT2, lineHeight: 1.35 }}>Receita pelas vendas; Impostos sobre vendas, Custos e Despesas pelas contas a pagar classificadas no plano de contas (regime de competência), abertas por categoria. Marque/desmarque lojas acima; o período vem do seletor no topo.</p>
      </div>
    </Card>
  );
}

// ── 2º Geração de caixa: painel de explicação (ao lado do gráfico) ──

function CaixaExplicacaoPanel({ rows, periodLabel }: { rows: GrupoCompanyRow[]; periodLabel: string }) {
  const totalGerado = rows.reduce((s, r) => s + r.caixaGerado, 0);
  const queimaram = rows.filter((r) => r.caixaGerado < 0).sort((a, b) => a.caixaGerado - b.caixaGerado);
  const geraram = rows.filter((r) => r.caixaGerado > 0).sort((a, b) => b.caixaGerado - a.caixaGerado);
  const melhor = geraram[0];

  return (
    <Card className="overflow-hidden p-0 h-full">
      <div className="px-5 py-3.5" style={{ backgroundColor: NAVY }}>
        <h3 className="font-extrabold text-white m-0" style={{ fontSize: 14, letterSpacing: "-0.01em", textTransform: "uppercase" }}>Como ler a geração de caixa</h3>
        <div className="text-white/65" style={{ fontSize: 11, fontWeight: 500, marginTop: 2 }}>{periodLabel} · regime de caixa</div>
      </div>
      <div className="bg-white px-5 py-4 flex flex-col gap-3" style={{ fontSize: 13.5, color: "#1D2939", lineHeight: 1.5 }}>
        <p style={{ color: TXT2 }}>
          <b style={{ color: "#1D2939" }}>Geração de caixa</b> = tudo que <b>entrou</b> (recebimentos pagos) menos tudo que <b>saiu</b> (pagamentos), no período. É dinheiro de verdade na conta — diferente do resultado (que é por competência). Transferências entre contas não contam.
        </p>
        <div className="flex items-start gap-2.5">
          <span style={{ fontSize: 15 }}>{totalGerado >= 0 ? "✅" : "🔴"}</span>
          <span>O grupo {totalGerado >= 0 ? "gerou" : "queimou"} <b style={{ color: totalGerado >= 0 ? "#039855" : "#E53E3E" }}>{fmt(Math.abs(totalGerado))}</b> de caixa no período.</span>
        </div>
        {melhor && (
          <div className="flex items-start gap-2.5">
            <span style={{ fontSize: 15 }}>🏆</span>
            <span>Quem mais gerou caixa: <b>{melhor.nome}</b> ({fmt(melhor.caixaGerado)}).</span>
          </div>
        )}
        {queimaram.length > 0 ? (
          <div className="flex items-start gap-2.5">
            <span style={{ fontSize: 15 }}>⚠️</span>
            <span>{queimaram.length} {queimaram.length > 1 ? "lojas queimaram" : "loja queimou"} caixa (gastou mais do que entrou): <b>{queimaram.slice(0, 3).map((r) => r.nome).join(", ")}{queimaram.length > 3 ? "…" : ""}</b>. Vale checar prazos de recebimento e despesas concentradas.</span>
          </div>
        ) : (
          <div className="flex items-start gap-2.5">
            <span style={{ fontSize: 15 }}>✅</span>
            <span>Nenhuma loja queimou caixa no período.</span>
          </div>
        )}
        <p style={{ fontSize: 11.5, color: TXT2, marginTop: "auto", paddingTop: 6 }}>No gráfico ao lado: barra verde = gerou caixa; barra vermelha = queimou.</p>
      </div>
    </Card>
  );
}

// ── 3º Crédito × Débito (pizza) por loja + valor em taxas (lançado na DRE) ──

function CredDebPizzaCard({ rows, periodLabel }: { rows: GrupoCompanyRow[]; periodLabel: string }) {
  const comCartao = rows.filter((r) => r.credito > 0 || r.debito > 0);
  const [companyId, setCompanyId] = useState<string>("");
  const sel = comCartao.find((r) => r.company_id === companyId) || comCartao[0];

  const totalCartao = sel ? sel.credito + sel.debito : 0;
  const taxa = sel?.taxasCartao ?? 0;
  const taxaPct = totalCartao > 0 ? (taxa / totalCartao) * 100 : 0;
  const pieData = sel ? [
    { name: "Crédito", value: sel.credito, color: "#1570EF" },
    { name: "Débito", value: sel.debito, color: "#039855" },
  ].filter((d) => d.value > 0) : [];

  return (
    <Card className="overflow-hidden p-0" data-pdf-chart>
      <div className="px-5 py-3.5 flex items-start justify-between gap-3" style={{ backgroundColor: NAVY }}>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-extrabold text-white m-0" style={{ fontSize: 14, letterSpacing: "-0.01em", textTransform: "uppercase" }}>Crédito × Débito por loja</h3>
            <span title="Vendas no cartão (pela forma de pagamento). O valor em taxas é a taxa de maquininha/MDR lançada na DRE da loja no período." className="inline-flex cursor-help"><Info size={13} className="text-white/60" /></span>
          </div>
          <div className="text-white/65" style={{ fontSize: 11, fontWeight: 500, marginTop: 2 }}>{periodLabel} · escolha a loja</div>
        </div>
        {comCartao.length > 0 && (
          <select
            value={sel?.company_id || ""}
            onChange={(e) => setCompanyId(e.target.value)}
            className="rounded-lg text-[12px] font-medium px-2.5 py-1.5 self-center"
            style={{ background: "#fff", color: NAVY, border: "1px solid rgba(255,255,255,0.25)", maxWidth: 180 }}
          >
            {comCartao.map((r) => (<option key={r.company_id} value={r.company_id}>{r.nome}</option>))}
          </select>
        )}
      </div>
      <div className="bg-white px-5 py-4">
        {comCartao.length === 0 || !sel ? (
          <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: TXT2 }}>Nenhuma venda no cartão no período</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            {/* Esquerda: pizza */}
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={88} paddingAngle={2} stroke="#fff" strokeWidth={2}>
                    {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <ReTooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, n: string) => [`${fmt(v)} (${pctTxt(totalCartao > 0 ? (v / totalCartao) * 100 : 0, 0)})`, n]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-6" style={{ fontSize: 12, color: TXT2, marginTop: 4 }}>
                <span className="inline-flex items-center gap-1.5"><span style={{ width: 10, height: 10, background: "#1570EF", borderRadius: 2 }} />Crédito</span>
                <span className="inline-flex items-center gap-1.5"><span style={{ width: 10, height: 10, background: "#039855", borderRadius: 2 }} />Débito</span>
              </div>
            </div>
            {/* Direita: taxas da loja */}
            <div className="flex flex-col gap-3">
              <div style={{ fontSize: 9.5, color: TXT2, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>Valor em taxas — {sel.nome}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#B54708", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{fmt(taxa)}</div>
              <div style={{ fontSize: 12, color: TXT2 }}>
                {taxa > 0 ? <>≈ <b style={{ color: "#1D2939" }}>{pctTxt(taxaPct)}</b> do faturado no cartão</> : "Nenhuma taxa de cartão lançada na DRE desta loja no período."}
              </div>
              <div className="flex flex-col gap-1.5 pt-1" style={{ borderTop: "1px solid #F1F3F5" }}>
                {[
                  { l: "Crédito", v: sel.credito, c: "#1570EF" },
                  { l: "Débito", v: sel.debito, c: "#039855" },
                  { l: "Total no cartão", v: totalCartao, c: "#1D2939" },
                ].map((row) => (
                  <div key={row.l} className="flex items-center justify-between" style={{ fontSize: 12.5 }}>
                    <span className="inline-flex items-center gap-1.5" style={{ color: TXT2 }}><span style={{ width: 8, height: 8, background: row.c, borderRadius: 2 }} />{row.l}</span>
                    <span style={{ fontWeight: 600, color: "#1D2939", fontVariantNumeric: "tabular-nums" }}>{fmt(row.v)}</span>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 11, color: TXT2, lineHeight: 1.35, marginTop: 2 }}>Taxa = contas a pagar lançadas em "Taxa da Maquininha / MDR / Operadora" no período.</p>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ── 5º Faturamento por funcionário (produtividade por loja) ──

function FaturamentoPorFuncionarioCard({ rows, funcByCompany, loading }: { rows: GrupoCompanyRow[]; funcByCompany: FuncByCompany; loading?: boolean }) {
  const data = rows
    .map((r) => {
      const f = funcByCompany[r.company_id];
      const total = f?.total || 0;
      return { nome: r.nome, valor: total > 0 ? r.faturamento / total : 0, total, comp: f, faturamento: r.faturamento };
    })
    .filter((d) => d.total > 0 && d.faturamento > 0)
    .sort((a, b) => b.valor - a.valor);

  const totFunc = Object.values(funcByCompany).reduce((s, f) => s + (f?.total || 0), 0);
  const vals = data.map((d) => d.valor);
  const stats: CardStat[] = [
    { label: "Func. (grupo)", value: String(totFunc) },
    { label: "Maior/func.", value: vals.length ? fmt(Math.max(...vals)) : "—", color: "#039855" },
    { label: "Menor/func.", value: vals.length ? fmt(Math.min(...vals)) : "—", color: "#B54708" },
  ];

  const renderTip = (props: { active?: boolean; payload?: Array<{ payload?: { nome?: string; valor?: number; total?: number; comp?: FuncAgg; faturamento?: number } }> }) => {
    if (!props.active || !props.payload?.length) return null;
    const p = props.payload[0]?.payload;
    if (!p) return null;
    const comp = p.comp;
    const partes = comp ? (["clt", "autonomo", "pj", "estagio", "temporario"] as const)
      .filter((k) => (comp[k] || 0) > 0)
      .map((k) => `${FUNC_TIPO_LABEL[k]}: ${comp[k]}`) : [];
    return (
      <div style={TOOLTIP_STYLE}>
        <div style={{ fontWeight: 700, color: "#1D2939", marginBottom: 4 }}>{p.nome}</div>
        <div style={{ color: "#039855", fontWeight: 600 }}>{fmt(p.valor || 0)} / funcionário</div>
        <div style={{ color: TXT2, marginTop: 2 }}>{p.total} funcionário(s) · {fmt(p.faturamento || 0)}</div>
        {partes.length > 0 && <div style={{ color: TXT2, marginTop: 2 }}>{partes.join(" · ")}</div>}
      </div>
    );
  };

  return (
    <CompCard
      title="Faturamento por funcionário"
      subtitle="Produtividade por loja · faturamento ÷ nº de funcionários"
      info="Faturamento da loja dividido pelo número de funcionários ativos (CLT, autônomo, PJ, estágio, temporário). Quanto maior, mais cada pessoa rende."
      caption="Conta funcionários ativos (não desligados). Lojas sem funcionário cadastrado ficam de fora. Passe o mouse para ver a composição por tipo de contrato."
      stats={stats} height={260}
    >
      {loading ? (
        <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: TXT2 }}>Carregando funcionários…</div>
      ) : data.length === 0 ? (
        <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: TXT2, textAlign: "center", padding: "0 16px" }}>Cadastre funcionários nas lojas (com tipo de contrato) para ver o faturamento por pessoa.</div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 4 }} barCategoryGap="18%">
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="nome" interval={0} height={56} tick={<WrappedAxisTick />} axisLine={{ stroke: AXIS, strokeWidth: 1 }} tickLine={{ stroke: AXIS }} tickMargin={8} />
            <YAxis tick={{ fontSize: 9, fill: TXT2, fontWeight: 500 }} axisLine={{ stroke: AXIS, strokeWidth: 1 }} tickLine={{ stroke: AXIS }} width={40} tickFormatter={yTickFmt} />
            <ReTooltip content={renderTip} cursor={{ fill: "rgba(6, 95, 70, 0.06)" }} />
            <Bar dataKey="valor" radius={[4, 4, 0, 0]} fill="#0E7490" maxBarSize={64} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </CompCard>
  );
}

// ── 6º Despesa que mais consome a margem (categorias do grupo) ──

function DespesaMargemCard({ despesas, faturamento, periodLabel }: { despesas: DespesaCategoria[]; faturamento: number; periodLabel: string }) {
  const TOP = 8;
  const top = despesas.slice(0, TOP);
  const outras = despesas.slice(TOP).reduce((s, d) => s + d.valor, 0);
  const data = [
    ...top.map((d) => ({ nome: d.nome, valor: d.valor, pct: faturamento > 0 ? (d.valor / faturamento) * 100 : 0 })),
    ...(outras > 0 ? [{ nome: "Outras categorias", valor: outras, pct: faturamento > 0 ? (outras / faturamento) * 100 : 0 }] : []),
  ];
  const totalDesp = despesas.reduce((s, d) => s + d.valor, 0);
  const consumoPct = faturamento > 0 ? (totalDesp / faturamento) * 100 : 0;
  const margemPct = faturamento > 0 ? 100 - consumoPct : 0;

  const maior = data[0];
  const stats: CardStat[] = [
    { label: "Consome do faturamento", value: pctTxt(consumoPct), color: "#B54708" },
    { label: "Sobra de margem", value: pctTxt(margemPct), color: margemPct >= 0 ? "#039855" : "#E53E3E" },
    { label: "Maior vilã", value: maior ? `${pctTxt(maior.pct)}` : "—" },
  ];

  const shortCat = (n: string) => (n.length > 26 ? n.slice(0, 25) + "…" : n);
  const renderTip = (props: { active?: boolean; payload?: Array<{ payload?: { nome?: string; valor?: number; pct?: number } }> }) => {
    if (!props.active || !props.payload?.length) return null;
    const p = props.payload[0]?.payload;
    if (!p) return null;
    return (
      <div style={TOOLTIP_STYLE}>
        <div style={{ fontWeight: 700, color: "#1D2939", marginBottom: 2 }}>{p.nome}</div>
        <div style={{ color: "#B54708", fontWeight: 600 }}>{fmt(p.valor || 0)}</div>
        <div style={{ color: TXT2, marginTop: 2 }}>{pctTxt(p.pct || 0)} do faturamento</div>
      </div>
    );
  };

  return (
    <CompCard
      title="O que mais consome a margem"
      subtitle={`Maiores categorias de despesa do grupo · ${periodLabel}`}
      info="Soma das contas a pagar por categoria do plano de contas (custo + despesa, por competência). Mostra onde o faturamento está indo embora."
      caption={`As despesas consomem ${pctTxt(consumoPct)} do faturamento, sobrando ${pctTxt(margemPct)} de margem. Cada barra é uma categoria; quanto maior, mais come da margem.`}
      stats={stats} height={Math.max(220, data.length * 34 + 24)}
    >
      {data.length === 0 ? (
        <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: TXT2 }}>Sem despesas no período</div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, left: 8, bottom: 4 }} barCategoryGap="22%">
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 9, fill: TXT2, fontWeight: 500 }} axisLine={{ stroke: AXIS, strokeWidth: 1 }} tickLine={{ stroke: AXIS }} tickFormatter={yTickFmt} />
            <YAxis type="category" dataKey="nome" tick={{ fontSize: 10.5, fill: "#475467" }} width={150} axisLine={{ stroke: AXIS, strokeWidth: 1 }} tickLine={{ stroke: AXIS }} tickFormatter={shortCat} />
            <ReTooltip content={renderTip} cursor={{ fill: "rgba(181, 71, 8, 0.06)" }} />
            <Bar dataKey="valor" radius={[0, 4, 4, 0]} fill="#B54708" maxBarSize={26}>
              <LabelList dataKey="pct" position="right" formatter={(v: number) => pctTxt(v, 0)} style={{ fontSize: 10, fill: TXT2, fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </CompCard>
  );
}

// ── Ponto de equilíbrio × Lucro líquido por loja (2 linhas) ──

function PontoEquilibrioLucroCard({ rows, periodLabel }: { rows: GrupoCompanyRow[]; periodLabel: string }) {
  const data = rows
    .map((r) => ({
      nome: r.nome,
      pe: r.peFinanceiro != null && r.peFinanceiro > 0 ? r.peFinanceiro : null,
      lucro: r.faturamento - r.imposto - r.custo - r.despesaOp, // lucro líquido (competência, igual à DRE)
      faturamento: r.faturamento,
    }))
    .filter((d) => d.faturamento > 0 || d.lucro !== 0)
    .sort((a, b) => b.faturamento - a.faturamento);

  const fatTotal = data.reduce((s, d) => s + d.faturamento, 0);
  const lucroTotal = data.reduce((s, d) => s + d.lucro, 0);
  const noLucro = data.filter((d) => d.lucro > 0).length;
  const comPE = data.filter((d) => d.pe != null).length;
  const acimaPE = data.filter((d) => d.pe != null && d.faturamento >= (d.pe as number)).length;
  const stats: CardStat[] = [
    { label: "Faturamento (grupo)", value: fmt(fatTotal), color: "#039855" },
    { label: "Lucro líq. (grupo)", value: fmt(lucroTotal), color: lucroTotal >= 0 ? "#039855" : "#E53E3E" },
    { label: "Acima do P.E.", value: comPE ? `${acimaPE}/${comPE}` : "—" },
  ];
  const legend: CardLegend[] = [
    { label: "Faturamento", color: "#039855" },
    { label: "Ponto de equilíbrio", color: "#B54708" },
    { label: "Lucro líquido", color: "#1570EF" },
  ];

  const tip = (props: { active?: boolean; label?: string | number; payload?: Array<{ payload?: { nome?: string; pe?: number | null; lucro?: number; faturamento?: number } }> }) => {
    if (!props.active || !props.payload?.length) return null;
    const p = props.payload[0]?.payload;
    if (!p) return null;
    const acima = p.pe != null && (p.faturamento || 0) >= p.pe;
    return (
      <div style={TOOLTIP_STYLE}>
        <div style={{ fontWeight: 700, color: "#1D2939", marginBottom: 4 }}>{p.nome}</div>
        <div style={{ color: TXT2 }}>Faturamento: <b style={{ color: "#1D2939" }}>{fmt(p.faturamento || 0)}</b></div>
        <div style={{ color: "#B54708" }}>Ponto de equilíbrio: <b>{p.pe != null ? fmt(p.pe) : "—"}</b></div>
        <div style={{ color: (p.lucro || 0) >= 0 ? "#039855" : "#E53E3E" }}>Lucro líquido: <b>{fmt(p.lucro || 0)}</b></div>
        {p.pe != null && <div style={{ color: acima ? "#039855" : "#B54708", marginTop: 2 }}>{acima ? "Acima do ponto de equilíbrio ✓" : "Abaixo do ponto de equilíbrio"}</div>}
      </div>
    );
  };

  return (
    <CompCard
      title="Faturamento × Ponto de equilíbrio × Lucro"
      subtitle={`Por loja · ${periodLabel}`}
      info="Coluna = faturamento da loja. Ponto de equilíbrio = faturamento mínimo para não dar prejuízo (custos fixos ÷ margem de contribuição). Lucro líquido = Receita − Impostos − Custos − Despesas (competência)."
      caption="A coluna acima da linha laranja (ponto de equilíbrio) = loja dá lucro. A linha azul (lucro líquido) abaixo de zero = prejuízo no período."
      stats={stats} legend={legend} height={300}
    >
      {data.length === 0 ? (
        <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: TXT2 }}>Sem dados no período</div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 4 }} barCategoryGap="22%">
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="nome" interval={0} height={56} tick={<WrappedAxisTick />} axisLine={{ stroke: AXIS, strokeWidth: 1 }} tickLine={{ stroke: AXIS }} tickMargin={8} />
            <YAxis tick={{ fontSize: 9, fill: TXT2, fontWeight: 500 }} axisLine={{ stroke: AXIS, strokeWidth: 1 }} tickLine={{ stroke: AXIS }} width={44} tickFormatter={yTickFmt} />
            <ReTooltip content={tip} cursor={{ fill: "rgba(3, 152, 85, 0.06)" }} />
            <ReferenceLine y={0} stroke="#475569" strokeWidth={1} strokeDasharray="2 2" />
            <Bar dataKey="faturamento" name="Faturamento" fill="#039855" fillOpacity={0.2} stroke="#039855" strokeOpacity={0.35} maxBarSize={52} radius={[4, 4, 0, 0]} />
            <Line type="monotone" dataKey="pe" name="Ponto de equilíbrio" stroke="#B54708" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3, fill: "#B54708" }} connectNulls={false} />
            <Line type="monotone" dataKey="lucro" name="Lucro líquido" stroke="#1570EF" strokeWidth={2.25} dot={{ r: 3, fill: "#1570EF" }} />
          </ComposedChart>
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

function GrupoDashboard({ grupoId, userId, onBack }: { grupoId: string; userId?: string; onBack: () => void }) {
  const { activeClient } = useAuth();
  const { companies } = useCompany();
  const { toast } = useToast();
  const confirm = useConfirm();
  const db = activeClient as any;

  // Padrão de planilha (tabela "Empresas do grupo") — unifica o ranking semáforo
  const EMP_COL_ORDER = ["empresa", "status", "faturamento", "despesas", "resultado", "caixa_gerado", "caixa", "cr", "cp", "acoes"];
  const EMP_COL_LABELS: Record<string, string> = {
    empresa: "Empresa", status: "Status", faturamento: "Faturamento", despesas: "Despesas", resultado: "Resultado",
    caixa_gerado: "Caixa gerado", caixa: "Caixa", cr: "CR aberto", cp: "CP aberto", acoes: "Ações",
  };
  const EMP_COL_WIDTHS_DEFAULT: Record<string, number> = {
    empresa: 200, status: 100, faturamento: 120, despesas: 120, resultado: 120, caixa_gerado: 120, caixa: 110, cr: 110, cp: 110, acoes: 70,
  };
  const empCols = useColunasAjustaveis(EMP_COL_ORDER, EMP_COL_WIDTHS_DEFAULT, "multiempresa_empresas");

  const [periodo, setPeriodo] = useState<"mes" | "mes_anterior" | "ano" | "mes_especifico">("mes_anterior");
  const now = new Date();
  const [mesEspecifico, setMesEspecifico] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [addOpen, setAddOpen] = useState(false);
  const [addCompanyId, setAddCompanyId] = useState("");
  const [exporting, setExporting] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null); // capturamos os gráficos daqui p/ o PDF

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
      const { rows, totals, vendasDiarias, despesasPorCategoria, dreCategorias } = await calcGrupoDashboard(db, companyIds, periodStart, periodEnd);
      return { rows: rows.map((r) => ({ ...r, nome: nomeEmpresa(r.company_id) })), totals, vendasDiarias, despesasPorCategoria, dreCategorias };
    },
  });

  // Funcionários ativos por empresa (p/ "faturamento por funcionário")
  const { data: funcByCompany = {}, isFetching: isFetchingFunc } = useQuery<FuncByCompany>({
    queryKey: ["grupo_func", grupoId, companyIds.join(",")],
    enabled: companyIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await db.from("employees")
        .select("company_id, tipo_contrato, status, data_demissao")
        .in("company_id", companyIds);
      const acc: FuncByCompany = {};
      companyIds.forEach((id) => { acc[id] = { clt: 0, pj: 0, autonomo: 0, estagio: 0, temporario: 0, total: 0 }; });
      (data || []).forEach((e: any) => {
        if (e.status === "demitido" || e.data_demissao) return; // conta ativos/afastados, ignora desligados
        const a = acc[e.company_id];
        if (!a) return;
        const t = (e.tipo_contrato || "clt") as keyof FuncAgg;
        if (t in a && t !== "total") (a[t] as number) += 1;
        a.total += 1;
      });
      return acc;
    },
  });

  // Crescimento do grupo (12m vs 12m anteriores) p/ comparar com o mercado (IBGE)
  const { indicadores } = useIndicadores();
  const { data: crescGrupo } = useQuery<number | null>({
    queryKey: ["grupo_cresc24", grupoId, companyIds.join(",")],
    enabled: companyIds.length > 0,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const fim = new Date();
      const meses: string[] = [];
      for (let i = 23; i >= 0; i--) meses.push(`${new Date(fim.getFullYear(), fim.getMonth() - i, 1).getFullYear()}-${String(new Date(fim.getFullYear(), fim.getMonth() - i, 1).getMonth() + 1).padStart(2, "0")}`);
      const start = `${meses[0]}-01`;
      const end = toISO(new Date(fim.getFullYear(), fim.getMonth() + 1, 0));
      // Soma vendas (valor_total, sem filtro de status — bate com o KPI Faturamento) por mês, todas as empresas.
      const all: any[] = [];
      let from = 0;
      for (let guard = 0; guard < 2000; guard++) {
        const { data, error } = await db.from("vendas")
          .select("valor_total, data_venda")
          .in("company_id", companyIds).is("deleted_at", null)
          .gte("data_venda", start).lte("data_venda", end)
          .order("id").range(from, from + 999);
        if (error) break;
        const batch = data || [];
        all.push(...batch);
        if (batch.length < 1000) break;
        from += 1000;
      }
      const map: Record<string, number> = {};
      all.forEach((v: any) => { const ym = (v.data_venda || "").slice(0, 7); map[ym] = (map[ym] || 0) + Number(v.valor_total || 0); });
      const pts = meses.map((m) => map[m] || 0).map((v, i) => ({ v, i })).filter((x) => x.v > 0);
      if (pts.length < 6) return null;
      const last = pts.filter((x) => x.i >= 12);
      const prior = pts.filter((x) => x.i < 12);
      if (last.length >= 3 && prior.length >= 3) {
        const aL = last.reduce((s, x) => s + x.v, 0) / last.length;
        const aP = prior.reduce((s, x) => s + x.v, 0) / prior.length;
        return aP > 0 ? ((aL - aP) / aP) * 100 : null;
      }
      const half = Math.floor(pts.length / 2);
      const aO = pts.slice(0, half).reduce((s, x) => s + x.v, 0) / half;
      const aR = pts.slice(pts.length - half).reduce((s, x) => s + x.v, 0) / half;
      return aO > 0 ? ((aR - aO) / aO) * 100 : null;
    },
  });
  // Mercado: volume do comércio varejista (PMC/IBGE), variação 12 meses. Default p/ grupos de loja.
  const mercadoCresc = indicadores?.setorial?.pmc_varejo?.valor ?? null;

  const handleAddMember = async () => {
    if (!addCompanyId) return;
    // supabase-js NÃO lança erro: o erro vem no objeto resolvido. Sem checar isso,
    // uma falha (RLS/duplicado) virava "sucesso" falso e a empresa não aparecia.
    const { error } = await db.from("grupos_empresas").insert({ grupo_id: grupoId, company_id: addCompanyId });
    if (error) {
      const dup = error.code === "23505" || /duplicate|unique/i.test(error.message || "");
      toast({
        title: dup ? "Essa empresa já está no grupo" : "Não consegui adicionar a empresa",
        description: dup ? undefined : (error.message || "Tente de novo."),
        variant: "destructive",
      });
      return;
    }
    setAddOpen(false); setAddCompanyId("");
    await refetchMembers();
    toast({ title: "Empresa adicionada ao grupo" });
  };

  const handleRemoveMember = async (id: string, nome: string) => {
    const ok = await confirm({
      title: `Remover ${nome} do grupo?`,
      description: "A empresa deixa de ser incluída no consolidado deste grupo.",
      confirmLabel: "Remover",
      variant: "destructive",
    });
    if (!ok) return;
    const { error } = await db.from("grupos_empresas").delete().eq("id", id);
    if (error) { toast({ title: "Não consegui remover", description: error.message, variant: "destructive" }); return; }
    await refetchMembers();
  };

  const margem = metrics && metrics.totals.faturamento > 0
    ? (metrics.totals.resultado / metrics.totals.faturamento) * 100 : 0;

  const dashRows = metrics?.rows || [];
  const leitura = useMemo(
    () => (metrics ? gerarLeitura(metrics.rows, metrics.totals, periodLabel) : []),
    [metrics, periodLabel],
  );

  const exportarPDF = async () => {
    if (!metrics || exporting) return;
    setExporting(true);
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
    const crescStr = crescGrupo == null
      ? "—"
      : `${crescGrupo >= 0 ? "+" : ""}${crescGrupo.toFixed(1)}%${mercadoCresc != null ? ` (merc. ${mercadoCresc >= 0 ? "+" : ""}${mercadoCresc.toFixed(1)}%)` : ""}`;
    const kpis: [string, string][] = [
      ["Faturamento", fmt(t.faturamento)],
      ["Despesa", fmt(t.despesa)],
      [`Resultado (${margem.toFixed(1)}%)`, fmt(t.resultado)],
      ["Cresc. vs mercado", crescStr],
      ["Caixa total", fmt(t.caixa)],
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

    // ── Gráficos de apoio (captura visual do que está na tela via html2canvas) ──
    // Os números acima saem como texto nítido; os gráficos não dá pra redesenhar
    // em jsPDF, então tiramos um "print" de cada card e anexamos como imagem.
    try {
      const chartNodes = pageRef.current
        ? Array.from(pageRef.current.querySelectorAll<HTMLElement>("[data-pdf-chart]"))
        : [];
      if (chartNodes.length > 0) {
        const html2canvas = (await import("html2canvas")).default;
        doc.addPage(); y = drawHeader();
        doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(7, 29, 65);
        doc.text("Gráficos de apoio", M, y); y += 6;
        for (const node of chartNodes) {
          const canvas = await html2canvas(node, {
            scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false,
            scrollX: 0, scrollY: -window.scrollY,
          });
          const imgData = canvas.toDataURL("image/png");
          let imgW = contentW;
          let imgH = (canvas.height / canvas.width) * imgW;
          const maxH = H - 36 - FOOTER_H; // área útil abaixo do cabeçalho
          if (imgH > maxH) { imgH = maxH; imgW = (canvas.width / canvas.height) * imgH; }
          if (y + imgH > H - FOOTER_H) { doc.addPage(); y = drawHeader(); }
          const x = M + (contentW - imgW) / 2; // centraliza se mais estreito que a área útil
          doc.addImage(imgData, "PNG", x, y, imgW, imgH);
          y += imgH + 6;
        }
      }
    } catch {
      toast({ title: "Não consegui capturar os gráficos; PDF salvo só com os números.", variant: "destructive" });
    }

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
    setExporting(false);
  };

  return (
    <div ref={pageRef} className="space-y-6">
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
          <Button variant="outline" onClick={exportarPDF} disabled={!metrics || companyIds.length === 0 || exporting} title="Exportar o consolidado completo (KPIs, leitura, tabela e gráficos) em PDF">
            {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
            {exporting ? "Gerando PDF…" : "Exportar PDF"}
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
            const fmtPct1 = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
            const crescVal = crescGrupo == null ? "—" : fmtPct1(crescGrupo);
            const crescColor = crescGrupo == null ? "#98A2B3" : crescGrupo >= 0 ? "#039855" : "#E53E3E";
            let crescSub = "12m vs 12m anteriores";
            if (mercadoCresc != null && crescGrupo != null) {
              const diff = crescGrupo - mercadoCresc;
              const comp = Math.abs(diff) < 1 ? "em linha com o" : diff > 0 ? "acima do" : "abaixo do";
              crescSub = `${comp} varejo (${fmtPct1(mercadoCresc)})`;
            } else if (mercadoCresc != null) {
              crescSub = `mercado/varejo ${fmtPct1(mercadoCresc)}`;
            }
            return (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiTile icon={TrendingUp} iconBg="#ECFDF5" iconColor="#059669" label="Faturamento" value={fmt(t.faturamento)} valueColor="#039855" sub={`em ${periodLabel.toLowerCase()}`} info="Soma das vendas (valor total) do grupo no período." />
                <KpiTile icon={TrendingDown} iconBg="#FEF2F2" iconColor="#B91C1C" label="Despesa" value={fmt(t.despesa)} valueColor="#DC2626" sub={pctDesp} info="Contas a pagar por vencimento no período (valor cheio). Exclui transferências." />
                <KpiTile icon={Wallet} iconBg={t.resultado >= 0 ? "#ECFDF5" : "#FEF2F2"} iconColor={t.resultado >= 0 ? "#059669" : "#B91C1C"} label="Resultado" value={fmt(t.resultado)} valueColor={t.resultado >= 0 ? "#039855" : "#E53E3E"} sub={`${margem.toFixed(1)}% de margem`} info="Faturamento − Despesas do período (competência)." />
                <KpiTile icon={Activity} iconBg="#EFF8FF" iconColor="#1570EF" label="Crescimento vs mercado" value={crescVal} valueColor={crescColor} sub={crescSub} info="Crescimento do faturamento do grupo (últimos 12 meses vs 12 anteriores) comparado ao volume do comércio varejista (IBGE/PMC, 12 meses)." />
              </div>
            );
          })()}

          {/* Faturamento por loja — largura total */}
          <div className="flex items-center gap-2 pt-1">
            <h3 className="font-semibold text-[15px]">Análises do grupo</h3>
            {(isFetching || isFetchingFunc) && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          <div data-pdf-chart>
            <CompBarCard title="Faturamento por loja" subtitle={`Por loja · ${periodLabel}`} caption="Linha tracejada = média do grupo. Quem está acima/abaixo da média." info="Soma das vendas (valor total) por loja, igual à página Vendas." rows={dashRows} valueKey="faturamento" color="#039855" height={300} />
          </div>

          {/* Ponto de equilíbrio × Lucro líquido (2 linhas) — logo abaixo do faturamento */}
          <div data-pdf-chart>
            <PontoEquilibrioLucroCard rows={dashRows} periodLabel={periodLabel} />
          </div>

          {/* 1º DRE comparativa — lojas lado a lado (detalhada por categoria) */}
          <DREComparativaCard rows={dashRows} categorias={metrics?.dreCategorias || []} periodLabel={periodLabel} />

          {/* 2º Geração de caixa (1/2) + explicação (1/2) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div data-pdf-chart><CompBarCard title="Geração de caixa por loja" subtitle={`Por loja · ${periodLabel}`} caption="Verde = gerou caixa; vermelho = queimou (gastou mais do que entrou)." info="Entradas pagas − saídas pagas no período (regime de caixa, exclui transferências)." rows={dashRows} valueKey="caixaGerado" /></div>
            <CaixaExplicacaoPanel rows={dashRows} periodLabel={periodLabel} />
          </div>

          {/* 3º Crédito × Débito (pizza) por loja + taxas */}
          <CredDebPizzaCard rows={dashRows} periodLabel={periodLabel} />

          {/* 4º Vendas por dia — quem vende mais e quem vende menos */}
          <div data-pdf-chart><VendasTempoCard vendasDiarias={metrics?.vendasDiarias || []} rows={dashRows} nomeEmpresa={nomeEmpresa} /></div>

          {/* 5º Faturamento por funcionário */}
          <div data-pdf-chart><FaturamentoPorFuncionarioCard rows={dashRows} funcByCompany={funcByCompany} loading={isFetchingFunc && Object.keys(funcByCompany).length === 0} /></div>

          {/* 6º Despesa que mais consome a margem */}
          <div data-pdf-chart><DespesaMargemCard despesas={metrics?.despesasPorCategoria || []} faturamento={metrics?.totals.faturamento || 0} periodLabel={periodLabel} /></div>

          {/* Tabela por empresa — padrão de planilha */}
          <Card className="overflow-hidden p-0">
            <div className="px-5 py-4 flex items-center justify-between flex-shrink-0" style={{ backgroundColor: "#071D41" }}>
              <h3 className="font-extrabold text-white m-0" style={{ fontSize: 18, letterSpacing: "-0.015em", lineHeight: 1.15 }}>Empresas do grupo <span className="font-medium text-white/55" style={{ fontSize: 12 }}>· do pior pro melhor</span></h3>
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
                    <th className={`text-center px-3 py-2.5 relative border-r border-[#EAECF0] ${empCols.isColVisible("status") ? "" : "hidden"}`}>
                      Status<span onMouseDown={empCols.startResize("status")} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
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
                    <th className={`text-right px-3 py-2.5 relative border-r border-[#EAECF0] ${empCols.isColVisible("caixa_gerado") ? "" : "hidden"}`}>
                      Caixa gerado<span onMouseDown={empCols.startResize("caixa_gerado")} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
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
                  {[...(metrics?.rows || [])]
                    .map((r) => ({ r, s: statusLoja(r) }))
                    .sort((a, b) => a.s.rank - b.s.rank || a.r.resultado - b.r.resultado)
                    .map(({ r, s }) => (
                    <tr key={r.company_id} className="border-b border-[#F1F3F5] hover:bg-[#FAFAFA]">
                      <td className={`px-3 py-1 font-medium text-[#1D2939] truncate border-r border-[#F1F3F5] ${empCols.isColVisible("empresa") ? "" : "hidden"}`} title={r.nome}>{r.nome}</td>
                      <td className={`px-3 py-1 text-center truncate border-r border-[#F1F3F5] ${empCols.isColVisible("status") ? "" : "hidden"}`}>
                        <span className="inline-block px-2 py-0.5 rounded-full text-[12px] font-semibold" style={{ background: s.bg, color: s.color }}>{s.label}</span>
                      </td>
                      <td className={`px-3 py-1 text-right text-[#1D2939] truncate border-r border-[#F1F3F5] ${empCols.isColVisible("faturamento") ? "" : "hidden"}`}>{fmt(r.faturamento)}</td>
                      <td className={`px-3 py-1 text-right text-[#1D2939] truncate border-r border-[#F1F3F5] ${empCols.isColVisible("despesas") ? "" : "hidden"}`}>{fmt(r.despesa)}</td>
                      <td className={`px-3 py-1 text-right font-semibold truncate border-r border-[#F1F3F5] ${r.resultado >= 0 ? "text-blue-600" : "text-orange-600"} ${empCols.isColVisible("resultado") ? "" : "hidden"}`}>{fmt(r.resultado)}</td>
                      <td className={`px-3 py-1 text-right font-medium truncate border-r border-[#F1F3F5] ${r.caixaGerado >= 0 ? "text-emerald-600" : "text-red-600"} ${empCols.isColVisible("caixa_gerado") ? "" : "hidden"}`}>{fmt(r.caixaGerado)}</td>
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
                      <td className={`px-3 py-1.5 border-r border-[#F1F3F5] ${empCols.isColVisible("status") ? "" : "hidden"}`}></td>
                      <td className={`px-3 py-1.5 text-right text-[#1D2939] truncate border-r border-[#F1F3F5] ${empCols.isColVisible("faturamento") ? "" : "hidden"}`}>{fmt(metrics.totals.faturamento)}</td>
                      <td className={`px-3 py-1.5 text-right text-[#1D2939] truncate border-r border-[#F1F3F5] ${empCols.isColVisible("despesas") ? "" : "hidden"}`}>{fmt(metrics.totals.despesa)}</td>
                      <td className={`px-3 py-1.5 text-right truncate border-r border-[#F1F3F5] ${metrics.totals.resultado >= 0 ? "text-blue-600" : "text-orange-600"} ${empCols.isColVisible("resultado") ? "" : "hidden"}`}>{fmt(metrics.totals.resultado)}</td>
                      {(() => { const tcg = metrics.rows.reduce((s, r) => s + r.caixaGerado, 0); return (
                        <td className={`px-3 py-1.5 text-right truncate border-r border-[#F1F3F5] ${tcg >= 0 ? "text-emerald-600" : "text-red-600"} ${empCols.isColVisible("caixa_gerado") ? "" : "hidden"}`}>{fmt(tcg)}</td>
                      ); })()}
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
              <div className="text-sm text-muted-foreground space-y-2">
                <p>{companies.length === 0
                  ? "Nenhuma empresa disponível na sua conta ainda."
                  : "Todas as suas empresas já estão neste grupo."}</p>
                <p className="text-xs">Só aparecem aqui as empresas vinculadas ao seu usuário. Se faltar alguma loja, ela precisa primeiro estar cadastrada e liberada para você.</p>
              </div>
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
                  <p className="text-xs text-muted-foreground mt-1.5">{empresasDisponiveis.length} empresa(s) disponível(is) para adicionar.</p>
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
    const payload = { nome: form.nome.trim(), descricao: form.descricao || null };
    const { error } = editGrupo
      ? await db.from("grupos_empresariais").update(payload).eq("id", editGrupo.id)
      : await db.from("grupos_empresariais").insert({ owner_id: userId, ...payload });
    setSaving(false);
    if (error) {
      const dup = error.code === "23505" || /duplicate|unique/i.test(error.message || "");
      toast({ title: dup ? "Já existe um grupo com esse nome" : "Erro ao salvar", description: dup ? undefined : error.message, variant: "destructive" });
      return;
    }
    setShowForm(false); setForm({ nome: "", descricao: "" }); setEditGrupo(null);
    refetch();
    toast({ title: editGrupo ? "Grupo atualizado" : "Grupo criado" });
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
