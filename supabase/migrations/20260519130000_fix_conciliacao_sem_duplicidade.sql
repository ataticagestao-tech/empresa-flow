-- =============================================================================
-- FIX: Conciliação bancária sem duplicidade de CR/CP/movimentações
-- =============================================================================
-- 3 bugs corrigidos nesta migration:
--
-- 1) conciliar_lote SEMPRE criava CR/CP novo, mesmo quando a Camada -1 do front
--    sugeria match com CR/CP existente. Resultado: título original ficava
--    'aberto' + novo título 'pago' = duplicata.
--    → Agora aceita payable_id/receivable_id opcional: se vier, faz UPDATE no
--      existente; se não, INSERT como antes.
--
-- 2) conciliar_lote não preenchia created_via_bank_tx_id nos CR/CP novos.
--    Resultado: deleteImportBatch não conseguia soft-deletar — deixava títulos
--    fantasma 'aberto' que duplicavam no próximo re-import.
--    → Agora preenche created_via_bank_tx_id em todo INSERT.
--
-- 3) auto_conciliar_extrato Caminho A criava mov sem checar se já existia mov
--    vinculada ao CR/CP. Resultado: usuário lançava pagamento manual (criava
--    mov) + robô do e-mail conciliava (criava outra mov) = saldo errado.
--    → Agora checa existência e faz UPDATE em vez de INSERT na mov.
--
-- IDEMPOTENTE: CREATE OR REPLACE — pode rodar quantas vezes precisar.
-- READ-ONLY de schema: não altera estrutura de nenhuma tabela.
-- =============================================================================


