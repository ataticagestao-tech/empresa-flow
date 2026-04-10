-- =====================================================
-- POPULAR BP: copia template + mapeia contas automaticamente
-- Fix: Balanço Patrimonial vazio após conciliação
-- =====================================================

-- 1. Copiar template de linhas (BP/DRE/DFC) para todas as empresas ativas
DO $$
DECLARE
  v_company RECORD;
BEGIN
  FOR v_company IN SELECT id FROM companies WHERE is_active = true LOOP
    PERFORM public.fn_copiar_template_demonstrativos(v_company.id);
  END LOOP;
END $$;

-- 2. Mapeamento automático: chart_of_accounts → cont_linha_demonstrativo
-- Baseado no account_type da conta contábil, mapeia para a linha correta do BP
-- Inclui também contas do DRE (expense, cost, revenue)

INSERT INTO public.cont_mapeamento_contas (company_id, linha_demonstrativo_id, conta_operacional_id, fator, ativo)
SELECT
  ca.company_id,
  ld.id AS linha_demonstrativo_id,
  ca.id AS conta_operacional_id,
  1 AS fator,
  true AS ativo
FROM public.chart_of_accounts ca
JOIN public.cont_linha_demonstrativo ld
  ON ld.company_id = ca.company_id
  AND ld.editavel = false
  AND ld.ativo = true
  AND ld.visivel = true
  AND (
    -- ATIVO CIRCULANTE
    (ca.account_type = 'asset' AND ld.codigo = 'BP.AC.04')  -- outros créditos (default)
    -- PASSIVO CIRCULANTE
    OR (ca.account_type = 'liability' AND ld.codigo = 'BP.PC.05')  -- contas a pagar (default)
    -- PATRIMÔNIO LÍQUIDO não mapeia aqui (é editável)
    -- DRE: Receitas
    OR (ca.account_type = 'revenue' AND ca.account_nature = 'credit' AND ld.codigo = 'DRE.RB.01')
    OR (ca.account_type = 'revenue' AND ca.account_nature = 'debit' AND ld.codigo = 'DRE.RB.02')
    -- DRE: Custos
    OR (ca.account_type = 'cost' AND ld.codigo = 'DRE.CMV.01')
    -- DRE: Despesas
    OR (ca.account_type = 'expense' AND ld.codigo = 'DRE.DO.01')
  )
WHERE ca.status = 'active'
  AND (ca.is_analytical = true OR ca.is_analytic = true)
  AND NOT EXISTS (
    SELECT 1 FROM public.cont_mapeamento_contas mc
    WHERE mc.conta_operacional_id = ca.id
      AND mc.linha_demonstrativo_id = ld.id
      AND mc.company_id = ca.company_id
  );

-- 3. Mapeamento inteligente por nome da conta — sobrepõe o default
-- Contas bancárias → Caixa e Equivalentes
INSERT INTO public.cont_mapeamento_contas (company_id, linha_demonstrativo_id, conta_operacional_id, fator, ativo)
SELECT ca.company_id, ld.id, ca.id, 1, true
FROM public.chart_of_accounts ca
JOIN public.cont_linha_demonstrativo ld
  ON ld.company_id = ca.company_id AND ld.codigo = 'BP.AC.01'
WHERE ca.status = 'active'
  AND ca.account_type = 'asset'
  AND (
    UPPER(ca.name) LIKE '%CAIXA%'
    OR UPPER(ca.name) LIKE '%BANCO%'
    OR UPPER(ca.name) LIKE '%APLICA%'
    OR UPPER(ca.name) LIKE '%EQUIVALENTE%'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.cont_mapeamento_contas mc
    WHERE mc.conta_operacional_id = ca.id
      AND mc.linha_demonstrativo_id = ld.id
  );

