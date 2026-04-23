-- Inspeciona os 2 CR duplicados da HAIR OF BRASIL antes de soft-deletar
-- Queremos saber:
--  - Qual foi criado primeiro (manter esse)
--  - Qual tem movimentacao financeira vinculada (critico, nao deletar esse)
--  - Se algum tem venda_id ou outras FKs

SELECT
  cr.id,
  cr.status,
  cr.valor,
  cr.valor_pago,
  cr.data_vencimento,
  cr.data_pagamento,
  cr.pagador_nome,
  cr.created_at,
  cr.created_via_bank_tx_id,
  (SELECT COUNT(*) FROM public.movimentacoes m
    WHERE m.conta_receber_id = cr.id) AS movs_vinculadas,
  (SELECT COUNT(*) FROM public.bank_reconciliation_matches brm
    WHERE brm.receivable_id = cr.id) AS matches_reconciliacao
FROM public.contas_receber cr
WHERE cr.id IN (
  'a20930d2-2704-46d6-b829-5b937978f6cb',
  'c3744bb7-8560-4b7b-ab63-7baced744532'
)
ORDER BY cr.created_at;
