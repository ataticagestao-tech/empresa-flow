-- Adicionar colunas faltantes em employees
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS cpf text,
  ADD COLUMN IF NOT EXISTS hire_date date,
  ADD COLUMN IF NOT EXISTS salary numeric(12,2),
  ADD COLUMN IF NOT EXISTS data_demissao date,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ativo';
