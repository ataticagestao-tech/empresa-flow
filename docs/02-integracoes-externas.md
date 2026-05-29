# 02 — Integrações externas (APIs)

Serviços de **terceiros** que o backend chama. Cada um é uma conta/contrato separado, com sua própria chave guardada nos *secrets* do Supabase.

| # | Serviço | Pra que serve | Custa? | Chave/credencial | Funções que usam |
|---|---------|---------------|--------|------------------|------------------|
| 1 | **Meta — WhatsApp Cloud API** (graph.facebook.com) | Mandar/receber WhatsApp (assistente, overnight, recibo, cobrança) | Sim — template; resposta dentro de 24h é grátis | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_VERIFY_TOKEN` | `whatsapp-cloud-webhook`, `enviar-whatsapp`, `disparar-overnight-agendado`, `agente-orquestrador` |
| 2 | **Anthropic — Claude** (api.anthropic.com) | Cérebro do assistente + ler foto de boleto e folha | Sim — por token | `ANTHROPIC_API_KEY` (+ `ANTHROPIC_MODEL`) | `agente-orquestrador`, `ler-boleto`, `ler-folha-ponto`, `cadastro-processor` |
| 3 | **Focus NFe** (api.focusnfe.com.br) | Emitir/cancelar/consultar NFSe | Sim — por nota | token Focus NFe | `emitir-nfse`, `cancelar-nfse`, `consultar-nfse` |
| 4 | **Resend** (api.resend.com) | Enviar e-mails (recibos etc.) | Sim — por e-mail | `RESEND_API_KEY` | `enviar-email`, `enviar-recibo-email` |
| 5 | **Omie** (ERP) | Importar dados do Omie | Contrato Omie | credencial Omie | `import-omie-data` |
| 6 | **Gmail API** (Google) | Importar extrato bancário que chega por e-mail | Grátis (cota) | OAuth Google | `importar-extrato-email` |
| 7 | **Google OAuth / Calendar** | Login com Google + agenda | Grátis | `GOOGLE_CLIENT_ID/SECRET` | login do app, Calendar |
| 8 | **Evolution API** *(legado)* | WhatsApp antigo — **em desativação** | Servidor próprio (api.ataticagestao.com) | `EVOLUTION_API_KEY` | `agente-polling`, fallback de `enviar-whatsapp`, download de mídia |

## Modelo do WhatsApp (importante)
- **WABA de produção "Tatica":** `977376378234439`
- **Número real:** +55 35 9964-7089 (id `1078719668664450`) — CONNECTED na Cloud API
- **App Meta:** `818895791038505` (whatpstatica)
- 4 templates aprovados: `cobranca_a_vencer`, `recibo_pagamento`, `solicitar_cadastro_funcionario`, `overnight_diario`

## Onde ficam as chaves
Quase todas são **secrets do Supabase** (Edge Functions → Secrets), lidos pelas funções em tempo de execução.

> ⚠️ Mudança de secret hoje deve ser feita pelo **Dashboard do Supabase** — o CLI `supabase secrets` perdeu o login em maio/2026 (usar `supabase login` pra reativar).

## Onde cada um cobra
- **Claude:** créditos pré-pagos em `console.anthropic.com/settings/billing`.
- **Meta:** pós-pago no Gerenciador de Negócios (WhatsApp → Faturamento).
- **Focus NFe / Resend / Omie:** no painel de cada serviço.
