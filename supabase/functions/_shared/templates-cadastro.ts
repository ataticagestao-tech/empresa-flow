/** Templates de mensagem inicial para solicitacao de cadastro via WhatsApp.
 *
 *  Os campos faltando direcionam quais perguntas serao feitas inicialmente.
 *  Quando todos os campos sao opcionais, o template e mais curto.
 */

export interface TemplateContext {
    tipo: "funcionario" | "fornecedor";
    nome_destinatario: string;
    nome_empresa: string;
    campos_faltando: string[];
    permite_skip: boolean;
}

const LABELS_FUNCIONARIO: Record<string, string> = {
    nome_completo: "Nome completo",
    cpf: "CPF",
    rg: "RG",
    data_nascimento: "Data de nascimento",
    endereco: "Endereço (rua, número, bairro, cidade, CEP)",
    pix: "Chave PIX",
    banco: "Banco / Agência / Conta",
    email: "Email",
    pis: "PIS/NIS",
};

const LABELS_FORNECEDOR: Record<string, string> = {
    cnpj: "CNPJ",
    razao_social: "Razão social",
    nome_fantasia: "Nome fantasia",
    endereco: "Endereço (rua, número, bairro, cidade, CEP)",
    email: "Email",
    telefone: "Telefone",
    pix: "Chave PIX",
    banco: "Banco / Agência / Conta",
};

export function renderTemplateInicial(ctx: TemplateContext): string {
    const labels = ctx.tipo === "funcionario" ? LABELS_FUNCIONARIO : LABELS_FORNECEDOR;

    const linhasCampos = ctx.campos_faltando
        .map((c) => `${labels[c] ?? c}:`)
        .join("\n");

    const docObrigatorio = ctx.tipo === "funcionario" ? "CPF" : "CNPJ";
    const skipHint = ctx.permite_skip
        ? `\n\n⚠️ Apenas o ${docObrigatorio} é obrigatório. Demais campos pode pular respondendo "não sei" ou "pular".`
        : `\n\n⚠️ Todos os campos são obrigatórios.`;

    if (ctx.tipo === "funcionario") {
        return [
            `Olá ${ctx.nome_destinatario}! 👋`,
            `A *${ctx.nome_empresa}* precisa atualizar seus dados cadastrais.`,
            ``,
            `Você pode responder de 3 formas:`,
            `📝 Texto: copie e preencha o formulário abaixo`,
            `📸 Foto: envie foto do RG/CNH + comprovante de residência`,
            `📄 PDF: envie PDF dos documentos`,
            ``,
            `Se preferir texto, copie e preencha:`,
            ``,
            linhasCampos,
            skipHint,
            ``,
            `_Esta solicitação expira em 7 dias._`,
        ].join("\n");
    }

    // Fornecedor
    return [
        `Olá! A *${ctx.nome_empresa}* precisa cadastrar/atualizar os dados de *${ctx.nome_destinatario}*.`,
        ``,
        `Você pode enviar:`,
        `📸 Foto do cartão CNPJ (mais rápido)`,
        `📝 Ou preencher abaixo:`,
        ``,
        linhasCampos,
        skipHint,
        ``,
        `_Esta solicitação expira em 7 dias._`,
    ].join("\n");
}

/** Campos default para cada tipo */
export function camposObrigatoriosDefault(tipo: "funcionario" | "fornecedor"): string[] {
    return tipo === "funcionario" ? ["cpf"] : ["cnpj"];
}

export function camposPedidosDefault(tipo: "funcionario" | "fornecedor"): string[] {
    return tipo === "funcionario"
        ? ["nome_completo", "cpf", "rg", "data_nascimento", "endereco", "pix", "banco"]
        : ["cnpj", "razao_social", "nome_fantasia", "endereco", "email", "telefone", "pix", "banco"];
}

/** Computa quais campos estao faltando no registro atual (employees/suppliers).
 *  Recebe o registro carregado e retorna lista de campos do dominio cadastro.
 */
