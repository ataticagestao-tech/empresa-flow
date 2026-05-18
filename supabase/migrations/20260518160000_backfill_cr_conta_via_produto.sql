-- ============================================================
-- RPC backfill_cr_conta_contabil_via_produto
--
-- Atualiza conta_contabil_id em contas_receber baseado no produto
-- vinculado (cr.produto_id -> products.conta_contabil_id).
--
-- Aplica em:
--   - CRs com produto_id preenchido
--   - Cujo produto tem conta_contabil_id definido
--   - Que estao com conta_contabil_id diferente da do produto
--     OU sem conta_contabil_id
--
-- O trigger bloquear_edicao_pago ja permite UPDATE de conta_contabil_id
-- em CRs pagas (regra 3c reclassificacao).
--
-- Retorna numero de linhas afetadas.
-- ============================================================

CREATE OR REPLACE FUNCTION public.backfill_cr_conta_contabil_via_produto(
  p_company_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Garante que o usuario tem acesso a essa company
  IF NOT EXISTS (
    SELECT 1 FROM public.user_companies
    WHERE user_id = auth.uid() AND company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Sem acesso a essa empresa';
  END IF;

  WITH atualizadas AS (
    UPDATE public.contas_receber cr
    SET conta_contabil_id = p.conta_contabil_id
    FROM public.products p
    WHERE cr.company_id = p_company_id
      AND cr.produto_id = p.id
      AND p.conta_contabil_id IS NOT NULL
      AND cr.conta_contabil_id IS DISTINCT FROM p.conta_contabil_id
      AND cr.deleted_at IS NULL
    RETURNING cr.id
  )
  SELECT COUNT(*) INTO v_count FROM atualizadas;

  -- Propaga para movimentacoes vinculadas (Fluxo de Caixa)
  UPDATE public.movimentacoes m
  SET conta_contabil_id = cr.conta_contabil_id
  FROM public.contas_receber cr
  JOIN public.products p ON p.id = cr.produto_id
  WHERE m.conta_receber_id = cr.id
    AND cr.company_id = p_company_id
    AND p.conta_contabil_id IS NOT NULL
    AND m.conta_contabil_id IS DISTINCT FROM cr.conta_contabil_id;

  RETURN v_count;
END;
$$;

-- Idem para contas_pagar (caso queira simetria futura)
CREATE OR REPLACE FUNCTION public.backfill_cp_conta_contabil_via_produto(
  p_company_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_companies
    WHERE user_id = auth.uid() AND company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Sem acesso a essa empresa';
  END IF;

  WITH atualizadas AS (
    UPDATE public.contas_pagar cp
    SET conta_contabil_id = p.conta_contabil_id
    FROM public.products p
    WHERE cp.company_id = p_company_id
      AND cp.produto_id = p.id
      AND p.conta_contabil_id IS NOT NULL
      AND cp.conta_contabil_id IS DISTINCT FROM p.conta_contabil_id
      AND cp.deleted_at IS NULL
    RETURNING cp.id
  )
  SELECT COUNT(*) INTO v_count FROM atualizadas;

  UPDATE public.movimentacoes m
  SET conta_contabil_id = cp.conta_contabil_id
  FROM public.contas_pagar cp
  JOIN public.products p ON p.id = cp.produto_id
  WHERE m.conta_pagar_id = cp.id
    AND cp.company_id = p_company_id
    AND p.conta_contabil_id IS NOT NULL
    AND m.conta_contabil_id IS DISTINCT FROM cp.conta_contabil_id;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.backfill_cr_conta_contabil_via_produto(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_cp_conta_contabil_via_produto(uuid) TO authenticated;
