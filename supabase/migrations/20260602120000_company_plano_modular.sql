-- Modularização por pacote (Fase 1): plano comercial Tática por empresa.
-- - plano: pacote contratado. NULL = acesso total (legado), pra não travar
--   clientes existentes até a atribuição do pacote.
-- - plano_config: overrides por empresa (módulos extras / ajuste de limites),
--   ex.: { "extra_modules": ["estoque"], "limits": { "bank_accounts": 4 } }.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS plano TEXT CHECK (plano IN ('assistente', 'controller', 'gestor')),
  ADD COLUMN IF NOT EXISTS plano_config JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.companies.plano IS 'Pacote comercial Tatica (assistente/controller/gestor). NULL = acesso total (legado).';
COMMENT ON COLUMN public.companies.plano_config IS 'Overrides por empresa: { extra_modules: text[], limits: { ... } }.';
