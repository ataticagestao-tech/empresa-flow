-- =============================================================================
-- BACKFILL: 11 vendas órfãs recentes (pós 2026-05-01) que ficaram sem CR
-- =============================================================================
-- Causa raiz: salvarVenda em Vendas.tsx faz N requests REST independentes —
-- se a venda commita e o INSERT do CR falha (RLS, rede, trigger), a venda
-- fica órfã. Sem transação. Fase 3 do plano resolve isso via RPC atômica.
--
-- 5 regras (ordem de prioridade):
--   1. Existe CR soft-deleted vinculado à própria venda → RESTAURA (UPDATE
--      deleted_at=NULL). Caso clássico: edit que falhou no meio (Maria, Thiago).
--   2. Mov bancária livre com mesmo cliente+data+credito (sem CR vinculado)
--      → cria CR PAGO + vincula mov.
--   3. Mov bancária OCUPADA por outra venda do mesmo cliente+data
--      → cria CR ABERTO com observação alertando duplicidade suspeita
--      (Pietro, Leonardo — provavelmente vendas em duplicidade).
--   4. Sem mov + forma à vista (pix/dinheiro/débito) → CR PAGO presumido +
--      mov de credito criada automaticamente vinculada (evita CR fantasma).
--      Lookup de conta bancaria: dinheiro→caixinha, pix/debito→conta_corrente.
--      Fallback: se nao achar conta apropriada, cria CR ABERTO (Regra 5).
--   5. Sem mov + cartão crédito/múltiplo/parcelado/boleto → CR ABERTO.
--
-- IDEMPOTENTE: usa filtro venda_id sem CR ativo. conta_contabil_id = NULL
-- em CRs criados (Izabel classifica via tela depois).
-- =============================================================================

DO $$
DECLARE
  v_venda RECORD;
  v_cr_deletado RECORD;
  v_mov_livre RECORD;
  v_mov_ocupada RECORD;
  v_status TEXT;
  v_data_pagamento DATE;
  v_valor_pago NUMERIC;
  v_cr_id UUID;
  v_obs TEXT;
  v_conta_bancaria_id UUID;
  v_conta_tipo TEXT;
  v_count_total INT := 0;
  v_count_restaurado INT := 0;
  v_count_pago_mov INT := 0;
  v_count_aberto_dup INT := 0;
  v_count_pago_avista INT := 0;
  v_count_aberto INT := 0;