-- =============================================================================
-- FIX 1+2 — conciliar_lote: linka existente OU cria com created_via_bank_tx_id
-- =============================================================================
CREATE OR REPLACE FUNCTION public.conciliar_lote(
  p_company_id UUID,
  p_bank_account_id UUID,
  p_user_id UUID,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  item JSONB;
  v_is_expense BOOLEAN;
  v_target_id UUID;             -- CR/CP final (existente ou criado)
  v_target_existing UUID;       -- CR/CP existente passado pelo front
  v_target_existing_status TEXT;
  v_account_id UUID;
  v_account_valid BOOLEAN;
  v_unidade_id UUID;
  v_amount NUMERIC;
  v_date DATE;
  v_desc TEXT;
  v_bank_tx_id UUID;
  v_mov_existente UUID;
  v_success INT := 0;
  v_failed INT := 0;
  v_now TIMESTAMPTZ := now();
  v_balance_delta NUMERIC := 0;
  v_failed_reasons JSONB := '[]'::jsonb;
  v_err_msg TEXT;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    BEGIN
      v_is_expense := COALESCE((item->>'is_expense')::boolean, false);
      v_amount := (item->>'amount')::NUMERIC;
      v_date := (item->>'date')::DATE;
      v_desc := COALESCE(NULLIF(item->>'description', ''), 'Conciliação automática');
      v_bank_tx_id := (item->>'bank_tx_id')::UUID;

      -- Conta contábil: validar contra chart_of_accounts da empresa (zera FK
      -- stale; item vira "sem categoria" e cai na pendência de reclassificação).
      v_account_id := NULL;
      IF item->>'account_id' IS NOT NULL
         AND item->>'account_id' != ''
         AND item->>'account_id' != 'null' THEN
        v_account_id := (item->>'account_id')::UUID;
        SELECT TRUE INTO v_account_valid
        FROM public.chart_of_accounts
        WHERE id = v_account_id
          AND company_id = p_company_id;
        IF v_account_valid IS NULL THEN
          v_account_id := NULL;
        END IF;
        v_account_valid := NULL;
      END IF;

      -- Unidade destino (multi-tenant rateio)
      v_unidade_id := NULL;
      IF item->>'unidade_destino_id' IS NOT NULL
         AND item->>'unidade_destino_id' != ''
         AND item->>'unidade_destino_id' != 'null' THEN
        v_unidade_id := (item->>'unidade_destino_id')::UUID;
      END IF;
      IF v_unidade_id IS NULL AND v_bank_tx_id IS NOT NULL THEN
        SELECT bt.unidade_destino_id INTO v_unidade_id
        FROM public.bank_transactions bt
        WHERE bt.id = v_bank_tx_id;
      END IF;

      -- ─────────────────────────────────────────────────────────────────
      -- CR/CP existente (Camada -1 do front sugeriu match)
      -- ─────────────────────────────────────────────────────────────────
      v_target_existing := NULL;
      IF v_is_expense THEN
        IF item->>'payable_id' IS NOT NULL
           AND item->>'payable_id' != ''
           AND item->>'payable_id' != 'null' THEN
          v_target_existing := (item->>'payable_id')::UUID;
        END IF;
      ELSE
        IF item->>'receivable_id' IS NOT NULL
           AND item->>'receivable_id' != ''
           AND item->>'receivable_id' != 'null' THEN
          v_target_existing := (item->>'receivable_id')::UUID;
        END IF;
      END IF;

      -- Valida que o existente pertence à empresa e não foi soft-deletado
      IF v_target_existing IS NOT NULL THEN
        IF v_is_expense THEN
          SELECT status INTO v_target_existing_status
          FROM public.contas_pagar
          WHERE id = v_target_existing
            AND company_id = p_company_id
            AND deleted_at IS NULL;
        ELSE
          SELECT status INTO v_target_existing_status
          FROM public.contas_receber
          WHERE id = v_target_existing
            AND company_id = p_company_id
            AND deleted_at IS NULL;
        END IF;
        -- Se sumiu/soft-del, cai pro fluxo de criar novo
        IF v_target_existing_status IS NULL THEN
          v_target_existing := NULL;
        END IF;
      END IF;

      -- ─────────────────────────────────────────────────────────────────
      -- Caminho A: LINKAR CR/CP existente (não duplicar)
      -- ─────────────────────────────────────────────────────────────────
      IF v_target_existing IS NOT NULL THEN
        v_target_id := v_target_existing;

        -- Trigger bloqueia UPDATE de CR/CP já pago — só atualiza se não estiver.
        IF v_target_existing_status <> 'pago' THEN
          IF v_is_expense THEN
            UPDATE public.contas_pagar
               SET status = 'pago',
                   data_pagamento = v_date,
                   valor_pago = v_amount,
                   conta_bancaria_id = p_bank_account_id
             WHERE id = v_target_id;
          ELSE
            UPDATE public.contas_receber
               SET status = 'pago',
                   data_pagamento = v_date,
                   valor_pago = v_amount,
                   conta_bancaria_id = p_bank_account_id
             WHERE id = v_target_id;
          END IF;
        END IF;

      -- ─────────────────────────────────────────────────────────────────
      -- Caminho B: CRIAR CR/CP novo + marcar created_via_bank_tx_id
      -- ─────────────────────────────────────────────────────────────────
      ELSE
        IF v_is_expense THEN
          INSERT INTO public.contas_pagar (
            company_id, credor_nome, valor, data_vencimento,
            status, conta_contabil_id, data_pagamento, valor_pago,
            unidade_destino_id, conta_bancaria_id, created_via_bank_tx_id
          ) VALUES (
            p_company_id, v_desc, v_amount, v_date,
            'pago', v_account_id, v_date, v_amount,
            v_unidade_id, p_bank_account_id, v_bank_tx_id
          ) RETURNING id INTO v_target_id;
        ELSE
          INSERT INTO public.contas_receber (
            company_id, pagador_nome, valor, data_vencimento,
            status, conta_contabil_id, data_pagamento, valor_pago,
            unidade_destino_id, conta_bancaria_id, created_via_bank_tx_id
          ) VALUES (
            p_company_id, v_desc, v_amount, v_date,
            'pago', v_account_id, v_date, v_amount,
            v_unidade_id, p_bank_account_id, v_bank_tx_id
          ) RETURNING id INTO v_target_id;
        END IF;
      END IF;

      -- ─────────────────────────────────────────────────────────────────
      -- bank_reconciliation_matches: 1 row por par (bank_tx, CR/CP)
      -- ─────────────────────────────────────────────────────────────────
      INSERT INTO public.bank_reconciliation_matches (
        company_id, bank_account_id, bank_transaction_id,
        payable_id, receivable_id,
        match_type, matched_amount, matched_date, status, created_by
      ) VALUES (
        p_company_id, p_bank_account_id, v_bank_tx_id,
        CASE WHEN v_is_expense THEN v_target_id ELSE NULL END,
        CASE WHEN NOT v_is_expense THEN v_target_id ELSE NULL END,
        CASE WHEN v_target_existing IS NOT NULL THEN 'auto_link' ELSE 'auto' END,
        v_amount, v_date, 'matched', p_user_id
      );

      -- ─────────────────────────────────────────────────────────────────
      -- movimentacoes: 1 row por CR/CP. Se já existe (baixa manual prévia),
      -- UPDATE com dados do extrato em vez de INSERT.
      -- ─────────────────────────────────────────────────────────────────
      v_mov_existente := NULL;
      IF v_is_expense THEN
        SELECT id INTO v_mov_existente
        FROM public.movimentacoes
        WHERE conta_pagar_id = v_target_id
        LIMIT 1;
      ELSE
        SELECT id INTO v_mov_existente
        FROM public.movimentacoes
        WHERE conta_receber_id = v_target_id
        LIMIT 1;
      END IF;

      IF v_mov_existente IS NOT NULL THEN
        -- Atualiza mov existente (não duplica)
        UPDATE public.movimentacoes SET
          conta_bancaria_id = p_bank_account_id,
          conta_contabil_id = COALESCE(v_account_id, conta_contabil_id),
          tipo = CASE WHEN v_is_expense THEN 'debito' ELSE 'credito' END,
          valor = v_amount,
          data = v_date,
          descricao = CASE WHEN v_is_expense
                       THEN 'Pagamento: ' || v_desc
                       ELSE 'Recebimento: ' || v_desc END,
          origem = CASE WHEN v_is_expense THEN 'conta_pagar' ELSE 'conta_receber' END,
          status_conciliacao = 'conciliado'
        WHERE id = v_mov_existente;
      ELSE
        INSERT INTO public.movimentacoes (
          company_id, conta_bancaria_id, conta_contabil_id,
          conta_receber_id, conta_pagar_id,
          tipo, valor, data, descricao, origem, status_conciliacao
        ) VALUES (
          p_company_id,
          p_bank_account_id,
          v_account_id,
          CASE WHEN NOT v_is_expense THEN v_target_id ELSE NULL END,
          CASE WHEN     v_is_expense THEN v_target_id ELSE NULL END,
          CASE WHEN v_is_expense THEN 'debito' ELSE 'credito' END,
          v_amount,
          v_date,
          CASE WHEN v_is_expense
            THEN 'Pagamento: ' || v_desc
            ELSE 'Recebimento: ' || v_desc
          END,
          CASE WHEN v_is_expense THEN 'conta_pagar' ELSE 'conta_receber' END,
          'conciliado'
        );

        -- Só conta balance delta se for mov nova. UPDATE de mov existente
        -- significa que a baixa manual já foi contabilizada no saldo.
        IF v_is_expense THEN
          v_balance_delta := v_balance_delta - v_amount;
        ELSE
          v_balance_delta := v_balance_delta + v_amount;
        END IF;
      END IF;

      -- ─────────────────────────────────────────────────────────────────
      -- Marcar bank_transaction como reconciled
      -- ─────────────────────────────────────────────────────────────────
      UPDATE public.bank_transactions SET
        status = 'reconciled',
        reconciled_payable_id = CASE WHEN v_is_expense THEN v_target_id ELSE NULL END,
        reconciled_receivable_id = CASE WHEN NOT v_is_expense THEN v_target_id ELSE NULL END,
        reconciled_at = v_now,
        reconciled_by = p_user_id
      WHERE id = v_bank_tx_id;

      v_success := v_success + 1;

    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_err_msg := SQLERRM;
      v_failed_reasons := v_failed_reasons || jsonb_build_object(
        'bank_tx_id', v_bank_tx_id,
        'description', v_desc,
        'error', v_err_msg
      );
    END;
  END LOOP;

  -- Atualiza current_balance só pelo delta REAL (mov nova). UPDATE em mov
  -- existente não altera saldo porque a baixa manual já estava contabilizada.
  IF v_balance_delta != 0 THEN
    UPDATE public.bank_accounts
    SET current_balance = current_balance + v_balance_delta,
        updated_at = v_now
    WHERE id = p_bank_account_id;
  END IF;

  RETURN jsonb_build_object(
    'success', v_success,
    'failed', v_failed,
    'failed_reasons', v_failed_reasons
  );
END;
$$;

COMMENT ON FUNCTION public.conciliar_lote IS
'Conciliação em lote idempotente. Aceita payable_id/receivable_id opcional no
item para LINKAR CR/CP existente (Camada -1 do front). Sem esses IDs, cria CR/CP
novo com created_via_bank_tx_id preenchido (permite soft-delete em cascata via
deleteImportBatch). Checa mov existente antes de INSERT para evitar duplicata
quando o usuário deu baixa manual antes do extrato chegar.';


-- =============================================================================
-- FIX 3 — auto_conciliar_extrato: Caminho A checa mov existente antes de INSERT
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
    v_mov_existente UUID;
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

        -- Procura CR/CP existente compatível
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

        -- Caminho B: sem CR/CP existente, exige valor_referencia da regra
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

        -- ─────────────────────────────────────────────────────────────
        -- Caminho A — linka existente, mas DELEGA pro conciliar_lote
        -- que já tem o guard de mov existente e a lógica unificada.
        -- ─────────────────────────────────────────────────────────────
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
            -- Caminho B — cria CR/CP novo
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
'Auto-concilia transações pendentes recém-importadas. Delega TUDO pro conciliar_lote
(que tem guards de mov existente + payable_id/receivable_id opcional). Política
conservadora: só matches com regra Alta confiança + CR/CP exato OU valor_referencia
(±1%). Chamada pela Edge Function importar-extrato-email após cada import.';
