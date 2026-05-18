-- ============================================================
-- Adicionar coluna cnae_descricao em suppliers
--
-- O campo cnae em suppliers guarda apenas o codigo (ex: "8650004").
-- A descricao da atividade ("Atividades de fisioterapia") era buscada
-- da BrasilAPI no momento do cadastro mas nunca persistida.
--
-- Esta coluna armazena a descricao para exibicao no card da lista
-- de fornecedores (no lugar do que seria o cargo em funcionarios).
-- ============================================================

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS cnae_descricao TEXT;
