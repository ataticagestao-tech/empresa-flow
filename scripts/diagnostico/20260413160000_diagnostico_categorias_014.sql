-- ============================================================
-- DIAGNOSTICO: Categorias das transacoes conciliadas da 014 HAIR OF BRASIL
-- Rode este SELECT no SQL Editor do Supabase para ver o estado atual.
-- NAO ALTERA NADA — apenas consulta.
-- ============================================================

SELECT
  bt.date AS data,
  bt.description AS descricao_banco,
  bt.amount AS valor,
  CASE WHEN bt.amount > 0 THEN 'RECEITA' ELSE 'DESPESA' END AS tipo,
  CASE
    WHEN bt.reconciled_receivable_id IS NOT NULL THEN 'CR'
    WHEN bt.reconciled_payable_id IS NOT NULL THEN 'CP'
    ELSE 'SEM VINCULO'
  END AS vinculo,
  COALESCE(cr.pagador_nome, cp.credor_nome, '—') AS beneficiario,
  coa.code AS cod_categoria_atual,
  coa.name AS nome_categoria_atual,
  bt.id AS bank_tx_id,
  COALESCE(bt.reconciled_receivable_id, bt.reconciled_payable_id) AS cr_cp_id
FROM public.bank_transactions bt
LEFT JOIN public.contas_receber cr
  ON cr.id = bt.reconciled_receivable_id AND cr.deleted_at IS NULL
LEFT JOIN public.contas_pagar cp
  ON cp.id = bt.reconciled_payable_id AND cp.deleted_at IS NULL
LEFT JOIN public.chart_of_accounts coa
  ON coa.id = COALESCE(cr.conta_contabil_id, cp.conta_contabil_id)
WHERE bt.company_id = '50b7963e-3011-4fa3-8985-c52dc060d7fb'
  AND bt.status = 'reconciled'
ORDER BY bt.date DESC, bt.amount DESC;
