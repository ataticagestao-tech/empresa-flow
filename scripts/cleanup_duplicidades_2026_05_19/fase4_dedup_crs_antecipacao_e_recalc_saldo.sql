-- =============================================================================
-- FASE 4 — Soft-delete dos 26 CRs "Antecipação" duplicados + Recalc saldos
-- =============================================================================
-- O QUE FAZ:
--   PARTE A: pra cada grupo de CRs com assinatura do bug do bulk
--   (mesmo company_id + valor + data + criados no mesmo segundo + pagador
--   começando com "Recebimento"), MANTÉM o que tem created_via_bank_tx_id
--   preenchido (foi conciliado pelo bulk e ficou com o bank_tx amarrado) e
--   SOFT-DELETA os demais.
--   Também deleta as movs vinculadas aos CRs soft-deletados.
--
--   PARTE B: recalcula current_balance de TODAS as contas bancárias usando
--   initial_balance + SUM(movs signed). Garante que o saldo na tela bate com
--   o realmente movimentado.
--
-- TRIGGER: bloquear_edicao_pago bloqueia UPDATE genérico em CR pago, mas
-- libera UPDATE de deleted_at via soft_delete_cr trigger (ver
-- 20260325180000_audit_imutabilidade.sql). NÃO precisa DISABLE TRIGGER.
-- =============================================================================

BEGIN;

-- ═══ PARTE A — DEDUP DOS CRS "ANTECIPAÇÃO" ═══════════════════════════════

-- ─── A1. Identifica os CRs que serão soft-deletados ──────────────────────
CREATE TEMP TABLE tmp_crs_a_deletar ON COMMIT DROP AS
WITH grupos AS (
    SELECT company_id, valor, data_vencimento,
           DATE_TRUNC('second', created_at) AS criado_segundo
    FROM contas_receber
    WHERE deleted_at IS NULL
      AND pagador_nome ILIKE 'Recebimento%'
    GROUP BY company_id, valor, data_vencimento, DATE_TRUNC('second', created_at)
    HAVING COUNT(*) > 1
       AND COUNT(DISTINCT pagador_nome) <= 2
),
ranked AS (
    SELECT cr.id, cr.company_id, cr.valor, cr.data_vencimento, cr.pagador_nome,
           cr.created_via_bank_tx_id,
           ROW_NUMBER() OVER (
               PARTITION BY cr.company_id, cr.valor, cr.data_vencimento,
                            DATE_TRUNC('second', cr.created_at)
               -- Prioriza manter o que tem via_extrato preenchido (já amarrado
               -- ao bank_tx), depois o mais antigo.
               ORDER BY (cr.created_via_bank_tx_id IS NULL),
                        cr.created_at ASC, cr.id ASC
           ) AS rn
    FROM contas_receber cr
    JOIN grupos g
      ON g.company_id = cr.company_id
     AND g.valor = cr.valor
     AND g.data_vencimento = cr.data_vencimento
     AND g.criado_segundo = DATE_TRUNC('second', cr.created_at)
    WHERE cr.deleted_at IS NULL
      AND cr.pagador_nome ILIKE 'Recebimento%'
)
SELECT id, company_id, valor, data_vencimento, pagador_nome,
       created_via_bank_tx_id
FROM ranked
WHERE rn > 1;  -- mantém rn=1, deleta restantes

-- ─── A2. Backup dos CRs antes do soft-delete ─────────────────────────────
CREATE TABLE IF NOT EXISTS backup_dedup_fase4_crs_20260519 AS
SELECT cr.* FROM contas_receber cr
JOIN tmp_crs_a_deletar t ON t.id = cr.id;

-- ─── A3. Backup das movs vinculadas aos CRs que vão sumir ────────────────
CREATE TABLE IF NOT EXISTS backup_dedup_fase4_movs_20260519 AS
SELECT m.* FROM movimentacoes m
WHERE m.conta_receber_id IN (SELECT id FROM tmp_crs_a_deletar);

-- ─── A4. Hard-delete das movs vinculadas (movs não têm soft-delete) ──────
DELETE FROM movimentacoes
WHERE conta_receber_id IN (SELECT id FROM tmp_crs_a_deletar);

-- ─── A5. Soft-delete dos CRs ─────────────────────────────────────────────
UPDATE contas_receber
   SET deleted_at = NOW(),
       deleted_by = NULL  -- script de sistema
 WHERE id IN (SELECT id FROM tmp_crs_a_deletar);

-- ─── A6. Relatório Parte A ───────────────────────────────────────────────
SELECT
    (SELECT COUNT(*) FROM backup_dedup_fase4_crs_20260519) AS crs_soft_deletados,
    (SELECT COUNT(*) FROM backup_dedup_fase4_movs_20260519) AS movs_deletadas;


-- ═══ PARTE B — RECALC DE current_balance DE TODAS AS CONTAS ══════════════

