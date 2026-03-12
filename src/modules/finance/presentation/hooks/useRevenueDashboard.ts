import { useQuery } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import type { DashboardDateRange } from "./useFinanceDashboard";

export interface ServiceRevenue {
    name: string;
    total: number;
    count: number;
    percentage: number;
}

export interface PaymentMethodBreakdown {
    method: string;
    total: number;
    count: number;
    percentage: number;
}

export function useRevenueDashboard(dateRange?: DashboardDateRange) {
    const { selectedCompany } = useCompany();
    const { activeClient } = useAuth();
    const db = activeClient as any;

    const rangeStart = dateRange?.from ?? new Date();
    const rangeEnd = dateRange?.to ?? new Date();
    const rangeKey = `${format(rangeStart, "yyyy-MM-dd")}_${format(rangeEnd, "yyyy-MM-dd")}`;

    // 1. Revenue by service/category (from transactions joined with chart_of_accounts)
    const { data: revenueByService } = useQuery({
        queryKey: ["dashboard_revenue_by_service", selectedCompany?.id, rangeKey],
        queryFn: async (): Promise<ServiceRevenue[]> => {
            if (!selectedCompany?.id) return [];

            const { data, error } = await db
                .from("transactions")
                .select(`
                    amount,
                    category:chart_of_accounts (
                        name,
                        code
                    )
                `)
                .eq("company_id", selectedCompany.id)
                .eq("type", "credit")
                .gte("date", rangeStart.toISOString())
                .lte("date", rangeEnd.toISOString());

            if (error) throw error;

            const byCategory: Record<string, { name: string; total: number; count: number }> = {};

            (data || []).forEach((t: any) => {
                const catName = t.category?.name || "Sem categoria";
                if (!byCategory[catName]) {
                    byCategory[catName] = { name: catName, total: 0, count: 0 };
                }
                byCategory[catName].total += Number(t.amount) || 0;
                byCategory[catName].count += 1;
            });

            const items = Object.values(byCategory).sort((a, b) => b.total - a.total);
            const grandTotal = items.reduce((s, i) => s + i.total, 0);

            return items.map((i) => ({
                ...i,
                percentage: grandTotal > 0 ? (i.total / grandTotal) * 100 : 0,
            }));
        },
        enabled: !!selectedCompany?.id,
    });

    // 2. Revenue by payment method (from accounts_receivable)
    const { data: revenueByPaymentMethod } = useQuery({
        queryKey: ["dashboard_revenue_by_payment", selectedCompany?.id, rangeKey],
        queryFn: async (): Promise<PaymentMethodBreakdown[]> => {
            if (!selectedCompany?.id) return [];

            const { data, error } = await db
                .from("accounts_receivable")
                .select("amount, payment_method")
                .eq("company_id", selectedCompany.id)
                .gte("due_date", rangeStart.toISOString())
                .lte("due_date", rangeEnd.toISOString());

            if (error) throw error;

            const byMethod: Record<string, { method: string; total: number; count: number }> = {};

            (data || []).forEach((r: any) => {
                const method = r.payment_method?.trim() || "Não informado";
                if (!byMethod[method]) {
                    byMethod[method] = { method, total: 0, count: 0 };
                }
                byMethod[method].total += Number(r.amount) || 0;
                byMethod[method].count += 1;
            });

            const items = Object.values(byMethod).sort((a, b) => b.total - a.total);
            const grandTotal = items.reduce((s, i) => s + i.total, 0);

            return items.map((i) => ({
                ...i,
                percentage: grandTotal > 0 ? (i.total / grandTotal) * 100 : 0,
            }));
        },
        enabled: !!selectedCompany?.id,
    });

    // 3. Total revenue in period
    const totalRevenue = (revenueByService || []).reduce((s, i) => s + i.total, 0);
    const totalTransactions = (revenueByService || []).reduce((s, i) => s + i.count, 0);

    return {
        revenueByService: revenueByService || [],
        revenueByPaymentMethod: revenueByPaymentMethod || [],
        totalRevenue,
        totalTransactions,
    };
}
