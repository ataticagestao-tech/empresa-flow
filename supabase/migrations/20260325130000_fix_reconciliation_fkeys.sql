-- =====================================================
-- Fix: FK de bank_reconciliation_matches apontava para
-- accounts_payable/accounts_receivable, mas o código usa
-- contas_pagar/contas_receber
-- =====================================================

-- 1) Remover FKs antigas
ALTER TABLE bank_reconciliation_matches
  DROP CONSTRAINT IF EXISTS bank_reconciliation_matches_payable_id_fkey;

ALTER TABLE bank_reconciliation_matches
  DROP CONSTRAINT IF EXISTS bank_reconciliation_matches_receivable_id_fkey;

-- 2) Remover FKs antigas de bank_transactions também
ALTER TABLE bank_transactions
  DROP CONSTRAINT IF EXISTS bank_transactions_reconciled_payable_id_fkey;

ALTER TABLE bank_transactions
  DROP CONSTRAINT IF EXISTS bank_transactions_reconciled_receivable_id_fkey;

-- 3) Recriar FKs apontando para as tabelas corretas
ALTER TABLE bank_reconciliation_matches
  ADD CONSTRAINT bank_reconciliation_matches_payable_id_fkey
    FOREIGN KEY (payable_id) REFERENCES contas_pagar(id) ON DELETE SET NULL;

ALTER TABLE bank_reconciliation_matches
  ADD CONSTRAINT bank_reconciliation_matches_receivable_id_fkey
    FOREIGN KEY (receivable_id) REFERENCES contas_receber(id) ON DELETE SET NULL;

ALTER TABLE bank_transactions
  ADD CONSTRAINT bank_transactions_reconciled_payable_id_fkey
    FOREIGN KEY (reconciled_payable_id) REFERENCES contas_pagar(id) ON DELETE SET NULL;

ALTER TABLE bank_transactions
  ADD CONSTRAINT bank_transactions_reconciled_receivable_id_fkey
    FOREIGN KEY (reconciled_receivable_id) REFERENCES contas_receber(id) ON DELETE SET NULL;
