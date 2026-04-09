-- Fix: constraint employees_status_check rejeita valores válidos
-- Normalizar status existentes e recriar constraint permissiva

-- 1) Drop constraint antiga
ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_status_check;

-- 2) Normalizar todos os status para lowercase
UPDATE public.employees SET status = lower(trim(status))
  WHERE status IS DISTINCT FROM lower(trim(status));

-- 3) Recriar constraint com todos os status aceitos
ALTER TABLE public.employees
  ADD CONSTRAINT employees_status_check
  CHECK (lower(status) IN ('ativo', 'inativo', 'ferias', 'afastado', 'demitido'));

-- 4) Remover NOT NULL de campos que não devem ser obrigatórios
ALTER TABLE public.employees ALTER COLUMN name DROP NOT NULL;
ALTER TABLE public.employees ALTER COLUMN status SET DEFAULT 'ativo';
