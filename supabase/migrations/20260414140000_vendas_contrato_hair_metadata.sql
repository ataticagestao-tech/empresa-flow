-- Campos operacionais de contrato (HAIR OF BRASIL)
-- Adiciona metadados do contrato: consultora, procedimento, reserva de data

ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS consultora     TEXT,
  ADD COLUMN IF NOT EXISTS procedimento   TEXT,
  ADD COLUMN IF NOT EXISTS reserva_valor  NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS reserva_data   DATE;

COMMENT ON COLUMN public.vendas.consultora    IS 'Consultora responsavel pela venda (HAIR OF BRASIL)';
COMMENT ON COLUMN public.vendas.procedimento  IS 'Tipo de procedimento (FUE, DHI, FUE + DHI, etc)';
COMMENT ON COLUMN public.vendas.reserva_valor IS 'Valor pago como reserva de data (abatido do total)';
COMMENT ON COLUMN public.vendas.reserva_data  IS 'Data em que a reserva foi/sera paga';
