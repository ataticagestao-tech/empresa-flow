-- ============================================================================
-- DIAGNÓSTICO: por que ENTRADAS de maio/2026 (R$ 158.867,53)
--              > FATURAMENTO (R$ 97.026,00) na Hair Of Brasil?
--
-- Rodar no Supabase SQL Editor (cada bloco gera 1 tabela de saída).
-- READ-ONLY.
--
-- Hair Of Brasil ltda — company_id: 6d41eb71-e593-4ff2-8e3b-e36089a2aca7
-- Período: 2026-05-01 a 2026-05-31
-- ============================================================================


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ BLOCO 1 — RESUMO CAIXA × FATURAMENTO COMPETÊNCIA                         │
-- │ Deve mostrar: entradas_reais ≈ 158.867,53, faturamento ≈ 97.026,00       │
-- │ A diferença é o que vamos explicar.                                      │
-- └─────────────────────────────────────────────────────────────────────────┘

WITH caixa AS (
  SELECT
    SUM(valor) FILTER (WHERE tipo='credito')                                          AS entradas_brutas,
    SUM(valor) FILTER (WHERE tipo='credito' AND COALESCE(origem,'') <> 'transferencia') AS entradas_reais,
    SUM(valor) FILTER (WHERE tipo='credito' AND origem = 'transferencia')             AS transferencias_credito,
    SUM(valor) FILTER (WHERE tipo='debito')                                           AS saidas_brutas,
    SUM(valor) FILTER (WHERE tipo='debito' AND COALESCE(origem,'') <> 'transferencia')  AS saidas_reais,
    COUNT(*)   FILTER (WHERE tipo='credito')                                          AS qtd_creditos
  FROM public.movimentacoes
  WHERE company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7'
    AND data BETWEEN '2026-05-01' AND '2026-05-31'
),
fat AS (
  SELECT COALESCE(SUM(valor_liquido), 0) AS faturamento_competencia
  FROM public.vendas
  WHERE company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7'
    AND data_venda BETWEEN '2026-05-01' AND '2026-05-31'
    AND status = 'confirmado'
)
SELECT
  caixa.entradas_brutas,
  caixa.entradas_reais,
  caixa.transferencias_credito,
  caixa.qtd_creditos,
  fat.faturamento_competencia,
  (caixa.entradas_reais - fat.faturamento_competencia) AS diferenca_caixa_menos_competencia
FROM caixa, fat;


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ BLOCO 2 — Entradas por VÍNCULO COM VENDA (a explicação principal)        │
-- │ Mostra quanto das entradas é venda DESTE mês, venda de meses             │
-- │ anteriores, ou entrada SEM venda vinculada (aporte/empréstimo/ajuste).   │
-- └─────────────────────────────────────────────────────────────────────────┘

SELECT
  CASE
    WHEN v.id IS NULL THEN 'SEM_VENDA_VINCULADA'
    WHEN v.data_venda BETWEEN DATE '2026-05-01' AND DATE '2026-05-31' THEN 'VENDA_DESTE_MES'
    ELSE 'VENDA_DE_MES_ANTERIOR'
  END                                       AS vinculo,
  COUNT(*)                                  AS qtd,
  SUM(m.valor)                              AS total,
  ROUND(100.0 * SUM(m.valor) / SUM(SUM(m.valor)) OVER (), 2) AS pct
FROM public.movimentacoes m
LEFT JOIN public.contas_receber cr ON cr.id = m.conta_receber_id
LEFT JOIN public.vendas v          ON v.id  = cr.venda_id
WHERE m.company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7'
  AND m.data BETWEEN '2026-05-01' AND '2026-05-31'
  AND m.tipo = 'credito'
  AND COALESCE(m.origem,'') <> 'transferencia'
GROUP BY 1
ORDER BY total DESC;


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ BLOCO 3 — Entradas por ORIGEM                                             │
-- │ ofx / manual / venda / transferencia / conciliacao etc.                  │
-- └─────────────────────────────────────────────────────────────────────────┘

SELECT
  COALESCE(origem, '(null)') AS origem,
  COUNT(*)                   AS qtd,
  SUM(valor)                 AS total
FROM public.movimentacoes
WHERE company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7'
  AND data BETWEEN '2026-05-01' AND '2026-05-31'
  AND tipo = 'credito'
