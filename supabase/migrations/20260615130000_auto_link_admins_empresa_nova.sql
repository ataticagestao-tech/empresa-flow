-- ============================================================================
-- Auto-vincular ADMINS (equipe Tática) a TODA empresa nova + backfill.
--
-- Contexto (BPO): clientes podem criar empresas (ex.: Dionelly abre uma loja).
-- Hoje só o gatilho `ensure_owner_company_membership` roda no INSERT, e ele
-- vincula APENAS o criador (owner). O admin/Tática NÃO era vinculado — então a
-- empresa criada pelo cliente não aparecia no seletor do admin, nem havia aviso.
-- Decisão da Izabel (2026-06-15): admin deve ver TODA empresa, criada por quem for.
--
-- Visibilidade no app depende só de EXISTIR a linha em user_companies (o
-- CompanyContext filtra por is_active, não por role). Usamos ON CONFLICT DO
-- NOTHING para NUNCA sobrescrever vínculos/roles já existentes (ex.: a Izabel é
-- 'operador' de propósito na Tricologia — isso é preservado).
-- ============================================================================

-- 1) Função: ao inserir empresa, vincula todos os admins globais a ela.
CREATE OR REPLACE FUNCTION public.link_admins_to_new_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.user_companies (user_id, company_id, is_default, role)
  SELECT ur.user_id, NEW.id, false, 'owner'
  FROM public.user_roles ur
  WHERE ur.role = 'admin'
  ON CONFLICT (user_id, company_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- 2) Trigger AFTER INSERT (roda além do ensure_owner_company_membership existente).
DROP TRIGGER IF EXISTS trg_link_admins_to_new_company ON public.companies;
CREATE TRIGGER trg_link_admins_to_new_company
  AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.link_admins_to_new_company();

-- 3) Backfill: vincula os admins às empresas ATIVAS que ainda não enxergam.
--    (template inativo fica de fora pelo filtro is_active.)
INSERT INTO public.user_companies (user_id, company_id, is_default, role)
SELECT ur.user_id, c.id, false, 'owner'
FROM public.user_roles ur
CROSS JOIN public.companies c
WHERE ur.role = 'admin'
  AND c.is_active
ON CONFLICT (user_id, company_id) DO NOTHING;
