-- Adicionar campo competência (mês/ano) em contas a pagar e contas a receber
-- Formato: "MM/YYYY" (ex: "03/2026")

ALTER TABLE accounts_payable
  ADD COLUMN IF NOT EXISTS competencia TEXT;

ALTER TABLE accounts_receivable
  ADD COLUMN IF NOT EXISTS competencia TEXT;

-- Índice para filtrar por competência
CREATE INDEX IF NOT EXISTS idx_accounts_payable_competencia ON accounts_payable(competencia);
CREATE INDEX IF NOT EXISTS idx_accounts_receivable_competencia ON accounts_receivable(competencia);
