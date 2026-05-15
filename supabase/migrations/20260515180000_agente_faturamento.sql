-- ============================================================
-- agente_faturamento — Helper SQL para o agente Tatica
-- Retorna faturamento total de uma empresa no período.
-- Espelha o cálculo do dashboard:
--   Competência: SUM(vendas.valor_liquido) por data_venda, status='confirmado'
--   Caixa:       SUM(contas_receber.valor_pago) por data_pagamento, status='pago'
-- ============================================================

CREATE OR REPLACE FUNCTION public.agente_faturamento(
  p_company_id uuid,
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL,
  p_regime text DEFAULT 'competencia'
)
RETURNS TABLE(
  total numeric,
  qtd_registros integer,
  data_inicio date,
  data_fim date,
  regime text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inicio date;
  v_fim date;
  v_regime text;
BEGIN
  -- Default: mês corrente
  v_inicio := COALESCE(p_data_inicio, date_trunc('month', CURRENT_DATE)::date);
  v_fim    := COALESCE(p_data_fim, (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date);
  v_regime := LOWER(COALESCE(p_regime, 'competencia'));

  IF v_regime = 'caixa' THEN
    RETURN QUERY
    SELECT
      COALESCE(SUM(cr.valor_pago), 0)::numeric AS total,
      COUNT(*)::integer AS qtd_registros,
      v_inicio,
      v_fim,
      'caixa'::text
    FROM public.contas_receber cr
    WHERE cr.company_id = p_company_id
      AND cr.status = 'pago'
      AND cr.deleted_at IS NULL
      AND cr.data_pagamento BETWEEN v_inicio AND v_fim
      -- exclui transferências entre contas (mesmo padrão do dashboard)
      AND NOT EXISTS (
        SELECT 1 FROM public.bank_accounts ba
        WHERE ba.id::text = cr.observacoes
      );
  ELSE
    RETURN QUERY
    SELECT
      COALESCE(SUM(v.valor_liquido), 0)::numeric AS total,
      COUNT(*)::integer AS qtd_registros,
      v_inicio,
      v_fim,
      'competencia'::text
    FROM public.vendas v
    WHERE v.company_id = p_company_id
      AND v.status = 'confirmado'
      AND v.data_venda BETWEEN v_inicio AND v_fim;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.agente_faturamento IS 'Faturamento total da empresa no período. Regime: competência (vendas confirmadas) ou caixa (recebimentos).';
