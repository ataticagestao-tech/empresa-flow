-- =====================================================================
-- AUDITORIA: extratos / transações bancárias duplicadas
-- READ-ONLY (só SELECT). Rode no SQL Editor do Supabase (bypassa RLS).
--
-- Duplicata = a MESMA linha de extrato (conta + data + valor + descrição
-- + memo) importada em SESSÕES de importação DIFERENTES (re-upload do
-- mesmo extrato). "Sessões diferentes" evita falso-positivo de duas linhas
-- legitimamente iguais vindas no mesmo arquivo.
--
-- Risco: duplicata CONCILIADA gera movimentação dobrada → infla saldo/DRE.
--
-- Como usar: selecione UMA query por vez (entre as linhas ===) e dê Run.
-- =====================================================================


-- ===== QUERY 1 — TEM OU NÃO TEM? (resposta em 1 linha) ===============
WITH grupos AS (
    SELECT
        COUNT(*)                                          AS ocorrencias,
        COUNT(*) FILTER (WHERE bt.status = 'reconciled')  AS conciliadas
    FROM bank_transactions bt
    GROUP BY bt.company_id, bt.bank_account_id, bt.date, bt.amount,
             COALESCE(bt.description, ''), COALESCE(bt.memo, '')
    HAVING COUNT(*) > 1
       AND COUNT(DISTINCT date_trunc('minute', bt.created_at)) > 1
)
SELECT
    COUNT(*)                                        AS grupos_duplicados,
    COALESCE(SUM(ocorrencias - 1), 0)               AS linhas_extras_total,
    COALESCE(SUM(GREATEST(conciliadas - 1, 0)), 0)  AS extras_conciliadas_perigosas
FROM grupos;
-- =====================================================================


-- ===== QUERY 2 — RESUMO POR EMPRESA / CONTA ==========================
WITH grupos AS (
    SELECT
        bt.company_id,
        bt.bank_account_id,
        COUNT(*)                                          AS ocorrencias,
        COUNT(*) FILTER (WHERE bt.status = 'reconciled')  AS conciliadas
    FROM bank_transactions bt
    GROUP BY bt.company_id, bt.bank_account_id, bt.date, bt.amount,
             COALESCE(bt.description, ''), COALESCE(bt.memo, '')
    HAVING COUNT(*) > 1
       AND COUNT(DISTINCT date_trunc('minute', bt.created_at)) > 1
)
SELECT
    COALESCE(c.nome_fantasia, c.razao_social)  AS empresa,
    ba.name                                     AS conta,
    COUNT(*)                                    AS grupos_duplicados,
    SUM(g.ocorrencias - 1)                      AS linhas_extras,
    SUM(GREATEST(g.conciliadas - 1, 0))         AS extras_conciliadas
FROM grupos g
JOIN bank_accounts ba ON ba.id = g.bank_account_id
LEFT JOIN companies   c ON c.id = g.company_id
GROUP BY 1, 2
ORDER BY extras_conciliadas DESC, linhas_extras DESC;
-- =====================================================================


-- ===== QUERY 3 — DETALHE (cada grupo duplicado, pra investigar) ======
WITH grupos AS (
    SELECT
        bt.company_id,
        bt.bank_account_id,
        bt.date,
        bt.amount,
        COALESCE(bt.description, '')                                AS description,
        COUNT(*)                                                    AS ocorrencias,
        COUNT(*) FILTER (WHERE bt.status = 'reconciled')            AS conciliadas,
        COUNT(*) FILTER (WHERE bt.status = 'pending')               AS pendentes,
        ARRAY_AGG(DISTINCT bt.source)                               AS origens,
        ARRAY_AGG(DISTINCT to_char(bt.created_at, 'DD/MM/YY HH24:MI')) AS importado_em,
        ARRAY_AGG(bt.id ORDER BY bt.created_at)                     AS ids
    FROM bank_transactions bt
    GROUP BY bt.company_id, bt.bank_account_id, bt.date, bt.amount,
             COALESCE(bt.description, ''), COALESCE(bt.memo, '')
    HAVING COUNT(*) > 1
       AND COUNT(DISTINCT date_trunc('minute', bt.created_at)) > 1
)
SELECT
    COALESCE(c.nome_fantasia, c.razao_social)  AS empresa,
    ba.name                                     AS conta,
    g.date                                      AS data,
    g.amount                                    AS valor,
    LEFT(g.description, 60)                      AS descricao,
    g.ocorrencias,
    g.conciliadas,
    g.pendentes,
    g.origens,
    g.importado_em,
    g.ids                                        AS bank_transaction_ids
FROM grupos g
JOIN bank_accounts ba ON ba.id = g.bank_account_id
LEFT JOIN companies   c ON c.id = g.company_id
ORDER BY g.conciliadas DESC, g.date DESC
LIMIT 200;
-- =====================================================================
