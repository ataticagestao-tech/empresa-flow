import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { BankTransaction } from "../../domain/schemas/bank-reconciliation.schema";
import { SystemTransaction } from "./useBankReconciliation";
import { useMemo } from "react";

// ============================================================
// TIPOS
// ============================================================

export interface ConciliationRule {
    id: string;
    company_id: string;
    condition_field: string;
    condition_operator: string;
    condition_value: string;
    condition_field_2?: string;
    condition_operator_2?: string;
    condition_value_2?: string;
    action_type: string;
    action_value?: string;
    action_description?: string;
    name: string;
    confidence: number;
    times_applied: number;
    last_applied_at?: string;
    is_active: boolean;
    is_auto_learned: boolean;
    source_description?: string;
}

export interface MatchSuggestion {
    bankTransaction: BankTransaction;
    systemTransaction: SystemTransaction | null;
    score: number;           // 0-100
    method: string;          // 'rule', 'exact_amount_date', 'exact_amount', 'fuzzy', 'none'
    ruleId?: string;
    ruleName?: string;
    label: string;           // Display label
}

export type ScoreBucket = "auto" | "suggested" | "review" | "total";

// ============================================================
// HELPERS
// ============================================================

function normalizeText(text: string): string {
    return (text || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, "")
        .trim();
}

function textContains(haystack: string, needle: string): boolean {
    return normalizeText(haystack).includes(normalizeText(needle));
}

function textEquals(a: string, b: string): boolean {
    return normalizeText(a) === normalizeText(b);
}

function textStartsWith(haystack: string, needle: string): boolean {
    return normalizeText(haystack).startsWith(normalizeText(needle));
}

function evaluateCondition(
    bt: BankTransaction,
    field: string,
    operator: string,
    value: string
): boolean {
    let fieldValue = "";
    if (field === "description") fieldValue = bt.description || "";
    else if (field === "memo") fieldValue = bt.memo || "";
    else if (field === "amount") fieldValue = String(Math.abs(bt.amount));

    switch (operator) {
        case "contains": return textContains(fieldValue, value);
        case "equals": return textEquals(fieldValue, value);
        case "starts_with": return textStartsWith(fieldValue, value);
        case "regex":
            try { return new RegExp(value, "i").test(fieldValue); }
            catch { return false; }
        default: return false;
    }
}

/** Extract meaningful keywords from a bank description */
function extractKeywords(description: string): string[] {
    const normalized = normalizeText(description);
    // Remove common bank noise words
    const noise = new Set([
        "pix", "ted", "doc", "tef", "deb", "cred", "pgto", "pag", "rec",
        "transf", "transferencia", "pagamento", "recebimento", "compra",
        "debito", "credito", "automatico", "conta", "banco", "ag", "cc",
        "de", "da", "do", "em", "para", "com", "por", "ao", "a", "o",
        "no", "na", "nos", "nas", "um", "uma", "uns", "ref", "nf", "nr",
    ]);

    return normalized
        .split(/\s+/)
        .filter(w => w.length > 2 && !noise.has(w) && !/^\d+$/.test(w));
}

/** Fuzzy similarity score between two strings (0-100) */
function similarityScore(a: string, b: string): number {
    const na = normalizeText(a);
    const nb = normalizeText(b);
    if (na === nb) return 100;
    if (!na || !nb) return 0;

    // Keyword overlap
    const kwA = new Set(extractKeywords(a));
    const kwB = new Set(extractKeywords(b));
    if (kwA.size === 0 || kwB.size === 0) return 0;

    let overlap = 0;
    kwA.forEach(kw => { if (kwB.has(kw)) overlap++; });

    const jaccardBase = kwA.size + kwB.size - overlap;
    if (jaccardBase === 0) return 0;
    return Math.round((overlap / jaccardBase) * 100);
}

/** Check if dates are within N business days */
function datesWithinDays(d1: string, d2: string, days: number): boolean {
    const t1 = new Date(d1).getTime();
    const t2 = new Date(d2).getTime();
    const diffDays = Math.abs(t1 - t2) / (1000 * 60 * 60 * 24);
    return diffDays <= days;
}

// ============================================================
// MOTOR DE MATCHING EM CAMADAS
// ============================================================

