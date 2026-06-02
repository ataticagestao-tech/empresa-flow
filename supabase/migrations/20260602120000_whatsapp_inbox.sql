-- ============================================================
-- WHATSAPP INBOX — tabelas + helper
--
-- Caixa de entrada do número oficial da Tática (Cloud API). Um
-- número só pra toda a Tática (não é por empresa-cliente), então
-- as tabelas NÃO têm policy de SELECT pública: acesso só via
-- service role (webhook / edge function whatsapp-inbox, que faz o
-- gate de dono/admin). Leads (números desconhecidos) também são
-- gravados aqui — é o que viabiliza o tráfego pago (CTWA).
-- ============================================================

-- 1. Conversas (1 linha por contato/telefone = thread)
CREATE TABLE IF NOT EXISTS public.whatsapp_conversas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE,                 -- normalizado (55 + DDD + número, 12-13 díg)
  nome text,                                  -- pushName do WhatsApp / contato
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  is_lead boolean NOT NULL DEFAULT true,      -- true = número não autorizado (prospect)
  ia_ativa boolean NOT NULL DEFAULT true,     -- false = humano assumiu, IA não responde
  unread_count integer NOT NULL DEFAULT 0,    -- mensagens recebidas ainda não vistas no inbox
  referral jsonb,                             -- objeto CTWA do anúncio (ad id, headline, source)
  last_message_at timestamptz,
  last_message_preview text,
  last_message_autor text,                    -- 'contato' | 'ia' | 'humano' | 'sistema'
  status text NOT NULL DEFAULT 'aberta',      -- 'aberta' | 'arquivada'
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_conversas_last_msg_idx
  ON public.whatsapp_conversas (last_message_at DESC NULLS LAST);

-- 2. Mensagens (1 linha por mensagem trocada)
CREATE TABLE IF NOT EXISTS public.whatsapp_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id uuid NOT NULL REFERENCES public.whatsapp_conversas(id) ON DELETE CASCADE,
  phone text NOT NULL,
  direcao text NOT NULL CHECK (direcao IN ('entrada', 'saida')),
  autor text NOT NULL CHECK (autor IN ('contato', 'ia', 'humano', 'sistema')),
  wa_message_id text UNIQUE,                  -- id da Cloud API (dedup + status). NULL permitido (múltiplos)
  tipo text NOT NULL DEFAULT 'texto'
    CHECK (tipo IN ('texto', 'imagem', 'documento', 'audio', 'video', 'template', 'interativo')),
  conteudo text,
  midia jsonb,                                -- { mime, cloudMediaId, filename }
  status text CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_mensagens_conversa_idx
  ON public.whatsapp_mensagens (conversa_id, created_at);

-- 3. RLS ligada, SEM policy pública (só service role escreve/lê).
ALTER TABLE public.whatsapp_conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_mensagens ENABLE ROW LEVEL SECURITY;

