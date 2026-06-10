-- ============================================================
-- Classificação gerencial em 3 baldes: custo / variavel / fixa
-- Antes: expense_nature aceitava só 'fixa' | 'variavel' (+ NULL).
-- Agora aceita também 'custo' (CMV/CPV/CSP — custo direto do que foi vendido).
--
-- Esse único campo alimenta:
--   • Ponto de Equilíbrio  → custo + variavel contam como VARIÁVEL; fixa como FIXO.
--   • Margem Bruta / CMV   → custo é o CMV (entra na margem bruta).
-- NULL = automático (heurística decide).
-- ============================================================

ALTER TABLE public.chart_of_accounts
  DROP CONSTRAINT IF EXISTS chart_of_accounts_expense_nature_check;

ALTER TABLE public.chart_of_accounts
  ADD CONSTRAINT chart_of_accounts_expense_nature_check
  CHECK (expense_nature IS NULL OR expense_nature IN ('fixa', 'variavel', 'custo'));

COMMENT ON COLUMN public.chart_of_accounts.expense_nature IS
  'Classificação gerencial: custo (CMV/CPV/CSP), variavel (escala c/ a venda) ou fixa. NULL = automático (heurística). Alimenta Ponto de Equilíbrio e Margem Bruta/CMV.';
