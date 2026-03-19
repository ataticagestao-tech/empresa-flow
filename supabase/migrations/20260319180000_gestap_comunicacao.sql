-- ============================================================
-- GESTAP — Módulo: Comunicação (Adaptado para empresa-flow)
-- Usa company_id → companies, RLS via auth.uid() + user_companies
-- Dependências: todos os módulos anteriores
-- ============================================================


-- ------------------------------------------------------------
-- 1. CONFIGURAÇÃO DE CANAIS
-- ------------------------------------------------------------
create table if not exists public.config_canais (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete cascade,

  canal               text not null check (canal in ('email','whatsapp')),

  -- E-mail (Resend)
  email_remetente     text,
  email_nome_remetente text,
  resend_api_key      text,

  -- WhatsApp (Evolution API)
  whatsapp_numero     text,
  whatsapp_instance   text,
  evolution_api_url   text,
  evolution_api_key   text,

  -- Status
  status              text not null default 'inativo'
                        check (status in ('ativo','inativo','erro')),
  ultimo_teste        timestamptz,
  erro_descricao      text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (company_id, canal)
);

comment on table public.config_canais is
  'Credenciais por canal por empresa. Nunca exponha as API keys via RLS — leia apenas no backend.';


-- ------------------------------------------------------------
-- 2. TEMPLATES DE MENSAGEM
-- ------------------------------------------------------------
create table if not exists public.templates_mensagem (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid references public.companies(id) on delete cascade,

  nome            text not null,
  canal           text not null check (canal in ('email','whatsapp','ambos')),
  evento          text not null
                    check (evento in (
                      'cr_vencendo','cr_vencido','cr_pago',
                      'cp_vencendo','recibo_emitido','nf_emitida',
                      'imposto_vencendo','obrigacao_pendente',
                      'certificado_vencendo','estoque_minimo',
                      'ferias_vencendo','reajuste_aplicado',
                      'relatorio_mensal','saldo_negativo_projetado',
                      'personalizado'
                    )),

  assunto         text,
  corpo           text not null,
  variaveis_doc   jsonb,

  ativo           boolean not null default true,
  padrao          boolean not null default false,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.templates_mensagem is
  'Templates com variáveis dinâmicas. company_id NULL = template global do sistema.';


-- ------------------------------------------------------------
-- 3. CONFIGURAÇÃO DE ALERTAS
-- ------------------------------------------------------------
create table if not exists public.alertas_configuracao (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete cascade,

  evento              text not null,
  canal               text not null check (canal in ('email','whatsapp','ambos')),
  template_id         uuid references public.templates_mensagem(id) on delete set null,

  dias_antecedencia   integer not null default 3,
  hora_disparo        time not null default '08:00',

  destinatarios_internos  uuid[],
  notificar_cliente   boolean not null default false,

  repetir_apos_venc   boolean not null default false,
  intervalo_repeticao integer,

  ativo               boolean not null default true,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (company_id, evento, canal)
);

comment on table public.alertas_configuracao is
  'Define quais alertas estão ativos por empresa. Job diário varre esta tabela para disparos.';


-- ------------------------------------------------------------
-- 4. LOG DE ALERTAS
-- ------------------------------------------------------------
create table if not exists public.alertas_log (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete cascade,

  alerta_config_id    uuid references public.alertas_configuracao(id) on delete set null,
  template_id         uuid references public.templates_mensagem(id) on delete set null,

  evento              text not null,
  entidade_tipo       text,
  entidade_id         uuid,

  canal               text not null,
  destinatario        text not null,
  assunto             text,
  corpo_enviado       text,

  status              text not null default 'pendente'
                        check (status in (
                          'pendente','enviado','entregue',
                          'lido','falhou','bounced'
                        )),
  provider_message_id text,
  erro_descricao      text,

  aberto_em           timestamptz,
  clicado_em          timestamptz,

  enviado_em          timestamptz,
  created_at          timestamptz not null default now()
);

comment on table public.alertas_log is
  'Log imutável de todos os disparos. Nunca delete — use para auditoria e evitar duplicatas.';


-- ------------------------------------------------------------
-- 5. ÍNDICE ECONÔMICO
-- ------------------------------------------------------------
create table if not exists public.indice_economico (
  id              uuid primary key default gen_random_uuid(),
  indice          text not null check (indice in ('ipca','igpm','inpc','selic','outros')),
  competencia     text not null,
  valor_mensal    numeric(8,4) not null,
  valor_acumulado_ano numeric(8,4),
  fonte           text,

  created_at      timestamptz not null default now(),

  unique (indice, competencia)
);

comment on table public.indice_economico is
  'Alimentada mensalmente via job que consulta API do IBGE/FGV. Usada nos reajustes de contratos.';


-- ------------------------------------------------------------
-- 6. REAJUSTES DE ÍNDICE
-- ------------------------------------------------------------
create table if not exists public.reajustes_indice (
  id                      uuid primary key default gen_random_uuid(),
  company_id              uuid not null references public.companies(id) on delete cascade,
  contrato_recorrente_id  uuid not null references public.contratos_recorrentes(id) on delete cascade,

  indice                  text not null,
  competencia_referencia  text not null,
  percentual_aplicado     numeric(8,4) not null,

  valor_anterior          numeric(15,2) not null,
  valor_reajustado        numeric(15,2) not null,

  notificado_em           timestamptz,
  alerta_log_id           uuid references public.alertas_log(id),

  aprovado_por            uuid references auth.users(id),
  aprovado_em             timestamptz,

  applied_at              timestamptz not null default now(),
  created_at              timestamptz not null default now()
);

comment on table public.reajustes_indice is
  'Histórico de reajustes. Ao aprovar: UPDATE contratos_recorrentes SET valor = valor_reajustado.';


-- ============================================================
-- SEED — Templates padrão do sistema (company_id NULL = global)
-- ============================================================

insert into public.templates_mensagem
  (id, company_id, nome, canal, evento, assunto, corpo, variaveis_doc, padrao)
values
(gen_random_uuid(), null, 'CR vencendo — e-mail padrão', 'email', 'cr_vencendo',
 'Lembrete: título vence em {{dias_restantes}} dias',
 'Olá, {{pagador_nome}}. Informamos que o título no valor de {{valor}} vence em {{data_vencimento}}. Em caso de dúvidas, entre em contato.',
 '{"pagador_nome":"Nome do pagador","valor":"Valor em R$","data_vencimento":"Data formatada","dias_restantes":"Dias até o vencimento"}',
 true),

(gen_random_uuid(), null, 'CR vencido — WhatsApp padrão', 'whatsapp', 'cr_vencido',
 null,
 'Olá, {{pagador_nome}}! Identificamos um título em aberto no valor de *R$ {{valor}}* com vencimento em {{data_vencimento}}. Por favor, regularize para evitar juros.',
 '{"pagador_nome":"Nome do pagador","valor":"Valor em R$","data_vencimento":"Data formatada"}',
 true),

(gen_random_uuid(), null, 'Recibo emitido — e-mail padrão', 'email', 'recibo_emitido',
 'Recibo de pagamento — {{empresa_nome}}',
 'Olá, {{pagador_nome}}. Segue em anexo o recibo referente ao pagamento de R$ {{valor}} realizado em {{data_pagamento}}.',
 '{"pagador_nome":"Nome do pagador","valor":"Valor em R$","data_pagamento":"Data do pagamento","empresa_nome":"Nome da empresa emitente"}',
 true),

(gen_random_uuid(), null, 'Certificado vencendo — e-mail padrão', 'email', 'certificado_vencendo',
 'Alerta: Certificado digital vence em {{dias_restantes}} dias',
 'Atenção! O certificado digital da empresa {{empresa_nome}} vencerá em {{data_validade}} ({{dias_restantes}} dias). Providencie a renovação.',
 '{"empresa_nome":"Nome da empresa","data_validade":"Data de validade","dias_restantes":"Dias restantes"}',
 true),

(gen_random_uuid(), null, 'Saldo negativo projetado — WhatsApp padrão', 'whatsapp', 'saldo_negativo_projetado',
 null,
 'Atenção, {{empresa_nome}}! O fluxo de caixa projeta saldo negativo em {{data_projecao}}. Valor estimado: *R$ {{saldo_projetado}}*. Acesse o Gestap para detalhes.',
 '{"empresa_nome":"Nome da empresa","data_projecao":"Data da projeção","saldo_projetado":"Valor projetado"}',
 true)
on conflict do nothing;


-- ============================================================
-- ÍNDICES
-- ============================================================

create index if not exists idx_config_canais_company    on public.config_canais(company_id);
create index if not exists idx_templates_company        on public.templates_mensagem(company_id);
create index if not exists idx_templates_evento         on public.templates_mensagem(evento);
create index if not exists idx_alertas_conf_company     on public.alertas_configuracao(company_id);
create index if not exists idx_alertas_conf_evento      on public.alertas_configuracao(evento);
create index if not exists idx_alertas_log_company      on public.alertas_log(company_id);
create index if not exists idx_alertas_log_evento       on public.alertas_log(evento);
create index if not exists idx_alertas_log_entidade     on public.alertas_log(entidade_tipo, entidade_id);
create index if not exists idx_alertas_log_status       on public.alertas_log(status);
create index if not exists idx_alertas_log_enviado      on public.alertas_log(enviado_em);
create index if not exists idx_indice_econ_indice       on public.indice_economico(indice, competencia);
create index if not exists idx_reajustes_contrato       on public.reajustes_indice(contrato_recorrente_id);
create index if not exists idx_reajustes_company        on public.reajustes_indice(company_id);


-- ============================================================
-- TRIGGERS
-- ============================================================

create trigger trg_config_canais_updated_at
  before update on public.config_canais
  for each row execute function public.set_updated_at();

create trigger trg_templates_updated_at
  before update on public.templates_mensagem
  for each row execute function public.set_updated_at();

create trigger trg_alertas_conf_updated_at
  before update on public.alertas_configuracao
  for each row execute function public.set_updated_at();


-- ============================================================
-- ROW LEVEL SECURITY (auth.uid() + user_companies)
-- ============================================================

alter table public.config_canais          enable row level security;
alter table public.templates_mensagem     enable row level security;
alter table public.alertas_configuracao   enable row level security;
alter table public.alertas_log            enable row level security;
alter table public.indice_economico       enable row level security;
alter table public.reajustes_indice       enable row level security;

-- config_canais: apenas service_role (backend) lê API keys
create policy "config_canais: apenas service_role"
  on public.config_canais for all
  using (auth.role() = 'service_role');

-- templates: leitura dos próprios + templates globais (company_id null)
create policy "templates: leitura tenant + globais"
  on public.templates_mensagem for select
  using (
    company_id is null
    or company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid())
  );
