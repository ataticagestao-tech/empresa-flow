-- ============================================================
-- GESTAP — Módulo: Multi-empresa (Adaptado para empresa-flow)
-- Usa company_id → companies, RLS via auth.uid() + user_companies
-- Nota: empresa-flow não tem tenants — grupos são vinculados
-- ao usuário via user_companies
-- ============================================================


-- ------------------------------------------------------------
-- 1. GRUPOS EMPRESARIAIS
-- Um usuário pode criar grupos com suas empresas
-- ------------------------------------------------------------
create table if not exists public.grupos_empresariais (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,

  nome            text not null,
  descricao       text,
  ativo           boolean not null default true,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (owner_id, nome)
);

-- Vínculo entre grupo e empresas (N:N)
create table if not exists public.grupos_empresas (
  id              uuid primary key default gen_random_uuid(),
  grupo_id        uuid not null references public.grupos_empresariais(id) on delete cascade,
  company_id      uuid not null references public.companies(id) on delete cascade,

  papel           text not null default 'membro'
                    check (papel in ('holding','controlada','coligada','membro')),
  percentual_participacao numeric(5,2),

  created_at      timestamptz not null default now(),

  unique (grupo_id, company_id)
);

comment on table public.grupos_empresariais is
  'Agrupamento de CNPJs. Ex: "Grupo Clínicas SP" com 3 CNPJs.';


-- ------------------------------------------------------------
-- 2. TRANSFERÊNCIAS INTERCOMPANY
-- ------------------------------------------------------------
create table if not exists public.transferencias_intercompany (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references auth.users(id),

  -- Origem
  company_origem_id     uuid not null references public.companies(id),
  conta_bancaria_orig   uuid references public.bank_accounts(id),
  movimentacao_orig_id  uuid references public.movimentacoes(id),

  -- Destino
  company_destino_id    uuid not null references public.companies(id),
  conta_bancaria_dest   uuid references public.bank_accounts(id),
  movimentacao_dest_id  uuid references public.movimentacoes(id),

  -- Transferência
  valor                 numeric(15,2) not null,
  data                  date not null,
  natureza              text not null
                          check (natureza in (
                            'mutuo','adiantamento','capital','operacional','outros'
                          )),
  descricao             text,
  documento_url         text,

  gera_juros            boolean not null default false,
  taxa_juros_mensal     numeric(5,4),

  eliminado_consolidado boolean not null default false,

  aprovado_por          uuid references auth.users(id),
  aprovado_em           timestamptz,

  status                text not null default 'pendente'
                          check (status in ('pendente','aprovada','concluida','cancelada')),

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint chk_empresas_diferentes
    check (company_origem_id != company_destino_id)
);

comment on table public.transferencias_intercompany is
  'Transferência entre CNPJs do mesmo usuário. Gera movimentacao em ambas as empresas.';


-- ------------------------------------------------------------
-- 3. CONSOLIDADO CACHE
-- ------------------------------------------------------------
create table if not exists public.consolidado_cache (
  id                  uuid primary key default gen_random_uuid(),
  grupo_id            uuid not null references public.grupos_empresariais(id) on delete cascade,
  competencia         text not null,

  receita_bruta       numeric(15,2) not null default 0,
  deducoes            numeric(15,2) not null default 0,
  receita_liquida     numeric(15,2) not null default 0,
  cmv                 numeric(15,2) not null default 0,
  lucro_bruto         numeric(15,2) not null default 0,
  despesas_operac     numeric(15,2) not null default 0,
  ebitda              numeric(15,2) not null default 0,
  resultado_liquido   numeric(15,2) not null default 0,

  caixa_total         numeric(15,2) not null default 0,
  cr_total_aberto     numeric(15,2) not null default 0,
  cp_total_aberto     numeric(15,2) not null default 0,

  total_eliminacoes   numeric(15,2) not null default 0,
  qtd_transferencias  integer not null default 0,

  calculado_em        timestamptz not null default now(),
  empresas_incluidas  uuid[],

  unique (grupo_id, competencia)
);

