-- ============================================================
-- Add coluna descricao em contas_pagar
--
-- Motivacao: o campo "Descricao *" do modal Nova Conta a Pagar
-- era descartado quando havia credor selecionado, sobrescrevendo
-- credor_nome quando nao havia. Resultado: nao da pra ter
-- "Mensalidade Claro - linha A C Craveiro" como descricao e
-- "Claro S.A." como credor ao mesmo tempo.
--
-- Esta migration adiciona uma coluna descricao text dedicada e
-- faz backfill copiando o credor_nome atual (mantendo o que era
-- exibido). Apos isso, o app passa a salvar descricao separada
-- e o credor_nome guarda apenas o credor real.
-- ============================================================

ALTER TABLE public.contas_pagar
  ADD COLUMN IF NOT EXISTS descricao text;

-- Backfill: registros antigos copiam credor_nome para descricao
-- (preserva o que aparecia como "titulo" do lancamento).
UPDATE public.contas_pagar
SET descricao = credor_nome
WHERE descricao IS NULL;

COMMENT ON COLUMN public.contas_pagar.descricao IS
  'Descricao do lancamento (titulo livre, independente do credor). Backfill 2026-05-14 copiou credor_nome.';
