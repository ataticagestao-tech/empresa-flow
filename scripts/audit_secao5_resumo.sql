-- Resumo: quantos CR/CP estao marcados como pagos/conciliados mas sem movimentacao
-- Ajuda a dimensionar antes de listar detalhes.

SELECT
  'contas_receber' AS tabela,
  COUNT(*) AS pagos_sem_movimentacao,
  SUM(cr.valor_pago) AS soma_valores
FROM public.contas_receber cr
WHERE cr.deleted_at IS NULL
  AND cr.status IN ('pago', 'conciliado', 'parcial')
  AND cr.valor_pago > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.movimentacoes m
    WHERE m.conta_receber_id = cr.id
  )

UNION ALL

SELECT
  'contas_pagar',
  COUNT(*),
  SUM(cp.valor_pago)
FROM public.contas_pagar cp
WHERE cp.deleted_at IS NULL
  AND cp.status IN ('pago', 'conciliado', 'parcial')
  AND cp.valor_pago > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.movimentacoes m
    WHERE m.conta_pagar_id = cp.id
  );
