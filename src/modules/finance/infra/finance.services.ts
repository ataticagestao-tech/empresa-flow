
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
        const [categoriesRaw, bankAccounts, projects, departments] = await Promise.all([
            this.supabase
                .from("chart_of_accounts")
                .select("*")
                .eq("company_id", companyId)
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

        // Filtrar analíticas no JS (compatível com is_analytic e is_analytical)
        const categories = (categoriesRaw.data || []).filter(
            (c: any) => c.is_analytic === true || c.is_analytical === true
        );

        return {
            categories,
            bankAccounts: bankAccounts.data || [],
            projects: projects.data || [],
            departments: departments.data || []
        };
    }

    /**
     * Salva ou atualiza um Contas a Receber.
     */
    async saveReceivable(data: AccountsReceivable) {
        // Remove campos undefined/opcionais vazios para evitar erro no Supabase
        const payload = {
            ...data,
            // Garantir datas no formato correto se necessário, embora o driver JS geralmente cuide disso
        };

        if (data.id) {
            return this.supabase
                .from("contas_receber")
                .update(payload)
                .eq("id", data.id)
                .select()
                .single();
        } else {
            return this.supabase
                .from("contas_receber")
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
            .from("movimentacoes")
            .insert({
                company_id: companyId,
                conta_bancaria_id: data.bank_account_id,
                conta_contabil_id: data.category_id || null,
                conta_receber_id: receivableId,
                tipo: "credito",
                valor: data.amount,
                data: data.receive_date || new Date(),
                descricao: `Recebimento: ${data.description}`,
                origem: "conta_receber",
            });
    }

    /**
     * Salva ou atualiza um Contas a Pagar.
     */
    async savePayable(data: AccountsPayable) {
        const payload = { ...data };

        if (data.id) {
            return this.supabase
                .from("contas_pagar")
                .update(payload)
                .eq("id", data.id)
                .select()
                .single();
        } else {
            return this.supabase
                .from("contas_pagar")
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
            .from("movimentacoes")
            .insert({
                company_id: companyId,
                conta_bancaria_id: data.bank_account_id,
                conta_contabil_id: data.category_id || null,
                conta_pagar_id: payableId,
                tipo: "debito",
                valor: data.amount,
                data: data.payment_date || data.due_date || new Date(),
                descricao: `Pagamento: ${data.description}`,
                origem: "conta_pagar",
            });
    }
}
