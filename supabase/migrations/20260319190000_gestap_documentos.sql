-- ============================================================
-- GESTAP — Módulo: Documentos (Adaptado para empresa-flow)
-- Usa company_id → companies, RLS via auth.uid() + user_companies
-- Dependências: todos os módulos anteriores
-- ============================================================


-- ------------------------------------------------------------
-- 1. DOCUMENTOS — repositório central
-- ------------------------------------------------------------
create table if not exists public.documentos (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete cascade,

  nome                text not null,
  descricao           text,
  categoria           text not null
                        check (categoria in (
                          'recibo','nota_fiscal','holerite','trct',
                          'guia_imposto','contrato','alvara','certidao',
                          'licenca','procuracao','contrato_social',
                          'relatorio','certificado_digital','outros'
                        )),

  origem              text not null default 'upload'
                        check (origem in ('upload','gerado_sistema','importado')),

  modulo_origem       text,
  entidade_tipo       text,
  entidade_id         uuid,

  storage_path        text not null,
  storage_bucket      text not null default 'documentos',
  mime_type           text,
  tamanho_bytes       bigint,
  hash_sha256         text,

  visivel_cliente     boolean not null default false,
  versao              integer not null default 1,
  documento_anterior_id uuid references public.documentos(id) on delete set null,

  tags                text[],

  enviado_por         uuid references auth.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.documentos is
  'Repositório central de documentos por empresa. storage_path aponta para Supabase Storage.';


-- ------------------------------------------------------------
-- 2. CONTROLE DE VALIDADE
-- ------------------------------------------------------------
create table if not exists public.documentos_validade (
  id                  uuid primary key default gen_random_uuid(),
  documento_id        uuid not null references public.documentos(id) on delete cascade,
  company_id          uuid not null references public.companies(id) on delete cascade,

  data_emissao        date,
  data_validade       date not null,
  orgao_emissor       text,

  alerta_30d          boolean not null default true,
  alerta_60d          boolean not null default false,
  alerta_90d          boolean not null default false,

  status              text not null default 'valido'
                        check (status in ('valido','vencendo','vencido','renovado')),

  renovado_em         date,
  documento_renovado_id uuid references public.documentos(id) on delete set null,

  responsavel         text,
  observacoes         text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.documentos_validade is
  'Controle de vencimento por documento. status atualizado via job noturno baseado em data_validade.';


-- ------------------------------------------------------------
-- 3. ASSINATURAS DIGITAIS
-- ------------------------------------------------------------
create table if not exists public.assinaturas_digitais (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  documento_id        uuid not null references public.documentos(id) on delete cascade,

  provider            text not null default 'clicksign'
                        check (provider in ('clicksign','d4sign','govbr','interno')),
  provider_doc_id     text,
  provider_url        text,

  prazo_assinatura    date,
  ordem_assinatura    boolean not null default false,
  mensagem            text,

  status              text not null default 'rascunho'
                        check (status in (
                          'rascunho','enviado','em_andamento',
                          'concluido','cancelado','expirado'
                        )),

  documento_assinado_id uuid references public.documentos(id) on delete set null,

  criado_por          uuid references auth.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.assinaturas_signatarios (
  id                  uuid primary key default gen_random_uuid(),
  assinatura_id       uuid not null references public.assinaturas_digitais(id) on delete cascade,

  nome                text not null,
  email               text not null,
  cpf                 text,
  tipo                text not null default 'signatario'
                        check (tipo in ('signatario','aprovador','testemunha','parte')),

  ordem               integer not null default 1,

  status              text not null default 'pendente'
                        check (status in ('pendente','assinado','recusado','expirado')),

  assinado_em         timestamptz,
  ip_address          text,
  geolocalizacao      text,
  provider_signer_id  text,

  notificado_em       timestamptz,
  lembrete_enviado    boolean not null default false
);

comment on table public.assinaturas_digitais is
  'Processo de assinatura por documento. Um documento pode ter múltiplos signatários.';


-- ------------------------------------------------------------
-- 4. LOG DE ACESSO A DOCUMENTOS
-- ------------------------------------------------------------
create table if not exists public.documentos_acesso_log (
  id              uuid primary key default gen_random_uuid(),
  documento_id    uuid not null references public.documentos(id) on delete cascade,
  company_id      uuid not null references public.companies(id) on delete cascade,

  usuario_id      uuid references auth.users(id),
  acao            text not null check (acao in ('visualizou','baixou','compartilhou','deletou')),
  ip_address      text,
  user_agent      text,

  created_at      timestamptz not null default now()
);

comment on table public.documentos_acesso_log is
  'Log imutável de acessos. Nunca delete. Exigência de compliance (documentos fiscais 5 anos).';


-- ============================================================
-- POLÍTICA DE RETENÇÃO
-- ============================================================

create table if not exists public.documentos_retencao (
  id                  uuid primary key default gen_random_uuid(),
  categoria           text not null unique,
  anos_retencao       integer not null,
  base_legal          text,
  pode_deletar        boolean not null default false
);

insert into public.documentos_retencao
  (categoria, anos_retencao, base_legal, pode_deletar)
values
  ('nota_fiscal',         5,  'CTN Art. 173 / Lei 9.430/96',   false),
  ('guia_imposto',        5,  'CTN Art. 173',                   false),
  ('holerite',            5,  'CLT Art. 29 / Decreto 3.048/99', false),
  ('trct',               10,  'CLT Art. 11',                    false),
  ('contrato',            5,  'CC Art. 206',                    false),
  ('certidao',            5,  'Variável por tipo',              false),
  ('alvara',              5,  'Variável por município',         false),
  ('licenca',             5,  'Variável por órgão',             false),
  ('recibo',              5,  'CTN Art. 173',                   false),
  ('relatorio',           3,  'Política interna',               true),
  ('outros',              3,  'Política interna',               true)
on conflict (categoria) do nothing;

comment on table public.documentos_retencao is
  'Política de retenção por categoria. Use antes de qualquer operação de delete em documentos.';


-- ============================================================
-- ÍNDICES
-- ============================================================

create index if not exists idx_docs_company          on public.documentos(company_id);
create index if not exists idx_docs_categoria        on public.documentos(categoria);
create index if not exists idx_docs_entidade         on public.documentos(entidade_tipo, entidade_id);
create index if not exists idx_docs_storage_path     on public.documentos(storage_path);
create index if not exists idx_docs_tags             on public.documentos using gin(tags);

create index if not exists idx_docs_val_company      on public.documentos_validade(company_id);
create index if not exists idx_docs_val_validade     on public.documentos_validade(data_validade);
create index if not exists idx_docs_val_status       on public.documentos_validade(status);

create index if not exists idx_assin_company         on public.assinaturas_digitais(company_id);
create index if not exists idx_assin_status          on public.assinaturas_digitais(status);
create index if not exists idx_assin_sig_assinatura  on public.assinaturas_signatarios(assinatura_id);
create index if not exists idx_assin_sig_email       on public.assinaturas_signatarios(email);

create index if not exists idx_docs_log_documento    on public.documentos_acesso_log(documento_id);
create index if not exists idx_docs_log_company      on public.documentos_acesso_log(company_id);
create index if not exists idx_docs_log_usuario      on public.documentos_acesso_log(usuario_id);


-- ============================================================
-- TRIGGERS
-- ============================================================

create trigger trg_documentos_updated_at
  before update on public.documentos
  for each row execute function public.set_updated_at();

create trigger trg_docs_val_updated_at
  before update on public.documentos_validade
  for each row execute function public.set_updated_at();

create trigger trg_assin_updated_at
  before update on public.assinaturas_digitais
  for each row execute function public.set_updated_at();

-- Trigger: bloquear delete de documentos com retenção obrigatória
create or replace function public.proteger_documento_fiscal()
returns trigger language plpgsql as $$
declare
  v_pode_deletar boolean;
  v_anos_retencao integer;
begin
  select pode_deletar, anos_retencao
    into v_pode_deletar, v_anos_retencao
    from public.documentos_retencao
   where categoria = old.categoria;

  if v_pode_deletar is null then
    return old;
  end if;

  if not v_pode_deletar then
    raise exception
      'Documento da categoria % não pode ser deletado (retenção obrigatória: % anos).',
      old.categoria, v_anos_retencao;
  end if;

  if old.created_at > now() - (v_anos_retencao || ' years')::interval then
    raise exception
      'Documento ainda dentro do período de retenção (% anos). Criado em: %.',
      v_anos_retencao, old.created_at;
  end if;

  return old;
end;
$$;

create trigger trg_proteger_documento_fiscal
  before delete on public.documentos
  for each row execute function public.proteger_documento_fiscal();


-- ============================================================
-- ROW LEVEL SECURITY (auth.uid() + user_companies)
-- ============================================================

alter table public.documentos              enable row level security;
alter table public.documentos_validade     enable row level security;
alter table public.assinaturas_digitais    enable row level security;
alter table public.assinaturas_signatarios enable row level security;
alter table public.documentos_acesso_log   enable row level security;
alter table public.documentos_retencao     enable row level security;

-- documentos
create policy "documentos: select" on public.documentos for select
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));
create policy "documentos: insert" on public.documentos for insert
  with check (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));
