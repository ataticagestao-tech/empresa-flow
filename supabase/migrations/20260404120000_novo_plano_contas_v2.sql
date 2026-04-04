-- ============================================================
-- NOVO PLANO DE CONTAS v2 — Baseado no modelo DRE/DFC
-- Aplica para TODAS as empresas ativas (001-012, 014)
-- ============================================================

-- 1. LIMPAR template antigo
DELETE FROM public.chart_of_accounts
WHERE company_id = '00000000-0000-0000-0000-000000000001';

-- 2. INSERIR novo plano de contas no template
INSERT INTO public.chart_of_accounts
  (company_id, code, name, level, account_type, account_nature,
   is_analytical, is_synthetic, accepts_manual_entry,
   show_in_dre, dre_group, dre_order, reference_code, status)
VALUES

-- ══════════════════════════════════════════════════════════════
-- GRUPO 1 — Receita operacional bruta
-- ══════════════════════════════════════════════════════════════
('00000000-0000-0000-0000-000000000001', '1', 'Receita operacional bruta',
 1, 'revenue', 'credit', false, true, false,
 true, 'receita_bruta', 100, 'DFC:Operacional', 'active'),

('00000000-0000-0000-0000-000000000001', '1.1', 'Receita de serviços prestados',
 2, 'revenue', 'credit', true, false, true,
 true, 'receita_bruta', 110, 'DFC:Operacional', 'active'),

('00000000-0000-0000-0000-000000000001', '1.2', 'Receita de venda de produtos',
 2, 'revenue', 'credit', true, false, true,
 true, 'receita_bruta', 120, 'DFC:Operacional', 'active'),

('00000000-0000-0000-0000-000000000001', '1.3', 'Outras receitas operacionais',
 2, 'revenue', 'credit', true, false, true,
 true, 'receita_bruta', 130, 'DFC:Operacional', 'active'),

-- ══════════════════════════════════════════════════════════════
-- GRUPO 2 — Deduções da receita bruta
-- ══════════════════════════════════════════════════════════════
('00000000-0000-0000-0000-000000000001', '2', 'Deduções da receita bruta',
 1, 'expense', 'debit', false, true, false,
 true, 'deducoes', 200, 'DFC:Operacional', 'active'),

('00000000-0000-0000-0000-000000000001', '2.1', 'Impostos e contribuições s/ vendas',
 2, 'expense', 'debit', true, false, true,
 true, 'deducoes', 210, 'DFC:Operacional', 'active'),

('00000000-0000-0000-0000-000000000001', '2.2', 'Taxas de operadora / maquininha',
 2, 'expense', 'debit', true, false, true,
 true, 'deducoes', 220, 'DFC:Operacional', 'active'),

('00000000-0000-0000-0000-000000000001', '2.3', 'Royalties e licença de software',
 2, 'expense', 'debit', true, false, true,
 true, 'deducoes', 230, 'DFC:Operacional', 'active'),

-- ══════════════════════════════════════════════════════════════
-- GRUPO 3 — Custos dos serviços prestados (CSP)
-- ══════════════════════════════════════════════════════════════
('00000000-0000-0000-0000-000000000001', '3', 'Custos dos serviços prestados (CSP)',
 1, 'cost', 'debit', false, true, false,
 true, 'custos', 300, 'DFC:Operacional', 'active'),

('00000000-0000-0000-0000-000000000001', '3.1', 'Aluguel, condomínio, FPP',
 2, 'cost', 'debit', true, false, true,
 true, 'custos', 310, 'DFC:Operacional', 'active'),

('00000000-0000-0000-0000-000000000001', '3.2', 'Pessoal — salários e encargos (CLT)',
 2, 'cost', 'debit', true, false, true,
 true, 'custos', 320, 'DFC:Operacional', 'active'),

('00000000-0000-0000-0000-000000000001', '3.3', 'Pessoal — estagiários',
 2, 'cost', 'debit', true, false, true,
 true, 'custos', 330, 'DFC:Operacional', 'active'),

('00000000-0000-0000-0000-000000000001', '3.4', 'Vale transporte',
 2, 'cost', 'debit', true, false, true,
 true, 'custos', 340, 'DFC:Operacional', 'active'),

('00000000-0000-0000-0000-000000000001', '3.5', 'Vale refeição / alimentação',
 2, 'cost', 'debit', true, false, true,
 true, 'custos', 350, 'DFC:Operacional', 'active'),

