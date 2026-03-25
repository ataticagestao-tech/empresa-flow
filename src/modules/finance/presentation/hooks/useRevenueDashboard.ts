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
                .from("movimentacoes")
                .select(`
                    valor,
                    origem,
                    category:chart_of_accounts (
                        name,
                        code
                    )
                `)
                .eq("company_id", selectedCompany.id)
                .eq("tipo", "credito")
                .neq("origem", "transferencia")
                .gte("data", rangeStart.toISOString())
                .lte("data", rangeEnd.toISOString());

            if (error) throw error;

            const byCategory: Record<string, { name: string; total: number; count: number }> = {};

            (data || []).forEach((t: any) => {
                const catName = t.category?.name || "Sem categoria";
                if (!byCategory[catName]) {
                    byCategory[catName] = { name: catName, total: 0, count: 0 };
                }
                byCategory[catName].total += Number(t.valor) || 0;
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
                .from("contas_receber")
                .select("valor, forma_recebimento")
                .eq("company_id", selectedCompany.id)
                .gte("data_vencimento", rangeStart.toISOString())
                .lte("data_vencimento", rangeEnd.toISOString());

            if (error) throw error;

            const byMethod: Record<string, { method: string; total: number; count: number }> = {};

            (data || []).forEach((r: any) => {
                const method = r.forma_recebimento?.trim() || "Não informado";
                if (!byMethod[method]) {
                    byMethod[method] = { method, total: 0, count: 0 };
                }
                byMethod[method].total += Number(r.valor) || 0;
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
