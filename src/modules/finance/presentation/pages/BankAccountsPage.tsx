
import { useState } from "react";
import { useBankAccounts } from "../hooks/useBankAccounts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Plus, Wallet, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";

export default function BankAccountsPage() {
    const { accounts, isLoading, createAccount } = useBankAccounts();
    const navigate = useNavigate();
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    // Form State simples para criação
    const [newAccount, setNewAccount] = useState({
        name: "",
        bank_name: "",
        initial_balance: 0
    });

    const handleCreate = async () => {
        await createAccount(newAccount);
        setIsDialogOpen(false);
        setNewAccount({ name: "", bank_name: "", initial_balance: 0 });
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-lg font-bold tracking-tight text-foreground">Contas Bancárias</h2>
                    <p className="text-muted-foreground">Gerencie suas contas e faça conciliação bancária.</p>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-emerald-600 hover:bg-emerald-700">
                            <Plus className="mr-2 h-4 w-4" /> Nova Conta
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Adicionar Conta Bancária</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>Nome da Conta (Apelido)</Label>
                                <Input
                                    placeholder="Ex: Itaú Principal"
                                    value={newAccount.name}
                                    onChange={e => setNewAccount({ ...newAccount, name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Instituição Financeira</Label>
                                <Input
                                    placeholder="Ex: Itaú"
                                    value={newAccount.bank_name}
                                    onChange={e => setNewAccount({ ...newAccount, bank_name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Saldo Inicial (R$)</Label>
                                <Input
                                    type="number"
                                    placeholder="0.00"
                                    value={newAccount.initial_balance}
                                    onChange={e => setNewAccount({ ...newAccount, initial_balance: Number(e.target.value) })}
                                />
                            </div>
                            <Button className="w-full bg-emerald-600" onClick={handleCreate}>
                                Salvar Conta
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {isLoading && <p>Carregando contas...</p>}

                {!isLoading && accounts.length === 0 && (
                    <div className="col-span-full text-center py-12 bg-[#F8FAFC] rounded-lg border border-dashed">
                        <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                        <h3 className="text-lg font-medium text-foreground">Nenhuma conta cadastrada</h3>
                        <p className="text-muted-foreground">Cadastre uma conta bancária para começar a conciliação.</p>
                    </div>
                )}

                {accounts.map((account) => (
                    <Card key={account.id} className="hover:shadow-md transition-shadow cursor-pointer relative group overflow-hidden border-l-4 border-l-emerald-500">
                        <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button size="sm" variant="secondary" onClick={() => navigate(`/finance/reconciliation/${account.id}`)}>
                                Conciliar <ArrowRight className="ml-2 h-3 w-3" />
                            </Button>
                        </div>

                        <CardHeader className="pb-2">
                            <CardTitle className="flex items-center text-lg">
                                <Wallet className="mr-2 h-5 w-5 text-emerald-600" />
                                {account.name}
                            </CardTitle>
                            <CardDescription>{account.bank_name}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="mt-2">
                                <p className="text-sm text-muted-foreground font-medium uppercase">Saldo Atual</p>
                                <p className={`text-2xl font-bold ${account.current_balance >= 0 ? 'text-foreground' : 'text-[#EF4444]'}`}>
                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(account.current_balance)}
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