comment on table public.consolidado_cache is
  'Snapshot do consolidado por grupo. Refresh via job noturno.';


-- ------------------------------------------------------------
-- 4. RELATÓRIOS COMPARATIVOS
-- ------------------------------------------------------------
create table if not exists public.relatorios_comparativos (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references auth.users(id),

  nome                text not null,
  tipo                text not null
                        check (tipo in (
                          'dre_comparativo','fluxo_caixa_comparativo',
                          'indicadores_comparativos','ranking_empresas',
                          'evolucao_historica'
                        )),

  empresas_ids        uuid[] not null,
  competencia_inicio  text not null,
  competencia_fim     text not null,

  indicador           text,
  resultado_json      jsonb,
  pdf_url             text,

  gerado_em           timestamptz,
  gerado_por          uuid references auth.users(id),

  created_at          timestamptz not null default now()
);

comment on table public.relatorios_comparativos is
  'Log de relatórios comparativos gerados. resultado_json armazena os dados para re-exibição.';


-- ============================================================
-- ÍNDICES
-- ============================================================

create index if not exists idx_grupos_owner          on public.grupos_empresariais(owner_id);
create index if not exists idx_grupos_emp_grupo      on public.grupos_empresas(grupo_id);
create index if not exists idx_grupos_emp_company    on public.grupos_empresas(company_id);

create index if not exists idx_transfer_owner        on public.transferencias_intercompany(owner_id);
create index if not exists idx_transfer_origem       on public.transferencias_intercompany(company_origem_id);
create index if not exists idx_transfer_destino      on public.transferencias_intercompany(company_destino_id);
create index if not exists idx_transfer_data         on public.transferencias_intercompany(data);
create index if not exists idx_transfer_status       on public.transferencias_intercompany(status);

create index if not exists idx_consolidado_grupo     on public.consolidado_cache(grupo_id);
create index if not exists idx_consolidado_comp      on public.consolidado_cache(competencia);

create index if not exists idx_relat_comp_owner      on public.relatorios_comparativos(owner_id);


-- ============================================================
-- TRIGGERS
-- ============================================================

drop trigger if exists trg_grupos_updated_at on public.grupos_empresariais;
create trigger trg_grupos_updated_at
  before update on public.grupos_empresariais
  for each row execute function public.set_updated_at();

drop trigger if exists trg_transfer_updated_at on public.transferencias_intercompany;
create trigger trg_transfer_updated_at
  before update on public.transferencias_intercompany
  for each row execute function public.set_updated_at();


-- ============================================================
-- ROW LEVEL SECURITY (auth.uid() + user_companies)
-- ============================================================

alter table public.grupos_empresariais          enable row level security;
alter table public.grupos_empresas              enable row level security;
alter table public.transferencias_intercompany  enable row level security;
alter table public.consolidado_cache            enable row level security;
alter table public.relatorios_comparativos      enable row level security;

-- grupos_empresariais: owner é o usuário
drop policy if exists "grupos_empresariais: select" on public.grupos_empresariais;
create policy "grupos_empresariais: select" on public.grupos_empresariais for select
  using (owner_id = auth.uid());
drop policy if exists "grupos_empresariais: insert" on public.grupos_empresariais;
create policy "grupos_empresariais: insert" on public.grupos_empresariais for insert
  with check (owner_id = auth.uid());
drop policy if exists "grupos_empresariais: update" on public.grupos_empresariais;
create policy "grupos_empresariais: update" on public.grupos_empresariais for update
  using (owner_id = auth.uid());
drop policy if exists "grupos_empresariais: delete" on public.grupos_empresariais;
create policy "grupos_empresariais: delete" on public.grupos_empresariais for delete
  using (owner_id = auth.uid());

