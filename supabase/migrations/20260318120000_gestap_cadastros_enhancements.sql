-- ============================================================
-- GESTAP — Módulo: Cadastros (Adaptado para empresa-flow)
-- Enriquece tabelas existentes com colunas do schema GESTAP
-- Mantém nomes de tabela originais (companies, bank_accounts, etc.)
-- Mantém RLS existente (auth.uid() + user_companies)
-- ============================================================

-- Extensão UUID (já existe, mas garantir)
create extension if not exists "pgcrypto";

-- ============================================================
-- TRIGGER HELPER (caso não exista)
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ============================================================
-- 1. CENTROS DE CUSTO (NOVA TABELA)
-- Hierarquia de centros de custo por empresa
-- ============================================================
create table if not exists public.centros_custo (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  codigo        text not null,
  descricao     text not null,
  pai_id        uuid references public.centros_custo(id) on delete set null,
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),

  unique (company_id, codigo)
);

comment on table public.centros_custo is
  'Hierarquia de centros de custo por empresa. pai_id permite estrutura em árvore.';

create index if not exists idx_centros_custo_company on public.centros_custo(company_id);
create index if not exists idx_centros_custo_pai     on public.centros_custo(pai_id);

-- RLS
alter table public.centros_custo enable row level security;

drop policy if exists "centros_custo: leitura por empresa" on public.centros_custo;
create policy "centros_custo: leitura por empresa"
  on public.centros_custo for select
  using (company_id in (
    select uc.company_id from public.user_companies uc
    where uc.user_id = auth.uid()
  ));

drop policy if exists "centros_custo: insert por empresa" on public.centros_custo;
create policy "centros_custo: insert por empresa"
  on public.centros_custo for insert
  with check (company_id in (
    select uc.company_id from public.user_companies uc
    where uc.user_id = auth.uid()
  ));

drop policy if exists "centros_custo: update por empresa" on public.centros_custo;
create policy "centros_custo: update por empresa"
  on public.centros_custo for update
  using (company_id in (
    select uc.company_id from public.user_companies uc
    where uc.user_id = auth.uid()
  ));

drop policy if exists "centros_custo: delete por empresa" on public.centros_custo;
create policy "centros_custo: delete por empresa"
  on public.centros_custo for delete
  using (company_id in (
    select uc.company_id from public.user_companies uc
    where uc.user_id = auth.uid()
  ));


-- ============================================================
-- 2. COMPANIES — Adicionar colunas do GESTAP
-- ============================================================
DO $$
BEGIN
  -- Responsável legal
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'responsavel_legal') THEN
    ALTER TABLE public.companies ADD COLUMN responsavel_legal text;
  END IF;

  -- Contador responsável
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'contador_responsavel') THEN
    ALTER TABLE public.companies ADD COLUMN contador_responsavel text;
  END IF;

  -- Data de abertura
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'data_abertura') THEN
    ALTER TABLE public.companies ADD COLUMN data_abertura date;
  END IF;

  -- Complemento endereço (pode já existir como endereco_complemento)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'complemento') THEN
    ALTER TABLE public.companies ADD COLUMN complemento text;
  END IF;
END$$;

comment on column public.companies.responsavel_legal is 'Nome do responsável legal da empresa';
comment on column public.companies.contador_responsavel is 'Nome do contador responsável';
comment on column public.companies.data_abertura is 'Data de abertura/constituição da empresa';


-- ============================================================
-- 3. BANK_ACCOUNTS — Adicionar colunas do GESTAP
-- ============================================================
DO $$
BEGIN
  -- Código do banco (numérico, ex: 001, 341)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bank_accounts' AND column_name = 'codigo_banco') THEN
    ALTER TABLE public.bank_accounts ADD COLUMN codigo_banco text;
  END IF;

  -- Data do saldo inicial
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bank_accounts' AND column_name = 'data_saldo_inicial') THEN
    ALTER TABLE public.bank_accounts ADD COLUMN data_saldo_inicial date;
  END IF;

  -- OFX ativo (importação de extrato)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bank_accounts' AND column_name = 'ofx_ativo') THEN
    ALTER TABLE public.bank_accounts ADD COLUMN ofx_ativo boolean not null default false;
  END IF;

  -- Status da conta (ativa/encerrada/bloqueada)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bank_accounts' AND column_name = 'status') THEN
    ALTER TABLE public.bank_accounts ADD COLUMN status text not null default 'ativa'
      check (status in ('ativa', 'encerrada', 'bloqueada'));
  END IF;

  -- Chave PIX (pode já existir como pix_key)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bank_accounts' AND column_name = 'chave_pix') THEN
    ALTER TABLE public.bank_accounts ADD COLUMN chave_pix text;
  END IF;
