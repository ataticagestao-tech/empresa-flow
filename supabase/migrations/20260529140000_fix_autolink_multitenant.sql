-- =====================================================================
-- SEGURANÇA MULTI-TENANT — corrige o autolink que neutralizava a RLS
-- =====================================================================
-- Problema (auditoria 2026-05-27): os triggers de autolink vinculavam
-- TODO usuário novo a TODAS as empresas, e TODA empresa nova a TODOS os
-- usuários (20251228004000_user_companies_autolink.sql). Como a RLS de
-- dados filtra por user_companies, o isolamento ficava sintaticamente
-- certo mas semanticamente DESLIGADO.
--
-- Curativo já aplicado no painel: "Enable Signups" desligado (27/05).
-- Esta migration torna o conserto PERMANENTE e versionado (antes só
-- existia como SQL avulso, que não subia no deploy).
--
-- Escopo: SÓ correção forward (PARTE 1 da auditoria). NÃO mexe em vínculos
-- existentes — o diagnóstico de 27/05 mostrou que os clientes já estão
-- isolados corretamente. Limpeza de vínculos / contas de teste continuam
-- manuais e sob decisão (FIX_SEGURANCA_MULTITENANT.sql, PARTES 3 e 6).
-- Idempotente (CREATE OR REPLACE): seguro mesmo se a PARTE 1 já foi rodada
-- manualmente no SQL Editor.
-- =====================================================================

-- Usuário novo: cria/atualiza profile e NÃO vincula a nenhuma empresa.
-- Acesso a empresa passa a ser concedido explicitamente (owner/convite).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), split_part(COALESCE(NEW.email, ''), '@', 1), 'Usuário'),
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        email     = EXCLUDED.email,
        updated_at = now();
  RETURN NEW;
END;
$$;

-- Empresa nova: vincula APENAS o dono + a equipe Tática (admins globais).
-- Clientes não entram automaticamente — só o dono e os admins.
CREATE OR REPLACE FUNCTION public.handle_new_company()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  v_owner := COALESCE(NEW.owner_id, auth.uid());
  IF v_owner IS NOT NULL THEN
    INSERT INTO public.user_companies (user_id, company_id, is_default, role)
    VALUES (v_owner, NEW.id, false, 'owner')
    ON CONFLICT (user_id, company_id) DO UPDATE SET role = 'owner';
  END IF;

  INSERT INTO public.user_companies (user_id, company_id, is_default, role)
  SELECT ur.user_id, NEW.id, false, 'owner'
  FROM public.user_roles ur
  WHERE ur.role = 'admin'
  ON CONFLICT (user_id, company_id) DO NOTHING;

  RETURN NEW;
END;
$$;
