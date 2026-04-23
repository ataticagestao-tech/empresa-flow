-- Analise de ORIGEM das baixas fantasma
-- Quer saber: quantos vieram de extrato (created_via_bank_tx_id) vs nao

WITH cr_fantasma AS (
  SELECT
    cr.company_id,
    cr.created_via_bank_tx_id IS NOT NULL AS via_extrato,
    cr.valor_pago
  FROM public.contas_receber cr
  WHERE cr.deleted_at IS NULL
    AND cr.status IN ('pago', 'conciliado', 'parcial')
    AND cr.valor_pago > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.movimentacoes m WHERE m.conta_receber_id = cr.id
    )
),
cp_fantasma AS (
  SELECT
    cp.company_id,
    cp.created_via_bank_tx_id IS NOT NULL AS via_extrato,
    cp.valor_pago
  FROM public.contas_pagar cp
  WHERE cp.deleted_at IS NULL
    AND cp.status IN ('pago', 'conciliado', 'parcial')
    AND cp.valor_pago > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.movimentacoes m WHERE m.conta_pagar_id = cp.id
    )
)
SELECT
  c.nome_fantasia                                                AS empresa,
  COUNT(*) FILTER (WHERE cr.via_extrato)                          AS cr_via_extrato,
  COUNT(*) FILTER (WHERE NOT cr.via_extrato)                      AS cr_sem_extrato,
  (SELECT COUNT(*) FROM cp_fantasma cp2
    WHERE cp2.company_id = c.id AND cp2.via_extrato)              AS cp_via_extrato,
  (SELECT COUNT(*) FROM cp_fantasma cp2
    WHERE cp2.company_id = c.id AND NOT cp2.via_extrato)          AS cp_sem_extrato,
  COUNT(*)
    + (SELECT COUNT(*) FROM cp_fantasma cp2 WHERE cp2.company_id = c.id) AS total,
  SUM(cr.valor_pago)
    + COALESCE((SELECT SUM(cp2.valor_pago) FROM cp_fantasma cp2
                WHERE cp2.company_id = c.id), 0)                  AS valor_total
FROM public.companies c
LEFT JOIN cr_fantasma cr ON cr.company_id = c.id
GROUP BY c.id, c.nome_fantasia
HAVING COUNT(*) > 0 OR EXISTS (SELECT 1 FROM cp_fantasma cp2 WHERE cp2.company_id = c.id)
ORDER BY (COUNT(*) + (SELECT COUNT(*) FROM cp_fantasma cp2 WHERE cp2.company_id = c.id)) DESC;
