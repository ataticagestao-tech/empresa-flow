-- ============================================================================
-- UNDO da importação de vendas com data errada (31/01/2026) em 002 Floripa
-- Disparado pela Izabel em 2026-05-26 após import via planilha gerar 3921+
-- vendas com data_venda=2026-01-31 ao invés da data correta da planilha.
--
-- Critérios cirúrgicos:
--   - company_id = empresa 002 Floripa (nome ILIKE 'floripa')
--   - data_venda = '2026-01-31' (data errada que apareceu em massa)
--   - created_at >= NOW() - INTERVAL '3 hours' (importações de hoje)
--   - deleted_at IS NULL (só ativas)
--
-- Ordem de deleção (respeita FKs e triggers de soft-delete):
--   1. movimentacoes (HARD DELETE — sem deleted_at no schema)
--   2. contas_receber (UPDATE deleted_at — trigger bloqueia DELETE)
--   3. vendas (UPDATE deleted_at)
--
-- vendas_itens fica órfã filtrável via venda.deleted_at IS NULL, não precisa
-- tocar (todos os SELECT da app filtram por isso).
-- ============================================================================

DO $$
DECLARE
  v_company_id UUID;
  v_cutoff TIMESTAMPTZ := NOW() - INTERVAL '3 hours';
  v_data_errada DATE := '2026-01-31';
  v_count_vendas INT;
  v_count_crs INT;
  v_count_movs INT;
BEGIN
  -- 1. Identifica company_id da 002 Floripa
  -- companies tem razao_social e nome_fantasia (NAO tem "nome" nem "deleted_at")
  SELECT id INTO v_company_id
  FROM companies
  WHERE LOWER(nome_fantasia) LIKE '%floripa%'
     OR LOWER(razao_social)  LIKE '%floripa%'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Empresa Floripa nao encontrada';
  END IF;

  RAISE NOTICE '== UNDO IMPORT VENDAS FLORIPA ==';
  RAISE NOTICE 'company_id: %', v_company_id;
  RAISE NOTICE 'cutoff (created_at >=): %', v_cutoff;
  RAISE NOTICE 'data_venda alvo: %', v_data_errada;

  -- 2. Pré-contagem (dry-check)
  SELECT COUNT(*) INTO v_count_vendas
  FROM vendas
  WHERE company_id = v_company_id
    AND data_venda = v_data_errada
    AND created_at >= v_cutoff
    AND deleted_at IS NULL;

  RAISE NOTICE 'Vendas candidatas: %', v_count_vendas;

  IF v_count_vendas = 0 THEN
    RAISE NOTICE 'Nada para apagar. Sai.';
    RETURN;
  END IF;

  -- 3. Hard-delete movimentacoes vinculadas (via conta_receber_id)
  DELETE FROM movimentacoes
  WHERE conta_receber_id IN (
    SELECT cr.id
    FROM contas_receber cr
    INNER JOIN vendas v ON v.id = cr.venda_id
    WHERE v.company_id = v_company_id
      AND v.data_venda = v_data_errada
      AND v.created_at >= v_cutoff
      AND v.deleted_at IS NULL
  );
  GET DIAGNOSTICS v_count_movs = ROW_COUNT;
  RAISE NOTICE 'Movimentacoes hard-deletadas: %', v_count_movs;

  -- 4. Soft-delete contas_receber (trigger bloqueia DELETE)
  UPDATE contas_receber
  SET deleted_at = NOW()
  WHERE venda_id IN (
    SELECT id
    FROM vendas
    WHERE company_id = v_company_id
      AND data_venda = v_data_errada
      AND created_at >= v_cutoff
      AND deleted_at IS NULL
  )
    AND deleted_at IS NULL;
  GET DIAGNOSTICS v_count_crs = ROW_COUNT;
  RAISE NOTICE 'Contas_receber soft-deletadas: %', v_count_crs;

  -- 5. Soft-delete vendas
  UPDATE vendas
  SET deleted_at = NOW()
  WHERE company_id = v_company_id
    AND data_venda = v_data_errada
    AND created_at >= v_cutoff
    AND deleted_at IS NULL;
  GET DIAGNOSTICS v_count_vendas = ROW_COUNT;
  RAISE NOTICE 'Vendas soft-deletadas: %', v_count_vendas;

  RAISE NOTICE '== UNDO CONCLUIDO ==';
END $$;
