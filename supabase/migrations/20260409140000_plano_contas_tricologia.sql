-- ============================================================
-- PLANO DE CONTAS — TRICOLOGIA AC LTDA
-- Cria empresa + estrutura em 3 níveis para clínica de tricologia
-- ============================================================

DO $$
DECLARE
  v_company_id UUID;
BEGIN

  -- 0. Criar empresa se não existir (trigger handle_new_company vincula aos usuários)
  SELECT id INTO v_company_id
  FROM public.companies
  WHERE cnpj = '62.123.936/0001-67'
  LIMIT 1;

  IF v_company_id IS NULL THEN
    INSERT INTO public.companies (razao_social, nome_fantasia, cnpj, is_active)
    VALUES ('TRICOLOGIA AC LTDA', 'Tricologia', '62.123.936/0001-67', true)
    RETURNING id INTO v_company_id;
    RAISE NOTICE 'Empresa TRICOLOGIA AC LTDA criada com id %', v_company_id;
  ELSE
    RAISE NOTICE 'Empresa TRICOLOGIA AC LTDA já existe com id %', v_company_id;
  END IF;

  -- 1. Limpar plano antigo (se houver)
  DELETE FROM public.chart_of_accounts WHERE company_id = v_company_id;

  -- 2. INSERIR plano de contas completo
  INSERT INTO public.chart_of_accounts
    (company_id, code, name, level, account_type, account_nature,
     is_analytical, is_synthetic, accepts_manual_entry,
     show_in_dre, dre_group, dre_order, reference_code, status)
  VALUES

  -- ══════════════════════════════════════════════════════════════
  -- GRUPO 1 — RECEITAS
  -- ══════════════════════════════════════════════════════════════
  (v_company_id, '1', 'Receitas',
   1, 'revenue', 'credit', false, true, false,
   true, 'receita_bruta', 100, 'DFC:Operacional', 'active'),

  -- 1.1 Receita Bruta de Serviços
  (v_company_id, '1.1', 'Receita Bruta de Serviços',
   2, 'revenue', 'credit', false, true, false,
   true, 'receita_bruta', 110, 'DFC:Operacional', 'active'),

  (v_company_id, '1.1.01', 'Consultas Médicas',
   3, 'revenue', 'credit', true, false, true,
   true, 'receita_bruta', 111, 'DFC:Operacional', 'active'),

  (v_company_id, '1.1.02', 'Trio de Vitaminas',
   3, 'revenue', 'credit', true, false, true,
   true, 'receita_bruta', 112, 'DFC:Operacional', 'active'),

  (v_company_id, '1.1.03', 'Soroterapia',
   3, 'revenue', 'credit', true, false, true,
   true, 'receita_bruta', 113, 'DFC:Operacional', 'active'),

  (v_company_id, '1.1.04', 'Vitamina D',
   3, 'revenue', 'credit', true, false, true,
   true, 'receita_bruta', 114, 'DFC:Operacional', 'active'),

  (v_company_id, '1.1.05', 'Fator de Crescimento',
   3, 'revenue', 'credit', true, false, true,
   true, 'receita_bruta', 115, 'DFC:Operacional', 'active'),

  (v_company_id, '1.1.06', 'Dutasterida',
   3, 'revenue', 'credit', true, false, true,
   true, 'receita_bruta', 116, 'DFC:Operacional', 'active'),

  (v_company_id, '1.1.07', 'Protocolo MM 6',
   3, 'revenue', 'credit', true, false, true,
   true, 'receita_bruta', 117, 'DFC:Operacional', 'active'),

  (v_company_id, '1.1.08', 'Protocolo MM 3',
   3, 'revenue', 'credit', true, false, true,
   true, 'receita_bruta', 118, 'DFC:Operacional', 'active'),

  (v_company_id, '1.1.09', 'Protocolo Avulso',
   3, 'revenue', 'credit', true, false, true,
   true, 'receita_bruta', 119, 'DFC:Operacional', 'active'),

  -- 1.2 Receita Bruta de Produtos
  (v_company_id, '1.2', 'Receita Bruta de Produtos',
   2, 'revenue', 'credit', false, true, false,
   true, 'receita_bruta', 120, 'DFC:Operacional', 'active'),

  (v_company_id, '1.2.01', 'Minoxidil e Derivados',
   3, 'revenue', 'credit', true, false, true,
   true, 'receita_bruta', 121, 'DFC:Operacional', 'active'),

  (v_company_id, '1.2.02', 'Dutasterida / Finasterida',
   3, 'revenue', 'credit', true, false, true,
   true, 'receita_bruta', 122, 'DFC:Operacional', 'active'),

  (v_company_id, '1.2.03', 'Suplementos Vitamínicos',
   3, 'revenue', 'credit', true, false, true,
   true, 'receita_bruta', 123, 'DFC:Operacional', 'active'),

  (v_company_id, '1.2.04', 'Shampoos e Cosméticos',
   3, 'revenue', 'credit', true, false, true,
   true, 'receita_bruta', 124, 'DFC:Operacional', 'active'),

  (v_company_id, '1.2.05', 'Kits de Produtos / Pós-operatório',
   3, 'revenue', 'credit', true, false, true,
   true, 'receita_bruta', 125, 'DFC:Operacional', 'active'),

  -- 1.3 Outras Receitas
  (v_company_id, '1.3', 'Outras Receitas',
   2, 'revenue', 'credit', false, true, false,
   true, 'outras_receitas', 130, 'DFC:Operacional', 'active'),

  (v_company_id, '1.3.01', 'Crédito de Maquininha / Recebimentos Stone',
   3, 'revenue', 'credit', true, false, true,
   true, 'outras_receitas', 131, 'DFC:Operacional', 'active'),

  (v_company_id, '1.3.02', 'Outras Receitas Diversas',
   3, 'revenue', 'credit', true, false, true,
   true, 'outras_receitas', 132, 'DFC:Operacional', 'active'),

  (v_company_id, '1.3.03', 'Estornos',
   3, 'revenue', 'credit', true, false, true,
   true, 'outras_receitas', 133, 'DFC:Operacional', 'active'),

  -- ══════════════════════════════════════════════════════════════
  -- GRUPO 2 — DEDUÇÕES DA RECEITA
  -- ══════════════════════════════════════════════════════════════
  (v_company_id, '2', 'Deduções da Receita',
   1, 'expense', 'debit', false, true, false,
   true, 'deducoes', 200, 'DFC:Operacional', 'active'),

  -- 2.1 Despesas com Equipe Cirúrgica
  (v_company_id, '2.1', 'Despesas com Equipe Cirúrgica',
   2, 'expense', 'debit', false, true, false,
   true, 'deducoes', 210, 'DFC:Operacional', 'active'),

  (v_company_id, '2.1.01', 'Passagem Aérea',
   3, 'expense', 'debit', true, false, true,
   true, 'deducoes', 211, 'DFC:Operacional', 'active'),

  (v_company_id, '2.1.02', 'Passagem de Ônibus',
   3, 'expense', 'debit', true, false, true,
   true, 'deducoes', 212, 'DFC:Operacional', 'active'),

  (v_company_id, '2.1.03', 'Hotel',
   3, 'expense', 'debit', true, false, true,
   true, 'deducoes', 213, 'DFC:Operacional', 'active'),

  (v_company_id, '2.1.04', 'Alimentação',
   3, 'expense', 'debit', true, false, true,
   true, 'deducoes', 214, 'DFC:Operacional', 'active'),

  (v_company_id, '2.1.05', 'Transporte',
   3, 'expense', 'debit', true, false, true,
   true, 'deducoes', 215, 'DFC:Operacional', 'active'),

  -- 2.2 Impostos e Taxas
  (v_company_id, '2.2', 'Impostos e Taxas',
   2, 'expense', 'debit', false, true, false,
   true, 'deducoes', 220, 'DFC:Operacional', 'active'),

  (v_company_id, '2.2.01', 'DARF / Imposto Trimestral IR',
   3, 'expense', 'debit', true, false, true,
   true, 'deducoes', 221, 'DFC:Operacional', 'active'),

  (v_company_id, '2.2.02', 'DAM / ISS Municipal',
   3, 'expense', 'debit', true, false, true,
   true, 'deducoes', 222, 'DFC:Operacional', 'active'),

  (v_company_id, '2.2.03', 'PIS',
   3, 'expense', 'debit', true, false, true,
   true, 'deducoes', 223, 'DFC:Operacional', 'active'),

  (v_company_id, '2.2.04', 'IPTU',
   3, 'expense', 'debit', true, false, true,
   true, 'deducoes', 224, 'DFC:Operacional', 'active'),

  (v_company_id, '2.2.05', 'DAS',
   3, 'expense', 'debit', true, false, true,
   true, 'deducoes', 225, 'DFC:Operacional', 'active'),

  (v_company_id, '2.2.06', 'ICMS',
   3, 'expense', 'debit', true, false, true,
   true, 'deducoes', 226, 'DFC:Operacional', 'active'),

  -- ══════════════════════════════════════════════════════════════
  -- GRUPO 3 — CUSTOS DOS SERVIÇOS PRESTADOS (CSP)
  -- ══════════════════════════════════════════════════════════════
  (v_company_id, '3', 'Custos dos Serviços Prestados (CSP)',
   1, 'cost', 'debit', false, true, false,
   true, 'custos', 300, 'DFC:Operacional', 'active'),

  -- 3.1 Custos Diretos
  (v_company_id, '3.1', 'Custos Diretos',
   2, 'cost', 'debit', false, true, false,
   true, 'custos', 310, 'DFC:Operacional', 'active'),

  (v_company_id, '3.1.01', 'Comissão / Honorário Técnico / Médico',
   3, 'cost', 'debit', true, false, true,
   true, 'custos', 311, 'DFC:Operacional', 'active'),

  (v_company_id, '3.1.02', 'Equipe Cirúrgica',
   3, 'cost', 'debit', true, false, true,
   true, 'custos', 312, 'DFC:Operacional', 'active'),

  (v_company_id, '3.1.03', 'Compra de Mercadorias para Revenda',
   3, 'cost', 'debit', true, false, true,
   true, 'custos', 313, 'DFC:Operacional', 'active'),

  (v_company_id, '3.1.04', 'Comissões Comerciais',
   3, 'cost', 'debit', true, false, true,
   true, 'custos', 314, 'DFC:Operacional', 'active'),

  (v_company_id, '3.1.05', 'Frete / SEDEX',
   3, 'cost', 'debit', true, false, true,
   true, 'custos', 315, 'DFC:Operacional', 'active'),

  -- ══════════════════════════════════════════════════════════════
  -- GRUPO 4 — DESPESAS OPERACIONAIS
  -- ══════════════════════════════════════════════════════════════
  (v_company_id, '4', 'Despesas Operacionais',
   1, 'expense', 'debit', false, true, false,
   true, 'despesas_operacionais', 400, 'DFC:Operacional', 'active'),

  -- 4.1 Despesas com Pessoal
  (v_company_id, '4.1', 'Despesas com Pessoal',
   2, 'expense', 'debit', false, true, false,
   true, 'despesas_operacionais', 410, 'DFC:Operacional', 'active'),

  (v_company_id, '4.1.01', 'Salários e Ordenados',
   3, 'expense', 'debit', true, false, true,
   true, 'despesas_operacionais', 411, 'DFC:Operacional', 'active'),

  (v_company_id, '4.1.02', 'Adiantamento Salarial',
   3, 'expense', 'debit', true, false, true,
   true, 'despesas_operacionais', 412, 'DFC:Operacional', 'active'),

  (v_company_id, '4.1.03', 'Rescisão / Verbas Rescisórias',
   3, 'expense', 'debit', true, false, true,
   true, 'despesas_operacionais', 413, 'DFC:Operacional', 'active'),

  (v_company_id, '4.1.04', 'INSS Patronal',
   3, 'expense', 'debit', true, false, true,
   true, 'despesas_operacionais', 414, 'DFC:Operacional', 'active'),

  (v_company_id, '4.1.05', 'Vale Transporte',
   3, 'expense', 'debit', true, false, true,
   true, 'despesas_operacionais', 415, 'DFC:Operacional', 'active'),

  (v_company_id, '4.1.06', 'Plano de Saúde / Assistência Médica',
   3, 'expense', 'debit', true, false, true,
   true, 'despesas_operacionais', 416, 'DFC:Operacional', 'active'),

  (v_company_id, '4.1.07', 'RH Terceirizado',
   3, 'expense', 'debit', true, false, true,
   true, 'despesas_operacionais', 417, 'DFC:Operacional', 'active'),

  -- 4.2 Despesas Administrativas
  (v_company_id, '4.2', 'Despesas Administrativas',
   2, 'expense', 'debit', false, true, false,
   true, 'despesas_operacionais', 420, 'DFC:Operacional', 'active'),

  (v_company_id, '4.2.01', 'Aluguel e Condomínio',
   3, 'expense', 'debit', true, false, true,
   true, 'despesas_operacionais', 421, 'DFC:Operacional', 'active'),

  (v_company_id, '4.2.02', 'Energia Elétrica',
   3, 'expense', 'debit', true, false, true,
   true, 'despesas_operacionais', 422, 'DFC:Operacional', 'active'),

  (v_company_id, '4.2.03', 'Telefone e Internet — Empresa',
   3, 'expense', 'debit', true, false, true,
   true, 'despesas_operacionais', 423, 'DFC:Operacional', 'active'),

  (v_company_id, '4.2.04', 'Telefone — Uso Pessoal / Outros',
   3, 'expense', 'debit', true, false, true,
   true, 'despesas_operacionais', 424, 'DFC:Operacional', 'active'),

  (v_company_id, '4.2.05', 'Softwares e Assinaturas SaaS',
   3, 'expense', 'debit', true, false, true,
   true, 'despesas_operacionais', 425, 'DFC:Operacional', 'active'),

  (v_company_id, '4.2.06', 'Marketing e Publicidade',
   3, 'expense', 'debit', true, false, true,
   true, 'despesas_operacionais', 426, 'DFC:Operacional', 'active'),

  (v_company_id, '4.2.07', 'Material de Escritório / Papelaria',
   3, 'expense', 'debit', true, false, true,
   true, 'despesas_operacionais', 427, 'DFC:Operacional', 'active'),

  (v_company_id, '4.2.08', 'Material de Limpeza e Higiene',
   3, 'expense', 'debit', true, false, true,
   true, 'despesas_operacionais', 428, 'DFC:Operacional', 'active'),

  (v_company_id, '4.2.09', 'Uniformes e EPIs',
   3, 'expense', 'debit', true, false, true,
   true, 'despesas_operacionais', 429, 'DFC:Operacional', 'active'),

  (v_company_id, '4.2.10', 'Resíduos e Descarte (Pró Ambiental)',
   3, 'expense', 'debit', true, false, true,
   true, 'despesas_operacionais', 430, 'DFC:Operacional', 'active'),

  (v_company_id, '4.2.11', 'Reembolsos a Funcionários',
   3, 'expense', 'debit', true, false, true,
   true, 'despesas_operacionais', 431, 'DFC:Operacional', 'active'),

  (v_company_id, '4.2.12', 'Honorários — Contabilidade',
   3, 'expense', 'debit', true, false, true,
   true, 'despesas_operacionais', 432, 'DFC:Operacional', 'active'),

  (v_company_id, '4.2.13', 'Honorários — Consultoria / BPO (Tática)',
   3, 'expense', 'debit', true, false, true,
   true, 'despesas_operacionais', 433, 'DFC:Operacional', 'active'),

  (v_company_id, '4.2.14', 'Mentoria',
   3, 'expense', 'debit', true, false, true,
   true, 'despesas_operacionais', 434, 'DFC:Operacional', 'active'),

  (v_company_id, '4.2.15', 'Serviços Jurídicos e de Propriedade Intelectual',
   3, 'expense', 'debit', true, false, true,
   true, 'despesas_operacionais', 435, 'DFC:Operacional', 'active'),

  -- 4.3 Despesas Variáveis / Manutenção
  (v_company_id, '4.3', 'Despesas Variáveis / Manutenção',
   2, 'expense', 'debit', false, true, false,
   true, 'despesas_operacionais', 440, 'DFC:Operacional', 'active'),

  (v_company_id, '4.3.01', 'Manutenção e Reparos',
   3, 'expense', 'debit', true, false, true,
   true, 'despesas_operacionais', 441, 'DFC:Operacional', 'active'),

  (v_company_id, '4.3.02', 'Equipamentos e Utensílios',
   3, 'expense', 'debit', true, false, true,
   true, 'despesas_operacionais', 442, 'DFC:Operacional', 'active'),

  (v_company_id, '4.3.03', 'Higienização e Limpeza Especializada',
   3, 'expense', 'debit', true, false, true,
   true, 'despesas_operacionais', 443, 'DFC:Operacional', 'active'),

  (v_company_id, '4.3.04', 'Embalagens e Materiais de Expedição',
   3, 'expense', 'debit', true, false, true,
   true, 'despesas_operacionais', 444, 'DFC:Operacional', 'active'),

  -- 4.4 Despesas Financeiras
  (v_company_id, '4.4', 'Despesas Financeiras',
   2, 'expense', 'debit', false, true, false,
   true, 'resultado_financeiro', 450, 'DFC:Financiamento', 'active'),

  (v_company_id, '4.4.01', 'Cartão de Crédito',
   3, 'expense', 'debit', true, false, true,
   true, 'resultado_financeiro', 451, 'DFC:Financiamento', 'active'),

  (v_company_id, '4.4.02', 'Juros sobre Empréstimos',
   3, 'expense', 'debit', true, false, true,
   true, 'resultado_financeiro', 452, 'DFC:Financiamento', 'active'),

  (v_company_id, '4.4.03', 'Tarifas Bancárias',
   3, 'expense', 'debit', true, false, true,
   true, 'resultado_financeiro', 453, 'DFC:Financiamento', 'active'),

  (v_company_id, '4.4.04', 'Parcela de Empréstimo (Principal)',
   3, 'expense', 'debit', true, false, true,
   true, 'resultado_financeiro', 454, 'DFC:Financiamento', 'active'),

  (v_company_id, '4.4.05', 'IOF e Outros Encargos',
   3, 'expense', 'debit', true, false, true,
   true, 'resultado_financeiro', 455, 'DFC:Financiamento', 'active'),

  (v_company_id, '4.4.06', 'Taxas de Maquininha / Antecipação',
   3, 'expense', 'debit', true, false, true,
   true, 'resultado_financeiro', 456, 'DFC:Financiamento', 'active'),

  -- 4.5 Outras Despesas
  (v_company_id, '4.5', 'Outras Despesas',
   2, 'expense', 'debit', false, true, false,
   true, 'outras_despesas', 460, 'DFC:Operacional', 'active'),

  (v_company_id, '4.5.01', 'Despesas Médicas / Hospitalares (Não CSP)',
   3, 'expense', 'debit', true, false, true,
   true, 'outras_despesas', 461, 'DFC:Operacional', 'active'),

  (v_company_id, '4.5.02', 'Despesas Diversas Não Classificadas',
   3, 'expense', 'debit', true, false, true,
   true, 'outras_despesas', 462, 'DFC:Operacional', 'active'),

  -- ══════════════════════════════════════════════════════════════
  -- GRUPO 5 — RESULTADO / DISTRIBUIÇÃO
  -- ══════════════════════════════════════════════════════════════
  (v_company_id, '5', 'Resultado / Distribuição',
   1, 'equity', 'debit', false, true, false,
   false, NULL, 500, 'DFC:Financiamento', 'active'),

  (v_company_id, '5.1', 'Distribuição de Lucros',
   2, 'equity', 'debit', false, true, false,
   false, NULL, 510, 'DFC:Financiamento', 'active'),

  (v_company_id, '5.1.01', 'Antecipação de Lucros / Retirada do Sócio',
   3, 'equity', 'debit', true, false, true,
   false, NULL, 511, 'DFC:Financiamento', 'active'),

  (v_company_id, '5.1.02', 'Reserva de Lucros',
   3, 'equity', 'credit', true, false, true,
   false, NULL, 512, 'DFC:Financiamento', 'active'),

  -- ══════════════════════════════════════════════════════════════
  -- GRUPO 6 — MOVIMENTAÇÕES PATRIMONIAIS
  -- ══════════════════════════════════════════════════════════════
  (v_company_id, '6', 'Movimentações Patrimoniais',
   1, 'equity', 'debit', false, true, false,
   false, NULL, 600, NULL, 'active'),

  (v_company_id, '6.1', 'Transferências entre Contas',
   2, 'equity', 'debit', true, false, true,
   false, NULL, 610, NULL, 'active'),

  (v_company_id, '6.2', 'Aplicação / Resgate de Investimentos',
   2, 'equity', 'debit', true, false, true,
   false, NULL, 620, NULL, 'active'),

  (v_company_id, '6.3', 'Empréstimo entre Empresas / Sócios',
   2, 'equity', 'debit', true, false, true,
   false, NULL, 630, NULL, 'active');


  -- 3. ATUALIZAR parent_id — Nível 2 aponta para Nível 1
  UPDATE public.chart_of_accounts filho
  SET parent_id = pai.id
  FROM public.chart_of_accounts pai
  WHERE filho.company_id = v_company_id
    AND pai.company_id   = v_company_id
    AND filho.level = 2
    AND pai.level = 1
    AND LEFT(filho.code, POSITION('.' IN filho.code) - 1) = pai.code;

  -- 4. ATUALIZAR parent_id — Nível 3 aponta para Nível 2
  UPDATE public.chart_of_accounts filho
  SET parent_id = pai.id
  FROM public.chart_of_accounts pai
  WHERE filho.company_id = v_company_id
    AND pai.company_id   = v_company_id
    AND filho.level = 3
    AND pai.level = 2
    AND LEFT(filho.code, LENGTH(filho.code) - POSITION('.' IN REVERSE(filho.code))) = pai.code;

  RAISE NOTICE 'Plano de contas TRICOLOGIA AC LTDA (id %) criado com % contas',
    v_company_id,
    (SELECT count(*) FROM public.chart_of_accounts WHERE company_id = v_company_id);

END;
$$;
