// ============================================================
// agente-orquestrador — Edge Function (Deno)
// Webhook do Evolution API. Para cada mensagem que chega:
//   1) identifica o empresário pelo telefone
//   2) carrega histórico recente
//   3) chama Claude com system prompt + tools
//   4) executa tools (roteia pra agente-tool-* edge functions)
//   5) loop até Claude responder texto final
//   6) envia resposta via enviar-whatsapp
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCloudConfig, isCloudEnabled, sendCloudText } from "../_shared/whatsapp-cloud.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const ANTHROPIC_MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-6";
const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") ?? "https://api.ataticagestao.com";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY")!;
const EVOLUTION_INSTANCE = Deno.env.get("EVOLUTION_INSTANCE") ?? "financeiro";
const MAX_TOOL_ITERATIONS = 6;
const HISTORICO_LIMITE = 10;
// Liga o atendimento de leads (números desconhecidos) pela IA de vendas.
// Default true; setar IA_ATENDE_LEADS=false volta ao "não te reconheço".
const IA_ATENDE_LEADS = (Deno.env.get("IA_ATENDE_LEADS") ?? "true").toLowerCase() !== "false";
// Integração com o meutatico.site (tatica-gestap): cada lead novo vira uma
// ATIVIDADE (Task) no Kanban da gestão. Sem as 2 envs, o disparo é no-op.
const TATICA_GESTAP_URL = Deno.env.get("TATICA_GESTAP_URL") ?? "";
const MEUTATICO_WEBHOOK_SECRET = Deno.env.get("EMPRESA_FLOW_WEBHOOK_SECRET") ?? "";

// ── SYSTEM PROMPT ────────────────────────────────────────────
// Versão compacta. A versão completa fica em CHATBOT-CONTEXTO/AGENTE-SYSTEM-PROMPT.md
// — atualizar aqui quando mudar lá.
const SYSTEM_PROMPT = `Você é o Assistente Tatica, agente conversacional que opera o sistema Tatica Gestap em nome do empresário, via WhatsApp.

PAPEL: receber comandos em PT-BR coloquial, executar via tools, confirmar antes de ações destrutivas, responder consultas com dados reais.

REGRAS:
- Pergunte UMA coisa por vez quando faltar info, nunca enxurrada
- Infira categoria pela descrição (luz→Energia Elétrica, aluguel→Aluguel, etc.)
- Confirme SIM/NÃO antes de cancelar venda, excluir, estornar
- Datas relativas (hoje, ontem, semana passada): resolva antes de chamar a tool
- Valores: normalize "R$ 1.500,50" → 1500.50
- Se múltiplas empresas e não disse qual, pergunte
- NUNCA invente número quando a tool retornar vazio — fale que não tem dado
- Transferência interna usa transferir_entre_contas, NÃO lancar_cp/cr
- NUNCA execute "Resetar Plano de Contas" (incidente histórico)

REGRAS DE NEGÓCIO:
- Transferência entre contas próprias não é receita/despesa
- CR/CP são soft-delete (tool já trata)
- Cartão de crédito em venda conta como PAGO (operadora repassa depois)
- Faturamento usa competência por padrão; caixa quando empresário falar "que entrou", "recebi de fato"
- Excluir extrato apaga em cascata — confirmar 2x

OVERNIGHT (relatório financeiro diário):
- O Overnight é um resumo financeiro do dia/mês em PDF enviado automaticamente pelo WhatsApp num horário configurável (padrão 18h). Contém: Faturamento do mês (pelas vendas), Despesas do mês (contas a pagar pagas), Resultado do mês, e o Consolidado de Entradas/Saídas do dia e do mês.
- Se o empresário pedir o overnight/relatório do dia/fechamento na hora ("me manda o overnight", "quero o relatório de hoje agora"), use a tool enviar_overnight — ela manda o PDF pros números já cadastrados. Não precisa confirmar (não é ação destrutiva), mas avise que vai pros números configurados.
- Horário, números de destino e ativar/desativar o envio se mexe em Configurações > Overnight no sistema (não dá pra mudar pelo chat). Se a tool disser que não está ativado, oriente o empresário a ativar lá.

ESTILO: português brasileiro coloquial, frases curtas, emoji com moderação (✅💰⚠️🚀). NUNCA "estou aqui pra ajudar", "espero ter ajudado", "foi um prazer".

FORMATAÇÃO WHATSAPP (CRÍTICO — a resposta vai pro WhatsApp, que NÃO renderiza Markdown):
- Negrito é com UM asterisco só: *assim*. NUNCA use **dois asteriscos** (aparece literal no WhatsApp).
- PROIBIDO: tabelas (nada de | ou |---|), títulos com # ou ##, e listas com markdown complexo. Tudo isso aparece quebrado/ilegível no celular.
- Pra listar várias contas/itens, use o formato ESPAÇADO (2 linhas por item + LINHA EM BRANCO entre os itens):
  linha 1: *Credor* — descrição curta
  linha 2: R$ valor · venceu/vence DD/MM (emoji de alerta se vencida)
  (linha em branco)
  Exemplo de um bloco:
  "🔴 *Vencidas*

  *Sefaz MG* — ICMS
  R$ 10.477,21 · venceu 30/04 ⚠️

  *Carpintaria S. Vicente* — Serviço
  R$ 1.850,00 · venceu 28/05"
- Agrupe por seção com um cabeçalho em *negrito* + emoji (🔴 vencidas, 🟡 a vencer). NÃO numere os itens.
- SEMPRE deixe uma linha em branco entre um item e o outro — é isso que deixa legível no celular.
- Listas longas: mostre os principais (uns 8-10), diga quantos faltam e ofereça filtrar. Não despeje 30 linhas.
- Valores sempre R$ com vírgula decimal (R$ 1.850,00).

FLUXO DE LANÇAR CP ("paguei X de Y", "lança CP de Z", "salário do João"):
1. Identifique do texto: valor, descrição/o-que-é, data (vencimento — default hoje se ele disse "paguei")
2. Identifique o TIPO de credor pelo contexto:
   - Empresa/serviço (luz, aluguel, fornecedor, mercadoria, "Equatorial", "Cielo") → chame buscar_fornecedor
   - Funcionário (salário, adiantamento, comissão, "salário do João", "férias da Maria") → chame buscar_funcionario
   - Sócio/administrador (pró-labore, distribuição de lucros, retirada, "sócio Carlos") → chame buscar_socio
   - Se ambíguo (só o nome, sem contexto), tente PRIMEIRO buscar_socio, depois buscar_funcionario, depois buscar_fornecedor
3. Se achou 1 → use ele (lembre o credor_tipo='funcionario' ou 'fornecedor'). Se achou 2+ → pergunte qual. Se 0 (e for fornecedor) → peça nome completo + CPF/CNPJ e crie via criar_fornecedor. Se 0 (e for funcionário) → NÃO crie automaticamente, peça pra cadastrar no sistema antes
4. Chame listar_categorias com termo do que ele disse pra achar categoria. Se não achar, pode lançar com categoria_id=null (vai usar "Despesas Diversas" automaticamente). Pra salário/folha: termo "salário" ou "folha"
5. CONFIRME com empresário antes de lançar:
   "Lançar CP de R$ X pra [credor], vence dia [data], categoria [nome]? Confirma?"
6. Se ele responder SIM/confirma/pode/ok → chame lancar_cp com credor_id, credor_nome E credor_tipo
7. Avise que ficou EM ABERTO: "Lancei a CP em aberto. Pra dar baixa quando pagar, manda 'paguei a conta da [credor]'."

FLUXO DE BAIXA / PAGAMENTO ("paguei a conta da X", "quitei o aluguel", "paguei o salário do João", "dei baixa na luz"):
1. Chame listar_cp_abertas com termo = credor/descrição do que ele falou
2. Se achou 1 CP → use ela. Se achou 2+ → liste pro empresário (credor, valor, vencimento) e pergunte qual. Se 0 → avise que não tem conta em aberto com esse nome (talvez não foi lançada ainda; ofereça lançar com lancar_cp)
3. Pergunte de qual conta bancária saiu o pagamento (chame listar_contas_bancarias; se ele só tem uma, use direto). Data: default hoje, a menos que ele diga outra
4. CONFIRME: "Dar baixa de R$ [saldo] da [credor] pela conta [nome], hoje? Confirma?"
5. Se SIM → chame baixar_cp com cp_id, conta_bancaria_id (e valor_pago só se for pagamento parcial)
6. Avise o resultado: "Quitei ✅" ou, se parcial, que ainda resta saldo

RECEBER (Contas a Receber) — espelha o de pagar:
- "Recebi do cliente X", "caiu o pagamento da Maria", "dei baixa no recebimento" → MESMO fluxo da baixa, mas com listar_cr_abertas (achar) + baixar_cr (em qual conta caiu o dinheiro). É entrada, não saída.
- "Fulano vai me pagar R$ X dia Y", "lança a receber" → lancar_cr (fica em aberto). Categoria é de RECEITA (listar_categorias tipo=receita).

DETALHAR VENDAS:
- consultar_faturamento dá só o TOTAL. Quando ele quer ver venda a venda ("quais vendas fiz hoje", "detalha as vendas de ontem", "vendas do cliente X"), use listar_vendas. Mostre cliente, valor, data e forma.

EDITAR FORNECEDOR:
- "muda o telefone do fornecedor X", "corrige o CNPJ da Equatorial" → buscar_fornecedor (pega o id) → confirme a mudança → editar_fornecedor com só os campos que mudaram.

CONFIG DO OVERNIGHT:
- "muda o overnight pras 19h", "adiciona/troca o número que recebe o overnight", "liga/desliga o overnight" → atualizar_config_overnight (confirme antes). Mudar destinos SUBSTITUI a lista — se for adicionar, primeiro descubra os números atuais. Se a empresa nunca configurou, a tool avisa pra fazer a 1ª config na tela Configurações.

CADASTRAR FUNCIONÁRIO:
- "cadastra o funcionário João", "novo funcionário Maria salário 2000" → criar_funcionario. SÓ CLT/temporário/estágio. Se for PJ/autônomo, é criar_fornecedor. Peça o nome (e CPF/salário se ele tiver). Confirme antes.

EXCLUIR / EDITAR LANÇAMENTO:
- "apaga a conta que lancei errado", "exclui aquele lançamento" → ache com listar_cp_abertas/listar_cr_abertas, CONFIRME (SIM/NÃO), chame excluir_lancamento. Só funciona em aberto; se já foi pago, avise que precisa estorno no sistema.
- "corrige o valor/vencimento/descrição daquela conta" → ache o id, confirme, chame editar_lancamento (só em aberto).

DRE / FLUXO DE CAIXA:
- "me mostra o DRE", "qual o resultado do mês" → gerar_dre. Resuma no chat as linhas principais: *Receita Líquida*, *Lucro Bruto*, *Resultado Operacional*, *Resultado Líquido* (uma por linha, formato WhatsApp).
- "me mostra o fluxo de caixa", "como tá o caixa" → gerar_fluxo_caixa. Resuma entradas/saídas por atividade e o resultado.
- Período default é o mês corrente; se ele pedir outro ("do trimestre", "de abril"), resolva as datas antes.
- (Por enquanto é resumo no chat, não PDF.)

REENVIAR OVERNIGHT DE DIA ANTERIOR:
- "me reenvia o overnight de ontem", "manda o fechamento do dia 25" → reenviar_overnight com a data (resolva pra YYYY-MM-DD). Vai pro SEU WhatsApp (de quem pediu). Diferente de enviar_overnight, que é o de HOJE pros números configurados.

IMPORTANTE:
- CP é lançada SEMPRE em aberto, mesmo se ele disse "paguei". O lançamento e a baixa são coisas separadas: se ele manda "paguei a conta da X" e a CP JÁ existe em aberto, vá direto pro FLUXO DE BAIXA. Se NÃO existe, lance primeiro (lancar_cp) e depois pode dar baixa.
- NÃO precisa perguntar conta bancária no lançamento (só na baixa)
- Pra FOLHA DE PAGAMENTO formal (mês inteiro de vários funcionários), peça pra usar a tela de Folha no sistema, NÃO lance CP avulsa
- Se ele já passou todas as infos numa única mensagem ("lança CP 500 luz Equatorial CNPJ 12.345.678/0001-90 vence amanhã"), pule perguntas e confirme tudo de uma vez

Use ferramentas quando precisar de dados reais ou para executar ações. Quando empresário só conversar ("oi", "tudo bem"), responda sem ferramenta.`;

