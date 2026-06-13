-- ============================================================================
-- AUDIT: duplicatas no historico completo da HAIR OF BRASIL
--
-- 4 tipos de duplicata caçados:
--   A) MOVS com mesma chave (data+valor+descricao+tipo) em 2+ linhas
--   B) CR único com 2+ movimentacoes ativas
--   C) CRs gêmeos (mesmo pagador+valor+venc+pagamento)
--   D) Bank_tx único com 2+ CRs (conciliação rodada 2x)
--
-- E uma seção extra:
--   E) Stone duplo — repasse Stone após venda já registrada (mesmo valor proximo)
--
-- TUDO READ-ONLY. Nenhum DELETE aqui. Use o output pra decidir o cleanup.
-- ============================================================================


-- ┌────────────────────────────────────────────────────────────────────────┐
-- │ TIPO A — Movs com chave duplicada (data + valor + descricao + tipo)    │
-- └────────────────────────────────────────────────────────────────────────┘

WITH dup_movs AS (
  SELECT
    m.data, m.tipo, m.valor, m.descricao,
    COUNT(*)                                              AS qtd,
    COUNT(*) - 1                                          AS excedente,
    (COUNT(*) - 1) * m.valor                              AS inflacao_rs,
    COUNT(DISTINCT m.conta_receber_id)                    AS crs_distintos,
    COUNT(DISTINCT m.conta_pagar_id)                      AS cps_distintos,
    STRING_AGG(DISTINCT COALESCE(m.origem,'(null)'), ',') AS origens,
    STRING_AGG(m.id::text, ',' ORDER BY m.created_at)     AS mov_ids,
    MIN(m.created_at)                                     AS criada_min,
    MAX(m.created_at)                                     AS criada_max
  FROM public.movimentacoes m
  WHERE m.company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7'
  GROUP BY m.data, m.tipo, m.valor, m.descricao
  HAVING COUNT(*) > 1
)
SELECT
  data, tipo, valor,
  LEFT(COALESCE(descricao,'—'), 60) AS descricao_curta,
  qtd, excedente, inflacao_rs, crs_distintos, cps_distintos,
  origens, criada_min, criada_max, mov_ids
FROM dup_movs
ORDER BY data DESC, valor DESC
LIMIT 200;


-- ┌────────────────────────────────────────────────────────────────────────┐
-- │ TIPO B — CR único com 2+ movs (1 CR gerou múltiplas baixas)            │
-- └────────────────────────────────────────────────────────────────────────┘

SELECT
  cr.id AS cr_id,
  cr.data_vencimento,
  cr.data_pagamento,
  cr.valor AS cr_valor,
  cr.valor_pago,
  cr.status,
  LEFT(cr.pagador_nome, 50) AS pagador,
  COUNT(m.id) AS qtd_movs,
  SUM(m.valor) AS soma_movs,
  STRING_AGG(m.id::text, ',' ORDER BY m.created_at) AS mov_ids,
  cr.created_via_bank_tx_id
FROM public.contas_receber cr
INNER JOIN public.movimentacoes m ON m.conta_receber_id = cr.id
WHERE cr.company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7'
  AND cr.deleted_at IS NULL
GROUP BY cr.id, cr.data_vencimento, cr.data_pagamento, cr.valor, cr.valor_pago,
         cr.status, cr.pagador_nome, cr.created_via_bank_tx_id
HAVING COUNT(m.id) > 1
ORDER BY COUNT(m.id) DESC, cr.data_pagamento DESC NULLS LAST
LIMIT 100;


-- Mesma coisa pra CP
SELECT
  cp.id AS cp_id,
  cp.data_vencimento,
  cp.data_pagamento,
  cp.valor AS cp_valor,
  cp.valor_pago,
  cp.status,
  LEFT(cp.credor_nome, 50) AS credor,
  COUNT(m.id) AS qtd_movs,
  SUM(m.valor) AS soma_movs,
  STRING_AGG(m.id::text, ',' ORDER BY m.created_at) AS mov_ids
