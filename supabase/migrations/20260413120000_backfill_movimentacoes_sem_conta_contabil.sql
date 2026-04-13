-- ============================================================
-- BACKFILL: Gerar movimentacoes para conciliacoes que o backfill
-- anterior (20260407) nao cobriu por exigir conta_contabil_id IS NOT NULL.
--
-- Problema: a migration 20260407120000 fazia JOIN em chart_of_accounts
-- e filtrava conta_contabil_id IS NOT NULL, entao bank_transactions
-- reconciliadas cujos CR/CP nao tinham categoria ficaram sem movimentacao.
-- Isso faz com que contas como Nubank aparecam zeradas em /movimentacoes.
-- ============================================================

-- 1. Backfill RECEITAS sem conta_contabil_id
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
  cr.conta_contabil_id,             -- pode ser NULL, e esta ok
  bt.reconciled_receivable_id,
  'credito',
  ABS(bt.amount),
  bt.date,
  'Recebimento: ' || COALESCE(cr.pagador_nome, bt.description, 'Conciliacao'),
  'conta_receber',
  'conciliado'
FROM public.bank_transactions bt
JOIN public.contas_receber cr ON cr.id = bt.reconciled_receivable_id
WHERE bt.status = 'reconciled'
  AND bt.reconciled_receivable_id IS NOT NULL
  -- Evitar duplicatas: so inserir se nao existe movimentacao para esse CR + company
  AND NOT EXISTS (
    SELECT 1 FROM public.movimentacoes m
    WHERE m.conta_receber_id = bt.reconciled_receivable_id
      AND m.company_id = bt.company_id
  );

-- 2. Backfill DESPESAS sem conta_contabil_id
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
  cp.conta_contabil_id,             -- pode ser NULL, e esta ok
  bt.reconciled_payable_id,
  'debito',
  ABS(bt.amount),
  bt.date,
  'Pagamento: ' || COALESCE(cp.credor_nome, bt.description, 'Conciliacao'),
  'conta_pagar',
  'conciliado'
FROM public.bank_transactions bt
JOIN public.contas_pagar cp ON cp.id = bt.reconciled_payable_id
WHERE bt.status = 'reconciled'
  AND bt.reconciled_payable_id IS NOT NULL
  -- Evitar duplicatas
  AND NOT EXISTS (
    SELECT 1 FROM public.movimentacoes m
    WHERE m.conta_pagar_id = bt.reconciled_payable_id
      AND m.company_id = bt.company_id
  );

-- 3. Backfill para bank_transactions reconciliadas que NAO tem
--    reconciled_receivable_id NEM reconciled_payable_id
--    (caso edge: conciliacao antiga marcou reconciled mas nao vinculou CR/CP)
INSERT INTO public.movimentacoes (
  company_id,
  conta_bancaria_id,
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
  CASE WHEN bt.amount >= 0 THEN 'credito' ELSE 'debito' END,
  ABS(bt.amount),
  bt.date,
  CASE WHEN bt.amount >= 0
    THEN 'Recebimento: ' || COALESCE(bt.description, 'Conciliacao')
    ELSE 'Pagamento: ' || COALESCE(bt.description, 'Conciliacao')
  END,
  'conciliacao',
  'conciliado'
FROM public.bank_transactions bt
WHERE bt.status = 'reconciled'
  AND bt.reconciled_receivable_id IS NULL
  AND bt.reconciled_payable_id IS NULL
  -- Evitar duplicatas: verificar se ja existe movimentacao para essa data/valor/conta
  AND NOT EXISTS (
    SELECT 1 FROM public.movimentacoes m
    WHERE m.company_id = bt.company_id
      AND m.conta_bancaria_id = bt.bank_account_id
      AND m.data = bt.date
      AND m.valor = ABS(bt.amount)
      AND m.descricao LIKE '%' || LEFT(COALESCE(bt.description, 'Conciliacao'), 30) || '%'
  );

-- 4. Refresh materialized views
SELECT public.refresh_mvs_financeiras();
