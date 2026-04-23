
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
                .from('movimentacoes')
                .select('valor')
                .eq('company_id', selectedCompany.id)
                .eq('tipo', 'credito')
                .gte('data', rangeStart.toISOString())
                .lte('data', rangeEnd.toISOString());
            if (error) throw error;
            const total = data.reduce((s: number, t: any) => s + Number(t.valor || 0), 0);
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
                .from('movimentacoes')
                .select('valor')
                .eq('company_id', selectedCompany.id)
                .eq('tipo', 'debito')
                .gte('data', rangeStart.toISOString())
                .lte('data', rangeEnd.toISOString());
            if (error) throw error;
            return data.reduce((s: number, t: any) => s + Number(t.valor || 0), 0);
        },
        enabled: !!selectedCompany?.id,
    });

    // 3. Inadimplência (overdue receivables vs total receivables)
    const { data: defaultRate } = useQuery({
        queryKey: ['op_default_rate', selectedCompany?.id, rangeKey],
        queryFn: async () => {
            if (!selectedCompany?.id) return { rate: 0, overdueCount: 0, totalCount: 0 };
            const { data, error } = await db
                .from('contas_receber')
                .select('valor, data_vencimento, status')
                .eq('company_id', selectedCompany.id)
                .is('deleted_at', null)
                .limit(5000);
            if (error) throw error;
            const today = startOfDay(new Date());
            const total = data.length;
            const overdue = data.filter((r: any) =>
                r.status === 'aberto' && new Date(r.data_vencimento) < today
            );
            return {
                rate: total > 0 ? (overdue.length / total) * 100 : 0,
                overdueCount: overdue.length,
                totalCount: total,
            };
        },
        enabled: !!selectedCompany?.id,
    });

    // 4. Top 5 Clientes por valor em aberto (receivables in period, not paid/deleted)
    const { data: topClients } = useQuery({
        queryKey: ['op_top_clients', selectedCompany?.id, rangeKey],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data, error } = await db
                .from('contas_receber')
                .select('valor, valor_pago, pagador_nome')
                .eq('company_id', selectedCompany.id)
                .eq('status', 'aberto')
                .is('deleted_at', null)
                .gte('data_vencimento', rangeStart.toISOString())
                .lte('data_vencimento', rangeEnd.toISOString())
                .limit(5000);
            if (error) throw error;

            const byClient: Record<string, number> = {};
            data.forEach((r: any) => {
                const name = r.pagador_nome || 'Sem cliente';
                const saldo = Number(r.valor || 0) - Number(r.valor_pago || 0);
                if (saldo > 0) byClient[name] = (byClient[name] || 0) + saldo;
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
                .from('movimentacoes')
                .select('valor, category:chart_of_accounts(name)')
                .eq('company_id', selectedCompany.id)
                .eq('tipo', 'debito')
                .gte('data', rangeStart.toISOString())
                .lte('data', rangeEnd.toISOString())
                .limit(5000);
            if (error) throw error;

            const byCat: Record<string, number> = {};
            data.forEach((t: any) => {
                const name = t.category?.name || 'Sem categoria';
                byCat[name] = (byCat[name] || 0) + Number(t.valor || 0);
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
