-- Multiplos CR/CP apontando para MESMA bank_transaction
-- Este e o padrao CLASSICO do bug: conciliacao feita 2x
-- gerou 2+ CR/CP para a mesma linha de extrato.

-- 6a. Contas a Receber
SELECT
  c.nome_fantasia        AS empresa,
  bt.date                AS data_extrato,
  bt.amount              AS valor_extrato,
  LEFT(bt.description, 60) AS descricao,
  COUNT(cr.id)           AS cr_vinculados,
  SUM(cr.valor)          AS soma_cr,
  STRING_AGG(cr.id::text, ' | ' ORDER BY cr.created_at) AS cr_ids
FROM public.bank_transactions bt
INNER JOIN public.contas_receber cr
  ON cr.created_via_bank_tx_id = bt.id AND cr.deleted_at IS NULL
INNER JOIN public.companies c ON c.id = bt.company_id
GROUP BY c.nome_fantasia, bt.id, bt.date, bt.amount, bt.description
HAVING COUNT(cr.id) > 1
ORDER BY COUNT(cr.id) DESC, bt.date DESC
LIMIT 50;
