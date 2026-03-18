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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    rg: string | null;
    data_nascimento: string | null;
    hire_date: string | null;
    data_demissao: string | null;
    salary: number | null;
    salario_base: number | null;
    tipo_contrato: string | null;
    pis: string | null;
    ctps_numero: string | null;
    ctps_serie: string | null;
    banco_folha: string | null;
    agencia_folha: string | null;
    conta_folha: string | null;
    tipo_conta_folha: string | null;
    chave_pix_folha: string | null;
    centro_custo_id: string | null;
    status: string;
    created_at: string;
}

const emptyForm = {
    name: "", role: "", department: "", email: "", phone: "",
    cpf: "", rg: "", data_nascimento: "",
    hire_date: "", data_demissao: "", salary: "", tipo_contrato: "clt",
    pis: "", ctps_numero: "", ctps_serie: "",
    banco_folha: "", agencia_folha: "", conta_folha: "", tipo_conta_folha: "", chave_pix_folha: "",
    status: "ativo"
};

const statusLabels: Record<string, string> = {
    ativo: "Ativo", inativo: "Inativo", afastado: "Afastado", ferias: "Férias",
    active: "Ativo", inactive: "Inativo"
};

const tipoContratoLabels: Record<string, string> = {
    clt: "CLT", pj: "PJ", autonomo: "Autônomo", estagio: "Estágio", temporario: "Temporário"
};

