-- ============================================================
-- Adicionar classificação fixa/variável ao plano de contas
-- Usado para: ponto de equilíbrio, indicadores gerenciais
-- ============================================================

ALTER TABLE public.chart_of_accounts
  ADD COLUMN IF NOT EXISTS expense_nature text DEFAULT NULL
  CHECK (expense_nature IN ('fixa', 'variavel', NULL));

COMMENT ON COLUMN public.chart_of_accounts.expense_nature IS
  'Classificação de despesa: fixa ou variavel. NULL para contas de receita/ativo/passivo.';
