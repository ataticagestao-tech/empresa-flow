-- =====================================================================
-- Wave 1.1 — Cadastro automatizado via WhatsApp
-- Tabelas: cadastro_solicitacoes, cadastro_mensagens
-- =====================================================================

-- ---------------------------------------------------------------------
-- TABELA 1: cadastro_solicitacoes
-- Uma linha por solicitacao de dados (1 telefone pode ter varias historicas,
-- mas apenas 1 ativa por company_id+telefone simultaneamente)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cadastro_solicitacoes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Tipo + alvo (employee_id OU supplier_id; ambos nulos = cadastro novo sem stub)
  tipo                  text NOT NULL CHECK (tipo IN ('funcionario','fornecedor')),
  employee_id           uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  supplier_id           uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,

  -- Identificacao do destinatario
  nome_destinatario     text NOT NULL,
  telefone              text NOT NULL,  -- normalizado: DDI+DDD+numero (ex: 5511999998888)

  -- Estado da conversa
  status                text NOT NULL DEFAULT 'aguardando_envio'
    CHECK (status IN (
      'aguardando_envio',
      'enviado',
      'em_conversa',
      'pronto_aprovacao',
      'requer_revisao',
      'aprovado',
      'rejeitado',
      'expirado'
    )),

  -- Dados estruturados extraidos (merge incremental a cada mensagem)
  dados_extraidos       jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Campos que faltam preencher
  campos_obrigatorios   text[] NOT NULL DEFAULT array['cpf']::text[],
  campos_faltando       text[] NOT NULL DEFAULT array[]::text[],

  -- Estado de conversa
  ultima_pergunta       text,
  tentativas_por_campo  jsonb NOT NULL DEFAULT '{}'::jsonb,
  permite_skip          boolean NOT NULL DEFAULT true,

  -- Auditoria
  criado_por            uuid REFERENCES auth.users(id),
  criado_em             timestamptz NOT NULL DEFAULT now(),
  atualizado_em         timestamptz NOT NULL DEFAULT now(),
  expira_em             timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  aprovado_por          uuid REFERENCES auth.users(id),
  aprovado_em           timestamptz,
  observacao_admin      text,

  -- Garante exatamente um dos campos employee_id/supplier_id (ou ambos null para novo)
  CONSTRAINT cadastro_target_check CHECK (
    NOT (employee_id IS NOT NULL AND supplier_id IS NOT NULL)
  ),

  -- Coerencia tipo vs alvo
  CONSTRAINT cadastro_tipo_alvo_check CHECK (
    (tipo = 'funcionario' AND supplier_id IS NULL) OR
    (tipo = 'fornecedor' AND employee_id IS NULL)
  )
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_cadastro_solicitacoes_company_status
  ON public.cadastro_solicitacoes(company_id, status);

-- Lookup rapido para o webhook: dado telefone, achar solicitacao ativa
CREATE INDEX IF NOT EXISTS idx_cadastro_solicitacoes_telefone_ativa
  ON public.cadastro_solicitacoes(telefone)
  WHERE status IN ('enviado','em_conversa');

-- Unica solicitacao ativa por telefone+company simultaneamente
CREATE UNIQUE INDEX IF NOT EXISTS uq_cadastro_solicitacao_ativa
  ON public.cadastro_solicitacoes(company_id, telefone)
  WHERE status IN ('aguardando_envio','enviado','em_conversa');

-- Trigger pra atualizar atualizado_em
CREATE OR REPLACE FUNCTION public.cadastro_solicitacoes_touch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cadastro_solicitacoes_touch ON public.cadastro_solicitacoes;
CREATE TRIGGER trg_cadastro_solicitacoes_touch
  BEFORE UPDATE ON public.cadastro_solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.cadastro_solicitacoes_touch();


