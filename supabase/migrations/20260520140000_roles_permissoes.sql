-- =============================================================================
-- PERMISSÕES POR PAPEL (RBAC) — owner / operador / visualizador
-- =============================================================================
-- 3 niveis de acesso por usuario+empresa:
--
-- OWNER: tudo (default pro dono da empresa)
-- OPERADOR: SELECT em tudo, INSERT/UPDATE em tabelas operacionais (vendas,
--           CR/CP, movs, clientes, fornecedores, produtos, conciliacao).
--           NAO pode DELETE de nada. NAO mexe em bank_accounts/chart_of_accounts
--           /centros_custo/companies/user_companies.
-- VISUALIZADOR: SELECT em tudo. Nao pode INSERT/UPDATE/DELETE de nada.
--
-- IMPLEMENTACAO: policies RESTRITIVAS (AND com as permissivas existentes).
-- Nao reescreve nada — apenas ADICIONA restricao em cima.
--
-- BACKFILL: usuario que e owner_id de uma empresa vira role=owner naquela
-- empresa. Resto fica role=operador (preserva comportamento atual de "todo
-- mundo pode lancar"; owner reclassifica depois via UI).
-- =============================================================================


-- ─── 1. Coluna role em user_companies ─────────────────────────────────────
ALTER TABLE public.user_companies
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'operador'
  CHECK (role IN ('owner', 'operador', 'visualizador'));

CREATE INDEX IF NOT EXISTS idx_user_companies_role
  ON public.user_companies(user_id, company_id, role);


-- ─── 2. Backfill: dono da empresa vira role=owner ─────────────────────────
UPDATE public.user_companies uc
   SET role = 'owner'
  FROM public.companies c
 WHERE c.id = uc.company_id
   AND c.owner_id = uc.user_id
   AND uc.role <> 'owner';


-- ─── 3. Helper function: has_role_in_company ──────────────────────────────
-- Retorna TRUE se o usuario tem role >= p_min_role na empresa.
-- Hierarquia: owner (3) > operador (2) > visualizador (1).
-- Fallback: se nao houver row em user_companies mas o usuario for owner_id
-- da company, considera 'owner' (defesa contra inconsistencia de vinculo).
CREATE OR REPLACE FUNCTION public.has_role_in_company(
  p_user_id UUID,
  p_company_id UUID,
  p_min_role TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_user_role TEXT;
  v_user_rank INT;
  v_min_rank INT;
BEGIN
  IF p_user_id IS NULL OR p_company_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Fallback: owner_id sempre tem role=owner mesmo sem row em user_companies
  IF EXISTS (
    SELECT 1 FROM public.companies
     WHERE id = p_company_id AND owner_id = p_user_id
  ) THEN
    v_user_role := 'owner';
  ELSE
    SELECT role INTO v_user_role
      FROM public.user_companies
     WHERE user_id = p_user_id AND company_id = p_company_id;
  END IF;

  IF v_user_role IS NULL THEN
    RETURN FALSE;
  END IF;

  v_user_rank := CASE v_user_role
    WHEN 'owner' THEN 3
    WHEN 'operador' THEN 2
    WHEN 'visualizador' THEN 1
    ELSE 0
  END;

  v_min_rank := CASE p_min_role
    WHEN 'owner' THEN 3
    WHEN 'operador' THEN 2
    WHEN 'visualizador' THEN 1
    ELSE 0
  END;

  RETURN v_user_rank >= v_min_rank;
END;
$$;

COMMENT ON FUNCTION public.has_role_in_company IS
'Verifica se usuario tem role minimo na empresa. Hierarquia: owner > operador > visualizador. Fallback: companies.owner_id sempre conta como owner.';


-- =============================================================================
-- POLICIES RESTRITIVAS — AND com as policies permissivas existentes
-- =============================================================================
-- TABELAS OPERACIONAIS (operador+owner podem INSERT/UPDATE; DELETE so owner):
--   vendas, vendas_itens, contas_receber, contas_pagar, movimentacoes,
--   bank_transactions, bank_reconciliation_matches,
--   clients, suppliers, employees, products, departments
--
-- TABELAS ESTRUTURAIS (so owner pode INSERT/UPDATE/DELETE):
--   bank_accounts, chart_of_accounts, centros_custo,
--   companies (UPDATE/DELETE), user_companies
-- =============================================================================


-- ─── VENDAS ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS rbac_vendas_insert ON public.vendas;
CREATE POLICY rbac_vendas_insert ON public.vendas AS RESTRICTIVE
  FOR INSERT WITH CHECK (public.has_role_in_company(auth.uid(), company_id, 'operador'));

DROP POLICY IF EXISTS rbac_vendas_update ON public.vendas;
CREATE POLICY rbac_vendas_update ON public.vendas AS RESTRICTIVE
  FOR UPDATE USING (public.has_role_in_company(auth.uid(), company_id, 'operador'));

DROP POLICY IF EXISTS rbac_vendas_delete ON public.vendas;
CREATE POLICY rbac_vendas_delete ON public.vendas AS RESTRICTIVE
  FOR DELETE USING (public.has_role_in_company(auth.uid(), company_id, 'owner'));


-- ─── VENDAS_ITENS ──────────────────────────────────────────────────────────
-- vendas_itens nao tem company_id direto. Resolve via venda_id -> vendas.company_id
DROP POLICY IF EXISTS rbac_vendas_itens_insert ON public.vendas_itens;
CREATE POLICY rbac_vendas_itens_insert ON public.vendas_itens AS RESTRICTIVE
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.vendas v
             WHERE v.id = vendas_itens.venda_id
               AND public.has_role_in_company(auth.uid(), v.company_id, 'operador'))
  );

