-- =====================================================================
-- Cadastro automatizado via WhatsApp — suporte a CLIENTE
-- Estende cadastro_solicitacoes para aceitar tipo='cliente' com alvo
-- em public.clients (customer_id).
-- =====================================================================

-- Novo alvo: cliente
ALTER TABLE public.cadastro_solicitacoes
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

-- tipo passa a aceitar 'cliente'
ALTER TABLE public.cadastro_solicitacoes
  DROP CONSTRAINT IF EXISTS cadastro_solicitacoes_tipo_check;
ALTER TABLE public.cadastro_solicitacoes
  ADD CONSTRAINT cadastro_solicitacoes_tipo_check
  CHECK (tipo IN ('funcionario','fornecedor','cliente'));

-- No máximo um alvo preenchido (employee/supplier/customer)
ALTER TABLE public.cadastro_solicitacoes
  DROP CONSTRAINT IF EXISTS cadastro_target_check;
ALTER TABLE public.cadastro_solicitacoes
  ADD CONSTRAINT cadastro_target_check CHECK (
    (employee_id IS NOT NULL)::int
    + (supplier_id IS NOT NULL)::int
    + (customer_id IS NOT NULL)::int <= 1
  );

-- Coerência tipo vs alvo
ALTER TABLE public.cadastro_solicitacoes
  DROP CONSTRAINT IF EXISTS cadastro_tipo_alvo_check;
ALTER TABLE public.cadastro_solicitacoes
  ADD CONSTRAINT cadastro_tipo_alvo_check CHECK (
    (tipo = 'funcionario' AND supplier_id IS NULL AND customer_id IS NULL) OR
    (tipo = 'fornecedor'  AND employee_id IS NULL AND customer_id IS NULL) OR
    (tipo = 'cliente'     AND employee_id IS NULL AND supplier_id IS NULL)
  );
