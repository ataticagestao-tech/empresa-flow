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
    tipo_transacao?: string | null;       // 'debit' | 'credit'
    valor_referencia?: number | null;     // valor absoluto memorizado
}

export interface ChartAccount {
    id: string;
    code: string;
    name: string;
    account_type: string;
    account_nature: string;
}

export interface AiAlternative {
    accountId: string;
    accountCode: string;
    accountName: string;
    label: string;
    score: number;
}

export interface MatchSuggestion {
    bankTransaction: BankTransaction;
    systemTransaction: SystemTransaction | null;
    score: number;           // 0-100
    method: string;          // 'rule', 'exact_amount_date', 'exact_amount', 'fuzzy', 'none', 'ai_category'
    ruleId?: string;
    ruleName?: string;
    accountId?: string;      // chart_of_accounts id sugerido pela regra
    accountCode?: string;
    accountName?: string;
    label: string;           // Display label
    aiAlternatives?: AiAlternative[];  // outras opções da IA
}

export type ScoreBucket = "auto" | "suggested" | "review" | "total";

export interface RuleConflict {
    existingRule: ConciliationRule;
    existingAccountName: string;
    newCategoryId: string;
    newAccountName: string;
    bankTx: BankTransaction;
    keywords: string[];
}

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
// MAPA DE KEYWORDS → CATEGORIA (fallback IA quando não há regra/match)
// ============================================================

