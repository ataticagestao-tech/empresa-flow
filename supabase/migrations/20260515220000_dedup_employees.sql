-- ============================================================
-- DEDUP FUNCIONARIOS — preview + apply
-- Identifica funcionários duplicados dentro da mesma empresa,
-- elege o mais completo como "vencedor" e remove os "perdedores"
-- (SOMENTE quando os perdedores não têm histórico em folha, ponto,
-- férias ou encargos — caso contrário, o grupo é omitido por segurança,
-- já que essas FKs são ON DELETE CASCADE e apagariam o histórico).
--
-- Critério de grupo (por company_id):
--   1) cpf limpo (só dígitos), quando preenchido
--   2) senão, LOWER(TRIM(unaccent(COALESCE(nome_completo, name))))
--
-- Desempate: status='ativo' > 'inativo', updated/created mais recente.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS unaccent;

-- ── Helper: nome canônico (nome_completo OU name) ──
CREATE OR REPLACE FUNCTION public._employee_nome(e public.employees)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    RETURN COALESCE(
      NULLIF(TRIM(
        CASE WHEN EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='employees' AND column_name='nome_completo'
        ) THEN (to_jsonb(e) ->> 'nome_completo') ELSE NULL END
      ), ''),
      NULLIF(TRIM(e.name), '')
    );
END;
$$;

-- ── Helper: score de completude ──
CREATE OR REPLACE FUNCTION public._employee_completude_score(e public.employees)
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
      (CASE WHEN COALESCE(e.cpf, '')              <> '' THEN 1 ELSE 0 END)
    + (CASE WHEN COALESCE(e.rg, '')               <> '' THEN 1 ELSE 0 END)
    + (CASE WHEN COALESCE(e.email, '')            <> '' THEN 1 ELSE 0 END)
    + (CASE WHEN COALESCE(e.phone, '')            <> '' THEN 1 ELSE 0 END)
    + (CASE WHEN COALESCE(e.role, '')             <> '' THEN 1 ELSE 0 END)
    + (CASE WHEN e.data_nascimento IS NOT NULL          THEN 1 ELSE 0 END)
    + (CASE WHEN e.hire_date IS NOT NULL                THEN 1 ELSE 0 END)
    + (CASE WHEN e.salary IS NOT NULL OR e.salario_base IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN COALESCE(e.pis, '')              <> '' THEN 1 ELSE 0 END)
    + (CASE WHEN COALESCE(e.ctps_numero, '')      <> '' THEN 1 ELSE 0 END)
    + (CASE WHEN COALESCE(e.banco_folha, '')      <> '' THEN 1 ELSE 0 END)
    + (CASE WHEN COALESCE(e.agencia_folha, '')    <> '' THEN 1 ELSE 0 END)
    + (CASE WHEN COALESCE(e.conta_folha, '')      <> '' THEN 1 ELSE 0 END)
    + (CASE WHEN COALESCE(e.chave_pix_folha, '')  <> '' THEN 1 ELSE 0 END);
$$;

-- ── Helper: chave de agrupamento ──
CREATE OR REPLACE FUNCTION public._employee_group_key(e public.employees)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN regexp_replace(COALESCE(e.cpf, ''), '\D', '', 'g') <> ''
      THEN 'cpf:' || regexp_replace(e.cpf, '\D', '', 'g')
    ELSE 'nome:' || LOWER(TRIM(unaccent(COALESCE(public._employee_nome(e.*), ''))))
  END;
$$;