-- grupos_empresas: via grupo owner
drop policy if exists "grupos_empresas: select" on public.grupos_empresas;
create policy "grupos_empresas: select" on public.grupos_empresas for select
  using (grupo_id in (select id from public.grupos_empresariais where owner_id = auth.uid()));
drop policy if exists "grupos_empresas: insert" on public.grupos_empresas;
create policy "grupos_empresas: insert" on public.grupos_empresas for insert
  with check (grupo_id in (select id from public.grupos_empresariais where owner_id = auth.uid()));
drop policy if exists "grupos_empresas: update" on public.grupos_empresas;
create policy "grupos_empresas: update" on public.grupos_empresas for update
  using (grupo_id in (select id from public.grupos_empresariais where owner_id = auth.uid()));
drop policy if exists "grupos_empresas: delete" on public.grupos_empresas;
create policy "grupos_empresas: delete" on public.grupos_empresas for delete
  using (grupo_id in (select id from public.grupos_empresariais where owner_id = auth.uid()));

-- transferencias_intercompany: owner
drop policy if exists "transferencias: select" on public.transferencias_intercompany;
create policy "transferencias: select" on public.transferencias_intercompany for select
  using (owner_id = auth.uid());
drop policy if exists "transferencias: insert" on public.transferencias_intercompany;
create policy "transferencias: insert" on public.transferencias_intercompany for insert
  with check (owner_id = auth.uid());
drop policy if exists "transferencias: update" on public.transferencias_intercompany;
create policy "transferencias: update" on public.transferencias_intercompany for update
  using (owner_id = auth.uid());
drop policy if exists "transferencias: delete" on public.transferencias_intercompany;
create policy "transferencias: delete" on public.transferencias_intercompany for delete
  using (owner_id = auth.uid());

-- consolidado_cache: via grupo owner (leitura), service_role (escrita)
drop policy if exists "consolidado_cache: select" on public.consolidado_cache;
create policy "consolidado_cache: select" on public.consolidado_cache for select
  using (grupo_id in (select id from public.grupos_empresariais where owner_id = auth.uid()));
drop policy if exists "consolidado_cache: insert service_role" on public.consolidado_cache;
create policy "consolidado_cache: insert service_role" on public.consolidado_cache for insert
  with check (auth.role() = 'service_role');
drop policy if exists "consolidado_cache: update service_role" on public.consolidado_cache;
create policy "consolidado_cache: update service_role" on public.consolidado_cache for update
  using (auth.role() = 'service_role');

-- relatorios_comparativos: owner
drop policy if exists "relatorios_comparativos: select" on public.relatorios_comparativos;
create policy "relatorios_comparativos: select" on public.relatorios_comparativos for select
  using (owner_id = auth.uid());
drop policy if exists "relatorios_comparativos: insert" on public.relatorios_comparativos;
create policy "relatorios_comparativos: insert" on public.relatorios_comparativos for insert
  with check (owner_id = auth.uid());
drop policy if exists "relatorios_comparativos: delete" on public.relatorios_comparativos;
create policy "relatorios_comparativos: delete" on public.relatorios_comparativos for delete
  using (owner_id = auth.uid());


-- ============================================================
-- FUNÇÃO — calcular consolidado do grupo
-- ============================================================

create or replace function public.calcular_consolidado_grupo(
  p_grupo_id    uuid,
  p_competencia text
)
returns void language plpgsql security definer as $$
declare
  v_empresas    uuid[];
  v_receita     numeric(15,2);
  v_despesas    numeric(15,2);
  v_caixa       numeric(15,2);
  v_cr_aberto   numeric(15,2);
  v_cp_aberto   numeric(15,2);
  v_eliminacoes numeric(15,2);
  v_qtd_transf  integer;
