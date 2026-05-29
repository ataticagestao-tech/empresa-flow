# 07 — Segurança e LGPD

## Multi-empresa (isolamento)
O sistema é multi-empresa: cada registro tem `company_id` e o **RLS (Row Level Security)** do Postgres garante que um usuário só vê dados das empresas que tem acesso. As queries no app usam o `activeClient` (cliente multi-tenant), nunca o cliente global direto.

> 🔴 **Risco conhecido (memória `project_seguranca_multitenant`):** autolink user×empresa + signup aberto podem furar o isolamento. Mitigação: manter **"Enable Signups" DESLIGADO** no Supabase.

## Autenticação das Edge Functions (`verify_jwt`)
O gateway do Supabase pode exigir um JWT válido antes de deixar a chamada chegar na função. Duas situações:

- **Funções chamadas pelo navegador** (usuário logado): o app manda o **JWT do usuário** (válido) → podem ficar `verify_jwt = true`.
- **Funções chamadas servidor-a-servidor** (webhook, cron, orquestrador → tools), que usam a **service key**: o projeto migrou pro formato novo de chaves (`sb_secret_*` / anon `sb_publishable_*`), que **NÃO são JWT**. Então essas funções precisam de **`verify_jwt = false`** no `config.toml`, senão o gateway rejeita com `401 UNAUTHORIZED_INVALID_JWT_FORMAT`.

> Incidente 2026-05-28: o `agente-orquestrador` foi redeployado sem entrada no `config.toml` → caiu no default `true` → todo o assistente ficou mudo (401). Corrigido declarando `verify_jwt=false`. **Ao deployar função interna, sempre declarar no `config.toml` primeiro.** (memória `feedback_edge_verify_jwt_sb_secret`)

### Funções com `verify_jwt=false` (internas)
`import-omie-data`, `whatsapp-cloud-webhook`, `agente-orquestrador`, todas as `agente-tool-*`, `disparar-overnight-agendado`, `gerar-overnight-pdf`, `enviar-whatsapp`, `cadastro-processor`, `ler-boleto`.

> Tradeoff aceito: ficam abertas no gateway (sem JWT), mas os callers legítimos não conseguem usar `verify_jwt` mesmo (service key não é JWT). Não usam guard de service-key interno porque a UI chama algumas delas com JWT de usuário.

## Permissões do assistente (por número de WhatsApp)
Cada número autorizado (`whatsapp_acesso`) tem permissões: `consultar`, `lancar_cp`, `baixar_cp`. As tools de escrita exigem `lancar_cp`; as de baixa exigem `baixar_cp`. Configurado na tela **WhatsApp Autorizados**.

## LGPD — retenção de documentos
Documentos sensíveis de cadastro (fotos enviadas no WhatsApp) têm limpeza automática via `pg_cron`:
- Rodada **diária** (03:00 UTC) — função `limpar_documentos_cadastros_antigos`.
- **Rejeitados/expirados:** mídia apagada após **90 dias**.
- **Aprovados:** a cópia de trabalho em `cadastros/` é apagada **7 dias** após aprovar (minimização) — o cadastro canônico já guarda os campos extraídos.
- Só a cópia transitória (`media_path LIKE '%/cadastros/%'`) é apagada; documentos movidos pra pasta canônica do funcionário/fornecedor/cliente são **preservados**.

## Segredos / chaves
Ficam nos **secrets do Supabase** (Edge Functions → Secrets). Mudança hoje via **Dashboard** (CLI `secrets` sem login). **Pendência:** rotacionar o `WHATSAPP_ACCESS_TOKEN` (exposto durante a configuração).
