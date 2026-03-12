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

// Mapa de palavras-chave -> categorias do plano de contas (por código)
// Cada entrada mapeia termos comuns em descrições financeiras para o código correspondente
const KEYWORD_MAP: Record<string, string[]> = {
    // 1.01 Receita de Vendas
    "1.01": ["venda", "vendas", "mercadoria", "produto", "loja", "comercio", "comércio", "nf", "nota fiscal", "faturamento", "receita venda"],
    // 1.02 Receita de Serviços
    "1.02": ["serviço", "servico", "servicos", "serviços", "consultoria", "assessoria", "honorário", "honorarios", "prestação", "prestacao", "nfse", "comissão", "comissao", "royalties"],
    // 2.01.01 Aluguel e Condomínio
    "2.01.01": ["aluguel", "aluguéis", "alugueis", "condomínio", "condominio", "locação", "locacao", "imóvel", "imovel", "sala", "galpão", "galpao", "iptu"],
    // 2.01.02 Energia Elétrica
    "2.01.02": ["energia", "elétrica", "eletrica", "luz", "cemig", "cpfl", "enel", "eletropaulo", "copel", "celesc", "energisa", "equatorial", "neoenergia", "kwh"],
    // 2.01.03 Internet e Telefone
    "2.01.03": ["internet", "telefone", "telefonia", "celular", "plano", "fibra", "banda larga", "wi-fi", "wifi", "vivo", "claro", "tim", "oi", "net", "algar", "totvs"],
    // 2.02.01 Salários e Ordenados
    "2.02.01": ["salário", "salario", "salarios", "salários", "folha", "pagamento funcionário", "funcionario", "encargos", "fgts", "inss", "férias", "ferias", "13o", "décimo", "decimo", "rescisão", "rescisao", "vale transporte", "vale refeição", "vt", "vr", "va", "benefício", "beneficio", "holerite"],
    // 2.02.02 Pró-Labore
    "2.02.02": ["pró-labore", "pro-labore", "prolabore", "pro labore", "retirada sócio", "retirada socio", "sócio", "socio", "distribuição lucros", "distribuicao lucros", "dividendos"],
    // 2.03.01 Tarifas Bancárias
    "2.03.01": ["tarifa", "tarifas", "ted", "doc", "pix taxa", "manutenção conta", "manutencao conta", "anuidade", "taxa bancária", "taxa bancaria", "iof", "cesta serviços", "cesta servicos", "extrato", "custódia", "custodia"],
    // 2.03.02 Juros Passivos
    "2.03.02": ["juros", "mora", "multa atraso", "encargos financeiros", "financiamento", "empréstimo", "emprestimo", "parcela banco", "cdc", "spread"],
};

// Sinônimos adicionais para termos genéricos
const GENERIC_EXPENSE_KEYWORDS: Record<string, string> = {
    "material": "2.01.01",
    "escritório": "2.01.01",
    "escritorio": "2.01.01",
    "manutenção": "2.01.01",
    "manutencao": "2.01.01",
    "limpeza": "2.01.01",
    "contador": "2.01.01",
    "contabilidade": "2.01.01",
    "software": "2.01.03",
    "sistema": "2.01.03",
    "licença": "2.01.03",
    "licenca": "2.01.03",
    "assinatura": "2.01.03",
    "hospedagem": "2.01.03",
    "domínio": "2.01.03",
    "dominio": "2.01.03",
    "marketing": "2.01.01",
    "publicidade": "2.01.01",
    "propaganda": "2.01.01",
    "google": "2.01.03",
    "meta": "2.01.03",
    "facebook": "2.01.03",
    "combustível": "2.01.01",
    "combustivel": "2.01.01",
    "gasolina": "2.01.01",
    "uber": "2.01.01",
    "pedágio": "2.01.01",
    "pedagio": "2.01.01",
    "viagem": "2.01.01",
    "alimentação": "2.01.01",
    "alimentacao": "2.01.01",
    "refeição": "2.01.01",
    "refeicao": "2.01.01",
    "seguro": "2.01.01",
    "correios": "2.01.01",
    "frete": "2.01.01",
    "transporte": "2.01.01",
    "água": "2.01.02",
    "agua": "2.01.02",
    "saneamento": "2.01.02",
    "gás": "2.01.02",
    "gas": "2.01.02",
};

function normalize(text: string): string {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function scoreCategory(description: string, code: string, keywords: string[]): { score: number; matched: string[] } {
    const normalizedDesc = normalize(description);
    const matched: string[] = [];
    let score = 0;

    for (const kw of keywords) {
        const normalizedKw = normalize(kw);
        if (normalizedDesc.includes(normalizedKw)) {
            // Longer keyword matches are worth more
            const kwScore = normalizedKw.length >= 6 ? 3 : normalizedKw.length >= 4 ? 2 : 1;
            score += kwScore;
            matched.push(kw);
        }
    }

    return { score, matched };
}

export function useCategorySuggestion(
    description: string,
    categories: ChartAccount[],
    filterType?: "receita" | "despesa"
) {
    const suggestions = useMemo<ScoredCategory[]>(() => {
        if (!description || description.length < 3 || !categories?.length) return [];

        const normalizedDesc = normalize(description);
        const scored: ScoredCategory[] = [];

        // Build a code -> account map
        const codeMap = new Map<string, ChartAccount>();
        for (const cat of categories) {
            codeMap.set(cat.code, cat);
        }

        // Score by keyword map
        for (const [code, keywords] of Object.entries(KEYWORD_MAP)) {
            const account = codeMap.get(code);
            if (!account) continue;
            if (filterType && account.type !== filterType) continue;

            const { score, matched } = scoreCategory(description, code, keywords);
            if (score > 0) {
                scored.push({
                    account,
                    score,
                    reason: matched.slice(0, 2).join(", "),
                });
            }
        }

        // Score by generic keywords
        for (const [keyword, code] of Object.entries(GENERIC_EXPENSE_KEYWORDS)) {
            const normalizedKw = normalize(keyword);
            if (!normalizedDesc.includes(normalizedKw)) continue;

            const account = codeMap.get(code);
            if (!account) continue;
            if (filterType && account.type !== filterType) continue;

            // Add score or boost existing
            const existing = scored.find(s => s.account.id === account.id);
            if (existing) {
                existing.score += 1;
            } else {
                scored.push({
                    account,
                    score: 1,
                    reason: keyword,
                });
            }
        }

        // Score by direct name similarity (fuzzy match against category name)
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
                const existing = scored.find(s => s.account.id === cat.id);
                if (existing) {
                    existing.score += nameScore;
                } else {
                    scored.push({
                        account: cat,
                        score: nameScore,
                        reason: matchedWords.slice(0, 2).join(", "),
                    });
                }
            }
        }

        // Sort by score descending, take top 3
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, 3);
    }, [description, categories, filterType]);

    return { suggestions };
}
