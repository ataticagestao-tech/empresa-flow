-- Adicionar campos: competência (mês/ano) e chave PIX

ALTER TABLE accounts_payable
  ADD COLUMN IF NOT EXISTS competencia TEXT,
  ADD COLUMN IF NOT EXISTS pix_key TEXT;

ALTER TABLE accounts_receivable
  ADD COLUMN IF NOT EXISTS competencia TEXT,
  ADD COLUMN IF NOT EXISTS pix_key TEXT;

CREATE INDEX IF NOT EXISTS idx_accounts_payable_competencia ON accounts_payable(competencia);
CREATE INDEX IF NOT EXISTS idx_accounts_receivable_competencia ON accounts_receivable(competencia);
