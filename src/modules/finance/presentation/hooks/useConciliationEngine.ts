import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { BankTransaction } from "../../domain/schemas/bank-reconciliation.schema";
import { SystemTransaction } from "./useBankReconciliation";
import { useMemo } from "react";

// ============================================================
// TIPOS — schema real da tabela conciliation_rules
// ============================================================

export interface ConciliationRule {
    id: string;
    company_id: string;
    account_id: string | null;
    palavras_chave: string[];
    confianca: "Alta" | "Média" | "Baixa";
    acao: "auto-conciliar" | "sugerir";
    recorrencia?: string;
    ativa: boolean;
    criada_em?: string;
}

export interface ChartAccount {
    id: string;
    code: string;
    name: string;
    account_type: string;
    account_nature: string;
}

export interface MatchSuggestion {
    bankTransaction: BankTransaction;
    systemTransaction: SystemTransaction | null;
    score: number;           // 0-100
    method: string;          // 'rule', 'exact_amount_date', 'exact_amount', 'fuzzy', 'none'
    ruleId?: string;
    ruleName?: string;
    accountId?: string;      // chart_of_accounts id sugerido pela regra
    accountCode?: string;
    accountName?: string;
    label: string;           // Display label
}

export type ScoreBucket = "auto" | "suggested" | "review" | "total";

const CONFIANCA_MAP: Record<string, number> = { "Alta": 95, "Média": 70, "Baixa": 50 };

// ============================================================
// HELPERS
// ============================================================

function normalizeText(text: string): string {
    return (text || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim();
}

/** Extract beneficiary name from bank description.
 *  Patterns: "... / NOME DO BENEFICIARIO )" or "... / NOME DO BENEFICIARIO"
 */
function extractBeneficiary(description: string): string | null {
    // Try to find text after the last "/"
    const slashIdx = description.lastIndexOf("/");
    if (slashIdx === -1) return null;

    let name = description.substring(slashIdx + 1)
        .replace(/\s*\)\s*$/, "")  // remove trailing ")"
        .trim();

    // Skip if too short or looks like a doc reference
    if (name.length < 4) return null;
    if (/^\d+$/.test(name)) return null;

    return name;
}

/** Extract meaningful keywords from bank description for matching */
function extractKeywordsForRule(description: string): string[] {
    const keywords: string[] = [];

    // 1. Beneficiary name (most important)
    const beneficiary = extractBeneficiary(description);
    if (beneficiary) {
        keywords.push(normalizeText(beneficiary));
    }

    // 2. Key identifier words from the description
    const normalized = normalizeText(description);

    // Known patterns to extract
    const identifiers = [
        "STONE", "DOMCRED", "DOMDEB", "MARKETPLACE", "PRONTOVET",
        "PROAMBIENTAL", "PRO AMBIENTAL", "UNIMED", "REAL CONTABILIDADE",
        "TATICA GESTAO", "RD STATION", "OMIE",
    ];

    for (const id of identifiers) {
        if (normalized.includes(id) && !keywords.some(k => k.includes(id))) {
            keywords.push(id);
        }
    }

    return keywords;
}

// ============================================================
// MOTOR DE MATCHING — usa palavras_chave (OR logic, case-insensitive)
// ============================================================

