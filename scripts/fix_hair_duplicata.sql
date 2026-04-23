-- Correcao da conciliacao duplicada da HAIR OF BRASIL LTDA (2026-04-20, PIX R$ 7.500)
-- Executado em transacao atomica via DO block.
--
-- Mantem: a20930d2-2704-46d6-b829-5b937978f6cb (primeiro criado)
-- Remove: c3744bb7-8560-4b7b-ab63-7baced744532 + movimentacao + match associados

DO $$
DECLARE
  v_matches_deleted int;
  v_movs_deleted int;
  v_cr_updated int;
BEGIN
  -- 1. DELETE do match de conciliacao (hard-delete, nao tem trigger bloqueando)
  DELETE FROM public.bank_reconciliation_matches
  WHERE id = '90f48cc9-28d2-44db-8678-1419732ef693';
  GET DIAGNOSTICS v_matches_deleted = ROW_COUNT;

  -- 2. DELETE da movimentacao fantasma (R$ 7.500 duplicado no caixa)
  DELETE FROM public.movimentacoes
  WHERE id = '98462d49-576f-41c3-be47-76b1ba8451fb';
  GET DIAGNOSTICS v_movs_deleted = ROW_COUNT;

  -- 3. Soft-delete do CR duplicado (UPDATE deleted_at, trigger permite)
  UPDATE public.contas_receber
  SET deleted_at = NOW()
  WHERE id = 'c3744bb7-8560-4b7b-ab63-7baced744532'
    AND deleted_at IS NULL;
  GET DIAGNOSTICS v_cr_updated = ROW_COUNT;

  RAISE NOTICE 'Limpeza concluida: % match(es), % movimentacao(oes), % CR soft-deletado(s)',
    v_matches_deleted, v_movs_deleted, v_cr_updated;

  -- Validacoes: se algo nao deu certo, reverte tudo
  IF v_matches_deleted <> 1 THEN
    RAISE EXCEPTION 'Esperava deletar 1 match, deletou %', v_matches_deleted;
  END IF;
  IF v_movs_deleted <> 1 THEN
    RAISE EXCEPTION 'Esperava deletar 1 movimentacao, deletou %', v_movs_deleted;
  END IF;
  IF v_cr_updated <> 1 THEN
    RAISE EXCEPTION 'Esperava soft-deletar 1 CR, atualizou %', v_cr_updated;
  END IF;
END $$;
