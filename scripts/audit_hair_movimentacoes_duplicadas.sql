-- ============================================================================
-- AUDIT: movimentacoes DUPLICADAS na HAIR OF BRASIL
--
-- Motivacao: tela DFC / Relatorio de Fluxo mostra 3x "Recebimento —
-- Victor Natalicio Germano" R$ 14.300 em 2026-04-14, 2x Joao Paulo
-- Pereira, 2x Felipe Garcia Cruz, etc. Essa tela le direto de
-- `movimentacoes` via fn_relatorio_fluxo — ou seja, existem 3 linhas
-- distintas em movimentacoes para o mesmo fato economico.
--
-- Hipoteses a diferenciar:
--   H1) CR duplicado (2+ CRs pro mesmo recebimento) — cada CR gerou 1 mov
--   H2) CR unico mas a baixa inseriu mov multiplas vezes (bug de insert)
--   H3) Mesma bank_transaction gerou 2+ CRs ou 2+ movs
--   H4) Conciliacao criou mov nova sem detectar a mov manual ja existente
--
-- Todas as queries sao READ-ONLY.
-- ============================================================================


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  SECAO 1 — Grupos de movimentacoes duplicadas na HAIR                    │
-- │  Chave: (data, valor, descricao, tipo). Se 2+ linhas tem mesma chave,   │
-- │  sao candidatas a duplicata. Mostra conta_receber_id de cada para       │
-- │  diferenciar H1 (CR ids diferentes) de H2 (CR id repetido/nulo).        │
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
  LEFT(COALESCE(m.descricao, '—'), 60)           AS descricao,
  COUNT(*)                                        AS qtd_linhas,
  COUNT(DISTINCT m.conta_receber_id)              AS crs_distintos,
  COUNT(DISTINCT m.conta_pagar_id)                AS cps_distintos,
  COUNT(*) FILTER (WHERE m.conta_receber_id IS NULL AND m.tipo = 'credito') AS creditos_sem_cr,
  COUNT(*) FILTER (WHERE m.conta_pagar_id IS NULL AND m.tipo = 'debito')    AS debitos_sem_cp,
  STRING_AGG(DISTINCT COALESCE(m.origem, '(null)'), ', ')                   AS origens,
  STRING_AGG(m.id::text, ', ' ORDER BY m.created_at)                        AS mov_ids,
  MIN(m.created_at)                               AS criado_min,
  MAX(m.created_at)                               AS criado_max
FROM mov_hair m
GROUP BY m.data, m.tipo, m.valor, m.descricao
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC, m.data DESC
LIMIT 100;


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  SECAO 2 — Zoom: as 3 suspeitas visiveis no print                        │
-- │  Victor Natalicio Germano / Joao Paulo Pereira / Felipe Garcia Cruz.    │
-- │  Mostra cada mov + CR correspondente (se houver) + origem.              │
-- └─────────────────────────────────────────────────────────────────────────┘

SELECT
  m.id                             AS mov_id,
  m.data,
  m.tipo,
  m.valor,
  m.descricao,
  m.origem,
  m.status_conciliacao,
  m.conta_receber_id,
  cr.status                        AS cr_status,
  cr.valor_pago                    AS cr_valor_pago,
  cr.pagador_nome                  AS cr_pagador,
  cr.created_via_bank_tx_id        AS cr_veio_do_extrato,
  m.created_at                     AS mov_criada_em,
  cr.created_at                    AS cr_criado_em
FROM public.movimentacoes m
INNER JOIN public.companies c  ON c.id = m.company_id
LEFT  JOIN public.contas_receber cr ON cr.id = m.conta_receber_id
WHERE c.nome_fantasia = 'HAIR OF BRASIL LTDA'
  AND m.data BETWEEN '2026-04-13' AND '2026-04-15'
  AND (
       m.descricao ILIKE '%Victor Natalicio%'
    OR m.descricao ILIKE '%Jo_o Paulo Pereira%'
    OR m.descricao ILIKE '%Joao Paulo Pereira%'
    OR m.descricao ILIKE '%Felipe Garcia Cruz%'
  )
