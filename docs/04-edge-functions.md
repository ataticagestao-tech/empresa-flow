# 04 — Catálogo de Edge Functions

54 funções no Supabase (`supabase/functions/`). São os "mini-programas" do backend. Agrupadas por finalidade.

## Assistente — núcleo (3)
| Função | Papel |
|--------|-------|
| `whatsapp-cloud-webhook` | Porta de entrada das mensagens da Meta → encaminha pro orquestrador |
| `agente-orquestrador` | O maestro: Claude + loop de tools + envia resposta |
| `enviar-whatsapp` | Envia texto/PDF/template (Cloud; fallback Evolution) |

## Assistente — habilidades (24 `agente-tool-*`)
`consultar_saldo`, `consultar_faturamento`, `listar_vendas`, `listar_cp_abertas`, `listar_cr_abertas`, `listar_categorias`, `listar_contas_bancarias`, `buscar_fornecedor`, `buscar_funcionario`, `buscar_socio`, `gerar_dre`, `gerar_fluxo_caixa`, `lancar_cp`, `baixar_cp`, `lancar_cr`, `baixar_cr`, `criar_fornecedor`, `editar_fornecedor`, `criar_funcionario`, `excluir_lancamento`, `editar_lancamento`, `enviar_overnight`, `reenviar_overnight`, `atualizar_config_overnight`

(Detalhe de cada uma em [03-assistente-whatsapp.md](03-assistente-whatsapp.md).)

## WhatsApp legado (Evolution) — em desuso (10)
`agente-polling`, `agente-conectar-whatsapp`, `agente-qr-png`, `agente-resetar-whatsapp`, `agente-restart-instancia`, `agente-setup-webhook`, `agente-test-envio`, `agente-toggle-proxy`, `agente-debug-webhook`, `agente-enviar-codigo`
> Viram código morto após desligar o Evolution — podem ser apagadas.

## Nota fiscal (NFSe via Focus NFe) (3)
`emitir-nfse`, `cancelar-nfse`, `consultar-nfse`

## E-mail (via Resend) (2)
`enviar-email`, `enviar-recibo-email`

## Overnight (relatório diário) (2)
`gerar-overnight-pdf` (monta o PDF; aceita `data` p/ dias anteriores), `disparar-overnight-agendado` (cron + envio)

## Leitura por imagem (Claude vision) (2)
`ler-boleto` (extrai dados de boleto), `ler-folha-ponto` (lê folha de ponto manuscrita)

## Cadastro automatizado via WhatsApp (3)
`solicitar-cadastro`, `cadastro-processor`, `cadastro-aprovar` (+ `cadastro-test`)

## Importações (2)
`import-omie-data` (ERP Omie), `importar-extrato-email` (extrato via Gmail)

## Outras
`validar-whatsapp`, `admin-set-user-password`

## Convenção importante
Funções chamadas **servidor-a-servidor** (pelo webhook/cron/orquestrador, com a service key) precisam de **`verify_jwt = false`** no `config.toml`. Funções chamadas pelo **navegador** (usuário logado) podem manter `verify_jwt = true` (o JWT do usuário é válido). Ver [07-seguranca-e-lgpd.md](07-seguranca-e-lgpd.md).
