-- ============================================================
-- Gerar movimentacoes para 11 CPs da Daniele Barbosa (014 FRANQUEADORA)
-- que foram marcados como pagos mas sem conta_bancaria_id,
-- por isso nao geraram movimentacao e nao aparecem em /movimentacoes.
-- ============================================================

INSERT INTO public.movimentacoes (
  company_id,
  conta_bancaria_id,
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
  'fd4aefaa-e9b8-4d40-a46a-51787eac24c0',  -- Inter 182263339
  cp.id,
  'debito',
  cp.valor_pago,
  cp.data_pagamento,
  'Pagamento: ' || cp.credor_nome,
  'conta_pagar',
  'pendente'
FROM public.contas_pagar cp
WHERE cp.company_id = '50b7963e-3011-4fa3-8985-c52dc060d7fb'
  AND cp.credor_nome ILIKE '%DANIELE BARBOSA%'
  AND cp.deleted_at IS NULL
  AND cp.status = 'pago'
  AND NOT EXISTS (
    SELECT 1 FROM public.movimentacoes m
    WHERE m.conta_pagar_id = cp.id
      AND m.company_id = cp.company_id
  );