create policy "templates: insert"
  on public.templates_mensagem for insert
  with check (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));
create policy "templates: update"
  on public.templates_mensagem for update
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));
create policy "templates: delete"
  on public.templates_mensagem for delete
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

-- alertas_configuracao
create policy "alertas_configuracao: select" on public.alertas_configuracao for select
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));
create policy "alertas_configuracao: insert" on public.alertas_configuracao for insert
  with check (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));
create policy "alertas_configuracao: update" on public.alertas_configuracao for update
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));
create policy "alertas_configuracao: delete" on public.alertas_configuracao for delete
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

-- alertas_log: leitura pelo tenant, insert apenas service_role
create policy "alertas_log: select"
  on public.alertas_log for select
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));
create policy "alertas_log: insert service_role"
  on public.alertas_log for insert
  with check (auth.role() = 'service_role');

-- indice_economico: leitura para todos os autenticados
create policy "indice_economico: leitura autenticada"
  on public.indice_economico for select
  using (auth.role() = 'authenticated');

-- reajustes_indice
create policy "reajustes_indice: select" on public.reajustes_indice for select
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));
create policy "reajustes_indice: insert" on public.reajustes_indice for insert
  with check (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));
create policy "reajustes_indice: update" on public.reajustes_indice for update
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));
create policy "reajustes_indice: delete" on public.reajustes_indice for delete
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));


