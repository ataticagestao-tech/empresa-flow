-- ============================================================
-- GESTAP — Setup Régua de Cobrança
-- Adiciona campos de contato em contas_receber
-- Cria RPC para execução do job de cobrança
-- ============================================================

-- 1. Adicionar campos de contato do pagador em contas_receber
ALTER TABLE public.contas_receber
  ADD COLUMN IF NOT EXISTS pagador_email    text,
  ADD COLUMN IF NOT EXISTS pagador_telefone text;

-- 2. RLS para config_canais (permitir leitura/escrita pelo usuário autenticado)
-- A proteção real das API keys será no frontend (mascarar ao exibir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'config_canais' AND policyname = 'config_canais: select'
  ) THEN
    CREATE POLICY "config_canais: select"
      ON public.config_canais FOR SELECT
      USING (company_id IN (
        SELECT uc.company_id FROM public.user_companies uc WHERE uc.user_id = auth.uid()
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'config_canais' AND policyname = 'config_canais: insert'
  ) THEN
    CREATE POLICY "config_canais: insert"
      ON public.config_canais FOR INSERT
      WITH CHECK (company_id IN (
        SELECT uc.company_id FROM public.user_companies uc WHERE uc.user_id = auth.uid()
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'config_canais' AND policyname = 'config_canais: update'
  ) THEN
    CREATE POLICY "config_canais: update"
      ON public.config_canais FOR UPDATE
      USING (company_id IN (
        SELECT uc.company_id FROM public.user_companies uc WHERE uc.user_id = auth.uid()
      ));
  END IF;
END $$;

-- 3. RLS para regua_cobranca
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'regua_cobranca' AND policyname = 'regua_cobranca: select'
  ) THEN
    ALTER TABLE public.regua_cobranca ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "regua_cobranca: select"
      ON public.regua_cobranca FOR SELECT
      USING (company_id IN (
        SELECT uc.company_id FROM public.user_companies uc WHERE uc.user_id = auth.uid()
      ));
    CREATE POLICY "regua_cobranca: insert"
      ON public.regua_cobranca FOR INSERT
      WITH CHECK (company_id IN (
        SELECT uc.company_id FROM public.user_companies uc WHERE uc.user_id = auth.uid()
      ));
    CREATE POLICY "regua_cobranca: update"
      ON public.regua_cobranca FOR UPDATE
      USING (company_id IN (
        SELECT uc.company_id FROM public.user_companies uc WHERE uc.user_id = auth.uid()
      ));
    CREATE POLICY "regua_cobranca: delete"
      ON public.regua_cobranca FOR DELETE
      USING (company_id IN (
        SELECT uc.company_id FROM public.user_companies uc WHERE uc.user_id = auth.uid()
      ));
  END IF;
END $$;

-- 4. RLS para regua_cobranca_log
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'regua_cobranca_log' AND policyname = 'regua_cobranca_log: select'
  ) THEN
    ALTER TABLE public.regua_cobranca_log ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "regua_cobranca_log: select"
      ON public.regua_cobranca_log FOR SELECT
      USING (regua_id IN (
        SELECT r.id FROM public.regua_cobranca r
        WHERE r.company_id IN (
          SELECT uc.company_id FROM public.user_companies uc WHERE uc.user_id = auth.uid()
        )
      ));
  END IF;
END $$;

-- 5. RLS para templates_mensagem
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'templates_mensagem' AND policyname = 'templates_mensagem: select'
  ) THEN
    ALTER TABLE public.templates_mensagem ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "templates_mensagem: select"
      ON public.templates_mensagem FOR SELECT
      USING (
        company_id IS NULL
        OR company_id IN (
          SELECT uc.company_id FROM public.user_companies uc WHERE uc.user_id = auth.uid()
        )
      );
    CREATE POLICY "templates_mensagem: insert"
      ON public.templates_mensagem FOR INSERT
      WITH CHECK (company_id IN (
        SELECT uc.company_id FROM public.user_companies uc WHERE uc.user_id = auth.uid()
      ));
    CREATE POLICY "templates_mensagem: update"
      ON public.templates_mensagem FOR UPDATE
      USING (company_id IN (
        SELECT uc.company_id FROM public.user_companies uc WHERE uc.user_id = auth.uid()
      ));
  END IF;
END $$;

-- 6. RLS para alertas_log
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'alertas_log' AND policyname = 'alertas_log: select'
  ) THEN
    ALTER TABLE public.alertas_log ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "alertas_log: select"
      ON public.alertas_log FOR SELECT
      USING (company_id IN (
        SELECT uc.company_id FROM public.user_companies uc WHERE uc.user_id = auth.uid()
      ));
  END IF;
END $$;

-- 7. Enable RLS on config_canais if not enabled
ALTER TABLE public.config_canais ENABLE ROW LEVEL SECURITY;
