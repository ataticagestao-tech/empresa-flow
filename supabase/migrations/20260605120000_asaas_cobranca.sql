-- ============================================================
-- Asaas — Cobrança (Pix/boleto) para os clientes do cliente
-- Etapa 1: configuração por empresa (bring-your-own-key)
--
-- Modelo "Caminho 1": cada empresa-cliente usa a PRÓPRIA conta Asaas.
-- A chave (API Key) fica guardada por empresa; o dinheiro cai no banco
-- DELA, não no da Tática. Os campos de cobrança (juros/multa/vencimento)
-- e o webhook_token são consumidos nas Etapas 2 e 3.
--
-- Depende de: companies, user_companies, set_updated_at()
-- Padrão multi-tenant: company_id (igual nfse_configuracoes)
-- ============================================================

create table if not exists public.asaas_configuracoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,

  -- Chaves da conta Asaas da empresa (sandbox = teste, produção = real).
  -- Guardadas no banco; o frontend nunca as exibe (campos password + máscara).
  api_key_sandbox text,
  api_key_producao text,
  ambiente varchar(12) not null default 'sandbox', -- 'sandbox' | 'producao'

  -- Cache da última conexão bem-sucedida (só pra UI confirmar "conectado").
  conta_nome text,
  conta_email text,
  wallet_id text,

  -- Padrões de cobrança (Etapa 2).
  dias_vencimento integer not null default 3,   -- vencimento = hoje + N dias
  juros_mensal numeric(5,2) not null default 0, -- % de juros ao mês (boleto)
  multa numeric(5,2) not null default 0,        -- % de multa por atraso

  -- Token que o Asaas devolve no header do webhook; gerado por nós e
  -- registrado no painel Asaas da empresa, pra validar quem chama (Etapa 3).
  webhook_token text,

  ativo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(company_id)
);

create index if not exists idx_asaas_config_company on public.asaas_configuracoes(company_id);

-- RLS multi-tenant (mesmo padrão de nfse_configuracoes)
alter table public.asaas_configuracoes enable row level security;

drop policy if exists "asaas_config_tenant" on public.asaas_configuracoes;
create policy "asaas_config_tenant" on public.asaas_configuracoes for all
  using (company_id in (
    select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
  ));

-- updated_at automático
drop trigger if exists trg_asaas_config_updated on public.asaas_configuracoes;
create trigger trg_asaas_config_updated before update on public.asaas_configuracoes
  for each row execute function public.set_updated_at();
