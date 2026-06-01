-- Lucro mensal mínimo desejado por empresa (R$), usado no Ponto de Equilíbrio Econômico.
-- PE Econômico = (Custos Fixos + lucro_minimo_desejado) / Margem de Contribuição %.
-- Default 0 → enquanto não definido, PE Econômico == PE Contábil.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS lucro_minimo_desejado numeric(15,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.companies.lucro_minimo_desejado IS
  'Lucro mensal mínimo desejado (R$) para o Ponto de Equilíbrio Econômico. Default 0.';
