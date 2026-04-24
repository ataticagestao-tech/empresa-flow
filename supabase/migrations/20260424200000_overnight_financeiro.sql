-- ============================================================
-- GESTAP — Módulo: Overnight Financeiro
-- Relatório diário em PDF com resumo financeiro, disparado às 18h
-- Dependências: gestap_financeiro (companies, contas_*, movimentacoes)
-- ============================================================


-- ------------------------------------------------------------
-- 1. CONFIGURAÇÃO POR EMPRESA
-- ------------------------------------------------------------
create table if not exists public.overnight_config (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,

  frase_noite     text,                     -- frase livre editada pelo admin (limite 200 chars aplicado na UI)
  ativa           boolean not null default true,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (company_id)
);

comment on table public.overnight_config is
  'Configuração do Overnight Financeiro por empresa. frase_noite vai no PDF; ativa controla o envio do cron.';


-- ------------------------------------------------------------
-- 2. LOG DE GERAÇÕES
-- ------------------------------------------------------------
create table if not exists public.overnight_logs (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,

  gerado_em       timestamptz not null default now(),
  status          text not null default 'sucesso'
                    check (status in ('sucesso','erro')),
  tamanho_bytes   integer,
  storage_path    text,
  erro_descricao  text,

  origem          text not null default 'manual'
                    check (origem in ('manual','agendado')),

  created_at      timestamptz not null default now()
);

comment on table public.overnight_logs is
  'Log imutável de cada geração do Overnight (manual ou agendada). Nunca delete — use para auditoria.';


-- ------------------------------------------------------------
-- ÍNDICES
-- ------------------------------------------------------------
create index if not exists idx_overnight_config_company on public.overnight_config(company_id);
create index if not exists idx_overnight_logs_company   on public.overnight_logs(company_id);
create index if not exists idx_overnight_logs_gerado    on public.overnight_logs(gerado_em desc);


-- ------------------------------------------------------------
-- TRIGGER updated_at
-- ------------------------------------------------------------
drop trigger if exists trg_overnight_config_updated_at on public.overnight_config;
create trigger trg_overnight_config_updated_at
  before update on public.overnight_config
  for each row execute function public.set_updated_at();


-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table public.overnight_config enable row level security;
alter table public.overnight_logs   enable row level security;

-- overnight_config: CRUD pelo tenant
drop policy if exists "overnight_config: select" on public.overnight_config;
create policy "overnight_config: select"
  on public.overnight_config for select
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

drop policy if exists "overnight_config: insert" on public.overnight_config;
create policy "overnight_config: insert"
  on public.overnight_config for insert
  with check (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

drop policy if exists "overnight_config: update" on public.overnight_config;
create policy "overnight_config: update"
  on public.overnight_config for update
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

drop policy if exists "overnight_config: delete" on public.overnight_config;
create policy "overnight_config: delete"
  on public.overnight_config for delete
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

-- overnight_logs: leitura pelo tenant, insert apenas service_role (edge function)
drop policy if exists "overnight_logs: select" on public.overnight_logs;
create policy "overnight_logs: select"
  on public.overnight_logs for select
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

drop policy if exists "overnight_logs: insert service_role" on public.overnight_logs;
create policy "overnight_logs: insert service_role"
  on public.overnight_logs for insert
  with check (auth.role() = 'service_role');
