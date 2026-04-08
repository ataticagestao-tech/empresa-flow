-- ============================================================
-- FIX: Permitir reclassificação contábil em registros pagos
--
-- O trigger bloquear_edicao_pago impedia qualquer edição em
-- registros com status='pago', incluindo mudança de categoria
-- (conta_contabil_id). Reclassificação contábil não altera
-- valores financeiros — deve ser permitida.
-- ============================================================

CREATE OR REPLACE FUNCTION public.bloquear_edicao_pago()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Permitir soft delete (apenas setar deleted_at)
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- Bloquear edição de registros pagos ou conciliados
  IF OLD.status IN ('pago', 'conciliado') THEN
    -- Permitir estorno (mudança de status pago → cancelado/estornado)
    IF NEW.status IN ('cancelado', 'estornado') THEN
      RETURN NEW;
    END IF;

    -- Permitir reclassificação contábil (apenas conta_contabil_id muda)
    IF NEW.conta_contabil_id IS DISTINCT FROM OLD.conta_contabil_id
       AND NEW.status = OLD.status
       AND NEW.valor = OLD.valor
       AND NEW.data_vencimento = OLD.data_vencimento
    THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Registro com status "%" não pode ser editado. Use estorno.', OLD.status;
  END IF;

  RETURN NEW;
END;
$$;
