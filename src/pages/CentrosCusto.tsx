import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Search, MoreVertical, Pencil, Trash2, GitBranch } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface CentroCusto {
    id: string;
    company_id: string;
    codigo: string;
    descricao: string;
    pai_id: string | null;
    ativo: boolean;
    created_at: string;
}

const emptyForm = { codigo: "", descricao: "", pai_id: "", ativo: true };

export default function CentrosCusto() {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const queryClient = useQueryClient();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editing, setEditing] = useState<CentroCusto | null>(null);
    const [formData, setFormData] = useState(emptyForm);
    const [search, setSearch] = useState("");

    const { data: centros = [], isLoading } = useQuery({
        queryKey: ["centros_custo", selectedCompany?.id],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data, error } = await (activeClient as any)
                .from("centros_custo")
                .select("*")
                .eq("company_id", selectedCompany.id)
                .order("codigo");
            if (error) throw error;
            return data as CentroCusto[];
        },
        enabled: !!selectedCompany?.id,
    });

    // Build hierarchy: find children for each parent
    const getParentName = (paiId: string | null) => {
        if (!paiId) return null;
        const parent = centros.find(c => c.id === paiId);
        return parent ? `${parent.codigo} - ${parent.descricao}` : null;
    };

    // Sort items: parents first, then children indented
    const buildTree = (items: CentroCusto[]): (CentroCusto & { level: number })[] => {
        const result: (CentroCusto & { level: number })[] = [];
        const addChildren = (parentId: string | null, level: number) => {
            items
                .filter(i => i.pai_id === parentId)
                .forEach(item => {
                    result.push({ ...item, level });
                    addChildren(item.id, level + 1);
                });
        };
        addChildren(null, 0);
        // Add any orphans not in tree
        items.forEach(item => {
            if (!result.find(r => r.id === item.id)) {
                result.push({ ...item, level: 0 });
            }
        });
        return result;
    };

    const treeItems = buildTree(centros);
    const filtered = treeItems.filter(c =>
        c.codigo.toLowerCase().includes(search.toLowerCase()) ||
        c.descricao.toLowerCase().includes(search.toLowerCase())
    );

    const handleOpenNew = () => {
        setEditing(null);
        setFormData(emptyForm);
        setIsDialogOpen(true);
    };

    const handleEdit = (cc: CentroCusto) => {
        setEditing(cc);
        setFormData({
            codigo: cc.codigo || "",
            descricao: cc.descricao || "",
            pai_id: cc.pai_id || "",
            ativo: cc.ativo,
        });
        setIsDialogOpen(true);
    };

    const handleSave = async () => {
        if (!selectedCompany?.id || !formData.codigo.trim() || !formData.descricao.trim()) {
            toast.error("Código e Descrição são obrigatórios");
            return;
        }
        try {
            const payload = {
                company_id: selectedCompany.id,
                codigo: formData.codigo.trim(),
                descricao: formData.descricao.trim(),
                pai_id: formData.pai_id || null,
                ativo: formData.ativo,
            };

            if (editing?.id) {
                const { error } = await (activeClient as any)
                    .from("centros_custo").update(payload).eq("id", editing.id);
                if (error) throw error;
                toast.success("Centro de custo atualizado");
            } else {
                const { error } = await (activeClient as any)
                    .from("centros_custo").insert(payload);
                if (error) throw error;
                toast.success("Centro de custo cadastrado");
            }

            queryClient.invalidateQueries({ queryKey: ["centros_custo"] });
            setIsDialogOpen(false);
            setEditing(null);
            setFormData(emptyForm);
        } catch (err: any) {
            toast.error("Erro ao salvar: " + (err.message || "Erro desconhecido"));
        }
    };

    const handleDelete = async (cc: CentroCusto) => {
        const hasChildren = centros.some(c => c.pai_id === cc.id);
        if (hasChildren) {
            toast.error("Não é possível excluir: este centro possui sub-centros vinculados.");
            return;
        }
        if (!window.confirm(`Excluir "${cc.codigo} - ${cc.descricao}"?`)) return;
        try {
            const { error } = await (activeClient as any)
                .from("centros_custo").delete().eq("id", cc.id);
            if (error) throw error;
            toast.success("Centro de custo excluído");
            queryClient.invalidateQueries({ queryKey: ["centros_custo"] });
        } catch (err: any) {
            toast.error("Erro ao excluir: " + err.message);
        }
    };

    // Filter parent options: exclude self and descendants when editing
    const getParentOptions = () => {
        if (!editing) return centros.filter(c => c.ativo);
        const descendants = new Set<string>();
        const addDesc = (id: string) => {
            centros.filter(c => c.pai_id === id).forEach(c => {
                descendants.add(c.id);
                addDesc(c.id);
            });
        };
        addDesc(editing.id);
        return centros.filter(c => c.id !== editing.id && !descendants.has(c.id) && c.ativo);
    };

    return (
        <AppLayout title="Centros de Custo">
            <div className="space-y-6 animate-in fade-in duration-500">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h2 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
                            <GitBranch className="h-8 w-8 text-blue-600" />
                            Centros de Custo
                        </h2>
                        <p className="text-muted-foreground">{centros.length} centro(s) cadastrado(s)</p>
                    </div>
                    <div className="flex gap-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="pl-9 w-[200px]"
                            />
                        </div>
                        <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleOpenNew}>
                            <Plus className="mr-2 h-4 w-4" /> Novo Centro
                        </Button>
                    </div>
                </div>

                <Card className="overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Código</TableHead>
                                <TableHead>Descrição</TableHead>
                                <TableHead>Centro Pai</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                        Carregando...
                                    </TableCell>
                                </TableRow>
                            ) : filtered.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                        {search ? "Nenhum centro encontrado." : "Nenhum centro de custo cadastrado."}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filtered.map(cc => (
                                    <TableRow key={cc.id} className={!cc.ativo ? "opacity-50" : ""}>
                                        <TableCell className="font-mono font-medium">
                                            <span style={{ paddingLeft: cc.level * 20 }}>
                                                {cc.level > 0 && <span className="text-muted-foreground mr-1">└</span>}
                                                {cc.codigo}
                                            </span>
                                        </TableCell>
                                        <TableCell>{cc.descricao}</TableCell>
                                        <TableCell className="text-muted-foreground text-sm">
                                            {getParentName(cc.pai_id) || "—"}
                                        </TableCell>
                                        <TableCell>
                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                                                cc.ativo ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                                            }`}>
                                                {cc.ativo ? "Ativo" : "Inativo"}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                                        <MoreVertical className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => handleEdit(cc)}>
                                                        <Pencil className="mr-2 h-4 w-4" /> Editar
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem className="text-red-600" onClick={() => handleDelete(cc)}>
                                                        <Trash2 className="mr-2 h-4 w-4" /> Excluir
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </Card>

                <Dialog open={isDialogOpen} onOpenChange={(open) => {
                    setIsDialogOpen(open);
                    if (!open) { setEditing(null); setFormData(emptyForm); }
                }}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>{editing ? "Editar Centro de Custo" : "Novo Centro de Custo"}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-2">
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label>Código *</Label>
                                    <Input
                                        value={formData.codigo}
                                        onChange={e => setFormData({ ...formData, codigo: e.target.value })}
                                        placeholder="001"
                                    />
                                </div>
                                <div className="space-y-2 col-span-2">
                                    <Label>Descrição *</Label>
                                    <Input
                                        value={formData.descricao}
                                        onChange={e => setFormData({ ...formData, descricao: e.target.value })}
                                        placeholder="Ex: Administrativo"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Centro Pai (opcional)</Label>
                                <Select value={formData.pai_id} onValueChange={v => setFormData({ ...formData, pai_id: v === "none" ? "" : v })}>
                                    <SelectTrigger><SelectValue placeholder="Nenhum (raiz)" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Nenhum (raiz)</SelectItem>
                                        {getParentOptions().map(c => (
                                            <SelectItem key={c.id} value={c.id}>
                                                {c.codigo} - {c.descricao}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex items-center gap-3">
                                <Switch
                                    checked={formData.ativo}
                                    onCheckedChange={v => setFormData({ ...formData, ativo: v })}
                                />
                                <Label>Ativo</Label>
                            </div>
                            <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={handleSave}>
                                {editing ? "Salvar Alterações" : "Cadastrar"}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
        </AppLayout>
    );
}
