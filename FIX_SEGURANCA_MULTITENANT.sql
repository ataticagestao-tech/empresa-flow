-- =============================================================================
-- FIX DE SEGURANÇA MULTI-TENANT — empresa-flow
-- =============================================================================
-- Corrige a brecha critica: trigger de autolink vinculava TODO usuario a TODAS
-- as empresas (e toda empresa nova a todos os usuarios), neutralizando a RLS.
-- Curativo ja aplicado: "Enable Signups" desligado no painel Supabase (27/05).
--
-- Rodar no SQL Editor do Supabase (roda como superusuario / ignora RLS).
-- ORDEM OBRIGATORIA: PARTE 0 -> 1 -> 2 -> (revisar) -> 3a -> (decidir) -> 3b.
-- Rode UMA parte por vez. NAO rode a 3b sem antes ver a 0 e a 3a.
--
-- ⚠️ TROQUE o e-mail abaixo se o super-admin nao for este:
--    Admin protegido: izabelvier@outlook.com
-- =============================================================================


-- #############################################################################
-- PARTE 0 — DIAGNOSTICO (READ-ONLY). Entender o cenario antes de mexer.
-- #############################################################################

-- 0a) Total de empresas (referencia)
SELECT count(*) AS total_empresas FROM public.companies;

-- 0b) Usuarios e seus vinculos (quem enxerga quantas empresas hoje)
SELECT u.id AS user_id,
       u.email,
       (SELECT count(*) FROM public.user_companies uc WHERE uc.user_id = u.id)        AS empresas_vinculadas,
       (SELECT count(*) FROM public.companies c       WHERE c.owner_id = u.id)         AS empresas_que_e_dono,
       EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id AND r.role = 'admin') AS is_admin
FROM auth.users u
ORDER BY empresas_vinculadas DESC, u.email;

-- Leitura esperada: hoje, com o autolink, "empresas_vinculadas" tende a ser
-- IGUAL para todo mundo (= total_empresas). E isso que vamos corrigir.


-- #############################################################################
-- PARTE 1 — CORRECAO FORWARD (SEGURA, nao mexe em dado existente):
-- reescreve os 2 triggers de autolink.
-- #############################################################################

-- 1a) Usuario novo: cria/atualiza profile e NAO vincula a nenhuma empresa.
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

  -- CORRECAO 2026-05-27: removido o INSERT que vinculava o usuario a TODAS as
  -- empresas. Acesso a empresa agora e concedido explicitamente (owner/convite).
  RETURN NEW;
END;
$$;

-- 1b) Empresa nova: vincula APENAS o dono (owner_id, ou quem criou) como 'owner'.
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

  -- Equipe Tatica (admins globais em user_roles) enxerga toda empresa nova.
  -- Clientes NAO entram aqui — so o dono + os admins.
  INSERT INTO public.user_companies (user_id, company_id, is_default, role)
  SELECT ur.user_id, NEW.id, false, 'owner'
  FROM public.user_roles ur
  WHERE ur.role = 'admin'
  ON CONFLICT (user_id, company_id) DO NOTHING;

  -- CORRECAO 2026-05-27: removido o INSERT que vinculava TODOS os usuarios
  -- a cada empresa nova.
  RETURN NEW;
END;
$$;

-- (os triggers on_auth_user_created / on_company_created continuam apontando
--  para essas funcoes — nao precisa recriar trigger.)


-- #############################################################################
-- PARTE 2 — APERTAR criacao de empresa (OPCIONAL, prioridade menor).
-- Garante owner_id no insert e fecha o "WITH CHECK (true)".
-- Se preferir nao mexer agora no fluxo de cadastro de empresa, pule esta parte.
-- #############################################################################

-- 2a) BEFORE INSERT: se o app nao mandar owner_id, assume o usuario logado.
CREATE OR REPLACE FUNCTION public.set_company_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.owner_id IS NULL THEN
    NEW.owner_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_company_owner ON public.companies;
CREATE TRIGGER trg_set_company_owner
  BEFORE INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.set_company_owner();

-- 2b) Policy de INSERT: so deixa criar empresa em nome do proprio usuario.
DROP POLICY IF EXISTS "Users can insert companies" ON public.companies;
CREATE POLICY "Users can insert companies"
  ON public.companies
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());
-- (o BEFORE trigger 2a roda antes do WITH CHECK, entao inserts do app passam.)


-- #############################################################################
-- PARTE 3 — LIMPEZA dos vinculos em user_companies (PERIGOSO).
--
-- ⚠️⚠️ ATENCAO (revisado 2026-05-27 apos o diagnostico):
-- A REGRA GENERICA abaixo (manter so admin/owner/super-admin) NAO serve para
-- este banco: ele tem usuarios externos legitimos por CLIENTE (Dionelly,
-- Craveiro, contador, equipe Tatica) que NAO sao owner_id e seriam trancados
-- pra fora. NAO use a 3b generica. Em vez disso, a limpeza sera CIRURGICA por
-- usuario, a partir do mapa "usuario x empresa" (ver consulta no chat).
-- O bloco 3b abaixo fica como REFERENCIA, mas substitua a regra pela lista
-- de pares (user_id, company_id) a MANTER/REMOVER definida com a Izabel.
-- #############################################################################

