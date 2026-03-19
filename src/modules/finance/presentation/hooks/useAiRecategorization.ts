import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";

interface ChartAccount {
    id: string;
    code: string;
    name: string;
    type?: string;
    account_type?: string;
    account_nature?: string;
}

export interface AiCategorySuggestion {
    account: ChartAccount;
    score: number;
    reason: string;
}

export interface TxAiResult {
    txId: string;
    suggestions: AiCategorySuggestion[];
    bestMatch: AiCategorySuggestion | null;
}

function normalize(text: string): string {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

// Extract meaningful words from a description (skip short/common words)
function extractKeywords(desc: string): string[] {
    const stopWords = new Set([
        "de", "da", "do", "das", "dos", "em", "no", "na", "nos", "nas",
        "por", "para", "com", "sem", "sob", "um", "uma", "uns", "que",
        "pag", "pgto", "ref", "nro", "num", "cta", "conta",
    ]);
    return normalize(desc)
        .split(" ")
        .filter(w => w.length >= 3 && !stopWords.has(w));
}

// Compute similarity between two descriptions (Jaccard-like on keywords)
function descriptionSimilarity(a: string, b: string): number {
    const kwA = new Set(extractKeywords(a));
    const kwB = new Set(extractKeywords(b));
    if (kwA.size === 0 || kwB.size === 0) return 0;

    let intersection = 0;
    for (const w of kwA) {
        if (kwB.has(w)) intersection++;
        // Also check partial matches (one contains the other)
        else {
            for (const wb of kwB) {
                if (wb.includes(w) || w.includes(wb)) {
                    intersection += 0.5;
                    break;
                }
            }
        }
    }
    const union = kwA.size + kwB.size - intersection;
    return union > 0 ? intersection / union : 0;
}

export function useAiRecategorization(categories: ChartAccount[]) {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const db = activeClient as any;

    const [processing, setProcessing] = useState(false);
    const [results, setResults] = useState<Record<string, TxAiResult>>({});

    // Fetch ALL transactions (past + future) with their categories for this company
    const { data: historicalTx } = useQuery({
        queryKey: ["historical_categorized_tx", selectedCompany?.id],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];

            // Buscar todos os lançamentos categorizados (passados e futuros)
            // Paginar em blocos de 1000 para não estourar limite do Supabase
            let allData: any[] = [];
            let from = 0;
            const pageSize = 1000;

            while (true) {
                const { data: rawData, error } = await db
                    .from("movimentacoes")
                    .select(`
                        id, descricao, valor, data, tipo,
                        conta_contabil_id,
                        category:chart_of_accounts (
                            id, code, name, account_type, account_nature
                        )
                    `)
                    .eq("company_id", selectedCompany.id)
                    .not("conta_contabil_id", "is", null)
                    .order("data")
                    .range(from, from + pageSize - 1);
                const data = (rawData || []).map((t: any) => ({
                    ...t,
                    description: t.descricao,
                    amount: t.valor,
                    date: t.data,
                    type: t.tipo,
                    category_id: t.conta_contabil_id,
                }));

                if (error) break;
                if (!data?.length) break;

                allData = allData.concat(data);
                if (data.length < pageSize) break; // última página
                from += pageSize;
            }

            return allData;
        },
        enabled: !!selectedCompany?.id,
        staleTime: 5 * 60 * 1000, // cache 5 min
    });

    // Also fetch conciliation_rules for keyword-based matching
    const { data: conciliationRules } = useQuery({
        queryKey: ["conciliation_rules_for_ai", selectedCompany?.id],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data, error } = await db
                .from("conciliation_rules")
                .select("id, account_id, palavras_chave, confianca, ativa")
                .eq("company_id", selectedCompany.id)
                .eq("ativa", true);
            if (error) return [];
            return data || [];
        },
        enabled: !!selectedCompany?.id,
        staleTime: 5 * 60 * 1000,
    });

    const suggestCategory = useCallback((
        description: string,
        amount: number,
        date: string,
    ): AiCategorySuggestion[] => {
        if (!description || !categories?.length) return [];

        const scored = new Map<string, AiCategorySuggestion>();
        const txType = amount < 0 ? "despesa" : "receita";

        // ── Strategy 1: Historical pattern matching ──
        // Find similar past transactions and aggregate their categories
        if (historicalTx?.length) {
            const categoryVotes: Record<string, { count: number; totalSim: number; amountMatch: number }> = {};

            for (const ht of historicalTx) {
                if (!ht.category_id || !ht.description) continue;

                const sim = descriptionSimilarity(description, ht.description);
                if (sim < 0.2) continue; // threshold

                if (!categoryVotes[ht.category_id]) {
                    categoryVotes[ht.category_id] = { count: 0, totalSim: 0, amountMatch: 0 };
                }
                categoryVotes[ht.category_id].count++;
                categoryVotes[ht.category_id].totalSim += sim;

                // Bonus for similar amounts (within 10%)
                const htAmount = Math.abs(Number(ht.amount));
                const txAmount = Math.abs(amount);
                if (txAmount > 0 && htAmount > 0) {
                    const ratio = Math.min(htAmount, txAmount) / Math.max(htAmount, txAmount);
                    if (ratio >= 0.9) categoryVotes[ht.category_id].amountMatch++;
                }
            }

            for (const [catId, votes] of Object.entries(categoryVotes)) {
                const cat = categories.find(c => c.id === catId);
                if (!cat) continue;
                if (txType === "despesa" && cat.type === "receita") continue;
                if (txType === "receita" && cat.type === "despesa") continue;

                const avgSim = votes.totalSim / votes.count;
                // Score: frequency * avg_similarity * 10, plus bonus for amount matches
                const histScore = Math.round(
                    (votes.count * avgSim * 10) + (votes.amountMatch * 2)
                );

                const reasons: string[] = [];
                reasons.push(`${votes.count} lançamento(s) similar(es)`);
                if (votes.amountMatch > 0) reasons.push("valor compatível");

                scored.set(catId, {
                    account: cat,
                    score: histScore,
                    reason: reasons.join(", "),
                });
            }
        }

        // ── Strategy 2: Conciliation rules (keyword matching) ──
        if (conciliationRules?.length) {
            const normalizedDesc = normalize(description);
            for (const rule of conciliationRules) {
                if (!rule.account_id || !rule.palavras_chave?.length) continue;
                const matchedKw: string[] = [];
                for (const kw of rule.palavras_chave) {
                    if (normalizedDesc.includes(normalize(kw))) {
                        matchedKw.push(kw);
                    }
                }
                if (matchedKw.length === 0) continue;

                const cat = categories.find(c => c.id === rule.account_id);
                if (!cat) continue;
                if (txType === "despesa" && cat.type === "receita") continue;
                if (txType === "receita" && cat.type === "despesa") continue;

                const ruleScore = matchedKw.length * 5;
                const existing = scored.get(cat.id);
                if (existing) {
                    existing.score += ruleScore;
                    existing.reason += `, regra: ${matchedKw.slice(0, 2).join(", ")}`;
                } else {
                    scored.set(cat.id, {
                        account: cat,
                        score: ruleScore,
                        reason: `Regra: ${matchedKw.slice(0, 2).join(", ")}`,
                    });
                }
            }
        }

        // ── Strategy 3: Direct category name matching ──
        const descKeywords = extractKeywords(description);
        for (const cat of categories) {
            if (txType === "despesa" && cat.type === "receita") continue;
            if (txType === "receita" && cat.type === "despesa") continue;

            const catKeywords = extractKeywords(cat.name);
            let nameScore = 0;
            const matched: string[] = [];

            for (const dk of descKeywords) {
                for (const ck of catKeywords) {
                    if (ck.includes(dk) || dk.includes(ck)) {
                        nameScore += Math.min(dk.length, ck.length) >= 5 ? 3 : 1;
                        matched.push(dk);
                        break;
                    }
                }
            }

            if (nameScore > 0) {
                const existing = scored.get(cat.id);
                if (existing) {
                    existing.score += nameScore;
                } else {
                    scored.set(cat.id, {
                        account: cat,
                        score: nameScore,
                        reason: `Nome: ${matched.slice(0, 2).join(", ")}`,
                    });
                }
            }
        }

        const result = Array.from(scored.values());
        result.sort((a, b) => b.score - a.score);
        return result.slice(0, 3);
    }, [categories, historicalTx, conciliationRules]);

    // Process a single transaction
    const suggestForTx = useCallback((tx: {
        id: string;
        description: string;
        amount: number;
        date: string;
    }): TxAiResult => {
        const suggestions = suggestCategory(tx.description, tx.amount, tx.date);
        return {
            txId: tx.id,
            suggestions,
            bestMatch: suggestions.length > 0 ? suggestions[0] : null,
        };
    }, [suggestCategory]);

    // Process an entire batch of transactions
    const suggestForBatch = useCallback((transactions: Array<{
        id: string;
        description: string;
        amount: number;
        date: string;
        linked_table?: string;
        linked_id?: string;
        status?: string;
    }>) => {
        setProcessing(true);
        const newResults: Record<string, TxAiResult> = {};

        for (const tx of transactions) {
            if (tx.status !== "reconciled" || !tx.linked_id) continue;
            newResults[tx.id] = suggestForTx(tx);
        }

        setResults(prev => ({ ...prev, ...newResults }));
        setProcessing(false);
        return newResults;
    }, [suggestForTx]);

    const clearResults = useCallback(() => setResults({}), []);

    return {
        suggestForTx,
        suggestForBatch,
        results,
        clearResults,
        processing,
        hasHistory: (historicalTx?.length || 0) > 0,
    };
}
