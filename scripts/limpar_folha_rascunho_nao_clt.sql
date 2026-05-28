-- ─────────────────────────────────────────────────────────────────────────
-- Limpeza: rascunhos de folha de funcionários NÃO-CLT (PJ/autônomo/estágio/temporário)
-- Competência: 2026-05  |  Status: somente 'rascunho'
--
-- Contexto: o "Calcular folha" antigo gerava rascunho para TODOS os ativos,
-- sem olhar o tipo de contrato. Agora a folha só calcula CLT. Este script
-- remove os rascunhos errados já criados. NÃO toca em folhas fechadas/pagas.
--
-- COMO USAR no Supabase SQL Editor:
--   1) Rode o PASSO 1 (SELECT) e confira a lista.
--   2) Só então rode o PASSO 2 (DELETE).
-- Para limpar TODAS as competências, remova a linha `AND fp.competencia = '2026-05'`.
-- Para restringir a UMA empresa, descomente o filtro de company no fim de cada query.
-- ─────────────────────────────────────────────────────────────────────────


-- ═══ PASSO 1 — PREVIEW (rode primeiro, não apaga nada) ═══
SELECT
  COALESCE(c.nome_fantasia, c.razao_social) AS empresa,
  COALESCE(e.nome_completo, e.name)         AS funcionario,
  e.tipo_contrato,
  fp.competencia,
  fp.tipo,
  fp.status,
  fp.valor_liquido
FROM public.folha_pagamento fp
JOIN public.employees e  ON e.id = fp.employee_id
JOIN public.companies  c ON c.id = fp.company_id
WHERE fp.status = 'rascunho'
  AND fp.competencia = '2026-05'
  AND e.tipo_contrato IS NOT NULL
  AND e.tipo_contrato <> 'clt'
  -- AND c.id = 'COLE_AQUI_O_COMPANY_ID'   -- opcional: limitar a uma empresa
ORDER BY empresa, funcionario;


-- ═══ PASSO 2 — DELETE (rode só depois de conferir o PASSO 1) ═══
-- DELETE FROM public.folha_pagamento fp
-- USING public.employees e
-- WHERE e.id = fp.employee_id
--   AND fp.status = 'rascunho'
--   AND fp.competencia = '2026-05'
--   AND e.tipo_contrato IS NOT NULL
--   AND e.tipo_contrato <> 'clt'
--   -- AND fp.company_id = 'COLE_AQUI_O_COMPANY_ID'   -- opcional: limitar a uma empresa
-- ;
