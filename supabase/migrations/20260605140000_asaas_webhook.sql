-- ============================================================
-- Asaas — Eventos de webhook (Etapa 3)
--
-- Guarda cada evento recebido do Asaas com event_id ÚNICO → idempotência:
-- se o Asaas reenviar o mesmo evento, o INSERT falha (23505) e o handler
-- ignora, evitando baixa dobrada.
--
-- Escrita só pela service role (handler). Leitura por tenant (auditoria).
-- ============================================================

create table if not exists public.asaas_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,          -- id do evento Asaas (ou "payment_id:event")
  event_type text,                        -- PAYMENT_RECEIVED, PAYMENT_CONFIRMED, ...
  asaas_payment_id text,
  company_id uuid references public.companies(id) on delete set null,
  payload jsonb,
  processed_at timestamptz not null default now()
);

create index if not exists idx_asaas_webhook_payment on public.asaas_webhook_events(asaas_payment_id);
create index if not exists idx_asaas_webhook_company on public.asaas_webhook_events(company_id);

alter table public.asaas_webhook_events enable row level security;

-- Só leitura por tenant; a escrita é exclusiva da service role (handler).
drop policy if exists "asaas_webhook_tenant_read" on public.asaas_webhook_events;
create policy "asaas_webhook_tenant_read" on public.asaas_webhook_events for select
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));
