-- ============================================================
-- AGENTE TATICA — função SQL agente_faturamento
-- Retorna total faturado em um período. Suporta regime competência
-- (data da venda) e caixa (data do pagamento da CR / movimentação).
-- Defaults: período = mês corrente, regime = competência.
-- ============================================================

DROP FUNCTION IF EXISTS public.agente_faturamento(uuid, date, date);
DROP FUNCTION IF EXISTS public.agente_faturamento(uuid, date, date, text);

CREATE OR REPLACE FUNCTION public.agente_faturamento(
    p_company_id uuid,
    p_data_inicio date DEFAULT NULL,
    p_data_fim date DEFAULT NULL,
    p_regime text DEFAULT 'competencia'
)
RETURNS TABLE(
    total numeric,
    qtd_registros bigint,
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
    v_total numeric := 0;
    v_qtd bigint := 0;
BEGIN
    -- defaults: período = mês corrente
    v_inicio := COALESCE(p_data_inicio, date_trunc('month', CURRENT_DATE)::date);
    v_fim := COALESCE(p_data_fim, (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date);
    v_regime := COALESCE(LOWER(p_regime), 'competencia');

    IF v_regime = 'caixa' THEN
        -- Recebimentos efetivamente entrados no caixa (CR pagas no período)
        SELECT
            COALESCE(SUM(cr.valor_pago), 0),
            COUNT(*)
        INTO v_total, v_qtd
        FROM public.contas_receber cr
        WHERE cr.company_id = p_company_id
          AND cr.deleted_at IS NULL
          AND cr.data_pagamento BETWEEN v_inicio AND v_fim
          AND cr.valor_pago > 0;
    ELSE
        -- Competência: vendas confirmadas (não canceladas) por data_venda
        SELECT
            COALESCE(SUM(v.valor_liquido), 0),
            COUNT(*)
        INTO v_total, v_qtd
        FROM public.vendas v
        WHERE v.company_id = p_company_id
          AND v.data_venda BETWEEN v_inicio AND v_fim
          AND COALESCE(v.status::text, '') NOT IN ('cancelada', 'cancelado');
    END IF;

    RETURN QUERY SELECT v_total, v_qtd, v_inicio, v_fim, v_regime;
END;
$$;
