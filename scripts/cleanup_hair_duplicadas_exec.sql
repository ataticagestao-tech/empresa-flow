-- ============================================================================
-- CLEANUP DE EXECUCAO: duplicatas HAIR OF BRASIL LTDA
--
-- Expectativa (do dry-run):
--   Bucket 1 (movs orfas):   228 movs, R$ 298.475,51 entradas, R$ 238.735,01 saidas
--   Bucket 2 (CRs gemeos):    11 CRs soft + 11 movs hard, R$ 97.901,00 entradas
--   Bucket 3 (bank_tx dup):   ate 3 bt duplicadas, so se nao tiverem CR/CP ativo
--
-- Tudo em 1 DO block -> atomico. Se qualquer step falhar, tudo rola back.
-- Antes de deletar, copia snapshot das 3 tabelas pra backup_hair_*_<timestamp>.
-- Ao final, recalcula current_balance das contas bancarias da HAIR.
-- ============================================================================

DO $$
DECLARE
  v_bkp_suffix TEXT := to_char(now(), 'YYYYMMDD_HH24MI');
  v_hair_id UUID;
  v_c1_deleted INT;
  v_c2_movs_deleted INT;
  v_c2_crs_deleted INT;
  v_c3_deleted INT;
  v_contas_hair INT;
