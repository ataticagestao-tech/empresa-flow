-- Controle manual de NF emitida por venda
-- Usado pela tela NFSe > Emissao (aba "Vendas a faturar") enquanto nao ha
-- integracao automatica de emissao. Usuaria marca/desmarca o status na linha.

ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS nf_emitida       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS nf_emitida_em    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nf_emitida_por   UUID REFERENCES auth.users(id);

COMMENT ON COLUMN public.vendas.nf_emitida     IS 'Flag manual: marca se a NF da venda ja foi emitida (controle enquanto nao ha integracao)';
COMMENT ON COLUMN public.vendas.nf_emitida_em  IS 'Quando o usuario marcou nf_emitida=true';
COMMENT ON COLUMN public.vendas.nf_emitida_por IS 'Usuario que marcou nf_emitida=true';

CREATE INDEX IF NOT EXISTS idx_vendas_nf_emitida
  ON public.vendas (company_id, data_venda DESC)
  WHERE nf_emitida = FALSE;
