import { useState, useMemo, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PagePanel } from "@/components/layout/PagePanel";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Search, Pencil, Save, Eye, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const T = {
    primary: "#059669", primaryLt: "#ECFDF4",
    green: "#039855", greenLt: "#ECFDF3",
    red: "#E53E3E",
    amber: "#f57f17", amberLt: "#fff8e1",
    text1: "#1D2939", text3: "#98A2B3",
    border: "#EAECF0",
} as const;
const FONT = "var(--font-base)";
const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

interface DiscountConfig {
    product_id: string;
    max_discount: number;
    min_price: number;
    requires_approval: boolean;
    notes: string;
}

const STORAGE_KEY = (companyId: string) => `margens_desconto_${companyId}`;

function loadDiscounts(companyId: string): Record<string, DiscountConfig> {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY(companyId)) || "{}"); } catch { return {}; }
}
function saveDiscounts(companyId: string, data: Record<string, DiscountConfig>) {
    localStorage.setItem(STORAGE_KEY(companyId), JSON.stringify(data));
}

export default function MargensDesconto() {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const { toast } = useToast();

    const [searchTerm, setSearchTerm] = useState("");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editProduct, setEditProduct] = useState<any>(null);
    const [maxDiscount, setMaxDiscount] = useState("");
    const [minPrice, setMinPrice] = useState("");
    const [requiresApproval, setRequiresApproval] = useState(false);
    const [notes, setNotes] = useState("");

    // ─── Padrão de planilha: colunas ajustáveis + ocultáveis ─────
    const COL_ORDER = ['produto', 'preco', 'desc', 'precomin', 'margem', 'aprovacao', 'acoes'];
    const COL_LABELS: Record<string, string> = {
        produto: 'Produto/Serviço', preco: 'Preço Cheio', desc: 'Desc. Máx.',
        precomin: 'Preço Mínimo', margem: 'Margem Mín.', aprovacao: 'Aprovação', acoes: 'Ações',
    };
    const COL_WIDTHS_DEFAULT: Record<string, number> = {
        produto: 280, preco: 130, desc: 110, precomin: 140, margem: 120, aprovacao: 110, acoes: 70,
    };
    const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
        try {
            const s = localStorage.getItem('margensdesconto_col_widths');
            if (s) return { ...COL_WIDTHS_DEFAULT, ...JSON.parse(s) };
        } catch { /* ignore */ }
        return COL_WIDTHS_DEFAULT;
    });
    useEffect(() => { localStorage.setItem('margensdesconto_col_widths', JSON.stringify(colWidths)); }, [colWidths]);
    const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => {
        try {
            const s = localStorage.getItem('margensdesconto_hidden_cols');
            if (s) return new Set(JSON.parse(s) as string[]);
        } catch { /* ignore */ }
        return new Set();
    });
    useEffect(() => { localStorage.setItem('margensdesconto_hidden_cols', JSON.stringify([...hiddenCols])); }, [hiddenCols]);
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

    const { data: products = [] } = useQuery({
        queryKey: ["desc_products", selectedCompany?.id],
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

    const discounts = useMemo(() => {
        if (!selectedCompany?.id) return {};
        return loadDiscounts(selectedCompany.id);
    }, [selectedCompany?.id, dialogOpen]);

    const rows = useMemo(() => {
        return products.map((p: any) => {
            const config = discounts[p.id];
            const price = Number(p.price || 0);
            const cost = Number(p.cost_price || 0);
            const maxDesc = config?.max_discount || 0;
            const precoMinimo = config?.min_price || (price - price * maxDesc / 100);
            const margemMinima = price > 0 && cost > 0 ? ((precoMinimo - cost) / precoMinimo) * 100 : 0;
            return {
                ...p,
                max_discount: maxDesc,
                min_price: precoMinimo,
                requires_approval: config?.requires_approval || false,
                notes: config?.notes || "",
                configured: !!config,
                margem_minima: margemMinima,
            };
        });
    }, [products, discounts]);

    const filtered = useMemo(() => {
        if (!searchTerm.trim()) return rows;
        const needle = searchTerm.toLowerCase();
        return rows.filter((r: any) => r.description.toLowerCase().includes(needle));
    }, [rows, searchTerm]);

    const handleEdit = (product: any) => {
        setEditProduct(product);
        setMaxDiscount(String(product.max_discount || ""));
        setMinPrice(String(product.min_price || ""));
        setRequiresApproval(product.requires_approval);
        setNotes(product.notes || "");
        setDialogOpen(true);
    };

    const handleSave = () => {
        if (!selectedCompany?.id || !editProduct) return;
        const current = loadDiscounts(selectedCompany.id);
        current[editProduct.id] = {
            product_id: editProduct.id,
            max_discount: parseFloat(maxDiscount) || 0,
            min_price: parseFloat(minPrice.replace(",", ".")) || 0,
            requires_approval: requiresApproval,
            notes,
        };
        saveDiscounts(selectedCompany.id, current);
        toast({ title: "Desconto configurado" });
        setDialogOpen(false);
    };

    const handleDiscountChange = (val: string) => {
        setMaxDiscount(val);
        if (editProduct) {
            const price = Number(editProduct.price || 0);
            const disc = parseFloat(val) || 0;
            setMinPrice((price - price * disc / 100).toFixed(2));
        }
    };

    const configuredCount = rows.filter((r: any) => r.configured).length;

    return (
        <AppLayout title="Margens de Desconto">
            <div style={{ fontFamily: FONT }} className="animate-fade-in">

                <PagePanel title="Margens de Desconto" subtitle={`${configuredCount} de ${products.length} produtos configurados`}>

                <div className="bg-white border border-[#EAECF0] rounded-xl overflow-hidden min-w-0" style={{ boxShadow: '0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)' }}>
                    {/* Cabecalho do container — titulo */}
                    <div className="px-5 py-4 flex items-baseline justify-between flex-shrink-0" style={{ backgroundColor: '#071D41' }}>
                        <h3 className="font-extrabold text-white m-0" style={{ fontSize: 22, letterSpacing: '-0.015em', lineHeight: 1.15 }}>
                            Margens de Desconto
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

                    <div className="bg-white overflow-x-auto">
                        {filtered.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground text-sm">Nenhum produto encontrado.</div>
                        ) : (
                            <table className="text-sm" style={{ tableLayout: 'fixed', width: visibleCols.reduce((a, k) => a + (colWidths[k] ?? COL_WIDTHS_DEFAULT[k]), 0), minWidth: '100%' }}>
                                <colgroup>
                                    {COL_ORDER.map(k => (
                                        <col key={k} className={isColVisible(k) ? '' : 'hidden'} style={{ width: colWidths[k] ?? COL_WIDTHS_DEFAULT[k] }} />
                                    ))}
                                </colgroup>
                                <thead>
                                    <tr className="bg-white text-[15px] font-bold text-black uppercase tracking-wider border-b-2 border-[#D0D5DD] whitespace-nowrap">
                                        <th className={`text-left px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('produto') ? '' : 'hidden'}`}>
                                            <span onMouseDown={startResize('produto')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                            Produto/Serviço
                                        </th>
                                        <th className={`text-right px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('preco') ? '' : 'hidden'}`}>
                                            <span onMouseDown={startResize('preco')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                            Preço Cheio
                                        </th>
                                        <th className={`text-center px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('desc') ? '' : 'hidden'}`}>
                                            <span onMouseDown={startResize('desc')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                            Desc. Máx.
                                        </th>
                                        <th className={`text-right px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('precomin') ? '' : 'hidden'}`}>
                                            <span onMouseDown={startResize('precomin')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                            Preço Mínimo
                                        </th>
                                        <th className={`text-right px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('margem') ? '' : 'hidden'}`}>
                                            <span onMouseDown={startResize('margem')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                            Margem Mín.
                                        </th>
                                        <th className={`text-center px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('aprovacao') ? '' : 'hidden'}`}>
                                            <span onMouseDown={startResize('aprovacao')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                                            Aprovação
                                        </th>
                                        <th className={`text-center px-3 py-3 relative ${isColVisible('acoes') ? '' : 'hidden'}`}>Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((r: any) => (
                                        <tr key={r.id} className="border-b border-[#F1F3F5] hover:bg-[#F9FAFB]">
                                            <td className={`px-3 py-1 font-medium text-[#1D2939] truncate border-r border-[#F1F3F5] ${isColVisible('produto') ? '' : 'hidden'}`}
                                                title={`${r.code ? `${r.code} - ` : ""}${r.description}`}>
                                                {r.code ? `${r.code} - ` : ""}{r.description}
                                                {!r.configured && <span style={{ fontSize: 10, color: T.text3, marginLeft: 6 }}>Não configurado</span>}
                                            </td>
                                            <td className={`px-3 py-1 text-right text-[#1D2939] truncate border-r border-[#F1F3F5] ${isColVisible('preco') ? '' : 'hidden'}`}>{fmt(Number(r.price))}</td>
                                            <td className={`px-3 py-1 text-center border-r border-[#F1F3F5] ${isColVisible('desc') ? '' : 'hidden'}`}>
                                                {r.configured ? (
                                                    <Badge className={r.max_discount > 20 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}>
                                                        {r.max_discount}%
                                                    </Badge>
                                                ) : "—"}
                                            </td>
                                            <td className={`px-3 py-1 text-right font-semibold truncate border-r border-[#F1F3F5] ${isColVisible('precomin') ? '' : 'hidden'}`} style={{ color: T.primary }}>
                                                {r.configured ? fmt(r.min_price) : "—"}
                                            </td>
                                            <td className={`px-3 py-1 text-right truncate border-r border-[#F1F3F5] ${isColVisible('margem') ? '' : 'hidden'}`} style={{ color: r.margem_minima >= 20 ? T.green : T.red }}>
                                                {r.configured ? `${r.margem_minima.toFixed(1)}%` : "—"}
                                            </td>
                                            <td className={`px-3 py-1 text-center border-r border-[#F1F3F5] ${isColVisible('aprovacao') ? '' : 'hidden'}`}>
                                                {r.requires_approval ? <Badge className="bg-red-100 text-red-700">Sim</Badge> : "—"}
                                            </td>
                                            <td className={`px-3 py-1 text-center ${isColVisible('acoes') ? '' : 'hidden'}`}>
                                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(r)}>
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>Configurar Desconto</DialogTitle>
                        </DialogHeader>
                        {editProduct && (
                            <div className="space-y-4 py-2">
                                <div style={{ padding: "12px 16px", background: T.primaryLt, borderRadius: 10 }}>
                                    <p style={{ fontSize: 14, fontWeight: 700 }}>{editProduct.description}</p>
                                    <p style={{ fontSize: 13, color: T.primary, fontWeight: 600 }}>Preço: {fmt(Number(editProduct.price))}</p>
                                </div>
                                <div className="space-y-2">
                                    <Label>Desconto Máximo Permitido (%)</Label>
                                    <Input type="number" value={maxDiscount} onChange={e => handleDiscountChange(e.target.value)}
                                        min="0" max="100" placeholder="Ex: 15" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Preço Mínimo (R$)</Label>
                                    <Input value={minPrice} onChange={e => setMinPrice(e.target.value)}
                                        placeholder="0,00" className="font-semibold" />
                                </div>
                                <div className="flex items-center gap-3">
                                    <input type="checkbox" id="approval" checked={requiresApproval}
                                        onChange={e => setRequiresApproval(e.target.checked)}
                                        className="h-4 w-4 rounded border-gray-300" />
                                    <Label htmlFor="approval" className="cursor-pointer">Requer aprovação do gestor</Label>
                                </div>
                                <div className="space-y-2">
                                    <Label>Observações</Label>
                                    <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opcional" />
                                </div>
                                <Button className="w-full" onClick={handleSave} style={{ gap: 6 }}>
                                    <Save size={16} /> Salvar Configuração
                                </Button>
                            </div>
                        )}
                    </DialogContent>
                </Dialog>
                </PagePanel>
            </div>
        </AppLayout>
    );
}
