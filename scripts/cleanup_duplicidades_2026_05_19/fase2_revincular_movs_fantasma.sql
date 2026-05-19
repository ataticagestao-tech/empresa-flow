-- =============================================================================
-- FASE 2 — Re-vincular as 18.302 movimentações fantasma a seus CR/CP candidatos
-- =============================================================================
-- O QUE FAZ: pra cada mov com origem='conta_receber'/'conta_pagar' MAS sem FK
-- preenchida, encontra o CR/CP da MESMA empresa com mesmo valor + data ±3 dias
-- e PREENCHE a FK. Pareamento 1-pra-1 via ROW_NUMBER para evitar criar
-- "2 movs no mesmo CR" (que seria recriar o problema da Fase 1).
--
-- REGRA DE PAREAMENTO:
--   - Só re-vincula se o CR/CP candidato AINDA NÃO TEM mov amarrada
--   - Se 2+ movs fantasma têm o mesmo candidato, só a mais próxima em data ganha
--   - Movs fantasma sem candidato compatível ficam órfãs (não tocadas)
--
-- BACKUP: tabela backup_dedup_fase2_revinculo_20260519 guarda mov_id +
-- conta_receber_id_novo / conta_pagar_id_novo (pra reverter UPDATE).
-- =============================================================================

BEGIN;

-- ─── 1. Backup das movs ANTES do UPDATE ──────────────────────────────────
CREATE TABLE IF NOT EXISTS backup_dedup_fase2_revinculo_20260519 AS
SELECT id AS mov_id,
       conta_receber_id AS cr_id_antigo,
       conta_pagar_id AS cp_id_antigo,
       company_id, conta_bancaria_id, data, valor, descricao, origem,
       NULL::uuid AS cr_id_novo,   -- vai ser populado abaixo
       NULL::uuid AS cp_id_novo
FROM movimentacoes
WHERE (origem = 'conta_receber' AND conta_receber_id IS NULL)
   OR (origem = 'conta_pagar' AND conta_pagar_id IS NULL);

-- ─── 2. CTE de pareamento CR ──────────────────────────────────────────────
-- Pra cada mov fantasma, ranqueia candidatos CR por proximidade de data.
-- Mantém só rn=1 (mais próximo) E cr_já_amarrado=0 (CR ainda sem mov).
CREATE TEMP TABLE tmp_pares_cr ON COMMIT DROP AS
WITH cr_ja_amarrado AS (
    SELECT DISTINCT conta_receber_id
    FROM movimentacoes
    WHERE conta_receber_id IS NOT NULL
),
candidatos AS (
    SELECT m.id AS mov_id, cr.id AS cr_id,
           ABS(cr.data_vencimento - m.data) AS dist_data,
           ROW_NUMBER() OVER (
               PARTITION BY m.id
               ORDER BY ABS(cr.data_vencimento - m.data) ASC, cr.created_at ASC
           ) AS rn_mov,
           ROW_NUMBER() OVER (
               PARTITION BY cr.id
               ORDER BY ABS(cr.data_vencimento - m.data) ASC, m.created_at ASC
           ) AS rn_cr
    FROM movimentacoes m
    JOIN contas_receber cr
      ON cr.company_id = m.company_id
     AND ABS(cr.valor - m.valor) < 0.01
     AND ABS(cr.data_vencimento - m.data) <= 3
     AND cr.deleted_at IS NULL
    WHERE m.origem = 'conta_receber'
      AND m.conta_receber_id IS NULL
      AND cr.id NOT IN (SELECT conta_receber_id FROM cr_ja_amarrado)
)
SELECT mov_id, cr_id FROM candidatos WHERE rn_mov = 1 AND rn_cr = 1;

-- ─── 3. UPDATE CR ────────────────────────────────────────────────────────
UPDATE movimentacoes m
   SET conta_receber_id = p.cr_id
  FROM tmp_pares_cr p
 WHERE m.id = p.mov_id;

-- Atualiza backup com os IDs novos
UPDATE backup_dedup_fase2_revinculo_20260519 b
   SET cr_id_novo = p.cr_id
  FROM tmp_pares_cr p
 WHERE b.mov_id = p.mov_id;