export function camposFaltandoDoRegistro(
    tipo: "funcionario" | "fornecedor",
    registro: Record<string, any> | null,
): string[] {
    const todosCampos = camposPedidosDefault(tipo);
    if (!registro) return todosCampos;

    const mapping: Record<string, string[]> = tipo === "funcionario"
        ? {
            nome_completo: ["name"],
            cpf: ["cpf"],
            rg: ["rg"],
            data_nascimento: ["data_nascimento"],
            endereco: ["endereco", "logradouro", "rua"], // employees nao tem endereco por padrao
            pix: ["chave_pix_folha"],
            banco: ["banco_folha", "agencia_folha", "conta_folha"],
            email: ["email"],
            pis: ["pis"],
        }
        : {
            cnpj: ["cpf_cnpj"],
            razao_social: ["razao_social"],
            nome_fantasia: ["nome_fantasia"],
            endereco: ["endereco_logradouro"],
            email: ["email"],
            telefone: ["telefone", "celular"],
            pix: ["dados_bancarios_pix"],
            banco: ["dados_bancarios_banco", "dados_bancarios_agencia", "dados_bancarios_conta"],
        };

    return todosCampos.filter((campo) => {
        const colunas = mapping[campo] ?? [campo];
        // campo "faltando" = TODAS as colunas mapeadas estao nulas/vazias
        return colunas.every((col) => {
            const v = registro[col];
            return v === null || v === undefined || v === "";
        });
    });
}

/** Gera mensagem perguntando um campo especifico (follow-up).
 *  Quando `tentativa_anterior_falhou`, inclui hint amigavel.
 */
export function perguntaPorCampo(
    campo: string,
    tipo: "funcionario" | "fornecedor",
    valorRecebidoInvalido?: string,
    mensagemErro?: string,
): string {
    const labels = tipo === "funcionario" ? LABELS_FUNCIONARIO : LABELS_FORNECEDOR;
    const label = labels[campo] ?? campo;

    const exemplos: Record<string, string> = {
        cpf: "Ex: 123.456.789-00 ou 12345678900",
        cnpj: "Ex: 12.345.678/0001-90 ou 12345678000190",
        rg: "Ex: 12.345.678-9",
        data_nascimento: "Ex: 15/03/1990",
        endereco: "Ex: Rua das Flores, 123, Centro, São Paulo, SP, 01234-567",
        pix: "Pode ser CPF, CNPJ, email, telefone ou chave aleatória",
        banco: "Ex: Banco do Brasil, agência 1234, conta 56789-0",
        email: "Ex: nome@email.com",
        telefone: "Ex: (11) 99999-8888",
        pis: "Número do PIS/NIS (11 dígitos)",
        razao_social: "Razão social como consta no cartão CNPJ",
        nome_fantasia: "Nome fantasia (opcional)",
        nome_completo: "Nome completo como consta no RG/CNH",
    };

    const exemplo = exemplos[campo] ?? "";

    if (valorRecebidoInvalido) {
        const motivo = mensagemErro ? ` (${mensagemErro})` : "";
        return [
            `O valor que você enviou para *${label}* parece inválido${motivo}.`,
            `Pode mandar de novo?`,
            exemplo ? `${exemplo}` : "",
        ].filter(Boolean).join("\n\n");
    }

    return [
        `Agora preciso de: *${label}*`,
        exemplo ? `_${exemplo}_` : "",
        `(ou responda *pular* se não souber)`,
    ].filter(Boolean).join("\n");
}

/** Mensagem final quando todos campos obrigatorios sao coletados */
export function mensagemConclusaoSucesso(nomeEmpresa: string): string {
    return [
        `✅ Recebemos seus dados!`,
        ``,
        `A *${nomeEmpresa}* vai conferir e confirmar seu cadastro em breve.`,
        `Obrigado! 🙏`,
    ].join("\n");
}

/** Mensagem quando o bot desiste apos 2 tentativas */
export function mensagemRequerRevisao(nomeEmpresa: string): string {
    return [
        `Recebemos o que você enviou.`,
        ``,
        `A *${nomeEmpresa}* vai te procurar para completar o cadastro pessoalmente.`,
        `Obrigado!`,
    ].join("\n");
}

/** Mensagem de aviso quando um campo OBRIGATORIO foi pulado (nao deixa pular) */
export function mensagemCampoObrigatorio(campo: string, tipo: "funcionario" | "fornecedor"): string {
    const labels = tipo === "funcionario" ? LABELS_FUNCIONARIO : LABELS_FORNECEDOR;
    const label = labels[campo] ?? campo;
    return [
        `O *${label}* é obrigatório, não posso seguir sem ele.`,
        `Pode me mandar, por favor?`,
    ].join("\n\n");
}
