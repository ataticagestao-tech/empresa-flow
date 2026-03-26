-- Criar tabela employees se não existir
CREATE TABLE IF NOT EXISTS public.employees (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  name          text,
  role          text,
  email         text,
  phone         text,
  cpf           text,
  rg            text,
  data_nascimento date,
  hire_date     date,
  data_demissao date,
  salary        numeric(12,2),
  salario_base  numeric(12,2),
  tipo_contrato text default 'clt',
  pis           text,
  ctps_numero   text,
  ctps_serie    text,
  banco_folha   text,
  agencia_folha text,
  conta_folha   text,
  tipo_conta_folha text,
  chave_pix_folha text,
  centro_custo_id uuid references public.centros_custo(id) on delete set null,
  status        text not null default 'ativo',
  created_at    timestamptz not null default now()
);

-- Adicionar colunas faltantes caso tabela já exista
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS cpf text,
  ADD COLUMN IF NOT EXISTS rg text,
  ADD COLUMN IF NOT EXISTS data_nascimento date,
  ADD COLUMN IF NOT EXISTS hire_date date,
  ADD COLUMN IF NOT EXISTS data_demissao date,
  ADD COLUMN IF NOT EXISTS salary numeric(12,2),
  ADD COLUMN IF NOT EXISTS salario_base numeric(12,2),
  ADD COLUMN IF NOT EXISTS tipo_contrato text,
  ADD COLUMN IF NOT EXISTS pis text,
  ADD COLUMN IF NOT EXISTS ctps_numero text,
  ADD COLUMN IF NOT EXISTS ctps_serie text,
  ADD COLUMN IF NOT EXISTS banco_folha text,
  ADD COLUMN IF NOT EXISTS agencia_folha text,
  ADD COLUMN IF NOT EXISTS conta_folha text,
  ADD COLUMN IF NOT EXISTS tipo_conta_folha text,
  ADD COLUMN IF NOT EXISTS chave_pix_folha text,
  ADD COLUMN IF NOT EXISTS centro_custo_id uuid,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ativo';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_employees_company ON public.employees(company_id);

-- RLS
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- Policies
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'employees' AND policyname = 'employees_select_own') THEN
    CREATE POLICY employees_select_own ON public.employees FOR SELECT
      USING (company_id IN (
        SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'employees' AND policyname = 'employees_insert_own') THEN
    CREATE POLICY employees_insert_own ON public.employees FOR INSERT
      WITH CHECK (company_id IN (
        SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'employees' AND policyname = 'employees_update_own') THEN
    CREATE POLICY employees_update_own ON public.employees FOR UPDATE
      USING (company_id IN (
        SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'employees' AND policyname = 'employees_delete_own') THEN
    CREATE POLICY employees_delete_own ON public.employees FOR DELETE
      USING (company_id IN (
        SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()
      ));
  END IF;
END $$;
