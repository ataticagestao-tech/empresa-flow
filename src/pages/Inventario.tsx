import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
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
  Plus, Search, ClipboardCheck, CheckCircle, Eye, AlertTriangle
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

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
      <div className="space-y-5 animate-fade-in">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-foreground tracking-tight">Inventário</h2>
            <p className="text-[12.5px] text-muted-foreground mt-0.5">Contagem física e ajuste de estoque</p>
          </div>
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
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="text-center py-16">
                <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-3" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Data Início</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(inv => {
                    const st = statusMap[inv.status] || statusMap.aberto;
                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">{inv.descricao || "Sem descrição"}</TableCell>
                        <TableCell>{fmtDate(inv.data_inicio)}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={st.color}>{st.label}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex gap-1 justify-center">
                            <Button variant="ghost" size="sm" onClick={() => openContagem(inv)} title={inv.status === "aberto" ? "Contagem" : "Visualizar"}>
                              {inv.status === "aberto" ? <ClipboardCheck className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                        <ClipboardCheck className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        Nenhum inventário encontrado
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
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
      </div>
    </AppLayout>
  );
}
