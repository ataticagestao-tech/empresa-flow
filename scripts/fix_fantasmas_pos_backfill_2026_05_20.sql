-- =============================================================================
-- FIX RETROATIVO: 5 CR fantasmas deixados pelo backfill antigo (sem mov)
-- =============================================================================
-- Backfill anterior rodou versao sem lookup de conta bancaria. 5 CRs ficaram
-- pago + valor_pago > 0 + zero mov vinculada (fantasmas):
--
--   REGRA 1 (restaurados, conta_bancaria_id ja setada):
--     - Maria das Gracas   R$ 150  cartao_credito
--     - Thiago Lisboa      R$ 370  cartao_credito
--
--   REGRA 4 (a vista, conta_bancaria_id NULL):
--     - Francisco          R$ 500  pix
--     - Nibiane            R$  75  dinheiro
--     - Renata             R$ 100  cartao_debito
--
-- ESTRATEGIA:
--   1. Pros 2 da REGRA 1: ja tem conta_bancaria_id -> so cria mov vinculada.
--   2. Pros 3 da REGRA 4: faz lookup da conta (igual fix do backfill),
--      atualiza CR.conta_bancaria_id, cria mov vinculada.
--
-- IDEMPOTENTE: filtra apenas CRs sem mov vinculada.
-- BYPASS: skip_categoria_garantia/skip_mov_garantia ligado durante o bloco.
-- =============================================================================

-- =============================================================================
-- PASSO 1: Atualizar trigger bloquear_edicao_pago pra liberar conta_bancaria_id
-- (espelho da migration 20260520210000_trigger_libera_conta_bancaria_pagos.sql)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.bloquear_edicao_pago()
RETURNS trigger LANGUAGE plpgsql AS $func$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.status IN ('pago', 'conciliado') THEN
    IF NEW.status IN ('cancelado', 'estornado') THEN
      RETURN NEW;
    END IF;
    IF NEW.status = 'aberto'
       AND NEW.valor_pago = 0
       AND NEW.data_pagamento IS NULL
    THEN
      RETURN NEW;
    END IF;
    IF NEW.status = OLD.status
       AND NEW.valor = OLD.valor
       AND NEW.data_vencimento = OLD.data_vencimento
       AND NEW.valor_pago IS NOT DISTINCT FROM OLD.valor_pago
       AND NEW.data_pagamento IS NOT DISTINCT FROM OLD.data_pagamento
       AND (
         NEW.conta_contabil_id IS DISTINCT FROM OLD.conta_contabil_id
         OR NEW.centro_custo_id IS DISTINCT FROM OLD.centro_custo_id
         OR NEW.conta_bancaria_id IS DISTINCT FROM OLD.conta_bancaria_id
         OR (
           TG_TABLE_NAME = 'contas_pagar'
           AND to_jsonb(NEW)->>'descricao' IS DISTINCT FROM to_jsonb(OLD)->>'descricao'
         )
         OR (
           TG_TABLE_NAME = 'contas_pagar'
           AND to_jsonb(NEW)->>'credor_cpf_cnpj' IS DISTINCT FROM to_jsonb(OLD)->>'credor_cpf_cnpj'
         )
         OR (
           TG_TABLE_NAME = 'contas_receber'
           AND to_jsonb(NEW)->>'venda_id' IS DISTINCT FROM to_jsonb(OLD)->>'venda_id'
         )
         OR (
           TG_TABLE_NAME = 'contas_receber'
           AND to_jsonb(NEW)->>'pagador_cpf_cnpj' IS DISTINCT FROM to_jsonb(OLD)->>'pagador_cpf_cnpj'
         )
       )
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Registro com status "%" nao pode ser editado. Use estorno, reverter pagamento ou reclassificacao.', OLD.status;
  END IF;
  RETURN NEW;
END;
$func$;

-- =============================================================================
-- PASSO 2: Fix retroativo dos 5 fantasmas
-- =============================================================================
DO $$
DECLARE
  v_cr RECORD;
  v_conta_bancaria_id UUID;
  v_conta_tipo TEXT;
  v_count_fix_r1 INT := 0;
  v_count_fix_r4 INT := 0;
  v_count_skip INT := 0;
