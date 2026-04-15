-- Fix: a trigger forcar_soft_delete em contas_receber/contas_pagar bloqueia
-- DELETE direto. Antes do DELETE FROM companies (que cascadeia CR/CP),
-- precisamos marcar CR/CP como deleted_at = now() para que a trigger permita
-- a exclusão física durante o CASCADE.

CREATE OR REPLACE FUNCTION public.delete_company_cascade(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed boolean;
BEGIN
  -- Autorização: usuário precisa estar vinculado à empresa (owner ou membro)
  SELECT EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = p_company_id
      AND (c.owner_id = auth.uid()
           OR EXISTS (SELECT 1 FROM public.user_companies uc
                      WHERE uc.company_id = c.id AND uc.user_id = auth.uid()))
  ) INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Não autorizado a excluir esta empresa';
  END IF;

  -- Marcar CR/CP como soft-deleted primeiro (contorna trigger forcar_soft_delete
  -- que só permite DELETE físico quando deleted_at já está setado)
  UPDATE public.contas_receber SET deleted_at = now()
    WHERE company_id = p_company_id AND deleted_at IS NULL;
  UPDATE public.contas_pagar   SET deleted_at = now()
    WHERE company_id = p_company_id AND deleted_at IS NULL;

  -- bank_reconciliation_matches também tem deleted_at (mas sem trigger de bloqueio)

  -- Tabelas sem ON DELETE CASCADE precisam ser limpas manualmente
  DELETE FROM public.accounts_payable    WHERE company_id = p_company_id;
  DELETE FROM public.accounts_receivable WHERE company_id = p_company_id;
  DELETE FROM public.transactions        WHERE company_id = p_company_id;
  DELETE FROM public.log_atividades      WHERE company_id = p_company_id;
  DELETE FROM public.transferencias_intercompany
    WHERE company_origem_id = p_company_id OR company_destino_id = p_company_id;

  -- CASCADE apaga o resto (vendas, movimentacoes, CR/CP agora soft-deleted, etc.)
  DELETE FROM public.companies WHERE id = p_company_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_company_cascade(uuid) TO authenticated;
