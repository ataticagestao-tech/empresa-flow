-- ============================================================
-- Liberar UPDATE de conta_bancaria_id em CR/CP pagos
--
-- Espelho das migrations 20260514120100 (descricao), 20260518120000
-- (credor_cpf_cnpj CP) e 20260519140000 (pagador_cpf_cnpj CR).
-- Mesma justificativa: vincular retroativamente um CR/CP pago a uma
-- conta bancaria nao e' edicao financeira — e' metadado de
-- categorizacao que pode estar errado/ausente no lancamento original.
--
-- Caso especifico: backfill de vendas orfas cria CR pago sem
-- conta_bancaria_id quando a forma de pagamento e' a vista mas a venda
-- nao tinha mov bancaria associada. O CR precisa ser vinculado a uma
-- conta pra a mov ser criada corretamente.
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

    -- 3c. Permitir reclassificacao: conta_contabil_id, centro_custo_id,
    --     conta_bancaria_id, descricao (CR/CP), venda_id (apenas CR),
    --     credor_cpf_cnpj (apenas CP) OU pagador_cpf_cnpj (apenas CR)
    --     — desde que campos financeiros permanecam intactos.
    IF NEW.status = OLD.status
       AND NEW.valor = OLD.valor
       AND NEW.data_vencimento = OLD.data_vencimento
       AND NEW.valor_pago IS NOT DISTINCT FROM OLD.valor_pago
       AND NEW.data_pagamento IS NOT DISTINCT FROM OLD.data_pagamento
       AND (
         NEW.conta_contabil_id IS DISTINCT FROM OLD.conta_contabil_id
         OR NEW.centro_custo_id IS DISTINCT FROM OLD.centro_custo_id
         OR NEW.conta_bancaria_id IS DISTINCT FROM OLD.conta_bancaria_id
         OR (
           TG_TABLE_NAME = 'contas_pagar'
           AND to_jsonb(NEW)->>'descricao' IS DISTINCT FROM to_jsonb(OLD)->>'descricao'
         )
         OR (
           TG_TABLE_NAME = 'contas_pagar'
           AND to_jsonb(NEW)->>'credor_cpf_cnpj' IS DISTINCT FROM to_jsonb(OLD)->>'credor_cpf_cnpj'
         )
         OR (
           TG_TABLE_NAME = 'contas_receber'
           AND to_jsonb(NEW)->>'venda_id' IS DISTINCT FROM to_jsonb(OLD)->>'venda_id'
         )
         OR (
           TG_TABLE_NAME = 'contas_receber'
           AND to_jsonb(NEW)->>'pagador_cpf_cnpj' IS DISTINCT FROM to_jsonb(OLD)->>'pagador_cpf_cnpj'
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
