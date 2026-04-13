-- ============================================================
-- Backfill movimentacoes para 014 FRANQUEADORA
-- CRs e CPs marcados como pagos/parcial que nao geraram movimentacao
-- (geralmente porque foram quitados sem conta_bancaria_id)
-- ============================================================

-- 1. Contas a Pagar pagas sem movimentacao
INSERT INTO public.movimentacoes (
  company_id,
  conta_bancaria_id,
  conta_contabil_id,
  conta_pagar_id,
  tipo,
  valor,
  data,
  descricao,
  origem,
  status_conciliacao
)
SELECT
  cp.company_id,
  COALESCE(cp.conta_bancaria_id, 'fd4aefaa-e9b8-4d40-a46a-51787eac24c0'),
  cp.conta_contabil_id,
  cp.id,
  'debito',
  cp.valor_pago,
  COALESCE(cp.data_pagamento, cp.data_vencimento),
  'Pagamento: ' || COALESCE(cp.credor_nome, 'Fornecedor'),
  'conta_pagar',
  'pendente'
FROM public.contas_pagar cp
WHERE cp.company_id = '50b7963e-3011-4fa3-8985-c52dc060d7fb'
  AND cp.deleted_at IS NULL
  AND cp.status IN ('pago', 'parcial')
  AND cp.valor_pago > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.movimentacoes m
    WHERE m.conta_pagar_id = cp.id
      AND m.company_id = cp.company_id
  );

-- 2. Contas a Receber pagas sem movimentacao
INSERT INTO public.movimentacoes (
  company_id,
  conta_bancaria_id,
  conta_contabil_id,
  conta_receber_id,
  tipo,
  valor,
  data,
  descricao,
  origem,
  status_conciliacao
)
SELECT
  cr.company_id,
  'fd4aefaa-e9b8-4d40-a46a-51787eac24c0',
  cr.conta_contabil_id,
  cr.id,
  'credito',
  cr.valor_pago,
  COALESCE(cr.data_pagamento, cr.data_vencimento),
  'Recebimento: ' || COALESCE(cr.pagador_nome, 'Cliente'),
  'conta_receber',
  'pendente'
FROM public.contas_receber cr
WHERE cr.company_id = '50b7963e-3011-4fa3-8985-c52dc060d7fb'
  AND cr.deleted_at IS NULL
  AND cr.status IN ('pago', 'parcial')
  AND cr.valor_pago > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.movimentacoes m
    WHERE m.conta_receber_id = cr.id
      AND m.company_id = cr.company_id
  );
