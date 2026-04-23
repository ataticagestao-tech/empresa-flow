-- ============================================================================
-- CLEANUP GLOBAL HAIR — bank_transactions como fonte da verdade
--
-- Passo 1: Deduplica por bt — pra cada bank_tx com 2+ movs, mantem 1
--          (prefere a com CR/CP vinculado; empate: mais antiga).
-- Passo 2: Deduplica ghosts identicos — agrupa por
--          (conta_bancaria, data, valor, tipo, descricao). Se 2+ linhas
--          iguais, mantem 1 (mais antiga). Linhas unicas nao sao tocadas.
-- Passo 3: Soft-delete CRs/CPs que ficaram sem mov ativa E nao tem
--          bank_tx correspondente.
-- Passo 4: Recalcula current_balance das contas da HAIR.
--
-- Exclui Caixa Fisico e origem=transferencia. Tudo atomico (DO block).
-- ============================================================================

DO $$
DECLARE
  v_bkp TEXT := to_char(now(), 'YYYYMMDD_HH24MI');
  v_hair UUID;
  v_p1 INT;
  v_p2 INT;
  v_p3_cr INT;
  v_p3_cp INT;
  v_contas INT;
BEGIN
  SELECT id INTO v_hair FROM public.companies WHERE nome_fantasia = 'HAIR OF BRASIL LTDA';

  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE 'CLEANUP GLOBAL HAIR (suffix %)', v_bkp;
  RAISE NOTICE '════════════════════════════════════════';

  -- ─── 0. Backup das 3 tabelas ─────────────────────────────
  EXECUTE format(
    'CREATE TABLE public.backup_hair_global_movs_%s AS
     SELECT * FROM public.movimentacoes WHERE company_id = %L',
    v_bkp, v_hair
  );
  EXECUTE format(
    'CREATE TABLE public.backup_hair_global_cr_%s AS
     SELECT * FROM public.contas_receber WHERE company_id = %L',
    v_bkp, v_hair
  );
  EXECUTE format(
    'CREATE TABLE public.backup_hair_global_cp_%s AS
     SELECT * FROM public.contas_pagar WHERE company_id = %L',
    v_bkp, v_hair
  );
  RAISE NOTICE '[0] Backups criados: backup_hair_global_{movs,cr,cp}_%', v_bkp;

  -- ─── 1. Deduplica por bt ─────────────────────────────────
  WITH contas_reais AS (
    SELECT ba.id
    FROM public.bank_accounts ba
    WHERE ba.company_id = v_hair AND ba.name NOT ILIKE '%caixa%'
  ),
  mov_match AS (
    SELECT m.id, m.conta_receber_id, m.conta_pagar_id, m.created_at,
      (SELECT bt.id FROM public.bank_transactions bt
        WHERE bt.bank_account_id = m.conta_bancaria_id
          AND bt.date = m.data AND ABS(bt.amount) = m.valor
          AND CASE WHEN bt.amount >= 0 THEN 'credito' ELSE 'debito' END = m.tipo
        LIMIT 1) AS bt_id
    FROM public.movimentacoes m
    WHERE m.conta_bancaria_id IN (SELECT id FROM contas_reais)
      AND m.origem <> 'transferencia'
  ),
  ranked AS (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY bt_id
        ORDER BY
          (conta_receber_id IS NOT NULL OR conta_pagar_id IS NOT NULL) DESC,
          created_at ASC
      ) AS rn
    FROM mov_match WHERE bt_id IS NOT NULL
  ),
  p1_delete AS (SELECT id FROM ranked WHERE rn > 1)
  DELETE FROM public.movimentacoes m
  USING p1_delete d
  WHERE m.id = d.id;

  GET DIAGNOSTICS v_p1 = ROW_COUNT;
  RAISE NOTICE '[1] Duplicatas por bt deletadas: %', v_p1;

  -- ─── 2. Deduplica ghosts identicos ───────────────────────
  WITH contas_reais AS (
    SELECT ba.id FROM public.bank_accounts ba
    WHERE ba.company_id = v_hair AND ba.name NOT ILIKE '%caixa%'
  ),
  mov_match AS (
    SELECT m.*,
      (SELECT bt.id FROM public.bank_transactions bt
        WHERE bt.bank_account_id = m.conta_bancaria_id
          AND bt.date = m.data AND ABS(bt.amount) = m.valor
          AND CASE WHEN bt.amount >= 0 THEN 'credito' ELSE 'debito' END = m.tipo
        LIMIT 1) AS bt_id
    FROM public.movimentacoes m
    WHERE m.conta_bancaria_id IN (SELECT id FROM contas_reais)
      AND m.origem <> 'transferencia'
  ),
  ghost_ranked AS (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY conta_bancaria_id, data, valor, tipo, descricao
        ORDER BY
          (conta_receber_id IS NOT NULL OR conta_pagar_id IS NOT NULL) DESC,
          created_at ASC
      ) AS rn,
      COUNT(*) OVER (
        PARTITION BY conta_bancaria_id, data, valor, tipo, descricao
      ) AS total
    FROM mov_match WHERE bt_id IS NULL
  ),
  p2_delete AS (SELECT id FROM ghost_ranked WHERE rn > 1 AND total > 1)
  DELETE FROM public.movimentacoes m
  USING p2_delete d
  WHERE m.id = d.id;

  GET DIAGNOSTICS v_p2 = ROW_COUNT;
  RAISE NOTICE '[2] Ghosts duplicados deletados: %', v_p2;

  -- ─── 3. Soft-delete CRs/CPs que ficaram orfas de mov ─────
  -- Criterio: CR (pago/conciliado, sem venda_id/contrato) sem mov ativa E
  -- sem bank_tx real correspondente (via created_via_bank_tx_id ou brm)
  WITH crs_orfaos AS (
    SELECT cr.id
    FROM public.contas_receber cr
    WHERE cr.company_id = v_hair
      AND cr.deleted_at IS NULL
      AND cr.status IN ('pago', 'conciliado', 'parcial')
      AND NOT EXISTS (SELECT 1 FROM public.movimentacoes m WHERE m.conta_receber_id = cr.id)
      AND (cr.created_via_bank_tx_id IS NULL
           OR NOT EXISTS (SELECT 1 FROM public.bank_transactions bt WHERE bt.id = cr.created_via_bank_tx_id))
      AND NOT EXISTS (
        SELECT 1 FROM public.bank_reconciliation_matches brm
        WHERE brm.receivable_id = cr.id AND brm.bank_transaction_id IS NOT NULL
      )
  )
  UPDATE public.contas_receber cr
     SET deleted_at = now()
    FROM crs_orfaos o
   WHERE cr.id = o.id;

  GET DIAGNOSTICS v_p3_cr = ROW_COUNT;

  WITH cps_orfaos AS (
    SELECT cp.id
    FROM public.contas_pagar cp
    WHERE cp.company_id = v_hair
      AND cp.deleted_at IS NULL
      AND cp.status IN ('pago', 'conciliado', 'parcial')
      AND NOT EXISTS (SELECT 1 FROM public.movimentacoes m WHERE m.conta_pagar_id = cp.id)
      AND (cp.created_via_bank_tx_id IS NULL
           OR NOT EXISTS (SELECT 1 FROM public.bank_transactions bt WHERE bt.id = cp.created_via_bank_tx_id))
      AND NOT EXISTS (
        SELECT 1 FROM public.bank_reconciliation_matches brm
        WHERE brm.payable_id = cp.id AND brm.bank_transaction_id IS NOT NULL
      )
  )
  UPDATE public.contas_pagar cp
     SET deleted_at = now()
    FROM cps_orfaos o
   WHERE cp.id = o.id;

  GET DIAGNOSTICS v_p3_cp = ROW_COUNT;
  RAISE NOTICE '[3] CRs soft-deletados: %, CPs soft-deletados: %', v_p3_cr, v_p3_cp;

  -- ─── 4. Recalcular current_balance ───────────────────────
  SELECT COUNT(*) INTO v_contas
    FROM public.bank_accounts WHERE company_id = v_hair;

  UPDATE public.bank_accounts ba
     SET current_balance = ba.initial_balance + COALESCE((
       SELECT SUM(CASE WHEN m.tipo='credito' THEN m.valor ELSE -m.valor END)
         FROM public.movimentacoes m WHERE m.conta_bancaria_id = ba.id
     ), 0),
     updated_at = now()
   WHERE ba.company_id = v_hair;

  RAISE NOTICE '[4] Saldos recalculados: % contas', v_contas;

  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE 'RESUMO: P1=%  P2=%  CR=%  CP=%  Contas=%',
    v_p1, v_p2, v_p3_cr, v_p3_cp, v_contas;
  RAISE NOTICE 'Backups: backup_hair_global_{movs,cr,cp}_%', v_bkp;
  RAISE NOTICE '════════════════════════════════════════';
