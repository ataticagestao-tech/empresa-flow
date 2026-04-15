-- ============================================================
-- FIX + BACKFILL: conciliar_lote não preenchia conta_receber_id /
-- conta_pagar_id nas movimentacoes criadas, gerando "pendências de
-- reclassificação" fantasmas no banner (hook usePendenciasReclassificacao
-- filtra por FK NULL).
--
--  1. Corrige a RPC — movimentação recém-criada passa a carregar o FK.
--  2. Backfill — re-vincula movs órfãs aos CRs/CPs correspondentes
--     casando por (company_id, data, valor, descrição) com ROW_NUMBER()
--     pra pareamento 1-pra-1 quando houver múltiplos iguais no mesmo dia.
-- ============================================================

-- ─── 1. Fix na RPC conciliar_lote ──────────────────────────

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
  v_amount NUMERIC;
  v_date DATE;
  v_desc TEXT;
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

      IF v_is_expense THEN
        INSERT INTO public.contas_pagar (
          company_id, credor_nome, valor, data_vencimento,
          status, conta_contabil_id, data_pagamento, valor_pago,
          unidade_destino_id
        ) VALUES (
          p_company_id, v_desc, v_amount, v_date,
          'pago', v_account_id, v_date, v_amount,
          v_unidade_id
        ) RETURNING id INTO v_created_id;
      ELSE
        INSERT INTO public.contas_receber (
          company_id, pagador_nome, valor, data_vencimento,
          status, conta_contabil_id, data_pagamento, valor_pago,
          unidade_destino_id
        ) VALUES (
          p_company_id, v_desc, v_amount, v_date,
          'pago', v_account_id, v_date, v_amount,
          v_unidade_id
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

      -- ✱ FIX: preencher conta_receber_id / conta_pagar_id ✱
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


-- ─── 2. Backfill: re-vincular movs órfãs aos CRs ───────────
--
-- Estratégia: parear 1-pra-1 por (company_id, data, valor, pagador_nome)
-- usando ROW_NUMBER() em ambos os lados para desambiguar duplicatas no
-- mesmo dia. Só atualiza movs com conta_receber_id IS NULL e CRs sem
-- outra mov já vinculada.

WITH movs_orfas AS (
  SELECT
    m.id,
    m.company_id,
    m.data,
    m.valor,
    regexp_replace(m.descricao, '^Recebimento:\s*', '') AS nome,
    ROW_NUMBER() OVER (
      PARTITION BY m.company_id, m.data, m.valor,
                   regexp_replace(m.descricao, '^Recebimento:\s*', '')
      ORDER BY m.created_at, m.id
    ) AS rn
  FROM public.movimentacoes m
  WHERE m.tipo = 'credito'
    AND m.origem = 'conta_receber'
    AND m.conta_receber_id IS NULL
    AND m.descricao LIKE 'Recebimento:%'
),
crs_candidatos AS (
  SELECT
    cr.id,
    cr.company_id,
    COALESCE(cr.data_pagamento, cr.data_vencimento) AS data,
    cr.valor_pago AS valor,
    COALESCE(cr.pagador_nome, 'Cliente') AS nome,
    ROW_NUMBER() OVER (
      PARTITION BY cr.company_id,
                   COALESCE(cr.data_pagamento, cr.data_vencimento),
                   cr.valor_pago,
                   COALESCE(cr.pagador_nome, 'Cliente')
      ORDER BY cr.created_at, cr.id
    ) AS rn
  FROM public.contas_receber cr
  WHERE cr.deleted_at IS NULL
    AND cr.status IN ('pago', 'parcial')
    AND cr.valor_pago > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.movimentacoes m2
      WHERE m2.conta_receber_id = cr.id
    )
)
UPDATE public.movimentacoes m
SET conta_receber_id = c.id
FROM movs_orfas o
JOIN crs_candidatos c
  ON c.company_id = o.company_id
 AND c.data       = o.data
 AND c.valor      = o.valor
 AND c.nome       = o.nome
 AND c.rn         = o.rn
WHERE m.id = o.id;


-- ─── 3. Backfill: re-vincular movs órfãs aos CPs ───────────

WITH movs_orfas AS (
  SELECT
    m.id,
    m.company_id,
    m.data,
    m.valor,
    regexp_replace(m.descricao, '^Pagamento:\s*', '') AS nome,
    ROW_NUMBER() OVER (
      PARTITION BY m.company_id, m.data, m.valor,
                   regexp_replace(m.descricao, '^Pagamento:\s*', '')
      ORDER BY m.created_at, m.id
    ) AS rn
  FROM public.movimentacoes m
  WHERE m.tipo = 'debito'
    AND m.origem = 'conta_pagar'
    AND m.conta_pagar_id IS NULL
    AND m.descricao LIKE 'Pagamento:%'
),
cps_candidatos AS (
  SELECT
    cp.id,
    cp.company_id,
    COALESCE(cp.data_pagamento, cp.data_vencimento) AS data,
    cp.valor_pago AS valor,
    COALESCE(cp.credor_nome, 'Fornecedor') AS nome,
    ROW_NUMBER() OVER (
      PARTITION BY cp.company_id,
                   COALESCE(cp.data_pagamento, cp.data_vencimento),
                   cp.valor_pago,
                   COALESCE(cp.credor_nome, 'Fornecedor')
      ORDER BY cp.created_at, cp.id
    ) AS rn
  FROM public.contas_pagar cp
  WHERE cp.deleted_at IS NULL
    AND cp.status IN ('pago', 'parcial')
    AND cp.valor_pago > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.movimentacoes m2
      WHERE m2.conta_pagar_id = cp.id
    )
)
UPDATE public.movimentacoes m
SET conta_pagar_id = c.id
FROM movs_orfas o
JOIN cps_candidatos c
  ON c.company_id = o.company_id
 AND c.data       = o.data
 AND c.valor      = o.valor
 AND c.nome       = o.nome
 AND c.rn         = o.rn
WHERE m.id = o.id;


-- ─── 4. Relatório pós-backfill ─────────────────────────────

DO $$
DECLARE
  v_restantes BIGINT;
  v_cr_vinculadas BIGINT;
  v_cp_vinculadas BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_cr_vinculadas
  FROM public.movimentacoes
  WHERE origem = 'conta_receber' AND conta_receber_id IS NOT NULL;

  SELECT COUNT(*) INTO v_cp_vinculadas
  FROM public.movimentacoes
  WHERE origem = 'conta_pagar' AND conta_pagar_id IS NOT NULL;

  SELECT COUNT(*) INTO v_restantes
  FROM public.movimentacoes
  WHERE status_conciliacao = 'pendente'
    AND ((tipo='credito' AND origem='conta_receber' AND conta_receber_id IS NULL)
      OR (tipo='debito'  AND origem='conta_pagar'   AND conta_pagar_id  IS NULL));

  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE 'BACKFILL concluído';
  RAISE NOTICE '   Movs conta_receber com FK: %', v_cr_vinculadas;
  RAISE NOTICE '   Movs conta_pagar  com FK: %', v_cp_vinculadas;
  RAISE NOTICE '   Resíduo (não casado): %', v_restantes;
  RAISE NOTICE '════════════════════════════════════════════════════════════';
END $$;

-- Refresh de MVs financeiras (caso algo dependa do FK)
SELECT public.refresh_mvs_financeiras();
