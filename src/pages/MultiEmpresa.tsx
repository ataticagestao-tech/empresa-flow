import { useState, useCallback, useEffect } from "react";
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
import { useToast } from "@/components/ui/use-toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useLocation } from "react-router-dom";
import {
  Building2, Plus, Trash2, Edit2, RefreshCw, ArrowRightLeft,
  Loader2, FileText, BarChart3, GitMerge,
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

interface Consolidado {
  grupo_id: string;
  grupo_nome: string;
  competencia: string;
  receita_bruta: number;
  resultado_liquido: number;
  caixa_total: number;
  cr_total_aberto: number;
  cp_total_aberto: number;
  total_eliminacoes: number;
  qtd_transferencias: number;
  qtd_empresas: number;
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
  const { toast } = useToast();
  const location = useLocation();

  const path = location.pathname;
  const activeTab = path.includes("/transferencias")
    ? "transferencias"
    : path.includes("/relatorios")
    ? "relatorios"
    : "consolidado";

  const [tab, setTab] = useState(activeTab);
  useEffect(() => { setTab(activeTab); }, [activeTab]);

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

// ── CONSOLIDADO ──

function ConsolidadoTab({ userId }: { userId?: string }) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [consolidados, setConsolidados] = useState<Consolidado[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editGrupo, setEditGrupo] = useState<Grupo | null>(null);
  const [form, setForm] = useState({ nome: "", descricao: "" });
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [gRes, cRes] = await Promise.all([
        supabase.from("grupos_empresariais").select("*").eq("owner_id", userId).order("nome"),
        supabase.from("v_consolidado_atual").select("*").eq("owner_id", userId),
      ]);
      setGrupos(gRes.data || []);
      setConsolidados((cRes.data || []) as Consolidado[]);
    } catch { /* */ } finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async () => {
    if (!userId || !form.nome.trim()) return;
    setSaving(true);
    try {
      if (editGrupo) {
        await supabase.from("grupos_empresariais").update({ nome: form.nome, descricao: form.descricao || null }).eq("id", editGrupo.id);
      } else {
        await supabase.from("grupos_empresariais").insert({ owner_id: userId, nome: form.nome, descricao: form.descricao || null });
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
    await supabase.from("grupos_empresariais").delete().eq("id", id);
    fetchData();
  };

  const handleRecalcular = async (grupoId: string) => {
    const now = new Date();
    const comp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    try {
      await supabase.rpc("calcular_consolidado_grupo", { p_grupo_id: grupoId, p_competencia: comp });
      fetchData();
      toast({ title: "Consolidado recalculado" });
    } catch { toast({ title: "Erro ao recalcular", variant: "destructive" }); }
  };

  const getCons = (gid: string) => consolidados.find((c) => c.grupo_id === gid);

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
          <Card key={grupo.id}>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{grupo.nome}</h3>
                  {grupo.descricao && <p className="text-sm text-muted-foreground">{grupo.descricao}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => handleRecalcular(grupo.id)} title="Recalcular"><RefreshCw className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => { setEditGrupo(grupo); setForm({ nome: grupo.nome, descricao: grupo.descricao || "" }); setShowForm(true); }}><Edit2 className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(grupo.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>
              {cons ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3">
                    <p className="text-xs text-green-600 font-medium">Receita Bruta</p>
                    <p className="text-lg font-bold text-green-700">{fmt(cons.receita_bruta)}</p>
                  </div>
                  <div className={`rounded-lg p-3 ${cons.resultado_liquido >= 0 ? "bg-blue-50 dark:bg-blue-950/30" : "bg-red-50 dark:bg-red-950/30"}`}>
                    <p className={`text-xs font-medium ${cons.resultado_liquido >= 0 ? "text-blue-600" : "text-red-600"}`}>Resultado Líquido</p>
                    <p className={`text-lg font-bold ${cons.resultado_liquido >= 0 ? "text-blue-700" : "text-red-700"}`}>{fmt(cons.resultado_liquido)}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground font-medium">Caixa Total</p>
                    <p className="text-lg font-bold">{fmt(cons.caixa_total)}</p>
                  </div>
                  <div className="bg-purple-50 dark:bg-purple-950/30 rounded-lg p-3">
                    <p className="text-xs text-purple-600 font-medium">Eliminações</p>
                    <p className="text-lg font-bold text-purple-700">{fmt(cons.total_eliminacoes)}</p>
                    <p className="text-xs text-purple-500">{cons.qtd_transferencias} transf.</p>
                  </div>
                  <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-3">
                    <p className="text-xs text-emerald-600 font-medium">CR Aberto</p>
                    <p className="text-sm font-semibold text-emerald-700">{fmt(cons.cr_total_aberto)}</p>
                  </div>
                  <div className="bg-orange-50 dark:bg-orange-950/30 rounded-lg p-3">
                    <p className="text-xs text-orange-600 font-medium">CP Aberto</p>
                    <p className="text-sm font-semibold text-orange-700">{fmt(cons.cp_total_aberto)}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground font-medium">Empresas</p>
                    <p className="text-sm font-semibold">{cons.qtd_empresas}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground font-medium">Competência</p>
                    <p className="text-sm font-semibold">{cons.competencia}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Consolidado não calculado. Clique em ↻ para recalcular.</p>
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
