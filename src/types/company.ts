import type { PlanoId, PlanoConfig } from "@/config/entitlements";

export interface Company {
    id: string;
    razao_social: string;
    nome_fantasia: string | null;
    cnpj: string | null;
    inscricao_estadual: string | null;
    inscricao_municipal: string | null;
    cnae: string | null;
    activity_profile?: "servico" | "comercio" | "mista";
    enable_nfse?: boolean;
    enable_nfe?: boolean;
    enable_nfce?: boolean;
    /** Pacote comercial Tática contratado. null = acesso total (legado). */
    plano?: PlanoId | null;
    /** Overrides por empresa: módulos extras / ajuste de limites. */
    plano_config?: PlanoConfig | null;
    natureza_juridica: string | null;
    regime_tributario: string | null;
    email: string | null;
    telefone: string | null;
    celular: string | null;
    site: string | null;
    contato_nome: string | null;
    endereco_cep: string | null;
    endereco_logradouro: string | null;
    endereco_numero: string | null;
    endereco_complemento: string | null;
    endereco_bairro: string | null;
    endereco_cidade: string | null;
    endereco_estado: string | null;
    logo_url: string | null;
    is_active: boolean;
    dados_bancarios_banco?: string | null;
    dados_bancarios_agencia?: string | null;
    dados_bancarios_conta?: string | null;
    dados_bancarios_pix?: string | null;
    dados_bancarios_titular_cpf_cnpj?: string | null;
    dados_bancarios_titular_nome?: string | null;
}

export type CompanyFormData = Omit<Company, 'id' | 'is_active'>;
