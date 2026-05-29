# 03 — Assistente de WhatsApp

O "Assistente Tática": a pessoa conversa em português no WhatsApp e ele executa ações no sistema (consultar saldo, lançar conta, dar baixa, mandar relatório...).

## Fluxo de uma mensagem
```
1. Cliente manda msg no WhatsApp
2. Meta entrega no  whatsapp-cloud-webhook  (porta de entrada)
3. webhook encaminha pro  agente-orquestrador  (o maestro)
4. orquestrador identifica o usuário pelo telefone (whatsapp_acesso)
5. manda a conversa + as "tools" pro Claude (Sonnet 4.6)
6. Claude decide: responder texto OU chamar uma tool
7. se chamar tool → orquestrador roteia pra  agente-tool-<nome>
8. tool faz a ação no banco e devolve o resultado
9. (repete 5–8 até o Claude ter a resposta final — até 6 voltas)
10. resposta volta pro cliente via Cloud API
```

## Peças
- **`whatsapp-cloud-webhook`** — recebe da Meta, traduz o formato e encaminha. Usa `EdgeRuntime.waitUntil` pra não perder a tarefa.
- **`agente-orquestrador`** — o maestro. Tem o *system prompt* (regras de comportamento + formatação WhatsApp) e a lista de tools. Identifica o usuário, chama o Claude em loop, e envia a resposta.
- **24 `agente-tool-*`** — as habilidades (abaixo).

## As 24 habilidades (tools)

**Consultar (leitura):**
`consultar_saldo` · `consultar_faturamento` · `listar_vendas` (detalhe venda a venda) · `listar_cp_abertas` · `listar_cr_abertas` · `listar_categorias` · `listar_contas_bancarias` · `buscar_fornecedor` · `buscar_funcionario` · `buscar_socio` · `gerar_dre` · `gerar_fluxo_caixa`

**Pagar/receber/lançar:**
`lancar_cp` · `baixar_cp` · `lancar_cr` · `baixar_cr` (baixa reusa as RPCs `quitar_conta_pagar`/`quitar_conta_receber`)

**Cadastros:**
`criar_fornecedor` · `editar_fornecedor` · `criar_funcionario` (só CLT/temporário/estágio)

**Corrigir:**
`excluir_lancamento` · `editar_lancamento` (só CP/CR em aberto; pago exige estorno no sistema)

**Relatórios:**
`enviar_overnight` (hoje, pros números configurados) · `reenviar_overnight` (data específica, pro número de quem pediu) · `atualizar_config_overnight` (horário/números/liga-desliga)

## Regras de comportamento (no system prompt)
- **Confirma antes** de ações destrutivas/de escrita (lançar, baixar, excluir, editar).
- **Formatação WhatsApp:** negrito com 1 asterisco `*assim*`, sem tabelas/markdown; listas espaçadas (1 item por bloco, linha em branco entre eles). Ver `feedback_assistente_formato_whatsapp` na memória.
- **Permissões por número:** escrever (lançar/criar/editar) exige `permissoes.lancar_cp`; baixar exige `permissoes.baixar_cp` — configurado na tela **WhatsApp Autorizados**.

## Pontos técnicos importantes
- Todas as `agente-tool-*` e o orquestrador são **`verify_jwt = false`** no `config.toml` (chamadas servidor-a-servidor com a service key, que no formato novo `sb_secret_*` não é JWT). Ver [07-seguranca-e-lgpd.md](07-seguranca-e-lgpd.md).
- O orquestrador passa pra cada tool: `x-agente-user-id`, `x-agente-acesso-id` e `x-agente-phone`.
- Modelo configurável via `ANTHROPIC_MODEL` (default no código = `claude-sonnet-4-6`).

## Limitação atual
- **Receber foto de boleto/documento** ainda baixa a mídia pela **Evolution API** (não migrado pro Cloud). Texto é 100% Cloud. Migrar o download de mídia antes de desligar o Evolution.
