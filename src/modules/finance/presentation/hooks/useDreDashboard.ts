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
    parent_id: string | null;
    children: DreAccount[];
}

export interface DreGroup {
    name: string;
    order: number;
    total: number;
    accounts: DreAccount[]; // top-level subcategories (level 2) with nested children
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

            // 1. Fetch ALL chart_of_accounts to build hierarchy
            const { data: allAccounts, error: accErr } = await db
                .from("chart_of_accounts")
                .select("id, code, name, level, account_type, account_nature, is_analytical, is_synthetic, dre_group, dre_order, parent_id")
                .eq("company_id", selectedCompany.id)
                .order("code");

            if (accErr) throw accErr;

            // 2. Fetch transactions in period
            const { data: transactions, error: txErr } = await db
                .from("movimentacoes")
                .select("valor, tipo, conta_contabil_id, origem")
                .eq("company_id", selectedCompany.id)
                .neq("origem", "transferencia")
                .gte("data", rangeStart.toISOString())
                .lte("data", rangeEnd.toISOString());

            if (txErr) throw txErr;

            // 3. Aggregate totals by conta_contabil_id (analytical accounts)
            const totalsMap: Record<string, number> = {};
            (transactions || []).forEach((t: any) => {
                if (!t.conta_contabil_id) return;
                if (!totalsMap[t.conta_contabil_id]) totalsMap[t.conta_contabil_id] = 0;
                if (t.tipo === "credito") {
                    totalsMap[t.conta_contabil_id] += Number(t.valor) || 0;
                } else {
                    totalsMap[t.conta_contabil_id] -= Number(t.valor) || 0;
                }
            });

            // 4. Build full account tree with totals
            const accountById: Record<string, DreAccount> = {};
            (allAccounts || []).forEach((a: any) => {
                accountById[a.id] = {
                    id: a.id,
                    code: a.code,
                    name: a.name,
                    level: a.level || 1,
                    account_type: a.account_type,
                    account_nature: a.account_nature,
                    is_analytical: a.is_analytical ?? !a.is_synthetic,
                    dre_group: a.dre_group || "Outros",
                    dre_order: a.dre_order || 99,
                    total: totalsMap[a.id] || 0,
                    parent_id: a.parent_id || null,
                    children: [],
                };
            });

            // 5. Build parent-child relationships
            Object.values(accountById).forEach((acc) => {
                if (acc.parent_id && accountById[acc.parent_id]) {
                    accountById[acc.parent_id].children.push(acc);
                }
            });

            // 6. Roll up totals from children to parents (bottom-up)
            // Sort by level descending so children are processed first
            const sorted = Object.values(accountById).sort((a, b) => b.level - a.level);
            for (const acc of sorted) {
                if (acc.parent_id && accountById[acc.parent_id]) {
                    accountById[acc.parent_id].total += acc.total;
                }
            }

            // Sort children by code
            Object.values(accountById).forEach((acc) => {
                acc.children.sort((a, b) => a.code.localeCompare(b.code));
            });

            // 7. Group top-level accounts (level 1) by dre_group
            const topLevel = Object.values(accountById).filter((a) => !a.parent_id || !accountById[a.parent_id]);

            const groupMap: Record<string, DreGroup> = {};
            topLevel.forEach((acc) => {
                const gName = acc.dre_group;
                if (!groupMap[gName]) {
                    groupMap[gName] = {
                        name: gName,
                        order: acc.dre_order,
                        total: 0,
                        accounts: [],
                    };
                }
                groupMap[gName].accounts.push(acc);
                groupMap[gName].total += acc.total;
            });

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
