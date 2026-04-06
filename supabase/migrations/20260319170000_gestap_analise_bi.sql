-- ============================================================
-- GESTAP — Módulo: Análise & BI (Adaptado para empresa-flow)
-- Usa company_id → companies, chart_of_accounts, employee_id
-- RLS via auth.uid() + user_companies
-- Dependências: todos os módulos anteriores
-- ============================================================


-- ------------------------------------------------------------
-- 1. ORÇAMENTO
-- ------------------------------------------------------------
create table if not exists public.orcamento (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,

  ano             integer not null,
  versao          text not null default 'original'
                    check (versao in ('original','revisao_1','revisao_2','revisao_3')),
  descricao       text,
  status          text not null default 'rascunho'
                    check (status in ('rascunho','aprovado','encerrado')),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (company_id, ano, versao)
);

create table if not exists public.orcamento_itens (
  id                  uuid primary key default gen_random_uuid(),
  orcamento_id        uuid not null references public.orcamento(id) on delete cascade,
  conta_contabil_id   uuid not null references public.chart_of_accounts(id),
  centro_custo_id     uuid references public.centros_custo(id),

  mes                 integer not null check (mes between 1 and 12),

  valor_orcado        numeric(15,2) not null default 0,
  responsavel         text,
  observacoes         text,

  unique (orcamento_id, conta_contabil_id, centro_custo_id, mes)
);

comment on table public.orcamento is
  'Orçamento anual por empresa. Comparado ao realizado (movimentacoes) na view v_dre_consolidado.';


-- ------------------------------------------------------------
-- 2. SCORE FINANCEIRO
-- ------------------------------------------------------------
create table if not exists public.score_financeiro (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies(id) on delete cascade,

  competencia           text not null,  -- YYYY-MM

  -- Dimensões (0-100 cada)
  score_liquidez        numeric(5,2) not null default 0,
  score_lucratividade   numeric(5,2) not null default 0,
  score_compliance      numeric(5,2) not null default 0,
  score_endividamento   numeric(5,2) not null default 0,
  score_inadimplencia   numeric(5,2) not null default 0,

  -- Score geral ponderado
  score_geral           numeric(5,2) not null default 0,

  -- Métricas brutas usadas no cálculo
  liquidez_corrente     numeric(10,4),
  margem_liquida        numeric(10,4),
  percentual_vencido    numeric(10,4),
  obrigacoes_em_dia     boolean,

  -- Recomendações geradas
  alertas               jsonb,
  recomendacoes         jsonb,

  created_at            timestamptz not null default now(),

  unique (company_id, competencia)
);

comment on table public.score_financeiro is
  'Calculado mensalmente por job. score_geral = média ponderada das 5 dimensões.';


