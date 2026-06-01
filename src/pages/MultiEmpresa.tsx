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
import { supabase } from "@/integrations/supabase/client";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Building2, Plus, Trash2, Edit2, RefreshCw, ArrowRightLeft,
  Loader2, FileText, BarChart3, GitMerge, ArrowLeft, ChevronRight,
  Eye, ChevronDown,
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

  // Métricas consolidadas (ao vivo, mesma fonte da verdade do CompanyDashboard)
  const { data: metrics, isFetching } = useQuery({
    queryKey: ["grupo_dash_metrics", grupoId, companyIds.join(","), periodStart, periodEnd],
    enabled: companyIds.length > 0,
    queryFn: async () => {
      const { rows, totals } = await calcConsolidadoLive(db, companyIds, periodStart, periodEnd);
      return { rows: rows.map((r) => ({ ...r, nome: nomeEmpresa(r.company_id) })), totals };
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

  const chartData = (metrics?.rows || [])
    .map((r) => ({
      nome: r.nome.length > 18 ? r.nome.slice(0, 17) + "…" : r.nome,
      Faturamento: r.faturamento,
    }))
    .sort((a, b) => b.Faturamento - a.Faturamento);

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
          {/* KPIs consolidados */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-4">
              <p className="text-xs text-green-600 font-medium">Faturamento</p>
              <p className="text-lg font-bold text-green-700">{fmt(metrics?.totals.faturamento || 0)}</p>
            </div>
            <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-4">
              <p className="text-xs text-red-600 font-medium">Despesas</p>
              <p className="text-lg font-bold text-red-700">{fmt(metrics?.totals.despesa || 0)}</p>
            </div>
            <div className={`rounded-lg p-4 ${(metrics?.totals.resultado || 0) >= 0 ? "bg-blue-50 dark:bg-blue-950/30" : "bg-orange-50 dark:bg-orange-950/30"}`}>
              <p className={`text-xs font-medium ${(metrics?.totals.resultado || 0) >= 0 ? "text-blue-600" : "text-orange-600"}`}>Resultado · {margem.toFixed(1)}%</p>
              <p className={`text-lg font-bold ${(metrics?.totals.resultado || 0) >= 0 ? "text-blue-700" : "text-orange-700"}`}>{fmt(metrics?.totals.resultado || 0)}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-xs text-muted-foreground font-medium">Caixa Total</p>
              <p className="text-lg font-bold">{fmt(metrics?.totals.caixa || 0)}</p>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-4">
              <p className="text-xs text-emerald-600 font-medium">CR em aberto</p>
              <p className="text-lg font-bold text-emerald-700">{fmt(metrics?.totals.cr_aberto || 0)}</p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-4">
              <p className="text-xs text-amber-600 font-medium">CP em aberto</p>
              <p className="text-lg font-bold text-amber-700">{fmt(metrics?.totals.cp_aberto || 0)}</p>
            </div>
          </div>

          {/* Gráfico comparativo */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Comparativo por empresa</h3>
                {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
              <div className="h-[380px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="nome" interval={0} angle={-40} textAnchor="end" height={90} tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
                    <ReTooltip formatter={(v: number) => fmt(v)} />
                    <Bar dataKey="Faturamento" fill="#059669" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

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

type CardConsolidado = ConsolidadoTotals & { qtd_empresas: number };

function ConsolidadoTab({ userId }: { userId?: string }) {
  const { activeClient } = useAuth();
  const { toast } = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const db = activeClient as any;
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [consolidados, setConsolidados] = useState<Record<string, CardConsolidado>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editGrupo, setEditGrupo] = useState<Grupo | null>(null);
  const [form, setForm] = useState({ nome: "", descricao: "" });
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data: gData } = await db.from("grupos_empresariais").select("*").eq("owner_id", userId).order("nome");
      const lista = (gData || []) as Grupo[];
      setGrupos(lista);

      const grupoIds = lista.map((g) => g.id);
      const consMap: Record<string, CardConsolidado> = {};
      if (grupoIds.length > 0) {
        const { data: memData } = await db.from("grupos_empresas").select("grupo_id, company_id").in("grupo_id", grupoIds);
        const byGrupo: Record<string, string[]> = {};
        (memData || []).forEach((m: any) => { (byGrupo[m.grupo_id] ||= []).push(m.company_id); });

        const now = new Date();
        const periodStart = toISO(new Date(now.getFullYear(), now.getMonth(), 1));
        const periodEnd = toISO(new Date(now.getFullYear(), now.getMonth() + 1, 0));
        await Promise.all(lista.map(async (g) => {
          const ids = byGrupo[g.id] || [];
          const { totals } = await calcConsolidadoLive(db, ids, periodStart, periodEnd);
          consMap[g.id] = { ...totals, qtd_empresas: ids.length };
        }));
      }
      setConsolidados(consMap);
    } catch { /* */ } finally { setLoading(false); }
  }, [userId, db]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
    toast({ title: "Consolidado atualizado" });
  };

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
      fetchData();
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
    fetchData();
  };

  const getCons = (gid: string) => consolidados[gid];

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

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
      ) : grupos.map((grupo) => {
        const cons = getCons(grupo.id);
        return (
          <Card
            key={grupo.id}
            className="cursor-pointer transition-shadow hover:shadow-md"
            onClick={() => navigate(`/multiempresa/grupo/${grupo.id}`)}
          >
            <CardContent className="p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-1">
                  <div>
                    <h3 className="font-semibold flex items-center gap-1">{grupo.nome}<ChevronRight className="h-4 w-4 text-muted-foreground" /></h3>
                    {grupo.descricao && <p className="text-sm text-muted-foreground">{grupo.descricao}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" onClick={() => navigate(`/multiempresa/grupo/${grupo.id}`)} title="Abrir dashboard"><BarChart3 className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={refreshing} title="Atualizar"><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /></Button>
                  <Button variant="ghost" size="icon" onClick={() => { setEditGrupo(grupo); setForm({ nome: grupo.nome, descricao: grupo.descricao || "" }); setShowForm(true); }}><Edit2 className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(grupo.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>
              {cons && cons.qtd_empresas > 0 ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3">
                      <p className="text-xs text-green-600 font-medium">Faturamento</p>
                      <p className="text-lg font-bold text-green-700">{fmt(cons.faturamento)}</p>
                    </div>
                    <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-3">
                      <p className="text-xs text-red-600 font-medium">Despesas</p>
                      <p className="text-lg font-bold text-red-700">{fmt(cons.despesa)}</p>
                    </div>
                    <div className={`rounded-lg p-3 ${cons.resultado >= 0 ? "bg-blue-50 dark:bg-blue-950/30" : "bg-orange-50 dark:bg-orange-950/30"}`}>
                      <p className={`text-xs font-medium ${cons.resultado >= 0 ? "text-blue-600" : "text-orange-600"}`}>Resultado</p>
                      <p className={`text-lg font-bold ${cons.resultado >= 0 ? "text-blue-700" : "text-orange-700"}`}>{fmt(cons.resultado)}</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground font-medium">Caixa Total</p>
                      <p className="text-lg font-bold">{fmt(cons.caixa)}</p>
                    </div>
                    <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-3">
                      <p className="text-xs text-emerald-600 font-medium">CR Aberto</p>
                      <p className="text-sm font-semibold text-emerald-700">{fmt(cons.cr_aberto)}</p>
                    </div>
                    <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3">
                      <p className="text-xs text-amber-600 font-medium">CP Aberto</p>
                      <p className="text-sm font-semibold text-amber-700">{fmt(cons.cp_aberto)}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{cons.qtd_empresas} empresa(s) · mês atual · clique no card para ver o dashboard completo</p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma empresa vinculada. Abra o dashboard do grupo para adicionar empresas.</p>
              )}
            </CardContent>
          </Card>
        );
      })}

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