BEGIN
  PERFORM set_config('app.skip_categoria_garantia', 'true', true);
  PERFORM set_config('app.skip_mov_garantia', 'true', true);

  FOR v_cr IN
    SELECT
      cr.id, cr.company_id, cr.pagador_nome, cr.valor, cr.valor_pago,
      cr.data_pagamento, cr.conta_bancaria_id, cr.forma_recebimento,
      CASE
        WHEN cr.observacoes LIKE '%[Restaurado em 2026-05-20%' THEN 'R1'
        WHEN cr.observacoes LIKE '%Backfill 2026-05-20 — venda à vista presumida%' THEN 'R4'
        ELSE 'outro'
      END AS regra
    FROM public.contas_receber cr
    WHERE cr.deleted_at IS NULL
      AND cr.status IN ('pago','conciliado','parcial')
      AND cr.valor_pago > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.movimentacoes m WHERE m.conta_receber_id = cr.id
      )
      AND (
        cr.observacoes LIKE '%Backfill 2026-05-20%'
        OR cr.observacoes LIKE '%[Restaurado em 2026-05-20%'
      )
  LOOP
    v_conta_bancaria_id := v_cr.conta_bancaria_id;

    -- REGRA 4: precisa fazer lookup de conta_bancaria_id
    IF v_conta_bancaria_id IS NULL THEN
      v_conta_tipo := CASE
        WHEN v_cr.forma_recebimento = 'dinheiro' THEN 'caixinha'
        ELSE 'conta_corrente'
      END;

      SELECT id INTO v_conta_bancaria_id
      FROM public.bank_accounts
      WHERE company_id = v_cr.company_id
        AND type = v_conta_tipo
        AND is_active = TRUE
      ORDER BY created_at
      LIMIT 1;

      -- Fallback: nao achou tipo especifico -> qualquer ativa nao-cartao.
      -- Aplica TAMBEM pra dinheiro (empresa pode nao ter caixinha cadastrada).
      IF v_conta_bancaria_id IS NULL THEN
        SELECT id INTO v_conta_bancaria_id
        FROM public.bank_accounts
        WHERE company_id = v_cr.company_id
          AND type <> 'cartao_credito'
          AND is_active = TRUE
        ORDER BY created_at
        LIMIT 1;
      END IF;

      IF v_conta_bancaria_id IS NULL THEN
        -- Sem conta cadastrada — nao da pra criar mov. Pula e avisa.
        RAISE WARNING 'CR % (% R$ %) sem conta bancária % cadastrada na empresa, mov nao criada',
          v_cr.id, v_cr.pagador_nome, v_cr.valor, v_conta_tipo;
        v_count_skip := v_count_skip + 1;
        CONTINUE;
      END IF;

      UPDATE public.contas_receber
         SET conta_bancaria_id = v_conta_bancaria_id
       WHERE id = v_cr.id;
      v_count_fix_r4 := v_count_fix_r4 + 1;
    ELSE
      v_count_fix_r1 := v_count_fix_r1 + 1;
    END IF;

    -- Cria mov vinculada (R1 e R4 entram aqui)
    INSERT INTO public.movimentacoes (
      company_id, conta_bancaria_id, conta_receber_id,
      tipo, valor, data, descricao, origem, status_conciliacao
    ) VALUES (
      v_cr.company_id, v_conta_bancaria_id, v_cr.id,
      'credito', v_cr.valor_pago, v_cr.data_pagamento,
      'Recebimento — ' || v_cr.pagador_nome || ' (fix fantasma 2026-05-20)',
      'conta_receber', 'pendente'
    );
  END LOOP;

  PERFORM set_config('app.skip_categoria_garantia', 'false', true);
  PERFORM set_config('app.skip_mov_garantia', 'false', true);

  RAISE NOTICE E'\n=== Fix fantasmas concluído ===\n  REGRA 1 corrigidos (mov criada):     %\n  REGRA 4 corrigidos (conta+mov):      %\n  Pulados (empresa sem conta):         %\n',
    v_count_fix_r1, v_count_fix_r4, v_count_skip;
END $$;

-- =============================================================================
-- VALIDAÇÃO PÓS-FIX
-- =============================================================================
SELECT
  'CR FANTASMAS restantes do backfill (esperado: 0)' AS check_name,
  COUNT(*) AS valor
FROM public.contas_receber cr
WHERE cr.deleted_at IS NULL
  AND cr.status IN ('pago','conciliado','parcial')
  AND cr.valor_pago > 0
  AND NOT EXISTS (SELECT 1 FROM public.movimentacoes m WHERE m.conta_receber_id = cr.id)
  AND (
    cr.observacoes LIKE '%Backfill 2026-05-20%'
    OR cr.observacoes LIKE '%[Restaurado em 2026-05-20%'
  )
UNION ALL
SELECT 'Movs criadas pelo fix retroativo', COUNT(*)
FROM public.movimentacoes
WHERE descricao LIKE '%(fix fantasma 2026-05-20)%';