BEGIN
  PERFORM set_config('app.skip_categoria_garantia', 'true', true);
  PERFORM set_config('app.skip_mov_garantia', 'true', true);

  FOR v_venda IN
    SELECT v.id, v.company_id, v.cliente_nome, v.cliente_cpf_cnpj,
           v.valor_total, v.data_venda, v.forma_pagamento, v.created_at
    FROM public.vendas v
    LEFT JOIN public.contas_receber cr
      ON cr.venda_id = v.id AND cr.deleted_at IS NULL
    WHERE v.status <> 'cancelado'
      AND cr.id IS NULL
      AND v.created_at >= '2026-05-01'
    ORDER BY v.created_at
  LOOP
    v_count_total := v_count_total + 1;
    v_cr_deletado := NULL;
    v_mov_livre := NULL;
    v_mov_ocupada := NULL;

    -- REGRA 1: existe CR soft-deleted da própria venda E sem gêmeo ativo
    -- conflitante (uniq_cr_no_gemeos_pagos_hair: nome+valor+venc+pgto).
    -- Se tiver gêmeo ativo, NÃO restaura — passa pra próxima regra (geralmente
    -- a 3, marcando como duplicidade suspeita).
    SELECT cr.id INTO v_cr_deletado
    FROM public.contas_receber cr
    WHERE cr.venda_id = v_venda.id
      AND cr.deleted_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.contas_receber cr_ativo
        WHERE cr_ativo.deleted_at IS NULL
          AND cr_ativo.id <> cr.id
          AND LOWER(TRIM(cr_ativo.pagador_nome)) = LOWER(TRIM(cr.pagador_nome))
          AND cr_ativo.valor = cr.valor
          AND cr_ativo.data_vencimento = cr.data_vencimento
          AND cr_ativo.data_pagamento IS NOT DISTINCT FROM cr.data_pagamento
      )
    ORDER BY cr.deleted_at DESC
    LIMIT 1;

    IF v_cr_deletado.id IS NOT NULL THEN
      UPDATE public.contas_receber
         SET deleted_at = NULL,
             deleted_by = NULL,
             observacoes = COALESCE(observacoes, '') ||
               E'\n[Restaurado em 2026-05-20: edit anterior interrompeu antes de recriar.]'
       WHERE id = v_cr_deletado.id;

      v_count_restaurado := v_count_restaurado + 1;
      CONTINUE;  -- pula pro próximo loop, não cria CR novo
    END IF;

    -- REGRA 2: mov livre com nome+data+credito sem CR vinculado?
    SELECT m.id, m.valor INTO v_mov_livre
    FROM public.movimentacoes m
    WHERE m.company_id = v_venda.company_id
      AND m.tipo = 'credito'
      AND m.data = v_venda.data_venda
      AND m.descricao ILIKE '%' || v_venda.cliente_nome || '%'
      AND m.conta_receber_id IS NULL
    ORDER BY ABS(m.valor - v_venda.valor_total)
    LIMIT 1;

    IF v_mov_livre.id IS NOT NULL THEN
      v_status := 'pago';
      v_data_pagamento := v_venda.data_venda;
      v_valor_pago := v_venda.valor_total;
      v_obs := 'Backfill 2026-05-20 — vinculado a mov bancária existente (R$ ' ||
        to_char(v_mov_livre.valor, 'FM999G999D90') || ').';
      v_count_pago_mov := v_count_pago_mov + 1;

      INSERT INTO public.contas_receber (
        company_id, pagador_nome, pagador_cpf_cnpj,
        valor, valor_pago, data_vencimento, data_pagamento,
        status, forma_recebimento, venda_id, observacoes
      ) VALUES (
        v_venda.company_id, v_venda.cliente_nome, v_venda.cliente_cpf_cnpj,
        v_venda.valor_total, v_valor_pago, v_venda.data_venda, v_data_pagamento,
        v_status, v_venda.forma_pagamento, v_venda.id, v_obs
      ) RETURNING id INTO v_cr_id;

      UPDATE public.movimentacoes
         SET conta_receber_id = v_cr_id, origem = 'conta_receber'
       WHERE id = v_mov_livre.id;
      CONTINUE;
    END IF;

    -- REGRA 3: mov OCUPADA por outra venda do mesmo cliente+data?
    SELECT m.id, m.valor, m.conta_receber_id, cr_outro.venda_id AS outra_venda
    INTO v_mov_ocupada
    FROM public.movimentacoes m
    INNER JOIN public.contas_receber cr_outro ON cr_outro.id = m.conta_receber_id
    WHERE m.company_id = v_venda.company_id
      AND m.tipo = 'credito'
      AND m.data = v_venda.data_venda
      AND m.descricao ILIKE '%' || v_venda.cliente_nome || '%'
      AND m.conta_receber_id IS NOT NULL
    ORDER BY ABS(m.valor - v_venda.valor_total)
    LIMIT 1;

    IF v_mov_ocupada.id IS NOT NULL THEN
      v_status := 'aberto';
      v_data_pagamento := NULL;
      v_valor_pago := 0;
      v_obs := 'Backfill 2026-05-20 — DUPLICIDADE SUSPEITA. Já existe mov R$ ' ||
        to_char(v_mov_ocupada.valor, 'FM999G999D90') ||
        ' vinculada à venda ' || v_mov_ocupada.outra_venda::text ||
        '. Esta venda pode ser duplicata — revisar e cancelar se for o caso.';
      v_count_aberto_dup := v_count_aberto_dup + 1;
    ELSIF v_venda.forma_pagamento IN ('pix', 'dinheiro', 'cartao_debito') THEN
      -- REGRA 4: à vista presumida recebida. Lookup conta bancaria pra
      -- evitar CR fantasma (pago sem mov). Se nao achar, fallback Regra 5.
      v_conta_tipo := CASE
        WHEN v_venda.forma_pagamento = 'dinheiro' THEN 'caixinha'
        ELSE 'conta_corrente'
      END;

      SELECT id INTO v_conta_bancaria_id
      FROM public.bank_accounts
      WHERE company_id = v_venda.company_id
        AND type = v_conta_tipo
        AND is_active = TRUE
      ORDER BY created_at
      LIMIT 1;

      -- Fallback: nao achou tipo especifico -> tenta qualquer ativa nao-cartao.
      -- Aplica TAMBEM pra dinheiro (empresa pode nao ter caixinha cadastrada,
      -- nesse caso usa conta_corrente como aproximacao — Izabel ajusta depois).
      IF v_conta_bancaria_id IS NULL THEN
        SELECT id INTO v_conta_bancaria_id
        FROM public.bank_accounts
        WHERE company_id = v_venda.company_id
          AND type <> 'cartao_credito'
          AND is_active = TRUE
        ORDER BY created_at
        LIMIT 1;
      END IF;

      IF v_conta_bancaria_id IS NOT NULL THEN
        v_status := 'pago';
        v_data_pagamento := v_venda.data_venda;
        v_valor_pago := v_venda.valor_total;
        v_obs := 'Backfill 2026-05-20 — venda à vista presumida recebida (' ||
          v_venda.forma_pagamento || ').';
        v_count_pago_avista := v_count_pago_avista + 1;
      ELSE
        -- Fallback final: nao achou conta apropriada, cai pra Regra 5
        v_status := 'aberto';
        v_data_pagamento := NULL;
        v_valor_pago := 0;
        v_obs := 'Backfill 2026-05-20 — venda à vista sem conta bancária ' ||
          'cadastrada (' || v_conta_tipo || '). Quitar manualmente.';
        v_count_aberto := v_count_aberto + 1;
      END IF;
    ELSE
      -- REGRA 5
      v_status := 'aberto';
      v_data_pagamento := NULL;
      v_valor_pago := 0;
      v_obs := 'Backfill 2026-05-20 — venda órfã sem mov bancária. Quitar manualmente.';
      v_count_aberto := v_count_aberto + 1;
    END IF;

    INSERT INTO public.contas_receber (
      company_id, pagador_nome, pagador_cpf_cnpj,
      valor, valor_pago, data_vencimento, data_pagamento,
      status, forma_recebimento, venda_id, observacoes,
      conta_bancaria_id
    ) VALUES (
      v_venda.company_id, v_venda.cliente_nome, v_venda.cliente_cpf_cnpj,
      v_venda.valor_total, v_valor_pago, v_venda.data_venda, v_data_pagamento,
      v_status, v_venda.forma_pagamento, v_venda.id, v_obs,
      CASE WHEN v_status = 'pago' THEN v_conta_bancaria_id ELSE NULL END
    ) RETURNING id INTO v_cr_id;

    -- Se foi CR pago (Regra 4 com conta achada), cria mov vinculada pra
    -- evitar fantasma. Trigger garantir_mov_ao_quitar_cr está bypassado
    -- via app.skip_mov_garantia, entao precisamos inserir explicitamente.
    IF v_status = 'pago' AND v_conta_bancaria_id IS NOT NULL THEN
      INSERT INTO public.movimentacoes (
        company_id, conta_bancaria_id, conta_receber_id,
        tipo, valor, data, descricao, origem, status_conciliacao
      ) VALUES (
        v_venda.company_id, v_conta_bancaria_id, v_cr_id,
        'credito', v_venda.valor_total, v_venda.data_venda,
        'Recebimento — ' || v_venda.cliente_nome ||
          ' (backfill venda órfã)', 'conta_receber', 'pendente'
      );
    END IF;

    -- Reset pro próximo loop
    v_conta_bancaria_id := NULL;
  END LOOP;

  PERFORM set_config('app.skip_categoria_garantia', 'false', true);
  PERFORM set_config('app.skip_mov_garantia', 'false', true);

  RAISE NOTICE E'\n=== Backfill concluído ===\n  Total processadas:                %\n  CRs restaurados (edit falhou):    %\n  Pago + mov vinculada:             %\n  Aberto + obs duplicidade suspeita: %\n  Pago (à vista, sem mov):          %\n  Aberto (sem mov, parcelado):      %\n',
    v_count_total, v_count_restaurado, v_count_pago_mov,
    v_count_aberto_dup, v_count_pago_avista, v_count_aberto;
