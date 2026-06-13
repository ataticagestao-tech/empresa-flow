-- =============================================================================
-- RPC: criar_venda_atomica + atualizar_venda_atomica
-- =============================================================================
-- Resolve a causa raiz de vendas órfãs (sem CR): o frontend Vendas.tsx faz
-- INSERT venda + INSERT itens + INSERT CRs como N requests REST separados,
-- cada um commitando isolado. Se a venda commita e o INSERT do CR falha
-- (RLS, rede, trigger validação), a venda fica órfã sem CR.
--
-- Estas RPCs encapsulam tudo em uma transação Postgres: se qualquer parte
-- falhar, ROLLBACK completo. Garante que toda venda gerada tem CRs.
--
-- Payload (JSONB):
-- {
--   "venda": {company_id, cliente_nome, cliente_cpf_cnpj?, tipo, valor_total,
--             data_venda, forma_pagamento?, parcelas?, status?, observacoes?,
--             consultora?, procedimento?, reserva_valor?, reserva_data?,
--             previsao_cirurgia?, data_contrato?},
--   "itens": [{descricao, quantidade, valor_unitario}],
--   "crs":   [{pagador_nome, pagador_cpf_cnpj?, valor, valor_pago?,
--              data_vencimento, data_pagamento?, status, forma_recebimento?,
--              conta_bancaria_id?, conta_contabil_id?, centro_custo_id?,
--              observacoes?,
--              _gerar_mov: boolean,  -- se true, cria movimentacao no caixa
--              _mov_valor?: numeric  -- valor da mov (default = valor do CR)}]
-- }
--
-- Retorno: jsonb { venda_id, cr_ids[], success }
-- =============================================================================

CREATE OR REPLACE FUNCTION public.criar_venda_atomica(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_venda_obj JSONB := p_payload->'venda';
  v_itens JSONB := COALESCE(p_payload->'itens', '[]'::jsonb);
  v_crs JSONB := COALESCE(p_payload->'crs', '[]'::jsonb);
  v_company_id UUID := (v_venda_obj->>'company_id')::UUID;
  v_venda_id UUID;
  v_cr_ids UUID[] := '{}';
  v_cr_id UUID;
  v_item JSONB;
  v_cr JSONB;
  v_mov_valor NUMERIC;
BEGIN
  -- 1. INSERT venda
  INSERT INTO public.vendas (
    company_id, cliente_nome, cliente_cpf_cnpj, tipo, valor_total, desconto,
    data_venda, forma_pagamento, parcelas, status, observacoes,
    consultora, procedimento, reserva_valor, reserva_data,
    previsao_cirurgia, data_contrato
  ) VALUES (
    v_company_id,
    v_venda_obj->>'cliente_nome',
    NULLIF(v_venda_obj->>'cliente_cpf_cnpj', ''),
    COALESCE(v_venda_obj->>'tipo', 'servico'),
    (v_venda_obj->>'valor_total')::NUMERIC,
    COALESCE((v_venda_obj->>'desconto')::NUMERIC, 0),
    (v_venda_obj->>'data_venda')::DATE,
    NULLIF(v_venda_obj->>'forma_pagamento', ''),
    COALESCE((v_venda_obj->>'parcelas')::INT, 1),
    COALESCE(v_venda_obj->>'status', 'confirmado'),
    NULLIF(v_venda_obj->>'observacoes', ''),
    NULLIF(v_venda_obj->>'consultora', ''),
    NULLIF(v_venda_obj->>'procedimento', ''),
    NULLIF(v_venda_obj->>'reserva_valor', '')::NUMERIC,
    NULLIF(v_venda_obj->>'reserva_data', '')::DATE,
    NULLIF(v_venda_obj->>'previsao_cirurgia', '')::DATE,
    NULLIF(v_venda_obj->>'data_contrato', '')::DATE
  )
  RETURNING id INTO v_venda_id;

  -- 2. INSERT itens
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_itens)
  LOOP
    INSERT INTO public.vendas_itens (
      venda_id, descricao, quantidade, valor_unitario
    ) VALUES (
      v_venda_id,
      v_item->>'descricao',
      COALESCE((v_item->>'quantidade')::NUMERIC, 1),
      COALESCE((v_item->>'valor_unitario')::NUMERIC, 0)
    );
  END LOOP;

  -- 3. INSERT CRs + movimentações (quando _gerar_mov=true)
  FOR v_cr IN SELECT * FROM jsonb_array_elements(v_crs)
  LOOP
    INSERT INTO public.contas_receber (
      company_id, pagador_nome, pagador_cpf_cnpj,
      valor, valor_pago,
      data_vencimento, data_pagamento,
      status, forma_recebimento,
      conta_bancaria_id, conta_contabil_id, centro_custo_id,
      venda_id, observacoes
    ) VALUES (
      v_company_id,
      v_cr->>'pagador_nome',
      NULLIF(v_cr->>'pagador_cpf_cnpj', ''),
      (v_cr->>'valor')::NUMERIC,
      COALESCE((v_cr->>'valor_pago')::NUMERIC, 0),
      (v_cr->>'data_vencimento')::DATE,
      NULLIF(v_cr->>'data_pagamento', '')::DATE,
      COALESCE(v_cr->>'status', 'aberto'),
      NULLIF(v_cr->>'forma_recebimento', ''),
      NULLIF(v_cr->>'conta_bancaria_id', '')::UUID,
      NULLIF(v_cr->>'conta_contabil_id', '')::UUID,
      NULLIF(v_cr->>'centro_custo_id', '')::UUID,
      v_venda_id,
      NULLIF(v_cr->>'observacoes', '')
    )
    RETURNING id INTO v_cr_id;

    v_cr_ids := array_append(v_cr_ids, v_cr_id);

    -- Se for venda à vista, gerar mov bancária + marcar CR como pago.
    -- A Garantia 1 (trigger garantir_mov_ao_quitar_cr) é bypass aqui pra
    -- evitar duplicação (já estamos inserindo mov manualmente).
    IF COALESCE((v_cr->>'_gerar_mov')::BOOLEAN, false)
       AND (v_cr->>'conta_bancaria_id') IS NOT NULL
       AND (v_cr->>'conta_bancaria_id') <> '' THEN

      v_mov_valor := COALESCE(
        NULLIF(v_cr->>'_mov_valor', '')::NUMERIC,
        (v_cr->>'valor')::NUMERIC
      );

      PERFORM set_config('app.skip_mov_garantia', 'true', true);
      INSERT INTO public.movimentacoes (
        company_id, conta_bancaria_id, conta_contabil_id,
        conta_receber_id, tipo, valor, data, descricao, origem
      ) VALUES (
        v_company_id,
        (v_cr->>'conta_bancaria_id')::UUID,
        NULLIF(v_cr->>'conta_contabil_id', '')::UUID,
        v_cr_id,
        'credito',
        v_mov_valor,
        COALESCE(NULLIF(v_cr->>'data_pagamento', '')::DATE, CURRENT_DATE),
        'Recebimento — ' || (v_cr->>'pagador_nome'),
        'conta_receber'
      );
      PERFORM set_config('app.skip_mov_garantia', 'false', true);
    END IF;
  END LOOP;

  -- 4. Validação final: garante que toda venda confirmada tem ≥1 CR
  IF v_venda_obj->>'status' <> 'cancelado'
     AND array_length(v_cr_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Venda criada sem nenhum CR. Toda venda confirmada deve ter ao menos 1 conta a receber.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'venda_id', v_venda_id,
    'cr_ids', to_jsonb(v_cr_ids)
  );
