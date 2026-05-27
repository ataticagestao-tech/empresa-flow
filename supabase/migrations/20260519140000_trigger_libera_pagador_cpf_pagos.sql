-- ============================================================
-- Liberar UPDATE de pagador_cpf_cnpj em CR pagos
--
-- Espelho da migration 20260518120000_trigger_libera_credor_cpf_pagos.sql
-- que liberou UPDATE de credor_cpf_cnpj em CP pagos. Mesma justificativa:
-- vincular pagamentos antigos a clientes via aba "Historico financeiro"
-- exige gravar pagador_cpf_cnpj em CRs ja pagas. CPF do pagador e' identico
-- em natureza: metadado de identificacao, nao campo financeiro.
--
-- Necessario tambem pro Caminho A de re-vinculacao de CRs orfaos (vindos
-- da conciliacao bancaria sem CPF identificado) aos clientes corretos.
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
    --     descricao (CR/CP), venda_id (apenas CR),
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