// ── SYSTEM PROMPT (LEAD/VENDAS) ──────────────────────────────
// Usado quando um número DESCONHECIDO escreve (lead de anúncio Click-to-WhatsApp).
// Não tem acesso a ferramentas nem a dados de nenhuma empresa — é só venda consultiva.
const LEAD_SYSTEM_PROMPT = `Você é o atendente comercial da Tática Gestão, empresa de gestão financeira para pequenos e médios negócios. Está atendendo no WhatsApp oficial uma pessoa que provavelmente veio de um anúncio e ainda NÃO é cliente.

O QUE A TÁTICA VENDE:
- *Sistema de gestão financeira* completo: contas a pagar/receber, fluxo de caixa, DRE, conciliação bancária (importa extrato/OFX), vendas, emissão de NFS-e, dashboards e relatórios.
- *BPO Financeiro* (terceirização): a equipe da Tática cuida do financeiro do cliente — lançamentos, conciliação, cobrança, relatórios mensais — pra ele focar no negócio.
- Diferencial: um *Assistente por WhatsApp* que lança contas, consulta saldo/faturamento e manda o resumo diário do caixa (overnight).

SEU PAPEL:
- Atender com simpatia, em PT-BR coloquial e direto. Mensagens curtas (é WhatsApp), *negrito* com um asterisco de cada lado, sem listas com ## ou markdown pesado.
- Entender o momento da pessoa: que negócio tem, qual a dor (não sabe quanto sobra, atrasa conta, sem controle, contador só no fim do mês...).
- Mostrar como o Sistema e/ou o BPO resolvem aquilo. UMA pergunta por vez, nada de enxurrada.
- Objetivo: qualificar e agendar uma conversa/demonstração com a equipe. Peça nome e o tipo/tamanho do negócio quando fizer sentido.

LIMITES (importante):
- Você NÃO tem acesso a nenhum sistema, conta ou dado financeiro aqui. NÃO prometa consultar saldo, lançar conta nem nada operacional — isso é só pra clientes já ativos dentro do sistema.
- Não invente preço fechado; se perguntarem valores, diga que depende do porte e que a equipe passa uma proposta na conversa.
- Se a pessoa disser que já é cliente ou pedir suporte, peça pra ela confirmar com a Izabel pra liberar o acesso dela aqui no WhatsApp (cadastro do número), porque você só está vendo isto como um contato novo.
- Nunca diga que é uma IA "burra" nem peça código de verificação — isso é outro fluxo.`;