END;
$$;


-- =============================================================================
-- RPC: atualizar_venda_atomica
-- =============================================================================
-- Edição de venda existente: UPDATE venda + soft-delete CRs antigos +
-- DELETE itens antigos + recria itens e CRs. Tudo atômico.
--
-- Payload adicional: { venda_id, user_id (pra deleted_by dos CRs) }
-- =============================================================================

CREATE OR REPLACE FUNCTION public.atualizar_venda_atomica(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_venda_obj JSONB := p_payload->'venda';
  v_itens JSONB := COALESCE(p_payload->'itens', '[]'::jsonb);
  v_crs JSONB := COALESCE(p_payload->'crs', '[]'::jsonb);
  v_venda_id UUID := (p_payload->>'venda_id')::UUID;
  v_user_id UUID := NULLIF(p_payload->>'user_id', '')::UUID;
  v_company_id UUID := (v_venda_obj->>'company_id')::UUID;
  v_cr_ids UUID[] := '{}';
  v_cr_id UUID;
  v_item JSONB;
  v_cr JSONB;
  v_mov_valor NUMERIC;
  v_now TIMESTAMPTZ := now();
BEGIN
  -- 1. UPDATE venda
  UPDATE public.vendas SET
    cliente_nome = v_venda_obj->>'cliente_nome',
    cliente_cpf_cnpj = NULLIF(v_venda_obj->>'cliente_cpf_cnpj', ''),
    tipo = COALESCE(v_venda_obj->>'tipo', tipo),
    valor_total = (v_venda_obj->>'valor_total')::NUMERIC,
    desconto = COALESCE((v_venda_obj->>'desconto')::NUMERIC, 0),
    data_venda = (v_venda_obj->>'data_venda')::DATE,
    forma_pagamento = NULLIF(v_venda_obj->>'forma_pagamento', ''),
    parcelas = COALESCE((v_venda_obj->>'parcelas')::INT, parcelas),
    observacoes = NULLIF(v_venda_obj->>'observacoes', ''),
    updated_at = v_now
  WHERE id = v_venda_id AND company_id = v_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venda % não encontrada ou empresa incorreta.', v_venda_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. Soft-delete CRs antigos da venda
  UPDATE public.contas_receber
     SET deleted_at = v_now, deleted_by = v_user_id
   WHERE venda_id = v_venda_id AND deleted_at IS NULL;

  -- 3. DELETE itens antigos
  DELETE FROM public.vendas_itens WHERE venda_id = v_venda_id;

  -- 4. INSERT itens novos
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_itens)
  LOOP
    INSERT INTO public.vendas_itens (
      venda_id, descricao, quantidade, valor_unitario
    ) VALUES (
      v_venda_id,
      v_item->>'descricao',
      COALESCE((v_item->>'quantidade')::NUMERIC, 1),
      COALESCE((v_item->>'valor_unitario')::NUMERIC, 0)
    );
  END LOOP;

  -- 5. INSERT CRs novos + movs (mesma lógica do criar_venda_atomica)
  FOR v_cr IN SELECT * FROM jsonb_array_elements(v_crs)
  LOOP
    INSERT INTO public.contas_receber (
      company_id, pagador_nome, pagador_cpf_cnpj,
      valor, valor_pago,
      data_vencimento, data_pagamento,
      status, forma_recebimento,
      conta_bancaria_id, conta_contabil_id, centro_custo_id,
      venda_id, observacoes
    ) VALUES (
      v_company_id,
      v_cr->>'pagador_nome',
      NULLIF(v_cr->>'pagador_cpf_cnpj', ''),
      (v_cr->>'valor')::NUMERIC,
      COALESCE((v_cr->>'valor_pago')::NUMERIC, 0),
      (v_cr->>'data_vencimento')::DATE,
      NULLIF(v_cr->>'data_pagamento', '')::DATE,
      COALESCE(v_cr->>'status', 'aberto'),
      NULLIF(v_cr->>'forma_recebimento', ''),
      NULLIF(v_cr->>'conta_bancaria_id', '')::UUID,
      NULLIF(v_cr->>'conta_contabil_id', '')::UUID,
      NULLIF(v_cr->>'centro_custo_id', '')::UUID,
      v_venda_id,
      NULLIF(v_cr->>'observacoes', '')
    )
    RETURNING id INTO v_cr_id;

    v_cr_ids := array_append(v_cr_ids, v_cr_id);

    IF COALESCE((v_cr->>'_gerar_mov')::BOOLEAN, false)
       AND (v_cr->>'conta_bancaria_id') IS NOT NULL
       AND (v_cr->>'conta_bancaria_id') <> '' THEN

      v_mov_valor := COALESCE(
        NULLIF(v_cr->>'_mov_valor', '')::NUMERIC,
        (v_cr->>'valor')::NUMERIC
      );

      PERFORM set_config('app.skip_mov_garantia', 'true', true);
      INSERT INTO public.movimentacoes (
        company_id, conta_bancaria_id, conta_contabil_id,
        conta_receber_id, tipo, valor, data, descricao, origem
      ) VALUES (
        v_company_id,
        (v_cr->>'conta_bancaria_id')::UUID,
        NULLIF(v_cr->>'conta_contabil_id', '')::UUID,
        v_cr_id,
        'credito',
        v_mov_valor,
        COALESCE(NULLIF(v_cr->>'data_pagamento', '')::DATE, CURRENT_DATE),
        'Recebimento — ' || (v_cr->>'pagador_nome'),
        'conta_receber'
      );
      PERFORM set_config('app.skip_mov_garantia', 'false', true);
    END IF;
  END LOOP;

  -- 6. Validação final
  IF v_venda_obj->>'status' <> 'cancelado'
     AND array_length(v_cr_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Venda editada sem nenhum CR. Toda venda confirmada deve ter ao menos 1 conta a receber.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'venda_id', v_venda_id,
    'cr_ids', to_jsonb(v_cr_ids)
  );
END;
$$;


-- Permissões
GRANT EXECUTE ON FUNCTION public.criar_venda_atomica(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.atualizar_venda_atomica(JSONB) TO authenticated;

COMMENT ON FUNCTION public.criar_venda_atomica IS
  'Cria venda + itens + CRs + movs (se à vista) em UMA transação. Garante que toda venda tem ≥1 CR vinculado. Substitui o loop multi-request em Vendas.tsx#salvarVenda que estava gerando vendas órfãs.';

COMMENT ON FUNCTION public.atualizar_venda_atomica IS
  'Edita venda existente: UPDATE venda + soft-delete CRs antigos + DELETE itens + recria itens/CRs/movs. Tudo em UMA transação. Substitui o fluxo multi-request em Vendas.tsx#salvarVenda mode edit.';
