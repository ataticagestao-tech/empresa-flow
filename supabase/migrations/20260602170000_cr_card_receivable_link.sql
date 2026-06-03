-- Fase 4.2 do PLANO_SALDO_CONCILIACAO: substituir os CR de cartão errados pela agenda Stone.
-- card_receivable_id  = liga o CR gerado ao item da agenda (dedup + identificação dos gerados).
-- substituido_em      = marca os CR originais arquivados pela substituição (para o "desfazer").
-- Aditivas, nullable, seguras.

alter table public.contas_receber add column if not exists card_receivable_id uuid;
alter table public.contas_receber add column if not exists substituido_em timestamptz;

create index if not exists idx_cr_card_receivable
  on public.contas_receber (card_receivable_id)
  where card_receivable_id is not null;
