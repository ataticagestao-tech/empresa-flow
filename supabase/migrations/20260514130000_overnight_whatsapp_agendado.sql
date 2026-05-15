-- ============================================================
-- GESTAP — Overnight: envio agendado por WhatsApp
-- Adiciona campos para destinatários, horário e status do envio
-- diário do PDF Overnight via Evolution API.
-- ============================================================

alter table public.overnight_config
    add column if not exists whatsapp_ativo            boolean not null default false,
    add column if not exists whatsapp_destinos         text[]  not null default '{}'::text[],
    add column if not exists horario_envio             time    not null default '18:00:00',
    add column if not exists whatsapp_mensagem         text,
    add column if not exists whatsapp_ultimo_envio_em      timestamptz,
    add column if not exists whatsapp_ultimo_envio_status  text,
    add column if not exists whatsapp_ultimo_envio_erro    text;

comment on column public.overnight_config.whatsapp_ativo            is 'Liga/desliga o envio automático do Overnight via WhatsApp';
comment on column public.overnight_config.whatsapp_destinos         is 'Lista de números de WhatsApp para receber o PDF diário';
comment on column public.overnight_config.horario_envio             is 'Horário (timezone America/Sao_Paulo) em que o cron dispara o envio';
comment on column public.overnight_config.whatsapp_mensagem         is 'Legenda enviada junto com o PDF (opcional; tem fallback)';
comment on column public.overnight_config.whatsapp_ultimo_envio_em  is 'Timestamp da última execução do envio agendado';
comment on column public.overnight_config.whatsapp_ultimo_envio_status is 'sucesso | erro | parcial';
comment on column public.overnight_config.whatsapp_ultimo_envio_erro   is 'Descrição do erro do último envio (quando aplicável)';

-- ------------------------------------------------------------
-- LOGS: identificar envios automáticos por WhatsApp
-- ------------------------------------------------------------
alter table public.overnight_logs
    drop constraint if exists overnight_logs_origem_check;

alter table public.overnight_logs
    add constraint overnight_logs_origem_check
        check (origem in ('manual','agendado','whatsapp'));

alter table public.overnight_logs
    add column if not exists destinos_enviados text[] default '{}'::text[];

comment on column public.overnight_logs.destinos_enviados is
    'Telefones (formato normalizado) que receberam o PDF nesta execução';

-- ------------------------------------------------------------
-- ÍNDICE para o cron tick (procurar configs ativas com horário <= now)
-- ------------------------------------------------------------
create index if not exists idx_overnight_config_whatsapp_ativo
    on public.overnight_config (whatsapp_ativo, horario_envio)
    where whatsapp_ativo = true;
