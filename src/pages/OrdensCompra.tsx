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
import {
  Plus, Search, ShoppingCart, Pencil, CheckCircle, Trash2, Eye, ChevronDown
} from "lucide-react";
import { format } from "date-fns";
import { ExportMenu } from "@/components/ExportMenu";

const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const fmtDate = (d: string | null) => d ? format(new Date(d + "T12:00:00"), "dd/MM/yyyy") : "—";

interface OrdemCompra {
  id: string;
  numero: string;
  fornecedor_id: string;
  data_emissao: string;
  data_prevista: string | null;
  cond_pagamento: string | null;
  valor_total: number;
  observacoes: string | null;
  status: string;
}

interface OrdemItem {
  id?: string;
  produto_id: string;
  quantidade: number;
  valor_unitario: number;
  quantidade_recebida: number;
  _descricao?: string;
}

const statusMap: Record<string, { label: string; color: "default" | "secondary" | "destructive" | "outline" }> = {
  rascunho: { label: "Rascunho", color: "outline" },
  enviada: { label: "Enviada", color: "default" },
  parcial: { label: "Parcial", color: "secondary" },
  recebida: { label: "Recebida", color: "default" },
  cancelada: { label: "Cancelada", color: "destructive" },
};

export default function OrdensCompra() {
  const { selectedCompany } = useCompany();
  const { activeClient } = useAuth();
  const db = activeClient as any;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingOC, setEditingOC] = useState<OrdemCompra | null>(null);
  const [receberOpen, setReceberOpen] = useState(false);
  const [receberOC, setReceberOC] = useState<OrdemCompra | null>(null);

  // Form fields
  const [fNumero, setFNumero] = useState("");
  const [fFornecedor, setFFornecedor] = useState("");
  const [fDataEmissao, setFDataEmissao] = useState(format(new Date(), "yyyy-MM-dd"));
  const [fDataPrevista, setFDataPrevista] = useState("");
  const [fCondPagamento, setFCondPagamento] = useState("");
  const [fObs, setFObs] = useState("");
  const [fItens, setFItens] = useState<OrdemItem[]>([]);

  // Recebimento fields
  const [receberItens, setReceberItens] = useState<{ item_id: string; produto_id: string; descricao: string; qtd_total: number; qtd_recebida: number; qtd_nova: string; valor_unitario: number }[]>([]);
  const [receberNF, setReceberNF] = useState("");

  // Queries
  const { data: ordens = [], isLoading } = useQuery({
    queryKey: ["ordens_compra", selectedCompany?.id],
    queryFn: async () => {
      if (!selectedCompany?.id) return [];
      const { data, error } = await db
        .from("ordens_compra")
        .select("*")
        .eq("company_id", selectedCompany.id)
        .order("created_at", { ascending: false });
      if (error) { console.error(error); return []; }
      return data as OrdemCompra[];
    },
    enabled: !!selectedCompany?.id,
  });

  const { data: fornecedores = [] } = useQuery({
    queryKey: ["suppliers_oc", selectedCompany?.id],
    queryFn: async () => {
      if (!selectedCompany?.id) return [];
      const { data } = await db
        .from("suppliers")
        .select("id, razao_social")
        .eq("company_id", selectedCompany.id)
        .eq("is_active", true)
        .order("razao_social");
      return data || [];
    },
    enabled: !!selectedCompany?.id,
  });

  const { data: produtosList = [] } = useQuery({
    queryKey: ["products_oc", selectedCompany?.id],
    queryFn: async () => {
      if (!selectedCompany?.id) return [];
      const { data } = await db
        .from("products")
        .select("id, description, code, price")
        .eq("company_id", selectedCompany.id)
        .eq("is_active", true)
        .order("description");
      return data || [];
    },
    enabled: !!selectedCompany?.id,
  });

  const fornecedorMap = useMemo(() => {
    const m: Record<string, string> = {};
    fornecedores.forEach((f: any) => { m[f.id] = f.razao_social; });
    return m;
  }, [fornecedores]);

  const filtered = useMemo(() => {
    let list = ordens;
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(o =>
        o.numero?.toLowerCase().includes(s) ||
        (fornecedorMap[o.fornecedor_id] || "").toLowerCase().includes(s)
      );
    }
    if (filterStatus !== "all") list = list.filter(o => o.status === filterStatus);
    return list;
  }, [ordens, search, filterStatus, fornecedorMap]);

  // ─── Padrão de planilha: colunas ajustáveis + ocultáveis ─────
  const OC_COL_ORDER = ['numero', 'fornecedor', 'emissao', 'previsao', 'valor', 'status', 'acoes'];
  const COL_LABELS: Record<string, string> = {
    numero: 'Número', fornecedor: 'Fornecedor', emissao: 'Emissão', previsao: 'Previsão',
    valor: 'Valor', status: 'Status', acoes: 'Ações',
  };
  const COL_WIDTHS_DEFAULT: Record<string, number> = {
    numero: 110, fornecedor: 240, emissao: 110, previsao: 110, valor: 130, status: 120, acoes: 110,
  };
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    try {
      const s = localStorage.getItem('ordenscompra_col_widths');
      if (s) return { ...COL_WIDTHS_DEFAULT, ...JSON.parse(s) };
    } catch { /* ignore */ }
    return COL_WIDTHS_DEFAULT;
  });
  useEffect(() => { localStorage.setItem('ordenscompra_col_widths', JSON.stringify(colWidths)); }, [colWidths]);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => {
    try {
      const s = localStorage.getItem('ordenscompra_hidden_cols');
      if (s) return new Set(JSON.parse(s) as string[]);
    } catch { /* ignore */ }
    return new Set();
  });
  useEffect(() => { localStorage.setItem('ordenscompra_hidden_cols', JSON.stringify([...hiddenCols])); }, [hiddenCols]);
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const isColVisible = (k: string) => !hiddenCols.has(k);
  const toggleColVisible = (k: string) => setHiddenCols(prev => {
    const n = new Set(prev);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });
  const visibleOcCols = OC_COL_ORDER.filter(isColVisible);
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

  function openNew() {
    setEditingOC(null);
    setFNumero(""); setFFornecedor(""); setFDataEmissao(format(new Date(), "yyyy-MM-dd"));
    setFDataPrevista(""); setFCondPagamento(""); setFObs("");
    setFItens([]);
    setIsSheetOpen(true);
  }

  async function openEdit(oc: OrdemCompra) {
    setEditingOC(oc);
    setFNumero(oc.numero); setFFornecedor(oc.fornecedor_id);
    setFDataEmissao(oc.data_emissao); setFDataPrevista(oc.data_prevista || "");
    setFCondPagamento(oc.cond_pagamento || ""); setFObs(oc.observacoes || "");
    // Load items
    const { data: itens } = await db
      .from("ordens_compra_itens")
      .select("*")
      .eq("ordem_compra_id", oc.id);
    setFItens((itens || []).map((i: any) => ({
      id: i.id,
      produto_id: i.produto_id,
      quantidade: i.quantidade,
      valor_unitario: i.valor_unitario,
      quantidade_recebida: i.quantidade_recebida,
    })));
    setIsSheetOpen(true);
  }

  function addItem() {
    setFItens([...fItens, { produto_id: "", quantidade: 1, valor_unitario: 0, quantidade_recebida: 0 }]);
  }

  function removeItem(idx: number) {
    setFItens(fItens.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, field: keyof OrdemItem, value: any) {
    const updated = [...fItens];
    (updated[idx] as any)[field] = value;
    setFItens(updated);
  }

  const valorTotal = useMemo(() => fItens.reduce((s, i) => s + (i.quantidade * i.valor_unitario), 0), [fItens]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCompany?.id) throw new Error("Sem empresa");
      if (!fFornecedor) throw new Error("Selecione um fornecedor");
      if (!fNumero) throw new Error("Número obrigatório");
      if (fItens.length === 0) throw new Error("Adicione pelo menos um item");

      const payload: Record<string, any> = {
        company_id: selectedCompany.id,
        numero: fNumero,
        fornecedor_id: fFornecedor,
        data_emissao: fDataEmissao,
        data_prevista: fDataPrevista || null,
        cond_pagamento: fCondPagamento || null,
        valor_total: valorTotal,
        observacoes: fObs || null,
        status: editingOC?.status || "rascunho",
      };
      if (editingOC) payload.id = editingOC.id;

      const { data: savedOC, error } = await db.from("ordens_compra").upsert(payload).select().single();
      if (error) throw error;

      // Delete existing items and re-insert
      if (editingOC) {
        await db.from("ordens_compra_itens").delete().eq("ordem_compra_id", savedOC.id);
      }

      const itensPayload = fItens.map(i => ({
        ordem_compra_id: savedOC.id,
        produto_id: i.produto_id,
        quantidade: i.quantidade,
        valor_unitario: i.valor_unitario,
        quantidade_recebida: i.quantidade_recebida || 0,
      }));

      const { error: itensErr } = await db.from("ordens_compra_itens").insert(itensPayload);
      if (itensErr) throw itensErr;
    },
    onSuccess: () => {
      toast({ title: "Ordem de compra salva!" });
      queryClient.invalidateQueries({ queryKey: ["ordens_compra"] });
      setIsSheetOpen(false);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // Recebimento
  async function openReceber(oc: OrdemCompra) {
    setReceberOC(oc);
    setReceberNF("");
    const { data: itens } = await db
      .from("ordens_compra_itens")
      .select("id, produto_id, quantidade, valor_unitario, quantidade_recebida")
      .eq("ordem_compra_id", oc.id);

    const prodMap: Record<string, string> = {};
    produtosList.forEach((p: any) => { prodMap[p.id] = p.description; });

    setReceberItens((itens || []).map((i: any) => ({
      item_id: i.id,
      produto_id: i.produto_id,
      descricao: prodMap[i.produto_id] || "Produto",
      qtd_total: i.quantidade,
      qtd_recebida: i.quantidade_recebida,
      qtd_nova: "",
      valor_unitario: i.valor_unitario,
    })));
    setReceberOpen(true);
  }

  const receberMutation = useMutation({
    mutationFn: async () => {
      if (!receberOC || !selectedCompany?.id) throw new Error("Dados incompletos");

      const itensReceber = receberItens.filter(i => Number(i.qtd_nova) > 0);
      if (itensReceber.length === 0) throw new Error("Informe quantidade para pelo menos um item");

      // Create entrada_estoque
      const valorEntrada = itensReceber.reduce((s, i) => s + (Number(i.qtd_nova) * i.valor_unitario), 0);
      const { data: entrada, error: entErr } = await db.from("entradas_estoque").insert({
        company_id: selectedCompany.id,
        fornecedor_id: receberOC.fornecedor_id,
        ordem_compra_id: receberOC.id,
        data_entrada: format(new Date(), "yyyy-MM-dd"),
        numero_nf: receberNF || null,
        valor_total: valorEntrada,
      }).select().single();
      if (entErr) throw entErr;

      // Insert entrada items (trigger updates stock automatically)
      for (const item of itensReceber) {
        const qty = Number(item.qtd_nova);
        await db.from("entradas_estoque_itens").insert({
          entrada_id: entrada.id,
          produto_id: item.produto_id,
          quantidade: qty,
          valor_unitario: item.valor_unitario,
        });
        // Update quantidade_recebida on OC item
        await db.from("ordens_compra_itens")
          .update({ quantidade_recebida: item.qtd_recebida + qty })
          .eq("id", item.item_id);
      }

      // Update OC status
      const allReceived = receberItens.every(i => {
        const nova = Number(i.qtd_nova) || 0;
        return (i.qtd_recebida + nova) >= i.qtd_total;
      });
      await db.from("ordens_compra")
        .update({ status: allReceived ? "recebida" : "parcial" })
        .eq("id", receberOC.id);
    },
    onSuccess: () => {
      toast({ title: "Recebimento registrado!" });
      queryClient.invalidateQueries({ queryKey: ["ordens_compra"] });
      queryClient.invalidateQueries({ queryKey: ["estoque_produtos"] });
      setReceberOpen(false);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const stats = useMemo(() => ({
    total: ordens.length,
    pendentes: ordens.filter(o => o.status === "enviada" || o.status === "rascunho").length,
    valorAberto: ordens.filter(o => !["recebida", "cancelada"].includes(o.status)).reduce((s, o) => s + o.valor_total, 0),
  }), [ordens]);

  return (
    <AppLayout title="Ordens de Compra">
      <div className="animate-fade-in">
        <PagePanel title="Ordens de Compra" subtitle="Gerencie pedidos de compra aos fornecedores">
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <ExportMenu
              rows={filtered}
              baseName="ordens-compra"
              titulo="ORDENS DE COMPRA"
              size="md"
              columns={[
                { header: "Número", value: (o) => o.numero, pdfFlex: 10 },
                { header: "Fornecedor", value: (o) => fornecedorMap[o.fornecedor_id] || "—", pdfFlex: 22, excelWidth: 32 },
                { header: "Emissão", value: (o) => fmtDate(o.data_emissao), pdfFlex: 10 },
                { header: "Previsão", value: (o) => fmtDate(o.data_prevista), pdfFlex: 10 },
                { header: "Valor", value: (o) => fmt(o.valor_total), numericValue: (o) => Number(o.valor_total || 0), pdfFlex: 12 },
                { header: "Status", value: (o) => (statusMap[o.status] || statusMap.rascunho).label, align: "center", pdfFlex: 10 },
              ]}
            />
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nova Ordem</Button>
          </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card><CardContent className="p-4">
            <p className="text-[11px] font-bold uppercase text-muted-foreground">Total de Ordens</p>
            <p className="text-2xl font-bold mt-1">{stats.total}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-[11px] font-bold uppercase text-muted-foreground">Pendentes</p>
            <p className="text-2xl font-bold mt-1">{stats.pendentes}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-[11px] font-bold uppercase text-muted-foreground">Valor em Aberto</p>
            <p className="text-2xl font-bold mt-1">{fmt(stats.valorAberto)}</p>
          </CardContent></Card>
        </div>

        {/* Filtros */}
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por número ou fornecedor..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="rascunho">Rascunho</SelectItem>
              <SelectItem value="enviada">Enviada</SelectItem>
              <SelectItem value="parcial">Parcial</SelectItem>
              <SelectItem value="recebida">Recebida</SelectItem>
              <SelectItem value="cancelada">Cancelada</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Tabela */}
        <Card>
          <CardContent className="p-0">
            {/* Barra de título preta */}
            <div className="flex items-center justify-between px-4 py-3 rounded-t-lg" style={{ background: '#000000' }}>
              <h3 className="font-extrabold text-white m-0" style={{ fontSize: 18, letterSpacing: '-0.015em', lineHeight: 1.15 }}>
                Ordens de Compra
              </h3>
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
                      <div className="fixed inset-0 z-20" onClick={() => setColMenuOpen(false)} />
                      <div className="absolute right-0 mt-1 z-30 bg-white border border-[#EAECF0] rounded-lg shadow-xl py-1 min-w-[190px]">
                        <p className="px-3 py-1.5 text-[10px] font-bold text-[#98A2B3] uppercase tracking-wider">Exibir colunas</p>
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
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-30" />
                Nenhuma ordem de compra encontrada
              </div>
            ) : (
              <div className="bg-white overflow-x-auto rounded-b-lg">
                <table className="text-sm" style={{ tableLayout: 'fixed', width: visibleOcCols.reduce((a, k) => a + (colWidths[k] ?? COL_WIDTHS_DEFAULT[k]), 0), minWidth: '100%' }}>
                  <colgroup>
                    {OC_COL_ORDER.map(k => (
                      <col key={k} className={isColVisible(k) ? '' : 'hidden'} style={{ width: colWidths[k] ?? COL_WIDTHS_DEFAULT[k] }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr className="bg-white text-[13px] font-bold text-black uppercase tracking-wider border-b-2 border-[#D0D5DD] whitespace-nowrap">
                      <th className={`text-left px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('numero') ? '' : 'hidden'}`}>
                        <span onMouseDown={startResize('numero')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                        Número
                      </th>
                      <th className={`text-left px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('fornecedor') ? '' : 'hidden'}`}>
                        <span onMouseDown={startResize('fornecedor')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                        Fornecedor
                      </th>
                      <th className={`text-left px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('emissao') ? '' : 'hidden'}`}>
                        <span onMouseDown={startResize('emissao')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                        Emissão
                      </th>
                      <th className={`text-left px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('previsao') ? '' : 'hidden'}`}>
                        <span onMouseDown={startResize('previsao')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                        Previsão
                      </th>
                      <th className={`text-right px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('valor') ? '' : 'hidden'}`}>
                        <span onMouseDown={startResize('valor')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                        Valor
                      </th>
                      <th className={`text-center px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('status') ? '' : 'hidden'}`}>
                        <span onMouseDown={startResize('status')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                        Status
                      </th>
                      <th className={`text-center px-3 py-3 relative ${isColVisible('acoes') ? '' : 'hidden'}`}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(oc => {
                      const st = statusMap[oc.status] || statusMap.rascunho;
                      return (
                        <tr key={oc.id} className="border-b border-[#F1F3F5] hover:bg-[#FAFAFA]">
                          <td className={`px-3 py-1 font-mono text-[12px] truncate border-r border-[#F1F3F5] ${isColVisible('numero') ? '' : 'hidden'}`} title={oc.numero}>{oc.numero}</td>
                          <td className={`px-3 py-1 truncate border-r border-[#F1F3F5] ${isColVisible('fornecedor') ? '' : 'hidden'}`} title={fornecedorMap[oc.fornecedor_id] || "—"}>{fornecedorMap[oc.fornecedor_id] || "—"}</td>
                          <td className={`px-3 py-1 truncate border-r border-[#F1F3F5] ${isColVisible('emissao') ? '' : 'hidden'}`}>{fmtDate(oc.data_emissao)}</td>
                          <td className={`px-3 py-1 truncate border-r border-[#F1F3F5] ${isColVisible('previsao') ? '' : 'hidden'}`}>{fmtDate(oc.data_prevista)}</td>
                          <td className={`px-3 py-1 text-right tabular-nums truncate border-r border-[#F1F3F5] ${isColVisible('valor') ? '' : 'hidden'}`}>{fmt(oc.valor_total)}</td>
                          <td className={`px-3 py-1 text-center border-r border-[#F1F3F5] ${isColVisible('status') ? '' : 'hidden'}`}>
                            <Badge variant={st.color}>{st.label}</Badge>
                          </td>
                          <td className={`px-3 py-1 text-center ${isColVisible('acoes') ? '' : 'hidden'}`}>
                            <div className="flex gap-1 justify-center">
                              <Button variant="ghost" size="sm" onClick={() => openEdit(oc)} title="Editar">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              {!["recebida", "cancelada"].includes(oc.status) && (
                                <Button variant="ghost" size="sm" onClick={() => openReceber(oc)} title="Receber">
                                  <CheckCircle className="h-3.5 w-3.5" />
                                </Button>
                              )}
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

        {/* Sheet: Nova/Editar OC */}
        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
          <SheetContent className="sm:max-w-[600px] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{editingOC ? "Editar Ordem de Compra" : "Nova Ordem de Compra"}</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Número *</Label><Input value={fNumero} onChange={e => setFNumero(e.target.value)} placeholder="OC-001" /></div>
                <div>
                  <Label>Fornecedor *</Label>
                  <Select value={fFornecedor} onValueChange={setFFornecedor}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {fornecedores.map((f: any) => (
                        <SelectItem key={f.id} value={f.id}>{f.razao_social}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Data Emissão</Label><Input type="date" value={fDataEmissao} onChange={e => setFDataEmissao(e.target.value)} /></div>
                <div><Label>Previsão Entrega</Label><Input type="date" value={fDataPrevista} onChange={e => setFDataPrevista(e.target.value)} /></div>
                <div><Label>Cond. Pagamento</Label><Input value={fCondPagamento} onChange={e => setFCondPagamento(e.target.value)} placeholder="30/60/90" /></div>
              </div>
              <div><Label>Observações</Label><Input value={fObs} onChange={e => setFObs(e.target.value)} /></div>

              {/* Itens */}
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-sm font-bold">Itens</Label>
                  <Button variant="outline" size="sm" onClick={addItem}><Plus className="h-3.5 w-3.5 mr-1" /> Item</Button>
                </div>
                {fItens.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_80px_100px_32px] gap-2 mb-2 items-end">
                    <div>
                      {idx === 0 && <Label className="text-[11px]">Produto</Label>}
                      <Select value={item.produto_id} onValueChange={v => updateItem(idx, "produto_id", v)}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Produto..." /></SelectTrigger>
                        <SelectContent>
                          {produtosList.map((p: any) => (
                            <SelectItem key={p.id} value={p.id}>{p.description}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      {idx === 0 && <Label className="text-[11px]">Qtd</Label>}
                      <Input type="number" className="h-9" value={item.quantidade} onChange={e => updateItem(idx, "quantidade", Number(e.target.value))} />
                    </div>
                    <div>
                      {idx === 0 && <Label className="text-[11px]">Vlr. Unit.</Label>}
                      <Input type="number" className="h-9" value={item.valor_unitario} onChange={e => updateItem(idx, "valor_unitario", Number(e.target.value))} />
                    </div>
                    <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={() => removeItem(idx)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}
                {fItens.length > 0 && (
                  <div className="text-right text-sm font-bold mt-2">Total: {fmt(valorTotal)}</div>
                )}
              </div>

              <div className="flex gap-2 pt-4">
                <Button variant="outline" onClick={() => setIsSheetOpen(false)} className="flex-1">Cancelar</Button>
                <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="flex-1">
                  {saveMutation.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* Sheet: Receber OC */}
        <Sheet open={receberOpen} onOpenChange={setReceberOpen}>
          <SheetContent className="sm:max-w-[550px] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Receber Ordem #{receberOC?.numero}</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 mt-4">
              <div><Label>Número NF</Label><Input value={receberNF} onChange={e => setReceberNF(e.target.value)} placeholder="Nota fiscal..." /></div>

              <div className="border-t pt-3">
                <Label className="text-sm font-bold mb-3 block">Itens para Recebimento</Label>
                {receberItens.map((item, idx) => {
                  const pendente = item.qtd_total - item.qtd_recebida;
                  return (
                    <div key={item.item_id} className="p-3 rounded-lg border mb-2">
                      <p className="text-sm font-medium">{item.descricao}</p>
                      <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                        <span>Total: {item.qtd_total}</span>
                        <span>Recebido: {item.qtd_recebida}</span>
                        <span>Pendente: {pendente}</span>
                      </div>
                      <div className="mt-2">
                        <Input
                          type="number"
                          placeholder={`Receber até ${pendente}`}
                          value={item.qtd_nova}
                          className="h-8"
                          onChange={e => {
                            const updated = [...receberItens];
                            updated[idx].qtd_nova = e.target.value;
                            setReceberItens(updated);
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-2 pt-4">
                <Button variant="outline" onClick={() => setReceberOpen(false)} className="flex-1">Cancelar</Button>
                <Button onClick={() => receberMutation.mutate()} disabled={receberMutation.isPending} className="flex-1">
                  {receberMutation.isPending ? "Registrando..." : "Confirmar Recebimento"}
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
        </PagePanel>
      </div>
    </AppLayout>
  );
}
