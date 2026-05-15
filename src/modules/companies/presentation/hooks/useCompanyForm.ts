import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Company, CompanySchema } from "../../domain/schemas/company.schema";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { CNPJParserService } from "@/modules/clients/infra/cnpj-parser.service";
import { toTitleCase } from "@/lib/format";

// Interface local para tipar os documentos vindos do banco
interface CompanyDocument {
    id: string;
    company_id: string;
    document_type: string;
    file_path: string;
    file_name: string;
    file_size: number;
    content_type: string;
}

export function useCompanyForm(companyId?: string) {
    const { toast } = useToast();
    const { session, activeClient: supabase } = useAuth(); // Shadow the global 'supabase' with the authenticated one
    const [isLoading, setIsLoading] = useState(false);
    const [isSearchingCnpj, setIsSearchingCnpj] = useState(false);

    // Estados de Arquivos (Frontend)
    const [cartaoCnpjFile, setCartaoCnpjFile] = useState<File | null>(null);
    const [certificadoA1File, setCertificadoA1File] = useState<File | null>(null);

    // Estados de Documentos (Backend - Supabase)
    const [cartaoCnpjDoc, setCartaoCnpjDoc] = useState<CompanyDocument | null>(null);
    const [certificadoA1Doc, setCertificadoA1Doc] = useState<CompanyDocument | null>(null);

    const form = useForm<Company>({
        resolver: zodResolver(CompanySchema),
        defaultValues: {
            enable_nfe: false,
            enable_nfce: false,
            enable_nfse: false,
            nfse_settings: {
                environment: "homologacao"
            }
        }
    });

    // =========================================================================
    // 1. CARREGAMENTO DE DADOS (Otimizado com Promise.all)
    // =========================================================================
    useEffect(() => {
        if (!companyId || !session) return;

        let isMounted = true; // Previne vazamento de memória se o componente desmontar

        const loadData = async () => {
            setIsLoading(true);
            try {
                // Dispara as 3 requisições simultaneamente para economizar tempo
                // Usando 'supabase' que agora é o activeClient
                const [companyRes, nfseRes, docsRes] = await Promise.all([
                    (supabase.from("companies" as any).select("*").eq("id", companyId).single() as any),
                    (supabase.from("company_nfse_settings" as any).select("*").eq("company_id", companyId).maybeSingle() as any),
                    (supabase.from("company_documents" as any).select("*").eq("company_id", companyId) as any)
                ]);

                if (companyRes.error) throw companyRes.error;
                if (!isMounted) return;

                // 1. Popula dados do formulário
                if (companyRes.data) {
                    const companyData = companyRes.data as unknown as Company; // Casting mais seguro que 'any'

                    // Merge dos dados da empresa com as configurações de NFSe (se existirem)
                    const fullFormData = {
                        ...companyData,
                        nfse_settings: nfseRes.data ? (nfseRes.data as any) : { environment: "homologacao" }
                    };

                    form.reset(fullFormData);
                }

                // 2. Popula estados dos documentos
                if (docsRes.data) {
                    const docsList = docsRes.data as unknown as CompanyDocument[];
                    setCartaoCnpjDoc(docsList.find(d => d.document_type === "cartao_cnpj") || null);
                    setCertificadoA1Doc(docsList.find(d => d.document_type === "certificado_a1") || null);
                }

            } catch (error: any) {
                console.error("Erro ao carregar empresa:", error);
                toast({
                    title: "Erro",
                    description: "Falha ao carregar dados da empresa.",
                    variant: "destructive"
                });
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        loadData();

        return () => { isMounted = false; };
    }, [companyId, session, toast, form, supabase]); // Add supabase to dependency


    // =========================================================================
    // 2. LÓGICA DE SALVAMENTO (Dividida em Funções Menores)
    // =========================================================================

    // Auxiliar: Upload de arquivo individual
    const uploadDocument = async (targetCompanyId: string, file: File, type: string) => {
        const fileExt = file.name.split('.').pop();
        // Dica: Adicione um timestamp ou UUID aqui se quiser evitar cache de arquivo
        const filePath = `${targetCompanyId}/${type}.${fileExt}`;

        // Upload físico Storage
        const { error: uploadError } = await supabase.storage
            .from('company-docs')
            .upload(filePath, file, { upsert: true });

        if (uploadError) throw uploadError;

        // Registro no Banco
        const { error: dbError } = await supabase
            .from('company_documents' as any)
            .upsert({
                company_id: targetCompanyId,
                document_type: type,
                file_path: filePath,
                file_name: file.name,
                file_size: file.size,
                content_type: file.type
            }, { onConflict: 'company_id, document_type' });

        if (dbError) throw dbError;
    };

    // Auxiliar: Salvar Tabela Company
    const upsertCompanyData = async (data: Company): Promise<Company> => {
        const { nfse_settings, ...rest } = data;

        const companyPayload: any = {
            ...rest,
            razao_social: rest.razao_social ? toTitleCase(rest.razao_social) : rest.razao_social,
            nome_fantasia: rest.nome_fantasia ? toTitleCase(rest.nome_fantasia) : rest.nome_fantasia,
            // Mantemos o owner_id para garantir a consistência com o schema novo
            owner_id: session?.user?.id
        };

        if (companyId) {
            companyPayload.id = companyId;
        }

        const { data: savedCompany, error } = await (supabase
            .from("companies" as any)
            .upsert(companyPayload)
            .select()
            .single() as any);

        if (error) {
            console.error("Erro detalhado do Supabase:", error);
            if (error.code === '23505') {
                throw new Error("Uma empresa com este CNPJ já está cadastrada.");
            }
            throw new Error(`Erro ao salvar dados da empresa: ${error.message} (Code: ${error.code})`);
        }

        return savedCompany as Company;
    };

    // Auxiliar: Salvar Configs NFSe
    const upsertNfseData = async (targetCompanyId: string, data: Company) => {
        if (!data.enable_nfse || !data.nfse_settings) return;

        const settingsData = {
            ...data.nfse_settings,
            company_id: targetCompanyId
        };

        const { error } = await supabase
            .from("company_nfse_settings" as any)
            .upsert(settingsData);

        if (error) throw new Error(`Erro ao salvar configurações fiscais: ${error.message}`);
    };

    // Auxiliar: Gerenciador de Uploads Paralelos
    const handleFileUploads = async (targetCompanyId: string) => {
        const uploadPromises = [];

        if (cartaoCnpjFile) {
            uploadPromises.push(uploadDocument(targetCompanyId, cartaoCnpjFile, "cartao_cnpj"));
        }
        if (certificadoA1File) {
            uploadPromises.push(uploadDocument(targetCompanyId, certificadoA1File, "certificado_a1"));
        }

        if (uploadPromises.length > 0) {
            await Promise.all(uploadPromises);
        }
    };

    // Função Principal de Submit (Orquestradora)
    const onSubmit = async (data: Company) => {
        if (!session?.user?.id) {
            toast({ title: "Erro", description: "Sessão inválida. Tente recarregar a página.", variant: "destructive" });
            return;
        }

        setIsLoading(true);

        try {
            // 1. Salva a empresa e recupera o ID
            const savedCompany = await upsertCompanyData(data);
            const savedId = savedCompany.id;

            if (!savedId) {
                throw new Error("Não foi possível obter o ID da empresa após o salvamento.");
            }

            // 2. Executa configurações auxiliares e uploads em paralelo
            await Promise.all([
                upsertNfseData(savedId, data),
                handleFileUploads(savedId)
            ]);

            toast({ title: "Sucesso", description: "Empresa salva com sucesso!" });

            // Retorna o objeto salvo caso o componente precise atualizar a URL ou estado
            return savedCompany;

        } catch (error: any) {
            console.error("Erro ao salvar:", error);
            const msg = error.message || "Erro desconhecido ao processar solicitação.";
            toast({ title: "Erro", description: msg, variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };

    // =========================================================================
    // 3. UTILITÁRIOS (Delete, OCR, Fetch CNPJ)
    // =========================================================================

    const deleteDocument = async (doc: CompanyDocument) => {
        if (!doc) return;
        setIsLoading(true);
        try {
            await supabase.storage.from('company-docs').remove([doc.file_path]);
            await supabase.from('company_documents' as any).delete().eq('id', doc.id);

            if (doc.document_type === 'cartao_cnpj') {
                setCartaoCnpjDoc(null);
                setCartaoCnpjFile(null);
            }
            if (doc.document_type === 'certificado_a1') {
                setCertificadoA1Doc(null);
                setCertificadoA1File(null);
            }
            toast({ title: "Deletado", description: "Documento removido com sucesso." });
        } catch (e) {
            console.error(e);
            toast({ title: "Erro", description: "Falha ao remover documento.", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };

    const processCnpjFile = async (file: File) => {
        if (!file) return;
        setIsLoading(true);
        try {
            const parser = new CNPJParserService();
            const data = await parser.parse(file);

            form.setValue("razao_social", data.razao_social, { shouldDirty: true });
            if (data.nome_fantasia) form.setValue("nome_fantasia", data.nome_fantasia, { shouldDirty: true });
            form.setValue("cnpj", data.cnpj, { shouldDirty: true });

            if (data.endereco) {
                form.setValue("endereco_logradouro", data.endereco.logradouro);
                form.setValue("endereco_numero", data.endereco.numero);
                form.setValue("endereco_complemento", data.endereco.complemento);
                form.setValue("endereco_bairro", data.endereco.bairro);
                form.setValue("endereco_cidade", data.endereco.municipio);
                form.setValue("endereco_estado", data.endereco.uf);
                form.setValue("endereco_cep", data.endereco.cep.replace(/\D/g, ''));
            }

            if (data.contato) {
                if (data.contato.email) form.setValue("email", data.contato.email);
                if (data.contato.telefone) form.setValue("telefone", data.contato.telefone);
            }

            setCartaoCnpjFile(file);

            // Popula os novos campos de Código/Descrição
            if (data.cnae_principal_code) form.setValue("cnae_principal_code", data.cnae_principal_code);
            if (data.cnae_principal) form.setValue("cnae_principal_desc", data.cnae_principal); // ou cnae
            // Mantém compatibilidade
            if (data.cnae_principal) form.setValue("cnae", data.cnae_principal);

            if (data.cnae_secundario_code) form.setValue("cnae_secundario_code", data.cnae_secundario_code);
            if (data.cnae_secundario_desc) form.setValue("cnae_secundario_desc", data.cnae_secundario_desc);

            if (data.natureza_juridica_code) form.setValue("natureza_juridica_code", data.natureza_juridica_code);
            if (data.natureza_juridica_desc) form.setValue("natureza_juridica_desc", data.natureza_juridica_desc);
            // Mantém compatibilidade
            if (data.natureza_juridica) form.setValue("natureza_juridica", data.natureza_juridica);

            if (data.porte) form.setValue("porte", data.porte);
            if (data.data_abertura) form.setValue("data_abertura", data.data_abertura.split('/').reverse().join('-')); // DD/MM/YYYY -> YYYY-MM-DD
            if (data.situacao_cadastral) form.setValue("situacao_cadastral", data.situacao_cadastral);
            if (data.data_situacao_cadastral) form.setValue("data_situacao_cadastral", data.data_situacao_cadastral.split('/').reverse().join('-'));

            toast({ title: "Leitura Concluída", description: "Dados extraídos do cartão CNPJ." });

        } catch (error: any) {
            console.error("OCR Error:", error);
            toast({ title: "Erro na Leitura", description: "Não foi possível ler o arquivo automaticamente.", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };

    const fetchCnpjData = async (cnpj: string) => {
        const cleanCnpj = cnpj.replace(/\D/g, '');
        if (cleanCnpj.length !== 14) {
            toast({ title: "Atenção", description: "O CNPJ deve conter 14 dígitos.", variant: "destructive" });
            return;
        }

        setIsSearchingCnpj(true);
        try {
            const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
            if (!response.ok) throw new Error("CNPJ não encontrado na base de dados.");

            const data = await response.json();
            const options = { shouldDirty: true, shouldValidate: true };

            // Dados Fiscais
            form.setValue("razao_social", data.razao_social, options);
            form.setValue("nome_fantasia", data.nome_fantasia || data.razao_social, options);
            form.setValue("cnpj", data.cnpj, options);
            form.setValue("email", data.email || "", options);
            form.setValue("telefone", data.ddd_telefone_1 || "", options);

            // Dados de Endereço (Sincronização garantida)
            form.setValue("endereco_logradouro", data.logradouro || "", options);
            form.setValue("endereco_numero", data.numero || "", options);
            form.setValue("endereco_complemento", data.complemento || "", options);
            form.setValue("endereco_bairro", data.bairro || "", options);
            form.setValue("endereco_cidade", data.municipio || "", options);
            form.setValue("endereco_estado", data.uf || "", options);
            form.setValue("endereco_cep", (data.cep || "").replace(/\D/g, ''), options);

            toast({ title: "Sucesso", description: "Dados do CNPJ localizados e carregados." });
        } catch (error: any) {
            console.error("API Error:", error);
            toast({ title: "Erro na Busca", description: "Não foi possível buscar os dados automaticamente.", variant: "destructive" });
        } finally {
            setIsSearchingCnpj(false);
        }
    };

    return {
        form,
        isLoading,
        isSearchingCnpj,
        onSubmit,
        cartaoCnpjFile, setCartaoCnpjFile,
        certificadoA1File, setCertificadoA1File,
        cartaoCnpjDoc, certificadoA1Doc,
        deleteDocument,
        processCnpjFile,
        fetchCnpjData
    };
}