-- ============================================================================
-- AUDIT: por que as ENTRADAS da HAIR OF BRASIL em ABRIL/2026 estao altas?
--
-- Dashboard "Area do Contador" mostra:
--   - 289 movimentacoes conciliadas em abril
--   - R$ 634.954,66 em entradas
--   - R$ 218.230,27 em saidas
--
-- Hipoteses:
--   H1) Transferencias internas entrando como entrada (KPI nao filtra origem)
--   H2) Movimentacoes duplicadas (CR/baixa/conciliacao gerando 2+ linhas)
--   H3) Entradas atipicas de valor alto (emprestimo, aporte, venda grande)
--   H4) Volume real de vendas/recebimentos subiu mesmo
--
-- Todas as queries sao READ-ONLY.
--
-- IDENTIFICADOR: usar company_id direto pra evitar case-sensitivity
--   Hair Of Brasil ltda — id: 6d41eb71-e593-4ff2-8e3b-e36089a2aca7
-- ============================================================================


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  PASSO 0 — confere se o numero do dashboard bate                         │
-- │  Espelha exatamente o calculo da Area do Contador (tipo=credito)         │
-- └─────────────────────────────────────────────────────────────────────────┘

SELECT
  COUNT(*)                              AS movs_total,
  COUNT(*) FILTER (WHERE tipo='credito') AS qtd_creditos,
  COUNT(*) FILTER (WHERE tipo='debito')  AS qtd_debitos,
  SUM(valor) FILTER (WHERE tipo='credito') AS soma_entradas,
  SUM(valor) FILTER (WHERE tipo='debito')  AS soma_saidas
FROM public.movimentacoes m
WHERE m.company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7'
  AND m.data BETWEEN '2026-04-01' AND '2026-04-30';


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  PASSO 1 — Quebra ENTRADAS por origem                                    │
-- │  Mostra quanto vem de venda recebida (conta_receber), quanto de          │
-- │  transferencia, OFX direto, manual etc.                                  │
-- │  Se "transferencia" tem valor relevante → bug do KPI (H1).               │
-- └─────────────────────────────────────────────────────────────────────────┘

SELECT
  COALESCE(m.origem, '(null)')          AS origem,
  COUNT(*)                              AS qtd,
  SUM(m.valor)                          AS total_entradas,
  ROUND(100.0 * SUM(m.valor) / SUM(SUM(m.valor)) OVER (), 2) AS pct_do_total
FROM public.movimentacoes m
WHERE m.company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7'
  AND m.data BETWEEN '2026-04-01' AND '2026-04-30'
  AND m.tipo = 'credito'
GROUP BY m.origem
ORDER BY SUM(m.valor) DESC;


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  PASSO 2 — ENTRADAS REAIS (excluindo transferencias internas)            │
-- │  Esse e o numero que o contador deveria ver.                             │
-- │  Se diferir muito do KPI (R$ 634.954,66) → H1 confirmada.                │
-- └─────────────────────────────────────────────────────────────────────────┘

SELECT
  SUM(m.valor) FILTER (WHERE m.tipo='credito')                              AS entradas_brutas_kpi,
  SUM(m.valor) FILTER (WHERE m.tipo='credito' AND m.origem <> 'transferencia') AS entradas_reais,
  SUM(m.valor) FILTER (WHERE m.tipo='credito' AND m.origem = 'transferencia')  AS transferencias_inflando,
  SUM(m.valor) FILTER (WHERE m.tipo='debito' AND m.origem = 'transferencia')   AS transferencias_lado_debito
FROM public.movimentacoes m
WHERE m.company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7'
  AND m.data BETWEEN '2026-04-01' AND '2026-04-30';


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  PASSO 3 — Comparativo de entradas: fev / marco / abril                  │
-- │  Para ver se o aumento e real ou anomalia                                │
-- └─────────────────────────────────────────────────────────────────────────┘

SELECT
  TO_CHAR(m.data, 'YYYY-MM')           AS mes,
  COUNT(*) FILTER (WHERE m.tipo='credito') AS qtd_entradas,
  SUM(m.valor) FILTER (WHERE m.tipo='credito')                              AS entradas_brutas,
  SUM(m.valor) FILTER (WHERE m.tipo='credito' AND m.origem <> 'transferencia') AS entradas_reais,
  COUNT(*) FILTER (WHERE m.tipo='debito')  AS qtd_saidas,
  SUM(m.valor) FILTER (WHERE m.tipo='debito')                               AS saidas_brutas,
  SUM(m.valor) FILTER (WHERE m.tipo='debito' AND m.origem <> 'transferencia')  AS saidas_reais
FROM public.movimentacoes m
WHERE m.company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7'
  AND m.data BETWEEN '2026-02-01' AND '2026-04-30'
