import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useToast } from "@/components/ui/use-toast";

/**
 * Regras padrão de matching por palavras-chave.
 * Mapeiam descrições bancárias → contas do plano de contas.
 * Keywords são testadas com lógica OR (qualquer uma basta).
 */
export const DEFAULT_KEYWORD_RULES: {
    accountCode: string;
    accountName: string;
    keywords: string[];
    confidence: number; // 50-100
    action: "auto" | "suggest";
}[] = [
    // ===== RECEITAS =====
    { accountCode: "1.1.01", accountName: "Consultas Médicas", keywords: ["CONSULTA", "ATENDIMENTO", "AVALIACAO"], confidence: 95, action: "suggest" },
    { accountCode: "1.1.02", accountName: "Transplante Capilar — Sinal", keywords: ["SINAL", "ENTRADA TRANSPLANTE", "RESERVA CIRURGIA"], confidence: 95, action: "suggest" },
    { accountCode: "1.1.03", accountName: "Transplante Capilar — Parcela/Restante", keywords: ["RESTANTE TRANSPLANTE", "PARCELA TRANSPLANTE", "CIRURGIA"], confidence: 95, action: "suggest" },
    { accountCode: "1.1.04", accountName: "Protocolo MMP — Pacote 3 Sessões", keywords: ["PROTOCOLO MMP", "PACOTE SESSAO", "MMP 3 SESSOES"], confidence: 95, action: "suggest" },
    { accountCode: "1.1.05", accountName: "Protocolo MMP — Sessão Avulsa", keywords: ["MMP AVULSO", "SESSAO AVULSA", "MMP INDIVIDUAL"], confidence: 95, action: "suggest" },
    { accountCode: "1.2.01", accountName: "Minoxidil e Derivados", keywords: ["MINOXIDIL", "MINOX", "PANT MINOXIDIL"], confidence: 95, action: "suggest" },
    { accountCode: "1.2.02", accountName: "Dutasterida / Finasterida", keywords: ["DUTASTERIDA", "FINASTERIDA", "DUTAS"], confidence: 95, action: "suggest" },
    { accountCode: "1.2.03", accountName: "Suplementos Vitamínicos", keywords: ["SUPLEMENTO", "VITAMINA", "CAPSULA", "TRIO VITAMINA"], confidence: 95, action: "suggest" },
    { accountCode: "1.2.04", accountName: "Shampoos e Cosméticos", keywords: ["SHAMPOO", "CLEAR", "COSMETICO", "HIGIENE CAPILAR"], confidence: 95, action: "suggest" },
    { accountCode: "1.2.05", accountName: "Kits de Produtos / Pós-operatório", keywords: ["KIT PRODUTOS", "KIT POS OPERATORIO", "KIT TRATAMENTO"], confidence: 95, action: "suggest" },
    { accountCode: "1.3.01", accountName: "Crédito de Maquininha / Stone", keywords: ["CRED DOM", "STONE", "ARRANJO CREDITO", "MAQUININHA"], confidence: 95, action: "auto" },

    // ===== DEDUÇÕES =====
    { accountCode: "2.1.01", accountName: "DARF / IR Trimestral", keywords: ["DARF", "IMPOSTO TRIMESTRAL", "IR TRIMESTRAL"], confidence: 95, action: "auto" },
    { accountCode: "2.1.02", accountName: "DAM / ISS Municipal", keywords: ["DAM", "ISS", "TAXA MUNICIPAL"], confidence: 95, action: "auto" },
    { accountCode: "2.1.03", accountName: "PIS", keywords: ["PIS", "PIS PASEP"], confidence: 95, action: "auto" },
    { accountCode: "2.1.04", accountName: "IPTU", keywords: ["IPTU", "IMPOSTO PREDIAL"], confidence: 95, action: "auto" },

    // ===== CSP =====
    { accountCode: "3.1.02", accountName: "Equipe Cirúrgica", keywords: ["EQUIPE CIRURGICA", "TECNICO CIRURGIA", "AUXILIAR CIRURGICO"], confidence: 95, action: "suggest" },
    { accountCode: "3.1.04", accountName: "Comissões Comerciais", keywords: ["COMISSAO", "COMISSAO COMERCIAL", "COMISSAO VENDA"], confidence: 95, action: "suggest" },
    { accountCode: "3.1.05", accountName: "Frete / SEDEX", keywords: ["SEDEX", "CORREIOS", "FRETE", "ENTREGA"], confidence: 95, action: "auto" },

    // ===== DESPESAS COM PESSOAL =====
    { accountCode: "4.1.01", accountName: "Salários e Ordenados", keywords: ["SALARIO", "FOLHA", "PAGAMENTO FUNCIONARIO"], confidence: 95, action: "auto" },
    { accountCode: "4.1.02", accountName: "Adiantamento Salarial", keywords: ["ADIANTAMENTO", "ADIANT"], confidence: 70, action: "suggest" },
    { accountCode: "4.1.03", accountName: "Rescisão / Verbas Rescisórias", keywords: ["RESCISAO", "VERBAS RESCISORIAS", "ACERTO FINAL"], confidence: 70, action: "suggest" },
    { accountCode: "4.1.04", accountName: "INSS Patronal", keywords: ["INSS", "GPS", "PREVIDENCIA SOCIAL", "INSS PATRONAL"], confidence: 95, action: "auto" },
    { accountCode: "4.1.05", accountName: "Vale Transporte", keywords: ["VALE TRANSPORTE", "VT", "TRANSPORTE FUNCIONARIO"], confidence: 95, action: "auto" },
    { accountCode: "4.1.06", accountName: "Plano de Saúde", keywords: ["PLANO SAUDE", "ASSISTENCIA MEDICA", "UNIMED", "AMIL"], confidence: 95, action: "auto" },
    { accountCode: "4.1.07", accountName: "Honorários — Contabilidade", keywords: ["CONTABILIDADE", "CONTADOR", "REAL CONTABILIDADE"], confidence: 95, action: "auto" },
    { accountCode: "4.1.08", accountName: "Honorários — Consultoria/BPO", keywords: ["TATICA GESTAO", "BPO FINANCEIRO", "TATICA EMPRESARIAL"], confidence: 95, action: "auto" },
    { accountCode: "4.1.09", accountName: "Honorários — Outros", keywords: ["HONORARIOS", "RAPHAELA", "SPADONE", "PROFISSIONAL AUTONOMO"], confidence: 95, action: "auto" },

    // ===== DESPESAS ADMINISTRATIVAS =====
    { accountCode: "4.2.01", accountName: "Aluguel e Condomínio", keywords: ["ALUGUEL", "CONDOMINIO", "LOCACAO"], confidence: 95, action: "auto" },
    { accountCode: "4.2.02", accountName: "Energia Elétrica", keywords: ["ENERGIA", "CEMIG", "COPEL", "LUZ", "METADE ENERGIA"], confidence: 95, action: "auto" },
    { accountCode: "4.2.03", accountName: "Telefone e Internet — Empresa", keywords: ["VIVO CLINICA", "CLARO EMPRESA", "ALARES", "INTERNET EMPRESA"], confidence: 95, action: "auto" },
    { accountCode: "4.2.04", accountName: "Telefone — Uso Pessoal", keywords: ["VIVO PESSOAL", "CELULAR PESSOAL"], confidence: 95, action: "auto" },
    { accountCode: "4.2.05", accountName: "Softwares e Assinaturas SaaS", keywords: ["RD STATION", "RD SISTEMAS", "OMIE", "SAAS", "ASSINATURA SISTEMA"], confidence: 95, action: "auto" },
    { accountCode: "4.2.06", accountName: "Marketing e Publicidade", keywords: ["MARKETING", "PUBLICIDADE", "GOOGLE ADS", "META ADS"], confidence: 70, action: "suggest" },
    { accountCode: "4.2.07", accountName: "Material de Escritório", keywords: ["PAPELARIA", "MATERIAL ESCRITORIO", "PASTA", "GRAFICA", "REGUA"], confidence: 70, action: "suggest" },
    { accountCode: "4.2.08", accountName: "Material de Limpeza", keywords: ["LIMPEZA", "HIGIENE", "PRODUTOS LIMPEZA", "NOEL", "MART MINAS"], confidence: 70, action: "suggest" },
    { accountCode: "4.2.09", accountName: "Uniformes e EPIs", keywords: ["UNIFORME", "BORDADO", "EPI", "FARDAMENTO"], confidence: 70, action: "suggest" },
    { accountCode: "4.2.10", accountName: "Resíduos e Descarte", keywords: ["PRO AMBIENTAL", "RESIDUO", "DESCARTE", "LIXO HOSPITALAR"], confidence: 95, action: "auto" },
    { accountCode: "4.2.11", accountName: "Reembolsos a Funcionários", keywords: ["REEMBOLSO", "REEMBOLSO BRUNA", "DESPESA REEMBOLSAVEL"], confidence: 70, action: "suggest" },
    { accountCode: "4.2.12", accountName: "Hospital / Procedimentos Externos", keywords: ["HOSPITAL UNIMED", "PROCEDIMENTO EXTERNO", "HOSPITAL PARCEIRO"], confidence: 70, action: "suggest" },

    // ===== DESPESAS VARIÁVEIS =====
    { accountCode: "4.3.01", accountName: "Manutenção e Reparos", keywords: ["MANUTENCAO", "REPARO", "ELETRICISTA", "OFICINA", "CONSERTO"], confidence: 70, action: "suggest" },
    { accountCode: "4.3.02", accountName: "Equipamentos e Utensílios", keywords: ["EQUIPAMENTO", "MAQUINA", "SINO COMERCIAL", "UTENSILIO"], confidence: 70, action: "suggest" },
    { accountCode: "4.3.03", accountName: "Higienização Especializada", keywords: ["HIGIENIZACAO SOFA", "LIMPEZA ESPECIALIZADA", "HIGIENIZACAO ESTOFADO"], confidence: 70, action: "suggest" },
    { accountCode: "4.3.04", accountName: "Embalagens e Expedição", keywords: ["SACOLA", "FITA SACOLA", "EMBALAGEM", "CAIXA ENVIO"], confidence: 70, action: "suggest" },

    // ===== DESPESAS FINANCEIRAS =====
    { accountCode: "4.4.01", accountName: "Juros sobre Empréstimos", keywords: ["JUROS", "JURO EMPRESTIMO", "ENCARGO FINANCEIRO"], confidence: 95, action: "auto" },
    { accountCode: "4.4.02", accountName: "Tarifas Bancárias", keywords: ["TARIFA BANCARIA", "TAXA BANCO", "MENSALIDADE CONTA"], confidence: 95, action: "auto" },
    { accountCode: "4.4.03", accountName: "Parcela de Empréstimo", keywords: ["PARCELA EMPRESTIMO", "AMORTIZACAO", "PARCELAMENTO EMPRESTIMO"], confidence: 95, action: "auto" },
    { accountCode: "4.4.05", accountName: "Taxas de Maquininha", keywords: ["MERCADO PAGO", "TAXA MAQUININHA", "MDR", "ANTECIPACAO RECEBIVEL"], confidence: 95, action: "auto" },

    // ===== RESULTADO =====
    { accountCode: "5.1.01", accountName: "Antecipação de Lucros / Retirada", keywords: ["ANTECIPACAO LUCRO", "RETIRADA SOCIO", "PRO-LABORE", "DISTRIBUICAO"], confidence: 95, action: "suggest" },
];