('00000000-0000-0000-0000-000000000001', '3.6', 'Licença de uso — software',
 2, 'cost', 'debit', true, false, true,
 true, 'custos', 360, 'DFC:Operacional', 'active'),

('00000000-0000-0000-0000-000000000001', '3.7', 'Manutenções, peças e outros',
 2, 'cost', 'debit', true, false, true,
 true, 'custos', 370, 'DFC:Operacional', 'active'),

('00000000-0000-0000-0000-000000000001', '3.8', 'Pró-labore + INSS',
 2, 'cost', 'debit', true, false, true,
 true, 'custos', 380, 'DFC:Operacional', 'active'),

-- ══════════════════════════════════════════════════════════════
-- GRUPO 4 — Despesas operacionais
-- ══════════════════════════════════════════════════════════════
('00000000-0000-0000-0000-000000000001', '4', 'Despesas operacionais',
 1, 'expense', 'debit', false, true, false,
 true, 'despesas_operacionais', 400, 'DFC:Operacional', 'active'),

('00000000-0000-0000-0000-000000000001', '4.1', 'Despesas com materiais',
 2, 'expense', 'debit', true, false, true,
 true, 'despesas_operacionais', 410, 'DFC:Operacional', 'active'),

('00000000-0000-0000-0000-000000000001', '4.2', 'Contador e outros serviços adm.',
 2, 'expense', 'debit', true, false, true,
 true, 'despesas_operacionais', 420, 'DFC:Operacional', 'active'),

('00000000-0000-0000-0000-000000000001', '4.3', 'Marketing e publicidade',
 2, 'expense', 'debit', true, false, true,
 true, 'despesas_operacionais', 430, 'DFC:Operacional', 'active'),

('00000000-0000-0000-0000-000000000001', '4.4', 'Outras despesas operacionais',
 2, 'expense', 'debit', true, false, true,
 true, 'despesas_operacionais', 440, 'DFC:Operacional', 'active'),

-- ══════════════════════════════════════════════════════════════
-- GRUPO 5 — Depreciações e amortizações
-- ══════════════════════════════════════════════════════════════
('00000000-0000-0000-0000-000000000001', '5', 'Depreciações e amortizações',
 1, 'expense', 'debit', false, true, false,
 true, 'depreciacoes_amortizacoes', 500, NULL, 'active'),

('00000000-0000-0000-0000-000000000001', '5.1', 'Depreciação da estrutura operacional',
 2, 'expense', 'debit', true, false, true,
 true, 'depreciacoes_amortizacoes', 510, NULL, 'active'),

('00000000-0000-0000-0000-000000000001', '5.2', 'Amortização de intangíveis',
 2, 'expense', 'debit', true, false, true,
 true, 'depreciacoes_amortizacoes', 520, NULL, 'active'),

-- ══════════════════════════════════════════════════════════════
-- GRUPO 6 — Resultado financeiro
-- ══════════════════════════════════════════════════════════════
('00000000-0000-0000-0000-000000000001', '6', 'Resultado financeiro',
 1, 'expense', 'debit', false, true, false,
 true, 'resultado_financeiro', 600, 'DFC:Financiamento', 'active'),

('00000000-0000-0000-0000-000000000001', '6.1', 'Juros recebidos / rendimentos',
 2, 'revenue', 'credit', true, false, true,
 true, 'resultado_financeiro', 610, 'DFC:Financiamento', 'active'),

('00000000-0000-0000-0000-000000000001', '6.2', 'Juros pagos / encargos financeiros',
 2, 'expense', 'debit', true, false, true,
 true, 'resultado_financeiro', 620, 'DFC:Financiamento', 'active'),

('00000000-0000-0000-0000-000000000001', '6.3', 'Tarifas bancárias',
 2, 'expense', 'debit', true, false, true,
 true, 'resultado_financeiro', 630, 'DFC:Financiamento', 'active'),

('00000000-0000-0000-0000-000000000001', '6.4', 'IOF',
 2, 'expense', 'debit', true, false, true,
 true, 'resultado_financeiro', 640, 'DFC:Financiamento', 'active'),

('00000000-0000-0000-0000-000000000001', '6.5', 'Multas e juros pagos',
 2, 'expense', 'debit', true, false, true,
 true, 'resultado_financeiro', 650, 'DFC:Financiamento', 'active'),