-- 4. Helper atômico: upsert da conversa + insert da mensagem + counters.
--    Detecta lead/empresa pelo telefone (whatsapp_acesso verificado ou profile verificado).
--    SECURITY DEFINER → bypassa RLS; chamado via service role pelas functions.
CREATE OR REPLACE FUNCTION public.whatsapp_registrar_msg(
  p_phone           text,
  p_direcao         text,
  p_autor           text,
  p_conteudo        text DEFAULT NULL,
  p_wa_message_id   text DEFAULT NULL,
  p_tipo            text DEFAULT 'texto',
  p_nome            text DEFAULT NULL,
  p_midia           jsonb DEFAULT NULL,
  p_referral        jsonb DEFAULT NULL,
  p_status          text DEFAULT NULL
)
RETURNS TABLE(conversa_id uuid, ia_ativa boolean, is_lead boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone     text;
  v_company   uuid;
  v_is_lead   boolean := true;
  v_conv_id   uuid;
  v_ia_ativa  boolean;
  v_is_lead_out boolean;
  v_preview   text;
BEGIN
  -- Normaliza telefone (mesma regra do front/Cloud: 55 + DDD + número, sem o 9 extra)
  v_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  IF v_phone = '' THEN
    RAISE EXCEPTION 'telefone vazio';
  END IF;
  IF left(v_phone, 1) = '0' THEN v_phone := substr(v_phone, 2); END IF;
  IF left(v_phone, 2) <> '55' AND length(v_phone) IN (10, 11) THEN
    v_phone := '55' || v_phone;
  END IF;
  IF length(v_phone) = 13 AND substr(v_phone, 5, 1) = '9' THEN
    v_phone := substr(v_phone, 1, 4) || substr(v_phone, 6);
  END IF;

  -- Detecta autorização → empresa + is_lead
  SELECT wa.company_id INTO v_company
  FROM public.whatsapp_acesso wa
  WHERE regexp_replace(wa.phone, '\D', '', 'g') = v_phone
    AND wa.status = 'verificado'
  ORDER BY wa.created_at
  LIMIT 1;

  IF v_company IS NOT NULL THEN
    v_is_lead := false;
  ELSE
    PERFORM 1 FROM public.profiles p
      WHERE regexp_replace(coalesce(p.whatsapp_phone, ''), '\D', '', 'g') = v_phone
        AND p.whatsapp_verified = true
      LIMIT 1;
    IF FOUND THEN v_is_lead := false; END IF;
  END IF;

  v_preview := left(coalesce(p_conteudo, ''), 140);

  -- Upsert da conversa
  INSERT INTO public.whatsapp_conversas (
    phone, nome, company_id, is_lead, referral,
    last_message_at, last_message_preview, last_message_autor,
    unread_count, updated_at
  )
  VALUES (
    v_phone, p_nome, v_company, v_is_lead, p_referral,
    now(), v_preview, p_autor,
    CASE WHEN p_direcao = 'entrada' THEN 1 ELSE 0 END, now()
  )
  ON CONFLICT (phone) DO UPDATE SET
    nome                 = COALESCE(public.whatsapp_conversas.nome, EXCLUDED.nome),
    company_id           = COALESCE(public.whatsapp_conversas.company_id, EXCLUDED.company_id),
    is_lead              = EXCLUDED.is_lead,
    referral             = COALESCE(public.whatsapp_conversas.referral, EXCLUDED.referral),
    last_message_at      = EXCLUDED.last_message_at,
    last_message_preview = EXCLUDED.last_message_preview,
    last_message_autor   = EXCLUDED.last_message_autor,
    unread_count         = public.whatsapp_conversas.unread_count
                           + CASE WHEN p_direcao = 'entrada' THEN 1 ELSE 0 END,
    updated_at           = now()
  RETURNING id, public.whatsapp_conversas.ia_ativa, public.whatsapp_conversas.is_lead
    INTO v_conv_id, v_ia_ativa, v_is_lead_out;

  -- Insert da mensagem (dedup por wa_message_id quando houver)
  INSERT INTO public.whatsapp_mensagens (
    conversa_id, phone, direcao, autor, wa_message_id, tipo, conteudo, midia, status
  )
  VALUES (
    v_conv_id, v_phone, p_direcao, p_autor, p_wa_message_id, p_tipo, p_conteudo, p_midia, p_status
  )
  ON CONFLICT (wa_message_id) DO NOTHING;

  conversa_id := v_conv_id;
  ia_ativa    := v_ia_ativa;
  is_lead     := v_is_lead_out;
  RETURN NEXT;
END;
$$;

COMMENT ON TABLE public.whatsapp_conversas IS 'Threads do inbox de WhatsApp (Cloud API) — 1 linha por contato/telefone';
COMMENT ON TABLE public.whatsapp_mensagens IS 'Mensagens do inbox de WhatsApp (entrada/saída)';
COMMENT ON FUNCTION public.whatsapp_registrar_msg IS 'Upsert atômico de conversa + insert de mensagem; detecta lead/empresa pelo telefone';