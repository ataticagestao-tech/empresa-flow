-- ============================================================
-- Configuração de Taxas por Meio de Pagamento (por conta bancária)
-- Permite definir: taxa %, parcelas máx, prazo recebimento, antecipação
-- ============================================================

CREATE TABLE IF NOT EXISTS public.configuracao_taxas_pagamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  bank_account_id UUID NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,

  -- Meio de pagamento: cartao_credito, cartao_debito, boleto, pix
  meio_pagamento TEXT NOT NULL CHECK (meio_pagamento IN ('cartao_credito', 'cartao_debito', 'boleto', 'pix')),

  -- Taxa percentual cobrada pela operadora/banco (ex: 4.99 = 4.99%)
  taxa_percentual NUMERIC(6,3) NOT NULL DEFAULT 0,

  -- Número máximo de parcelas aceitas (1 = à vista apenas)
  max_parcelas INTEGER NOT NULL DEFAULT 1 CHECK (max_parcelas >= 1 AND max_parcelas <= 24),

  -- Dias para recebimento (D+N). Ex: cartão crédito sem antecipação = 30
  dias_recebimento INTEGER NOT NULL DEFAULT 0,

  -- Se tem antecipação automática (recebe tudo de uma vez com taxa extra)
  antecipacao_ativa BOOLEAN NOT NULL DEFAULT FALSE,

  -- Taxa extra de antecipação (% ao mês sobre o valor antecipado)
  taxa_antecipacao NUMERIC(6,3) NOT NULL DEFAULT 0,

  -- Ativo/Inativo
  ativo BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Uma config por meio de pagamento por conta bancária
  UNIQUE(bank_account_id, meio_pagamento)
);

-- RLS
ALTER TABLE public.configuracao_taxas_pagamento ENABLE ROW LEVEL SECURITY;

drop policy if exists "Company members can manage configuracao_taxas" on public.configuracao_taxas_pagamento;
CREATE POLICY "Company members can manage configuracao_taxas"
  ON public.configuracao_taxas_pagamento
  FOR ALL
  USING (
    company_id IN (
      SELECT uc.company_id FROM public.user_companies uc
      WHERE uc.user_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT uc.company_id FROM public.user_companies uc
      WHERE uc.user_id = auth.uid()
    )
  );

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Só cria se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_configuracao_taxas_updated_at'
  ) THEN
    CREATE TRIGGER trg_configuracao_taxas_updated_at
      BEFORE UPDATE ON public.configuracao_taxas_pagamento
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;

-- Index para busca rápida
CREATE INDEX IF NOT EXISTS idx_config_taxas_company_bank
  ON public.configuracao_taxas_pagamento(company_id, bank_account_id);
