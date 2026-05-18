-- ============================================================
-- DIAGNÓSTICO: trigger que referencia NEW.created_via
--
-- Erro reportado na conciliação:
--   "record \"new\" has no field \"created_via\""
--
-- Causa: alguma function/trigger no banco tenta acessar NEW.created_via
-- mas a coluna real é created_via_bank_tx_id. A função não está em
-- migrations — deve ter sido criada direto no Supabase Studio.
--
-- Rode os blocos 1 e 2 abaixo no SQL Editor pra identificar e ver
-- o código da função. Depois rode o bloco 3 pra corrigir.
-- ============================================================

-- ── BLOCO 1: lista funções que referenciam NEW.created_via ──
-- (não NEW.created_via_bank_tx_id — o bom é o regex com fronteira)
SELECT
    n.nspname  AS schema,
    p.proname  AS function_name,
    p.oid::regprocedure AS signature
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND pg_get_functiondef(p.oid) ~* '\mNEW\.created_via\M'
  AND pg_get_functiondef(p.oid) !~* '\mNEW\.created_via_bank_tx_id\M';


-- ── BLOCO 2: mostra o código da function (rodar 1 por vez) ──
-- Substitua <function_name> pelo nome retornado pelo bloco 1
-- Exemplo:
--   SELECT pg_get_functiondef('public.minha_function_problemática'::regprocedure);


-- ── BLOCO 3: lista triggers que usam essas funções ──
SELECT
    event_object_schema AS table_schema,
    event_object_table  AS table_name,
    trigger_name,
    action_timing,
    event_manipulation,
    action_statement
FROM information_schema.triggers
WHERE action_statement ILIKE '%created_via%'
   OR action_statement IN (
       SELECT 'EXECUTE FUNCTION ' || (p.oid::regprocedure)::text
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND pg_get_functiondef(p.oid) ~* '\mNEW\.created_via\M'
         AND pg_get_functiondef(p.oid) !~* '\mNEW\.created_via_bank_tx_id\M'
   );


-- ── BLOCO 4: depois de identificar, opções de correção ──
-- A) Se a referência deveria ser NEW.created_via_bank_tx_id, recrie
--    a função substituindo o nome. (use o CREATE OR REPLACE retornado
--    pelo bloco 2 com o NEW.created_via corrigido pra NEW.created_via_bank_tx_id)
--
-- B) Se a função/trigger não é necessária, drop:
--      DROP TRIGGER IF EXISTS <trigger_name> ON public.<tabela>;
--      DROP FUNCTION IF EXISTS public.<function_name>();
--
-- C) Se quiser desabilitar temporariamente sem droppar:
--      ALTER TABLE public.<tabela> DISABLE TRIGGER <trigger_name>;
