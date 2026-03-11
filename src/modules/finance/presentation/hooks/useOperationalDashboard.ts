
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { startOfDay, endOfDay, format } from "date-fns";
import type { DashboardDateRange } from "./useFinanceDashboard";

export function useOperationalDashboard(dateRange?: DashboardDateRange) {
    const { selectedCompany } = useCompany();
    const { activeClient } = useAuth();
    const db = activeClient as any;

    const rangeStart = dateRange?.from ?? new Date();
    const rangeEnd = dateRange?.to ?? new Date();
    const rangeKey = `${format(rangeStart, 'yyyy-MM-dd')}_${format(rangeEnd, 'yyyy-MM-dd')}`;

    // 1. Faturamento, Nº de Vendas, Ticket Médio (credit transactions in period)
    const { data: revenueData } = useQuery({
        queryKey: ['op_revenue', selectedCompany?.id, rangeKey],
        queryFn: async () => {
            if (!selectedCompany?.id) return { total: 0, count: 0, avg: 0 };
            const { data, error } = await db
                .from('transactions')
                .select('amount')
                .eq('company_id', selectedCompany.id)
                .eq('type', 'credit')
                .gte('date', rangeStart.toISOString())
                .lte('date', rangeEnd.toISOString());
            if (error) throw error;
            const total = data.reduce((s: number, t: any) => s + (t.amount || 0), 0);
            const count = data.length;
            return { total, count, avg: count > 0 ? total / count : 0 };
        },
        enabled: !!selectedCompany?.id,
    });

    // 2. Despesas totais no período (for margin calc)
    const { data: expenseTotal } = useQuery({
        queryKey: ['op_expenses', selectedCompany?.id, rangeKey],
        queryFn: async () => {
            if (!selectedCompany?.id) return 0;
            const { data, error } = await db
                .from('transactions')
                .select('amount')
                .eq('company_id', selectedCompany.id)
                .eq('type', 'debit')
                .gte('date', rangeStart.toISOString())
                .lte('date', rangeEnd.toISOString());
            if (error) throw error;
            return data.reduce((s: number, t: any) => s + (t.amount || 0), 0);
        },
        enabled: !!selectedCompany?.id,
    });

    // 3. Inadimplência (overdue receivables vs total receivables)
    const { data: defaultRate } = useQuery({
        queryKey: ['op_default_rate', selectedCompany?.id, rangeKey],
        queryFn: async () => {
            if (!selectedCompany?.id) return { rate: 0, overdueCount: 0, totalCount: 0 };
            const { data, error } = await db
                .from('accounts_receivable')
                .select('amount, due_date, status')
                .eq('company_id', selectedCompany.id);
            if (error) throw error;
            const today = startOfDay(new Date());
            const total = data.length;
            const overdue = data.filter((r: any) =>
                r.status === 'pending' && new Date(r.due_date) < today
            );
            return {
                rate: total > 0 ? (overdue.length / total) * 100 : 0,
                overdueCount: overdue.length,
                totalCount: total,
            };
        },
        enabled: !!selectedCompany?.id,
    });

    // 4. Top 5 Clientes por valor (receivables in period)
    const { data: topClients } = useQuery({
        queryKey: ['op_top_clients', selectedCompany?.id, rangeKey],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data, error } = await db
                .from('accounts_receivable')
                .select('amount, client:clients(name)')
                .eq('company_id', selectedCompany.id)
                .gte('due_date', rangeStart.toISOString())
                .lte('due_date', rangeEnd.toISOString());
            if (error) throw error;

            const byClient: Record<string, number> = {};
            data.forEach((r: any) => {
                const name = r.client?.name || 'Sem cliente';
                byClient[name] = (byClient[name] || 0) + (r.amount || 0);
            });

            return Object.entries(byClient)
                .map(([name, total]) => ({ name, total }))
                .sort((a, b) => b.total - a.total)
                .slice(0, 5);
        },
        enabled: !!selectedCompany?.id,
    });

    // 5. Top 5 Categorias de Despesa
    const { data: topExpenses } = useQuery({
        queryKey: ['op_top_expenses', selectedCompany?.id, rangeKey],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data, error } = await db
                .from('transactions')
                .select('amount, category:chart_of_accounts(name)')
                .eq('company_id', selectedCompany.id)
                .eq('type', 'debit')
                .gte('date', rangeStart.toISOString())
                .lte('date', rangeEnd.toISOString());
            if (error) throw error;

            const byCat: Record<string, number> = {};
            data.forEach((t: any) => {
                const name = t.category?.name || 'Sem categoria';
                byCat[name] = (byCat[name] || 0) + (t.amount || 0);
            });

            return Object.entries(byCat)
                .map(([name, total]) => ({ name, total }))
                .sort((a, b) => b.total - a.total)
                .slice(0, 5);
        },
        enabled: !!selectedCompany?.id,
    });

    // Derived: Margem
    const revenue = revenueData?.total ?? 0;
    const expenses = expenseTotal ?? 0;
    const margin = revenue > 0 ? ((revenue - expenses) / revenue) * 100 : 0;

    return {
        revenue: revenueData?.total ?? 0,
        salesCount: revenueData?.count ?? 0,
        avgTicket: revenueData?.avg ?? 0,
        margin,
        expenses,
        defaultRate: defaultRate ?? { rate: 0, overdueCount: 0, totalCount: 0 },
        topClients: topClients ?? [],
        topExpenses: topExpenses ?? [],
    };
}
