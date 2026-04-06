-- ============================================================
-- Quitar CPs replicadas de FEV e MAR/2026 (todas as 14 unidades)
-- ============================================================

ALTER TABLE public.contas_pagar DISABLE TRIGGER USER;

UPDATE public.contas_pagar
SET status = 'pago',
    valor_pago = valor,
    data_pagamento = data_vencimento
WHERE status = 'aberto'
  AND data_vencimento >= '2026-02-01'
  AND data_vencimento < '2026-04-01'
  AND company_id IN (
    SELECT id FROM public.companies
    WHERE nome_fantasia ILIKE '%001%' OR nome_fantasia ILIKE '%002%' OR nome_fantasia ILIKE '%003%'
      OR nome_fantasia ILIKE '%004%' OR nome_fantasia ILIKE '%005%' OR nome_fantasia ILIKE '%006%'
      OR nome_fantasia ILIKE '%007%' OR nome_fantasia ILIKE '%008%' OR nome_fantasia ILIKE '%009%'
      OR nome_fantasia ILIKE '%010%' OR nome_fantasia ILIKE '%011%' OR nome_fantasia ILIKE '%012%'
      OR nome_fantasia ILIKE '%014%'
      OR nome_fantasia ILIKE '%MOBI KIDS%' OR razao_social ILIKE '%MOBI KIDS%'
  );

ALTER TABLE public.contas_pagar ENABLE TRIGGER USER;
