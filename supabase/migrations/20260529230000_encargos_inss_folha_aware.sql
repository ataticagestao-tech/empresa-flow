-- =====================================================================
-- Encargos da folha cientes de regime + Anexo Simples
-- ---------------------------------------------------------------------
-- 1) RAT por CNAE na biblioteca (1%/2%/3% conforme Decreto 6.957/2009).
-- 2) FAP individual por empresa (0,5–2,0; vem do e-Cac, default 1,0).
-- 3) Terceiros (Sistema S, ~5,8%) registrado por competência em encargos.
--
-- Regra de recolhimento de INSS Folha (1 guia única = Patronal + RAT×FAP
-- + Terceiros + Retido funcionário) aplicada em src/lib/folha/encargos.ts:
--   - Simples Anexo IV       → recolhe
--   - Lucro Presumido / Real → recolhe
--   - Simples I/II/III/V     → NÃO recolhe (já está no DAS)
--   - MEI / sem regime       → NÃO recolhe
-- =====================================================================

ALTER TABLE public.cnae_tributacao
  ADD COLUMN IF NOT EXISTS rat_aliquota numeric(4,2) NOT NULL DEFAULT 2.0;
COMMENT ON COLUMN public.cnae_tributacao.rat_aliquota IS
  '% RAT do CNAE (Decreto 6.957/2009 Anexo V). 1=leve, 2=médio, 3=grave.';

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS fap_fator numeric(4,2) NOT NULL DEFAULT 1.0;
COMMENT ON COLUMN public.companies.fap_fator IS
  'FAP individual da empresa (0,5–2,0). Consultar no e-Cac/Sefip; default 1,0.';

ALTER TABLE public.encargos
  ADD COLUMN IF NOT EXISTS terceiros numeric(12,2) NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.encargos.terceiros IS
  'Contribuição Terceiros / Sistema S (~5,8% da folha). Compõe a guia de INSS Folha em Anexo IV / Presumido / Real.';
