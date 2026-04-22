import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
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
import { Percent, Search, Pencil, Save } from "lucide-react";
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
            <div style={{ fontFamily: FONT, display: "flex", flexDirection: "column", gap: 20 }}>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ background: T.amberLt, borderRadius: 12, padding: 10 }}>
                            <Percent size={22} color={T.amber} />
                        </div>
                        <div>
                            <h2 style={{ fontSize: 20, fontWeight: 700 }}>Margens de Desconto</h2>
                            <p style={{ fontSize: 12, color: T.text3 }}>
                                {configuredCount} de {products.length} produtos configurados
                            </p>
                        </div>
                    </div>
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
                                <TableHead className="text-right">Preço Cheio</TableHead>
                                <TableHead className="text-center">Desc. Máx.</TableHead>
                                <TableHead className="text-right">Preço Mínimo</TableHead>
                                <TableHead className="text-right">Margem Mín.</TableHead>
                                <TableHead className="text-center">Aprovação</TableHead>
                                <TableHead className="w-[60px]" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filtered.length === 0 ? (
                                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum produto encontrado.</TableCell></TableRow>
                            ) : filtered.map((r: any) => (
                                <TableRow key={r.id}>
                                    <TableCell className="font-medium">
                                        {r.code ? `${r.code} - ` : ""}{r.description}
                                        {!r.configured && <span style={{ fontSize: 10, color: T.text3, marginLeft: 6 }}>Não configurado</span>}
                                    </TableCell>
                                    <TableCell className="text-right">{fmt(Number(r.price))}</TableCell>
                                    <TableCell className="text-center">
                                        {r.configured ? (
                                            <Badge className={r.max_discount > 20 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}>
                                                {r.max_discount}%
                                            </Badge>
                                        ) : "—"}
                                    </TableCell>
                                    <TableCell className="text-right font-semibold" style={{ color: T.primary }}>
                                        {r.configured ? fmt(r.min_price) : "—"}
                                    </TableCell>
                                    <TableCell className="text-right" style={{ color: r.margem_minima >= 20 ? T.green : T.red }}>
                                        {r.configured ? `${r.margem_minima.toFixed(1)}%` : "—"}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {r.requires_approval ? <Badge className="bg-red-100 text-red-700">Sim</Badge> : "—"}
                                    </TableCell>
                                    <TableCell>
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(r)}>
                                            <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Card>

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
            </div>
        </AppLayout>
    );
}
