-- =====================================================
-- Centro de custo padrão por fornecedor
-- Auto-preenche o centro de custo ao lançar contas a pagar
-- para um fornecedor conhecido (mesma ideia da categoria padrão).
-- =====================================================

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS centro_custo_padrao_id uuid
  REFERENCES public.centros_custo(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.suppliers.centro_custo_padrao_id IS
  'Centro de custo padrão deste fornecedor; usado para auto-preencher contas a pagar.';