BEGIN
  SELECT id INTO v_hair_id FROM public.companies
   WHERE nome_fantasia = 'HAIR OF BRASIL LTDA';
  IF v_hair_id IS NULL THEN
    RAISE EXCEPTION 'HAIR OF BRASIL LTDA nao encontrada';
  END IF;

  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE 'CLEANUP HAIR — inicio (suffix %)', v_bkp_suffix;
  RAISE NOTICE 'company_id: %', v_hair_id;
  RAISE NOTICE '════════════════════════════════════════════════════════════';

  -- ─── 0. BACKUP ─────────────────────────────────────────────
  EXECUTE format(
    'CREATE TABLE public.backup_hair_movs_%s AS
     SELECT m.* FROM public.movimentacoes m
     WHERE m.company_id = %L',
    v_bkp_suffix, v_hair_id
  );
  EXECUTE format(
    'CREATE TABLE public.backup_hair_cr_%s AS
     SELECT cr.* FROM public.contas_receber cr
     WHERE cr.company_id = %L',
    v_bkp_suffix, v_hair_id
  );
  EXECUTE format(
    'CREATE TABLE public.backup_hair_bt_%s AS
     SELECT bt.* FROM public.bank_transactions bt
     WHERE bt.company_id = %L',
    v_bkp_suffix, v_hair_id
  );
  RAISE NOTICE '[0/4] Backup criado: backup_hair_{movs,cr,bt}_%', v_bkp_suffix;

  -- ─── 1. BUCKET 1: movs orfas com irmao CR/CP vinculado ───────
  WITH mov_hair AS (
    SELECT * FROM public.movimentacoes WHERE company_id = v_hair_id
  ),
  grupos_com_cr AS (
    SELECT DISTINCT company_id, data, valor, tipo
    FROM mov_hair
    WHERE (tipo = 'credito' AND conta_receber_id IS NOT NULL)
       OR (tipo = 'debito'  AND conta_pagar_id   IS NOT NULL)
  ),
  a_deletar AS (
    SELECT m.id
    FROM mov_hair m
    INNER JOIN grupos_com_cr g
      ON g.company_id = m.company_id
     AND g.data = m.data AND g.valor = m.valor AND g.tipo = m.tipo
    WHERE (m.tipo = 'credito' AND m.conta_receber_id IS NULL)
       OR (m.tipo = 'debito'  AND m.conta_pagar_id   IS NULL)
  )
  DELETE FROM public.movimentacoes m
  USING a_deletar d
  WHERE m.id = d.id;

  GET DIAGNOSTICS v_c1_deleted = ROW_COUNT;
  RAISE NOTICE '[1/4] BUCKET 1: % movs orfas deletadas', v_c1_deleted;

  -- ─── 2. BUCKET 2: CRs gemeos ────────────────────────────────
  --   2a. Hard-delete movs vinculadas aos CRs que serao soft-deletados
  WITH cr_hair AS (
    SELECT * FROM public.contas_receber
     WHERE company_id = v_hair_id AND deleted_at IS NULL
  ),
  ranked AS (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY pagador_nome, valor, data_vencimento, data_pagamento
      ORDER BY (created_via_bank_tx_id IS NOT NULL) DESC, created_at ASC
    ) AS rn
    FROM cr_hair
  ),
  crs_a_deletar AS (SELECT id FROM ranked WHERE rn > 1)
  DELETE FROM public.movimentacoes m
  USING crs_a_deletar d
  WHERE m.conta_receber_id = d.id;

  GET DIAGNOSTICS v_c2_movs_deleted = ROW_COUNT;

  --   2b. Soft-delete dos CRs duplicados (mantem rn=1 por grupo)
  WITH cr_hair AS (
    SELECT * FROM public.contas_receber
     WHERE company_id = v_hair_id AND deleted_at IS NULL
  ),
  ranked AS (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY pagador_nome, valor, data_vencimento, data_pagamento
      ORDER BY (created_via_bank_tx_id IS NOT NULL) DESC, created_at ASC
    ) AS rn
    FROM cr_hair
  )
  UPDATE public.contas_receber cr
     SET deleted_at = now()
    FROM ranked r
   WHERE cr.id = r.id AND r.rn > 1;

  GET DIAGNOSTICS v_c2_crs_deleted = ROW_COUNT;
  RAISE NOTICE '[2/4] BUCKET 2: % CRs soft-deletados + % movs hard-deletadas',
    v_c2_crs_deleted, v_c2_movs_deleted;

  -- ─── 3. BUCKET 3: bank_transactions duplicadas ───────────────
  -- Regra conservadora: so deleta bt duplicada que NAO tenha CR/CP ativo
  -- vinculado (via created_via_bank_tx_id) e NAO esteja reconciliada.
  WITH bt_hair AS (
    SELECT * FROM public.bank_transactions WHERE company_id = v_hair_id
  ),
  ranked AS (
    SELECT
      bt.id,
      ROW_NUMBER() OVER (
        PARTITION BY bt.company_id, bt.bank_account_id, bt.date, bt.amount, bt.description
        ORDER BY
          (bt.reconciled_receivable_id IS NOT NULL
            OR bt.reconciled_payable_id IS NOT NULL) DESC,
          bt.created_at ASC
      ) AS rn,
      COUNT(*) OVER (
        PARTITION BY bt.company_id, bt.bank_account_id, bt.date, bt.amount, bt.description
      ) AS total
    FROM bt_hair bt
  ),
  bt_a_deletar AS (
    SELECT bt.id
    FROM ranked r
    INNER JOIN bt_hair bt ON bt.id = r.id
    WHERE r.rn > 1 AND r.total > 1
      AND (bt.reconciled_receivable_id IS NULL AND bt.reconciled_payable_id IS NULL)
      AND NOT EXISTS (
        SELECT 1 FROM public.contas_receber cr
         WHERE cr.created_via_bank_tx_id = bt.id AND cr.deleted_at IS NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.contas_pagar cp
         WHERE cp.created_via_bank_tx_id = bt.id AND cp.deleted_at IS NULL
      )
  )
  DELETE FROM public.bank_transactions bt
  USING bt_a_deletar d
  WHERE bt.id = d.id;

  GET DIAGNOSTICS v_c3_deleted = ROW_COUNT;
  RAISE NOTICE '[3/4] BUCKET 3: % bank_tx duplicadas deletadas', v_c3_deleted;

  -- ─── 4. Recalcular current_balance das contas da HAIR ────────
  SELECT COUNT(*) INTO v_contas_hair
    FROM public.bank_accounts WHERE company_id = v_hair_id;

  UPDATE public.bank_accounts ba
     SET current_balance = ba.initial_balance + COALESCE((
       SELECT SUM(CASE WHEN m.tipo = 'credito' THEN m.valor ELSE -m.valor END)
         FROM public.movimentacoes m
        WHERE m.conta_bancaria_id = ba.id
     ), 0),
     updated_at = now()
   WHERE ba.company_id = v_hair_id;

  RAISE NOTICE '[4/4] Recalculado current_balance de % contas bancarias', v_contas_hair;

  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE 'RESUMO:';
  RAISE NOTICE '  Bucket 1 (movs orfas):       % deletadas', v_c1_deleted;
  RAISE NOTICE '  Bucket 2 (CRs gemeos):       % CRs + % movs', v_c2_crs_deleted, v_c2_movs_deleted;
  RAISE NOTICE '  Bucket 3 (bt duplicadas):    % deletadas', v_c3_deleted;
  RAISE NOTICE '  Contas c/ saldo recalculado: %', v_contas_hair;
  RAISE NOTICE 'Backup em: backup_hair_movs_%, backup_hair_cr_%, backup_hair_bt_%',
    v_bkp_suffix, v_bkp_suffix, v_bkp_suffix;
  RAISE NOTICE 'CLEANUP HAIR — fim';
  RAISE NOTICE '════════════════════════════════════════════════════════════';
