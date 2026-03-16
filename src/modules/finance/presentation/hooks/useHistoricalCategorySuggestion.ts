import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useMemo } from "react";

function normalizeText(text: string): string {
    return (text || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim();
}

function extractSignificantWords(text: string): string[] {
    const normalized = normalizeText(text);
    const stopWords = new Set([
        "DE", "DO", "DA", "DOS", "DAS", "EM", "NO", "NA", "NOS", "NAS",
        "POR", "PARA", "COM", "SEM", "SOB", "SOBRE", "ENTRE", "ATE",
        "PIX", "TED", "DOC", "RECEBIDO", "ENVIADO", "PAGAMENTO",
        "TRANSFERENCIA", "CREDITO", "DEBITO",
    ]);
    return normalized
        .split(/\s+/)
        .filter(w => w.length >= 3 && !stopWords.has(w) && !/^\d+$/.test(w));
}

interface HistoricalMatch {
    accountId: string;
    reason: string;
    score: number;
}

export function useHistoricalCategorySuggestion(
    description: string,
    type: "receita" | "despesa",
) {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const companyId = selectedCompany?.id;

    // Fetch recently reconciled transactions with their categories
    const { data: historicalTx } = useQuery({
        queryKey: ["historical_categorized_tx", companyId, type],
        queryFn: async () => {
            if (!companyId) return [];
            const table = type === "despesa" ? "accounts_payable" : "accounts_receivable";
            const { data, error } = await (activeClient as any)
                .from(table)
                .select("id, description, category_id")
                .eq("company_id", companyId)
                .not("category_id", "is", null)
                .order("created_at", { ascending: false })
                .limit(200);
            if (error) return [];
            return (data || []) as Array<{ id: string; description: string; category_id: string }>;
        },
        enabled: !!companyId && !!description && description.length >= 3,
        staleTime: 5 * 60 * 1000,
    });

    const matches = useMemo<HistoricalMatch[]>(() => {
        if (!description || description.length < 3 || !historicalTx?.length) return [];

        const descWords = extractSignificantWords(description);
        if (descWords.length === 0) return [];

        // Count category matches by similarity
        const categoryScores = new Map<string, { score: number; matchedDesc: string }>();

        for (const tx of historicalTx) {
            const txWords = extractSignificantWords(tx.description || "");
            if (txWords.length === 0) continue;

            // Count matching words
            let matchCount = 0;
            for (const word of descWords) {
                if (txWords.some(tw => tw.includes(word) || word.includes(tw))) {
                    matchCount++;
                }
            }

            if (matchCount === 0) continue;

            const similarity = matchCount / Math.max(descWords.length, 1);
            if (similarity < 0.3) continue;

            const score = Math.round(similarity * 10);
            const existing = categoryScores.get(tx.category_id);
            if (!existing || score > existing.score) {
                categoryScores.set(tx.category_id, {
                    score,
                    matchedDesc: tx.description,
                });
            }
        }

        return Array.from(categoryScores.entries())
            .map(([accountId, { score, matchedDesc }]) => ({
                accountId,
                score,
                reason: `Similar a "${matchedDesc}"`,
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);
    }, [description, historicalTx]);

    return { historicalSuggestions: matches };
}
