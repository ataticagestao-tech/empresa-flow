-- ==========================================================================
-- IMPORTAÇÃO AUTOMÁTICA DE EXTRATO BANCÁRIO VIA E-MAIL
-- - Campos OFX em bank_accounts (ofx_acctid/bankid) pra mapear OFX -> conta
-- - Tabela email_import_log pra auditoria/idempotência (não reprocessar)
-- - RPC auto_conciliar_extrato: aplica matches conservadores (rule + CR/CP exato)
-- ==========================================================================

-- ── 1) Identificadores OFX em bank_accounts ───────────────────────────────
ALTER TABLE bank_accounts
  ADD COLUMN IF NOT EXISTS ofx_acctid TEXT,
  ADD COLUMN IF NOT EXISTS ofx_bankid TEXT,
  ADD COLUMN IF NOT EXISTS ofx_branchid TEXT,
  -- Política: 'off' = não auto-concilia, 'rule_only' = só matches via regra Alta confiança
  ADD COLUMN IF NOT EXISTS auto_conciliacao_policy TEXT NOT NULL DEFAULT 'off';

CREATE INDEX IF NOT EXISTS idx_bank_accounts_ofx_acctid
  ON bank_accounts(company_id, ofx_acctid)
  WHERE ofx_acctid IS NOT NULL;


