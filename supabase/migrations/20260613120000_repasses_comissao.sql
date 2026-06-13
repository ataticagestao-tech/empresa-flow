-- =============================================================================
-- Controle de Repasse de Comissão
-- =============================================================================
-- Passo seguinte ao cálculo da comissão (ver 20260612120000_comissoes_por_profissional.sql):
--   1. % padrão de deduções no profissional (IR retido, taxa de sala)
--   2. repasses_comissao  — cabeçalho do repasse (1 por profissional/período)
--   3. comissoes.repasse_id — marca a comissão como "já num repasse"
--   4. adiantamentos_comissao — ledger de adiantamentos (abatidos no repasse)
--   5. RPC gerar_repasse_comissao()  — consolida comissões + deduções + gera CP
--   6. RPC marcar_repasse_pago()     — fecha repasse pago "por fora" (sem CP)
--   7. Trigger sync_repasse_on_cp_pago — pagar o CP fecha repasse + comissões
--
-- Idempotente: pode ser re-rodado no SQL Editor sem erro.
-- APLICADO: 2026-06-13 (Supabase SQL Editor)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. employees: % padrão de deduções (pré-preenche o repasse, editável)
-- -----------------------------------------------------------------------------
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS ir_retido_percentual NUMERIC(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxa_sala_percentual NUMERIC(7,4) NOT NULL DEFAULT 0;

-- -----------------------------------------------------------------------------
-- 2. repasses_comissao: cabeçalho do repasse
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.repasses_comissao (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  periodo_inicio  DATE NOT NULL,
  periodo_fim     DATE NOT NULL,
  valor_bruto     NUMERIC(15,2) NOT NULL DEFAULT 0,
  deducoes        JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{tipo, descricao, valor}]
  total_deducoes  NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_liquido   NUMERIC(15,2) NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'aberto',
  conta_pagar_id  UUID,
  data_pagamento  DATE,
  forma_pagamento TEXT,
  observacoes     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'repasses_comissao_status_chk') THEN
    ALTER TABLE public.repasses_comissao
      ADD CONSTRAINT repasses_comissao_status_chk CHECK (status IN ('aberto','pago','cancelado'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_repasses_company_periodo ON public.repasses_comissao(company_id, periodo_fim);
CREATE INDEX IF NOT EXISTS idx_repasses_employee        ON public.repasses_comissao(employee_id);
CREATE INDEX IF NOT EXISTS idx_repasses_conta_pagar     ON public.repasses_comissao(conta_pagar_id);

ALTER TABLE public.repasses_comissao ENABLE ROW LEVEL SECURITY;

-- Gestor (membro da empresa) vê/gerencia tudo da empresa.
DROP POLICY IF EXISTS repasses_select_company ON public.repasses_comissao;
CREATE POLICY repasses_select_company ON public.repasses_comissao FOR SELECT
  USING (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()));

-- Profissional (fora de user_companies) vê só os repasses dele. is_meu_employee()
-- já existe (SECURITY DEFINER, criado na migration de comissões).
DROP POLICY IF EXISTS repasses_select_self ON public.repasses_comissao;
CREATE POLICY repasses_select_self ON public.repasses_comissao FOR SELECT
  USING (public.is_meu_employee(employee_id));

DROP POLICY IF EXISTS repasses_insert_company ON public.repasses_comissao;
CREATE POLICY repasses_insert_company ON public.repasses_comissao FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS repasses_update_company ON public.repasses_comissao;
CREATE POLICY repasses_update_company ON public.repasses_comissao FOR UPDATE
  USING (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS repasses_delete_company ON public.repasses_comissao;
CREATE POLICY repasses_delete_company ON public.repasses_comissao FOR DELETE
  USING (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- 3. comissoes.repasse_id: marca a comissão como "já num repasse"
--    "Está num repasse" = repasse_id IS NOT NULL (status só vira 'pago' no pagamento).
-- -----------------------------------------------------------------------------
ALTER TABLE public.comissoes
  ADD COLUMN IF NOT EXISTS repasse_id UUID REFERENCES public.repasses_comissao(id);

CREATE INDEX IF NOT EXISTS idx_comissoes_repasse ON public.comissoes(repasse_id);

-- -----------------------------------------------------------------------------
-- 4. adiantamentos_comissao: ledger de adiantamentos ao profissional
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.adiantamentos_comissao (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id    UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  data           DATE NOT NULL DEFAULT CURRENT_DATE,
  valor          NUMERIC(15,2) NOT NULL DEFAULT 0,
  descricao      TEXT,
  status         TEXT NOT NULL DEFAULT 'pendente',
  repasse_id     UUID REFERENCES public.repasses_comissao(id),
  conta_pagar_id UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'adiantamentos_comissao_status_chk') THEN
    ALTER TABLE public.adiantamentos_comissao
      ADD CONSTRAINT adiantamentos_comissao_status_chk CHECK (status IN ('pendente','abatido','cancelado'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_adiant_company_status ON public.adiantamentos_comissao(company_id, status);
CREATE INDEX IF NOT EXISTS idx_adiant_employee       ON public.adiantamentos_comissao(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_adiant_repasse        ON public.adiantamentos_comissao(repasse_id);

ALTER TABLE public.adiantamentos_comissao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS adiant_select_company ON public.adiantamentos_comissao;
CREATE POLICY adiant_select_company ON public.adiantamentos_comissao FOR SELECT
  USING (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS adiant_select_self ON public.adiantamentos_comissao;
CREATE POLICY adiant_select_self ON public.adiantamentos_comissao FOR SELECT
  USING (public.is_meu_employee(employee_id));

DROP POLICY IF EXISTS adiant_insert_company ON public.adiantamentos_comissao;
CREATE POLICY adiant_insert_company ON public.adiantamentos_comissao FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS adiant_update_company ON public.adiantamentos_comissao;
CREATE POLICY adiant_update_company ON public.adiantamentos_comissao FOR UPDATE
  USING (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS adiant_delete_company ON public.adiantamentos_comissao;
CREATE POLICY adiant_delete_company ON public.adiantamentos_comissao FOR DELETE
  USING (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()));

-- =============================================================================
-- 5. RPC gerar_repasse_comissao(): consolida comissões + deduções e gera o CP
--    SECURITY INVOKER → respeita a RLS de quem chama (gestor da empresa).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.gerar_repasse_comissao(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_company_id    UUID := (p_payload->>'company_id')::UUID;
  v_employee_id   UUID := (p_payload->>'employee_id')::UUID;
  v_periodo_ini   DATE := (p_payload->>'periodo_inicio')::DATE;
  v_periodo_fim   DATE := (p_payload->>'periodo_fim')::DATE;
  v_deducoes      JSONB := COALESCE(p_payload->'deducoes', '[]'::jsonb);
  v_total_ded     NUMERIC := COALESCE((p_payload->>'total_deducoes')::NUMERIC, 0);
  v_gerar_cp      BOOLEAN := COALESCE((p_payload->>'gerar_cp')::BOOLEAN, true);
  v_conta_cont    UUID := NULLIF(p_payload->>'conta_contabil_id', '')::UUID;
  v_competencia   TEXT := NULLIF(p_payload->>'competencia', '');
  v_data_venc     DATE := COALESCE(NULLIF(p_payload->>'data_vencimento','')::DATE, CURRENT_DATE);
  v_created_by    UUID := NULLIF(p_payload->>'created_by', '')::UUID;
  v_obs           TEXT := NULLIF(p_payload->>'observacoes', '');
  v_comissao_ids  UUID[];
  v_adiant_ids    UUID[];
  v_bruto         NUMERIC := 0;
  v_liquido       NUMERIC;
  v_repasse_id    UUID;
  v_cp_id         UUID;
  v_emp_nome      TEXT;
  v_emp_cpf       TEXT;
  v_emp_company   UUID;
BEGIN
  SELECT ARRAY(SELECT (jsonb_array_elements_text(COALESCE(p_payload->'comissao_ids','[]'::jsonb)))::UUID)
    INTO v_comissao_ids;
  SELECT ARRAY(SELECT (jsonb_array_elements_text(COALESCE(p_payload->'adiantamento_ids','[]'::jsonb)))::UUID)
    INTO v_adiant_ids;

  IF v_company_id IS NULL OR v_employee_id IS NULL THEN
    RAISE EXCEPTION 'company_id e employee_id são obrigatórios.' USING ERRCODE = 'P0001';
  END IF;
  IF v_comissao_ids IS NULL OR array_length(v_comissao_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Nenhuma comissão selecionada para o repasse.' USING ERRCODE = 'P0001';
  END IF;

  -- Profissional (e validação de que pertence à empresa).
  SELECT COALESCE(nome_completo, name), cpf, company_id
    INTO v_emp_nome, v_emp_cpf, v_emp_company
    FROM public.employees WHERE id = v_employee_id;
  IF NOT FOUND OR v_emp_company <> v_company_id THEN
    RAISE EXCEPTION 'Profissional não encontrado nesta empresa.' USING ERRCODE = 'P0001';
  END IF;

  -- Revalida o bruto SÓ das comissões ainda elegíveis (pendente + sem repasse + do profissional).
  SELECT COALESCE(SUM(valor_comissao), 0) INTO v_bruto
    FROM public.comissoes
   WHERE id = ANY(v_comissao_ids)
     AND company_id = v_company_id
     AND employee_id = v_employee_id
     AND status = 'pendente'
     AND repasse_id IS NULL;

  IF v_bruto <= 0 THEN
    RAISE EXCEPTION 'As comissões selecionadas já foram repassadas ou não estão pendentes.' USING ERRCODE = 'P0001';
  END IF;

  v_liquido := ROUND(v_bruto - v_total_ded, 2);

  -- Cabeçalho do repasse.
  INSERT INTO public.repasses_comissao (
    company_id, employee_id, periodo_inicio, periodo_fim,
    valor_bruto, deducoes, total_deducoes, valor_liquido,
    status, observacoes, created_by
  ) VALUES (
    v_company_id, v_employee_id, v_periodo_ini, v_periodo_fim,
    v_bruto, v_deducoes, v_total_ded, v_liquido,
    'aberto', v_obs, v_created_by
  ) RETURNING id INTO v_repasse_id;

  -- Vincula as comissões elegíveis (mesma trava da revalidação → anti duplo-pagamento).
  UPDATE public.comissoes
     SET repasse_id = v_repasse_id
   WHERE id = ANY(v_comissao_ids)
     AND company_id = v_company_id
     AND employee_id = v_employee_id
     AND status = 'pendente'
     AND repasse_id IS NULL;

  -- Abate adiantamentos escolhidos.
  IF v_adiant_ids IS NOT NULL AND array_length(v_adiant_ids, 1) IS NOT NULL THEN
    UPDATE public.adiantamentos_comissao
       SET status = 'abatido', repasse_id = v_repasse_id
     WHERE id = ANY(v_adiant_ids)
       AND company_id = v_company_id
       AND employee_id = v_employee_id
       AND status = 'pendente';
  END IF;

  -- Gera o Contas a Pagar do líquido (nasce 'aberto' → sem movimentação até ser pago).
  IF v_gerar_cp AND v_liquido > 0 THEN
    INSERT INTO public.contas_pagar (
      company_id, credor_nome, credor_cpf_cnpj, descricao,
      valor, valor_pago, status, conta_contabil_id, competencia, data_vencimento
    ) VALUES (
      v_company_id, v_emp_nome, NULLIF(v_emp_cpf, ''),
      'Repasse comissão ' || to_char(v_periodo_ini,'DD/MM') || '–' || to_char(v_periodo_fim,'DD/MM/YYYY'),
      v_liquido, 0, 'aberto', v_conta_cont, v_competencia, v_data_venc
    ) RETURNING id INTO v_cp_id;

    UPDATE public.repasses_comissao SET conta_pagar_id = v_cp_id WHERE id = v_repasse_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'repasse_id', v_repasse_id,
    'conta_pagar_id', v_cp_id,
    'valor_bruto', v_bruto,
    'valor_liquido', v_liquido
  );
END;
$$;

-- =============================================================================
-- 6. RPC marcar_repasse_pago(): fecha um repasse pago "por fora" (sem CP)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.marcar_repasse_pago(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_repasse_id UUID := (p_payload->>'repasse_id')::UUID;
  v_data       DATE := COALESCE(NULLIF(p_payload->>'data_pagamento','')::DATE, CURRENT_DATE);
  v_forma      TEXT := NULLIF(p_payload->>'forma_pagamento', '');
BEGIN
  UPDATE public.repasses_comissao
     SET status = 'pago', data_pagamento = v_data, forma_pagamento = v_forma
   WHERE id = v_repasse_id AND status <> 'cancelado';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Repasse % não encontrado.', v_repasse_id USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.comissoes SET status = 'pago' WHERE repasse_id = v_repasse_id;

  RETURN jsonb_build_object('success', true, 'repasse_id', v_repasse_id);
END;
$$;

-- =============================================================================
-- 7. Trigger sync_repasse_on_cp_pago: pagar o CP fecha repasse + comissões
--    Pagar o CP no Contas a Pagar (fluxo existente, que já gera a saída bancária
--    via garantir_mov_ao_quitar_cp) é a única ação que fecha tudo.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.sync_repasse_on_cp_pago()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_repasse_id UUID;
BEGIN
  IF NEW.status = 'pago' AND COALESCE(OLD.status, '') <> 'pago' THEN
    SELECT id INTO v_repasse_id
      FROM public.repasses_comissao
     WHERE conta_pagar_id = NEW.id AND status <> 'pago'
     LIMIT 1;

    IF v_repasse_id IS NOT NULL THEN
      UPDATE public.repasses_comissao
         SET status = 'pago',
             data_pagamento = COALESCE(NEW.data_pagamento, CURRENT_DATE)
       WHERE id = v_repasse_id;

      UPDATE public.comissoes SET status = 'pago' WHERE repasse_id = v_repasse_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_repasse_on_cp_pago ON public.contas_pagar;
CREATE TRIGGER trg_sync_repasse_on_cp_pago
  AFTER UPDATE OF status ON public.contas_pagar
  FOR EACH ROW EXECUTE FUNCTION public.sync_repasse_on_cp_pago();

-- -----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.gerar_repasse_comissao(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_repasse_pago(JSONB) TO authenticated;
