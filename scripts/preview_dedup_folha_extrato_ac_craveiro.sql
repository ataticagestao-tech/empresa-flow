-- =============================================================================
-- PREVIEW v2: identifica pares (legítimo, órfão) na A C Craveiro
-- =============================================================================
-- Heurística corrigida (v2):
--   - Órfão: credor_nome começa com texto cru do banco
--     (DEBITO TRANSFERENCIA, DEB PIX, CREDITO PIX, CRED PIX, TED, DOC)
--     E descricao IS NULL
--   - Legítimo: NÃO órfão (credor_nome = nome do funcionário ou descricao
--     preenchida com texto significativo tipo "Salários e Ordenados - Nome")
--
-- READ-ONLY: não altera nada.
-- =============================================================================

WITH co AS (
    SELECT id FROM companies WHERE razao_social ILIKE '%craveiro%'
       AND is_active = TRUE ORDER BY created_at ASC LIMIT 1
),
funcionarios AS (
    SELECT id,
           LOWER(REGEXP_REPLACE(
               COALESCE(nome_completo, name, ''),
               '[áàâãäéèêëíìîïóòôõöúùûüç]','x','g')) AS nome_norm_aprox,
           COALESCE(nome_completo, name) AS nome_original,
           cpf
      FROM employees
     WHERE company_id = (SELECT id FROM co)
),
cps_empresa AS (
    SELECT cp.id, cp.valor_pago, cp.data_pagamento,
           cp.credor_cpf_cnpj, cp.credor_nome, cp.descricao,
           UPPER(COALESCE(cp.credor_nome, '')) AS credor_upper,
           cp.descricao IS NULL OR TRIM(cp.descricao) = '' AS sem_descricao
      FROM contas_pagar cp
     WHERE cp.company_id = (SELECT id FROM co)
       AND cp.status = 'pago'
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
cps_orfaos    AS (SELECT * FROM classified WHERE tipo = 'orfao')
SELECT DISTINCT ON (orfa.id)
       func.nome_original                            AS funcionario,
       orfa.valor_pago                               AS valor,
       leg.data_pagamento                            AS data_legitimo,
       orfa.data_pagamento                           AS data_orfao,
       ABS(leg.data_pagamento - orfa.data_pagamento) AS dias_diff,
       leg.descricao                                 AS descricao_legitimo,
       leg.credor_nome                               AS credor_legitimo,
       orfa.credor_nome                              AS credor_orfao,
       leg.id                                        AS cp_legitimo_id,
       orfa.id                                       AS cp_orfao_id
  FROM cps_orfaos orfa
  JOIN cps_legitimos leg
    ON ABS(leg.valor_pago - orfa.valor_pago) < 0.01
   AND ABS(leg.data_pagamento - orfa.data_pagamento) <= 3
   AND leg.id <> orfa.id
  JOIN funcionarios func
    ON func.nome_original IS NOT NULL
   AND LENGTH(func.nome_original) >= 5
   AND (
       -- Órfão menciona o funcionário no credor_nome (caso PIX cru)
       UPPER(orfa.credor_nome) LIKE '%' || UPPER(SPLIT_PART(func.nome_original, ' ', 1)) || '%'
       -- E o legítimo bate com o funcionário (nome ou descricao)
       AND (
           UPPER(leg.credor_nome) LIKE '%' || UPPER(SPLIT_PART(func.nome_original, ' ', 1)) || '%'
           OR UPPER(leg.descricao) LIKE '%' || UPPER(SPLIT_PART(func.nome_original, ' ', 1)) || '%'
       )
   )
 ORDER BY orfa.id, ABS(leg.data_pagamento - orfa.data_pagamento) ASC, leg.id;
