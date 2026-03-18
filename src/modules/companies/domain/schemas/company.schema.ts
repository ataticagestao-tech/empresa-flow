
import { z } from "zod";

export const CompanyNfseSettingsSchema = z.object({
    id: z.string().optional(),
    provider: z.string().optional(),
    login: z.string().optional(),
    password: z.string().optional(),
    environment: z.enum(["homologacao", "producao"]).default("homologacao"),
    city_code: z.string().optional(), // IBGE
    city_name: z.string().optional(),
    uf: z.string().optional(),
    certificate_password: z.string().optional(),
});

export const CompanySchema = z.object({
    id: z.string().optional(),
    razao_social: z.string().min(1, "Razão Social é obrigatória"),
    nome_fantasia: z.string().optional(),
    cnpj: z.string().min(14, "CNPJ inválido"), // Pode validar melhor com regex
    inscricao_estadual: z.string().optional(),
    inscricao_municipal: z.string().optional(),
    natureza_juridica: z.string().optional(),
    natureza_juridica_code: z.string().optional(),
    natureza_juridica_desc: z.string().optional(),

    porte: z.string().optional(),
    data_abertura: z.string().optional(), // YYYY-MM-DD
    situacao_cadastral: z.string().optional(),
    data_situacao_cadastral: z.string().optional(),

    cnae: z.string().optional(), // Mantido para compatibilidade
    cnae_principal_code: z.string().optional(),
    cnae_principal_desc: z.string().optional(),

    // CNAE Secundários podem ser múltiplos, mas vamos guardar como texto por enquanto ou JSON
    cnae_secundario_code: z.string().optional(),
    cnae_secundario_desc: z.string().optional(),

    regime_tributario: z.string().optional(),

    // Responsáveis
    responsavel_legal: z.string().optional(),
    contador_responsavel: z.string().optional(),

    // Contato
    email: z.string().email().optional().or(z.literal("")),
    telefone: z.string().optional(),
    celular: z.string().optional(),
    site: z.string().optional(),

    // Endereço
    endereco_logradouro: z.string().optional(),
    endereco_numero: z.string().optional(),
    endereco_complemento: z.string().optional(),
    endereco_bairro: z.string().optional(),
    endereco_cidade: z.string().optional(),
    endereco_estado: z.string().length(2).optional().or(z.literal("")),
    endereco_cep: z.string().optional(),
    endereco_ibge: z.string().optional(),

    // Bancarios
    dados_bancarios_banco: z.string().optional(),
    dados_bancarios_agencia: z.string().optional(),
    dados_bancarios_conta: z.string().optional(),
    dados_bancarios_pix: z.string().optional(),
    dados_bancarios_titular_nome: z.string().optional(),
    dados_bancarios_titular_cpf_cnpj: z.string().optional(),

    // Config flags
    enable_nfe: z.boolean().default(false),
    enable_nfce: z.boolean().default(false),
    enable_nfse: z.boolean().default(false),

    // Sub-objetos (para facilitar o formulário unificado)
    nfse_settings: CompanyNfseSettingsSchema.optional(),

    // Arquivos (apenas referência se foram carregados ou não, pois o upload é via storage)
    // Não guardamos File objects no schema de dados do banco, mas podemos usar no form state se necessário.
    // Mas para manter simples e SOLID, upload é separado ou tratado no hook.
});

export type Company = z.infer<typeof CompanySchema>;
export type CompanyNfseSettings = z.infer<typeof CompanyNfseSettingsSchema>;