const KEYWORD_TO_CATEGORY: Array<{ keywords: string[]; categoryFragments: string[] }> = [
    // ─── Receitas ───
    { keywords: ["VENDA", "VENDAS", "MERCADORIA", "PRODUTO", "LOJA", "COMERCIO", "FATURAMENTO", "FATUR"], categoryFragments: ["receita de vendas", "venda", "vendas"] },
    { keywords: ["SERVICO", "SERV ", "CONSULTORIA", "ASSESSORIA", "HONORARIO", "PRESTACAO", "NFSE", "ROYALTIES"], categoryFragments: ["receita de servico", "servico"] },
    { keywords: ["STONE", "CIELO", "REDE ", "GETNET", "PAGSEGURO", "DOMCRED", "DOMDEB", "DOMCREDITO", "MAQUININHA", "CRED RECEB", "CREDITO RECEB", "RECEB VENDAS", "RECEBIMENTO VENDAS", "VISA ELECTRON", "MASTERCARD", "ELO ", "ANTECIPACAO", "RECEBIMENTO"], categoryFragments: ["receita de vendas", "venda", "vendas", "receita"] },
    // ─── Investimentos / Aplicações ───
    { keywords: ["RENDIMENTO", "APLICACAO", "APLIC ", "APLIC.", "RES APLIC", "RESGATE", "CDB", "LCI", "LCA", "JUROS RECEBIDOS", "INVESTIMENTO", "INVEST", "POUPANCA", "POUP ", "TESOURO", "FUNDO", "RDB", "AUT MAIS"], categoryFragments: ["rendimento", "aplicacao", "investimento", "juros recebidos", "receita financeira"] },
    // ─── Depósitos / Entradas genéricas ───
    { keywords: ["DEP DIN", "DEPOSITO", "DEP ", "BCO24H", "BANCO24H", "CRED ", "CREDITO ", "CRED PIX", "DEVOL", "DEVOLUCAO", "ESTORNO"], categoryFragments: ["outras receitas", "receita", "deposito", "rendimento"] },
    // ─── Transferências ───
    { keywords: ["TRANSF ", "TRANSFER", "TRANSFERENCIA", "TRANSF ENTRE", "PIX TRANSF", "PIX ENVIADO", "PIX RECEBIDO"], categoryFragments: ["transferencia entre contas", "transferencia"] },
    // ─── PIX genérico (fallback) ───
    { keywords: ["PIX "], categoryFragments: ["transferencia", "pix", "outras receitas"] },
    // ─── Despesas Administrativas ───
    { keywords: ["ALUGUEL", "ALUG ", "CONDOMINIO", "COND ", "LOCACAO", "IPTU", "IMOVEL"], categoryFragments: ["aluguel", "condominio", "locacao"] },
    { keywords: ["ENERGIA", "ELETRICA", "LUZ", "CEMIG", "CPFL", "ENEL", "COPEL", "CELESC", "ENERGISA", "ENERG"], categoryFragments: ["energia", "luz"] },
    { keywords: ["AGUA", "SANEAMENTO", "GAS ", "COPASA", "SABESP", "SANEPAR"], categoryFragments: ["agua", "luz", "telefone"] },
    { keywords: ["INTERNET", "TELEFONE", "TELEFONIA", "CELULAR", "FIBRA", "VIVO", "CLARO", "TIM ", "ALARES", "NET "], categoryFragments: ["internet", "telefone", "telefonia"] },
    { keywords: ["SOFTWARE", "SISTEMA", "LICENCA", "ASSINATURA", "HOSPEDAGEM", "DOMINIO", "GOOGLE", "TOTVS", "OMIE"], categoryFragments: ["internet", "telefone", "terceiro"] },
    // ─── Pessoal ───
    { keywords: ["SALARIO", "SAL ", "FOLHA", "FUNCIONARIO", "FUNC ", "ENCARGOS", "FGTS", "INSS", "FERIAS", "13O", "RESCISAO", "VALE TRANSPORTE", "HOLERITE", "VT ", "VR ", "VA "], categoryFragments: ["salario", "encargo", "pessoal", "ordenado"] },
    { keywords: ["PRO-LABORE", "PROLABORE", "PRO LABORE", "RETIRADA", "RET SOCIO", "DIVIDENDOS", "DISTRIB"], categoryFragments: ["pro-labore", "prolabore", "pro labore"] },
    // ─── Financeiras ───
    { keywords: ["TARIFA", "TAR ", "TARIFAS", "TED ", "DOC ", "TAXA BANCARIA", "IOF", "ANUIDADE", "CESTA SERVICO", "CUSTODIA", "MANUT CONTA", "PAC "], categoryFragments: ["tarifa", "bancaria", "despesas bancarias"] },
    { keywords: ["JUROS", "MORA", "MULTA", "ENCARGOS FINANCEIROS", "FINANCIAMENTO", "EMPRESTIMO", "CDC", "SPREAD"], categoryFragments: ["juros", "financeira"] },
    // ─── Comerciais ───
    { keywords: ["MARKETING", "PUBLICIDADE", "PROPAGANDA", "FACEBOOK", "META ADS", "GOOGLE ADS", "ANUNCIO", "TRAFEGO"], categoryFragments: ["propaganda", "marketing", "comercial"] },
    { keywords: ["FRETE", "CORREIOS", "TRANSPORTE", "ENTREGA", "CARRETO", "SEDEX", "JADLOG", "LOGGI"], categoryFragments: ["frete", "carreto", "transporte"] },
    { keywords: ["COMISSAO", "COMISSOES"], categoryFragments: ["comissao", "comissoes"] },
    // ─── Veículos ───
    { keywords: ["COMBUSTIVEL", "COMB ", "GASOLINA", "UBER", "PEDAGIO", "VIAGEM", "VEICULO", "IPVA", "LICENC"], categoryFragments: ["veiculo", "combustivel"] },
    // ─── Manutenção / Materiais ───
    { keywords: ["MANUTENCAO", "MANUT ", "REPARO", "CONSERTO"], categoryFragments: ["manutencao", "reparo"] },
    { keywords: ["MATERIAL", "ESCRITORIO", "LIMPEZA", "PAPEL", "TONER"], categoryFragments: ["material", "escritorio"] },
    // ─── Serviços profissionais ───
    { keywords: ["CONTADOR", "CONTABILIDADE", "CONTABIL"], categoryFragments: ["terceiro", "servico", "contabil"] },
    { keywords: ["SEGURO", "APOLICE", "SINISTRO", "SEG "], categoryFragments: ["seguro"] },
    // ─── Impostos ───
    { keywords: ["DARF", "DAS ", "GPS ", "SIMPLES", "IMPOSTO", "ICMS", "ISS ", "PIS ", "COFINS", "CSLL", "IRPJ", "IRRF", "TRIBUTO", "GUIA ", "GRU "], categoryFragments: ["imposto", "tributo", "contribuicao"] },
    // ─── Saques ───
    { keywords: ["SAQUE", "SAQ ", "RETIRADA", "RET "], categoryFragments: ["saque", "retirada", "transferencia"] },
    // ─── Boleto / Pagamento ───
    { keywords: ["BOLETO", "BOL ", "PAG TITULO", "PAGAMENTO", "PAG ", "PGTO", "LIQUID"], categoryFragments: ["fornecedor", "pagamento", "despesa"] },
];

