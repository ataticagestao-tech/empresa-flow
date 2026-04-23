-- ============================================================================
-- DRY-RUN: cleanup de duplicatas da HAIR OF BRASIL LTDA (READ-ONLY)
--
-- Diagnostico (ver audit_hair_movimentacoes_duplicadas.sql):
--   B1) Movs orfas "Recbto:" criadas pela migration 20260319130000 +
--       backfill 20260407120000 (migration criou mov orfa sem CR; backfill
--       depois criou mov nova com CR vinculado, sem dedup).
--   B2) CRs gemeos no fluxo atual (ex: Victor Natalicio, R$ 14.300 = 4 CRs).
--   B3) 3 bank_transactions duplicadas (impacto pequeno).
--
-- Este dry-run CONTA o que seria removido — nenhuma query altera dados.
-- ============================================================================


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  A — Bucket 1: Movs orfas com irmao CR vinculado (seguro pra deletar)   │
-- │                                                                         │
-- │  Regra: DELETE mov WHERE conta_receber_id IS NULL                       │
-- │    AND existe outra mov no mesmo (company, data, valor, tipo)           │
-- │    com conta_receber_id IS NOT NULL                                     │
-- │                                                                         │
-- │  Justificativa: a mov "verdadeira" e a que ficou vinculada ao CR        │
-- │  pelo backfill; a orfa e legacy da migracao antiga.                     │
-- └─────────────────────────────────────────────────────────────────────────┘

-- A1 — Contagem e impacto financeiro
WITH mov_hair AS (
  SELECT m.*
  FROM public.movimentacoes m
  INNER JOIN public.companies c ON c.id = m.company_id
  WHERE c.nome_fantasia = 'HAIR OF BRASIL LTDA'
),
grupos_com_cr AS (
  -- Chaves (company, data, valor, tipo) que tem PELO MENOS uma mov com CR
  SELECT DISTINCT company_id, data, valor, tipo
  FROM mov_hair
  WHERE (tipo = 'credito' AND conta_receber_id IS NOT NULL)
     OR (tipo = 'debito'  AND conta_pagar_id   IS NOT NULL)
),
orfas_com_sibling AS (
  -- Orfas que tem irmao com CR/CP no mesmo grupo
  SELECT m.*
  FROM mov_hair m
  INNER JOIN grupos_com_cr g
    ON g.company_id = m.company_id
   AND g.data = m.data
   AND g.valor = m.valor
   AND g.tipo = m.tipo
  WHERE (m.tipo = 'credito' AND m.conta_receber_id IS NULL)
     OR (m.tipo = 'debito'  AND m.conta_pagar_id   IS NULL)
)
SELECT
  COUNT(*)                                         AS movs_a_deletar,
  SUM(valor) FILTER (WHERE tipo = 'credito')       AS r_removido_entradas,
  SUM(valor) FILTER (WHERE tipo = 'debito')        AS r_removido_saidas,
  COUNT(*) FILTER (WHERE origem = 'manual')        AS das_quais_manual,
  COUNT(*) FILTER (WHERE origem IS DISTINCT FROM 'manual') AS das_quais_outras,
  STRING_AGG(DISTINCT COALESCE(origem, '(null)'), ', ') AS origens_envolvidas
FROM orfas_com_sibling;


-- A2 — Amostra dos 20 maiores grupos (pra revisar antes de executar)
WITH mov_hair AS (
  SELECT m.*
  FROM public.movimentacoes m
  INNER JOIN public.companies c ON c.id = m.company_id
  WHERE c.nome_fantasia = 'HAIR OF BRASIL LTDA'
)
SELECT
  m.data,
  m.tipo,
  m.valor,
  LEFT(COALESCE(m.descricao, '—'), 60) AS descricao,
  COUNT(*) FILTER (WHERE m.conta_receber_id IS NOT NULL OR m.conta_pagar_id IS NOT NULL) AS mantidas_com_fk,
  COUNT(*) FILTER (WHERE (m.tipo='credito' AND m.conta_receber_id IS NULL)
                     OR  (m.tipo='debito'  AND m.conta_pagar_id   IS NULL)) AS orfas_a_deletar,
  STRING_AGG(
    m.id::text || ' [' || COALESCE(m.origem, '(null)') || (
      CASE WHEN m.conta_receber_id IS NOT NULL THEN ' CR✓'
           WHEN m.conta_pagar_id   IS NOT NULL THEN ' CP✓'
           ELSE ' ORFA' END
    ) || ']',
    ', ' ORDER BY m.created_at
  ) AS movs_detalhe
