-- ============================================================
-- RPC: fn_diagnostico_categorias
-- Retorna transacoes conciliadas com categorias do plano de contas
-- Parametrizada por empresa e periodo
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_diagnostico_categorias(
  p_company_id UUID,
  p_data_inicio DATE DEFAULT NULL,
  p_data_fim DATE DEFAULT NULL
)
RETURNS TABLE(
  data DATE,
  descricao_banco TEXT,
  valor NUMERIC(15,2),
  tipo TEXT,
  vinculo TEXT,
  beneficiario TEXT,
  cod_categoria TEXT,
  nome_categoria TEXT,
  bank_tx_id UUID,
  cr_cp_id UUID
)
LANGUAGE sql STABLE
AS $$
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
    coa.code AS cod_categoria,
    coa.name AS nome_categoria,
    bt.id AS bank_tx_id,
    COALESCE(bt.reconciled_receivable_id, bt.reconciled_payable_id) AS cr_cp_id
  FROM public.bank_transactions bt
  LEFT JOIN public.contas_receber cr
    ON cr.id = bt.reconciled_receivable_id AND cr.deleted_at IS NULL
  LEFT JOIN public.contas_pagar cp
    ON cp.id = bt.reconciled_payable_id AND cp.deleted_at IS NULL
  LEFT JOIN public.chart_of_accounts coa
    ON coa.id = COALESCE(cr.conta_contabil_id, cp.conta_contabil_id)
  WHERE bt.company_id = p_company_id
    AND bt.status = 'reconciled'
    AND (p_data_inicio IS NULL OR bt.date >= p_data_inicio)
    AND (p_data_fim IS NULL OR bt.date <= p_data_fim)
  ORDER BY bt.date DESC, bt.amount DESC;
$$;
