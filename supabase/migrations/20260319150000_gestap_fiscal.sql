-- ============================================================
-- GESTAP — Módulo: Fiscal (Adaptado para empresa-flow)
-- Usa company_id → companies, RLS via auth.uid() + user_companies
-- Dependências:
--   20260318120000_gestap_cadastros_enhancements.sql
--   20260319120000_gestap_financeiro.sql (contas_pagar, movimentacoes, vendas, contas_receber)
-- ============================================================


-- ------------------------------------------------------------
-- 1. CERTIFICADOS DIGITAIS
-- Pré-requisito para emissão de NF
-- ------------------------------------------------------------
create table if not exists public.certificados_digitais (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,

  tipo            text not null check (tipo in ('a1', 'a3')),
  titular         text not null,
  cnpj_titular    text not null,
  data_emissao    date,
  data_validade   date not null,

  -- Arquivo armazenado no Supabase Storage (nunca no banco)
  pfx_storage_path  text,

  -- Status calculado a partir de data_validade
  status          text not null default 'valido'
                    check (status in ('valido','vencendo','expirado')),

  -- Alertas configurados
  alerta_30d      boolean not null default true,
  alerta_60d      boolean not null default false,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.certificados_digitais is
  'Certificado A1/A3 por empresa. pfx_storage_path aponta para Supabase Storage — nunca armazene o binário no banco.';
comment on column public.certificados_digitais.status is
  'Atualize via job noturno: vencendo = validade <= 30 dias; expirado = validade < hoje.';


-- ------------------------------------------------------------
-- 2. NOTAS FISCAIS (NF-e / NFS-e / NFC-e)
-- ------------------------------------------------------------
create table if not exists public.notas_fiscais (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete cascade,

  -- Referências de origem
  certificado_id      uuid references public.certificados_digitais(id),
  venda_id            uuid references public.vendas(id) on delete set null,
  conta_receber_id    uuid references public.contas_receber(id) on delete set null,

  -- Identificação
  tipo                text not null check (tipo in ('nfe', 'nfse', 'nfce')),
  numero              text,
  serie               text,
  data_emissao        date not null default current_date,

  -- Tomador
  tomador_nome        text not null,
  tomador_cpf_cnpj    text,
  tomador_email       text,
  tomador_municipio   text,

  -- Valores
  valor_servicos      numeric(15,2),
  valor_produtos      numeric(15,2),
  valor_total         numeric(15,2) not null,
  valor_desconto      numeric(15,2) not null default 0,

  -- Impostos
  valor_iss           numeric(15,2) default 0,
  valor_pis           numeric(15,2) default 0,
  valor_cofins        numeric(15,2) default 0,
  valor_irrf          numeric(15,2) default 0,
  valor_csll          numeric(15,2) default 0,
  aliquota_iss        numeric(5,2)  default 0,
  aliquota_efetiva    numeric(5,2)  default 0,

  -- Autenticação SEFAZ / Prefeitura
  chave_acesso        text unique,
  protocolo_sefaz     text,
  numero_rps          text,
  codigo_verificacao  text,

  -- Arquivos
  xml_url             text,
  danfe_url           text,

  -- Controle
  status              text not null default 'rascunho'
                        check (status in (
                          'rascunho','enviando','autorizada',
                          'cancelada','denegada','rejeitada'
                        )),
  motivo_cancelamento text,
  enviado_email       boolean not null default false,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.nf_itens (
  id              uuid primary key default gen_random_uuid(),
  nota_fiscal_id  uuid not null references public.notas_fiscais(id) on delete cascade,

  descricao       text not null,
  ncm             text,
  cnae            text,
  unidade         text,
  quantidade      numeric(10,3) not null default 1,
  valor_unitario  numeric(15,2) not null,
  valor_total     numeric(15,2) generated always as (quantidade * valor_unitario) stored,

  -- Impostos do item
  aliquota_iss    numeric(5,2),
  aliquota_pis    numeric(5,2),
  aliquota_cofins numeric(5,2)
);

comment on table public.notas_fiscais is
  'NF-e (produtos), NFS-e (serviços) e NFC-e (consumidor). status=rascunho até enviar para SEFAZ/Prefeitura.';
comment on column public.notas_fiscais.chave_acesso is
  '44 dígitos para NF-e. NFS-e usa numero_rps + codigo_verificacao (layout varia por município).';


-- ------------------------------------------------------------
-- 3. APURAÇÃO DE IMPOSTOS
-- ------------------------------------------------------------
create table if not exists public.apuracao_impostos (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete cascade,

  competencia         text not null,  -- formato: 'YYYY-MM'
  regime_tributario   text not null,

  -- Base de cálculo
  receita_bruta       numeric(15,2) not null default 0,
  deducoes            numeric(15,2) not null default 0,
  receita_liquida     numeric(15,2) generated always as (receita_bruta - deducoes) stored,

  -- Simples Nacional
  faturamento_12m     numeric(15,2),
  faixa_simples       text,
  aliquota_nominal    numeric(5,2),
  fator_r             numeric(5,2),
  aliquota_efetiva    numeric(5,2),
  valor_das           numeric(15,2) default 0,

  -- Lucro Presumido / Real
  valor_irpj          numeric(15,2) default 0,
  valor_csll          numeric(15,2) default 0,
  valor_pis           numeric(15,2) default 0,
  valor_cofins        numeric(15,2) default 0,
  valor_iss           numeric(15,2) default 0,
  valor_cpp           numeric(15,2) default 0,

  -- Total
  total_impostos      numeric(15,2) default 0,

  -- Vencimento e recolhimento
  data_vencimento     date not null,
  status              text not null default 'pendente'
                        check (status in ('pendente','apurado','recolhido','retificado')),
  guia_url            text,

  -- Vínculo com CP gerado
  conta_pagar_id      uuid references public.contas_pagar(id) on delete set null,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (company_id, competencia)
);

comment on table public.apuracao_impostos is
  'Uma linha por empresa por mês. Calculada a partir das NFs emitidas e movimentações do período.';
comment on column public.apuracao_impostos.competencia is
  'Formato YYYY-MM. Ex: 2025-03. Unique por empresa garante uma apuração por período.';


-- ------------------------------------------------------------
-- 4. OBRIGAÇÕES ACESSÓRIAS
-- ------------------------------------------------------------
create table if not exists public.obrigacoes_acessorias (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,

  tipo              text not null
                      check (tipo in (
                        'das','pgdas_d','dctf','sped_fiscal',
                        'sped_contrib','destda','reinf','esocial',
                        'dasn_simei','dirf','outros'
                      )),
  competencia       text not null,  -- YYYY-MM ou YYYY
  descricao         text,

  data_vencimento   date not null,
  status            text not null default 'pendente'
                      check (status in ('pendente','entregue','atrasado','dispensado')),

  responsavel       text,
  arquivo_url       text,
  protocolo         text,
  entregue_em       timestamptz,
  observacoes       text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.obrigacoes_acessorias is
  'Calendário fiscal por empresa. Gere via job mensal com base no regime_tributario de empresas.';


-- ------------------------------------------------------------
-- 5. LIVRO CAIXA
-- ------------------------------------------------------------
create table if not exists public.livro_caixa (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,

  -- Vínculo com movimentação (pode ser null para lançamentos manuais)
  movimentacao_id   uuid references public.movimentacoes(id) on delete set null,

  data              date not null,
  tipo              text not null check (tipo in ('receita','despesa')),
  valor             numeric(15,2) not null,
  historico         text not null,
  documento_ref     text,
  competencia       text not null,  -- YYYY-MM
  saldo_acumulado   numeric(15,2),  -- recalculado via trigger

  created_at        timestamptz not null default now()
);

comment on table public.livro_caixa is
  'Espelho das movimentações em formato de livro caixa. Necessário para MEI/autônomo (IRPF).';


-- ------------------------------------------------------------
-- 6. IMPORTAÇÃO DE XML
-- ------------------------------------------------------------
create table if not exists public.importacao_xml (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies(id) on delete cascade,

  -- Dados extraídos do XML
  chave_acesso          text not null,
  tipo_nf               text check (tipo_nf in ('nfe','nfse','nfce')),
  cnpj_emitente         text not null,
  nome_emitente         text,
  cnpj_destinatario     text,
  valor_total           numeric(15,2) not null,
  data_emissao          date not null,

  -- Itens (armazenados como JSONB para flexibilidade)
  itens                 jsonb,

  -- Impostos lidos
  valor_iss             numeric(15,2),
  valor_icms            numeric(15,2),
  valor_ipi             numeric(15,2),

  -- Arquivo
  xml_url               text,
  xml_storage_path      text,

  -- Resultado do processamento
  status                text not null default 'pendente'
                          check (status in ('pendente','processado','duplicado','erro')),
  erro_descricao        text,

  -- Lançamentos gerados
  conta_pagar_id        uuid references public.contas_pagar(id) on delete set null,
  entrada_estoque_id    uuid,  -- FK para estoque (adicionar após gestap_estoque.sql)

  -- Fornecedor reconhecido automaticamente
  fornecedor_id         uuid references public.suppliers(id) on delete set null,

  created_at            timestamptz not null default now(),

  unique (company_id, chave_acesso)
);

comment on table public.importacao_xml is
  'Cada XML importado gera uma linha. status=duplicado = chave_acesso já existe. itens em JSONB para evitar tabela extra.';


-- ============================================================
-- ÍNDICES
-- ============================================================

create index if not exists idx_cert_empresa        on public.certificados_digitais(company_id);
create index if not exists idx_cert_validade        on public.certificados_digitais(data_validade);

create index if not exists idx_nf_empresa           on public.notas_fiscais(company_id);
create index if not exists idx_nf_data_emissao      on public.notas_fiscais(data_emissao);
create index if not exists idx_nf_status            on public.notas_fiscais(status);
create index if not exists idx_nf_chave             on public.notas_fiscais(chave_acesso);
create index if not exists idx_nf_itens_nf          on public.nf_itens(nota_fiscal_id);

create index if not exists idx_apuracao_empresa     on public.apuracao_impostos(company_id);
create index if not exists idx_apuracao_competencia on public.apuracao_impostos(competencia);
create index if not exists idx_apuracao_vencimento  on public.apuracao_impostos(data_vencimento);

create index if not exists idx_obrig_empresa        on public.obrigacoes_acessorias(company_id);
create index if not exists idx_obrig_vencimento     on public.obrigacoes_acessorias(data_vencimento);
create index if not exists idx_obrig_status         on public.obrigacoes_acessorias(status);

create index if not exists idx_livro_empresa        on public.livro_caixa(company_id);
create index if not exists idx_livro_data           on public.livro_caixa(data);
create index if not exists idx_livro_competencia    on public.livro_caixa(competencia);

create index if not exists idx_xml_empresa          on public.importacao_xml(company_id);
create index if not exists idx_xml_chave            on public.importacao_xml(chave_acesso);
create index if not exists idx_xml_emitente         on public.importacao_xml(cnpj_emitente);


-- ============================================================
-- TRIGGERS
-- ============================================================

create trigger trg_cert_updated_at
  before update on public.certificados_digitais
  for each row execute function public.set_updated_at();

create trigger trg_nf_updated_at
  before update on public.notas_fiscais
  for each row execute function public.set_updated_at();

create trigger trg_apuracao_updated_at
  before update on public.apuracao_impostos
  for each row execute function public.set_updated_at();

create trigger trg_obrig_updated_at
  before update on public.obrigacoes_acessorias
  for each row execute function public.set_updated_at();


-- ============================================================
-- ROW LEVEL SECURITY (auth.uid() + user_companies)
-- ============================================================

alter table public.certificados_digitais  enable row level security;
alter table public.notas_fiscais          enable row level security;
alter table public.nf_itens               enable row level security;
alter table public.apuracao_impostos      enable row level security;
alter table public.obrigacoes_acessorias  enable row level security;
alter table public.livro_caixa            enable row level security;
alter table public.importacao_xml         enable row level security;

-- certificados_digitais
create policy "certificados_digitais: select"
  on public.certificados_digitais for select
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));
create policy "certificados_digitais: insert"
  on public.certificados_digitais for insert
  with check (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));
