CREATE OR REPLACE FUNCTION public.fn_relatorio_fluxo(
  p_company_id uuid,
  p_data_inicio date,
  p_data_fim date
)
RETURNS TABLE (
  cat_id uuid,
  cat_nome text,
  tipo text,
  total numeric(15,2),
  lancamentos jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.conta_contabil_id as cat_id,
    COALESCE(ca.name, 'Sem categoria') as cat_nome,
    m.tipo,
    SUM(m.valor)::numeric(15,2) as total,
    jsonb_agg(
      jsonb_build_object(
        'data', m.data,
        'valor', m.valor,
        'descricao', COALESCE(m.descricao, '—')
      )
      ORDER BY m.data DESC
    ) as lancamentos
  FROM public.movimentacoes m
  LEFT JOIN public.chart_of_accounts ca ON ca.id = m.conta_contabil_id
  WHERE m.company_id = p_company_id
    AND m.origem != 'transferencia'
    AND m.data >= p_data_inicio
    AND m.data <= p_data_fim
  GROUP BY m.conta_contabil_id, ca.name, m.tipo
  ORDER BY total DESC;
END;
$$;
