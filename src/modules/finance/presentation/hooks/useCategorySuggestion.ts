import { useMemo } from "react";

interface ChartAccount {
    id: string;
    code: string;
    name: string;
    type?: string;
}

interface ScoredCategory {
    account: ChartAccount;
    score: number;
    reason: string;
}

// Mapa de palavras-chave da descrição -> fragmentos do NOME da categoria
// Independente de código, funciona com qualquer plano de contas
const KEYWORD_TO_CATEGORY_NAME: Array<{ keywords: string[]; categoryNameFragments: string[] }> = [
    // Receitas
    {
        keywords: ["venda", "vendas", "mercadoria", "produto", "loja", "comercio", "nf", "nota fiscal", "faturamento"],
        categoryNameFragments: ["receita de vendas", "venda", "vendas"],
    },
    {
        keywords: ["serviço", "servico", "servicos", "consultoria", "assessoria", "honorário", "honorarios", "prestação", "nfse", "comissão", "royalties"],
        categoryNameFragments: ["receita de serviço", "serviço", "servico"],
    },
    // Despesas Administrativas
    {
        keywords: ["aluguel", "aluguéis", "condomínio", "condominio", "locação", "iptu", "imóvel"],
        categoryNameFragments: ["aluguel", "condomínio", "condominio", "locação"],
    },
    {
        keywords: ["energia", "elétrica", "eletrica", "luz", "cemig", "cpfl", "enel", "eletropaulo", "copel", "celesc", "energisa", "kwh"],
        categoryNameFragments: ["energia", "luz"],
    },
    {
        keywords: ["água", "agua", "saneamento", "gás", "gas"],
        categoryNameFragments: ["água", "agua", "luz", "telefone"],
    },
    {
        keywords: ["internet", "telefone", "telefonia", "celular", "fibra", "banda larga", "wifi", "vivo", "claro", "tim"],
        categoryNameFragments: ["internet", "telefone", "telefonia"],
    },
    {
        keywords: ["software", "sistema", "licença", "assinatura", "hospedagem", "domínio", "google", "totvs"],
        categoryNameFragments: ["internet", "telefone", "terceiro"],
    },
    // Pessoal
    {
        keywords: ["salário", "salario", "folha", "funcionário", "funcionario", "encargos", "fgts", "inss", "férias", "13o", "rescisão", "vale transporte", "vt", "vr", "va", "benefício", "holerite"],
        categoryNameFragments: ["salário", "salario", "encargo", "pessoal", "ordenado"],
    },
    {
        keywords: ["pró-labore", "pro-labore", "prolabore", "pro labore", "retirada sócio", "sócio", "dividendos"],
        categoryNameFragments: ["pró-labore", "pro-labore", "prolabore", "pro labore"],
    },
    // Financeiras
    {
        keywords: ["tarifa", "tarifas", "ted", "doc", "taxa bancária", "iof", "anuidade", "cesta serviço", "custódia"],
        categoryNameFragments: ["tarifa", "bancária", "bancaria", "despesas bancárias"],
    },
    {
        keywords: ["juros", "mora", "multa atraso", "encargos financeiros", "financiamento", "empréstimo", "cdc", "spread"],
        categoryNameFragments: ["juros", "financeira"],
    },
    // Comerciais
    {
        keywords: ["marketing", "publicidade", "propaganda", "facebook", "meta", "google ads", "anúncio"],
        categoryNameFragments: ["propaganda", "marketing", "comercial"],
    },
    {
        keywords: ["frete", "correios", "transporte", "entrega", "carreto"],
        categoryNameFragments: ["frete", "carreto", "transporte"],
    },
    {
        keywords: ["comissão", "comissao", "comissões"],
        categoryNameFragments: ["comissão", "comissao", "comissões"],
    },
    // Veículos e viagens
    {
        keywords: ["combustível", "combustivel", "gasolina", "uber", "pedágio", "viagem", "veículo"],
        categoryNameFragments: ["veículo", "veiculo", "combustível"],
    },
    // Manutenção
    {
        keywords: ["manutenção", "manutencao", "reparo", "conserto"],
        categoryNameFragments: ["manutenção", "manutencao", "reparo"],
    },
    // Materiais
    {
        keywords: ["material", "escritório", "escritorio", "limpeza", "papel", "toner"],
        categoryNameFragments: ["material", "escritório", "escritorio"],
    },
    // Contabilidade
    {
        keywords: ["contador", "contabilidade", "contábil"],
        categoryNameFragments: ["terceiro", "serviço", "contábil"],
    },
    // Seguros
    {
        keywords: ["seguro", "apólice", "sinistro"],
        categoryNameFragments: ["seguro"],
    },
    // Juros recebidos / receitas financeiras
    {
        keywords: ["rendimento", "aplicação", "resgate", "cdb", "lci", "lca", "juros recebidos"],
        categoryNameFragments: ["rendimento", "aplicação", "juros recebidos", "receita financeira"],
    },
];

