-- ============================================================================
-- AUDITORIA DE DUPLICATAS EM CONTAS A RECEBER E CONTAS A PAGAR
--
-- Contexto: bug antigo em que excluir extrato bancario NAO removia os CR/CP
-- gerados via conciliacao. Fix definitivo foi implementado em 2026-04-15
-- (coluna `created_via_bank_tx_id` + cascade soft-delete). Este script
-- caça os registros duplicados/orfaos que ficaram no banco ANTES do fix.
--
-- IMPORTANTE: este script e READ-ONLY. Nao altera nenhum dado.
-- Rode cada SECAO separadamente no Supabase SQL Editor e revise os
-- resultados. Depois decidimos juntos o que limpar.
-- ============================================================================


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  SECAO 1 — RESUMO GERAL DO SISTEMA                                      │
-- │  Quantos CR/CP existem, quantos estao ativos, por status.               │
-- │  Ajuda a dimensionar o problema.                                        │
-- └─────────────────────────────────────────────────────────────────────────┘

SELECT
  'contas_receber' AS tabela,
  COUNT(*) FILTER (WHERE deleted_at IS NULL)         AS ativos,
  COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)     AS soft_deleted,
  COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'aberto')      AS abertos,
  COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'pago')        AS pagos,
  COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'parcial')     AS parciais,
  COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'conciliado')  AS conciliados,
  COUNT(*) FILTER (WHERE deleted_at IS NULL AND created_via_bank_tx_id IS NOT NULL) AS via_extrato,
  SUM(valor) FILTER (WHERE deleted_at IS NULL)       AS soma_valores_ativos
FROM public.contas_receber
UNION ALL
SELECT
  'contas_pagar',
  COUNT(*) FILTER (WHERE deleted_at IS NULL),
  COUNT(*) FILTER (WHERE deleted_at IS NOT NULL),
  COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'aberto'),
  COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'pago'),
  COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'parcial'),
  COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'conciliado'),
  COUNT(*) FILTER (WHERE deleted_at IS NULL AND created_via_bank_tx_id IS NOT NULL),
  SUM(valor) FILTER (WHERE deleted_at IS NULL)
FROM public.contas_pagar;


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  SECAO 2 — DUPLICATAS EXATAS EM CONTAS A RECEBER                        │
-- │  Grupos ATIVOS com mesmo company + cliente + valor + data_vencimento.   │
-- │  Prováveis duplicatas geradas pelo bug de reconciliacao.                │
-- └─────────────────────────────────────────────────────────────────────────┘

SELECT
  c.nome_fantasia                                              AS empresa,
  cli.razao_social                                             AS cliente,
  cr.valor                                                     AS valor,
  cr.data_vencimento                                           AS vencimento,
  COUNT(*)                                                     AS quantidade,
  STRING_AGG(cr.id::text, ', ' ORDER BY cr.created_at)         AS ids_duplicados,
  STRING_AGG(cr.status, ', ' ORDER BY cr.created_at)           AS status,
  MIN(cr.created_at)                                           AS primeiro_criado,
  MAX(cr.created_at)                                           AS ultimo_criado
FROM public.contas_receber cr
LEFT JOIN public.companies c  ON c.id = cr.company_id
LEFT JOIN public.clients  cli ON cli.id = cr.cliente_id
WHERE cr.deleted_at IS NULL
GROUP BY c.nome_fantasia, cli.razao_social, cr.company_id, cr.cliente_id, cr.valor, cr.data_vencimento
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC, SUM(cr.valor) DESC
LIMIT 100;


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  SECAO 3 — DUPLICATAS EXATAS EM CONTAS A PAGAR                          │
-- │  Mesmo principio mas com credor_nome/fornecedor.                        │
-- └─────────────────────────────────────────────────────────────────────────┘

SELECT
  c.nome_fantasia                                              AS empresa,
  COALESCE(f.razao_social, cp.credor_nome, '—')                AS fornecedor,
  cp.valor                                                     AS valor,
  cp.data_vencimento                                           AS vencimento,
  COUNT(*)                                                     AS quantidade,
  STRING_AGG(cp.id::text, ', ' ORDER BY cp.created_at)         AS ids_duplicados,
  STRING_AGG(cp.status, ', ' ORDER BY cp.created_at)           AS status,
  MIN(cp.created_at)                                           AS primeiro_criado,
  MAX(cp.created_at)                                           AS ultimo_criado
