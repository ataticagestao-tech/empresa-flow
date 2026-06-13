-- ============================================================
-- Asaas — Cobranças geradas (Etapa 2)
--
-- Cada linha = uma cobrança criada no Asaas (link único: o cliente final
-- escolhe Pix/boleto/cartão na invoiceUrl). Liga à conta_receber de origem
-- (e, quando veio de venda, à venda). É a ponte que o webhook (Etapa 3) usa
-- pra achar QUAL CR baixar quando o pagamento é confirmado.
--
-- Depende de: companies, contas_receber, set_updated_at()
-- ============================================================

create table if not exists public.asaas_cobrancas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,

  -- Origem da cobrança no sistema.
  conta_receber_id uuid references public.contas_receber(id) on delete set null,
  venda_id uuid, -- referência solta (vendas usa soft-delete)

  -- Identificadores no Asaas.
  asaas_payment_id text not null,  -- id da cobrança no Asaas (chave do webhook)
  asaas_customer_id text,          -- id do cliente no Asaas
  ambiente varchar(12) not null,   -- 'sandbox' | 'producao' (onde foi criada)

  billing_type varchar(20) not null default 'UNDEFINED', -- UNDEFINED = link, o cliente escolhe
  valor numeric(15,2) not null,
  vencimento date,

  -- Espelha o status do Asaas: PENDING, RECEIVED, CONFIRMED, OVERDUE,
  -- REFUNDED, RECEIVED_IN_CASH, etc.
  status varchar(30) not null default 'PENDING',

  invoice_url text,        -- link de pagamento (cliente escolhe a forma)
  pix_payload text,        -- copia-e-cola do Pix
  external_reference text, -- "company_id:conta_receber_id" (roteamento do webhook)

  pago_em timestamptz,
  valor_pago numeric(15,2),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(company_id, asaas_payment_id)
);

create index if not exists idx_asaas_cob_company on public.asaas_cobrancas(company_id);
create index if not exists idx_asaas_cob_cr on public.asaas_cobrancas(conta_receber_id);
create index if not exists idx_asaas_cob_payment on public.asaas_cobrancas(asaas_payment_id);
create index if not exists idx_asaas_cob_venda on public.asaas_cobrancas(venda_id);

-- RLS multi-tenant
alter table public.asaas_cobrancas enable row level security;

drop policy if exists "asaas_cob_tenant" on public.asaas_cobrancas;
create policy "asaas_cob_tenant" on public.asaas_cobrancas for all
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));

drop trigger if exists trg_asaas_cob_updated on public.asaas_cobrancas;
create trigger trg_asaas_cob_updated before update on public.asaas_cobrancas
  for each row execute function public.set_updated_at();