END $$;


-- ============================================================================
-- VERIFICACAO pos-cleanup (rodar separadamente depois do DO block)
-- ============================================================================

-- V1. Conferir que o DFC bate: entradas/saidas/saldo esperados
WITH mov_hair AS (
  SELECT m.* FROM public.movimentacoes m
  INNER JOIN public.companies c ON c.id = m.company_id
  WHERE c.nome_fantasia = 'HAIR OF BRASIL LTDA'
)
SELECT
  (SELECT COUNT(*) FROM mov_hair)                                   AS total_movs,
  (SELECT SUM(valor) FROM mov_hair WHERE tipo = 'credito')           AS total_entradas,
  (SELECT SUM(valor) FROM mov_hair WHERE tipo = 'debito')            AS total_saidas,
  (SELECT COUNT(*) FROM mov_hair m
    WHERE (m.tipo = 'credito' AND m.conta_receber_id IS NULL)
       OR (m.tipo = 'debito'  AND m.conta_pagar_id   IS NULL))       AS orfas_restantes;


-- V2. Conferir grupos duplicados restantes (devia ser bem pouco — so os 100% orfaos)
WITH mov_hair AS (
  SELECT m.* FROM public.movimentacoes m
  INNER JOIN public.companies c ON c.id = m.company_id
  WHERE c.nome_fantasia = 'HAIR OF BRASIL LTDA'
)
SELECT COUNT(*) AS grupos_duplicados_restantes, SUM(qtd) AS linhas_envolvidas
FROM (
  SELECT COUNT(*) AS qtd FROM mov_hair
  GROUP BY data, tipo, valor, descricao
  HAVING COUNT(*) > 1
) x;


-- V3. Conferir current_balance das contas HAIR
SELECT
  ba.name,
  ba.initial_balance,
  ba.current_balance,
  ba.initial_balance + COALESCE((
    SELECT SUM(CASE WHEN m.tipo = 'credito' THEN m.valor ELSE -m.valor END)
      FROM public.movimentacoes m WHERE m.conta_bancaria_id = ba.id
  ), 0) AS saldo_calculado,
  ba.current_balance - (ba.initial_balance + COALESCE((
    SELECT SUM(CASE WHEN m.tipo = 'credito' THEN m.valor ELSE -m.valor END)
      FROM public.movimentacoes m WHERE m.conta_bancaria_id = ba.id
  ), 0)) AS divergencia
FROM public.bank_accounts ba
INNER JOIN public.companies c ON c.id = ba.company_id
WHERE c.nome_fantasia = 'HAIR OF BRASIL LTDA'
ORDER BY ba.name;


-- ============================================================================
-- ROLLBACK manual (se precisar desfazer — usar os nomes reais das tabelas de
-- backup que foram criadas; substituir {SUFFIX} pelo timestamp do log).
--
-- ATENCAO: so funciona se voce ainda NAO deletou as tabelas de backup.
-- ============================================================================

-- -- 1. Restaurar movs
-- DELETE FROM public.movimentacoes
-- WHERE company_id = (SELECT id FROM public.companies WHERE nome_fantasia='HAIR OF BRASIL LTDA');
-- INSERT INTO public.movimentacoes SELECT * FROM public.backup_hair_movs_{SUFFIX};
--
-- -- 2. Restaurar CRs (reverter soft-delete)
-- UPDATE public.contas_receber cr
--    SET deleted_at = b.deleted_at
--   FROM public.backup_hair_cr_{SUFFIX} b
--  WHERE cr.id = b.id;
--
-- -- 3. Restaurar bank_tx
-- INSERT INTO public.bank_transactions
-- SELECT b.* FROM public.backup_hair_bt_{SUFFIX} b
-- WHERE NOT EXISTS (SELECT 1 FROM public.bank_transactions bt WHERE bt.id = b.id);
--
-- -- 4. Recalcular saldo (rodar o mesmo UPDATE de current_balance do DO block)