function runMatchingEngine(
    bt: BankTransaction,
    systemTxs: SystemTransaction[],
    rules: ConciliationRule[]
): MatchSuggestion {
    const base: MatchSuggestion = {
        bankTransaction: bt,
        systemTransaction: null,
        score: 0,
        method: "none",
        label: "Sem sugestão",
    };

    // Filter compatible system transactions by type
    const compatibleType = bt.amount < 0 ? "payable" : "receivable";
    const candidates = systemTxs.filter(st => st.type === compatibleType);
    const absAmount = Math.abs(bt.amount);

    // ===== CAMADA 0: Regras salvas (confiança da regra) =====
    for (const rule of rules) {
        if (!rule.is_active) continue;

        let match1 = evaluateCondition(bt, rule.condition_field, rule.condition_operator, rule.condition_value);
        if (!match1) continue;

        // Condição secundária (se existir)
        if (rule.condition_field_2 && rule.condition_operator_2 && rule.condition_value_2) {
            const match2 = evaluateCondition(bt, rule.condition_field_2, rule.condition_operator_2, rule.condition_value_2);
            if (!match2) continue;
        }

        // Regra bateu! Procurar melhor candidato do sistema
        // Se a regra aponta para um lançamento específico, usar esse
        if (rule.action_type === "category" || rule.action_type === "create_payable" || rule.action_type === "create_receivable") {
            return {
                ...base,
                score: rule.confidence,
                method: "rule",
                ruleId: rule.id,
                ruleName: rule.name,
                label: `Regra: ${rule.name}`,
            };
        }

        // Tentar encontrar candidato por valor
        const ruleCandidate = candidates.find(st => Math.abs(Number(st.amount) - absAmount) < 0.01);
        if (ruleCandidate) {
            return {
                ...base,
                systemTransaction: ruleCandidate,
                score: rule.confidence,
                method: "rule",
                ruleId: rule.id,
                ruleName: rule.name,
                label: `Regra: ${rule.name} → ${ruleCandidate.entity_name} - ${ruleCandidate.description}`,
            };
        }

        // Regra bateu mas sem candidato — ainda reportar
        return {
            ...base,
            score: Math.min(rule.confidence, 70),
            method: "rule",
            ruleId: rule.id,
            ruleName: rule.name,
            label: `Regra: ${rule.name} (sem lançamento compatível)`,
        };
    }

    // ===== CAMADA 1: Valor exato + data exata (95%) =====
    for (const st of candidates) {
        if (Math.abs(Number(st.amount) - absAmount) < 0.01 && st.date === bt.date) {
            return {
                ...base,
                systemTransaction: st,
                score: 95,
                method: "exact_amount_date",
                label: `${st.entity_name} - ${st.description}`,
            };
        }
    }

    // ===== CAMADA 2: Valor exato + data ±3 dias (80%) =====
    for (const st of candidates) {
        if (Math.abs(Number(st.amount) - absAmount) < 0.01 && datesWithinDays(st.date, bt.date, 3)) {
            return {
                ...base,
                systemTransaction: st,
                score: 80,
                method: "exact_amount",
                label: `${st.entity_name} - ${st.description}`,
            };
        }
    }

    // ===== CAMADA 3: Valor exato + data ±7 dias (70%) =====
    for (const st of candidates) {
        if (Math.abs(Number(st.amount) - absAmount) < 0.01 && datesWithinDays(st.date, bt.date, 7)) {
            return {
                ...base,
                systemTransaction: st,
                score: 70,
                method: "exact_amount",
                label: `${st.entity_name} - ${st.description}`,
            };
        }
    }

    // ===== CAMADA 4: Fuzzy description match + valor próximo (50-65%) =====
    let bestFuzzy: { st: SystemTransaction; score: number } | null = null;

    for (const st of candidates) {
        const amountDiff = Math.abs(Number(st.amount) - absAmount) / absAmount;
        if (amountDiff > 0.05) continue; // Valor deve estar dentro de 5%

        const descSim = similarityScore(bt.description || "", st.description || "");
        const entitySim = similarityScore(bt.description || "", st.entity_name || "");
        const sim = Math.max(descSim, entitySim);

        if (sim >= 30) {
            const fuzzyScore = Math.min(65, 40 + Math.round(sim * 0.25));
            if (!bestFuzzy || fuzzyScore > bestFuzzy.score) {
                bestFuzzy = { st, score: fuzzyScore };
            }
        }
    }

    if (bestFuzzy) {
        return {
            ...base,
            systemTransaction: bestFuzzy.st,
            score: bestFuzzy.score,
            method: "fuzzy",
            label: `${bestFuzzy.st.entity_name} - ${bestFuzzy.st.description}`,
        };
    }

    // ===== SEM MATCH =====
    return base;
}

// ============================================================
// HOOK PRINCIPAL
// ============================================================

