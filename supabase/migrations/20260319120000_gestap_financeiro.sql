-- ============================================================
-- GESTAP — Módulo: Financeiro (Adaptado para empresa-flow)
-- Usa company_id → companies, RLS via auth.uid() + user_companies
-- Dependências: 20260318120000_gestap_cadastros_enhancements.sql
-- ============================================================


-- ------------------------------------------------------------
-- 1. CONTRATOS RECORRENTES
-- ------------------------------------------------------------
create table if not exists public.contratos_recorrentes (
  id                      uuid primary key default gen_random_uuid(),
  company_id              uuid not null references public.companies(id) on delete cascade,

  tipo                    text not null check (tipo in ('receber', 'pagar')),
  descricao               text not null,

  contraparte_nome        text not null,
  contraparte_cpf_cnpj    text,

  valor                   numeric(15,2) not null,
  periodicidade           text not null
                            check (periodicidade in (
                              'semanal','quinzenal','mensal',
                              'bimestral','trimestral','semestral','anual'
                            )),

  data_inicio             date not null,
  data_fim                date,
  proximo_vencimento      date not null,

  indice_reajuste         text check (indice_reajuste in ('ipca','igpm','inpc','fixo','nenhum')),
  percentual_fixo         numeric(5,2),

  conta_contabil_id       uuid references public.chart_of_accounts(id),
  centro_custo_id         uuid references public.centros_custo(id),

  status                  text not null default 'ativo'
                            check (status in ('ativo','pausado','encerrado','cancelado')),

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.contratos_recorrentes is
  'Contratos com geração automática de CR/CP. proximo_vencimento atualizado após cada geração.';


-- ------------------------------------------------------------
-- 2. VENDAS
-- ------------------------------------------------------------
create table if not exists public.vendas (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete cascade,

  cliente_nome        text not null,
  cliente_cpf_cnpj    text,

  valor_total         numeric(15,2) not null,
  desconto            numeric(15,2) not null default 0,
  valor_liquido       numeric(15,2) generated always as (valor_total - desconto) stored,

  data_venda          date not null default current_date,
  forma_pagamento     text,
  parcelas            integer not null default 1,

  status              text not null default 'confirmado'
                        check (status in ('orcamento','confirmado','cancelado')),

  observacoes         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.vendas_itens (
  id              uuid primary key default gen_random_uuid(),
  venda_id        uuid not null references public.vendas(id) on delete cascade,

  descricao       text not null,
  quantidade      numeric(10,3) not null default 1,
  valor_unitario  numeric(15,2) not null,
  valor_total     numeric(15,2) generated always as (quantidade * valor_unitario) stored
);

comment on table public.vendas is
  'Registro de venda. Ao confirmar, gera lançamentos em contas_receber (1 por parcela).';


-- ------------------------------------------------------------
-- 3. CONTAS A RECEBER (nova estrutura)
-- ------------------------------------------------------------
create table if not exists public.contas_receber (
  id                      uuid primary key default gen_random_uuid(),
  company_id              uuid not null references public.companies(id) on delete cascade,

  venda_id                uuid references public.vendas(id) on delete set null,
  contrato_recorrente_id  uuid references public.contratos_recorrentes(id) on delete set null,

  pagador_nome            text not null,
  pagador_cpf_cnpj        text,

  valor                   numeric(15,2) not null,
  valor_pago              numeric(15,2),

  data_vencimento         date not null,
  data_pagamento          date,

  conta_contabil_id       uuid references public.chart_of_accounts(id),
  centro_custo_id         uuid references public.centros_custo(id),
  forma_recebimento       text,

  status                  text not null default 'aberto'
                            check (status in ('aberto','pago','vencido','cancelado','parcial')),
  observacoes             text,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.contas_receber is
  'Intenção de recebimento. Ao pagar, gera movimentacao com tipo=credito.';


-- ------------------------------------------------------------
-- 4. CONTAS A PAGAR (nova estrutura)
-- ------------------------------------------------------------
create table if not exists public.contas_pagar (
  id                      uuid primary key default gen_random_uuid(),
  company_id              uuid not null references public.companies(id) on delete cascade,

  contrato_recorrente_id  uuid references public.contratos_recorrentes(id) on delete set null,
  -- ordem_compra_id removido (módulo Estoque ainda não existe)

  credor_nome             text not null,
  credor_cpf_cnpj         text,

  valor                   numeric(15,2) not null,
  valor_pago              numeric(15,2),

  data_vencimento         date not null,
  data_pagamento          date,

  conta_contabil_id       uuid references public.chart_of_accounts(id),
  centro_custo_id         uuid references public.centros_custo(id),
  forma_pagamento         text,
  conta_bancaria_id       uuid references public.bank_accounts(id),

  status                  text not null default 'aberto'
                            check (status in ('aberto','pago','vencido','cancelado','parcial')),
  observacoes             text,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.contas_pagar is
  'Intenção de pagamento. Ao pagar, gera movimentacao com tipo=debito.';


-- ------------------------------------------------------------
-- 5. MOVIMENTAÇÕES
-- ------------------------------------------------------------
create table if not exists public.movimentacoes (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies(id) on delete cascade,

  conta_bancaria_id     uuid not null references public.bank_accounts(id),

  conta_contabil_id     uuid references public.chart_of_accounts(id),
  centro_custo_id       uuid references public.centros_custo(id),

  conta_receber_id      uuid references public.contas_receber(id) on delete set null,
  conta_pagar_id        uuid references public.contas_pagar(id) on delete set null,

  tipo                  text not null check (tipo in ('credito','debito')),
  valor                 numeric(15,2) not null,
  data                  date not null,
  descricao             text,

  origem                text not null default 'manual'
                          check (origem in ('manual','ofx','conta_receber','conta_pagar','transferencia')),

  status_conciliacao    text not null default 'pendente'
                          check (status_conciliacao in ('pendente','conciliado','divergente','ignorado')),

  categoria_aprendida   text,
  regra_id              uuid,

  created_at            timestamptz not null default now(),

  constraint chk_origem_unica check (
    not (conta_receber_id is not null and conta_pagar_id is not null)
  )
);

comment on table public.movimentacoes is
  'TABELA CENTRAL. Representa fatos financeiros. CR/CP são intenções; movimentacao é realidade.';


-- ------------------------------------------------------------
-- 6. RECIBOS (nova estrutura)
-- ------------------------------------------------------------
create table if not exists public.recibos_v2 (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  conta_receber_id    uuid references public.contas_receber(id) on delete set null,

  pagador_nome        text not null,
  pagador_cpf_cnpj    text,

  valor               numeric(15,2) not null,
  data                date not null default current_date,
  descricao_servico   text not null,
  forma_pagamento     text,

  numero_sequencial   integer not null,
  enviado_email       boolean not null default false,
  email_destino       text,
  pdf_url             text,

  created_at          timestamptz not null default now(),

  unique (company_id, numero_sequencial)
);

comment on table public.recibos_v2 is
  'Gerado automaticamente ao quitar CR. numero_sequencial por empresa.';


-- ------------------------------------------------------------
-- 7. CONCILIAÇÃO BANCÁRIA
-- ------------------------------------------------------------
create table if not exists public.conciliacao_bancaria (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies(id) on delete cascade,
  conta_bancaria_id     uuid not null references public.bank_accounts(id),

  descricao_extrato     text,
  valor_extrato         numeric(15,2) not null,
  data_extrato          date not null,
  tipo_extrato          text check (tipo_extrato in ('credito','debito')),
  id_transacao_ofx      text,
  cnpj_cpf_extrato      text,

  movimentacao_id       uuid references public.movimentacoes(id) on delete set null,

  status                text not null default 'pendente'
                          check (status in ('pendente','conciliado','divergente','novo','ignorado')),

  regra_origem          text,
  aprovado_por          uuid references auth.users(id),
  aprovado_em           timestamptz,

  created_at            timestamptz not null default now(),

  unique (conta_bancaria_id, id_transacao_ofx)
);

comment on table public.conciliacao_bancaria is
  'Uma linha por transação do extrato OFX. status=novo = não encontrou movimentacao correspondente.';


-- ------------------------------------------------------------
-- 8. RÉGUA DE COBRANÇA
-- ------------------------------------------------------------
create table if not exists public.regua_cobranca (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete cascade,

  nome                text not null,
  gatilho_tipo        text not null
                        check (gatilho_tipo in ('antes_vencimento','no_vencimento','apos_vencimento')),
  dias_referencia     integer not null default 0,
  canal               text not null check (canal in ('email','whatsapp','ambos')),
  template            text not null,
  ativo               boolean not null default true,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.regua_cobranca_log (
  id                  uuid primary key default gen_random_uuid(),
  regua_id            uuid not null references public.regua_cobranca(id),
  conta_receber_id    uuid not null references public.contas_receber(id),

  canal               text not null,
  destinatario        text,
  status_envio        text not null
                        check (status_envio in ('enviado','entregue','lido','falhou')),
  erro_descricao      text,
  enviado_em          timestamptz not null default now()
);

comment on table public.regua_cobranca is
  'Configuração das réguas. Executadas por job agendado que varre contas_receber diariamente.';


-- ============================================================
-- ÍNDICES
-- ============================================================

create index if not exists idx_cr_company          on public.contas_receber(company_id);
create index if not exists idx_cr_vencimento       on public.contas_receber(data_vencimento);
create index if not exists idx_cr_status           on public.contas_receber(status);
create index if not exists idx_cr_venda            on public.contas_receber(venda_id);
create index if not exists idx_cr_contrato         on public.contas_receber(contrato_recorrente_id);

create index if not exists idx_cp_company          on public.contas_pagar(company_id);
create index if not exists idx_cp_vencimento       on public.contas_pagar(data_vencimento);
create index if not exists idx_cp_status           on public.contas_pagar(status);

create index if not exists idx_mov_company         on public.movimentacoes(company_id);
create index if not exists idx_mov_data            on public.movimentacoes(data);
create index if not exists idx_mov_conta_banc      on public.movimentacoes(conta_bancaria_id);
create index if not exists idx_mov_conciliacao     on public.movimentacoes(status_conciliacao);
create index if not exists idx_mov_cr              on public.movimentacoes(conta_receber_id);
create index if not exists idx_mov_cp              on public.movimentacoes(conta_pagar_id);

create index if not exists idx_conc_conta_banc     on public.conciliacao_bancaria(conta_bancaria_id);
create index if not exists idx_conc_status         on public.conciliacao_bancaria(status);
create index if not exists idx_conc_data           on public.conciliacao_bancaria(data_extrato);

create index if not exists idx_contratos_company   on public.contratos_recorrentes(company_id);
create index if not exists idx_contratos_prox_venc on public.contratos_recorrentes(proximo_vencimento);

create index if not exists idx_vendas_company      on public.vendas(company_id);
create index if not exists idx_recibos_v2_company  on public.recibos_v2(company_id);
create index if not exists idx_regua_company       on public.regua_cobranca(company_id);
create index if not exists idx_regua_log_cr        on public.regua_cobranca_log(conta_receber_id);


-- ============================================================
-- TRIGGERS — updated_at
-- ============================================================

create trigger trg_contratos_updated_at
  before update on public.contratos_recorrentes
  for each row execute function public.set_updated_at();

create trigger trg_cr_updated_at
  before update on public.contas_receber
  for each row execute function public.set_updated_at();

create trigger trg_cp_updated_at
  before update on public.contas_pagar
  for each row execute function public.set_updated_at();

create trigger trg_vendas_updated_at
  before update on public.vendas
  for each row execute function public.set_updated_at();

create trigger trg_regua_updated_at
  before update on public.regua_cobranca
  for each row execute function public.set_updated_at();


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.contratos_recorrentes  enable row level security;
alter table public.vendas                 enable row level security;
alter table public.vendas_itens           enable row level security;
alter table public.contas_receber         enable row level security;
alter table public.contas_pagar           enable row level security;
alter table public.movimentacoes          enable row level security;
alter table public.recibos_v2             enable row level security;
alter table public.conciliacao_bancaria   enable row level security;
alter table public.regua_cobranca         enable row level security;
alter table public.regua_cobranca_log     enable row level security;

-- Policies usando auth.uid() + user_companies (padrão empresa-flow)

create policy "contratos_recorrentes: select"
  on public.contratos_recorrentes for select
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

create policy "contratos_recorrentes: insert"
  on public.contratos_recorrentes for insert
  with check (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

create policy "contratos_recorrentes: update"
  on public.contratos_recorrentes for update
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

create policy "contratos_recorrentes: delete"
  on public.contratos_recorrentes for delete
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

-- Vendas
create policy "vendas: select"
  on public.vendas for select
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

create policy "vendas: insert"
  on public.vendas for insert
  with check (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

create policy "vendas: update"
  on public.vendas for update
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

create policy "vendas: delete"
  on public.vendas for delete
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

-- Vendas Itens (via venda → company)
create policy "vendas_itens: select"
  on public.vendas_itens for select
  using (venda_id in (
    select v.id from public.vendas v
    where v.company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid())
  ));

create policy "vendas_itens: insert"
  on public.vendas_itens for insert
  with check (venda_id in (
    select v.id from public.vendas v
    where v.company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid())
  ));

create policy "vendas_itens: update"
  on public.vendas_itens for update
  using (venda_id in (
    select v.id from public.vendas v
    where v.company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid())
  ));

create policy "vendas_itens: delete"
  on public.vendas_itens for delete
  using (venda_id in (
    select v.id from public.vendas v
    where v.company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid())
  ));

-- Contas a Receber
create policy "contas_receber: select"
  on public.contas_receber for select
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

create policy "contas_receber: insert"
  on public.contas_receber for insert
  with check (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

create policy "contas_receber: update"
  on public.contas_receber for update
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

create policy "contas_receber: delete"
  on public.contas_receber for delete
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

-- Contas a Pagar
create policy "contas_pagar: select"
  on public.contas_pagar for select
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

create policy "contas_pagar: insert"
  on public.contas_pagar for insert
  with check (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

create policy "contas_pagar: update"
  on public.contas_pagar for update
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

create policy "contas_pagar: delete"
  on public.contas_pagar for delete
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

-- Movimentações
create policy "movimentacoes: select"
  on public.movimentacoes for select
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

create policy "movimentacoes: insert"
  on public.movimentacoes for insert
  with check (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

create policy "movimentacoes: update"
  on public.movimentacoes for update
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

create policy "movimentacoes: delete"
  on public.movimentacoes for delete
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

-- Recibos v2
create policy "recibos_v2: select"
  on public.recibos_v2 for select
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

create policy "recibos_v2: insert"
  on public.recibos_v2 for insert
  with check (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

create policy "recibos_v2: update"
  on public.recibos_v2 for update
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

-- Conciliação Bancária
create policy "conciliacao_bancaria: select"
  on public.conciliacao_bancaria for select
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

create policy "conciliacao_bancaria: insert"
  on public.conciliacao_bancaria for insert
  with check (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

create policy "conciliacao_bancaria: update"
  on public.conciliacao_bancaria for update
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

-- Régua de Cobrança
create policy "regua_cobranca: select"
  on public.regua_cobranca for select
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

create policy "regua_cobranca: insert"
  on public.regua_cobranca for insert
  with check (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

create policy "regua_cobranca: update"
  on public.regua_cobranca for update
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

-- Régua Log (via régua → company)
create policy "regua_cobranca_log: select"
  on public.regua_cobranca_log for select
  using (regua_id in (
    select r.id from public.regua_cobranca r
    where r.company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid())
  ));

create policy "regua_cobranca_log: insert"
  on public.regua_cobranca_log for insert
  with check (regua_id in (
    select r.id from public.regua_cobranca r
    where r.company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid())
  ));


-- ============================================================
-- VIEW — saldo por conta bancária
-- ============================================================

create or replace view public.v_saldo_contas_bancarias as
select
  ba.id                                     as conta_bancaria_id,
  ba.company_id,
  ba.name                                   as nome,
  ba.banco,
  ba.type                                   as tipo,
  ba.initial_balance                        as saldo_inicial,
  ba.data_saldo_inicial,
  coalesce(sum(
    case when m.tipo = 'credito' then m.valor
         when m.tipo = 'debito'  then -m.valor
         else 0 end
  ), 0)                                     as movimentado,
  ba.initial_balance + coalesce(sum(
    case when m.tipo = 'credito' then m.valor
         when m.tipo = 'debito'  then -m.valor
         else 0 end
  ), 0)                                     as saldo_atual
from public.bank_accounts ba
left join public.movimentacoes m
  on m.conta_bancaria_id = ba.id
group by ba.id, ba.company_id, ba.name, ba.banco, ba.type, ba.initial_balance, ba.data_saldo_inicial;

comment on view public.v_saldo_contas_bancarias is
  'Saldo em tempo real = saldo_inicial + soma das movimentações. Use para dashboard.';


-- ============================================================
-- NOTAS
-- ============================================================
-- 1. ORDEM ao quitar CR:
--    a) UPDATE contas_receber SET status='pago', data_pagamento, valor_pago
--    b) INSERT INTO movimentacoes (tipo='credito', conta_receber_id, ...)
--    c) INSERT INTO recibos_v2 (se aplicável)
--
-- 2. ordem_compra_id removido de contas_pagar (módulo Estoque futuro)
--
-- 3. Recibos usa recibos_v2 para não conflitar com tabela receipts existente
--
-- 4. Tabelas existentes (accounts_receivable, accounts_payable)
--    continuam funcionando. Novas tabelas (contas_receber, contas_pagar)
--    são a evolução — migrar frontend gradualmente.
-- ============================================================
