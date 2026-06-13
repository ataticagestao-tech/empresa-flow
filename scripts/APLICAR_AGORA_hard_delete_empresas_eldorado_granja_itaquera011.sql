-- ============================================================================
-- HARD DELETE de empresas: 001 ELDORADO + 004 GRANJA VIANA + 011 ITAQUERA 01
-- Disparado pela Izabel em 2026-05-26. IRREVERSÍVEL.
--
-- Ordem topológica derivada do mapa de FKs internas não-cascade:
--   netas (itens/logs) -> transacionais (movs, contas, bank) -> estoque ->
--   cadastros (products, chart, centros, clients, suppliers, bank_accounts) ->
--   companies (cascade limpa o resto: categories, crm, whatsapp, nfse, etc).
--
-- Triggers de usuário desabilitados durante a operação (forcar_soft_delete e
-- bloquear_edicao_pago bloqueiam os DELETE/SET NULL). Tudo numa transação:
-- se falhar, reverte e os triggers voltam ativos.
--
-- Proteção 011: filtro exige '011' E 'itaquera' juntos.
-- ============================================================================

DO $$
DECLARE
  v_ids UUID[];
  v_n INT;
  r RECORD;
BEGIN
  SELECT array_agg(id) INTO v_ids
  FROM companies c
  WHERE
    LOWER(COALESCE(c.nome_fantasia,'') || ' ' || COALESCE(c.razao_social,'')) LIKE '%eldorado%'
    OR LOWER(COALESCE(c.nome_fantasia,'') || ' ' || COALESCE(c.razao_social,'')) LIKE '%granja%'
    OR (LOWER(COALESCE(c.nome_fantasia,'') || ' ' || COALESCE(c.razao_social,'')) LIKE '%011%'
        AND LOWER(COALESCE(c.nome_fantasia,'') || ' ' || COALESCE(c.razao_social,'')) LIKE '%itaquera%');

  IF v_ids IS NULL OR array_length(v_ids, 1) = 0 THEN
    RAISE EXCEPTION 'Nenhuma empresa encontrada';
  END IF;
  v_n := array_length(v_ids, 1);

  -- Desabilita triggers de usuário em todas as filhas de companies
  FOR r IN
    SELECT DISTINCT tc.table_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = 'companies'
      AND tc.table_schema = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', r.table_name);
  END LOOP;

  -- ── NETAS (sem company_id) — deletar via os pais ─────────────────────────
  DELETE FROM vendas_itens            WHERE venda_id        IN (SELECT id FROM vendas          WHERE company_id = ANY(v_ids));
  DELETE FROM regua_cobranca_log      WHERE conta_receber_id IN (SELECT id FROM contas_receber WHERE company_id = ANY(v_ids));
  DELETE FROM entradas_estoque_itens  WHERE produto_id      IN (SELECT id FROM products        WHERE company_id = ANY(v_ids));
  DELETE FROM inventario_itens        WHERE produto_id      IN (SELECT id FROM products        WHERE company_id = ANY(v_ids));
  DELETE FROM ordens_compra_itens     WHERE produto_id      IN (SELECT id FROM products        WHERE company_id = ANY(v_ids));
  DELETE FROM orcamento_itens
    WHERE conta_contabil_id IN (SELECT id FROM chart_of_accounts WHERE company_id = ANY(v_ids))
       OR centro_custo_id   IN (SELECT id FROM centros_custo     WHERE company_id = ANY(v_ids));
  DELETE FROM employee_benefits_lancamentos WHERE company_id = ANY(v_ids);

  -- ── TRANSACIONAIS bancárias (refs cruzadas a bank_accounts) ──────────────
  DELETE FROM movimentacoes
    WHERE company_id = ANY(v_ids)
       OR conta_bancaria_id IN (SELECT id FROM bank_accounts WHERE company_id = ANY(v_ids));
  DELETE FROM bank_reconciliation_matches     WHERE company_id = ANY(v_ids);
  DELETE FROM bank_reconciliation_adjustments WHERE company_id = ANY(v_ids);
  DELETE FROM conciliacao_bancaria
    WHERE company_id = ANY(v_ids)
       OR conta_bancaria_id IN (SELECT id FROM bank_accounts WHERE company_id = ANY(v_ids));
  DELETE FROM ofx_import_history
    WHERE company_id = ANY(v_ids)
       OR bank_account_id IN (SELECT id FROM bank_accounts WHERE company_id = ANY(v_ids));
  DELETE FROM transferencias_intercompany
    WHERE company_origem_id = ANY(v_ids) OR company_destino_id = ANY(v_ids)
       OR conta_bancaria_orig IN (SELECT id FROM bank_accounts WHERE company_id = ANY(v_ids))
       OR conta_bancaria_dest IN (SELECT id FROM bank_accounts WHERE company_id = ANY(v_ids));
  DELETE FROM bank_statement_files WHERE company_id = ANY(v_ids);
  DELETE FROM bank_transactions    WHERE company_id = ANY(v_ids);

  -- ── Legados em inglês (refs a bank_accounts, products, clients, suppliers) ─
  DELETE FROM accounts_payable    WHERE company_id = ANY(v_ids);
  DELETE FROM accounts_receivable WHERE company_id = ANY(v_ids);
  DELETE FROM transactions        WHERE company_id = ANY(v_ids);
  DELETE FROM invoices            WHERE company_id = ANY(v_ids);
  DELETE FROM facts               WHERE company_id = ANY(v_ids);

  -- ── Estoque (refs a products, suppliers, centros) ────────────────────────
  DELETE FROM saidas_estoque    WHERE company_id = ANY(v_ids);
  DELETE FROM entradas_estoque  WHERE company_id = ANY(v_ids);
  DELETE FROM ordens_compra     WHERE company_id = ANY(v_ids);
  DELETE FROM inventario        WHERE company_id = ANY(v_ids);

  -- ── Contas / fiscal / folha (refs a bank, chart, centros, products, vendas) ─
  DELETE FROM contas_pagar          WHERE company_id = ANY(v_ids);
  DELETE FROM contas_receber        WHERE company_id = ANY(v_ids);
  DELETE FROM contratos_recorrentes WHERE company_id = ANY(v_ids);
  DELETE FROM orcamento             WHERE company_id = ANY(v_ids);
  DELETE FROM notas_fiscais         WHERE company_id = ANY(v_ids);
  DELETE FROM importacao_xml        WHERE company_id = ANY(v_ids);
  DELETE FROM folha_pagamento       WHERE company_id = ANY(v_ids);
  DELETE FROM encargos              WHERE company_id = ANY(v_ids);
  DELETE FROM admissoes_demissoes   WHERE company_id = ANY(v_ids);
  DELETE FROM apuracao_impostos     WHERE company_id = ANY(v_ids);
  DELETE FROM employee_benefits_config WHERE company_id = ANY(v_ids);

  -- ── Vendas (ref a clients) ───────────────────────────────────────────────
  DELETE FROM vendas WHERE company_id = ANY(v_ids);

  -- ── Cadastros-pai ────────────────────────────────────────────────────────
  DELETE FROM products          WHERE company_id = ANY(v_ids);
  DELETE FROM chart_of_accounts WHERE company_id = ANY(v_ids);
  DELETE FROM centros_custo     WHERE company_id = ANY(v_ids);
  DELETE FROM clients           WHERE company_id = ANY(v_ids);
  DELETE FROM suppliers         WHERE company_id = ANY(v_ids);
  DELETE FROM bank_accounts     WHERE company_id = ANY(v_ids);

  -- ── Empresa (cascade limpa todo o resto) ─────────────────────────────────
  DELETE FROM companies WHERE id = ANY(v_ids);

  -- Reativa triggers
  FOR r IN
    SELECT DISTINCT tc.table_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = 'companies'
      AND tc.table_schema = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', r.table_name);
  END LOOP;

  RAISE NOTICE '== % empresas hard-deletadas (+ cascata) ==', v_n;
END $$;
