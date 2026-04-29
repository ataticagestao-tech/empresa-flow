import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
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
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { TableProperties, Plus, Trash2, Search, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

    return (
        <AppLayout title="Tabela de Preços">
            <div style={{ fontFamily: FONT, display: "flex", flexDirection: "column", gap: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ background: T.primaryLt, borderRadius: 12, padding: 10 }}>
                            <TableProperties size={22} color={T.primary} />
                        </div>
                        <div>
                            <h2 style={{ fontSize: 20, fontWeight: 700 }}>Tabela de Preços</h2>
                            <p style={{ fontSize: 12, color: T.text3 }}>{lists.length} tabela{lists.length !== 1 ? "s" : ""} cadastrada{lists.length !== 1 ? "s" : ""}</p>
                        </div>
                    </div>
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
                <Card style={{ borderRadius: 14, border: `1px solid ${T.border}`, overflow: "hidden" }}>
                    <div style={{ padding: "12px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ position: "relative", maxWidth: 300 }}>
                            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.text3 }} />
                            <Input placeholder="Buscar produto..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                                className="h-9 pl-8 text-sm" />
                        </div>
                        {viewList && <Badge className="bg-blue-100 text-blue-700">Comparando: {viewList.name}</Badge>}
                    </div>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Produto</TableHead>
                                <TableHead className="text-right">Preço Padrão</TableHead>
                                {viewList && <TableHead className="text-right">{viewList.name}</TableHead>}
                                {viewList && <TableHead className="text-right">Diferença</TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredProducts.length === 0 ? (
                                <TableRow><TableCell colSpan={viewList ? 4 : 2} className="text-center py-8 text-muted-foreground">Nenhum produto encontrado.</TableCell></TableRow>
                            ) : filteredProducts.map((p: any) => {
                                const stdPrice = Number(p.price || 0);
                                const listPrice = viewList ? (viewList.prices[p.id] ?? stdPrice) : null;
                                const diff = listPrice !== null ? listPrice - stdPrice : 0;
                                return (
                                    <TableRow key={p.id}>
                                        <TableCell className="font-medium">{p.code ? `${p.code} - ` : ""}{p.description}</TableCell>
                                        <TableCell className="text-right">{fmt(stdPrice)}</TableCell>
                                        {viewList && (
                                            <TableCell className="text-right font-semibold" style={{ color: T.primary }}>
                                                {fmt(listPrice!)}
                                            </TableCell>
                                        )}
                                        {viewList && (
                                            <TableCell className="text-right" style={{ color: diff < 0 ? T.red : diff > 0 ? T.green : T.text3 }}>
                                                {diff !== 0 ? `${diff > 0 ? "+" : ""}${fmt(diff)}` : "—"}
                                            </TableCell>
                                        )}
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </Card>

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
            </div>
        </AppLayout>
    );
}
