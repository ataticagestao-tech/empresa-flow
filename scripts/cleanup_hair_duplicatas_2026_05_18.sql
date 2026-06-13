-- ============================================================================
-- CLEANUP: duplicatas HAIR OF BRASIL — auditoria 2026-05-18
--
-- Escopo:
--   - 10 CRs gêmeos: soft-delete o mais NOVO + hard-delete movs vinculadas
--   - 1 mov duplicada do CR Luiz Renato Mansur: hard-delete + corrigir valor_pago
--   - NÃO mexe no CR Stone (R$ 3.863) parcial — é pagamento real em parcelas
--
-- Tudo num DO block atômico. Rollback automático em qualquer erro.
-- Backup das linhas afetadas em backup_hair_dup_2026_05_18_*.
-- Recalcula current_balance das contas bancárias HAIR ao final.
-- ============================================================================

DO $$
DECLARE
  v_hair_id UUID := '6d41eb71-e593-4ff2-8e3b-e36089a2aca7';
  v_crs_a_deletar UUID[] := ARRAY[
    '45ba70c2-85cd-490b-bab6-da4d33bb96c5'::UUID,  -- Pietro Paranaíba
    'bcd12102-80db-4368-94b0-530d6394f3b1'::UUID,  -- Leonardo Macedo
    'b0aad910-0b8e-4235-9958-2539b49d96ee'::UUID,  -- Adriele Daiane
    'e33ee218-14e9-4c28-97ce-f2136dc606eb'::UUID,  -- Nilton Vilela
    'f291a508-dba8-4a76-9df9-29d055ae866a'::UUID,  -- Robert Romao
    '0b26d312-af4a-4791-887f-a54b348b3564'::UUID,  -- Vinicius Guedes
    '196ae88a-5f4d-44d6-9f45-afa740249391'::UUID,  -- Cacildo Inácio
    '1232eee8-ff7f-4112-9455-c737beea324b'::UUID,  -- Mathias de Oliveira
    'c2cb0bda-368f-4557-8071-43d0827cb29b'::UUID,  -- Maria das Graças
    '18a3cde4-d6e3-4608-afbc-093e3ffd6a32'::UUID   -- Thiago Lisboa
  ];
  v_mov_luiz_renato UUID := '312adb4b-f5fa-4a94-b3c2-545d6fb1066f';
  v_cr_luiz_renato UUID := 'fd1b26dc-8e92-44fc-8ed4-0ef16b124131';
  v_movs_deletadas INT;
  v_crs_deletados INT;
  v_contas_recalc INT;
BEGIN
  -- ─── Validações prévias ─────────────────────────────────────────
  IF (SELECT COUNT(*) FROM public.contas_receber
       WHERE id = ANY(v_crs_a_deletar) AND deleted_at IS NULL) <> 10 THEN
    RAISE EXCEPTION 'Aborto: nem todos os 10 CRs estao ativos (deleted_at IS NULL). Verifique antes.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.movimentacoes WHERE id = v_mov_luiz_renato) THEN
    RAISE EXCEPTION 'Aborto: mov do Luiz Renato % nao encontrada', v_mov_luiz_renato;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.contas_receber WHERE id = v_cr_luiz_renato AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Aborto: CR Luiz Renato % nao encontrado ou ja deletado', v_cr_luiz_renato;
  END IF;

  -- ─── 0. Backup ──────────────────────────────────────────────────
  DROP TABLE IF EXISTS public.backup_hair_dup_2026_05_18_crs;
  CREATE TABLE public.backup_hair_dup_2026_05_18_crs AS
  SELECT * FROM public.contas_receber
   WHERE id = ANY(v_crs_a_deletar) OR id = v_cr_luiz_renato;

  DROP TABLE IF EXISTS public.backup_hair_dup_2026_05_18_movs;
  CREATE TABLE public.backup_hair_dup_2026_05_18_movs AS
  SELECT m.* FROM public.movimentacoes m
   WHERE m.conta_receber_id = ANY(v_crs_a_deletar)
      OR m.id = v_mov_luiz_renato;

  RAISE NOTICE '[0/4] Backup: % CRs + % movs',
    (SELECT COUNT(*) FROM public.backup_hair_dup_2026_05_18_crs),
    (SELECT COUNT(*) FROM public.backup_hair_dup_2026_05_18_movs);

  -- ─── 1. Hard-delete movs vinculadas aos 10 CRs gêmeos ──────────
  DELETE FROM public.movimentacoes
   WHERE conta_receber_id = ANY(v_crs_a_deletar);
  GET DIAGNOSTICS v_movs_deletadas = ROW_COUNT;
  RAISE NOTICE '[1/4] % movs hard-deletadas (vinculadas aos CRs gemeos)', v_movs_deletadas;

  -- ─── 2. Hard-delete mov duplicada do Luiz Renato ───────────────
  DELETE FROM public.movimentacoes WHERE id = v_mov_luiz_renato;
  RAISE NOTICE '[2/4] 1 mov dupla do Luiz Renato hard-deletada';

  -- ─── 3. Soft-delete dos 10 CRs gêmeos ──────────────────────────
  UPDATE public.contas_receber
     SET deleted_at = now()
   WHERE id = ANY(v_crs_a_deletar);
  GET DIAGNOSTICS v_crs_deletados = ROW_COUNT;
  RAISE NOTICE '[3a/4] % CRs gemeos soft-deletados', v_crs_deletados;

  -- ─── 3b. Corrigir valor_pago do CR Luiz Renato ─────────────────
  -- valor original do CR: R$ 7.000
  -- 2 movs casaram, valor_pago = R$ 13.995,22 (errado)
  -- Apos delete da mov dupla, sobra 1 mov de R$ 6.997,61
  -- Diferenca R$ 2,39 = taxa Stone, marca como "pago"
  UPDATE public.contas_receber
     SET valor_pago = 6997.61,
         status = 'pago'
   WHERE id = v_cr_luiz_renato;
  RAISE NOTICE '[3b/4] CR Luiz Renato: valor_pago R$ 13.995,22 → R$ 6.997,61';

  -- ─── 4. Recalcular current_balance das contas HAIR ─────────────
  UPDATE public.bank_accounts ba
     SET current_balance = ba.initial_balance + COALESCE((
           SELECT SUM(CASE WHEN m.tipo = 'credito' THEN m.valor ELSE -m.valor END)
             FROM public.movimentacoes m
            WHERE m.conta_bancaria_id = ba.id
         ), 0),
         updated_at = now()
   WHERE ba.company_id = v_hair_id;
  GET DIAGNOSTICS v_contas_recalc = ROW_COUNT;
  RAISE NOTICE '[4/4] Saldo recalculado em % contas bancarias', v_contas_recalc;

  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE 'RESUMO HAIR cleanup 2026-05-18:';
  RAISE NOTICE '  CRs gemeos soft-deletados:    %', v_crs_deletados;
  RAISE NOTICE '  Movs hard-deletadas:          % (+ 1 do Luiz Renato)', v_movs_deletadas;
  RAISE NOTICE '  CR Luiz Renato valor_pago:    R$ 13.995,22 → R$ 6.997,61';
  RAISE NOTICE '  Backup: backup_hair_dup_2026_05_18_{crs,movs}';
  RAISE NOTICE '════════════════════════════════════════════════════════════';
