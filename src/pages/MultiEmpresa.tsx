import { useState, useCallback, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useToast } from "@/components/ui/use-toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, Cell, Legend,
} from "recharts";
import {
  Building2, Plus, Trash2, Edit2, RefreshCw, ArrowRightLeft,
  Loader2, FileText, BarChart3, GitMerge, ArrowLeft, ChevronRight,
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
    <AppLayout>
      <div className="space-y-6">

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

  const [vendasRes, cpCompRes, banksRes, crAbertoRes, cpAbertoRes] = await Promise.all([
    // Faturamento (competência): vendas confirmadas por data_venda
    db.from("vendas")
      .select("company_id, valor_liquido")
      .in("company_id", companyIds).eq("status", "confirmado")
      .is("deleted_at", null)
      .gte("data_venda", periodStart).lte("data_venda", periodEnd)
      .limit(50000),
    // Despesas (competência): CP por data_vencimento, valor cheio
    db.from("contas_pagar")
      .select("company_id, valor, conta_contabil_id")
      .in("company_id", companyIds)
      .in("status", ["aberto", "parcial", "vencido", "pago"])
      .is("deleted_at", null)
      .gte("data_vencimento", periodStart).lte("data_vencimento", periodEnd)
      .limit(50000),
    // Caixa atual
    db.from("bank_accounts").select("company_id, current_balance").in("company_id", companyIds),
    // CR em aberto
    db.from("contas_receber")
      .select("company_id, valor, valor_pago, conta_contabil_id")
      .in("company_id", companyIds).in("status", ["aberto", "parcial", "vencido"])
      .is("deleted_at", null).limit(50000),
    // CP em aberto
    db.from("contas_pagar")
      .select("company_id, valor, valor_pago, conta_contabil_id")
      .in("company_id", companyIds).in("status", ["aberto", "parcial", "vencido"])
      .is("deleted_at", null).limit(50000),
  ]);

  const base: Record<string, Omit<CompanyMetric, "nome">> = {};
  companyIds.forEach((id) => {
    base[id] = { company_id: id, faturamento: 0, despesa: 0, resultado: 0, caixa: 0, cr_aberto: 0, cp_aberto: 0 };
  });

  (vendasRes.data || []).forEach((r: any) => {
    if (base[r.company_id]) base[r.company_id].faturamento += Number(r.valor_liquido || 0);
  });
  (cpCompRes.data || []).filter(naoTransfer).forEach((r: any) => {
    if (base[r.company_id]) base[r.company_id].despesa += Number(r.valor || 0);
  });
  (banksRes.data || []).forEach((r: any) => {
    if (base[r.company_id]) base[r.company_id].caixa += Number(r.current_balance || 0);
  });
  (crAbertoRes.data || []).filter(naoTransfer).forEach((r: any) => {
    if (base[r.company_id]) base[r.company_id].cr_aberto += Number(r.valor || 0) - Number(r.valor_pago || 0);
  });
  (cpAbertoRes.data || []).filter(naoTransfer).forEach((r: any) => {
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

  const chartData = (metrics?.rows || []).map((r) => ({
    nome: r.nome.length > 14 ? r.nome.slice(0, 13) + "…" : r.nome,
    Faturamento: r.faturamento,
    Despesa: r.despesa,
    Resultado: r.resultado,
  }));

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
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="nome" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
                    <ReTooltip formatter={(v: number) => fmt(v)} />
                    <Legend />
                    <Bar dataKey="Faturamento" fill="#059669" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Despesa" fill="#E53E3E" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Resultado" radius={[4, 4, 0, 0]}>
                      {chartData.map((d, i) => <Cell key={i} fill={d.Resultado >= 0 ? "#2563EB" : "#F97316"} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Tabela por empresa */}
          <Card>
            <div className="flex items-center justify-between p-5 pb-0">
              <h3 className="font-semibold">Empresas do grupo</h3>
              <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-2" /> Adicionar</Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead className="text-right">Faturamento</TableHead>
                  <TableHead className="text-right">Despesas</TableHead>
                  <TableHead className="text-right">Resultado</TableHead>
                  <TableHead className="text-right">Caixa</TableHead>
                  <TableHead className="text-right">CR aberto</TableHead>
                  <TableHead className="text-right">CP aberto</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(metrics?.rows || []).map((r) => (
                  <TableRow key={r.company_id}>
                    <TableCell className="font-medium">{r.nome}</TableCell>
                    <TableCell className="text-right">{fmt(r.faturamento)}</TableCell>
                    <TableCell className="text-right">{fmt(r.despesa)}</TableCell>
                    <TableCell className={`text-right font-semibold ${r.resultado >= 0 ? "text-blue-600" : "text-orange-600"}`}>{fmt(r.resultado)}</TableCell>
                    <TableCell className="text-right">{fmt(r.caixa)}</TableCell>
                    <TableCell className="text-right text-emerald-600">{fmt(r.cr_aberto)}</TableCell>
                    <TableCell className="text-right text-amber-600">{fmt(r.cp_aberto)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleRemoveMember(members.find((m) => m.company_id === r.company_id)!.id, r.nome)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {metrics && (
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell>Total consolidado</TableCell>
                    <TableCell className="text-right">{fmt(metrics.totals.faturamento)}</TableCell>
                    <TableCell className="text-right">{fmt(metrics.totals.despesa)}</TableCell>
                    <TableCell className={`text-right ${metrics.totals.resultado >= 0 ? "text-blue-600" : "text-orange-600"}`}>{fmt(metrics.totals.resultado)}</TableCell>
                    <TableCell className="text-right">{fmt(metrics.totals.caixa)}</TableCell>
                    <TableCell className="text-right text-emerald-600">{fmt(metrics.totals.cr_aberto)}</TableCell>
                    <TableCell className="text-right text-amber-600">{fmt(metrics.totals.cp_aberto)}</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
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
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Origem → Destino</TableHead>
                <TableHead>Natureza</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transferencias.map((t) => {
                const sc = statusCfg[t.status] || statusCfg.pendente;
                return (
                  <TableRow key={t.id}>
                    <TableCell>{fmtDate(t.data)}</TableCell>
                    <TableCell>
                      <span className="font-mono text-xs">{t.company_origem_id.slice(0, 8)}</span>
                      <span className="mx-1 text-muted-foreground">→</span>
                      <span className="font-mono text-xs">{t.company_destino_id.slice(0, 8)}</span>
                      {t.descricao && <p className="text-xs text-muted-foreground">{t.descricao}</p>}
                    </TableCell>
                    <TableCell><Badge variant="outline">{naturezaLabels[t.natureza] || t.natureza}</Badge></TableCell>
                    <TableCell className="text-right font-semibold">{fmt(t.valor)}</TableCell>
                    <TableCell><Badge variant={sc.variant}>{sc.label}</Badge></TableCell>
                    <TableCell>
                      {t.status === "pendente" && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => handleAprovar(t.id, "aprovada")}>Aprovar</Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleAprovar(t.id, "cancelada")}>Cancelar</Button>
                        </div>
                      )}
                      {t.status === "aprovada" && <Button size="sm" variant="ghost" onClick={() => handleConcluir(t.id)}>Concluir</Button>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
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
