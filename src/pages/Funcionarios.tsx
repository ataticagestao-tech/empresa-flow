import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Search, MoreVertical, Pencil, Trash2, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface Employee {
    id: string;
    company_id: string;
    name: string;
    role: string | null;
    department: string | null;
    email: string | null;
    phone: string | null;
    cpf: string | null;
    hire_date: string | null;
    salary: number | null;
    status: string;
    created_at: string;
}

const emptyForm = {
    name: "", role: "", department: "", email: "", phone: "", cpf: "", hire_date: "", salary: "", status: "active"
};

export default function Funcionarios() {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const queryClient = useQueryClient();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editing, setEditing] = useState<Employee | null>(null);
    const [formData, setFormData] = useState(emptyForm);
    const [search, setSearch] = useState("");

    const { data: employees = [], isLoading } = useQuery({
        queryKey: ["employees", selectedCompany?.id],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data, error } = await (activeClient as any)
                .from("employees")
                .select("*")
                .eq("company_id", selectedCompany.id)
                .order("name");
            if (error) throw error;
            return data as Employee[];
        },
        enabled: !!selectedCompany?.id,
    });

    const filtered = employees.filter(e =>
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        (e.role || "").toLowerCase().includes(search.toLowerCase()) ||
        (e.department || "").toLowerCase().includes(search.toLowerCase())
    );

    const handleOpenNew = () => {
        setEditing(null);
        setFormData(emptyForm);
        setIsDialogOpen(true);
    };

    const handleEdit = (emp: Employee) => {
        setEditing(emp);
        setFormData({
            name: emp.name || "",
            role: emp.role || "",
            department: emp.department || "",
            email: emp.email || "",
            phone: emp.phone || "",
            cpf: emp.cpf || "",
            hire_date: emp.hire_date || "",
            salary: emp.salary ? String(emp.salary) : "",
            status: emp.status || "active",
        });
        setIsDialogOpen(true);
    };

    const handleSave = async () => {
        if (!selectedCompany?.id || !formData.name.trim()) return;
        try {
            const payload = {
                company_id: selectedCompany.id,
                name: formData.name.trim(),
                role: formData.role || null,
                department: formData.department || null,
                email: formData.email || null,
                phone: formData.phone || null,
                cpf: formData.cpf || null,
                hire_date: formData.hire_date || null,
                salary: formData.salary ? parseFloat(formData.salary.replace(",", ".")) : null,
                status: formData.status,
            };

            if (editing?.id) {
                const { error } = await (activeClient as any)
                    .from("employees").update(payload).eq("id", editing.id);
                if (error) throw error;
                toast.success("Funcionário atualizado");
            } else {
                const { error } = await (activeClient as any)
                    .from("employees").insert(payload);
                if (error) throw error;
                toast.success("Funcionário cadastrado");
            }

            queryClient.invalidateQueries({ queryKey: ["employees"] });
            setIsDialogOpen(false);
            setEditing(null);
            setFormData(emptyForm);
        } catch (err: any) {
            toast.error("Erro ao salvar: " + (err.message || "Erro desconhecido"));
        }
    };

    const handleDelete = async (emp: Employee) => {
        if (!window.confirm(`Excluir "${emp.name}"?`)) return;
        try {
            const { error } = await (activeClient as any)
                .from("employees").delete().eq("id", emp.id);
            if (error) throw error;
            toast.success("Funcionário excluído");
            queryClient.invalidateQueries({ queryKey: ["employees"] });
        } catch (err: any) {
            toast.error("Erro ao excluir: " + err.message);
        }
    };

    const fmt = (v: number | null) =>
        v ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v) : "—";

    return (
        <AppLayout title="Funcionários">
            <div className="space-y-6 animate-in fade-in duration-500">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h2 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
                            <Users className="h-8 w-8 text-blue-600" />
                            Funcionários
                        </h2>
                        <p className="text-muted-foreground">{filtered.length} funcionário(s) cadastrado(s)</p>
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
                            <Plus className="mr-2 h-4 w-4" /> Novo Funcionário
                        </Button>
                    </div>
                </div>

                <Card className="overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nome</TableHead>
                                <TableHead>Cargo</TableHead>
                                <TableHead>Departamento</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Telefone</TableHead>
                                <TableHead>Salário</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                        Carregando...
                                    </TableCell>
                                </TableRow>
                            ) : filtered.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                        Nenhum funcionário cadastrado.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filtered.map(emp => (
                                    <TableRow key={emp.id}>
                                        <TableCell className="font-medium">{emp.name}</TableCell>
                                        <TableCell>{emp.role || "—"}</TableCell>
                                        <TableCell>{emp.department || "—"}</TableCell>
                                        <TableCell>{emp.email || "—"}</TableCell>
                                        <TableCell>{emp.phone || "—"}</TableCell>
                                        <TableCell>{fmt(emp.salary)}</TableCell>
                                        <TableCell>
                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                                                emp.status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                                            }`}>
                                                {emp.status === "active" ? "Ativo" : "Inativo"}
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
                                                    <DropdownMenuItem onClick={() => handleEdit(emp)}>
                                                        <Pencil className="mr-2 h-4 w-4" /> Editar
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem className="text-red-600" onClick={() => handleDelete(emp)}>
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
                    <DialogContent className="max-w-lg">
                        <DialogHeader>
                            <DialogTitle>{editing ? "Editar Funcionário" : "Novo Funcionário"}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-2">
                            <div className="space-y-2">
                                <Label>Nome Completo *</Label>
                                <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Cargo</Label>
                                    <Input value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })} placeholder="Ex: Gerente" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Departamento</Label>
                                    <Input value={formData.department} onChange={e => setFormData({ ...formData, department: e.target.value })} placeholder="Ex: Financeiro" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Email</Label>
                                    <Input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Telefone</Label>
                                    <Input value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} placeholder="(00) 00000-0000" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>CPF</Label>
                                    <Input value={formData.cpf} onChange={e => setFormData({ ...formData, cpf: e.target.value })} placeholder="000.000.000-00" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Data de Admissão</Label>
                                    <Input type="date" value={formData.hire_date} onChange={e => setFormData({ ...formData, hire_date: e.target.value })} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Salário (R$)</Label>
                                    <Input value={formData.salary} onChange={e => setFormData({ ...formData, salary: e.target.value })} placeholder="0,00" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Status</Label>
                                    <Select value={formData.status} onValueChange={v => setFormData({ ...formData, status: v })}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="active">Ativo</SelectItem>
                                            <SelectItem value="inactive">Inativo</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
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
