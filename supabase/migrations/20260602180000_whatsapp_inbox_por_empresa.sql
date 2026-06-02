-- ============================================================
-- WHATSAPP INBOX POR EMPRESA
-- Libera o inbox pra usuários comuns verem SÓ a empresa deles.
--   1. RPC ganha p_company_id (carimba a conversa na empresa de quem envia)
--   2. RLS SELECT por empresa (defesa em profundidade) — leads ficam fora
-- ============================================================

-- 1. RPC: adiciona p_company_id. DROP do antigo (muda assinatura) + recria.
DROP FUNCTION IF EXISTS public.whatsapp_registrar_msg(
  text, text, text, text, text, text, text, jsonb, jsonb, text
);

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
  p_status          text DEFAULT NULL,
  p_company_id      uuid DEFAULT NULL          -- carimba a conversa nesta empresa (quem envia)
)
RETURNS TABLE(conversa_id uuid, ia_ativa boolean, is_lead boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone       text;
  v_company     uuid;
  v_is_lead     boolean := true;
  v_conv_id     uuid;
  v_ia_ativa    boolean;
  v_is_lead_out boolean;
  v_preview     text;
BEGIN
  -- Normaliza telefone (55 + DDD + número, sem o 9 extra)
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

  -- Empresa: explícita (p_company_id) tem prioridade; senão auto-detecta por whatsapp_acesso.
  IF p_company_id IS NOT NULL THEN
    v_company := p_company_id;
    v_is_lead := false;
  ELSE
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
  END IF;

  v_preview := left(coalesce(p_conteudo, ''), 140);

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
    -- carimbo: mantém a empresa já existente; só preenche se estiver vazia (não rouba de outra)
    company_id           = COALESCE(public.whatsapp_conversas.company_id, EXCLUDED.company_id),
    is_lead              = public.whatsapp_conversas.is_lead
                           AND COALESCE(public.whatsapp_conversas.company_id, EXCLUDED.company_id) IS NULL,
    referral             = COALESCE(public.whatsapp_conversas.referral, EXCLUDED.referral),
    last_message_at      = EXCLUDED.last_message_at,
    last_message_preview = EXCLUDED.last_message_preview,
    last_message_autor   = EXCLUDED.last_message_autor,
    unread_count         = public.whatsapp_conversas.unread_count
                           + CASE WHEN p_direcao = 'entrada' THEN 1 ELSE 0 END,
    updated_at           = now()
  RETURNING id, public.whatsapp_conversas.ia_ativa, public.whatsapp_conversas.is_lead
    INTO v_conv_id, v_ia_ativa, v_is_lead_out;

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

-- 2. RLS SELECT por empresa (defesa em profundidade; edge function é o gate principal).
--    Usuário comum só enxerga conversas da(s) empresa(s) dele; leads (company_id null) ficam fora.
DROP POLICY IF EXISTS whatsapp_conversas_select_empresa ON public.whatsapp_conversas;
CREATE POLICY whatsapp_conversas_select_empresa ON public.whatsapp_conversas
  FOR SELECT TO authenticated
  USING (
    company_id IS NOT NULL
    AND company_id IN (
      SELECT uc.company_id FROM public.user_companies uc WHERE uc.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS whatsapp_mensagens_select_empresa ON public.whatsapp_mensagens;
CREATE POLICY whatsapp_mensagens_select_empresa ON public.whatsapp_mensagens
  FOR SELECT TO authenticated
  USING (
    conversa_id IN (
      SELECT c.id FROM public.whatsapp_conversas c
      WHERE c.company_id IS NOT NULL
        AND c.company_id IN (
          SELECT uc.company_id FROM public.user_companies uc WHERE uc.user_id = auth.uid()
        )
    )
  );

COMMENT ON FUNCTION public.whatsapp_registrar_msg IS 'Upsert conversa + insert mensagem; detecta lead/empresa (p_company_id carimba a conversa na empresa de quem envia)';
