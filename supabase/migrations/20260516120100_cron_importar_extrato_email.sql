-- ============================================================
-- CRON: chama Edge Function importar-extrato-email de hora em hora
--
-- Pré-requisitos:
--   • pg_cron habilitado (Supabase: Dashboard > Database > Extensions > pg_cron)
--   • pg_net habilitado (idem)
--
-- Segurança:
--   A chamada usa o SERVICE_ROLE_KEY no header Authorization. Esse valor é lido
--   de `vault.decrypted_secrets` (Supabase Vault). Pra cadastrar:
--     SELECT vault.create_secret('eyJh...your-service-role-key', 'service_role_key');
--     SELECT vault.create_secret('https://xxx.supabase.co', 'supabase_url');
--
-- Pra desligar temporariamente:
--   SELECT cron.unschedule('importar-extrato-email-hourly');
-- ============================================================

-- Removida qualquer schedule anterior com o mesmo nome (idempotência da migration)
DO $$
BEGIN
    PERFORM cron.unschedule('importar-extrato-email-hourly');
EXCEPTION WHEN OTHERS THEN
    NULL;  -- não existia ainda, ok
END $$;

-- Cron a cada hora ":05" (no minuto 5 de cada hora pra evitar pile-up de jobs no minuto 0)
SELECT cron.schedule(
    'importar-extrato-email-hourly',
    '5 * * * *',
    $$
    SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/importar-extrato-email',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
        ),
        body := '{}'::jsonb
    );
    $$
);

COMMENT ON EXTENSION pg_cron IS 'Tatica: usado para overnight (whatsapp), import de extrato via email';
