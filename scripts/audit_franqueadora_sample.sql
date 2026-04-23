-- Amostra dos CR da 014 FRANQUEADORA marcados como pagos sem movimentacao
-- Tenta identificar padrao (datas, pagadores, valores, origem)

SELECT
  cr.id,
  cr.valor,
  cr.valor_pago,
  cr.data_vencimento,
  cr.data_pagamento,
  LEFT(COALESCE(cr.pagador_nome, '—'), 40) AS pagador,
  cr.status,
  cr.created_at::date AS criado_em,
  cr.created_via_bank_tx_id IS NOT NULL AS via_extrato
FROM public.contas_receber cr
INNER JOIN public.companies c ON c.id = cr.company_id
WHERE c.nome_fantasia = '014 FRANQUEADORA'
  AND cr.deleted_at IS NULL
  AND cr.status IN ('pago', 'conciliado', 'parcial')
  AND cr.valor_pago > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.movimentacoes m WHERE m.conta_receber_id = cr.id
  )
ORDER BY cr.created_at DESC
LIMIT 20;
