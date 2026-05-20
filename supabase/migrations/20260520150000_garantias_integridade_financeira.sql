-- =============================================================================
-- GARANTIAS DE INTEGRIDADE FINANCEIRA (3 triggers)
-- =============================================================================
-- 1. CR/CP pago/parcial sem mov → cria mov automaticamente se possivel
--    (oportunistica: nao bloqueia, so completa o que faltou)
-- 2. CR/CP soft-deletado → desfaz conciliacao bancaria automaticamente
-- 3. Mov sem categoria contabil → bloqueia INSERT (exceto transferencia)
--
-- Bypass: GUC `app.skip_mov_garantia` / `app.skip_categoria_garantia` quando
-- = 'true'. Usado em conciliar_lote/RPCs internas.
-- =============================================================================


-- =============================================================================
-- GARANTIA 1: garante mov ao pagar CR (oportunistica)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.garantir_mov_ao_quitar_cr()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_skip TEXT;
  v_mov_exists BOOLEAN;
BEGIN
  BEGIN
    v_skip := current_setting('app.skip_mov_garantia', true);
  EXCEPTION WHEN OTHERS THEN v_skip := NULL; END;
  IF v_skip = 'true' THEN RETURN NEW; END IF;

  -- So age na transicao pra status pago/parcial/conciliado
  IF NEW.status NOT IN ('pago', 'parcial', 'conciliado') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN RETURN NEW; END IF;

  -- Idempotente: ja tem mov vinculada? sai.
  SELECT TRUE INTO v_mov_exists
  FROM public.movimentacoes WHERE conta_receber_id = NEW.id LIMIT 1;
  IF v_mov_exists THEN RETURN NEW; END IF;

  -- Oportunistica: so cria se tem conta_bancaria_id. Sem ela, deixa quieto
  -- (fluxos antigos podem nao preencher; nao bloqueia pra nao quebrar nada).
  IF NEW.conta_bancaria_id IS NULL THEN RETURN NEW; END IF;

  -- Cria mov vinculada (com bypass categoria pra nao gerar problema chain)
  PERFORM set_config('app.skip_categoria_garantia', 'true', true);

  INSERT INTO public.movimentacoes (
    company_id, conta_bancaria_id, conta_contabil_id,
    conta_receber_id, tipo, valor, data, descricao, origem, status_conciliacao
  ) VALUES (
    NEW.company_id,
    NEW.conta_bancaria_id,
    NEW.conta_contabil_id,
    NEW.id,
    'credito',
    COALESCE(NEW.valor_pago, NEW.valor),
    COALESCE(NEW.data_pagamento, CURRENT_DATE),
    'Recebimento — ' || COALESCE(NEW.pagador_nome, '(sem nome)'),
    'conta_receber',
    CASE WHEN NEW.status = 'conciliado' THEN 'conciliado' ELSE 'pendente' END
  );

  PERFORM set_config('app.skip_categoria_garantia', 'false', true);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_garantir_mov_ao_quitar_cr ON public.contas_receber;
CREATE TRIGGER trg_garantir_mov_ao_quitar_cr
  AFTER INSERT OR UPDATE ON public.contas_receber
  FOR EACH ROW EXECUTE FUNCTION public.garantir_mov_ao_quitar_cr();


CREATE OR REPLACE FUNCTION public.garantir_mov_ao_quitar_cp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_skip TEXT;
  v_mov_exists BOOLEAN;
