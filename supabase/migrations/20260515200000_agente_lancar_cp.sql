-- ============================================================
-- AGENTE TATICA — Tools de cadastro/listagem + lancar CP
-- 5 funções SQL pra suportar fluxo conversacional de lançamento
-- de contas a pagar via WhatsApp.
-- ============================================================

-- ── 1. Busca fornecedor por nome ou CPF/CNPJ (busca fuzzy) ──
CREATE OR REPLACE FUNCTION public.agente_buscar_fornecedor(
    p_company_id uuid,
    p_termo text
)
RETURNS TABLE(
    id uuid,
    razao_social text,
    nome_fantasia text,
    cpf_cnpj text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.razao_social, s.nome_fantasia, s.cpf_cnpj
  FROM public.suppliers s
  WHERE s.company_id = p_company_id
    AND (
      s.razao_social ILIKE '%' || p_termo || '%'
      OR s.nome_fantasia ILIKE '%' || p_termo || '%'
      OR regexp_replace(COALESCE(s.cpf_cnpj, ''), '\D', '', 'g') LIKE '%' || regexp_replace(p_termo, '\D', '', 'g') || '%'
    )
  ORDER BY
    CASE WHEN s.razao_social ILIKE p_termo || '%' THEN 0 ELSE 1 END,
    s.razao_social
  LIMIT 10;
$$;

-- ── 2. Cria fornecedor mínimo (só nome + cpf/cnpj) ──
CREATE OR REPLACE FUNCTION public.agente_criar_fornecedor(
    p_company_id uuid,
    p_razao_social text,
    p_cpf_cnpj text,
    p_nome_fantasia text DEFAULT NULL
)
RETURNS TABLE(id uuid, razao_social text, cpf_cnpj text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
    v_cpf_clean text;
BEGIN
    v_cpf_clean := regexp_replace(COALESCE(p_cpf_cnpj, ''), '\D', '', 'g');

    -- Tenta achar por cpf/cnpj antes de criar (evita duplicar)
    SELECT s.id INTO v_id
    FROM public.suppliers s
    WHERE s.company_id = p_company_id
      AND regexp_replace(COALESCE(s.cpf_cnpj, ''), '\D', '', 'g') = v_cpf_clean
      AND v_cpf_clean <> ''
    LIMIT 1;

    IF v_id IS NOT NULL THEN
        RETURN QUERY
        SELECT s.id, s.razao_social, s.cpf_cnpj
        FROM public.suppliers s WHERE s.id = v_id;
        RETURN;
    END IF;

    INSERT INTO public.suppliers (company_id, razao_social, nome_fantasia, cpf_cnpj, created_at)
    VALUES (
        p_company_id,
        p_razao_social,
        COALESCE(p_nome_fantasia, p_razao_social),
        p_cpf_cnpj,
        now()
    )
    RETURNING suppliers.id INTO v_id;

    RETURN QUERY
    SELECT s.id, s.razao_social, s.cpf_cnpj
    FROM public.suppliers s WHERE s.id = v_id;
END;
$$;

-- ── 3. Lista contas bancárias ativas ──
CREATE OR REPLACE FUNCTION public.agente_listar_contas_bancarias(
    p_company_id uuid
)
RETURNS TABLE(
    id uuid,
    nome text,
    tipo text,
    banco text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ba.id, ba.name, ba.type::text, ba.banco
  FROM public.bank_accounts ba
  WHERE ba.company_id = p_company_id
    AND ba.is_active = true
  ORDER BY ba.type, ba.name;
$$;

-- ── 4. Lista categorias (com fallback "Despesas Diversas") ──
CREATE OR REPLACE FUNCTION public.agente_listar_categorias(
    p_company_id uuid,
    p_tipo text DEFAULT 'despesa',
    p_termo text DEFAULT NULL
)
RETURNS TABLE(
    id uuid,
    code text,
    name text,
    account_type text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    coa.id,
    coa.code,
    coa.name,
    coa.account_type::text
  FROM public.chart_of_accounts coa
  WHERE coa.company_id = p_company_id
    AND COALESCE(coa.status::text, 'ativa') = 'ativa'
    AND COALESCE(coa.is_analytical, true) = true
    AND coa.account_type::text = LOWER(p_tipo)
    AND (
      p_termo IS NULL
      OR coa.name ILIKE '%' || p_termo || '%'
      OR coa.code LIKE p_termo || '%'
    )
  ORDER BY
    CASE WHEN p_termo IS NOT NULL AND coa.name ILIKE p_termo || '%' THEN 0 ELSE 1 END,
    coa.code
  LIMIT 15;
$$;

-- ── 5. Helper: encontra ou cria categoria genérica "Despesas Diversas" ──
CREATE OR REPLACE FUNCTION public.agente_categoria_fallback(p_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
BEGIN
    -- Procura por categorias com nomes similares a "Despesas Diversas" / "Outras Despesas"
    SELECT id INTO v_id
    FROM public.chart_of_accounts
    WHERE company_id = p_company_id
      AND account_type::text = 'despesa'
      AND COALESCE(status::text, 'ativa') = 'ativa'
      AND COALESCE(is_analytical, true) = true
      AND (
        name ILIKE '%despesas diversas%'
        OR name ILIKE '%outras despesas%'
        OR name ILIKE '%despesas gerais%'
        OR name ILIKE '%diversas%'
      )
    ORDER BY
      CASE
        WHEN name ILIKE 'despesas diversas%' THEN 0
        WHEN name ILIKE 'outras despesas%' THEN 1
        ELSE 2
      END
    LIMIT 1;

    RETURN v_id;  -- pode retornar null se não achar nenhuma
END;
$$;

-- ── 6. Lança CP em aberto ──
CREATE OR REPLACE FUNCTION public.agente_lancar_cp(
    p_company_id uuid,
    p_credor_id uuid,
    p_credor_nome text,
    p_descricao text,
    p_valor numeric,
    p_data_vencimento date,
    p_categoria_id uuid,
    p_centro_custo_id uuid DEFAULT NULL,
    p_observacao text DEFAULT NULL
)
RETURNS TABLE(
    id uuid,
    valor numeric,
    data_vencimento date,
    status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
    v_categoria uuid;
BEGIN
    -- Se categoria veio null, tenta fallback "Despesas Diversas"
    v_categoria := p_categoria_id;
    IF v_categoria IS NULL THEN
        v_categoria := public.agente_categoria_fallback(p_company_id);
    END IF;

    INSERT INTO public.contas_pagar (
        company_id,
        credor_tipo,
        credor_id,
        credor_nome,
        descricao,
        valor,
        data_vencimento,
        status,
        conta_contabil_id,
        centro_custo_id,
        observacao,
        created_at
    )
    VALUES (
        p_company_id,
        CASE WHEN p_credor_id IS NOT NULL THEN 'fornecedor' ELSE 'outro' END,
        p_credor_id,
        p_credor_nome,
        p_descricao,
        p_valor,
        p_data_vencimento,
        'aberto',
        v_categoria,
        p_centro_custo_id,
        p_observacao,
        now()
    )
    RETURNING contas_pagar.id INTO v_id;

    RETURN QUERY
    SELECT cp.id, cp.valor, cp.data_vencimento, cp.status::text
    FROM public.contas_pagar cp WHERE cp.id = v_id;
END;
$$;
