
import * as z from "zod";

// Definição do Schema Unificado de Clientes
// Mantendo compatibilidade com os campos existentes do banco de dados (Snake Case)
// Todos os campos opcionais usam .nullish() para aceitar null vindo do Supabase

export const ClientSchema = z.object({
    // Identificação Básica
    tipo_pessoa: z.enum(["PF", "PJ"]),
    razao_social: z.string().min(1, "Razão social é obrigatória"),
    nome_fantasia: z.string().nullish(),
    cpf_cnpj: z.string().nullish(),
    category_id: z.string().nullish(),

    // Contato
    contato_nome: z.string().nullish(),
    email: z.string().nullish(),
    telefone: z.string().nullish(),
    telefone_2: z.string().nullish(),
    celular: z.string().nullish(),
    fax: z.string().nullish(),
    website: z.string().nullish(),

    // Endereço
    cep: z.string().nullish(),
    endereco_logradouro: z.string().nullish(),
    endereco_numero: z.string().nullish(),
    endereco_complemento: z.string().nullish(),
    endereco_bairro: z.string().nullish(),
    endereco_cidade: z.string().nullish(),
    endereco_estado: z.string().nullish(),

    // Fiscal
    inscricao_estadual: z.string().nullish(),
    inscricao_municipal: z.string().nullish(),
    inscricao_suframa: z.string().nullish(),
    cnae: z.string().nullish(),
    tipo_atividade: z.string().nullish(),
    optante_simples: z.boolean().default(false),
    produtor_rural: z.boolean().default(false),
    contribuinte: z.boolean().default(true),

    // Observações
    observacoes: z.string().nullish(),
    observacoes_internas: z.string().nullish(),

    // Dados Bancários
    dados_bancarios_banco: z.string().nullish(),
    dados_bancarios_agencia: z.string().nullish(),
    dados_bancarios_conta: z.string().nullish(),
    dados_bancarios_pix: z.string().nullish(),
    dados_bancarios_titular_cpf_cnpj: z.string().nullish(),
    dados_bancarios_titular_nome: z.string().nullish(),
});

// Tipagem Inferida para uso no Frontend (React Hook Form) e Backend
export type ClientFormValues = z.infer<typeof ClientSchema>;
