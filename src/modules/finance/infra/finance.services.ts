
import { SupabaseClient } from "@supabase/supabase-js";
import { AccountsReceivable } from "../domain/schemas/accounts-receivable.schema";
import { AccountsPayable } from "../domain/schemas/accounts-payable.schema";

export class FinanceService {
    constructor(private supabase: SupabaseClient) { }

    /**
     * Busca dados auxiliares para o formulário (Categorias, Bancos, Projetos, Deptos).
     * Agrupado para reduzir chamadas dispersas na UI.
     */
    async getFormDependencies(companyId: string) {
        const [categories, bankAccounts, projects, departments] = await Promise.all([
            this.supabase
                .from("chart_of_accounts")
                .select("id, name, code")
                .eq("company_id", companyId)
                .eq("is_analytic", true)
                .order("code"),

            this.supabase
                .from("bank_accounts")
                .select("id, name")
                .eq("company_id", companyId),

            this.supabase
                .from("projects")
                .select("id, name")
                .eq("company_id", companyId),

            this.supabase
                .from("departments")
                .select("id, name")
                .eq("company_id", companyId)
        ]);

        return {
            categories: categories.data || [],
            bankAccounts: bankAccounts.data || [],
            projects: projects.data || [],
            departments: departments.data || []
        };
    }

    /**
     * Salva ou atualiza um Contas a Receber.
     */
    async saveReceivable(data: AccountsReceivable) {
        const payload = {
            ...data,
        };
        // Limpar campos opcionais UUID que ficaram como "none" ou undefined
        const optionalUuidFields = ['client_id', 'category_id', 'department_id', 'project_id', 'bank_account_id'] as const;
        for (const field of optionalUuidFields) {
            if ((payload as any)[field] === 'none' || (payload as any)[field] === undefined || (payload as any)[field] === '') {
                (payload as any)[field] = null;
            }
        }

        if (data.id) {
            return this.supabase
                .from("accounts_receivable")
                .update(payload)
                .eq("id", data.id)
                .select()
                .single();
        } else {
            return this.supabase
                .from("accounts_receivable")
                .insert(payload)
                .select()
                .single();
        }
    }

    /**
     * Cria transação financeira automaticamente ao baixar um título.
     */
    async createTransactionFromReceivable(receivableId: string, data: any, companyId: string) {
        return this.supabase
            .from("transactions")
            .insert({
                company_id: companyId,
                bank_account_id: data.bank_account_id,
                category_id: data.category_id,
                type: "credit",
                amount: data.amount,
                date: data.receive_date || new Date(),
                description: `Recebimento: ${data.description}`,
                status: "completed",
                origin_id: receivableId,
                origin_type: 'receivable'
            });
    }

    /**
     * Salva ou atualiza um Contas a Pagar.
     */
    async savePayable(data: AccountsPayable) {
        const payload = { ...data };
        // Limpar campos opcionais UUID que ficaram como "none" ou undefined
        const optionalUuidFields = ['supplier_id', 'category_id', 'department_id', 'project_id', 'bank_account_id'] as const;
        for (const field of optionalUuidFields) {
            if (payload[field] === 'none' || payload[field] === undefined || payload[field] === '') {
                (payload as any)[field] = null;
            }
        }

        if (data.id) {
            return this.supabase
                .from("accounts_payable")
                .update(payload)
                .eq("id", data.id)
                .select()
                .single();
        } else {
            return this.supabase
                .from("accounts_payable")
                .insert(payload)
                .select()
                .single();
        }
    }

    /**
     * Cria transação financeira (Despesa) automaticamente ao baixar uma conta a pagar.
     */
    async createTransactionFromPayable(payableId: string, data: any, companyId: string) {
        return this.supabase
            .from("transactions")
            .insert({
                company_id: companyId,
                bank_account_id: data.bank_account_id,
                category_id: data.category_id,
                type: "debit",
                amount: data.amount,
                date: data.payment_date || data.due_date || new Date(),
                description: `Pagamento: ${data.description}`,
                status: "completed",
                origin_id: payableId,
                origin_type: 'payable'
            });
    }
}