create policy "documentos: update" on public.documentos for update
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));
create policy "documentos: delete service_role" on public.documentos for delete
  using (auth.role() = 'service_role');

-- documentos_validade
create policy "documentos_validade: select" on public.documentos_validade for select
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));
create policy "documentos_validade: insert" on public.documentos_validade for insert
  with check (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));
create policy "documentos_validade: update" on public.documentos_validade for update
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));
create policy "documentos_validade: delete" on public.documentos_validade for delete
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

-- assinaturas_digitais
create policy "assinaturas_digitais: select" on public.assinaturas_digitais for select
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));
create policy "assinaturas_digitais: insert" on public.assinaturas_digitais for insert
  with check (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));
create policy "assinaturas_digitais: update" on public.assinaturas_digitais for update
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));
create policy "assinaturas_digitais: delete" on public.assinaturas_digitais for delete
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

-- assinaturas_signatarios (via assinatura_id)
create policy "assinaturas_signatarios: select" on public.assinaturas_signatarios for select
  using (assinatura_id in (
    select ad.id from public.assinaturas_digitais ad
    where ad.company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid())
  ));
create policy "assinaturas_signatarios: insert" on public.assinaturas_signatarios for insert
  with check (assinatura_id in (
    select ad.id from public.assinaturas_digitais ad
    where ad.company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid())
  ));
