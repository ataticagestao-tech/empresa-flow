// ============================================================
// agente-chat-web — Edge Function (Deno)
// Chat interno do Assistente Tatica, DENTRO do sistema (web).
// Mesmo cérebro do agente-orquestrador (Claude + tools agente-tool-*),
// mas:
//   - identifica o usuário pelo JWT do login (não pelo telefone)
//   - valida a empresa pelo vínculo user_companies
//   - devolve a resposta como JSON pra tela (não envia WhatsApp)
//   - histórico separado por canal='web' em agente_conversas
//
// Chamado pelo front via activeClient.functions.invoke("agente-chat-web",
//   { body: { message, empresa_id } }). O supabase-js anexa o Bearer do
// usuário no Authorization — validamos esse token aqui (verify_jwt=false
// no gateway, validação manual via auth.getUser).
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const ANTHROPIC_MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-6";
const MAX_TOOL_ITERATIONS = 8;
const HISTORICO_LIMITE = 12;
const CANAL = "web";

// ── SYSTEM PROMPT ────────────────────────────────────────────
// Mesmas regras de negócio do agente do WhatsApp (agente-orquestrador),
// adaptado pro chat web: identificação por login e formatação pra tela.
const SYSTEM_PROMPT = `Você é o Assistente Tatica, agente conversacional que opera o sistema Tatica Gestap em nome do usuário, por um chat DENTRO do próprio sistema.

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
- Faturamento usa competência por padrão; caixa quando o usuário falar "que entrou", "recebi de fato"
- Excluir extrato apaga em cascata — confirmar 2x

OVERNIGHT (relatório financeiro diário):
- O Overnight é um resumo financeiro do dia/mês em PDF enviado automaticamente pelo WhatsApp num horário configurável (padrão 18h). Contém: Faturamento do mês (pelas vendas), Despesas do mês (contas a pagar pagas), Resultado do mês, e o Consolidado de Entradas/Saídas do dia e do mês.
- Se o usuário pedir o overnight/relatório do dia agora ("me manda o overnight", "quero o relatório de hoje"), use a tool enviar_overnight — ela manda o PDF pros números já cadastrados no WhatsApp. Avise que vai pros números configurados.
- Horário, números de destino e ativar/desativar o envio se mexe em Configurações > Overnight no sistema (não dá pra mudar por aqui se não for via atualizar_config_overnight). Se a tool disser que não está ativado, oriente a ativar lá.

ESTILO: português brasileiro coloquial, frases curtas, emoji com moderação (✅💰⚠️🚀). NUNCA "estou aqui pra ajudar", "espero ter ajudado", "foi um prazer".

FORMATAÇÃO (chat na tela):
- Pode usar *negrito* (um asterisco) pra destacar credor, valores e cabeçalhos de seção.
- Pra listar contas/itens, use blocos espaçados (uma linha em branco entre itens):
  *Credor* — descrição curta
  R$ valor · venceu/vence DD/MM (⚠️ se vencida)
- Agrupe por seção com cabeçalho em *negrito* + emoji (🔴 vencidas, 🟡 a vencer). Não numere itens.
- Listas longas: mostre os principais (uns 8-10), diga quantos faltam e ofereça filtrar.
- Valores sempre R$ com vírgula decimal (R$ 1.850,00).
- Não use tabelas nem títulos com # — o chat renderiza texto simples com quebras de linha.

FLUXO DE LANÇAR CP ("paguei X de Y", "lança CP de Z", "salário do João"):
1. Identifique do texto: valor, descrição/o-que-é, data (vencimento — default hoje se ele disse "paguei")
2. Identifique o TIPO de credor pelo contexto:
   - Empresa/serviço (luz, aluguel, fornecedor, mercadoria, "Equatorial", "Cielo") → chame buscar_fornecedor
   - Funcionário (salário, adiantamento, comissão, "salário do João", "férias da Maria") → chame buscar_funcionario
   - Sócio/administrador (pró-labore, distribuição de lucros, retirada, "sócio Carlos") → chame buscar_socio
   - Se ambíguo (só o nome, sem contexto), tente PRIMEIRO buscar_socio, depois buscar_funcionario, depois buscar_fornecedor
3. Se achou 1 → use ele (lembre o credor_tipo='funcionario' ou 'fornecedor'). Se achou 2+ → pergunte qual. Se 0 (e for fornecedor) → peça nome completo + CPF/CNPJ e crie via criar_fornecedor. Se 0 (e for funcionário) → NÃO crie automaticamente, peça pra cadastrar no sistema antes
4. Chame listar_categorias com termo do que ele disse pra achar categoria. Se não achar, pode lançar com categoria_id=null (vai usar "Despesas Diversas" automaticamente). Pra salário/folha: termo "salário" ou "folha"
5. CONFIRME antes de lançar: "Lançar CP de R$ X pra [credor], vence dia [data], categoria [nome]? Confirma?"
6. Se ele responder SIM/confirma/pode/ok → chame lancar_cp com credor_id, credor_nome E credor_tipo
7. Avise que ficou EM ABERTO: "Lancei a CP em aberto. Pra dar baixa quando pagar, manda 'paguei a conta da [credor]'."

FLUXO DE BAIXA / PAGAMENTO ("paguei a conta da X", "quitei o aluguel", "paguei o salário do João", "dei baixa na luz"):
1. Chame listar_cp_abertas com termo = credor/descrição do que ele falou
2. Se achou 1 CP → use ela. Se achou 2+ → liste (credor, valor, vencimento) e pergunte qual. Se 0 → avise que não tem conta em aberto com esse nome (ofereça lançar com lancar_cp)
3. Pergunte de qual conta bancária saiu o pagamento (chame listar_contas_bancarias; se só tem uma, use direto). Data: default hoje
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
- "muda o overnight pras 19h", "adiciona/troca o número que recebe o overnight", "liga/desliga o overnight" → atualizar_config_overnight (confirme antes). Mudar destinos SUBSTITUI a lista — se for adicionar, primeiro descubra os números atuais.

CADASTRAR FUNCIONÁRIO:
- "cadastra o funcionário João", "novo funcionário Maria salário 2000" → criar_funcionario. SÓ CLT/temporário/estágio. Se for PJ/autônomo, é criar_fornecedor. Peça o nome (e CPF/salário se tiver). Confirme antes.

EXCLUIR / EDITAR LANÇAMENTO:
- "apaga a conta que lancei errado" → ache com listar_cp_abertas/listar_cr_abertas, CONFIRME (SIM/NÃO), chame excluir_lancamento. Só em aberto; se já foi pago, avise que precisa estorno no sistema.
- "corrige o valor/vencimento/descrição daquela conta" → ache o id, confirme, chame editar_lancamento (só em aberto).

DRE / FLUXO DE CAIXA:
- "me mostra o DRE", "qual o resultado do mês" → gerar_dre. Resuma as linhas principais: *Receita Líquida*, *Lucro Bruto*, *Resultado Operacional*, *Resultado Líquido* (uma por linha).
- "me mostra o fluxo de caixa", "como tá o caixa" → gerar_fluxo_caixa. Resuma entradas/saídas por atividade e o resultado.
- Período default é o mês corrente; se pedir outro, resolva as datas antes.

IMPORTANTE:
- CP é lançada SEMPRE em aberto, mesmo se ele disse "paguei". Lançamento e baixa são separados: se ele manda "paguei a conta da X" e a CP JÁ existe em aberto, vá direto pro FLUXO DE BAIXA. Se NÃO existe, lance primeiro e depois pode dar baixa.
- NÃO precisa perguntar conta bancária no lançamento (só na baixa)
- Pra FOLHA DE PAGAMENTO formal (mês inteiro de vários funcionários), peça pra usar a tela de Folha no sistema, NÃO lance CP avulsa
- Se ele já passou tudo numa única mensagem, pule perguntas e confirme tudo de uma vez

IMAGENS (o usuário pode anexar uma foto no chat):
- Nota fiscal / recibo / boleto / cupom de DESPESA → leia valor, fornecedor/credor, vencimento e descrição e siga o FLUXO DE LANÇAR CP. Se for um comprovante de algo que ele vai RECEBER, use o fluxo de CR.
- Documento de cadastro (cartão CNPJ, RG, ficha, contrato) → extraia nome/razão social e CPF/CNPJ e siga criar_fornecedor (PJ/empresa) ou criar_funcionario (CLT/temporário/estágio).
- Folha de ponto ou planilha manuscrita → leia e resuma os dados (nome, dias, horas/faltas). Pra registrar ponto formal de verdade, oriente a usar a tela de Ponto Eletrônico no sistema.
- SEMPRE diga em texto o que você leu na imagem (valores, nomes, datas) ANTES de pedir confirmação, pra ele conferir se a leitura ficou certa.
- Se a imagem estiver ilegível ou não for nada disso, descreva o que vê e pergunte o que ele quer fazer. Nunca invente dados que não dá pra ler.

Use ferramentas quando precisar de dados reais ou para executar ações. Quando o usuário só conversar ("oi", "tudo bem"), responda sem ferramenta.`;

