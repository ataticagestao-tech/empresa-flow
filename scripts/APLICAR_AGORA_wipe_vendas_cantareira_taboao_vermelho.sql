-- ============================================================================
-- WIPE TOTAL de vendas: CANTAREIRA + TABOAO VERMELHO
-- Disparado pela Izabel em 2026-05-26 (zerar pra re-importar do zero).
--
-- Escopo: TODAS as vendas dessas 2 empresas (qualquer data de criacao).
-- Proteção: filtro de Taboao exige 'tabo' E 'vermelh' juntos pra NAO pegar
-- "Taboao Azul" por engano.
--
-- Cascata: movimentacoes (HARD) -> contas_receber (SOFT) -> vendas (SOFT)
-- ============================================================================

DO $$
DECLARE
  v_ids UUID[];
  v_id UUID;
  v_nome TEXT;
  v_count_v INT;
  v_count_cr INT;
  v_count_mov INT;
  v_tot_v INT := 0;
  v_tot_cr INT := 0;
  v_tot_mov INT := 0;
BEGIN
  SELECT array_agg(id) INTO v_ids
  FROM companies
  WHERE LOWER(COALESCE(nome_fantasia,'') || ' ' || COALESCE(razao_social,'')) LIKE '%cantareira%'
     OR (LOWER(COALESCE(nome_fantasia,'') || ' ' || COALESCE(razao_social,'')) LIKE '%tabo%'
         AND LOWER(COALESCE(nome_fantasia,'') || ' ' || COALESCE(razao_social,'')) LIKE '%vermelh%');

  IF v_ids IS NULL OR array_length(v_ids, 1) = 0 THEN
    RAISE EXCEPTION 'Nenhuma empresa encontrada (Cantareira / Taboao Vermelho)';
  END IF;

  -- Mostra o que vai apagar (confira os nomes no output)
  FOREACH v_id IN ARRAY v_ids LOOP
    SELECT COALESCE(nome_fantasia, razao_social) INTO v_nome FROM companies WHERE id = v_id;
    SELECT COUNT(*) INTO v_count_v FROM vendas WHERE company_id = v_id AND deleted_at IS NULL;
    RAISE NOTICE 'ALVO: % (%) -> vendas ativas: %', v_nome, v_id, v_count_v;
  END LOOP;

  -- Apaga em cascata, empresa por empresa
  FOREACH v_id IN ARRAY v_ids LOOP
    DELETE FROM movimentacoes
    WHERE conta_receber_id IN (
      SELECT cr.id FROM contas_receber cr
      INNER JOIN vendas v ON v.id = cr.venda_id
      WHERE v.company_id = v_id AND v.deleted_at IS NULL
    );
    GET DIAGNOSTICS v_count_mov = ROW_COUNT;
    v_tot_mov := v_tot_mov + v_count_mov;

    UPDATE contas_receber SET deleted_at = NOW()
    WHERE venda_id IN (SELECT id FROM vendas WHERE company_id = v_id AND deleted_at IS NULL)
      AND deleted_at IS NULL;
    GET DIAGNOSTICS v_count_cr = ROW_COUNT;
    v_tot_cr := v_tot_cr + v_count_cr;

    UPDATE vendas SET deleted_at = NOW()
    WHERE company_id = v_id AND deleted_at IS NULL;
    GET DIAGNOSTICS v_count_v = ROW_COUNT;
    v_tot_v := v_tot_v + v_count_v;
  END LOOP;

  RAISE NOTICE '== TOTAIS == movimentacoes: %, contas_receber: %, vendas: %', v_tot_mov, v_tot_cr, v_tot_v;
END $$;
