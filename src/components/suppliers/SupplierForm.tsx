import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { maskCNPJ, maskCPF, maskPhone, maskCEP, unmask, autoCorrectUrl } from "@/utils/masks";

import { useCompany } from "@/contexts/CompanyContext";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Phone, Mail, Globe, Landmark, FileText, Settings, Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const supplierFormSchema = z.object({
    tipo_pessoa: z.enum(["PF", "PJ"]),
    razao_social: z.string().min(1, "Razão social é obrigatória"),
    nome_fantasia: z.string().optional(),
    cpf_cnpj: z.string().min(1, "CPF/CNPJ é obrigatórios"),
    contato_nome: z.string().optional(),
    email: z.string().email("Email inválido").optional().or(z.literal("")),
    telefone: z.string().optional(),
    telefone_2: z.string().optional(),
    celular: z.string().optional(),
    fax: z.string().optional(),
    website: z.string().optional(),
    cep: z.string().optional(),
    endereco_logradouro: z.string().optional(),
    endereco_numero: z.string().optional(),
    endereco_complemento: z.string().optional(),
    endereco_bairro: z.string().optional(),
    endereco_cidade: z.string().optional(),
    endereco_estado: z.string().optional(),
    inscricao_estadual: z.string().optional(),
    inscricao_municipal: z.string().optional(),
    inscricao_suframa: z.string().optional(),
    cnae: z.string().optional(),
    tipo_atividade: z.string().optional(),
    optante_simples: z.boolean().default(false),
    produtor_rural: z.boolean().default(false),
    contribuinte: z.boolean().default(true),
    observacoes: z.string().optional(),
    observacoes_internas: z.string().optional(),
    dados_bancarios_banco: z.string().optional(),
    dados_bancarios_agencia: z.string().optional(),
    dados_bancarios_conta: z.string().optional(),
    dados_bancarios_pix: z.string().optional(),
    dados_bancarios_titular_cpf_cnpj: z.string().optional(),
    dados_bancarios_titular_nome: z.string().optional(),
});

type SupplierFormValues = z.infer<typeof supplierFormSchema>;

interface SupplierFormProps {
    onSuccess: () => void;
    initialData?: any;
}

