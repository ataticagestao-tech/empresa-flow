import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ClipboardList, Plus, Trash2, Search, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const T = {
    primary: "#059669", primaryLt: "#ECFDF4",
    green: "#039855", greenLt: "#ECFDF3",
    red: "#D92D20",
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
            <div style={{ fontFamily: FONT, display: "flex", flexDirection: "column", gap: 20 }}>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ background: T.primaryLt, borderRadius: 12, padding: 10 }}>
                            <ClipboardList size={22} color={T.primary} />
                        </div>
                        <div>
                            <h2 style={{ fontSize: 20, fontWeight: 700 }}>Ficha Técnica</h2>
                            <p style={{ fontSize: 12, color: T.text3 }}>Composição de insumos por produto/serviço</p>
                        </div>
                    </div>
                    <Button size="sm" onClick={openNew} style={{ gap: 6 }}><Plus size={16} /> Nova Ficha</Button>
                </div>

                <Card style={{ borderRadius: 14, border: `1px solid ${T.border}`, overflow: "hidden" }}>
                    <div style={{ padding: "12px 20px", borderBottom: `1px solid ${T.border}` }}>
                        <div style={{ position: "relative", maxWidth: 300 }}>
                            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.text3 }} />
                            <Input placeholder="Buscar produto..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                                className="h-9 pl-8 text-sm" />
                        </div>
                    </div>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Produto/Serviço</TableHead>
                                <TableHead className="text-center">Insumos</TableHead>
                                <TableHead className="text-right">Custo Insumos</TableHead>
                                <TableHead className="text-right">Mão de Obra</TableHead>
                                <TableHead className="text-right">Custo Total</TableHead>
                                <TableHead className="text-center">Tempo (min)</TableHead>
                                <TableHead className="w-[80px]" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filtered.length === 0 ? (
                                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhuma ficha técnica cadastrada.</TableCell></TableRow>
                            ) : filtered.map((f, i) => {
                                const ci = f.items.reduce((s, it) => s + it.quantidade * it.custo_unitario, 0);
                                const ct = ci + f.mao_de_obra;
                                return (
                                    <TableRow key={i}>
                                        <TableCell className="font-medium">{f.product_name}</TableCell>
                                        <TableCell className="text-center">{f.items.length}</TableCell>
                                        <TableCell className="text-right">{fmt(ci)}</TableCell>
                                        <TableCell className="text-right">{fmt(f.mao_de_obra)}</TableCell>
                                        <TableCell className="text-right font-semibold" style={{ color: T.primary }}>{fmt(ct)}</TableCell>
                                        <TableCell className="text-center">{f.tempo_minutos}</TableCell>
                                        <TableCell>
                                            <div style={{ display: "flex", gap: 4 }}>
                                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(i)}>
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(i)}>
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
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
            </div>
        </AppLayout>
    );
}
