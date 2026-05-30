import { useState, useMemo, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PagePanel } from "@/components/layout/PagePanel";
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
  Pencil, Archive, ChevronRight, Eye, ChevronDown
} from "lucide-react";
import { ExportMenu } from "@/components/ExportMenu";

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

  // ─── Padrão de planilha: colunas ajustáveis + ocultáveis ─────
  const COL_ORDER = ['code', 'description', 'estoque', 'minimo', 'custo', 'status', 'acoes'];
  const COL_LABELS: Record<string, string> = {
    code: 'Código', description: 'Descrição', estoque: 'Estoque', minimo: 'Mín.',
    custo: 'Custo Médio', status: 'Status', acoes: 'Ações',
  };
  const COL_WIDTHS_DEFAULT: Record<string, number> = {
    code: 110, description: 280, estoque: 120, minimo: 100, custo: 130, status: 100, acoes: 110,
  };
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    try {
      const s = localStorage.getItem('estoque_col_widths');
      if (s) return { ...COL_WIDTHS_DEFAULT, ...JSON.parse(s) };
    } catch { /* ignore */ }
    return COL_WIDTHS_DEFAULT;
  });
  useEffect(() => { localStorage.setItem('estoque_col_widths', JSON.stringify(colWidths)); }, [colWidths]);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => {
    try {
      const s = localStorage.getItem('estoque_hidden_cols');
      if (s) return new Set(JSON.parse(s) as string[]);
    } catch { /* ignore */ }
    return new Set();
  });
  useEffect(() => { localStorage.setItem('estoque_hidden_cols', JSON.stringify([...hiddenCols])); }, [hiddenCols]);
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const isColVisible = (k: string) => !hiddenCols.has(k);
  const toggleColVisible = (k: string) => setHiddenCols(prev => {
    const n = new Set(prev);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });
  const visibleCols = COL_ORDER.filter(isColVisible);
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
      <div className="animate-fade-in">

        {/* Header */}
        <PagePanel title="Estoque de Produtos" subtitle="Controle de insumos e materiais">
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <ExportMenu
              rows={filtered}
              baseName="estoque"
              titulo="ESTOQUE DE PRODUTOS"
              size="md"
              columns={[
                { header: "Código", value: (p) => p.code || "—", pdfFlex: 8 },
                { header: "Descrição", value: (p) => p.description, pdfFlex: 24, excelWidth: 36 },
                { header: "Estoque", value: (p) => fmtQty(p.estoque_atual, p.unidade_medida), numericValue: (p) => Number(p.estoque_atual || 0), pdfFlex: 10 },
                { header: "Mín.", value: (p) => fmtQty(p.estoque_minimo, p.unidade_medida), numericValue: (p) => Number(p.estoque_minimo || 0), pdfFlex: 8 },
                { header: "Custo Médio", value: (p) => fmt(p.custo_medio || 0), numericValue: (p) => Number(p.custo_medio || 0), pdfFlex: 10 },
                { header: "Status", value: (p) => getStatus(p).label, align: "center", pdfFlex: 8 },
              ]}
            />
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
            <p className="text-2xl font-bold mt-1" style={{ color: stats.abaixoMin > 0 ? "#E53E3E" : "#039855" }}>{stats.abaixoMin}</p>
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
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {/* Barra de título preta + menu Colunas */}
            <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: '#000000' }}>
              <div className="flex items-center gap-3">
                <h3 className="font-extrabold text-white m-0" style={{ fontSize: 16, letterSpacing: '-0.01em' }}>Produtos</h3>
                <span className="text-[13px] text-white/70 font-medium">
                  {filtered.length} registro{filtered.length !== 1 ? 's' : ''}
                </span>
              </div>
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

            {isLoading ? (
              <div className="text-center py-16">
                <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-3" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                Nenhum produto encontrado
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="text-sm" style={{ tableLayout: 'fixed', width: visibleCols.reduce((a, k) => a + (colWidths[k] ?? COL_WIDTHS_DEFAULT[k]), 0), minWidth: '100%' }}>
                  <colgroup>
                    {COL_ORDER.map(k => (
                      <col key={k} className={isColVisible(k) ? '' : 'hidden'} style={{ width: colWidths[k] ?? COL_WIDTHS_DEFAULT[k] }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr className="bg-white text-[13px] font-bold text-black uppercase tracking-wider border-b-2 border-[#D0D5DD] whitespace-nowrap">
                      <th className={`text-left px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('code') ? '' : 'hidden'}`}>
                        <span onMouseDown={startResize('code')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                        Código
                      </th>
                      <th className={`text-left px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('description') ? '' : 'hidden'}`}>
                        <span onMouseDown={startResize('description')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                        Descrição
                      </th>
                      <th className={`text-right px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('estoque') ? '' : 'hidden'}`}>
                        <span onMouseDown={startResize('estoque')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                        Estoque
                      </th>
                      <th className={`text-right px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('minimo') ? '' : 'hidden'}`}>
                        <span onMouseDown={startResize('minimo')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                        Mín.
                      </th>
                      <th className={`text-right px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('custo') ? '' : 'hidden'}`}>
                        <span onMouseDown={startResize('custo')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                        Custo Médio
                      </th>
                      <th className={`text-center px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('status') ? '' : 'hidden'}`}>
                        <span onMouseDown={startResize('status')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                        Status
                      </th>
                      <th className={`text-center px-3 py-3 relative ${isColVisible('acoes') ? '' : 'hidden'}`}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(p => {
                      const st = getStatus(p);
                      return (
                        <tr key={p.id} className="border-b border-[#F1F3F5] hover:bg-[#F9FAFB]">
                          <td className={`px-3 py-1 font-mono text-[12px] truncate border-r border-[#F1F3F5] ${isColVisible('code') ? '' : 'hidden'}`} title={p.code || ''}>{p.code || "—"}</td>
                          <td className={`px-3 py-1 font-medium truncate border-r border-[#F1F3F5] ${isColVisible('description') ? '' : 'hidden'}`} title={p.description}>{p.description}</td>
                          <td className={`px-3 py-1 text-right tabular-nums truncate border-r border-[#F1F3F5] ${isColVisible('estoque') ? '' : 'hidden'}`}>{fmtQty(p.estoque_atual, p.unidade_medida)}</td>
                          <td className={`px-3 py-1 text-right tabular-nums text-muted-foreground truncate border-r border-[#F1F3F5] ${isColVisible('minimo') ? '' : 'hidden'}`}>{fmtQty(p.estoque_minimo, p.unidade_medida)}</td>
                          <td className={`px-3 py-1 text-right tabular-nums truncate border-r border-[#F1F3F5] ${isColVisible('custo') ? '' : 'hidden'}`}>{fmt(p.custo_medio || 0)}</td>
                          <td className={`px-3 py-1 text-center border-r border-[#F1F3F5] ${isColVisible('status') ? '' : 'hidden'}`}>
                            <Badge variant={st.color}>{st.label}</Badge>
                          </td>
                          <td className={`px-3 py-1 text-center ${isColVisible('acoes') ? '' : 'hidden'}`}>
                            <div className="flex gap-1 justify-center">
                              <Button variant="ghost" size="sm" onClick={() => openEdit(p)} title="Editar">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => { setSaidaProduto(p); setSaidaOpen(true); }} title="Registrar Saída">
                                <ArrowDownCircle className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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
        </PagePanel>
      </div>
    </AppLayout>
  );
}
