-- ============================================================
-- BACKFILL: conta_contabil_id em contas_receber / contas_pagar
--
-- Contexto: vendas antigas criavam CR com conta_contabil_id = null,
-- e lojas que lancam manual tambem podem ter deixado em branco.
-- Sem classificacao contabil, esses registros nao aparecem no
-- DRE (que agora le por regime de caixa direto de CR/CP).
--
-- Estrategia: para cada empresa, pega a primeira conta analitica
-- ativa (por code) de receita e de despesa/custo, e atribui como
-- default aos orfaos vivos (deleted_at IS NULL).
--
-- Seguranca contra o trigger de imutabilidade:
-- A funcao bloquear_edicao_pago (migration 20260410170000) permite
-- reclassificar conta_contabil_id em registros pagos desde que os
-- campos financeiros nao mudem. Esta migration so altera
-- conta_contabil_id, entao passa pela regra.
-- ============================================================

DO $$
DECLARE
  v_company RECORD;
  v_conta_receita_id uuid;
  v_conta_despesa_id uuid;
  v_updated_cr int;
  v_updated_cp int;
BEGIN
  FOR v_company IN
    SELECT DISTINCT c.id, c.razao_social
    FROM public.companies c
    WHERE EXISTS (
      SELECT 1 FROM public.contas_receber cr
      WHERE cr.company_id = c.id
        AND cr.conta_contabil_id IS NULL
        AND cr.deleted_at IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.contas_pagar cp
      WHERE cp.company_id = c.id
        AND cp.conta_contabil_id IS NULL
        AND cp.deleted_at IS NULL
    )
  LOOP
    -- Primeira conta analitica de receita para esta empresa
    SELECT id INTO v_conta_receita_id
    FROM public.chart_of_accounts
    WHERE company_id = v_company.id
      AND account_type = 'revenue'
      AND is_analytical = true
      AND status = 'active'
    ORDER BY code
    LIMIT 1;

    -- Primeira conta analitica de despesa (prefere 'expense' sobre 'cost')
    SELECT id INTO v_conta_despesa_id
    FROM public.chart_of_accounts
    WHERE company_id = v_company.id
      AND account_type IN ('expense', 'cost')
      AND is_analytical = true
      AND status = 'active'
    ORDER BY
      CASE account_type WHEN 'expense' THEN 0 ELSE 1 END,
      code
    LIMIT 1;

    -- Backfill contas_receber
    IF v_conta_receita_id IS NOT NULL THEN
      UPDATE public.contas_receber
      SET conta_contabil_id = v_conta_receita_id
      WHERE company_id = v_company.id
        AND conta_contabil_id IS NULL
        AND deleted_at IS NULL;

      GET DIAGNOSTICS v_updated_cr = ROW_COUNT;
      RAISE NOTICE '[backfill] % — CR atualizados: %', v_company.razao_social, v_updated_cr;
    ELSE
      RAISE NOTICE '[backfill] % — sem conta de receita analitica, CR nao atualizados', v_company.razao_social;
    END IF;

    -- Backfill contas_pagar
    IF v_conta_despesa_id IS NOT NULL THEN
      UPDATE public.contas_pagar
      SET conta_contabil_id = v_conta_despesa_id
      WHERE company_id = v_company.id
        AND conta_contabil_id IS NULL
        AND deleted_at IS NULL;

      GET DIAGNOSTICS v_updated_cp = ROW_COUNT;
      RAISE NOTICE '[backfill] % — CP atualizados: %', v_company.razao_social, v_updated_cp;
    ELSE
      RAISE NOTICE '[backfill] % — sem conta de despesa analitica, CP nao atualizados', v_company.razao_social;
    END IF;
  END LOOP;
END $$;