create policy "assinaturas_signatarios: update" on public.assinaturas_signatarios for update
  using (assinatura_id in (
    select ad.id from public.assinaturas_digitais ad
    where ad.company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid())
  ));
create policy "assinaturas_signatarios: delete" on public.assinaturas_signatarios for delete
  using (assinatura_id in (
    select ad.id from public.assinaturas_digitais ad
    where ad.company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid())
  ));

-- Log: leitura pelo tenant, insert via service_role
create policy "documentos_acesso_log: select" on public.documentos_acesso_log for select
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));
create policy "documentos_acesso_log: insert service_role" on public.documentos_acesso_log for insert
  with check (auth.role() = 'service_role');

-- Retenção: leitura para todos os autenticados
create policy "documentos_retencao: leitura" on public.documentos_retencao for select
  using (auth.role() = 'authenticated');


-- ============================================================
-- VIEW AUXILIAR — documentos vencendo
-- ============================================================

create or replace view public.v_documentos_vencendo as
select
  dv.company_id,
  d.id                as documento_id,
  d.nome,
  d.categoria,
  dv.data_validade,
  dv.data_validade - current_date  as dias_restantes,
  dv.orgao_emissor,
  dv.responsavel,
  dv.status,
  case
    when dv.data_validade < current_date           then 'vencido'
    when dv.data_validade <= current_date + 30     then 'critico'
    when dv.data_validade <= current_date + 60     then 'atencao'
    else 'ok'
  end                 as nivel_alerta
from public.documentos_validade dv
join public.documentos d on d.id = dv.documento_id
where dv.status != 'renovado'
order by dv.data_validade;

comment on view public.v_documentos_vencendo is
  'Painel de documentos com vencimento. nivel_alerta: vencido / critico (30d) / atencao (60d) / ok.';
