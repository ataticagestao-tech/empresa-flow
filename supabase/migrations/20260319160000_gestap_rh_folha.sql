-- ============================================================
-- GESTAP — Módulo: RH & Folha (Adaptado para empresa-flow)
-- Usa company_id → companies, employees (não funcionarios)
-- RLS via auth.uid() + user_companies
-- Dependências:
--   20260318120000_gestap_cadastros_enhancements.sql (employees, centros_custo)
--   20260319120000_gestap_financeiro.sql (contas_pagar)
-- ============================================================


-- ------------------------------------------------------------
-- 1. FOLHA DE PAGAMENTO
-- ------------------------------------------------------------
create table if not exists public.folha_pagamento (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  employee_id       uuid not null references public.employees(id) on delete cascade,

  competencia       text not null,
  tipo              text not null default 'mensal'
                      check (tipo in (
                        'mensal','ferias','rescisao',
                        '13_primeiro','13_segundo','adiantamento'
                      )),

  -- Proventos
  salario_base        numeric(12,2) not null,
  horas_extras_50     numeric(8,2)  not null default 0,
  horas_extras_100    numeric(8,2)  not null default 0,
  valor_he_50         numeric(12,2) not null default 0,
  valor_he_100        numeric(12,2) not null default 0,
  adicional_noturno   numeric(12,2) not null default 0,
  periculosidade      numeric(12,2) not null default 0,
  insalubridade       numeric(12,2) not null default 0,
  outros_proventos    numeric(12,2) not null default 0,
  total_proventos     numeric(12,2) not null default 0,

  -- Descontos
  inss_funcionario    numeric(12,2) not null default 0,
  irrf                numeric(12,2) not null default 0,
  vale_transporte     numeric(12,2) not null default 0,
  vale_refeicao       numeric(12,2) not null default 0,
  plano_saude         numeric(12,2) not null default 0,
  adiantamento_desc   numeric(12,2) not null default 0,
  outros_descontos    numeric(12,2) not null default 0,
  total_descontos     numeric(12,2) not null default 0,

  -- Líquido
  valor_liquido       numeric(12,2) not null default 0,

  -- Encargos patronais
  fgts_mes            numeric(12,2) not null default 0,
  inss_patronal       numeric(12,2) not null default 0,

  -- Controle
  status              text not null default 'rascunho'
                        check (status in ('rascunho','fechada','paga','retificada')),
  holerite_url        text,
  conta_pagar_id      uuid references public.contas_pagar(id) on delete set null,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (company_id, employee_id, competencia, tipo)
);

create table if not exists public.folha_itens (
  id              uuid primary key default gen_random_uuid(),
  folha_id        uuid not null references public.folha_pagamento(id) on delete cascade,

  tipo            text not null check (tipo in ('provento','desconto')),
  codigo_verba    text not null,
  descricao       text not null,
  referencia      numeric(10,4),
  valor           numeric(12,2) not null
);

comment on table public.folha_pagamento is
  'Uma linha por funcionário por competência por tipo. status=fechada bloqueia edição.';
comment on column public.folha_pagamento.competencia is
  'Formato YYYY-MM. unique(company, employee, competencia, tipo) evita duplicatas.';


-- ------------------------------------------------------------
-- 2. PONTO ELETRÔNICO
-- ------------------------------------------------------------
create table if not exists public.ponto_eletronico (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  employee_id       uuid not null references public.employees(id) on delete cascade,

  data              date not null,
  entrada           time,
  saida_almoco      time,
  retorno_almoco    time,
  saida             time,

  -- Calculados
  horas_trabalhadas numeric(5,2),
  horas_extras_50   numeric(5,2) not null default 0,
  horas_extras_100  numeric(5,2) not null default 0,
  banco_horas_saldo numeric(5,2) not null default 0,

  -- Justificativa
  justificativa     text,
  tipo_ausencia     text check (tipo_ausencia in (
                      'falta','atraso','atestado','folga','feriado','outros'
                    )),

  -- Aprovação
  aprovado          boolean not null default false,
  aprovado_por      uuid references auth.users(id),

  -- Origem
  origem            text not null default 'manual'
                      check (origem in ('manual','importado','sistema')),

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (employee_id, data)
);

comment on table public.ponto_eletronico is
  'Um registro por funcionário por dia. horas_trabalhadas calculadas no insert/update via backend.';


