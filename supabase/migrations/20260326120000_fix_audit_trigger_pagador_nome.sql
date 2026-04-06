-- Fix: audit_financeiro trigger references NEW.pagador_nome on contas_pagar,
-- but that table only has credor_nome. Use TG_TABLE_NAME to pick the right column.

CREATE OR REPLACE FUNCTION public.audit_financeiro()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_acao text;
  v_modulo text;
  v_entidade_desc text;
  v_dados_antes jsonb;
  v_dados_depois jsonb;
BEGIN
  -- Determinar módulo
  IF TG_TABLE_NAME = 'contas_receber' THEN
    v_modulo := 'contas_receber';
  ELSIF TG_TABLE_NAME = 'contas_pagar' THEN
    v_modulo := 'contas_pagar';
  ELSIF TG_TABLE_NAME = 'bank_reconciliation_matches' THEN
    v_modulo := 'conciliacao';
  END IF;

  -- Determinar ação
  IF TG_OP = 'INSERT' THEN
    v_acao := 'criou';
    v_dados_depois := to_jsonb(NEW);

    IF TG_TABLE_NAME = 'contas_receber' THEN
      v_entidade_desc := COALESCE(NEW.pagador_nome, 'Recebível #' || LEFT(NEW.id::text, 8));
    ELSIF TG_TABLE_NAME = 'contas_pagar' THEN
      v_entidade_desc := COALESCE(NEW.credor_nome, 'Despesa #' || LEFT(NEW.id::text, 8));
    ELSE
      v_entidade_desc := 'Match #' || LEFT(NEW.id::text, 8);
    END IF;

    INSERT INTO public.log_atividades (
      company_id, usuario_id, usuario_email, acao, modulo,
      entidade_tipo, entidade_id, entidade_desc,
      dados_antes, dados_depois
    ) VALUES (
      NEW.company_id, auth.uid(), COALESCE(auth.email(), 'sistema'),
      v_acao, v_modulo, TG_TABLE_NAME, NEW.id, v_entidade_desc,
      NULL, v_dados_depois
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    v_dados_antes := to_jsonb(OLD);
    v_dados_depois := to_jsonb(NEW);

    -- Detectar tipo de ação
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
      v_acao := 'deletou';
    ELSIF NEW.status IN ('cancelado', 'estornado') AND OLD.status = 'pago' THEN
      v_acao := 'estornou';
    ELSE
      v_acao := 'editou';
    END IF;

    IF TG_TABLE_NAME = 'contas_receber' THEN
      v_entidade_desc := COALESCE(OLD.pagador_nome, NEW.pagador_nome, 'Recebível #' || LEFT(OLD.id::text, 8));
    ELSIF TG_TABLE_NAME = 'contas_pagar' THEN
      v_entidade_desc := COALESCE(OLD.credor_nome, NEW.credor_nome, 'Despesa #' || LEFT(OLD.id::text, 8));
    ELSE
      v_entidade_desc := 'Match #' || LEFT(OLD.id::text, 8);
    END IF;

    INSERT INTO public.log_atividades (
      company_id, usuario_id, usuario_email, acao, modulo,
      entidade_tipo, entidade_id, entidade_desc,
      dados_antes, dados_depois
    ) VALUES (
      COALESCE(NEW.company_id, OLD.company_id),
      auth.uid(), COALESCE(auth.email(), 'sistema'),
      v_acao, v_modulo, TG_TABLE_NAME, OLD.id, v_entidade_desc,
      v_dados_antes, v_dados_depois
    );
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;
