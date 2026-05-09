-- ─────────────────────────────────────────────────────────────────────────────
-- Auditoria automática de bank_transactions
-- Contexto: incidente 29/04/2026 revelou que 90 bank_transactions tinham
--           vínculo CR/CP zerado sem registro de auditoria. Este trigger
--           garante que todo INSERT/UPDATE em bank_transactions seja registrado
--           em log_atividades com dados_antes/dados_depois para permitir
--           restauração posterior.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.audit_bank_transactions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_acao          text;
  v_entidade_desc text;
  v_dados_antes   jsonb;
  v_dados_depois  jsonb;
  v_company_id    uuid;
BEGIN
  -- Obter company_id via bank_accounts (bank_transactions não tem company_id direto)
  IF TG_OP = 'INSERT' THEN
    SELECT ba.company_id INTO v_company_id
      FROM public.bank_accounts ba
     WHERE ba.id = NEW.bank_account_id;
  ELSE
    SELECT ba.company_id INTO v_company_id
      FROM public.bank_accounts ba
     WHERE ba.id = COALESCE(NEW.bank_account_id, OLD.bank_account_id);
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_acao         := 'criou';
    v_dados_depois := to_jsonb(NEW);
    v_dados_antes  := NULL;
    v_entidade_desc := COALESCE(NEW.description, 'BankTx#' || LEFT(NEW.id::text, 8));

    INSERT INTO public.log_atividades (
      company_id, usuario_id, usuario_email, acao, modulo,
      entidade_tipo, entidade_id, entidade_desc,
      dados_antes, dados_depois
    ) VALUES (
      v_company_id,
      auth.uid(),
      COALESCE(auth.email(), 'sistema'),
      v_acao,
      'bank_transactions',
      'bank_transactions',
      NEW.id,
      v_entidade_desc,
      v_dados_antes,
      v_dados_depois
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    v_dados_antes  := to_jsonb(OLD);
    v_dados_depois := to_jsonb(NEW);
    v_entidade_desc := COALESCE(NEW.description, OLD.description, 'BankTx#' || LEFT(NEW.id::text, 8));

    -- Detectar tipo de ação
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
      v_acao := 'deletou';
    ELSE
      v_acao := 'editou';
    END IF;

    INSERT INTO public.log_atividades (
      company_id, usuario_id, usuario_email, acao, modulo,
      entidade_tipo, entidade_id, entidade_desc,
      dados_antes, dados_depois
    ) VALUES (
      v_company_id,
      auth.uid(),
      COALESCE(auth.email(), 'sistema'),
      v_acao,
      'bank_transactions',
      'bank_transactions',
      OLD.id,
      v_entidade_desc,
      v_dados_antes,
      v_dados_depois
    );
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_bank_transactions ON public.bank_transactions;
CREATE TRIGGER trg_audit_bank_transactions
  AFTER INSERT OR UPDATE ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.audit_bank_transactions();