function normalize(text: string): string {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function findMatchingCategory(
    categoryNameFragments: string[],
    categories: ChartAccount[],
    filterType?: "receita" | "despesa"
): ChartAccount | undefined {
    const normalizedFragments = categoryNameFragments.map(normalize);

    // Procurar a categoria cujo nome contém algum dos fragmentos
    let bestMatch: ChartAccount | undefined;
    let bestScore = 0;

    for (const cat of categories) {
        if (filterType && cat.type !== filterType) continue;

        const normalizedName = normalize(cat.name);
        let score = 0;

        for (const frag of normalizedFragments) {
            if (normalizedName.includes(frag)) {
                score += frag.length;
            }
        }

        if (score > bestScore) {
            bestScore = score;
            bestMatch = cat;
        }
    }

    return bestMatch;
}

export interface ExternalSuggestion {
    accountId: string;
    reason: string;
    score?: number;
}

export function useCategorySuggestion(
    description: string,
    categories: ChartAccount[],
    filterType?: "receita" | "despesa",
    externalSuggestions?: ExternalSuggestion[],
) {
    const suggestions = useMemo<ScoredCategory[]>(() => {
        if (!categories?.length) return [];

        const scored = new Map<string, ScoredCategory>();

        // 0. Sugestões externas (regras aprendidas, histórico) — prioridade máxima
        if (externalSuggestions?.length) {
            for (const ext of externalSuggestions) {
                const account = categories.find(c => c.id === ext.accountId);
                if (account) {
                    scored.set(account.id, {
                        account,
                        score: ext.score ?? 10,
                        reason: ext.reason,
                    });
                }
            }
        }

        if (!description || description.length < 3) {
            const result = Array.from(scored.values());
            result.sort((a, b) => b.score - a.score);
            return result.slice(0, 3);
        }

        const normalizedDesc = normalize(description);

        // 1. Score por mapa de keywords -> nome da categoria
        for (const rule of KEYWORD_TO_CATEGORY_NAME) {
            let matchedKeywords: string[] = [];
            let keywordScore = 0;

            for (const kw of rule.keywords) {
                const normalizedKw = normalize(kw);
                if (normalizedDesc.includes(normalizedKw)) {
                    keywordScore += normalizedKw.length >= 6 ? 3 : normalizedKw.length >= 4 ? 2 : 1;
                    matchedKeywords.push(kw);
                }
            }

            if (keywordScore > 0) {
                const account = findMatchingCategory(rule.categoryNameFragments, categories, filterType);
                if (account) {
                    const existing = scored.get(account.id);
                    if (existing) {
                        existing.score += keywordScore;
                    } else {
                        scored.set(account.id, {
                            account,
                            score: keywordScore,
                            reason: matchedKeywords.slice(0, 2).join(", "),
                        });
                    }
                }
            }
        }

        // 2. Score por similaridade direta com nome da categoria
        for (const cat of categories) {
            if (filterType && cat.type !== filterType) continue;

            const normalizedName = normalize(cat.name);
            const nameWords = normalizedName.split(" ").filter(w => w.length > 2);

            let nameScore = 0;
            const matchedWords: string[] = [];

            for (const word of nameWords) {
                if (normalizedDesc.includes(word)) {
                    nameScore += word.length >= 5 ? 2 : 1;
                    matchedWords.push(word);
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
                        reason: matchedWords.slice(0, 2).join(", "),
                    });
                }
            }
        }

        // Sort by score descending, take top 3
        const result = Array.from(scored.values());
        result.sort((a, b) => b.score - a.score);
        return result.slice(0, 3);
    }, [description, categories, filterType, externalSuggestions]);

    return { suggestions };
}
