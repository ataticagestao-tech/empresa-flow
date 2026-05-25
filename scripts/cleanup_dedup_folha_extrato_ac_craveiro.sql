-- =============================================================================
-- CLEANUP v2: dedup pares (CP da folha, CP do extrato) na A C Craveiro
-- =============================================================================
-- Heurística corrigida (v2): órfão identificado por credor_nome cru do banco
-- (DEBITO TRANSFERENCIA, DEB PIX, etc.) + descricao IS NULL, NÃO por
-- created_via_bank_tx_id (que estava null nos órfãos visíveis).
--
-- Pré-requisito: aplicar migration 20260525120000_auto_conciliar_match_cp_pago.sql
-- antes pra impedir que novos órfãos sejam criados.
--
-- Etapas:
-- 1) Localiza A C Craveiro
-- 2) Cria backup tables (idempotente)
-- 3) Identifica pares (legítimo, órfão) e materializa em temp table
-- 4) Backup dos órfãos antes de mexer
-- 5) Redireciona bank_reconciliation_matches.payable_id pro legítimo
-- 6) Redireciona bank_transactions.reconciled_payable_id pro legítimo
-- 7) Hard-deleta movimentações do órfão (mov não tem soft-delete)
-- 8) Soft-deleta CP órfão (deleted_at = NOW())
--
-- TRANSACIONAL: DO block. Se algo der erro, ROLLBACK total.
-- IDEMPOTENTE: rodar duas vezes não faz nada na segunda (órfãos soft-deletados).
-- =============================================================================

DO $$
DECLARE
    v_company_id UUID;
    v_company_nome TEXT;
    v_pares_count INT;
    v_movs_count INT;
    v_matches_count INT;
    v_tx_count INT;
    v_cps_count INT;
