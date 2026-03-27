-- =====================================================
-- Adicionar colunas de sugestão de IA em bank_transactions
-- O código usa sugestao_conta_id, confianca_match, metodo_match
-- =====================================================

-- Colunas de sugestão de IA
ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS sugestao_conta_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confianca_match INTEGER,
  ADD COLUMN IF NOT EXISTS metodo_match TEXT;

-- Coluna source (ofx, pdf, credit_card_pdf)
ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS source TEXT;

-- Índices para performance no matching
CREATE INDEX IF NOT EXISTS idx_bank_tx_sugestao_conta ON bank_transactions(sugestao_conta_id);
CREATE INDEX IF NOT EXISTS idx_bank_tx_metodo_match ON bank_transactions(metodo_match);
CREATE INDEX IF NOT EXISTS idx_bank_tx_company_status ON bank_transactions(company_id, status);