-- ------------------------------------------------------------
-- 3. FÉRIAS & AFASTAMENTOS
-- ------------------------------------------------------------
create table if not exists public.ferias_afastamentos (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies(id) on delete cascade,
  employee_id           uuid not null references public.employees(id) on delete cascade,

  tipo                  text not null
                          check (tipo in (
                            'ferias','licenca_maternidade','licenca_paternidade',
                            'atestado','afastamento_inss','suspensao','outros'
                          )),

  -- Período aquisitivo (apenas para férias)
  periodo_aquisitivo_inicio   date,
  periodo_aquisitivo_fim      date,

  -- Período de gozo
  data_inicio           date not null,
  data_fim              date not null,
  dias_corridos         integer generated always as (
                          (data_fim - data_inicio + 1)
                        ) stored,

  -- Abono pecuniário (venda de férias)
  dias_abono            integer not null default 0,
  valor_ferias          numeric(12,2),
  valor_abono           numeric(12,2),
  inss_ferias           numeric(12,2),
  irrf_ferias           numeric(12,2),

  -- Documento
  documento_url         text,
  cid                   text,  -- para atestados médicos

  -- Controle
  status                text not null default 'programado'
                          check (status in ('programado','em_curso','concluido','cancelado')),
  folha_id              uuid references public.folha_pagamento(id) on delete set null,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.ferias_afastamentos is
  'Férias e afastamentos por funcionário. dias_corridos calculado automaticamente.';
comment on column public.ferias_afastamentos.cid is
  'Código CID do atestado médico. Armazene apenas quando necessário por compliance.';


-- ------------------------------------------------------------
-- 4. ENCARGOS (FGTS / INSS / IRRF)
-- ------------------------------------------------------------
create table if not exists public.encargos (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,

  competencia       text not null,

  -- FGTS
  fgts_total        numeric(12,2) not null default 0,
  fgts_multa        numeric(12,2) not null default 0,

  -- INSS
  inss_patronal     numeric(12,2) not null default 0,
  inss_funcionarios numeric(12,2) not null default 0,
  inss_total        numeric(12,2) generated always as (inss_patronal + inss_funcionarios) stored,

  -- IRRF
  irrf_retido       numeric(12,2) not null default 0,

  -- RAT / FAP
  rat_fap           numeric(12,2) not null default 0,

  -- Total e vencimentos
  total_encargos    numeric(12,2) not null default 0,
  data_venc_fgts    date,
  data_venc_inss    date,
  data_venc_irrf    date,

  -- Status por guia
  status_fgts       text not null default 'pendente'
                      check (status_fgts in ('pendente','recolhido','atrasado')),
  status_inss       text not null default 'pendente'
                      check (status_inss in ('pendente','recolhido','atrasado')),
  status_irrf       text not null default 'pendente'
                      check (status_irrf in ('pendente','recolhido','atrasado')),

  -- Guias geradas
  guia_fgts_url     text,
  guia_inss_url     text,
  guia_irrf_url     text,

  -- Vínculos com CP
  cp_fgts_id        uuid references public.contas_pagar(id) on delete set null,
  cp_inss_id        uuid references public.contas_pagar(id) on delete set null,
  cp_irrf_id        uuid references public.contas_pagar(id) on delete set null,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (company_id, competencia)
);

comment on table public.encargos is
  'Consolidado de encargos por empresa por mês. Cada guia gera um CP separado.';


-- ------------------------------------------------------------
-- 5. ADMISSÕES E DEMISSÕES
-- ------------------------------------------------------------
create table if not exists public.admissoes_demissoes (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  employee_id       uuid not null references public.employees(id) on delete cascade,

  tipo              text not null check (tipo in ('admissao','demissao')),
  data_evento       date not null,

  -- Campos de demissão
  motivo_demissao   text check (motivo_demissao in (
                      'sem_justa_causa','justa_causa',
                      'pedido_demissao','acordo','aposentadoria','outros'
                    )),
  aviso_previo_tipo text check (aviso_previo_tipo in ('trabalhado','indenizado','dispensado')),
  data_aviso        date,
  data_homologacao  date,

  -- Verbas rescisórias
  saldo_salario     numeric(12,2),
  ferias_vencidas   numeric(12,2),
  ferias_prop       numeric(12,2),
  decimo_prop       numeric(12,2),
  aviso_indenizado  numeric(12,2),
  multa_fgts        numeric(12,2),
  outros_verbas     numeric(12,2),
  total_rescisao    numeric(12,2),
  deducoes_rescisao numeric(12,2),
  liquido_rescisao  numeric(12,2),

  -- Documentos
  trct_url          text,
  homologacao_url   text,

  -- Controle
  conta_pagar_id    uuid references public.contas_pagar(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.admissoes_demissoes is
  'Registro de admissão ou demissão. Para demissão sem justa causa, multa_fgts = 40% do saldo FGTS.';


-- ------------------------------------------------------------
-- 6. IMPORTAÇÃO DE FOLHA
-- ------------------------------------------------------------
create table if not exists public.importacao_folha (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies(id) on delete cascade,

  competencia           text not null,
  formato_origem        text not null
                          check (formato_origem in ('txt','csv','xml','dominio','questor','outros')),
  arquivo_url           text,

  -- Resultado
  total_funcionarios    integer,
  total_registros       integer,
  registros_ok          integer,
  registros_erro        integer,

  status                text not null default 'pendente'
                          check (status in ('pendente','processado','erro','duplicado')),
  erro_descricao        text,

  -- Mapeamento de campos (JSONB para flexibilidade por formato)
  mapeamento_campos     jsonb,

  created_at            timestamptz not null default now()
);

comment on table public.importacao_folha is
  'Log de cada importação. mapeamento_campos em JSONB permite configuração por sistema contábil externo.';


-- ============================================================
-- TABELAS DE CONFIGURAÇÃO
-- ============================================================

-- Tabela de alíquotas INSS (atualizada anualmente)
create table if not exists public.config_tabela_inss (
  id              uuid primary key default gen_random_uuid(),
  ano             integer not null,
  faixa_min       numeric(12,2) not null,
  faixa_max       numeric(12,2),
  aliquota        numeric(5,2) not null,
  created_at      timestamptz not null default now(),
  unique (ano, faixa_min)
);

-- Tabela de alíquotas IRRF (atualizada anualmente)
create table if not exists public.config_tabela_irrf (
  id              uuid primary key default gen_random_uuid(),
  ano             integer not null,
  faixa_min       numeric(12,2) not null,
  faixa_max       numeric(12,2),
  aliquota        numeric(5,2) not null,
  deducao         numeric(12,2) not null default 0,
  created_at      timestamptz not null default now(),
  unique (ano, faixa_min)
);

comment on table public.config_tabela_inss is
  'Tabela progressiva INSS. Atualize em janeiro de cada ano sem necessidade de deploy.';
comment on table public.config_tabela_irrf is
  'Tabela progressiva IRRF. Atualize em janeiro de cada ano sem necessidade de deploy.';


-- ============================================================
-- ÍNDICES
-- ============================================================

create index if not exists idx_folha_company        on public.folha_pagamento(company_id);
create index if not exists idx_folha_employee       on public.folha_pagamento(employee_id);
create index if not exists idx_folha_competencia    on public.folha_pagamento(competencia);
create index if not exists idx_folha_status         on public.folha_pagamento(status);
create index if not exists idx_folha_itens_folha    on public.folha_itens(folha_id);

create index if not exists idx_ponto_employee       on public.ponto_eletronico(employee_id);
create index if not exists idx_ponto_data           on public.ponto_eletronico(data);
create index if not exists idx_ponto_company        on public.ponto_eletronico(company_id);

create index if not exists idx_ferias_employee      on public.ferias_afastamentos(employee_id);
create index if not exists idx_ferias_tipo          on public.ferias_afastamentos(tipo);
create index if not exists idx_ferias_status        on public.ferias_afastamentos(status);
create index if not exists idx_ferias_inicio        on public.ferias_afastamentos(data_inicio);

create index if not exists idx_encargos_company     on public.encargos(company_id);
create index if not exists idx_encargos_competencia on public.encargos(competencia);

create index if not exists idx_adm_dem_employee     on public.admissoes_demissoes(employee_id);
create index if not exists idx_adm_dem_tipo         on public.admissoes_demissoes(tipo);
create index if not exists idx_adm_dem_data         on public.admissoes_demissoes(data_evento);

create index if not exists idx_imp_folha_company    on public.importacao_folha(company_id);
create index if not exists idx_imp_folha_competencia on public.importacao_folha(competencia);


-- ============================================================
-- TRIGGERS — updated_at
-- ============================================================

drop trigger if exists trg_folha_updated_at on public.folha_pagamento;
create trigger trg_folha_updated_at
  before update on public.folha_pagamento
  for each row execute function public.set_updated_at();

drop trigger if exists trg_ponto_updated_at on public.ponto_eletronico;
create trigger trg_ponto_updated_at
  before update on public.ponto_eletronico
  for each row execute function public.set_updated_at();

drop trigger if exists trg_ferias_updated_at on public.ferias_afastamentos;
create trigger trg_ferias_updated_at
  before update on public.ferias_afastamentos
  for each row execute function public.set_updated_at();

drop trigger if exists trg_encargos_updated_at on public.encargos;
create trigger trg_encargos_updated_at
  before update on public.encargos
  for each row execute function public.set_updated_at();

drop trigger if exists trg_adm_dem_updated_at on public.admissoes_demissoes;
create trigger trg_adm_dem_updated_at
  before update on public.admissoes_demissoes
  for each row execute function public.set_updated_at();

-- Trigger: bloquear edição de folha fechada
create or replace function public.bloquear_folha_fechada()
returns trigger language plpgsql as $$
begin
  if old.status in ('fechada','paga') and new.status not in ('retificada') then
    raise exception 'Folha com status % não pode ser editada. Use retificação.', old.status;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bloquear_folha_fechada on public.folha_pagamento;
create trigger trg_bloquear_folha_fechada
  before update on public.folha_pagamento
  for each row execute function public.bloquear_folha_fechada();


-- ============================================================
-- ROW LEVEL SECURITY (auth.uid() + user_companies)
-- ============================================================

alter table public.folha_pagamento        enable row level security;
alter table public.folha_itens            enable row level security;
alter table public.ponto_eletronico       enable row level security;
alter table public.ferias_afastamentos    enable row level security;
alter table public.encargos               enable row level security;
alter table public.admissoes_demissoes    enable row level security;
alter table public.importacao_folha       enable row level security;
alter table public.config_tabela_inss     enable row level security;
alter table public.config_tabela_irrf     enable row level security;

-- folha_pagamento
drop policy if exists "folha_pagamento: select" on public.folha_pagamento;
create policy "folha_pagamento: select"
  on public.folha_pagamento for select
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));
drop policy if exists "folha_pagamento: insert" on public.folha_pagamento;
create policy "folha_pagamento: insert"
  on public.folha_pagamento for insert
  with check (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));
