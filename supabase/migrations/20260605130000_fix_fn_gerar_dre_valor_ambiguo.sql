-- ============================================================
-- FIX: fn_gerar_dre falhava com
--   "ERROR 42702: column reference \"valor\" is ambiguous"
-- Na subquery da operação 'subtrair', `valor` e `codigo` (sem qualificar)
-- colidiam com os parâmetros OUT da função (RETURNS TABLE codigo/valor),
-- que viram variáveis PL/pgSQL. As demais subqueries já usavam alias `sub.`;
-- só essa ficou crua. Aqui aliasamos a tabela (_dre_temp d) e qualificamos.
-- Bug pré-existente — exposto pelo relatório DRE em PDF (gerar_relatorio_pdf).
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_gerar_dre(
  p_company_id uuid,
  p_data_inicio date,
  p_data_fim date
)
RETURNS TABLE (
  codigo text,
  nome text,
  nivel int,
  tipo_calculo text,
  valor numeric(14,2),
  ordem int
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  CREATE TEMP TABLE _dre_temp ON COMMIT DROP AS
  SELECT
    ld.codigo,
    ld.nome,
    ld.nivel,
    ld.tipo_calculo,
    ld.formula,
    ld.ordem,
    COALESCE(SUM(
      CASE
        WHEN ca.account_nature = 'credit' AND m.tipo = 'credito' THEN m.valor * mc.fator
        WHEN ca.account_nature = 'credit' AND m.tipo = 'debito'  THEN m.valor * mc.fator * -1
        WHEN ca.account_nature = 'debit'  AND m.tipo = 'debito'  THEN m.valor * mc.fator
        WHEN ca.account_nature = 'debit'  AND m.tipo = 'credito' THEN m.valor * mc.fator * -1
        ELSE 0
      END
    ), 0)::numeric(14,2) AS valor
  FROM public.cont_linha_demonstrativo ld
  LEFT JOIN public.cont_mapeamento_contas mc
    ON mc.linha_demonstrativo_id = ld.id AND mc.ativo = true AND mc.company_id = p_company_id
  LEFT JOIN public.chart_of_accounts ca
    ON ca.id = mc.conta_operacional_id
  LEFT JOIN public.movimentacoes m
    ON m.conta_contabil_id = ca.id
    AND m.company_id = p_company_id
    AND m.data >= p_data_inicio
    AND m.data <= p_data_fim
  WHERE ld.company_id = p_company_id
    AND ld.demonstrativo = 'DRE'
    AND ld.ativo = true
    AND ld.visivel = true
  GROUP BY ld.codigo, ld.nome, ld.nivel, ld.tipo_calculo, ld.formula, ld.ordem;

  -- Calcular linhas tipo 'resultado' usando formula JSONB
  UPDATE _dre_temp t
  SET valor = (
    SELECT CASE
      WHEN t.formula->>'operacao' = 'subtrair' THEN
        (SELECT COALESCE(d.valor, 0) FROM _dre_temp d WHERE d.codigo = (t.formula->'linhas'->>0))
        - COALESCE((
          SELECT SUM(COALESCE(sub.valor, 0))
          FROM _dre_temp sub
          WHERE sub.codigo IN (
            SELECT jsonb_array_elements_text(t.formula->'linhas')
            OFFSET 1
          )
        ), 0)
      WHEN t.formula->>'operacao' = 'somar' THEN
        (SELECT COALESCE(SUM(sub.valor), 0)
         FROM _dre_temp sub
         WHERE sub.codigo IN (SELECT jsonb_array_elements_text(t.formula->'linhas')))
      ELSE 0
    END
  )
  WHERE t.tipo_calculo = 'resultado'
    AND t.formula IS NOT NULL;

  RETURN QUERY
  SELECT t.codigo, t.nome, t.nivel, t.tipo_calculo, t.valor, t.ordem
  FROM _dre_temp t
  ORDER BY t.ordem;
END;
$$;
