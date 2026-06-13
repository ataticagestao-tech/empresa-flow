# Plano de Implementação — WhatsApp para Tráfego Pago (Inbox + IA de Vendas)

> **Objetivo:** preparar o WhatsApp oficial da Tática para receber leads de tráfego pago (Click-to-WhatsApp) a partir de **junho/2026**, com **IA de vendas** atendendo na hora + **inbox** com handoff humano.
>
> **Status base (2026-05-27):** número `+55 35 9964-7089` CONNECTED na Cloud API · WABA Tatica `977376378234439` · 4 templates aguardando aprovação · app inscrito no webhook.

---

## 1. Contexto técnico (o que já existe)

| Componente | Arquivo / Tabela | O que faz hoje |
|---|---|---|
| Webhook de recebimento | `supabase/functions/whatsapp-cloud-webhook/index.ts` | Recebe mensagem da Meta, traduz Cloud→Evolution-like, **encaminha** pro agente. **Não guarda** a mensagem crua. Ignora `referral`. |
| Assistente interno | `supabase/functions/agente-orquestrador/index.ts` | IA pra **números autorizados** (`whatsapp_acesso`) fazerem operações financeiras. **Não é** bot de vendas. |
| Histórico de conversa | tabela `agente_conversas` | 1 linha por mensagem (role user/assistant/tool), só pra usuários autorizados. |
| Dedup | tabela `agente_msg_processadas` | Evita reprocessar a mesma mensagem. |
| Helper Cloud API | `supabase/functions/_shared/whatsapp-cloud.ts` | `sendCloudText`, `sendCloudTemplate`, etc. Envs: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `USE_WHATSAPP_CLOUD`. |
| UI WhatsApp | `WhatsappAutorizados.tsx`, `SendWhatsAppDialog.tsx` | Gestão de autorizados + envio avulso. **Não existe inbox/chat.** |

**Princípio crítico:** o lead de anúncio **não** é um número autorizado. Ele precisa de um **fluxo separado** do assistente interno — nunca cair no `agente-orquestrador` de finanças.

---

## 2. Arquitetura alvo (bot + handoff humano)

```
Lead clica no anúncio (Facebook/Instagram)
   ↓  (Cloud API entrega no webhook, com objeto `referral` = qual anúncio)
whatsapp-cloud-webhook
   ↓  número NÃO está em whatsapp_acesso → é LEAD
   ├─→ grava/atualiza lead em `whatsapp_leads` (+ origem do anúncio)
   ├─→ grava a mensagem em `whatsapp_mensagens`
   └─→ se conversa NÃO está "assumida por humano":
          → chama `agente-vendas` (IA de vendas)
                ↓ responde o lead via sendCloudText (dentro da janela 24h)
                ↓ grava a resposta em `whatsapp_mensagens`
   ↓
Tela /inbox no Tática
   • lista de conversas (lead, última msg, origem do anúncio, status)
   • thread da conversa
   • botão "Assumir" → marca conversa como humana → bot para
   • caixa de resposta manual → sendCloudText
   • botão "Devolver pro bot"
```

---

## 3. As 5 peças (ordem de dependência)

### Peça 1 — Fundação de dados + roteamento lead vs autorizado
**Não depende do cutover. Pode começar já.**

- **Migration nova** `whatsapp_leads`:
  - `id`, `company_id`, `phone` (normalizado 12-13 díg), `nome` (perfil WA), `status` (`novo`/`em_atendimento`/`qualificado`/`ganho`/`perdido`), `assumido_por` (user_id null = bot ativo), `assumido_em`, `referral_source` (jsonb: ad_id, headline, source_url, ctwa_clid), `primeiro_contato_em`, `ultima_msg_em`, `created_at`. RLS por `company_id`.
- **Migration nova** `whatsapp_mensagens`:
  - `id`, `lead_id` (FK), `company_id`, `direcao` (`recebida`/`enviada`), `autor` (`lead`/`bot`/`humano`), `tipo` (`text`/`image`/`document`/`audio`), `conteudo`, `media_url`, `wamid`, `created_at`. Index `(lead_id, created_at)`. RLS por `company_id`.
- **Webhook** (`whatsapp-cloud-webhook/index.ts`): após receber, checar se `phone` está em `whatsapp_acesso`.
  - Se **autorizado** → fluxo atual (agente-orquestrador). Sem mudança.
  - Se **não** → upsert em `whatsapp_leads`, insert em `whatsapp_mensagens`, e roteia pro `agente-vendas` (Peça 3) — exceto se `assumido_por` ≠ null.

### Peça 2 — Captura do referral CTWA
**Não depende do cutover.**

- Adicionar campo `referral` à interface `CloudMessage` no webhook (a Meta manda em `messages[].referral` = `{ source_type, source_id, headline, source_url, ctwa_clid, body, media_type }`).
- Na primeira mensagem de um lead, gravar esse objeto em `whatsapp_leads.referral_source`.
- Isso é o que permite saber **de qual anúncio** veio cada lead → base do painel de conversão.

