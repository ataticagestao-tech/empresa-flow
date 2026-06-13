# Guia de Deploy e Operação — Gestap System

> Documento técnico para quem **publica atualizações** ou **opera a infraestrutura**. Para o manual do usuário, ver [MANUAL.md](MANUAL.md).

---

## Índice

1. [Arquitetura em uma página](#1-arquitetura)
2. [Domínios e produtos](#2-domínios-e-produtos)
3. [Deploy do frontend (Vercel)](#3-deploy-do-frontend)
4. [Migrations e banco (Supabase)](#4-migrations-e-banco)
5. [Edge Functions](#5-edge-functions)
6. [Variáveis de ambiente](#6-variáveis-de-ambiente)
7. [Cron jobs e WhatsApp](#7-cron-jobs-e-whatsapp)
8. [Rollback](#8-rollback)
9. [Monitoramento e logs](#9-monitoramento-e-logs)
10. [Troubleshooting comum](#10-troubleshooting-comum)
11. [Checklist pré-deploy](#11-checklist-pré-deploy)
12. [Em caso de incidente](#12-em-caso-de-incidente)

---

## 1. Arquitetura

```
                     ┌────────────────────────────┐
                     │   USUÁRIA (navegador)      │
                     │   ataticagestao.com        │
                     └─────────────┬──────────────┘
                                   │ HTTPS
                                   ▼
                     ┌────────────────────────────┐
                     │   VERCEL (CDN + Build)     │
                     │   Vite + React + TS        │
                     └─────────────┬──────────────┘
                                   │ supabase-js
                                   ▼
   ┌───────────────────────────────────────────────────────────┐
   │                       SUPABASE                            │
   │  ┌────────────┐  ┌──────────────┐  ┌───────────────────┐  │
   │  │ Postgres   │  │ Auth (RLS)   │  │ Edge Functions    │  │
   │  │ + pg_cron  │  │              │  │ • importar-extrato│  │
   │  │            │  │              │  │ • overnight-pdf   │  │
   │  │            │  │              │  │ • whatsapp-*      │  │
   │  └────────────┘  └──────────────┘  └─────────┬─────────┘  │
   └─────────────────────────────────────────────┼─────────────┘
                                                 │
                  ┌──────────────────────────────┼─────────────────┐
                  ▼                              ▼                 ▼
          ┌──────────────┐              ┌──────────────┐   ┌──────────────┐
          │ Gmail API    │              │ Evolution API│   │ Anthropic API│
          │ (OAuth)      │              │ (WhatsApp)   │   │ (Claude)     │
          └──────────────┘              └──────────────┘   └──────────────┘
```

**Stack:**
- Frontend: Vite + React 18 + TypeScript + Tailwind + shadcn/ui.
- Backend: Supabase (Postgres + RLS + Edge Functions Deno).
- Auth: Supabase Auth (e-mail/senha + Google OAuth).
- Pagamentos: nenhum gateway próprio (CR/CP são apenas registros).
- IA: Anthropic Claude (cadastro WhatsApp + visão).

---

## 2. Domínios e produtos

| Domínio              | Produto             | Repositório       | Notas                                                                |
|----------------------|---------------------|-------------------|----------------------------------------------------------------------|
| `ataticagestao.com`  | **empresa-flow**    | este repositório  | Sistema de gestão. Deploy via Vercel. Push para `fork main`.         |
| `meutatico.site`     | produto separado    | repositório próprio| Login Google cria usuário no 1º tenant ativo. **Não é este sistema.**|

**Importante:** se você confundir os deploys, vai publicar atualização errada no domínio errado. Sempre confirme o `git remote -v` antes de push.

---

## 3. Deploy do frontend

### 3.1. Fluxo padrão
```powershell
# Na pasta empresa-flow
git status                     # confere o que vai entrar
git add <arquivos>             # NUNCA use 'git add .' sem revisar (pode incluir .env, dist, etc.)
git commit -m "feat: nova tela X"
git push fork main
```

> **Por que `fork` e não `origin`?**
> `origin` aponta para o upstream sem permissão de push. `fork` é o remote com permissão. Confira com `git remote -v`.

A Vercel detecta o push e:
1. Roda `npm install` (ou `bun install`).
2. Roda `npm run build` (Vite gera o `/dist`).
3. Publica em produção em ~2 min.

### 3.2. Build local antes de push (recomendado)
```powershell
npm run build
# se passar sem erro, é seguro fazer push
```

### 3.3. Preview de PR
Cada branch que não seja `main` gera **preview deploy** automático na Vercel. URL fica nos comentários do PR.

### 3.4. Forçar recarga de cache no navegador
Após deploy, o usuário pode precisar de `Ctrl+Shift+R` para limpar cache. Se o problema persistir, verifique os headers de cache em `vercel.json`.

---

## 4. Migrations e banco

### 4.1. Estrutura
- Arquivos em `supabase/migrations/`, nomeados com timestamp: `YYYYMMDDHHMMSS_descricao.sql`.
- Cada migration é **imutável** depois de aplicada — se precisar mudar, crie uma nova.

### 4.2. Aplicar manualmente (modo atual)
1. Abrir **Supabase Dashboard → SQL Editor**.
2. Colar o conteúdo do `.sql`.
3. Rodar.

> **Pegadinha:** o SQL Editor **não persiste** `BEGIN`/`COMMIT` entre execuções. Se sua migration precisa ser atômica, embrulhe em:
> ```sql
> DO $$
> BEGIN
>   -- comandos aqui
> END $$;
> ```

### 4.3. Conferir o que rodou
Não há tabela de tracking automática (não usamos `supabase db push`). Mantenha o controle manualmente — uma vez aplicado, marque `-- APLICADO YYYY-MM-DD` no topo do arquivo, ou registre no commit.

### 4.4. Reverter
- Escreva uma migration inversa nova.
- **Nunca** edite uma migration já aplicada.
- Se o erro for crítico, rode o SQL de reversão direto no SQL Editor antes de criar o arquivo.

### 4.5. Backups
- Supabase faz backup diário automático (plano pago).
- Para backup ad-hoc: **Database → Backups → Create backup**.
- Restaurar: abra um ticket no Supabase ou use `pg_restore` se tiver dump local.

---

## 5. Edge Functions

Funções em Deno hospedadas no Supabase. Localizadas em `supabase/functions/<nome>/index.ts`.

### 5.1. Functions principais
| Function                        | O que faz                                                                   |
|---------------------------------|------------------------------------------------------------------------------|
| `importar-extrato-email`        | Lê e-mails Gmail com OFX anexo → cria `bank_transactions`.                  |
| `overnight-pdf-whatsapp`        | Gera PDF de faturamento/despesas e envia por WhatsApp.                      |
| `whatsapp-cadastro`             | Recebe foto via WhatsApp + Claude vision → cadastra funcionário/fornecedor. |
| `dedup-suppliers`/`-employees`  | Detecta e mescla duplicados.                                                |
| `criar-venda-atomica`           | RPC garantindo venda + itens + CR + mov em UMA transação.                   |

### 5.2. Deploy de uma function
```powershell
supabase functions deploy <nome> --project-ref <REF>
```

### 5.3. Logs
**Supabase Dashboard → Edge Functions → [função] → Logs.**

---

## 6. Variáveis de ambiente

### 6.1. Frontend (Vercel)
Defina em **Vercel → Project → Settings → Environment Variables**. Variáveis com prefixo `VITE_` são embutidas no bundle (públicas).

| Variável                      | Onde usa             | Sensível? |
|-------------------------------|----------------------|-----------|
| `VITE_SUPABASE_URL`           | conexão Supabase     | não       |
| `VITE_SUPABASE_ANON_KEY`      | conexão Supabase     | não (anon)|
| `VITE_GOOGLE_CLIENT_ID`       | Login Google + Cal.  | não       |

### 6.2. Edge Functions (Supabase)
Defina em **Supabase → Edge Functions → Secrets**.

| Variável                  | Função                                            | Sensível? |
|---------------------------|---------------------------------------------------|-----------|
| `SUPABASE_SERVICE_ROLE_KEY`| acesso admin ao banco                            | **SIM**   |
| `GOOGLE_CLIENT_ID`        | OAuth Gmail                                       | não       |
| `GOOGLE_CLIENT_SECRET`    | OAuth Gmail                                       | **SIM**   |
| `EVOLUTION_API_URL`       | endpoint WhatsApp                                 | não       |
| `EVOLUTION_API_KEY`       | autenticação Evolution                            | **SIM**   |
| `ANTHROPIC_API_KEY`       | Claude vision para cadastro WhatsApp              | **SIM**   |

> **NUNCA** comite `.env` no git. O `.gitignore` deve cobrir `.env`, `.env.local`, `.env.production`.

---

## 7. Cron jobs e WhatsApp

### 7.1. pg_cron (overnight PDF)
Agendado dentro do Postgres via extensão `pg_cron`. Consultar:
```sql
SELECT jobid, schedule, command, active
FROM cron.job;
```

Ajustar horário:
```sql
SELECT cron.alter_job(
  job_id := <id>,
  schedule := '0 7 * * *'   -- 07:00 UTC = 04:00 BR (ajuste o fuso)
);
```

> **Atenção fuso:** `pg_cron` roda em UTC. Brasília é UTC-3 → para enviar às 07:00 BR, agende `'0 10 * * *'`.

### 7.2. WhatsApp (Evolution API → migração Cloud)
- Atual: Evolution API + Baileys (não-oficial).
- Decisão 2026-05-22: migrar para **WhatsApp Business Cloud API** (Meta, oficial).
- Variáveis novas virão com prefixo `WHATSAPP_CLOUD_*`.

---

## 8. Rollback

### 8.1. Frontend
1. Vercel Dashboard → **Deployments**.
2. Encontre a última versão estável.
3. Menu `⋯` → **Promote to Production**.
4. Propagação em ~30s.

### 8.2. Banco
- **Nunca** dropar tabela em produção sem backup recente.
- Para reverter migration: crie migration inversa e aplique.
- Para reverter um lote de dados corrompidos: use backup do Supabase + `pg_restore` parcial em ambiente novo + script de diff.

### 8.3. Edge Function
Redeploy de versão anterior:
```powershell
git checkout <commit-bom> -- supabase/functions/<nome>/index.ts
supabase functions deploy <nome>
git checkout main -- supabase/functions/<nome>/index.ts   # volta o working tree
```

---

## 9. Monitoramento e logs

| Onde olhar                            | O que mostra                              |
|---------------------------------------|-------------------------------------------|
| Vercel → Deployments → Logs           | Build e erros de runtime no frontend.     |
| Supabase → Logs → Postgres            | Queries lentas, erros de SQL.             |
| Supabase → Logs → Auth                | Tentativas de login, falhas OAuth.        |
| Supabase → Edge Functions → Logs      | Execuções de cada function (stdout/err).  |
| Supabase → Database → Reports         | Tamanho das tabelas, índices, performance.|

Não há APM (Datadog, Sentry) configurado. Adicionar Sentry no frontend é um próximo passo recomendado.

---

## 10. Troubleshooting comum

### 10.1. "Saldo do sistema não bate com o banco"
- Quase sempre conciliação pendente. Conferir tabela `bank_transactions` filtrando `status='pendente'`.
- Se a CR/CP estiver duplicada, ver histórico do fix de 19/05/2026 em `MEMORY.md → project_conciliacao_duplicidade_fix_19_05`.

### 10.2. "Venda lançada mas não aparece no DRE"
- Falta categoria (`chart_of_accounts_id`).
- Update na coluna funciona normalmente; gatilho permite UPDATE em CR/CP já pagos para corrigir categoria (mudança 2026-04-28).

### 10.3. "Upload de OFX bloqueado"
- ACCTID do arquivo não bate com `bank_accounts.ofx_acctid`.
- Comparar com hífen e zeros à esquerda. O sistema é estrito por design (`feedback_ofx_acctid_format`).

### 10.4. "Login Google não cria usuário"
- Verificar `GOOGLE_CLIENT_ID` no Supabase Auth Provider.
- No empresa-flow, o comportamento atual: e-mail novo entra no 1º tenant ativo (`project_google_oauth_login`).

### 10.5. "Edge Function retornou 500"
- Logs no Supabase Dashboard.
- Causa comum: secret faltando após redeploy do projeto Supabase.

### 10.6. "Build da Vercel falhando"
- Rode `npm run build` localmente para reproduzir.
- Erros de tipo TS quebram o build — não use `// @ts-ignore` como atalho, corrija o tipo.

---

## 11. Checklist pré-deploy

Antes de `git push fork main`:

- [ ] `npm run build` passou local.
- [ ] Não há `console.log` ou `debugger` esquecido.
- [ ] `.env` **não** foi adicionado ao stage (`git status` limpo de secrets).
- [ ] Migrations novas foram aplicadas no Supabase (ou serão aplicadas junto).
- [ ] Mensagem de commit é descritiva (`feat:`, `fix:`, `chore:`).
- [ ] Se mudou Edge Function: redeploy da function depois do push.
- [ ] Se mudou env var: configurada na Vercel **e** Supabase antes do deploy.

---

## 12. Em caso de incidente

> Use este protocolo. Histórico mostra: incidentes resolvidos rápido são os documentados; os improvisados quebram de novo.

### Passo 1 — Estabilizar (5 min)
- **Frontend quebrado?** Vercel → Promote da versão anterior. **30 segundos**.
- **Banco quebrado?** Identificar query/migration culpada. **Não tente "consertar rápido"** — backup primeiro.
- **Edge Function quebrada?** Logs para identificar; se for crítica (importar-extrato, overnight), desativar temporariamente é OK.

### Passo 2 — Diagnosticar (15 min)
- Coletar: timestamp do início, sintomas, usuários afetados, último deploy antes do problema.
- Logs Vercel + logs Supabase Postgres + logs Edge Functions.
- Reproduzir em ambiente local se possível.

### Passo 3 — Corrigir
- Migration de dados se precisou rodar SQL ad-hoc → versionar como `.sql` na pasta `migrations/`.
- Fix de código → commit com mensagem `fix: descrição` + referência ao incidente.

### Passo 4 — Pós-mortem (15 min)
- Adicionar memória em `~/.claude/.../memory/` com nome `project_incidente_<data>_<assunto>.md`.
- Frontmatter:
  ```yaml
  ---
  name: incidente-29-04-recategorizacao
  description: Reset de plano de contas zerou 184 categorias
  metadata:
    type: project
  ---
  ```
- Conteúdo: o que aconteceu, causa raiz, como mitigou, o que mudou para não repetir.
- Atualizar `MEMORY.md` com o novo arquivo.

### Histórico de incidentes registrados
- **2026-04-29:** Reset de plano de contas zerou categorias (`project_incidente_recategorizacao_29_04`).
- **2026-05-05:** Postgres meutatico.site zerou após past due Railway (`project_incidente_dataloss_05_05`).
- **2026-05-19/20:** Duplicidade em conciliação (`project_conciliacao_duplicidade_fix_19_05`).

---

## Apêndice — Comandos úteis

```powershell
# Status do repositório
git status
git remote -v               # confirma 'fork' aponta para o repo com permissão

# Build local
npm install
npm run build
npm run dev                 # rodar local em http://localhost:5173

# Deploy via push
git push fork main

# Supabase CLI (se instalada)
supabase login
supabase link --project-ref <REF>
supabase functions deploy <nome>
supabase db dump --schema public > backup.sql
```

```sql
-- Ver cron jobs ativos
SELECT * FROM cron.job WHERE active;

-- Ver últimas execuções
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

-- Ver tamanho das tabelas
SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 20;
```

---

*Atualizado em 2026-05-25. Para o manual do usuário (linguagem de empresário), ver [MANUAL.md](MANUAL.md).*