BEGIN
  BEGIN
    v_skip := current_setting('app.skip_mov_garantia', true);
  EXCEPTION WHEN OTHERS THEN v_skip := NULL; END;
  IF v_skip = 'true' THEN RETURN NEW; END IF;

  IF NEW.status NOT IN ('pago', 'parcial', 'conciliado') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN RETURN NEW; END IF;

  SELECT TRUE INTO v_mov_exists
  FROM public.movimentacoes WHERE conta_pagar_id = NEW.id LIMIT 1;
  IF v_mov_exists THEN RETURN NEW; END IF;

  IF NEW.conta_bancaria_id IS NULL THEN RETURN NEW; END IF;

  PERFORM set_config('app.skip_categoria_garantia', 'true', true);

  INSERT INTO public.movimentacoes (
    company_id, conta_bancaria_id, conta_contabil_id,
    conta_pagar_id, tipo, valor, data, descricao, origem, status_conciliacao
  ) VALUES (
    NEW.company_id,
    NEW.conta_bancaria_id,
    NEW.conta_contabil_id,
    NEW.id,
    'debito',
    COALESCE(NEW.valor_pago, NEW.valor),
    COALESCE(NEW.data_pagamento, CURRENT_DATE),
    'Pagamento — ' || COALESCE(NEW.credor_nome, '(sem nome)'),
    'conta_pagar',
    CASE WHEN NEW.status = 'conciliado' THEN 'conciliado' ELSE 'pendente' END
  );

  PERFORM set_config('app.skip_categoria_garantia', 'false', true);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_garantir_mov_ao_quitar_cp ON public.contas_pagar;
CREATE TRIGGER trg_garantir_mov_ao_quitar_cp
  AFTER INSERT OR UPDATE ON public.contas_pagar
  FOR EACH ROW EXECUTE FUNCTION public.garantir_mov_ao_quitar_cp();


-- =============================================================================
-- GARANTIA 2: soft-delete de CR/CP desfaz conciliacao bancaria
-- =============================================================================
CREATE OR REPLACE FUNCTION public.desfazer_conciliacao_ao_soft_delete_cr()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    UPDATE public.bank_transactions
       SET status = 'pending',
           reconciled_receivable_id = NULL,
           reconciled_at = NULL,
           reconciled_by = NULL
     WHERE reconciled_receivable_id = NEW.id;

    UPDATE public.bank_reconciliation_matches
       SET status = 'reverted'
     WHERE receivable_id = NEW.id AND status = 'matched';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_desfazer_conciliacao_cr ON public.contas_receber;
CREATE TRIGGER trg_desfazer_conciliacao_cr
  AFTER UPDATE ON public.contas_receber
  FOR EACH ROW EXECUTE FUNCTION public.desfazer_conciliacao_ao_soft_delete_cr();


CREATE OR REPLACE FUNCTION public.desfazer_conciliacao_ao_soft_delete_cp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    UPDATE public.bank_transactions
       SET status = 'pending',
           reconciled_payable_id = NULL,
           reconciled_at = NULL,
           reconciled_by = NULL
     WHERE reconciled_payable_id = NEW.id;

    UPDATE public.bank_reconciliation_matches
       SET status = 'reverted'
     WHERE payable_id = NEW.id AND status = 'matched';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_desfazer_conciliacao_cp ON public.contas_pagar;
CREATE TRIGGER trg_desfazer_conciliacao_cp
  AFTER UPDATE ON public.contas_pagar
  FOR EACH ROW EXECUTE FUNCTION public.desfazer_conciliacao_ao_soft_delete_cp();


-- =============================================================================
-- GARANTIA 3: bloqueia mov sem categoria contabil (exceto transferencia)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.garantir_categoria_em_mov()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_skip TEXT;
BEGIN
  BEGIN
    v_skip := current_setting('app.skip_categoria_garantia', true);
  EXCEPTION WHEN OTHERS THEN v_skip := NULL; END;
  IF v_skip = 'true' THEN RETURN NEW; END IF;

  -- Transferencia entre contas e' neutra no DRE
  IF NEW.origem = 'transferencia' THEN RETURN NEW; END IF;

  IF NEW.conta_contabil_id IS NULL THEN
    RAISE EXCEPTION 'Categoria contabil obrigatoria em movimentacao (% R$ % em %). Sem categoria a mov sumiria do DRE. Selecione uma conta do plano de contas antes de salvar.',
      NEW.tipo, NEW.valor, NEW.data
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_garantir_categoria_em_mov ON public.movimentacoes;
CREATE TRIGGER trg_garantir_categoria_em_mov
  BEFORE INSERT OR UPDATE ON public.movimentacoes
  FOR EACH ROW EXECUTE FUNCTION public.garantir_categoria_em_mov();


