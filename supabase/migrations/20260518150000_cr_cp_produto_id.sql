-- ============================================================
-- Adicionar produto_id em contas_receber e contas_pagar
--
-- Hoje o dropdown de produtos em CR/CP so copia o nome para a
-- coluna descricao (texto livre). Isso quebra:
--   - Relatorios por produto (CRs avulsas nao entram)
--   - Baixa automatica de estoque quando pagar a CR
--   - Renomear o produto nao atualiza CRs/CPs antigas
--
-- Adiciona FK opcional para products. Quando preenchida, o vinculo
-- e' forte. Quando null, e' texto livre (servicos avulsos, taxas,
-- juros etc).
-- ============================================================

ALTER TABLE public.contas_receber
  ADD COLUMN IF NOT EXISTS produto_id uuid REFERENCES public.products(id) ON DELETE SET NULL;

ALTER TABLE public.contas_pagar
  ADD COLUMN IF NOT EXISTS produto_id uuid REFERENCES public.products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cr_produto ON public.contas_receber(produto_id) WHERE produto_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cp_produto ON public.contas_pagar(produto_id) WHERE produto_id IS NOT NULL;

-- Trigger bloquear_edicao_pago precisa permitir UPDATE de produto_id
-- em CR/CP pagos (mesma natureza dos outros campos de classificacao:
-- conta_contabil, centro_custo, descricao).
CREATE OR REPLACE FUNCTION public.bloquear_edicao_pago()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('pago', 'conciliado') THEN
    IF NEW.status IN ('cancelado', 'estornado') THEN
      RETURN NEW;
    END IF;

    IF NEW.status = 'aberto'
       AND NEW.valor_pago = 0
       AND NEW.data_pagamento IS NULL
    THEN
      RETURN NEW;
    END IF;

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
         OR to_jsonb(NEW)->>'produto_id' IS DISTINCT FROM to_jsonb(OLD)->>'produto_id'
       )
    THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Registro com status "%" nao pode ser editado. Use estorno, reverter pagamento ou reclassificacao.', OLD.status;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- Backfill: tentar popular produto_id em CRs/CPs antigas
-- via match exato pelo texto da descricao
-- ============================================================
UPDATE public.contas_receber cr
SET produto_id = p.id
FROM public.products p
WHERE cr.produto_id IS NULL
  AND cr.deleted_at IS NULL
  AND p.company_id = cr.company_id
  AND p.is_active = true
  AND LOWER(TRIM(cr.descricao)) = LOWER(TRIM(p.description));

UPDATE public.contas_pagar cp
SET produto_id = p.id
FROM public.products p
WHERE cp.produto_id IS NULL
  AND cp.deleted_at IS NULL
  AND p.company_id = cp.company_id
  AND p.is_active = true
  AND LOWER(TRIM(cp.descricao)) = LOWER(TRIM(p.description));

NOTIFY pgrst, 'reload schema';
