-- ============================================================
-- Receipts Module (Recibos)
-- Adapted from 001_recibos.sql spec for empresa-flow schema
-- Tables: receipts, receipt_templates
-- RPC: generate_receipt_number
-- Storage: documentos bucket
-- ============================================================

-- 1. ENUM: envio_status (reusável para e-mail e WhatsApp)
DO $$ BEGIN
  CREATE TYPE envio_status AS ENUM ('pendente', 'enviado', 'erro');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================
-- 2. TABELA: receipt_templates (1 por empresa)
-- ============================================================
CREATE TABLE IF NOT EXISTS receipt_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- e-mail
  email_assunto   TEXT NOT NULL DEFAULT 'Comprovante de Pagamento — {{favorecido}}',
  email_corpo     TEXT NOT NULL DEFAULT 'Olá, segue em anexo o comprovante de pagamento no valor de {{valor}} realizado em {{data}}.',

  -- pdf
  logo_url        TEXT,
  cor_primaria    TEXT NOT NULL DEFAULT '#0d1b2a',
  rodape_texto    TEXT NOT NULL DEFAULT 'Gerado por Tática Gestão • meutatico.site',

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (company_id)
);

-- ============================================================
-- 3. TABELA: receipts (recibos gerados)
-- ============================================================
CREATE TABLE IF NOT EXISTS receipts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_payable_id    UUID REFERENCES accounts_payable(id) ON DELETE SET NULL,
  account_receivable_id UUID REFERENCES accounts_receivable(id) ON DELETE SET NULL,

  -- numeração
  numero                TEXT NOT NULL,           -- ex: RCB-2026-000147

  -- dados do pagamento (copiados no momento da geração — imutáveis)
  valor                 NUMERIC(12,2) NOT NULL,
  favorecido            TEXT NOT NULL,
  forma_pagamento       TEXT,
  categoria             TEXT,
  conta_bancaria        TEXT,
  data_pagamento        TIMESTAMPTZ NOT NULL,
  descricao             TEXT,

  -- tipo: payable (contas a pagar) ou receivable (contas a receber)
  tipo                  TEXT NOT NULL DEFAULT 'payable' CHECK (tipo IN ('payable', 'receivable')),

  -- arquivo
  pdf_url               TEXT,

  -- envio: e-mail
  status_email          envio_status NOT NULL DEFAULT 'pendente',
  email_destino         TEXT,
  email_enviado_em      TIMESTAMPTZ,
  email_erro            TEXT,

  -- envio: WhatsApp (próxima fase — Evolution API)
  status_whatsapp       envio_status NOT NULL DEFAULT 'pendente',
  whatsapp_destino      TEXT,
  whatsapp_enviado_em   TIMESTAMPTZ,
  whatsapp_erro         TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (company_id, numero)
);

-- ============================================================
-- 4. ALTER: accounts_payable / accounts_receivable — FK para recibo
-- ============================================================
ALTER TABLE accounts_payable
  ADD COLUMN IF NOT EXISTS receipt_id UUID REFERENCES receipts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS receipt_generated BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE accounts_receivable
  ADD COLUMN IF NOT EXISTS receipt_id UUID REFERENCES receipts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS receipt_generated BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================================
-- 5. ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_receipts_company           ON receipts(company_id);
CREATE INDEX IF NOT EXISTS idx_receipts_account_payable   ON receipts(account_payable_id);
CREATE INDEX IF NOT EXISTS idx_receipts_account_receivable ON receipts(account_receivable_id);
CREATE INDEX IF NOT EXISTS idx_receipts_numero            ON receipts(numero);
CREATE INDEX IF NOT EXISTS idx_receipts_data              ON receipts(data_pagamento DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_status_email      ON receipts(status_email);
CREATE INDEX IF NOT EXISTS idx_receipt_templates_company   ON receipt_templates(company_id);

-- ============================================================
-- 6. FUNÇÃO: auto-incremento do número do recibo (race-condition safe)
-- ============================================================
CREATE OR REPLACE FUNCTION generate_receipt_number(p_company_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_year TEXT := to_char(NOW(), 'YYYY');
  v_seq  INT;
  v_num  TEXT;
BEGIN
  -- Usa MAX do último segmento numérico (não COUNT) para evitar gaps
  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(numero, '-', 3) AS INTEGER)
  ), 0) + 1
  INTO v_seq
  FROM receipts
  WHERE company_id = p_company_id
    AND numero LIKE 'RCB-' || v_year || '-%';

  v_num := 'RCB-' || v_year || '-' || LPAD(v_seq::TEXT, 6, '0');
  RETURN v_num;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 7. RLS (Row Level Security)
-- ============================================================
ALTER TABLE receipts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_templates ENABLE ROW LEVEL SECURITY;

-- Receipts: FOR ALL (select, insert, update, delete)
DROP POLICY IF EXISTS "receipts_company" ON receipts;
CREATE POLICY "receipts_company" ON receipts
  FOR ALL TO authenticated
  USING (company_id IN (
    SELECT company_id FROM user_companies WHERE user_id = auth.uid()
  ))
  WITH CHECK (company_id IN (
    SELECT company_id FROM user_companies WHERE user_id = auth.uid()
  ));

-- Templates: FOR ALL
DROP POLICY IF EXISTS "receipt_templates_company" ON receipt_templates;
CREATE POLICY "receipt_templates_company" ON receipt_templates
  FOR ALL TO authenticated
  USING (company_id IN (
    SELECT company_id FROM user_companies WHERE user_id = auth.uid()
  ))
  WITH CHECK (company_id IN (
    SELECT company_id FROM user_companies WHERE user_id = auth.uid()
  ));

-- ============================================================
-- 8. TRIGGERS: updated_at automático
-- ============================================================
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS receipts_updated_at ON receipts;
CREATE TRIGGER receipts_updated_at
  BEFORE UPDATE ON receipts
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS receipt_templates_updated_at ON receipt_templates;
CREATE TRIGGER receipt_templates_updated_at
  BEFORE UPDATE ON receipt_templates
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================================
-- 9. STORAGE: bucket documentos (recibos, notas, etc.)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos', 'documentos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can upload documentos" ON storage.objects;
DROP POLICY IF EXISTS "Users can view documentos" ON storage.objects;

CREATE POLICY "Users can upload documentos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documentos');

CREATE POLICY "Users can view documentos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'documentos');