DROP POLICY IF EXISTS rbac_vendas_itens_update ON public.vendas_itens;
CREATE POLICY rbac_vendas_itens_update ON public.vendas_itens AS RESTRICTIVE
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.vendas v
             WHERE v.id = vendas_itens.venda_id
               AND public.has_role_in_company(auth.uid(), v.company_id, 'operador'))
  );

DROP POLICY IF EXISTS rbac_vendas_itens_delete ON public.vendas_itens;
CREATE POLICY rbac_vendas_itens_delete ON public.vendas_itens AS RESTRICTIVE
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.vendas v
             WHERE v.id = vendas_itens.venda_id
               AND public.has_role_in_company(auth.uid(), v.company_id, 'owner'))
  );


-- ─── CONTAS A RECEBER ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS rbac_contas_receber_insert ON public.contas_receber;
CREATE POLICY rbac_contas_receber_insert ON public.contas_receber AS RESTRICTIVE
  FOR INSERT WITH CHECK (public.has_role_in_company(auth.uid(), company_id, 'operador'));

DROP POLICY IF EXISTS rbac_contas_receber_update ON public.contas_receber;
CREATE POLICY rbac_contas_receber_update ON public.contas_receber AS RESTRICTIVE
  FOR UPDATE USING (public.has_role_in_company(auth.uid(), company_id, 'operador'));

DROP POLICY IF EXISTS rbac_contas_receber_delete ON public.contas_receber;
CREATE POLICY rbac_contas_receber_delete ON public.contas_receber AS RESTRICTIVE
  FOR DELETE USING (public.has_role_in_company(auth.uid(), company_id, 'owner'));


-- ─── CONTAS A PAGAR ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS rbac_contas_pagar_insert ON public.contas_pagar;
CREATE POLICY rbac_contas_pagar_insert ON public.contas_pagar AS RESTRICTIVE
  FOR INSERT WITH CHECK (public.has_role_in_company(auth.uid(), company_id, 'operador'));

