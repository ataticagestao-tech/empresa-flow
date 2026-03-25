
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import type { DashboardDateRange } from "./useFinanceDashboard";

export interface BankAccount {
    id: string;
    name: string;
    banco: string;
    agencia: string;
    conta: string;
    current_balance: number;
    is_active: boolean;
}

export interface BankMovement {
    id: string;
    date: string;
    amount: number;
    description: string;
    type: "credit" | "debit";
    bank_account_id: string;
    origem: string;
}

export function useBankMovements(dateRange?: DashboardDateRange) {
    const { selectedCompany } = useCompany();
    const { activeClient } = useAuth();
    const db = activeClient as any;

    const rangeStart = dateRange?.from ?? new Date();
    const rangeEnd = dateRange?.to ?? new Date();
    const rangeKey = `${format(rangeStart, "yyyy-MM-dd")}_${format(rangeEnd, "yyyy-MM-dd")}`;

    // 1. All bank accounts for this company
    const { data: accounts } = useQuery({
        queryKey: ["bank_accounts_list", selectedCompany?.id],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data, error } = await db
                .from("bank_accounts")
                .select("id, name, banco, agencia, conta, current_balance, is_active")
                .eq("company_id", selectedCompany.id)
                .order("name");
            if (error) throw error;
            return (data || []) as BankAccount[];
        },
        enabled: !!selectedCompany?.id,
    });

    // 2. Transactions per bank account in period
    const { data: movements } = useQuery({
        queryKey: ["bank_movements", selectedCompany?.id, rangeKey],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data, error } = await db
                .from("movimentacoes")
                .select("id, data, valor, descricao, tipo, conta_bancaria_id, origem")
                .eq("company_id", selectedCompany.id)
                .not("conta_bancaria_id", "is", null)
                .gte("data", rangeStart.toISOString())
                .lte("data", rangeEnd.toISOString())
                .order("data", { ascending: false });
            if (error) throw error;
            return (data || []).map((m: any) => ({
                id: m.id,
                date: m.data,
                amount: Number(m.valor || 0),
                description: m.descricao || "",
                type: m.tipo === "credito" ? "credit" : "debit",
                bank_account_id: m.conta_bancaria_id,
                origem: m.origem || "manual",
            })) as BankMovement[];
        },
        enabled: !!selectedCompany?.id,
    });

    // 3. Aggregate: total in/out per account (excluindo transferências entre contas)
    const accountSummaries = (accounts || []).map((acc) => {
        const accMovements = (movements || []).filter((m) => m.bank_account_id === acc.id);
        const nonTransfer = accMovements.filter((m) => m.origem !== "transferencia");
        const totalIn = nonTransfer
            .filter((m) => m.type === "credit")
            .reduce((s, m) => s + (m.amount || 0), 0);
        const totalOut = nonTransfer
            .filter((m) => m.type === "debit")
            .reduce((s, m) => s + (m.amount || 0), 0);
        return {
            ...acc,
            totalIn,
            totalOut,
            net: totalIn - totalOut,
            movementCount: accMovements.length,
            movements: accMovements,
        };
    });

    // 4. Totals across all accounts (excluindo transferências)
    const totalBalance = (accounts || []).reduce((s, a) => s + (a.current_balance || 0), 0);
    const totalIn = accountSummaries.reduce((s, a) => s + a.totalIn, 0);
    const totalOut = accountSummaries.reduce((s, a) => s + a.totalOut, 0);
    const totalMovements = (movements || []).length;

    return {
        accounts: accounts || [],
        accountSummaries,
        movements: movements || [],
        totalBalance,
        totalIn,
        totalOut,
        totalMovements,
    };
}
