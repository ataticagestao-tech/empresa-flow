import { useEffect, useState } from "react";
import { endOfMonth, format, startOfMonth } from "date-fns";
import type { ReportSearchSelection } from "./useReportSearch";
import type { ReportDateRange } from "./useRelatoriosData";

interface UseRelatoriosPageStateParams {
    selectedSearch: ReportSearchSelection | null;
    setSelectedSearch: (search: ReportSearchSelection | null) => void;
}

export function useRelatoriosPageState({ selectedSearch, setSelectedSearch }: UseRelatoriosPageStateParams) {
    const [dateRange, setDateRange] = useState<ReportDateRange>({
        start: format(startOfMonth(new Date()), "yyyy-MM-dd"),
        end: format(endOfMonth(new Date()), "yyyy-MM-dd"),
    });

    useEffect(() => {
        const stateRaw = sessionStorage.getItem("relatorios_state");
        if (!stateRaw) return;
        try {
            const parsed = JSON.parse(stateRaw) as any;
            if (parsed?.dateRange?.start && parsed?.dateRange?.end) {
                setDateRange({
                    start: String(parsed.dateRange.start),
                    end: String(parsed.dateRange.end),
                });
            }
            if (parsed?.selectedSearch?.kind) {
                setSelectedSearch(parsed.selectedSearch);
            }
        } catch {
            return;
        }
    }, [setSelectedSearch]);

    useEffect(() => {
        sessionStorage.setItem(
            "relatorios_state",
            JSON.stringify({
                dateRange,
                selectedSearch,
            }),
        );
    }, [dateRange, selectedSearch]);

    useEffect(() => {
        const el = document.getElementById("app-scroll-container");
        if (!el) return;

        const key = "scroll:/relatorios";
        const saved = sessionStorage.getItem(key);
        if (saved) {
            const next = Number(saved);
            if (Number.isFinite(next)) {
                requestAnimationFrame(() => {
                    el.scrollTop = next;
                });
            }
        }

        return () => {
            sessionStorage.setItem(key, String(el.scrollTop || 0));
        };
    }, []);

    return { dateRange, setDateRange };
}