-- ── 2) Log de imports por email (idempotência + auditoria) ─────────────────
CREATE TABLE IF NOT EXISTS email_import_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- gmail message-id (RFC 5322), garante que o mesmo email não é processado duas vezes
    message_id TEXT NOT NULL UNIQUE,
    from_address TEXT,
    subject TEXT,
    received_at TIMESTAMPTZ,
    processed_at TIMESTAMPTZ DEFAULT NOW(),

    -- Resultado do processamento
    status TEXT NOT NULL,  -- 'ok', 'no_ofx_attachment', 'unmatched_account', 'parse_error', 'error'
    error_detail TEXT,

    -- Identificação da conta (NULL se status='unmatched_account')
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,
    ofx_acctid TEXT,
    ofx_bankid TEXT,

    -- Stats
    transactions_parsed INT DEFAULT 0,
    transactions_inserted INT DEFAULT 0,
    transactions_auto_reconciled INT DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_import_log_processed
  ON email_import_log(processed_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_import_log_account
  ON email_import_log(bank_account_id, processed_at DESC);

ALTER TABLE email_import_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view email import log of their companies" ON email_import_log;
CREATE POLICY "Users can view email import log of their companies"
    ON email_import_log FOR SELECT
    USING (company_id IS NULL OR company_id IN (
        SELECT id FROM companies WHERE owner_id = auth.uid()
    ));


-- ── 3) Helper: normalizar texto (remover acento + uppercase) ───────────────
-- Espelha normalizeText() do useConciliationEngine.ts pra que o match server-side
-- siga exatamente o mesmo critério que a UI mostra.
CREATE OR REPLACE FUNCTION normalize_bank_text(p_text TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE STRICT AS $$
    SELECT UPPER(TRIM(
        regexp_replace(
            translate(p_text,
                'áéíóúàèìòùâêîôûãõñÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÑäëïöüçÄËÏÖÜÇ',
                'aeiouaeiouaeiouaonAEIOUAEIOUAEIOUAONaeioucAEIOUC'
            ),
            '\s+', ' ', 'g'
        )
    ))
$$;


-- ── 4) RPC: auto_conciliar_extrato ─────────────────────────────────────────
-- Política CONSERVADORA: só aplica matches que a UI marcaria score >= 90% via
-- regra aprendida — NÃO usa o fallback "ai_category" (35%) nem matches fuzzy.
--
-- Caminhos aceitos:
--   A) Regra ativa com acao='auto-conciliar' + confianca='Alta' bate palavra-chave
--      AND existe CR/CP da empresa com valor exato (±0.01) e data ±3 dias
--      → vincula CR/CP existente e conciliar_lote faz UPDATE pra 'pago'.
--   B) Regra ativa com acao='auto-conciliar' + confianca='Alta' + valor_referencia
--      bate (±1%) E não há CR/CP candidato
--      → cria CR/CP novo via conciliar_lote usando rule.account_id.
--
-- Tudo que não cair em A/B fica pendente pra revisão manual.
CREATE OR REPLACE FUNCTION auto_conciliar_extrato(
    p_company_id UUID,
    p_bank_account_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_bank_tx RECORD;
    v_rule RECORD;
    v_match_cp RECORD;
    v_match_cr RECORD;
    v_desc_norm TEXT;
    v_abs_amount NUMERIC;
    v_is_expense BOOLEAN;
    v_items JSONB := '[]'::JSONB;
    v_item JSONB;
    v_target_id UUID;
    v_target_type TEXT;  -- 'payable' ou 'receivable' ou 'create'
    v_account_id UUID;
    v_desc TEXT;
    v_lote_result JSONB;
    v_total_auto INT := 0;
BEGIN
    -- Itera só sobre transações pendentes desta conta importadas nas últimas 24h
    -- (limita escopo: imports antigos não sofrem re-processamento se a função for
    -- chamada de novo por engano).
    FOR v_bank_tx IN
        SELECT id, date, amount, description, memo
        FROM bank_transactions
        WHERE company_id = p_company_id
          AND bank_account_id = p_bank_account_id
          AND status = 'pending'
          AND created_at > NOW() - INTERVAL '24 hours'
        ORDER BY date ASC
    LOOP
        v_desc_norm := normalize_bank_text(COALESCE(v_bank_tx.description, '') || ' ' || COALESCE(v_bank_tx.memo, ''));
        v_abs_amount := ABS(v_bank_tx.amount);
        v_is_expense := v_bank_tx.amount < 0;

        -- Procura regra Alta confiança + auto-conciliar que bate palavra-chave
        -- e cujo tipo_transacao casa (debit/credit) ou é null (genérica).
        -- Empate: regra com palavra mais longa (mais específica) ganha.
        SELECT r.*
          INTO v_rule
          FROM conciliation_rules r
         WHERE r.company_id = p_company_id
           AND r.ativa = TRUE
           AND r.acao = 'auto-conciliar'
           AND r.confianca = 'Alta'
           AND r.account_id IS NOT NULL
           AND (r.tipo_transacao IS NULL
                OR r.tipo_transacao = CASE WHEN v_is_expense THEN 'debit' ELSE 'credit' END)
           AND EXISTS (
               SELECT 1 FROM unnest(r.palavras_chave) AS kw
                WHERE v_desc_norm LIKE '%' || normalize_bank_text(kw) || '%'
           )
         ORDER BY (
             SELECT MAX(LENGTH(normalize_bank_text(kw)))
               FROM unnest(r.palavras_chave) AS kw
              WHERE v_desc_norm LIKE '%' || normalize_bank_text(kw) || '%'
         ) DESC NULLS LAST
         LIMIT 1;

        -- Sem regra Alta → não auto-concilia. Fica pendente.
        IF v_rule.id IS NULL THEN CONTINUE; END IF;

        v_target_id := NULL;
        v_target_type := NULL;

        -- CAMINHO A: procura CR ou CP existente com valor exato + data ±3 dias.
        -- Status válidos do check constraint: 'aberto','pago','vencido','cancelado','parcial'
        -- → matching só em 'aberto' (vencido = atrasado, ainda em aberto na prática, mas
        -- aceitamos pra cobrir boletos pagos com atraso)
        IF v_is_expense THEN
            SELECT id INTO v_target_id
              FROM contas_pagar
             WHERE company_id = p_company_id
               AND status IN ('aberto', 'vencido')
               AND COALESCE(deleted_at, NULL) IS NULL
               AND ABS(valor - v_abs_amount) < 0.01
               AND ABS(data_vencimento - v_bank_tx.date) <= 3
             ORDER BY ABS(data_vencimento - v_bank_tx.date) ASC
             LIMIT 1;
            IF v_target_id IS NOT NULL THEN v_target_type := 'payable'; END IF;
        ELSE
            SELECT id INTO v_target_id
              FROM contas_receber
             WHERE company_id = p_company_id
               AND status IN ('aberto', 'vencido')
               AND COALESCE(deleted_at, NULL) IS NULL
               AND ABS(valor - v_abs_amount) < 0.01
               AND ABS(data_vencimento - v_bank_tx.date) <= 3
             ORDER BY ABS(data_vencimento - v_bank_tx.date) ASC
             LIMIT 1;
            IF v_target_id IS NOT NULL THEN v_target_type := 'receivable'; END IF;
        END IF;

        -- CAMINHO B: sem CR/CP existente, só cria se a regra tem valor_referencia
        -- compatível (±1%). Sem essa âncora de valor, ficaria criando CR/CP em qualquer
        -- valor que casasse só por palavra-chave — risco alto demais.
        IF v_target_id IS NULL THEN
            IF v_rule.valor_referencia IS NULL OR v_rule.valor_referencia <= 0 THEN
                CONTINUE;
            END IF;
            IF ABS(v_abs_amount - v_rule.valor_referencia) / v_rule.valor_referencia > 0.01 THEN
                CONTINUE;
            END IF;
            v_target_type := 'create';
        END IF;

        -- Monta item pro conciliar_lote
        v_account_id := v_rule.account_id;
        v_desc := COALESCE(v_bank_tx.description, 'Conciliação automática (email)');

        v_item := jsonb_build_object(
            'is_expense', v_is_expense,
            'amount', v_abs_amount,
            'date', v_bank_tx.date,
            'description', v_desc,
            'bank_tx_id', v_bank_tx.id,
            'account_id', v_account_id
        );

        -- Caminhos A e B: conciliar_lote sempre cria um novo CR/CP. Pra reusar um
        -- existente (caminho A), faz match manual aqui em vez do lote:
        IF v_target_type IN ('payable', 'receivable') THEN
            -- Marcar CR/CP existente como pago e linkar
            IF v_target_type = 'payable' THEN
                UPDATE contas_pagar
                   SET status = 'pago',
                       data_pagamento = v_bank_tx.date,
                       valor_pago = v_abs_amount,
                       conta_bancaria_id = p_bank_account_id
                 WHERE id = v_target_id AND status <> 'pago';
            ELSE
                UPDATE contas_receber
                   SET status = 'pago',
                       data_pagamento = v_bank_tx.date,
                       valor_pago = v_abs_amount,
                       conta_bancaria_id = p_bank_account_id
                 WHERE id = v_target_id AND status <> 'pago';
            END IF;

            -- Match + movimentação
            INSERT INTO bank_reconciliation_matches (
                company_id, bank_account_id, bank_transaction_id,
                payable_id, receivable_id,
                match_type, matched_amount, matched_date, status, note
            ) VALUES (
                p_company_id, p_bank_account_id, v_bank_tx.id,
                CASE WHEN v_is_expense THEN v_target_id ELSE NULL END,
                CASE WHEN NOT v_is_expense THEN v_target_id ELSE NULL END,
                'auto_email', v_abs_amount, v_bank_tx.date, 'matched',
                'Conciliação automática via regra: ' || (v_rule.palavras_chave)::TEXT
            );

            INSERT INTO movimentacoes (
                company_id, conta_bancaria_id, conta_contabil_id,
                tipo, valor, data, descricao, origem,
                conta_receber_id, conta_pagar_id
            ) VALUES (
                p_company_id, p_bank_account_id, v_account_id,
                CASE WHEN v_is_expense THEN 'debito' ELSE 'credito' END,
                v_abs_amount, v_bank_tx.date,
                CASE WHEN v_is_expense THEN 'Pagamento: ' ELSE 'Recebimento: ' END || v_desc,
                CASE WHEN v_is_expense THEN 'conta_pagar' ELSE 'conta_receber' END,
                CASE WHEN NOT v_is_expense THEN v_target_id ELSE NULL END,
                CASE WHEN v_is_expense THEN v_target_id ELSE NULL END
            );

            UPDATE bank_transactions
               SET status = 'reconciled',
                   reconciled_payable_id = CASE WHEN v_is_expense THEN v_target_id ELSE NULL END,
                   reconciled_receivable_id = CASE WHEN NOT v_is_expense THEN v_target_id ELSE NULL END,
                   reconciled_at = NOW(),
                   metodo_match = 'rule',
                   confianca_match = 95
             WHERE id = v_bank_tx.id;

            v_total_auto := v_total_auto + 1;
        ELSE
            -- Caminho B: cria CR/CP novo via conciliar_lote (1 item por vez —
            -- mantém o erro isolado se algo falhar)
            v_lote_result := conciliar_lote(
                p_company_id,
                p_bank_account_id,
                NULL,  -- created_by null = sistema
                jsonb_build_array(v_item)
            );
            IF (v_lote_result->>'success')::INT > 0 THEN
                v_total_auto := v_total_auto + 1;
                -- conciliar_lote não preenche metodo_match — preenche aqui
                UPDATE bank_transactions
                   SET metodo_match = 'rule', confianca_match = 95
                 WHERE id = v_bank_tx.id;
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'auto_reconciled', v_total_auto
    );
END;
$$;

COMMENT ON FUNCTION auto_conciliar_extrato IS
'Auto-concilia transações pendentes recém-importadas via email. Política conservadora:
só matches com regra Alta confiança + acao=auto-conciliar + CR/CP exato OU valor_referencia.
Não usa fallback IA. Chamada pela Edge Function importar-extrato-email após cada import.';
