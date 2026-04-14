-- Adiciona previsao_cirurgia em vendas (usado por HAIR OF BRASIL para contratos de transplante capilar)

ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS previsao_cirurgia DATE;

COMMENT ON COLUMN public.vendas.previsao_cirurgia IS
  'Data prevista da cirurgia/procedimento (HAIR OF BRASIL). Usado em vendas tipo=contrato.';
