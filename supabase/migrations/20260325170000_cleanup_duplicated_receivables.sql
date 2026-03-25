-- ============================================================
-- Limpeza de contas_receber e contas_pagar duplicadas
-- Causadas por conciliação múltipla da mesma bank_transaction
-- Mantém apenas o registro mais antigo de cada grupo duplicado
-- ============================================================

-- 1) Identificar contas_receber duplicadas via bank_reconciliation_matches
--    (mesma bank_transaction_id com múltiplos receivable_id)
--    Deletar os duplicados mantendo o mais antigo

DELETE FROM public.contas_receber
WHERE id IN (
  SELECT cr.id
  FROM public.contas_receber cr
  INNER JOIN public.bank_reconciliation_matches brm ON brm.receivable_id = cr.id
  WHERE brm.bank_transaction_id IN (
    -- bank_transactions com mais de 1 match
    SELECT bank_transaction_id
    FROM public.bank_reconciliation_matches
    WHERE receivable_id IS NOT NULL
    GROUP BY bank_transaction_id
    HAVING COUNT(*) > 1
  )
  AND cr.id NOT IN (
    -- Manter apenas o match mais antigo de cada bank_transaction
    SELECT DISTINCT ON (m2.bank_transaction_id) m2.receivable_id
    FROM public.bank_reconciliation_matches m2
    WHERE m2.receivable_id IS NOT NULL
    ORDER BY m2.bank_transaction_id, m2.created_at ASC
  )
);

-- 2) Mesma limpeza para contas_pagar

DELETE FROM public.contas_pagar
WHERE id IN (
  SELECT cp.id
  FROM public.contas_pagar cp
  INNER JOIN public.bank_reconciliation_matches brm ON brm.payable_id = cp.id
  WHERE brm.bank_transaction_id IN (
    SELECT bank_transaction_id
    FROM public.bank_reconciliation_matches
    WHERE payable_id IS NOT NULL
    GROUP BY bank_transaction_id
    HAVING COUNT(*) > 1
  )
  AND cp.id NOT IN (
    SELECT DISTINCT ON (m2.bank_transaction_id) m2.payable_id
    FROM public.bank_reconciliation_matches m2
    WHERE m2.payable_id IS NOT NULL
    ORDER BY m2.bank_transaction_id, m2.created_at ASC
  )
);

-- 3) Limpar matches órfãos (cujo receivable/payable foi deletado acima)

DELETE FROM public.bank_reconciliation_matches
WHERE receivable_id IS NOT NULL
  AND receivable_id NOT IN (SELECT id FROM public.contas_receber);

DELETE FROM public.bank_reconciliation_matches
WHERE payable_id IS NOT NULL
  AND payable_id NOT IN (SELECT id FROM public.contas_pagar);

-- 4) Também limpar contas_receber órfãs que não possuem match mas são duplicatas
--    por pagador_nome + valor + data_vencimento + company_id (mesmo conteúdo)

DELETE FROM public.contas_receber
WHERE id NOT IN (
  -- Manter o mais antigo de cada grupo (pagador + valor + vencimento + empresa)
  SELECT DISTINCT ON (company_id, pagador_nome, valor, data_vencimento) id
  FROM public.contas_receber
  ORDER BY company_id, pagador_nome, valor, data_vencimento, created_at ASC
);

-- 5) Mesma limpeza para contas_pagar órfãs duplicadas

DELETE FROM public.contas_pagar
WHERE id NOT IN (
  SELECT DISTINCT ON (company_id, credor_nome, valor, data_vencimento) id
  FROM public.contas_pagar
  ORDER BY company_id, credor_nome, valor, data_vencimento, created_at ASC
);