drop policy if exists "folha_pagamento: update" on public.folha_pagamento;
create policy "folha_pagamento: update"
  on public.folha_pagamento for update
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));
drop policy if exists "folha_pagamento: delete" on public.folha_pagamento;
create policy "folha_pagamento: delete"
  on public.folha_pagamento for delete
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));

-- folha_itens (via folha_id → folha_pagamento.company_id)
drop policy if exists "folha_itens: select" on public.folha_itens;
create policy "folha_itens: select"
  on public.folha_itens for select
  using (folha_id in (
    select fp.id from public.folha_pagamento fp
    where fp.company_id in (
      select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
    )
  ));
drop policy if exists "folha_itens: insert" on public.folha_itens;
create policy "folha_itens: insert"
  on public.folha_itens for insert
  with check (folha_id in (
    select fp.id from public.folha_pagamento fp
    where fp.company_id in (
      select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
    )
  ));
drop policy if exists "folha_itens: update" on public.folha_itens;
create policy "folha_itens: update"
  on public.folha_itens for update
  using (folha_id in (
    select fp.id from public.folha_pagamento fp
    where fp.company_id in (
      select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
    )
  ));
drop policy if exists "folha_itens: delete" on public.folha_itens;
create policy "folha_itens: delete"
  on public.folha_itens for delete
  using (folha_id in (
    select fp.id from public.folha_pagamento fp
    where fp.company_id in (
      select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
    )
  ));