DROP POLICY IF EXISTS rbac_contas_pagar_update ON public.contas_pagar;
CREATE POLICY rbac_contas_pagar_update ON public.contas_pagar AS RESTRICTIVE
  FOR UPDATE USING (public.has_role_in_company(auth.uid(), company_id, 'operador'));

DROP POLICY IF EXISTS rbac_contas_pagar_delete ON public.contas_pagar;
CREATE POLICY rbac_contas_pagar_delete ON public.contas_pagar AS RESTRICTIVE
  FOR DELETE USING (public.has_role_in_company(auth.uid(), company_id, 'owner'));


-- ─── MOVIMENTACOES ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS rbac_movimentacoes_insert ON public.movimentacoes;
CREATE POLICY rbac_movimentacoes_insert ON public.movimentacoes AS RESTRICTIVE
  FOR INSERT WITH CHECK (public.has_role_in_company(auth.uid(), company_id, 'operador'));

DROP POLICY IF EXISTS rbac_movimentacoes_update ON public.movimentacoes;
CREATE POLICY rbac_movimentacoes_update ON public.movimentacoes AS RESTRICTIVE
  FOR UPDATE USING (public.has_role_in_company(auth.uid(), company_id, 'operador'));

DROP POLICY IF EXISTS rbac_movimentacoes_delete ON public.movimentacoes;
CREATE POLICY rbac_movimentacoes_delete ON public.movimentacoes AS RESTRICTIVE
  FOR DELETE USING (public.has_role_in_company(auth.uid(), company_id, 'owner'));


-- ─── BANK_TRANSACTIONS ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS rbac_bank_transactions_insert ON public.bank_transactions;
CREATE POLICY rbac_bank_transactions_insert ON public.bank_transactions AS RESTRICTIVE
  FOR INSERT WITH CHECK (public.has_role_in_company(auth.uid(), company_id, 'operador'));

DROP POLICY IF EXISTS rbac_bank_transactions_update ON public.bank_transactions;
CREATE POLICY rbac_bank_transactions_update ON public.bank_transactions AS RESTRICTIVE
  FOR UPDATE USING (public.has_role_in_company(auth.uid(), company_id, 'operador'));

DROP POLICY IF EXISTS rbac_bank_transactions_delete ON public.bank_transactions;
CREATE POLICY rbac_bank_transactions_delete ON public.bank_transactions AS RESTRICTIVE
  FOR DELETE USING (public.has_role_in_company(auth.uid(), company_id, 'owner'));


-- ─── BANK_RECONCILIATION_MATCHES ───────────────────────────────────────────
DROP POLICY IF EXISTS rbac_bank_reconciliation_matches_insert ON public.bank_reconciliation_matches;
CREATE POLICY rbac_bank_reconciliation_matches_insert ON public.bank_reconciliation_matches AS RESTRICTIVE
  FOR INSERT WITH CHECK (public.has_role_in_company(auth.uid(), company_id, 'operador'));

DROP POLICY IF EXISTS rbac_bank_reconciliation_matches_update ON public.bank_reconciliation_matches;
CREATE POLICY rbac_bank_reconciliation_matches_update ON public.bank_reconciliation_matches AS RESTRICTIVE
  FOR UPDATE USING (public.has_role_in_company(auth.uid(), company_id, 'operador'));

DROP POLICY IF EXISTS rbac_bank_reconciliation_matches_delete ON public.bank_reconciliation_matches;
CREATE POLICY rbac_bank_reconciliation_matches_delete ON public.bank_reconciliation_matches AS RESTRICTIVE
  FOR DELETE USING (public.has_role_in_company(auth.uid(), company_id, 'owner'));


-- ─── CLIENTS ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS rbac_clients_insert ON public.clients;
CREATE POLICY rbac_clients_insert ON public.clients AS RESTRICTIVE
  FOR INSERT WITH CHECK (public.has_role_in_company(auth.uid(), company_id, 'operador'));