FROM mov_hair m
WHERE EXISTS (
  SELECT 1 FROM mov_hair x
  WHERE x.company_id = m.company_id
    AND x.data = m.data
    AND x.valor = m.valor
    AND x.tipo = m.tipo
    AND ((x.tipo = 'credito' AND x.conta_receber_id IS NOT NULL)
      OR (x.tipo = 'debito'  AND x.conta_pagar_id   IS NOT NULL))
) AND EXISTS (
  SELECT 1 FROM mov_hair y
  WHERE y.company_id = m.company_id
    AND y.data = m.data
    AND y.valor = m.valor
    AND y.tipo = m.tipo
    AND ((y.tipo = 'credito' AND y.conta_receber_id IS NULL)
      OR (y.tipo = 'debito'  AND y.conta_pagar_id   IS NULL))
)
GROUP BY m.data, m.tipo, m.valor, m.descricao
ORDER BY COUNT(*) FILTER (WHERE (m.tipo='credito' AND m.conta_receber_id IS NULL)
                             OR (m.tipo='debito'  AND m.conta_pagar_id   IS NULL)) DESC
LIMIT 20;


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  B — Grupos 100% orfaos (SEM irmao com CR) — REQUER REVISAO MANUAL      │
-- │  Se todas as movs de um (data, valor, tipo) sao orfas, nao da pra       │
-- │  saber qual e "a verdadeira" sem abrir o extrato. Lista pra decisao.   │
-- └─────────────────────────────────────────────────────────────────────────┘

WITH mov_hair AS (
  SELECT m.*
  FROM public.movimentacoes m
  INNER JOIN public.companies c ON c.id = m.company_id
  WHERE c.nome_fantasia = 'HAIR OF BRASIL LTDA'
)
SELECT
  m.data,
  m.tipo,
  m.valor,
  LEFT(COALESCE(m.descricao, '—'), 60) AS descricao,
  COUNT(*) AS qtd_orfas,
  STRING_AGG(m.id::text, ', ' ORDER BY m.created_at) AS mov_ids
FROM mov_hair m
WHERE (m.tipo = 'credito' AND m.conta_receber_id IS NULL)
   OR (m.tipo = 'debito'  AND m.conta_pagar_id   IS NULL)
  AND NOT EXISTS (
    SELECT 1 FROM mov_hair x
    WHERE x.company_id = m.company_id
      AND x.data = m.data
      AND x.valor = m.valor
      AND x.tipo = m.tipo
      AND ((x.tipo = 'credito' AND x.conta_receber_id IS NOT NULL)
        OR (x.tipo = 'debito'  AND x.conta_pagar_id   IS NOT NULL))
  )
GROUP BY m.data, m.tipo, m.valor, m.descricao
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC
LIMIT 30;


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  C — Bucket 2: CRs gemeos (Victor Natalicio etc)                         │
-- │                                                                         │
-- │  Regra: para cada grupo (pagador, valor, data_vencimento,               │
-- │  data_pagamento) com 2+ CRs ATIVOS:                                     │
-- │    MANTER o CR mais antigo (menor created_at)                           │
-- │    SOFT-DELETE os demais (UPDATE deleted_at = now())                    │
-- │    HARD-DELETE as movs vinculadas aos CRs removidos                     │
-- │                                                                         │
-- │  Alternativa: manter o que tem created_via_bank_tx_id preenchido        │
-- │  (veio de bank_tx real). Veja abaixo para decidir.                      │
-- └─────────────────────────────────────────────────────────────────────────┘

