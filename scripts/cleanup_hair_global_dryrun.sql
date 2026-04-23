-- ============================================================================
-- DRY-RUN GLOBAL HAIR: bank_transactions como fonte da verdade
--
-- Regra:
--   Para cada (bank_account, date, valor, sign) no extrato, existe no maximo 1
--   mov legitima. Se existem 2+, sao duplicatas → manter 1, deletar o resto.
--   Se existe mov sem nenhum bt equivalente → ghost, deletar.
--
-- Exclui:
--   - Conta "CAIXA FISICO" (nao tem extrato)
--   - Movs origem='transferencia' (legit por natureza)
--
-- Preferencia pra manter: mov com CR/CP vinculado. Empate → mais antiga.
-- ============================================================================

WITH
contas_reais AS (
  SELECT ba.id, ba.name
  FROM public.bank_accounts ba
  INNER JOIN public.companies c ON c.id = ba.company_id
  WHERE c.nome_fantasia = 'HAIR OF BRASIL LTDA'
    AND ba.name NOT ILIKE '%caixa%'
),
mov_candidata AS (
  -- Todas as movs de contas reais que NAO sao transferencia
  SELECT
    m.id AS mov_id,
    m.conta_bancaria_id,
    m.data,
    m.valor,
    m.tipo,
    m.origem,
    m.descricao,
    m.conta_receber_id,
    m.conta_pagar_id,
    m.created_at,
    -- Tenta casar com um bank_tx real na mesma conta/data/valor/sinal
    (
      SELECT bt.id FROM public.bank_transactions bt
       WHERE bt.bank_account_id = m.conta_bancaria_id
         AND bt.date = m.data
         AND ABS(bt.amount) = m.valor
         AND CASE WHEN bt.amount >= 0 THEN 'credito' ELSE 'debito' END = m.tipo
       LIMIT 1
    ) AS bt_id
  FROM public.movimentacoes m
  WHERE m.conta_bancaria_id IN (SELECT id FROM contas_reais)
    AND m.origem <> 'transferencia'
),
ranked AS (
  -- Para cada bt casado, rank de movs: prefere as com CR/CP vinculado, depois mais antiga
  SELECT
    mc.*,
    ROW_NUMBER() OVER (
      PARTITION BY bt_id
      ORDER BY
        (conta_receber_id IS NOT NULL OR conta_pagar_id IS NOT NULL) DESC,
        created_at ASC
    ) AS rn,
    COUNT(*) OVER (PARTITION BY bt_id) AS movs_no_bt
  FROM mov_candidata mc
  WHERE bt_id IS NOT NULL
),
duplicatas AS (
  SELECT mov_id, tipo, valor, conta_receber_id, conta_pagar_id
    FROM ranked WHERE rn > 1
),
ghosts AS (
  -- Movs que nao encontraram NENHUM bt no extrato
  SELECT mov_id, tipo, valor, conta_receber_id, conta_pagar_id, origem, descricao, data
    FROM mov_candidata
   WHERE bt_id IS NULL
)
-- ─── RESUMO ───
SELECT
  'DUPLICATAS (multiplas movs pro mesmo bt)' AS categoria,
  COUNT(*) AS qtd_movs,
  SUM(valor) FILTER (WHERE tipo='credito') AS r_entradas,
  SUM(valor) FILTER (WHERE tipo='debito')  AS r_saidas,
  COUNT(*) FILTER (WHERE conta_receber_id IS NOT NULL OR conta_pagar_id IS NOT NULL) AS vinculadas_a_cr_cp
FROM duplicatas
UNION ALL
SELECT
  'GHOSTS (mov sem bt correspondente)',
  COUNT(*),
  SUM(valor) FILTER (WHERE tipo='credito'),
  SUM(valor) FILTER (WHERE tipo='debito'),
  COUNT(*) FILTER (WHERE conta_receber_id IS NOT NULL OR conta_pagar_id IS NOT NULL)
FROM ghosts;


-- ─── DETALHE: Top 20 ghosts por descricao/valor ───
WITH
contas_reais AS (
  SELECT ba.id FROM public.bank_accounts ba
  INNER JOIN public.companies c ON c.id = ba.company_id
  WHERE c.nome_fantasia = 'HAIR OF BRASIL LTDA' AND ba.name NOT ILIKE '%caixa%'
),
mov_candidata AS (
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
  LEFT(descricao, 60) AS descricao,
  tipo,
  valor,
  COUNT(*) AS qtd_linhas_ghost,
  STRING_AGG(DISTINCT COALESCE(origem, '(null)'), ', ') AS origens,
  COUNT(*) FILTER (WHERE conta_receber_id IS NOT NULL) AS com_cr,
  COUNT(*) FILTER (WHERE conta_pagar_id IS NOT NULL) AS com_cp,
  MIN(data) AS data_min, MAX(data) AS data_max
FROM mov_candidata
WHERE bt_id IS NULL
GROUP BY descricao, tipo, valor
ORDER BY COUNT(*) DESC, SUM(valor) DESC
LIMIT 20;


-- ─── DETALHE: Top 20 bts com 2+ movs (duplicatas) ───
WITH
contas_reais AS (
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
  bt.date AS data,
  bt.amount AS valor,
  LEFT(bt.description, 60) AS descricao_extrato,
  COUNT(mm.id) AS qtd_movs,
  STRING_AGG(mm.id::text || ' (' || COALESCE(mm.origem,'null') || ')', E'\n' ORDER BY mm.created_at) AS movs
FROM public.bank_transactions bt
INNER JOIN mov_match mm ON mm.bt_id = bt.id
GROUP BY bt.id, bt.date, bt.amount, bt.description
HAVING COUNT(mm.id) > 1
ORDER BY COUNT(mm.id) DESC
LIMIT 20;