GROUP BY TO_CHAR(m.data, 'YYYY-MM')
ORDER BY mes;


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  PASSO 4 — Top 30 maiores entradas individuais de abril                  │
-- │  Identifica recebimentos atipicos (aporte, emprestimo, venda grande)     │
-- └─────────────────────────────────────────────────────────────────────────┘

SELECT
  m.data,
  m.valor,
  m.origem,
  LEFT(COALESCE(m.descricao, '—'), 70) AS descricao,
  cr.pagador_nome,
  ba.name AS conta_bancaria,
  coa.code AS cat_codigo,
  coa.name AS cat_nome,
  m.id AS mov_id
FROM public.movimentacoes m
LEFT  JOIN public.contas_receber cr ON cr.id = m.conta_receber_id
LEFT  JOIN public.bank_accounts ba ON ba.id = m.conta_bancaria_id
LEFT  JOIN public.chart_of_accounts coa ON coa.id = m.conta_contabil_id
WHERE m.company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7'
  AND m.data BETWEEN '2026-04-01' AND '2026-04-30'
  AND m.tipo = 'credito'
ORDER BY m.valor DESC
LIMIT 30;


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  PASSO 5 — Entradas duplicadas em abril                                  │
-- │  Mesma chave (data, valor, descricao) com 2+ linhas.                     │
-- │  excedente_R$ = quanto cada grupo esta inflando o total.                 │
-- └─────────────────────────────────────────────────────────────────────────┘

WITH dups AS (
  SELECT
    m.data, m.valor, m.descricao,
    COUNT(*)                                      AS qtd,
    COUNT(*) - 1                                  AS excedente,
    (COUNT(*) - 1) * m.valor                      AS excedente_rs,
    COUNT(DISTINCT m.conta_receber_id)            AS crs_distintos,
    STRING_AGG(DISTINCT COALESCE(m.origem,'(null)'), ', ') AS origens,
    STRING_AGG(m.id::text, ', ' ORDER BY m.created_at)    AS mov_ids
  FROM public.movimentacoes m
    WHERE m.company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7'
    AND m.data BETWEEN '2026-04-01' AND '2026-04-30'
    AND m.tipo = 'credito'
  GROUP BY m.data, m.valor, m.descricao
  HAVING COUNT(*) > 1
)
SELECT * FROM dups
ORDER BY excedente_rs DESC;


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  PASSO 6 — Resumo do impacto das duplicadas                              │
-- └─────────────────────────────────────────────────────────────────────────┘

WITH dups AS (
  SELECT
    m.data, m.valor, m.descricao,
    COUNT(*) - 1 AS excedente,
    (COUNT(*) - 1) * m.valor AS excedente_rs
  FROM public.movimentacoes m
    WHERE m.company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7'
    AND m.data BETWEEN '2026-04-01' AND '2026-04-30'
    AND m.tipo = 'credito'
  GROUP BY m.data, m.valor, m.descricao
  HAVING COUNT(*) > 1
)
SELECT
  COUNT(*)                AS grupos_duplicados,
  SUM(excedente)          AS linhas_excedentes,
  SUM(excedente_rs)       AS inflacao_em_reais
FROM dups;


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  PASSO 7 — Entradas por categoria (plano de contas)                      │
-- │  Se "Receita de vendas" inchou OU se entrou em alguma categoria          │
-- │  estranha (transferencia, aporte, ajuste, sem categoria).                │
-- └─────────────────────────────────────────────────────────────────────────┘

SELECT
  COALESCE(coa.code, '(sem categoria)') AS cat_codigo,
  COALESCE(coa.name, '(sem categoria)') AS cat_nome,
  COUNT(*)                              AS qtd,
  SUM(m.valor)                          AS total
FROM public.movimentacoes m
LEFT  JOIN public.contas_receber cr ON cr.id = m.conta_receber_id
LEFT  JOIN public.chart_of_accounts coa
       ON coa.id = COALESCE(m.conta_contabil_id, cr.conta_contabil_id)
WHERE m.company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7'
  AND m.data BETWEEN '2026-04-01' AND '2026-04-30'
  AND m.tipo = 'credito'
GROUP BY coa.code, coa.name
ORDER BY SUM(m.valor) DESC;


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  PASSO 8 — Entradas por dia (curva)                                      │
-- │  Picos isolados denunciam evento unico vs ritmo crescente real           │
-- └─────────────────────────────────────────────────────────────────────────┘

SELECT
  m.data,
  COUNT(*)            AS qtd,
  SUM(m.valor)        AS total
FROM public.movimentacoes m
WHERE m.company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7'
  AND m.data BETWEEN '2026-04-01' AND '2026-04-30'
  AND m.tipo = 'credito'
  AND m.origem <> 'transferencia'
GROUP BY m.data
ORDER BY m.data;
