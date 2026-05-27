-- =====================================================================
-- Fix RLS em activity_log: trigger nao consegue inserir ao criar CP/CR/venda
-- =====================================================================
-- Sintoma: ao criar conta a pagar, modal mostrava
--   "new row violates row-level security policy for table 'activity_log'"
--
-- Causa: existe um trigger AFTER INSERT em contas_pagar/contas_receber/vendas
-- que registra a atividade em public.activity_log. A policy original
-- exigia auth.role() = 'service_role' para INSERT, mas o trigger roda
-- no contexto do usuario autenticado (chamada do PostgREST via supabase-js),
-- entao o INSERT era rejeitado e cancelava a transacao da CP inteira.
--
-- Fix: permitir INSERT em activity_log para usuarios autenticados desde
-- que o company_id da linha pertenca a uma empresa do usuario
-- (mesma regra do SELECT). O trigger ja preenche company_id a partir
-- da linha de origem, entao a checagem garante isolamento entre tenants.
-- =====================================================================

do $$
begin
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'activity_log') then
    raise notice 'Tabela activity_log nao existe — pulando fix de RLS';
    return;
  end if;

  -- Garante RLS habilitada (no-op se ja estiver)
  execute 'alter table public.activity_log enable row level security';

  -- Remove qualquer policy de INSERT antiga
  execute 'drop policy if exists "activity_log: insert service_role" on public.activity_log';
  execute 'drop policy if exists "activity_log insert service_role"  on public.activity_log';
  execute 'drop policy if exists "activity_log: insert by company"   on public.activity_log';
  execute 'drop policy if exists "activity_log insert by company"    on public.activity_log';

  -- Nova policy: usuario autenticado pode inserir desde que company_id
  -- esteja entre as empresas as quais ele pertence (via user_companies).
  -- Service_role (Edge Functions, webhooks) continua passando pelo bypass nativo.
  execute $POL$
    create policy "activity_log: insert by company"
      on public.activity_log
      for insert
      to authenticated
      with check (
        company_id in (
          select uc.company_id
          from public.user_companies uc
          where uc.user_id = auth.uid()
        )
      )
  $POL$;
end$$;
