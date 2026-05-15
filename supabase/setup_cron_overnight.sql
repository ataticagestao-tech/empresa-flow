-- ============================================================
-- SETUP DO CRON DO OVERNIGHT VIA WHATSAPP
-- Rodar 1x no SQL Editor do Supabase (com privilegios de owner).
--
-- Pre-requisitos:
--   1. Edge functions ja deployadas: gerar-overnight-pdf,
--      enviar-whatsapp e disparar-overnight-agendado.
--   2. Secret EVOLUTION_API_KEY configurada nas Functions.
--
-- Como funciona:
--   pg_cron chama HTTP a cada 5 minutos para a edge function
--   `disparar-overnight-agendado`. A propria edge function decide
--   qual empresa esta dentro da janela do horario configurado.
-- ============================================================

-- 1. Extensoes (idempotente)
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

-- 2. Vault: guarda URL do projeto e service_role key
--    (rode SOMENTE se ainda nao existem)
--    Pegue os valores em Project Settings > API.
do $$
declare
    v_url  text := 'https://SEU-PROJECT-REF.supabase.co';
    v_key  text := 'COLE_AQUI_O_SERVICE_ROLE_KEY';
begin
    if not exists (select 1 from vault.secrets where name = 'project_url') then
        perform vault.create_secret(v_url, 'project_url');
    end if;
    if not exists (select 1 from vault.secrets where name = 'service_role_key') then
        perform vault.create_secret(v_key, 'service_role_key');
    end if;
end $$;

-- 3. Remove agendamento antigo se existir
do $$
declare
    j integer;
begin
    select jobid into j from cron.job where jobname = 'overnight-whatsapp-tick';
    if j is not null then perform cron.unschedule(j); end if;
end $$;

-- 4. Agenda execucao a cada 5 minutos
select cron.schedule(
    'overnight-whatsapp-tick',
    '*/5 * * * *',
    $$
    select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/disparar-overnight-agendado',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
    );
    $$
);

-- 5. Verificacao
-- select * from cron.job where jobname = 'overnight-whatsapp-tick';
-- select * from cron.job_run_details order by start_time desc limit 5;
