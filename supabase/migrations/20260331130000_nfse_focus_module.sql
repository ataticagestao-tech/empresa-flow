-- ============================================================
-- NFSe Focus NF-e — Configuracoes, Emissoes e Eventos
-- Depende de: companies, clients
-- Padrao multi-tenant: company_id
-- ============================================================

-- 1. Configuracoes do prestador para emissao NFSe
create table if not exists public.nfse_configuracoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,

  cnpj varchar(18) not null,
  inscricao_municipal varchar(20) not null,
  codigo_municipio integer not null, -- Codigo IBGE

  natureza_operacao integer not null default 1,
  optante_simples_nacional boolean not null default false,
  regime_especial_tributacao integer,

  aliquota_padrao numeric(5,2) default 3.00,
  item_lista_servico_padrao varchar(10),
  codigo_cnae_padrao varchar(10),
  discriminacao_padrao text,

  token_homologacao text,
  token_producao text,
  ambiente varchar(12) not null default 'homologacao',

  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(company_id)
);

-- 2. Emissoes NFSe
create table if not exists public.nfse_emissoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  configuracao_id uuid references public.nfse_configuracoes(id),

  referencia varchar(50) not null,
  cliente_id uuid,

  -- Snapshot tomador
  tomador_tipo_documento varchar(4) not null default 'cnpj',
  tomador_documento varchar(18) not null,
  tomador_razao_social varchar(200) not null,
  tomador_email varchar(200),
  tomador_telefone varchar(20),
  tomador_logradouro varchar(200),
  tomador_numero varchar(20),
  tomador_complemento varchar(100),
  tomador_bairro varchar(100),
  tomador_codigo_municipio integer,
  tomador_uf varchar(2),
  tomador_cep varchar(10),

  -- Servico
  discriminacao text not null,
  valor_servicos numeric(15,2) not null,
  aliquota numeric(5,2) not null,
  valor_iss numeric(15,2),
  iss_retido boolean not null default false,
  item_lista_servico varchar(10) not null,
  codigo_cnae varchar(10),
  codigo_tributacao_municipio varchar(20),

  valor_deducoes numeric(15,2) default 0,
  desconto_incondicionado numeric(15,2) default 0,
  desconto_condicionado numeric(15,2) default 0,
  valor_liquido numeric(15,2),

  valor_pis numeric(15,2) default 0,
  valor_cofins numeric(15,2) default 0,
  valor_csll numeric(15,2) default 0,
  valor_ir numeric(15,2) default 0,
  valor_inss numeric(15,2) default 0,

  -- Emissao
  data_emissao timestamptz not null default now(),
  competencia date,

  status varchar(30) not null default 'rascunho',
  numero_nfse varchar(20),
  codigo_verificacao varchar(50),
  protocolo varchar(50),
  url_xml text,
  url_pdf text,

  mensagem_retorno text,
  erros_validacao jsonb,

  cancelada_em timestamptz,
  justificativa_cancelamento text,
  url_xml_cancelamento text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,

  unique(company_id, referencia)
);

create index if not exists idx_nfse_emissoes_company on public.nfse_emissoes(company_id);
create index if not exists idx_nfse_emissoes_status on public.nfse_emissoes(company_id, status);
create index if not exists idx_nfse_emissoes_data on public.nfse_emissoes(company_id, data_emissao desc);
create index if not exists idx_nfse_emissoes_ref on public.nfse_emissoes(referencia);

-- 3. Log de eventos
create table if not exists public.nfse_eventos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  emissao_id uuid not null references public.nfse_emissoes(id) on delete cascade,

  tipo varchar(30) not null,
  request_payload jsonb,
  response_payload jsonb,
  http_status integer,
  mensagem text,
  created_at timestamptz not null default now()
);

create index if not exists idx_nfse_eventos_emissao on public.nfse_eventos(emissao_id);

-- RLS
alter table public.nfse_configuracoes enable row level security;
alter table public.nfse_emissoes enable row level security;
alter table public.nfse_eventos enable row level security;

-- Policies usando user_companies
create policy "nfse_config_tenant" on public.nfse_configuracoes for all
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));

create policy "nfse_emissoes_tenant" on public.nfse_emissoes for all
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));

create policy "nfse_eventos_tenant" on public.nfse_eventos for all
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));

-- Triggers updated_at
create trigger trg_nfse_config_updated before update on public.nfse_configuracoes
  for each row execute function public.set_updated_at();

create trigger trg_nfse_emissoes_updated before update on public.nfse_emissoes
  for each row execute function public.set_updated_at();