function runMatchingEngine(
    bt: BankTransaction,
    systemTxs: SystemTransaction[],
    rules: ConciliationRule[],
    accountMap: Map<string, ChartAccount>,
): MatchSuggestion {
    const base: MatchSuggestion = {
        bankTransaction: bt,
        systemTransaction: null,
        score: 0,
        method: "none",
        label: "Sem sugestão",
    };

    const descNorm = normalizeText(`${bt.description || ""} ${bt.memo || ""}`);
    const absAmount = Math.abs(bt.amount);

    // Filter compatible system transactions by type
    const compatibleType = bt.amount < 0 ? "payable" : "receivable";
    const candidates = systemTxs.filter(st => st.type === compatibleType);

    // ===== CAMADA 0: Regras de palavras-chave (conciliation_rules) =====
    for (const rule of rules) {
        if (!rule.ativa) continue;
        const keywords = rule.palavras_chave || [];
        const hit = keywords.some(kw => descNorm.includes(normalizeText(kw)));
        if (!hit) continue;

        // Regra bateu!
        const confiancaScore = CONFIANCA_MAP[rule.confianca] || 50;
        const account = rule.account_id ? accountMap.get(rule.account_id) : null;
        const accountLabel = account ? `${account.code} ${account.name}` : "";

        // Try to find matching system transaction by amount
        const ruleCandidate = candidates.find(st => Math.abs(Number(st.amount) - absAmount) < 0.01);

        return {
            ...base,
            systemTransaction: ruleCandidate || null,
            score: confiancaScore,
            method: "rule",
            ruleId: rule.id,
            ruleName: accountLabel || keywords.join(", "),
            accountId: rule.account_id || undefined,
            accountCode: account?.code,
            accountName: account?.name,
            label: ruleCandidate
                ? `${ruleCandidate.entity_name} - ${ruleCandidate.description}`
                : accountLabel
                    ? `IA: ${accountLabel}`
                    : `Regra: ${keywords.join(", ")}`,
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
        const diffDays = Math.abs(new Date(st.date).getTime() - new Date(bt.date).getTime()) / 86400000;
        if (Math.abs(Number(st.amount) - absAmount) < 0.01 && diffDays <= 3) {
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
        const diffDays = Math.abs(new Date(st.date).getTime() - new Date(bt.date).getTime()) / 86400000;
        if (Math.abs(Number(st.amount) - absAmount) < 0.01 && diffDays <= 7) {
            return {
                ...base,
                systemTransaction: st,
                score: 70,
                method: "exact_amount",
                label: `${st.entity_name} - ${st.description}`,
            };
        }
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

    // Buscar regras de conciliação (schema real)
    const { data: rules } = useQuery({
        queryKey: ["conciliation_rules", companyId],
        queryFn: async () => {
            if (!companyId) return [];
            const { data, error } = await (activeClient as any)
                .from("conciliation_rules")
                .select("id,company_id,account_id,palavras_chave,confianca,acao,recorrencia,ativa")
                .eq("company_id", companyId)
                .eq("ativa", true);
            if (error) {
                console.error("Error fetching conciliation rules:", error);
                return [];
            }
            return (data || []) as ConciliationRule[];
        },
        enabled: !!companyId,
    });

    // Buscar contas analíticas para exibir nomes nas sugestões
    const { data: chartAccounts } = useQuery({
        queryKey: ["chart_accounts_analytical", companyId],
        queryFn: async () => {
            if (!companyId) return [];
            const { data, error } = await (activeClient as any)
                .from("chart_of_accounts")
                .select("id,code,name,account_type,account_nature")
                .eq("company_id", companyId)
                .eq("status", "active")
                .eq("is_analytical", true)
                .order("code", { ascending: true });
            if (error) return [];
            return (data || []) as ChartAccount[];
        },
        enabled: !!companyId,
    });

    const accountMap = useMemo(() => {
        const map = new Map<string, ChartAccount>();
        (chartAccounts || []).forEach(a => map.set(a.id, a));
        return map;
    }, [chartAccounts]);

    // Executar motor de matching para todas as transações pendentes
    const suggestions: MatchSuggestion[] = useMemo(() => {
        if (!bankTransactions?.length) return [];

        return bankTransactions.map(bt =>
            runMatchingEngine(bt, systemTransactions || [], rules || [], accountMap)
        );
    }, [bankTransactions, systemTransactions, rules, accountMap]);

    // Score summary
    const scoreSummary = useMemo(() => {
        const auto = suggestions.filter(s => s.score >= 85).length;
        const suggested = suggestions.filter(s => s.score >= 50 && s.score < 85).length;
        const review = suggestions.filter(s => s.score < 50).length;
        return { auto, suggested, review, total: suggestions.length };
    }, [suggestions]);

    // ============================================================
    // MEMORIZAÇÃO: Aprender regra quando user concilia manualmente
    // Extrai o nome do beneficiário da descrição e associa à conta
    // ============================================================
    const learnRule = useMutation({
        mutationFn: async ({
            bankTx,
            sysTx,
            categoryId,
        }: {
            bankTx: BankTransaction;
            sysTx?: SystemTransaction;
            categoryId?: string;
        }) => {
            if (!companyId) return;

            const description = bankTx.description || "";
            const keywords = extractKeywordsForRule(description);

            // Não criar regra se não conseguimos extrair keywords
            if (keywords.length === 0) return;

            // Normalizar keywords para comparação
            const normalizedKws = keywords.map(k => normalizeText(k));

            // Verificar se já existe regra com keywords similares
            const existingRules = rules || [];
            const alreadyExists = existingRules.some(r => {
                const ruleKws = (r.palavras_chave || []).map(k => normalizeText(k));
                return normalizedKws.some(nk => ruleKws.some(rk => rk.includes(nk) || nk.includes(rk)));
            });

            if (alreadyExists) return;

            // Determinar account_id: prioridade para categoryId explícito
            const accountId = categoryId || null;

            const { error } = await (activeClient as any)
                .from("conciliation_rules")
                .insert({
                    company_id: companyId,
                    account_id: accountId,
                    palavras_chave: normalizedKws,
                    confianca: "Alta",
                    acao: "sugerir",
                    ativa: true,
                });

            if (error) {
                console.error("Error saving conciliation rule:", error);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["conciliation_rules"] });
        },
    });

    // Criar regra manual
    const createRule = useMutation({
        mutationFn: async (rule: { palavras_chave: string[]; account_id?: string; confianca?: string; acao?: string }) => {
            if (!companyId) throw new Error("Empresa não selecionada");

            const { error } = await (activeClient as any)
                .from("conciliation_rules")
                .insert({
                    company_id: companyId,
                    account_id: rule.account_id || null,
                    palavras_chave: rule.palavras_chave,
                    confianca: rule.confianca || "Alta",
                    acao: rule.acao || "sugerir",
                    ativa: true,
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
        chartAccounts: chartAccounts || [],
        accountMap,
        scoreSummary,
        learnRule,
        createRule,
        deleteRule,
    };
}