END $$;


-- ============================================================================
-- Verificacoes pos-cleanup (rodar depois)
-- ============================================================================

-- V1. Ghosts duplicados restantes (deveria ser 0)
WITH contas_reais AS (
  SELECT ba.id FROM public.bank_accounts ba
  INNER JOIN public.companies c ON c.id = ba.company_id
  WHERE c.nome_fantasia = 'HAIR OF BRASIL LTDA' AND ba.name NOT ILIKE '%caixa%'
),
mov_match AS (
  SELECT m.*,
    (SELECT bt.id FROM public.bank_transactions bt
      WHERE bt.bank_account_id = m.conta_bancaria_id
        AND bt.date = m.data AND ABS(bt.amount) = m.valor
        AND CASE WHEN bt.amount >= 0 THEN 'credito' ELSE 'debito' END = m.tipo
      LIMIT 1) AS bt_id
  FROM public.movimentacoes m
  WHERE m.conta_bancaria_id IN (SELECT id FROM contas_reais)
    AND m.origem <> 'transferencia'
)
SELECT
  'duplicatas_bt_restantes' AS metrica,
  COUNT(*) - COUNT(DISTINCT bt_id) AS valor
FROM mov_match WHERE bt_id IS NOT NULL
UNION ALL
SELECT
  'ghosts_duplicados_restantes',
  COUNT(*) FILTER (WHERE rn > 1) FROM (
    SELECT ROW_NUMBER() OVER (
      PARTITION BY conta_bancaria_id, data, valor, tipo, descricao
    ) AS rn FROM mov_match WHERE bt_id IS NULL
  ) x;


