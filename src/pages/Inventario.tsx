import { useState, useMemo, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PagePanel } from "@/components/layout/PagePanel";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Plus, Search, ClipboardCheck, CheckCircle, Eye, AlertTriangle, ChevronDown
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { ExportMenu } from "@/components/ExportMenu";

const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const fmtDate = (d: string | null) => d ? format(new Date(d + "T12:00:00"), "dd/MM/yyyy") : "—";

interface InventarioHeader {
  id: string;
  descricao: string | null;
  data_inicio: string;
  status: string;
  created_at: string;
}

interface InventarioItem {
  id?: string;
  produto_id: string;
  qtd_sistema: number;
  qtd_contada: number;
  valor_unitario: number;
  ajuste_aprovado: boolean;
  ajuste_aplicado: boolean;
  _descricao?: string;
  _code?: string;
  _unidade?: string;
}

const statusMap: Record<string, { label: string; color: "default" | "secondary" | "destructive" | "outline" }> = {
  aberto: { label: "Aberto", color: "secondary" },
  concluido: { label: "Concluído", color: "default" },
  cancelado: { label: "Cancelado", color: "destructive" },
};

export default function Inventario() {
  const { selectedCompany } = useCompany();
  const { activeClient } = useAuth();
  const db = activeClient as any;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const confirm = useConfirm();

  const [search, setSearch] = useState("");
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [contagemOpen, setContagemOpen] = useState(false);
  const [activeInv, setActiveInv] = useState<InventarioHeader | null>(null);

  // New inventory fields
  const [fDescricao, setFDescricao] = useState("");
  const [fDataInicio, setFDataInicio] = useState(format(new Date(), "yyyy-MM-dd"));

  // Contagem fields
  const [contagemItens, setContagemItens] = useState<InventarioItem[]>([]);

  // ─── Padrão de planilha: colunas ajustáveis + ocultáveis ─────
  const INV_COL_ORDER = ['descricao', 'data', 'status', 'acoes'];
  const COL_LABELS: Record<string, string> = {
    descricao: 'Descrição', data: 'Data Início', status: 'Status', acoes: 'Ações',
  };
  const COL_WIDTHS_DEFAULT: Record<string, number> = {
    descricao: 320, data: 130, status: 120, acoes: 100,
  };
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    try {
      const s = localStorage.getItem('inventario_col_widths');
      if (s) return { ...COL_WIDTHS_DEFAULT, ...JSON.parse(s) };
    } catch { /* ignore */ }
    return COL_WIDTHS_DEFAULT;
  });
  useEffect(() => { localStorage.setItem('inventario_col_widths', JSON.stringify(colWidths)); }, [colWidths]);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => {
    try {
      const s = localStorage.getItem('inventario_hidden_cols');
      if (s) return new Set(JSON.parse(s) as string[]);
    } catch { /* ignore */ }
    return new Set();
  });
  useEffect(() => { localStorage.setItem('inventario_hidden_cols', JSON.stringify([...hiddenCols])); }, [hiddenCols]);
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const isColVisible = (k: string) => !hiddenCols.has(k);
  const toggleColVisible = (k: string) => setHiddenCols(prev => {
    const n = new Set(prev);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });
  const visibleInvCols = INV_COL_ORDER.filter(isColVisible);
  const resizingRef = useRef<{ key: string; startX: number; startW: number } | null>(null);
  const startResize = (key: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { key, startX: e.clientX, startW: colWidths[key] ?? COL_WIDTHS_DEFAULT[key] };
    const onMove = (ev: MouseEvent) => {
      const r = resizingRef.current;
      if (!r) return;
      const newW = Math.max(60, r.startW + (ev.clientX - r.startX));
      setColWidths(prev => ({ ...prev, [r.key]: newW }));
    };
    const onUp = () => {
      resizingRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const { data: inventarios = [], isLoading } = useQuery({
    queryKey: ["inventarios", selectedCompany?.id],
    queryFn: async () => {
      if (!selectedCompany?.id) return [];
      const { data, error } = await db
        .from("inventario")
        .select("*")
        .eq("company_id", selectedCompany.id)
        .order("created_at", { ascending: false });
      if (error) { console.error(error); return []; }
      return data as InventarioHeader[];
    },
    enabled: !!selectedCompany?.id,
  });

  const { data: produtosList = [] } = useQuery({
    queryKey: ["products_inv", selectedCompany?.id],
    queryFn: async () => {
      if (!selectedCompany?.id) return [];
      const { data } = await db
        .from("products")
        .select("id, description, code, unidade_medida, estoque_atual, custo_medio")
        .eq("company_id", selectedCompany.id)
        .eq("is_active", true)
        .order("description");
      return data || [];
    },
    enabled: !!selectedCompany?.id,
  });

  const filtered = useMemo(() => {
    if (!search) return inventarios;
    const s = search.toLowerCase();
    return inventarios.filter(inv => inv.descricao?.toLowerCase().includes(s));
  }, [inventarios, search]);

  // Create new inventory
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCompany?.id) throw new Error("Sem empresa");
      // Create header
      const { data: inv, error } = await db.from("inventario").insert({
        company_id: selectedCompany.id,
        descricao: fDescricao || `Inventário ${format(new Date(), "dd/MM/yyyy")}`,
        data_inicio: fDataInicio,
        status: "aberto",
      }).select().single();
      if (error) throw error;

      // Pre-populate items with all active products
      const itens = produtosList.map((p: any) => ({
        inventario_id: inv.id,
        produto_id: p.id,
        qtd_sistema: p.estoque_atual || 0,
        qtd_contada: 0,
        valor_unitario: p.custo_medio || 0,
        ajuste_aprovado: false,
        ajuste_aplicado: false,
      }));

      if (itens.length > 0) {
        const { error: itErr } = await db.from("inventario_itens").insert(itens);
        if (itErr) throw itErr;
      }
    },
    onSuccess: () => {
      toast({ title: "Inventário criado!" });
      queryClient.invalidateQueries({ queryKey: ["inventarios"] });
      setIsSheetOpen(false);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // Open contagem
  async function openContagem(inv: InventarioHeader) {
    setActiveInv(inv);
    const { data: itens } = await db
      .from("inventario_itens")
      .select("*")
      .eq("inventario_id", inv.id);

    const prodMap: Record<string, any> = {};
    produtosList.forEach((p: any) => { prodMap[p.id] = p; });

    setContagemItens((itens || []).map((i: any) => ({
      id: i.id,
      produto_id: i.produto_id,
      qtd_sistema: i.qtd_sistema,
      qtd_contada: i.qtd_contada,
      valor_unitario: i.valor_unitario,
      ajuste_aprovado: i.ajuste_aprovado,
      ajuste_aplicado: i.ajuste_aplicado,
      _descricao: prodMap[i.produto_id]?.description || "—",
      _code: prodMap[i.produto_id]?.code || "",
      _unidade: prodMap[i.produto_id]?.unidade_medida || "un",
    })));
    setContagemOpen(true);
  }

  // Save contagem
  const saveContagemMutation = useMutation({
    mutationFn: async () => {
      if (!activeInv) throw new Error("Sem inventário");
      for (const item of contagemItens) {
        await db.from("inventario_itens")
          .update({ qtd_contada: item.qtd_contada })
          .eq("id", item.id);
      }
    },
    onSuccess: () => {
      toast({ title: "Contagem salva!" });
      queryClient.invalidateQueries({ queryKey: ["inventarios"] });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // Concluir inventário — applies adjustments
  const concluirMutation = useMutation({
    mutationFn: async () => {
      if (!activeInv || !selectedCompany?.id) throw new Error("Sem inventário");

      // Apply stock adjustments for divergences
      for (const item of contagemItens) {
        if (item.ajuste_aplicado) continue;
        const diff = item.qtd_contada - item.qtd_sistema;
        if (diff === 0) continue;

        if (diff > 0) {
          // More in physical count — create entrada
          await db.from("entradas_estoque_itens").insert({
            entrada_id: null, // direct adjustment, no entrada header needed
            produto_id: item.produto_id,
            quantidade: diff,
            valor_unitario: item.valor_unitario,
          }).then(async (res: any) => {
            // If FK requires entrada header, do direct stock update
            if (res.error) {
              await db.from("products")
                .update({ estoque_atual: item.qtd_contada })
                .eq("id", item.produto_id);
            }
          });
        } else {
          // Less in physical count — create saída de ajuste
          const absDiff = Math.abs(diff);
          await db.from("saidas_estoque").insert({
            company_id: selectedCompany.id,
            produto_id: item.produto_id,
            quantidade: absDiff,
            valor_unitario: item.valor_unitario,
            tipo: "ajuste",
            motivo: `Ajuste inventário: ${activeInv.descricao || activeInv.id}`,
          }).then(async (res: any) => {
            if (res.error) {
              // Fallback: direct update
              await db.from("products")
                .update({ estoque_atual: item.qtd_contada })
                .eq("id", item.produto_id);
            }
          });
        }

        // Mark as applied
        await db.from("inventario_itens")
          .update({ ajuste_aprovado: true, ajuste_aplicado: true })
          .eq("id", item.id);
      }

      // Close inventory
      await db.from("inventario")
        .update({ status: "concluido", updated_at: new Date().toISOString() })
        .eq("id", activeInv.id);
    },
    onSuccess: () => {
      toast({ title: "Inventário concluído! Estoques ajustados." });
      queryClient.invalidateQueries({ queryKey: ["inventarios"] });
      queryClient.invalidateQueries({ queryKey: ["estoque_produtos"] });
      setContagemOpen(false);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const stats = useMemo(() => ({
    total: inventarios.length,
    abertos: inventarios.filter(i => i.status === "aberto").length,
  }), [inventarios]);

  return (
    <AppLayout title="Inventário">
      <div className="animate-fade-in">

        <PagePanel title="Inventário" subtitle="Contagem física e ajuste de estoque">
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <ExportMenu
              rows={filtered}
              baseName="inventario"
              titulo="INVENTARIOS"
              size="md"
              orientacao="portrait"
              columns={[
                { header: "Descrição", value: (inv) => inv.descricao || "Sem descrição", pdfFlex: 30, excelWidth: 40 },
                { header: "Data Início", value: (inv) => fmtDate(inv.data_inicio), pdfFlex: 12 },
                { header: "Status", value: (inv) => (statusMap[inv.status] || statusMap.aberto).label, align: "center", pdfFlex: 10 },
              ]}
            />
            <Button onClick={() => { setFDescricao(""); setFDataInicio(format(new Date(), "yyyy-MM-dd")); setIsSheetOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Novo Inventário
            </Button>
          </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card><CardContent className="p-4">
            <p className="text-[11px] font-bold uppercase text-muted-foreground">Total de Inventários</p>
            <p className="text-2xl font-bold mt-1">{stats.total}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-[11px] font-bold uppercase text-muted-foreground">Em Aberto</p>
            <p className="text-2xl font-bold mt-1">{stats.abertos}</p>
          </CardContent></Card>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar inventário..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>

        {/* Tabela */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {/* Barra de título escura + menu Colunas */}
            <div className="flex items-center justify-between px-4 py-2.5" style={{ background: '#071D41' }}>
              <h3 className="font-bold text-white m-0 text-[15px]">Inventários</h3>
              <div className="flex items-center gap-3">
                <span className="text-[13px] text-white/70 font-medium">
                  {filtered.length} registro{filtered.length !== 1 ? 's' : ''}
                </span>
                <div className="relative self-center">
                  <button
                    onClick={() => setColMenuOpen(o => !o)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/20 text-[12px] text-white hover:bg-white/10"
                    title="Mostrar/ocultar colunas"
                  >
                    <Eye size={14} className="text-white/70" /> Colunas
                    <ChevronDown size={13} className={`text-white/60 transition-transform ${colMenuOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {colMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setColMenuOpen(false)} />
                      <div className="absolute right-0 mt-1 z-50 bg-white border border-[#EAECF0] rounded-lg shadow-xl py-1 min-w-[190px]">
                        <p className="px-3 py-1.5 text-[11px] font-bold text-[#98A2B3] uppercase tracking-wider">Exibir colunas</p>
                        {Object.entries(COL_LABELS).map(([k, label]) => (
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
              </div>
            </div>

            {isLoading ? (
              <div className="text-center py-16">
                <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-3" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="text-sm" style={{ tableLayout: 'fixed', width: visibleInvCols.reduce((a, k) => a + (colWidths[k] ?? COL_WIDTHS_DEFAULT[k]), 0), minWidth: '100%' }}>
                  <colgroup>
                    {INV_COL_ORDER.map(k => (
                      <col key={k} className={isColVisible(k) ? '' : 'hidden'} style={{ width: colWidths[k] ?? COL_WIDTHS_DEFAULT[k] }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr className="bg-white text-[13px] font-bold text-black uppercase tracking-wider border-b-2 border-[#D0D5DD] whitespace-nowrap">
                      <th className={`text-left px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('descricao') ? '' : 'hidden'}`}>
                        <span onMouseDown={startResize('descricao')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                        Descrição
                      </th>
                      <th className={`text-left px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('data') ? '' : 'hidden'}`}>
                        <span onMouseDown={startResize('data')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                        Data Início
                      </th>
                      <th className={`text-center px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('status') ? '' : 'hidden'}`}>
                        <span onMouseDown={startResize('status')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                        Status
                      </th>
                      <th className={`text-center px-3 py-3 relative ${isColVisible('acoes') ? '' : 'hidden'}`}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(inv => {
                      const st = statusMap[inv.status] || statusMap.aberto;
                      return (
                        <tr key={inv.id} className="border-b border-[#F1F3F5] hover:bg-[#FAFAFA]">
                          <td className={`px-3 py-1 font-medium text-[#1D2939] truncate border-r border-[#F1F3F5] ${isColVisible('descricao') ? '' : 'hidden'}`} title={inv.descricao || "Sem descrição"}>{inv.descricao || "Sem descrição"}</td>
                          <td className={`px-3 py-1 text-left text-[#667085] truncate border-r border-[#F1F3F5] ${isColVisible('data') ? '' : 'hidden'}`} title={fmtDate(inv.data_inicio)}>{fmtDate(inv.data_inicio)}</td>
                          <td className={`px-3 py-1 text-center border-r border-[#F1F3F5] ${isColVisible('status') ? '' : 'hidden'}`}>
                            <Badge variant={st.color}>{st.label}</Badge>
                          </td>
                          <td className={`px-3 py-1 text-center ${isColVisible('acoes') ? '' : 'hidden'}`}>
                            <div className="flex gap-1 justify-center">
                              <Button variant="ghost" size="sm" onClick={() => openContagem(inv)} title={inv.status === "aberto" ? "Contagem" : "Visualizar"}>
                                {inv.status === "aberto" ? <ClipboardCheck className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={visibleInvCols.length || 1} className="text-center py-12 text-muted-foreground">
                          <ClipboardCheck className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          Nenhum inventário encontrado
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sheet: Novo Inventário */}
        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
          <SheetContent className="sm:max-w-[400px]">
            <SheetHeader>
              <SheetTitle>Novo Inventário</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 mt-4">
              <div><Label>Descrição</Label><Input value={fDescricao} onChange={e => setFDescricao(e.target.value)} placeholder="Inventário mensal março" /></div>
              <div><Label>Data Início</Label><Input type="date" value={fDataInicio} onChange={e => setFDataInicio(e.target.value)} /></div>
              <p className="text-xs text-muted-foreground">Todos os produtos ativos serão incluídos automaticamente.</p>
              <div className="flex gap-2 pt-4">
                <Button variant="outline" onClick={() => setIsSheetOpen(false)} className="flex-1">Cancelar</Button>
                <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="flex-1">
                  {createMutation.isPending ? "Criando..." : "Criar Inventário"}
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* Sheet: Contagem */}
        <Sheet open={contagemOpen} onOpenChange={setContagemOpen}>
          <SheetContent className="sm:max-w-[700px] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Contagem — {activeInv?.descricao || "Inventário"}</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 mt-4">
              {/* Divergence summary */}
              {(() => {
                const divergentes = contagemItens.filter(i => i.qtd_contada !== i.qtd_sistema && i.qtd_contada > 0);
                if (divergentes.length > 0) {
                  return (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                      <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                      <p className="text-sm text-amber-900">
                        <strong>{divergentes.length}</strong> item(ns) com divergência entre sistema e contagem
                      </p>
                    </div>
                  );
                }
                return null;
              })()}

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Sistema</TableHead>
                    <TableHead className="text-right w-[100px]">Contagem</TableHead>
                    <TableHead className="text-right">Diferença</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contagemItens.map((item, idx) => {
                    const diff = item.qtd_contada - item.qtd_sistema;
                    const hasDiff = item.qtd_contada > 0 && diff !== 0;
                    return (
                      <TableRow key={item.id} className={hasDiff ? "bg-amber-50/50" : ""}>
                        <TableCell className="font-mono text-[11px]">{item._code || "—"}</TableCell>
                        <TableCell className="text-sm">{item._descricao}</TableCell>
                        <TableCell className="text-right tabular-nums">{item.qtd_sistema} {item._unidade}</TableCell>
                        <TableCell className="text-right">
                          {activeInv?.status === "aberto" ? (
                            <Input
                              type="number"
                              className="h-8 w-[90px] ml-auto text-right"
                              value={item.qtd_contada || ""}
                              onChange={e => {
                                const updated = [...contagemItens];
                                updated[idx].qtd_contada = Number(e.target.value);
                                setContagemItens(updated);
                              }}
                            />
                          ) : (
                            <span className="tabular-nums">{item.qtd_contada} {item._unidade}</span>
                          )}
                        </TableCell>
                        <TableCell className={`text-right tabular-nums font-semibold ${hasDiff ? (diff > 0 ? "text-green-700" : "text-red-700") : ""}`}>
                          {item.qtd_contada > 0 ? (diff > 0 ? `+${diff}` : diff) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {activeInv?.status === "aberto" && (
                <div className="flex gap-2 pt-4">
                  <Button variant="outline" onClick={() => saveContagemMutation.mutate()} disabled={saveContagemMutation.isPending} className="flex-1">
                    {saveContagemMutation.isPending ? "Salvando..." : "Salvar Contagem"}
                  </Button>
                  <Button onClick={async () => {
                    const ok = await confirm({
                      title: "Concluir inventário e aplicar ajustes de estoque?",
                      description: "Esta ação não pode ser desfeita. Os saldos dos produtos serão ajustados conforme a contagem.",
                      confirmLabel: "Sim, concluir",
                    });
                    if (ok) concluirMutation.mutate();
                  }} disabled={concluirMutation.isPending} className="flex-1">
                    {concluirMutation.isPending ? "Concluindo..." : "Concluir e Ajustar Estoque"}
                  </Button>
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
        </PagePanel>
      </div>
    </AppLayout>
  );
}
