
import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Plus, Wallet, ArrowRight, MoreVertical, Pencil, Trash2, Landmark, Check, ChevronsUpDown, Ban, CheckCircle2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { BANKS } from "@/lib/banks";
import { getBankColor, getBankInitials } from "@/lib/bankLogos";
import { useNavigate } from "react-router-dom";
import { useBankAccounts } from "@/modules/finance/presentation/hooks/useBankAccounts";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const emptyAccount = {
    name: "", banco: "", initial_balance: 0, agencia: "", conta: "", digito: "",
    type: "checking", chave_pix: "", data_saldo_inicial: "", ofx_ativo: false, status: "ativa"
};

function parseBankCode(banco: string): { code: string; name: string } | null {
    if (!banco) return null;
    const match = banco.match(/^(\d+)\s*-\s*(.+)$/);
    if (match) return { code: match[1], name: match[2].trim() };
    const found = BANKS.find(b => banco.includes(b.name));
    if (found) return { code: found.code, name: found.name };
    return null;
}

function BankAvatar({ banco, size = 36 }: { banco: string; size?: number }) {
    const parsed = parseBankCode(banco);
    const code = parsed?.code || "0";
    const name = parsed?.name || banco || "?";
    const color = getBankColor(code);
    const initials = getBankInitials(code, name);
    const fontSize = size <= 28 ? 9 : size <= 36 ? 11 : 13;

    return (
        <div style={{
            width: size, height: size, borderRadius: "50%",
            background: color, display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 800, fontSize, letterSpacing: -0.5,
            flexShrink: 0, boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
        }}>
            {initials}
        </div>
    );
}

function BankCombobox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="space-y-2">
            <Label>Instituição Financeira</Label>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className={cn("w-full justify-between font-normal", !value && "text-muted-foreground")}>
                        <span className="flex items-center gap-2 truncate">
                            {value && <BankAvatar banco={value} size={22} />}
                            {value || "Selecione o banco..."}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                    <Command>
                        <CommandInput placeholder="Buscar banco..." />
                        <CommandList className="max-h-[250px]">
                            <CommandEmpty>Nenhum banco encontrado.</CommandEmpty>
                            <CommandGroup>
                                {BANKS.map((bank) => (
                                    <CommandItem
                                        key={bank.code}
                                        value={`${bank.code} ${bank.name}`}
                                        onSelect={() => { onChange(`${bank.code} - ${bank.name}`); setOpen(false); }}
                                    >
                                        <Check className={cn("mr-2 h-4 w-4", value === `${bank.code} - ${bank.name}` ? "opacity-100" : "opacity-0")} />
                                        <BankAvatar banco={`${bank.code} - ${bank.name}`} size={24} />
                                        <span className="ml-2">{bank.code} - {bank.name}</span>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
        </div>
    );
}

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
            digito: account.digito || "",
            type: account.type || "checking",
            chave_pix: account.chave_pix || account.pix_key || "",
            data_saldo_inicial: account.data_saldo_inicial || "",
            ofx_ativo: account.ofx_ativo || false,
            status: account.status || "ativa",
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
                                <Label>Tipo</Label>
                                <Select value={formData.type} onValueChange={v => setFormData({ ...formData, type: v })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="checking">Conta Corrente</SelectItem>
                                        <SelectItem value="savings">Conta Poupança</SelectItem>
                                        <SelectItem value="investment">Investimento</SelectItem>
                                        <SelectItem value="cash">Caixa Físico</SelectItem>
                                        <SelectItem value="credit_card">Cartão de Crédito</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <BankCombobox value={formData.banco} onChange={v => setFormData({ ...formData, banco: v })} />
                            <div className="grid grid-cols-3 gap-4">
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
                                <div className="space-y-2">
                                    <Label>Dígito</Label>
                                    <Input
                                        placeholder="0"
                                        value={formData.digito}
                                        onChange={e => setFormData({ ...formData, digito: e.target.value })}
                                        className="w-full"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Chave PIX</Label>
                                <Input
                                    placeholder="CPF, email, telefone ou chave aleatória"
                                    value={formData.chave_pix}
                                    onChange={e => setFormData({ ...formData, chave_pix: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Saldo Inicial (R$)</Label>
                                    <Input
                                        type="number"
                                        placeholder="0.00"
                                        value={formData.initial_balance}
                                        onChange={e => setFormData({ ...formData, initial_balance: Number(e.target.value) })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Data do Saldo Inicial</Label>
                                    <Input
                                        type="date"
                                        value={formData.data_saldo_inicial}
                                        onChange={e => setFormData({ ...formData, data_saldo_inicial: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Status</Label>
                                    <Select value={formData.status} onValueChange={v => setFormData({ ...formData, status: v })}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="ativa">Ativa</SelectItem>
                                            <SelectItem value="encerrada">Encerrada</SelectItem>
                                            <SelectItem value="bloqueada">Bloqueada</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Importação OFX</Label>
                                    <div className="flex items-center gap-2 h-10">
                                        <Switch
                                            checked={formData.ofx_ativo}
                                            onCheckedChange={v => setFormData({ ...formData, ofx_ativo: v })}
                                        />
                                        <span className="text-sm text-muted-foreground">
                                            {formData.ofx_ativo ? "Habilitado" : "Desabilitado"}
                                        </span>
                                    </div>
                                </div>
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
                                        <CardTitle className="flex items-center gap-3 text-lg font-bold text-foreground">
                                            <BankAvatar banco={account.banco} size={36} />
                                            {account.name}
                                        </CardTitle>
                                        <CardDescription className="font-medium text-muted-foreground">
                                            {account.banco} • Ag: {account.agencia || '-'} CC: {account.conta || '-'}
                                            {account.chave_pix && <span className="block text-xs mt-0.5">PIX: {account.chave_pix}</span>}
                                        </CardDescription>
                                        {account.status && account.status !== 'ativa' && (
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${account.status === 'encerrada' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                <Ban className="h-3 w-3" />
                                                {account.status === 'encerrada' ? 'Encerrada' : 'Bloqueada'}
                                            </span>
                                        )}
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
