-- =============================================================================
-- FASE 1 — Dedupe das 14 CRs com 2+ movimentações vinculadas
-- =============================================================================
-- O QUE FAZ: pra cada CR que tem 2 ou mais movs vinculadas, MANTÉM a mov mais
-- antiga (created_at ASC) e HARD-DELETA as outras (movs não têm soft-delete).
--
-- POR QUE manter a mais antiga: ela foi criada na PRIMEIRA conciliação/baixa
-- (manual ou via extrato). A segunda em diante é a duplicata.
--
-- BACKUP: a tabela backup_dedup_fase1_movs_20260519 guarda CADA mov deletada
-- com todos os dados originais. Se algo der errado, dá pra re-inserir.
-- =============================================================================

BEGIN;

-- 1. Cria backup das movs que serão deletadas (mantendo apenas a mais antiga)
CREATE TABLE IF NOT EXISTS backup_dedup_fase1_movs_20260519 AS
WITH ranked AS (
    SELECT m.*,
           ROW_NUMBER() OVER (PARTITION BY m.conta_receber_id
                              ORDER BY m.created_at ASC, m.id ASC) AS rn,
           COUNT(*) OVER (PARTITION BY m.conta_receber_id) AS total_no_cr
    FROM movimentacoes m
    WHERE m.conta_receber_id IS NOT NULL
)
SELECT * FROM ranked WHERE total_no_cr > 1 AND rn > 1;

-- 2. Verificação: quantas movs vão ser deletadas?
SELECT COUNT(*) AS movs_que_serao_deletadas,
       COUNT(DISTINCT conta_receber_id) AS crs_afetados,
       SUM(valor) AS valor_total_movs_deletadas
FROM backup_dedup_fase1_movs_20260519;

-- 3. DELETE EFETIVO (commitado só no COMMIT lá embaixo)
DELETE FROM movimentacoes
WHERE id IN (SELECT id FROM backup_dedup_fase1_movs_20260519);

-- 4. Validação pós-delete: nenhum CR deve mais ter 2+ movs
SELECT COUNT(*) AS crs_ainda_com_2plus_movs FROM (
    SELECT conta_receber_id FROM movimentacoes
    WHERE conta_receber_id IS NOT NULL
    GROUP BY conta_receber_id HAVING COUNT(*) > 1
) x;

-- Se "crs_ainda_com_2plus_movs" = 0, está limpo. Pode commitar.
COMMIT;

-- =============================================================================
-- SE QUISER REVERTER (antes de rodar a Fase 2):
-- =============================================================================
-- INSERT INTO movimentacoes SELECT id, company_id, conta_bancaria_id,
--   conta_contabil_id, centro_custo_id, conta_receber_id, conta_pagar_id,
--   tipo, valor, data, descricao, origem, status_conciliacao,
--   categoria_aprendida, regra_id, created_at
-- FROM backup_dedup_fase1_movs_20260519;
-- =============================================================================