-- C1 — Resumo: quantos CRs seriam soft-deleted + quantas movs hard-deleted
WITH cr_hair AS (
  SELECT cr.*, c.nome_fantasia
  FROM public.contas_receber cr
  INNER JOIN public.companies c ON c.id = cr.company_id
  WHERE c.nome_fantasia = 'HAIR OF BRASIL LTDA'
    AND cr.deleted_at IS NULL
),
grupos AS (
  SELECT
    pagador_nome, valor, data_vencimento, data_pagamento,
    COUNT(*) AS qtd
  FROM cr_hair
  GROUP BY pagador_nome, valor, data_vencimento, data_pagamento
  HAVING COUNT(*) > 1
)
SELECT
  COUNT(*)                              AS grupos_gemeos,
  SUM(qtd)                              AS crs_total,
  SUM(qtd - 1)                          AS crs_a_soft_deletar,
  SUM((qtd - 1) * valor)                AS r_removido_crs
FROM grupos;


-- C2 — Amostra dos 20 maiores grupos + decisao (manter mais antigo)
WITH cr_hair AS (
  SELECT cr.*
  FROM public.contas_receber cr
  INNER JOIN public.companies c ON c.id = cr.company_id
  WHERE c.nome_fantasia = 'HAIR OF BRASIL LTDA'
    AND cr.deleted_at IS NULL
),
ranked AS (
  SELECT
    cr.*,
    ROW_NUMBER() OVER (
      PARTITION BY pagador_nome, valor, data_vencimento, data_pagamento
      ORDER BY
        (created_via_bank_tx_id IS NOT NULL) DESC,  -- prefere com bank_tx
        created_at ASC                                -- depois o mais antigo
    ) AS rn,
    COUNT(*) OVER (
      PARTITION BY pagador_nome, valor, data_vencimento, data_pagamento
    ) AS total_no_grupo
  FROM cr_hair cr
)
SELECT
  pagador_nome                                        AS pagador,
  valor,
  data_vencimento,
  data_pagamento,
  total_no_grupo,
  STRING_AGG(
    id::text || CASE WHEN rn = 1 THEN ' [MANTER]' ELSE ' [DEL]' END
    || ' (criado ' || created_at::date
    || COALESCE(' / bt=' || created_via_bank_tx_id::text, '')
    || ')',
    E'\n' ORDER BY rn
  ) AS decisao
FROM ranked
WHERE total_no_grupo > 1
GROUP BY pagador_nome, valor, data_vencimento, data_pagamento, total_no_grupo
ORDER BY total_no_grupo DESC, valor DESC
LIMIT 20;


-- C3 — Quantas movs hard-deletar (as que apontam pros CRs que serao soft-deletados)
WITH cr_hair AS (
  SELECT cr.*
  FROM public.contas_receber cr
  INNER JOIN public.companies c ON c.id = cr.company_id
  WHERE c.nome_fantasia = 'HAIR OF BRASIL LTDA'
    AND cr.deleted_at IS NULL
),
ranked AS (
  SELECT cr.id, cr.valor, ROW_NUMBER() OVER (
    PARTITION BY pagador_nome, valor, data_vencimento, data_pagamento
    ORDER BY (created_via_bank_tx_id IS NOT NULL) DESC, created_at ASC
  ) AS rn
  FROM cr_hair cr
),
crs_a_deletar AS (
  SELECT id, valor FROM ranked WHERE rn > 1
)
SELECT
  COUNT(m.id)                       AS movs_a_hard_deletar,
  SUM(m.valor) FILTER (WHERE m.tipo = 'credito') AS r_removido_mov_entradas,
  SUM(m.valor) FILTER (WHERE m.tipo = 'debito')  AS r_removido_mov_saidas
FROM public.movimentacoes m
INNER JOIN crs_a_deletar d ON d.id = m.conta_receber_id;


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  D — Bucket 3: bank_transactions duplicadas                             │
-- │  3 grupos conhecidos. Manter o que tem reconciled_* preenchido,         │
-- │  deletar os demais se nao tiverem FK.                                   │
-- └─────────────────────────────────────────────────────────────────────────┘