// ── TOOLS DEFINITIONS (mesmas do agente-orquestrador) ──
const TOOLS = [
    { name: "consultar_saldo", description: "Retorna saldo atual de uma ou todas as contas bancárias da empresa.", input_schema: { type: "object", properties: { empresa_id: { type: "string" }, conta_id: { type: "string", description: "Null = todas as contas" } }, required: ["empresa_id"] } },
    { name: "consultar_faturamento", description: "Retorna o faturamento total da empresa em um período. Regime competência (default) soma vendas confirmadas por data_venda; regime caixa soma recebimentos por data_pagamento. Se data_inicio/data_fim omitidos, usa o mês corrente.", input_schema: { type: "object", properties: { empresa_id: { type: "string" }, data_inicio: { type: "string", description: "YYYY-MM-DD. Opcional. Default: 1º dia do mês corrente." }, data_fim: { type: "string", description: "YYYY-MM-DD. Opcional. Default: último dia do mês corrente." }, regime: { type: "string", enum: ["competencia", "caixa"], description: "Default: competencia" } }, required: ["empresa_id"] } },
    { name: "buscar_fornecedor", description: "Busca fornecedor (empresa/PJ) por nome ou CPF/CNPJ (fuzzy). Use quando o usuário falar em pagamento a empresa: 'paguei a Equatorial', 'aluguel', 'mercadoria do fornecedor X'. Retorna até 10 resultados.", input_schema: { type: "object", properties: { empresa_id: { type: "string" }, termo: { type: "string", description: "Nome, parte do nome, CPF ou CNPJ" } }, required: ["empresa_id", "termo"] } },
    { name: "buscar_funcionario", description: "Busca funcionário por nome ou CPF (fuzzy). Use quando o usuário falar em pagamento a pessoa física da empresa: 'paguei salário do João', 'adiantamento pro Carlos'. Retorna até 10 resultados ativos.", input_schema: { type: "object", properties: { empresa_id: { type: "string" }, termo: { type: "string", description: "Nome, parte do nome ou CPF" } }, required: ["empresa_id", "termo"] } },
    { name: "buscar_socio", description: "Busca sócio/administrador da empresa por nome ou CPF. Use quando falar em pagamento que envolve sócio: 'distribuí lucro pro Carlos sócio', 'pro-labore do João', 'retirada da Ana administradora'.", input_schema: { type: "object", properties: { empresa_id: { type: "string" }, termo: { type: "string", description: "Nome, parte do nome ou CPF" } }, required: ["empresa_id", "termo"] } },
    { name: "criar_fornecedor", description: "Cria fornecedor novo. SÓ chame depois de obter razao_social E cpf_cnpj. NUNCA invente CPF/CNPJ — peça explicitamente.", input_schema: { type: "object", properties: { empresa_id: { type: "string" }, razao_social: { type: "string" }, cpf_cnpj: { type: "string", description: "Obrigatório. Peça se não souber." }, nome_fantasia: { type: "string" } }, required: ["empresa_id", "razao_social", "cpf_cnpj"] } },
    { name: "listar_contas_bancarias", description: "Lista contas bancárias ativas da empresa. Use pra escolher conta de origem quando há mais de uma.", input_schema: { type: "object", properties: { empresa_id: { type: "string" } }, required: ["empresa_id"] } },
    { name: "listar_categorias", description: "Lista categorias do plano de contas. Use pra achar a categoria certa antes de lançar CP. Se nenhuma bater, vai usar 'Despesas Diversas'.", input_schema: { type: "object", properties: { empresa_id: { type: "string" }, tipo: { type: "string", enum: ["receita", "despesa"], description: "Default: despesa" }, termo: { type: "string", description: "Filtro por nome. Opcional." } }, required: ["empresa_id"] } },
    { name: "lancar_cp", description: "Lança Conta a Pagar EM ABERTO (status='aberto'). NÃO marca como paga. SEMPRE confirme antes (valor, credor, vencimento, categoria).", input_schema: { type: "object", properties: { empresa_id: { type: "string" }, credor_id: { type: "string", description: "UUID do credor. Null se não cadastrado." }, credor_tipo: { type: "string", enum: ["fornecedor", "funcionario", "socio", "outro"], description: "Default: fornecedor." }, credor_nome: { type: "string" }, descricao: { type: "string" }, valor: { type: "number", description: "Valor em reais (1500.50)" }, data_vencimento: { type: "string", description: "YYYY-MM-DD" }, categoria_id: { type: "string", description: "UUID. Null = 'Despesas Diversas'." }, centro_custo_id: { type: "string" }, observacao: { type: "string" } }, required: ["empresa_id", "credor_nome", "descricao", "valor", "data_vencimento"] } },
    { name: "listar_cp_abertas", description: "Lista Contas a Pagar em aberto/parcial/vencidas. Use pra ACHAR a conta a dar baixa. Filtra por credor/descrição via 'termo'. Retorna cp_id, credor, descrição, saldo e vencimento.", input_schema: { type: "object", properties: { empresa_id: { type: "string" }, termo: { type: "string", description: "Filtra por credor ou descrição. Opcional." } }, required: ["empresa_id"] } },
    { name: "baixar_cp", description: "Dá baixa (registra pagamento) de uma CP em aberto — marca paga e cria a movimentação. Ache antes com listar_cp_abertas e pergunte de qual conta saiu. CONFIRME antes.", input_schema: { type: "object", properties: { empresa_id: { type: "string" }, cp_id: { type: "string" }, conta_bancaria_id: { type: "string" }, data_pagamento: { type: "string", description: "YYYY-MM-DD. Default hoje." }, valor_pago: { type: "number", description: "Default = saldo restante." }, forma_pagamento: { type: "string", description: "pix, dinheiro, transferencia, boleto, cartao. Default pix." } }, required: ["empresa_id", "cp_id", "conta_bancaria_id"] } },
    { name: "listar_cr_abertas", description: "Lista Contas a Receber em aberto/parcial/vencidas. Use pra ACHAR o recebimento. Filtra por pagador/descrição via 'termo'. Retorna cr_id, pagador, saldo e vencimento.", input_schema: { type: "object", properties: { empresa_id: { type: "string" }, termo: { type: "string", description: "Filtra por pagador ou descrição. Opcional." } }, required: ["empresa_id"] } },
    { name: "baixar_cr", description: "Dá baixa (registra recebimento) de uma CR em aberto — marca recebida e lança a entrada. Ache antes com listar_cr_abertas e pergunte em qual conta caiu. CONFIRME antes.", input_schema: { type: "object", properties: { empresa_id: { type: "string" }, cr_id: { type: "string" }, conta_bancaria_id: { type: "string" }, data_pagamento: { type: "string", description: "YYYY-MM-DD. Default hoje." }, valor_pago: { type: "number", description: "Default = saldo restante." }, forma_recebimento: { type: "string", description: "pix, dinheiro, transferencia, boleto, cartao. Default pix." } }, required: ["empresa_id", "cr_id", "conta_bancaria_id"] } },
    { name: "lancar_cr", description: "Lança uma Conta a Receber EM ABERTO. Use pra 'fulano vai me pagar X dia Y'. Fica em aberto até baixar_cr. CONFIRME antes.", input_schema: { type: "object", properties: { empresa_id: { type: "string" }, pagador_nome: { type: "string" }, valor: { type: "number" }, data_vencimento: { type: "string", description: "YYYY-MM-DD." }, descricao: { type: "string" }, pagador_cpf_cnpj: { type: "string" }, categoria_id: { type: "string", description: "UUID de receita (listar_categorias tipo=receita)." } }, required: ["empresa_id", "pagador_nome", "valor", "data_vencimento"] } },
    { name: "listar_vendas", description: "Lista vendas individuais de um período — complementa consultar_faturamento (que é só o total). Read-only.", input_schema: { type: "object", properties: { empresa_id: { type: "string" }, data_inicio: { type: "string", description: "YYYY-MM-DD. Default 1º dia do mês." }, data_fim: { type: "string", description: "YYYY-MM-DD. Default hoje." }, termo: { type: "string", description: "Filtra por cliente. Opcional." } }, required: ["empresa_id"] } },
    { name: "editar_fornecedor", description: "Edita campos de um fornecedor existente. Use buscar_fornecedor antes pra pegar o fornecedor_id. Só atualiza campos informados. CONFIRME antes.", input_schema: { type: "object", properties: { empresa_id: { type: "string" }, fornecedor_id: { type: "string" }, razao_social: { type: "string" }, nome_fantasia: { type: "string" }, cpf_cnpj: { type: "string" }, email: { type: "string" }, telefone: { type: "string" } }, required: ["empresa_id", "fornecedor_id"] } },
    { name: "atualizar_config_overnight", description: "Ajusta a configuração do Overnight: horário, números que recebem e ligar/desligar. CONFIRME antes. (A 1ª config ainda precisa ser feita na tela Configurações.)", input_schema: { type: "object", properties: { empresa_id: { type: "string" }, horario: { type: "string", description: "HH:MM. Opcional." }, destinos: { type: "array", items: { type: "string" }, description: "Substitui a lista atual. Opcional." }, whatsapp_ativo: { type: "boolean", description: "true liga, false desliga. Opcional." }, mensagem: { type: "string" } }, required: ["empresa_id"] } },
    { name: "criar_funcionario", description: "Cadastra um funcionário novo. SÓ CLT, temporário ou estágio — PJ/autônomo é fornecedor (criar_fornecedor). CONFIRME antes.", input_schema: { type: "object", properties: { empresa_id: { type: "string" }, nome: { type: "string" }, cpf: { type: "string" }, cargo: { type: "string" }, salario: { type: "number" }, tipo_contrato: { type: "string", enum: ["clt", "temporario", "estagio"], description: "Default clt." }, data_admissao: { type: "string", description: "YYYY-MM-DD." } }, required: ["empresa_id", "nome"] } },
    { name: "excluir_lancamento", description: "Exclui (soft-delete) uma CP ou CR que ainda está EM ABERTO. Pega o id com listar_cp_abertas/listar_cr_abertas. Já pago não dá — precisa estorno. CONFIRME (SIM/NÃO) antes.", input_schema: { type: "object", properties: { empresa_id: { type: "string" }, tipo: { type: "string", enum: ["cp", "cr"] }, id: { type: "string" } }, required: ["empresa_id", "tipo", "id"] } },
    { name: "editar_lancamento", description: "Edita uma CP/CR EM ABERTO (descrição, valor, vencimento, categoria). Pega o id com listar_cp_abertas/listar_cr_abertas. Pago não dá. CONFIRME antes.", input_schema: { type: "object", properties: { empresa_id: { type: "string" }, tipo: { type: "string", enum: ["cp", "cr"] }, id: { type: "string" }, descricao: { type: "string" }, valor: { type: "number" }, data_vencimento: { type: "string", description: "YYYY-MM-DD" }, categoria_id: { type: "string" } }, required: ["empresa_id", "tipo", "id"] } },
    { name: "gerar_dre", description: "Gera o DRE de um período. Resuma as linhas principais (Receita Líquida, Lucro Bruto, Resultado Operacional, Resultado Líquido).", input_schema: { type: "object", properties: { empresa_id: { type: "string" }, data_inicio: { type: "string", description: "YYYY-MM-DD. Default 1º dia do mês." }, data_fim: { type: "string", description: "YYYY-MM-DD. Default hoje." } }, required: ["empresa_id"] } },
    { name: "gerar_fluxo_caixa", description: "Gera a DFC (entradas/saídas por atividade) de um período. Resuma as principais linhas.", input_schema: { type: "object", properties: { empresa_id: { type: "string" }, data_inicio: { type: "string", description: "YYYY-MM-DD. Default 1º dia do mês." }, data_fim: { type: "string", description: "YYYY-MM-DD. Default hoje." } }, required: ["empresa_id"] } },
    { name: "reenviar_overnight", description: "Gera o Overnight de uma DATA específica e manda o PDF pro WhatsApp configurado. Resolva a data relativa antes (YYYY-MM-DD).", input_schema: { type: "object", properties: { empresa_id: { type: "string" }, data: { type: "string", description: "YYYY-MM-DD." } }, required: ["empresa_id", "data"] } },
    { name: "enviar_overnight", description: "Dispara AGORA o Overnight (PDF) por WhatsApp pros números configurados da empresa. Use pra 'me manda o overnight', 'manda o relatório do dia'. Se não estiver ativado, a tool avisa.", input_schema: { type: "object", properties: { empresa_id: { type: "string" } }, required: ["empresa_id"] } },
];

