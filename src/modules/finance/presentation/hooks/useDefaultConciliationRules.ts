import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useToast } from "@/components/ui/use-toast";

/**
 * Regras padrão de matching por palavras-chave.
 * Baseadas no plano de contas v2 (grupos 1-8 + 0).
 * Keywords são testadas com lógica OR (qualquer uma basta).
 */
export const DEFAULT_KEYWORD_RULES: {
    accountCode: string;
    accountName: string;
    keywords: string[];
    confidence: number;
    action: "auto" | "suggest";
}[] = [
    // ══════════════════════════════════════════════════════════
    // GRUPO 1 — Receita operacional bruta
    // ══════════════════════════════════════════════════════════
    { accountCode: "1.1", accountName: "Receita de serviços prestados", keywords: [
        "RECEBIMENTO SERVICO", "PRESTACAO SERVICO", "NOTA FISCAL SERVICO",
    ], confidence: 70, action: "suggest" },
    { accountCode: "1.2", accountName: "Receita de venda de produtos", keywords: [
        "VENDA PRODUTO", "VENDA MERCADORIA", "RECEBIMENTO VENDA",
    ], confidence: 70, action: "suggest" },
    { accountCode: "1.3", accountName: "Outras receitas operacionais", keywords: [
        "CRED DOM", "CREDITO DOMICILIO", "STONE", "CIELO", "REDE", "GETNET", "PAGSEGURO",
        "ARRANJO CREDITO", "MAQUININHA", "DOMCRED", "DOMCREDITO",
        "RECEBIMENTO VENDAS", "CRED PIX", "CREDITO RECEBIMENTO",
        "RECEBIMENTO PIX", "CREDITO PIX",
    ], confidence: 95, action: "auto" },

    // ══════════════════════════════════════════════════════════
    // GRUPO 2 — Deduções da receita bruta
    // ══════════════════════════════════════════════════════════
    { accountCode: "2.1", accountName: "Impostos e contribuições s/ vendas", keywords: [
        "DARF", "DAS", "SIMPLES NACIONAL", "DOCUMENTO ARRECADACAO",
        "DAM", "ISS", "ICMS", "PIS", "COFINS", "CSLL", "IRPJ",
        "GPS", "PREVIDENCIA", "INSS",
        "IMPOSTO", "TRIBUTO", "ARRECADACAO FEDERAL",
        "TAXA MUNICIPAL", "TAXA ESTADUAL",
    ], confidence: 95, action: "auto" },
    { accountCode: "2.2", accountName: "Taxas de operadora / maquininha", keywords: [
        "TAXA MAQUININHA", "MDR", "ANTECIPACAO RECEBIVEL",
        "TAXA STONE", "TAXA CIELO", "TAXA REDE", "TAXA GETNET",
        "TARIFA OPERADORA", "DESCONTO MAQUININHA",
        "MERCADO PAGO", "TAXA MERCADO PAGO",
    ], confidence: 95, action: "auto" },
    { accountCode: "2.3", accountName: "Royalties e licença de software", keywords: [
        "ROYALTIES", "ROYALTY", "LICENCA SOFTWARE", "FRANQUIA ROYALTY",
    ], confidence: 70, action: "suggest" },

    // ══════════════════════════════════════════════════════════
    // GRUPO 3 — Custos dos serviços prestados (CSP)
    // ══════════════════════════════════════════════════════════
    { accountCode: "3.1", accountName: "Aluguel, condomínio, FPP", keywords: [
        "ALUGUEL", "CONDOMINIO", "LOCACAO", "FPP", "FUNDO PROMOCAO",
        "LUVA", "PONTO COMERCIAL",
    ], confidence: 95, action: "auto" },
    { accountCode: "3.2", accountName: "Pessoal — salários e encargos (CLT)", keywords: [
        "SALARIO", "FOLHA PAGAMENTO", "FOLHA SALARIAL",
        "13 SALARIO", "DECIMO TERCEIRO", "FERIAS",
        "FGTS", "RESCISAO", "VERBAS RESCISORIAS",
    ], confidence: 95, action: "auto" },
    { accountCode: "3.3", accountName: "Pessoal — estagiários", keywords: [
        "ESTAGIARIO", "BOLSA ESTAGIO", "CIEE", "IEL", "NUBE",
    ], confidence: 95, action: "auto" },
    { accountCode: "3.4", accountName: "Vale transporte", keywords: [
        "VALE TRANSPORTE", "VT ", "TRANSPORTE FUNCIONARIO", "BILHETE UNICO",
    ], confidence: 95, action: "auto" },
    { accountCode: "3.5", accountName: "Vale refeição / alimentação", keywords: [
        "VALE REFEICAO", "VALE ALIMENTACAO", "VR ", "VA ", "ALELO", "SODEXO", "TICKET",
        "IFOOD BENEFICIO", "FLASH BENEFICIO", "CAJU BENEFICIO",
    ], confidence: 95, action: "auto" },
    { accountCode: "3.6", accountName: "Licença de uso — software", keywords: [
        "OMIE", "TOTVS", "SAP", "SENIOR", "DOMINIO", "ALTERDATA",
        "SAAS", "ASSINATURA SISTEMA", "LICENCA SOFTWARE",
        "RD STATION", "HUBSPOT", "SALESFORCE",
    ], confidence: 95, action: "auto" },
    { accountCode: "3.7", accountName: "Manutenções, peças e outros", keywords: [
        "MANUTENCAO", "REPARO", "CONSERTO", "PECA", "MATERIAL MANUTENCAO",
        "ELETRICISTA", "ENCANADOR", "PINTOR",
    ], confidence: 70, action: "suggest" },
    { accountCode: "3.8", accountName: "Pró-labore + INSS", keywords: [
        "PRO LABORE", "PROLABORE", "PRO-LABORE", "RETIRADA SOCIO",
        "DISTRIBUICAO LUCRO", "ANTECIPACAO LUCRO",
    ], confidence: 95, action: "auto" },

    // ══════════════════════════════════════════════════════════
    // GRUPO 4 — Despesas operacionais
    // ══════════════════════════════════════════════════════════
    { accountCode: "4.1", accountName: "Despesas com materiais", keywords: [
        "MATERIAL", "PAPELARIA", "MATERIAL ESCRITORIO", "MATERIAL LIMPEZA",
        "EMBALAGEM", "SACOLA", "DESCARTAVEL",
    ], confidence: 70, action: "suggest" },
    { accountCode: "4.2", accountName: "Contador e outros serviços adm.", keywords: [
        "CONTABILIDADE", "CONTADOR", "ASSESSORIA CONTABIL",
        "ESCRITORIO CONTABIL", "HONORARIOS CONTABEIS",
        "ADVOCACIA", "ADVOGADO", "HONORARIOS ADVOCATICIOS",
        "CONSULTORIA", "BPO FINANCEIRO",
    ], confidence: 95, action: "auto" },
    { accountCode: "4.3", accountName: "Marketing e publicidade", keywords: [
        "MARKETING", "PUBLICIDADE", "GOOGLE ADS", "META ADS", "FACEBOOK ADS",
        "INSTAGRAM", "TIKTOK ADS", "AGENCIA MARKETING",
        "OUTDOOR", "PANFLETO", "BANNER",
    ], confidence: 70, action: "suggest" },
    { accountCode: "4.4", accountName: "Outras despesas operacionais", keywords: [
        "ENERGIA", "CEMIG", "COPEL", "ENEL", "LUZ", "ELETRICIDADE",
        "AGUA", "SANEAMENTO", "COPASA", "SABESP",
        "TELEFONE", "VIVO", "CLARO", "TIM", "OI", "ALARES", "INTERNET",
        "CORREIOS", "SEDEX", "FRETE",
        "SEGURO", "SEGURADORA", "PORTO SEGURO", "BRADESCO SEGUROS",
        "IPTU", "ALVARA", "LICENCA FUNCIONAMENTO",
    ], confidence: 85, action: "auto" },

    // ══════════════════════════════════════════════════════════
    // GRUPO 6 — Resultado financeiro
    // ══════════════════════════════════════════════════════════
    { accountCode: "6.1", accountName: "Juros recebidos / rendimentos", keywords: [
        "RENDIMENTO", "JUROS RECEBIDOS", "REMUNERACAO SALDO", "CDB",
        "APLICACAO RESGATADA", "RESGATE INVESTIMENTO",
    ], confidence: 85, action: "auto" },
    { accountCode: "6.2", accountName: "Juros pagos / encargos financeiros", keywords: [
        "JUROS", "ENCARGO FINANCEIRO", "JURO EMPRESTIMO",
        "JUROS MORA", "MULTA ATRASO",
    ], confidence: 85, action: "auto" },
    { accountCode: "6.3", accountName: "Tarifas bancárias", keywords: [
        "TARIFA", "TARIFA BANCARIA", "TAXA BANCO", "MENSALIDADE CONTA",
        "TARIFA DOC", "TARIFA TED", "TARIFA PIX", "PACOTE SERVICO",
        "TARIFA MANUT", "ANUIDADE CARTAO",
    ], confidence: 95, action: "auto" },
    { accountCode: "6.4", accountName: "IOF", keywords: [
        "IOF", "IMPOSTO OPERACAO FINANCEIRA",
    ], confidence: 95, action: "auto" },
    { accountCode: "6.5", accountName: "Multas e juros pagos", keywords: [
        "MULTA", "MULTA CONTRATUAL", "MULTA RESCISORIA",
    ], confidence: 70, action: "suggest" },

    // ══════════════════════════════════════════════════════════
    // GRUPO 7 — Atividades de investimento
    // ══════════════════════════════════════════════════════════
    { accountCode: "7.1", accountName: "Aquisição de ativos fixos", keywords: [
        "AQUISICAO IMOVEL", "COMPRA EQUIPAMENTO", "IMOBILIZADO",
        "ATIVO FIXO", "INVESTIMENTO ATIVO",
    ], confidence: 70, action: "suggest" },

    // ══════════════════════════════════════════════════════════
    // GRUPO 8 — Financiamentos e participações
    // ══════════════════════════════════════════════════════════
    { accountCode: "8.1", accountName: "Empréstimos captados", keywords: [
        "EMPRESTIMO CAPTADO", "CREDITO LIBERADO", "FINANCIAMENTO",
        "EMPRESTIMO BANCO", "LIBERACAO CREDITO",
    ], confidence: 70, action: "suggest" },
    { accountCode: "8.2", accountName: "Amortização de empréstimos", keywords: [
        "PARCELA EMPRESTIMO", "AMORTIZACAO", "PARCELAMENTO",
        "PRESTACAO FINANCIAMENTO",
    ], confidence: 95, action: "auto" },

    // ══════════════════════════════════════════════════════════
    // GRUPO 0 — Movimentações patrimoniais
    // ══════════════════════════════════════════════════════════
    { accountCode: "0.1", accountName: "Transferência entre contas", keywords: [
        "TRANSFERENCIA ENTRE CONTAS", "TED MESMA TITULARIDADE",
        "PIX MESMA TITULARIDADE", "TRANSF INTERNA",
    ], confidence: 95, action: "auto" },
    { accountCode: "0.2", accountName: "Aplicação / resgate investimento", keywords: [
        "APLICACAO", "RESGATE", "CDB", "LCI", "LCA", "TESOURO DIRETO",
        "POUPANCA", "INVESTIMENTO",
    ], confidence: 85, action: "auto" },
];