export function SupplierForm({ onSuccess, initialData }: SupplierFormProps) {
    const { toast } = useToast();
    const { selectedCompany } = useCompany();
    const { activeClient } = useAuth();
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState("endereco");
    const [isSefazLookupLoading, setIsSefazLookupLoading] = useState(false);
    const [cnaeDescricao, setCnaeDescricao] = useState("");
    const [cnaeOpcoes, setCnaeOpcoes] = useState<Array<{ codigo: string; descricao: string; origem: "principal" | "secundario" }>>([]);
    const lastAutoLookupDocRef = useRef<string | null>(null);

    const form = useForm<SupplierFormValues>({
        resolver: zodResolver(supplierFormSchema),
        defaultValues: {
            tipo_pessoa: "PJ",
            razao_social: "",
            nome_fantasia: "",
            cpf_cnpj: "",
            contato_nome: "",
            email: "",
            telefone: "",
            telefone_2: "",
            celular: "",
            fax: "",
            website: "",
            cep: "",
            endereco_logradouro: "",
            endereco_numero: "",
            endereco_complemento: "",
            endereco_bairro: "",
            endereco_cidade: "",
            endereco_estado: "",
            inscricao_estadual: "",
            inscricao_municipal: "",
            inscricao_suframa: "",
            cnae: "",
            tipo_atividade: "",
            optante_simples: false,
            produtor_rural: false,
            contribuinte: true,
            observacoes: "",
            observacoes_internas: "",
            dados_bancarios_banco: "",
            dados_bancarios_agencia: "",
            dados_bancarios_conta: "",
            dados_bancarios_pix: "",
            dados_bancarios_titular_cpf_cnpj: "",
            dados_bancarios_titular_nome: "",
        },
    });

    useEffect(() => {
        if (initialData) {
            form.reset({
                ...initialData,
                optante_simples: Boolean(initialData.optante_simples),
                produtor_rural: Boolean(initialData.produtor_rural),
                contribuinte: initialData.contribuinte ?? true,
                cep: maskCEP(initialData.endereco_cep || ""),
                cpf_cnpj: initialData.tipo_pessoa === "PJ" ? maskCNPJ(initialData.cpf_cnpj || "") : maskCPF(initialData.cpf_cnpj || ""),
                telefone: maskPhone(initialData.telefone || ""),
                telefone_2: maskPhone(initialData.telefone_2 || ""),
                celular: maskPhone(initialData.celular || ""),
                fax: maskPhone(initialData.fax || ""),
                dados_bancarios_titular_cpf_cnpj: initialData.dados_bancarios_titular_cpf_cnpj?.length > 11 ? maskCNPJ(initialData.dados_bancarios_titular_cpf_cnpj) : maskCPF(initialData.dados_bancarios_titular_cpf_cnpj || ""),
            });
            setCnaeDescricao("");
            setCnaeOpcoes([]);
        }
    }, [initialData, form]);

    const handleCEPBlur = async () => {
        const cep = form.getValues("cep");
        const cleanCEP = unmask(cep || "");
        if (cleanCEP.length === 8) {
            try {
                const response = await fetch(`https://viacep.com.br/ws/${cleanCEP}/json/`);
                const data = await response.json();
                if (data.erro) {
                    toast({
                        title: "Erro",
                        description: "CEP não encontrado",
                        variant: "destructive",
                    });
                    return;
                }
                form.setValue("endereco_logradouro", data.logradouro);
                form.setValue("endereco_bairro", data.bairro);
                form.setValue("endereco_cidade", data.localidade);
                form.setValue("endereco_estado", data.uf);
            } catch (error) {
                console.error("Erro ao buscar CEP:", error);
            }
        }
    };

    const handleSearchAddress = () => {
        const values = form.getValues();
        const parts = [
            values.endereco_logradouro,
            values.endereco_numero,
            values.endereco_bairro,
            values.endereco_cidade,
            values.endereco_estado,
            values.cep,
        ]
            .map((v) => (typeof v === "string" ? v.trim() : ""))
            .filter(Boolean);

        if (parts.length === 0) {
            toast({
                title: "Endereço vazio",
                description: "Preencha algum dado de endereço para pesquisar.",
                variant: "destructive",
            });
            return;
        }

        const query = encodeURIComponent(parts.join(" "));
        window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, "_blank", "noopener,noreferrer");
    };

    const onSubmit = async (values: SupplierFormValues) => {
        if (!selectedCompany) {
            toast({
                title: "Erro",
                description: "Selecione uma empresa primeiro.",
                variant: "destructive",
            });
            return;
        }

        try {
            const { cep, ...rest } = values;
            const supplierData = {
                ...rest,
                razao_social: values.razao_social,
                company_id: selectedCompany.id,
                endereco_cep: unmask(cep || ""),
                cpf_cnpj: unmask(values.cpf_cnpj || ""),
                telefone: unmask(values.telefone || ""),
                telefone_2: unmask(values.telefone_2 || ""),
                celular: unmask(values.celular || ""),
                fax: unmask(values.fax || ""),
                dados_bancarios_titular_cpf_cnpj: unmask(values.dados_bancarios_titular_cpf_cnpj || ""),
            };

            let error;
            if (initialData?.id) {
                const { error: updateError } = await activeClient
                    .from("suppliers")
                    .update(supplierData)
                    .eq("id", initialData.id);
                error = updateError;
            } else {
                const { error: insertError } = await activeClient
                    .from("suppliers")
                    .insert([supplierData]);
                error = insertError;
            }

            if (error) throw error;

            toast({
                title: "Sucesso",
                description: `Fornecedor ${initialData ? "atualizado" : "cadastrado"} com sucesso!`,
            });

            queryClient.invalidateQueries({ queryKey: ["suppliers"] });
            onSuccess();
        } catch (error: any) {
            console.error("Error saving supplier:", error);
            toast({
                title: "Erro",
                description: "Erro ao salvar fornecedor.",
                variant: "destructive",
            });
        }
    };

    const handleLookupSefaz = async () => {
        const tipo = form.getValues("tipo_pessoa");
        const doc = unmask(form.getValues("cpf_cnpj") || "");

        if (tipo !== "PJ") {
            toast({
                title: "Consulta indisponível",
                description: "Consulta automática disponível apenas para CNPJ (Pessoa Jurídica).",
                variant: "destructive",
            });
            return;
        }

        if (doc.length !== 14) {
            toast({
                title: "CNPJ inválido",
                description: "Informe um CNPJ válido para consultar.",
                variant: "destructive",
            });
            return;
        }

        setIsSefazLookupLoading(true);
        try {
            const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${doc}`);
            if (!response.ok) {
                toast({
                    title: "Falha na consulta",
                    description: "Não foi possível consultar este CNPJ.",
                    variant: "destructive",
                });
                return;
            }

            const data = await response.json();
            const current = form.getValues();
            const cnaePrincipalCodigo = data?.cnae_fiscal ? String(data.cnae_fiscal) : "";
            const cnaePrincipalDescricao = data?.cnae_fiscal_descricao ? String(data.cnae_fiscal_descricao) : "";
            const secundarias = Array.isArray(data?.cnaes_secundarios) ? data.cnaes_secundarios : [];
            const opcoes = [
                ...(cnaePrincipalCodigo && cnaePrincipalDescricao
                    ? [{ codigo: cnaePrincipalCodigo, descricao: cnaePrincipalDescricao, origem: "principal" as const }]
                    : []),
                ...secundarias
                    .filter((c: any) => c && c.codigo && c.descricao)
                    .map((c: any) => ({ codigo: String(c.codigo), descricao: String(c.descricao), origem: "secundario" as const })),
            ];
            setCnaeOpcoes(opcoes);

            const setIfEmpty = (key: keyof SupplierFormValues, value: unknown) => {
                const cur = current[key as keyof typeof current];
                const isEmpty = cur === undefined || cur === null || cur === "" || (typeof cur === "string" && cur.trim() === "");
                if (isEmpty && value !== undefined && value !== null) {
                    form.setValue(key as any, value as any, { shouldDirty: true });
                }
            };

            setIfEmpty("razao_social", (data?.razao_social as any) || "");
            setIfEmpty("nome_fantasia", (data?.nome_fantasia as any) || "");
            setIfEmpty("email", (data?.email as any) || "");
            setIfEmpty("telefone", maskPhone((data?.ddd_telefone_1 as any) || (data?.telefone as any) || ""));
            setIfEmpty("cep", maskCEP((data?.cep as any) || ""));
            setIfEmpty("endereco_logradouro", (data?.logradouro as any) || "");
            setIfEmpty("endereco_numero", (data?.numero as any) || "");
            setIfEmpty("endereco_complemento", (data?.complemento as any) || "");
            setIfEmpty("endereco_bairro", (data?.bairro as any) || "");
            setIfEmpty("endereco_cidade", (data?.municipio as any) || "");
            setIfEmpty("endereco_estado", (data?.uf as any) || "");
            setIfEmpty("cnae", cnaePrincipalCodigo);
            setCnaeDescricao((prev) => {
                if (prev) return prev;
                const escolhido = current.cnae && String(current.cnae).trim() ? String(current.cnae) : cnaePrincipalCodigo;
                const found = opcoes.find((o) => o.codigo === escolhido);
                return found?.descricao || cnaePrincipalDescricao || "";
            });

            if (data?.opcao_pelo_simples && !current.optante_simples) {
                form.setValue("optante_simples", true, { shouldDirty: true });
            }

            toast({
                title: "Consulta concluída",
                description: "Dados preenchidos a partir do CNPJ.",
            });
        } catch {
            toast({
                title: "Erro na consulta",
                description: "Erro ao consultar CNPJ.",
                variant: "destructive",
            });
        } finally {
            setIsSefazLookupLoading(false);
        }
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* Cabeçalho do Formulário */}
                <div className="flex gap-6 items-start bg-[#F6F2EB] p-4 rounded-lg border border-[#F6F2EB]">
                    <div className="flex flex-col items-center gap-2">
                        <div className="w-20 h-20 bg-[#F6F2EB] rounded-full flex items-center justify-center border-4 border-white shadow-sm overflow-hidden">
                            <User className="w-10 h-10 text-muted-foreground" />
                        </div>
                        <button type="button" className="text-xs text-blue-600 font-semibold hover:underline">Alterar</button>
                    </div>

                    <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="md:col-span-3 space-y-1">
                            <FormField
                                control={form.control}
                                name="razao_social"
                                render={({ field }) => (
                                    <FormItem>
                                        <div className="flex justify-between items-center">
                                            <FormLabel className="text-muted-foreground text-xs font-bold uppercase">Razão Social / Nome Completo</FormLabel>
                                            <button type="button" className="text-[12px] text-green-600 flex items-center gap-1"><Search className="w-3 h-3" /> Consulta de Crédito</button>
                                        </div>
                                        <FormControl>
                                            <Input className="h-9 focus-visible:ring-green-600 border-[#EAECF0]" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                        <div className="space-y-1">
                            <FormField
                                control={form.control}
                                name="cpf_cnpj"
                                render={({ field }) => (
                                    <FormItem>
                                        <div className="flex justify-between items-center">
                                            <FormLabel className="text-muted-foreground text-xs font-bold uppercase">CNPJ / CPF</FormLabel>
                                            <button
                                                type="button"
                                                className="text-[12px] text-green-600 flex items-center gap-1 disabled:opacity-60"
                                                onClick={handleLookupSefaz}
                                                disabled={isSefazLookupLoading}
                                            >
                                                <Globe className="w-3 h-3" /> {isSefazLookupLoading ? "Consultando..." : "Pesquisar SEFAZ"}
                                            </button>
                                        </div>
                                        <FormControl>
                                            <Input
                                                className="h-9 focus-visible:ring-green-600 border-[#EAECF0]"
                                                {...field}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    const tipo = form.getValues("tipo_pessoa");
                                                    const masked = tipo === "PJ" ? maskCNPJ(val) : maskCPF(val);
                                                    field.onChange(masked);
                                                    lastAutoLookupDocRef.current = null;
                                                }}
                                                onBlur={(e) => {
                                                    field.onBlur();
                                                    const tipo = form.getValues("tipo_pessoa");
                                                    const doc = unmask(e.target.value || "");
                                                    const razao = form.getValues("razao_social") || "";
                                                    if (tipo === "PJ" && doc.length === 14 && razao.trim() === "" && lastAutoLookupDocRef.current !== doc) {
                                                        lastAutoLookupDocRef.current = doc;
                                                        handleLookupSefaz();
                                                    }
                                                }}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <div className="md:col-span-2 space-y-1">
                            <FormField
                                control={form.control}
                                name="nome_fantasia"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-muted-foreground text-xs font-bold uppercase">Nome Fantasia / Nome Abreviado</FormLabel>
                                        <FormControl>
                                            <Input className="h-9 focus-visible:ring-green-600 border-[#EAECF0]" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <div className="col-span-1">
                            <FormField
                                control={form.control}
                                name="telefone"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-muted-foreground text-xs font-bold uppercase">Telefone</FormLabel>
                                        <FormControl>
                                            <Input
                                                className="h-9 focus-visible:ring-green-600 border-[#EAECF0]"
                                                {...field}
                                                onChange={(e) => field.onChange(maskPhone(e.target.value))}
                                                maxLength={15}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <div className="space-y-1">
                            <FormField
                                control={form.control}
                                name="contato_nome"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-muted-foreground text-xs font-bold uppercase">Nome do Contato</FormLabel>
                                        <FormControl>
                                            <Input className="h-9 focus-visible:ring-green-600 border-[#EAECF0]" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                    </div>
                </div>

                {/* Abas Estilo Omie */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="flex w-full justify-start border-b rounded-none h-auto p-0 bg-transparent space-x-2 overflow-x-auto pb-1">
                        <TabsTrigger value="endereco" className="border-b-2 border-transparent data-[state=active]:border-green-600 data-[state=active]:bg-green-50/10 data-[state=active]:text-green-700 rounded-none px-4 py-2 text-xs font-semibold transition-all">Endereço</TabsTrigger>
                        <TabsTrigger value="contato" className="border-b-2 border-transparent data-[state=active]:border-green-600 data-[state=active]:bg-green-50/10 data-[state=active]:text-green-700 rounded-none px-4 py-2 text-xs font-semibold transition-all">Telefones e E-mail</TabsTrigger>
                        <TabsTrigger value="banco" className="border-b-2 border-transparent data-[state=active]:border-green-600 data-[state=active]:bg-green-50/10 data-[state=active]:text-green-700 rounded-none px-4 py-2 text-xs font-semibold transition-all">Dados Bancários</TabsTrigger>
                        <TabsTrigger value="inscricoes" className="border-b-2 border-transparent data-[state=active]:border-green-600 data-[state=active]:bg-green-50/10 data-[state=active]:text-green-700 rounded-none px-4 py-2 text-xs font-semibold transition-all">Inscrições e CNAE</TabsTrigger>
                        <TabsTrigger value="integracao" className="border-b-2 border-transparent data-[state=active]:border-green-600 data-[state=active]:bg-green-50/10 data-[state=active]:text-green-700 rounded-none px-4 py-2 text-xs font-semibold transition-all flex items-center gap-1 opacity-50"><Settings className="w-3 h-3" /> Integração</TabsTrigger>
                    </TabsList>

                    <TabsContent value="endereco" className="pt-4 space-y-4 animate-in fade-in duration-300">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="md:col-span-3">
                                <FormField
                                    control={form.control}
                                    name="endereco_logradouro"
                                    render={({ field }) => (
                                        <FormItem>
                                            <div className="flex justify-between">
                                                <FormLabel className="text-muted-foreground text-[12px] font-bold uppercase">Endereço</FormLabel>
                                                <button
                                                    type="button"
                                                    className="text-[12px] text-green-600 flex items-center gap-1"
                                                    onClick={handleSearchAddress}
                                                >
                                                    <Globe className="w-3 h-3" /> Pesquisar Endereço
                                                </button>
                                            </div>
                                            <FormControl>
                                                <Input className="h-9 border-[#EAECF0]" {...field} />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <FormField
                                control={form.control}
                                name="endereco_numero"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-muted-foreground text-[12px] font-bold uppercase">Número</FormLabel>
                                        <FormControl>
                                            <Input className="h-9 border-[#EAECF0]" {...field} />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                            <div className="md:col-span-2">
                                <FormField
                                    control={form.control}
                                    name="endereco_bairro"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-muted-foreground text-[12px] font-bold uppercase">Bairro</FormLabel>
                                            <FormControl>
                                                <Input className="h-9 border-[#EAECF0]" {...field} />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <div className="md:col-span-2">
                                <FormField
                                    control={form.control}
                                    name="endereco_complemento"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-muted-foreground text-[12px] font-bold uppercase">Complemento</FormLabel>
                                            <FormControl>
                                                <Input className="h-9 border-[#EAECF0]" {...field} />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <FormField
                                control={form.control}
                                name="endereco_estado"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-muted-foreground text-[12px] font-bold uppercase">Estado</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger className="h-9 border-[#EAECF0]">
                                                    <SelectValue placeholder="UF" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="SP">SP</SelectItem>
                                                <SelectItem value="RJ">RJ</SelectItem>
                                                <SelectItem value="MG">MG</SelectItem>
                                                <SelectItem value="PR">PR</SelectItem>
                                                <SelectItem value="SC">SC</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </FormItem>
                                )}
                            />
                            <div className="md:col-span-2 flex items-end gap-2">
                                <FormField
                                    control={form.control}
                                    name="endereco_cidade"
                                    render={({ field }) => (
                                        <FormItem className="flex-1">
                                            <FormLabel className="text-muted-foreground text-[12px] font-bold uppercase">Cidade</FormLabel>
                                            <FormControl>
                                                <div className="relative">
                                                    <Input className="h-9 border-[#EAECF0] pr-8" {...field} />
                                                    <Search className="w-4 h-4 text-muted-foreground absolute right-2 top-2.5" />
                                                </div>
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <FormField
                                control={form.control}
                                name="cep"
                                render={({ field }) => (
                                    <FormItem>
                                        <div className="flex justify-between">
                                            <FormLabel className="text-muted-foreground text-[12px] font-bold uppercase">CEP</FormLabel>
                                            <button type="button" className="text-[12px] text-green-600 flex items-center gap-1"><Search className="w-3 h-3" /> Pesquisar CEP</button>
                                        </div>
                                        <FormControl>
                                            <Input
                                                className="h-9 border-[#EAECF0] bg-blue-50/30"
                                                {...field}
                                                onChange={(e) => field.onChange(maskCEP(e.target.value))}
                                                onBlur={handleCEPBlur}
                                            />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                        </div>
                    </TabsContent>

                    <TabsContent value="contato" className="pt-4 space-y-4 animate-in fade-in duration-300">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <FormField
                                control={form.control}
                                name="telefone_2"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-muted-foreground text-[12px] font-bold uppercase">Telefone 2</FormLabel>
                                        <FormControl>
                                            <Input
                                                className="h-9 border-[#EAECF0]"
                                                {...field}
                                                onChange={(e) => field.onChange(maskPhone(e.target.value))}
                                                maxLength={15}
                                            />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="celular"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-muted-foreground text-[12px] font-bold uppercase">Celular / WhatsApp</FormLabel>
                                        <FormControl>
                                            <Input
                                                className="h-9 border-[#EAECF0]"
                                                {...field}
                                                onChange={(e) => field.onChange(maskPhone(e.target.value))}
                                                maxLength={15}
                                            />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="fax"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-muted-foreground text-[12px] font-bold uppercase">Fax</FormLabel>
                                        <FormControl>
                                            <Input
                                                className="h-9 border-[#EAECF0]"
                                                {...field}
                                                onChange={(e) => field.onChange(maskPhone(e.target.value))}
                                                maxLength={15}
                                            />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                            <div className="md:col-span-2">
                                <FormField
                                    control={form.control}
                                    name="email"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-muted-foreground text-[12px] font-bold uppercase">E-mail</FormLabel>
                                            <FormControl>
                                                <div className="relative">
                                                    <Input className="h-9 border-[#EAECF0] pr-8" {...field} />
                                                    <Mail className="w-4 h-4 text-muted-foreground absolute right-2 top-2.5" />
                                                </div>
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <div className="md:col-span-2">
                                <FormField
                                    control={form.control}
                                    name="website"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-muted-foreground text-[12px] font-bold uppercase">WebSite</FormLabel>
                                            <FormControl>
                                                <div className="relative">
                                                    <Input className="h-9 border-[#EAECF0] pr-8" {...field} onBlur={(e) => { field.onBlur(); field.onChange(autoCorrectUrl(e.target.value)); }} />
                                                    <Globe className="w-4 h-4 text-muted-foreground absolute right-2 top-2.5" />
                                                </div>
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="banco" className="pt-4 space-y-4 animate-in fade-in duration-300">
                        <p className="text-xs font-bold text-muted-foreground">Preencha aqui os dados bancários <span className="font-normal text-muted-foreground">deste fornecedor</span></p>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-2">
                            <FormField
                                control={form.control}
                                name="dados_bancarios_banco"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-muted-foreground text-[12px] font-bold uppercase">Banco</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger className="h-9 border-[#EAECF0]">
                                                    <SelectValue placeholder="Selecione" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="001">001 - Banco do Brasil</SelectItem>
                                                <SelectItem value="033">033 - Santander</SelectItem>
                                                <SelectItem value="237">237 - Bradesco</SelectItem>
                                                <SelectItem value="341">341 - Itaú</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="dados_bancarios_agencia"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-muted-foreground text-[12px] font-bold uppercase">Agência</FormLabel>
                                        <FormControl>
                                            <Input className="h-9 border-[#EAECF0]" {...field} />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="dados_bancarios_conta"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-muted-foreground text-[12px] font-bold uppercase">Conta Corrente</FormLabel>
                                        <FormControl>
                                            <Input className="h-9 border-[#EAECF0]" {...field} />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="dados_bancarios_pix"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-muted-foreground text-[12px] font-bold uppercase">Chave Pix</FormLabel>
                                        <FormControl>
                                            <Input className="h-9 border-[#EAECF0]" {...field} />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                            <div className="md:col-span-1">
                                <FormField
                                    control={form.control}
                                    name="dados_bancarios_titular_cpf_cnpj"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-muted-foreground text-[12px] font-bold uppercase">CNPJ ou CPF do Titular</FormLabel>
                                            <FormControl>
                                                <Input
                                                    className="h-9 border-[#EAECF0]"
                                                    placeholder="Opcional."
                                                    {...field}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        field.onChange(val.length > 14 ? maskCNPJ(val) : maskCPF(val));
                                                    }}
                                                    maxLength={18}
                                                />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <div className="md:col-span-2">
                                <FormField
                                    control={form.control}
                                    name="dados_bancarios_titular_nome"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-muted-foreground text-[12px] font-bold uppercase">Nome do Titular da Conta</FormLabel>
                                            <FormControl>
                                                <Input className="h-9 border-[#EAECF0]" placeholder="Opcional." {...field} />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="inscricoes" className="pt-4 space-y-4 animate-in fade-in duration-300">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <FormField
                                control={form.control}
                                name="inscricao_estadual"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-muted-foreground text-[12px] font-bold uppercase">Inscrição Estadual</FormLabel>
                                        <FormControl>
                                            <Input className="h-9 border-[#EAECF0]" {...field} />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="inscricao_municipal"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-muted-foreground text-[12px] font-bold uppercase">Inscrição Municipal</FormLabel>
                                        <FormControl>
                                            <Input className="h-9 border-[#EAECF0]" {...field} />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="inscricao_suframa"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-muted-foreground text-[12px] font-bold uppercase">Inscrição SUFRAMA</FormLabel>
                                        <FormControl>
                                            <Input className="h-9 border-[#EAECF0]" {...field} />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                            <div className="flex flex-col gap-2 pt-4">
                                <FormField
                                    control={form.control}
                                    name="optante_simples"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-row items-center gap-2 space-y-0">
                                            <FormControl>
                                                <Checkbox
                                                    checked={field.value}
                                                    onCheckedChange={(checked) => field.onChange(checked === true)}
                                                    className="border-[#EAECF0]"
                                                />
                                            </FormControl>
                                            <FormLabel className="text-xs text-muted-foreground font-normal">
                                                Optante do Simples Nacional
                                            </FormLabel>
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="produtor_rural"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-row items-center gap-2 space-y-0">
                                            <FormControl>
                                                <Checkbox
                                                    checked={field.value}
                                                    onCheckedChange={(checked) => field.onChange(checked === true)}
                                                    className="border-[#EAECF0]"
                                                />
                                            </FormControl>
                                            <FormLabel className="text-xs text-muted-foreground font-normal">
                                                É um Produtor Rural
                                            </FormLabel>
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="contribuinte"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-row items-center gap-2 space-y-0">
                                            <FormControl>
                                                <Checkbox
                                                    checked={field.value}
                                                    onCheckedChange={(checked) => field.onChange(checked === true)}
                                                    className="border-[#EAECF0]"
                                                />
                                            </FormControl>
                                            <FormLabel className="text-xs text-muted-foreground font-normal">
                                                Contribuinte
                                            </FormLabel>
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <FormField
                                control={form.control}
                                name="tipo_atividade"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-muted-foreground text-[12px] font-bold uppercase">Tipo de Atividade</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger className="h-9 border-[#EAECF0]">
                                                    <SelectValue placeholder="Selecione" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="servicos">Serviços</SelectItem>
                                                <SelectItem value="comercio">Comércio</SelectItem>
                                                <SelectItem value="industria">Indústria</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </FormItem>
                                )}
                            />
                            <div className="md:col-span-2">
                                <FormField
                                    control={form.control}
                                    name="cnae"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-muted-foreground text-[12px] font-bold uppercase">CNAE Principal</FormLabel>
                                            {cnaeOpcoes.length > 0 ? (
                                                <Select
                                                    onValueChange={(value) => {
                                                        field.onChange(value);
                                                        const found = cnaeOpcoes.find((o) => o.codigo === value);
                                                        setCnaeDescricao(found?.descricao || "");
                                                    }}
                                                    value={field.value}
                                                >
                                                    <FormControl>
                                                        <SelectTrigger className="h-9 border-[#EAECF0]">
                                                            <SelectValue placeholder="Selecione" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {cnaeOpcoes.map((opt) => (
                                                            <SelectItem key={`${opt.origem}-${opt.codigo}`} value={opt.codigo}>
                                                                {opt.codigo} - {opt.descricao}{opt.origem === "principal" ? " (principal)" : ""}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            ) : (
                                                <FormControl>
                                                    <div className="relative">
                                                        <Input
                                                            className="h-9 border-[#EAECF0] pr-8"
                                                            {...field}
                                                            onChange={(e) => {
                                                                field.onChange(e);
                                                                if (cnaeDescricao) setCnaeDescricao("");
                                                            }}
                                                        />
                                                        <Search className="w-4 h-4 text-muted-foreground absolute right-2 top-2.5" />
                                                    </div>
                                                </FormControl>
                                            )}
                                            {cnaeDescricao ? (
                                                <div className="text-[12px] text-muted-foreground mt-1">{cnaeDescricao}</div>
                                            ) : null}
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <div className="md:col-span-2">
                                <FormField
                                    control={form.control}
                                    name="observacoes_internas"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-muted-foreground text-[12px] font-bold uppercase">Observações Internas</FormLabel>
                                            <FormControl>
                                                <Textarea className="min-h-[100px] border-[#EAECF0] text-xs" {...field} />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <div className="md:col-span-2">
                                <FormField
                                    control={form.control}
                                    name="observacoes"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-muted-foreground text-[12px] font-bold uppercase">Observações Detalhadas</FormLabel>
                                            <FormControl>
                                                <div className="relative">
                                                    <Textarea className="min-h-[100px] border-[#EAECF0] text-xs" {...field} />
                                                    <FileText className="w-4 h-4 text-muted-foreground absolute right-2 bottom-2" />
                                                </div>
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>

                <div className="flex justify-end gap-3 pt-6 border-t mt-4">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={onSuccess}
                        className="text-muted-foreground hover:bg-[#F6F2EB]"
                    >
                        Cancelar
                    </Button>
                    <Button
                        type="submit"
                        className="bg-green-600 hover:bg-green-700 text-white font-bold px-8 shadow-sm transition-all active:scale-95"
                    >
                        {initialData ? "Salvar Alterações" : "Salvar Fornecedor"}
                    </Button>
                </div>
            </form>
        </Form>
    );
}
