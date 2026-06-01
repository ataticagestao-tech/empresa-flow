# 10 — Histórico de Interações no cadastro (design)

> Status: **Fase 1 — COMPLETA (código).** Falta a Izabel fazer o deploy do frontend e validar. Definida e feita em 2026-05-29.

## Progresso
- ✅ **Migration** `supabase/migrations/20260529150000_interacoes_cadastro.sql` — **JÁ RODADA no SQL Editor** (tabela criada).
- ✅ **Função `resumir-interacao`** (deployada, verify_jwt=false) — resume via Haiku e grava em `interacoes_cadastro`. Tem fallback se a IA falhar/sem crédito.
- ✅ **Gancho no `cadastro-aprovar`** (deployado) — ao aprovar um cadastro, resume a conversa (de `cadastro_mensagens`) e anexa no perfil da pessoa (fire-and-forget).
- ✅ **Componente `src/components/interacoes/InteracoesCadastro.tsx`** — aba reutilizável (lista tema/resumo/data/📎).
- ✅ **Aba "Interações"** adicionada nas 3 telas: Clientes, Fornecedores, Funcionários (cada uma já tinha sistema de abas).
- ⏳ **Falta:** Izabel **publicar o frontend** (git push → Vercel) e validar no app. O resumo automático só roda com **créditos da Anthropic**.
- 🔜 Fase 2 (inbox número→cadastro) e Fase 3 (assistente) seguem no plano abaixo.

## Objetivo
Toda interação com uma pessoa (funcionário, fornecedor ou cliente) vira uma **anotação resumida pela IA** no **cadastro dela**, marcando o tema e se teve arquivo. Ex: o funcionário João manda WhatsApp → o sistema identifica o número → resume → anexa na ficha do João, aba "Interações".

## Onde aparece
Uma aba/seção **"Interações"** dentro do cadastro de cada pessoa:
- tela **Funcionários** (perfil do funcionário)
- tela **Fornecedores** (perfil do fornecedor)
- tela **Clientes** (perfil do cliente)

Cada item mostra: **tema**, **resumo**, **data**, **📎 (se teve arquivo)** + link do arquivo, e o **canal** (WhatsApp / assistente / sistema).

> É no **cadastro da pessoa** (funcionário/fornecedor/cliente), não no "usuário do sistema" (login). A pessoa não precisa ter login.

## Modelo de dados
Tabela nova `interacoes_cadastro`:
| Campo | Descrição |
|---|---|
| `id`, `company_id` | id + empresa |
| `alvo_tipo` | `funcionario` \| `fornecedor` \| `cliente` \| `nao_identificado` |
| `employee_id` / `supplier_id` / `customer_id` | FK do alvo (só um preenchido; todos nulos se não identificado) |
| `canal` | `whatsapp` \| `assistente` \| `sistema` |
| `direcao` | `entrada` \| `saida` \| `mista` |
| `tema` | título curto (IA) |
| `resumo` | resumo da conversa (IA) |
| `teve_arquivo` | bool |
| `arquivo_path` | caminho do anexo (se houver) |
| `telefone` | número envolvido (pra rastrear) |
| `ocorrido_em` | quando aconteceu |
| `metadata` | jsonb (ids das mensagens, etc.) |
| `created_at` | — |

## Modelo de número (decisão 2026-05-29)
**Um único número de WhatsApp central pra todas as empresas** (modelo BPO/centralizado). NÃO é um número por empresa — isso pode mudar no futuro, mas não é a intenção agora. (Se um dia virar número-por-empresa, o webhook roteia por `phone_number_id` → empresa, sem mexer no modelo de dados.)

## Regras de vínculo (número → cadastro)
1. Ao chegar/sair mensagem, busca o número em `employees.phone`, `suppliers.telefone`, `clients.phone`.
2. **Número não cadastrado em ninguém** → **Caixa de Entrada ("Não identificados")**, pra vincular manualmente ou criar cadastro. (`alvo_tipo='nao_identificado'`)
3. **Número casa em UMA empresa, em mais de um cadastro dela** → anexa no de **vínculo mais forte**: **Funcionário > Sócio > Fornecedor > Cliente**.
4. **Número casa em MAIS DE UMA empresa** (número central compartilhado) → **NÃO anexa automático** (vazaria conversa entre empresas — isolação multi-tenant). Vai pra **Caixa de Entrada** com os candidatos pra resolução manual. 🔒

## Fontes das interações (o que vira anotação)
1. 🟢 **Sistema → pessoa** (cobrança, pedido de cadastro, recibo, aviso) + respostas. O fluxo de cadastro **já guarda** mensagens e arquivos em `cadastro_mensagens` — base pronta.
2. 🟡 **Qualquer WhatsApp com a pessoa** — exige um "inbox": o `whatsapp-cloud-webhook` casa número→cadastro e arquiva entrada; o `enviar-whatsapp` arquiva saída.
3. 🟡 **Você falando com o assistente sobre a pessoa** — quando o assistente age sobre alguém (ex: "lança salário do João"), gera anotação no cadastro do João.

## Resumo automático (IA)
- Função nova `resumir-interacao`: junta as mensagens de uma conversa e devolve `tema` + `resumo` + `teve_arquivo`, e grava em `interacoes_cadastro`.
- Gatilho: ao encerrar uma conversa/thread (ou em lote). **Consome crédito da Anthropic por resumo.**

## Plano de execução (fases)
| Fase | Entrega | Esforço |
|---|---|---|
| **1 — Fundação** | tabela `interacoes_cadastro` + aba "Interações" nas 3 telas + resumir o fluxo de cadastro existente | médio |
| **2 — Inbox** | casar número→cadastro no webhook + logar entrada/saída de qualquer WhatsApp + Caixa de "Não identificados" | médio-alto |
| **3 — Assistente** | anotação quando o assistente age sobre uma pessoa | médio |

## Restrições / como será entregue
- **Banco:** a tabela é uma **migration SQL** — entregue pronta, mas **rodada no SQL Editor do Supabase pela Izabel** (não dá pra aplicar pelo CLI agora).
- **Tela:** código da aba escrito aqui, mas **testado visualmente pela Izabel no app** (publica via git/Vercel).
- **IA:** o resumo automático só funciona com **créditos da Anthropic** recarregados.

## Decisões registradas (2026-05-29)
- Caixa de Entrada pra números não identificados: **SIM**.
- Desempate de múltiplos cadastros: **vínculo mais forte** (Funcionário > Sócio > Fornecedor > Cliente).
- Resumo: **automático pela IA**.
- Fontes: **as 3** (sistema→pessoa, qualquer WhatsApp, assistente).
