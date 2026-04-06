-- ============================================================
-- Excluir todas as contas a RECEBER em aberto da unidade FLORIPA
-- One-time cleanup migration
-- ============================================================

DO $$
DECLARE
  v_company_id UUID;
  v_count INT;
BEGIN
  SELECT id INTO v_company_id
  FROM public.companies
  WHERE (nome_fantasia ILIKE '%FLORIPA%' OR razao_social ILIKE '%FLORIPA%')
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE NOTICE 'Empresa FLORIPA não encontrada';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.contas_receber
  WHERE company_id = v_company_id
    AND status IN ('aberto', 'vencido');

  RAISE NOTICE 'CRs em aberto/vencido a excluir: %', v_count;

  -- 1. Limpar movimentações vinculadas
  DELETE FROM public.movimentacoes
  WHERE conta_receber_id IN (
    SELECT id FROM public.contas_receber
    WHERE company_id = v_company_id
      AND status IN ('aberto', 'vencido')
  );

  -- 2. Limpar reconciliation matches
  UPDATE public.bank_reconciliation_matches
  SET receivable_id = NULL
  WHERE receivable_id IN (
    SELECT id FROM public.contas_receber
    WHERE company_id = v_company_id
      AND status IN ('aberto', 'vencido')
  );

  -- 3. Limpar bank_transactions
  UPDATE public.bank_transactions
  SET reconciled_receivable_id = NULL
  WHERE reconciled_receivable_id IN (
    SELECT id FROM public.contas_receber
    WHERE company_id = v_company_id
      AND status IN ('aberto', 'vencido')
  );

  -- 4. Excluir as CRs
  DELETE FROM public.contas_receber
  WHERE company_id = v_company_id
    AND status IN ('aberto', 'vencido');

  RAISE NOTICE 'Concluído: % CRs excluídas da unidade FLORIPA', v_count;
END;
$$;
