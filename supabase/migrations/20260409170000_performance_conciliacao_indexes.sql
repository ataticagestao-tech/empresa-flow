-- Índices compostos para acelerar queries da conciliação bancária com 3000+ transações

-- Query principal: bank_transactions pendentes por conta bancária
CREATE INDEX IF NOT EXISTS idx_bt_account_status_date
  ON bank_transactions(bank_account_id, status, date DESC);

-- Query de reconciliados (busca reconciled_receivable_id para excluir CRs já conciliados)
CREATE INDEX IF NOT EXISTS idx_bt_company_status_rec_receivable
  ON bank_transactions(company_id, status)
  WHERE status = 'reconciled' AND reconciled_receivable_id IS NOT NULL;

-- Contas a pagar: filtro por company + status aberto
CREATE INDEX IF NOT EXISTS idx_cp_company_status_aberto
  ON contas_pagar(company_id, status)
  WHERE status = 'aberto';

-- Contas a receber: filtro por company + status pendente
CREATE INDEX IF NOT EXISTS idx_cr_company_status_pendente
  ON contas_receber(company_id, status)
  WHERE status IN ('aberto', 'parcial', 'vencido');

-- Statement files lookup
CREATE INDEX IF NOT EXISTS idx_bsf_company_account
  ON bank_statement_files(company_id, bank_account_id, created_at DESC);
