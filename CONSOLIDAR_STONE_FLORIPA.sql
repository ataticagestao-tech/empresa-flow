-- =============================================================================
-- CONSOLIDAR contas Stone da 002 FLORIPA  (inativa  ->  ativa)
-- =============================================================================
-- ORIGEM  (inativa, sem ag/conta): 882b66dd-d503-42ff-8cad-5b870b61608a  "Stone"
-- DESTINO (ativa, ag 0001 cc 971877964): 19d55c1c-5732-42f2-87ac-0c5c5af2e158 "STONE"
-- company 002 Floripa: 75f93aa5-24e5-4990-b3ed-ed32a61924f1
--
-- O que faz: repõe TODAS as referências (movimentações, CR/CP, extrato,
-- conciliações, taxas) da conta ORIGEM para a DESTINO. A view
-- v_saldo_contas_bancarias recalcula o saldo sozinha (soma movimentações).
-- NÃO mexe em current_balance (a UI não usa esse campo) e NÃO deleta a conta
-- origem — ela só fica vazia e continua is_active=false.
--
-- Saldo esperado da DESTINO após consolidar = 5.922,00 + 105.465,97 = 111.387,97
-- (dinheiro histórico jan-abr; o gap de abr-mai fica para depois, como combinado)
--
-- RODE PARTE 1 PRIMEIRO, confira, e SÓ DEPOIS rode a PARTE 2.
-- =============================================================================


-- #############################################################################
-- PARTE 1 — PREFLIGHT (READ-ONLY). Quantas linhas serão movidas por tabela.
-- #############################################################################
WITH src AS (SELECT '882b66dd-d503-42ff-8cad-5b870b61608a'::uuid AS id)
SELECT 'movimentacoes'                AS tabela, count(*) AS linhas_na_origem FROM public.movimentacoes               WHERE conta_bancaria_id = (SELECT id FROM src)
UNION ALL SELECT 'contas_pagar',               count(*) FROM public.contas_pagar                WHERE conta_bancaria_id = (SELECT id FROM src)
UNION ALL SELECT 'contas_receber',             count(*) FROM public.contas_receber              WHERE conta_bancaria_id = (SELECT id FROM src)
UNION ALL SELECT 'conciliacao_bancaria',       count(*) FROM public.conciliacao_bancaria        WHERE conta_bancaria_id = (SELECT id FROM src)
UNION ALL SELECT 'bank_transactions',          count(*) FROM public.bank_transactions           WHERE bank_account_id  = (SELECT id FROM src)
UNION ALL SELECT 'bank_reconciliation_matches',count(*) FROM public.bank_reconciliation_matches WHERE bank_account_id  = (SELECT id FROM src)
UNION ALL SELECT 'configuracao_taxas_pagamento',count(*) FROM public.configuracao_taxas_pagamento WHERE bank_account_id = (SELECT id FROM src)
ORDER BY 1;

-- #############################################################################
-- PARTE 2 — APLICAÇÃO ATÔMICA. Confira a PARTE 1 e rode SÓ esta parte.
-- #############################################################################
DO $$
DECLARE
  v_source  uuid := '882b66dd-d503-42ff-8cad-5b870b61608a';  -- inativa
  v_target  uuid := '19d55c1c-5732-42f2-87ac-0c5c5af2e158';  -- ativa
  v_company uuid := '75f93aa5-24e5-4990-b3ed-ed32a61924f1';
  v_n int; v_left int;
