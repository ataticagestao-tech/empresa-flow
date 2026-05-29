import { useState, useMemo, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PagePanel } from "@/components/layout/PagePanel";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Trash2, Search, Pencil, Eye, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ExportMenu, type ExportColumn } from "@/components/ExportMenu";

const T = {
    primary: "#059669", primaryLt: "#ECFDF4",
    green: "#039855", greenLt: "#ECFDF3",
    red: "#E53E3E",
    amber: "#f57f17",
    text1: "#1D2939", text3: "#98A2B3",
    border: "#EAECF0",
} as const;
const FONT = "var(--font-base)";
const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

interface PriceList {
    id: string;
    name: string;
    description: string;
    prices: Record<string, number>; // product_id -> price
}

const STORAGE_KEY = (companyId: string) => `tabelas_precos_${companyId}`;

function loadLists(companyId: string): PriceList[] {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY(companyId)) || "[]"); } catch { return []; }
}
function saveLists(companyId: string, lists: PriceList[]) {
    localStorage.setItem(STORAGE_KEY(companyId), JSON.stringify(lists));
}

export default function TabelaPrecos() {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const confirm = useConfirm();
    const { toast } = useToast();

    const [searchTerm, setSearchTerm] = useState("");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingIdx, setEditingIdx] = useState<number | null>(null);
    const [listName, setListName] = useState("");
    const [listDesc, setListDesc] = useState("");
    const [prices, setPrices] = useState<Record<string, string>>({});
    const [selectedList, setSelectedList] = useState<number | null>(null);

    // ─── Padrão de planilha: colunas ajustáveis + ocultáveis ─────
    const TP_COL_ORDER = ['produto', 'padrao', 'tabela', 'diferenca'];
    const COL_LABELS: Record<string, string> = {
        produto: 'Produto', padrao: 'Preço Padrão', tabela: 'Preço Tabela', diferenca: 'Diferença',
    };
    const COL_WIDTHS_DEFAULT: Record<string, number> = {
        produto: 360, padrao: 140, tabela: 160, diferenca: 140,
    };
    const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
        try {
            const s = localStorage.getItem('tabelaprecos_col_widths');
            if (s) return { ...COL_WIDTHS_DEFAULT, ...JSON.parse(s) };
        } catch { /* ignore */ }
        return COL_WIDTHS_DEFAULT;
    });
    useEffect(() => { localStorage.setItem('tabelaprecos_col_widths', JSON.stringify(colWidths)); }, [colWidths]);
    const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => {
        try {
            const s = localStorage.getItem('tabelaprecos_hidden_cols');
            if (s) return new Set(JSON.parse(s) as string[]);
        } catch { /* ignore */ }
        return new Set();
    });
    useEffect(() => { localStorage.setItem('tabelaprecos_hidden_cols', JSON.stringify([...hiddenCols])); }, [hiddenCols]);
    const [colMenuOpen, setColMenuOpen] = useState(false);
    const isColVisible = (k: string) => !hiddenCols.has(k);
    const toggleColVisible = (k: string) => setHiddenCols(prev => {
        const n = new Set(prev);
        if (n.has(k)) n.delete(k); else n.add(k);
        return n;
    });
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

    const { data: products = [] } = useQuery({
        queryKey: ["tp_products", selectedCompany?.id],
        queryFn: async () => {
            const { data } = await (activeClient as any)
                .from("products")
                .select("id, code, description, price")
                .eq("company_id", selectedCompany?.id)
                .eq("is_active", true)
                .order("description");
            return data || [];
        },
        enabled: !!selectedCompany?.id,
    });

    const lists = useMemo(() => {
        if (!selectedCompany?.id) return [];
        return loadLists(selectedCompany.id);
    }, [selectedCompany?.id, dialogOpen]);

    const openNew = () => {
        setEditingIdx(null);
        setListName("");
        setListDesc("");
        const defaultPrices: Record<string, string> = {};
        products.forEach((p: any) => { defaultPrices[p.id] = String(p.price || 0); });
        setPrices(defaultPrices);
        setDialogOpen(true);
    };

    const handleEdit = (idx: number) => {
        const list = lists[idx];
        setEditingIdx(idx);
        setListName(list.name);
        setListDesc(list.description);
        const p: Record<string, string> = {};
        products.forEach((prod: any) => { p[prod.id] = String(list.prices[prod.id] ?? prod.price ?? 0); });
        setPrices(p);
        setDialogOpen(true);
    };

    const handleSave = () => {
        if (!selectedCompany?.id || !listName.trim()) return;
        const priceMap: Record<string, number> = {};
        Object.entries(prices).forEach(([id, val]) => {
            priceMap[id] = parseFloat(val.replace(",", ".")) || 0;
        });
        const list: PriceList = {
            id: editingIdx !== null ? lists[editingIdx].id : crypto.randomUUID(),
            name: listName,
            description: listDesc,
            prices: priceMap,
        };
        const current = loadLists(selectedCompany.id);
        if (editingIdx !== null) { current[editingIdx] = list; } else { current.push(list); }
        saveLists(selectedCompany.id, current);
        toast({ title: editingIdx !== null ? "Tabela atualizada" : "Tabela criada" });
        setDialogOpen(false);
    };

    const handleDelete = async (idx: number) => {
        if (!selectedCompany?.id) return;
        const ok = await confirm({
            title: "Excluir esta tabela de preços?",
            description: "Esta ação não pode ser desfeita.",
            confirmLabel: "Sim, excluir",
            variant: "destructive",
        });
        if (!ok) return;
        const current = loadLists(selectedCompany.id);
        current.splice(idx, 1);
        saveLists(selectedCompany.id, current);
        if (selectedList === idx) setSelectedList(null);
        setDialogOpen(false);
        toast({ title: "Tabela excluída" });
    };

    // View: compare prices
    const viewList = selectedList !== null ? lists[selectedList] : null;

    const filteredProducts = useMemo(() => {
        if (!searchTerm.trim()) return products;
        const needle = searchTerm.toLowerCase();
        return products.filter((p: any) => p.description.toLowerCase().includes(needle));
    }, [products, searchTerm]);

    const exportColumns = useMemo<ExportColumn<any>[]>(() => {
        const cols: ExportColumn<any>[] = [
            { header: "Produto", value: (p) => (p.code ? `${p.code} - ` : "") + p.description, pdfFlex: 28, excelWidth: 40 },
            { header: "Preço Padrão", value: (p) => fmt(Number(p.price || 0)), numericValue: (p) => Number(p.price || 0), pdfFlex: 12 },
        ];
        if (viewList) {
            cols.push({ header: viewList.name, value: (p) => fmt(viewList.prices[p.id] ?? Number(p.price || 0)), numericValue: (p) => viewList.prices[p.id] ?? Number(p.price || 0), pdfFlex: 12 });
            cols.push({ header: "Diferença", value: (p) => { const d = (viewList.prices[p.id] ?? Number(p.price || 0)) - Number(p.price || 0); return d !== 0 ? `${d > 0 ? "+" : ""}${fmt(d)}` : "—"; }, numericValue: (p) => (viewList.prices[p.id] ?? Number(p.price || 0)) - Number(p.price || 0), pdfFlex: 12 });
        }
        return cols;
    }, [viewList]);

    return (
        <AppLayout title="Tabela de Preços">
            <div style={{ fontFamily: FONT }} className="animate-fade-in">
                <PagePanel title="Tabela de Preços" subtitle={`${lists.length} tabela${lists.length !== 1 ? "s" : ""} cadastrada${lists.length !== 1 ? "s" : ""}`}>
                    <div className="flex flex-wrap items-center gap-2 justify-end">
                        <ExportMenu
                            rows={filteredProducts}
                            baseName="tabela-precos"
                            titulo={viewList ? `TABELA DE PRECOS · ${viewList.name.toUpperCase()}` : "TABELA DE PRECOS"}
                            columns={exportColumns}
                        />
                        <Button size="sm" onClick={openNew} style={{ gap: 6 }}><Plus size={16} /> Nova Tabela</Button>
                    </div>

                {/* Lists cards */}
                {lists.length > 0 && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
                        {lists.map((list, i) => (
                            <Card key={list.id} onClick={() => setSelectedList(selectedList === i ? null : i)}
                                style={{
                                    padding: 16, borderRadius: 12, cursor: "pointer",
                                    border: selectedList === i ? `2px solid ${T.primary}` : `1px solid ${T.border}`,
                                    background: selectedList === i ? T.primaryLt : "white",
                                }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                                    <div>
                                        <p style={{ fontSize: 14, fontWeight: 700 }}>{list.name}</p>
                                        {list.description && <p style={{ fontSize: 12, color: T.text3 }}>{list.description}</p>}
                                        <p style={{ fontSize: 11, color: T.text3, marginTop: 4 }}>
                                            {Object.keys(list.prices).length} produtos
                                        </p>
                                    </div>
                                    <div style={{ display: "flex", gap: 2 }}>
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); handleEdit(i); }}>
                                            <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={e => { e.stopPropagation(); handleDelete(i); }}>
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}

                {/* Price comparison table */}
                {(() => {
                    // tabela/diferenca só existem quando há lista selecionada para comparar
                    const colVisible = (k: string) => {
                        if ((k === 'tabela' || k === 'diferenca') && !viewList) return false;
                        return isColVisible(k);
                    };
                    const visibleCols = TP_COL_ORDER.filter(colVisible);
                    const tableWidth = visibleCols.reduce((a, k) => a + (colWidths[k] ?? COL_WIDTHS_DEFAULT[k]), 0);
                    const colLabelsForMenu = Object.entries(COL_LABELS).filter(([k]) => viewList || (k !== 'tabela' && k !== 'diferenca'));
                    return (
                <Card style={{ borderRadius: 14, border: `1px solid ${T.border}`, overflow: "hidden" }}>
                    <div style={{ backgroundColor: "#000000", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                        <div style={{ position: "relative", maxWidth: 300, flex: "1 1 auto" }}>
                            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.5)" }} />
                            <Input placeholder="Buscar produto..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                                className="h-9 pl-8 text-sm bg-white/10 border-white/20 text-white placeholder:text-white/40" />
                        </div>
                        <div className="flex items-center gap-2">
                            {viewList && <Badge className="bg-blue-100 text-blue-700">Comparando: {viewList.name}</Badge>}
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
                                            {colLabelsForMenu.map(([k, label]) => (
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
                    <div className="overflow-x-auto">
                        <table className="text-sm" style={{ tableLayout: 'fixed', width: tableWidth, minWidth: '100%' }}>
                            <colgroup>
                                {TP_COL_ORDER.map(k => (
                                    <col key={k} className={colVisible(k) ? '' : 'hidden'} style={{ width: colWidths[k] ?? COL_WIDTHS_DEFAULT[k] }} />
                                ))}
                            </colgroup>
                            <thead>
                                <tr className="bg-white text-[12px] font-bold text-black uppercase tracking-wider border-b-2 border-[#D0D5DD] whitespace-nowrap">
                                    <th className={`text-left px-3 py-2 relative border-r border-[#EAECF0] ${colVisible('produto') ? '' : 'hidden'}`}>
                                        Produto
                                        <span onMouseDown={startResize('produto')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                    </th>
                                    <th className={`text-right px-3 py-2 relative border-r border-[#EAECF0] ${colVisible('padrao') ? '' : 'hidden'}`}>
                                        Preço Padrão
                                        <span onMouseDown={startResize('padrao')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                    </th>
                                    <th className={`text-right px-3 py-2 relative border-r border-[#EAECF0] ${colVisible('tabela') ? '' : 'hidden'}`}>
                                        {viewList ? viewList.name : 'Preço Tabela'}
                                        <span onMouseDown={startResize('tabela')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                    </th>
                                    <th className={`text-right px-3 py-2 relative ${colVisible('diferenca') ? '' : 'hidden'}`}>
                                        Diferença
                                        <span onMouseDown={startResize('diferenca')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredProducts.length === 0 ? (
                                    <tr><td colSpan={visibleCols.length || 1} className="text-center py-8 text-muted-foreground">Nenhum produto encontrado.</td></tr>
                                ) : filteredProducts.map((p: any) => {
                                    const stdPrice = Number(p.price || 0);
                                    const listPrice = viewList ? (viewList.prices[p.id] ?? stdPrice) : null;
                                    const diff = listPrice !== null ? listPrice - stdPrice : 0;
                                    const prodLabel = `${p.code ? `${p.code} - ` : ""}${p.description}`;
                                    return (
                                        <tr key={p.id} className="border-b border-[#F1F3F5] hover:bg-[#F9FAFB]">
                                            <td className={`px-3 py-1 font-medium text-[#1D2939] truncate border-r border-[#F1F3F5] ${colVisible('produto') ? '' : 'hidden'}`} title={prodLabel}>{prodLabel}</td>
                                            <td className={`px-3 py-1 text-right text-[#1D2939] truncate border-r border-[#F1F3F5] ${colVisible('padrao') ? '' : 'hidden'}`}>{fmt(stdPrice)}</td>
                                            <td className={`px-3 py-1 text-right font-semibold truncate border-r border-[#F1F3F5] ${colVisible('tabela') ? '' : 'hidden'}`} style={{ color: T.primary }}>{listPrice !== null ? fmt(listPrice) : '—'}</td>
                                            <td className={`px-3 py-1 text-right truncate ${colVisible('diferenca') ? '' : 'hidden'}`} style={{ color: diff < 0 ? T.red : diff > 0 ? T.green : T.text3 }}>{listPrice !== null && diff !== 0 ? `${diff > 0 ? "+" : ""}${fmt(diff)}` : "—"}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </Card>
                    );
                })()}

                {/* Dialog */}
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>{editingIdx !== null ? "Editar Tabela" : "Nova Tabela de Preços"}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-2">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Nome da Tabela *</Label>
                                    <Input value={listName} onChange={e => setListName(e.target.value)}
                                        placeholder="Ex: Atacado, Convênio, VIP" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Descrição</Label>
                                    <Input value={listDesc} onChange={e => setListDesc(e.target.value)}
                                        placeholder="Opcional" />
                                </div>
                            </div>

                            <div>
                                <Label className="mb-2 block">Preços por Produto</Label>
                                <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden", maxHeight: 400, overflowY: "auto" }}>
                                    <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                                        <thead>
                                            <tr style={{ background: "#F6F2EB", borderBottom: `1px solid ${T.border}`, position: "sticky", top: 0 }}>
                                                <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, color: T.text3, fontWeight: 600 }}>PRODUTO</th>
                                                <th style={{ padding: "8px 12px", textAlign: "right", fontSize: 11, color: T.text3, fontWeight: 600, width: 120 }}>PREÇO PADRÃO</th>
                                                <th style={{ padding: "8px 12px", textAlign: "right", fontSize: 11, color: T.text3, fontWeight: 600, width: 140 }}>PREÇO TABELA</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {products.map((p: any) => (
                                                <tr key={p.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                                                    <td style={{ padding: "8px 12px" }}>{p.description}</td>
                                                    <td style={{ padding: "8px 12px", textAlign: "right", color: T.text3 }}>{fmt(Number(p.price))}</td>
                                                    <td style={{ padding: "4px 8px" }}>
                                                        <Input value={prices[p.id] || ""} onChange={e => setPrices({ ...prices, [p.id]: e.target.value })}
                                                            className="h-7 text-sm text-right w-28 ml-auto" />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <Button className="w-full" onClick={handleSave} disabled={!listName.trim()}>
                                {editingIdx !== null ? "Atualizar Tabela" : "Criar Tabela de Preços"}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
                </PagePanel>
            </div>
        </AppLayout>
    );
}
