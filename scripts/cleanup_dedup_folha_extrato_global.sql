-- =============================================================================
-- CLEANUP GLOBAL: dedup pares (folha, extrato) em TODAS as empresas
-- =============================================================================
-- Mesma heurística do cleanup A C Craveiro, agora sem filtro de empresa.
-- Pré-requisito: aplicar migration 20260525120000_auto_conciliar_match_cp_pago.sql
-- ANTES (impede que novos órfãos sejam criados).
--
-- TRANSACIONAL + IDEMPOTENTE.
-- =============================================================================

DO $$
DECLARE
    v_pares_count INT;
    v_movs_count INT;
    v_matches_count INT;
    v_tx_count INT;
    v_cps_count INT;
BEGIN
    -- ── Backup tables (idempotente)
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables WHERE tablename = 'backup_dedup_folha_extrato_global_20260525'
    ) THEN
        EXECUTE 'CREATE TABLE backup_dedup_folha_extrato_global_20260525 AS
                 SELECT * FROM contas_pagar WHERE FALSE';
        EXECUTE 'CREATE TABLE backup_dedup_folha_extrato_global_movs_20260525 AS
                 SELECT * FROM movimentacoes WHERE FALSE';
        EXECUTE 'CREATE TABLE backup_dedup_folha_extrato_global_matches_20260525 AS
                 SELECT * FROM bank_reconciliation_matches WHERE FALSE';
        EXECUTE 'CREATE TABLE backup_dedup_folha_extrato_global_bank_tx_20260525 AS
                 SELECT * FROM bank_transactions WHERE FALSE';
        RAISE NOTICE 'Backup tables global criadas';
    END IF;

    -- ── Identifica pares de TODAS empresas
    DROP TABLE IF EXISTS tmp_pares_dedup_global;
    CREATE TEMP TABLE tmp_pares_dedup_global AS
    WITH funcionarios AS (
        SELECT id, company_id, COALESCE(nome_completo, name) AS nome_original
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
    cps_orfaos    AS (SELECT * FROM classified WHERE tipo = 'orfao')
    SELECT DISTINCT ON (orfa.id)
           orfa.company_id,
           leg.id   AS legitimo_id,
           orfa.id  AS orfao_id,
           orfa.valor_pago AS valor,
           leg.data_pagamento AS data_legitimo,
           orfa.data_pagamento AS data_orfao,
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
     ORDER BY orfa.id, ABS(leg.data_pagamento - orfa.data_pagamento) ASC, leg.id;

    SELECT COUNT(*) INTO v_pares_count FROM tmp_pares_dedup_global;
    RAISE NOTICE '% pares identificados em todas empresas', v_pares_count;

    IF v_pares_count = 0 THEN
        RAISE NOTICE 'Nada a fazer.';
        RETURN;
    END IF;

    -- ── Backup
    INSERT INTO backup_dedup_folha_extrato_global_20260525
    SELECT cp.* FROM contas_pagar cp
     JOIN tmp_pares_dedup_global p ON p.orfao_id = cp.id;

    INSERT INTO backup_dedup_folha_extrato_global_movs_20260525
    SELECT m.* FROM movimentacoes m
     JOIN tmp_pares_dedup_global p ON p.orfao_id = m.conta_pagar_id;

    INSERT INTO backup_dedup_folha_extrato_global_matches_20260525
    SELECT brm.* FROM bank_reconciliation_matches brm
     JOIN tmp_pares_dedup_global p ON p.orfao_id = brm.payable_id;

    INSERT INTO backup_dedup_folha_extrato_global_bank_tx_20260525
    SELECT bt.* FROM bank_transactions bt
     JOIN tmp_pares_dedup_global p ON p.orfao_id = bt.reconciled_payable_id;

    RAISE NOTICE 'Backups inseridos';

    -- ── Redireciona matches
    UPDATE bank_reconciliation_matches brm
       SET payable_id = p.legitimo_id,
           match_type = 'auto_link_cleanup_global'
      FROM tmp_pares_dedup_global p
     WHERE brm.payable_id = p.orfao_id
       AND brm.company_id = p.company_id
       AND NOT EXISTS (
           SELECT 1 FROM bank_reconciliation_matches brm2
            WHERE brm2.payable_id = p.legitimo_id
              AND brm2.bank_transaction_id = brm.bank_transaction_id
       );
    GET DIAGNOSTICS v_matches_count = ROW_COUNT;
    RAISE NOTICE '% matches redirecionados', v_matches_count;

    UPDATE bank_reconciliation_matches brm
       SET status = 'superseded'
      FROM tmp_pares_dedup_global p
     WHERE brm.payable_id = p.orfao_id
       AND brm.company_id = p.company_id;

    -- ── Redireciona bank_transactions
    UPDATE bank_transactions bt
       SET reconciled_payable_id = p.legitimo_id
      FROM tmp_pares_dedup_global p
     WHERE bt.reconciled_payable_id = p.orfao_id
       AND bt.company_id = p.company_id;
    GET DIAGNOSTICS v_tx_count = ROW_COUNT;
    RAISE NOTICE '% bank_transactions redirecionados', v_tx_count;

    -- ── Hard-delete movs do órfão
    DELETE FROM movimentacoes m
     USING tmp_pares_dedup_global p
     WHERE m.conta_pagar_id = p.orfao_id
       AND m.company_id = p.company_id;
    GET DIAGNOSTICS v_movs_count = ROW_COUNT;
    RAISE NOTICE '% movs órfãs deletadas', v_movs_count;

    -- ── Soft-delete CPs órfãos
    UPDATE contas_pagar cp
       SET deleted_at = NOW()
      FROM tmp_pares_dedup_global p
     WHERE cp.id = p.orfao_id
       AND cp.company_id = p.company_id;
    GET DIAGNOSTICS v_cps_count = ROW_COUNT;
    RAISE NOTICE '% CPs órfãos soft-deletados', v_cps_count;

    RAISE NOTICE '──────────────────────────────────────────';
    RAISE NOTICE 'RESUMO GLOBAL:';
    RAISE NOTICE '  Pares identificados:        %', v_pares_count;
    RAISE NOTICE '  Matches redirecionados:     %', v_matches_count;
    RAISE NOTICE '  Bank tx redirecionados:     %', v_tx_count;
    RAISE NOTICE '  Movs órfãs deletadas:       %', v_movs_count;
    RAISE NOTICE '  CPs órfãos soft-deletados:  %', v_cps_count;
    RAISE NOTICE '──────────────────────────────────────────';
END $$;

-- ── Resumo final por empresa (CPs restantes com texto cru, agora únicos)
SELECT
    c.razao_social AS empresa,
    COUNT(*) AS cps_pix_brutos_restantes,
    SUM(cp.valor_pago) AS valor_total
  FROM contas_pagar cp
  JOIN companies c ON c.id = cp.company_id
 WHERE cp.status = 'pago'
   AND cp.deleted_at IS NULL
   AND (cp.descricao IS NULL OR TRIM(cp.descricao) = '')
   AND (UPPER(cp.credor_nome) LIKE '%DEBITO TRANSFERENCIA%'
        OR UPPER(cp.credor_nome) LIKE '%DEB PIX%')
 GROUP BY c.razao_social
 ORDER BY cps_pix_brutos_restantes DESC;