-- ============================================================
-- VIEW AUXILIAR — disparos pendentes para o job
-- ============================================================

create or replace view public.v_alertas_pendentes as
-- CR vencendo
select
  cr.company_id,
  'cr_vencendo'             as evento,
  'conta_receber'           as entidade_tipo,
  cr.id                     as entidade_id,
  cr.data_vencimento        as data_referencia,
  cr.data_vencimento - current_date as dias_restantes,
  cr.pagador_nome           as destinatario_nome,
  null::text                as destinatario_contato
from public.contas_receber cr
where cr.status = 'aberto'
  and cr.data_vencimento >= current_date
  and cr.data_vencimento <= current_date + interval '7 days'
  and not exists (
    select 1 from public.alertas_log al
    where al.entidade_id = cr.id
      and al.evento = 'cr_vencendo'
      and al.enviado_em >= current_date
      and al.status != 'falhou'
  )

union all

-- CR vencido
select
  cr.company_id,
  'cr_vencido'              as evento,
  'conta_receber'           as entidade_tipo,
  cr.id                     as entidade_id,
  cr.data_vencimento        as data_referencia,
  current_date - cr.data_vencimento as dias_restantes,
  cr.pagador_nome           as destinatario_nome,
  null::text                as destinatario_contato
from public.contas_receber cr
where cr.status in ('vencido','aberto')
  and cr.data_vencimento < current_date

union all

-- Certificados vencendo em 30 dias
select
  cd.company_id,
  'certificado_vencendo'    as evento,
  'certificado_digital'     as entidade_tipo,
  cd.id                     as entidade_id,
  cd.data_validade          as data_referencia,
  cd.data_validade - current_date as dias_restantes,
  null::text                as destinatario_nome,
  null::text                as destinatario_contato
from public.certificados_digitais cd
where cd.status != 'expirado'
  and cd.data_validade <= current_date + interval '30 days'
  and not exists (
    select 1 from public.alertas_log al
    where al.entidade_id = cd.id
      and al.evento = 'certificado_vencendo'
      and al.enviado_em >= current_date - interval '7 days'
      and al.status != 'falhou'
  )

union all

-- Obrigações acessórias vencendo em 5 dias
select
  oa.company_id,
  'obrigacao_pendente'      as evento,
  'obrigacao_acessoria'     as entidade_tipo,
  oa.id                     as entidade_id,
  oa.data_vencimento        as data_referencia,
  oa.data_vencimento - current_date as dias_restantes,
  null::text                as destinatario_nome,
  null::text                as destinatario_contato
from public.obrigacoes_acessorias oa
where oa.status = 'pendente'
  and oa.data_vencimento <= current_date + interval '5 days'
  and not exists (
    select 1 from public.alertas_log al
    where al.entidade_id = oa.id
      and al.evento = 'obrigacao_pendente'
      and al.enviado_em >= current_date
      and al.status != 'falhou'
  );

comment on view public.v_alertas_pendentes is
  'Job diário consulta esta view para saber o que disparar. Anti-duplicata via alertas_log.';