// ── TOOLS DEFINITIONS (resumo — schema completo em TOOLS-SCHEMA.json) ──
const TOOLS = [
    {
        name: "consultar_saldo",
        description: "Retorna saldo atual de uma ou todas as contas bancárias da empresa.",
        input_schema: {
            type: "object",
            properties: {
                empresa_id: { type: "string" },
                conta_id: { type: "string", description: "Null = todas as contas" },
            },
            required: ["empresa_id"],
        },
    },
    {
        name: "consultar_faturamento",
        description: "Retorna o faturamento total da empresa em um período. Regime competência (default) soma vendas confirmadas por data_venda; regime caixa soma recebimentos por data_pagamento. Se data_inicio/data_fim omitidos, usa o mês corrente.",
        input_schema: {
            type: "object",
            properties: {
                empresa_id: { type: "string" },
                data_inicio: { type: "string", description: "YYYY-MM-DD. Opcional. Default: 1º dia do mês corrente." },
                data_fim: { type: "string", description: "YYYY-MM-DD. Opcional. Default: último dia do mês corrente." },
                regime: { type: "string", enum: ["competencia", "caixa"], description: "Default: competencia" },
            },
            required: ["empresa_id"],
        },
    },
    {
        name: "buscar_fornecedor",
        description: "Busca fornecedor (empresa/PJ) por nome ou CPF/CNPJ (fuzzy). Use quando empresário falar em pagamento a empresa: 'paguei a Equatorial', 'aluguel', 'mercadoria do fornecedor X'. Retorna até 10 resultados.",
        input_schema: {
            type: "object",
            properties: {
                empresa_id: { type: "string" },
                termo: { type: "string", description: "Nome, parte do nome, CPF ou CNPJ" },
            },
            required: ["empresa_id", "termo"],
        },
    },
    {
        name: "buscar_funcionario",
        description: "Busca funcionário por nome ou CPF (fuzzy). Use quando empresário falar em pagamento a pessoa física da empresa: 'paguei salário do João', 'paguei a Maria', 'adiantamento pro Carlos', 'comissão da Ana'. Retorna até 10 resultados ativos.",
        input_schema: {
            type: "object",
            properties: {
                empresa_id: { type: "string" },
                termo: { type: "string", description: "Nome, parte do nome ou CPF" },
            },
            required: ["empresa_id", "termo"],
        },
    },
    {
        name: "buscar_socio",
        description: "Busca sócio/administrador da empresa por nome ou CPF. Use quando empresário falar em pagamento que envolve sócio: 'distribuí lucro pro Carlos sócio', 'pro-labore do João', 'retirada da Ana administradora', 'paguei o sócio'.",
        input_schema: {
            type: "object",
            properties: {
                empresa_id: { type: "string" },
                termo: { type: "string", description: "Nome, parte do nome ou CPF" },
            },
            required: ["empresa_id", "termo"],
        },
    },
    {
        name: "criar_fornecedor",
        description: "Cria fornecedor novo. SÓ chame depois de obter razao_social E cpf_cnpj do empresário. NUNCA invente CPF/CNPJ — peça explicitamente.",
        input_schema: {
            type: "object",
            properties: {
                empresa_id: { type: "string" },
                razao_social: { type: "string" },
                cpf_cnpj: { type: "string", description: "Obrigatório. Peça pro empresário se não souber." },
                nome_fantasia: { type: "string" },
            },
            required: ["empresa_id", "razao_social", "cpf_cnpj"],
        },
    },
    {
        name: "listar_contas_bancarias",
        description: "Lista contas bancárias ativas da empresa. Use pra empresário escolher conta de origem quando ele tem mais de uma.",
        input_schema: {
            type: "object",
            properties: { empresa_id: { type: "string" } },
            required: ["empresa_id"],
        },
    },
    {
        name: "listar_categorias",
        description: "Lista categorias do plano de contas. Use pra achar a categoria certa antes de lançar CP. Se nenhuma bater, vai usar 'Despesas Diversas' automaticamente.",
        input_schema: {
            type: "object",
            properties: {
                empresa_id: { type: "string" },
                tipo: { type: "string", enum: ["receita", "despesa"], description: "Default: despesa" },
                termo: { type: "string", description: "Filtro por nome (ex: 'energia', 'aluguel'). Opcional." },
            },
            required: ["empresa_id"],
        },
    },
    {
        name: "lancar_cp",
        description: "Lança Conta a Pagar EM ABERTO (status='aberto'). NÃO marca como paga. O empresário dará baixa depois com outra mensagem. SEMPRE confirme com empresário antes de chamar (valor, credor, vencimento, categoria).",
        input_schema: {
            type: "object",
            properties: {
                empresa_id: { type: "string" },
                credor_id: { type: "string", description: "UUID do credor (fornecedor, funcionário OU sócio, conforme credor_tipo). Null se não está cadastrado." },
                credor_tipo: { type: "string", enum: ["fornecedor", "funcionario", "socio", "outro"], description: "Tipo do credor. Use 'funcionario' se vier de buscar_funcionario, 'socio' se vier de buscar_socio, 'fornecedor' se vier de buscar_fornecedor. Default: fornecedor." },
                credor_nome: { type: "string", description: "Nome do credor (sempre obrigatório)" },
                descricao: { type: "string", description: "Ex: 'Conta de luz', 'Aluguel maio', 'Salário João'" },
                valor: { type: "number", description: "Valor em reais com ponto decimal (1500.50)" },
                data_vencimento: { type: "string", description: "YYYY-MM-DD" },
                categoria_id: { type: "string", description: "UUID da categoria do plano de contas. Null = usa 'Despesas Diversas'." },
                centro_custo_id: { type: "string" },
                observacao: { type: "string" },
            },
            required: ["empresa_id", "credor_nome", "descricao", "valor", "data_vencimento"],
        },
    },
    {
        name: "listar_cp_abertas",
        description: "Lista as Contas a Pagar em aberto/parcial/vencidas da empresa. Use pra ACHAR a conta que o empresário quer dar baixa quando ele diz 'paguei a conta da Equatorial', 'quitei o aluguel', 'paguei o salário do João'. Filtra por credor ou descrição via 'termo'. Retorna cp_id, credor, descrição, saldo e vencimento.",
        input_schema: {
            type: "object",
            properties: {
                empresa_id: { type: "string" },
                termo: { type: "string", description: "Filtra por nome do credor ou descrição (ex: 'Equatorial', 'aluguel', 'João'). Opcional." },
            },
            required: ["empresa_id"],
        },
    },
    {
        name: "baixar_cp",
        description: "Dá baixa (registra o pagamento) de uma Conta a Pagar em aberto — marca como paga e cria a movimentação no extrato. Use depois de o empresário confirmar que pagou. SEMPRE ache a CP antes com listar_cp_abertas (pega o cp_id) e pergunte de qual conta bancária saiu o pagamento (use listar_contas_bancarias). CONFIRME com o empresário antes de chamar.",
        input_schema: {
            type: "object",
            properties: {
                empresa_id: { type: "string" },
                cp_id: { type: "string", description: "UUID da CP a quitar (venho de listar_cp_abertas)." },
                conta_bancaria_id: { type: "string", description: "UUID da conta bancária de onde saiu o pagamento (de listar_contas_bancarias)." },
                data_pagamento: { type: "string", description: "YYYY-MM-DD. Opcional, default hoje." },
                valor_pago: { type: "number", description: "Valor pago em reais. Opcional, default = saldo restante da CP (quita total)." },
                forma_pagamento: { type: "string", description: "pix, dinheiro, transferencia, boleto, cartao. Opcional, default pix." },
            },
            required: ["empresa_id", "cp_id", "conta_bancaria_id"],
        },
    },
    {
        name: "listar_cr_abertas",
        description: "Lista as Contas a Receber em aberto/parcial/vencidas. Use pra ACHAR o recebimento quando o empresário diz 'recebi do cliente X', 'caiu o pagamento da Maria'. Filtra por pagador ou descrição via 'termo'. Retorna cr_id, pagador, saldo e vencimento.",
        input_schema: {
            type: "object",
            properties: {
                empresa_id: { type: "string" },
                termo: { type: "string", description: "Filtra por nome do pagador ou descrição. Opcional." },
            },
            required: ["empresa_id"],
        },
    },
    {
        name: "baixar_cr",
        description: "Dá baixa (registra o recebimento) de uma Conta a Receber em aberto — marca recebida e lança a entrada no extrato. Use depois que o empresário confirmar que recebeu. SEMPRE ache a CR antes com listar_cr_abertas e pergunte em qual conta bancária o dinheiro caiu. CONFIRME antes de chamar.",
        input_schema: {
            type: "object",
            properties: {
                empresa_id: { type: "string" },
                cr_id: { type: "string", description: "UUID da CR (de listar_cr_abertas)." },
                conta_bancaria_id: { type: "string", description: "UUID da conta onde o dinheiro caiu (de listar_contas_bancarias)." },
                data_pagamento: { type: "string", description: "YYYY-MM-DD. Opcional, default hoje." },
                valor_pago: { type: "number", description: "Opcional, default = saldo restante (recebe total)." },
                forma_recebimento: { type: "string", description: "pix, dinheiro, transferencia, boleto, cartao. Opcional, default pix." },
            },
            required: ["empresa_id", "cr_id", "conta_bancaria_id"],
        },
    },
    {
        name: "lancar_cr",
        description: "Lança uma Conta a Receber EM ABERTO (alguém vai te pagar). Use pra 'fulano vai me pagar X dia Y', 'lança a receber de R$ Z do cliente'. Fica em aberto até dar baixa com baixar_cr. CONFIRME antes de chamar.",
        input_schema: {
            type: "object",
            properties: {
                empresa_id: { type: "string" },
                pagador_nome: { type: "string", description: "Quem vai pagar (cliente/pessoa)." },
                valor: { type: "number", description: "Valor em reais (1500.50)." },
                data_vencimento: { type: "string", description: "YYYY-MM-DD." },
                descricao: { type: "string", description: "Ex: 'Serviço de consultoria', 'Venda parcelada'." },
                pagador_cpf_cnpj: { type: "string", description: "Opcional." },
                categoria_id: { type: "string", description: "UUID da categoria de receita. Opcional (use listar_categorias com tipo=receita)." },
            },
            required: ["empresa_id", "pagador_nome", "valor", "data_vencimento"],
        },
    },
    {
        name: "listar_vendas",
        description: "Lista as vendas individuais (detalhe venda a venda) de um período — complementa consultar_faturamento, que é só o total. Use pra 'quais vendas fiz hoje', 'detalha as vendas da semana', 'vendas do cliente X'. Read-only.",
        input_schema: {
            type: "object",
            properties: {
                empresa_id: { type: "string" },
                data_inicio: { type: "string", description: "YYYY-MM-DD. Opcional, default 1º dia do mês." },
                data_fim: { type: "string", description: "YYYY-MM-DD. Opcional, default hoje." },
                termo: { type: "string", description: "Filtra por nome do cliente. Opcional." },
            },
            required: ["empresa_id"],
        },
    },
    {
        name: "editar_fornecedor",
        description: "Edita campos de um fornecedor existente (razão social, nome fantasia, CPF/CNPJ, email, telefone). SEMPRE use buscar_fornecedor antes pra pegar o fornecedor_id. Só atualiza os campos informados. CONFIRME a alteração antes.",
        input_schema: {
            type: "object",
            properties: {
                empresa_id: { type: "string" },
                fornecedor_id: { type: "string", description: "UUID do fornecedor (de buscar_fornecedor)." },
                razao_social: { type: "string" },
                nome_fantasia: { type: "string" },
                cpf_cnpj: { type: "string" },
                email: { type: "string" },
                telefone: { type: "string" },
            },
            required: ["empresa_id", "fornecedor_id"],
        },
    },
    {
        name: "atualizar_config_overnight",
        description: "Ajusta a configuração do Overnight da empresa: horário de envio, números que recebem e ligar/desligar o envio. Use pra 'muda o overnight pras 19h', 'adiciona o número X no overnight', 'desliga o overnight'. CONFIRME antes. (A 1ª configuração ainda precisa ser feita na tela Configurações.)",
        input_schema: {
            type: "object",
            properties: {
                empresa_id: { type: "string" },
                horario: { type: "string", description: "HH:MM (ex: 19:00). Opcional." },
                destinos: { type: "array", items: { type: "string" }, description: "Lista de números (DDD+número). Substitui a lista atual. Opcional." },
                whatsapp_ativo: { type: "boolean", description: "true liga, false desliga o envio. Opcional." },
                mensagem: { type: "string", description: "Legenda opcional do envio." },
            },
            required: ["empresa_id"],
        },
    },
    {
        name: "criar_funcionario",
        description: "Cadastra um funcionário novo (employees). SÓ CLT, temporário ou estágio — PJ/autônomo deve ser cadastrado como fornecedor (criar_fornecedor). Peça nome e, se possível, CPF e salário. CONFIRME antes de criar.",
        input_schema: {
            type: "object",
            properties: {
                empresa_id: { type: "string" },
                nome: { type: "string" },
                cpf: { type: "string", description: "Opcional, mas recomendável." },
                cargo: { type: "string", description: "Opcional." },
                salario: { type: "number", description: "Salário base em reais. Opcional." },
                tipo_contrato: { type: "string", enum: ["clt", "temporario", "estagio"], description: "Default clt." },
                data_admissao: { type: "string", description: "YYYY-MM-DD. Opcional." },
            },
            required: ["empresa_id", "nome"],
        },
    },
    {
        name: "excluir_lancamento",
        description: "Exclui (soft-delete) uma Conta a Pagar ou a Receber que ainda está EM ABERTO. Use pra 'apaga aquela conta que lancei errado'. Pega o id com listar_cp_abertas/listar_cr_abertas. Lançamento JÁ PAGO não dá — precisa estorno no sistema. CONFIRME (SIM/NÃO) antes.",
        input_schema: {
            type: "object",
            properties: {
                empresa_id: { type: "string" },
                tipo: { type: "string", enum: ["cp", "cr"], description: "cp = conta a pagar, cr = conta a receber." },
                id: { type: "string", description: "UUID do lançamento (cp_id ou cr_id)." },
            },
            required: ["empresa_id", "tipo", "id"],
        },
    },
    {
        name: "editar_lancamento",
        description: "Edita uma Conta a Pagar/Receber EM ABERTO (descrição, valor, vencimento, categoria). Use pra 'corrige o valor daquela conta', 'muda o vencimento'. Pega o id com listar_cp_abertas/listar_cr_abertas. Pago não dá. CONFIRME antes.",
        input_schema: {
            type: "object",
            properties: {
                empresa_id: { type: "string" },
                tipo: { type: "string", enum: ["cp", "cr"] },
                id: { type: "string" },
                descricao: { type: "string" },
                valor: { type: "number" },
                data_vencimento: { type: "string", description: "YYYY-MM-DD" },
                categoria_id: { type: "string", description: "UUID da categoria." },
            },
            required: ["empresa_id", "tipo", "id"],
        },
    },
    {
        name: "gerar_dre",
        description: "Gera o DRE (Demonstração de Resultado: receita, custos, despesas, lucro) de um período. Use pra 'me mostra o DRE', 'qual o resultado do mês'. Retorna as linhas — resuma as principais no chat (Receita Líquida, Lucro Bruto, Resultado Operacional, Resultado Líquido).",
        input_schema: {
            type: "object",
            properties: {
                empresa_id: { type: "string" },
                data_inicio: { type: "string", description: "YYYY-MM-DD. Default 1º dia do mês." },
                data_fim: { type: "string", description: "YYYY-MM-DD. Default hoje." },
            },
            required: ["empresa_id"],
        },
    },
    {
        name: "gerar_fluxo_caixa",
        description: "Gera a DFC (Demonstração de Fluxo de Caixa: entradas/saídas por atividade) de um período. Use pra 'me mostra o fluxo de caixa', 'como ficou o caixa do mês'. Resuma as principais linhas no chat.",
        input_schema: {
            type: "object",
            properties: {
                empresa_id: { type: "string" },
                data_inicio: { type: "string", description: "YYYY-MM-DD. Default 1º dia do mês." },
                data_fim: { type: "string", description: "YYYY-MM-DD. Default hoje." },
            },
            required: ["empresa_id"],
        },
    },
    {
        name: "reenviar_overnight",
        description: "Gera o Overnight de uma DATA específica (dia anterior) e manda o PDF pro WhatsApp de quem pediu. Use pra 'me reenvia o overnight de ontem', 'manda o fechamento do dia 25'. Resolva a data relativa antes (YYYY-MM-DD).",
        input_schema: {
            type: "object",
            properties: {
                empresa_id: { type: "string" },
                data: { type: "string", description: "YYYY-MM-DD — o dia do overnight." },
            },
            required: ["empresa_id", "data"],
        },
    },
    {
        name: "enviar_overnight",
        description: "Dispara AGORA o Overnight (relatório financeiro diário em PDF) por WhatsApp pros números já configurados da empresa. Use quando o empresário pedir 'me manda o overnight', 'manda o relatório do dia', 'quero o fechamento de hoje agora'. Não escolhe destinatário — envia pros destinos cadastrados em Configurações > Overnight. Se o WhatsApp do overnight não estiver ativado, a tool avisa.",
        input_schema: {
            type: "object",
            properties: {
                empresa_id: { type: "string" },
            },
            required: ["empresa_id"],
        },
    },
];