FROM public.contas_pagar cp
LEFT JOIN public.companies c ON c.id = cp.company_id
LEFT JOIN public.fornecedores f ON f.id = cp.fornecedor_id
WHERE cp.deleted_at IS NULL
GROUP BY c.nome_fantasia, f.razao_social, cp.credor_nome, cp.company_id,
         cp.fornecedor_id, cp.valor, cp.data_vencimento
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC, SUM(cp.valor) DESC
LIMIT 100;


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  SECAO 4 — CR/CP COM MATCH ORFAO (bank_transaction_id = NULL)           │
-- │  Sinal forte de bug antigo: conciliacao existe mas o extrato foi        │
-- │  excluido (FK virou NULL via ON DELETE SET NULL). Estes CR/CP ficaram   │
-- │  "fantasmas" no banco apos exclusao do extrato.                         │
-- └─────────────────────────────────────────────────────────────────────────┘

-- 4a. Contas a Receber com match orfao
SELECT
  c.nome_fantasia   AS empresa,
  cr.id             AS cr_id,
  cr.valor          AS valor,
  cr.status         AS status,
  cr.data_vencimento,
  cr.pagador_nome,
  cr.descricao,
  brm.id            AS match_id,
  brm.matched_date  AS data_match_original,
  cr.created_at     AS criado_em
FROM public.contas_receber cr
LEFT JOIN public.companies c ON c.id = cr.company_id
INNER JOIN public.bank_reconciliation_matches brm ON brm.receivable_id = cr.id
WHERE cr.deleted_at IS NULL
  AND brm.bank_transaction_id IS NULL
ORDER BY cr.created_at DESC
LIMIT 200;

-- 4b. Contas a Pagar com match orfao
SELECT
  c.nome_fantasia   AS empresa,
  cp.id             AS cp_id,
  cp.valor          AS valor,
  cp.status         AS status,
  cp.data_vencimento,
  cp.credor_nome,
  cp.descricao,
  brm.id            AS match_id,
  brm.matched_date  AS data_match_original,
  cp.created_at     AS criado_em
FROM public.contas_pagar cp
LEFT JOIN public.companies c ON c.id = cp.company_id
INNER JOIN public.bank_reconciliation_matches brm ON brm.payable_id = cp.id
WHERE cp.deleted_at IS NULL
  AND brm.bank_transaction_id IS NULL
ORDER BY cp.created_at DESC
LIMIT 200;


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  SECAO 5 — CR/CP MARCADOS COMO PAGOS/CONCILIADOS SEM MOVIMENTACAO       │
-- │  Baixa fantasma: conta foi marcada como paga mas nao existe registro    │
-- │  de caixa/banco correspondente em `movimentacoes`.                      │
-- └─────────────────────────────────────────────────────────────────────────┘

-- 5a. CR pagos/conciliados sem movimentacao
SELECT
  c.nome_fantasia   AS empresa,
  cr.id             AS cr_id,
  cr.valor_pago,
  cr.status,
  cr.data_pagamento,
  cr.pagador_nome,
  cr.created_via_bank_tx_id IS NOT NULL AS via_extrato
FROM public.contas_receber cr
LEFT JOIN public.companies c ON c.id = cr.company_id
WHERE cr.deleted_at IS NULL
  AND cr.status IN ('pago', 'conciliado', 'parcial')
  AND cr.valor_pago > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.movimentacoes m
    WHERE m.conta_receber_id = cr.id
      AND m.deleted_at IS NULL
  )
ORDER BY cr.data_pagamento DESC NULLS LAST
LIMIT 200;

-- 5b. CP pagos/conciliados sem movimentacao
SELECT
  c.nome_fantasia   AS empresa,
  cp.id             AS cp_id,
  cp.valor_pago,
  cp.status,
  cp.data_pagamento,
  cp.credor_nome,
  cp.created_via_bank_tx_id IS NOT NULL AS via_extrato
FROM public.contas_pagar cp
LEFT JOIN public.companies c ON c.id = cp.company_id
WHERE cp.deleted_at IS NULL
  AND cp.status IN ('pago', 'conciliado', 'parcial')
  AND cp.valor_pago > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.movimentacoes m
    WHERE m.conta_pagar_id = cp.id
      AND m.deleted_at IS NULL
  )
ORDER BY cp.data_pagamento DESC NULLS LAST
LIMIT 200;


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  SECAO 6 — MULTIPLOS CR/CP APONTANDO PARA MESMA BANK_TRANSACTION        │
-- │  Se 2+ CR estao vinculados a mesma transacao bancaria, isso indica      │
-- │  conciliacao feita 2x (bug classico do "Criar e Conciliar" repetido).   │
-- └─────────────────────────────────────────────────────────────────────────┘

