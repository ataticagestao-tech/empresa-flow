-- ============================================================================
-- INVESTIGAÇÃO 1: Duplicata Pedro Agnaldo Zacarias Amâncio (2× R$ 8.000 em 07/05)
-- INVESTIGAÇÃO 2: Repasses Stone/Visa sem vínculo com venda — origem real
--
-- Hair Of Brasil ltda — company_id: 6d41eb71-e593-4ff2-8e3b-e36089a2aca7
-- READ-ONLY (apenas SELECT)
-- ============================================================================


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  PARTE 1 — DUPLICATA PEDRO AGNALDO                                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 1.1 — As 2 movimentações lado a lado (movimentacoes)                     │
-- │ Compara created_at, ids, conta_receber_id, conta_bancaria, descrição.    │
-- │ Se as duas movimentações apontam pra CRs DIFERENTES, a duplicata é nas  │
-- │ contas a receber. Se apontam pra MESMA CR, é mov duplicada.             │
-- └─────────────────────────────────────────────────────────────────────────┘

SELECT
  m.id                                AS mov_id,
  m.created_at,
  m.data,
  m.valor,
  m.tipo,
  m.origem,
  m.descricao,
  m.conta_receber_id,
  m.conta_bancaria_id,
  ba.name                             AS conta_bancaria,
  m.bank_transaction_id,
  m.conta_contabil_id,
  coa.name                            AS categoria
FROM public.movimentacoes m
LEFT JOIN public.bank_accounts ba       ON ba.id  = m.conta_bancaria_id
LEFT JOIN public.chart_of_accounts coa  ON coa.id = m.conta_contabil_id
WHERE m.company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7'
  AND m.data = '2026-05-07'
  AND m.valor = 8000
  AND m.tipo = 'credito'
ORDER BY m.created_at;


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 1.2 — As contas_receber por trás dessas 2 movimentações                  │
-- │ Mostra valor_pago, status, deleted_at, venda_id, parcela.               │
-- │ Se ambas CRs existem ativas e somam R$ 16.000 → CR também duplicada.    │
-- └─────────────────────────────────────────────────────────────────────────┘

SELECT
  cr.id                              AS cr_id,
  cr.created_at,
  cr.pagador_nome,
  cr.descricao,
  cr.valor_previsto,
  cr.valor_pago,
  cr.status,
  cr.data_pagamento,
  cr.data_vencimento,
  cr.parcela_num,
  cr.parcela_total,
  cr.venda_id,
  cr.deleted_at,
  cr.bank_transaction_id             AS cr_bank_tx_id,
  cr.created_via_bank_tx_id
FROM public.contas_receber cr
WHERE cr.company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7'
  AND cr.pagador_nome ILIKE '%Pedro Agnaldo%'
ORDER BY cr.created_at;


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 1.3 — A venda original (se existir) do Pedro Agnaldo                     │
-- │ Mostra valor total, parcelamento, forma de pagamento.                   │
-- └─────────────────────────────────────────────────────────────────────────┘

SELECT
  v.id                AS venda_id,
  v.created_at,
  v.data_venda,
  v.cliente_nome,
  v.valor_bruto,
  v.valor_liquido,
  v.forma_pagamento,
  v.status,
  v.parcelas,
  v.observacoes,
  v.deleted_at
FROM public.vendas v
WHERE v.company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7'
  AND v.cliente_nome ILIKE '%Pedro Agnaldo%'
ORDER BY v.created_at;


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 1.4 — Extratos bancários (bank_transactions) com mesmo valor/data        │
-- │ Se existir só 1 linha no banco mas 2 movs, é mov inflada.               │
-- └─────────────────────────────────────────────────────────────────────────┘

SELECT
  bt.id                AS bank_tx_id,
  bt.data,
  bt.valor,
  bt.descricao,
  bt.conta_bancaria_id,
  ba.name              AS conta,
  bt.reconciled,
  bt.deleted_at
FROM public.bank_transactions bt
LEFT JOIN public.bank_accounts ba ON ba.id = bt.conta_bancaria_id
WHERE bt.company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7'
  AND bt.data BETWEEN '2026-05-06' AND '2026-05-08'
  AND bt.valor = 8000
ORDER BY bt.data;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  PARTE 2 — REPASSES STONE/VISA SEM VÍNCULO COM VENDA                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 2.1 — Todas as movimentações de maio com categoria "Maquininha/Stone"   │
-- │ ou descrição contendo Stone/Visa/Cred Dom                                │
-- │ Mostra cada repasse e se tem CR vinculada e se essa CR tem venda.       │
-- └─────────────────────────────────────────────────────────────────────────┘

SELECT
  m.id                              AS mov_id,
  m.data,
  m.valor,
  m.descricao,
  m.origem,
  cr.id                             AS cr_id,
  cr.pagador_nome,
  cr.venda_id,
  v.data_venda                      AS venda_original,
  v.forma_pagamento,
  coa.name                          AS categoria,
  ba.name                           AS conta_bancaria