/**
 * Hook para popular regras padrão de conciliação.
 * Busca as contas do plano de contas pelo código e cria regras associadas.
 */
export function useDefaultConciliationRules() {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const seedDefaultRules = useMutation({
        mutationFn: async () => {
            if (!selectedCompany?.id) throw new Error("Empresa não selecionada");

            const { data: accounts, error: accError } = await (activeClient as any)
                .from("chart_of_accounts")
                .select("id, code, name")
                .eq("company_id", selectedCompany.id);

            if (accError) throw accError;

            const codeToId = new Map<string, string>();
            (accounts || []).forEach((a: any) => codeToId.set(a.code, a.id));

            const { data: existingRules } = await (activeClient as any)
                .from("conciliation_rules")
                .select("palavras_chave")
                .eq("company_id", selectedCompany.id)
                .eq("ativa", true);

            const existingKeywords = new Set<string>();
            for (const r of (existingRules || []) as any[]) {
                for (const kw of (r.palavras_chave || [])) {
                    existingKeywords.add(kw.toUpperCase());
                }
            }

            const rulesToInsert: any[] = [];

            for (const rule of DEFAULT_KEYWORD_RULES) {
                const newKeywords = rule.keywords.filter(kw => !existingKeywords.has(kw.toUpperCase()));
                if (newKeywords.length === 0) continue;

                rulesToInsert.push({
                    company_id: selectedCompany.id,
                    account_id: codeToId.get(rule.accountCode) || null,
                    palavras_chave: newKeywords,
                    confianca: rule.confidence >= 85 ? "Alta" : rule.confidence >= 65 ? "Média" : "Baixa",
                    acao: rule.action === "auto" ? "auto-conciliar" : "sugerir",
                    ativa: true,
                });
            }

            if (rulesToInsert.length === 0) {
                return { inserted: 0, skipped: DEFAULT_KEYWORD_RULES.length };
            }

            let inserted = 0;
            for (let i = 0; i < rulesToInsert.length; i += 50) {
                const batch = rulesToInsert.slice(i, i + 50);
                const { error } = await (activeClient as any)
                    .from("conciliation_rules")
                    .insert(batch);
                if (error) throw error;
                inserted += batch.length;
            }

            return { inserted, skipped: 0 };
        },
        onSuccess: (result) => {
            toast({ title: "Regras aplicadas!", description: `${result.inserted} regras criadas.` });
            queryClient.invalidateQueries({ queryKey: ["conciliation_rules"] });
        },
        onError: (err: any) => {
            toast({ title: "Erro ao aplicar regras", description: err.message, variant: "destructive" });
        },
    });

    return { seedDefaultRules, rulesCount: DEFAULT_KEYWORD_RULES.length };
}