ORDER BY m.data, m.descricao, m.created_at;


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  SECAO 3 — CRs da HAIR com 2+ movimentacoes ativas                       │
-- │  Se 1 CR tem 2+ movs, e bug de insert (H2) ou reconciliacao duplicada   │
-- │  (H4). Idealmente cada CR deveria ter no maximo 1 mov por baixa.        │
-- └─────────────────────────────────────────────────────────────────────────┘

SELECT
  cr.id                              AS cr_id,
  cr.status                          AS cr_status,
  cr.valor                           AS cr_valor,
  cr.valor_pago                      AS cr_valor_pago,
  cr.pagador_nome                    AS pagador,
  cr.data_vencimento,
  cr.data_pagamento,
  cr.created_via_bank_tx_id          AS veio_do_extrato,
  COUNT(m.id)                        AS qtd_movs,
  SUM(m.valor)                       AS soma_movs,
  STRING_AGG(m.id::text, ', ' ORDER BY m.created_at) AS mov_ids,
  STRING_AGG(DISTINCT COALESCE(m.origem, '(null)'), ', ') AS origens_mov
FROM public.contas_receber cr
INNER JOIN public.companies  c ON c.id = cr.company_id
INNER JOIN public.movimentacoes m ON m.conta_receber_id = cr.id
WHERE c.nome_fantasia = 'HAIR OF BRASIL LTDA'
  AND cr.deleted_at IS NULL
GROUP BY cr.id, cr.status, cr.valor, cr.valor_pago, cr.pagador_nome,
         cr.data_vencimento, cr.data_pagamento, cr.created_via_bank_tx_id
HAVING COUNT(m.id) > 1
ORDER BY COUNT(m.id) DESC, cr.data_pagamento DESC NULLS LAST
LIMIT 100;


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  SECAO 4 — CRs "gemeos" na HAIR (H1)                                     │
-- │  Mesma empresa + mesmo pagador_nome + mesmo valor + mesma               │
-- │  data_vencimento OU data_pagamento. Complementa a secao 2 do script     │
-- │  `audit_duplicatas_cr_cp.sql` filtrando por HAIR e incluindo pagamento. │
-- └─────────────────────────────────────────────────────────────────────────┘

SELECT
  cr.pagador_nome                                              AS pagador,
  cr.valor                                                     AS valor,
  cr.data_vencimento                                           AS vencimento,
  cr.data_pagamento                                            AS pagamento,
  COUNT(*)                                                     AS qtd,
  STRING_AGG(cr.id::text, ', ' ORDER BY cr.created_at)         AS cr_ids,
  STRING_AGG(cr.status, ', ' ORDER BY cr.created_at)           AS status,
  COUNT(*) FILTER (WHERE cr.created_via_bank_tx_id IS NOT NULL) AS via_extrato,
  COUNT(*) FILTER (WHERE cr.created_via_bank_tx_id IS NULL)     AS manuais
FROM public.contas_receber cr
INNER JOIN public.companies c ON c.id = cr.company_id
WHERE c.nome_fantasia = 'HAIR OF BRASIL LTDA'
  AND cr.deleted_at IS NULL
GROUP BY cr.pagador_nome, cr.valor, cr.data_vencimento, cr.data_pagamento
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC, cr.data_pagamento DESC NULLS LAST
LIMIT 100;


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  SECAO 5 — Bank transactions que geraram 2+ CRs OU 2+ movs (H3)          │
-- │  Uma unica linha do extrato nao deveria produzir 2+ CRs nem 2+ movs.    │
-- │  Se aparece aqui = conciliacao rodou 2x pra mesma bank_tx.              │
-- └─────────────────────────────────────────────────────────────────────────┘

