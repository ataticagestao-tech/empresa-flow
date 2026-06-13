-- ============================================================
-- AGENTE TATICA — lancar_cp agora grava codigo_barras e file_url (anexo)
-- Quando o empresario manda um boleto pelo WhatsApp, a CP precisa nascer
-- com o codigo de barras (linha digitavel) e com o PDF/foto anexado,
-- igual ao lancamento manual pela tela de Contas a Pagar.
-- A versao anterior ignorava os dois campos.
--
-- IMPORTANTE: a versao em producao foi alterada a mao pra aceitar p_credor_tipo
-- (a edge function agente-tool-lancar_cp ja passa esse parametro), mas essa
-- mudanca nunca virou migration. Por isso aqui derrubamos TODAS as sobrecargas
-- de agente_lancar_cp (independente da assinatura) e recriamos UMA versao
-- canonica que inclui p_credor_tipo + os dois campos novos. Assim o estado
-- fica deterministico, sem sobrecargas ambiguas.
-- ============================================================

-- Derruba qualquer versao existente (9 args, 10 args com p_credor_tipo, etc.)
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT oid::regprocedure AS sig
        FROM pg_proc
        WHERE proname = 'agente_lancar_cp'
          AND pronamespace = 'public'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig || ' CASCADE';
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.agente_lancar_cp(
    p_company_id uuid,
    p_credor_id uuid,
    p_credor_nome text,
    p_descricao text,
    p_valor numeric,
    p_data_vencimento date,
    p_categoria_id uuid,
    p_centro_custo_id uuid DEFAULT NULL,
    p_observacao text DEFAULT NULL,
    p_credor_tipo text DEFAULT NULL,
    p_codigo_barras text DEFAULT NULL,
    p_file_url text DEFAULT NULL
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
    v_credor_tipo text;
BEGIN
    -- Se categoria veio null, tenta fallback "Despesas Diversas"
    v_categoria := p_categoria_id;
    IF v_categoria IS NULL THEN
        v_categoria := public.agente_categoria_fallback(p_company_id);
    END IF;

    -- Preserva o tipo do credor vindo da tool (fornecedor/funcionario/socio/outro);
    -- se nao veio, deduz pelo credor_id como a versao original fazia.
    v_credor_tipo := COALESCE(
        NULLIF(btrim(COALESCE(p_credor_tipo, '')), ''),
        CASE WHEN p_credor_id IS NOT NULL THEN 'fornecedor' ELSE 'outro' END
    );

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
        codigo_barras,
        file_url,
        created_at
    )
    VALUES (
        p_company_id,
        v_credor_tipo,
        p_credor_id,
        p_credor_nome,
        p_descricao,
        p_valor,
        p_data_vencimento,
        'aberto',
        v_categoria,
        p_centro_custo_id,
        p_observacao,
        -- string vazia vira NULL pra nao sujar a coluna nem confundir o trigger de unicidade
        NULLIF(btrim(COALESCE(p_codigo_barras, '')), ''),
        NULLIF(btrim(COALESCE(p_file_url, '')), ''),
        now()
    )
    RETURNING contas_pagar.id INTO v_id;

    RETURN QUERY
    SELECT cp.id, cp.valor, cp.data_vencimento, cp.status::text
    FROM public.contas_pagar cp WHERE cp.id = v_id;
END;
$$;
