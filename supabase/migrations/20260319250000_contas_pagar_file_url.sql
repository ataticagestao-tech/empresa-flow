-- Adicionar colunas extras em contas_pagar e contas_receber
ALTER TABLE public.contas_pagar
  ADD COLUMN IF NOT EXISTS file_url text,
  ADD COLUMN IF NOT EXISTS codigo_barras text;

ALTER TABLE public.contas_receber
  ADD COLUMN IF NOT EXISTS file_url text,
  ADD COLUMN IF NOT EXISTS codigo_barras text;