/**
 * Hook para popular regras padrão de conciliação a partir das keywords da clínica.
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

            // 1. Buscar contas do plano de contas desta empresa
            const { data: accounts, error: accError } = await (activeClient as any)
                .from("chart_of_accounts")
                .select("id, code, name")
                .eq("company_id", selectedCompany.id);

            if (accError) throw accError;

            const codeToId = new Map<string, string>();
            (accounts || []).forEach((a: any) => codeToId.set(a.code, a.id));

            // 2. Verificar regras existentes para não duplicar
            const { data: existingRules } = await (activeClient as any)
                .from("conciliation_rules")
                .select("condition_value")
                .eq("company_id", selectedCompany.id)
                .eq("is_auto_learned", false);

            const existingValues = new Set(
                (existingRules || []).map((r: any) => r.condition_value?.toLowerCase())
            );

            // 3. Criar regras
            const rulesToInsert: any[] = [];

            for (const rule of DEFAULT_KEYWORD_RULES) {
                // Para cada keyword, criar uma regra separada
                for (const keyword of rule.keywords) {
                    if (existingValues.has(keyword.toLowerCase())) continue;

                    rulesToInsert.push({
                        company_id: selectedCompany.id,
                        condition_field: "description",
                        condition_operator: "contains",
                        condition_value: keyword,
                        action_type: rule.action === "auto" ? "create_payable" : "create_receivable",
                        action_value: codeToId.get(rule.accountCode) || null,
                        action_description: `${rule.accountCode} - ${rule.accountName}`,
                        name: `${rule.accountName}: ${keyword}`,
                        confidence: rule.confidence,
                        times_applied: 0,
                        is_active: true,
                        is_auto_learned: false,
                        source_description: `Regra padrão da clínica — ${rule.accountCode}`,
                    });
                }
            }

            if (rulesToInsert.length === 0) {
                return { inserted: 0, skipped: DEFAULT_KEYWORD_RULES.length };
            }

            // Insert in batches of 50
            let inserted = 0;
            for (let i = 0; i < rulesToInsert.length; i += 50) {
                const batch = rulesToInsert.slice(i, i + 50);
                const { error } = await (activeClient as any)
                    .from("conciliation_rules")
                    .insert(batch);

                if (error) {
                    console.error("Batch insert error:", error);
                    throw error;
                }
                inserted += batch.length;
            }

            return { inserted, skipped: 0 };
        },
        onSuccess: (result) => {
            toast({
                title: "Regras aplicadas!",
                description: `${result.inserted} regras de matching criadas com sucesso.`,
            });
            queryClient.invalidateQueries({ queryKey: ["conciliation_rules"] });
        },
        onError: (err: any) => {
            toast({
                title: "Erro ao aplicar regras",
                description: err.message,
                variant: "destructive",
            });
        },
    });

    return { seedDefaultRules, rulesCount: DEFAULT_KEYWORD_RULES.reduce((acc, r) => acc + r.keywords.length, 0) };
}
