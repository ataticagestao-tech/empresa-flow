-- ============================================================
-- FIX: Preencher credor_nome e pagador_nome com description original
-- quando ficaram vazios ou como 'Fornecedor'/'Cliente'
-- ============================================================

-- Desabilitar triggers temporariamente para permitir update em registros pagos
ALTER TABLE public.contas_pagar DISABLE TRIGGER USER;
ALTER TABLE public.contas_receber DISABLE TRIGGER USER;

-- Contas a Pagar: preencher credor_nome com description do accounts_payable
UPDATE public.contas_pagar cp
SET credor_nome = ap.description
FROM public.accounts_payable ap
WHERE cp.id = ap.id
  AND (cp.credor_nome IS NULL OR cp.credor_nome = 'Fornecedor' OR cp.credor_nome = '');

-- Contas a Pagar: preencher observacoes com description quando observacoes está vazio
UPDATE public.contas_pagar cp
SET observacoes = ap.description
FROM public.accounts_payable ap
WHERE cp.id = ap.id
  AND (cp.observacoes IS NULL OR cp.observacoes = '');

-- Contas a Receber: preencher pagador_nome com description do accounts_receivable
UPDATE public.contas_receber cr
SET pagador_nome = ar.description
FROM public.accounts_receivable ar
WHERE cr.id = ar.id
  AND (cr.pagador_nome IS NULL OR cr.pagador_nome = 'Cliente' OR cr.pagador_nome = '');

-- Contas a Receber: preencher observacoes com description quando observacoes está vazio
UPDATE public.contas_receber cr
SET observacoes = ar.description
FROM public.accounts_receivable ar
WHERE cr.id = ar.id
  AND (cr.observacoes IS NULL OR cr.observacoes = '');

-- Reabilitar triggers
ALTER TABLE public.contas_pagar ENABLE TRIGGER USER;
ALTER TABLE public.contas_receber ENABLE TRIGGER USER;