SELECT
  bt.id,
  bt.date,
  bt.amount,
  LEFT(bt.description, 60) AS descricao,
  bt.status,
  bt.reconciled_receivable_id IS NOT NULL AS tem_cr_match,
  bt.reconciled_payable_id    IS NOT NULL AS tem_cp_match,
  (SELECT COUNT(*) FROM public.contas_receber cr
    WHERE cr.created_via_bank_tx_id = bt.id AND cr.deleted_at IS NULL) AS crs_criados,
  (SELECT COUNT(*) FROM public.contas_pagar cp
    WHERE cp.created_via_bank_tx_id = bt.id AND cp.deleted_at IS NULL) AS cps_criados
FROM public.bank_transactions bt
INNER JOIN public.companies c ON c.id = bt.company_id
WHERE c.nome_fantasia = 'HAIR OF BRASIL LTDA'
  AND bt.id IN (
    'dd901fa3-3ada-467b-b819-58bf8cf7c774', 'c8438eeb-69bb-4b3a-8e6b-3b584ae1d131',
    'f6f5a418-2461-4538-9ebb-9537b1eb6c18', 'c7db570f-a8ef-408c-a749-5ce5316bab47',
    '1d2b9972-1d88-45f3-9092-d2df4c896d48', '0f9221f2-0c7f-4a59-a68f-6724b8d65b0d'
  )
ORDER BY bt.date, bt.amount, bt.id;


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  E — Totais gerais do cleanup                                           │
-- │  Quanto o DFC vai "emagrecer" depois de executar.                       │
-- └─────────────────────────────────────────────────────────────────────────┘

WITH mov_hair AS (
  SELECT m.*
  FROM public.movimentacoes m
  INNER JOIN public.companies c ON c.id = m.company_id
  WHERE c.nome_fantasia = 'HAIR OF BRASIL LTDA'
),
orfas_safe AS (
  SELECT m.*
  FROM mov_hair m
  WHERE ((m.tipo = 'credito' AND m.conta_receber_id IS NULL)
      OR (m.tipo = 'debito'  AND m.conta_pagar_id   IS NULL))
    AND EXISTS (
      SELECT 1 FROM mov_hair x
      WHERE x.company_id = m.company_id AND x.data = m.data
        AND x.valor = m.valor AND x.tipo = m.tipo
        AND ((x.tipo = 'credito' AND x.conta_receber_id IS NOT NULL)
          OR (x.tipo = 'debito'  AND x.conta_pagar_id   IS NOT NULL))
    )
),
cr_hair AS (
  SELECT cr.*
  FROM public.contas_receber cr
  INNER JOIN public.companies c ON c.id = cr.company_id
  WHERE c.nome_fantasia = 'HAIR OF BRASIL LTDA'
    AND cr.deleted_at IS NULL
),
ranked_cr AS (
  SELECT cr.id, ROW_NUMBER() OVER (
    PARTITION BY pagador_nome, valor, data_vencimento, data_pagamento
    ORDER BY (created_via_bank_tx_id IS NOT NULL) DESC, created_at ASC
  ) AS rn
  FROM cr_hair cr
),
movs_de_crs_deletados AS (
  SELECT m.* FROM public.movimentacoes m
  INNER JOIN ranked_cr r ON r.id = m.conta_receber_id
  WHERE r.rn > 1
)
SELECT
  (SELECT COUNT(*) FROM orfas_safe)                                AS bucket1_movs_deletadas,
  (SELECT SUM(valor) FROM orfas_safe WHERE tipo='credito')         AS bucket1_r_entradas,
  (SELECT SUM(valor) FROM orfas_safe WHERE tipo='debito')          AS bucket1_r_saidas,
  (SELECT COUNT(*) FROM ranked_cr WHERE rn > 1)                    AS bucket2_crs_soft_deletados,
  (SELECT COUNT(*) FROM movs_de_crs_deletados)                     AS bucket2_movs_hard_deletadas,
  (SELECT SUM(valor) FROM movs_de_crs_deletados WHERE tipo='credito') AS bucket2_r_entradas,
  (SELECT SUM(valor) FROM movs_de_crs_deletados WHERE tipo='debito')  AS bucket2_r_saidas;
