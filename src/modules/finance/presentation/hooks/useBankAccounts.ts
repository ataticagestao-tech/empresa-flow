import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BankAccount } from "../../domain/schemas/bank-reconciliation.schema";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/use-toast";

export function useBankAccounts() {
    const { session } = useAuth();
    const { toast } = useToast();
    const [accounts, setAccounts] = useState<BankAccount[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const fetchAccounts = useCallback(async () => {
        // Pega a primeira empresa do usuário (simplificação para este MVP)
        // Idealmente viria de um Contexto de Empresa Selecionada
        if (!session?.user?.id) return;

        setIsLoading(true);
        try {
            // Busca empresa do usuário
            const { data: companies } = await supabase
                .from('companies')
                .select('id')
                .eq('owner_id', session.user.id)
                .limit(1);

            if (!companies || companies.length === 0) return;

            const companyId = companies[0].id;

            const { data, error } = await supabase
                .from('bank_accounts')
                .select('*')
                .eq('company_id', companyId)
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
    }, [session?.user?.id, toast]);

    const createAccount = async (account: Omit<BankAccount, 'id' | 'company_id'>) => {
        // Novamente, busca o ID da empresa (idealmente viria de contexto)
        const { data: companies } = await supabase
            .from('companies')
            .select('id')
            .eq('owner_id', session?.user?.id)
            .limit(1);

        if (!companies?.length) {
            toast({ title: "Erro", description: "Nenhuma empresa encontrada.", variant: "destructive" });
            return;
        }

        try {
            const { error } = await supabase
                .from('bank_accounts')
                .insert([{
                    ...account,
                    company_id: companies[0].id
                }]);

            if (error) throw error;

            toast({ title: "Sucesso", description: "Conta bancária criada!" });
            void fetchAccounts();

        } catch (error: any) {
            toast({ title: "Erro", description: error.message, variant: "destructive" });
        }
    };

    useEffect(() => {
        void fetchAccounts();
    }, [fetchAccounts]);

    return { accounts, isLoading, fetchAccounts, createAccount };
}