-- ------------------------------------------------------------
-- 3. CENÁRIOS
-- ------------------------------------------------------------
create table if not exists public.cenarios (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,

  nome            text not null,
  tipo            text not null default 'personalizado'
                    check (tipo in ('otimista','realista','pessimista','personalizado')),
  descricao       text,

  var_receita     numeric(6,2) not null default 0,
  var_custo       numeric(6,2) not null default 0,
  var_despesa     numeric(6,2) not null default 0,
  var_impostos    numeric(6,2) not null default 0,

  data_inicio     date not null,
  data_fim        date not null,

  resultado_json  jsonb,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.cenarios is
  'Simulações sobre o realizado. resultado_json armazena projeção calculada no backend.';


-- ============================================================
-- VIEWS MATERIALIZADAS — camada OLAP
-- ============================================================

-- MV 1: DRE mensal por empresa e conta contábil
create materialized view if not exists public.mv_dre_mensal as
select
  m.company_id,
  to_char(m.data, 'YYYY-MM')           as competencia,
  ca.id                                 as conta_contabil_id,
  ca.code                               as codigo,
  ca.name                               as descricao,
  ca.account_type                       as tipo,
  ca.account_nature                     as natureza,
  sum(case when m.tipo = 'credito' then m.valor else 0 end) as total_credito,
  sum(case when m.tipo = 'debito'  then m.valor else 0 end) as total_debito,
  sum(case
    when ca.account_nature = 'credit' and m.tipo = 'credito' then  m.valor
    when ca.account_nature = 'credit' and m.tipo = 'debito'  then -m.valor
    when ca.account_nature = 'debit'  and m.tipo = 'debito'  then  m.valor
    when ca.account_nature = 'debit'  and m.tipo = 'credito' then -m.valor
    else 0
  end)                                  as saldo
from public.movimentacoes m
join public.chart_of_accounts ca on ca.id = m.conta_contabil_id
where ca.is_analytical = true
group by m.company_id, to_char(m.data, 'YYYY-MM'), ca.id, ca.code, ca.name, ca.account_type, ca.account_nature
with data;

create unique index if not exists idx_mv_dre_mensal
  on public.mv_dre_mensal(company_id, competencia, conta_contabil_id);

comment on materialized view public.mv_dre_mensal is
  'Base do DRE. Refresh via: REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dre_mensal;';


-- MV 2: Fluxo de caixa diário realizado
create materialized view if not exists public.mv_fluxo_caixa_diario as
select
  m.company_id,
  m.conta_bancaria_id,
  m.data,
  sum(case when m.tipo = 'credito' then  m.valor else 0 end) as entradas,
  sum(case when m.tipo = 'debito'  then  m.valor else 0 end) as saidas,
  sum(case when m.tipo = 'credito' then  m.valor
           when m.tipo = 'debito'  then -m.valor
           else 0 end)                                        as saldo_dia
from public.movimentacoes m
group by m.company_id, m.conta_bancaria_id, m.data
with data;

create unique index if not exists idx_mv_fluxo_diario
  on public.mv_fluxo_caixa_diario(company_id, conta_bancaria_id, data);

comment on materialized view public.mv_fluxo_caixa_diario is
  'Fluxo realizado por dia e conta. Base para o gráfico de fluxo de caixa.';


-- MV 3: Custo de pessoal mensal
create materialized view if not exists public.mv_custo_pessoal_mensal as
select
  fp.company_id,
  fp.competencia,
  sum(fp.total_proventos)               as total_proventos,
  sum(fp.fgts_mes + fp.inss_patronal)   as encargos_patronais,
  sum(fp.total_proventos
    + fp.fgts_mes
    + fp.inss_patronal)                 as custo_total_pessoal,
  count(distinct fp.employee_id)        as headcount
from public.folha_pagamento fp
where fp.tipo = 'mensal'
  and fp.status in ('fechada','paga')
group by fp.company_id, fp.competencia
with data;

create unique index if not exists idx_mv_pessoal_mensal
  on public.mv_custo_pessoal_mensal(company_id, competencia);


-- ============================================================
-- VIEWS SIMPLES — consultadas em tempo real
-- ============================================================

-- V1: DRE consolidado com orçado vs realizado
create or replace view public.v_dre_consolidado as
select
  dre.company_id,
  dre.competencia,
  dre.conta_contabil_id,
  dre.codigo,
  dre.descricao,
  dre.tipo,
  dre.saldo                             as realizado,
  coalesce(oi.valor_orcado, 0)          as orcado,
  dre.saldo - coalesce(oi.valor_orcado, 0) as variacao,
  case
    when coalesce(oi.valor_orcado, 0) = 0 then null
    else round(
      ((dre.saldo - oi.valor_orcado) / oi.valor_orcado * 100)::numeric, 2
    )
  end                                   as variacao_pct
from public.mv_dre_mensal dre
left join public.orcamento_itens oi
  on oi.conta_contabil_id = dre.conta_contabil_id
  and oi.mes = extract(month from to_date(dre.competencia, 'YYYY-MM'))::integer
left join public.orcamento o
  on o.id = oi.orcamento_id
  and o.company_id = dre.company_id
  and o.ano = extract(year from to_date(dre.competencia, 'YYYY-MM'))::integer
  and o.status = 'aprovado';

comment on view public.v_dre_consolidado is
  'DRE com comparativo orçado vs realizado. Depende de mv_dre_mensal estar atualizada.';


-- V2: Fluxo de caixa projetado (realizado + previsto)
create or replace view public.v_fluxo_caixa_projetado as
select
  company_id,
  conta_bancaria_id,
  data,
  'realizado'   as origem,
  entradas,
  saidas,
  saldo_dia
from public.mv_fluxo_caixa_diario
union all
select
  company_id,
  null          as conta_bancaria_id,
  data_vencimento as data,
  'previsto_cr' as origem,
  valor         as entradas,
  0             as saidas,
  valor         as saldo_dia
from public.contas_receber
where status in ('aberto','parcial')
union all
select
  company_id,
  null          as conta_bancaria_id,
  data_vencimento as data,
  'previsto_cp' as origem,
  0             as entradas,
  valor         as saidas,
  -valor        as saldo_dia
from public.contas_pagar
where status in ('aberto','parcial');

comment on view public.v_fluxo_caixa_projetado is
  'Realizado + previsto (CR/CP em aberto). Use no frontend com filtro por empresa e período.';


-- V3: Inadimplência
create or replace view public.v_inadimplencia as
select
  cr.company_id,
  to_char(cr.data_vencimento, 'YYYY-MM') as competencia,
  count(*)                                as qtd_titulos_vencidos,
  sum(cr.valor)                           as valor_total_vencido,
  sum(cr.valor - coalesce(cr.valor_pago, 0)) as valor_aberto_vencido,
  avg(current_date - cr.data_vencimento)  as prazo_medio_atraso_dias
from public.contas_receber cr
where cr.status in ('vencido','parcial')
  and cr.data_vencimento < current_date
group by cr.company_id, to_char(cr.data_vencimento, 'YYYY-MM');

comment on view public.v_inadimplencia is
  'Posição de inadimplência por empresa por mês. Alimenta score_financeiro.score_inadimplencia.';


-- ============================================================
-- ÍNDICES
-- ============================================================

create index if not exists idx_orcamento_company    on public.orcamento(company_id);
create index if not exists idx_orcamento_ano        on public.orcamento(ano);
create index if not exists idx_orc_itens_orcamento  on public.orcamento_itens(orcamento_id);
create index if not exists idx_orc_itens_conta      on public.orcamento_itens(conta_contabil_id);
create index if not exists idx_score_company        on public.score_financeiro(company_id);
create index if not exists idx_score_competencia    on public.score_financeiro(competencia);
create index if not exists idx_cenarios_company     on public.cenarios(company_id);


-- ============================================================
-- TRIGGERS
-- ============================================================

drop trigger if exists trg_orcamento_updated_at on public.orcamento;
create trigger trg_orcamento_updated_at
  before update on public.orcamento
  for each row execute function public.set_updated_at();

drop trigger if exists trg_cenarios_updated_at on public.cenarios;
create trigger trg_cenarios_updated_at
  before update on public.cenarios
  for each row execute function public.set_updated_at();


-- ============================================================
-- ROW LEVEL SECURITY (auth.uid() + user_companies)
-- ============================================================

alter table public.orcamento          enable row level security;
alter table public.orcamento_itens    enable row level security;
alter table public.score_financeiro   enable row level security;
alter table public.cenarios           enable row level security;

-- orcamento
drop policy if exists "orcamento: select" on public.orcamento;
create policy "orcamento: select" on public.orcamento for select
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));
drop policy if exists "orcamento: insert" on public.orcamento;
create policy "orcamento: insert" on public.orcamento for insert
  with check (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));
