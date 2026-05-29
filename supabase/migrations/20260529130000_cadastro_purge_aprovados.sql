-- =====================================================================
-- LGPD — fecha a lacuna de retenção de documentos de cadastro
-- Antes: a limpeza só apagava fotos de cadastros 'rejeitado'/'expirado'
-- (após 90 dias). Cadastros 'aprovado' mantinham a foto do documento em
-- 'cadastros/' indefinidamente — passivo de dado sensível desnecessário.
--
-- Agora: também apaga a mídia de cadastros 'aprovado' 7 dias após a
-- aprovação. A cópia em 'cadastros/' é apenas de trabalho — uma vez
-- aprovado, o cadastro canônico já tem os campos extraídos.
--
-- Segurança: o filtro `media_path LIKE '%/cadastros/%'` garante que só a
-- cópia transitória é apagada. Documentos movidos para a pasta do
-- funcionário/fornecedor/cliente (retenção legítima) NÃO são tocados.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.limpar_documentos_cadastros_antigos()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  r record;
BEGIN
  FOR r IN
    SELECT cm.id, cm.media_path, cs.status
    FROM public.cadastro_mensagens cm
    JOIN public.cadastro_solicitacoes cs ON cs.id = cm.solicitacao_id
    WHERE cm.media_path IS NOT NULL
      -- Só a cópia de trabalho; docs movidos pra pasta canônica são preservados
      AND cm.media_path LIKE '%/cadastros/%'
      AND (
        -- Rejeitados / expirados: retenção de 90 dias (comportamento original)
        (cs.status IN ('rejeitado','expirado')
          AND cs.atualizado_em < now() - interval '90 days')
        OR
        -- Aprovados: cópia de trabalho some 7 dias após aprovar (LGPD — minimização)
        (cs.status = 'aprovado'
          AND COALESCE(cs.aprovado_em, cs.atualizado_em) < now() - interval '7 days')
      )
  LOOP
    BEGIN
      PERFORM storage.delete_object('documentos', r.media_path);
      UPDATE public.cadastro_mensagens
      SET media_path = NULL,
          dados_extraidos_msg = COALESCE(dados_extraidos_msg, '{}'::jsonb) ||
            jsonb_build_object(
              'documento_deletado_em', now()::text,
              'motivo', CASE WHEN r.status = 'aprovado' THEN 'retencao_pos_aprovacao_7d'
                             ELSE 'retencao_90d' END
            )
      WHERE id = r.id;
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- ignora erros de delete (arquivo pode já não existir)
      NULL;
    END;
  END LOOP;

  RETURN v_count;
END;
$$;


-- ---------------------------------------------------------------------
-- Roda diariamente (era mensal) — pra mídia de aprovados não ficar
-- esperando até 1 mês depois da janela de 7 dias.
-- ---------------------------------------------------------------------
SELECT cron.unschedule('limpar-docs-cadastros-mensal') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'limpar-docs-cadastros-mensal'
);
SELECT cron.unschedule('limpar-docs-cadastros-diario') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'limpar-docs-cadastros-diario'
);
SELECT cron.schedule(
  'limpar-docs-cadastros-diario',
  '0 3 * * *',  -- 03:00 UTC todos os dias
  $$SELECT public.limpar_documentos_cadastros_antigos();$$
);