DROP POLICY IF EXISTS rbac_clients_update ON public.clients;
CREATE POLICY rbac_clients_update ON public.clients AS RESTRICTIVE
  FOR UPDATE USING (public.has_role_in_company(auth.uid(), company_id, 'operador'));

DROP POLICY IF EXISTS rbac_clients_delete ON public.clients;
CREATE POLICY rbac_clients_delete ON public.clients AS RESTRICTIVE
  FOR DELETE USING (public.has_role_in_company(auth.uid(), company_id, 'owner'));


-- ─── SUPPLIERS ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS rbac_suppliers_insert ON public.suppliers;
CREATE POLICY rbac_suppliers_insert ON public.suppliers AS RESTRICTIVE
  FOR INSERT WITH CHECK (public.has_role_in_company(auth.uid(), company_id, 'operador'));

DROP POLICY IF EXISTS rbac_suppliers_update ON public.suppliers;
CREATE POLICY rbac_suppliers_update ON public.suppliers AS RESTRICTIVE
  FOR UPDATE USING (public.has_role_in_company(auth.uid(), company_id, 'operador'));

DROP POLICY IF EXISTS rbac_suppliers_delete ON public.suppliers;
CREATE POLICY rbac_suppliers_delete ON public.suppliers AS RESTRICTIVE
  FOR DELETE USING (public.has_role_in_company(auth.uid(), company_id, 'owner'));


-- ─── EMPLOYEES ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS rbac_employees_insert ON public.employees;
CREATE POLICY rbac_employees_insert ON public.employees AS RESTRICTIVE
  FOR INSERT WITH CHECK (public.has_role_in_company(auth.uid(), company_id, 'operador'));

DROP POLICY IF EXISTS rbac_employees_update ON public.employees;
CREATE POLICY rbac_employees_update ON public.employees AS RESTRICTIVE
  FOR UPDATE USING (public.has_role_in_company(auth.uid(), company_id, 'operador'));

DROP POLICY IF EXISTS rbac_employees_delete ON public.employees;
CREATE POLICY rbac_employees_delete ON public.employees AS RESTRICTIVE
  FOR DELETE USING (public.has_role_in_company(auth.uid(), company_id, 'owner'));


-- ─── PRODUCTS ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS rbac_products_insert ON public.products;
CREATE POLICY rbac_products_insert ON public.products AS RESTRICTIVE
  FOR INSERT WITH CHECK (public.has_role_in_company(auth.uid(), company_id, 'operador'));

DROP POLICY IF EXISTS rbac_products_update ON public.products;
CREATE POLICY rbac_products_update ON public.products AS RESTRICTIVE
  FOR UPDATE USING (public.has_role_in_company(auth.uid(), company_id, 'operador'));

DROP POLICY IF EXISTS rbac_products_delete ON public.products;
CREATE POLICY rbac_products_delete ON public.products AS RESTRICTIVE
  FOR DELETE USING (public.has_role_in_company(auth.uid(), company_id, 'owner'));


-- ─── DEPARTMENTS ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS rbac_departments_insert ON public.departments;
CREATE POLICY rbac_departments_insert ON public.departments AS RESTRICTIVE
  FOR INSERT WITH CHECK (public.has_role_in_company(auth.uid(), company_id, 'operador'));

DROP POLICY IF EXISTS rbac_departments_update ON public.departments;
CREATE POLICY rbac_departments_update ON public.departments AS RESTRICTIVE
  FOR UPDATE USING (public.has_role_in_company(auth.uid(), company_id, 'operador'));

DROP POLICY IF EXISTS rbac_departments_delete ON public.departments;
CREATE POLICY rbac_departments_delete ON public.departments AS RESTRICTIVE
  FOR DELETE USING (public.has_role_in_company(auth.uid(), company_id, 'owner'));


-- =============================================================================
-- TABELAS ESTRUTURAIS — so OWNER pode mexer (INSERT/UPDATE/DELETE)
-- =============================================================================