-- Clientes a receber → Contas a Receber
INSERT INTO public.cont_mapeamento_contas (company_id, linha_demonstrativo_id, conta_operacional_id, fator, ativo)
SELECT ca.company_id, ld.id, ca.id, 1, true
FROM public.chart_of_accounts ca
JOIN public.cont_linha_demonstrativo ld
  ON ld.company_id = ca.company_id AND ld.codigo = 'BP.AC.02'
WHERE ca.status = 'active'
  AND ca.account_type = 'asset'
  AND (UPPER(ca.name) LIKE '%CLIENTE%' OR UPPER(ca.name) LIKE '%RECEBER%' OR UPPER(ca.name) LIKE '%DUPLICATA%')
  AND NOT EXISTS (
    SELECT 1 FROM public.cont_mapeamento_contas mc
    WHERE mc.conta_operacional_id = ca.id AND mc.linha_demonstrativo_id = ld.id
  );

-- Fornecedores → Fornecedores PC
INSERT INTO public.cont_mapeamento_contas (company_id, linha_demonstrativo_id, conta_operacional_id, fator, ativo)
SELECT ca.company_id, ld.id, ca.id, 1, true
FROM public.chart_of_accounts ca
JOIN public.cont_linha_demonstrativo ld
  ON ld.company_id = ca.company_id AND ld.codigo = 'BP.PC.01'
WHERE ca.status = 'active'
  AND ca.account_type = 'liability'
  AND (UPPER(ca.name) LIKE '%FORNECEDOR%')
  AND NOT EXISTS (
    SELECT 1 FROM public.cont_mapeamento_contas mc
    WHERE mc.conta_operacional_id = ca.id AND mc.linha_demonstrativo_id = ld.id
  );

-- Impostos → Obrigações Fiscais
INSERT INTO public.cont_mapeamento_contas (company_id, linha_demonstrativo_id, conta_operacional_id, fator, ativo)
SELECT ca.company_id, ld.id, ca.id, 1, true
FROM public.chart_of_accounts ca
JOIN public.cont_linha_demonstrativo ld
  ON ld.company_id = ca.company_id AND ld.codigo = 'BP.PC.03'
WHERE ca.status = 'active'
  AND ca.account_type = 'liability'
  AND (UPPER(ca.name) LIKE '%IMPOST%' OR UPPER(ca.name) LIKE '%TRIBUTO%' OR UPPER(ca.name) LIKE '%FISCAL%' OR UPPER(ca.name) LIKE '%ICMS%' OR UPPER(ca.name) LIKE '%ISS%' OR UPPER(ca.name) LIKE '%PIS%' OR UPPER(ca.name) LIKE '%COFINS%' OR UPPER(ca.name) LIKE '%IRPJ%' OR UPPER(ca.name) LIKE '%CSLL%')
  AND NOT EXISTS (
    SELECT 1 FROM public.cont_mapeamento_contas mc
    WHERE mc.conta_operacional_id = ca.id AND mc.linha_demonstrativo_id = ld.id
  );

-- Salários/Encargos → Obrigações Trabalhistas
INSERT INTO public.cont_mapeamento_contas (company_id, linha_demonstrativo_id, conta_operacional_id, fator, ativo)
SELECT ca.company_id, ld.id, ca.id, 1, true
FROM public.chart_of_accounts ca
JOIN public.cont_linha_demonstrativo ld
  ON ld.company_id = ca.company_id AND ld.codigo = 'BP.PC.04'
WHERE ca.status = 'active'
  AND ca.account_type = 'liability'
  AND (UPPER(ca.name) LIKE '%SALARI%' OR UPPER(ca.name) LIKE '%ENCARGO%' OR UPPER(ca.name) LIKE '%TRABALHIS%' OR UPPER(ca.name) LIKE '%FGTS%' OR UPPER(ca.name) LIKE '%INSS%' OR UPPER(ca.name) LIKE '%FOLHA%')
  AND NOT EXISTS (
    SELECT 1 FROM public.cont_mapeamento_contas mc
    WHERE mc.conta_operacional_id = ca.id AND mc.linha_demonstrativo_id = ld.id
  );
