-- Fase 1 do PLANO_SALDO_CONCILIACAO: guardar o saldo de fechamento declarado pelo banco
-- (LEDGERBAL/BALAMT do OFX) por conta e data, para mostrar a divergência banco × sistema.
-- Aditiva: não altera nenhum saldo nem tabela existente.

create table if not exists public.bank_statement_balances (
  id uuid primary key default gen_random_uuid(),
  bank_account_id uuid not null references public.bank_accounts(id) on delete cascade,
  company_id uuid not null,
  as_of_date date not null,
  closing_balance numeric not null,
  source text not null default 'ofx',
  import_file_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_bsb_account_date
  on public.bank_statement_balances (bank_account_id, as_of_date desc);

-- Um saldo por conta/data (re-importar o mesmo extrato faz upsert).
create unique index if not exists uq_bsb_account_date
  on public.bank_statement_balances (bank_account_id, as_of_date);

alter table public.bank_statement_balances enable row level security;

drop policy if exists "Company Access Policy" on public.bank_statement_balances;
create policy "Company Access Policy" on public.bank_statement_balances
  for all
  using (has_company_access(auth.uid(), company_id))
  with check (has_company_access(auth.uid(), company_id));