-- V2. Saldo esperado vs real
SELECT
  ba.name,
  ba.current_balance,
  ba.initial_balance + COALESCE((
    SELECT SUM(CASE WHEN m.tipo='credito' THEN m.valor ELSE -m.valor END)
      FROM public.movimentacoes m WHERE m.conta_bancaria_id = ba.id
  ), 0) AS saldo_calc,
  ba.current_balance - (ba.initial_balance + COALESCE((
    SELECT SUM(CASE WHEN m.tipo='credito' THEN m.valor ELSE -m.valor END)
      FROM public.movimentacoes m WHERE m.conta_bancaria_id = ba.id
  ), 0)) AS divergencia
FROM public.bank_accounts ba
INNER JOIN public.companies c ON c.id = ba.company_id
WHERE c.nome_fantasia = 'HAIR OF BRASIL LTDA'
ORDER BY ba.name;


-- V3. Ghosts unicos restantes (sem duplicata; ficam vivos pra revisao manual)
WITH contas_reais AS (
  SELECT ba.id FROM public.bank_accounts ba
  INNER JOIN public.companies c ON c.id = ba.company_id
  WHERE c.nome_fantasia = 'HAIR OF BRASIL LTDA' AND ba.name NOT ILIKE '%caixa%'
)
SELECT
  COUNT(*) AS ghosts_unicos_restantes,
  SUM(valor) FILTER (WHERE tipo='credito') AS r_entradas,
  SUM(valor) FILTER (WHERE tipo='debito')  AS r_saidas
FROM public.movimentacoes m
WHERE m.conta_bancaria_id IN (SELECT id FROM contas_reais)
  AND m.origem <> 'transferencia'
  AND NOT EXISTS (
    SELECT 1 FROM public.bank_transactions bt
    WHERE bt.bank_account_id = m.conta_bancaria_id
      AND bt.date = m.data AND ABS(bt.amount) = m.valor
      AND CASE WHEN bt.amount >= 0 THEN 'credito' ELSE 'debito' END = m.tipo
  );
