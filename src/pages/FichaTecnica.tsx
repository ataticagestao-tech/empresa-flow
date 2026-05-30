import { useState, useMemo, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PagePanel } from "@/components/layout/PagePanel";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Search, Pencil, Eye, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ExportMenu } from "@/components/ExportMenu";

const T = {
    primary: "#059669", primaryLt: "#ECFDF4",
    green: "#039855", greenLt: "#ECFDF3",
    red: "#E53E3E",
    text1: "#1D2939", text3: "#98A2B3",
    border: "#EAECF0",
} as const;
const FONT = "var(--font-base)";
const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

interface FichaItem {
    insumo: string;
    quantidade: number;
    unidade: string;
    custo_unitario: number;
}

interface Ficha {
    product_id: string;
    product_name: string;
    items: FichaItem[];
    mao_de_obra: number;
    tempo_minutos: number;
}

const STORAGE_KEY = (companyId: string) => `fichas_tecnicas_${companyId}`;

function loadFichas(companyId: string): Ficha[] {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY(companyId)) || "[]"); } catch { return []; }
}
function saveFichas(companyId: string, fichas: Ficha[]) {
    localStorage.setItem(STORAGE_KEY(companyId), JSON.stringify(fichas));
}

export default function FichaTecnica() {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const confirm = useConfirm();
    const { toast } = useToast();

    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingIdx, setEditingIdx] = useState<number | null>(null);
    const [searchTerm, setSearchTerm] = useState("");

    // ─── Padrão de planilha: colunas ajustáveis + ocultáveis ─────
    const FT_COL_ORDER = ['produto', 'insumos', 'custoInsumos', 'maoObra', 'custoTotal', 'tempo', 'acoes'];
    const COL_LABELS: Record<string, string> = {
        produto: 'Produto/Serviço', insumos: 'Insumos', custoInsumos: 'Custo Insumos',
        maoObra: 'Mão de Obra', custoTotal: 'Custo Total', tempo: 'Tempo (min)', acoes: 'Ações',
    };
    const COL_WIDTHS_DEFAULT: Record<string, number> = {
        produto: 240, insumos: 90, custoInsumos: 130, maoObra: 130, custoTotal: 130, tempo: 100, acoes: 90,
    };
    const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
        try {
            const s = localStorage.getItem('fichatecnica_col_widths');
            if (s) return { ...COL_WIDTHS_DEFAULT, ...JSON.parse(s) };
        } catch { /* ignore */ }
        return COL_WIDTHS_DEFAULT;
    });
    useEffect(() => { localStorage.setItem('fichatecnica_col_widths', JSON.stringify(colWidths)); }, [colWidths]);
    const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => {
        try {
            const s = localStorage.getItem('fichatecnica_hidden_cols');
            if (s) return new Set(JSON.parse(s) as string[]);
        } catch { /* ignore */ }
        return new Set();
    });
    useEffect(() => { localStorage.setItem('fichatecnica_hidden_cols', JSON.stringify([...hiddenCols])); }, [hiddenCols]);
    const [colMenuOpen, setColMenuOpen] = useState(false);
    const isColVisible = (k: string) => !hiddenCols.has(k);
    const toggleColVisible = (k: string) => setHiddenCols(prev => {
        const n = new Set(prev);
        if (n.has(k)) n.delete(k); else n.add(k);
        return n;
    });
    const visibleFtCols = FT_COL_ORDER.filter(isColVisible);
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

    // Current ficha being edited
    const [selectedProduct, setSelectedProduct] = useState("");
    const [items, setItems] = useState<FichaItem[]>([]);
    const [maoDeObra, setMaoDeObra] = useState(0);
    const [tempoMinutos, setTempoMinutos] = useState(0);

    // New item row
    const [newInsumo, setNewInsumo] = useState("");
    const [newQtd, setNewQtd] = useState("1");
    const [newUnidade, setNewUnidade] = useState("un");
    const [newCusto, setNewCusto] = useState("");

    const { data: products = [] } = useQuery({
        queryKey: ["ficha_products", selectedCompany?.id],
        queryFn: async () => {
            const { data } = await (activeClient as any)
                .from("products")
                .select("id, code, description, price, cost_price")
                .eq("company_id", selectedCompany?.id)
                .eq("is_active", true)
                .order("description");
            return data || [];
        },
        enabled: !!selectedCompany?.id,
    });

    const fichas = useMemo(() => {
        if (!selectedCompany?.id) return [];
        return loadFichas(selectedCompany.id);
    }, [selectedCompany?.id, dialogOpen]);

    const filtered = useMemo(() => {
        if (!searchTerm.trim()) return fichas;
        const needle = searchTerm.toLowerCase();
        return fichas.filter(f => f.product_name.toLowerCase().includes(needle));
    }, [fichas, searchTerm]);

    const custoInsumos = items.reduce((s, i) => s + i.quantidade * i.custo_unitario, 0);
    const custoTotal = custoInsumos + maoDeObra;

    const addItem = () => {
        if (!newInsumo.trim()) return;
        setItems([...items, {
            insumo: newInsumo,
            quantidade: parseFloat(newQtd) || 1,
            unidade: newUnidade,
            custo_unitario: parseFloat(newCusto.replace(",", ".")) || 0,
        }]);
        setNewInsumo(""); setNewQtd("1"); setNewUnidade("un"); setNewCusto("");
    };

    const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));

    const handleSave = () => {
        if (!selectedCompany?.id || !selectedProduct) return;
        const product = products.find((p: any) => p.id === selectedProduct);
        if (!product) return;

        const ficha: Ficha = {
            product_id: selectedProduct,
            product_name: product.description,
            items,
            mao_de_obra: maoDeObra,
            tempo_minutos: tempoMinutos,
        };

        const current = loadFichas(selectedCompany.id);
        if (editingIdx !== null) {
            current[editingIdx] = ficha;
        } else {
            current.push(ficha);
        }
        saveFichas(selectedCompany.id, current);
        toast({ title: editingIdx !== null ? "Ficha atualizada" : "Ficha criada" });
        resetForm();
        setDialogOpen(false);
    };

    const handleEdit = (idx: number) => {
        const f = fichas[idx];
        setEditingIdx(idx);
        setSelectedProduct(f.product_id);
        setItems(f.items);
        setMaoDeObra(f.mao_de_obra);
        setTempoMinutos(f.tempo_minutos);
        setDialogOpen(true);
    };

    const handleDelete = async (idx: number) => {
        if (!selectedCompany?.id) return;
        const ok = await confirm({
            title: "Excluir esta ficha técnica?",
            description: "Esta ação não pode ser desfeita.",
            confirmLabel: "Sim, excluir",
            variant: "destructive",
        });
        if (!ok) return;
        const current = loadFichas(selectedCompany.id);
        current.splice(idx, 1);
        saveFichas(selectedCompany.id, current);
        setDialogOpen(false); // trigger re-render via useMemo dependency
        setDialogOpen(false);
        toast({ title: "Ficha excluída" });
    };

    const resetForm = () => {
        setSelectedProduct(""); setItems([]); setMaoDeObra(0); setTempoMinutos(0); setEditingIdx(null);
    };

    const openNew = () => { resetForm(); setDialogOpen(true); };

    return (
        <AppLayout title="Ficha Técnica">
            <div style={{ fontFamily: FONT }} className="animate-fade-in">

                <PagePanel title="Ficha Técnica" subtitle="Composição de insumos por produto/serviço">
                    <div className="flex flex-wrap items-center gap-2 justify-end">
                        <ExportMenu
                            rows={filtered}
                            baseName="ficha-tecnica"
                            titulo="FICHAS TECNICAS"
                            columns={[
                                { header: "Produto/Serviço", value: (f) => f.product_name, pdfFlex: 24, excelWidth: 36 },
                                { header: "Insumos", value: (f) => f.items.length, numericValue: (f) => f.items.length, align: "center", pdfFlex: 8 },
                                { header: "Custo Insumos", value: (f) => fmt(f.items.reduce((s, it) => s + it.quantidade * it.custo_unitario, 0)), numericValue: (f) => f.items.reduce((s, it) => s + it.quantidade * it.custo_unitario, 0), pdfFlex: 12 },
                                { header: "Mão de Obra", value: (f) => fmt(f.mao_de_obra), numericValue: (f) => Number(f.mao_de_obra || 0), pdfFlex: 12 },
                                { header: "Custo Total", value: (f) => fmt(f.items.reduce((s, it) => s + it.quantidade * it.custo_unitario, 0) + f.mao_de_obra), numericValue: (f) => f.items.reduce((s, it) => s + it.quantidade * it.custo_unitario, 0) + f.mao_de_obra, pdfFlex: 12 },
                                { header: "Tempo (min)", value: (f) => f.tempo_minutos, numericValue: (f) => Number(f.tempo_minutos || 0), align: "center", pdfFlex: 10 },
                            ]}
                        />
                        <Button size="sm" onClick={openNew} style={{ gap: 6 }}><Plus size={16} /> Nova Ficha</Button>
                    </div>

                <Card style={{ borderRadius: 14, border: `1px solid ${T.border}`, overflow: "hidden" }}>
                    {/* Cabeçalho do container — preto puro */}
                    <div className="px-5 py-4 flex items-center justify-between" style={{ backgroundColor: "#000000" }}>
                        <h3 className="font-extrabold text-white m-0" style={{ fontSize: 18, letterSpacing: "-0.015em", lineHeight: 1.15 }}>
                            Fichas Técnicas
                        </h3>
                        <div className="flex items-center gap-3">
                            <span className="text-[13px] text-white/70 font-medium">
                                {filtered.length} registro{filtered.length !== 1 ? "s" : ""}
                            </span>
                            <div className="relative">
                                <button
                                    onClick={() => setColMenuOpen(o => !o)}
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/20 text-[12px] text-white hover:bg-white/10"
                                    title="Mostrar/ocultar colunas"
                                >
                                    <Eye size={14} className="text-white/70" /> Colunas
                                    <ChevronDown size={13} className={`text-white/60 transition-transform ${colMenuOpen ? "rotate-180" : ""}`} />
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
                    <div style={{ padding: "12px 20px", borderBottom: `1px solid ${T.border}` }}>
                        <div style={{ position: "relative", maxWidth: 300 }}>
                            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.text3 }} />
                            <Input placeholder="Buscar produto..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                                className="h-9 pl-8 text-sm" />
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="text-sm" style={{ tableLayout: "fixed", width: visibleFtCols.reduce((a, k) => a + (colWidths[k] ?? COL_WIDTHS_DEFAULT[k]), 0), minWidth: "100%" }}>
                            <colgroup>
                                {FT_COL_ORDER.map(k => (
                                    <col key={k} className={isColVisible(k) ? "" : "hidden"} style={{ width: colWidths[k] ?? COL_WIDTHS_DEFAULT[k] }} />
                                ))}
                            </colgroup>
                            <thead>
                                <tr className="bg-white text-[11px] font-bold text-black uppercase tracking-wider border-b border-[#EAECF0]">
                                    <th className={`text-left px-3 py-2 relative border-r border-[#EAECF0] ${isColVisible('produto') ? '' : 'hidden'}`}>
                                        Produto/Serviço
                                        <span onMouseDown={startResize('produto')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                    </th>
                                    <th className={`text-center px-3 py-2 relative border-r border-[#EAECF0] ${isColVisible('insumos') ? '' : 'hidden'}`}>
                                        Insumos
                                        <span onMouseDown={startResize('insumos')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                    </th>
                                    <th className={`text-right px-3 py-2 relative border-r border-[#EAECF0] ${isColVisible('custoInsumos') ? '' : 'hidden'}`}>
                                        Custo Insumos
                                        <span onMouseDown={startResize('custoInsumos')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                    </th>
                                    <th className={`text-right px-3 py-2 relative border-r border-[#EAECF0] ${isColVisible('maoObra') ? '' : 'hidden'}`}>
                                        Mão de Obra
                                        <span onMouseDown={startResize('maoObra')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                    </th>
                                    <th className={`text-right px-3 py-2 relative border-r border-[#EAECF0] ${isColVisible('custoTotal') ? '' : 'hidden'}`}>
                                        Custo Total
                                        <span onMouseDown={startResize('custoTotal')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                    </th>
                                    <th className={`text-center px-3 py-2 relative border-r border-[#EAECF0] ${isColVisible('tempo') ? '' : 'hidden'}`}>
                                        Tempo (min)
                                        <span onMouseDown={startResize('tempo')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                    </th>
                                    <th className={`text-center px-3 py-2 relative ${isColVisible('acoes') ? '' : 'hidden'}`}>
                                        Ações
                                        <span onMouseDown={startResize('acoes')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.length === 0 ? (
                                    <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Nenhuma ficha técnica cadastrada.</td></tr>
                                ) : filtered.map((f, i) => {
                                    const ci = f.items.reduce((s, it) => s + it.quantidade * it.custo_unitario, 0);
                                    const ct = ci + f.mao_de_obra;
                                    return (
                                        <tr key={i} className="border-b border-[#F1F3F5] hover:bg-[#F9FAFB]">
                                            <td className={`px-3 py-1 text-left font-medium text-[#1D2939] truncate border-r border-[#F1F3F5] ${isColVisible('produto') ? '' : 'hidden'}`} title={f.product_name}>{f.product_name}</td>
                                            <td className={`px-3 py-1 text-center text-[#667085] truncate border-r border-[#F1F3F5] ${isColVisible('insumos') ? '' : 'hidden'}`}>{f.items.length}</td>
                                            <td className={`px-3 py-1 text-right text-[#1D2939] truncate border-r border-[#F1F3F5] ${isColVisible('custoInsumos') ? '' : 'hidden'}`}>{fmt(ci)}</td>
                                            <td className={`px-3 py-1 text-right text-[#1D2939] truncate border-r border-[#F1F3F5] ${isColVisible('maoObra') ? '' : 'hidden'}`}>{fmt(f.mao_de_obra)}</td>
                                            <td className={`px-3 py-1 text-right font-semibold truncate border-r border-[#F1F3F5] ${isColVisible('custoTotal') ? '' : 'hidden'}`} style={{ color: T.primary }}>{fmt(ct)}</td>
                                            <td className={`px-3 py-1 text-center text-[#667085] truncate border-r border-[#F1F3F5] ${isColVisible('tempo') ? '' : 'hidden'}`}>{f.tempo_minutos}</td>
                                            <td className={`px-3 py-1 text-center ${isColVisible('acoes') ? '' : 'hidden'}`}>
                                                <div className="flex items-center justify-center gap-0.5">
                                                    <button onClick={() => handleEdit(i)} className="p-1 rounded hover:bg-[#ECFDF4] text-[#059669] transition-colors" title="Editar">
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </button>
                                                    <button onClick={() => handleDelete(i)} className="p-1 rounded hover:bg-[#FEE2E2] text-[#E53E3E] transition-colors" title="Excluir">
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </Card>

                {/* Dialog */}
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>{editingIdx !== null ? "Editar Ficha Técnica" : "Nova Ficha Técnica"}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-2">
                            <div className="space-y-2">
                                <Label>Produto / Serviço *</Label>
                                <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                                    <SelectTrigger className="text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                                    <SelectContent>
                                        {products.map((p: any) => (
                                            <SelectItem key={p.id} value={p.id}>
                                                {p.code ? `${p.code} - ` : ""}{p.description}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Items list */}
                            <div>
                                <Label className="mb-2 block">Insumos / Materiais</Label>
                                <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
                                    <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                                        <thead>
                                            <tr style={{ background: "#F6F2EB", borderBottom: `1px solid ${T.border}` }}>
                                                <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, color: T.text3, fontWeight: 600 }}>INSUMO</th>
                                                <th style={{ padding: "8px 12px", textAlign: "center", fontSize: 11, color: T.text3, fontWeight: 600, width: 70 }}>QTD</th>
                                                <th style={{ padding: "8px 12px", textAlign: "center", fontSize: 11, color: T.text3, fontWeight: 600, width: 70 }}>UN</th>
                                                <th style={{ padding: "8px 12px", textAlign: "right", fontSize: 11, color: T.text3, fontWeight: 600, width: 110 }}>CUSTO UNIT.</th>
                                                <th style={{ padding: "8px 12px", textAlign: "right", fontSize: 11, color: T.text3, fontWeight: 600, width: 110 }}>SUBTOTAL</th>
                                                <th style={{ width: 40 }} />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {items.map((item, i) => (
                                                <tr key={i} style={{ borderBottom: `1px solid ${T.border}` }}>
                                                    <td style={{ padding: "8px 12px" }}>{item.insumo}</td>
                                                    <td style={{ padding: "4px 8px", textAlign: "center" }}>{item.quantidade}</td>
                                                    <td style={{ padding: "4px 8px", textAlign: "center" }}>{item.unidade}</td>
                                                    <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmt(item.custo_unitario)}</td>
                                                    <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600 }}>{fmt(item.quantidade * item.custo_unitario)}</td>
                                                    <td style={{ padding: "4px 8px" }}>
                                                        <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500" onClick={() => removeItem(i)}>
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {/* Add row */}
                                            <tr style={{ borderBottom: `1px solid ${T.border}`, background: "#F6F2EB" }}>
                                                <td style={{ padding: "4px 8px" }}>
                                                    <Input value={newInsumo} onChange={e => setNewInsumo(e.target.value)}
                                                        placeholder="Nome do insumo" className="h-7 text-sm" />
                                                </td>
                                                <td style={{ padding: "4px 4px" }}>
                                                    <Input type="number" value={newQtd} onChange={e => setNewQtd(e.target.value)}
                                                        className="h-7 text-sm text-center w-14 mx-auto" min="0.01" step="0.01" />
                                                </td>
                                                <td style={{ padding: "4px 4px" }}>
                                                    <Input value={newUnidade} onChange={e => setNewUnidade(e.target.value)}
                                                        className="h-7 text-sm text-center w-14 mx-auto" />
                                                </td>
                                                <td style={{ padding: "4px 8px" }}>
                                                    <Input value={newCusto} onChange={e => setNewCusto(e.target.value)}
                                                        placeholder="0,00" className="h-7 text-sm text-right w-24 ml-auto" />
                                                </td>
                                                <td colSpan={2} style={{ padding: "4px 8px" }}>
                                                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addItem}>
                                                        <Plus className="h-3 w-3 mr-1" /> Add
                                                    </Button>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Mão de Obra (R$)</Label>
                                    <Input type="number" value={maoDeObra || ""} onChange={e => setMaoDeObra(Number(e.target.value) || 0)}
                                        placeholder="0,00" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Tempo de Execução (min)</Label>
                                    <Input type="number" value={tempoMinutos || ""} onChange={e => setTempoMinutos(Number(e.target.value) || 0)}
                                        placeholder="0" />
                                </div>
                            </div>

                            {/* Total */}
                            <div style={{
                                display: "flex", justifyContent: "space-between", padding: "12px 16px",
                                background: T.primaryLt, borderRadius: 10, alignItems: "center",
                            }}>
                                <div>
                                    <p style={{ fontSize: 11, color: T.text3 }}>Insumos: {fmt(custoInsumos)} | Mão de obra: {fmt(maoDeObra)}</p>
                                    <p style={{ fontSize: 14, fontWeight: 700, color: T.text1 }}>CUSTO TOTAL</p>
                                </div>
                                <span style={{ fontSize: 22, fontWeight: 800, color: T.primary }}>{fmt(custoTotal)}</span>
                            </div>

                            <Button className="w-full" onClick={handleSave} disabled={!selectedProduct || items.length === 0}>
                                {editingIdx !== null ? "Atualizar Ficha" : "Salvar Ficha Técnica"}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
                </PagePanel>
            </div>
        </AppLayout>
    );
}
