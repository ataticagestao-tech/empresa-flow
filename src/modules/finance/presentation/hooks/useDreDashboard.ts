import { useQuery } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import type { DashboardDateRange } from "./useFinanceDashboard";

export interface DreAccount {
    id: string;
    code: string;
    name: string;
    level: number;
    account_type: string;
    account_nature: string;
    is_analytical: boolean;
    dre_group: string;
    dre_order: number;
    total: number;
}

export interface DreGroup {
    name: string;
    order: number;
    total: number;
    accounts: DreAccount[];
}

export function useDreDashboard(dateRange?: DashboardDateRange) {
    const { selectedCompany } = useCompany();
    const { activeClient } = useAuth();
    const db = activeClient as any;

    const rangeStart = dateRange?.from ?? new Date();
    const rangeEnd = dateRange?.to ?? new Date();
    const rangeKey = `${format(rangeStart, "yyyy-MM-dd")}_${format(rangeEnd, "yyyy-MM-dd")}`;

    const { data: dreDetailed } = useQuery({
        queryKey: ["dashboard_dre_detailed", selectedCompany?.id, rangeKey],
        queryFn: async (): Promise<{ groups: DreGroup[]; grandTotal: number }> => {
            if (!selectedCompany?.id) return { groups: [], grandTotal: 0 };

            // 1. Fetch all transactions with category details
            const { data: transactions, error: txErr } = await db
                .from("transactions")
                .select(`
                    amount,
                    type,
                    category_id,
                    category:chart_of_accounts (
                        id,
                        code,
                        name,
                        level,
                        account_type,
                        account_nature,
                        is_analytical,
                        dre_group,
                        dre_order
                    )
                `)
                .eq("company_id", selectedCompany.id)
                .gte("date", rangeStart.toISOString())
                .lte("date", rangeEnd.toISOString());

            if (txErr) throw txErr;

            // 2. Aggregate by individual account
            const accountMap: Record<string, DreAccount> = {};

            (transactions || []).forEach((t: any) => {
                const cat = t.category;
                if (!cat) return;
                const key = cat.id;
                if (!accountMap[key]) {
                    accountMap[key] = {
                        id: cat.id,
                        code: cat.code,
                        name: cat.name,
                        level: cat.level || 3,
                        account_type: cat.account_type,
                        account_nature: cat.account_nature,
                        is_analytical: cat.is_analytical ?? true,
                        dre_group: cat.dre_group || "Outros",
                        dre_order: cat.dre_order || 99,
                        total: 0,
                    };
                }
                // credit adds, debit subtracts (for DRE perspective)
                if (t.type === "credit") {
                    accountMap[key].total += Number(t.amount) || 0;
                } else {
                    accountMap[key].total -= Number(t.amount) || 0;
                }
            });

            // 3. Group accounts by dre_group
            const groupMap: Record<string, DreGroup> = {};
            Object.values(accountMap).forEach((acc) => {
                if (!groupMap[acc.dre_group]) {
                    groupMap[acc.dre_group] = {
                        name: acc.dre_group,
                        order: acc.dre_order,
                        total: 0,
                        accounts: [],
                    };
                }
                groupMap[acc.dre_group].accounts.push(acc);
                groupMap[acc.dre_group].total += acc.total;
            });

            // Sort groups by order, accounts by code within each group
            const groups = Object.values(groupMap)
                .sort((a, b) => a.order - b.order)
                .map((g) => ({
                    ...g,
                    accounts: g.accounts.sort((a, b) => a.code.localeCompare(b.code)),
                }));

            const grandTotal = groups.reduce((s, g) => s + g.total, 0);

            return { groups, grandTotal };
        },
        enabled: !!selectedCompany?.id,
    });

    return {
        groups: dreDetailed?.groups || [],
        grandTotal: dreDetailed?.grandTotal || 0,
    };
}
