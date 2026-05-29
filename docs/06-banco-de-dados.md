# 06 — Banco de dados

Postgres no Supabase, ~90 tabelas. Principais por domínio. (Coluna canônica de empresa: `company_id`.)

## Empresas / acesso
- `companies` — empresas (usa `razao_social`/`nome_fantasia`, flag `is_active`; **não** tem `nome` nem `deleted_at`)
- `grupos_empresariais`, `grupos_empresas` — grupos de empresas
- `profiles`, `perfis_acesso` — usuários e perfis
- `log_atividades` — auditoria

## Financeiro (núcleo)
- `contas_pagar` (CP) e `contas_receber` (CR) — **soft-delete** via `deleted_at` (trigger bloqueia DELETE). CP tem coluna `descricao` própria; CR usa `observacoes`.
- `movimentacoes` — extrato/lançamentos no caixa (`tipo` = `credito`/`debito`; **hard-delete**; vincula a CR/CP por `conta_receber_id`/`conta_pagar_id`)
- `bank_accounts` — contas bancárias (cartão de crédito é `type=cartao_credito`). Saldo na UI vem da view `v_saldo_contas_bancarias`.
- `bank_transactions` — transações importadas (OFX/extrato) — fonte da verdade pra dedup
- `bank_reconciliation_matches`, `conciliacao_bancaria`, `conciliation_rules` — conciliação
- `contratos_recorrentes`, `contas_fixas`, `livro_caixa`

## Vendas / comercial / estoque
- `vendas` (+ itens) — **sempre filtrar `deleted_at IS NULL`**; cartão de crédito conta como pago
- `products`, `client_categories`, `clients`, `crm_*` (leads/opportunities/pipelines/stages)
- `inventario`, `entradas_estoque`, `ordens_compra`, `orcamento`

## Contábil
- `chart_of_accounts` — plano de contas (colunas enum: `account_type`, `account_nature`, `account_status`)
- `cont_linha_demonstrativo`, `cont_mapeamento_contas`, `cont_periodos_contabeis`, `cont_saldos_patrimoniais` — base do DRE/BP/DFC (RPCs `fn_gerar_dre`, `fn_gerar_dfc`, `fn_gerar_bp`)

## RH / folha
- `employees` — funcionários (`name`/`nome_completo`, `cpf`, `tipo_contrato`, `salary`/`salario_base`, `status`)
- `folha_pagamento`, `folha_itens`, `encargos`, `ponto_eletronico`, `ferias_afastamentos`, `admissoes_demissoes`, `config_tabela_inss`, `config_tabela_irrf`

## Fiscal
- `notas_fiscais`, `nf_itens`, `nfse_emissoes`, `nfse_eventos`, `nfse_configuracoes`, `company_nfse_settings`, `apuracao_impostos`, `obrigacoes_acessorias`, `certificados_digitais`

## Assistente / WhatsApp / cadastro
- `agente_conversas` — histórico das conversas do assistente
- `agente_msg_processadas` — dedup de mensagens recebidas
- `cadastro_solicitacoes`, `cadastro_mensagens` — cadastro automatizado via WhatsApp (aceita `funcionario`/`fornecedor`/`cliente`)

## Overnight / documentos
- `overnight_config` (horário, `whatsapp_destinos[]`, `whatsapp_ativo`), `overnight_logs`
- `documentos`, `company_documents`, `documentos_retencao`, `documentos_validade`, `documentos_acesso_log`

## RPCs importantes (lógica no banco)
- `quitar_conta_pagar` / `quitar_conta_receber` — baixa atômica (cria mov + atualiza status)
- `criar_venda_atomica` / `atualizar_venda_atomica` — venda + itens + CRs + mov numa transação
- `conciliar_lote`, `auto_conciliar_extrato` — conciliação
- `fn_gerar_dre` / `fn_gerar_dfc` / `fn_gerar_bp` — demonstrativos contábeis
- `agente_*` (identificar_acesso, pode_acessar_empresa, lancar_cp, faturamento, saldo, buscar_socio...) — usados pelas tools do assistente
- `limpar_documentos_cadastros_antigos` — LGPD (ver [07](07-seguranca-e-lgpd.md))

> Regra de ouro: ao criar CR/CP **pago** por script, criar SEMPRE a `movimentacao` vinculada junto, senão vira "fantasma" (pago no DRE sem reflexo no saldo).
