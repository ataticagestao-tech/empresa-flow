WITH duplicatas_cr AS (
  SELECT
    company_id,
    COALESCE(pagador_cpf_cnpj, pagador_nome, '—') AS chave_pagador,
    valor,
    data_vencimento,
    COUNT(*) - 1 AS extras
  FROM public.contas_receber
  WHERE deleted_at IS NULL
  GROUP BY company_id, COALESCE(pagador_cpf_cnpj, pagador_nome, '—'), valor, data_vencimento
  HAVING COUNT(*) > 1
),
duplicatas_cp AS (
  SELECT
    company_id,
    COALESCE(credor_cpf_cnpj, credor_nome, '—') AS chave_credor,
    valor,
    data_vencimento,
    COUNT(*) - 1 AS extras
  FROM public.contas_pagar
  WHERE deleted_at IS NULL
  GROUP BY company_id, COALESCE(credor_cpf_cnpj, credor_nome, '—'), valor, data_vencimento
  HAVING COUNT(*) > 1
),
orfaos_cr AS (
  SELECT cr.company_id, COUNT(*) AS qtd
  FROM public.contas_receber cr
  INNER JOIN public.bank_reconciliation_matches brm ON brm.receivable_id = cr.id
  WHERE cr.deleted_at IS NULL AND brm.bank_transaction_id IS NULL
  GROUP BY cr.company_id
),
orfaos_cp AS (
  SELECT cp.company_id, COUNT(*) AS qtd
  FROM public.contas_pagar cp
  INNER JOIN public.bank_reconciliation_matches brm ON brm.payable_id = cp.id
  WHERE cp.deleted_at IS NULL AND brm.bank_transaction_id IS NULL
  GROUP BY cp.company_id
)
SELECT
  c.nome_fantasia                                 AS empresa,
  COALESCE(SUM(dcr.extras), 0)                    AS cr_dup_excedentes,
  COALESCE(SUM(dcp.extras), 0)                    AS cp_dup_excedentes,
  COALESCE(MAX(ocr.qtd), 0)                       AS cr_orfaos_match,
  COALESCE(MAX(ocp.qtd), 0)                       AS cp_orfaos_match,
  COALESCE(SUM(dcr.extras), 0)
    + COALESCE(SUM(dcp.extras), 0)
    + COALESCE(MAX(ocr.qtd), 0)
    + COALESCE(MAX(ocp.qtd), 0)                   AS total_problemas
FROM public.companies c
LEFT JOIN duplicatas_cr dcr ON dcr.company_id = c.id
LEFT JOIN duplicatas_cp dcp ON dcp.company_id = c.id
LEFT JOIN orfaos_cr    ocr ON ocr.company_id = c.id
LEFT JOIN orfaos_cp    ocp ON ocp.company_id = c.id
GROUP BY c.id, c.nome_fantasia
HAVING
  COALESCE(SUM(dcr.extras), 0)
  + COALESCE(SUM(dcp.extras), 0)
  + COALESCE(MAX(ocr.qtd), 0)
  + COALESCE(MAX(ocp.qtd), 0) > 0
ORDER BY total_problemas DESC;
