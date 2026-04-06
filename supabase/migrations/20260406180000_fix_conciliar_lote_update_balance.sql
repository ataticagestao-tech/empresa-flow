-- ============================================================
-- FIX: conciliar_lote agora atualiza bank_accounts.current_balance
-- Problema: movimentacoes eram criadas mas current_balance ficava estagnado
-- ============================================================

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
  v_created_id UUID;
  v_account_id UUID;
  v_amount NUMERIC;
  v_date DATE;
  v_desc TEXT;
  v_bank_tx_id UUID;
  v_success INT := 0;
  v_failed INT := 0;
  v_now TIMESTAMPTZ := now();
  v_balance_delta NUMERIC := 0;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    BEGIN
      v_is_expense := COALESCE((item->>'is_expense')::boolean, false);
      v_amount := (item->>'amount')::NUMERIC;
      v_date := (item->>'date')::DATE;
      v_desc := COALESCE(NULLIF(item->>'description', ''), 'Conciliação automática');
      v_bank_tx_id := (item->>'bank_tx_id')::UUID;

      -- Parse account_id (pode vir como null, "null", "" ou UUID válido)
      v_account_id := NULL;
      IF item->>'account_id' IS NOT NULL
         AND item->>'account_id' != ''
         AND item->>'account_id' != 'null' THEN
        v_account_id := (item->>'account_id')::UUID;
      END IF;

      IF v_is_expense THEN
        -- Criar conta a pagar
        INSERT INTO public.contas_pagar (
          company_id, credor_nome, valor, data_vencimento,
          status, conta_contabil_id, data_pagamento, valor_pago
        ) VALUES (
          p_company_id, v_desc, v_amount, v_date,
          'pago', v_account_id, v_date, v_amount
        ) RETURNING id INTO v_created_id;
      ELSE
        -- Criar conta a receber
        INSERT INTO public.contas_receber (
          company_id, pagador_nome, valor, data_vencimento,
          status, conta_contabil_id, data_pagamento, valor_pago
        ) VALUES (
          p_company_id, v_desc, v_amount, v_date,
          'pago', v_account_id, v_date, v_amount
        ) RETURNING id INTO v_created_id;
      END IF;

      -- Criar match
      INSERT INTO public.bank_reconciliation_matches (
        company_id, bank_account_id, bank_transaction_id,
        payable_id, receivable_id,
        match_type, matched_amount, matched_date, status, created_by
      ) VALUES (
        p_company_id, p_bank_account_id, v_bank_tx_id,
        CASE WHEN v_is_expense THEN v_created_id ELSE NULL END,
        CASE WHEN NOT v_is_expense THEN v_created_id ELSE NULL END,
        'auto', v_amount, v_date, 'matched', p_user_id
      );

      -- Criar movimentação (como faz quitar_conta_pagar/receber)
      INSERT INTO public.movimentacoes (
        company_id, conta_bancaria_id, conta_contabil_id,
        tipo, valor, data, descricao, origem
      ) VALUES (
        p_company_id,
        p_bank_account_id,
        v_account_id,
        CASE WHEN v_is_expense THEN 'debito' ELSE 'credito' END,
        v_amount,
        v_date,
        CASE WHEN v_is_expense
          THEN 'Pagamento: ' || v_desc
          ELSE 'Recebimento: ' || v_desc
        END,
        CASE WHEN v_is_expense THEN 'conta_pagar' ELSE 'conta_receber' END
      );

      -- Acumular delta do saldo
      IF v_is_expense THEN
        v_balance_delta := v_balance_delta - v_amount;
      ELSE
        v_balance_delta := v_balance_delta + v_amount;
      END IF;

      -- Atualizar bank_transaction
      UPDATE public.bank_transactions SET
        status = 'reconciled',
        reconciled_payable_id = CASE WHEN v_is_expense THEN v_created_id ELSE NULL END,
        reconciled_receivable_id = CASE WHEN NOT v_is_expense THEN v_created_id ELSE NULL END,
        reconciled_at = v_now,
        reconciled_by = p_user_id
      WHERE id = v_bank_tx_id;

      v_success := v_success + 1;

    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
    END;
  END LOOP;

  -- Atualizar current_balance da conta bancária (como fazem quitar_conta_pagar/receber)
  IF v_balance_delta != 0 THEN
    UPDATE public.bank_accounts
    SET current_balance = current_balance + v_balance_delta,
        updated_at = v_now
    WHERE id = p_bank_account_id;
  END IF;

  RETURN jsonb_build_object('success', v_success, 'failed', v_failed);
END;
$$;
