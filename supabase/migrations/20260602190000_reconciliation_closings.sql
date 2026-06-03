-- Fase 3.2 do PLANO_SALDO_CONCILIACAO: fechar período de conciliação + travar.
-- reconciliation_closings registra o fechamento por conta (saldo banco/sistema/diferença na data).
-- A trava bloqueia DESCONCILIAR um lançamento dentro de um período já fechado (saldo não "anda pra trás").
-- Estreita: só age na transição de "reconciled" → não-reconciled de lançamento com date <= período fechado.

create table if not exists public.reconciliation_closings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  bank_account_id uuid not null references public.bank_accounts(id) on delete cascade,
  period_end date not null,
  closing_balance numeric,
  system_balance numeric,
  difference numeric,
  closed_at timestamptz not null default now(),
  closed_by uuid
);

create index if not exists idx_rec_closings_account
  on public.reconciliation_closings (bank_account_id, period_end desc);

alter table public.reconciliation_closings enable row level security;
drop policy if exists "Company Access Policy" on public.reconciliation_closings;
create policy "Company Access Policy" on public.reconciliation_closings
  for all
  using (has_company_access(auth.uid(), company_id))
  with check (has_company_access(auth.uid(), company_id));

-- Trava: impede desconciliar lançamento em período fechado.
create or replace function public.fn_block_unreconcile_closed() returns trigger
language plpgsql security definer as $$
begin
  if (coalesce(OLD.status,'') = 'reconciled' and coalesce(NEW.status,'') <> 'reconciled')
     or (OLD.reconciled_at is not null and NEW.reconciled_at is null) then
    if exists (
      select 1 from public.reconciliation_closings rc
      where rc.bank_account_id = OLD.bank_account_id
        and OLD.date <= rc.period_end
    ) then
      raise exception 'Lancamento em periodo fechado - conciliacao travada. Reabra o fechamento desta conta primeiro.';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_block_unreconcile_closed on public.bank_transactions;
create trigger trg_block_unreconcile_closed before update on public.bank_transactions
  for each row execute function public.fn_block_unreconcile_closed();
