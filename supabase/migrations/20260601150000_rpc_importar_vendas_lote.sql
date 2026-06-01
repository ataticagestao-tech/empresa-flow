-- =============================================================================
-- RPC importar_vendas_lote — importação ATÔMICA de vendas por planilha
-- =============================================================================
-- PROBLEMA QUE RESOLVE: o importador antigo (executarImportacao no front) inseria
-- vendas, depois contas_receber e movimentações em comandos SEPARADOS. Se o insert
-- das CRs falhava (ex.: trigger anti-duplicata, erro qualquer), o erro era engolido
-- num console.error e as VENDAS ficavam gravadas SEM conta a receber (quebradas),
-- ainda contadas como "ok". Resultado recorrente: vendas órfãs, faturamento sem
-- recebimento, caixa furado.
--
-- AGORA: cada linha é processada num bloco BEGIN/EXCEPTION (savepoint implícito):
-- venda + itens + conta(s) a receber entram JUNTAS ou a linha inteira é revertida
-- e contabilizada como falha (com a mensagem de erro retornada). Nunca sobra venda
-- sem CR. À vista (pix/dinheiro/cartao_debito) entra como CR paga com conta_bancaria
-- preenchida — a trigger garantir_mov_ao_quitar_cr gera a movimentação de crédito
-- automaticamente (1 por CR, sem duplicar).
--
-- Bypassa app.skip_duplicate_check (import legítimo de muitas vendas iguais).
-- Retorna {ok, fail, errors[]}.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.importar_vendas_lote(
  p_rows jsonb,
  p_company uuid,
  p_conta_bancaria uuid,
  p_centro_custo uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  r jsonb;
  v_venda uuid;
  v_ok int := 0;
  v_fail int := 0;
  v_errors text[] := ARRAY[]::text[];
  v_bruto numeric;
  v_desc numeric;
  v_liquido numeric;
  v_parcelado boolean;
  v_nparc int;
  v_vparc numeric;
  v_imediato boolean;
  v_conta uuid;
  v_venc date;
  v_valor numeric;
  v_dv date;
  p int;
  v_avista text[] := ARRAY['pix','dinheiro','cartao_debito'];
BEGIN
  PERFORM set_config('app.skip_duplicate_check','true', true);

  FOR r IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    BEGIN
      v_bruto   := COALESCE((r->>'valor_total')::numeric, 0);
      v_desc    := COALESCE((r->>'desconto')::numeric, 0);
      v_liquido := GREATEST(0, v_bruto - v_desc);
      v_dv      := (r->>'data_venda')::date;
      v_parcelado := (r->>'forma_pagamento') = 'parcelado';
      v_nparc   := CASE WHEN v_parcelado THEN GREATEST(1, COALESCE((r->>'parcelas')::int, 2)) ELSE 1 END;
      v_imediato := ((r->>'forma_pagamento') = ANY(v_avista)) AND NOT v_parcelado;
      v_conta   := NULLIF(r->>'conta_contabil_id','')::uuid;

      INSERT INTO public.vendas
        (company_id, cliente_nome, cliente_cpf_cnpj, tipo, valor_total, desconto,
         data_venda, forma_pagamento, status, observacoes)
      VALUES
        (p_company, r->>'cliente_nome', NULLIF(r->>'cliente_cpf_cnpj',''),
         COALESCE(NULLIF(r->>'tipo',''),'servico'), v_bruto, v_desc,
         v_dv, r->>'forma_pagamento', 'confirmado', NULLIF(r->>'observacoes',''))
      RETURNING id INTO v_venda;

      INSERT INTO public.vendas_itens (venda_id, descricao, quantidade, valor_unitario)
      VALUES (v_venda, r->>'descricao', COALESCE((r->>'quantidade')::numeric,1),
              COALESCE((r->>'valor_unitario')::numeric,0));

      v_vparc := round((v_liquido / v_nparc)::numeric, 2);
      FOR p IN 0..(v_nparc-1) LOOP
        v_venc  := CASE WHEN v_parcelado THEN (v_dv + ((p+1) || ' month')::interval)::date ELSE v_dv END;
        v_valor := CASE WHEN p = v_nparc-1 THEN v_liquido - v_vparc*(v_nparc-1) ELSE v_vparc END;

        INSERT INTO public.contas_receber
          (company_id, venda_id, pagador_nome, pagador_cpf_cnpj, valor, valor_pago,
           data_vencimento, data_pagamento, status, forma_recebimento,
           conta_contabil_id, centro_custo_id, conta_bancaria_id)
        VALUES
          (p_company, v_venda, r->>'cliente_nome', NULLIF(r->>'cliente_cpf_cnpj',''),
           v_valor, CASE WHEN v_imediato THEN v_valor ELSE 0 END,
           v_venc, CASE WHEN v_imediato THEN v_dv ELSE NULL END,
           CASE WHEN v_imediato THEN 'pago' ELSE 'aberto' END,
           r->>'forma_pagamento', v_conta, p_centro_custo,
           CASE WHEN v_imediato THEN p_conta_bancaria ELSE NULL END);
        -- à vista: trigger garantir_mov_ao_quitar_cr gera a movimentação de crédito.
      END LOOP;

      v_ok := v_ok + 1;
    EXCEPTION WHEN OTHERS THEN
      v_fail := v_fail + 1;
      IF coalesce(array_length(v_errors,1),0) < 5 THEN
        v_errors := array_append(v_errors, SQLERRM);
      END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object('ok', v_ok, 'fail', v_fail, 'errors', to_jsonb(v_errors));
END;
$$;

COMMENT ON FUNCTION public.importar_vendas_lote IS
'Importa vendas em lote de forma atômica por linha (venda+itens+CRs juntos ou nada). À vista vira CR paga com conta_bancaria -> trigger gera mov. Retorna {ok,fail,errors}.';