FROM public.contas_pagar cp
INNER JOIN public.movimentacoes m ON m.conta_pagar_id = cp.id
WHERE cp.company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7'
  AND cp.deleted_at IS NULL
GROUP BY cp.id, cp.data_vencimento, cp.data_pagamento, cp.valor, cp.valor_pago,
         cp.status, cp.credor_nome
HAVING COUNT(m.id) > 1
ORDER BY COUNT(m.id) DESC, cp.data_pagamento DESC NULLS LAST
LIMIT 100;


-- ┌────────────────────────────────────────────────────────────────────────┐
-- │ TIPO C — CRs gêmeos (mesmo pagador + valor + venc + pagamento)         │
-- │ Indica criação manual + automática para o mesmo recebimento            │
-- └────────────────────────────────────────────────────────────────────────┘

SELECT
  cr.pagador_nome,
  cr.valor,
  cr.data_vencimento,
  cr.data_pagamento,
  COUNT(*)                                                     AS qtd_crs,
  COUNT(*) FILTER (WHERE cr.created_via_bank_tx_id IS NOT NULL) AS via_extrato,
  COUNT(*) FILTER (WHERE cr.created_via_bank_tx_id IS NULL)     AS manuais,
  STRING_AGG(cr.id::text, ',' ORDER BY cr.created_at)          AS cr_ids,
  STRING_AGG(cr.status, ',' ORDER BY cr.created_at)            AS status_list
FROM public.contas_receber cr
WHERE cr.company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7'
  AND cr.deleted_at IS NULL
GROUP BY cr.pagador_nome, cr.valor, cr.data_vencimento, cr.data_pagamento
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC, cr.data_pagamento DESC NULLS LAST
LIMIT 100;


-- ┌────────────────────────────────────────────────────────────────────────┐
-- │ TIPO D — Bank_tx único com 2+ CRs vinculados                           │
-- │ Indica conciliação rodada 2x no mesmo lançamento                       │
-- └────────────────────────────────────────────────────────────────────────┘

SELECT
  bt.id                AS bank_tx_id,
  bt.date              AS data_extrato,
  bt.amount            AS valor_extrato,
  LEFT(bt.description, 60) AS descricao_extrato,
  COUNT(cr.id)         AS qtd_crs,
  SUM(cr.valor)        AS soma_crs,
  STRING_AGG(cr.id::text, ',' ORDER BY cr.created_at) AS cr_ids
FROM public.bank_transactions bt
INNER JOIN public.contas_receber cr
       ON cr.created_via_bank_tx_id = bt.id
      AND cr.deleted_at IS NULL
WHERE bt.company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7'
GROUP BY bt.id, bt.date, bt.amount, bt.description
HAVING COUNT(cr.id) > 1
ORDER BY bt.date DESC
LIMIT 100;


-- ┌────────────────────────────────────────────────────────────────────────┐
-- │ TIPO E — Stone repasse vs venda original (possível dupla contagem)     │
-- │ Para cada mov categoria 1.3.01 (Stone), busca outra mov de venda       │
-- │ com mesmo valor nos 7 dias anteriores (taxa Stone ~3-5%, pode variar). │
-- │ Mostra candidatos pra revisão MANUAL — não é dedup automático.         │
-- └────────────────────────────────────────────────────────────────────────┘

WITH stone_id AS (
  SELECT id FROM public.chart_of_accounts
   WHERE company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7' AND code = '1.3.01'
),
mov_stone AS (
  SELECT m.id, m.data, m.valor, m.descricao
    FROM public.movimentacoes m
   WHERE m.company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7'
     AND m.tipo = 'credito'
     AND m.conta_contabil_id = (SELECT id FROM stone_id)
),
mov_venda AS (
  SELECT m.id, m.data, m.valor, m.descricao, coa.code AS cat_code
    FROM public.movimentacoes m
    LEFT JOIN public.chart_of_accounts coa ON coa.id = m.conta_contabil_id
   WHERE m.company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7'
     AND m.tipo = 'credito'
     AND coa.code IN ('1.1.01','1.1.02','1.1.03','1.1.04','1.2.01','1.2.03')
)
SELECT
  s.id   AS stone_mov_id,
  s.data AS stone_data,
  s.valor AS stone_valor,
  LEFT(s.descricao, 50) AS stone_desc,
  v.id   AS venda_mov_id,
  v.data AS venda_data,
  v.valor AS venda_valor,
  v.cat_code AS venda_cat,
  LEFT(v.descricao, 50) AS venda_desc,
  s.data - v.data AS dias_entre
