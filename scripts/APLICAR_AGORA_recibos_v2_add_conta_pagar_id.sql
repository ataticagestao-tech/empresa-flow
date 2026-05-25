-- ============================================================
-- APLICAR NO SUPABASE SQL EDITOR
-- Adiciona conta_pagar_id em recibos_v2 para vincular
-- recibos gerados a partir de Contas a Pagar
-- ============================================================
-- Seguro:
--   - Coluna nova, nullable (registros existentes ficam NULL)
--   - ON DELETE SET NULL (excluir CP nao apaga recibo)
--   - Nenhum trigger/view/FK existente eh afetado
--   - select * do Recibos.tsx pega a coluna nova automaticamente
-- ============================================================

DO $$
BEGIN
  -- 1. Adiciona a coluna se ainda nao existir
  ALTER TABLE public.recibos_v2
    ADD COLUMN IF NOT EXISTS conta_pagar_id uuid
      REFERENCES public.contas_pagar(id) ON DELETE SET NULL;

  -- 2. Index parcial para lookups rapidos
  CREATE INDEX IF NOT EXISTS idx_recibos_v2_cp
    ON public.recibos_v2(conta_pagar_id)
    WHERE conta_pagar_id IS NOT NULL;

  RAISE NOTICE 'OK: recibos_v2.conta_pagar_id adicionado (ou ja existia).';
END $$;

-- ============================================================
-- Verificacao (opcional - rode pra conferir)
-- ============================================================
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'recibos_v2'
  AND column_name IN ('conta_receber_id', 'conta_pagar_id')
ORDER BY column_name;
