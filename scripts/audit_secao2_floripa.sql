-- Duplicatas exatas em contas_receber da 002 FLORIPA
-- Mostra os 30 grupos com mais duplicatas para entender o padrao

SELECT
  COALESCE(cr.pagador_cpf_cnpj, cr.pagador_nome, '—')       AS pagador,
  cr.valor,
  cr.data_vencimento,
  COUNT(*)                                                   AS quantidade,
  STRING_AGG(cr.status, ' | ' ORDER BY cr.created_at)        AS statuses,
  COUNT(*) FILTER (WHERE cr.created_via_bank_tx_id IS NOT NULL) AS via_extrato,
  STRING_AGG(cr.id::text, E'\n' ORDER BY cr.created_at)      AS ids,
  MIN(cr.created_at)                                         AS primeiro_criado,
  MAX(cr.created_at)                                         AS ultimo_criado
FROM public.contas_receber cr
INNER JOIN public.companies c ON c.id = cr.company_id
WHERE cr.deleted_at IS NULL
  AND c.nome_fantasia = '002 FLORIPA'
GROUP BY cr.company_id, cr.pagador_cpf_cnpj, cr.pagador_nome, cr.valor, cr.data_vencimento
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC, cr.valor DESC
LIMIT 30;
