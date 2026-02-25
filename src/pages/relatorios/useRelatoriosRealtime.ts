import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";

interface UseRelatoriosRealtimeParams {
    activeClient: any;
    queryClient: QueryClient;
    selectedCompanyId?: string;
    isUsingSecondary: boolean;
}

export function useRelatoriosRealtime({
    activeClient,
    queryClient,
    selectedCompanyId,
    isUsingSecondary,
}: UseRelatoriosRealtimeParams) {
    useEffect(() => {
        if (!selectedCompanyId) return;

        const providerKey = isUsingSecondary ? "secondary" : "primary";
        const channel = activeClient
            .channel(`reports-${providerKey}-${selectedCompanyId}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "transactions",
                    filter: `company_id=eq.${selectedCompanyId}`,
                },
                () => {
                    queryClient.invalidateQueries({ queryKey: ["reports_transactions"] });
                },
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "accounts_receivable",
                    filter: `company_id=eq.${selectedCompanyId}`,
                },
                () => {
                    queryClient.invalidateQueries({ queryKey: ["dfc_summary"] });
                    queryClient.invalidateQueries({ queryKey: ["reports_arap"] });
                },
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "accounts_payable",
                    filter: `company_id=eq.${selectedCompanyId}`,
                },
                () => {
                    queryClient.invalidateQueries({ queryKey: ["reports_arap"] });
                },
            )
            .subscribe();

        return () => {
            activeClient.removeChannel(channel);
        };
    }, [activeClient, isUsingSecondary, queryClient, selectedCompanyId]);
}