-- ─── 4. CTE de pareamento CP (espelho do CR) ─────────────────────────────
CREATE TEMP TABLE tmp_pares_cp ON COMMIT DROP AS
WITH cp_ja_amarrado AS (
    SELECT DISTINCT conta_pagar_id
    FROM movimentacoes
    WHERE conta_pagar_id IS NOT NULL
),
candidatos AS (
    SELECT m.id AS mov_id, cp.id AS cp_id,
           ROW_NUMBER() OVER (
               PARTITION BY m.id
               ORDER BY ABS(cp.data_vencimento - m.data) ASC, cp.created_at ASC
           ) AS rn_mov,
           ROW_NUMBER() OVER (
               PARTITION BY cp.id
               ORDER BY ABS(cp.data_vencimento - m.data) ASC, m.created_at ASC
           ) AS rn_cp
    FROM movimentacoes m
    JOIN contas_pagar cp
      ON cp.company_id = m.company_id
     AND ABS(cp.valor - m.valor) < 0.01
     AND ABS(cp.data_vencimento - m.data) <= 3
     AND cp.deleted_at IS NULL
    WHERE m.origem = 'conta_pagar'
      AND m.conta_pagar_id IS NULL
      AND cp.id NOT IN (SELECT conta_pagar_id FROM cp_ja_amarrado)
)
SELECT mov_id, cp_id FROM candidatos WHERE rn_mov = 1 AND rn_cp = 1;

-- ─── 5. UPDATE CP ────────────────────────────────────────────────────────
UPDATE movimentacoes m
   SET conta_pagar_id = p.cp_id
  FROM tmp_pares_cp p
 WHERE m.id = p.mov_id;

UPDATE backup_dedup_fase2_revinculo_20260519 b
   SET cp_id_novo = p.cp_id
  FROM tmp_pares_cp p
 WHERE b.mov_id = p.mov_id;

-- ─── 6. Relatório do que foi feito ───────────────────────────────────────
SELECT
    (SELECT COUNT(*) FROM backup_dedup_fase2_revinculo_20260519 WHERE cr_id_novo IS NOT NULL) AS movs_revinculadas_em_cr,
    (SELECT COUNT(*) FROM backup_dedup_fase2_revinculo_20260519 WHERE cp_id_novo IS NOT NULL) AS movs_revinculadas_em_cp,
    (SELECT COUNT(*) FROM movimentacoes WHERE origem = 'conta_receber' AND conta_receber_id IS NULL) AS cr_ainda_orfas,
    (SELECT COUNT(*) FROM movimentacoes WHERE origem = 'conta_pagar' AND conta_pagar_id IS NULL) AS cp_ainda_orfas,
    -- Verificação crítica: nenhum CR/CP pode ter 2+ movs após o revínculo
    (SELECT COUNT(*) FROM (SELECT conta_receber_id FROM movimentacoes
                            WHERE conta_receber_id IS NOT NULL
                            GROUP BY conta_receber_id HAVING COUNT(*) > 1) x) AS cr_com_2plus_movs,
    (SELECT COUNT(*) FROM (SELECT conta_pagar_id FROM movimentacoes
                            WHERE conta_pagar_id IS NOT NULL
                            GROUP BY conta_pagar_id HAVING COUNT(*) > 1) x) AS cp_com_2plus_movs;

-- Se cr_com_2plus_movs > 0 ou cp_com_2plus_movs > 0 → ROLLBACK e investigar.
-- Se = 0 → COMMIT (já incluído abaixo).

COMMIT;

-- =============================================================================
-- SE QUISER REVERTER (antes de rodar a Fase 3):
-- =============================================================================
-- UPDATE movimentacoes m
--    SET conta_receber_id = NULL
--   FROM backup_dedup_fase2_revinculo_20260519 b
--  WHERE m.id = b.mov_id
--    AND b.cr_id_novo IS NOT NULL;
--
-- UPDATE movimentacoes m
--    SET conta_pagar_id = NULL
--   FROM backup_dedup_fase2_revinculo_20260519 b
--  WHERE m.id = b.mov_id
--    AND b.cp_id_novo IS NOT NULL;
-- =============================================================================