('00000000-0000-0000-0000-000000000001', '6.6', 'Descontos obtidos',
 2, 'revenue', 'credit', true, false, true,
 true, 'resultado_financeiro', 660, 'DFC:Financiamento', 'active'),

-- ══════════════════════════════════════════════════════════════
-- GRUPO 7 — Atividades de investimento (Só DFC)
-- ══════════════════════════════════════════════════════════════
('00000000-0000-0000-0000-000000000001', '7', 'Atividades de investimento',
 1, 'asset', 'debit', false, true, false,
 false, NULL, 700, 'DFC:Investimento', 'active'),

('00000000-0000-0000-0000-000000000001', '7.1', 'Aquisição de ativos fixos',
 2, 'asset', 'debit', true, false, true,
 false, NULL, 710, 'DFC:Investimento', 'active'),

('00000000-0000-0000-0000-000000000001', '7.2', 'Venda de ativos imobilizados',
 2, 'asset', 'credit', true, false, true,
 false, NULL, 720, 'DFC:Investimento', 'active'),

-- ══════════════════════════════════════════════════════════════
-- GRUPO 8 — Financiamentos e participações (Só DFC)
-- ══════════════════════════════════════════════════════════════
('00000000-0000-0000-0000-000000000001', '8', 'Financiamentos e participações',
 1, 'liability', 'credit', false, true, false,
 false, NULL, 800, 'DFC:Financiamento', 'active'),

('00000000-0000-0000-0000-000000000001', '8.1', 'Empréstimos captados',
 2, 'liability', 'credit', true, false, true,
 false, NULL, 810, 'DFC:Financiamento', 'active'),

('00000000-0000-0000-0000-000000000001', '8.2', 'Amortização de empréstimos',
 2, 'liability', 'debit', true, false, true,
 false, NULL, 820, 'DFC:Financiamento', 'active'),

('00000000-0000-0000-0000-000000000001', '8.3', 'Distribuição de lucros',
 2, 'equity', 'debit', true, false, true,
 false, NULL, 830, 'DFC:Financiamento', 'active'),

('00000000-0000-0000-0000-000000000001', '8.4', 'Aporte de sócios',
 2, 'equity', 'credit', true, false, true,
 false, NULL, 840, 'DFC:Financiamento', 'active'),

-- ══════════════════════════════════════════════════════════════
-- GRUPO 0 — Movimentações patrimoniais (Fora DRE/DFC)
-- ══════════════════════════════════════════════════════════════
('00000000-0000-0000-0000-000000000001', '0', 'Movimentações patrimoniais',
 1, 'equity', 'debit', false, true, false,
 false, NULL, 900, NULL, 'active'),

('00000000-0000-0000-0000-000000000001', '0.1', 'Transferência entre contas',
 2, 'equity', 'debit', true, false, true,
 false, NULL, 910, NULL, 'active'),

('00000000-0000-0000-0000-000000000001', '0.2', 'Aplicação / resgate investimento',
 2, 'equity', 'debit', true, false, true,
 false, NULL, 920, NULL, 'active');


-- 3. ATUALIZAR parent_id no template
UPDATE public.chart_of_accounts filho
SET parent_id = pai.id
FROM public.chart_of_accounts pai
WHERE filho.company_id = '00000000-0000-0000-0000-000000000001'
  AND pai.company_id   = '00000000-0000-0000-0000-000000000001'
  AND filho.level = 2
  AND pai.level = 1
  AND LEFT(filho.code, POSITION('.' IN filho.code) - 1) = pai.code;


