-- ============================================================================
-- FIX: HAIR OF BRASIL — recategorizar 6 movs de Stone (1.3.01) p/ Sinal (1.1.02)
--
-- Contexto:
--   Auditoria de abril/2026 achou R$ 209k em categoria 1.3.01 (Stone), sendo
--   ~R$ 142k de SINAIS de transplante categorizados errado. Desses, 6 têm
--   match perfeito com venda tipo=contrato (mesma data + valor + cliente).
--   Total a corrigir nesta fase: R$ 120.500
--
-- Que NÃO faz:
--   - Não cria CR pras movs (deixa mov_id direto, sem vinculo CR)
--   - Não toca nas 5 movs sem match (José Mauro Pinto, Pedro Agnaldo, 3 repasses)
--   - Não toca em movs com CR existente (Grupo B/C da auditoria)
--
-- Reversao:
--   UPDATE m SET conta_contabil_id = b.conta_contabil_id_old
--     FROM public.backup_hair_stone_fix_abril b
--    WHERE m.id = b.id;
-- ============================================================================

DO $$
DECLARE
  v_cat_stone UUID;
  v_cat_sinal UUID;
  v_atualizadas INT;
  v_total_movido NUMERIC;
BEGIN
  SELECT id INTO v_cat_stone FROM public.chart_of_accounts
   WHERE company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7' AND code = '1.3.01';
  SELECT id INTO v_cat_sinal FROM public.chart_of_accounts
   WHERE company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7' AND code = '1.1.02';
  IF v_cat_stone IS NULL OR v_cat_sinal IS NULL THEN
    RAISE EXCEPTION 'Categoria nao encontrada: stone=%, sinal=%', v_cat_stone, v_cat_sinal;
  END IF;

  -- 0. Backup das 6 linhas antes do UPDATE
  DROP TABLE IF EXISTS public.backup_hair_stone_fix_abril;
  CREATE TABLE public.backup_hair_stone_fix_abril AS
  SELECT id, conta_contabil_id AS conta_contabil_id_old, data, valor, descricao, now() AS backed_up_at
    FROM public.movimentacoes
   WHERE id IN (
     '9d4033ba-e78a-4de7-bbff-aaa695a5a251',  -- Carlos Frederico
     '9681c82b-828a-4699-a7f3-8d9fb05f1123',  -- Joao Paulo Pereira
     '8662f360-5096-43de-98f4-1fabfcd18a3c',  -- Jose Antonio dos Reis Junior
     'e8432558-8cf7-4e48-a290-81970ab7d1a9',  -- Felipe Garcia Cruz
     'd1879836-1e23-4495-97f6-7c3de9ac2031',  -- Bernardo Silveira de Souza
     'bd086c6c-7bf1-4b09-b5f9-fea474af16b1'   -- Luiz Claudio Ribeiro Santiago
   );
  RAISE NOTICE '[0/2] Backup criado em backup_hair_stone_fix_abril (% linhas)',
    (SELECT COUNT(*) FROM public.backup_hair_stone_fix_abril);

  -- Sanity: confere que TODAS as 6 ainda estao em Stone e bate o valor esperado
  PERFORM 1
    FROM public.backup_hair_stone_fix_abril b
   WHERE b.conta_contabil_id_old <> v_cat_stone;
  IF FOUND THEN
    RAISE EXCEPTION 'Aborto: alguma mov ja foi recategorizada — backup contem linhas fora de Stone';
  END IF;

  IF (SELECT COUNT(*) FROM public.backup_hair_stone_fix_abril) <> 6 THEN
    RAISE EXCEPTION 'Aborto: backup tem % linhas, esperado 6',
      (SELECT COUNT(*) FROM public.backup_hair_stone_fix_abril);
  END IF;

  IF (SELECT SUM(valor) FROM public.backup_hair_stone_fix_abril) <> 120500.00 THEN
    RAISE EXCEPTION 'Aborto: soma do backup = %, esperado 120500.00',
      (SELECT SUM(valor) FROM public.backup_hair_stone_fix_abril);
  END IF;

  -- 1. UPDATE: troca categoria
  UPDATE public.movimentacoes
     SET conta_contabil_id = v_cat_sinal
   WHERE id IN (SELECT id FROM public.backup_hair_stone_fix_abril);

  GET DIAGNOSTICS v_atualizadas = ROW_COUNT;
  SELECT SUM(valor) INTO v_total_movido FROM public.backup_hair_stone_fix_abril;

  RAISE NOTICE '[1/2] % movs reclassificadas (R$ % movidos de 1.3.01 → 1.1.02)',
    v_atualizadas, v_total_movido;

  -- 2. Diff antes/depois — recheck do passo 7
  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE 'Resultado esperado em abril/2026 (categorias top):';
  RAISE NOTICE '  1.3.01 Stone:        R$ 209.781 → R$ 89.281  (-R$ 120.500)';
  RAISE NOTICE '  1.1.02 Sinal:        R$ 137.705 → R$ 258.205 (+R$ 120.500)';
  RAISE NOTICE '  Total entradas abril: R$ 634.718 (inalterado)';
  RAISE NOTICE '════════════════════════════════════════════════════════════';
END $$;


-- ============================================================================
-- VERIFICACAO pos-fix (rodar separadamente)
-- ============================================================================

-- V1. Confere que as 6 movs estao agora em 1.1.02
SELECT
  m.id, m.data, m.valor,
  coa.code, coa.name,
  LEFT(m.descricao, 50) AS descricao
FROM public.movimentacoes m
INNER JOIN public.chart_of_accounts coa ON coa.id = m.conta_contabil_id
WHERE m.id IN (SELECT id FROM public.backup_hair_stone_fix_abril)
ORDER BY m.valor DESC;

-- V2. Refaz o passo 7 (entradas por categoria abril/2026)
SELECT
  COALESCE(coa.code, '(sem categoria)') AS cat_codigo,
  COALESCE(coa.name, '(sem categoria)') AS cat_nome,
  COUNT(*)                              AS qtd,
  SUM(m.valor)                          AS total
FROM public.movimentacoes m
LEFT JOIN public.contas_receber cr ON cr.id = m.conta_receber_id
LEFT JOIN public.chart_of_accounts coa
       ON coa.id = COALESCE(m.conta_contabil_id, cr.conta_contabil_id)
WHERE m.company_id = '6d41eb71-e593-4ff2-8e3b-e36089a2aca7'
  AND m.data BETWEEN '2026-04-01' AND '2026-04-30'
  AND m.tipo = 'credito'
GROUP BY coa.code, coa.name
ORDER BY SUM(m.valor) DESC;


-- ============================================================================
-- ROLLBACK (se quiser desfazer)
-- ============================================================================

-- UPDATE public.movimentacoes m
--    SET conta_contabil_id = b.conta_contabil_id_old
--   FROM public.backup_hair_stone_fix_abril b
--  WHERE m.id = b.id;