FROM public.movimentacoes m
LEFT JOIN public.contas_receber cr    ON cr.id  = m.conta_receber_id
LEFT JOIN public.vendas v             ON v.id   = cr.venda_id
LEFT JOIN public.chart_of_accounts coa ON coa.id = COALESCE(m.conta_contabil_id, cr.conta_contabil_id)
LEFT JOIN public.bank_accounts ba     ON ba.id  = m.conta_bancaria_id
WHERE m.company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7'
  AND m.data BETWEEN '2026-05-01' AND '2026-05-31'
  AND m.tipo = 'credito'
  AND (
       coa.name ILIKE '%maquininha%'
    OR coa.name ILIKE '%stone%'
    OR m.descricao ILIKE '%stone%'
    OR m.descricao ILIKE '%visa%'
    OR m.descricao ILIKE '%mastercard%'
    OR m.descricao ILIKE '%cred dom%'
    OR m.descricao ILIKE '%maquininha%'
  )
ORDER BY m.valor DESC;


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 2.2 — Vendas em CARTÃO de meses ANTERIORES com CR ainda em aberto        │
-- │ Esses são os candidatos a "venda velha que ainda tem repasse pra vir".  │
-- │ Se a soma de valor_aberto bater com o total de repasses Stone do mês,   │
-- │ confirma 100% a hipótese de "cartão antigo liquidando agora".            │
-- └─────────────────────────────────────────────────────────────────────────┘

WITH vendas_cartao_antigas AS (
  SELECT v.id, v.data_venda, v.cliente_nome, v.valor_liquido, v.forma_pagamento
  FROM public.vendas v
  WHERE v.company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7'
    AND v.data_venda < DATE '2026-05-01'
    AND v.status = 'confirmado'
    AND (
         v.forma_pagamento ILIKE '%cart%'
      OR v.forma_pagamento ILIKE '%credit%'
      OR v.forma_pagamento ILIKE '%debit%'
      OR v.forma_pagamento ILIKE '%maquin%'
      OR v.forma_pagamento ILIKE '%stone%'
      OR v.forma_pagamento = 'multiplo'
    )
)
SELECT
  COUNT(*)                                                          AS qtd_vendas_cartao_antigas,
  SUM(v.valor_liquido)                                              AS soma_valor_liquido,
  SUM(COALESCE(cr.valor_previsto, 0) - COALESCE(cr.valor_pago, 0))  AS soma_valor_em_aberto_nas_crs,
  SUM(CASE WHEN cr.status = 'pago' THEN 1 ELSE 0 END)               AS crs_pagas,
  SUM(CASE WHEN cr.status <> 'pago' OR cr.status IS NULL THEN 1 ELSE 0 END) AS crs_abertas_ou_sem_cr
FROM vendas_cartao_antigas v
LEFT JOIN public.contas_receber cr
       ON cr.venda_id = v.id
      AND cr.deleted_at IS NULL;


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 2.3 — Lista nominal das vendas em cartão antigas com saldo a receber     │
-- │ (TOP 30 maiores). São as que "podem" ter virado os repasses Stone.       │
-- └─────────────────────────────────────────────────────────────────────────┘

SELECT
  v.data_venda,
  v.cliente_nome,
  v.valor_liquido,
  v.forma_pagamento,
  COUNT(cr.id)                                                       AS qtd_crs,
  SUM(COALESCE(cr.valor_previsto, 0))                                AS soma_prevista,
  SUM(COALESCE(cr.valor_pago, 0))                                    AS soma_paga,
  SUM(COALESCE(cr.valor_previsto, 0) - COALESCE(cr.valor_pago, 0))   AS saldo_aberto,
  STRING_AGG(DISTINCT cr.status, ', ')                               AS status_crs
FROM public.vendas v
LEFT JOIN public.contas_receber cr
       ON cr.venda_id = v.id
      AND cr.deleted_at IS NULL
WHERE v.company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7'
  AND v.data_venda < DATE '2026-05-01'
  AND v.status = 'confirmado'
  AND v.deleted_at IS NULL
  AND (
       v.forma_pagamento ILIKE '%cart%'
    OR v.forma_pagamento ILIKE '%credit%'
    OR v.forma_pagamento ILIKE '%debit%'
    OR v.forma_pagamento ILIKE '%maquin%'
    OR v.forma_pagamento ILIKE '%stone%'
    OR v.forma_pagamento = 'multiplo'
  )
GROUP BY v.id, v.data_venda, v.cliente_nome, v.valor_liquido, v.forma_pagamento
HAVING SUM(COALESCE(cr.valor_previsto, 0) - COALESCE(cr.valor_pago, 0)) > 0
ORDER BY saldo_aberto DESC
LIMIT 30;