create policy "certificados_digitais: update"
  on public.certificados_digitais for update
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));
create policy "certificados_digitais: delete"
  on public.certificados_digitais for delete
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));

-- notas_fiscais
create policy "notas_fiscais: select"
  on public.notas_fiscais for select
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));
create policy "notas_fiscais: insert"
  on public.notas_fiscais for insert
  with check (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));
create policy "notas_fiscais: update"
  on public.notas_fiscais for update
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));
create policy "notas_fiscais: delete"
  on public.notas_fiscais for delete
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));

-- nf_itens (via nota_fiscal_id → notas_fiscais.company_id)
create policy "nf_itens: select"
  on public.nf_itens for select
  using (nota_fiscal_id in (
    select nf.id from public.notas_fiscais nf
    where nf.company_id in (
      select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
    )
  ));
create policy "nf_itens: insert"
  on public.nf_itens for insert
  with check (nota_fiscal_id in (
    select nf.id from public.notas_fiscais nf
    where nf.company_id in (
      select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
    )
  ));
create policy "nf_itens: update"
  on public.nf_itens for update
  using (nota_fiscal_id in (
    select nf.id from public.notas_fiscais nf
    where nf.company_id in (
      select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
    )
  ));
create policy "nf_itens: delete"
  on public.nf_itens for delete
  using (nota_fiscal_id in (
    select nf.id from public.notas_fiscais nf
    where nf.company_id in (
      select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
    )
  ));

