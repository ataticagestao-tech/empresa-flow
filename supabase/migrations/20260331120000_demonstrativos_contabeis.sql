-- ============================================================
-- GESTAP — Módulo: Demonstrativos Contábeis (DRE, BP, DFC)
-- Usa company_id → companies, chart_of_accounts
-- RLS via auth.uid() + companies.owner_id
-- ============================================================

BEGIN;

-- ============================================================
-- ETAPA 1 — ALTER TABLE chart_of_accounts (campos contábeis)
-- ============================================================

ALTER TABLE public.chart_of_accounts
  ADD COLUMN IF NOT EXISTS classificacao_bp text,
  ADD COLUMN IF NOT EXISTS classificacao_dfc text;

COMMENT ON COLUMN public.chart_of_accounts.classificacao_bp IS 'Grupo do BP: AC, ANC, PC, PNC, PL ou NULL';
COMMENT ON COLUMN public.chart_of_accounts.classificacao_dfc IS 'Atividade DFC: operacional, investimento, financiamento ou NULL';


-- ============================================================
-- ETAPA 2.1 — Períodos contábeis
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cont_periodos_contabeis (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ano             int NOT NULL,
  mes             int NOT NULL CHECK (mes BETWEEN 1 AND 12),
  data_inicio     date NOT NULL,
  data_fim        date NOT NULL,
  status          text NOT NULL DEFAULT 'aberto'
                  CHECK (status IN ('aberto', 'em_revisao', 'fechado')),
  fechado_por     uuid,
  fechado_em      timestamptz,
  observacao      text,
  criado_em       timestamptz DEFAULT now(),
  UNIQUE (company_id, ano, mes)
);

CREATE INDEX IF NOT EXISTS idx_cont_periodos_tenant
  ON public.cont_periodos_contabeis(company_id, ano, mes);


-- ============================================================
-- ETAPA 2.2 — Linhas dos demonstrativos (esqueleto BP, DRE, DFC)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cont_linha_demonstrativo (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  demonstrativo   text NOT NULL CHECK (demonstrativo IN ('BP', 'DRE', 'DFC')),
  codigo          text NOT NULL,
  nome            text NOT NULL,
  nivel           int NOT NULL DEFAULT 1,
  linha_pai_id    uuid REFERENCES public.cont_linha_demonstrativo(id) ON DELETE SET NULL,
  ordem           int NOT NULL DEFAULT 0,
  tipo_calculo    text NOT NULL DEFAULT 'soma'
                  CHECK (tipo_calculo IN ('soma', 'subtotal', 'resultado', 'manual')),
  formula         jsonb,
  natureza_saldo  text CHECK (natureza_saldo IN ('devedora', 'credora', 'ambas')),
  atividade_dfc   text CHECK (atividade_dfc IN ('operacional', 'investimento', 'financiamento')),
  visivel         boolean DEFAULT true,
  editavel        boolean DEFAULT false,
  ativo           boolean DEFAULT true,
  criado_em       timestamptz DEFAULT now(),
  UNIQUE (company_id, demonstrativo, codigo)
);

CREATE INDEX IF NOT EXISTS idx_cont_linha_tenant
  ON public.cont_linha_demonstrativo(company_id, demonstrativo, ordem);


-- ============================================================
-- ETAPA 2.3 — Mapeamento operacional → contábil
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cont_mapeamento_contas (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conta_operacional_id    uuid NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE CASCADE,
  linha_demonstrativo_id  uuid NOT NULL REFERENCES public.cont_linha_demonstrativo(id) ON DELETE CASCADE,
  fator                   int NOT NULL DEFAULT 1 CHECK (fator IN (1, -1)),
  ativo                   boolean DEFAULT true,
  criado_em               timestamptz DEFAULT now(),
  UNIQUE (company_id, conta_operacional_id, linha_demonstrativo_id)
);

CREATE INDEX IF NOT EXISTS idx_cont_mapeamento_linha
  ON public.cont_mapeamento_contas(company_id, linha_demonstrativo_id);