-- ─── B1. Backup dos saldos atuais ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS backup_dedup_fase4_saldos_20260519 AS
SELECT id AS bank_account_id, name, initial_balance,
       current_balance AS saldo_antigo,
       NULL::numeric AS saldo_recalculado,
       NULL::numeric AS diferenca
FROM bank_accounts;

-- ─── B2. Recalcula current_balance = initial_balance + SUM(movs signed) ──
WITH somas AS (
    SELECT conta_bancaria_id,
           SUM(CASE WHEN tipo = 'credito' THEN valor ELSE -valor END) AS soma
    FROM movimentacoes
    GROUP BY conta_bancaria_id
)
UPDATE bank_accounts ba
   SET current_balance = COALESCE(ba.initial_balance, 0) + COALESCE(s.soma, 0),
       updated_at = NOW()
  FROM somas s
 WHERE s.conta_bancaria_id = ba.id;

-- Caso de borda: conta sem movs → o LEFT JOIN não bate; recalcula como inicial
UPDATE bank_accounts ba
   SET current_balance = COALESCE(ba.initial_balance, 0),
       updated_at = NOW()
 WHERE NOT EXISTS (
   SELECT 1 FROM movimentacoes m WHERE m.conta_bancaria_id = ba.id
 );

-- ─── B3. Popula backup com saldo recalculado pra ter o "antes vs depois" ──
UPDATE backup_dedup_fase4_saldos_20260519 b
   SET saldo_recalculado = ba.current_balance,
       diferenca = ba.current_balance - b.saldo_antigo
  FROM bank_accounts ba
 WHERE ba.id = b.bank_account_id;

-- ─── B4. Relatório de diferenças de saldo ────────────────────────────────
SELECT bank_account_id, name,
       saldo_antigo, saldo_recalculado, diferenca
FROM backup_dedup_fase4_saldos_20260519
WHERE ABS(COALESCE(diferenca, 0)) > 0.01
ORDER BY ABS(diferenca) DESC;

-- ─── B5. Refresh das materialized views financeiras ──────────────────────
-- Atualiza dashboards (DRE, fluxo de caixa, etc) com os novos saldos.
SELECT refresh_mvs_financeiras();

COMMIT;


-- =============================================================================
-- VALIDAÇÃO FINAL — Roda essa query depois de commitar pra ver o estrago final
-- =============================================================================
-- SELECT
--     (SELECT COUNT(*) FROM (SELECT conta_receber_id FROM movimentacoes
--                              WHERE conta_receber_id IS NOT NULL
--                              GROUP BY conta_receber_id HAVING COUNT(*) > 1) x) AS cr_com_2plus_movs,
--     (SELECT COUNT(*) FROM (SELECT conta_pagar_id FROM movimentacoes
--                              WHERE conta_pagar_id IS NOT NULL
--                              GROUP BY conta_pagar_id HAVING COUNT(*) > 1) x) AS cp_com_2plus_movs,
--     (SELECT COUNT(*) FROM movimentacoes WHERE origem = 'conta_receber' AND conta_receber_id IS NULL) AS movs_fantasma_cr_restantes,
--     (SELECT COUNT(*) FROM movimentacoes WHERE origem = 'conta_pagar' AND conta_pagar_id IS NULL) AS movs_fantasma_cp_restantes,
--     (SELECT COUNT(*) FROM (SELECT bank_transaction_id FROM bank_reconciliation_matches
--                              WHERE status = 'matched'
--                              GROUP BY bank_transaction_id HAVING COUNT(*) > 1) x) AS bank_tx_com_2plus_matches,
--     (SELECT COUNT(*) FROM bank_accounts ba
--        LEFT JOIN (SELECT conta_bancaria_id,
--                          SUM(CASE WHEN tipo='credito' THEN valor ELSE -valor END) AS soma
--                     FROM movimentacoes GROUP BY conta_bancaria_id) m
--               ON m.conta_bancaria_id = ba.id
--        WHERE ba.is_active = TRUE
--          AND ABS(COALESCE(ba.current_balance,0) - (COALESCE(ba.initial_balance,0) + COALESCE(m.soma,0))) > 0.01) AS contas_com_saldo_errado;
-- Tudo deve estar em 0 (exceto movs_fantasma se houver casos sem candidato).
-- =============================================================================


-- =============================================================================
-- SE QUISER REVERTER A FASE 4 INTEIRA:
-- =============================================================================
-- BEGIN;
-- -- Restaura CRs soft-deletados
-- UPDATE contas_receber cr SET deleted_at = NULL, deleted_by = NULL
--  WHERE cr.id IN (SELECT id FROM backup_dedup_fase4_crs_20260519);
-- -- Re-insere movs deletadas
-- INSERT INTO movimentacoes SELECT * FROM backup_dedup_fase4_movs_20260519;
-- -- Restaura saldos antigos
-- UPDATE bank_accounts ba SET current_balance = b.saldo_antigo, updated_at = NOW()
--   FROM backup_dedup_fase4_saldos_20260519 b
--  WHERE ba.id = b.bank_account_id;
-- COMMIT;
-- =============================================================================
