-- ============================================================
-- BACKFILL: Gerar movimentacoes para conciliacoes que nao criaram
--
-- Problema: matchTransaction individual chamava RPCs quitar_conta_receber/
-- quitar_conta_pagar que nao existiam, resultando em bank_transactions
-- com status='reconciled' mas sem movimentacao correspondente.
--
-- Esta migration insere movimentacoes retroativamente para todos os
-- bank_reconciliation_matches que nao possuem movimentacao associada.
-- ============================================================

-- 1. Backfill RECEITAS (reconciled_receivable_id)
INSERT INTO public.movimentacoes (
  company_id,
  conta_bancaria_id,
  conta_contabil_id,
  conta_receber_id,
  tipo,
  valor,
  data,
  descricao,
  origem,
  status_conciliacao
)
SELECT
  bt.company_id,
  bt.bank_account_id,
  cr.conta_contabil_id,
  bt.reconciled_receivable_id,
  'credito',
  ABS(bt.amount),
  bt.date,
  'Recebimento: ' || COALESCE(cr.pagador_nome, bt.description, 'Conciliação'),
  'conta_receber',
  'conciliado'
FROM public.bank_transactions bt
JOIN public.contas_receber cr ON cr.id = bt.reconciled_receivable_id
JOIN public.chart_of_accounts coa ON coa.id = cr.conta_contabil_id
WHERE bt.status = 'reconciled'
  AND bt.reconciled_receivable_id IS NOT NULL
  AND cr.conta_contabil_id IS NOT NULL
  -- Evitar duplicatas: so inserir se nao existe movimentacao para esse CR
  AND NOT EXISTS (
    SELECT 1 FROM public.movimentacoes m
    WHERE m.conta_receber_id = bt.reconciled_receivable_id
      AND m.company_id = bt.company_id
  );

-- 2. Backfill DESPESAS (reconciled_payable_id)
INSERT INTO public.movimentacoes (
  company_id,
  conta_bancaria_id,
  conta_contabil_id,
  conta_pagar_id,
  tipo,
  valor,
  data,
  descricao,
  origem,
  status_conciliacao
)
SELECT
  bt.company_id,
  bt.bank_account_id,
  cp.conta_contabil_id,
  bt.reconciled_payable_id,
  'debito',
  ABS(bt.amount),
  bt.date,
  'Pagamento: ' || COALESCE(cp.credor_nome, bt.description, 'Conciliação'),
  'conta_pagar',
  'conciliado'
FROM public.bank_transactions bt
JOIN public.contas_pagar cp ON cp.id = bt.reconciled_payable_id
JOIN public.chart_of_accounts coa ON coa.id = cp.conta_contabil_id
WHERE bt.status = 'reconciled'
  AND bt.reconciled_payable_id IS NOT NULL
  AND cp.conta_contabil_id IS NOT NULL
  -- Evitar duplicatas
  AND NOT EXISTS (
    SELECT 1 FROM public.movimentacoes m
    WHERE m.conta_pagar_id = bt.reconciled_payable_id
      AND m.company_id = bt.company_id
  );

-- 3. Refresh materialized views
SELECT public.refresh_mvs_financeiras();
