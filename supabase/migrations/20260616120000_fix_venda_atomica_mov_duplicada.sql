-- =============================================================================
-- FIX: criar_venda_atomica / atualizar_venda_atomica geravam movimentação EM DOBRO
-- =============================================================================
-- SINTOMA: na HAIR OF BRASIL toda venda à vista travava ("botão girando" → 30s →
-- rollback) e não lançava. Outras empresas não quebravam (duplicavam a mov em
-- silêncio).
--
-- CAUSA: a RPC insere a conta_receber com status='pago' ANTES de ligar o GUC
-- `app.skip_mov_garantia`. Nesse instante o trigger AFTER INSERT
-- `garantir_mov_ao_quitar_cr` dispara e cria a movimentação (mov #1). Logo
-- depois, quando _gerar_mov=true, a própria RPC faz o INSERT explícito da mov
-- (mov #2). Resultado: 2 movs idênticas pra mesma CR.
--   - Em empresas comuns: passava (duplicava a mov no extrato).
--   - Na HAIR: o índice único parcial `uniq_mov_cr_uma_baixa_hair`
--     (conta_receber_id, data, valor, tipo) barra a 2ª mov → a transação inteira
--     faz rollback → a venda não é criada.
--
-- CORREÇÃO: ligar `app.skip_mov_garantia='true'` LOGO NO INÍCIO da RPC (antes de
-- qualquer INSERT em contas_receber). Assim o trigger não cria a mov; a mov passa
-- a ser criada só pelo INSERT explícito da RPC (fonte única, com o valor correto
-- — _mov_valor p/ cartão). O GUC usa is_local=true, então reseta sozinho no fim
-- da transação. Removidos os toggles internos (que reativavam o trigger).
--
-- Idempotente: CREATE OR REPLACE. Pode re-rodar no SQL Editor.
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
  v_item_id UUID;
BEGIN
  -- Suprime o trigger garantir_mov_ao_quitar_cr durante TODA a RPC: a mov é
  -- criada explicitamente abaixo (quando _gerar_mov). Sem isso, o trigger cria
  -- uma 2ª mov ao inserir a CR 'pago' e estoura o índice único da HAIR.
  -- is_local=true => reseta no fim da transação automaticamente.
  PERFORM set_config('app.skip_mov_garantia', 'true', true);

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

  -- 2. INSERT itens (+ comissão por item)
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_itens)
  LOOP
    INSERT INTO public.vendas_itens (
      venda_id, descricao, quantidade, valor_unitario, produto_id, profissional_id
    ) VALUES (
      v_venda_id,
      v_item->>'descricao',
      COALESCE((v_item->>'quantidade')::NUMERIC, 1),
      COALESCE((v_item->>'valor_unitario')::NUMERIC, 0),
      NULLIF(v_item->>'produto_id', '')::UUID,
      NULLIF(v_item->>'profissional_id', '')::UUID
    )
    RETURNING id INTO v_item_id;

    PERFORM public.gerar_comissao_item(
      v_company_id, v_venda_id, v_item_id, v_item,
      (v_venda_obj->>'data_venda')::DATE, v_venda_obj->>'cliente_nome'
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

    IF COALESCE((v_cr->>'_gerar_mov')::BOOLEAN, false)
       AND (v_cr->>'conta_bancaria_id') IS NOT NULL
       AND (v_cr->>'conta_bancaria_id') <> '' THEN

      v_mov_valor := COALESCE(
        NULLIF(v_cr->>'_mov_valor', '')::NUMERIC,
        (v_cr->>'valor')::NUMERIC
      );

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
  v_item_id UUID;
BEGIN
  -- Mesma supressão do trigger garantir_mov_ao_quitar_cr (ver criar_venda_atomica).
  PERFORM set_config('app.skip_mov_garantia', 'true', true);

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

  -- 3. DELETE itens e comissões antigas (serão recriados)
  DELETE FROM public.comissoes WHERE venda_id = v_venda_id;
  DELETE FROM public.vendas_itens WHERE venda_id = v_venda_id;

  -- 4. INSERT itens novos (+ comissão por item)
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_itens)
  LOOP
    INSERT INTO public.vendas_itens (
      venda_id, descricao, quantidade, valor_unitario, produto_id, profissional_id
    ) VALUES (
      v_venda_id,
      v_item->>'descricao',
      COALESCE((v_item->>'quantidade')::NUMERIC, 1),
      COALESCE((v_item->>'valor_unitario')::NUMERIC, 0),
      NULLIF(v_item->>'produto_id', '')::UUID,
      NULLIF(v_item->>'profissional_id', '')::UUID
    )
    RETURNING id INTO v_item_id;

    PERFORM public.gerar_comissao_item(
      v_company_id, v_venda_id, v_item_id, v_item,
      (v_venda_obj->>'data_venda')::DATE, v_venda_obj->>'cliente_nome'
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

GRANT EXECUTE ON FUNCTION public.criar_venda_atomica(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.atualizar_venda_atomica(JSONB) TO authenticated;
