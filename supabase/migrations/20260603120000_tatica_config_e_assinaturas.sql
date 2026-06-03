-- Fatura mensal do sistema (Fase A): dados da Tática como EMISSORA + preço por
-- plano + campos de assinatura por empresa. NÃO cria ainda as faturas em si
-- (isso é a Fase B). Tudo aditivo e seguro.

-- 1) Config da Tática (emissora das faturas) — tabela singleton (id sempre = 1).
CREATE TABLE IF NOT EXISTS public.tatica_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- Identidade
  razao_social text,
  nome_fantasia text,
  cnpj text,
  inscricao_estadual text,
  inscricao_municipal text,
  endereco_logradouro text,
  endereco_numero text,
  endereco_bairro text,
  endereco_cidade text,
  endereco_estado text,
  endereco_cep text,
  logo_url text,
  -- Contato
  contato_email text,
  contato_telefone text,
  site text,
  -- Recebimento (modo manual)
  pix_chave text,
  pix_titular_nome text,
  pix_titular_documento text,
  banco text,
  agencia text,
  conta text,
  conta_digito text,
  -- Preço base por plano (editável sem deploy). Override por empresa fica em companies.mensalidade_valor.
  precos_planos jsonb NOT NULL DEFAULT '{"assistente":0,"controller":0,"gestor":0}'::jsonb,
  -- Reservados pro gateway (Fase D) — nulos no modo manual.
  gateway_provider text,
  gateway_config jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Garante a linha única.
INSERT INTO public.tatica_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.tatica_config ENABLE ROW LEVEL SECURITY;
-- Leitura liberada (fatura/portal precisam); escrita é gated na UI (owner-only),
-- mesmo padrão pragmático das outras telas de admin.
DROP POLICY IF EXISTS tatica_config_select ON public.tatica_config;
CREATE POLICY tatica_config_select ON public.tatica_config
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS tatica_config_write ON public.tatica_config;
CREATE POLICY tatica_config_write ON public.tatica_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2) Assinatura por empresa: override de preço + dia de vencimento + status.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS mensalidade_valor numeric,            -- null = herda o preço do plano
  ADD COLUMN IF NOT EXISTS dia_vencimento integer DEFAULT 10 CHECK (dia_vencimento BETWEEN 1 AND 28),
  ADD COLUMN IF NOT EXISTS assinatura_status text DEFAULT 'ativa'
    CHECK (assinatura_status IN ('ativa', 'suspensa', 'cancelada'));

COMMENT ON TABLE public.tatica_config IS 'Dados da Tática como emissora das faturas do sistema (singleton id=1).';
COMMENT ON COLUMN public.companies.mensalidade_valor IS 'Override da mensalidade; null = herda tatica_config.precos_planos[plano].';
COMMENT ON COLUMN public.companies.assinatura_status IS 'Estado da assinatura do sistema: ativa/suspensa/cancelada.';
