import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { ReportSearchSelection } from "./useReportSearch";

export interface ReportDateRange {
    start: string;
    end: string;
}

interface UseRelatoriosDataParams {
    activeClient: any;
    selectedCompanyId?: string;
    isUsingSecondary: boolean;
    dateRange: ReportDateRange;
    selectedSearch: ReportSearchSelection | null;
    selectedSearchKey: string | null;
}

type ReportTransaction = {
    date: string;
    type: "credit" | "debit";
    amount: number;
    category?: { name: string; type?: string } | null;
};

export function useRelatoriosData({
    activeClient,
    selectedCompanyId,
    isUsingSecondary,
    dateRange,
    selectedSearch,
    selectedSearchKey,
}: UseRelatoriosDataParams) {
    const { data: transactions, isLoading } = useQuery({
        queryKey: ["reports_transactions", selectedCompanyId, dateRange, isUsingSecondary],
        queryFn: async () => {
            if (!selectedCompanyId) return [];

            const { data, error } = await (activeClient as any)
                .from("transactions")
                .select(
                    `
                    date,
                    type,
                    amount,
                    category:categories(name,type)
                `,
                )
                .eq("company_id", selectedCompanyId)
                .gte("date", dateRange.start)
                .lte("date", dateRange.end)
                .order("date", { ascending: true })
                .order("created_at", { ascending: true });

            if (error) throw error;
            return (data || []) as ReportTransaction[];
        },
        enabled: !!selectedCompanyId,
    });

    const { data: arap, isLoading: isLoadingArap } = useQuery({
        queryKey: ["reports_arap", selectedCompanyId, isUsingSecondary, dateRange, selectedSearchKey],
        queryFn: async () => {
            if (!selectedCompanyId || !selectedSearch) return { receivable: [], payable: [] };

            const safeTerm = selectedSearch.label.replace(/[,()]/g, " ").trim();
            const like = `%${safeTerm}%`;

            let receivableQuery = (activeClient as any)
                .from("accounts_receivable")
                .select("id, amount, due_date, status, description")
                .eq("company_id", selectedCompanyId)
                .gte("due_date", dateRange.start)
                .lte("due_date", dateRange.end)
                .order("due_date", { ascending: true })
                .order("created_at", { ascending: true });

            let payableQuery = (activeClient as any)
                .from("accounts_payable")
                .select("id, amount, due_date, status, description")
                .eq("company_id", selectedCompanyId)
                .gte("due_date", dateRange.start)
                .lte("due_date", dateRange.end)
                .order("due_date", { ascending: true })
                .order("created_at", { ascending: true });

            if (selectedSearch.kind === "client") {
                receivableQuery = receivableQuery.eq("client_id", selectedSearch.id);
            } else if (selectedSearch.kind === "supplier") {
                payableQuery = payableQuery.eq("supplier_id", selectedSearch.id);
            } else if (selectedSearch.kind === "product") {
                const tokens = [selectedSearch.code, selectedSearch.label]
                    .filter(Boolean)
                    .map((t) => String(t).replace(/[,()]/g, " ").trim());
                const or = tokens.map((t) => `description.ilike.%${t}%`).join(",");
                receivableQuery = receivableQuery.or(or);
                payableQuery = payableQuery.or(or);
            } else if (selectedSearch.kind === "term") {
                receivableQuery = receivableQuery.ilike("description", like);
                payableQuery = payableQuery.ilike("description", like);
            }

            const [receivableRes, payableRes] = await Promise.all([receivableQuery, payableQuery]);
            if (receivableRes.error) throw receivableRes.error;
            if (payableRes.error) throw payableRes.error;

            return {
                receivable: (receivableRes.data || []) as any[],
                payable: (payableRes.data || []) as any[],
            };
        },
        enabled: !!selectedCompanyId && !!selectedSearchKey,
    });

    const arapSummary = useMemo(() => {
        const receivable = arap?.receivable ?? [];
        const payable = arap?.payable ?? [];

        const sum = (rows: any[]) => rows.reduce((acc, r) => acc + Number(r.amount || 0), 0);

        const totalReceivable = sum(receivable);
        const totalPayable = sum(payable);
        const net = totalReceivable - totalPayable;

        return {
            totalReceivable,
            totalPayable,
            net,
            countReceivable: receivable.length,
            countPayable: payable.length,
        };
    }, [arap]);

    const arapBucketed = useMemo(() => {
        const receivable = arap?.receivable ?? [];
        const payable = arap?.payable ?? [];
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        const dayMs = 24 * 60 * 60 * 1000;
        const totalDays = Math.max(1, Math.floor((end.getTime() - start.getTime()) / dayMs) + 1);
        const groupByMonth = totalDays > 45;

        const map = new Map<string, { key: string; label: string; receber: number; pagar: number; saldo: number }>();

        const upsert = (iso: string, patch: Partial<{ receber: number; pagar: number }>) => {
            const key = groupByMonth ? iso.slice(0, 7) : iso;
            const label = groupByMonth ? format(new Date(`${key}-01`), "MM/yyyy") : format(new Date(iso), "dd/MM");
            const prev = map.get(key) ?? { key, label, receber: 0, pagar: 0, saldo: 0 };
            const receber = prev.receber + Number(patch.receber || 0);
            const pagar = prev.pagar + Number(patch.pagar || 0);
            const next = { ...prev, receber, pagar, saldo: receber - pagar };
            map.set(key, next);
        };

        for (const r of receivable) upsert(String(r.due_date), { receber: Number(r.amount || 0) });
        for (const p of payable) upsert(String(p.due_date), { pagar: Number(p.amount || 0) });

        const data = Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
        return { groupByMonth, data };
    }, [arap, dateRange.end, dateRange.start]);

    const summary = useMemo(() => {
        const rows = transactions ?? [];
        let totalIn = 0;
        let totalOut = 0;

        for (const t of rows) {
            const amount = Number(t.amount || 0);
            if (t.type === "credit") totalIn += amount;
            if (t.type === "debit") totalOut += amount;
        }

        return { totalIn, totalOut, net: totalIn - totalOut };
    }, [transactions]);

    const bucketed = useMemo(() => {
        const rows = transactions ?? [];
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        const dayMs = 24 * 60 * 60 * 1000;
        const totalDays = Math.max(1, Math.floor((end.getTime() - start.getTime()) / dayMs) + 1);
        const groupByMonth = totalDays > 45;

        const map = new Map<
            string,
            { key: string; label: string; receitas: number; despesas: number; saldo: number; acumulado: number }
        >();

        for (const t of rows) {
            const key = groupByMonth ? t.date.slice(0, 7) : t.date;
            const label = groupByMonth
                ? format(new Date(`${key}-01`), "MM/yyyy")
                : format(new Date(t.date), "dd/MM");
            const prev = map.get(key) ?? { key, label, receitas: 0, despesas: 0, saldo: 0, acumulado: 0 };

            const amount = Number(t.amount || 0);
            if (t.type === "credit") prev.receitas += amount;
            if (t.type === "debit") prev.despesas += amount;
            prev.saldo = prev.receitas - prev.despesas;

            map.set(key, prev);
        }

        const sorted = Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
        let running = 0;
        for (const item of sorted) {
            running += item.saldo;
            item.acumulado = running;
        }

        return { groupByMonth, data: sorted };
    }, [transactions, dateRange.start, dateRange.end]);

    const cashflowBucketed = useMemo(() => {
        const rows = transactions ?? [];
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        const dayMs = 24 * 60 * 60 * 1000;
        const totalDays = Math.max(1, Math.floor((end.getTime() - start.getTime()) / dayMs) + 1);
        const groupByMonth = totalDays > 45;

        const map = new Map<
            string,
            { key: string; label: string; entradas: number; saidas: number; liquido: number; acumulado: number }
        >();

        for (const t of rows) {
            const key = groupByMonth ? t.date.slice(0, 7) : t.date;
            const label = groupByMonth
                ? format(new Date(`${key}-01`), "MM/yyyy")
                : format(new Date(t.date), "dd/MM");
            const prev = map.get(key) ?? { key, label, entradas: 0, saidas: 0, liquido: 0, acumulado: 0 };

            const amount = Number(t.amount || 0);
            if (t.type === "credit") prev.entradas += amount;
            if (t.type === "debit") prev.saidas -= amount;
            prev.liquido = prev.entradas + prev.saidas;

            map.set(key, prev);
        }

        const sorted = Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
        let running = 0;
        for (const item of sorted) {
            running += item.liquido;
            item.acumulado = running;
        }

        return { groupByMonth, data: sorted };
    }, [transactions, dateRange.start, dateRange.end]);

    const topCategories = useMemo(() => {
        const rows = transactions ?? [];
        const expenses = new Map<string, number>();
        const income = new Map<string, number>();

        for (const t of rows) {
            const name = t.category?.name || "Sem categoria";
            const amount = Number(t.amount || 0);
            if (t.type === "debit") expenses.set(name, (expenses.get(name) ?? 0) + amount);
            if (t.type === "credit") income.set(name, (income.get(name) ?? 0) + amount);
        }

        const top = (m: Map<string, number>) =>
            Array.from(m.entries())
                .map(([name, total]) => ({ name, total }))
                .sort((a, b) => b.total - a.total)
                .slice(0, 8);

        return { expenses: top(expenses), income: top(income) };
    }, [transactions]);

    const { data: dfcSummary, isLoading: isLoadingDfcSummary } = useQuery({
        queryKey: ["dfc_summary", selectedCompanyId, isUsingSecondary],
        queryFn: async () => {
            if (!selectedCompanyId) return { bankTotal: 0, overdueReceivables: 0 };

            const todayIso = format(new Date(), "yyyy-MM-dd");

            const [bankAccountsRes, overdueRes] = await Promise.all([
                (activeClient as any)
                    .from("bank_accounts")
                    .select("current_balance")
                    .eq("company_id", selectedCompanyId),
                (activeClient as any)
                    .from("accounts_receivable")
                    .select("amount")
                    .eq("company_id", selectedCompanyId)
                    .lte("due_date", todayIso)
                    .in("status", ["pending", "overdue"]),
            ]);

            if (bankAccountsRes.error) throw bankAccountsRes.error;
            if (overdueRes.error) throw overdueRes.error;

            const bankTotal = (bankAccountsRes.data || []).reduce(
                (sum: number, row: any) => sum + Number(row.current_balance || 0),
                0,
            );

            const overdueReceivables = (overdueRes.data || []).reduce(
                (sum: number, row: any) => sum + Number(row.amount || 0),
                0,
            );

            return { bankTotal, overdueReceivables };
        },
        enabled: !!selectedCompanyId,
    });

    return {
        transactions,
        isLoading,
        arap,
        isLoadingArap,
        arapSummary,
        arapBucketed,
        summary,
        bucketed,
        cashflowBucketed,
        topCategories,
        dfcSummary,
        isLoadingDfcSummary,
    };
}