export function useConciliationEngine(
    bankAccountId: string | undefined,
    bankTransactions: BankTransaction[] | undefined,
    systemTransactions: SystemTransaction[] | undefined,
) {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const queryClient = useQueryClient();
    const companyId = selectedCompany?.id;

    // Buscar regras de conciliação
    const { data: rules } = useQuery({
        queryKey: ["conciliation_rules", companyId],
        queryFn: async () => {
            if (!companyId) return [];
            const { data, error } = await (activeClient as any)
                .from("conciliation_rules")
                .select("*")
                .eq("company_id", companyId)
                .eq("is_active", true)
                .order("times_applied", { ascending: false });
            if (error) {
                console.error("Error fetching conciliation rules:", error);
                return [];
            }
            return (data || []) as ConciliationRule[];
        },
        enabled: !!companyId,
    });

    // Executar motor de matching para todas as transações pendentes
    const suggestions: MatchSuggestion[] = useMemo(() => {
        if (!bankTransactions?.length || !systemTransactions) return [];

        return bankTransactions.map(bt =>
            runMatchingEngine(bt, systemTransactions, rules || [])
        );
    }, [bankTransactions, systemTransactions, rules]);

    // Score summary
    const scoreSummary = useMemo(() => {
        const auto = suggestions.filter(s => s.score >= 85).length;
        const suggested = suggestions.filter(s => s.score >= 50 && s.score < 85).length;
        const review = suggestions.filter(s => s.score < 50).length;
        return { auto, suggested, review, total: suggestions.length };
    }, [suggestions]);

    // ============================================================
    // MEMORIZAÇÃO IMEDIATA: Aprender regra quando user concilia manualmente
    // ============================================================
    const learnRule = useMutation({
        mutationFn: async ({
            bankTx,
            sysTx,
        }: {
            bankTx: BankTransaction;
            sysTx: SystemTransaction;
        }) => {
            if (!companyId) return;

            const description = bankTx.description || "";
            const keywords = extractKeywords(description);

            // Não criar regra se descrição é genérica demais
            if (keywords.length === 0) return;

            // Construir condição: usar as 2-3 keywords mais significativas
            const keyCondition = keywords.slice(0, 3).join(" ");

            // Verificar se já existe regra similar
            const existingRules = rules || [];
            const alreadyExists = existingRules.some(r =>
                r.condition_field === "description" &&
                r.condition_operator === "contains" &&
                normalizeText(r.condition_value) === normalizeText(keyCondition)
            );

            if (alreadyExists) {
                // Incrementar uso da regra existente
                const existing = existingRules.find(r =>
                    r.condition_field === "description" &&
                    r.condition_operator === "contains" &&
                    normalizeText(r.condition_value) === normalizeText(keyCondition)
                );
                if (existing) {
                    await (activeClient as any)
                        .from("conciliation_rules")
                        .update({
                            times_applied: (existing.times_applied || 0) + 1,
                            last_applied_at: new Date().toISOString(),
                        })
                        .eq("id", existing.id);
                }
                return;
            }

            // Criar nova regra auto-aprendida
            const ruleName = `Auto: ${description.substring(0, 50)}`;
            const { error } = await (activeClient as any)
                .from("conciliation_rules")
                .insert({
                    company_id: companyId,
                    condition_field: "description",
                    condition_operator: "contains",
                    condition_value: keyCondition,
                    action_type: sysTx.type === "payable" ? "create_payable" : "create_receivable",
                    action_value: sysTx.id,
                    action_description: sysTx.description,
                    name: ruleName,
                    confidence: 90,
                    times_applied: 1,
                    last_applied_at: new Date().toISOString(),
                    is_active: true,
                    is_auto_learned: true,
                    source_description: description,
                });

            if (error) {
                console.error("Error saving conciliation rule:", error);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["conciliation_rules"] });
        },
    });

    // Aprovar em lote (só score >= 85)
    const batchApprove = useMutation({
        mutationFn: async (selectedIds: string[]) => {
            const toApprove = suggestions.filter(
                s => selectedIds.includes(s.bankTransaction.id) && s.systemTransaction && s.score >= 85
            );

            const results: { success: number; failed: number } = { success: 0, failed: 0 };

            for (const suggestion of toApprove) {
                try {
                    // Update rule usage
                    if (suggestion.ruleId) {
                        await (activeClient as any)
                            .from("conciliation_rules")
                            .update({
                                times_applied: (rules?.find(r => r.id === suggestion.ruleId)?.times_applied || 0) + 1,
                                last_applied_at: new Date().toISOString(),
                            })
                            .eq("id", suggestion.ruleId);
                    }
                    results.success++;
                } catch {
                    results.failed++;
                }
            }

            return results;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["bank_transactions_pending"] });
            queryClient.invalidateQueries({ queryKey: ["system_pending_transactions"] });
            queryClient.invalidateQueries({ queryKey: ["conciliation_rules"] });
        },
    });

    // Criar regra manual
    const createRule = useMutation({
        mutationFn: async (rule: Partial<ConciliationRule>) => {
            if (!companyId) throw new Error("Empresa não selecionada");

            const { error } = await (activeClient as any)
                .from("conciliation_rules")
                .insert({
                    ...rule,
                    company_id: companyId,
                    is_active: true,
                    is_auto_learned: false,
                    times_applied: 0,
                });

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["conciliation_rules"] });
        },
    });

    // Deletar regra
    const deleteRule = useMutation({
        mutationFn: async (ruleId: string) => {
            const { error } = await (activeClient as any)
                .from("conciliation_rules")
                .delete()
                .eq("id", ruleId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["conciliation_rules"] });
        },
    });

    return {
        suggestions,
        rules: rules || [],
        scoreSummary,
        learnRule,
        batchApprove,
        createRule,
        deleteRule,
    };
}