// ── tipos ────────────────────────────────────────────────────
interface ContextoUsuario {
    user_id: string;
    full_name: string;
    empresas: Array<{ company_id: string; nome_fantasia: string }>;
    empresa_ativa_id: string | null;
}

// ── helpers ──────────────────────────────────────────────────
function jsonResp(payload: unknown, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

async function carregarHistorico(
    service: ReturnType<typeof createClient>,
    userId: string,
    companyId: string | null,
) {
    let q = service
        .from("agente_conversas")
        .select("role, content, created_at")
        .eq("user_id", userId)
        .eq("canal", CANAL)
        .order("created_at", { ascending: false })
        .limit(HISTORICO_LIMITE * 2);
    if (companyId) q = q.eq("company_id", companyId);
    const { data } = await q;
    if (!data) return [];
    // Claude só aceita roles user/assistant; role='tool' é log interno (descarta no replay).
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
    userId: string,
    companyId: string | null,
    role: string,
    content: unknown,
    tokens?: { input?: number; output?: number },
) {
    const { error } = await service.from("agente_conversas").insert({
        user_id: userId,
        company_id: companyId,
        canal: CANAL,
        role,
        content,
        tokens_input: tokens?.input ?? null,
        tokens_output: tokens?.output ?? null,
    });
    if (error) console.error("[chat-web] salvarMensagem falhou:", error.message);
}

async function executarTool(
    name: string,
    input: Record<string, unknown>,
    contexto: ContextoUsuario,
): Promise<unknown> {
    // Injeta empresa ativa se a tool exige empresa_id e ela não veio
    if (!input.empresa_id && contexto.empresa_ativa_id) {
        input.empresa_id = contexto.empresa_ativa_id;
    }
    // Valida que o user pode acessar a empresa pedida (vínculo user_companies)
    const empresaCtx = contexto.empresas.find((e) => e.company_id === input.empresa_id);
    if (input.empresa_id && !empresaCtx) {
        return { error: "Você não tem acesso a essa empresa." };
    }

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
        // As tools validam o acesso à empresa via agente_pode_acessar_empresa(user_id, ...).
        "x-agente-user-id": contexto.user_id,
    };

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

async function chamarClaude(messages: any[]) {
    const systemBlocks = [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }];
    const tools = TOOLS.map((t, i) =>
        i === TOOLS.length - 1 ? { ...t, cache_control: { type: "ephemeral" } } : t
    );

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

// ── handler principal ────────────────────────────────────────
serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }
    if (req.method !== "POST") {
        return jsonResp({ error: "Método não permitido" }, 405);
    }

    // 1. Autentica o usuário pelo Bearer do login (verify_jwt=false no gateway).
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
        return jsonResp({ error: "Não autenticado." }, 401);
    }
    const authClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) {
        return jsonResp({ error: "Sessão inválida. Faça login de novo." }, 401);
    }

    // 2. Lê o corpo
    let payload: {
        message?: string;
        empresa_id?: string;
        image?: { data?: string; media_type?: string };
    };
    try {
        payload = await req.json();
    } catch {
        return jsonResp({ error: "JSON inválido" }, 400);
    }
    const message = (payload.message || "").trim();
    const image =
        payload.image && typeof payload.image.data === "string" && payload.image.data.length > 0
            ? { data: payload.image.data, media_type: payload.image.media_type || "image/jpeg" }
            : null;
    if (!message && !image) {
        return jsonResp({ error: "Mensagem vazia" }, 400);
    }
    // Guarda contra payload absurdo (base64 ~ 1.37x os bytes; ~10MB de imagem).
    if (image && image.data.length > 14_000_000) {
        return jsonResp({ response: "Essa imagem ficou grande demais. Manda uma versão menor?" });
    }

    const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // 3. Carrega as empresas do usuário (vínculo user_companies)
    const { data: vinculos } = await service
        .from("user_companies")
        .select("company_id, is_default, company:companies(id, nome_fantasia, razao_social, is_active)")
        .eq("user_id", user.id);

    const empresas = (vinculos || [])
        .map((v: any) => v.company)
        .filter((c: any) => c && c.is_active)
        .map((c: any) => ({ company_id: c.id, nome_fantasia: c.nome_fantasia || c.razao_social || "Empresa" }));

    if (empresas.length === 0) {
        return jsonResp({
            response: "Você ainda não está vinculado a nenhuma empresa ativa. Fale com o administrador.",
        });
    }

    // 4. Empresa ativa = a selecionada no front (validada) ou a primeira
    let empresaAtivaId = payload.empresa_id || null;
    if (empresaAtivaId && !empresas.some((e) => e.company_id === empresaAtivaId)) {
        return jsonResp({ error: "Você não tem acesso a essa empresa." }, 403);
    }
    if (!empresaAtivaId) empresaAtivaId = empresas[0].company_id;

    const nomeUsuario =
        (user.user_metadata?.full_name as string) ||
        (user.user_metadata?.name as string) ||
        (user.email ? user.email.split("@")[0] : "Usuário");

    const contexto: ContextoUsuario = {
        user_id: user.id,
        full_name: nomeUsuario,
        empresas,
        empresa_ativa_id: empresaAtivaId,
    };

    // 5. Histórico + contexto automático
    const historico = await carregarHistorico(service, user.id, empresaAtivaId);

    const dataAtual = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const contextoSistema = `\n\nCONTEXTO AUTOMÁTICO (não compartilhe IDs com o usuário):\n- nome do usuário: ${contexto.full_name}\n- data atual: ${dataAtual}\n- empresa ativa (id): ${contexto.empresa_ativa_id}\n- empresas disponíveis: ${empresas.map((e) => `${e.nome_fantasia} (id=${e.company_id})`).join(" | ")}`;

    // Quando vem imagem, o conteúdo da mensagem do user vira um array com o
    // bloco de visão + o texto (caption/contexto). Sem imagem, segue string.
    const textoUser =
        (message || "Segue a imagem anexada. Veja o que dá pra fazer com ela.") + contextoSistema;
    const userContent: unknown = image
        ? [
            { type: "image", source: { type: "base64", media_type: image.media_type, data: image.data } },
            { type: "text", text: textoUser },
        ]
        : message + contextoSistema;

    const messages: any[] = [
        ...historico,
        { role: "user", content: userContent },
    ];

    // salva msg do user (texto original, sem o contexto)
    await salvarMensagem(
        service,
        user.id,
        empresaAtivaId,
        "user",
        image ? `[imagem] ${message}`.trim() : message,
    );

    // 6. loop tool_use ↔ tool_result até resposta final
    let respostaFinal = "";
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
        let claudeResp: any;
        try {
            claudeResp = await chamarClaude(messages);
        } catch (e: any) {
            const detalhe = String(e?.message || e).slice(0, 400);
            console.error("[chat-web] Erro Claude:", detalhe);
            // DIAGNÓSTICO TEMPORÁRIO: surfaca o motivo técnico no chat.
            return jsonResp({ response: `⚠️ Erro técnico: ${detalhe}`, erro_tecnico: detalhe });
        }

        const stopReason = claudeResp.stop_reason;
        const content = claudeResp.content || [];
        messages.push({ role: "assistant", content });

        if (stopReason === "tool_use") {
            const toolResults: any[] = [];
            for (const block of content) {
                if (block.type === "tool_use") {
                    const result = await executarTool(block.name, block.input, contexto);
                    toolResults.push({
                        type: "tool_result",
                        tool_use_id: block.id,
                        content: JSON.stringify(result),
                    });
                    await salvarMensagem(service, user.id, empresaAtivaId, "tool", {
                        tool_name: block.name,
                        input: block.input,
                        output: result,
                    });
                }
            }
            messages.push({ role: "user", content: toolResults });
            continue;
        }

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

    await salvarMensagem(service, user.id, empresaAtivaId, "assistant", respostaFinal);

    return jsonResp({ ok: true, response: respostaFinal });
});
