-- Fase 2 (global) do PLANO_SALDO_CONCILIACAO: saldo ANCORADO no extrato.
-- A view v_saldo_contas_bancarias passa a usar o saldo do banco (LEDGERBAL do último
-- extrato importado) como verdade do saldo_atual, quando existe; senão, mantém o cálculo
-- antigo (initial_balance + movimentações) — FALLBACK, nada muda pra contas sem extrato.
--
-- Impacto real hoje: só contas COM extrato importado mudam. Atualmente = só a Stone (HAIR),
-- que sai de -99.126,15 (razão furado) para +37.467,72 (banco em 31/05). As demais ficam iguais.
--
-- saldo_atual = closing_balance + Σ(movimentações com data > as_of_date)   [quando tem extrato]
--             = initial_balance + Σ(movimentações)                          [fallback]
-- movimentado continua sendo o movimento bruto do razão (para diagnóstico).
--
-- REVERSÍVEL: para voltar ao comportamento antigo, recriar a view sem o CTE `ext`
-- (saldo_atual = initial_balance + movimentado).

create or replace view public.v_saldo_contas_bancarias as
with ext as (
  select distinct on (bank_account_id) bank_account_id, as_of_date, closing_balance
  from public.bank_statement_balances
  order by bank_account_id, as_of_date desc
)
select
  ba.id as conta_bancaria_id,
  ba.company_id,
  ba.name as nome,
  ba.banco,
  ba.type as tipo,
  ba.initial_balance as saldo_inicial,
  ba.data_saldo_inicial,
  coalesce(sum(case when m.tipo = 'credito' then m.valor when m.tipo = 'debito' then -m.valor else 0 end), 0) as movimentado,
  case
    when e.closing_balance is not null then
      e.closing_balance + coalesce(sum(case when m.data > e.as_of_date then (case when m.tipo = 'credito' then m.valor when m.tipo = 'debito' then -m.valor else 0 end) else 0 end), 0)
    else
      ba.initial_balance + coalesce(sum(case when m.tipo = 'credito' then m.valor when m.tipo = 'debito' then -m.valor else 0 end), 0)
  end as saldo_atual
from public.bank_accounts ba
left join ext e on e.bank_account_id = ba.id
left join public.movimentacoes m on m.conta_bancaria_id = ba.id
group by ba.id, ba.company_id, ba.name, ba.banco, ba.type, ba.initial_balance, ba.data_saldo_inicial, e.closing_balance, e.as_of_date;
