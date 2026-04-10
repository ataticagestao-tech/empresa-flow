-- ============================================================
-- Fix: restaurar reclassificacao contabil em registros pagos
--
-- Historico:
--   - 20260408120000 permitiu reclassificar conta_contabil_id em pagos
--   - 20260410150000 consertou cascade de soft-delete mas acidentalmente
--     apagou a regra de reclassificacao ao fazer CREATE OR REPLACE
--
-- Esta migration consolida as duas regras numa unica versao da funcao:
--   1. Soft-delete cascade livre (cascades FK em linhas ja soft-deletadas)
--   2. Reclassificacao de conta_contabil_id / centro_custo_id permitida
--      em registros pagos, desde que campos financeiros nao mudem
--
-- A funcao atende tanto trg_bloquear_edicao_cp (contas_pagar) quanto
-- trg_bloquear_edicao_cr (contas_receber).
-- ============================================================

CREATE OR REPLACE FUNCTION public.bloquear_edicao_pago()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- 1. Permitir soft delete inicial (deleted_at NULL -> NOT NULL)
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- 2. Permitir qualquer alteracao em linhas ja soft-deletadas
  --    (cascades de FK SET NULL, limpezas administrativas)
  IF OLD.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- 3. Bloquear edicao de registros pagos/conciliados (linhas vivas)
  IF OLD.status IN ('pago', 'conciliado') THEN
    -- 3a. Permitir estorno (mudanca de status para cancelado/estornado)
    IF NEW.status IN ('cancelado', 'estornado') THEN
      RETURN NEW;
    END IF;

    -- 3b. Permitir reclassificacao contabil: conta_contabil_id e/ou
    --     centro_custo_id podem mudar, desde que campos financeiros
    --     (valor, data_vencimento, status, valor_pago, data_pagamento)
    --     permanecam intactos.
    IF NEW.status = OLD.status
       AND NEW.valor = OLD.valor
       AND NEW.data_vencimento = OLD.data_vencimento
       AND NEW.valor_pago IS NOT DISTINCT FROM OLD.valor_pago
       AND NEW.data_pagamento IS NOT DISTINCT FROM OLD.data_pagamento
       AND (
         NEW.conta_contabil_id IS DISTINCT FROM OLD.conta_contabil_id
         OR NEW.centro_custo_id IS DISTINCT FROM OLD.centro_custo_id
       )
    THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Registro com status "%" nao pode ser editado. Use estorno ou reclassificacao contabil.', OLD.status;
  END IF;

  RETURN NEW;
END;
$$;
