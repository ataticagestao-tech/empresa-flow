-- Fix: página Vendas estourava statement timeout ao listar vendas do mês
-- Causa: vendas_itens.venda_id não tinha índice, forçando seq scan no nested join
--        vendas -> vendas_itens(*) -> contas_receber(*) pelo PostgREST.

CREATE INDEX IF NOT EXISTS idx_vendas_itens_venda_id
  ON public.vendas_itens(venda_id);

-- Índice composto em vendas para acelerar o filtro por company + faixa de data
-- (usado no fetchVendas mensal)
CREATE INDEX IF NOT EXISTS idx_vendas_company_data
  ON public.vendas(company_id, data_venda DESC);
