-- ============================================================
-- GESTAP — Módulo: Sistema (Adaptado para empresa-flow)
-- Apenas partes aplicáveis: perfis, log, integrações
-- Partes SaaS (tenants, planos, faturas, white-label) removidas
-- ============================================================


-- ------------------------------------------------------------
-- 1. PERFIS DE ACESSO
-- ------------------------------------------------------------
create table if not exists public.perfis_acesso (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid references public.companies(id) on delete cascade,

  nome            text not null,
  descricao       text,
  sistema         boolean not null default false,

  permissoes      jsonb not null default '{}',

  pode_exportar           boolean not null default false,
  pode_deletar            boolean not null default false,
  pode_ver_financeiro     boolean not null default true,
  pode_ver_rh             boolean not null default false,
  acesso_todas_empresas   boolean not null default false,

  ativo           boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.perfis_acesso is
  'Perfis de acesso. company_id NULL = perfis globais do sistema.';

insert into public.perfis_acesso
  (company_id, nome, descricao, sistema, pode_exportar, pode_deletar,
   pode_ver_financeiro, pode_ver_rh, acesso_todas_empresas, permissoes)
values
(null, 'Administrador', 'Acesso total ao sistema', true,
 true, true, true, true, true,
 '{"cadastros":{"ler":true,"escrever":true,"aprovar":true},"financeiro":{"ler":true,"escrever":true,"aprovar":true},"fiscal":{"ler":true,"escrever":true,"aprovar":true},"rh":{"ler":true,"escrever":true,"aprovar":true},"analise":{"ler":true,"escrever":true},"comunicacao":{"ler":true,"escrever":true},"documentos":{"ler":true,"escrever":true},"sistema":{"ler":true,"escrever":true}}'),

(null, 'Financeiro', 'Acesso ao módulo financeiro e relatórios', true,
 true, false, true, false, false,
 '{"cadastros":{"ler":true,"escrever":false},"financeiro":{"ler":true,"escrever":true,"aprovar":true},"fiscal":{"ler":true,"escrever":false},"analise":{"ler":true,"escrever":false},"documentos":{"ler":true,"escrever":true}}'),

(null, 'Contador', 'Acesso fiscal e relatórios contábeis', true,
 true, false, true, false, false,
 '{"cadastros":{"ler":true,"escrever":false},"financeiro":{"ler":true,"escrever":false},"fiscal":{"ler":true,"escrever":true,"aprovar":true},"analise":{"ler":true,"escrever":false},"documentos":{"ler":true,"escrever":true}}'),

(null, 'Visualizador', 'Apenas leitura de relatórios', true,
 false, false, true, false, false,
 '{"financeiro":{"ler":true,"escrever":false},"analise":{"ler":true,"escrever":false},"documentos":{"ler":true,"escrever":false}}'),

(null, 'RH', 'Acesso ao módulo de RH e folha', true,
 true, false, false, true, false,
 '{"cadastros":{"ler":true,"escrever":false},"rh":{"ler":true,"escrever":true,"aprovar":true},"documentos":{"ler":true,"escrever":true}}')
on conflict do nothing;


-- ------------------------------------------------------------
-- 2. LOG DE ATIVIDADES
-- ------------------------------------------------------------
create table if not exists public.log_atividades (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid references public.companies(id),

  usuario_id      uuid references auth.users(id),
  usuario_email   text,

  acao            text not null
                    check (acao in (
                      'criou','editou','deletou','visualizou',
                      'exportou','importou','aprovou','rejeitou',
                      'enviou','recebeu','login','logout','outros'
                    )),
  modulo          text not null,
  entidade_tipo   text,
  entidade_id     uuid,
  entidade_desc   text,

  dados_antes     jsonb,
  dados_depois    jsonb,

  ip_address      text,
  user_agent      text,
  request_id      text,

  created_at      timestamptz not null default now()
);

comment on table public.log_atividades is
  'Log IMUTÁVEL de auditoria. Insert apenas via service_role, select por user_companies.';


-- ------------------------------------------------------------
-- 3. INTEGRAÇÕES
-- ------------------------------------------------------------
create table if not exists public.integracoes (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid references public.companies(id) on delete cascade,

  nome              text not null
                      check (nome in (
                        'resend','evolution_api','sefaz',
                        'prefeitura_nfse','focus_nfe','enotas',
                        'nuvem_fiscal','pluggy','belvo','asaas',
                        'stripe','d4sign','clicksign','govbr',
                        'receita_federal','outros'
                      )),

  config            jsonb,

  status            text not null default 'inativo'
                      check (status in ('ativo','inativo','erro','configurando')),
  ultimo_teste      timestamptz,
  ultimo_erro       text,

  webhook_url       text,
  webhook_secret    text,

  ativo             boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (company_id, nome)
);

comment on table public.integracoes is
  'Credenciais por integração por empresa. config em JSONB. Apenas service_role lê.';


-- ============================================================
-- ÍNDICES
-- ============================================================

create index if not exists idx_perfis_company       on public.perfis_acesso(company_id);

create index if not exists idx_log_company          on public.log_atividades(company_id);
create index if not exists idx_log_usuario          on public.log_atividades(usuario_id);
create index if not exists idx_log_modulo           on public.log_atividades(modulo);
create index if not exists idx_log_entidade         on public.log_atividades(entidade_tipo, entidade_id);
create index if not exists idx_log_created          on public.log_atividades(created_at);

create index if not exists idx_integracoes_company  on public.integracoes(company_id);
create index if not exists idx_integracoes_nome     on public.integracoes(nome);


-- ============================================================
-- TRIGGERS
-- ============================================================

create trigger trg_perfis_updated_at
  before update on public.perfis_acesso
  for each row execute function public.set_updated_at();

create trigger trg_integracoes_updated_at
  before update on public.integracoes
  for each row execute function public.set_updated_at();


-- ============================================================
-- ROW LEVEL SECURITY (auth.uid() + user_companies)
-- ============================================================

alter table public.perfis_acesso    enable row level security;
alter table public.log_atividades   enable row level security;
alter table public.integracoes      enable row level security;

-- perfis: leitura dos próprios + globais (company_id null)
create policy "perfis: leitura" on public.perfis_acesso for select
  using (
    company_id is null
    or company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid())
  );
create policy "perfis: insert" on public.perfis_acesso for insert
  with check (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));
create policy "perfis: update" on public.perfis_acesso for update
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()) and sistema = false);
create policy "perfis: delete" on public.perfis_acesso for delete
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()) and sistema = false);

-- log: leitura por company, insert apenas service_role
create policy "log_atividades: select" on public.log_atividades for select
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));
create policy "log_atividades: insert service_role" on public.log_atividades for insert
  with check (auth.role() = 'service_role');

-- integracoes: apenas service_role (contém credenciais)
create policy "integracoes: service_role" on public.integracoes for all
  using (auth.role() = 'service_role');
