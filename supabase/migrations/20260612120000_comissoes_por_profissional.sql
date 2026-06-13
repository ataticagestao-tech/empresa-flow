-- =============================================================================
-- Sistema de Comissão por Profissional
-- =============================================================================
-- 1. Config de comissão no produto/serviço (products)
-- 2. Quem executou cada item da venda (vendas_itens.produto_id / profissional_id)
-- 3. Vínculo funcionário ↔ serviço (com override de %) — funcionario_servicos
-- 4. Ledger de comissões geradas por venda — comissoes
-- 5. Login do profissional (employees.user_id) + policies de auto-acesso
-- 6. Helper resolver_comissao() + RPCs criar/atualizar venda gerando comissão
--
-- Idempotente: pode ser re-rodado no SQL Editor sem erro.
-- APLICADO: (preencher YYYY-MM-DD após rodar no Supabase SQL Editor)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. products: config de comissão padrão do serviço
-- -----------------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS comissiona BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS comissao_tipo TEXT NOT NULL DEFAULT 'percentual',
  ADD COLUMN IF NOT EXISTS comissao_valor NUMERIC(15,4) NOT NULL DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_comissao_tipo_chk') THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_comissao_tipo_chk CHECK (comissao_tipo IN ('percentual','valor'));
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. vendas_itens: produto e profissional que executou
-- -----------------------------------------------------------------------------
ALTER TABLE public.vendas_itens
  ADD COLUMN IF NOT EXISTS produto_id UUID REFERENCES public.products(id),
  ADD COLUMN IF NOT EXISTS profissional_id UUID REFERENCES public.employees(id);

CREATE INDEX IF NOT EXISTS idx_vendas_itens_profissional ON public.vendas_itens(profissional_id);

-- -----------------------------------------------------------------------------
-- 3. employees.user_id: liga o cadastro ao login do profissional no Auth
-- -----------------------------------------------------------------------------
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_user_id
  ON public.employees(user_id) WHERE user_id IS NOT NULL;

-- Auto-acesso: o profissional logado enxerga a própria linha de funcionário.
DROP POLICY IF EXISTS employees_select_self ON public.employees;
CREATE POLICY employees_select_self ON public.employees FOR SELECT
  USING (user_id = auth.uid());

-- Auto-acesso: o profissional enxerga SÓ a própria empresa (cabeçalho de relatório).
-- IMPORTANTE: usa função SECURITY DEFINER pra ler employees SEM disparar a RLS
-- de employees (que lê user_companies, que referencia companies) — senão a policy
-- cria RECURSÃO INFINITA em companies e quebra o carregamento de empresas.
CREATE OR REPLACE FUNCTION public.minhas_empresas_funcionario()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT company_id FROM public.employees WHERE user_id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.minhas_empresas_funcionario() TO authenticated;

DROP POLICY IF EXISTS companies_select_self_prof ON public.companies;
CREATE POLICY companies_select_self_prof ON public.companies FOR SELECT
  USING (id IN (SELECT public.minhas_empresas_funcionario()));

