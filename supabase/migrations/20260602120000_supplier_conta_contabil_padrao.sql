-- =====================================================
-- Categoria contábil padrão por fornecedor
-- Permite auto-preencher a categoria contábil ao lançar
-- contas a pagar para um fornecedor conhecido.
-- =====================================================

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS conta_contabil_padrao_id uuid
  REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.suppliers.conta_contabil_padrao_id IS
  'Categoria contábil (plano de contas) padrão deste fornecedor; usada para auto-preencher contas a pagar.';