BEGIN
    -- ── 1) Localiza A C Craveiro
    SELECT id, razao_social INTO v_company_id, v_company_nome
      FROM companies
     WHERE razao_social ILIKE '%craveiro%'
       AND is_active = TRUE
     ORDER BY created_at ASC
     LIMIT 1;

    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'Empresa A C Craveiro não encontrada';
    END IF;

    RAISE NOTICE 'Empresa: % (id=%)', v_company_nome, v_company_id;

    -- ── 2) Backup tables (idempotente)
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables WHERE tablename = 'backup_dedup_folha_extrato_v2_20260525'
    ) THEN
        EXECUTE 'CREATE TABLE backup_dedup_folha_extrato_v2_20260525 AS
                 SELECT * FROM contas_pagar WHERE FALSE';
        EXECUTE 'CREATE TABLE backup_dedup_folha_extrato_v2_movs_20260525 AS
                 SELECT * FROM movimentacoes WHERE FALSE';
        EXECUTE 'CREATE TABLE backup_dedup_folha_extrato_v2_matches_20260525 AS
                 SELECT * FROM bank_reconciliation_matches WHERE FALSE';
        EXECUTE 'CREATE TABLE backup_dedup_folha_extrato_v2_bank_tx_20260525 AS
                 SELECT * FROM bank_transactions WHERE FALSE';
        RAISE NOTICE 'Tabelas de backup v2 criadas';
    END IF;

    -- ── 3) Identifica pares e materializa em temp table
    DROP TABLE IF EXISTS tmp_pares_dedup_v2;
    CREATE TEMP TABLE tmp_pares_dedup_v2 AS
    WITH funcionarios AS (
        SELECT id, COALESCE(nome_completo, name) AS nome_original, cpf
          FROM employees
         WHERE company_id = v_company_id
    ),
    cps_empresa AS (
        SELECT cp.id, cp.valor_pago, cp.data_pagamento,
               cp.credor_cpf_cnpj, cp.credor_nome, cp.descricao,
               UPPER(COALESCE(cp.credor_nome, '')) AS credor_upper,
               (cp.descricao IS NULL OR TRIM(cp.descricao) = '') AS sem_descricao
          FROM contas_pagar cp
         WHERE cp.company_id = v_company_id
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
           leg.id   AS legitimo_id,
           orfa.id  AS orfao_id,
           orfa.valor_pago AS valor,
           leg.data_pagamento AS data_legitimo,
           orfa.data_pagamento AS data_orfao,
           ABS(leg.data_pagamento - orfa.data_pagamento) AS dias_diff,
           func.nome_original AS funcionario
      FROM cps_orfaos orfa
      JOIN cps_legitimos leg
        ON ABS(leg.valor_pago - orfa.valor_pago) < 0.01
       AND ABS(leg.data_pagamento - orfa.data_pagamento) <= 3
       AND leg.id <> orfa.id
      JOIN funcionarios func
        ON func.nome_original IS NOT NULL
       AND LENGTH(func.nome_original) >= 5
       AND UPPER(orfa.credor_nome) LIKE '%' || UPPER(SPLIT_PART(func.nome_original, ' ', 1)) || '%'
       AND (
           UPPER(leg.credor_nome) LIKE '%' || UPPER(SPLIT_PART(func.nome_original, ' ', 1)) || '%'
           OR UPPER(leg.descricao) LIKE '%' || UPPER(SPLIT_PART(func.nome_original, ' ', 1)) || '%'
       )
     ORDER BY orfa.id, ABS(leg.data_pagamento - orfa.data_pagamento) ASC, leg.id;

    SELECT COUNT(*) INTO v_pares_count FROM tmp_pares_dedup_v2;
    RAISE NOTICE '% pares identificados', v_pares_count;

    IF v_pares_count = 0 THEN
        RAISE NOTICE 'Nada a fazer.';
        RETURN;
    END IF;

    -- ── 4) Backup dos órfãos antes de mexer
    INSERT INTO backup_dedup_folha_extrato_v2_20260525
    SELECT cp.* FROM contas_pagar cp
     JOIN tmp_pares_dedup_v2 p ON p.orfao_id = cp.id;

    INSERT INTO backup_dedup_folha_extrato_v2_movs_20260525
    SELECT m.* FROM movimentacoes m
     JOIN tmp_pares_dedup_v2 p ON p.orfao_id = m.conta_pagar_id;

    INSERT INTO backup_dedup_folha_extrato_v2_matches_20260525
    SELECT brm.* FROM bank_reconciliation_matches brm
     JOIN tmp_pares_dedup_v2 p ON p.orfao_id = brm.payable_id;

    INSERT INTO backup_dedup_folha_extrato_v2_bank_tx_20260525
    SELECT bt.* FROM bank_transactions bt
     JOIN tmp_pares_dedup_v2 p ON p.orfao_id = bt.reconciled_payable_id;

    RAISE NOTICE 'Backups inseridos';

    -- ── 5) Redireciona bank_reconciliation_matches do órfão pro legítimo
    UPDATE bank_reconciliation_matches brm
       SET payable_id = p.legitimo_id,
           match_type = 'auto_link_cleanup_v2'
      FROM tmp_pares_dedup_v2 p
     WHERE brm.payable_id = p.orfao_id
       AND brm.company_id = v_company_id
       AND NOT EXISTS (
           SELECT 1 FROM bank_reconciliation_matches brm2
            WHERE brm2.payable_id = p.legitimo_id
              AND brm2.bank_transaction_id = brm.bank_transaction_id
       );
    GET DIAGNOSTICS v_matches_count = ROW_COUNT;
    RAISE NOTICE '% bank_reconciliation_matches redirecionados', v_matches_count;

    -- Marca como superseded os matches que não puderam ser redirecionados
    UPDATE bank_reconciliation_matches brm
       SET status = 'superseded'
      FROM tmp_pares_dedup_v2 p
     WHERE brm.payable_id = p.orfao_id
       AND brm.company_id = v_company_id;

    -- ── 6) Redireciona bank_transactions.reconciled_payable_id
    UPDATE bank_transactions bt
       SET reconciled_payable_id = p.legitimo_id
      FROM tmp_pares_dedup_v2 p
     WHERE bt.reconciled_payable_id = p.orfao_id
       AND bt.company_id = v_company_id;
    GET DIAGNOSTICS v_tx_count = ROW_COUNT;
    RAISE NOTICE '% bank_transactions redirecionados', v_tx_count;

    -- ── 7) Hard-delete movimentações do órfão
    DELETE FROM movimentacoes m
     USING tmp_pares_dedup_v2 p
     WHERE m.conta_pagar_id = p.orfao_id
       AND m.company_id = v_company_id;
    GET DIAGNOSTICS v_movs_count = ROW_COUNT;
    RAISE NOTICE '% movimentações órfãs hard-deletadas', v_movs_count;

    -- ── 8) Soft-delete CPs órfãos
    UPDATE contas_pagar cp
       SET deleted_at = NOW()
      FROM tmp_pares_dedup_v2 p
     WHERE cp.id = p.orfao_id
       AND cp.company_id = v_company_id;
    GET DIAGNOSTICS v_cps_count = ROW_COUNT;
    RAISE NOTICE '% CPs órfãos soft-deletados', v_cps_count;

    RAISE NOTICE '──────────────────────────────────────────';
    RAISE NOTICE 'RESUMO A C Craveiro:';
    RAISE NOTICE '  Pares identificados:        %', v_pares_count;
    RAISE NOTICE '  Matches redirecionados:     %', v_matches_count;
    RAISE NOTICE '  Bank tx redirecionados:     %', v_tx_count;
    RAISE NOTICE '  Movs órfãs deletadas:       %', v_movs_count;
    RAISE NOTICE '  CPs órfãos soft-deletados:  %', v_cps_count;
    RAISE NOTICE '──────────────────────────────────────────';
END $$;

-- ── Verificação pós-cleanup: órfãos restantes (deve voltar 0)
WITH co AS (
    SELECT id FROM companies WHERE razao_social ILIKE '%craveiro%'
       AND is_active = TRUE ORDER BY created_at ASC LIMIT 1
)
SELECT 'Órfãos restantes (deve ser 0):' AS check_, COUNT(*) AS qtd
  FROM contas_pagar cp
 WHERE cp.company_id = (SELECT id FROM co)
   AND cp.status = 'pago'
   AND cp.deleted_at IS NULL
   AND (cp.descricao IS NULL OR TRIM(cp.descricao) = '')
   AND (
       UPPER(cp.credor_nome) LIKE '%DEBITO TRANSFERENCIA%'
    OR UPPER(cp.credor_nome) LIKE '%DEB PIX%'
   );