-- apuracao_impostos
create policy "apuracao_impostos: select"
  on public.apuracao_impostos for select
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));
create policy "apuracao_impostos: insert"
  on public.apuracao_impostos for insert
  with check (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));
create policy "apuracao_impostos: update"
  on public.apuracao_impostos for update
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));
create policy "apuracao_impostos: delete"
  on public.apuracao_impostos for delete
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));

-- obrigacoes_acessorias
create policy "obrigacoes_acessorias: select"
  on public.obrigacoes_acessorias for select
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));
create policy "obrigacoes_acessorias: insert"
  on public.obrigacoes_acessorias for insert
  with check (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));
create policy "obrigacoes_acessorias: update"
  on public.obrigacoes_acessorias for update
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));
create policy "obrigacoes_acessorias: delete"
  on public.obrigacoes_acessorias for delete
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));

-- livro_caixa
create policy "livro_caixa: select"
  on public.livro_caixa for select
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));
create policy "livro_caixa: insert"
  on public.livro_caixa for insert
  with check (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));
create policy "livro_caixa: update"
  on public.livro_caixa for update
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));
create policy "livro_caixa: delete"
  on public.livro_caixa for delete
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));

-- importacao_xml
create policy "importacao_xml: select"
  on public.importacao_xml for select
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));
create policy "importacao_xml: insert"
  on public.importacao_xml for insert
  with check (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));
create policy "importacao_xml: update"
  on public.importacao_xml for update
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));
create policy "importacao_xml: delete"
  on public.importacao_xml for delete
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));


-- ============================================================
-- VIEW AUXILIAR — calendário fiscal consolidado
-- ============================================================

create or replace view public.v_calendario_fiscal as
select
  company_id,
  'apuracao'          as modulo,
  competencia,
  data_vencimento,
  status,
  'DAS / Guia'        as descricao
from public.apuracao_impostos
union all
select
  company_id,
  'obrigacao'         as modulo,
  competencia,
  data_vencimento,
  status,
  tipo                as descricao
from public.obrigacoes_acessorias
union all
select
  company_id,
  'certificado'       as modulo,
  to_char(data_validade, 'YYYY-MM') as competencia,
  data_validade       as data_vencimento,
  status,
  'Certificado digital' as descricao
from public.certificados_digitais
order by data_vencimento;

comment on view public.v_calendario_fiscal is
  'Visão unificada de vencimentos fiscais por empresa. Use para o painel de obrigações e alertas.';