BEGIN
  -- 0) TRAVAS DE SEGURANÇA -----------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM public.bank_accounts
                  WHERE id=v_source AND company_id=v_company AND is_active=false) THEN
    RAISE EXCEPTION 'ORIGEM inválida (não existe / não é da 002 / não está inativa). Abortado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bank_accounts
                  WHERE id=v_target AND company_id=v_company AND is_active=true) THEN
    RAISE EXCEPTION 'DESTINO inválida (não existe / não é da 002 / não está ativa). Abortado.';
  END IF;

  -- Válvula de escape OFICIAL do trigger trg_garantir_categoria_em_mov:
  -- algumas mov antigas estão SEM categoria (já fora do DRE). Como só estamos
  -- trocando a conta bancária (não a categoria), desligamos a checagem só nesta
  -- transação (is_local=true -> reseta sozinha ao terminar o bloco).
  PERFORM set_config('app.skip_categoria_garantia', 'true', true);

  -- 1) MOVIMENTAÇÕES (o que dirige o saldo na view) ----------------------------
  UPDATE public.movimentacoes SET conta_bancaria_id=v_target WHERE conta_bancaria_id=v_source;
  GET DIAGNOSTICS v_n = ROW_COUNT;  RAISE NOTICE 'movimentacoes movidas: %', v_n;

  -- 2) CONTAS A PAGAR / RECEBER -------------------------------------------------
  UPDATE public.contas_pagar   SET conta_bancaria_id=v_target WHERE conta_bancaria_id=v_source;
  GET DIAGNOSTICS v_n = ROW_COUNT;  RAISE NOTICE 'contas_pagar movidas: %', v_n;
  UPDATE public.contas_receber SET conta_bancaria_id=v_target WHERE conta_bancaria_id=v_source;
  GET DIAGNOSTICS v_n = ROW_COUNT;  RAISE NOTICE 'contas_receber movidas: %', v_n;

  -- 3) CONCILIAÇÃO BANCÁRIA -----------------------------------------------------
  UPDATE public.conciliacao_bancaria SET conta_bancaria_id=v_target WHERE conta_bancaria_id=v_source;
  GET DIAGNOSTICS v_n = ROW_COUNT;  RAISE NOTICE 'conciliacao_bancaria movidas: %', v_n;

  -- 4) MATCHES DE CONCILIAÇÃO ---------------------------------------------------
  UPDATE public.bank_reconciliation_matches SET bank_account_id=v_target WHERE bank_account_id=v_source;
  GET DIAGNOSTICS v_n = ROW_COUNT;  RAISE NOTICE 'bank_reconciliation_matches movidas: %', v_n;

  -- 5) EXTRATO BRUTO (bank_transactions) — guarda UNIQUE(bank_account_id, fit_id)
  UPDATE public.bank_transactions bt SET bank_account_id=v_target
   WHERE bt.bank_account_id=v_source
     AND NOT EXISTS (SELECT 1 FROM public.bank_transactions x
                      WHERE x.bank_account_id=v_target AND x.fit_id=bt.fit_id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  SELECT count(*) INTO v_left FROM public.bank_transactions WHERE bank_account_id=v_source;
  RAISE NOTICE 'bank_transactions movidas: % | deixadas por fit_id duplicado: %', v_n, v_left;

  -- 6) TAXAS DE PAGAMENTO — guarda UNIQUE(bank_account_id, meio_pagamento) ------
  UPDATE public.configuracao_taxas_pagamento c SET bank_account_id=v_target
   WHERE c.bank_account_id=v_source
     AND NOT EXISTS (SELECT 1 FROM public.configuracao_taxas_pagamento x
                      WHERE x.bank_account_id=v_target AND x.meio_pagamento=c.meio_pagamento);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  SELECT count(*) INTO v_left FROM public.configuracao_taxas_pagamento WHERE bank_account_id=v_source;
  RAISE NOTICE 'configuracao_taxas_pagamento movidas: % | deixadas por meio duplicado: %', v_n, v_left;

  -- 7) TRANSFERÊNCIAS INTERCOMPANY (se a tabela existir) -----------------------
  IF to_regclass('public.transferencias_intercompany') IS NOT NULL THEN
    UPDATE public.transferencias_intercompany SET conta_bancaria_orig=v_target WHERE conta_bancaria_orig=v_source;
    GET DIAGNOSTICS v_n = ROW_COUNT;  RAISE NOTICE 'transferencias_intercompany (orig) movidas: %', v_n;
    UPDATE public.transferencias_intercompany SET conta_bancaria_dest=v_target WHERE conta_bancaria_dest=v_source;
    GET DIAGNOSTICS v_n = ROW_COUNT;  RAISE NOTICE 'transferencias_intercompany (dest) movidas: %', v_n;
  END IF;

  -- 8) LOG DE IMPORT DE EMAIL (cosmético, se existir) --------------------------
  IF to_regclass('public.email_import_log') IS NOT NULL THEN
    UPDATE public.email_import_log SET bank_account_id=v_target WHERE bank_account_id=v_source;
    GET DIAGNOSTICS v_n = ROW_COUNT;  RAISE NOTICE 'email_import_log movidas: %', v_n;
  END IF;

  -- 9) TABELAS ANTIGAS depreciadas (só se ainda tiverem linhas) ----------------
  IF to_regclass('public.transactions') IS NOT NULL THEN
    UPDATE public.transactions SET bank_account_id=v_target WHERE bank_account_id=v_source;
    GET DIAGNOSTICS v_n = ROW_COUNT;  RAISE NOTICE 'transactions (legado) movidas: %', v_n;
  END IF;

  RAISE NOTICE 'CONSOLIDAÇÃO CONCLUÍDA. Conta origem % agora vazia (segue inativa).', v_source;
END $$;


-- #############################################################################
-- PARTE 3 — CONFERÊNCIA (READ-ONLY). Rode após a PARTE 2.
-- #############################################################################
-- Saldo recalculado pela view: a STONE ativa deve mostrar ~111.387,97
SELECT v.conta_bancaria_id, v.nome, v.saldo_atual, v.movimentado
  FROM public.v_saldo_contas_bancarias v
 WHERE v.company_id = '75f93aa5-24e5-4990-b3ed-ed32a61924f1'
   AND v.nome ILIKE '%stone%';

-- A origem (882b66dd) deve estar zerada em todas as tabelas:
-- (se algum count > 0 aqui, sobrou algo — me avise)
SELECT 'movimentacoes' AS t, count(*) FROM public.movimentacoes WHERE conta_bancaria_id='882b66dd-d503-42ff-8cad-5b870b61608a'
UNION ALL SELECT 'bank_transactions', count(*) FROM public.bank_transactions WHERE bank_account_id='882b66dd-d503-42ff-8cad-5b870b61608a'
UNION ALL SELECT 'recon_matches', count(*) FROM public.bank_reconciliation_matches WHERE bank_account_id='882b66dd-d503-42ff-8cad-5b870b61608a';
