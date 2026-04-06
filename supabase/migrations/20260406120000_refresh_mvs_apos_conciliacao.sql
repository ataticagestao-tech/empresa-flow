-- ============================================================
-- Função reutilizável para refresh das materialized views
-- Chamada após conciliação (lote ou manual) para garantir
-- que DRE, Multiempresas e Fluxo de Caixa fiquem atualizados
-- ============================================================

CREATE OR REPLACE FUNCTION public.refresh_mvs_financeiras()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_dre_mensal;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_fluxo_caixa_diario;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_cmv_mensal;
  -- mv_custo_pessoal_mensal não depende de movimentacoes, skip
END;
$$;

COMMENT ON FUNCTION public.refresh_mvs_financeiras IS
  'Refresh das MVs financeiras (DRE, Fluxo, CMV). Chamar após conciliação ou lançamentos.';

-- ============================================================
-- Atualizar conciliar_lote para chamar refresh ao final
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
        INSERT INTO public.contas_pagar (
          company_id, credor_nome, valor, data_vencimento,
          status, conta_contabil_id, data_pagamento, valor_pago
        ) VALUES (
          p_company_id, v_desc, v_amount, v_date,
          'pago', v_account_id, v_date, v_amount
        ) RETURNING id INTO v_created_id;
      ELSE
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

      -- Criar movimentação
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

  -- Refresh MVs para que DRE, Fluxo de Caixa e Multiempresas fiquem atualizados
  IF v_success > 0 THEN
    PERFORM public.refresh_mvs_financeiras();
  END IF;

  RETURN jsonb_build_object('success', v_success, 'failed', v_failed);
END;
$$;
