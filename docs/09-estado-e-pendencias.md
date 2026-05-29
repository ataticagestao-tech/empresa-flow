# 09 — Estado atual e pendências

> Atualizado em **2026-05-29**.

## ✅ Pronto e no ar
- **Migração WhatsApp → Cloud API oficial da Meta** concluída e validada de outro número (texto, envio, recebimento, overnight, assistente).
- Assistente roda no **Claude Sonnet 4.6** (econômico).
- Assistente faz (Tier 1 + Tier 2): consultar saldo/faturamento, **detalhar vendas**, listar/lançar/baixar **CP e CR**, criar/editar **fornecedor**, criar **funcionário**, excluir/editar **lançamento** (em aberto), **DRE/fluxo** (resumo de texto), **overnight** sob demanda e de dias anteriores, mudar **config do overnight**.
- `verify_jwt=false` declarado no `config.toml` pra todas as funções internas (blindado contra redeploy).

## ⚠️ Pendências
1. **Créditos da Anthropic zerados** → assistente fica mudo até recarregar (`console.anthropic.com/settings/billing`).
2. **Tier 1 e Tier 2 não testados ao vivo** (acabaram os créditos) — validar pelo WhatsApp ao recarregar; conferir permissões do número.
3. **Evolution ainda não pode ser desligado 100%:** receber **foto de boleto** pelo assistente ainda baixa a mídia pela Evolution. Falta migrar o *download de mídia* pro Cloud (Graph API). Texto já é todo Cloud.
4. **Rotacionar o `WHATSAPP_ACCESS_TOKEN`** (exposto na configuração) — via Dashboard do Supabase.
5. **CLI `supabase secrets` sem login** — reativar com `supabase login` ou gerenciar secrets pelo Dashboard.

## 🔜 Roadmap (não implementado)
**Follow-ups do Tier 2:**
- Criar **sócio** pelo assistente — *bloqueado*: a tabela de sócios não está mapeada no código (só dentro da RPC `agente_buscar_socio`). Descobrir o schema antes.
- **DRE/fluxo em PDF** (hoje é resumo em texto) — precisa gerador server-side (pdf-lib, como o overnight) + verificação visual.

**Tier 3 (complexo/sensível):**
- Transferência entre contas próprias
- Cancelar/estornar venda (destrutivo)
- Lançar venda nova (itens + formas de pagamento — o PDV faz melhor)
- Folha de pagamento formal (tela própria, cálculo CLT)
- Conciliação / importar OFX (upload + match — manter no sistema; `Conciliacao.tsx` é intocável)
- Plano de contas / categorias (alto risco — incidente histórico de reset)

## Limpeza pendente (quando desligar o Evolution)
- Apagar as 10 funções `agente-*` de gestão do Evolution (viram código morto).
- Remover o fallback Evolution de `enviar-whatsapp` e `agente-orquestrador`.
- Encerrar o servidor `api.ataticagestao.com`.
