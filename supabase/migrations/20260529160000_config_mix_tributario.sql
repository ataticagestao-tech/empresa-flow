-- =====================================================================
-- Mix tributário por empresa (regime-aware)
-- Cada linha = uma faixa de receita (atividade/nicho) com seus parâmetros.
-- A previsão de impostos rateia a receita do mês por essas faixas:
--   Simples       → usa anexo_simples (I–V) por faixa → soma o DAS
--   Presumido/Real→ usa presuncao_irpj + presuncao_csll + aliquota_iss
-- Sem mix, a previsão usa o padrão do regime (Anexo III/V por Fator R no
-- Simples; presunção 32% no Presumido). cnae pré-preenche via cnae_tributacao.
-- Ver lib/fiscal/apuracao.ts
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.config_mix_tributario (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome            text NOT NULL,
  cnae            text,                                   -- opcional: ref. à biblioteca cnae_tributacao
  pct_receita     numeric(5,2)  NOT NULL DEFAULT 0,       -- % da receita nesta faixa
  anexo_simples   text CHECK (anexo_simples IN ('I','II','III','IV','V')),  -- Simples
  presuncao_irpj  numeric(5,2)  NOT NULL DEFAULT 32,      -- % presunção IRPJ (Presumido/Real)
  presuncao_csll  numeric(5,2)  NOT NULL DEFAULT 32,      -- % presunção CSLL (Presumido/Real)
  aliquota_iss    numeric(5,2)  NOT NULL DEFAULT 3,       -- % ISS
  ordem           int           NOT NULL DEFAULT 0,
  created_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mix_trib_company_idx ON public.config_mix_tributario (company_id, ordem);

ALTER TABLE public.config_mix_tributario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mix_trib_select" ON public.config_mix_tributario;
CREATE POLICY "mix_trib_select" ON public.config_mix_tributario
  FOR SELECT USING (public.has_company_access(company_id));

DROP POLICY IF EXISTS "mix_trib_insert" ON public.config_mix_tributario;
CREATE POLICY "mix_trib_insert" ON public.config_mix_tributario
  FOR INSERT WITH CHECK (public.has_company_access(company_id));

DROP POLICY IF EXISTS "mix_trib_update" ON public.config_mix_tributario;
CREATE POLICY "mix_trib_update" ON public.config_mix_tributario
  FOR UPDATE USING (public.has_company_access(company_id));

DROP POLICY IF EXISTS "mix_trib_delete" ON public.config_mix_tributario;
CREATE POLICY "mix_trib_delete" ON public.config_mix_tributario
  FOR DELETE USING (public.has_company_access(company_id));

COMMENT ON TABLE public.config_mix_tributario IS
  'Rateio da receita por faixa de tributação (regime-aware) para a previsão de impostos. Ver lib/fiscal/apuracao.ts';