-- ponto_eletronico
drop policy if exists "ponto_eletronico: select" on public.ponto_eletronico;
create policy "ponto_eletronico: select"
  on public.ponto_eletronico for select
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));
drop policy if exists "ponto_eletronico: insert" on public.ponto_eletronico;
create policy "ponto_eletronico: insert"
  on public.ponto_eletronico for insert
  with check (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));
drop policy if exists "ponto_eletronico: update" on public.ponto_eletronico;
create policy "ponto_eletronico: update"
  on public.ponto_eletronico for update
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));
drop policy if exists "ponto_eletronico: delete" on public.ponto_eletronico;
create policy "ponto_eletronico: delete"
  on public.ponto_eletronico for delete
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));

-- ferias_afastamentos
drop policy if exists "ferias_afastamentos: select" on public.ferias_afastamentos;
create policy "ferias_afastamentos: select"
  on public.ferias_afastamentos for select
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));
drop policy if exists "ferias_afastamentos: insert" on public.ferias_afastamentos;
create policy "ferias_afastamentos: insert"
  on public.ferias_afastamentos for insert
  with check (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));
drop policy if exists "ferias_afastamentos: update" on public.ferias_afastamentos;
create policy "ferias_afastamentos: update"
  on public.ferias_afastamentos for update
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));
drop policy if exists "ferias_afastamentos: delete" on public.ferias_afastamentos;
create policy "ferias_afastamentos: delete"
  on public.ferias_afastamentos for delete
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));