### Peça 3 — IA de vendas (`agente-vendas`)
**Depende do cutover pra responder de verdade (precisa Cloud API ligada).** Pode ser desenvolvida em paralelo.

- **Edge Function nova** `supabase/functions/agente-vendas/index.ts` (separada do assistente interno).
- Recebe `{ lead_id, phone, texto }`, carrega histórico de `whatsapp_mensagens` daquele lead, chama Claude com **system prompt de vendas** (boas-vindas, qualificação, tom da Tática), responde via `sendCloudText`.
- Sem tools financeiras — foco em qualificar e agendar/encaminhar.
- Respeita janela de 24h (texto livre só dentro dela; fora disso, template).
- Não responde se `assumido_por` ≠ null (handoff ativo).

### Peça 4 — Tela de Inbox (handoff)
**Não depende do cutover pra UI; depende pra enviar resposta real.**

- **Página nova** `src/pages/Inbox.tsx` (+ rota no menu, provavelmente grupo Comercial/Atendimento).
- Lista de conversas (query `whatsapp_leads` por `company_id`, ordenado por `ultima_msg_em`): nome, telefone, última msg, **badge da origem do anúncio**, status, indicador "bot ativo / assumida".
- Thread: mensagens de `whatsapp_mensagens` (bolhas lead/bot/humano), realtime (Supabase realtime subscription).
- Ações: **Assumir** (`assumido_por = auth.uid()`, bot para) · **Responder** (insert msg + `sendCloudText` via uma Edge Function `inbox-responder`) · **Devolver pro bot** (`assumido_por = null`) · mudar status do lead.
- Aviso visual quando passou das 24h (só template disponível).

### Peça 5 — Painel de conversão (bônus)
- Cards/relatório: leads por anúncio (`referral_source.headline`), por status, taxa de qualificação/ganho. Reusa padrão de dashboard existente.

---

## 4. Cronograma (~4 semanas até junho)

| Semana | Entrega | Depende de cutover? |
|---|---|---|
| **1** | Peça 1 (tabelas + roteamento) + Peça 2 (referral CTWA) | Não — começar já |
| **1-2** | **Cutover** (`USE_WHATSAPP_CLOUD=true`) quando 4 templates = APPROVED | — |
| **2** | Peça 3 (IA de vendas) + testes com número real | Sim |
| **2-3** | Peça 4 (Inbox + handoff) | UI não, envio sim |
| **3-4** | Peça 5 (painel) + configurar anúncios CTWA no Meta Ads + teste ponta a ponta | Sim |

---

## 5. Pré-requisitos e decisões em aberto

- [ ] **Cutover** depende dos 4 templates saírem de PENDING → APPROVED (monitorando).
- [ ] **Rotacionar** o `WHATSAPP_ACCESS_TOKEN` após validar (passou pelo chat).
- [ ] **Tom/script da IA de vendas:** o que ela deve perguntar? Qualifica como (orçamento, segmento, tamanho da empresa)? → **Izabel vai passar depois** (2026-05-27). Bloqueia só a Peça 3.
- [x] **Multiempresa — DECIDIDO (2026-05-27): Cenário A primeiro, B depois.** Fase 1 = anúncios da própria **Tática** (1 número `+55 35 9964-7089`, todos os leads são da Tática). Fase 2 (futuro) = oferecer como recurso pros clientes (1 número/WABA por empresa). **Construir agora pro Cenário A, mas schema já multi-tenant-ready:** `whatsapp_leads`/`whatsapp_mensagens` já têm `company_id` (preenchido com o company_id da Tática por enquanto). Pra Cenário B depois: criar tabela de mapeamento `phone_number_id → company_id` e resolver a empresa no webhook a partir do `phone_number_id` que a Meta manda. Assim B é aditivo, não reescrita.
- [x] **Quem atende o inbox — DECIDIDO (2026-05-27): só a Izabel.** Inbox visível só pra ela (provável `ownerOnly` no menuConfig, padrão já existente). Sem necessidade de gestão de múltiplos atendentes por enquanto.
- [ ] **Horário comercial:** bot atende 24/7 e humano assume no horário? Definir mensagem fora do horário.
- [ ] **Opt-in:** garantir texto de consentimento no anúncio (exigência Meta pra não derrubar qualidade do número).

---

## 6. Riscos

- **Qualidade do número:** tráfego pago traz volume; se muita gente bloquear/reportar, a Meta rebaixa a qualidade e limita envios. Mitigar com bom atendimento + opt-in claro.
- **Janela de 24h:** se o lead some e volta depois de 24h, só dá pra reabrir com template — precisa de um template de "retomada" (criar depois).
- **Não misturar** com o assistente interno: bug de roteamento poderia mandar lead pro fluxo de finanças. Testar bem a checagem `whatsapp_acesso`.