-- 6a. Bank transactions com 2+ CR vinculados (via created_via_bank_tx_id)
SELECT
  bt.id                AS bank_tx_id,
  bt.company_id,
  bt.date              AS data_extrato,
  bt.amount            AS valor_extrato,
  bt.description       AS descricao_extrato,
  COUNT(cr.id)         AS cr_vinculados,
  SUM(cr.valor)        AS soma_cr,
  STRING_AGG(cr.id::text, ', ' ORDER BY cr.created_at) AS cr_ids
FROM public.bank_transactions bt
INNER JOIN public.contas_receber cr
  ON cr.created_via_bank_tx_id = bt.id AND cr.deleted_at IS NULL
GROUP BY bt.id, bt.company_id, bt.date, bt.amount, bt.description
HAVING COUNT(cr.id) > 1
ORDER BY COUNT(cr.id) DESC, bt.date DESC
LIMIT 100;

-- 6b. Bank transactions com 2+ CP vinculados
SELECT
  bt.id                AS bank_tx_id,
  bt.company_id,
  bt.date              AS data_extrato,
  bt.amount            AS valor_extrato,
  bt.description       AS descricao_extrato,
  COUNT(cp.id)         AS cp_vinculados,
  SUM(cp.valor)        AS soma_cp,
  STRING_AGG(cp.id::text, ', ' ORDER BY cp.created_at) AS cp_ids
FROM public.bank_transactions bt
INNER JOIN public.contas_pagar cp
  ON cp.created_via_bank_tx_id = bt.id AND cp.deleted_at IS NULL
GROUP BY bt.id, bt.company_id, bt.date, bt.amount, bt.description
HAVING COUNT(cp.id) > 1
ORDER BY COUNT(cp.id) DESC, bt.date DESC
LIMIT 100;


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  SECAO 7 — RESUMO POR EMPRESA (onde concentrar esforco)                 │
-- │  Conta quantos problemas cada empresa tem. Usa JOIN implicito com       │
-- │  as secoes 2, 4 e 6.                                                    │
-- └─────────────────────────────────────────────────────────────────────────┘

WITH duplicatas_cr AS (
  SELECT company_id, cliente_id, valor, data_vencimento, COUNT(*) - 1 AS extras
  FROM public.contas_receber
  WHERE deleted_at IS NULL
  GROUP BY company_id, cliente_id, valor, data_vencimento
  HAVING COUNT(*) > 1
),
duplicatas_cp AS (
  SELECT company_id, fornecedor_id, credor_nome, valor, data_vencimento, COUNT(*) - 1 AS extras
  FROM public.contas_pagar
  WHERE deleted_at IS NULL
  GROUP BY company_id, fornecedor_id, credor_nome, valor, data_vencimento
  HAVING COUNT(*) > 1
),
orfaos_cr AS (
  SELECT cr.company_id, COUNT(*) AS qtd
  FROM public.contas_receber cr
  INNER JOIN public.bank_reconciliation_matches brm ON brm.receivable_id = cr.id
  WHERE cr.deleted_at IS NULL AND brm.bank_transaction_id IS NULL
  GROUP BY cr.company_id
),
orfaos_cp AS (
  SELECT cp.company_id, COUNT(*) AS qtd
  FROM public.contas_pagar cp
  INNER JOIN public.bank_reconciliation_matches brm ON brm.payable_id = cp.id
  WHERE cp.deleted_at IS NULL AND brm.bank_transaction_id IS NULL
  GROUP BY cp.company_id
)
SELECT
  c.id                                            AS empresa_id,
  c.nome_fantasia                                 AS empresa,
  COALESCE(SUM(dcr.extras), 0)                    AS cr_duplicatas_excedentes,
  COALESCE(SUM(dcp.extras), 0)                    AS cp_duplicatas_excedentes,
  COALESCE(MAX(ocr.qtd), 0)                       AS cr_orfaos_match,
  COALESCE(MAX(ocp.qtd), 0)                       AS cp_orfaos_match,
  COALESCE(SUM(dcr.extras), 0)
    + COALESCE(SUM(dcp.extras), 0)
    + COALESCE(MAX(ocr.qtd), 0)
    + COALESCE(MAX(ocp.qtd), 0)                   AS total_problemas
FROM public.companies c
LEFT JOIN duplicatas_cr dcr ON dcr.company_id = c.id
LEFT JOIN duplicatas_cp dcp ON dcp.company_id = c.id
LEFT JOIN orfaos_cr    ocr ON ocr.company_id = c.id
LEFT JOIN orfaos_cp    ocp ON ocp.company_id = c.id
GROUP BY c.id, c.nome_fantasia
HAVING
  COALESCE(SUM(dcr.extras), 0)
  + COALESCE(SUM(dcp.extras), 0)
  + COALESCE(MAX(ocr.qtd), 0)
  + COALESCE(MAX(ocp.qtd), 0) > 0
ORDER BY total_problemas DESC;
