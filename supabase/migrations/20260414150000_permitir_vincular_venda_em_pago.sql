-- ============================================================
-- Fix: permitir alterar venda_id em CRs pagas/conciliadas
--
-- Motivacao: feature de Contratos (HAIR OF BRASIL) precisa vincular
-- lancamentos ja quitados (PIX, dinheiro, etc) a um contrato, para que
-- o saldo do contrato seja abatido. O trigger bloquear_edicao_pago
-- estava barrando esse UPDATE pois venda_id nao estava na whitelist.
--
-- Esta migration adiciona venda_id como um campo de reclassificacao
-- permitido em CRs pagas, na mesma logica de conta_contabil_id /
-- centro_custo_id (metadados nao-financeiros).
--
-- Observacao: contas_pagar NAO tem coluna venda_id, entao protegemos
-- o acesso via TG_TABLE_NAME para evitar erro na CP.
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
    -- 3a. Permitir estorno
    IF NEW.status IN ('cancelado', 'estornado') THEN
      RETURN NEW;
    END IF;

    -- 3b. Permitir reclassificacao: conta_contabil_id, centro_custo_id
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

    RAISE EXCEPTION 'Registro com status "%" nao pode ser editado. Use estorno ou reclassificacao.', OLD.status;
  END IF;

  RETURN NEW;
END;
$$;
