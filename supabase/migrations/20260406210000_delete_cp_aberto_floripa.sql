-- ============================================================
-- Excluir todas as contas a pagar em aberto da unidade FLORIPA
-- One-time cleanup migration
-- ============================================================

DO $$
DECLARE
  v_company_id UUID;
  v_count INT;
BEGIN
  -- Encontrar o ID da empresa FLORIPA
  SELECT id INTO v_company_id
  FROM public.companies
  WHERE (nome_fantasia ILIKE '%FLORIPA%' OR razao_social ILIKE '%FLORIPA%')
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE NOTICE 'Empresa FLORIPA não encontrada';
    RETURN;
  END IF;

  RAISE NOTICE 'Empresa FLORIPA encontrada: %', v_company_id;

  -- Contar CPs a serem excluídas
  SELECT COUNT(*) INTO v_count
  FROM public.contas_pagar
  WHERE company_id = v_company_id
    AND status IN ('aberto', 'vencido');

  RAISE NOTICE 'CPs em aberto/vencido a excluir: %', v_count;

  -- 1. Limpar movimentações vinculadas
  DELETE FROM public.movimentacoes
  WHERE conta_pagar_id IN (
    SELECT id FROM public.contas_pagar
    WHERE company_id = v_company_id
      AND status IN ('aberto', 'vencido')
  );

  -- 2. Limpar reconciliation matches
  UPDATE public.bank_reconciliation_matches
  SET payable_id = NULL
  WHERE payable_id IN (
    SELECT id FROM public.contas_pagar
    WHERE company_id = v_company_id
      AND status IN ('aberto', 'vencido')
  );

  -- 3. Limpar bank_transactions
  UPDATE public.bank_transactions
  SET reconciled_payable_id = NULL
  WHERE reconciled_payable_id IN (
    SELECT id FROM public.contas_pagar
    WHERE company_id = v_company_id
      AND status IN ('aberto', 'vencido')
  );

  -- 4. Excluir as CPs
  DELETE FROM public.contas_pagar
  WHERE company_id = v_company_id
    AND status IN ('aberto', 'vencido');

  RAISE NOTICE 'Concluído: % CPs excluídas da unidade FLORIPA', v_count;
END;
$$;