-- =============================================================================
-- BYPASS em conciliar_lote (RPC gerencia mov manualmente)
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
  v_target_id UUID;
  v_target_existing UUID;
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
  PERFORM set_config('app.skip_mov_garantia', 'true', true);
  PERFORM set_config('app.skip_categoria_garantia', 'true', true);

  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    BEGIN
      v_is_expense := COALESCE((item->>'is_expense')::boolean, false);
      v_amount := (item->>'amount')::NUMERIC;
      v_date := (item->>'date')::DATE;
      v_desc := COALESCE(NULLIF(item->>'description', ''), 'Conciliação automática');
      v_bank_tx_id := (item->>'bank_tx_id')::UUID;

      v_account_id := NULL;
      IF item->>'account_id' IS NOT NULL AND item->>'account_id' != ''
         AND item->>'account_id' != 'null' THEN
        v_account_id := (item->>'account_id')::UUID;
        SELECT TRUE INTO v_account_valid FROM public.chart_of_accounts
         WHERE id = v_account_id AND company_id = p_company_id;
        IF v_account_valid IS NULL THEN v_account_id := NULL; END IF;
        v_account_valid := NULL;
      END IF;

      v_unidade_id := NULL;
      IF item->>'unidade_destino_id' IS NOT NULL AND item->>'unidade_destino_id' != ''
         AND item->>'unidade_destino_id' != 'null' THEN
        v_unidade_id := (item->>'unidade_destino_id')::UUID;
      END IF;
      IF v_unidade_id IS NULL AND v_bank_tx_id IS NOT NULL THEN
        SELECT bt.unidade_destino_id INTO v_unidade_id FROM public.bank_transactions bt
         WHERE bt.id = v_bank_tx_id;
      END IF;

      v_target_existing := NULL;
      IF v_is_expense THEN
        IF item->>'payable_id' IS NOT NULL AND item->>'payable_id' != ''
           AND item->>'payable_id' != 'null' THEN
          v_target_existing := (item->>'payable_id')::UUID;
        END IF;
      ELSE
        IF item->>'receivable_id' IS NOT NULL AND item->>'receivable_id' != ''
           AND item->>'receivable_id' != 'null' THEN
          v_target_existing := (item->>'receivable_id')::UUID;
        END IF;
      END IF;

      IF v_target_existing IS NOT NULL THEN
        IF v_is_expense THEN
          SELECT status INTO v_target_existing_status FROM public.contas_pagar
           WHERE id = v_target_existing AND company_id = p_company_id AND deleted_at IS NULL;
        ELSE
          SELECT status INTO v_target_existing_status FROM public.contas_receber
           WHERE id = v_target_existing AND company_id = p_company_id AND deleted_at IS NULL;
        END IF;
        IF v_target_existing_status IS NULL THEN v_target_existing := NULL; END IF;
      END IF;

      IF v_target_existing IS NOT NULL THEN
        v_target_id := v_target_existing;
        IF v_target_existing_status <> 'pago' THEN
          IF v_is_expense THEN
            UPDATE public.contas_pagar
               SET status = 'pago', data_pagamento = v_date, valor_pago = v_amount,
                   conta_bancaria_id = p_bank_account_id
             WHERE id = v_target_id;
          ELSE
            UPDATE public.contas_receber
               SET status = 'pago', data_pagamento = v_date, valor_pago = v_amount,
                   conta_bancaria_id = p_bank_account_id
             WHERE id = v_target_id;
          END IF;
        END IF;
      ELSE
        IF v_is_expense THEN
          INSERT INTO public.contas_pagar (
            company_id, credor_nome, valor, data_vencimento,
            status, conta_contabil_id, data_pagamento, valor_pago,
            unidade_destino_id, conta_bancaria_id, created_via_bank_tx_id
          ) VALUES (
            p_company_id, v_desc, v_amount, v_date, 'pago', v_account_id, v_date, v_amount,
            v_unidade_id, p_bank_account_id, v_bank_tx_id
          ) RETURNING id INTO v_target_id;
        ELSE
          INSERT INTO public.contas_receber (
            company_id, pagador_nome, valor, data_vencimento,
            status, conta_contabil_id, data_pagamento, valor_pago,
            unidade_destino_id, conta_bancaria_id, created_via_bank_tx_id
          ) VALUES (
            p_company_id, v_desc, v_amount, v_date, 'pago', v_account_id, v_date, v_amount,
            v_unidade_id, p_bank_account_id, v_bank_tx_id
          ) RETURNING id INTO v_target_id;
        END IF;
      END IF;

      INSERT INTO public.bank_reconciliation_matches (
        company_id, bank_account_id, bank_transaction_id,
        payable_id, receivable_id, match_type, matched_amount, matched_date, status, created_by
      ) VALUES (
        p_company_id, p_bank_account_id, v_bank_tx_id,
        CASE WHEN v_is_expense THEN v_target_id ELSE NULL END,
        CASE WHEN NOT v_is_expense THEN v_target_id ELSE NULL END,
        CASE WHEN v_target_existing IS NOT NULL THEN 'auto_link' ELSE 'auto' END,
        v_amount, v_date, 'matched', p_user_id
      );

      v_mov_existente := NULL;
      IF v_is_expense THEN
        SELECT id INTO v_mov_existente FROM public.movimentacoes
         WHERE conta_pagar_id = v_target_id LIMIT 1;
      ELSE
        SELECT id INTO v_mov_existente FROM public.movimentacoes
         WHERE conta_receber_id = v_target_id LIMIT 1;
      END IF;

      IF v_mov_existente IS NOT NULL THEN
        UPDATE public.movimentacoes SET
          conta_bancaria_id = p_bank_account_id,
          conta_contabil_id = COALESCE(v_account_id, conta_contabil_id),
          tipo = CASE WHEN v_is_expense THEN 'debito' ELSE 'credito' END,
          valor = v_amount, data = v_date,
          descricao = CASE WHEN v_is_expense THEN 'Pagamento: ' || v_desc ELSE 'Recebimento: ' || v_desc END,
          origem = CASE WHEN v_is_expense THEN 'conta_pagar' ELSE 'conta_receber' END,
          status_conciliacao = 'conciliado'
        WHERE id = v_mov_existente;
      ELSE
        INSERT INTO public.movimentacoes (
          company_id, conta_bancaria_id, conta_contabil_id,
          conta_receber_id, conta_pagar_id, tipo, valor, data, descricao, origem, status_conciliacao
        ) VALUES (
          p_company_id, p_bank_account_id, v_account_id,
          CASE WHEN NOT v_is_expense THEN v_target_id ELSE NULL END,
          CASE WHEN v_is_expense THEN v_target_id ELSE NULL END,
          CASE WHEN v_is_expense THEN 'debito' ELSE 'credito' END,
          v_amount, v_date,
          CASE WHEN v_is_expense THEN 'Pagamento: ' || v_desc ELSE 'Recebimento: ' || v_desc END,
          CASE WHEN v_is_expense THEN 'conta_pagar' ELSE 'conta_receber' END,
          'conciliado'
        );
        IF v_is_expense THEN v_balance_delta := v_balance_delta - v_amount;
        ELSE v_balance_delta := v_balance_delta + v_amount; END IF;
      END IF;

      UPDATE public.bank_transactions SET
        status = 'reconciled',
        reconciled_payable_id = CASE WHEN v_is_expense THEN v_target_id ELSE NULL END,
        reconciled_receivable_id = CASE WHEN NOT v_is_expense THEN v_target_id ELSE NULL END,
        reconciled_at = v_now, reconciled_by = p_user_id
      WHERE id = v_bank_tx_id;

      v_success := v_success + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_err_msg := SQLERRM;
      v_failed_reasons := v_failed_reasons || jsonb_build_object(
        'bank_tx_id', v_bank_tx_id, 'description', v_desc, 'error', v_err_msg);
    END;
  END LOOP;

  IF v_balance_delta != 0 THEN
    UPDATE public.bank_accounts
    SET current_balance = current_balance + v_balance_delta, updated_at = v_now
    WHERE id = p_bank_account_id;
  END IF;

  RETURN jsonb_build_object('success', v_success, 'failed', v_failed, 'failed_reasons', v_failed_reasons);
END;
$$;
