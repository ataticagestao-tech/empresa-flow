-- ============================================================
-- RPC: Copiar produtos de uma empresa para outra
-- Copia cadastro de produtos (sem estoque) entre lojas/empresas
-- ============================================================

CREATE OR REPLACE FUNCTION public.copiar_produtos_entre_empresas(
  p_origem_id uuid,
  p_destino_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  -- Validar que origem e destino são diferentes
  IF p_origem_id = p_destino_id THEN
    RAISE EXCEPTION 'Empresa de origem e destino não podem ser iguais';
  END IF;

  -- Inserir produtos que não existem no destino (by code)
  INSERT INTO public.products (
    company_id,
    code,
    description,
    family,
    ncm,
    cest,
    ean,
    price,
    cost_price,
    activity,
    taxation_type,
    type_sped,
    is_active,
    unidade_medida,
    metodo_custeio,
    tipo_produto,
    controla_validade,
    controla_lote
  )
  SELECT
    p_destino_id,
    p.code,
    p.description,
    p.family,
    p.ncm,
    p.cest,
    p.ean,
    p.price,
    p.cost_price,
    p.activity,
    p.taxation_type,
    p.type_sped,
    p.is_active,
    p.unidade_medida,
    p.metodo_custeio,
    p.tipo_produto,
    p.controla_validade,
    p.controla_lote
  FROM public.products p
  WHERE p.company_id = p_origem_id
    AND p.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM public.products d
      WHERE d.company_id = p_destino_id
        AND d.code = p.code
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
