-- ============================================================
-- RPC: conciliar_lote — concilia até 100 transações de uma vez
-- Cria lançamento + match + atualiza bank_transaction em 1 call
-- ============================================================

CREATE OR REPLACE FUNCTION public.conciliar_lote(
  p_company_id UUID,
  p_bank_account_id UUID,
  p_user_id UUID,
  p_items JSONB  -- array de { bank_tx_id, amount, date, description, is_expense, account_id }
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  item JSONB;
  v_table TEXT;
  v_name_col TEXT;
  v_created_id UUID;
  v_success INT := 0;
  v_failed INT := 0;
  v_now TIMESTAMPTZ := now();
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    BEGIN
      -- Determinar tabela
      IF (item->>'is_expense')::boolean THEN
        v_table := 'contas_pagar';
        v_name_col := 'credor_nome';
      ELSE
        v_table := 'contas_receber';
        v_name_col := 'pagador_nome';
      END IF;

      -- 1. Criar lançamento
      EXECUTE format(
        'INSERT INTO public.%I (company_id, %I, valor, data_vencimento, status, conta_contabil_id, data_pagamento, valor_pago)
         VALUES ($1, $2, $3, $4, $5, $6, $4, $3) RETURNING id',
        v_table, v_name_col
      )
      INTO v_created_id
      USING
        p_company_id,
        COALESCE(item->>'description', 'Conciliação automática'),
        (item->>'amount')::NUMERIC,
        (item->>'date')::DATE,
        'pago',
        NULLIF(item->>'account_id', '');

      -- 2. Criar match
      INSERT INTO public.bank_reconciliation_matches (
        company_id, bank_account_id, bank_transaction_id,
        payable_id, receivable_id,
        match_type, matched_amount, matched_date, status, created_by
      ) VALUES (
        p_company_id, p_bank_account_id, (item->>'bank_tx_id')::UUID,
        CASE WHEN (item->>'is_expense')::boolean THEN v_created_id ELSE NULL END,
        CASE WHEN NOT (item->>'is_expense')::boolean THEN v_created_id ELSE NULL END,
        'auto', (item->>'amount')::NUMERIC, (item->>'date')::DATE, 'matched', p_user_id
      );

      -- 3. Atualizar bank_transaction
      UPDATE public.bank_transactions SET
        status = 'reconciled',
        reconciled_payable_id = CASE WHEN (item->>'is_expense')::boolean THEN v_created_id ELSE NULL END,
        reconciled_receivable_id = CASE WHEN NOT (item->>'is_expense')::boolean THEN v_created_id ELSE NULL END,
        reconciled_at = v_now,
        reconciled_by = p_user_id
      WHERE id = (item->>'bank_tx_id')::UUID;

      v_success := v_success + 1;

    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('success', v_success, 'failed', v_failed);
END;
$$;
