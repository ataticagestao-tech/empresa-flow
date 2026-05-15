-- ============================================================
-- AGENTE TATICA — Base
-- Tabelas e colunas para o agente conversacional (WhatsApp).
-- Empresa decide e age no sistema via Claude API + Evolution.
-- ============================================================

-- 1. Profile recebe WhatsApp do empresário
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp_phone text,
  ADD COLUMN IF NOT EXISTS whatsapp_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_verification_code text,
  ADD COLUMN IF NOT EXISTS whatsapp_verification_expires_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_whatsapp_phone_verified_unique
  ON public.profiles (whatsapp_phone)
  WHERE whatsapp_verified = true;

-- 2. Histórico de conversa (1 linha por mensagem trocada)
CREATE TABLE IF NOT EXISTS public.agente_conversas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content jsonb NOT NULL,
  tool_use_id text,
  tokens_input integer,
  tokens_output integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agente_conversas_user_company_idx
  ON public.agente_conversas (user_id, company_id, created_at DESC);

ALTER TABLE public.agente_conversas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_see_own_conversas" ON public.agente_conversas;
CREATE POLICY "users_see_own_conversas" ON public.agente_conversas
  FOR SELECT USING (user_id = auth.uid());

-- 3. Ações pendentes de confirmação (cancelamentos, exclusões)
CREATE TABLE IF NOT EXISTS public.pending_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  payload jsonb NOT NULL,
  resumo_humano text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pending_actions_user_pending_idx
  ON public.pending_actions (user_id, expires_at)
  WHERE confirmed_at IS NULL AND cancelled_at IS NULL;

ALTER TABLE public.pending_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_see_own_pending" ON public.pending_actions;
CREATE POLICY "users_see_own_pending" ON public.pending_actions
  FOR SELECT USING (user_id = auth.uid());

-- 4. Escalações pra humano (Izabel / equipe técnica)
CREATE TABLE IF NOT EXISTS public.escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  motivo text NOT NULL,
  urgencia text NOT NULL CHECK (urgencia IN ('baixa', 'media', 'alta', 'critica')),
  contexto text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_atendimento', 'resolvido', 'descartado')),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS escalations_status_idx
  ON public.escalations (status, urgencia, created_at DESC);

ALTER TABLE public.escalations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_see_own_escalations" ON public.escalations;
CREATE POLICY "users_see_own_escalations" ON public.escalations
  FOR SELECT USING (user_id = auth.uid());

-- 5. Helper: identifica usuário pelo telefone normalizado
-- Recebe telefone com DDI 55 + DDD + número (12 ou 13 dígitos só).
CREATE OR REPLACE FUNCTION public.agente_identificar_usuario(p_phone text)
RETURNS TABLE(user_id uuid, full_name text, email text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.email
  FROM public.profiles p
  WHERE p.whatsapp_phone = regexp_replace(p_phone, '\D', '', 'g')
    AND p.whatsapp_verified = true
  LIMIT 1;
$$;

-- 6. Helper: lista empresas que o usuário pode acessar
CREATE OR REPLACE FUNCTION public.agente_empresas_usuario(p_user_id uuid)
RETURNS TABLE(company_id uuid, nome_fantasia text, razao_social text, is_default boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.nome_fantasia, c.razao_social, uc.is_default
  FROM public.user_companies uc
  JOIN public.companies c ON c.id = uc.company_id
  WHERE uc.user_id = p_user_id
    AND c.is_active = true
  ORDER BY uc.is_default DESC, c.nome_fantasia;
$$;

-- 7. Helper: saldo atual de conta bancária (usado por consultar_saldo)
CREATE OR REPLACE FUNCTION public.agente_saldo_conta(p_company_id uuid, p_conta_id uuid DEFAULT NULL)
RETURNS TABLE(conta_id uuid, nome text, tipo text, saldo numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ba.id,
    ba.name,
    ba.type::text,
    COALESCE(ba.initial_balance, 0)
      + COALESCE((
          SELECT SUM(CASE WHEN m.tipo = 'entrada' THEN m.valor ELSE -m.valor END)
          FROM public.movimentacoes m
          WHERE m.conta_bancaria_id = ba.id
        ), 0)
  FROM public.bank_accounts ba
  WHERE ba.company_id = p_company_id
    AND ba.is_active = true
    AND (p_conta_id IS NULL OR ba.id = p_conta_id)
  ORDER BY ba.type, ba.name;
$$;

-- 8. Limpa pending_actions expiradas periodicamente (via pg_cron, criado em outra migration)
CREATE OR REPLACE FUNCTION public.cleanup_pending_actions()
RETURNS void
LANGUAGE sql
AS $$
  UPDATE public.pending_actions
  SET cancelled_at = now()
  WHERE confirmed_at IS NULL
    AND cancelled_at IS NULL
    AND expires_at < now();
$$;

COMMENT ON TABLE public.agente_conversas IS 'Histórico de conversas do agente Tatica (WhatsApp)';
COMMENT ON TABLE public.pending_actions IS 'Ações que aguardam confirmação do empresário antes de executar';
COMMENT ON TABLE public.escalations IS 'Chamados escalados pelo agente pra equipe humana';