// ── tipos ────────────────────────────────────────────────────

interface EvolutionWebhook {
    event?: string;
    instance?: string;
    data?: {
        key?: {
            remoteJid?: string;
            fromMe?: boolean;
            id?: string;
        };
        message?: {
            conversation?: string;
            extendedTextMessage?: { text?: string };
            imageMessage?: { caption?: string; mimetype?: string };
            documentMessage?: { caption?: string; mimetype?: string; fileName?: string; title?: string };
            documentWithCaptionMessage?: { message?: { documentMessage?: { caption?: string; mimetype?: string; fileName?: string } } };
        };
        messageType?: string;
        pushName?: string;
        messageTimestamp?: number;
    };
}

interface PermissoesAcesso {
    consultar?: boolean;
    lancar_cp?: boolean;
    baixar_cp?: boolean;
    [key: string]: boolean | undefined;
}

interface ContextoUsuario {
    user_id: string | null;  // profile_id quando vinculado (null se acesso só por whatsapp_acesso)
    acesso_id: string | null;  // acesso_id da whatsapp_acesso
    full_name: string;
    email: string;
    empresas: Array<{ company_id: string; nome_fantasia: string; permissoes: PermissoesAcesso }>;
    empresa_ativa_id: string | null;
    phone: string;
}

// ── helpers ──────────────────────────────────────────────────

