-- =====================================================
-- REGRAS DE CONCILIAÇÃO BANCÁRIA
-- Sistema de memorização para auto-matching
-- =====================================================

CREATE TABLE IF NOT EXISTS conciliation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

    -- Condição de match
    condition_field TEXT NOT NULL,          -- 'description', 'amount', 'memo'
    condition_operator TEXT NOT NULL,       -- 'contains', 'equals', 'starts_with', 'regex'
    condition_value TEXT NOT NULL,          -- ex: 'FOLHA', 'PIX LUCIANNA'

    -- Condição secundária (opcional)
    condition_field_2 TEXT,                 -- null = sem condição secundária
    condition_operator_2 TEXT,
    condition_value_2 TEXT,

    -- Ação: o que fazer quando a regra bate
    action_type TEXT NOT NULL,              -- 'category', 'payable', 'receivable', 'create_payable', 'create_receivable', 'ignore'
    action_value TEXT,                      -- ID da categoria, fornecedor, etc
    action_description TEXT,               -- Descrição padrão para novos lançamentos

    -- Metadados
    name TEXT NOT NULL,                     -- Nome legível da regra
    confidence INTEGER DEFAULT 100,         -- Score de confiança quando a regra bate
    times_applied INTEGER DEFAULT 0,        -- Quantas vezes foi aplicada
    last_applied_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    is_auto_learned BOOLEAN DEFAULT false,  -- true = aprendida automaticamente
    source_description TEXT,                -- Descrição original que gerou o aprendizado

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_conciliation_rules_company ON conciliation_rules(company_id);
CREATE INDEX IF NOT EXISTS idx_conciliation_rules_active ON conciliation_rules(company_id, is_active);

-- RLS
ALTER TABLE conciliation_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their company rules" ON conciliation_rules;
CREATE POLICY "Users can view their company rules" ON conciliation_rules
    FOR SELECT USING (company_id IN (
        SELECT id FROM companies WHERE owner_id = auth.uid()
        UNION
        SELECT company_id FROM user_companies WHERE user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "Users can insert rules for their companies" ON conciliation_rules;
CREATE POLICY "Users can insert rules for their companies" ON conciliation_rules
    FOR INSERT WITH CHECK (company_id IN (
        SELECT id FROM companies WHERE owner_id = auth.uid()
        UNION
        SELECT company_id FROM user_companies WHERE user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "Users can update their company rules" ON conciliation_rules;
CREATE POLICY "Users can update their company rules" ON conciliation_rules
    FOR UPDATE USING (company_id IN (
        SELECT id FROM companies WHERE owner_id = auth.uid()
        UNION
        SELECT company_id FROM user_companies WHERE user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "Users can delete their company rules" ON conciliation_rules;
CREATE POLICY "Users can delete their company rules" ON conciliation_rules
    FOR DELETE USING (company_id IN (
        SELECT id FROM companies WHERE owner_id = auth.uid()
        UNION
        SELECT company_id FROM user_companies WHERE user_id = auth.uid()
    ));

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_conciliation_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_conciliation_rules_updated_at ON conciliation_rules;
CREATE TRIGGER trigger_update_conciliation_rules_updated_at
    BEFORE UPDATE ON conciliation_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_conciliation_rules_updated_at();
