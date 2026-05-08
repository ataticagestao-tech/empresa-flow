-- ============================================================
-- Fix: permitir reverter pagamento de CR/CP pago para aberto
--
-- Motivacao: a acao "Cancelar pagamento" no dropdown de Contas a
-- Pagar (e equivalente em Contas a Receber) precisa zerar os campos
-- de pagamento e voltar status para 'aberto'. O trigger
-- bloquear_edicao_pago barrava porque so permitia pago -> cancelado/
-- estornado, nao pago -> aberto.
--
-- Esta migration adiciona uma 3a regra: permitir UPDATE de pago/parcial
-- para aberto desde que os campos financeiros do pagamento (valor_pago
-- e data_pagamento) sejam zerados. O auditoria continua registrando a
-- operacao via trg_audit_cr/cp.
-- ============================================================

CREATE OR REPLACE FUNCTION public.bloquear_edicao_pago()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- 1. Permitir soft delete inicial
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- 2. Permitir qualquer alteracao em linhas ja soft-deletadas
  IF OLD.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- 3. Bloquear edicao de registros pagos/conciliados
  IF OLD.status IN ('pago', 'conciliado') THEN
    -- 3a. Permitir estorno (cancelado/estornado)
    IF NEW.status IN ('cancelado', 'estornado') THEN
      RETURN NEW;
    END IF;

    -- 3b. Permitir reverter pagamento: pago -> aberto desde que
    --     valor_pago zerado e data_pagamento limpa.
    IF NEW.status = 'aberto'
       AND NEW.valor_pago = 0
       AND NEW.data_pagamento IS NULL
    THEN
      RETURN NEW;
    END IF;

    -- 3c. Permitir reclassificacao: conta_contabil_id, centro_custo_id
    --     OU venda_id (apenas CR) — desde que campos financeiros
    --     permanecam intactos.
    IF NEW.status = OLD.status
       AND NEW.valor = OLD.valor
       AND NEW.data_vencimento = OLD.data_vencimento
       AND NEW.valor_pago IS NOT DISTINCT FROM OLD.valor_pago
       AND NEW.data_pagamento IS NOT DISTINCT FROM OLD.data_pagamento
       AND (
         NEW.conta_contabil_id IS DISTINCT FROM OLD.conta_contabil_id
         OR NEW.centro_custo_id IS DISTINCT FROM OLD.centro_custo_id
         OR (
           TG_TABLE_NAME = 'contas_receber'
           AND to_jsonb(NEW)->>'venda_id' IS DISTINCT FROM to_jsonb(OLD)->>'venda_id'
         )
       )
    THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Registro com status "%" nao pode ser editado. Use estorno, reverter pagamento ou reclassificacao.', OLD.status;
  END IF;

  RETURN NEW;
END;
$$;
