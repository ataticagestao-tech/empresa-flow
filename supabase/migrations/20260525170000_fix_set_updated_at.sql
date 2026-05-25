-- =============================================================================
-- FIX: set_updated_at() quebrava em tabelas sem coluna deleted_at
-- =============================================================================
-- Sintoma: ao emitir NFSe (que faz INSERT em nfse_emissoes + UPDATE pra status
-- 'enviando'), Postgres retornava:
--   "record 'new' has no field 'deleted_at'"
--
-- Causa: a funcao public.set_updated_at() em algum momento foi alterada pra
-- referenciar NEW.deleted_at (provavelmente pra ignorar soft-deletes). Mas
-- nfse_emissoes (e outras tabelas que usam essa funcao no trigger
-- BEFORE UPDATE) nao tem deleted_at — entao Postgres quebra ao compilar
-- o corpo na primeira execucao.
--
-- Fix: redefine set_updated_at() pra fazer SO o trabalho dela — atualizar
-- updated_at. Logica de soft-delete (se necessaria) deve ficar em triggers
-- proprios por tabela, nao misturada na funcao generica.
--
-- IDEMPOTENTE: CREATE OR REPLACE.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_updated_at()
  IS 'Trigger BEFORE UPDATE que atualiza updated_at. Generica — nao deve referenciar colunas opcionais como deleted_at (quebra em tabelas que nao tem).';
