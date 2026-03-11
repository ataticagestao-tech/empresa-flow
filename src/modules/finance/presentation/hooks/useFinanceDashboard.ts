
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { startOfMonth, endOfMonth, eachDayOfInterval, format, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface DashboardDateRange {
    from: Date;
    to: Date;
}

export function useFinanceDashboard(dateRange?: DashboardDateRange) {
    const { selectedCompany } = useCompany();
    const { activeClient } = useAuth();
    const db = activeClient as any;

    const rangeStart = dateRange?.from ?? startOfMonth(new Date());
    const rangeEnd = dateRange?.to ?? endOfMonth(new Date());
    const rangeKey = `${format(rangeStart, 'yyyy-MM-dd')}_${format(rangeEnd, 'yyyy-MM-dd')}`;

    // 1. Saldo Total em Bancos (sempre atual, não depende do filtro de data)
    const { data: accountsBalance } = useQuery({
        queryKey: ['dashboard_accounts_balance', selectedCompany?.id],
        queryFn: async () => {
            if (!selectedCompany?.id) return 0;
            const { data, error } = await db
                .from('bank_accounts')
                .select('current_balance')
                .eq('company_id', selectedCompany.id);
            if (error) throw error;
            return data.reduce((acc, curr) => acc + (curr.current_balance || 0), 0);
        },
        enabled: !!selectedCompany?.id
    });

    // 2. Contas a Receber filtradas pelo período
    const { data: receivablesSummary } = useQuery({
        queryKey: ['dashboard_receivables', selectedCompany?.id, rangeKey],
        queryFn: async () => {
            if (!selectedCompany?.id) return { overdue: 0, today: 0, period: 0 };
            const today = new Date();

            const { data, error } = await db
                .from('accounts_receivable')
                .select('amount, due_date')
                .eq('company_id', selectedCompany.id)
                .eq('status', 'pending');

            if (error) throw error;

            let overdue = 0;
            let amountToday = 0;
            let period = 0;

            data.forEach((r: any) => {
                const dueDate = new Date(r.due_date);
                if (dueDate < startOfDay(today)) overdue += r.amount;
                if (dueDate >= startOfDay(today) && dueDate <= endOfDay(today)) amountToday += r.amount;
                if (dueDate >= startOfDay(rangeStart) && dueDate <= endOfDay(rangeEnd)) period += r.amount;
            });

            return { overdue, today: amountToday, period };
        },
        enabled: !!selectedCompany?.id
    });

    // 3. Contas a Pagar filtradas pelo período
    const { data: payablesSummary } = useQuery({
        queryKey: ['dashboard_payables', selectedCompany?.id, rangeKey],
        queryFn: async () => {
            if (!selectedCompany?.id) return { overdue: 0, today: 0, period: 0 };
            const today = new Date();

            const { data, error } = await db
                .from('accounts_payable')
                .select('amount, due_date')
                .eq('company_id', selectedCompany.id)
                .eq('status', 'pending');

            if (error) throw error;

            let overdue = 0;
            let amountToday = 0;
            let period = 0;

            data.forEach((p: any) => {
                const dueDate = new Date(p.due_date);
                if (dueDate < startOfDay(today)) overdue += p.amount;
                if (dueDate >= startOfDay(today) && dueDate <= endOfDay(today)) amountToday += p.amount;
                if (dueDate >= startOfDay(rangeStart) && dueDate <= endOfDay(rangeEnd)) period += p.amount;
            });

            return { overdue, today: amountToday, period };
        },
        enabled: !!selectedCompany?.id
    });

    // 4. Fluxo de Caixa Previsto (Gráfico) — usa o período selecionado
    const { data: cashFlowData } = useQuery({
        queryKey: ['dashboard_cashflow', selectedCompany?.id, rangeKey],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];

            const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });

            const { data: receivables } = await db
                .from('accounts_receivable')
                .select('amount, due_date')
                .eq('company_id', selectedCompany.id)
                .gte('due_date', rangeStart.toISOString())
                .lte('due_date', rangeEnd.toISOString());

            const { data: payables } = await db
                .from('accounts_payable')
                .select('amount, due_date')
                .eq('company_id', selectedCompany.id)
                .gte('due_date', rangeStart.toISOString())
                .lte('due_date', rangeEnd.toISOString());

            const { data: bankData } = await db
                .from('bank_accounts')
                .select('current_balance')
                .eq('company_id', selectedCompany.id);

            let currentBalance = bankData?.reduce((acc, curr) => acc + (curr.current_balance || 0), 0) || 0;

            const chartData = days.map(day => {
                const dayStr = format(day, 'yyyy-MM-dd');

                const rec = receivables?.filter((r: any) => r.due_date.startsWith(dayStr))
                    .reduce((sum, r) => sum + r.amount, 0) || 0;

                const pay = payables?.filter((p: any) => p.due_date.startsWith(dayStr))
                    .reduce((sum, p) => sum + p.amount, 0) || 0;

                const dailyNet = rec - pay;
                currentBalance += dailyNet;

                return {
                    date: format(day, "EEE d/MM", { locale: ptBR }),
                    receitas: rec,
                    despesas: pay,
                    saldo_do_dia: dailyNet,
                    saldo_acumulado: currentBalance
                };
            });

            return chartData;
        },
        enabled: !!selectedCompany?.id
    });

    // 5. Resumo DRE — usa o período selecionado
    const { data: dreSummary } = useQuery({
        queryKey: ['dashboard_dre', selectedCompany?.id, rangeKey],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];

            const { data, error } = await db
                .from('transactions')
                .select(`
                    amount,
                    type,
                    category:chart_of_accounts (
                        name,
                        dre_group,
                        dre_order
                    )
                `)
                .eq('company_id', selectedCompany.id)
                .gte('date', rangeStart.toISOString())
                .lte('date', rangeEnd.toISOString());

            if (error) throw error;

            const groups: Record<string, { name: string, total: number, order: number }> = {};

            data.forEach((t: any) => {
                const groupName = t.category?.dre_group || 'Outros';
                const order = t.category?.dre_order || 99;

                if (!groups[groupName]) {
                    groups[groupName] = { name: groupName, total: 0, order };
                }

                if (t.type === 'credit') groups[groupName].total += t.amount;
                else groups[groupName].total -= t.amount;
            });

            return Object.values(groups).sort((a, b) => a.order - b.order);
        },
        enabled: !!selectedCompany?.id
    });

    return {
        accountsBalance,
        receivablesSummary,
        payablesSummary,
        cashFlowData,
        dreSummary
    };
}