begin
  -- Empresas do grupo
  select array_agg(company_id)
    into v_empresas
    from public.grupos_empresas
   where grupo_id = p_grupo_id;

  -- Receita consolidada
  select coalesce(sum(saldo), 0)
    into v_receita
    from public.mv_dre_mensal
   where company_id = any(v_empresas)
     and competencia = p_competencia
     and tipo = 'receita';

  -- Despesas operacionais
  select coalesce(sum(saldo), 0)
    into v_despesas
    from public.mv_dre_mensal
   where company_id = any(v_empresas)
     and competencia = p_competencia
     and tipo = 'despesa';

  -- Caixa total
  select coalesce(sum(saldo_atual), 0)
    into v_caixa
    from public.v_saldo_contas_bancarias
   where company_id = any(v_empresas);

  -- CR aberto
  select coalesce(sum(valor), 0)
    into v_cr_aberto
    from public.contas_receber
   where company_id = any(v_empresas)
     and status in ('aberto','parcial','vencido');

  -- CP aberto
  select coalesce(sum(valor), 0)
    into v_cp_aberto
    from public.contas_pagar
   where company_id = any(v_empresas)
     and status in ('aberto','parcial','vencido');

  -- Eliminações intercompany
  select coalesce(sum(valor), 0), count(*)
    into v_eliminacoes, v_qtd_transf
    from public.transferencias_intercompany
   where company_origem_id = any(v_empresas)
     and company_destino_id = any(v_empresas)
     and to_char(data, 'YYYY-MM') = p_competencia
     and status = 'concluida';

  -- Upsert
  insert into public.consolidado_cache (
    grupo_id, competencia,
    receita_bruta, receita_liquida,
    lucro_bruto, despesas_operac, ebitda, resultado_liquido,
    caixa_total, cr_total_aberto, cp_total_aberto,
    total_eliminacoes, qtd_transferencias,
    calculado_em, empresas_incluidas
  ) values (
    p_grupo_id, p_competencia,
    v_receita, v_receita,
    v_receita, v_despesas,
    v_receita - v_despesas,
    v_receita - v_despesas,
    v_caixa, v_cr_aberto, v_cp_aberto,
    v_eliminacoes, v_qtd_transf,
    now(), v_empresas
  )
  on conflict (grupo_id, competencia) do update set
    receita_bruta       = excluded.receita_bruta,
    receita_liquida     = excluded.receita_liquida,
    lucro_bruto         = excluded.lucro_bruto,
    despesas_operac     = excluded.despesas_operac,
    ebitda              = excluded.ebitda,
    resultado_liquido   = excluded.resultado_liquido,
    caixa_total         = excluded.caixa_total,
    cr_total_aberto     = excluded.cr_total_aberto,
    cp_total_aberto     = excluded.cp_total_aberto,
    total_eliminacoes   = excluded.total_eliminacoes,
    qtd_transferencias  = excluded.qtd_transferencias,
    calculado_em        = now(),
    empresas_incluidas  = excluded.empresas_incluidas;
end;
$$;

comment on function public.calcular_consolidado_grupo is
  'Calcula e armazena o consolidado do grupo. Chame após refresh das MVs.';


-- ============================================================
-- VIEW — posição consolidada atual por grupo
-- ============================================================

create or replace view public.v_consolidado_atual as
select
  g.owner_id,
  g.id                  as grupo_id,
  g.nome                as grupo_nome,
  cc.competencia,
  cc.receita_bruta,
  cc.resultado_liquido,
  cc.caixa_total,
  cc.cr_total_aberto,
  cc.cp_total_aberto,
  cc.total_eliminacoes,
  cc.qtd_transferencias,
  cc.calculado_em,
  array_length(cc.empresas_incluidas, 1) as qtd_empresas
from public.grupos_empresariais g
join public.consolidado_cache cc on cc.grupo_id = g.id
where g.ativo = true;

comment on view public.v_consolidado_atual is
  'Visão do consolidado mais recente por grupo. Use no dashboard multi-empresa.';