-- 3a) PREVIEW (READ-ONLY): quantos vinculos seriam REMOVIDOS, por usuario.
WITH admin AS (
  SELECT id FROM auth.users WHERE email = 'izabelvier@outlook.com'
)
SELECT u.email,
       count(*) AS vinculos_a_remover
FROM public.user_companies uc
JOIN auth.users u ON u.id = uc.user_id
WHERE uc.user_id NOT IN (SELECT id FROM admin)
  AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = uc.user_id AND r.role = 'admin')
  AND NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = uc.company_id AND c.owner_id = uc.user_id)
GROUP BY u.email
ORDER BY vinculos_a_remover DESC;

-- 3b) APLICAR (DO block atomico, com trava de protecao do super-admin).
/*  >>> Descomente este bloco SO depois de revisar a 3a. <<<
DO $$
DECLARE
  v_admin_email text := 'izabelvier@outlook.com';
  v_admin_id    uuid;
  v_admin_links_antes int;
  v_admin_links_depois int;
  v_total_empresas int;
  v_removidos int;
BEGIN
  SELECT id INTO v_admin_id FROM auth.users WHERE email = v_admin_email;
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Super-admin % nao encontrado. Abortado.', v_admin_email;
  END IF;

  SELECT count(*) INTO v_total_empresas FROM public.companies;
  SELECT count(*) INTO v_admin_links_antes FROM public.user_companies WHERE user_id = v_admin_id;

  DELETE FROM public.user_companies uc
  WHERE uc.user_id <> v_admin_id
    AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = uc.user_id AND r.role = 'admin')
    AND NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = uc.company_id AND c.owner_id = uc.user_id);
  GET DIAGNOSTICS v_removidos = ROW_COUNT;

  -- Trava: o super-admin nao pode ter perdido nenhum vinculo.
  SELECT count(*) INTO v_admin_links_depois FROM public.user_companies WHERE user_id = v_admin_id;
  IF v_admin_links_depois < v_admin_links_antes THEN
    RAISE EXCEPTION 'ABORT: super-admin perdeu vinculos (% -> %). Rollback.',
      v_admin_links_antes, v_admin_links_depois;
  END IF;

  RAISE NOTICE 'Vinculos removidos: %. Super-admin mantem % vinculos (de % empresas).',
    v_removidos, v_admin_links_depois, v_total_empresas;
END $$;
*/


-- #############################################################################
-- PARTE 5 — Formalizar a equipe Tatica como ADMIN (decidido com Izabel 27/05).
-- Luana e staff e deve ver tudo; vira admin (e o trigger 1b passa a vincula-la
-- automaticamente a empresas novas). Diagnostico mostrou que os clientes ja
-- estao isolados corretamente — por isso NAO ha limpeza em massa a fazer.
-- #############################################################################
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE email = 'luana.atatica@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;


-- #############################################################################
-- PARTE 6 — Apagar contas de teste/lixo (0 acesso). Higiene.
-- DELETE em auth.users cascateia para profiles e user_companies (FK ON DELETE
-- CASCADE). Como sao contas com 0 vinculo, nao ha impacto em dado de empresa.
-- Alternativa: apagar uma a uma em Authentication -> Users no painel.
-- #############################################################################

-- 6a) CONFIRA antes (read-only): mostra as contas-alvo e o nº de vinculos (deve ser 0).
SELECT u.email,
       (SELECT count(*) FROM public.user_companies uc WHERE uc.user_id = u.id) AS vinculos
FROM auth.users u
WHERE u.email IN (
  'teste@teste.com',
  'otp.check.1770916554123@example.com',
  'diagnostico-otp@ataticagestao.com'
)
ORDER BY u.email;

-- 6b) APAGAR (so as claramente sinteticas). Adicione/remova e-mails conforme decidir.
--     >>> Descomente para aplicar. <<<
-- DELETE FROM auth.users
--  WHERE email IN (
--    'teste@teste.com',
--    'otp.check.1770916554123@example.com',
--    'diagnostico-otp@ataticagestao.com'
--  )
--    AND NOT EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.user_id = auth.users.id);
--    -- a clausula NOT EXISTS e uma trava extra: so apaga quem tem 0 vinculo.


-- #############################################################################
-- PARTE 4 — CONFERENCIA (READ-ONLY). Rode no fim, pra ver o estado final.
-- #############################################################################
-- SELECT u.email,
--        EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=u.id AND r.role='admin') AS admin,
--        (SELECT count(*) FROM public.user_companies uc WHERE uc.user_id=u.id) AS vinculadas
-- FROM auth.users u ORDER BY vinculadas DESC, u.email;
