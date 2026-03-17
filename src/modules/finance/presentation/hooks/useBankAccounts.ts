
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
                    pix_key: account.pix_key || null,
                    pix_type: account.pix_type || null,
                    company_id: selectedCompany.id,
                }]);

            if (error) throw error;

            toast({ title: "Sucesso", description: "Conta bancária criada!" });
            fetchAccounts();

        } catch (error: any) {
            toast({ title: "Erro", description: error.message, variant: "destructive" });
        }
    };

    useEffect(() => {
        fetchAccounts();
    }, [selectedCompany?.id, activeClient]);

    return { accounts, isLoading, fetchAccounts, createAccount };
}