-- ---------------------------------------------------------------------
-- TABELA 2: cadastro_mensagens
-- Historico completo de mensagens trocadas (auditoria + contexto pra Claude)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cadastro_mensagens (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id        uuid NOT NULL REFERENCES public.cadastro_solicitacoes(id) ON DELETE CASCADE,
  direcao               text NOT NULL CHECK (direcao IN ('enviada','recebida')),
  conteudo              text,
  media_path            text,
  media_mime            text,
  media_tipo            text CHECK (media_tipo IS NULL OR media_tipo IN ('imagem','pdf','documento','audio','video')),
  dados_extraidos_msg   jsonb,
  evolution_message_id  text,
  criado_em             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cadastro_mensagens_solicitacao
  ON public.cadastro_mensagens(solicitacao_id, criado_em);


-- ---------------------------------------------------------------------
-- RLS — Multi-tenant via user_companies (padrao do projeto)
-- ---------------------------------------------------------------------
ALTER TABLE public.cadastro_solicitacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cadastro_mensagens   ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cadastro_solicitacoes' AND policyname='cadastro_solicitacoes_select_own') THEN
    CREATE POLICY cadastro_solicitacoes_select_own ON public.cadastro_solicitacoes FOR SELECT
      USING (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cadastro_solicitacoes' AND policyname='cadastro_solicitacoes_insert_own') THEN
    CREATE POLICY cadastro_solicitacoes_insert_own ON public.cadastro_solicitacoes FOR INSERT
      WITH CHECK (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cadastro_solicitacoes' AND policyname='cadastro_solicitacoes_update_own') THEN
    CREATE POLICY cadastro_solicitacoes_update_own ON public.cadastro_solicitacoes FOR UPDATE
      USING (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cadastro_solicitacoes' AND policyname='cadastro_solicitacoes_delete_own') THEN
    CREATE POLICY cadastro_solicitacoes_delete_own ON public.cadastro_solicitacoes FOR DELETE
      USING (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cadastro_mensagens' AND policyname='cadastro_mensagens_select_own') THEN
    CREATE POLICY cadastro_mensagens_select_own ON public.cadastro_mensagens FOR SELECT
      USING (solicitacao_id IN (
        SELECT id FROM public.cadastro_solicitacoes
        WHERE company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid())
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cadastro_mensagens' AND policyname='cadastro_mensagens_insert_own') THEN
    CREATE POLICY cadastro_mensagens_insert_own ON public.cadastro_mensagens FOR INSERT
      WITH CHECK (solicitacao_id IN (
        SELECT id FROM public.cadastro_solicitacoes
        WHERE company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid())
      ));
  END IF;
END $$;


-- ---------------------------------------------------------------------
-- RPC helper: lookup rapido pro webhook
-- Edge Functions usam service-role e bypassam RLS, mas mantemos um helper
-- com SECURITY DEFINER caso queiramos chamar do frontend tambem
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cadastro_solicitacao_ativa_por_telefone(
  p_telefone text
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.cadastro_solicitacoes
  WHERE telefone = p_telefone
    AND status IN ('enviado','em_conversa')
  ORDER BY criado_em DESC
  LIMIT 1;
$$;


-- ---------------------------------------------------------------------
-- View auxiliar pra UI: solicitacoes com contagem de mensagens
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_cadastro_solicitacoes_resumo AS
SELECT
  s.*,
  COALESCE(m.total_mensagens, 0) AS total_mensagens,
  COALESCE(m.total_anexos, 0) AS total_anexos,
  m.ultima_mensagem_em
FROM public.cadastro_solicitacoes s
LEFT JOIN (
  SELECT
    solicitacao_id,
    COUNT(*) AS total_mensagens,
    COUNT(*) FILTER (WHERE media_path IS NOT NULL) AS total_anexos,
    MAX(criado_em) AS ultima_mensagem_em
  FROM public.cadastro_mensagens
  GROUP BY solicitacao_id
) m ON m.solicitacao_id = s.id;


-- ---------------------------------------------------------------------
-- Comentarios para documentacao
-- ---------------------------------------------------------------------
COMMENT ON TABLE public.cadastro_solicitacoes IS
  'Solicitacoes de cadastro automatico via WhatsApp. Uma por telefone+company ativa simultaneamente.';
COMMENT ON COLUMN public.cadastro_solicitacoes.telefone IS
  'Telefone normalizado (DDI+DDD+numero, ex: 5511999998888). Usado para matching no webhook.';
COMMENT ON COLUMN public.cadastro_solicitacoes.dados_extraidos IS
  'JSON com campos extraidos das mensagens via Claude. Merge incremental.';
COMMENT ON COLUMN public.cadastro_solicitacoes.tentativas_por_campo IS
  'Contador de tentativas por campo. Apos 2 falhas no mesmo campo -> requer_revisao.';

COMMENT ON TABLE public.cadastro_mensagens IS
  'Historico completo de mensagens trocadas com o destinatario. Auditoria + contexto pro processor.';