function jsonResp(payload: unknown, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

function normalizePhone(raw: string): string | null {
    if (!raw) return null;
    let d = raw.replace(/\D/g, "");
    if (d.startsWith("0")) d = d.slice(1);
    if (!d.startsWith("55") && (d.length === 10 || d.length === 11)) d = "55" + d;
    if (d.length < 12 || d.length > 13) return null;
    return d;
}

// Mesma normalização do RPC whatsapp_registrar_msg (remove o 9 extra de celular):
// garante que os lookups no inbox batam com conversa.phone (12 dígitos).
function inboxPhone(raw: string): string {
    let d = (raw || "").replace(/\D/g, "");
    if (d.startsWith("0")) d = d.slice(1);
    if (!d.startsWith("55") && (d.length === 10 || d.length === 11)) d = "55" + d;
    if (d.length === 13 && d[4] === "9") d = d.slice(0, 4) + d.slice(5);
    return d;
}

interface ParsedMsg {
    phone: string;
    text: string;          // texto livre ou caption da mídia
    midia: null | {
        tipo: "image" | "document";
        mimetype: string;
        fileName?: string;
    };
}

function extrairTextoEvolution(body: EvolutionWebhook): ParsedMsg | null {
    const key: any = body?.data?.key;
    if (!key) return null;
    if (key.fromMe) return null;
    const jidUsar = key.remoteJidAlt && typeof key.remoteJidAlt === "string"
        ? key.remoteJidAlt
        : key.remoteJid;
    if (!jidUsar) return null;
    const phone = jidUsar.split("@")[0];

    const msg = body.data?.message || {};
    // documentWithCaptionMessage envolve um documentMessage interno
    const docInner = (msg as any)?.documentWithCaptionMessage?.message?.documentMessage;
    const text =
        msg.conversation ??
        msg.extendedTextMessage?.text ??
        msg.imageMessage?.caption ??
        msg.documentMessage?.caption ??
        docInner?.caption ??
        "";

    let midia: ParsedMsg["midia"] = null;
    if (msg.imageMessage) {
        midia = { tipo: "image", mimetype: msg.imageMessage.mimetype || "image/jpeg" };
    } else if (msg.documentMessage) {
        midia = { tipo: "document", mimetype: msg.documentMessage.mimetype || "application/pdf", fileName: msg.documentMessage.fileName };
    } else if (docInner) {
        midia = { tipo: "document", mimetype: docInner.mimetype || "application/pdf", fileName: docInner.fileName };
    }

    if (!text.trim() && !midia) return null;
    return { phone, text: text.trim(), midia };
}

async function baixarMidiaEvolution(messageId: string, remoteJid: string): Promise<{ base64: string; mimetype: string } | null> {
    try {
        const url = `${EVOLUTION_API_URL.replace(/\/$/, "")}/chat/getBase64FromMediaMessage/${EVOLUTION_INSTANCE}`;
        const resp = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
            body: JSON.stringify({ message: { key: { id: messageId, remoteJid } } }),
        });
        if (!resp.ok) {
            console.error("[orquestrador] erro baixar midia:", resp.status, (await resp.text()).slice(0, 200));
            return null;
        }
        const data = await resp.json();
        const base64 = data?.base64 ?? data?.media ?? null;
        const mimetype = data?.mimetype ?? "application/pdf";
        if (!base64) return null;
        return { base64, mimetype };
    } catch (err: any) {
        console.error("[orquestrador] excecao baixar midia:", err?.message);
        return null;
    }
}