const statusColors: Record<string, string> = {
    ativo: "bg-green-100 text-green-700",
    active: "bg-green-100 text-green-700",
    inativo: "bg-red-100 text-red-700",
    inactive: "bg-red-100 text-red-700",
    afastado: "bg-yellow-100 text-yellow-700",
    ferias: "bg-blue-100 text-blue-700",
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
        (e.department || "").toLowerCase().includes(search.toLowerCase()) ||
        (e.cpf || "").includes(search)
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
            rg: emp.rg || "",
            data_nascimento: emp.data_nascimento || "",
            hire_date: emp.hire_date || "",
            data_demissao: emp.data_demissao || "",
            salary: emp.salario_base ? String(emp.salario_base) : emp.salary ? String(emp.salary) : "",
            tipo_contrato: emp.tipo_contrato || "clt",
            pis: emp.pis || "",
            ctps_numero: emp.ctps_numero || "",
            ctps_serie: emp.ctps_serie || "",
            banco_folha: emp.banco_folha || "",
            agencia_folha: emp.agencia_folha || "",
            conta_folha: emp.conta_folha || "",
            tipo_conta_folha: emp.tipo_conta_folha || "",
            chave_pix_folha: emp.chave_pix_folha || "",
            status: emp.status || "ativo",
        });
        setIsDialogOpen(true);
    };

    const handleSave = async () => {
        if (!selectedCompany?.id || !formData.name.trim()) return;
        try {
            const salarioVal = formData.salary ? parseFloat(formData.salary.replace(",", ".")) : null;
            const payload = {
                company_id: selectedCompany.id,
                name: formData.name.trim(),
                role: formData.role || null,
                department: formData.department || null,
                email: formData.email || null,
                phone: formData.phone || null,
                cpf: formData.cpf || null,
                rg: formData.rg || null,
                data_nascimento: formData.data_nascimento || null,
                hire_date: formData.hire_date || null,
                data_demissao: formData.data_demissao || null,
                salary: salarioVal,
                salario_base: salarioVal,
                tipo_contrato: formData.tipo_contrato || null,
                pis: formData.pis || null,
                ctps_numero: formData.ctps_numero || null,
                ctps_serie: formData.ctps_serie || null,
                banco_folha: formData.banco_folha || null,
                agencia_folha: formData.agencia_folha || null,
                conta_folha: formData.conta_folha || null,
                tipo_conta_folha: formData.tipo_conta_folha || null,
                chave_pix_folha: formData.chave_pix_folha || null,
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

    const set = (field: string, value: string) => setFormData(f => ({ ...f, [field]: value }));

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
                                <TableHead>CPF</TableHead>
                                <TableHead>Contrato</TableHead>
                                <TableHead>Admissão</TableHead>
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
                                        <TableCell className="font-mono text-sm">{emp.cpf || "—"}</TableCell>
                                        <TableCell>{tipoContratoLabels[emp.tipo_contrato || ""] || emp.tipo_contrato || "—"}</TableCell>
                                        <TableCell>{emp.hire_date ? new Date(emp.hire_date + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</TableCell>
                                        <TableCell>{fmt(emp.salario_base || emp.salary)}</TableCell>
                                        <TableCell>
                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[emp.status] || "bg-gray-100 text-gray-700"}`}>
                                                {statusLabels[emp.status] || emp.status}
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
                    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>{editing ? "Editar Funcionário" : "Novo Funcionário"}</DialogTitle>
                        </DialogHeader>
                        <Tabs defaultValue="pessoal" className="mt-2">
                            <TabsList className="grid w-full grid-cols-3">
                                <TabsTrigger value="pessoal">Dados Pessoais</TabsTrigger>
                                <TabsTrigger value="profissional">Profissional</TabsTrigger>
                                <TabsTrigger value="bancario">Dados Bancários</TabsTrigger>
                            </TabsList>

                            {/* ABA 1 — Dados Pessoais */}
                            <TabsContent value="pessoal" className="space-y-4 mt-4">
                                <div className="space-y-2">
                                    <Label>Nome Completo *</Label>
                                    <Input value={formData.name} onChange={e => set("name", e.target.value)} />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>CPF</Label>
                                        <Input value={formData.cpf} onChange={e => set("cpf", e.target.value)} placeholder="000.000.000-00" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>RG</Label>
                                        <Input value={formData.rg} onChange={e => set("rg", e.target.value)} />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Data de Nascimento</Label>
                                        <Input type="date" value={formData.data_nascimento} onChange={e => set("data_nascimento", e.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Telefone</Label>
                                        <Input value={formData.phone} onChange={e => set("phone", e.target.value)} placeholder="(00) 00000-0000" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>Email</Label>
                                    <Input type="email" value={formData.email} onChange={e => set("email", e.target.value)} />
                                </div>
                            </TabsContent>

                            {/* ABA 2 — Profissional */}
                            <TabsContent value="profissional" className="space-y-4 mt-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Cargo *</Label>
                                        <Input value={formData.role} onChange={e => set("role", e.target.value)} placeholder="Ex: Analista Financeiro" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Departamento</Label>
                                        <Input value={formData.department} onChange={e => set("department", e.target.value)} placeholder="Ex: Financeiro" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Tipo de Contrato</Label>
                                        <Select value={formData.tipo_contrato} onValueChange={v => set("tipo_contrato", v)}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="clt">CLT</SelectItem>
                                                <SelectItem value="pj">PJ</SelectItem>
                                                <SelectItem value="autonomo">Autônomo</SelectItem>
                                                <SelectItem value="estagio">Estágio</SelectItem>
                                                <SelectItem value="temporario">Temporário</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Salário Base (R$)</Label>
                                        <Input value={formData.salary} onChange={e => set("salary", e.target.value)} placeholder="0,00" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Data de Admissão</Label>
                                        <Input type="date" value={formData.hire_date} onChange={e => set("hire_date", e.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Data de Demissão</Label>
                                        <Input type="date" value={formData.data_demissao} onChange={e => set("data_demissao", e.target.value)} />
                                    </div>
                                </div>
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                        <Label>PIS/PASEP</Label>
                                        <Input value={formData.pis} onChange={e => set("pis", e.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>CTPS Nº</Label>
                                        <Input value={formData.ctps_numero} onChange={e => set("ctps_numero", e.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>CTPS Série</Label>
                                        <Input value={formData.ctps_serie} onChange={e => set("ctps_serie", e.target.value)} />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>Status</Label>
                                    <Select value={formData.status} onValueChange={v => set("status", v)}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="ativo">Ativo</SelectItem>
                                            <SelectItem value="inativo">Inativo</SelectItem>
                                            <SelectItem value="afastado">Afastado</SelectItem>
                                            <SelectItem value="ferias">Férias</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </TabsContent>

                            {/* ABA 3 — Dados Bancários (Folha) */}
                            <TabsContent value="bancario" className="space-y-4 mt-4">
                                <p className="text-sm text-muted-foreground">Dados bancários para depósito de folha de pagamento.</p>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Banco</Label>
                                        <Input value={formData.banco_folha} onChange={e => set("banco_folha", e.target.value)} placeholder="Ex: Itaú" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Tipo de Conta</Label>
                                        <Select value={formData.tipo_conta_folha} onValueChange={v => set("tipo_conta_folha", v)}>
                                            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="corrente">Corrente</SelectItem>
                                                <SelectItem value="poupanca">Poupança</SelectItem>
                                                <SelectItem value="pix">PIX</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Agência</Label>
                                        <Input value={formData.agencia_folha} onChange={e => set("agencia_folha", e.target.value)} placeholder="0000" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Conta</Label>
                                        <Input value={formData.conta_folha} onChange={e => set("conta_folha", e.target.value)} placeholder="00000-0" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>Chave PIX</Label>
                                    <Input value={formData.chave_pix_folha} onChange={e => set("chave_pix_folha", e.target.value)} placeholder="CPF, email, telefone ou chave aleatória" />
                                </div>
                            </TabsContent>
                        </Tabs>

                        <Button className="w-full bg-blue-600 hover:bg-blue-700 mt-4" onClick={handleSave}>
                            {editing ? "Salvar Alterações" : "Cadastrar Funcionário"}
                        </Button>
                    </DialogContent>
                </Dialog>
            </div>
        </AppLayout>
    );
}
