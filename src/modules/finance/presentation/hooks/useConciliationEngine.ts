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
 *  Patterns: "... / NOME" or "... - NOME" or "PIX ... NOME"
 */
function extractBeneficiary(description: string): string | null {
    const normalized = normalizeText(description);

    // Pattern 1: after last "/"
    const slashIdx = description.lastIndexOf("/");
    if (slashIdx !== -1) {
        let name = description.substring(slashIdx + 1).replace(/\s*\)\s*$/, "").trim();
        if (name.length >= 4 && !/^\d+$/.test(name)) return name;
    }

    // Pattern 2: PIX — extract name after CPF/CNPJ
    const pixMatch = normalized.match(/PIX.*?(?:CP|CNPJ)\s*:?\s*\d[\d./-]*\s*[-]?\s*(.{4,})/);
    if (pixMatch) return pixMatch[1].trim();

    // Pattern 3: after " - " separator (common in bank descriptions)
    const dashIdx = description.lastIndexOf(" - ");
    if (dashIdx !== -1 && dashIdx > 10) {
        let name = description.substring(dashIdx + 3).trim();
        if (name.length >= 4 && !/^\d+$/.test(name)) return name;
    }

    return null;
}

/** Extract meaningful keywords from bank description for matching */
function extractKeywordsForRule(description: string): string[] {
    const keywords: string[] = [];
    const normalized = normalizeText(description);

    // 1. Beneficiary name (most important)
    const beneficiary = extractBeneficiary(description);
    if (beneficiary) {
        keywords.push(normalizeText(beneficiary));
    }

    // 2. Known bank identifiers and payment providers
    const identifiers = [
        "STONE", "CIELO", "REDE", "GETNET", "PAGSEGURO",
        "DOMCRED", "DOMDEB", "DOMCREDITO",
        "MARKETPLACE", "MERCADO PAGO", "PICPAY",
        "UNIMED", "AMIL", "SULAMERICA",
        "OMIE", "RD STATION", "TOTVS",
        "CEMIG", "COPEL", "ENEL", "COPASA", "SABESP",
        "VIVO", "CLARO", "TIM", "ALARES",
        "CORREIOS", "SEDEX",
        "DARF", "DAS", "DAM", "GPS", "FGTS",
    ];

    for (const id of identifiers) {
        if (normalized.includes(id) && !keywords.some(k => k.includes(id))) {
            keywords.push(id);
        }
    }

    // 3. Extract payment type patterns
    const typePatterns = [
        "PIX ENVIADO", "PIX RECEBIDO", "TED", "DOC", "BOLETO",
        "DEBITO AUTOMATICO", "PAGAMENTO TITULO",
    ];
    for (const tp of typePatterns) {
        if (normalized.includes(tp) && !keywords.some(k => k === tp)) {
            keywords.push(tp);
        }
    }

    // 4. Extract company/person name (words with 4+ chars, excluding common banking terms)
    const stopWords = new Set([
        "PAGAMENTO", "RECEBIMENTO", "TRANSFERENCIA", "CREDITO", "DEBITO",
        "ENVIADO", "RECEBIDO", "BANCO", "CONTA", "AGENCIA", "PARCELA",
        "REFERENTE", "CONFORME", "DOCUMENTO", "VALOR", "TOTAL",
        "LTDA", "EIRELI", "COMERCIO", "SERVICO", "INSTITUICAO",
    ]);

    if (keywords.length === 0) {
        const words = normalized.split(/[\s,;|/()-]+/).filter(w => w.length >= 4 && !stopWords.has(w) && !/^\d+$/.test(w));
        if (words.length >= 2) {
            keywords.push(words.slice(0, 3).join(" "));
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

    // ─── Helper: taxa de maquininha ───────────────────────────────
    // Vendas por maquininha: extrato SEMPRE menor que o CR (valor - taxa 2-7%).
    // Repasse pode ser D+1 (débito) ou D+30 (crédito).
    // Descrição no extrato é genérica ("CREDITO", "STONE", "DOMCRED").
    // Nome do cliente NUNCA aparece — matching é só por valor + janela de data.
    const calcDiff = (stAmount: number) => {
        const stVal = Number(stAmount);
        const diff = stVal - absAmount;        // negativo = extrato menor
        const pct = stVal > 0 ? Math.abs(diff) / stVal : 1;
        return { diff, pct, extratoMenor: diff < -0.01, exato: Math.abs(diff) < 0.01 };
    };

    // ===== LOOP ÚNICO: avaliar todas as camadas por candidato =====
    const btTime = new Date(bt.date).getTime();
    let bestScore = 0;
    let bestResult: MatchSuggestion | null = null;

    for (const st of candidates) {
        const stAmount = Number(st.amount);
        const { exato, pct, extratoMenor } = calcDiff(stAmount);
        const diffDays = Math.abs(new Date(st.date).getTime() - btTime) / 86400000;

        let score = 0;
        let method = "";
        let label = `${st.entity_name} - ${st.description}`;

        if (exato && diffDays === 0) { score = 95; method = "exact_amount_date"; }
        else if (exato && diffDays <= 3) { score = 90; method = "exact_amount"; }
        else if (extratoMenor && pct <= 0.07 && diffDays <= 1) { score = 85; method = "taxa_maquininha"; label += ` (taxa ~${(pct*100).toFixed(1)}%)`; }
        else if (extratoMenor && pct <= 0.07 && diffDays <= 3) { score = 80; method = "taxa_maquininha"; label += ` (taxa ~${(pct*100).toFixed(1)}%)`; }
        else if (extratoMenor && pct <= 0.07 && diffDays <= 35) { score = 70; method = "taxa_maquininha"; label += ` (taxa ~${(pct*100).toFixed(1)}%, D+${Math.round(diffDays)})`; }
        else if (exato && diffDays <= 35) { score = 60; method = "exact_amount"; label += ` (D+${Math.round(diffDays)})`; }
        else if (extratoMenor && pct <= 0.07 && diffDays <= 60) { score = 50; method = "taxa_maquininha"; label += ` (taxa ~${(pct*100).toFixed(1)}%, D+${Math.round(diffDays)})`; }

        if (score > bestScore) {
            bestScore = score;
            bestResult = { ...base, systemTransaction: st, score, method, label };
            if (score >= 95) return bestResult; // early exit for perfect match
        }
    }

    if (bestResult) return bestResult;

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
            const memo = (bankTx as any).memo || "";
            const fullText = `${description} ${memo}`;
            const keywords = extractKeywordsForRule(fullText);

            // Não criar regra se não conseguimos extrair keywords
            if (keywords.length === 0) return;

            const normalizedKws = keywords.map(k => normalizeText(k));

            // Verificar se já existe regra com keywords similares E mesma conta
            const existingRules = rules || [];
            const existingMatch = existingRules.find(r => {
                const ruleKws = (r.palavras_chave || []).map(k => normalizeText(k));
                return normalizedKws.some(nk => ruleKws.some(rk => rk.includes(nk) || nk.includes(rk)));
            });

            // Se existe regra similar mas com conta diferente, atualizar a conta
            if (existingMatch && categoryId && existingMatch.account_id !== categoryId) {
                await (activeClient as any)
                    .from("conciliation_rules")
                    .update({ account_id: categoryId })
                    .eq("id", existingMatch.id);
                return;
            }

            if (existingMatch) return;

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
