-- Arquivo de lançamentos removidos do razão (hard-delete preservado).
-- A tabela movimentacoes_arquivadas guarda a linha original (jsonb) + motivo + data.
-- RLS por empresa, igual às demais.

create table if not exists public.movimentacoes_arquivadas (
  id uuid primary key,
  company_id uuid,
  dados jsonb not null,
  motivo text,
  arquivado_em timestamptz not null default now()
);

alter table public.movimentacoes_arquivadas enable row level security;
drop policy if exists "Company Access Policy" on public.movimentacoes_arquivadas;
create policy "Company Access Policy" on public.movimentacoes_arquivadas
  for all
  using (has_company_access(auth.uid(), company_id))
  with check (has_company_access(auth.uid(), company_id));
