-- Fase 4 do PLANO_SALDO_CONCILIACAO: agenda de recebíveis de cartão (Stone) como verdade.
-- Uma linha por parcela: data de liquidação (data_vencimento), valor líquido, taxa (MDR/antecipação).
-- Aditiva. Não altera contas_receber ainda (isso é a Fase 4.2).

create table if not exists public.card_receivables (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  bank_account_id uuid references public.bank_accounts(id) on delete set null,
  documento text,                 -- CNPJ no relatório
  stonecode text,
  categoria text,
  data_venda date,
  data_vencimento date not null,  -- data prevista de liquidação (settlement)
  data_vencimento_original date,
  bandeira text,
  produto text,                   -- Crédito / Débito
  stone_id text,
  qtd_parcelas int,
  num_parcela int,
  valor_bruto numeric,
  valor_liquido numeric not null,
  desconto_mdr numeric,           -- taxa MDR (negativo)
  desconto_antecipacao numeric,
  desconto_unificado numeric,
  status text,                    -- Aberto / Pago / ...
  data_status date,
  content_hash text not null,     -- dedup por parcela
  import_file_id uuid,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_card_receivables_hash
  on public.card_receivables (company_id, content_hash);
create index if not exists idx_card_receivables_venc
  on public.card_receivables (company_id, data_vencimento);

alter table public.card_receivables enable row level security;
drop policy if exists "Company Access Policy" on public.card_receivables;
create policy "Company Access Policy" on public.card_receivables
  for all
  using (has_company_access(auth.uid(), company_id))
  with check (has_company_access(auth.uid(), company_id));