END $$;

-- =============================================================================
-- VALIDAÇÃO PÓS-BACKFILL
-- =============================================================================
SELECT
  'Órfãs recentes restantes (esperado: 0)' AS check_name,
  COUNT(*) AS valor
FROM public.vendas v
LEFT JOIN public.contas_receber cr
  ON cr.venda_id = v.id AND cr.deleted_at IS NULL
WHERE v.status <> 'cancelado' AND cr.id IS NULL AND v.created_at >= '2026-05-01'
UNION ALL
SELECT 'CRs criados pelo backfill', COUNT(*)
FROM public.contas_receber
WHERE observacoes LIKE 'Backfill 2026-05-20%' AND deleted_at IS NULL
UNION ALL
SELECT 'CRs restaurados pelo backfill', COUNT(*)
FROM public.contas_receber
WHERE observacoes LIKE '%[Restaurado em 2026-05-20%' AND deleted_at IS NULL
UNION ALL
SELECT 'CR FANTASMAS criados pelo backfill (esperado: 0)', COUNT(*)
FROM public.contas_receber cr
WHERE cr.observacoes LIKE 'Backfill 2026-05-20%'
  AND cr.deleted_at IS NULL
  AND cr.status IN ('pago','conciliado','parcial')
  AND cr.valor_pago > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.movimentacoes m WHERE m.conta_receber_id = cr.id
  );
