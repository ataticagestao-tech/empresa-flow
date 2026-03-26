-- =====================================================
-- Fix: o código usa lancamento_id, tipo_lancamento e diferenca
-- na tabela bank_reconciliation_matches, mas a migration original
-- criou payable_id, receivable_id e matched_amount.
-- Adicionamos as colunas que o código espera.
-- =====================================================

-- 1) Adicionar colunas que o código usa
ALTER TABLE bank_reconciliation_matches
  ADD COLUMN IF NOT EXISTS lancamento_id UUID,
  ADD COLUMN IF NOT EXISTS tipo_lancamento TEXT,
  ADD COLUMN IF NOT EXISTS diferenca DECIMAL(15, 2);

-- 2) Adicionar coluna banco em bank_accounts (código busca 'banco')
ALTER TABLE bank_accounts
  ADD COLUMN IF NOT EXISTS banco TEXT;

-- 3) Preencher banco a partir de bank_name onde ainda não tiver
UPDATE bank_accounts SET banco = bank_name WHERE banco IS NULL AND bank_name IS NOT NULL;

-- 4) Índices para as novas colunas
CREATE INDEX IF NOT EXISTS idx_brm_lancamento_id ON bank_reconciliation_matches(lancamento_id);
CREATE INDEX IF NOT EXISTS idx_brm_tipo_lancamento ON bank_reconciliation_matches(tipo_lancamento);

-- 5) Adicionar bank_account_id na matches se não existir
ALTER TABLE bank_reconciliation_matches
  ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE CASCADE;

-- 6) Garantir que category_id existe em bank_transactions
ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bank_tx_category ON bank_transactions(category_id);

-- 7) Garantir que reconciled_at, reconciled_by, reconciliation_note existem
ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reconciled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reconciliation_note TEXT;

-- 8) Garantir DELETE policy em bank_transactions para poder excluir lotes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'bank_transactions'
    AND policyname = 'Users can delete bank transactions of their companies'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can delete bank transactions of their companies" ON bank_transactions FOR DELETE USING (company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid()))';
  END IF;
END$$;