CREATE INDEX IF NOT EXISTS idx_cont_mapeamento_conta
  ON public.cont_mapeamento_contas(company_id, conta_operacional_id);


-- ============================================================
-- ETAPA 2.4 — Saldos patrimoniais manuais (para o BP)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cont_saldos_patrimoniais (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  linha_demonstrativo_id  uuid NOT NULL REFERENCES public.cont_linha_demonstrativo(id) ON DELETE CASCADE,
  periodo_ref             date NOT NULL,
  saldo                   numeric(14,2) NOT NULL DEFAULT 0,
  observacao              text,
  inserido_por            uuid,
  criado_em               timestamptz DEFAULT now(),
  atualizado_em           timestamptz DEFAULT now(),
  UNIQUE (company_id, linha_demonstrativo_id, periodo_ref)
);

CREATE INDEX IF NOT EXISTS idx_cont_saldos_periodo
  ON public.cont_saldos_patrimoniais(company_id, periodo_ref);


-- ============================================================
-- ETAPA 3 — ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.cont_periodos_contabeis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cont_linha_demonstrativo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cont_mapeamento_contas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cont_saldos_patrimoniais ENABLE ROW LEVEL SECURITY;

-- Padrão do projeto: company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid())

DROP POLICY IF EXISTS "Users can manage cont_periodos of their companies" ON public.cont_periodos_contabeis;
CREATE POLICY "Users can manage cont_periodos of their companies"
  ON public.cont_periodos_contabeis FOR ALL
  USING (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Users can manage cont_linha of their companies" ON public.cont_linha_demonstrativo;
CREATE POLICY "Users can manage cont_linha of their companies"
  ON public.cont_linha_demonstrativo FOR ALL
  USING (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Users can manage cont_mapeamento of their companies" ON public.cont_mapeamento_contas;
CREATE POLICY "Users can manage cont_mapeamento of their companies"
  ON public.cont_mapeamento_contas FOR ALL
  USING (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Users can manage cont_saldos of their companies" ON public.cont_saldos_patrimoniais;
CREATE POLICY "Users can manage cont_saldos of their companies"
  ON public.cont_saldos_patrimoniais FOR ALL
  USING (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()));

-- Template tenant pode ser lido por todos autenticados
DROP POLICY IF EXISTS "Anyone can read template lines" ON public.cont_linha_demonstrativo;
CREATE POLICY "Anyone can read template lines"
  ON public.cont_linha_demonstrativo FOR SELECT
  TO authenticated
  USING (company_id = '00000000-0000-0000-0000-000000000001'::uuid);


-- ============================================================
-- ETAPA 4 — SEED TEMPLATE PADRÃO
-- ============================================================

-- Criar empresa template se não existir
INSERT INTO public.companies (id, razao_social, cnpj, is_active)
VALUES ('00000000-0000-0000-0000-000000000001', 'TEMPLATE DEMONSTRATIVOS', '00000000000000', false)
ON CONFLICT (id) DO NOTHING;

-- 4.1 — Seed DRE
INSERT INTO public.cont_linha_demonstrativo
  (company_id, demonstrativo, codigo, nome, nivel, tipo_calculo, formula, ordem, visivel)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'DRE', 'DRE.RB',     'VENDAS DE PRODUTOS, MERCADORIAS E SERVIÇOS',             1, 'soma',      NULL, 10, true),
  ('00000000-0000-0000-0000-000000000001', 'DRE', 'DRE.RB.01',  'Vendas de Produtos, Mercadorias e Serviços',              2, 'soma',      NULL, 11, true),
  ('00000000-0000-0000-0000-000000000001', 'DRE', 'DRE.RB.02',  '(-) Deduções de Tributos, Abatimentos e Devoluções',      2, 'soma',      NULL, 12, true),
  ('00000000-0000-0000-0000-000000000001', 'DRE', 'DRE.RL',     '(=) RECEITA LÍQUIDA',                                     1, 'resultado', '{"operacao":"subtrair","linhas":["DRE.RB.01","DRE.RB.02"]}', 20, true),
  ('00000000-0000-0000-0000-000000000001', 'DRE', 'DRE.CMV',    '(-) CUSTO DAS VENDAS',                                    1, 'soma',      NULL, 30, true),
  ('00000000-0000-0000-0000-000000000001', 'DRE', 'DRE.CMV.01', 'Custo dos Produtos, Mercadorias e Serviços',               2, 'soma',      NULL, 31, true),
  ('00000000-0000-0000-0000-000000000001', 'DRE', 'DRE.LB',     '(=) LUCRO BRUTO',                                         1, 'resultado', '{"operacao":"subtrair","linhas":["DRE.RL","DRE.CMV"]}', 40, true),
  ('00000000-0000-0000-0000-000000000001', 'DRE', 'DRE.DO',     '(-) DESPESAS OPERACIONAIS',                               1, 'soma',      NULL, 50, true),
  ('00000000-0000-0000-0000-000000000001', 'DRE', 'DRE.DO.01',  'Despesas Administrativas',                                 2, 'soma',      NULL, 51, true),
  ('00000000-0000-0000-0000-000000000001', 'DRE', 'DRE.DO.02',  'Despesas com Vendas',                                      2, 'soma',      NULL, 52, true),
  ('00000000-0000-0000-0000-000000000001', 'DRE', 'DRE.DO.03',  'Outras Despesas Gerais',                                   2, 'soma',      NULL, 53, true),
  ('00000000-0000-0000-0000-000000000001', 'DRE', 'DRE.RO',     '(=) RESULTADO OPERACIONAL ANTES DO FINANCEIRO',            1, 'resultado', '{"operacao":"subtrair","linhas":["DRE.LB","DRE.DO"]}', 60, true),
  ('00000000-0000-0000-0000-000000000001', 'DRE', 'DRE.RF',     '(+/-) RESULTADO FINANCEIRO',                              1, 'soma',      NULL, 70, true),
  ('00000000-0000-0000-0000-000000000001', 'DRE', 'DRE.RF.01',  'Receitas Financeiras',                                     2, 'soma',      NULL, 71, true),
  ('00000000-0000-0000-0000-000000000001', 'DRE', 'DRE.RF.02',  '(-) Despesas Financeiras',                                 2, 'soma',      NULL, 72, true),
  ('00000000-0000-0000-0000-000000000001', 'DRE', 'DRE.OR',     '(+/-) OUTRAS RECEITAS E DESPESAS OPERACIONAIS',            1, 'soma',      NULL, 80, true),
  ('00000000-0000-0000-0000-000000000001', 'DRE', 'DRE.RAT',    '(=) RESULTADO ANTES DOS TRIBUTOS SOBRE O LUCRO',           1, 'resultado', '{"operacao":"somar","linhas":["DRE.RO","DRE.RF","DRE.OR"]}', 90, true),
  ('00000000-0000-0000-0000-000000000001', 'DRE', 'DRE.RAT.01', '(-) Despesa com Contribuição Social',                      2, 'soma',      NULL, 91, true),
  ('00000000-0000-0000-0000-000000000001', 'DRE', 'DRE.RAT.02', '(-) Despesa com IRPJ',                                     2, 'soma',      NULL, 92, true),
  ('00000000-0000-0000-0000-000000000001', 'DRE', 'DRE.RL.F',   '(=) RESULTADO LÍQUIDO DO PERÍODO',                         1, 'resultado', '{"operacao":"somar","linhas":["DRE.RAT","DRE.RAT.01","DRE.RAT.02"]}', 100, true)
ON CONFLICT (company_id, demonstrativo, codigo) DO NOTHING;

-- 4.2 — Seed BP
INSERT INTO public.cont_linha_demonstrativo
  (company_id, demonstrativo, codigo, nome, nivel, tipo_calculo, natureza_saldo, ordem, visivel, editavel)
VALUES
  -- ATIVO
  ('00000000-0000-0000-0000-000000000001', 'BP', 'BP.AC',       'ATIVO CIRCULANTE',                                1, 'soma',      'devedora', 10, true, false),
  ('00000000-0000-0000-0000-000000000001', 'BP', 'BP.AC.01',    'Caixa e Equivalentes de Caixa',                   2, 'soma',      'devedora', 11, true, false),
  ('00000000-0000-0000-0000-000000000001', 'BP', 'BP.AC.02',    'Contas a Receber',                                2, 'soma',      'devedora', 12, true, false),
  ('00000000-0000-0000-0000-000000000001', 'BP', 'BP.AC.03',    'Estoques',                                        2, 'manual',    'devedora', 13, true, true),
  ('00000000-0000-0000-0000-000000000001', 'BP', 'BP.AC.04',    'Outros Créditos',                                 2, 'soma',      'devedora', 14, true, false),
  ('00000000-0000-0000-0000-000000000001', 'BP', 'BP.ANC',      'ATIVO NÃO CIRCULANTE',                            1, 'soma',      'devedora', 20, true, false),
  ('00000000-0000-0000-0000-000000000001', 'BP', 'BP.ANC.01',   'Realizável a Longo Prazo',                        2, 'manual',    'devedora', 21, true, true),
  ('00000000-0000-0000-0000-000000000001', 'BP', 'BP.ANC.02',   'Investimentos',                                   2, 'manual',    'devedora', 22, true, true),
  ('00000000-0000-0000-0000-000000000001', 'BP', 'BP.ANC.03',   'Imobilizado',                                     2, 'manual',    'devedora', 23, true, true),
  ('00000000-0000-0000-0000-000000000001', 'BP', 'BP.ANC.04',   'Intangível',                                      2, 'manual',    'devedora', 24, true, true),
  ('00000000-0000-0000-0000-000000000001', 'BP', 'BP.ANC.05',   '(-) Depreciação e Amortização Acumuladas',         2, 'manual',    'credora',  25, true, true),
  ('00000000-0000-0000-0000-000000000001', 'BP', 'BP.AT',       'TOTAL DO ATIVO',                                  1, 'resultado', 'devedora', 29, true, false),
  -- PASSIVO
  ('00000000-0000-0000-0000-000000000001', 'BP', 'BP.PC',       'PASSIVO CIRCULANTE',                              1, 'soma',      'credora',  30, true, false),
  ('00000000-0000-0000-0000-000000000001', 'BP', 'BP.PC.01',    'Fornecedores',                                    2, 'soma',      'credora',  31, true, false),
  ('00000000-0000-0000-0000-000000000001', 'BP', 'BP.PC.02',    'Empréstimos e Financiamentos',                    2, 'soma',      'credora',  32, true, false),
  ('00000000-0000-0000-0000-000000000001', 'BP', 'BP.PC.03',    'Obrigações Fiscais',                              2, 'soma',      'credora',  33, true, false),
  ('00000000-0000-0000-0000-000000000001', 'BP', 'BP.PC.04',    'Obrigações Trabalhistas e Sociais',               2, 'soma',      'credora',  34, true, false),
  ('00000000-0000-0000-0000-000000000001', 'BP', 'BP.PC.05',    'Contas a Pagar',                                  2, 'soma',      'credora',  35, true, false),
  ('00000000-0000-0000-0000-000000000001', 'BP', 'BP.PC.06',    'Provisões',                                       2, 'manual',    'credora',  36, true, true),
  ('00000000-0000-0000-0000-000000000001', 'BP', 'BP.PNC',      'PASSIVO NÃO CIRCULANTE',                          1, 'soma',      'credora',  40, true, false),
  ('00000000-0000-0000-0000-000000000001', 'BP', 'BP.PNC.01',   'Financiamentos',                                  2, 'manual',    'credora',  41, true, true),
  -- PATRIMÔNIO LÍQUIDO
  ('00000000-0000-0000-0000-000000000001', 'BP', 'BP.PL',       'PATRIMÔNIO LÍQUIDO',                              1, 'soma',      'credora',  50, true, false),
  ('00000000-0000-0000-0000-000000000001', 'BP', 'BP.PL.01',    'Capital Social',                                  2, 'manual',    'credora',  51, true, true),
  ('00000000-0000-0000-0000-000000000001', 'BP', 'BP.PL.02',    'Reservas de Capital',                             2, 'manual',    'credora',  52, true, true),
  ('00000000-0000-0000-0000-000000000001', 'BP', 'BP.PL.03',    'Reservas de Lucros',                              2, 'manual',    'credora',  53, true, true),
  ('00000000-0000-0000-0000-000000000001', 'BP', 'BP.PL.04',    'Lucros Acumulados',                               2, 'manual',    'credora',  54, true, true),
  ('00000000-0000-0000-0000-000000000001', 'BP', 'BP.PL.05',    '(-) Prejuízos Acumulados',                        2, 'manual',    'devedora', 55, true, true),
  ('00000000-0000-0000-0000-000000000001', 'BP', 'BP.PT',       'TOTAL DO PASSIVO E PATRIMÔNIO LÍQUIDO',           1, 'resultado', 'credora',  59, true, false)
ON CONFLICT (company_id, demonstrativo, codigo) DO NOTHING;

-- 4.3 — Seed DFC
INSERT INTO public.cont_linha_demonstrativo
  (company_id, demonstrativo, codigo, nome, nivel, tipo_calculo, atividade_dfc, ordem, visivel)
VALUES
  -- OPERACIONAL
  ('00000000-0000-0000-0000-000000000001', 'DFC', 'DFC.OP',       'ATIVIDADES OPERACIONAIS',                                  1, 'soma',      'operacional',    10, true),
  ('00000000-0000-0000-0000-000000000001', 'DFC', 'DFC.OP.01',    'Recebimentos de Clientes',                                  2, 'soma',      'operacional',    11, true),
  ('00000000-0000-0000-0000-000000000001', 'DFC', 'DFC.OP.02',    'Pagamentos a Fornecedores',                                 2, 'soma',      'operacional',    12, true),
  ('00000000-0000-0000-0000-000000000001', 'DFC', 'DFC.OP.03',    'Pagamentos de Despesas Operacionais',                       2, 'soma',      'operacional',    13, true),
  ('00000000-0000-0000-0000-000000000001', 'DFC', 'DFC.OP.04',    'Pagamento de Impostos',                                     2, 'soma',      'operacional',    14, true),
  ('00000000-0000-0000-0000-000000000001', 'DFC', 'DFC.OP.T',     'Caixa Gerado nas Atividades Operacionais',                  1, 'resultado', 'operacional',    19, true),
  -- INVESTIMENTO
  ('00000000-0000-0000-0000-000000000001', 'DFC', 'DFC.INV',      'ATIVIDADES DE INVESTIMENTO',                                1, 'soma',      'investimento',   20, true),
  ('00000000-0000-0000-0000-000000000001', 'DFC', 'DFC.INV.01',   'Compra de Imóveis/Equipamentos',                            2, 'soma',      'investimento',   21, true),
  ('00000000-0000-0000-0000-000000000001', 'DFC', 'DFC.INV.02',   'Aquisição de Investimentos',                                2, 'soma',      'investimento',   22, true),
  ('00000000-0000-0000-0000-000000000001', 'DFC', 'DFC.INV.T',    'Caixa Consumido nas Atividades de Investimento',             1, 'resultado', 'investimento',   29, true),
  -- FINANCIAMENTO
  ('00000000-0000-0000-0000-000000000001', 'DFC', 'DFC.FIN',      'ATIVIDADES DE FINANCIAMENTO',                               1, 'soma',      'financiamento',  30, true),
  ('00000000-0000-0000-0000-000000000001', 'DFC', 'DFC.FIN.01',   'Aumento de Capital',                                        2, 'soma',      'financiamento',  31, true),
  ('00000000-0000-0000-0000-000000000001', 'DFC', 'DFC.FIN.02',   'Captação de Empréstimos',                                   2, 'soma',      'financiamento',  32, true),
  ('00000000-0000-0000-0000-000000000001', 'DFC', 'DFC.FIN.03',   'Pagamento de Empréstimos',                                  2, 'soma',      'financiamento',  33, true),
  ('00000000-0000-0000-0000-000000000001', 'DFC', 'DFC.FIN.04',   'Pagamento de Dividendos',                                   2, 'soma',      'financiamento',  34, true),
  ('00000000-0000-0000-0000-000000000001', 'DFC', 'DFC.FIN.T',    'Caixa Gerado nas Atividades de Financiamento',              1, 'resultado', 'financiamento',  39, true),
  -- TOTAL
  ('00000000-0000-0000-0000-000000000001', 'DFC', 'DFC.VAR',      'VARIAÇÃO LÍQUIDA DE CAIXA',                                 1, 'resultado', NULL,             50, true)
ON CONFLICT (company_id, demonstrativo, codigo) DO NOTHING;


-- ============================================================
-- ETAPA 5 — FUNCTION: Copiar template para novo tenant
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_copiar_template_demonstrativos(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_template_id uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  INSERT INTO public.cont_linha_demonstrativo
    (company_id, demonstrativo, codigo, nome, nivel, linha_pai_id, ordem,
     tipo_calculo, formula, natureza_saldo, atividade_dfc,
     visivel, editavel, ativo)
  SELECT
    p_company_id, demonstrativo, codigo, nome, nivel, NULL, ordem,
    tipo_calculo, formula, natureza_saldo, atividade_dfc,
    visivel, editavel, ativo
  FROM public.cont_linha_demonstrativo
  WHERE company_id = v_template_id
  ON CONFLICT (company_id, demonstrativo, codigo) DO NOTHING;
END;
$$;


-- ============================================================
-- ETAPA 6.1 — FUNCTION: Gerar DRE
-- Adaptado: usa movimentacoes (tipo credito/debito) + chart_of_accounts
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_gerar_dre(
  p_company_id uuid,
  p_data_inicio date,
  p_data_fim date
)
RETURNS TABLE (
  codigo text,
  nome text,
  nivel int,
  tipo_calculo text,
  valor numeric(14,2),
  ordem int
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  CREATE TEMP TABLE _dre_temp ON COMMIT DROP AS
  SELECT
    ld.codigo,
    ld.nome,
    ld.nivel,
    ld.tipo_calculo,
    ld.formula,
    ld.ordem,
    COALESCE(SUM(
      CASE
        WHEN ca.account_nature = 'credit' AND m.tipo = 'credito' THEN m.valor * mc.fator
        WHEN ca.account_nature = 'credit' AND m.tipo = 'debito'  THEN m.valor * mc.fator * -1
        WHEN ca.account_nature = 'debit'  AND m.tipo = 'debito'  THEN m.valor * mc.fator
        WHEN ca.account_nature = 'debit'  AND m.tipo = 'credito' THEN m.valor * mc.fator * -1
        ELSE 0
      END
    ), 0)::numeric(14,2) AS valor
  FROM public.cont_linha_demonstrativo ld
  LEFT JOIN public.cont_mapeamento_contas mc
    ON mc.linha_demonstrativo_id = ld.id AND mc.ativo = true AND mc.company_id = p_company_id
  LEFT JOIN public.chart_of_accounts ca
    ON ca.id = mc.conta_operacional_id
  LEFT JOIN public.movimentacoes m
    ON m.conta_contabil_id = ca.id
    AND m.company_id = p_company_id
    AND m.data >= p_data_inicio
    AND m.data <= p_data_fim
  WHERE ld.company_id = p_company_id
    AND ld.demonstrativo = 'DRE'
    AND ld.ativo = true
    AND ld.visivel = true
  GROUP BY ld.codigo, ld.nome, ld.nivel, ld.tipo_calculo, ld.formula, ld.ordem;

  -- Calcular linhas tipo 'resultado' usando formula JSONB
  UPDATE _dre_temp t
  SET valor = (
    SELECT CASE
      WHEN t.formula->>'operacao' = 'subtrair' THEN
        (SELECT COALESCE(valor, 0) FROM _dre_temp WHERE codigo = (t.formula->'linhas'->>0))
        - COALESCE((
          SELECT SUM(COALESCE(sub.valor, 0))
          FROM _dre_temp sub
          WHERE sub.codigo IN (
            SELECT jsonb_array_elements_text(t.formula->'linhas')
            OFFSET 1
          )
        ), 0)
      WHEN t.formula->>'operacao' = 'somar' THEN
        (SELECT COALESCE(SUM(sub.valor), 0)
         FROM _dre_temp sub
         WHERE sub.codigo IN (SELECT jsonb_array_elements_text(t.formula->'linhas')))
      ELSE 0
    END
  )
  WHERE t.tipo_calculo = 'resultado'
    AND t.formula IS NOT NULL;

  RETURN QUERY
  SELECT t.codigo, t.nome, t.nivel, t.tipo_calculo, t.valor, t.ordem
  FROM _dre_temp t
  ORDER BY t.ordem;
END;
$$;


-- ============================================================
-- ETAPA 6.2 — FUNCTION: Gerar DFC
-- Adaptado: usa movimentacoes com data (data_pagamento real)
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_gerar_dfc(
  p_company_id uuid,
  p_data_inicio date,
  p_data_fim date
)
RETURNS TABLE (
  codigo text,
  nome text,
  nivel int,
  atividade_dfc text,
  valor numeric(14,2),
  ordem int
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  CREATE TEMP TABLE _dfc_temp ON COMMIT DROP AS
  SELECT
    ld.codigo,
    ld.nome,
    ld.nivel,
    ld.atividade_dfc,
    ld.tipo_calculo,
    ld.formula,
    ld.ordem,
    COALESCE(SUM(
      CASE
        WHEN m.tipo = 'credito' THEN m.valor * mc.fator
        WHEN m.tipo = 'debito'  THEN m.valor * mc.fator * -1
        ELSE 0
      END
    ), 0)::numeric(14,2) AS valor
  FROM public.cont_linha_demonstrativo ld
  LEFT JOIN public.cont_mapeamento_contas mc
    ON mc.linha_demonstrativo_id = ld.id AND mc.ativo = true AND mc.company_id = p_company_id
  LEFT JOIN public.chart_of_accounts ca
    ON ca.id = mc.conta_operacional_id
  LEFT JOIN public.movimentacoes m
    ON m.conta_contabil_id = ca.id
    AND m.company_id = p_company_id
    AND m.data >= p_data_inicio
    AND m.data <= p_data_fim
  WHERE ld.company_id = p_company_id
    AND ld.demonstrativo = 'DFC'
    AND ld.ativo = true
    AND ld.visivel = true
  GROUP BY ld.codigo, ld.nome, ld.nivel, ld.atividade_dfc,
           ld.tipo_calculo, ld.formula, ld.ordem;

  -- Calcular totais por atividade (linhas tipo 'resultado')
  UPDATE _dfc_temp t
  SET valor = (
    SELECT COALESCE(SUM(sub.valor), 0)
    FROM _dfc_temp sub
    WHERE sub.atividade_dfc = t.atividade_dfc
      AND sub.tipo_calculo = 'soma'
  )
  WHERE t.tipo_calculo = 'resultado'
    AND t.atividade_dfc IS NOT NULL;

  -- Calcular variação líquida total (DFC.VAR)
  UPDATE _dfc_temp
  SET valor = (
    SELECT COALESCE(SUM(sub.valor), 0)
    FROM _dfc_temp sub
    WHERE sub.tipo_calculo = 'resultado'
      AND sub.atividade_dfc IS NOT NULL
  )
  WHERE codigo = 'DFC.VAR';

  RETURN QUERY
  SELECT t.codigo, t.nome, t.nivel, t.atividade_dfc, t.valor, t.ordem
  FROM _dfc_temp t
  ORDER BY t.ordem;
END;
$$;


-- ============================================================
-- ETAPA 6.3 — FUNCTION: Gerar BP
-- Adaptado: usa movimentacoes + saldos manuais
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_gerar_bp(
  p_company_id uuid,
  p_data_referencia date
)
RETURNS TABLE (
  codigo text,
  nome text,
  nivel int,
  natureza_saldo text,
  valor numeric(14,2),
  origem text,
  ordem int
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_periodo_ref date := (DATE_TRUNC('month', p_data_referencia) + INTERVAL '1 month - 1 day')::date;
BEGIN
  CREATE TEMP TABLE _bp_temp ON COMMIT DROP AS

  -- Saldos manuais
  SELECT
    ld.codigo, ld.nome, ld.nivel, ld.natureza_saldo, ld.tipo_calculo,
    sp.saldo AS valor,
    'manual'::text AS origem,
    ld.ordem
  FROM public.cont_saldos_patrimoniais sp
  JOIN public.cont_linha_demonstrativo ld ON ld.id = sp.linha_demonstrativo_id
  WHERE sp.company_id = p_company_id
    AND sp.periodo_ref = v_periodo_ref
    AND ld.demonstrativo = 'BP'
    AND ld.ativo = true

  UNION ALL

  -- Saldos derivados de movimentações
  SELECT
    ld.codigo, ld.nome, ld.nivel, ld.natureza_saldo, ld.tipo_calculo,
    COALESCE(SUM(
      CASE
        WHEN ca.account_nature = 'credit' AND m.tipo = 'credito' THEN m.valor * mc.fator
        WHEN ca.account_nature = 'credit' AND m.tipo = 'debito'  THEN m.valor * mc.fator * -1
        WHEN ca.account_nature = 'debit'  AND m.tipo = 'debito'  THEN m.valor * mc.fator
        WHEN ca.account_nature = 'debit'  AND m.tipo = 'credito' THEN m.valor * mc.fator * -1
        ELSE 0
      END
    ), 0)::numeric(14,2) AS valor,
    'transacional'::text AS origem,
    ld.ordem
  FROM public.cont_linha_demonstrativo ld
  JOIN public.cont_mapeamento_contas mc
    ON mc.linha_demonstrativo_id = ld.id AND mc.ativo = true AND mc.company_id = p_company_id
  JOIN public.chart_of_accounts ca
    ON ca.id = mc.conta_operacional_id
  JOIN public.movimentacoes m
    ON m.conta_contabil_id = ca.id
    AND m.company_id = p_company_id
    AND m.data <= p_data_referencia
  WHERE ld.company_id = p_company_id
    AND ld.demonstrativo = 'BP'
    AND ld.ativo = true
    AND ld.editavel = false
  GROUP BY ld.codigo, ld.nome, ld.nivel, ld.natureza_saldo,
           ld.tipo_calculo, ld.ordem;

  -- Calcular totais de grupo (soma dos filhos)
  UPDATE _bp_temp g
  SET valor = (
    SELECT COALESCE(SUM(sub.valor), 0)
    FROM _bp_temp sub
    WHERE sub.codigo LIKE g.codigo || '.%'
      AND sub.nivel > g.nivel
  )
  WHERE g.tipo_calculo IN ('soma', 'resultado')
    AND g.nivel = 1
    AND g.codigo NOT IN ('BP.AT', 'BP.PT');

  -- Total Ativo = AC + ANC
  UPDATE _bp_temp SET valor = (
    SELECT COALESCE(SUM(valor), 0) FROM _bp_temp WHERE codigo IN ('BP.AC', 'BP.ANC')
  ) WHERE codigo = 'BP.AT';

  -- Total Passivo + PL = PC + PNC + PL
  UPDATE _bp_temp SET valor = (
    SELECT COALESCE(SUM(valor), 0) FROM _bp_temp WHERE codigo IN ('BP.PC', 'BP.PNC', 'BP.PL')
  ) WHERE codigo = 'BP.PT';

  RETURN QUERY
  SELECT t.codigo, t.nome, t.nivel, t.natureza_saldo, t.valor, t.origem, t.ordem
  FROM _bp_temp t
  ORDER BY t.ordem;
END;
$$;


COMMIT;
