-- Adicionar tipo da transação (debit/credit) e valor de referência às regras de conciliação
-- Permite memorizar padrão completo: descrição + direção + valor

ALTER TABLE conciliation_rules
  ADD COLUMN IF NOT EXISTS tipo_transacao TEXT,        -- 'debit' ou 'credit'
  ADD COLUMN IF NOT EXISTS valor_referencia NUMERIC;   -- valor absoluto da transação original

-- Índice para busca por tipo
CREATE INDEX IF NOT EXISTS idx_conciliation_rules_tipo
  ON conciliation_rules(company_id, tipo_transacao)
  WHERE ativa = true;