async function extrairDadosBoleto(base64: string, mimetype: string): Promise<any | null> {
    try {
        const url = `${SUPABASE_URL}/functions/v1/ler-boleto`;
        const resp = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SERVICE_KEY}`,
                apikey: SERVICE_KEY,
            },
            body: JSON.stringify({ fileBase64: base64, mimeType: mimetype }),
        });
        if (!resp.ok) {
            console.error("[orquestrador] ler-boleto falhou:", resp.status, (await resp.text()).slice(0, 200));
            return null;
        }
        const data = await resp.json();
        return data;
    } catch (err: any) {
        console.error("[orquestrador] excecao ler-boleto:", err?.message);
        return null;
    }
}

async function enviarResposta(phone: string, text: string) {
    // Cloud API (oficial Meta) quando a flag USE_WHATSAPP_CLOUD=true.
    // Resposta a mensagem recebida = dentro da janela de 24h, entao texto livre e permitido.
    if (isCloudEnabled()) {
        const cfg = getCloudConfig();
        if (!cfg) {
            console.error("[orquestrador] USE_WHATSAPP_CLOUD=true mas credenciais Cloud ausentes");
            return;
        }
        const res = await sendCloudText(cfg, { to: phone, text });
        if (!res.ok) {
            console.error("[orquestrador] enviar (cloud) falhou:", res.error);
        } else {
            console.log("[orquestrador] enviada (cloud) pra", phone, "—", text.slice(0, 50));
            // Espelha a resposta da IA no inbox (não bloqueia o fluxo se falhar).
            await registrarSaidaInbox(phone, text, res.waMessageId);
        }
        return;
    }

    // Fallback legado: Evolution direto (pula enviar-whatsapp pra evitar JWT entre edge functions).
    const url = `${EVOLUTION_API_URL.replace(/\/$/, "")}/message/sendText/${EVOLUTION_INSTANCE}`;
    try {
        const resp = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: EVOLUTION_API_KEY,
            },
            body: JSON.stringify({ number: phone, text }),
        });
        const body = await resp.text();
        if (!resp.ok) {
            console.error("[orquestrador] enviar falhou:", resp.status, body.slice(0, 300));
        } else {
            console.log("[orquestrador] enviada pra", phone, "—", text.slice(0, 50));
        }
    } catch (err: any) {
        console.error("[orquestrador] erro ao enviar:", err?.message);
    }
}

async function carregarHistorico(
    service: ReturnType<typeof createClient>,
    userId: string | null,
    acessoId: string | null,
    companyId: string | null,
) {
    let q = service
        .from("agente_conversas")
        .select("role, content, created_at")
        // Só o histórico do WhatsApp — o chat web (canal='web') tem histórico próprio.
        .or("canal.is.null,canal.eq.whatsapp")
        .order("created_at", { ascending: false })
        .limit(HISTORICO_LIMITE * 2);
    // Filtra por profile_id OU acesso_id (quem identifica esse usuário)
    if (userId) q = q.eq("user_id", userId);
    else if (acessoId) q = q.eq("acesso_id", acessoId);
    else return [];
    const { data } = await q;

    if (!data) return [];
    // Claude API só aceita roles 'user' e 'assistant'.
    // role='tool' é log interno (objeto com tool_name/input/output) — descarta no replay.
    // Além disso, só replicamos mensagens cujo content é string (texto puro) — tool_use/tool_result
    // de turns passados não fazem sentido sem o par completo, então pulamos.
    return data
        .reverse()
        .filter((row: any) =>
            (row.role === "user" || row.role === "assistant") &&
            typeof row.content === "string" &&
            row.content.trim().length > 0
        )
        .map((row: any) => ({ role: row.role, content: row.content }));
}

async function salvarMensagem(
    service: ReturnType<typeof createClient>,
    userId: string | null,
    acessoId: string | null,
    companyId: string | null,
    role: string,
    content: unknown,
    tokens?: { input?: number; output?: number },
) {
    const { error } = await service.from("agente_conversas").insert({
        user_id: userId,
        acesso_id: acessoId,
        company_id: companyId,
        canal: "whatsapp",
        role,
        content,
        tokens_input: tokens?.input ?? null,
        tokens_output: tokens?.output ?? null,
    });
    if (error) console.error("[orquestrador] salvarMensagem falhou:", error.message);
}

async function executarTool(
    name: string,
    input: Record<string, unknown>,
    contexto: ContextoUsuario,
): Promise<unknown> {
    // Injeta empresa_ativa_id se a tool exige empresa_id e ela não veio
    if (!input.empresa_id && contexto.empresa_ativa_id) {
        input.empresa_id = contexto.empresa_ativa_id;
    }

    // Valida que o user pode acessar a empresa pedida
    const empresaCtx = contexto.empresas.find((e) => e.company_id === input.empresa_id);
    if (input.empresa_id && !empresaCtx) {
        return { error: "Você não tem permissão nessa empresa." };
    }

    // Filtro de permissões por tool (write tools precisam de flag específica)
    const permissoes = empresaCtx?.permissoes || {};
    const requerLancarCp = ["lancar_cp", "criar_fornecedor", "lancar_cr", "editar_fornecedor", "atualizar_config_overnight", "criar_funcionario", "excluir_lancamento", "editar_lancamento"];
    const requerBaixarCp = ["baixar_cp", "baixar_cr"];
    if (requerLancarCp.includes(name) && permissoes.lancar_cp !== true) {
        return { error: "Você não tem permissão pra lançar contas nessa empresa. Fale com o admin." };
    }
    if (requerBaixarCp.includes(name) && permissoes.baixar_cp !== true) {
        return { error: "Você não tem permissão pra dar baixa nessa empresa. Fale com o admin." };
    }

    // Roteia pra edge function da tool
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
    };
    if (contexto.user_id) headers["x-agente-user-id"] = contexto.user_id;
    if (contexto.acesso_id) headers["x-agente-acesso-id"] = contexto.acesso_id;
    if (contexto.phone) headers["x-agente-phone"] = contexto.phone;

    const resp = await fetch(`${SUPABASE_URL}/functions/v1/agente-tool-${name}`, {
        method: "POST",
        headers,
        body: JSON.stringify(input),
    });
    const body = await resp.json().catch(() => ({ error: "Resposta inválida da tool" }));
    if (!resp.ok) {
        return { error: body?.error || `tool ${name} retornou ${resp.status}` };
    }
    return body;
}

async function chamarClaude(messages: any[], tokensCacheable: boolean) {
    const systemBlocks = tokensCacheable
        ? [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }]
        : [{ type: "text", text: SYSTEM_PROMPT }];

    // Cacheia também o bloco de tools (cache_control na ÚLTIMA tool cobre todas).
    // Sem isso, as ~24 definições eram cobradas preço cheio em CADA volta do loop.
    // Não muda comportamento — só barateia as chamadas repetidas.
    const tools = tokensCacheable
        ? TOOLS.map((t, i) =>
            i === TOOLS.length - 1 ? { ...t, cache_control: { type: "ephemeral" } } : t
          )
        : TOOLS;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
            model: ANTHROPIC_MODEL,
            max_tokens: 1024,
            system: systemBlocks,
            tools,
            messages,
        }),
    });

    if (!resp.ok) {
        const errBody = await resp.text();
        throw new Error(`Claude API ${resp.status}: ${errBody}`);
    }
    return await resp.json();
}

// ── INBOX: helpers de espelhamento e atendimento de lead ──────

/** Espelha uma mensagem enviada pela IA no inbox (whatsapp_mensagens via RPC). */
async function registrarSaidaInbox(phone: string, text: string, waMessageId?: string) {
    try {
        const svc = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
        const { error } = await svc.rpc("whatsapp_registrar_msg", {
            p_phone: phone,
            p_direcao: "saida",
            p_autor: "ia",
            p_conteudo: text,
            p_wa_message_id: waMessageId ?? null,
            p_tipo: "texto",
            p_status: waMessageId ? "sent" : null,
        });
        if (error) console.error("[orquestrador] registrarSaidaInbox falhou:", error.message);
    } catch (e: any) {
        console.error("[orquestrador] exceção registrarSaidaInbox:", e?.message);
    }
}

/** Lê ia_ativa da conversa (se humano assumiu, a IA fica em silêncio). default true. */
async function leadIaAtiva(service: ReturnType<typeof createClient>, phone: string): Promise<boolean> {
    try {
        const { data } = await service
            .from("whatsapp_conversas")
            .select("ia_ativa")
            .eq("phone", inboxPhone(phone))
            .maybeSingle();
        if (data && (data as any).ia_ativa === false) return false;
        return true;
    } catch {
        return true;
    }
}

/** Histórico da conversa do lead (vem do inbox, não de agente_conversas). */
async function carregarHistoricoLead(
    service: ReturnType<typeof createClient>,
    phone: string,
    excluirWaId: string | null,
): Promise<any[]> {
    let q = service
        .from("whatsapp_mensagens")
        .select("autor, conteudo, created_at, wa_message_id")
        .eq("phone", inboxPhone(phone))
        .order("created_at", { ascending: false })
        .limit(HISTORICO_LIMITE * 2);
    // Exclui a mensagem que acabou de chegar (já vamos anexá-la como turn atual);
    // mantém linhas com wa_message_id nulo (saídas antigas).
    if (excluirWaId) q = q.or(`wa_message_id.is.null,wa_message_id.neq.${excluirWaId}`);
    const { data } = await q;
    if (!data) return [];
    return (data as any[])
        .reverse()
        .filter((r) => typeof r.conteudo === "string" && r.conteudo.trim().length > 0)
        .map((r) => ({
            role: r.autor === "contato" ? "user" : "assistant",
            content: r.conteudo,
        }));
}

/** Chama Claude com a persona de vendas (sem tools). */
async function chamarClaudeLead(messages: any[]) {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
            model: ANTHROPIC_MODEL,
            max_tokens: 700,
            system: [{ type: "text", text: LEAD_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
            messages,
        }),
    });
    if (!resp.ok) {
        const errBody = await resp.text();
        throw new Error(`Claude API ${resp.status}: ${errBody}`);
    }
    return await resp.json();
}

/** Cria uma ATIVIDADE (Task) do lead no meutatico.site (tatica-gestap), via webhook.
 * Dedup é feito do lado de lá (1 tarefa aberta por telefone). No-op se não configurado. */
async function criarAtividadeMeutatico(
    service: ReturnType<typeof createClient>,
    phoneNorm: string,
    texto: string,
): Promise<void> {
    if (!TATICA_GESTAP_URL || !MEUTATICO_WEBHOOK_SECRET) return; // integração não configurada
    try {
        // Pega nome + anúncio (referral) que o webhook já gravou na conversa.
        let nome: string | null = null;
        let referral: unknown = null;
        try {
            const { data } = await service
                .from("whatsapp_conversas")
                .select("nome, referral")
                .eq("phone", inboxPhone(phoneNorm))
                .maybeSingle();
            if (data) {
                nome = (data as any).nome ?? null;
                referral = (data as any).referral ?? null;
            }
        } catch { /* segue sem nome/referral */ }

        const resp = await fetch(
            `${TATICA_GESTAP_URL.replace(/\/$/, "")}/api/v1/webhooks/empresa-flow/whatsapp-lead`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Webhook-Secret": MEUTATICO_WEBHOOK_SECRET,
                },
                body: JSON.stringify({ phone: phoneNorm, nome, mensagem: texto, referral }),
                // Nunca segura o atendimento: corta em 8s se o meutatico demorar/cair.
                signal: AbortSignal.timeout(8000),
            },
        );
        if (!resp.ok) {
            console.error("[orquestrador] criarAtividadeMeutatico falhou:", resp.status, (await resp.text()).slice(0, 200));
        } else {
            console.log("[orquestrador] atividade meutatico ok pra", phoneNorm);
        }
    } catch (e: any) {
        console.error("[orquestrador] erro criarAtividadeMeutatico:", e?.message);
    }
}

/** Fluxo de atendimento de lead (número desconhecido) pela IA de vendas. */
async function atenderLead(
    service: ReturnType<typeof createClient>,
    phoneNorm: string,
    texto: string,
    msgId: string | null,
): Promise<void> {
    const historico = await carregarHistoricoLead(service, phoneNorm, msgId);
    const userText = (texto || "").trim() || "(o lead enviou uma mídia sem texto)";
    // Mescla turns consecutivos do mesmo papel — a API do Claude exige alternância.
    const messages: any[] = [];
    for (const m of [...historico, { role: "user", content: userText }]) {
        const last = messages[messages.length - 1];
        if (last && last.role === m.role) {
            last.content = `${last.content}\n${m.content}`;
        } else {
            messages.push({ ...m });
        }
    }
    // A API exige que a 1ª mensagem seja do usuário.
    while (messages.length && messages[0].role !== "user") messages.shift();
    if (messages.length === 0) messages.push({ role: "user", content: userText });
    let respostaFinal = "";
    try {
        const claudeResp = await chamarClaudeLead(messages);
        respostaFinal = (claudeResp.content || [])
            .filter((b: any) => b.type === "text")
            .map((b: any) => b.text)
            .join("\n")
            .trim();
    } catch (e: any) {
        console.error("[orquestrador] erro Claude (lead):", e?.message);
    }
    if (!respostaFinal) {
        respostaFinal = "Oi! Aqui é o atendimento da *Tática Gestão*. Me conta rapidinho: que tipo de negócio você tem e o que tá te incomodando hoje no financeiro?";
    }
    await enviarResposta(phoneNorm, respostaFinal);

    // Gera a atividade do lead na gestão (meutatico.site). Dedup do lado de lá.
    await criarAtividadeMeutatico(service, phoneNorm, texto);
}

// ── handler principal ────────────────────────────────────────

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    // Pega body como texto cru pra log nos Edge Function Logs do Supabase
    const bodyRaw = await req.text();
    console.log("[orquestrador] webhook_in:", bodyRaw.slice(0, 2000));

    let body: EvolutionWebhook;
    try {
        body = JSON.parse(bodyRaw);
    } catch {
        return jsonResp({ error: "JSON inválido" }, 400);
    }

    const msg = extrairTextoEvolution(body);
    if (!msg) {
        console.log("[orquestrador] extrairTextoEvolution retornou null. Body:", JSON.stringify(body).slice(0, 500));
    }

    // Dedup: se message_id já foi processado, ignora (vem do webhook E polling em paralelo).
    const msgId = body?.data?.key?.id;
    if (msgId) {
        const dedupService = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
        const { data: jaProc } = await dedupService
            .from("agente_msg_processadas")
            .select("message_id")
            .eq("message_id", msgId)
            .maybeSingle();
        if (jaProc) {
            console.log("[orquestrador] msg já processada, ignorando:", msgId);
            return jsonResp({ ok: true, status: "duplicada_ignorada", msgId });
        }
        // marca como processada ANTES de processar
        try {
            await dedupService.from("agente_msg_processadas").insert({
                message_id: msgId,
                from_phone: (body?.data?.key as any)?.remoteJidAlt?.split("@")[0] || body?.data?.key?.remoteJid?.split("@")[0] || "",
                conteudo: msg?.text?.slice(0, 500) || null,
            });
        } catch (e: any) {
            // ignora erro de unique violation (msg já processada por concorrente)
            console.log("[orquestrador] dedup insert skip:", e?.message?.slice(0, 80));
        }
    }
    if (!msg) {
        return jsonResp({ ok: true, skipped: "sem texto ou mensagem própria" });
    }

    const phoneNorm = normalizePhone(msg.phone);
    if (!phoneNorm) {
        return jsonResp({ ok: true, skipped: "telefone inválido" });
    }

    const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // 0a. HUMANO ASSUMIU A CONVERSA (inbox): se ia_ativa=false, a IA fica em silêncio.
    // A mensagem recebida já foi gravada no inbox pelo whatsapp-cloud-webhook, então
    // não se perde nada — a Izabel responde manualmente pela tela.
    if (!(await leadIaAtiva(service, phoneNorm))) {
        console.log("[orquestrador] ia_ativa=false (humano assumiu), não respondo:", phoneNorm);
        return jsonResp({ ok: true, status: "ia_pausada_humano_assumiu" });
    }

    // 0. ROTEAMENTO CADASTRO AUTOMATIZADO
    // Se esse telefone tem uma solicitacao de cadastro ATIVA, encaminha pro
    // cadastro-processor e retorna. Quem responde aqui nao e necessariamente
    // um usuario autorizado em whatsapp_acesso — pode ser funcionario/fornecedor
    // que ainda nem tem cadastro.
    try {
        const { data: solicitacaoAtiva } = await service
            .from("cadastro_solicitacoes")
            .select("id, status")
            .eq("telefone", phoneNorm)
            .in("status", ["enviado", "em_conversa"])
            .order("criado_em", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (solicitacaoAtiva) {
            console.log("[orquestrador] rota cadastro:", solicitacaoAtiva.id);

            // Monta payload pro processor (texto + midia se houver)
            const processorMessage: any = {
                evolution_message_id: msgId ?? null,
            };

            if (msg.midia && msgId) {
                // Baixa midia via Evolution
                const remoteJid = body?.data?.key?.remoteJid || "";
                const midiaDl = await baixarMidiaEvolution(msgId, remoteJid);
                if (midiaDl) {
                    processorMessage.type = msg.midia.tipo; // 'image' | 'document'
                    processorMessage.media_base64 = midiaDl.base64;
                    processorMessage.mime = midiaDl.mimetype;
                    if (msg.text) processorMessage.text = msg.text;
                } else {
                    // Falhou baixar — manda como texto-only com aviso
                    processorMessage.type = "text";
                    processorMessage.text = msg.text || "(o destinatario enviou uma midia mas nao consegui baixar)";
                }
            } else {
                processorMessage.type = "text";
                processorMessage.text = msg.text;
            }

            // Chama cadastro-processor (fire-and-forget seria mais rapido,
            // mas vamos aguardar pra pegar erros corretamente)
            const procResp = await fetch(`${SUPABASE_URL}/functions/v1/cadastro-processor`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${SERVICE_KEY}`,
                    apikey: SERVICE_KEY,
                },
                body: JSON.stringify({
                    solicitacao_id: solicitacaoAtiva.id,
                    message: processorMessage,
                }),
            });

            const procData = await procResp.json().catch(() => ({}));
            return jsonResp({
                ok: true,
                status: "rota_cadastro",
                solicitacao_id: solicitacaoAtiva.id,
                processor_response: procData,
            });
        }
    } catch (e: any) {
        // Falha do roteamento NAO deve quebrar o fluxo normal — apenas loga
        console.error("[orquestrador] erro rota cadastro:", e?.message);
    }

    // 1a. Se mensagem é só 6 dígitos isolados, trata como código de verificação
    const trimmedText = msg.text.trim();
    const eCodigoVerif = /^\d{6}$/.test(trimmedText);
    if (eCodigoVerif) {
        const { data: validacao } = await service.rpc("agente_validar_codigo", {
            p_phone: phoneNorm,
            p_codigo: trimmedText,
        });
        const result = Array.isArray(validacao) && validacao.length > 0 ? validacao[0] : null;
        const resposta = result?.mensagem || "Sem solicitação pendente pra esse número.";
        const sucesso = !!result?.sucesso;

        await enviarResposta(phoneNorm, sucesso
            ? `✅ ${resposta}\n\nDigita "saldo" ou "faturamento" pra começar.`
            : `⚠️ ${resposta}`);
        return jsonResp({ ok: true, status: sucesso ? "codigo_validado" : "codigo_invalido" });
    }

    // 1b. Identifica usuário pelas autorizações em whatsapp_acesso (verificadas)
    const { data: acessos } = await service.rpc("agente_identificar_acesso", { p_phone: phoneNorm });
    const acessosArr = (acessos || []) as Array<any>;

    if (acessosArr.length === 0) {
        // Número desconhecido = lead (provavelmente veio de anúncio Click-to-WhatsApp).
        // A IA de vendas atende; a conversa fica no inbox pra Izabel ver/assumir.
        if (IA_ATENDE_LEADS) {
            await atenderLead(service, phoneNorm, msg.text, msgId ?? null);
            return jsonResp({ ok: true, status: "lead_atendido" });
        }
        await enviarResposta(
            phoneNorm,
            "Olá! Não te reconheço aqui ainda. Pra usar o Assistente Tatica, peça pra Izabel autorizar seu WhatsApp no sistema. Ela vai te mandar um código de 6 dígitos por aqui — quando chegar, é só responder o código pra ativar.",
        );
        return jsonResp({ ok: true, status: "telefone_nao_autorizado" });
    }

    // Empresas autorizadas + permissões
    const empresas = acessosArr.map((a) => ({
        company_id: a.company_id,
        nome_fantasia: a.nome_empresa,
        permissoes: (a.permissoes || {}) as PermissoesAcesso,
    }));

    const empresa_ativa_id = empresas[0].company_id;
    const primeiroAcesso = acessosArr[0];

    const contexto: ContextoUsuario = {
        user_id: primeiroAcesso.profile_id || null,
        acesso_id: primeiroAcesso.acesso_id,
        full_name: primeiroAcesso.nome,
        email: "",
        empresas,
        empresa_ativa_id,
        phone: phoneNorm,
    };

    // 3. carrega histórico
    const historico = await carregarHistorico(service, contexto.user_id, contexto.acesso_id, contexto.empresa_ativa_id);

    // 3.5. Se veio mídia (foto/PDF), tenta extrair como boleto via OCR
    let textoEnriquecido = msg.text || "";
    if (msg.midia && msgId) {
        await enviarResposta(phoneNorm, "📄 Recebi sua mídia, analisando o boleto...");
        const remoteJid = body?.data?.key?.remoteJid || "";
        const midia = await baixarMidiaEvolution(msgId, remoteJid);
        if (midia) {
            const dadosBoleto = await extrairDadosBoleto(midia.base64, midia.mimetype);
            if (dadosBoleto && (dadosBoleto.valor || dadosBoleto.fornecedor)) {
                const partes: string[] = [];
                if (dadosBoleto.fornecedor) partes.push(`fornecedor=${dadosBoleto.fornecedor}`);
                if (dadosBoleto.valor) partes.push(`valor=${dadosBoleto.valor}`);
                if (dadosBoleto.vencimento) partes.push(`vencimento=${dadosBoleto.vencimento}`);
                if (dadosBoleto.descricao) partes.push(`descricao=${dadosBoleto.descricao}`);
                if (dadosBoleto.codigo_barras) partes.push(`codigo_barras=${dadosBoleto.codigo_barras}`);
                if (dadosBoleto.pagador_nome) partes.push(`pagador_no_boleto=${dadosBoleto.pagador_nome}`);
                if (dadosBoleto.pagador_cpf_cnpj) partes.push(`pagador_cnpj_no_boleto=${dadosBoleto.pagador_cpf_cnpj}`);

                // Verifica se pagador bate com alguma das empresas autorizadas (compara só dígitos)
                let avisoPagador = "";
                if (dadosBoleto.pagador_cpf_cnpj) {
                    const docBoleto = String(dadosBoleto.pagador_cpf_cnpj).replace(/\D/g, "");
                    // Busca CNPJ das empresas que ele pode acessar
                    const { data: empresasComCnpj } = await service
                        .from("companies")
                        .select("id, nome_fantasia, cnpj")
                        .in("id", empresas.map((e) => e.company_id));
                    const empresaDoPagador = (empresasComCnpj || []).find(
                        (c: any) => (c.cnpj || "").replace(/\D/g, "") === docBoleto,
                    );
                    if (!empresaDoPagador) {
                        avisoPagador = `\n\n⚠️ ATENÇÃO: o pagador no boleto (${dadosBoleto.pagador_nome || "?"} - CNPJ ${dadosBoleto.pagador_cpf_cnpj}) NÃO bate com nenhuma das empresas autorizadas pra esse usuário. Esse boleto pode ser de outra empresa. AVISE o usuário explicitamente antes de pedir confirmação pra lançar.`;
                    } else {
                        partes.push(`empresa_do_boleto=${empresaDoPagador.nome_fantasia}`);
                    }
                }

                textoEnriquecido = `[BOLETO ANEXADO PELO EMPRESÁRIO — dados extraídos por OCR]\n${partes.join("\n")}\n\nCaption/texto da mensagem: "${msg.text || "(sem texto)"}"\n\nAja como se o empresário pedisse pra lançar essa CP. Pergunte qual empresa se houver mais de uma (use empresa_do_boleto como sugestão se preencheu). Siga o fluxo normal de lançar_cp.${avisoPagador}`;
            } else {
                textoEnriquecido = `Empresário mandou uma mídia que não consegui identificar como boleto. Caption: "${msg.text || "(sem texto)"}". Pergunte o que ele quer que você faça.`;
            }
        } else {
            textoEnriquecido = `Empresário mandou uma mídia mas não consegui baixar. Avise que tente novamente, ou que mande os dados em texto.`;
        }
    }

    // 4. monta primeira chamada Claude
    const dataAtual = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const contextoSistema = `\n\nCONTEXTO AUTOMÁTICO (não compartilhe IDs com o usuário):\n- nome do empresário: ${contexto.full_name}\n- data atual: ${dataAtual}\n- empresa ativa (id): ${contexto.empresa_ativa_id}\n- empresas disponíveis: ${empresas.map((e: any) => `${e.nome_fantasia} (id=${e.company_id})`).join(" | ")}`;

    const messages: any[] = [
        ...historico,
        { role: "user", content: textoEnriquecido + contextoSistema },
    ];

    // salva msg do user (texto original, sem o contexto enriquecido)
    await salvarMensagem(
        service,
        contexto.user_id,
        contexto.acesso_id,
        contexto.empresa_ativa_id,
        "user",
        msg.midia ? `[mídia ${msg.midia.tipo}] ${msg.text || ""}`.trim() : msg.text,
    );

    // 5. loop tool_use ↔ tool_result até resposta final
    let respostaFinal = "";
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
        let claudeResp: any;
        try {
            claudeResp = await chamarClaude(messages, true);
        } catch (e: any) {
            console.error("Erro Claude:", e?.message);
            await enviarResposta(phoneNorm, "Tive um problema técnico aqui. Tenta de novo em 1 minuto?");
            return jsonResp({ ok: false, error: e?.message }, 500);
        }

        const stopReason = claudeResp.stop_reason;
        const content = claudeResp.content || [];

        // adiciona resposta do assistant ao histórico desta turn
        messages.push({ role: "assistant", content });

        if (stopReason === "tool_use") {
            // Executa cada tool_use e adiciona tool_result
            const toolResults: any[] = [];
            for (const block of content) {
                if (block.type === "tool_use") {
                    const result = await executarTool(block.name, block.input, contexto);
                    toolResults.push({
                        type: "tool_result",
                        tool_use_id: block.id,
                        content: JSON.stringify(result),
                    });
                    // persiste log da tool
                    await salvarMensagem(service, contexto.user_id, contexto.acesso_id, contexto.empresa_ativa_id, "tool", {
                        tool_name: block.name,
                        input: block.input,
                        output: result,
                    });
                }
            }
            messages.push({ role: "user", content: toolResults });
            continue;
        }

        // resposta final
        respostaFinal = content
            .filter((b: any) => b.type === "text")
            .map((b: any) => b.text)
            .join("\n")
            .trim();
        break;
    }

    if (!respostaFinal) {
        respostaFinal = "Hmm, não consegui processar agora. Tenta reescrever a pergunta?";
    }

    // 6. salva resposta e envia
    await salvarMensagem(service, contexto.user_id, contexto.acesso_id, contexto.empresa_ativa_id, "assistant", respostaFinal);
    await enviarResposta(phoneNorm, respostaFinal);

    return jsonResp({ ok: true, response: respostaFinal });
});
