# 01 — Visão geral

## Em 1 parágrafo
O sistema tem **3 camadas**: um **app web** (acessado pelo navegador em `ataticagestao.com`), um **backend no Supabase** (banco de dados Postgres + ~54 *Edge Functions*) e um conjunto de **serviços externos (APIs)** que o backend chama pra mandar WhatsApp, usar IA, emitir nota fiscal, enviar e-mail, etc. É um sistema de **gestão financeira/ERP multi-empresa** com um **assistente de WhatsApp** acoplado.

## Diagrama
```
  VOCÊ / EQUIPE                       CLIENTE no WhatsApp
       │ (navegador)                        │
       ▼                                     ▼
  ┌─────────────────────┐          ┌────────────────────────┐
  │  APP (React/Vite)   │          │  Meta WhatsApp Cloud    │
  │  ataticagestao.com  │          │  (Graph API)            │
  └──────────┬──────────┘          └───────────┬────────────┘
             │                                  │
             ▼                                  ▼
  ┌──────────────────────────────────────────────────────────┐
  │  SUPABASE  (o coração)                                     │
  │  • Banco de dados (Postgres, ~90 tabelas)                  │
  │  • ~54 Edge Functions (orquestrador + 24 "tools" + etc.)   │
  │  • Login/permissões (Auth + RLS) + agendador (pg_cron)     │
  │  • Storage (documentos, PDFs)                              │
  └──────────┬───────────────────────────────────────────────┘
             │  chama serviços externos conforme a necessidade
             ▼
  Claude (IA) · Focus NFe (nota) · Resend (e-mail) · Omie · Gmail · Google
```

## As 3 camadas

**1. App (Frontend)** — React + Vite, publicado em `ataticagestao.com`. É o que a equipe usa: ~70 telas (financeiro, vendas, cadastros, fiscal, folha, relatórios). Ver [05-modulos-e-telas.md](05-modulos-e-telas.md).

**2. Backend (Supabase)** — o centro de tudo:
- **Postgres**: o banco com ~90 tabelas. Ver [06-banco-de-dados.md](06-banco-de-dados.md).
- **Edge Functions**: ~54 mini-programas que fazem ações (mandar WhatsApp, gerar PDF, emitir nota, rodar o assistente). Ver [04-edge-functions.md](04-edge-functions.md).
- **Auth + RLS**: login e isolamento por empresa. Ver [07-seguranca-e-lgpd.md](07-seguranca-e-lgpd.md).
- **pg_cron**: agendador interno (ex: dispara o overnight, limpa documentos antigos).

**3. Serviços externos (APIs)** — terceiros que custam/precisam de conta. Ver [02-integracoes-externas.md](02-integracoes-externas.md).

## Resumo do que importa
- **O que custa e você mantém:** Meta (WhatsApp), Claude (IA), Focus NFe (nota), Resend (e-mail), Supabase (plano). + Omie/Google se usar.
- **O assistente de WhatsApp** está migrado pra Cloud API oficial e roda no Claude Sonnet 4.6.
- **Pendências** e roadmap: ver [09-estado-e-pendencias.md](09-estado-e-pendencias.md).