drop policy if exists "orcamento: update" on public.orcamento;
create policy "orcamento: update" on public.orcamento for update
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));
drop policy if exists "orcamento: delete" on public.orcamento;
create policy "orcamento: delete" on public.orcamento for delete
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

-- orcamento_itens (via orcamento_id → orcamento.company_id)
drop policy if exists "orcamento_itens: select" on public.orcamento_itens;
create policy "orcamento_itens: select" on public.orcamento_itens for select
  using (orcamento_id in (select o.id from public.orcamento o where o.company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid())));
drop policy if exists "orcamento_itens: insert" on public.orcamento_itens;
create policy "orcamento_itens: insert" on public.orcamento_itens for insert
  with check (orcamento_id in (select o.id from public.orcamento o where o.company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid())));
drop policy if exists "orcamento_itens: update" on public.orcamento_itens;
create policy "orcamento_itens: update" on public.orcamento_itens for update
  using (orcamento_id in (select o.id from public.orcamento o where o.company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid())));
drop policy if exists "orcamento_itens: delete" on public.orcamento_itens;
create policy "orcamento_itens: delete" on public.orcamento_itens for delete
  using (orcamento_id in (select o.id from public.orcamento o where o.company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid())));

-- score_financeiro
drop policy if exists "score_financeiro: select" on public.score_financeiro;
create policy "score_financeiro: select" on public.score_financeiro for select
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));
drop policy if exists "score_financeiro: insert" on public.score_financeiro;
create policy "score_financeiro: insert" on public.score_financeiro for insert
  with check (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));
drop policy if exists "score_financeiro: update" on public.score_financeiro;
create policy "score_financeiro: update" on public.score_financeiro for update
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));
drop policy if exists "score_financeiro: delete" on public.score_financeiro;
create policy "score_financeiro: delete" on public.score_financeiro for delete
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));

-- cenarios
drop policy if exists "cenarios: select" on public.cenarios;
create policy "cenarios: select" on public.cenarios for select
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));
drop policy if exists "cenarios: insert" on public.cenarios;
create policy "cenarios: insert" on public.cenarios for insert
  with check (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));
drop policy if exists "cenarios: update" on public.cenarios;
create policy "cenarios: update" on public.cenarios for update
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));
drop policy if exists "cenarios: delete" on public.cenarios;
create policy "cenarios: delete" on public.cenarios for delete
  using (company_id in (select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()));
