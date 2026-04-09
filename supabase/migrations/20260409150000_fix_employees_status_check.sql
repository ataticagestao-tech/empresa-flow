-- Fix: permitir status 'inativo' na tabela employees
-- Erro: "new row for relation employees violates check constraint employees_status_check"

-- 1) Remove a constraint antiga
ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_status_check;

-- 2) Normalizar: converter tudo para minúsculo (Ativo->ativo, Afastado->afastado)
UPDATE public.employees SET status = lower(trim(status));

-- 3) Recriar constraint
ALTER TABLE public.employees
  ADD CONSTRAINT employees_status_check
  CHECK (status IN ('ativo', 'inativo', 'ferias', 'afastado', 'demitido'));