-- ─── BANK_ACCOUNTS (so owner cadastra/edita contas bancarias) ─────────────
DROP POLICY IF EXISTS rbac_bank_accounts_insert ON public.bank_accounts;
CREATE POLICY rbac_bank_accounts_insert ON public.bank_accounts AS RESTRICTIVE
  FOR INSERT WITH CHECK (public.has_role_in_company(auth.uid(), company_id, 'owner'));

DROP POLICY IF EXISTS rbac_bank_accounts_update ON public.bank_accounts;
CREATE POLICY rbac_bank_accounts_update ON public.bank_accounts AS RESTRICTIVE
  FOR UPDATE USING (public.has_role_in_company(auth.uid(), company_id, 'owner'));

DROP POLICY IF EXISTS rbac_bank_accounts_delete ON public.bank_accounts;
CREATE POLICY rbac_bank_accounts_delete ON public.bank_accounts AS RESTRICTIVE
  FOR DELETE USING (public.has_role_in_company(auth.uid(), company_id, 'owner'));


-- ─── CHART_OF_ACCOUNTS (plano de contas e' estrutura contabil) ────────────
DROP POLICY IF EXISTS rbac_chart_of_accounts_insert ON public.chart_of_accounts;
CREATE POLICY rbac_chart_of_accounts_insert ON public.chart_of_accounts AS RESTRICTIVE
  FOR INSERT WITH CHECK (public.has_role_in_company(auth.uid(), company_id, 'owner'));

DROP POLICY IF EXISTS rbac_chart_of_accounts_update ON public.chart_of_accounts;
CREATE POLICY rbac_chart_of_accounts_update ON public.chart_of_accounts AS RESTRICTIVE
  FOR UPDATE USING (public.has_role_in_company(auth.uid(), company_id, 'owner'));

DROP POLICY IF EXISTS rbac_chart_of_accounts_delete ON public.chart_of_accounts;
CREATE POLICY rbac_chart_of_accounts_delete ON public.chart_of_accounts AS RESTRICTIVE
  FOR DELETE USING (public.has_role_in_company(auth.uid(), company_id, 'owner'));


-- ─── COMPANIES (so owner edita configuracoes da empresa) ──────────────────
DROP POLICY IF EXISTS rbac_companies_update ON public.companies;
CREATE POLICY rbac_companies_update ON public.companies AS RESTRICTIVE
  FOR UPDATE USING (public.has_role_in_company(auth.uid(), id, 'owner'));

DROP POLICY IF EXISTS rbac_companies_delete ON public.companies;
CREATE POLICY rbac_companies_delete ON public.companies AS RESTRICTIVE
  FOR DELETE USING (public.has_role_in_company(auth.uid(), id, 'owner'));


-- ─── USER_COMPANIES (so owner gerencia time) ──────────────────────────────
DROP POLICY IF EXISTS rbac_user_companies_insert ON public.user_companies;
CREATE POLICY rbac_user_companies_insert ON public.user_companies AS RESTRICTIVE
  FOR INSERT WITH CHECK (public.has_role_in_company(auth.uid(), company_id, 'owner'));

DROP POLICY IF EXISTS rbac_user_companies_update ON public.user_companies;
CREATE POLICY rbac_user_companies_update ON public.user_companies AS RESTRICTIVE
  FOR UPDATE USING (public.has_role_in_company(auth.uid(), company_id, 'owner'));

DROP POLICY IF EXISTS rbac_user_companies_delete ON public.user_companies;
CREATE POLICY rbac_user_companies_delete ON public.user_companies AS RESTRICTIVE
  FOR DELETE USING (public.has_role_in_company(auth.uid(), company_id, 'owner'));


-- =============================================================================
-- COMENTARIOS FINAIS
-- =============================================================================
COMMENT ON COLUMN public.user_companies.role IS
'Papel do usuario nesta empresa: owner (tudo) > operador (CRUD operacional, sem DELETE) > visualizador (read-only).';
