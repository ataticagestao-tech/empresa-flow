
import { useState, useEffect } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/use-toast";

export function useBankAccounts() {
    const { selectedCompany } = useCompany();
    const { activeClient } = useAuth();
    const { toast } = useToast();
    const [accounts, setAccounts] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const fetchAccounts = async () => {
        if (!selectedCompany?.id || !activeClient) return;

        setIsLoading(true);
        try {
            const { data, error } = await (activeClient as any)
                .from('bank_accounts')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .or("is_active.eq.true,is_active.is.null")
                .order('name');

            if (error) throw error;
            setAccounts(data || []);

        } catch (error: any) {
            console.error("Erro ao buscar contas bancárias:", error);
            toast({
                title: "Erro",
                description: "Não foi possível carregar as contas bancárias.",
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
        }
    };

    const createAccount = async (account: Record<string, any>) => {
        if (!selectedCompany?.id || !activeClient) {
            toast({ title: "Erro", description: "Nenhuma empresa selecionada.", variant: "destructive" });
            return;
        }

        try {
            const balance = parseFloat(account.initial_balance) || 0;
            const { error } = await (activeClient as any)
                .from('bank_accounts')
                .insert([{
                    name: account.name,
                    type: account.type || "checking",
                    banco: account.banco || null,
                    agencia: account.agencia || null,
                    conta: account.conta || null,
                    digito: account.digito || null,
                    initial_balance: balance,
                    current_balance: account.current_balance ?? balance,
                    pix_key: account.pix_key || account.chave_pix || null,
                    pix_type: account.pix_type || null,
                    chave_pix: account.chave_pix || null,
                    data_saldo_inicial: account.data_saldo_inicial || null,
                    ofx_ativo: account.ofx_ativo || false,
                    status: account.status || 'ativa',
                    company_id: selectedCompany.id,
                }]);

            if (error) throw error;

            toast({ title: "Sucesso", description: "Conta bancária criada!" });
            fetchAccounts();

        } catch (error: any) {
            toast({ title: "Erro", description: error.message, variant: "destructive" });
        }
    };

    const updateAccount = async (id: string, account: Record<string, any>) => {
        if (!activeClient) return;
        try {
            const { error } = await (activeClient as any)
                .from('bank_accounts')
                .update({
                    name: account.name,
                    type: account.type || "checking",
                    banco: account.banco || null,
                    agencia: account.agencia || null,
                    conta: account.conta || null,
                    digito: account.digito || null,
                    initial_balance: parseFloat(account.initial_balance) || 0,
                    pix_key: account.pix_key || account.chave_pix || null,
                    pix_type: account.pix_type || null,
                    chave_pix: account.chave_pix || null,
                    data_saldo_inicial: account.data_saldo_inicial || null,
                    ofx_ativo: account.ofx_ativo || false,
                    status: account.status || 'ativa',
                })
                .eq('id', id);

            if (error) throw error;
            toast({ title: "Sucesso", description: "Conta bancária atualizada!" });
            fetchAccounts();
        } catch (error: any) {
            toast({ title: "Erro", description: error.message, variant: "destructive" });
        }
    };

    const deleteAccount = async (id: string) => {
        if (!activeClient) return;
        try {
            // Tenta DELETE físico primeiro
            const { error: delError } = await (activeClient as any)
                .from('bank_accounts')
                .delete()
                .eq('id', id);

            if (!delError) {
                toast({ title: "Sucesso", description: "Conta bancária excluída!" });
                fetchAccounts();
                return;
            }

            // Fallback: soft delete se FK impedir
            const isFkError = (delError as any).code === "23503" || /foreign key|violates foreign/i.test(delError.message || "");
            if (isFkError) {
                const { error: updError } = await (activeClient as any)
                    .from('bank_accounts')
                    .update({ is_active: false, status: "inativa" })
                    .eq('id', id);
                if (updError) throw updError;
                toast({ title: "Conta inativada", description: "Marcada como inativa (tem histórico vinculado)." });
                fetchAccounts();
                return;
            }

            throw delError;
        } catch (error: any) {
            toast({ title: "Erro", description: error.message, variant: "destructive" });
        }
    };

    useEffect(() => {
        fetchAccounts();
    }, [selectedCompany?.id, activeClient]);

    return { accounts, isLoading, fetchAccounts, createAccount, updateAccount, deleteAccount };
}
