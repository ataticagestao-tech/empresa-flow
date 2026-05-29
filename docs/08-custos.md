# 08 — Custos

Duas contas **separadas e independentes**: Meta (WhatsApp) e Anthropic (Claude). Cada mensagem do assistente costuma envolver as duas.

## 1. Meta / WhatsApp Cloud API
Cobra por **envio**, e o que importa é a janela de 24h:
- **Cliente te manda msg → você/IA responde em até 24h** = texto livre **GRÁTIS**. (a maior parte das conversas do assistente cai aqui)
- **Você inicia** (fora da janela) → só por **template aprovado**, e aí paga por categoria:
  - *Utility* (recibo, cobrança, overnight): mais barato — ~R$ 0,10–0,40
  - *Marketing*: mais caro · *Authentication*: intermediário
- Na prática: paga Meta só nos **disparos proativos**; as respostas do assistente são de graça.

## 2. Anthropic / Claude
Cobra por **token** (input + output), não por mensagem:
- Cada mensagem dispara **1 a ~6 chamadas** ao Claude (loop de tools). A cada chamada reenvia system prompt + as ~24 tools → é o que mais pesa.
- **Modelo importa muito:**
  - Opus 4.7: caro
  - **Sonnet 4.6 (atual): ~5x mais barato** que Opus
  - Haiku 4.5: ainda mais barato (mas erra mais)
- **Cache de prompt** ativado em **dois blocos**: o *system prompt* E as *24 tools* (cache_control na última tool cobre todas — adicionado em 2026-05-29). Antes, só o system prompt era cacheado e as tools eram cobradas preço cheio em cada volta do loop. Agora, a partir da 2ª chamada (e em conversas dentro de ~5 min), system + tools saem por ~10% do preço. Economia automática, sem remover nenhuma instrução/regra (zero perda de contexto).

**Estimativa no Sonnet:** ~R$ 0,10–0,50 por mensagem (depende de tamanho e nº de tools). No Opus, ~5x.

### Alavancas de custo (referência)
1. **Modelo** — trocar pra Haiku ≈ 10x mais barato que Sonnet, mas erra mais nos fluxos financeiros. Trocar pra GPT/Gemini/DeepSeek exige reescrever a camada de IA (formato de API diferente) + perde o cache da Anthropic.
2. **Cache** (já no máximo) — system + tools cacheados.
3. **Enxugar manual + descrições das tools** — corta tokens de input; risco de piorar a precisão se exagerar. NÃO feito (pra não arriscar qualidade).
4. **Histórico** (`HISTORICO_LIMITE`, hoje 10) — reduzir corta custo MAS é a única alavanca que afeta a *memória da conversa*. Mantido em 10.
5. **Loop** (`MAX_TOOL_ITERATIONS`, hoje 6) — é só rede de segurança; não adiciona custo em uso normal (o modelo só dá menos voltas se resolver mais rápido).

## Custo de uma interação típica
| Cenário | Meta | Claude |
|---------|------|--------|
| Cliente pergunta, IA responde (dentro de 24h) | R$ 0 | ~R$ 0,10–0,50 |
| Disparo de overnight/cobrança (template) | ~R$ 0,10–0,40 | R$ 0 (envio direto) |

## Outros custos do sistema
- **Focus NFe:** por nota emitida (conforme plano)
- **Resend:** por e-mail
- **Supabase:** plano mensal fixo
- **Omie:** conforme contrato Omie
- **Evolution:** custo do servidor próprio (a ser eliminado ao desligar)

## Onde recarregar/acompanhar
- Claude: `console.anthropic.com/settings/billing` (créditos) e `/usage` (consumo) — vale ativar **auto-reload**.
- Meta: Gerenciador de Negócios → WhatsApp → Faturamento.

> Valores aproximados — confira as tabelas atuais de cada serviço.
