-- ==========================================================================
-- VALIDAÇÕES E SEGURANÇA EM bank_accounts
-- - ACCTID único por empresa (UNIQUE parcial)
-- - Ajuste: index criado em migration anterior vira UNIQUE
-- ==========================================================================

-- Remove o INDEX simples criado antes pra dar lugar ao UNIQUE
DROP INDEX IF EXISTS idx_bank_accounts_ofx_acctid;

-- UNIQUE parcial: 2 contas da mesma empresa não podem ter o mesmo ACCTID.
-- Permite múltiplas com ACCTID null (placeholders, contas internas).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_bank_accounts_company_ofx_acctid
  ON bank_accounts(company_id, ofx_acctid)
  WHERE ofx_acctid IS NOT NULL AND is_active = true;

COMMENT ON INDEX uniq_bank_accounts_company_ofx_acctid IS
'Garante que cada ACCTID é único por empresa ativa — evita ambiguidade no import por email.';
