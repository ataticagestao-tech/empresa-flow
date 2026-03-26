
import { useState, useCallback, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { maskCEP, maskCNPJ, maskCPF, maskPhone, unmask } from "@/utils/masks";

import { ClientSchema, ClientFormValues } from "../../domain/schemas/client.schema";
import { fetchAddressByCep, fetchCompanyByCnpj } from "../../infra/client.services";
import { toTitleCase } from "@/lib/format";

type UseClientFormProps = {
    onSuccess: () => void;
    initialData?: any; // Idealmente tipar com retorno do Supabase
};

export function useClientForm({ onSuccess, initialData }: UseClientFormProps) {
    const { selectedCompany } = useCompany();
    const { activeClient } = useAuth(); // Supabase Client
    const queryClient = useQueryClient();

    const [isLoadingAddress, setIsLoadingAddress] = useState(false);
    const [isLoadingCnpj, setIsLoadingCnpj] = useState(false);

    // Lista de CNAEs para o select
    const [cnaeOptions, setCnaeOptions] = useState<Array<{ codigo: string; descricao: string; origem: "principal" | "secundario" }>>([]);

    const form = useForm<ClientFormValues>({
        resolver: zodResolver(ClientSchema),
        defaultValues: {
            tipo_pessoa: "PJ",
            contribuinte: true,
            optante_simples: false,
            produtor_rural: false,
            ...initialData
        },
    });

    // Populando form com dados iniciais (Edição)
    useEffect(() => {
        if (initialData) {
            const maskedData = {
                ...initialData,
                cep: maskCEP(initialData.endereco_cep || ""),
                cpf_cnpj: initialData.tipo_pessoa === "PJ" ? maskCNPJ(initialData.cpf_cnpj) : maskCPF(initialData.cpf_cnpj),
                telefone: maskPhone(initialData.telefone || ""),
                // ... outros campos mascarados conforme necessidade
            };
            form.reset(maskedData);
        }
    }, [initialData, form]);

    /**
     * Handler para busca automática de CEP (Blur no campo)
     */
    const handleCepBlur = useCallback(async () => {
        const cep = form.getValues("cep");
        if (!cep) return;

        try {
            setIsLoadingAddress(true);
            const data = await fetchAddressByCep(unmask(cep));

            form.setValue("endereco_logradouro", data.logradouro);
            form.setValue("endereco_bairro", data.bairro);
            form.setValue("endereco_cidade", data.localidade);
            form.setValue("endereco_estado", data.uf);

            toast.success("Endereço encontrado!");
        } catch (error) {
            toast.error("CEP não encontrado ou inválido.");
        } finally {
            setIsLoadingAddress(false);
        }
    }, [form]);

    /**
     * Handler para busca automática de CNPJ (Botão ou Blur)
     */
    const handleCnpjLookup = useCallback(async () => {
        const doc = unmask(form.getValues("cpf_cnpj") || "");
        if (doc.length !== 14) {
            toast.error("CNPJ inválido para consulta.");
            return;
        }

        try {
            setIsLoadingCnpj(true);
            const data = await fetchCompanyByCnpj(doc);

            // Popula campos básicos se estiverem vazios
            const setIfEmpty = (key: keyof ClientFormValues, value: any) => {
                const current = form.getValues(key);
                if (!current) form.setValue(key, value);
            };

            setIfEmpty("razao_social", data.razao_social);
            setIfEmpty("nome_fantasia", data.nome_fantasia);
            setIfEmpty("endereco_logradouro", data.logradouro);
            setIfEmpty("endereco_numero", data.numero);
            setIfEmpty("endereco_bairro", data.bairro);
            setIfEmpty("endereco_cidade", data.municipio);
            setIfEmpty("endereco_estado", data.uf);
            setIfEmpty("email", data.email);
            setIfEmpty("telefone", maskPhone(data.telefone));

            // Configura CNAEs
            const principal = data.cnae_fiscal ? [{
                codigo: String(data.cnae_fiscal),
                descricao: data.cnae_fiscal_descricao || "",
                origem: "principal" as const
            }] : [];

            const secundarios = (data.cnaes_secundarios || []).map(c => ({
                codigo: String(c.codigo),
                descricao: c.descricao,
                origem: "secundario" as const
            }));

            setCnaeOptions([...principal, ...secundarios]);

            if (data.cnae_fiscal) {
                setIfEmpty("cnae", String(data.cnae_fiscal));
            }

            toast.success("Dados da empresa carregados.");

        } catch (error) {
            toast.error("Erro ao consultar CNPJ na Receita.");
        } finally {
            setIsLoadingCnpj(false);
        }
    }, [form]);


    const onSubmit = async (values: ClientFormValues) => {
        if (!selectedCompany?.id) {
            toast.error("Empresa não selecionada.");
            return;
        }

        try {
            // Prepara Payload (Remove máscaras e campos que não existem no banco)
            const { cep, ...rest } = values;

            const payload = {
                ...rest,
                company_id: selectedCompany.id,
                razao_social: toTitleCase(values.razao_social),
                nome_fantasia: values.nome_fantasia ? toTitleCase(values.nome_fantasia) : values.nome_fantasia,
                endereco_cep: unmask(cep || ""),
                cpf_cnpj: unmask(values.cpf_cnpj || "") || null,
                telefone: unmask(values.telefone || ""),
                telefone_2: unmask(values.telefone_2 || ""),
                celular: unmask(values.celular || ""),
                fax: unmask(values.fax || ""),
                dados_bancarios_titular_cpf_cnpj: unmask(values.dados_bancarios_titular_cpf_cnpj || ""),
                is_active: true
            };

            // Lógica de Persistência (Supabase)
            if (initialData?.id) {
                const { error } = await activeClient
                    .from("clients")
                    .update(payload)
                    .eq("id", initialData.id);
                if (error) throw error;
            } else {
                const { error } = await activeClient
                    .from("clients")
                    .insert([payload]);
                if (error) throw error;
            }

            toast.success("Cliente salvo com sucesso!");
            queryClient.invalidateQueries({ queryKey: ["clients"] });
            onSuccess();
        } catch (error) {
            console.error(error);
            toast.error("Erro ao salvar no banco de dados.");
        }
    };

    return {
        form,
        onSubmit,
        handleCepBlur,
        handleCnpjLookup,
        isLoadingAddress,
        isLoadingCnpj,
        cnaeOptions
    };
}
