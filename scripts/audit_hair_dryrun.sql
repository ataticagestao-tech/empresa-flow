SELECT 'CR a soft-deletar' AS item, cr.id::text AS id, cr.valor::text AS valor, cr.status AS extra
FROM public.contas_receber cr WHERE cr.id = 'c3744bb7-8560-4b7b-ab63-7baced744532'
UNION ALL
SELECT 'Movimentacao a deletar', m.id::text, m.valor::text, LEFT(m.descricao, 60)
FROM public.movimentacoes m WHERE m.conta_receber_id = 'c3744bb7-8560-4b7b-ab63-7baced744532'
UNION ALL
SELECT 'Match a deletar', brm.id::text, brm.matched_amount::text, brm.status
FROM public.bank_reconciliation_matches brm WHERE brm.receivable_id = 'c3744bb7-8560-4b7b-ab63-7baced744532'
UNION ALL
SELECT 'CR mantido', cr.id::text, cr.valor::text, cr.status
FROM public.contas_receber cr WHERE cr.id = 'a20930d2-2704-46d6-b829-5b937978f6cb';
