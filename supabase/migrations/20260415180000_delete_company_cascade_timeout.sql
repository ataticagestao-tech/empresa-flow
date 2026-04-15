-- Aumenta o statement_timeout dentro da RPC para empresas com muito histórico.
-- Default do Supabase para role authenticated é ~8s, insuficiente para cascade
-- em empresas grandes (vendas, movimentacoes, extratos, triggers de auditoria).

CREATE OR REPLACE FUNCTION public.delete_company_cascade(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '5min'
AS $$
DECLARE
  v_allowed boolean;
BEGIN
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

  -- Soft delete CR/CP antes do cascade (contorna trigger forcar_soft_delete)
  UPDATE public.contas_receber SET deleted_at = now()
    WHERE company_id = p_company_id AND deleted_at IS NULL;
  UPDATE public.contas_pagar   SET deleted_at = now()
    WHERE company_id = p_company_id AND deleted_at IS NULL;

  -- Tabelas sem ON DELETE CASCADE
  DELETE FROM public.accounts_payable    WHERE company_id = p_company_id;
  DELETE FROM public.accounts_receivable WHERE company_id = p_company_id;
  DELETE FROM public.transactions        WHERE company_id = p_company_id;
  DELETE FROM public.log_atividades      WHERE company_id = p_company_id;
  DELETE FROM public.transferencias_intercompany
    WHERE company_origem_id = p_company_id OR company_destino_id = p_company_id;

  DELETE FROM public.companies WHERE id = p_company_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_company_cascade(uuid) TO authenticated;