-- 5a. Bank_tx com 2+ CRs ativos
SELECT
  bt.id              AS bank_tx_id,
  bt.date            AS data_extrato,
  bt.amount          AS valor_extrato,
  LEFT(bt.description, 60) AS descricao_extrato,
  COUNT(cr.id)       AS qtd_crs,
  STRING_AGG(cr.id::text, ', ' ORDER BY cr.created_at) AS cr_ids
FROM public.bank_transactions bt
INNER JOIN public.companies c ON c.id = bt.company_id
INNER JOIN public.contas_receber cr
  ON cr.created_via_bank_tx_id = bt.id
 AND cr.deleted_at IS NULL
WHERE c.nome_fantasia = 'HAIR OF BRASIL LTDA'
GROUP BY bt.id, bt.date, bt.amount, bt.description
HAVING COUNT(cr.id) > 1
ORDER BY bt.date DESC
LIMIT 100;

-- 5b. Bank_tx com 2+ movimentacoes (via ponte cr.created_via_bank_tx_id / cp.created_via_bank_tx_id)
-- movimentacoes NAO tem FK direta pra bank_transactions — so link e via CR/CP.
WITH bt_hair AS (
  SELECT bt.*
  FROM public.bank_transactions bt
  INNER JOIN public.companies c ON c.id = bt.company_id
  WHERE c.nome_fantasia = 'HAIR OF BRASIL LTDA'
),
movs_por_bt AS (
  SELECT
    bt.id              AS bank_tx_id,
    bt.date            AS data_extrato,
    bt.amount          AS valor_extrato,
    LEFT(bt.description, 60) AS descricao_extrato,
    m.id               AS mov_id,
    m.valor            AS mov_valor,
    m.created_at       AS mov_criada_em
  FROM bt_hair bt
  LEFT JOIN public.contas_receber cr ON cr.created_via_bank_tx_id = bt.id AND cr.deleted_at IS NULL
  LEFT JOIN public.contas_pagar   cp ON cp.created_via_bank_tx_id = bt.id AND cp.deleted_at IS NULL
  INNER JOIN public.movimentacoes m
    ON m.conta_receber_id = cr.id OR m.conta_pagar_id = cp.id
)
SELECT
  bank_tx_id,
  data_extrato,
  valor_extrato,
  descricao_extrato,
  COUNT(DISTINCT mov_id)                                       AS qtd_movs,
  SUM(mov_valor)                                               AS soma_movs,
  STRING_AGG(DISTINCT mov_id::text, ', ' ORDER BY mov_id::text) AS mov_ids
FROM movs_por_bt
GROUP BY bank_tx_id, data_extrato, valor_extrato, descricao_extrato
HAVING COUNT(DISTINCT mov_id) > 1
ORDER BY data_extrato DESC
LIMIT 100;


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  SECAO 6 — Resumo: quantas linhas duplicadas e quanto R$ estao inflando │
-- │  o relatorio da HAIR hoje.                                              │
-- └─────────────────────────────────────────────────────────────────────────┘

WITH mov_hair AS (
  SELECT m.*
  FROM public.movimentacoes m
  INNER JOIN public.companies c ON c.id = m.company_id
  WHERE c.nome_fantasia = 'HAIR OF BRASIL LTDA'
),
grupos AS (
  SELECT
    data, tipo, valor, descricao,
    COUNT(*) AS qtd,
    COUNT(*) - 1 AS excedente
  FROM mov_hair
  GROUP BY data, tipo, valor, descricao
  HAVING COUNT(*) > 1
)
SELECT
  COUNT(*)                                                 AS grupos_duplicados,
  SUM(qtd)                                                 AS linhas_envolvidas,
  SUM(excedente)                                           AS linhas_a_remover,
  SUM(excedente * valor) FILTER (WHERE tipo = 'credito')   AS inflacao_entradas,
  SUM(excedente * valor) FILTER (WHERE tipo = 'debito')    AS inflacao_saidas
FROM grupos;