END $$;


-- ============================================================================
-- VERIFICACOES (rodar SEPARADAMENTE depois do DO block acima)
-- ============================================================================

-- V1. Confere que o resumo de duplicatas zerou ou caiu
WITH dup AS (
  SELECT m.data, m.tipo, m.valor, m.descricao, COUNT(*) AS qtd
  FROM public.movimentacoes m
  WHERE m.company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7'
  GROUP BY m.data, m.tipo, m.valor, m.descricao
  HAVING COUNT(*) > 1
)
SELECT COUNT(*) AS grupos_dup_restantes, SUM(qtd - 1) AS linhas_excedentes FROM dup;

-- V2. Confere que CRs gemeos sumiram
SELECT cr.pagador_nome, cr.valor, cr.data_vencimento, cr.data_pagamento, COUNT(*) AS qtd
FROM public.contas_receber cr
WHERE cr.company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7'
  AND cr.deleted_at IS NULL
GROUP BY cr.pagador_nome, cr.valor, cr.data_vencimento, cr.data_pagamento
HAVING COUNT(*) > 1;

-- V3. Confere CR Luiz Renato
SELECT id, valor, valor_pago, status, data_pagamento
FROM public.contas_receber WHERE id = 'fd1b26dc-8e92-44fc-8ed4-0ef16b124131';

-- V4. Total entradas de abril (deve cair ~R$ 7.518)
SELECT SUM(m.valor) AS total_entradas_abril
FROM public.movimentacoes m
WHERE m.company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7'
  AND m.data BETWEEN '2026-04-01' AND '2026-04-30'
  AND m.tipo = 'credito';


-- ============================================================================
-- ROLLBACK manual (se precisar desfazer — rodar antes que backup seja excluido)
-- ============================================================================

-- -- Reverter soft-delete dos CRs
-- UPDATE public.contas_receber cr
--    SET deleted_at = NULL
--   FROM public.backup_hair_dup_2026_05_18_crs b
--  WHERE cr.id = b.id AND cr.deleted_at IS NOT NULL;
--
-- -- Restaurar valor_pago do Luiz Renato
-- UPDATE public.contas_receber cr
--    SET valor_pago = b.valor_pago, status = b.status
--   FROM public.backup_hair_dup_2026_05_18_crs b
--  WHERE cr.id = b.id AND cr.id = 'fd1b26dc-8e92-44fc-8ed4-0ef16b124131';
--
-- -- Restaurar movs deletadas
-- INSERT INTO public.movimentacoes
-- SELECT b.* FROM public.backup_hair_dup_2026_05_18_movs b
-- WHERE NOT EXISTS (SELECT 1 FROM public.movimentacoes m WHERE m.id = b.id);
--
-- -- Recalcular saldo
-- UPDATE public.bank_accounts ba
--    SET current_balance = ba.initial_balance + COALESCE((
--          SELECT SUM(CASE WHEN m.tipo = 'credito' THEN m.valor ELSE -m.valor END)
--            FROM public.movimentacoes m WHERE m.conta_bancaria_id = ba.id
--        ), 0)
--  WHERE ba.company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7';
