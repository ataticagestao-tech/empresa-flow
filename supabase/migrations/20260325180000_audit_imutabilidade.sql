-- ============================================================
-- PROTEÇÃO FINANCEIRA: Auditoria + Imutabilidade + Soft Delete
-- ============================================================

-- ─── 1) SOFT DELETE: adicionar deleted_at ───────────────────

ALTER TABLE public.contas_receber
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id);

ALTER TABLE public.contas_pagar
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id);

ALTER TABLE public.bank_reconciliation_matches
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id);

-- ─── 2) IMUTABILIDADE: bloquear edição de registros pagos/conciliados ─

CREATE OR REPLACE FUNCTION public.bloquear_edicao_pago()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Permitir soft delete (apenas setar deleted_at)
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- Bloquear edição de registros pagos ou conciliados
  IF OLD.status IN ('pago', 'conciliado') THEN
    -- Permitir apenas estorno (mudança de status pago → cancelado/estornado)
    IF NEW.status IN ('cancelado', 'estornado') THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Registro com status "%" não pode ser editado. Use estorno.', OLD.status;
  END IF;

  RETURN NEW;
END;
$$;

-- Aplicar em contas_receber
DROP TRIGGER IF EXISTS trg_bloquear_edicao_cr ON public.contas_receber;
CREATE TRIGGER trg_bloquear_edicao_cr
  BEFORE UPDATE ON public.contas_receber
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_edicao_pago();

-- Aplicar em contas_pagar
DROP TRIGGER IF EXISTS trg_bloquear_edicao_cp ON public.contas_pagar;
CREATE TRIGGER trg_bloquear_edicao_cp
  BEFORE UPDATE ON public.contas_pagar
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_edicao_pago();

-- ─── 3) BLOQUEAR DELETE REAL (forçar soft delete) ──────────

CREATE OR REPLACE FUNCTION public.forcar_soft_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Se já tem deleted_at, permitir o delete real (limpeza admin)
  IF OLD.deleted_at IS NOT NULL THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'Exclusão direta não permitida. Use soft delete (setar deleted_at).';
END;
$$;

DROP TRIGGER IF EXISTS trg_soft_delete_cr ON public.contas_receber;
CREATE TRIGGER trg_soft_delete_cr
  BEFORE DELETE ON public.contas_receber
  FOR EACH ROW EXECUTE FUNCTION public.forcar_soft_delete();

DROP TRIGGER IF EXISTS trg_soft_delete_cp ON public.contas_pagar;
CREATE TRIGGER trg_soft_delete_cp
  BEFORE DELETE ON public.contas_pagar
  FOR EACH ROW EXECUTE FUNCTION public.forcar_soft_delete();

-- ─── 4) AUDITORIA AUTOMÁTICA ───────────────────────────────

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
    v_entidade_desc := COALESCE(
      NEW.pagador_nome,
      NEW.credor_nome,
      'Match #' || LEFT(NEW.id::text, 8)
    );

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

    v_entidade_desc := COALESCE(
      OLD.pagador_nome, NEW.pagador_nome,
      OLD.credor_nome, NEW.credor_nome,
      'Match #' || LEFT(OLD.id::text, 8)
    );

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

-- Triggers de auditoria
DROP TRIGGER IF EXISTS trg_audit_cr ON public.contas_receber;
CREATE TRIGGER trg_audit_cr
  AFTER INSERT OR UPDATE ON public.contas_receber
  FOR EACH ROW EXECUTE FUNCTION public.audit_financeiro();

DROP TRIGGER IF EXISTS trg_audit_cp ON public.contas_pagar;
CREATE TRIGGER trg_audit_cp
  AFTER INSERT OR UPDATE ON public.contas_pagar
  FOR EACH ROW EXECUTE FUNCTION public.audit_financeiro();

DROP TRIGGER IF EXISTS trg_audit_brm ON public.bank_reconciliation_matches;
CREATE TRIGGER trg_audit_brm
  AFTER INSERT OR UPDATE ON public.bank_reconciliation_matches
  FOR EACH ROW EXECUTE FUNCTION public.audit_financeiro();

-- ─── 5) STATUS 'estornado' nas tabelas ─────────────────────

ALTER TABLE public.contas_receber
  DROP CONSTRAINT IF EXISTS contas_receber_status_check;
ALTER TABLE public.contas_receber
  ADD CONSTRAINT contas_receber_status_check
  CHECK (status IN ('aberto','pago','vencido','cancelado','parcial','estornado'));

ALTER TABLE public.contas_pagar
  DROP CONSTRAINT IF EXISTS contas_pagar_status_check;
ALTER TABLE public.contas_pagar
  ADD CONSTRAINT contas_pagar_status_check
  CHECK (status IN ('aberto','pago','vencido','cancelado','parcial','estornado'));

-- ─── 6) PERMISSÃO 'pode_estornar' em perfis_acesso ─────────

ALTER TABLE public.perfis_acesso
  ADD COLUMN IF NOT EXISTS pode_estornar boolean NOT NULL DEFAULT false;

-- ─── 7) VIEWS para queries (excluir soft-deleted) ──────────

CREATE OR REPLACE VIEW public.v_contas_receber AS
  SELECT * FROM public.contas_receber WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW public.v_contas_pagar AS
  SELECT * FROM public.contas_pagar WHERE deleted_at IS NULL;

-- ─── 8) ÍNDICES ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_cr_deleted_at ON public.contas_receber(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cp_deleted_at ON public.contas_pagar(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_brm_deleted_at ON public.bank_reconciliation_matches(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_log_modulo ON public.log_atividades(modulo, created_at DESC);