-- -----------------------------------------------------------------------------
-- 4. funcionario_servicos: quais serviços cada funcionário atende (+ override %)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.funcionario_servicos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id   UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  comissao_tipo  TEXT,                 -- NULL = usa o tipo padrão do produto
  comissao_valor NUMERIC(15,4),        -- NULL = usa o valor padrão do produto
  ativo         BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, product_id)
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'funcionario_servicos_tipo_chk') THEN
    ALTER TABLE public.funcionario_servicos
      ADD CONSTRAINT funcionario_servicos_tipo_chk
      CHECK (comissao_tipo IS NULL OR comissao_tipo IN ('percentual','valor'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_func_servicos_company  ON public.funcionario_servicos(company_id);
CREATE INDEX IF NOT EXISTS idx_func_servicos_employee ON public.funcionario_servicos(employee_id);
CREATE INDEX IF NOT EXISTS idx_func_servicos_product  ON public.funcionario_servicos(product_id);

ALTER TABLE public.funcionario_servicos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS funcionario_servicos_select ON public.funcionario_servicos;
CREATE POLICY funcionario_servicos_select ON public.funcionario_servicos FOR SELECT
  USING (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS funcionario_servicos_insert ON public.funcionario_servicos;
CREATE POLICY funcionario_servicos_insert ON public.funcionario_servicos FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS funcionario_servicos_update ON public.funcionario_servicos;
CREATE POLICY funcionario_servicos_update ON public.funcionario_servicos FOR UPDATE
  USING (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS funcionario_servicos_delete ON public.funcionario_servicos;
CREATE POLICY funcionario_servicos_delete ON public.funcionario_servicos FOR DELETE
  USING (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- 5. comissoes: ledger — uma linha por item comissionável
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comissoes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id         UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  venda_id            UUID REFERENCES public.vendas(id) ON DELETE CASCADE,
  venda_item_id       UUID,
  produto_id          UUID REFERENCES public.products(id),
  descricao           TEXT,
  cliente_nome        TEXT,
  data_venda          DATE NOT NULL,
  base_valor          NUMERIC(15,2) NOT NULL DEFAULT 0,
  comissao_tipo       TEXT,
  comissao_percentual NUMERIC(7,4),
  comissao_valor_unit NUMERIC(15,4),
  valor_comissao      NUMERIC(15,2) NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'pendente',
  conta_pagar_id      UUID,            -- gancho p/ repasse futuro (Conta a Pagar)
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comissoes_status_chk') THEN
    ALTER TABLE public.comissoes
      ADD CONSTRAINT comissoes_status_chk CHECK (status IN ('pendente','pago','cancelado'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_comissoes_company_data  ON public.comissoes(company_id, data_venda);
CREATE INDEX IF NOT EXISTS idx_comissoes_employee_data ON public.comissoes(employee_id, data_venda);
CREATE INDEX IF NOT EXISTS idx_comissoes_venda         ON public.comissoes(venda_id);

ALTER TABLE public.comissoes ENABLE ROW LEVEL SECURITY;

-- Helper SECURITY DEFINER: evita recursão de RLS ao checar a própria linha de
-- employees a partir da policy de comissoes.
CREATE OR REPLACE FUNCTION public.is_meu_employee(p_employee_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = p_employee_id AND user_id = auth.uid()
  );
$$;

-- Gestor (membro da empresa) vê tudo da empresa.
DROP POLICY IF EXISTS comissoes_select_company ON public.comissoes;
CREATE POLICY comissoes_select_company ON public.comissoes FOR SELECT
  USING (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()));

-- Profissional (fora de user_companies) vê só as comissões dele.
DROP POLICY IF EXISTS comissoes_select_self ON public.comissoes;
CREATE POLICY comissoes_select_self ON public.comissoes FOR SELECT
  USING (public.is_meu_employee(employee_id));

DROP POLICY IF EXISTS comissoes_insert_company ON public.comissoes;
CREATE POLICY comissoes_insert_company ON public.comissoes FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS comissoes_update_company ON public.comissoes;
CREATE POLICY comissoes_update_company ON public.comissoes FOR UPDATE
  USING (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS comissoes_delete_company ON public.comissoes;
CREATE POLICY comissoes_delete_company ON public.comissoes FOR DELETE
  USING (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- 6. resolver_comissao(): regra única usada pelos RPCs de venda
--    Override do funcionário (funcionario_servicos) vence o padrão do produto.
--    Sem produto comissionável ou sem profissional → valor 0.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolver_comissao(
  p_product_id  UUID,
  p_employee_id UUID,
  p_base_valor  NUMERIC,
  p_quantidade  NUMERIC
)
RETURNS TABLE (tipo TEXT, percentual NUMERIC, valor_unit NUMERIC, valor_comissao NUMERIC)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_comissiona BOOLEAN;
  v_company    UUID;
  v_desc       TEXT;
  v_eff_id     UUID;
  v_prod_tipo  TEXT;
  v_prod_valor NUMERIC;
  v_fs_tipo    TEXT;
  v_fs_valor   NUMERIC;
  v_tipo       TEXT;
  v_valor      NUMERIC;
BEGIN
  IF p_product_id IS NULL OR p_employee_id IS NULL THEN
    RETURN QUERY SELECT NULL::TEXT, NULL::NUMERIC, NULL::NUMERIC, 0::NUMERIC; RETURN;
  END IF;

  SELECT comissiona, comissao_tipo, comissao_valor, company_id, description
    INTO v_comissiona, v_prod_tipo, v_prod_valor, v_company, v_desc
    FROM public.products WHERE id = p_product_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::TEXT, NULL::NUMERIC, NULL::NUMERIC, 0::NUMERIC; RETURN;
  END IF;

  v_eff_id := p_product_id;

  -- Robustez a DUPLICADOS: se o produto vendido não comissiona, usa a cópia de
  -- mesmo nome (mesma empresa) que comissione.
  IF NOT COALESCE(v_comissiona, false) THEN
    SELECT id, comissao_tipo, comissao_valor
      INTO v_eff_id, v_prod_tipo, v_prod_valor
      FROM public.products
      WHERE company_id = v_company AND comissiona = true
        AND lower(trim(description)) = lower(trim(v_desc))
      ORDER BY is_active DESC
      LIMIT 1;
    IF NOT FOUND THEN
      RETURN QUERY SELECT NULL::TEXT, NULL::NUMERIC, NULL::NUMERIC, 0::NUMERIC; RETURN;
    END IF;
  END IF;

  -- Override por funcionário (no produto efetivo).
  SELECT comissao_tipo, comissao_valor INTO v_fs_tipo, v_fs_valor
    FROM public.funcionario_servicos
    WHERE employee_id = p_employee_id AND product_id = v_eff_id AND ativo = true;

  IF v_fs_valor IS NOT NULL THEN
    v_tipo  := COALESCE(v_fs_tipo, v_prod_tipo);
    v_valor := v_fs_valor;
  ELSE
    v_tipo  := v_prod_tipo;
    v_valor := v_prod_valor;
  END IF;

  IF v_tipo = 'valor' THEN
    RETURN QUERY SELECT 'valor'::TEXT, NULL::NUMERIC, v_valor,
                        ROUND(v_valor * COALESCE(p_quantidade, 1), 2);
  ELSE
    RETURN QUERY SELECT 'percentual'::TEXT, v_valor, NULL::NUMERIC,
                        ROUND(COALESCE(p_base_valor, 0) * v_valor / 100.0, 2);
  END IF;
END;
$$;

-- Helper: gera a linha de comissão de um item (chamado pelos dois RPCs).
CREATE OR REPLACE FUNCTION public.gerar_comissao_item(
  p_company_id   UUID,
  p_venda_id     UUID,
  p_venda_item_id UUID,
  p_item         JSONB,
  p_data_venda   DATE,
  p_cliente_nome TEXT
)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_prof UUID := NULLIF(p_item->>'profissional_id', '')::UUID;
  v_prod UUID := NULLIF(p_item->>'produto_id', '')::UUID;
  v_qtd  NUMERIC := COALESCE((p_item->>'quantidade')::NUMERIC, 1);
  v_base NUMERIC := COALESCE((p_item->>'quantidade')::NUMERIC, 1)
                    * COALESCE((p_item->>'valor_unitario')::NUMERIC, 0);
  v_com RECORD;
BEGIN
  IF v_prof IS NULL OR v_prod IS NULL THEN RETURN; END IF;

  SELECT * INTO v_com FROM public.resolver_comissao(v_prod, v_prof, v_base, v_qtd);

  IF v_com.valor_comissao IS NULL OR v_com.valor_comissao <= 0 THEN RETURN; END IF;

  INSERT INTO public.comissoes (
    company_id, employee_id, venda_id, venda_item_id, produto_id, descricao,
    cliente_nome, data_venda, base_valor, comissao_tipo, comissao_percentual,
    comissao_valor_unit, valor_comissao, status
  ) VALUES (
    p_company_id, v_prof, p_venda_id, p_venda_item_id, v_prod, p_item->>'descricao',
    p_cliente_nome, p_data_venda, v_base, v_com.tipo, v_com.percentual,
    v_com.valor_unit, v_com.valor_comissao, 'pendente'
  );
END;
$$;

-- =============================================================================
-- 7. RPCs criar_venda_atomica / atualizar_venda_atomica
--    Recriados para: gravar produto_id/profissional_id no item + gerar comissão.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.criar_venda_atomica(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_venda_obj JSONB := p_payload->'venda';
  v_itens JSONB := COALESCE(p_payload->'itens', '[]'::jsonb);
  v_crs JSONB := COALESCE(p_payload->'crs', '[]'::jsonb);
  v_company_id UUID := (v_venda_obj->>'company_id')::UUID;
  v_venda_id UUID;
  v_cr_ids UUID[] := '{}';
  v_cr_id UUID;
  v_item JSONB;
  v_cr JSONB;
  v_mov_valor NUMERIC;
  v_item_id UUID;
  v_qtd NUMERIC;
  v_base NUMERIC;
  v_com RECORD;
BEGIN
  -- 1. INSERT venda
  INSERT INTO public.vendas (
    company_id, cliente_nome, cliente_cpf_cnpj, tipo, valor_total, desconto,
    data_venda, forma_pagamento, parcelas, status, observacoes,
    consultora, procedimento, reserva_valor, reserva_data,
    previsao_cirurgia, data_contrato
  ) VALUES (
    v_company_id,
    v_venda_obj->>'cliente_nome',
    NULLIF(v_venda_obj->>'cliente_cpf_cnpj', ''),
    COALESCE(v_venda_obj->>'tipo', 'servico'),
    (v_venda_obj->>'valor_total')::NUMERIC,
    COALESCE((v_venda_obj->>'desconto')::NUMERIC, 0),
    (v_venda_obj->>'data_venda')::DATE,
    NULLIF(v_venda_obj->>'forma_pagamento', ''),
    COALESCE((v_venda_obj->>'parcelas')::INT, 1),
    COALESCE(v_venda_obj->>'status', 'confirmado'),
    NULLIF(v_venda_obj->>'observacoes', ''),
    NULLIF(v_venda_obj->>'consultora', ''),
    NULLIF(v_venda_obj->>'procedimento', ''),
    NULLIF(v_venda_obj->>'reserva_valor', '')::NUMERIC,
    NULLIF(v_venda_obj->>'reserva_data', '')::DATE,
    NULLIF(v_venda_obj->>'previsao_cirurgia', '')::DATE,
    NULLIF(v_venda_obj->>'data_contrato', '')::DATE
  )
  RETURNING id INTO v_venda_id;

  -- 2. INSERT itens (+ comissão por item)
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_itens)
  LOOP
    INSERT INTO public.vendas_itens (
      venda_id, descricao, quantidade, valor_unitario, produto_id, profissional_id
    ) VALUES (
      v_venda_id,
      v_item->>'descricao',
      COALESCE((v_item->>'quantidade')::NUMERIC, 1),
      COALESCE((v_item->>'valor_unitario')::NUMERIC, 0),
      NULLIF(v_item->>'produto_id', '')::UUID,
      NULLIF(v_item->>'profissional_id', '')::UUID
    )
    RETURNING id INTO v_item_id;

    PERFORM public.gerar_comissao_item(
      v_company_id, v_venda_id, v_item_id, v_item,
      (v_venda_obj->>'data_venda')::DATE, v_venda_obj->>'cliente_nome'
    );
  END LOOP;

  -- 3. INSERT CRs + movimentações (quando _gerar_mov=true)
  FOR v_cr IN SELECT * FROM jsonb_array_elements(v_crs)
  LOOP
    INSERT INTO public.contas_receber (
      company_id, pagador_nome, pagador_cpf_cnpj,
      valor, valor_pago,
      data_vencimento, data_pagamento,
      status, forma_recebimento,
      conta_bancaria_id, conta_contabil_id, centro_custo_id,
      venda_id, observacoes
    ) VALUES (
      v_company_id,
      v_cr->>'pagador_nome',
      NULLIF(v_cr->>'pagador_cpf_cnpj', ''),
      (v_cr->>'valor')::NUMERIC,
      COALESCE((v_cr->>'valor_pago')::NUMERIC, 0),
      (v_cr->>'data_vencimento')::DATE,
      NULLIF(v_cr->>'data_pagamento', '')::DATE,
      COALESCE(v_cr->>'status', 'aberto'),
      NULLIF(v_cr->>'forma_recebimento', ''),
      NULLIF(v_cr->>'conta_bancaria_id', '')::UUID,
      NULLIF(v_cr->>'conta_contabil_id', '')::UUID,
      NULLIF(v_cr->>'centro_custo_id', '')::UUID,
      v_venda_id,
      NULLIF(v_cr->>'observacoes', '')
    )
    RETURNING id INTO v_cr_id;

    v_cr_ids := array_append(v_cr_ids, v_cr_id);

    IF COALESCE((v_cr->>'_gerar_mov')::BOOLEAN, false)
       AND (v_cr->>'conta_bancaria_id') IS NOT NULL
       AND (v_cr->>'conta_bancaria_id') <> '' THEN

      v_mov_valor := COALESCE(
        NULLIF(v_cr->>'_mov_valor', '')::NUMERIC,
        (v_cr->>'valor')::NUMERIC
      );

      PERFORM set_config('app.skip_mov_garantia', 'true', true);
      INSERT INTO public.movimentacoes (
        company_id, conta_bancaria_id, conta_contabil_id,
        conta_receber_id, tipo, valor, data, descricao, origem
      ) VALUES (
        v_company_id,
        (v_cr->>'conta_bancaria_id')::UUID,
        NULLIF(v_cr->>'conta_contabil_id', '')::UUID,
        v_cr_id,
        'credito',
        v_mov_valor,
        COALESCE(NULLIF(v_cr->>'data_pagamento', '')::DATE, CURRENT_DATE),
        'Recebimento — ' || (v_cr->>'pagador_nome'),
        'conta_receber'
      );
      PERFORM set_config('app.skip_mov_garantia', 'false', true);
    END IF;
  END LOOP;

  -- 4. Validação final: garante que toda venda confirmada tem ≥1 CR
  IF v_venda_obj->>'status' <> 'cancelado'
     AND array_length(v_cr_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Venda criada sem nenhum CR. Toda venda confirmada deve ter ao menos 1 conta a receber.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'venda_id', v_venda_id,
    'cr_ids', to_jsonb(v_cr_ids)
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.atualizar_venda_atomica(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_venda_obj JSONB := p_payload->'venda';
  v_itens JSONB := COALESCE(p_payload->'itens', '[]'::jsonb);
  v_crs JSONB := COALESCE(p_payload->'crs', '[]'::jsonb);
  v_venda_id UUID := (p_payload->>'venda_id')::UUID;
  v_user_id UUID := NULLIF(p_payload->>'user_id', '')::UUID;
  v_company_id UUID := (v_venda_obj->>'company_id')::UUID;
  v_cr_ids UUID[] := '{}';
  v_cr_id UUID;
  v_item JSONB;
  v_cr JSONB;
  v_mov_valor NUMERIC;
  v_now TIMESTAMPTZ := now();
  v_item_id UUID;
BEGIN
  -- 1. UPDATE venda
  UPDATE public.vendas SET
    cliente_nome = v_venda_obj->>'cliente_nome',
    cliente_cpf_cnpj = NULLIF(v_venda_obj->>'cliente_cpf_cnpj', ''),
    tipo = COALESCE(v_venda_obj->>'tipo', tipo),
    valor_total = (v_venda_obj->>'valor_total')::NUMERIC,
    desconto = COALESCE((v_venda_obj->>'desconto')::NUMERIC, 0),
    data_venda = (v_venda_obj->>'data_venda')::DATE,
    forma_pagamento = NULLIF(v_venda_obj->>'forma_pagamento', ''),
    parcelas = COALESCE((v_venda_obj->>'parcelas')::INT, parcelas),
    observacoes = NULLIF(v_venda_obj->>'observacoes', ''),
    updated_at = v_now
  WHERE id = v_venda_id AND company_id = v_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venda % não encontrada ou empresa incorreta.', v_venda_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. Soft-delete CRs antigos da venda
  UPDATE public.contas_receber
     SET deleted_at = v_now, deleted_by = v_user_id
   WHERE venda_id = v_venda_id AND deleted_at IS NULL;

  -- 3. DELETE itens e comissões antigas (serão recriados)
  DELETE FROM public.comissoes WHERE venda_id = v_venda_id;
  DELETE FROM public.vendas_itens WHERE venda_id = v_venda_id;

  -- 4. INSERT itens novos (+ comissão por item)
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_itens)
  LOOP
    INSERT INTO public.vendas_itens (
      venda_id, descricao, quantidade, valor_unitario, produto_id, profissional_id
    ) VALUES (
      v_venda_id,
      v_item->>'descricao',
      COALESCE((v_item->>'quantidade')::NUMERIC, 1),
      COALESCE((v_item->>'valor_unitario')::NUMERIC, 0),
      NULLIF(v_item->>'produto_id', '')::UUID,
      NULLIF(v_item->>'profissional_id', '')::UUID
    )
    RETURNING id INTO v_item_id;

    PERFORM public.gerar_comissao_item(
      v_company_id, v_venda_id, v_item_id, v_item,
      (v_venda_obj->>'data_venda')::DATE, v_venda_obj->>'cliente_nome'
    );
  END LOOP;

  -- 5. INSERT CRs novos + movs (mesma lógica do criar_venda_atomica)
  FOR v_cr IN SELECT * FROM jsonb_array_elements(v_crs)
  LOOP
    INSERT INTO public.contas_receber (
      company_id, pagador_nome, pagador_cpf_cnpj,
      valor, valor_pago,
      data_vencimento, data_pagamento,
      status, forma_recebimento,
      conta_bancaria_id, conta_contabil_id, centro_custo_id,
      venda_id, observacoes
    ) VALUES (
      v_company_id,
      v_cr->>'pagador_nome',
      NULLIF(v_cr->>'pagador_cpf_cnpj', ''),
      (v_cr->>'valor')::NUMERIC,
      COALESCE((v_cr->>'valor_pago')::NUMERIC, 0),
      (v_cr->>'data_vencimento')::DATE,
      NULLIF(v_cr->>'data_pagamento', '')::DATE,
      COALESCE(v_cr->>'status', 'aberto'),
      NULLIF(v_cr->>'forma_recebimento', ''),
      NULLIF(v_cr->>'conta_bancaria_id', '')::UUID,
      NULLIF(v_cr->>'conta_contabil_id', '')::UUID,
      NULLIF(v_cr->>'centro_custo_id', '')::UUID,
      v_venda_id,
      NULLIF(v_cr->>'observacoes', '')
    )
    RETURNING id INTO v_cr_id;

    v_cr_ids := array_append(v_cr_ids, v_cr_id);

    IF COALESCE((v_cr->>'_gerar_mov')::BOOLEAN, false)
       AND (v_cr->>'conta_bancaria_id') IS NOT NULL
       AND (v_cr->>'conta_bancaria_id') <> '' THEN

      v_mov_valor := COALESCE(
        NULLIF(v_cr->>'_mov_valor', '')::NUMERIC,
        (v_cr->>'valor')::NUMERIC
      );

      PERFORM set_config('app.skip_mov_garantia', 'true', true);
      INSERT INTO public.movimentacoes (
        company_id, conta_bancaria_id, conta_contabil_id,
        conta_receber_id, tipo, valor, data, descricao, origem
      ) VALUES (
        v_company_id,
        (v_cr->>'conta_bancaria_id')::UUID,
        NULLIF(v_cr->>'conta_contabil_id', '')::UUID,
        v_cr_id,
        'credito',
        v_mov_valor,
        COALESCE(NULLIF(v_cr->>'data_pagamento', '')::DATE, CURRENT_DATE),
        'Recebimento — ' || (v_cr->>'pagador_nome'),
        'conta_receber'
      );
      PERFORM set_config('app.skip_mov_garantia', 'false', true);
    END IF;
  END LOOP;

  -- 6. Validação final
  IF v_venda_obj->>'status' <> 'cancelado'
     AND array_length(v_cr_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Venda editada sem nenhum CR. Toda venda confirmada deve ter ao menos 1 conta a receber.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'venda_id', v_venda_id,
    'cr_ids', to_jsonb(v_cr_ids)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.criar_venda_atomica(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.atualizar_venda_atomica(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolver_comissao(UUID, UUID, NUMERIC, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gerar_comissao_item(UUID, UUID, UUID, JSONB, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_meu_employee(UUID) TO authenticated;
