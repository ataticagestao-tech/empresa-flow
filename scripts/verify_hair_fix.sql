-- Verifica se a limpeza foi aplicada corretamente

SELECT
  'CR mantido (deve estar ativo)'  AS verificacao,
  cr.id::text                       AS id,
  cr.status                         AS status,
  cr.valor::text                    AS valor,
  cr.deleted_at::text               AS deletado_em
FROM public.contas_receber cr
WHERE cr.id = 'a20930d2-2704-46d6-b829-5b937978f6cb'

UNION ALL

SELECT
  'CR duplicado (deve estar soft-deleted)',
  cr.id::text,
  cr.status,
  cr.valor::text,
  cr.deleted_at::text
FROM public.contas_receber cr
WHERE cr.id = 'c3744bb7-8560-4b7b-ab63-7baced744532'

UNION ALL

SELECT
  'Movimentacao duplicada (NAO deve existir)',
  COALESCE(m.id::text, 'deletada com sucesso'),
  'n/a',
  COALESCE(m.valor::text, '—'),
  'n/a'
FROM (SELECT 1) dummy
LEFT JOIN public.movimentacoes m ON m.id = '98462d49-576f-41c3-be47-76b1ba8451fb'

UNION ALL

SELECT
  'Match duplicado (NAO deve existir)',
  COALESCE(brm.id::text, 'deletado com sucesso'),
  COALESCE(brm.status, 'n/a'),
  COALESCE(brm.matched_amount::text, '—'),
  'n/a'
FROM (SELECT 1) dummy
LEFT JOIN public.bank_reconciliation_matches brm ON brm.id = '90f48cc9-28d2-44db-8678-1419732ef693'

UNION ALL

-- Reexecuta a Secao 6 — deve retornar 0 linhas
SELECT
  'Duplicatas restantes no sistema',
  COUNT(*)::text,
  'n/a',
  'n/a',
  'n/a'
FROM (
  SELECT bt.id
  FROM public.bank_transactions bt
  INNER JOIN public.contas_receber cr
    ON cr.created_via_bank_tx_id = bt.id AND cr.deleted_at IS NULL
  GROUP BY bt.id
  HAVING COUNT(cr.id) > 1
) sub;
