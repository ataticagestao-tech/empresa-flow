-- ============================================================
-- DEDUP FORNECEDORES — preview + apply
-- Identifica fornecedores duplicados dentro da mesma empresa,
-- elege o mais completo como "vencedor" e remove os "perdedores"
-- (reatribuindo FKs em contas_pagar/accounts_payable/products/
--  ordens_compra/entradas_estoque/importacao_xml antes do delete).
--
-- Critério de grupo (por company_id):
--   1) cpf_cnpj limpo (só dígitos), quando preenchido
--   2) senão, LOWER(TRIM(unaccent(razao_social)))
--
-- Pontuação de completude:
--   conta 1 ponto pra cada campo textual não vazio
--   (cpf_cnpj, nome_fantasia, inscricao_estadual, email, telefone,
--    celular, endereco_cep, endereco_logradouro, endereco_numero,
--    endereco_bairro, endereco_cidade, endereco_estado,
--    dados_bancarios_banco, dados_bancarios_agencia,
--    dados_bancarios_conta, dados_bancarios_pix, observacoes)
--
-- Desempate: updated_at DESC, created_at ASC, id ASC.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS unaccent;

-- ── Helper: score de completude ──
CREATE OR REPLACE FUNCTION public._supplier_completude_score(s public.suppliers)
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
      (CASE WHEN COALESCE(s.cpf_cnpj, '')               <> '' THEN 1 ELSE 0 END)
    + (CASE WHEN COALESCE(s.nome_fantasia, '')          <> '' THEN 1 ELSE 0 END)
    + (CASE WHEN COALESCE(s.inscricao_estadual, '')     <> '' THEN 1 ELSE 0 END)
    + (CASE WHEN COALESCE(s.email, '')                  <> '' THEN 1 ELSE 0 END)
    + (CASE WHEN COALESCE(s.telefone, '')               <> '' THEN 1 ELSE 0 END)
    + (CASE WHEN COALESCE(s.celular, '')                <> '' THEN 1 ELSE 0 END)
    + (CASE WHEN COALESCE(s.endereco_cep, '')           <> '' THEN 1 ELSE 0 END)
    + (CASE WHEN COALESCE(s.endereco_logradouro, '')    <> '' THEN 1 ELSE 0 END)
    + (CASE WHEN COALESCE(s.endereco_numero, '')        <> '' THEN 1 ELSE 0 END)
    + (CASE WHEN COALESCE(s.endereco_bairro, '')        <> '' THEN 1 ELSE 0 END)
    + (CASE WHEN COALESCE(s.endereco_cidade, '')        <> '' THEN 1 ELSE 0 END)
    + (CASE WHEN COALESCE(s.endereco_estado, '')        <> '' THEN 1 ELSE 0 END)
    + (CASE WHEN COALESCE(s.dados_bancarios_banco, '')  <> '' THEN 1 ELSE 0 END)
    + (CASE WHEN COALESCE(s.dados_bancarios_agencia, '')<> '' THEN 1 ELSE 0 END)
    + (CASE WHEN COALESCE(s.dados_bancarios_conta, '')  <> '' THEN 1 ELSE 0 END)
    + (CASE WHEN COALESCE(s.dados_bancarios_pix, '')    <> '' THEN 1 ELSE 0 END)
    + (CASE WHEN COALESCE(s.observacoes, '')            <> '' THEN 1 ELSE 0 END);
$$;

-- ── Helper: chave de agrupamento ──
CREATE OR REPLACE FUNCTION public._supplier_group_key(s public.suppliers)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN regexp_replace(COALESCE(s.cpf_cnpj, ''), '\D', '', 'g') <> ''
      THEN 'doc:' || regexp_replace(s.cpf_cnpj, '\D', '', 'g')
    ELSE 'nome:' || LOWER(TRIM(unaccent(COALESCE(s.razao_social, ''))))
  END;
$$;

-- ── 1. PREVIEW ──────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.dedup_suppliers_preview(uuid);

CREATE OR REPLACE FUNCTION public.dedup_suppliers_preview(p_company_id uuid)
RETURNS TABLE(
    group_key text,
    total bigint,
    winner_id uuid,
    winner_razao_social text,
    winner_score int,
    losers jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT
      s.*,
      public._supplier_group_key(s.*) AS gkey,
      public._supplier_completude_score(s.*) AS score,
      ROW_NUMBER() OVER (
        PARTITION BY public._supplier_group_key(s.*)
        ORDER BY
          public._supplier_completude_score(s.*) DESC,
          s.updated_at DESC,
          s.created_at ASC,
          s.id ASC
      ) AS rn
    FROM public.suppliers s
    WHERE s.company_id = p_company_id
      AND COALESCE(TRIM(s.razao_social), '') <> ''
  ),
  groups AS (
    SELECT gkey
    FROM ranked
    GROUP BY gkey
    HAVING COUNT(*) > 1
  )
  SELECT
    r.gkey,
    (SELECT COUNT(*) FROM ranked r2 WHERE r2.gkey = r.gkey),
    r.id,
    r.razao_social,
    r.score,
    (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', l.id,
        'razao_social', l.razao_social,
        'nome_fantasia', l.nome_fantasia,
        'cpf_cnpj', l.cpf_cnpj,
        'score', l.score,
        'created_at', l.created_at,
        'updated_at', l.updated_at
      ) ORDER BY l.score, l.created_at), '[]'::jsonb)
      FROM ranked l
      WHERE l.gkey = r.gkey AND l.rn > 1
    )
  FROM ranked r
  JOIN groups g ON g.gkey = r.gkey
  WHERE r.rn = 1
  ORDER BY (SELECT COUNT(*) FROM ranked r3 WHERE r3.gkey = r.gkey) DESC, r.razao_social;
