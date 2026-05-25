-- =============================================================================
-- FIX: auto_conciliar_extrato agora linka extrato a CP/CR já PAGOS sem vínculo
-- =============================================================================
-- Cenário corrigido:
--   Usuário paga folha de pagamento (gera CP status='pago' + mov via folha).
--   Dias depois o OFX/extrato chega por e-mail com a transação correspondente
--   ("DEBITO TRANSFERENCIA PIX / NOME DO FUNCIONARIO").
--   auto_conciliar_extrato só procurava CP em ('aberto','vencido') → não acha o
--   CP da folha → cai no Caminho B e CRIA UM CP NOVO duplicado com a descrição
--   crua do banco. Resultado: 2 CPs pra mesmo dinheiro na aba Salários do
--   funcionário.
--
-- Correção: adicionar terceira tentativa de match — CP/CR `pago` sem nenhuma
-- linha em bank_reconciliation_matches (ou seja, ainda não foi linkado a nenhum
-- bank_tx). Janela: ±3 dias de data_pagamento, valor exato. Se encontrar,
-- delega pro conciliar_lote com payable_id/receivable_id (que já tem todos os
-- guards: não mexe no CP pago, atualiza mov existente em vez de duplicar, não
-- altera saldo).
--
-- IDEMPOTENTE: CREATE OR REPLACE. READ-ONLY de schema.
-- =============================================================================

CREATE OR REPLACE FUNCTION auto_conciliar_extrato(
    p_company_id UUID,
    p_bank_account_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_bank_tx RECORD;
    v_rule RECORD;
    v_desc_norm TEXT;
    v_abs_amount NUMERIC;
    v_is_expense BOOLEAN;
    v_items JSONB := '[]'::JSONB;
    v_item JSONB;
    v_target_id UUID;
    v_target_type TEXT;
    v_account_id UUID;
    v_desc TEXT;
    v_lote_result JSONB;
    v_total_auto INT := 0;
BEGIN
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

        IF v_rule.id IS NULL THEN CONTINUE; END IF;

        v_target_id := NULL;
        v_target_type := NULL;

        -- Tier 1: CR/CP ABERTO compatível por data_vencimento
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

        -- Tier 2 (NOVO): CR/CP PAGO sem vínculo bancário ainda
        -- Pega só CP/CR que ainda NÃO foi linkado a nenhum bank_tx
        -- (bank_reconciliation_matches inexistente) — protege contra roubar
        -- match de outro extrato já casado.
        IF v_target_id IS NULL THEN
            IF v_is_expense THEN
                SELECT cp.id INTO v_target_id
                  FROM contas_pagar cp
                 WHERE cp.company_id = p_company_id
                   AND cp.status = 'pago'
                   AND COALESCE(cp.deleted_at, NULL) IS NULL
                   AND ABS(cp.valor_pago - v_abs_amount) < 0.01
                   AND cp.data_pagamento IS NOT NULL
                   AND ABS(cp.data_pagamento - v_bank_tx.date) <= 3
                   AND NOT EXISTS (
                       SELECT 1 FROM bank_reconciliation_matches m
                        WHERE m.payable_id = cp.id
                          AND m.status = 'matched'
                   )
                 ORDER BY ABS(cp.data_pagamento - v_bank_tx.date) ASC
                 LIMIT 1;
                IF v_target_id IS NOT NULL THEN v_target_type := 'payable'; END IF;
            ELSE
                SELECT cr.id INTO v_target_id
                  FROM contas_receber cr
                 WHERE cr.company_id = p_company_id
                   AND cr.status = 'pago'
                   AND COALESCE(cr.deleted_at, NULL) IS NULL
                   AND ABS(cr.valor_pago - v_abs_amount) < 0.01
                   AND cr.data_pagamento IS NOT NULL
                   AND ABS(cr.data_pagamento - v_bank_tx.date) <= 3
                   AND NOT EXISTS (
                       SELECT 1 FROM bank_reconciliation_matches m
                        WHERE m.receivable_id = cr.id
                          AND m.status = 'matched'
                   )
                 ORDER BY ABS(cr.data_pagamento - v_bank_tx.date) ASC
                 LIMIT 1;
                IF v_target_id IS NOT NULL THEN v_target_type := 'receivable'; END IF;
            END IF;
        END IF;

        -- Tier 3 (Caminho B): cria CR/CP novo, exige valor_referencia da regra
        IF v_target_id IS NULL THEN
            IF v_rule.valor_referencia IS NULL OR v_rule.valor_referencia <= 0 THEN
                CONTINUE;
            END IF;
            IF ABS(v_abs_amount - v_rule.valor_referencia) / v_rule.valor_referencia > 0.01 THEN
                CONTINUE;
            END IF;
            v_target_type := 'create';
        END IF;

        v_account_id := v_rule.account_id;
        v_desc := COALESCE(v_bank_tx.description, 'Conciliação automática (email)');

        IF v_target_type IN ('payable', 'receivable') THEN
            v_item := jsonb_build_object(
                'is_expense', v_is_expense,
                'amount', v_abs_amount,
                'date', v_bank_tx.date,
                'description', v_desc,
                'bank_tx_id', v_bank_tx.id,
                'account_id', v_account_id,
                'payable_id', CASE WHEN v_target_type = 'payable' THEN v_target_id ELSE NULL END,
                'receivable_id', CASE WHEN v_target_type = 'receivable' THEN v_target_id ELSE NULL END
            );
            v_lote_result := conciliar_lote(
                p_company_id,
                p_bank_account_id,
                NULL,
                jsonb_build_array(v_item)
            );
            IF (v_lote_result->>'success')::INT > 0 THEN
                v_total_auto := v_total_auto + 1;
                UPDATE bank_transactions
                   SET metodo_match = 'rule', confianca_match = 95
                 WHERE id = v_bank_tx.id;
            END IF;
        ELSE
            v_item := jsonb_build_object(
                'is_expense', v_is_expense,
                'amount', v_abs_amount,
                'date', v_bank_tx.date,
                'description', v_desc,
                'bank_tx_id', v_bank_tx.id,
                'account_id', v_account_id
            );
            v_lote_result := conciliar_lote(
                p_company_id,
                p_bank_account_id,
                NULL,
                jsonb_build_array(v_item)
            );
            IF (v_lote_result->>'success')::INT > 0 THEN
                v_total_auto := v_total_auto + 1;
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
'Auto-concilia transações pendentes recém-importadas. 3 tiers de match:
(1) CR/CP aberto ±3d de data_vencimento + valor exato;
(2) CR/CP pago sem vínculo bancário, ±3d de data_pagamento + valor exato
    (cobre folha que paga CP antes do extrato chegar);
(3) Caminho B: cria CR/CP novo via regra Alta confiança + valor_referencia (±1%).
Delega tudo pro conciliar_lote, que tem guards de mov existente.';
