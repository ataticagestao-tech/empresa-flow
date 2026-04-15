
import * as z from "zod";

// Definição do Schema Unificado de Clientes
// Mantendo compatibilidade com os campos existentes do banco de dados (Snake Case)

export const ClientSchema = z.object({
    // Identificação Básica
    tipo_pessoa: z.enum(["PF", "PJ"]),
    razao_social: z.string().min(1, "Razão social é obrigatória"),
    nome_fantasia: z.string().optional(),
    cpf_cnpj: z.string().optional().or(z.literal("")),
    category_id: z.string().optional(),

    // Contato
    contato_nome: z.string().optional(),
    email: z.string().nullish(),
    telefone: z.string().min(1, "Telefone obrigatório"),
    telefone_2: z.string().optional(),
    celular: z.string().optional(),
    fax: z.string().optional(),
    website: z.string().optional(),

    // Endereço (todos opcionais, aceitam null do banco)
    cep: z.string().nullish(),
    endereco_logradouro: z.string().nullish(),
    endereco_numero: z.string().nullish(),
    endereco_complemento: z.string().nullish(),
    endereco_bairro: z.string().nullish(),
    endereco_cidade: z.string().nullish(),
    endereco_estado: z.string().nullish(),

    // Fiscal
    inscricao_estadual: z.string().optional(),
    inscricao_municipal: z.string().optional(),
    inscricao_suframa: z.string().optional(),
    cnae: z.string().optional(),
    tipo_atividade: z.string().optional(),
    optante_simples: z.boolean().default(false),
    produtor_rural: z.boolean().default(false),
    contribuinte: z.boolean().default(true),

    // Observações
    observacoes: z.string().optional(),
    observacoes_internas: z.string().optional(),

    // Dados Bancários
    dados_bancarios_banco: z.string().optional(),
    dados_bancarios_agencia: z.string().optional(),
    dados_bancarios_conta: z.string().optional(),
    dados_bancarios_pix: z.string().optional(),
    dados_bancarios_titular_cpf_cnpj: z.string().optional(),
    dados_bancarios_titular_nome: z.string().optional(),
});

// Tipagem Inferida para uso no Frontend (React Hook Form) e Backend
export type ClientFormValues = z.infer<typeof ClientSchema>;
