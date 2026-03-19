
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { FinanceService } from "../../infra/finance.services";
import { AccountsReceivableSchema, AccountsReceivable } from "../../domain/schemas/accounts-receivable.schema";

export function useReceivableForm(initialData?: Partial<AccountsReceivable>, onSuccess?: () => void) {
    const { toast } = useToast();
    const { selectedCompany } = useCompany();
    const { activeClient } = useAuth(); // Supabase Client
    const queryClient = useQueryClient();

    const service = new FinanceService(activeClient);

    // 1. Carregar Dependências (Categorias, Bancos, etc)
    const { data: dependencies, isLoading: isLoadingDeps } = useQuery({
        queryKey: ['finance_dependencies', selectedCompany?.id],
        queryFn: () => service.getFormDependencies(selectedCompany!.id),
        enabled: !!selectedCompany?.id,
        staleTime: 1000 * 60 * 5 // 5 minutos de cache
    });

    // 2. Configurar Formulário
    const form = useForm<AccountsReceivable>({
        resolver: zodResolver(AccountsReceivableSchema),
        defaultValues: {
            status: 'pending',
            recurrence: 'none',
            company_id: selectedCompany?.id,
            issue_date: new Date(),
            amount: 0,
            ...initialData // Merge com dados iniciais se houver
        }
    });

    // 3. Mutation para Salvar
    const saveMutation = useMutation({
        mutationFn: async (values: AccountsReceivable) => {
            const cleanId = (v: string | undefined | null) => (!v || v === "none" || v === "") ? null : v;

            // Colunas da tabela contas_receber
            const payload: Record<string, any> = {
                company_id: selectedCompany!.id,
                pagador_nome: values.description || "Cliente",
                valor: values.amount,
                status: values.status === "pending" ? "aberto" : values.status === "paid" ? "pago" : values.status === "cancelled" ? "cancelado" : values.status || "aberto",
                data_vencimento: values.due_date instanceof Date ? values.due_date.toISOString().split("T")[0] : values.due_date,
                data_pagamento: values.receive_date instanceof Date ? values.receive_date.toISOString().split("T")[0] : values.receive_date || null,
                conta_contabil_id: cleanId(values.category_id),
                forma_recebimento: (!values.payment_method || values.payment_method === "none") ? null : values.payment_method,
                observacoes: values.observations || null,
            };
            if (values.id) payload.id = values.id;

            // Salva o Recebível
            const { data: savedReceivable, error } = await service.saveReceivable(payload);

            if (error) throw new Error(error.message);

            // Se foi marcado como PAGO na criação/edição e tem conta bancária, gera transação
            if (values.status === 'paid' && values.bank_account_id) {
                await service.createTransactionFromReceivable(savedReceivable.id, values, selectedCompany!.id);
            }

            return savedReceivable;
        },
        onSuccess: () => {
            toast({ title: "Sucesso", description: "Conta a receber salva com sucesso!" });
            queryClient.invalidateQueries({ queryKey: ['contas_receber'] });
            queryClient.invalidateQueries({ queryKey: ['cash_flow'] }); // Invalida fluxo de caixa
            if (onSuccess) onSuccess();
        },
        onError: (error: Error) => {
            toast({ title: "Erro", description: error.message, variant: "destructive" });
        }
    });

    const onSubmit = (values: AccountsReceivable) => {
        saveMutation.mutate(values);
    };

    return {
        form,
        onSubmit,
        dependencies,
        isLoading: isLoadingDeps || saveMutation.isPending,
        isSubmitting: saveMutation.isPending
    };
}
