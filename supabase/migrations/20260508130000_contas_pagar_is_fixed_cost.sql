-- Marca uma conta a pagar como despesa fixa/recorrente (aluguel, internet, salarios, etc).
-- A flag e usada para filtrar uma "aba" de Contas Fixas em Financeiro.
-- Sem geracao automatica de CPs futuras nesta fase.

ALTER TABLE public.contas_pagar
  ADD COLUMN IF NOT EXISTS is_fixed_cost boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_contas_pagar_is_fixed_cost
  ON public.contas_pagar (company_id, is_fixed_cost)
  WHERE is_fixed_cost = true AND deleted_at IS NULL;

COMMENT ON COLUMN public.contas_pagar.is_fixed_cost IS
  'true = despesa fixa/recorrente. Usado pela tela /contas-fixas para filtrar.';
