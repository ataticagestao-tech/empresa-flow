-- =====================================================================
-- Wave 3.2 — Cron de expiracao + retencao de documentos LGPD
-- =====================================================================

-- ---------------------------------------------------------------------
-- Funcao 1: expira solicitacoes ativas com expira_em < now()
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expirar_cadastro_solicitacoes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.cadastro_solicitacoes
  SET status = 'expirado',
      observacao_admin = COALESCE(observacao_admin, '') ||
        CASE WHEN observacao_admin IS NULL OR observacao_admin = '' THEN '' ELSE ' | ' END ||
        'Expirado automaticamente em ' || now()::text
  WHERE status IN ('aguardando_envio','enviado','em_conversa')
    AND expira_em < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


-- ---------------------------------------------------------------------
-- Funcao 2: limpa documentos de solicitacoes rejeitadas/expiradas > 90 dias
-- ---------------------------------------------------------------------
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
  -- Lista paths de documentos de solicitacoes que devem ser limpas
  FOR r IN
    SELECT cm.id, cm.media_path
    FROM public.cadastro_mensagens cm
    JOIN public.cadastro_solicitacoes cs ON cs.id = cm.solicitacao_id
    WHERE cm.media_path IS NOT NULL
      AND cs.status IN ('rejeitado','expirado')
      AND cs.atualizado_em < now() - interval '90 days'
      -- Apenas paths que ainda estao em 'cadastros/' (nao foram movidos pra funcionarios/fornecedores)
      AND cm.media_path LIKE '%/cadastros/%'
  LOOP
    BEGIN
      PERFORM storage.delete_object('documentos', r.media_path);
      UPDATE public.cadastro_mensagens
      SET media_path = NULL,
          dados_extraidos_msg = COALESCE(dados_extraidos_msg, '{}'::jsonb) ||
            jsonb_build_object('documento_deletado_em', now()::text, 'motivo', 'retencao_90d')
      WHERE id = r.id;
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- ignora erros de delete (arquivo pode ja nao existir)
      NULL;
    END;
  END LOOP;

  RETURN v_count;
END;
$$;


-- ---------------------------------------------------------------------
-- Agendamento via pg_cron
-- ---------------------------------------------------------------------
DO $$ BEGIN
  -- Garante que pg_cron esta habilitado
  CREATE EXTENSION IF NOT EXISTS pg_cron;
END $$;

-- Cron diario as 02:00 UTC: expira solicitacoes
SELECT cron.unschedule('expirar-cadastros-diario') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'expirar-cadastros-diario'
);
SELECT cron.schedule(
  'expirar-cadastros-diario',
  '0 2 * * *',  -- 02:00 UTC todos os dias
  $$SELECT public.expirar_cadastro_solicitacoes();$$
);

-- Cron mensal dia 1 as 03:00 UTC: limpa documentos antigos
SELECT cron.unschedule('limpar-docs-cadastros-mensal') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'limpar-docs-cadastros-mensal'
);
SELECT cron.schedule(
  'limpar-docs-cadastros-mensal',
  '0 3 1 * *',  -- 03:00 UTC todo dia 1 do mes
  $$SELECT public.limpar_documentos_cadastros_antigos();$$
);
