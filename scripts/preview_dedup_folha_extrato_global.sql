-- =============================================================================
-- PREVIEW GLOBAL: pares (legítimo, órfão) em TODAS as empresas
-- =============================================================================
-- Mostra agregado por empresa + linhas detalhadas. READ-ONLY.
-- =============================================================================

WITH funcionarios AS (
    SELECT id, company_id,
           COALESCE(nome_completo, name) AS nome_original
      FROM employees
     WHERE COALESCE(nome_completo, name) IS NOT NULL
       AND LENGTH(COALESCE(nome_completo, name)) >= 5
),
cps_empresa AS (
    SELECT cp.id, cp.company_id, cp.valor_pago, cp.data_pagamento,
           cp.credor_nome, cp.descricao,
           UPPER(COALESCE(cp.credor_nome, '')) AS credor_upper,
           (cp.descricao IS NULL OR TRIM(cp.descricao) = '') AS sem_descricao
      FROM contas_pagar cp
     WHERE cp.status = 'pago'
       AND cp.deleted_at IS NULL
       AND cp.valor_pago > 0
),
classified AS (
    SELECT *,
        CASE
          WHEN sem_descricao AND (
                credor_upper LIKE '%DEBITO TRANSFERENCIA%'
             OR credor_upper LIKE '%DEB PIX%'
             OR credor_upper LIKE '%CREDITO PIX%'
             OR credor_upper LIKE '%CRED PIX%'
             OR credor_upper LIKE 'TED %'
             OR credor_upper LIKE 'DOC %'
             OR credor_upper LIKE 'PAGAMENTO %'
          ) THEN 'orfao'
          ELSE 'legitimo'
        END AS tipo
      FROM cps_empresa
),
cps_legitimos AS (SELECT * FROM classified WHERE tipo = 'legitimo'),
cps_orfaos    AS (SELECT * FROM classified WHERE tipo = 'orfao'),
pares AS (
    SELECT DISTINCT ON (orfa.id)
           orfa.company_id,
           leg.id   AS legitimo_id,
           orfa.id  AS orfao_id,
           orfa.valor_pago AS valor,
           leg.data_pagamento AS data_legitimo,
           orfa.data_pagamento AS data_orfao,
           ABS(leg.data_pagamento - orfa.data_pagamento) AS dias_diff,
           func.nome_original AS funcionario
      FROM cps_orfaos orfa
      JOIN cps_legitimos leg
        ON leg.company_id = orfa.company_id
       AND ABS(leg.valor_pago - orfa.valor_pago) < 0.01
       AND ABS(leg.data_pagamento - orfa.data_pagamento) <= 3
       AND leg.id <> orfa.id
      JOIN funcionarios func
        ON func.company_id = orfa.company_id
       AND UPPER(orfa.credor_nome) LIKE '%' || UPPER(SPLIT_PART(func.nome_original, ' ', 1)) || '%'
       AND (
           UPPER(leg.credor_nome) LIKE '%' || UPPER(SPLIT_PART(func.nome_original, ' ', 1)) || '%'
           OR UPPER(leg.descricao) LIKE '%' || UPPER(SPLIT_PART(func.nome_original, ' ', 1)) || '%'
       )
     ORDER BY orfa.id, ABS(leg.data_pagamento - orfa.data_pagamento) ASC, leg.id
)
SELECT
    c.razao_social      AS empresa,
    COUNT(*)            AS pares_duplicados,
    SUM(p.valor)        AS valor_total_orfaos,
    MIN(p.data_orfao)   AS primeiro,
    MAX(p.data_orfao)   AS ultimo
  FROM pares p
  JOIN companies c ON c.id = p.company_id
 GROUP BY c.razao_social
 ORDER BY pares_duplicados DESC;