$$;

-- ── 2. APPLY ────────────────────────────────────────────────
-- Reatribui FKs e remove "perdedores". Se p_group_keys for NULL,
-- aplica em todos os grupos. Caso contrário, só nos grupos passados.
DROP FUNCTION IF EXISTS public.dedup_suppliers_apply(uuid, text[]);

CREATE OR REPLACE FUNCTION public.dedup_suppliers_apply(
    p_company_id uuid,
    p_group_keys text[] DEFAULT NULL
)
RETURNS TABLE(
    grupos_processados int,
    fornecedores_removidos int,
    refs_reatribuidas int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_grupos int := 0;
    v_removidos int := 0;
    v_refs int := 0;
    v_updated int;
    r record;
BEGIN
    FOR r IN
      WITH ranked AS (
        SELECT
          s.id,
          s.company_id,
          public._supplier_group_key(s.*) AS gkey,
          public._supplier_completude_score(s.*) AS score,
          ROW_NUMBER() OVER (
            PARTITION BY public._supplier_group_key(s.*)
            ORDER BY
              public._supplier_completude_score(s.*) DESC,
              s.updated_at DESC,
              s.created_at ASC,
              s.id ASC
          ) AS rn
        FROM public.suppliers s
        WHERE s.company_id = p_company_id
          AND COALESCE(TRIM(s.razao_social), '') <> ''
      ),
      grp AS (
        SELECT gkey
        FROM ranked
        GROUP BY gkey
        HAVING COUNT(*) > 1
      )
      SELECT
        r1.gkey,
        r1.id AS winner_id,
        ARRAY(
          SELECT r2.id FROM ranked r2
          WHERE r2.gkey = r1.gkey AND r2.rn > 1
        ) AS loser_ids
      FROM ranked r1
      JOIN grp ON grp.gkey = r1.gkey
      WHERE r1.rn = 1
        AND (p_group_keys IS NULL OR r1.gkey = ANY(p_group_keys))
    LOOP
        -- accounts_payable (legacy)
        IF to_regclass('public.accounts_payable') IS NOT NULL THEN
            UPDATE public.accounts_payable
               SET supplier_id = r.winner_id
             WHERE supplier_id = ANY(r.loser_ids);
            GET DIAGNOSTICS v_updated = ROW_COUNT;
            v_refs := v_refs + v_updated;
        END IF;

        -- contas_pagar.credor_id (quando credor_tipo='fornecedor')
        IF to_regclass('public.contas_pagar') IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='contas_pagar' AND column_name='credor_id'
           )
        THEN
            UPDATE public.contas_pagar
               SET credor_id = r.winner_id
             WHERE credor_id = ANY(r.loser_ids)
               AND (credor_tipo IS NULL OR credor_tipo = 'fornecedor');
            GET DIAGNOSTICS v_updated = ROW_COUNT;
            v_refs := v_refs + v_updated;
        END IF;

        -- products.fornecedor_id
        IF to_regclass('public.products') IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='products' AND column_name='fornecedor_id'
           )
        THEN
            UPDATE public.products
               SET fornecedor_id = r.winner_id
             WHERE fornecedor_id = ANY(r.loser_ids);
            GET DIAGNOSTICS v_updated = ROW_COUNT;
            v_refs := v_refs + v_updated;
        END IF;

        -- ordens_compra.fornecedor_id
        IF to_regclass('public.ordens_compra') IS NOT NULL THEN
            UPDATE public.ordens_compra
               SET fornecedor_id = r.winner_id
             WHERE fornecedor_id = ANY(r.loser_ids);
            GET DIAGNOSTICS v_updated = ROW_COUNT;
            v_refs := v_refs + v_updated;
        END IF;

        -- entradas_estoque.fornecedor_id
        IF to_regclass('public.entradas_estoque') IS NOT NULL THEN
            UPDATE public.entradas_estoque
               SET fornecedor_id = r.winner_id
             WHERE fornecedor_id = ANY(r.loser_ids);
            GET DIAGNOSTICS v_updated = ROW_COUNT;
            v_refs := v_refs + v_updated;
        END IF;

        -- importacao_xml.fornecedor_id
        IF to_regclass('public.importacao_xml') IS NOT NULL THEN
            UPDATE public.importacao_xml
               SET fornecedor_id = r.winner_id
             WHERE fornecedor_id = ANY(r.loser_ids);
            GET DIAGNOSTICS v_updated = ROW_COUNT;
            v_refs := v_refs + v_updated;
        END IF;

        -- Por fim, remove perdedores
        DELETE FROM public.suppliers
         WHERE id = ANY(r.loser_ids)
           AND company_id = p_company_id;
        GET DIAGNOSTICS v_updated = ROW_COUNT;
        v_removidos := v_removidos + v_updated;
        v_grupos := v_grupos + 1;
    END LOOP;

    RETURN QUERY SELECT v_grupos, v_removidos, v_refs;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dedup_suppliers_preview(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dedup_suppliers_apply(uuid, text[]) TO authenticated;
