-- Adicionar coluna competencia em contas_pagar (faltou na criação da tabela)
ALTER TABLE public.contas_pagar
  ADD COLUMN IF NOT EXISTS competencia text;

CREATE INDEX IF NOT EXISTS idx_cp_competencia ON public.contas_pagar(competencia);