GROUP BY origem
ORDER BY total DESC;


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ BLOCO 4 — Entradas por CATEGORIA CONTÁBIL (já sem transferências)        │
-- │ Se houver categoria estranha (aporte/empréstimo/ajuste/sem categoria)   │
-- │ ela aparece aqui.                                                       │
-- └─────────────────────────────────────────────────────────────────────────┘

SELECT
  COALESCE(coa.code, '—')               AS cat_codigo,
  COALESCE(coa.name, '(sem categoria)') AS cat_nome,
  COUNT(*)                              AS qtd,
  SUM(m.valor)                          AS total
FROM public.movimentacoes m
LEFT JOIN public.contas_receber cr ON cr.id = m.conta_receber_id
LEFT JOIN public.chart_of_accounts coa
       ON coa.id = COALESCE(m.conta_contabil_id, cr.conta_contabil_id)
WHERE m.company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7'
  AND m.data BETWEEN '2026-05-01' AND '2026-05-31'
  AND m.tipo = 'credito'
  AND COALESCE(m.origem,'') <> 'transferencia'
GROUP BY coa.code, coa.name
ORDER BY total DESC;


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ BLOCO 5 — Detalhe: RECEBIMENTOS DE VENDAS ANTERIORES (linha a linha)     │
-- │ Esses são os "caixa que entrou agora, mas a venda foi antes".           │
-- │ Limitado a 100 maiores.                                                  │
-- └─────────────────────────────────────────────────────────────────────────┘

SELECT
  m.data           AS data_pagamento,
  v.data_venda     AS data_venda_original,
  m.valor,
  cr.pagador_nome,
  LEFT(COALESCE(m.descricao, '—'), 70) AS descricao,
  ba.name          AS conta_bancaria,
  v.forma_pagamento
FROM public.movimentacoes m
JOIN public.contas_receber cr ON cr.id = m.conta_receber_id
JOIN public.vendas v          ON v.id  = cr.venda_id
LEFT JOIN public.bank_accounts ba ON ba.id = m.conta_bancaria_id
WHERE m.company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7'
  AND m.data BETWEEN '2026-05-01' AND '2026-05-31'
  AND m.tipo = 'credito'
  AND COALESCE(m.origem,'') <> 'transferencia'
  AND v.data_venda < DATE '2026-05-01'
ORDER BY m.valor DESC
LIMIT 100;


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ BLOCO 6 — Detalhe: ENTRADAS SEM VENDA VINCULADA (potencial aporte/etc)  │
-- │ São linhas de crédito que não derivam de contas_receber/vendas.         │
-- └─────────────────────────────────────────────────────────────────────────┘

SELECT
  m.data,
  m.valor,
  m.origem,
  LEFT(COALESCE(m.descricao, '—'), 90) AS descricao,
  ba.name                              AS conta_bancaria,
  coa.name                             AS categoria
FROM public.movimentacoes m
LEFT JOIN public.contas_receber cr ON cr.id = m.conta_receber_id
LEFT JOIN public.bank_accounts ba ON ba.id = m.conta_bancaria_id
LEFT JOIN public.chart_of_accounts coa ON coa.id = m.conta_contabil_id
WHERE m.company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7'
  AND m.data BETWEEN '2026-05-01' AND '2026-05-31'
  AND m.tipo = 'credito'
  AND COALESCE(m.origem,'') <> 'transferencia'
  AND cr.id IS NULL
ORDER BY m.valor DESC
LIMIT 100;


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ BLOCO 7 — TOP 20 maiores entradas individuais (visão geral)              │
-- └─────────────────────────────────────────────────────────────────────────┘

SELECT
  m.data,
  m.valor,
  m.origem,
  LEFT(COALESCE(m.descricao, '—'), 70) AS descricao,
  cr.pagador_nome,
  v.data_venda                         AS data_venda_original,
  coa.name                             AS categoria
FROM public.movimentacoes m
LEFT JOIN public.contas_receber cr ON cr.id = m.conta_receber_id
LEFT JOIN public.vendas v          ON v.id  = cr.venda_id
LEFT JOIN public.chart_of_accounts coa ON coa.id = COALESCE(m.conta_contabil_id, cr.conta_contabil_id)
WHERE m.company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7'
  AND m.data BETWEEN '2026-05-01' AND '2026-05-31'
  AND m.tipo = 'credito'
  AND COALESCE(m.origem,'') <> 'transferencia'
ORDER BY m.valor DESC
LIMIT 20;
