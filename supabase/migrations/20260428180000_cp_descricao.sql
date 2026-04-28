-- ============================================================
-- contas_pagar: adicionar coluna descricao
-- Hoje a "descricao" do form era salva em credor_nome quando
-- nao havia credor real selecionado (perdendo o texto se havia).
-- Agora descricao tem coluna propria, independente de credor.
-- ============================================================

ALTER TABLE public.contas_pagar
  ADD COLUMN IF NOT EXISTS descricao text;

COMMENT ON COLUMN public.contas_pagar.descricao IS
  'Descricao livre da despesa (ex: "Aluguel janeiro"). Independente do credor.';
