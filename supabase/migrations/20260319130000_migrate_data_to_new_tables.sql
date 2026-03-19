-- ============================================================
-- MIGRAÇÃO DE DADOS: tabelas antigas → tabelas novas
-- Copia dados existentes preservando IDs
-- ============================================================

-- ------------------------------------------------------------
-- 1. accounts_receivable → contas_receber
-- ------------------------------------------------------------
INSERT INTO public.contas_receber (
  id, company_id, pagador_nome, pagador_cpf_cnpj, valor, valor_pago,
  data_vencimento, data_pagamento, conta_contabil_id,
  forma_recebimento, status, observacoes, created_at, updated_at
)
SELECT
  ar.id,
  ar.company_id,
  COALESCE(c.nome_fantasia, c.razao_social, ar.description, 'Cliente'),
  c.cpf_cnpj,
  ar.amount,
  CASE WHEN ar.status::text = 'paid' THEN ar.amount ELSE NULL END,
  ar.due_date,
  ar.receive_date,
  ar.category_id,
  ar.payment_method,
  CASE ar.status::text
    WHEN 'pending' THEN 'aberto'
    WHEN 'paid' THEN 'pago'
    WHEN 'cancelled' THEN 'cancelado'
    WHEN 'overdue' THEN 'vencido'
    ELSE 'aberto'
  END,
  ar.observations,
  ar.created_at,
  COALESCE(ar.updated_at, ar.created_at)
FROM public.accounts_receivable ar
LEFT JOIN public.clients c ON c.id = ar.client_id
ON CONFLICT (id) DO NOTHING;


-- ------------------------------------------------------------
-- 2. accounts_payable → contas_pagar
-- ------------------------------------------------------------
INSERT INTO public.contas_pagar (
  id, company_id, credor_nome, credor_cpf_cnpj, valor, valor_pago,
  data_vencimento, data_pagamento, conta_contabil_id,
  forma_pagamento, status, observacoes, created_at, updated_at
)
SELECT
  ap.id,
  ap.company_id,
  COALESCE(s.nome_fantasia, s.razao_social, ap.description, 'Fornecedor'),
  s.cpf_cnpj,
  ap.amount,
  CASE WHEN ap.status::text = 'paid' THEN ap.amount ELSE NULL END,
  ap.due_date,
  ap.payment_date,
  ap.category_id,
  ap.payment_method,
  CASE ap.status::text
    WHEN 'pending' THEN 'aberto'
    WHEN 'paid' THEN 'pago'
    WHEN 'cancelled' THEN 'cancelado'
    WHEN 'overdue' THEN 'vencido'
    ELSE 'aberto'
  END,
  ap.observations,
  ap.created_at,
  COALESCE(ap.updated_at, ap.created_at)
FROM public.accounts_payable ap
LEFT JOIN public.suppliers s ON s.id = ap.supplier_id
ON CONFLICT (id) DO NOTHING;


-- ------------------------------------------------------------
-- 3. transactions → movimentacoes
-- ------------------------------------------------------------
INSERT INTO public.movimentacoes (
  id, company_id, conta_bancaria_id, conta_contabil_id,
  conta_receber_id, conta_pagar_id,
  tipo, valor, data, descricao, origem, created_at
)
SELECT
  t.id,
  t.company_id,
  t.bank_account_id,
  t.category_id,
  -- Só inclui FK se o registro existe na nova tabela
  CASE WHEN t.related_receivable_id IN (SELECT id FROM public.contas_receber) THEN t.related_receivable_id ELSE NULL END,
  CASE WHEN t.related_payable_id IN (SELECT id FROM public.contas_pagar) THEN t.related_payable_id ELSE NULL END,
  CASE t.type
    WHEN 'credit' THEN 'credito'
    WHEN 'debit' THEN 'debito'
    ELSE 'credito'
  END,
  t.amount,
  t.date,
  t.description,
  'manual',
  t.created_at
FROM public.transactions t
WHERE t.bank_account_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;


-- ------------------------------------------------------------
-- 4. receipts → recibos_v2
-- ------------------------------------------------------------
INSERT INTO public.recibos_v2 (
  id, company_id, pagador_nome, pagador_cpf_cnpj,
  valor, data, descricao_servico, forma_pagamento,
  numero_sequencial, enviado_email, email_destino, pdf_url, created_at
)
SELECT
  r.id,
  r.company_id,
  r.favorecido,
  NULL,
  r.valor,
  r.data_pagamento::date,
  COALESCE(r.descricao, r.categoria, 'Serviço'),
  r.forma_pagamento,
  ROW_NUMBER() OVER (PARTITION BY r.company_id ORDER BY r.created_at),
  CASE WHEN r.status_email = 'enviado' THEN true ELSE false END,
  r.email_destino,
  r.pdf_url,
  r.created_at
FROM public.receipts r
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- RESULTADO: verificar contagens
-- ============================================================
DO $$
DECLARE
  cr_count integer;
  cp_count integer;
  mv_count integer;
  rc_count integer;
BEGIN
  SELECT count(*) INTO cr_count FROM public.contas_receber;
  SELECT count(*) INTO cp_count FROM public.contas_pagar;
  SELECT count(*) INTO mv_count FROM public.movimentacoes;
  SELECT count(*) INTO rc_count FROM public.recibos_v2;
  RAISE NOTICE 'Migração concluída:';
  RAISE NOTICE '  contas_receber: % registros', cr_count;
  RAISE NOTICE '  contas_pagar: % registros', cp_count;
  RAISE NOTICE '  movimentacoes: % registros', mv_count;
  RAISE NOTICE '  recibos_v2: % registros', rc_count;
END $$;
