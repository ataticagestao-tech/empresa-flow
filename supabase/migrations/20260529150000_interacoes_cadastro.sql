-- =====================================================================
-- Histórico de Interações por cadastro (Fase 1)
-- Cada conversa/contato com uma pessoa (funcionário/fornecedor/cliente)
-- vira uma anotação resumida (tema + resumo + se teve arquivo), anexada
-- no cadastro dela. Números não identificados ficam numa "caixa de
-- entrada" (alvo_tipo='nao_identificado') pra vincular depois.
-- Design: docs/10-interacoes-cadastro.md
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.interacoes_cadastro (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Alvo: funcionário OU fornecedor OU cliente (no máximo um); ou não identificado
  alvo_tipo     text NOT NULL DEFAULT 'nao_identificado'
                  CHECK (alvo_tipo IN ('funcionario','fornecedor','cliente','nao_identificado')),
  employee_id   uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  supplier_id   uuid REFERENCES public.suppliers(id)  ON DELETE SET NULL,
  customer_id   uuid REFERENCES public.clients(id)    ON DELETE SET NULL,

  -- Conteúdo da anotação (gerado pela IA)
  canal         text NOT NULL DEFAULT 'whatsapp'
                  CHECK (canal IN ('whatsapp','assistente','sistema')),
  direcao       text CHECK (direcao IN ('entrada','saida','mista')),
  tema          text,
  resumo        text,
  teve_arquivo  boolean NOT NULL DEFAULT false,
  arquivo_path  text,

  telefone      text,                 -- número envolvido (rastreio / vínculo)
  ocorrido_em   timestamptz NOT NULL DEFAULT now(),
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,  -- ids de mensagens, origem, etc.
  created_at    timestamptz NOT NULL DEFAULT now(),

  -- No máximo um alvo preenchido
  CONSTRAINT interacoes_alvo_unico CHECK (
    (employee_id IS NOT NULL)::int
    + (supplier_id IS NOT NULL)::int
    + (customer_id IS NOT NULL)::int <= 1
  ),
  -- Coerência tipo vs alvo
  CONSTRAINT interacoes_tipo_alvo CHECK (
    (alvo_tipo = 'funcionario'      AND employee_id IS NOT NULL AND supplier_id IS NULL AND customer_id IS NULL) OR
    (alvo_tipo = 'fornecedor'       AND supplier_id IS NOT NULL AND employee_id IS NULL AND customer_id IS NULL) OR
    (alvo_tipo = 'cliente'          AND customer_id IS NOT NULL AND employee_id IS NULL AND supplier_id IS NULL) OR
    (alvo_tipo = 'nao_identificado' AND employee_id IS NULL AND supplier_id IS NULL AND customer_id IS NULL)
  )
);

-- Índices pra montar a aba "Interações" de cada cadastro rapidinho
CREATE INDEX IF NOT EXISTS interacoes_emp_idx  ON public.interacoes_cadastro (employee_id, ocorrido_em DESC) WHERE employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS interacoes_sup_idx  ON public.interacoes_cadastro (supplier_id, ocorrido_em DESC) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS interacoes_cli_idx  ON public.interacoes_cadastro (customer_id, ocorrido_em DESC) WHERE customer_id IS NOT NULL;
-- Caixa de entrada (não identificados) por empresa
CREATE INDEX IF NOT EXISTS interacoes_inbox_idx ON public.interacoes_cadastro (company_id, ocorrido_em DESC) WHERE alvo_tipo = 'nao_identificado';
-- Vínculo por telefone (pra casar número → cadastro depois)
CREATE INDEX IF NOT EXISTS interacoes_tel_idx  ON public.interacoes_cadastro (company_id, telefone);

-- =====================================================================
-- RLS — isolamento multi-empresa (mesmo helper do resto do sistema)
-- =====================================================================
ALTER TABLE public.interacoes_cadastro ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "interacoes_select" ON public.interacoes_cadastro;
CREATE POLICY "interacoes_select" ON public.interacoes_cadastro
  FOR SELECT USING (public.has_company_access(company_id));

DROP POLICY IF EXISTS "interacoes_insert" ON public.interacoes_cadastro;
CREATE POLICY "interacoes_insert" ON public.interacoes_cadastro
  FOR INSERT WITH CHECK (public.has_company_access(company_id));

DROP POLICY IF EXISTS "interacoes_update" ON public.interacoes_cadastro;
CREATE POLICY "interacoes_update" ON public.interacoes_cadastro
  FOR UPDATE USING (public.has_company_access(company_id));

DROP POLICY IF EXISTS "interacoes_delete" ON public.interacoes_cadastro;
CREATE POLICY "interacoes_delete" ON public.interacoes_cadastro
  FOR DELETE USING (public.has_company_access(company_id));

COMMENT ON TABLE public.interacoes_cadastro IS
  'Histórico de interações (WhatsApp/assistente/sistema) resumido por IA e anexado ao cadastro de funcionário/fornecedor/cliente. Não identificados = caixa de entrada. Ver docs/10-interacoes-cadastro.md';
