-- Função RPC para excluir empresa e todo o histórico vinculado.
-- A maioria das FKs já tem ON DELETE CASCADE; esta função limpa as poucas
-- tabelas que não têm CASCADE antes de deletar a empresa.

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

  -- Tabelas sem ON DELETE CASCADE precisam ser limpas manualmente
  DELETE FROM public.accounts_payable    WHERE company_id = p_company_id;
  DELETE FROM public.accounts_receivable WHERE company_id = p_company_id;
  DELETE FROM public.transactions        WHERE company_id = p_company_id;
  DELETE FROM public.log_atividades      WHERE company_id = p_company_id;
  DELETE FROM public.transferencias_intercompany
    WHERE company_origem_id = p_company_id OR company_destino_id = p_company_id;

  -- As demais FKs (vendas, CR/CP, movimentacoes, extratos, funcionarios,
  -- categorias, contas bancárias, CRM, fiscal, etc.) têm ON DELETE CASCADE
  -- e são removidas automaticamente com o DELETE abaixo.
  DELETE FROM public.companies WHERE id = p_company_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_company_cascade(uuid) TO authenticated;
