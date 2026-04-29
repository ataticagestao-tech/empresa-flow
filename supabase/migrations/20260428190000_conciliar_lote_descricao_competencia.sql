-- ============================================================
-- Etapa 1: conciliar_lote preenche descricao, competencia e
-- centro_custo_id (paridade com lancamento manual de CP/CR).
--
-- Antes:
--   - credor_nome / pagador_nome = descricao crua do extrato
--   - descricao = NULL
--   - competencia = NULL
--   - centro_custo_id = NULL
--
-- Depois:
--   - credor_nome / pagador_nome = descricao crua do extrato (mantido)
--   - descricao = mesma frase (preenchida, em vez de NULL)
--   - competencia = derivada da data do extrato (YYYY-MM)
--   - centro_custo_id = aceita do JSON (UI atual nao envia, mas porta
--                       fica aberta pra Etapa 2)
-- ============================================================

-- 1. Garantir que as colunas existem (idempotente — varias ja existem)
ALTER TABLE public.contas_pagar
  ADD COLUMN IF NOT EXISTS descricao text,
  ADD COLUMN IF NOT EXISTS competencia text;

ALTER TABLE public.contas_receber
  ADD COLUMN IF NOT EXISTS descricao text,
  ADD COLUMN IF NOT EXISTS competencia text;


-- 2. Atualizar conciliar_lote (baseado em 20260415150000)

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
  v_unidade_id UUID;
  v_centro_custo_id UUID;
  v_amount NUMERIC;
  v_date DATE;
  v_desc TEXT;
  v_competencia TEXT;
  v_bank_tx_id UUID;
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
      v_competencia := to_char(v_date, 'YYYY-MM');

      v_account_id := NULL;
      IF item->>'account_id' IS NOT NULL
         AND item->>'account_id' != ''
         AND item->>'account_id' != 'null' THEN
        v_account_id := (item->>'account_id')::UUID;
      END IF;

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

      v_centro_custo_id := NULL;
      IF item->>'centro_custo_id' IS NOT NULL
         AND item->>'centro_custo_id' != ''
         AND item->>'centro_custo_id' != 'null' THEN
        v_centro_custo_id := (item->>'centro_custo_id')::UUID;
      END IF;

      IF v_is_expense THEN
        INSERT INTO public.contas_pagar (
          company_id, credor_nome, descricao, valor, data_vencimento,
          status, conta_contabil_id, centro_custo_id, competencia,
          data_pagamento, valor_pago, unidade_destino_id
        ) VALUES (
          p_company_id, v_desc, v_desc, v_amount, v_date,
          'pago', v_account_id, v_centro_custo_id, v_competencia,
          v_date, v_amount, v_unidade_id
        ) RETURNING id INTO v_created_id;
      ELSE
        INSERT INTO public.contas_receber (
          company_id, pagador_nome, descricao, valor, data_vencimento,
          status, conta_contabil_id, centro_custo_id, competencia,
          data_pagamento, valor_pago, unidade_destino_id
        ) VALUES (
          p_company_id, v_desc, v_desc, v_amount, v_date,
          'pago', v_account_id, v_centro_custo_id, v_competencia,
          v_date, v_amount, v_unidade_id
        ) RETURNING id INTO v_created_id;
      END IF;

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

      INSERT INTO public.movimentacoes (
        company_id, conta_bancaria_id, conta_contabil_id,
        conta_receber_id, conta_pagar_id,
        tipo, valor, data, descricao, origem
      ) VALUES (
        p_company_id,
        p_bank_account_id,
        v_account_id,
        CASE WHEN NOT v_is_expense THEN v_created_id ELSE NULL END,
        CASE WHEN     v_is_expense THEN v_created_id ELSE NULL END,
        CASE WHEN v_is_expense THEN 'debito' ELSE 'credito' END,
        v_amount,
        v_date,
        CASE WHEN v_is_expense
          THEN 'Pagamento: ' || v_desc
          ELSE 'Recebimento: ' || v_desc
        END,
        CASE WHEN v_is_expense THEN 'conta_pagar' ELSE 'conta_receber' END
      );

      IF v_is_expense THEN
        v_balance_delta := v_balance_delta - v_amount;
      ELSE
        v_balance_delta := v_balance_delta + v_amount;
      END IF;

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
      v_err_msg := SQLERRM;
      v_failed_reasons := v_failed_reasons || jsonb_build_object(
        'bank_tx_id', v_bank_tx_id,
        'description', v_desc,
        'error', v_err_msg
      );
    END;
  END LOOP;

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