FROM mov_stone s
INNER JOIN mov_venda v
  ON v.data BETWEEN s.data - INTERVAL '7 days' AND s.data
 AND ABS(s.valor - v.valor) < (v.valor * 0.05)  -- tolera ate 5% taxa Stone
WHERE s.data >= '2026-01-01'
ORDER BY s.data DESC, s.valor DESC
LIMIT 100;


-- ┌────────────────────────────────────────────────────────────────────────┐
-- │ RESUMO — quanto R$ está inflado por cada tipo                          │
-- └────────────────────────────────────────────────────────────────────────┘

WITH
tipo_a AS (
  SELECT
    COUNT(*) AS grupos,
    SUM(COUNT(*) - 1) OVER () AS linhas_excedentes,
    SUM((COUNT(*) - 1) * m.valor) OVER () AS inflacao
  FROM public.movimentacoes m
  WHERE m.company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7'
  GROUP BY m.data, m.tipo, m.valor, m.descricao
  HAVING COUNT(*) > 1
  LIMIT 1
),
tipo_b_cr AS (
  SELECT COUNT(*) AS crs, SUM(qtd_movs - 1) AS movs_excedentes
  FROM (
    SELECT cr.id, COUNT(m.id) AS qtd_movs
    FROM public.contas_receber cr
    INNER JOIN public.movimentacoes m ON m.conta_receber_id = cr.id
    WHERE cr.company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7'
      AND cr.deleted_at IS NULL
    GROUP BY cr.id HAVING COUNT(m.id) > 1
  ) x
),
tipo_c AS (
  SELECT COUNT(*) AS grupos, SUM(qtd - 1) AS crs_excedentes,
         SUM((qtd - 1) * valor) AS inflacao
  FROM (
    SELECT pagador_nome, valor, data_vencimento, data_pagamento, COUNT(*) AS qtd
    FROM public.contas_receber
    WHERE company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7'
      AND deleted_at IS NULL
    GROUP BY pagador_nome, valor, data_vencimento, data_pagamento
    HAVING COUNT(*) > 1
  ) y
),
tipo_d AS (
  SELECT COUNT(*) AS bank_txs, SUM(qtd_crs - 1) AS crs_excedentes
  FROM (
    SELECT bt.id, COUNT(cr.id) AS qtd_crs
    FROM public.bank_transactions bt
    INNER JOIN public.contas_receber cr
           ON cr.created_via_bank_tx_id = bt.id AND cr.deleted_at IS NULL
    WHERE bt.company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7'
    GROUP BY bt.id HAVING COUNT(cr.id) > 1
  ) z
)
SELECT
  'A. Movs com chave duplicada'         AS tipo,
  (SELECT grupos FROM tipo_a)           AS grupos,
  (SELECT linhas_excedentes FROM tipo_a) AS excedente,
  (SELECT inflacao FROM tipo_a)         AS inflacao_rs
UNION ALL
SELECT
  'B. CR com 2+ movs',
  (SELECT crs FROM tipo_b_cr),
  (SELECT movs_excedentes FROM tipo_b_cr),
  NULL
UNION ALL
SELECT
  'C. CRs gemeos',
  (SELECT grupos FROM tipo_c),
  (SELECT crs_excedentes FROM tipo_c),
  (SELECT inflacao FROM tipo_c)
UNION ALL
SELECT
  'D. Bank_tx com 2+ CRs',
  (SELECT bank_txs FROM tipo_d),
  (SELECT crs_excedentes FROM tipo_d),
  NULL;
