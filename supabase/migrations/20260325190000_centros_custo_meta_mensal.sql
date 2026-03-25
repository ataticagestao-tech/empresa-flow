-- Adicionar coluna meta_mensal em centros_custo
ALTER TABLE public.centros_custo
  ADD COLUMN IF NOT EXISTS meta_mensal numeric(15,2),
  ADD COLUMN IF NOT EXISTS is_padrao boolean NOT NULL DEFAULT false;