-- ── Helper: funcionário tem histórico? ──
CREATE OR REPLACE FUNCTION public._employee_tem_historico(p_employee_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count int := 0;
    v_tmp int;
BEGIN
    IF to_regclass('public.folha_pagamento') IS NOT NULL THEN
        EXECUTE 'SELECT COUNT(*) FROM public.folha_pagamento WHERE employee_id = $1 LIMIT 1'
          INTO v_tmp USING p_employee_id;
        v_count := v_count + COALESCE(v_tmp, 0);
        IF v_count > 0 THEN RETURN true; END IF;
    END IF;
    IF to_regclass('public.ponto_eletronico') IS NOT NULL THEN
        EXECUTE 'SELECT COUNT(*) FROM public.ponto_eletronico WHERE employee_id = $1 LIMIT 1'
          INTO v_tmp USING p_employee_id;
        v_count := v_count + COALESCE(v_tmp, 0);
        IF v_count > 0 THEN RETURN true; END IF;
    END IF;
    IF to_regclass('public.ferias_afastamentos') IS NOT NULL THEN
        EXECUTE 'SELECT COUNT(*) FROM public.ferias_afastamentos WHERE employee_id = $1 LIMIT 1'
          INTO v_tmp USING p_employee_id;
        v_count := v_count + COALESCE(v_tmp, 0);
        IF v_count > 0 THEN RETURN true; END IF;
    END IF;
    IF to_regclass('public.encargos') IS NOT NULL THEN
        EXECUTE 'SELECT COUNT(*) FROM public.encargos WHERE employee_id = $1 LIMIT 1'
          INTO v_tmp USING p_employee_id;
        v_count := v_count + COALESCE(v_tmp, 0);
        IF v_count > 0 THEN RETURN true; END IF;
    END IF;
    RETURN false;
END;
$$;

-- ── 1. PREVIEW ──────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.dedup_employees_preview(uuid);

CREATE OR REPLACE FUNCTION public.dedup_employees_preview(p_company_id uuid)
RETURNS TABLE(
    group_key text,
    total bigint,
    winner_id uuid,
    winner_nome text,
    winner_score int,
    losers jsonb,
    bloqueado boolean,
    motivo_bloqueio text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT
      e.id,
      e.company_id,
      e.cpf,
      e.status,
      e.created_at,
      public._employee_nome(e.*) AS nome,
      public._employee_group_key(e.*) AS gkey,
      public._employee_completude_score(e.*) AS score,
      public._employee_tem_historico(e.id) AS tem_hist,
      ROW_NUMBER() OVER (
        PARTITION BY public._employee_group_key(e.*)
        ORDER BY
          public._employee_completude_score(e.*) DESC,
          public._employee_tem_historico(e.id) DESC, -- quem tem histórico ganha
          CASE WHEN COALESCE(e.status, 'ativo') = 'ativo' THEN 0 ELSE 1 END,
          e.created_at ASC,
          e.id ASC
      ) AS rn
    FROM public.employees e
    WHERE e.company_id = p_company_id
      AND COALESCE(TRIM(public._employee_nome(e.*)), '') <> ''
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
    r.nome,
    r.score,
    (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', l.id,
        'nome', l.nome,
        'cpf', l.cpf,
        'status', l.status,
        'score', l.score,
        'tem_historico', l.tem_hist,
        'created_at', l.created_at
      ) ORDER BY l.score, l.created_at), '[]'::jsonb)
      FROM ranked l
      WHERE l.gkey = r.gkey AND l.rn > 1
    ),
    EXISTS (
      SELECT 1 FROM ranked l
      WHERE l.gkey = r.gkey AND l.rn > 1 AND l.tem_hist
    ),
    CASE WHEN EXISTS (
      SELECT 1 FROM ranked l
      WHERE l.gkey = r.gkey AND l.rn > 1 AND l.tem_hist
    ) THEN 'Algum cadastro a ser removido possui histórico de folha/ponto/férias/encargos. Migre o histórico manualmente ou inative o duplicado.'
    ELSE NULL
    END
  FROM ranked r
  JOIN groups g ON g.gkey = r.gkey
  WHERE r.rn = 1
  ORDER BY (SELECT COUNT(*) FROM ranked r3 WHERE r3.gkey = r.gkey) DESC, r.nome;
$$;

-- ── 2. APPLY ────────────────────────────────────────────────
-- Remove perdedores. Recusa silenciosamente grupos bloqueados (sem
-- afetar dados). Não há FKs adicionais pra reatribuir (folha/ponto/
-- férias/encargos são CASCADE e já filtramos por loser sem histórico).
DROP FUNCTION IF EXISTS public.dedup_employees_apply(uuid, text[]);

CREATE OR REPLACE FUNCTION public.dedup_employees_apply(
    p_company_id uuid,
    p_group_keys text[] DEFAULT NULL
)
RETURNS TABLE(
    grupos_processados int,
    funcionarios_removidos int,
    grupos_bloqueados int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_grupos int := 0;
    v_removidos int := 0;
    v_bloqueados int := 0;
    v_updated int;
    r record;
BEGIN
    FOR r IN
      WITH ranked AS (
        SELECT
          e.id,
          e.company_id,
          public._employee_group_key(e.*) AS gkey,
          public._employee_completude_score(e.*) AS score,
          public._employee_tem_historico(e.id) AS tem_hist,
          ROW_NUMBER() OVER (
            PARTITION BY public._employee_group_key(e.*)
            ORDER BY
              public._employee_completude_score(e.*) DESC,
              public._employee_tem_historico(e.id) DESC,
              CASE WHEN COALESCE(e.status, 'ativo') = 'ativo' THEN 0 ELSE 1 END,
              e.created_at ASC,
              e.id ASC
          ) AS rn
        FROM public.employees e
        WHERE e.company_id = p_company_id
          AND COALESCE(TRIM(public._employee_nome(e.*)), '') <> ''
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
        ) AS loser_ids,
        EXISTS (
          SELECT 1 FROM ranked r3
          WHERE r3.gkey = r1.gkey AND r3.rn > 1 AND r3.tem_hist
        ) AS bloqueado
      FROM ranked r1
      JOIN grp ON grp.gkey = r1.gkey
      WHERE r1.rn = 1
        AND (p_group_keys IS NULL OR r1.gkey = ANY(p_group_keys))
    LOOP
        IF r.bloqueado THEN
            v_bloqueados := v_bloqueados + 1;
            CONTINUE;
        END IF;

        DELETE FROM public.employees
         WHERE id = ANY(r.loser_ids)
           AND company_id = p_company_id;
        GET DIAGNOSTICS v_updated = ROW_COUNT;
        v_removidos := v_removidos + v_updated;
        v_grupos := v_grupos + 1;
    END LOOP;

    RETURN QUERY SELECT v_grupos, v_removidos, v_bloqueados;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dedup_employees_preview(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dedup_employees_apply(uuid, text[]) TO authenticated;