END$$;

comment on column public.bank_accounts.codigo_banco is 'Código FEBRABAN do banco (ex: 001, 341, 237)';
comment on column public.bank_accounts.data_saldo_inicial is 'Data de referência do saldo inicial';
comment on column public.bank_accounts.ofx_ativo is 'Se true, permite importação de extrato OFX para conciliação';
comment on column public.bank_accounts.status is 'Status: ativa, encerrada ou bloqueada';


-- ============================================================
-- 4. EMPLOYEES — Adicionar colunas do GESTAP (funcionarios)
-- ============================================================
DO $$
BEGIN
  -- RG
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'rg') THEN
    ALTER TABLE public.employees ADD COLUMN rg text;
  END IF;

  -- Data de nascimento
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'data_nascimento') THEN
    ALTER TABLE public.employees ADD COLUMN data_nascimento date;
  END IF;

  -- Tipo de contrato
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'tipo_contrato') THEN
    ALTER TABLE public.employees ADD COLUMN tipo_contrato text default 'clt'
      check (tipo_contrato in ('clt', 'pj', 'autonomo', 'estagio', 'temporario'));
  END IF;

  -- Data de demissão
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'data_demissao') THEN
    ALTER TABLE public.employees ADD COLUMN data_demissao date;
  END IF;

  -- Salário base (renomear salary se necessário, ou adicionar)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'salario_base') THEN
    ALTER TABLE public.employees ADD COLUMN salario_base numeric(12,2);
  END IF;

  -- PIS
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'pis') THEN
    ALTER TABLE public.employees ADD COLUMN pis text;
  END IF;

  -- CTPS
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'ctps_numero') THEN
    ALTER TABLE public.employees ADD COLUMN ctps_numero text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'ctps_serie') THEN
    ALTER TABLE public.employees ADD COLUMN ctps_serie text;
  END IF;

  -- Dados bancários para folha
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'banco_folha') THEN
    ALTER TABLE public.employees ADD COLUMN banco_folha text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'agencia_folha') THEN
    ALTER TABLE public.employees ADD COLUMN agencia_folha text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'conta_folha') THEN
    ALTER TABLE public.employees ADD COLUMN conta_folha text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'tipo_conta_folha') THEN
    ALTER TABLE public.employees ADD COLUMN tipo_conta_folha text
      check (tipo_conta_folha in ('corrente', 'poupanca', 'pix'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'chave_pix_folha') THEN
    ALTER TABLE public.employees ADD COLUMN chave_pix_folha text;
  END IF;

  -- Centro de custo
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'centro_custo_id') THEN
    ALTER TABLE public.employees ADD COLUMN centro_custo_id uuid references public.centros_custo(id) on delete set null;
  END IF;
END$$;

comment on column public.employees.tipo_contrato is 'Tipo: clt, pj, autonomo, estagio, temporario';
comment on column public.employees.data_demissao is 'Preenchida = funcionário desligado';
comment on column public.employees.pis is 'Número do PIS/PASEP';
comment on column public.employees.ctps_numero is 'Número da CTPS';
comment on column public.employees.centro_custo_id is 'Centro de custo vinculado ao funcionário';


-- ============================================================
-- 5. CHART_OF_ACCOUNTS — Adicionar centro_custo_padrao
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chart_of_accounts' AND column_name = 'centro_custo_padrao') THEN
    ALTER TABLE public.chart_of_accounts ADD COLUMN centro_custo_padrao uuid references public.centros_custo(id) on delete set null;
  END IF;
END$$;

comment on column public.chart_of_accounts.centro_custo_padrao is
  'Centro de custo padrão associado a esta conta contábil';


-- ============================================================
-- ÍNDICES ADICIONAIS
-- ============================================================
create index if not exists idx_employees_company   on public.employees(company_id);
create index if not exists idx_employees_cpf       on public.employees(cpf);
create index if not exists idx_employees_centro    on public.employees(centro_custo_id);


-- ============================================================
-- NOTAS DE IMPLEMENTAÇÃO
-- ============================================================
-- 1. Tabelas mantêm nomes originais (companies, bank_accounts,
--    chart_of_accounts, employees) para compatibilidade.
--
-- 2. RLS mantém padrão auth.uid() + user_companies.
--
-- 3. centros_custo é tabela nova, referenciada por employees
--    e chart_of_accounts.
--
-- 4. Colunas adicionais são todas nullable para não quebrar
--    registros existentes.
--
-- 5. Próximo passo: atualizar frontend para usar novas colunas.
-- ============================================================
