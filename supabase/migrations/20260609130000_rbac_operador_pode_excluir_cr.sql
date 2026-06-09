-- =============================================================================
-- RBAC: OPERADOR PODE EXCLUIR EM CONTAS A RECEBER
-- =============================================================================
-- Simetrico a 20260609120000 (Contas a Pagar). Libera a exclusao de titulos de
-- Contas a Receber para o papel 'operador' (antes era so 'owner').
--
-- A exclusao de CR na UI (softDeleteWithUndo + cleanup) faz:
--   1. UPDATE contas_receber SET deleted_at = now()  -> ja permitido a operador
--      (rbac_contas_receber_update exige apenas 'operador').
--   2. cleanup: DELETE em movimentacoes WHERE conta_receber_id = X  -> ja foi
--      relaxado para 'operador' na migration 20260609120000.
--   3. UPDATE em bank_reconciliation_matches / bank_transactions -> ja operador.
--
-- Logo, so falta a policy de DELETE de contas_receber (coerencia do modelo;
-- hard DELETE e' bloqueado por trigger, caminho real e' UPDATE deleted_at).
-- A trava de UI (RoleGate minRole) foi alterada junto em ContasReceber.tsx.
-- =============================================================================

DROP POLICY IF EXISTS rbac_contas_receber_delete ON public.contas_receber;
CREATE POLICY rbac_contas_receber_delete ON public.contas_receber AS RESTRICTIVE
  FOR DELETE USING (public.has_role_in_company(auth.uid(), company_id, 'operador'));
