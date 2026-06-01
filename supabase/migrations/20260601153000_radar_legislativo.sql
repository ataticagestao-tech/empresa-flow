-- ============================================================
-- Radar Legislativo — monitora proposições da Câmara dos Deputados
-- (PL/PLP/MPV/PEC) relevantes para PMEs/clínicas.
--
-- Dados PÚBLICOS e COMPARTILHADOS entre todos os tenants (não há
-- company_id). Acesso é mediado pela Edge Function radar-legislativo
-- (service role); por isso RLS fica ON sem policies (anon/authenticated
-- não tocam direto na tabela; service_role faz bypass).
--
-- Coleta semanal via pg_cron → net.http_post na edge function (mesmo
-- padrão de importar-extrato-email). Reaproveita os vault secrets
-- 'supabase_url' e 'service_role_key' já cadastrados no projeto.
-- ============================================================

-- ── Proposições monitoradas ──
CREATE TABLE IF NOT EXISTS public.radar_proposicoes (
    id BIGSERIAL PRIMARY KEY,

    -- Dados da Câmara
    camara_id BIGINT NOT NULL UNIQUE,
    sigla_tipo VARCHAR(5) NOT NULL,        -- PL, PLP, MPV, PEC
    numero INTEGER NOT NULL,
    ano INTEGER NOT NULL,
    ementa TEXT NOT NULL,
    ementa_detalhada TEXT,
    keywords_camara TEXT,
    data_apresentacao TIMESTAMPTZ,

    -- Status / Tramitação
    status_sigla_orgao VARCHAR(20),
    status_descricao TEXT,
    status_data TIMESTAMPTZ,
    status_despacho TEXT,

    -- Classificação Gestap
    tema_codigo INTEGER,
    tema_nome VARCHAR(100),
    relevancia VARCHAR(10) NOT NULL DEFAULT 'media',  -- alta, media, baixa
    keyword_match TEXT,

    -- Controle
    url_camara TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notificado BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_radar_prop_ano ON public.radar_proposicoes (ano DESC);
CREATE INDEX IF NOT EXISTS idx_radar_prop_tema ON public.radar_proposicoes (tema_codigo);
CREATE INDEX IF NOT EXISTS idx_radar_prop_relevancia ON public.radar_proposicoes (relevancia);
CREATE INDEX IF NOT EXISTS idx_radar_prop_notificado ON public.radar_proposicoes (notificado);
CREATE INDEX IF NOT EXISTS idx_radar_prop_data ON public.radar_proposicoes (data_apresentacao DESC NULLS LAST);

-- ── Histórico de execuções do job ──
CREATE TABLE IF NOT EXISTS public.radar_execucoes (
    id BIGSERIAL PRIMARY KEY,
    executado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    temas_consultados INTEGER DEFAULT 0,
    keywords_consultados INTEGER DEFAULT 0,
    proposicoes_encontradas INTEGER DEFAULT 0,
    proposicoes_novas INTEGER DEFAULT 0,
    erro TEXT,
    duracao_segundos NUMERIC(6,2)
);

-- ── RLS: ON sem policies → só service_role acessa (edge function) ──
ALTER TABLE public.radar_proposicoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_execucoes  ENABLE ROW LEVEL SECURITY;

-- ── Cron semanal (segunda 09:05 UTC ≈ 06:05 BRT) ──
DO $$
BEGIN
    PERFORM cron.unschedule('radar-legislativo-weekly');
EXCEPTION WHEN OTHERS THEN
    NULL;  -- ainda não existia
END $$;

SELECT cron.schedule(
    'radar-legislativo-weekly',
    '5 9 * * 1',
    $$
    SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/radar-legislativo',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
        ),
        body := jsonb_build_object('recurso', 'executar', 'dias', 7)
    );
    $$
);
