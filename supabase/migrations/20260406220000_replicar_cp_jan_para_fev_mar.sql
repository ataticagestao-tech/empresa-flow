-- ============================================================
-- Replicar contas a pagar de JANEIRO/2026 para FEVEREIRO e MARÇO/2026
-- Unidades: 001-012, 014, MOBI KIDS
-- ============================================================

DO $$
DECLARE
  v_company RECORD;
  v_cp RECORD;
  v_count_fev INT := 0;
  v_count_mar INT := 0;
  v_new_vencimento DATE;
BEGIN
  -- Iterar sobre as unidades desejadas
  FOR v_company IN
    SELECT id, nome_fantasia, razao_social
    FROM public.companies
    WHERE (
      nome_fantasia ILIKE '%001%' OR nome_fantasia ILIKE '%002%' OR nome_fantasia ILIKE '%003%'
      OR nome_fantasia ILIKE '%004%' OR nome_fantasia ILIKE '%005%' OR nome_fantasia ILIKE '%006%'
      OR nome_fantasia ILIKE '%007%' OR nome_fantasia ILIKE '%008%' OR nome_fantasia ILIKE '%009%'
      OR nome_fantasia ILIKE '%010%' OR nome_fantasia ILIKE '%011%' OR nome_fantasia ILIKE '%012%'
      OR nome_fantasia ILIKE '%014%'
      OR nome_fantasia ILIKE '%MOBI KIDS%' OR razao_social ILIKE '%MOBI KIDS%'
    )
  LOOP
    RAISE NOTICE 'Processando unidade: % (id: %)', COALESCE(v_company.nome_fantasia, v_company.razao_social), v_company.id;

    -- Buscar CPs de janeiro/2026 desta unidade
    FOR v_cp IN
      SELECT
        company_id, credor_nome, credor_cpf_cnpj,
        valor, conta_contabil_id, centro_custo_id,
        forma_pagamento, conta_bancaria_id,
        observacoes, unidade_destino_id,
        data_vencimento
      FROM public.contas_pagar
      WHERE company_id = v_company.id
        AND data_vencimento >= '2026-01-01'
        AND data_vencimento < '2026-02-01'
    LOOP
      -- ── FEVEREIRO: mesmo dia, mês seguinte ──
      v_new_vencimento := (v_cp.data_vencimento + INTERVAL '1 month')::DATE;

      INSERT INTO public.contas_pagar (
        company_id, credor_nome, credor_cpf_cnpj,
        valor, valor_pago, data_vencimento,
        status, conta_contabil_id, centro_custo_id,
        forma_pagamento, conta_bancaria_id,
        observacoes, unidade_destino_id
      ) VALUES (
        v_cp.company_id, v_cp.credor_nome, v_cp.credor_cpf_cnpj,
        v_cp.valor, 0, v_new_vencimento,
        'aberto', v_cp.conta_contabil_id, v_cp.centro_custo_id,
        v_cp.forma_pagamento, v_cp.conta_bancaria_id,
        v_cp.observacoes, v_cp.unidade_destino_id
      );
      v_count_fev := v_count_fev + 1;

      -- ── MARÇO: +2 meses ──
      v_new_vencimento := (v_cp.data_vencimento + INTERVAL '2 months')::DATE;

      INSERT INTO public.contas_pagar (
        company_id, credor_nome, credor_cpf_cnpj,
        valor, valor_pago, data_vencimento,
        status, conta_contabil_id, centro_custo_id,
        forma_pagamento, conta_bancaria_id,
        observacoes, unidade_destino_id
      ) VALUES (
        v_cp.company_id, v_cp.credor_nome, v_cp.credor_cpf_cnpj,
        v_cp.valor, 0, v_new_vencimento,
        'aberto', v_cp.conta_contabil_id, v_cp.centro_custo_id,
        v_cp.forma_pagamento, v_cp.conta_bancaria_id,
        v_cp.observacoes, v_cp.unidade_destino_id
      );
      v_count_mar := v_count_mar + 1;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Concluído: % CPs criadas para FEV, % CPs criadas para MAR', v_count_fev, v_count_mar;
END;
$$;