-- encargos
drop policy if exists "encargos: select" on public.encargos;
create policy "encargos: select"
  on public.encargos for select
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));
drop policy if exists "encargos: insert" on public.encargos;
create policy "encargos: insert"
  on public.encargos for insert
  with check (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));
drop policy if exists "encargos: update" on public.encargos;
create policy "encargos: update"
  on public.encargos for update
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));
drop policy if exists "encargos: delete" on public.encargos;
create policy "encargos: delete"
  on public.encargos for delete
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));

-- admissoes_demissoes
drop policy if exists "admissoes_demissoes: select" on public.admissoes_demissoes;
create policy "admissoes_demissoes: select"
  on public.admissoes_demissoes for select
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));
drop policy if exists "admissoes_demissoes: insert" on public.admissoes_demissoes;
create policy "admissoes_demissoes: insert"
  on public.admissoes_demissoes for insert
  with check (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));
drop policy if exists "admissoes_demissoes: update" on public.admissoes_demissoes;
create policy "admissoes_demissoes: update"
  on public.admissoes_demissoes for update
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));
drop policy if exists "admissoes_demissoes: delete" on public.admissoes_demissoes;
create policy "admissoes_demissoes: delete"
  on public.admissoes_demissoes for delete
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));

-- importacao_folha
drop policy if exists "importacao_folha: select" on public.importacao_folha;
create policy "importacao_folha: select"
  on public.importacao_folha for select
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));
drop policy if exists "importacao_folha: insert" on public.importacao_folha;
create policy "importacao_folha: insert"
  on public.importacao_folha for insert
  with check (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));
drop policy if exists "importacao_folha: update" on public.importacao_folha;
create policy "importacao_folha: update"
  on public.importacao_folha for update
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));
drop policy if exists "importacao_folha: delete" on public.importacao_folha;
create policy "importacao_folha: delete"
  on public.importacao_folha for delete
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));

-- Tabelas de config: leitura para todos os autenticados
drop policy if exists "config_inss: leitura autenticada" on public.config_tabela_inss;
create policy "config_inss: leitura autenticada"
  on public.config_tabela_inss for select
  using (auth.role() = 'authenticated');

drop policy if exists "config_irrf: leitura autenticada" on public.config_tabela_irrf;
create policy "config_irrf: leitura autenticada"
  on public.config_tabela_irrf for select
  using (auth.role() = 'authenticated');


-- ============================================================
-- SEED — Tabelas INSS e IRRF 2025
-- ============================================================

insert into public.config_tabela_inss (ano, faixa_min, faixa_max, aliquota) values
  (2025,     0.00,  1518.00, 7.50),
  (2025,  1518.01,  2793.88, 9.00),
  (2025,  2793.89,  4190.83, 12.00),
  (2025,  4190.84,  8157.41, 14.00)
on conflict (ano, faixa_min) do nothing;

insert into public.config_tabela_irrf (ano, faixa_min, faixa_max, aliquota, deducao) values
  (2025,     0.00,  2259.20, 0.00,    0.00),
  (2025,  2259.21,  2826.65, 7.50,  169.44),
  (2025,  2826.66,  3751.05, 15.00, 381.44),
  (2025,  3751.06,  4664.68, 22.50, 662.77),
  (2025,  4664.69,  null,    27.50,  896.00)
on conflict (ano, faixa_min) do nothing;


-- ============================================================
-- VIEW AUXILIAR — custo total por funcionário
-- ============================================================

drop view if exists public.v_custo_funcionario;
create or replace view public.v_custo_funcionario as
select
  f.company_id,
  f.employee_id,
  e."name"                           as funcionario_nome,
  f.competencia,
  f.salario_base,
  f.total_proventos,
  f.valor_liquido,
  f.fgts_mes,
  f.inss_patronal,
  f.fgts_mes + f.inss_patronal      as encargos_patronais,
  f.total_proventos + f.fgts_mes
    + f.inss_patronal               as custo_total_empresa
from public.folha_pagamento f
join public.employees e on e.id = f.employee_id
where f.tipo = 'mensal';

comment on view public.v_custo_funcionario is
  'Custo real por funcionário = salário + encargos patronais. Use no DRE (linha Pessoal).';
