-- ============================================================
-- Etapa 2a: trigger bloquear_edicao_pago permite alterar campos
-- "metadados" (descricao, competencia, conta_contabil_id,
-- centro_custo_id, observacoes) mesmo em registros pagos /
-- conciliados, desde que nenhum campo financeiro mude.
--
-- Motivacao: registros antigos criados pela conciliacao tem
-- descricao=NULL e competencia=NULL. Pra backfillar e pra UX
-- futura (reclassificar centro de custo de uma despesa ja paga
-- sem estorno), liberamos esses campos.
-- ============================================================

-- 0. Garantir que as colunas existem (defensivo, idempotente)
ALTER TABLE public.contas_pagar
  ADD COLUMN IF NOT EXISTS descricao text,
  ADD COLUMN IF NOT EXISTS competencia text;

ALTER TABLE public.contas_receber
  ADD COLUMN IF NOT EXISTS descricao text,
  ADD COLUMN IF NOT EXISTS competencia text;


-- 1. Trigger atualizada
CREATE OR REPLACE FUNCTION public.bloquear_edicao_pago()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_diff_old JSONB;
  v_diff_new JSONB;
BEGIN
  -- Permitir soft delete (apenas setar deleted_at)
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- Bloquear edicao de pagos/conciliados, com excecoes
  IF OLD.status IN ('pago', 'conciliado') THEN
    -- Excecao 1: estorno (status -> cancelado/estornado)
    IF NEW.status IN ('cancelado', 'estornado') THEN
      RETURN NEW;
    END IF;

    -- Excecao 2: alterar apenas campos metadados (sem mudar
    -- nada financeiro: valor, datas, status, valor_pago, etc).
    -- Compara o registro inteiro removendo os campos liberados;
    -- se o "resto" e identico, autoriza o update.
    v_diff_old := to_jsonb(OLD)
      - 'descricao' - 'competencia' - 'centro_custo_id'
      - 'conta_contabil_id' - 'observacoes' - 'updated_at';
    v_diff_new := to_jsonb(NEW)
      - 'descricao' - 'competencia' - 'centro_custo_id'
      - 'conta_contabil_id' - 'observacoes' - 'updated_at';

    IF v_diff_old = v_diff_new THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Registro com status "%" nao pode ser editado. Use estorno ou reclassificacao.', OLD.status;
  END IF;

  RETURN NEW;
END;
$$;


-- 1.5. Limpar FKs orfas (algumas linhas tem conta_contabil_id ou
-- centro_custo_id apontando pra registros que ja foram deletados,
-- causando FK violation no UPDATE. Setamos NULL nesses casos.)
UPDATE public.contas_pagar SET conta_contabil_id = NULL
WHERE conta_contabil_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.chart_of_accounts coa WHERE coa.id = contas_pagar.conta_contabil_id);

UPDATE public.contas_pagar SET centro_custo_id = NULL
WHERE centro_custo_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.centros_custo cc WHERE cc.id = contas_pagar.centro_custo_id);

UPDATE public.contas_receber SET conta_contabil_id = NULL
WHERE conta_contabil_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.chart_of_accounts coa WHERE coa.id = contas_receber.conta_contabil_id);

UPDATE public.contas_receber SET centro_custo_id = NULL
WHERE centro_custo_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.centros_custo cc WHERE cc.id = contas_receber.centro_custo_id);


-- 2. Backfill: descricao a partir de credor_nome / pagador_nome
UPDATE public.contas_pagar
SET descricao = credor_nome
WHERE descricao IS NULL
  AND credor_nome IS NOT NULL
  AND deleted_at IS NULL;

UPDATE public.contas_receber
SET descricao = pagador_nome
WHERE descricao IS NULL
  AND pagador_nome IS NOT NULL
  AND deleted_at IS NULL;


-- 3. Backfill: competencia derivada da data_pagamento ou data_vencimento
UPDATE public.contas_pagar
SET competencia = to_char(COALESCE(data_pagamento, data_vencimento), 'YYYY-MM')
WHERE competencia IS NULL
  AND data_vencimento IS NOT NULL
  AND deleted_at IS NULL;

UPDATE public.contas_receber
SET competencia = to_char(COALESCE(data_pagamento, data_vencimento), 'YYYY-MM')
WHERE competencia IS NULL
  AND data_vencimento IS NOT NULL
  AND deleted_at IS NULL;


-- 4. Relatorio
DO $$
DECLARE
  v_cp_descricao_null BIGINT;
  v_cp_competencia_null BIGINT;
  v_cr_descricao_null BIGINT;
  v_cr_competencia_null BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_cp_descricao_null
    FROM public.contas_pagar WHERE descricao IS NULL AND deleted_at IS NULL;
  SELECT COUNT(*) INTO v_cp_competencia_null
    FROM public.contas_pagar WHERE competencia IS NULL AND deleted_at IS NULL;
  SELECT COUNT(*) INTO v_cr_descricao_null
    FROM public.contas_receber WHERE descricao IS NULL AND deleted_at IS NULL;
  SELECT COUNT(*) INTO v_cr_competencia_null
    FROM public.contas_receber WHERE competencia IS NULL AND deleted_at IS NULL;

  RAISE NOTICE '════════════════════════════════════════════════════════';
  RAISE NOTICE 'BACKFILL concluido. Restantes com NULL:';
  RAISE NOTICE '   contas_pagar.descricao    NULL: %', v_cp_descricao_null;
  RAISE NOTICE '   contas_pagar.competencia  NULL: %', v_cp_competencia_null;
  RAISE NOTICE '   contas_receber.descricao  NULL: %', v_cr_descricao_null;
  RAISE NOTICE '   contas_receber.competencia NULL: %', v_cr_competencia_null;
  RAISE NOTICE '════════════════════════════════════════════════════════';
END $$;
