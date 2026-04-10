-- ============================================================
-- Fix: permitir cascades e limpezas em linhas já soft-deletadas
--
-- O trigger bloquear_edicao_pago rejeitava qualquer UPDATE em
-- contas_receber/contas_pagar cujo status fosse 'pago'/'conciliado',
-- inclusive cascades de FK SET NULL disparadas por DELETE FROM vendas.
-- Isso quebrava o fluxo "Excluir mês" em Vendas: ao apagar a venda,
-- a FK contas_receber.venda_id ON DELETE SET NULL tentava atualizar
-- os CRs (já soft-deletados) e o trigger levantava exceção, retornando
-- HTTP 400 "Bad Request" no frontend.
--
-- Correção: permitir qualquer UPDATE em linhas que já estão
-- soft-deletadas (deleted_at IS NOT NULL). Linhas soft-deletadas já
-- estão fora do escopo de auditoria funcional, então cascades e
-- limpezas administrativas podem passar.
-- ============================================================

CREATE OR REPLACE FUNCTION public.bloquear_edicao_pago()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Permitir soft delete inicial (deleted_at NULL -> NOT NULL)
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- Permitir qualquer alteração em linhas já soft-deletadas
  -- (cascades de FK SET NULL, limpezas administrativas, etc.)
  IF OLD.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Bloquear edição de registros pagos ou conciliados (linhas vivas)
  IF OLD.status IN ('pago', 'conciliado') THEN
    -- Permitir apenas estorno (mudança de status pago -> cancelado/estornado)
    IF NEW.status IN ('cancelado', 'estornado') THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Registro com status "%" não pode ser editado. Use estorno.', OLD.status;
  END IF;

  RETURN NEW;
END;
$$;
