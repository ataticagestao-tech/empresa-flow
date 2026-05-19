-- =============================================================================
-- FASE 3 — Limpar bank_reconciliation_matches com 2+ matches no mesmo bank_tx
-- =============================================================================
-- O QUE FAZ: pra cada bank_transaction com 2 ou mais rows em
-- bank_reconciliation_matches com status='matched', mantém apenas o MAIS RECENTE
-- (created_at DESC) e marca os outros como status='superseded'.
--
-- POR QUE 'superseded' em vez de DELETE: a tabela tem trigger de audit
-- (trg_audit_brm) — vamos manter o histórico mudando o status pra não disparar
-- alarmes desnecessários no audit_log.
--
-- BACKUP: tabela backup_dedup_fase3_matches_20260519 guarda cada row alterada.
-- =============================================================================

BEGIN;

-- ─── 1. Backup das rows que serão alteradas ──────────────────────────────
CREATE TABLE IF NOT EXISTS backup_dedup_fase3_matches_20260519 AS
WITH ranked AS (
    SELECT brm.*,
           ROW_NUMBER() OVER (PARTITION BY brm.bank_transaction_id
                              ORDER BY brm.created_at DESC, brm.id DESC) AS rn,
           COUNT(*) OVER (PARTITION BY brm.bank_transaction_id) AS total_no_bt
    FROM bank_reconciliation_matches brm
    WHERE brm.status = 'matched'
)
SELECT * FROM ranked WHERE total_no_bt > 1 AND rn > 1;

-- ─── 2. Quantos vão ser alterados? ───────────────────────────────────────
SELECT COUNT(*) AS matches_que_serao_marcados_superseded,
       COUNT(DISTINCT bank_transaction_id) AS bank_tx_afetados
FROM backup_dedup_fase3_matches_20260519;

-- ─── 3. UPDATE: marca como 'superseded' (mantém o mais recente como 'matched')
UPDATE bank_reconciliation_matches
   SET status = 'superseded'
 WHERE id IN (SELECT id FROM backup_dedup_fase3_matches_20260519);

-- ─── 4. Validação pós-update ─────────────────────────────────────────────
SELECT COUNT(*) AS bank_tx_ainda_com_2plus_matches FROM (
    SELECT bank_transaction_id FROM bank_reconciliation_matches
    WHERE status = 'matched'
    GROUP BY bank_transaction_id HAVING COUNT(*) > 1
) x;

-- Se = 0, está limpo.
COMMIT;

-- =============================================================================
-- SE QUISER REVERTER:
-- =============================================================================
-- UPDATE bank_reconciliation_matches
--    SET status = 'matched'
--  WHERE id IN (SELECT id FROM backup_dedup_fase3_matches_20260519);
-- =============================================================================
