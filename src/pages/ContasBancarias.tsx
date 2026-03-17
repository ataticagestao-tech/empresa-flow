
import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Plus, Wallet, ArrowRight, MoreVertical, Pencil, Trash2, Landmark } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import { useBankAccounts } from "@/modules/finance/presentation/hooks/useBankAccounts";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const emptyAccount = { name: "", banco: "", initial_balance: 0, agencia: "", conta: "" };

export default function ContasBancarias() {
    const { accounts, isLoading, createAccount, updateAccount, deleteAccount } = useBankAccounts();
    const navigate = useNavigate();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingAccount, setEditingAccount] = useState<any>(null);
    const [formData, setFormData] = useState(emptyAccount);

    const handleCreate = async () => {
        await createAccount(formData);
        setIsDialogOpen(false);
        setFormData(emptyAccount);
    };

    const handleEdit = (account: any) => {
        setEditingAccount(account);
        setFormData({
            name: account.name || "",
            banco: account.banco || "",
            initial_balance: account.initial_balance || 0,
            agencia: account.agencia || "",
            conta: account.conta || "",
        });
        setIsDialogOpen(true);
    };

    const handleSave = async () => {
        if (editingAccount?.id) {
            await updateAccount(editingAccount.id, formData);
        } else {
            await createAccount(formData);
        }
        setIsDialogOpen(false);
        setEditingAccount(null);
        setFormData(emptyAccount);
    };

    const handleDelete = async (account: any) => {
        if (!window.confirm(`Excluir a conta "${account.name}"? Esta ação não pode ser desfeita.`)) return;
        await deleteAccount(account.id);
    };

    const handleOpenNew = () => {
        setEditingAccount(null);
        setFormData(emptyAccount);
        setIsDialogOpen(true);
    };

    return (
        <AppLayout title="Contas Bancárias">
            <div className="space-y-6 animate-in fade-in duration-500">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h2 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
                            <Landmark className="h-8 w-8 text-emerald-600" />
                            Contas Bancárias
                        </h2>
                        <p className="text-muted-foreground">Gerencie suas contas e saldos.</p>
                    </div>

                    <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleOpenNew}>
                        <Plus className="mr-2 h-4 w-4" /> Nova Conta
                    </Button>
                </div>

                {/* Dialog de Criar/Editar */}
                <Dialog open={isDialogOpen} onOpenChange={(open) => {
                    setIsDialogOpen(open);
                    if (!open) { setEditingAccount(null); setFormData(emptyAccount); }
                }}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{editingAccount ? "Editar Conta Bancária" : "Adicionar Conta Bancária"}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>Nome da Conta (Apelido)</Label>
                                <Input
                                    placeholder="Ex: Itaú Principal"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Instituição Financeira</Label>
                                <Input
                                    placeholder="Ex: Itaú"
                                    value={formData.banco}
                                    onChange={e => setFormData({ ...formData, banco: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Agência</Label>
                                    <Input
                                        placeholder="0000"
                                        value={formData.agencia}
                                        onChange={e => setFormData({ ...formData, agencia: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Número da Conta</Label>
                                    <Input
                                        placeholder="00000-0"
                                        value={formData.conta}
                                        onChange={e => setFormData({ ...formData, conta: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Saldo Inicial (R$)</Label>
                                <Input
                                    type="number"
                                    placeholder="0.00"
                                    value={formData.initial_balance}
                                    onChange={e => setFormData({ ...formData, initial_balance: Number(e.target.value) })}
                                />
                            </div>
                            <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={handleSave}>
                                {editingAccount ? "Salvar Alterações" : "Salvar Conta"}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {isLoading && (
                        <div className="col-span-full text-center py-12">
                            <RefreshCw className="h-8 w-8 animate-spin mx-auto text-emerald-600 mb-2" />
                            <p className="text-muted-foreground">Carregando contas...</p>
                        </div>
                    )}

                    {!isLoading && accounts.length === 0 && (
                        <div className="col-span-full text-center py-12 bg-[#F8FAFC] rounded-lg border border-dashed border-[#E2E8F0]">
                            <Wallet className="h-12 w-12 mx-auto text-slate-300 mb-4" />
                            <h3 className="text-lg font-medium text-foreground">Nenhuma conta cadastrada</h3>
                            <p className="text-muted-foreground max-w-sm mx-auto mt-2">Cadastre sua primeira conta bancária para controlar seu saldo e fazer conciliações.</p>
                            <Button variant="outline" className="mt-6 border-emerald-600 text-emerald-700 hover:bg-emerald-50" onClick={handleOpenNew}>
                                Cadastrar Agora
                            </Button>
                        </div>
                    )}

                    {accounts.map((account) => (
                        <Card key={account.id} className="hover:shadow-lg transition-all duration-300 group border-l-4 border-l-emerald-500 overflow-hidden">
                            <CardHeader className="pb-2 relative">
                                <div className="flex justify-between items-start">
                                    <div className="space-y-1">
                                        <CardTitle className="flex items-center text-lg font-bold text-foreground">
                                            <Wallet className="mr-2 h-5 w-5 text-emerald-600" />
                                            {account.name}
                                        </CardTitle>
                                        <CardDescription className="font-medium text-muted-foreground">
                                            {account.banco} • Ag: {account.agencia || '-'} CC: {account.conta || '-'}
                                        </CardDescription>
                                    </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 -mt-2 -mr-2">
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => handleEdit(account)}>
                                                <Pencil className="mr-2 h-4 w-4" /> Editar
                                            </DropdownMenuItem>
                                            <DropdownMenuItem className="text-[#EF4444]" onClick={() => handleDelete(account)}>
                                                <Trash2 className="mr-2 h-4 w-4" /> Excluir
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="mt-4">
                                    <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-1">Saldo Atual</p>
                                    <div className="flex items-baseline justify-between">
                                        <p className={`text-2xl font-bold ${account.current_balance >= 0 ? 'text-foreground' : 'text-[#EF4444]'}`}>
                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(account.current_balance || 0)}
                                        </p>
                                    </div>

                                    <div className="mt-6 pt-4 border-t border-[#F1F5F9] flex justify-end">
                                        <Button
                                            size="sm"
                                            className="bg-primary text-white hover:bg-[#1E40AF] w-full group-hover:bg-emerald-600 transition-colors"
                                            onClick={() => navigate(`/conciliacao?conta=${account.id}`)}
                                        >
                                            Conciliar Extrato <ArrowRight className="ml-2 h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </AppLayout >
    );
}

function RefreshCw({ className }: { className?: string }) {
    return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M3 21v-5h5" /></svg>;
}