interface AiCategoryMatch {
    account: ChartAccount;
    score: number;
    matchedKeywords: string[];
}

function matchCategoryByKeywords(
    descNorm: string,
    accounts: ChartAccount[],
    filterNature?: string,
    topN = 1,
): AiCategoryMatch[] {
    const results: AiCategoryMatch[] = [];
    const seenAccountIds = new Set<string>();

    for (const rule of KEYWORD_TO_CATEGORY) {
        const matched: string[] = [];
        let kwScore = 0;
        for (const kw of rule.keywords) {
            if (descNorm.includes(kw)) {
                kwScore += kw.length >= 6 ? 3 : kw.length >= 4 ? 2 : 1;
                matched.push(kw);
            }
        }
        if (kwScore === 0) continue;

        const normalizedFragments = rule.categoryFragments.map(f =>
            f.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
        );

        let bestAccount: ChartAccount | null = null;
        let bestAccountScore = 0;

        for (const acc of accounts) {
            if (filterNature && acc.account_nature !== filterNature) continue;
            const accNameNorm = (acc.name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
            let nameScore = 0;
            for (const frag of normalizedFragments) {
                if (accNameNorm.includes(frag)) nameScore += frag.length;
            }
            if (nameScore > bestAccountScore) {
                bestAccountScore = nameScore;
                bestAccount = acc;
            }
        }

        if (bestAccount && !seenAccountIds.has(bestAccount.id)) {
            seenAccountIds.add(bestAccount.id);
            results.push({ account: bestAccount, score: kwScore, matchedKeywords: matched });
        }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topN);
}

// ============================================================
// ÍNDICE PRÉ-COMPUTADO — evita O(N) filter + scan por transação
// ============================================================

interface IndexedCandidates {
    payable: SystemTransaction[];   // sorted by amount
    receivable: SystemTransaction[];
}

function buildCandidateIndex(systemTxs: SystemTransaction[]): IndexedCandidates {
    const payable: SystemTransaction[] = [];
    const receivable: SystemTransaction[] = [];
    for (const st of systemTxs) {
        if (st.type === "payable") payable.push(st);
        else receivable.push(st);
    }
    payable.sort((a, b) => Number(a.amount) - Number(b.amount));
    receivable.sort((a, b) => Number(a.amount) - Number(b.amount));
    return { payable, receivable };
}

/** Binary search: find candidates with amount in [lo, hi] */
function findInRange(sorted: SystemTransaction[], lo: number, hi: number): SystemTransaction[] {
    if (!sorted.length) return [];
    // lower bound
    let left = 0, right = sorted.length;
    while (left < right) {
        const mid = (left + right) >> 1;
        if (Number(sorted[mid].amount) < lo) left = mid + 1;
        else right = mid;
    }
    const start = left;
    // upper bound
    right = sorted.length;
    while (left < right) {
        const mid = (left + right) >> 1;
        if (Number(sorted[mid].amount) <= hi) left = mid + 1;
        else right = mid;
    }
    return sorted.slice(start, left);
}

// ============================================================
// MOTOR DE MATCHING — usa palavras_chave (OR logic, case-insensitive)
// ============================================================

function runMatchingEngine(
    bt: BankTransaction,
    index: IndexedCandidates,
    rules: ConciliationRule[],
    accountMap: Map<string, ChartAccount>,
    rulesNormalized: string[][],
    allAccounts: ChartAccount[],
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

    const candidates = bt.amount < 0 ? index.payable : index.receivable;

    // ===== CAMADA 0: Regras de palavras-chave (conciliation_rules) =====
    const btTipo = bt.amount < 0 ? "debit" : "credit";

    for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        if (!rule.ativa) continue;

        // Filtrar por tipo de transação (débito/crédito) se a regra tem tipo definido
        if (rule.tipo_transacao && rule.tipo_transacao !== btTipo) continue;

        const normKws = rulesNormalized[i];
        const hit = normKws.some(kw => descNorm.includes(kw));
        if (!hit) continue;

        // Bonus de score se o valor bate com o memorizado (±5%)
        let confiancaScore = CONFIANCA_MAP[rule.confianca] || 50;
        if (rule.valor_referencia && rule.valor_referencia > 0) {
            const ratio = Math.abs(absAmount - rule.valor_referencia) / rule.valor_referencia;
            if (ratio < 0.01) confiancaScore = Math.max(confiancaScore, 95);       // valor exato
            else if (ratio <= 0.05) confiancaScore = Math.max(confiancaScore, 90);  // ±5%
        }
        const account = rule.account_id ? accountMap.get(rule.account_id) : null;
        const accountLabel = account ? `${account.code} ${account.name}` : "";

        // Binary search for exact amount match
        const exactCandidates = findInRange(candidates, absAmount - 0.01, absAmount + 0.01);
        const ruleCandidate = exactCandidates.length > 0 ? exactCandidates[0] : null;

        return {
            ...base,
            systemTransaction: ruleCandidate,
            score: confiancaScore,
            method: "rule",
            ruleId: rule.id,
            ruleName: accountLabel || (rule.palavras_chave || []).join(", "),
            accountId: rule.account_id || undefined,
            accountCode: account?.code,
            accountName: account?.name,
            label: ruleCandidate
                ? `${ruleCandidate.entity_name} - ${ruleCandidate.description}`
                : accountLabel
                    ? `IA: ${accountLabel}`
                    : `Regra: ${(rule.palavras_chave || []).join(", ")}`,
        };
    }

    // ===== BUSCA POR VALOR — usa binary search em vez de scan linear =====
    // Range: exato (±0.01) + taxa maquininha (até 7% acima do valor do extrato)
    const loAmount = absAmount - 0.01;
    const hiAmount = absAmount / 0.93 + 0.01; // absAmount é <= stAmount, taxa até 7%
    const narrowCandidates = findInRange(candidates, loAmount, hiAmount);

    const btTime = new Date(bt.date).getTime();
    let bestScore = 0;
    let bestResult: MatchSuggestion | null = null;

    for (const st of narrowCandidates) {
        const stAmount = Number(st.amount);
        const diff = stAmount - absAmount;
        const pct = stAmount > 0 ? Math.abs(diff) / stAmount : 1;
        const exato = Math.abs(diff) < 0.01;
        const extratoMenor = diff < -0.01;
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
            if (score >= 95) return bestResult;
        }
    }

    if (bestResult) return bestResult;

    // ===== FALLBACK: IA SUGERE — matching por keywords genéricas (top 3) =====
    const filterNature = bt.amount < 0 ? "debit" : "credit";
    let aiMatches = matchCategoryByKeywords(descNorm, allAccounts, filterNature, 3);
    if (aiMatches.length === 0) aiMatches = matchCategoryByKeywords(descNorm, allAccounts, undefined, 3);

    if (aiMatches.length > 0) {
        const best = aiMatches[0];
        const alternatives: AiAlternative[] = aiMatches.slice(1).map(m => ({
            accountId: m.account.id,
            accountCode: m.account.code,
            accountName: m.account.name,
            label: `${m.account.code} ${m.account.name}`,
            score: Math.min(m.score * 10, 90),
        }));

        return {
            ...base,
            score: Math.min(best.score * 10, 95),
            method: "ai_category",
            accountId: best.account.id,
            accountCode: best.account.code,
            accountName: best.account.name,
            label: `${best.account.code} ${best.account.name}`,
            aiAlternatives: alternatives.length > 0 ? alternatives : undefined,
        };
    }

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
                .select("id,company_id,account_id,palavras_chave,confianca,acao,recorrencia,ativa,tipo_transacao,valor_referencia")
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

    // Pré-computar índice de candidatos (particionado + ordenado por valor)
    const candidateIndex = useMemo(() =>
        buildCandidateIndex(systemTransactions || []),
    [systemTransactions]);

    // Pré-normalizar keywords das regras (evita normalizeText repetido)
    const rulesNormalized = useMemo(() =>
        (rules || []).map(r => (r.palavras_chave || []).map(kw => normalizeText(kw))),
    [rules]);

    // Executar motor de matching para todas as transações pendentes
    const suggestions: MatchSuggestion[] = useMemo(() => {
        if (!bankTransactions?.length) return [];

        return bankTransactions.map(bt =>
            runMatchingEngine(bt, candidateIndex, rules || [], accountMap, rulesNormalized, chartAccounts || [])
        );
    }, [bankTransactions, candidateIndex, rules, accountMap, rulesNormalized, chartAccounts]);

    // Score summary
    const scoreSummary = useMemo(() => {
        const auto = suggestions.filter(s => s.score >= 85).length;
        const suggested = suggestions.filter(s => s.score >= 50 && s.score < 85).length;
        const review = suggestions.filter(s => s.score < 50).length;
        return { auto, suggested, review, total: suggestions.length };
    }, [suggestions]);

    // ============================================================
    // MEMORIZAÇÃO: Aprender regra quando user concilia manualmente
    // Retorna conflito se mesma descrição → categoria diferente
    // ============================================================

    const learnRule = useMutation({
        mutationFn: async ({
            bankTx,
            sysTx,
            categoryId,
            forceUpdate,
        }: {
            bankTx: BankTransaction;
            sysTx?: SystemTransaction;
            categoryId?: string;
            forceUpdate?: boolean;  // pular pop-up e atualizar direto
        }): Promise<RuleConflict | null> => {
            if (!companyId) return null;

            const description = bankTx.description || "";
            const memo = (bankTx as any).memo || "";
            const fullText = `${description} ${memo}`;
            const keywords = extractKeywordsForRule(fullText);

            if (keywords.length === 0) return null;

            const normalizedKws = keywords.map(k => normalizeText(k));
            const tipoTransacao = bankTx.amount < 0 ? "debit" : "credit";
            const valorReferencia = Math.abs(bankTx.amount);

            // Verificar se já existe regra com keywords similares
            const existingRules = rules || [];
            const existingMatch = existingRules.find(r => {
                const ruleKws = (r.palavras_chave || []).map(k => normalizeText(k));
                return normalizedKws.some(nk => ruleKws.some(rk => rk.includes(nk) || nk.includes(rk)));
            });

            if (existingMatch) {
                // CONFLITO: mesma descrição aponta para categoria diferente
                if (categoryId && existingMatch.account_id && existingMatch.account_id !== categoryId && !forceUpdate) {
                    const existingAcc = accountMap.get(existingMatch.account_id);
                    const newAcc = accountMap.get(categoryId);
                    return {
                        existingRule: existingMatch,
                        existingAccountName: existingAcc ? `${existingAcc.code} ${existingAcc.name}` : "Categoria anterior",
                        newCategoryId: categoryId,
                        newAccountName: newAcc ? `${newAcc.code} ${newAcc.name}` : "Nova categoria",
                        bankTx,
                        keywords: normalizedKws,
                    };
                }

                // Atualizar regra existente (sem conflito ou forceUpdate)
                const updates: Record<string, any> = {};
                if (categoryId && existingMatch.account_id !== categoryId) updates.account_id = categoryId;
                if (!existingMatch.tipo_transacao) updates.tipo_transacao = tipoTransacao;
                if (!existingMatch.valor_referencia) updates.valor_referencia = valorReferencia;
                if (Object.keys(updates).length > 0) {
                    await (activeClient as any)
                        .from("conciliation_rules")
                        .update(updates)
                        .eq("id", existingMatch.id);
                }
                return null;
            }

            // Nova regra
            const { error } = await (activeClient as any)
                .from("conciliation_rules")
                .insert({
                    company_id: companyId,
                    account_id: categoryId || null,
                    palavras_chave: normalizedKws,
                    confianca: "Alta",
                    acao: "sugerir",
                    ativa: true,
                    tipo_transacao: tipoTransacao,
                    valor_referencia: valorReferencia,
                });

            if (error) console.error("Error saving conciliation rule:", error);
            return null;
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
