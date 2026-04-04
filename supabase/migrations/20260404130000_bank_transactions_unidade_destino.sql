-- ============================================================
-- Adicionar campo unidade_destino_id em bank_transactions
-- Para ratear transações do CNPJ para lojas/unidades
-- ============================================================

ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS unidade_destino_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bank_tx_unidade_destino
  ON public.bank_transactions(unidade_destino_id);

-- Adicionar também em contas_pagar e contas_receber
DO $$
BEGIN
  BEGIN
    ALTER TABLE public.contas_pagar
      ADD COLUMN IF NOT EXISTS unidade_destino_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  BEGIN
    ALTER TABLE public.contas_receber
      ADD COLUMN IF NOT EXISTS unidade_destino_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
END $$;
