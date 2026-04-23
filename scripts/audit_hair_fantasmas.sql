-- CR + CP fantasmas da HAIR OF BRASIL (pagos sem movimentacao)

(SELECT
  'CR' AS tipo,
  cr.id,
  cr.valor_pago,
  cr.data_vencimento,
  cr.data_pagamento,
  cr.status,
  LEFT(COALESCE(cr.pagador_nome, '—'), 50) AS parte,
  cr.created_at::date AS criado_em,
  CASE WHEN cr.created_via_bank_tx_id IS NOT NULL THEN 'extrato' ELSE 'manual' END AS origem
FROM public.contas_receber cr
INNER JOIN public.companies c ON c.id = cr.company_id
WHERE c.nome_fantasia = 'HAIR OF BRASIL LTDA'
  AND cr.deleted_at IS NULL
  AND cr.status IN ('pago', 'conciliado', 'parcial')
  AND cr.valor_pago > 0
  AND NOT EXISTS (SELECT 1 FROM public.movimentacoes m WHERE m.conta_receber_id = cr.id)
ORDER BY cr.data_pagamento DESC NULLS LAST, cr.created_at DESC)

UNION ALL

(SELECT
  'CP' AS tipo,
  cp.id,
  cp.valor_pago,
  cp.data_vencimento,
  cp.data_pagamento,
  cp.status,
  LEFT(COALESCE(cp.credor_nome, '—'), 50) AS parte,
  cp.created_at::date AS criado_em,
  CASE WHEN cp.created_via_bank_tx_id IS NOT NULL THEN 'extrato' ELSE 'manual' END AS origem
FROM public.contas_pagar cp
INNER JOIN public.companies c ON c.id = cp.company_id
WHERE c.nome_fantasia = 'HAIR OF BRASIL LTDA'
  AND cp.deleted_at IS NULL
  AND cp.status IN ('pago', 'conciliado', 'parcial')
  AND cp.valor_pago > 0
  AND NOT EXISTS (SELECT 1 FROM public.movimentacoes m WHERE m.conta_pagar_id = cp.id)
ORDER BY cp.data_pagamento DESC NULLS LAST, cp.created_at DESC)

ORDER BY tipo, data_pagamento DESC NULLS LAST;
