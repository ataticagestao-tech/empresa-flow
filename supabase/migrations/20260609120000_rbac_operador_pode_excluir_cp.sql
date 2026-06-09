-- =============================================================================
-- RBAC: OPERADOR PODE EXCLUIR EM CONTAS A PAGAR
-- =============================================================================
-- Decisao (2026-06-09): liberar exclusao de lancamentos de Contas a Pagar para
-- o papel 'operador' (antes era so 'owner'). Atende a operacao de BPO, onde a
-- equipe gerencia os livros e precisa apagar erros no dia a dia.
--
-- Como a exclusao de CP funciona na UI (softDeleteWithUndo + cleanup):
--   1. UPDATE contas_pagar SET deleted_at = now()  -> ja era permitido a operador
--      (rbac_contas_pagar_update exige apenas 'operador').
--   2. cleanup: DELETE em movimentacoes WHERE conta_pagar_id = X  -> exigia 'owner'.
--      Sem relaxar isso, o operador soft-deletava a conta mas a movimentacao
--      ficava orfa => "fantasma" no saldo. POR ISSO esta migration tambem
--      relaxa rbac_movimentacoes_delete.
--
-- A trava de UI (RoleGate minRole) foi alterada junto em ContasPagar.tsx.
-- Contas a Receber NAO foi alterada nesta migration (escopo aprovado = CP).
-- =============================================================================

-- ─── CONTAS A PAGAR: DELETE agora exige apenas 'operador' ──────────────────
-- (hard DELETE e' bloqueado por trigger; o caminho real e' UPDATE deleted_at,
--  mas mantemos a policy coerente com o novo modelo.)
DROP POLICY IF EXISTS rbac_contas_pagar_delete ON public.contas_pagar;
CREATE POLICY rbac_contas_pagar_delete ON public.contas_pagar AS RESTRICTIVE
  FOR DELETE USING (public.has_role_in_company(auth.uid(), company_id, 'operador'));

-- ─── MOVIMENTACOES: DELETE agora exige apenas 'operador' ───────────────────
-- Necessario para a limpeza pos-exclusao de CP/CR remover as movs vinculadas
-- (sem isso o operador deixaria movimentacao orfa no saldo).
DROP POLICY IF EXISTS rbac_movimentacoes_delete ON public.movimentacoes;
CREATE POLICY rbac_movimentacoes_delete ON public.movimentacoes AS RESTRICTIVE
  FOR DELETE USING (public.has_role_in_company(auth.uid(), company_id, 'operador'));
