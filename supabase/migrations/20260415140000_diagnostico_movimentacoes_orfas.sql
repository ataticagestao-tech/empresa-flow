-- ============================================================
-- DIAGNOSTICO: movimentacoes orfas que aparecem no banner
-- "X pendencias de reclassificacao"
--
-- Banner conta: movimentacoes WHERE
--   (tipo='credito' AND conta_receber_id IS NULL)
--   OR (tipo='debito' AND conta_pagar_id IS NULL)
--   AND status_conciliacao = 'pendente'
--
-- Esta migration:
--  1. Cria fn_diagnostico_movimentacoes_orfas(company_id) pra
--     consulta ad-hoc futura.
--  2. Roda DO block que imprime resumo por empresa no log.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_diagnostico_movimentacoes_orfas(
  p_company_id UUID
)
RETURNS TABLE(
  bucket TEXT,
  qtd BIGINT,
  total NUMERIC,
  data_min DATE,
  data_max DATE
)
LANGUAGE sql STABLE
AS $$
  WITH orfas AS (
    SELECT
      m.id,
      m.tipo,
      m.valor,
      m.data,
      m.descricao,
      m.origem,
      m.conta_bancaria_id,
      m.created_at,
      -- Heuristica de origem
      CASE
        WHEN m.origem = 'conta_receber' THEN 'origem=conta_receber'
        WHEN m.origem = 'conta_pagar' THEN 'origem=conta_pagar'
        WHEN m.origem = 'transferencia' THEN 'origem=transferencia'
        WHEN m.descricao ILIKE 'Recebimento:%' THEN 'desc=Recebimento'
        WHEN m.descricao ILIKE 'Pagamento:%' THEN 'desc=Pagamento'
        WHEN m.origem IS NULL THEN 'origem=NULL'
        ELSE 'outro'
      END AS bucket_origem
    FROM public.movimentacoes m
    WHERE m.company_id = p_company_id
      AND m.status_conciliacao = 'pendente'
      AND (
        (m.tipo = 'credito' AND m.conta_receber_id IS NULL)
        OR (m.tipo = 'debito' AND m.conta_pagar_id IS NULL)
      )
  )
  SELECT
    bucket_origem || ' (' || tipo || ')' AS bucket,
    COUNT(*)::BIGINT AS qtd,
    SUM(valor)::NUMERIC AS total,
    MIN(data) AS data_min,
    MAX(data) AS data_max
  FROM orfas
  GROUP BY bucket_origem, tipo
  ORDER BY COUNT(*) DESC;
$$;

COMMENT ON FUNCTION public.fn_diagnostico_movimentacoes_orfas IS
  'Diagnostica movimentacoes orfas (sem CR/CP vinculado) que aparecem no banner de pendencias.
   Uso: SELECT * FROM fn_diagnostico_movimentacoes_orfas(''<company_uuid>'');';


-- ─── Relatorio automatico no apply ──────────────────────────

DO $$
DECLARE
  rec RECORD;
  v_company_name TEXT;
  v_total BIGINT;
BEGIN
  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE 'DIAGNOSTICO: movimentacoes orfas por empresa';
  RAISE NOTICE '════════════════════════════════════════════════════════════';

  FOR rec IN
    SELECT
      m.company_id,
      COUNT(*) AS qtd,
      SUM(m.valor) AS total,
      MIN(m.data) AS data_min,
      MAX(m.data) AS data_max,
      MIN(m.created_at) AS criado_min,
      MAX(m.created_at) AS criado_max
    FROM public.movimentacoes m
    WHERE m.status_conciliacao = 'pendente'
      AND (
        (m.tipo = 'credito' AND m.conta_receber_id IS NULL)
        OR (m.tipo = 'debito' AND m.conta_pagar_id IS NULL)
      )
    GROUP BY m.company_id
    HAVING COUNT(*) > 0
    ORDER BY COUNT(*) DESC
  LOOP
    SELECT COALESCE(nome_fantasia, razao_social) INTO v_company_name FROM public.companies WHERE id = rec.company_id;
    RAISE NOTICE '';
    RAISE NOTICE '── % (% órfãs, R$ %) ──', COALESCE(v_company_name, rec.company_id::TEXT), rec.qtd, rec.total;
    RAISE NOTICE '   Datas das movs: % a %', rec.data_min, rec.data_max;
    RAISE NOTICE '   Criadas em: % a %', rec.criado_min, rec.criado_max;
  END LOOP;

  -- Total geral
  SELECT COUNT(*) INTO v_total
  FROM public.movimentacoes m
  WHERE m.status_conciliacao = 'pendente'
    AND (
      (m.tipo = 'credito' AND m.conta_receber_id IS NULL)
      OR (m.tipo = 'debito' AND m.conta_pagar_id IS NULL)
    );

  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE 'TOTAL geral de orfas: %', v_total;
  RAISE NOTICE '════════════════════════════════════════════════════════════';
END $$;


-- ─── Breakdown detalhado por bucket (top empresa) ───────────

DO $$
DECLARE
  v_top_company UUID;
  v_top_name TEXT;
  rec RECORD;
BEGIN
  -- Pega a empresa com mais orfas
  SELECT m.company_id INTO v_top_company
  FROM public.movimentacoes m
  WHERE m.status_conciliacao = 'pendente'
    AND (
      (m.tipo = 'credito' AND m.conta_receber_id IS NULL)
      OR (m.tipo = 'debito' AND m.conta_pagar_id IS NULL)
    )
  GROUP BY m.company_id
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  IF v_top_company IS NULL THEN
    RAISE NOTICE 'Nenhuma orfa encontrada — nada a diagnosticar.';
    RETURN;
  END IF;

  SELECT COALESCE(nome_fantasia, razao_social) INTO v_top_name FROM public.companies WHERE id = v_top_company;

  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE 'BREAKDOWN por origem — empresa: %', COALESCE(v_top_name, v_top_company::TEXT);
  RAISE NOTICE '════════════════════════════════════════════════════════════';

  FOR rec IN
    SELECT * FROM public.fn_diagnostico_movimentacoes_orfas(v_top_company)
  LOOP
    RAISE NOTICE '   %  →  qtd=%  total=R$ %  (% a %)',
      RPAD(rec.bucket, 35), rec.qtd, rec.total, rec.data_min, rec.data_max;
  END LOOP;

  -- Amostra das 10 mais recentes
  RAISE NOTICE '';
  RAISE NOTICE '── Amostra das 10 mais recentes ──';
  FOR rec IN
    SELECT
      m.data::TEXT || ' | ' || m.tipo || ' | R$ ' || m.valor::TEXT || ' | ' ||
      COALESCE(m.origem, '(null)') || ' | ' || LEFT(COALESCE(m.descricao, ''), 60) AS bucket,
      0::BIGINT AS qtd,
      0::NUMERIC AS total,
      m.data AS data_min,
      m.data AS data_max
    FROM public.movimentacoes m
    WHERE m.company_id = v_top_company
      AND m.status_conciliacao = 'pendente'
      AND (
        (m.tipo = 'credito' AND m.conta_receber_id IS NULL)
        OR (m.tipo = 'debito' AND m.conta_pagar_id IS NULL)
      )
    ORDER BY m.created_at DESC
    LIMIT 10
  LOOP
    RAISE NOTICE '   %', rec.bucket;
  END LOOP;
END $$;
