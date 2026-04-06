-- =====================================================
-- Tabelas de Conciliação Bancária (matches + adjustments)
-- e colunas extras em bank_transactions
-- =====================================================

-- 1) Colunas extras em bank_transactions
ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reconciled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reconciliation_note TEXT;

-- 2) Tabela de matches (vínculo extrato ↔ conta a pagar/receber)
CREATE TABLE IF NOT EXISTS bank_reconciliation_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    bank_account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
    bank_transaction_id UUID NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
    payable_id UUID REFERENCES accounts_payable(id) ON DELETE SET NULL,
    receivable_id UUID REFERENCES accounts_receivable(id) ON DELETE SET NULL,
    match_type TEXT NOT NULL DEFAULT 'manual', -- manual, auto, rule
    matched_amount DECIMAL(15, 2) NOT NULL,
    matched_date DATE,
    status TEXT NOT NULL DEFAULT 'matched', -- matched, unmatched
    note TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3) Tabela de ajustes (overrides de valor/data/nota)
CREATE TABLE IF NOT EXISTS bank_reconciliation_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    match_id UUID NOT NULL REFERENCES bank_reconciliation_matches(id) ON DELETE CASCADE,
    payload JSONB NOT NULL DEFAULT '{}',
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4) RLS — bank_reconciliation_matches
ALTER TABLE bank_reconciliation_matches ENABLE ROW LEVEL SECURITY;

drop policy if exists "Users can view reconciliation matches of their companies" on bank_reconciliation_matches;
CREATE POLICY "Users can view reconciliation matches of their companies"
    ON bank_reconciliation_matches FOR SELECT
    USING (company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid()));

drop policy if exists "Users can insert reconciliation matches for their companies" on bank_reconciliation_matches;
CREATE POLICY "Users can insert reconciliation matches for their companies"
    ON bank_reconciliation_matches FOR INSERT
    WITH CHECK (company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid()));

drop policy if exists "Users can update reconciliation matches of their companies" on bank_reconciliation_matches;
CREATE POLICY "Users can update reconciliation matches of their companies"
    ON bank_reconciliation_matches FOR UPDATE
    USING (company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid()));

drop policy if exists "Users can delete reconciliation matches of their companies" on bank_reconciliation_matches;
CREATE POLICY "Users can delete reconciliation matches of their companies"
    ON bank_reconciliation_matches FOR DELETE
    USING (company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid()));

-- 5) RLS — bank_reconciliation_adjustments
ALTER TABLE bank_reconciliation_adjustments ENABLE ROW LEVEL SECURITY;

drop policy if exists "Users can view reconciliation adjustments of their companies" on bank_reconciliation_adjustments;
CREATE POLICY "Users can view reconciliation adjustments of their companies"
    ON bank_reconciliation_adjustments FOR SELECT
    USING (company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid()));

drop policy if exists "Users can insert reconciliation adjustments for their companies" on bank_reconciliation_adjustments;
CREATE POLICY "Users can insert reconciliation adjustments for their companies"
    ON bank_reconciliation_adjustments FOR INSERT
    WITH CHECK (company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid()));

-- 6) Índices para performance
CREATE INDEX IF NOT EXISTS idx_brm_bank_transaction_id ON bank_reconciliation_matches(bank_transaction_id);
CREATE INDEX IF NOT EXISTS idx_brm_payable_id ON bank_reconciliation_matches(payable_id);
CREATE INDEX IF NOT EXISTS idx_brm_receivable_id ON bank_reconciliation_matches(receivable_id);
CREATE INDEX IF NOT EXISTS idx_brm_company_id ON bank_reconciliation_matches(company_id);
CREATE INDEX IF NOT EXISTS idx_bra_match_id ON bank_reconciliation_adjustments(match_id);
