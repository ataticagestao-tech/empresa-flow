import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Plus, Search, Package, AlertTriangle, ArrowDownCircle, ArrowUpCircle,
  Pencil, Archive, ChevronRight
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const fmtQty = (v: number, un: string = "un") => `${Number(v).toLocaleString("pt-BR")} ${un}`;

interface Produto {
  id: string;
  code: string;
  description: string;
  unidade_medida: string;
  estoque_atual: number;
  estoque_minimo: number;
  estoque_maximo: number | null;
  custo_medio: number;
  price: number;
  tipo_produto: string;
  controla_validade: boolean;
  controla_lote: boolean;
  localizacao: string | null;
  fornecedor_id: string | null;
  is_active: boolean;
}

export default function EstoqueProdutos() {
  const { selectedCompany } = useCompany();
  const { activeClient } = useAuth();
  const db = activeClient as any;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Produto | null>(null);
  const [saidaOpen, setSaidaOpen] = useState(false);
  const [saidaProduto, setSaidaProduto] = useState<Produto | null>(null);
  const [saidaQtd, setSaidaQtd] = useState("");
  const [saidaTipo, setSaidaTipo] = useState("consumo");
  const [saidaMotivo, setSaidaMotivo] = useState("");

  // Form fields
  const [fCode, setFCode] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fUnidade, setFUnidade] = useState("un");
  const [fTipo, setFTipo] = useState("insumo");
  const [fPreco, setFPreco] = useState("");
  const [fEstoqueMin, setFEstoqueMin] = useState("");
  const [fEstoqueMax, setFEstoqueMax] = useState("");
  const [fLocalizacao, setFLocalizacao] = useState("");
  const [fValidade, setFValidade] = useState(false);
  const [fLote, setFLote] = useState(false);

  const { data: produtos = [], isLoading } = useQuery({
    queryKey: ["estoque_produtos", selectedCompany?.id],
    queryFn: async () => {
      if (!selectedCompany?.id) return [];
      const { data, error } = await db
        .from("products")
        .select("*")
        .eq("company_id", selectedCompany.id)
        .eq("is_active", true)
        .order("description");
      if (error) { console.error(error); return []; }
      return data as Produto[];
    },
    enabled: !!selectedCompany?.id,
  });

  // Alertas estoque mínimo
  const { data: alertas = [] } = useQuery({
    queryKey: ["estoque_alertas", selectedCompany?.id],
    queryFn: async () => {
      if (!selectedCompany?.id) return [];
      const { data } = await db
        .from("v_estoque_minimo_alerta")
        .select("*")
        .eq("company_id", selectedCompany.id);
      return data || [];
    },
    enabled: !!selectedCompany?.id,
  });

  const filtered = useMemo(() => {
    let list = produtos;
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(p => p.description?.toLowerCase().includes(s) || p.code?.toLowerCase().includes(s));
    }
    if (filterStatus === "baixo") list = list.filter(p => p.estoque_atual <= p.estoque_minimo && p.estoque_minimo > 0);
    if (filterStatus === "zerado") list = list.filter(p => p.estoque_atual <= 0);
    if (filterStatus === "ok") list = list.filter(p => p.estoque_atual > p.estoque_minimo);
    return list;
  }, [produtos, search, filterStatus]);

  function getStatus(p: Produto) {
    if (p.estoque_atual <= 0) return { label: "Zerado", color: "destructive" as const };
    if (p.estoque_minimo > 0 && p.estoque_atual <= p.estoque_minimo) return { label: "Repor", color: "secondary" as const };
    return { label: "OK", color: "default" as const };
  }

  function openNew() {
    setEditingProduct(null);
    setFCode(""); setFDesc(""); setFUnidade("un"); setFTipo("insumo");
    setFPreco(""); setFEstoqueMin(""); setFEstoqueMax(""); setFLocalizacao("");
    setFValidade(false); setFLote(false);
    setIsSheetOpen(true);
  }

  function openEdit(p: Produto) {
    setEditingProduct(p);
    setFCode(p.code || ""); setFDesc(p.description || ""); setFUnidade(p.unidade_medida || "un");
    setFTipo(p.tipo_produto || "insumo"); setFPreco(String(p.price || ""));
    setFEstoqueMin(String(p.estoque_minimo || "")); setFEstoqueMax(String(p.estoque_maximo || ""));
    setFLocalizacao(p.localizacao || ""); setFValidade(p.controla_validade);
    setFLote(p.controla_lote);
    setIsSheetOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCompany?.id) throw new Error("Sem empresa");
      const payload: Record<string, any> = {
        company_id: selectedCompany.id,
        code: fCode || null,
        description: fDesc,
        unidade_medida: fUnidade,
        tipo_produto: fTipo,
        price: fPreco ? Number(fPreco) : 0,
        estoque_minimo: fEstoqueMin ? Number(fEstoqueMin) : 0,
        estoque_maximo: fEstoqueMax ? Number(fEstoqueMax) : null,
        localizacao: fLocalizacao || null,
        controla_validade: fValidade,
        controla_lote: fLote,
        is_active: true,
      };
      if (editingProduct) payload.id = editingProduct.id;
      const { error } = await db.from("products").upsert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Produto salvo!" });
      queryClient.invalidateQueries({ queryKey: ["estoque_produtos"] });
      setIsSheetOpen(false);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const saidaMutation = useMutation({
    mutationFn: async () => {
      if (!saidaProduto || !selectedCompany?.id) throw new Error("Dados incompletos");
      const qty = Number(saidaQtd);
      if (qty <= 0) throw new Error("Quantidade deve ser maior que zero");
      const { error } = await db.from("saidas_estoque").insert({
        company_id: selectedCompany.id,
        produto_id: saidaProduto.id,
        quantidade: qty,
        valor_unitario: saidaProduto.custo_medio || 0,
        tipo: saidaTipo,
        motivo: saidaMotivo || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Saída registrada!" });
      queryClient.invalidateQueries({ queryKey: ["estoque_produtos"] });
      setSaidaOpen(false); setSaidaQtd(""); setSaidaMotivo("");
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const stats = useMemo(() => ({
    total: produtos.length,
    abaixoMin: alertas.length,
    valorEstoque: produtos.reduce((s, p) => s + (p.estoque_atual * (p.custo_medio || 0)), 0),
  }), [produtos, alertas]);

  return (
    <AppLayout title="Estoque">
      <div className="space-y-5 animate-fade-in">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-foreground tracking-tight">Estoque de Produtos</h2>
            <p className="text-[12.5px] text-muted-foreground mt-0.5">Controle de insumos e materiais</p>
          </div>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo Produto</Button>
        </div>

        {/* Alerta estoque mínimo */}
        {alertas.length > 0 && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-900">{alertas.length} produto(s) abaixo do estoque mínimo</p>
              <p className="text-xs text-amber-700 mt-0.5">{alertas.map((a: any) => a.descricao).join(", ")}</p>
            </div>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card><CardContent className="p-4">
            <p className="text-[11px] font-bold uppercase text-muted-foreground">Produtos Ativos</p>
            <p className="text-2xl font-bold mt-1">{stats.total}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-[11px] font-bold uppercase text-muted-foreground">Abaixo do Mínimo</p>
            <p className="text-2xl font-bold mt-1" style={{ color: stats.abaixoMin > 0 ? "#D92D20" : "#039855" }}>{stats.abaixoMin}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-[11px] font-bold uppercase text-muted-foreground">Valor em Estoque</p>
            <p className="text-2xl font-bold mt-1">{fmt(stats.valorEstoque)}</p>
          </CardContent></Card>
        </div>

        {/* Filtros */}
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar produto..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="ok">OK</SelectItem>
              <SelectItem value="baixo">Repor</SelectItem>
              <SelectItem value="zerado">Zerado</SelectItem>
            </SelectContent>
          </Select>
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
                    <TableHead>Código</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Estoque</TableHead>
                    <TableHead className="text-right">Mín.</TableHead>
                    <TableHead className="text-right">Custo Médio</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(p => {
                    const st = getStatus(p);
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-[12px]">{p.code || "—"}</TableCell>
                        <TableCell className="font-medium">{p.description}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtQty(p.estoque_atual, p.unidade_medida)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{fmtQty(p.estoque_minimo, p.unidade_medida)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(p.custo_medio || 0)}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={st.color}>{st.label}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex gap-1 justify-center">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(p)} title="Editar">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => { setSaidaProduto(p); setSaidaOpen(true); }} title="Registrar Saída">
                              <ArrowDownCircle className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                        <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        Nenhum produto encontrado
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Sheet: Novo/Editar Produto */}
        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
          <SheetContent className="sm:max-w-[500px] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{editingProduct ? "Editar Produto" : "Novo Produto"}</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Código</Label><Input value={fCode} onChange={e => setFCode(e.target.value)} placeholder="MAT-001" /></div>
                <div>
                  <Label>Tipo</Label>
                  <Select value={fTipo} onValueChange={setFTipo}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="insumo">Insumo</SelectItem>
                      <SelectItem value="produto">Produto</SelectItem>
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="embalagem">Embalagem</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Descrição *</Label><Input value={fDesc} onChange={e => setFDesc(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Unidade</Label><Input value={fUnidade} onChange={e => setFUnidade(e.target.value)} placeholder="un, cx, fr" /></div>
                <div><Label>Preço Venda</Label><Input type="number" value={fPreco} onChange={e => setFPreco(e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Estoque Mínimo</Label><Input type="number" value={fEstoqueMin} onChange={e => setFEstoqueMin(e.target.value)} /></div>
                <div><Label>Estoque Máximo</Label><Input type="number" value={fEstoqueMax} onChange={e => setFEstoqueMax(e.target.value)} /></div>
              </div>
              <div><Label>Localização</Label><Input value={fLocalizacao} onChange={e => setFLocalizacao(e.target.value)} placeholder="Sala 3, Prateleira A" /></div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={fValidade} onChange={e => setFValidade(e.target.checked)} /> Controla Validade
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={fLote} onChange={e => setFLote(e.target.checked)} /> Controla Lote
                </label>
              </div>
              <div className="flex gap-2 pt-4">
                <Button variant="outline" onClick={() => setIsSheetOpen(false)} className="flex-1">Cancelar</Button>
                <Button onClick={() => saveMutation.mutate()} disabled={!fDesc || saveMutation.isPending} className="flex-1">
                  {saveMutation.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* Sheet: Registrar Saída */}
        <Sheet open={saidaOpen} onOpenChange={setSaidaOpen}>
          <SheetContent className="sm:max-w-[400px]">
            <SheetHeader>
              <SheetTitle>Registrar Saída</SheetTitle>
            </SheetHeader>
            {saidaProduto && (
              <div className="space-y-4 mt-4">
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="font-semibold">{saidaProduto.description}</p>
                  <p className="text-sm text-muted-foreground">Estoque atual: {fmtQty(saidaProduto.estoque_atual, saidaProduto.unidade_medida)}</p>
                </div>
                <div><Label>Quantidade *</Label><Input type="number" value={saidaQtd} onChange={e => setSaidaQtd(e.target.value)} /></div>
                <div>
                  <Label>Tipo</Label>
                  <Select value={saidaTipo} onValueChange={setSaidaTipo}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="consumo">Consumo</SelectItem>
                      <SelectItem value="venda">Venda</SelectItem>
                      <SelectItem value="perda">Perda</SelectItem>
                      <SelectItem value="ajuste">Ajuste</SelectItem>
                      <SelectItem value="devolucao">Devolução</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Motivo</Label><Input value={saidaMotivo} onChange={e => setSaidaMotivo(e.target.value)} /></div>
                <div className="flex gap-2 pt-4">
                  <Button variant="outline" onClick={() => setSaidaOpen(false)} className="flex-1">Cancelar</Button>
                  <Button onClick={() => saidaMutation.mutate()} disabled={!saidaQtd || saidaMutation.isPending} className="flex-1" variant="destructive">
                    {saidaMutation.isPending ? "Registrando..." : "Registrar Saída"}
                  </Button>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </AppLayout>
  );
}