-- 4. ATUALIZAR função copiar_plano_template (nova versão)
CREATE OR REPLACE FUNCTION public.copiar_plano_template(p_company_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Desabilitar verificação de FK temporariamente (só nesta transação)
  SET LOCAL session_replication_role = 'replica';

  -- Deletar chart antigo (sem FK check)
  DELETE FROM public.chart_of_accounts WHERE company_id = p_company_id;

  -- Reabilitar FKs
  SET LOCAL session_replication_role = 'origin';

  -- Copiar do template
  INSERT INTO public.chart_of_accounts (
    company_id, code, name, description,
    level, account_type, account_nature,
    is_analytical, is_synthetic, accepts_manual_entry,
    show_in_dre, dre_group, dre_order, reference_code,
    status, created_at
  )
  SELECT
    p_company_id,
    code, name, description,
    level, account_type, account_nature,
    is_analytical, is_synthetic, accepts_manual_entry,
    show_in_dre, dre_group, dre_order, reference_code,
    status, now()
  FROM public.chart_of_accounts
  WHERE company_id = '00000000-0000-0000-0000-000000000001'
  ORDER BY level, code;

  -- Atualizar parent_id baseado no code
  UPDATE public.chart_of_accounts filho
  SET parent_id = pai.id
  FROM public.chart_of_accounts pai
  WHERE filho.company_id = p_company_id
    AND pai.company_id   = p_company_id
    AND filho.level = 2
    AND pai.level = 1
    AND LEFT(filho.code, POSITION('.' IN filho.code) - 1) = pai.code;

  RETURN (SELECT count(*) FROM public.chart_of_accounts WHERE company_id = p_company_id);
END;
$$;


-- 5. APLICAR somente para as 20 empresas especificadas
DO $$
DECLARE
  empresa_ids UUID[] := ARRAY[
    'c3d84560-c07e-4fe2-8bf4-1a5c92fa5cb2'::uuid,  -- DIONELLY ENTRETENIMENTO INFANTIL LTDA
    '05c0a166-d619-46dd-bc34-81b67901ce99'::uuid,  -- DIONELLY ENTRETENIMENTO LTDA
    '7639a899-4dff-4331-87a1-2f16ac7b4f33'::uuid,  -- DIONELLY ENTRETENIMENTO SJ LTDA
    '7f5567ee-3927-4ca3-819f-fdfe293c19bb'::uuid,  -- DIONELLY COMERCIO IMP EXP BRINQUEDOS
    '3a52e504-b275-4f79-ad28-7eac987fa1a1'::uuid,  -- DIONELLY CONCESSIONARIA KIDS
    '22e341d7-29a0-422f-a760-d50b0e085a9c'::uuid,  -- DIONELLY COMERCIO IMP EXP (2)
    '75f93aa5-24e5-4990-b3ed-ed32a61924f1'::uuid,  -- 002 FLORIPA
    '11dd36ea-6f9c-451a-8ec0-6c41569bd736'::uuid,  -- 008 TABOÃO AZUL
    'c14f81d0-c764-4f81-b954-fb7dccc2ffbb'::uuid,  -- 006 CANTAREIRA
    '94d28a39-bf88-46c0-9d6b-960a1f85eafb'::uuid,  -- 005 TABOÃO VERMELHO
    '68ee2f94-e3af-4185-a7f2-01e71e141bf9'::uuid,  -- 004 GRANJA VIANA
    'b963790b-475b-423a-8856-29a75495d33b'::uuid,  -- 007 CAMBORIU
    '0b45187e-8691-4aa6-86df-1a9837998e47'::uuid,  -- 001 ELDORADO
    'a01bf424-659d-44b3-bcfe-de1c45e379a5'::uuid,  -- 011 ITAQUERA 01
    'ed0d68b0-e3b1-459f-b69b-5b81966345ec'::uuid,  -- 009 ITAQUERA 02
    '50b7963e-3011-4fa3-8985-c52dc060d7fb'::uuid,  -- 014 FRANQUEADORA
    '6eb34e88-c184-4f5f-a752-0d3fae45ff82'::uuid,  -- 003 ITAQUERA
    '0eb4d51a-dd58-469a-9606-49f5266019af'::uuid,  -- 012 SHOPPING ESTAÇÃO BH 2
    '7d6e2dd1-3cc0-4d33-8598-f8ce5c1c9f4a'::uuid,  -- 010 SHOPPING ESTAÇÃO BH
    '539536e0-28c2-422e-ad60-6317ad3a1dc6'::uuid   -- MOBI KIDS
  ];
  r UUID;
  cnt INTEGER;
  total INTEGER := 0;
  nome TEXT;
BEGIN
  FOREACH r IN ARRAY empresa_ids
  LOOP
    SELECT razao_social INTO nome FROM public.companies WHERE id = r;
    IF nome IS NULL THEN
      RAISE WARNING 'Empresa % não encontrada — pulando', r;
      CONTINUE;
    END IF;
    cnt := public.copiar_plano_template(r);
    total := total + 1;
    RAISE NOTICE 'Empresa % (%) — % contas criadas', total, nome, cnt;
  END LOOP;
  RAISE NOTICE '=== TOTAL: % empresas atualizadas ===', total;
END;
$$;
