-- Adicionar coluna 'tipo' na tabela vendas (servico, produto, pacote, contrato)
-- Coluna usada no frontend mas nunca criada na migration original

ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'servico';
