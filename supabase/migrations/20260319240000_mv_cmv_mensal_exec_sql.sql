-- ============================================================
-- GESTAP — MV CMV Mensal + exec_sql para refresh
-- ============================================================

-- MV: CMV mensal (Custo das Mercadorias Vendidas)
-- Soma movimentações de débito em contas do tipo 'expense' com dre_group contendo 'CMV' ou 'CSP'
create materialized view if not exists public.mv_cmv_mensal as
select
  m.company_id,
  to_char(m.data, 'YYYY-MM') as competencia,
  sum(m.valor) as cmv_total
from public.movimentacoes m
join public.chart_of_accounts ca on ca.id = m.conta_contabil_id
where m.tipo = 'debito'
  and ca.is_analytical = true
  and (
    lower(ca.dre_group) like '%cmv%'
    or lower(ca.dre_group) like '%csp%'
    or lower(ca.dre_group) like '%custo%servi%'
    or lower(ca.dre_group) like '%custo%mercadoria%'
  )
group by m.company_id, to_char(m.data, 'YYYY-MM')
with data;

create unique index if not exists idx_mv_cmv_mensal
  on public.mv_cmv_mensal(company_id, competencia);

comment on materialized view public.mv_cmv_mensal is
  'CMV/CSP mensal por empresa. Refresh via: REFRESH MATERIALIZED VIEW CONCURRENTLY mv_cmv_mensal;';

-- Função exec_sql para refresh das MVs via RPC (apenas service_role)
create or replace function public.exec_sql(query text)
returns void language plpgsql security definer as $$
begin
  execute query;
end;
$$;

revoke all on function public.exec_sql from public;

comment on function public.exec_sql is
  'Executa SQL arbitrário — apenas service_role. Usada para refresh das MVs.';
