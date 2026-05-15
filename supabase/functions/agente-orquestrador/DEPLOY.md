# DEPLOY — Agente Tatica (Fase 1)

Passos pra colocar o **agente-orquestrador** + a primeira tool **consultar_saldo** em produção.

## 1. Rodar a migration

No Supabase SQL Editor (ou via CLI):

```sql
-- Cole o conteúdo de:
-- supabase/migrations/20260515120000_agente_tatica_base.sql
```

Verifica se rodou:
```sql
SELECT 1 FROM public.agente_conversas LIMIT 1;          -- não pode dar erro
SELECT 1 FROM public.pending_actions LIMIT 1;
SELECT 1 FROM public.escalations LIMIT 1;
SELECT whatsapp_phone FROM public.profiles LIMIT 1;
SELECT * FROM public.agente_identificar_usuario('5511999999999');  -- retorna vazio é OK
```

## 2. Configurar secrets

No Supabase Dashboard → Project Settings → Edge Functions → Secrets:

| Secret | Valor | Já existia? |
|---|---|---|
| `SUPABASE_URL` | URL do projeto | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | service role | ✅ |
| `EVOLUTION_API_URL` | https://api.ataticagestao.com | ✅ |
| `EVOLUTION_API_KEY` | (chave Evolution) | ✅ |
| `EVOLUTION_INSTANCE` | `financeiro` | ✅ |
| `ANTHROPIC_API_KEY` | sk-ant-... | **⚠️ NOVO** |
| `ANTHROPIC_MODEL` | `claude-opus-4-7` | opcional (default já é esse) |

Pegar a `ANTHROPIC_API_KEY` em https://console.anthropic.com → Settings → API Keys.

## 3. Deploy das edge functions

```powershell
cd "c:\Users\izabe\OneDrive\Desktop\PROGRAMAÇÃO\CENTRAL TATICA\empresa-flow"
npx supabase functions deploy agente-orquestrador
npx supabase functions deploy agente-tool-consultar_saldo
```

(Se Supabase CLI não estiver instalado: `npm install -g supabase`)

## 4. Cadastrar seu WhatsApp pra teste

No SQL Editor, ligar seu telefone no seu profile:

```sql
UPDATE public.profiles
SET
  whatsapp_phone = '5511999999999',           -- ⚠️ TROQUE pelo seu número com DDI
  whatsapp_verified = true,
  whatsapp_verified_at = now()
WHERE email = 'izabelvier@outlook.com';
```

(Depois, na Fase 5, isso será feito pelo app com código de verificação. Por agora, manual.)

## 5. Apontar webhook do Evolution pro orquestrador

URL do orquestrador será:
```
https://<seu-projeto>.supabase.co/functions/v1/agente-orquestrador
```

No painel da Evolution API (https://api.ataticagestao.com), instância `financeiro`:
- **Settings → Webhook**:
  - URL: `https://<seu-projeto>.supabase.co/functions/v1/agente-orquestrador`
  - Events: marcar **MESSAGES_UPSERT** (mensagens recebidas)
  - Method: POST

Alternativa via curl:
```bash
curl -X POST "https://api.ataticagestao.com/webhook/set/financeiro" \
  -H "Content-Type: application/json" \
  -H "apikey: $EVOLUTION_API_KEY" \
  -d '{
    "url": "https://<projeto>.supabase.co/functions/v1/agente-orquestrador",
    "webhook_by_events": false,
    "events": ["MESSAGES_UPSERT"]
  }'
```

## 6. Teste

Mande mensagem WhatsApp pro número da instância Evolution:

| Você manda | Esperado |
|---|---|
| `oi` | Agente cumprimenta sem chamar tool |
| `saldo` | Chama `consultar_saldo`, retorna saldos das suas contas |
| `quanto tenho no banco` | Mesma coisa |

Pra ver o que aconteceu, no SQL Editor:
```sql
SELECT created_at, role, content, tokens_input, tokens_output
FROM public.agente_conversas
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'izabelvier@outlook.com')
ORDER BY created_at DESC
LIMIT 20;
```

## 7. Próximas tools (Fase 2)

Repete o padrão de `agente-tool-consultar_saldo` pras tools de leitura:
- `agente-tool-consultar_faturamento`
- `agente-tool-consultar_cr_pendentes`
- `agente-tool-consultar_cp_pendentes`
- `agente-tool-consultar_vendas`
- `agente-tool-consultar_dre`
- `agente-tool-consultar_fluxo_caixa`

E adiciona cada uma no array `TOOLS` do `agente-orquestrador/index.ts`. Schema completo está em `CHATBOT-CONTEXTO/TOOLS-SCHEMA.json`.

## Custos de operação

| Item | Custo |
|---|---|
| Edge function execution | grátis até 500k/mês |
| Claude Opus 4.7 (input com cache) | ~$0.30/M tokens |
| Claude Opus 4.7 (input sem cache) | ~$3/M tokens |
| Claude Opus 4.7 (output) | ~$15/M tokens |
| Evolution API | já contratada |

Estimativa: **R$ 0,06 por conversa**, R$ 180/mês pra 100 conversas/dia.

Pra economizar mais (~5x), trocar `ANTHROPIC_MODEL` pra `claude-sonnet-4-6` (mantém boa qualidade pra esse caso).

## Problemas conhecidos

- **Mensagens em áudio**: Evolution manda como `audioMessage`, o orquestrador atual ignora. Precisa adicionar OCR de áudio (whisper) — Fase 5.
- **Mensagens com imagem**: idem, precisa OCR. Edge function `ler-boleto` já existe — pode ser adaptada.
- **Concorrência**: 2 mensagens do mesmo user em < 5s podem rodar em paralelo e gerar histórico fora de ordem. Aceitável por agora, resolver com lock se virar problema.
- **Timeout**: edge function tem 60s. Se Claude + tools demorar mais, falha silenciosa. Monitorar logs.

## Reverter (rollback)

Se algo der errado em produção:

1. **Desligar webhook Evolution**: apontar de volta pro `null` ou pra um endpoint dummy
2. **Não precisa derrubar a migration** — as tabelas novas não interferem em nada existente
3. **Pra apagar histórico**: `DELETE FROM agente_conversas;` (não afeta outras telas)

---

Pronto pra Fase 2 quando esse fluxo básico estiver respondendo "saldo" corretamente.
