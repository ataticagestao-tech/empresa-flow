-- =============================================================================
-- BACKFILL HISTÓRICO: 16.917 vendas órfãs anteriores a 2026-05-01
-- =============================================================================
-- Fase 2 do plano. Fase 1 (recentes) e Fase 3 (RPC atômica) já aplicadas.
--
-- DECISÃO DE ESTRATÉGIA (Izabel, 2026-05-20):
-- As 12 franquias não gerenciam caixa pelo sistema (vendas balcão, dinheiro
-- físico). Nenhuma tem `caixinha` ou `conta_corrente` cadastrada. Forçar mov
-- retroativa exigiria criar 24 contas + 12.281 movs que não correspondem ao
-- caixa real. Estratégia escolhida: CR pago retroativo SEM mov, com
-- conta_bancaria_id=NULL.
--
-- Justificativa: o que importa contábil/fiscalmente é o CR pago classificado
-- no DRE. Caixa antigo permanece intocado (como sempre foi). "Fantasma" é
-- um problema só quando há expectativa de mov — nessas franquias não há.
--
-- ESTRATÉGIA por empresa+forma:
--   1. HAIR (6d41eb71): CR ABERTO. Constraint partial unique proíbe gêmeo pago.
--   2. Outras + forma à vista (pix/dinheiro/cartao_debito):
--      CR PAGO retroativo, valor_pago = valor_total, data_pagamento = data_venda.
--      Sem conta_bancaria_id, sem mov.
--   3. Outras + forma a prazo (cartao_credito/parcelado/multiplo/boleto/null):
--      CR ABERTO.
--
-- conta_contabil_id = NULL em todos. Izabel classifica via tela de Contas
-- a Receber pra alimentar o DRE.
--
-- IDEMPOTENTE: filtra venda_id sem CR ativo.
-- BYPASSES: skip_categoria/skip_mov/skip_duplicate_check.
-- =============================================================================

DO $$
DECLARE
  v_hair_id UUID := '6d41eb71-e593-4ff2-8e3b-e36089a2aca7';
  v_count_inseridos INT;
  v_count_pago INT;
  v_count_aberto INT;
  v_count_hair INT;
BEGIN
  PERFORM set_config('app.skip_categoria_garantia', 'true', true);
  PERFORM set_config('app.skip_mov_garantia', 'true', true);
  PERFORM set_config('app.skip_duplicate_check', 'true', true);

  INSERT INTO public.contas_receber (
    company_id, pagador_nome, pagador_cpf_cnpj,
    valor, valor_pago,
    data_vencimento, data_pagamento,
    status, forma_recebimento,
    venda_id, observacoes
  )
  SELECT
    v.company_id,
    v.cliente_nome,
    v.cliente_cpf_cnpj,
    v.valor_total,
    CASE
      WHEN v.company_id = v_hair_id THEN 0
      WHEN v.forma_pagamento IN ('pix','dinheiro','cartao_debito') THEN v.valor_total
      ELSE 0
    END AS valor_pago,
    v.data_venda AS data_vencimento,
    CASE
      WHEN v.company_id = v_hair_id THEN NULL
      WHEN v.forma_pagamento IN ('pix','dinheiro','cartao_debito') THEN v.data_venda
      ELSE NULL
    END AS data_pagamento,
    CASE
      WHEN v.company_id = v_hair_id THEN 'aberto'
      WHEN v.forma_pagamento IN ('pix','dinheiro','cartao_debito') THEN 'pago'
      ELSE 'aberto'
    END AS status,
    v.forma_pagamento,
    v.id AS venda_id,
    CASE
      WHEN v.company_id = v_hair_id THEN
        'Backfill histórico 2026-05-20 — HAIR órfã antiga. Quitar manualmente se recebido.'
      WHEN v.forma_pagamento IN ('pix','dinheiro','cartao_debito') THEN
        'Backfill histórico 2026-05-20 — venda à vista balcão presumida recebida. Franquia não gerencia caixa no sistema (CR sem mov por desenho). Classificar conta contábil via tela.'
      ELSE
        'Backfill histórico 2026-05-20 — venda a prazo sem CR. Classificar e quitar manualmente.'
    END AS observacoes
  FROM public.vendas v
  LEFT JOIN public.contas_receber cr
    ON cr.venda_id = v.id AND cr.deleted_at IS NULL
  WHERE v.status <> 'cancelado'
    AND cr.id IS NULL
    AND v.created_at < '2026-05-01';

  GET DIAGNOSTICS v_count_inseridos = ROW_COUNT;

  PERFORM set_config('app.skip_categoria_garantia', 'false', true);
  PERFORM set_config('app.skip_mov_garantia', 'false', true);
  PERFORM set_config('app.skip_duplicate_check', 'false', true);

  SELECT COUNT(*) INTO v_count_pago FROM public.contas_receber
   WHERE observacoes LIKE 'Backfill histórico 2026-05-20 — venda à vista balcão%';
  SELECT COUNT(*) INTO v_count_aberto FROM public.contas_receber
   WHERE observacoes LIKE 'Backfill histórico 2026-05-20 — venda a prazo%';
  SELECT COUNT(*) INTO v_count_hair FROM public.contas_receber
   WHERE observacoes LIKE 'Backfill histórico 2026-05-20 — HAIR%';

  RAISE NOTICE E'\n=== Backfill HISTÓRICO concluído ===\n  Total CRs inseridos:                   %\n  Pago à vista balcão (sem mov):         %\n  Aberto a prazo:                        %\n  Aberto HAIR (constraint):              %\n',
    v_count_inseridos, v_count_pago, v_count_aberto, v_count_hair;
END $$;

-- =============================================================================
-- VALIDAÇÃO PÓS-BACKFILL
-- =============================================================================
SELECT
  'Órfãs históricas restantes (esperado: 0)' AS check_name,
  COUNT(*) AS valor
FROM public.vendas v
LEFT JOIN public.contas_receber cr
  ON cr.venda_id = v.id AND cr.deleted_at IS NULL
WHERE v.status <> 'cancelado'
  AND cr.id IS NULL
  AND v.created_at < '2026-05-01'
UNION ALL
SELECT 'CRs criados pelo backfill histórico', COUNT(*)
FROM public.contas_receber
WHERE observacoes LIKE 'Backfill histórico 2026-05-20%' AND deleted_at IS NULL
UNION ALL
SELECT 'CRs Pago (à vista balcão, sem mov por desenho)', COUNT(*)
FROM public.contas_receber
WHERE observacoes LIKE 'Backfill histórico 2026-05-20 — venda à vista balcão%'
  AND deleted_at IS NULL
UNION ALL
SELECT 'CRs Aberto (a prazo)', COUNT(*)
FROM public.contas_receber
WHERE observacoes LIKE 'Backfill histórico 2026-05-20 — venda a prazo%'
  AND deleted_at IS NULL
UNION ALL
SELECT 'CRs Aberto HAIR', COUNT(*)
FROM public.contas_receber
WHERE observacoes LIKE 'Backfill histórico 2026-05-20 — HAIR%'
  AND deleted_at IS NULL;
