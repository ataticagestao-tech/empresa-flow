import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Product } from "@/types/product";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";

const NONE = "__none__";

/* ── Máscara monetária ── */
const formatarMoeda = (valor: string): string => {
    const apenasDigitos = valor.replace(/\D/g, "");
    if (apenasDigitos === "" || apenasDigitos === "0") return "";
    const numero = parseInt(apenasDigitos, 10) / 100;
    return numero.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 2,
    });
};

const parseMoeda = (valor: string): number => {
    if (!valor) return 0;
    const limpo = valor.replace(/[R$\s.]/g, "").replace(",", ".");
    const numero = parseFloat(limpo);
    return isNaN(numero) ? 0 : numero;
};

const numberToMoeda = (n: number): string => {
    if (!n || n === 0) return "";
    return n.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 2,
    });
};

/* ── Gerador de código sequencial ── */
const gerarCodigoProduto = async (client: any, companyId: string): Promise<string> => {
    try {
        const { data, error } = await client
            .from("products")
            .select("code")
            .eq("company_id", companyId)
            .not("code", "is", null)
            .order("code", { ascending: false })
            .limit(1);

        if (error || !data || data.length === 0) return "PRD-0001";

        const ultimo = data[0].code as string;
        const match = ultimo.match(/(\d+)$/);
        if (!match) return "PRD-0001";

        const proximo = parseInt(match[1]) + 1;
        return `PRD-${String(proximo).padStart(4, "0")}`;
    } catch {
        return "PRD-0001";
    }
};

/* ── Schema ── */
const formSchema = z.object({
    description: z.string().min(1, "Nome é obrigatório"),
    type: z.string().min(1, "Tipo é obrigatório"),
    family: z.string().optional(),
    account_id: z.string().optional(),
    taxation_type: z.string().optional(),
    ncm: z.string().optional(),
    cest: z.string().optional(),
    is_active: z.string().default("ativo"),
});

interface ProductFormProps {
    product?: Product;
    onSuccess: () => void;
    onCancel?: () => void;
}

export function ProductForm({ product, onSuccess, onCancel }: ProductFormProps) {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const queryClient = useQueryClient();

    const [codigoGerado, setCodigoGerado] = useState(product?.code || "");
    const [preco, setPreco] = useState("");
    const [custo, setCusto] = useState("");

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            description: "",
            type: "produto",
            family: NONE,
            account_id: NONE,
            taxation_type: "",
            ncm: "",
            cest: "",
            is_active: "ativo",
        },
    });

    // Gerar código automático ao abrir (novo produto)
    useEffect(() => {
        if (!product && selectedCompany?.id) {
            gerarCodigoProduto(activeClient, selectedCompany.id).then(setCodigoGerado);
        }
    }, [product, selectedCompany?.id, activeClient]);

    // Preencher form ao editar
    useEffect(() => {
        if (product) {
            setCodigoGerado(product.code || "");
            setPreco(numberToMoeda(product.price));
            setCusto(numberToMoeda(product.cost_price));
            form.reset({
                description: product.description,
                type: product.activity || "produto",
                family: product.family || NONE,
                account_id: (product as any).conta_contabil_id || (product as any).account_id || NONE,
                taxation_type: product.taxation_type || "",
                ncm: product.ncm || "",
                cest: product.cest || "",
                is_active: product.is_active ? "ativo" : "inativo",
            });
        }
    }, [product, form]);

    // Buscar departamentos para o select de Família
    const { data: departamentos } = useQuery({
        queryKey: ["departments-list", selectedCompany?.id],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data, error } = await activeClient
                .from("departments")
                .select("id, name")
                .eq("company_id", selectedCompany.id)
                .order("name");
            if (error) return [];
            return data || [];
        },
        enabled: !!selectedCompany?.id,
    });

    // Buscar plano de contas
    const { data: contas } = useQuery({
        queryKey: ["chart_of_accounts-list", selectedCompany?.id],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data, error } = await activeClient
                .from("chart_of_accounts")
                .select("id, code, name")
                .eq("company_id", selectedCompany.id)
                .order("code");
            if (error) return [];
            return data || [];
        },
        enabled: !!selectedCompany?.id,
    });

    // Cálculo do líquido
    const precoNum = parseMoeda(preco);
    const custoNum = parseMoeda(custo);
    const liquido = precoNum - custoNum;

    const mutation = useMutation({
        mutationFn: async (values: z.infer<typeof formSchema>) => {
            if (!selectedCompany) throw new Error("Empresa não selecionada");

            const familyValue = values.family === NONE ? null : (values.family || null);
            const contaContabilValue = values.account_id === NONE ? null : (values.account_id || null);

            const payload: any = {
                company_id: selectedCompany.id,
                code: codigoGerado,
                description: values.description.trim(),
                activity: values.type,
                family: familyValue,
                price: parseMoeda(preco),
                cost_price: parseMoeda(custo),
                taxation_type: values.taxation_type || null,
                ncm: values.ncm || null,
                cest: values.cest || null,
                is_active: values.is_active === "ativo",
                conta_contabil_id: contaContabilValue,
            };

            const doSave = async (p: Record<string, any>) => {
                if (product) {
                    return await activeClient.from("products").update(p).eq("id", product.id);
                }
                return await activeClient.from("products").insert(p);
            };

            let { error } = await doSave(payload);

            // Retry without conta_contabil_id if column doesn't exist yet
            if (error && error.message?.includes("conta_contabil_id")) {
                delete payload.conta_contabil_id;
                ({ error } = await doSave(payload));
            }

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["products"] });
            toast.success(product ? "Produto atualizado!" : "Produto criado!");
            onSuccess();
        },
        onError: (error) => {
            console.error(error);
            toast.error("Erro ao salvar produto");
        },
    });

    const onSubmit = (values: z.infer<typeof formSchema>) => {
        mutation.mutate(values);
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 p-4">
                {/* Linha 1 — Código + Tipo */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-[12px] font-bold text-[#555] uppercase tracking-wider mb-1.5">
                            Código
                        </label>
                        <div className="bg-[#ECFDF4] border-[1.5px] border-[#059669] rounded px-3 py-2 text-[13px] font-bold text-[#059669]">
                            {codigoGerado || "Gerando..."}
                        </div>
                    </div>
                    <FormField
                        control={form.control}
                        name="type"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-[12px] font-bold text-[#555] uppercase tracking-wider">
                                    Tipo <span className="text-[#E53E3E]">*</span>
                                </FormLabel>
                                <FormControl>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <SelectTrigger className="text-[13px]">
                                            <SelectValue placeholder="Selecione" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="produto">Produto</SelectItem>
                                            <SelectItem value="servico">Serviço</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                {/* Linha 2 — Nome */}
                <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel className="text-[12px] font-bold text-[#555] uppercase tracking-wider">
                                Nome / Descrição <span className="text-[#E53E3E]">*</span>
                            </FormLabel>
                            <FormControl>
                                <Input placeholder="Nome do produto ou serviço" className="text-[13px]" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {/* Linha 3 — Família + Conta contábil */}
                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="family"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-[12px] font-bold text-[#555] uppercase tracking-wider">
                                    Família
                                </FormLabel>
                                <FormControl>
                                    <Select onValueChange={field.onChange} value={field.value || NONE}>
                                        <SelectTrigger className="text-[13px]">
                                            <SelectValue placeholder="Selecionar família" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={NONE}>Nenhuma</SelectItem>
                                            {departamentos?.map((d: any) => (
                                                <SelectItem key={d.id} value={d.name}>
                                                    {d.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="account_id"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-[12px] font-bold text-[#555] uppercase tracking-wider">
                                    Conta Contábil
                                </FormLabel>
                                <FormControl>
                                    <Select onValueChange={field.onChange} value={field.value || NONE}>
                                        <SelectTrigger className="text-[13px]">
                                            <SelectValue placeholder="Selecionar conta" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={NONE}>Nenhuma</SelectItem>
                                            {contas?.map((c: any) => (
                                                <SelectItem key={c.id} value={c.id}>
                                                    {c.code} - {c.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                {/* Linha 4 — Custo + Preço + Líquido */}
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <label className="block text-[12px] font-bold text-[#555] uppercase tracking-wider mb-1.5">
                            Custo
                        </label>
                        <Input
                            value={custo}
                            onChange={(e) => setCusto(formatarMoeda(e.target.value))}
                            placeholder="R$ 0,00"
                            className="text-[13px]"
                        />
                    </div>
                    <div>
                        <label className="block text-[12px] font-bold text-[#555] uppercase tracking-wider mb-1.5">
                            Preço <span className="text-[#E53E3E]">*</span>
                        </label>
                        <Input
                            value={preco}
                            onChange={(e) => setPreco(formatarMoeda(e.target.value))}
                            placeholder="R$ 0,00"
                            className="text-[13px]"
                        />
                    </div>
                    <div>
                        <label className="block text-[12px] font-bold text-[#555] uppercase tracking-wider mb-1.5">
                            Líquido
                        </label>
                        <div className="bg-[#ECFDF4] border border-[#ccc] rounded px-3 py-2 text-[13px] font-bold text-[#059669]">
                            {liquido
                                ? liquido.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                                : "R$ 0,00"}
                        </div>
                    </div>
                </div>

                {/* Linha 5 — NCM + CEST + Tributação */}
                <div className="grid grid-cols-3 gap-4">
                    <FormField
                        control={form.control}
                        name="ncm"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-[12px] font-bold text-[#555] uppercase tracking-wider">
                                    NCM
                                </FormLabel>
                                <FormControl>
                                    <Input placeholder="0000.00.00" className="text-[13px]" {...field} />
                                </FormControl>
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="cest"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-[12px] font-bold text-[#555] uppercase tracking-wider">
                                    CEST
                                </FormLabel>
                                <FormControl>
                                    <Input placeholder="00.000.00" className="text-[13px]" {...field} />
                                </FormControl>
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="taxation_type"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-[12px] font-bold text-[#555] uppercase tracking-wider">
                                    Tributação
                                </FormLabel>
                                <FormControl>
                                    <Input placeholder="Ex: Simples Nacional" className="text-[13px]" {...field} />
                                </FormControl>
                            </FormItem>
                        )}
                    />
                </div>

                {/* Status */}
                <FormField
                    control={form.control}
                    name="is_active"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel className="text-[12px] font-bold text-[#555] uppercase tracking-wider">
                                Status
                            </FormLabel>
                            <FormControl>
                                <div className="flex gap-4 mt-1">
                                    <label className="flex items-center gap-2 cursor-pointer text-[13px]">
                                        <input
                                            type="radio"
                                            name="status"
                                            value="ativo"
                                            checked={field.value === "ativo"}
                                            onChange={() => field.onChange("ativo")}
                                            className="accent-[#059669]"
                                        />
                                        Ativo
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer text-[13px]">
                                        <input
                                            type="radio"
                                            name="status"
                                            value="inativo"
                                            checked={field.value === "inativo"}
                                            onChange={() => field.onChange("inativo")}
                                            className="accent-[#059669]"
                                        />
                                        Inativo
                                    </label>
                                </div>
                            </FormControl>
                        </FormItem>
                    )}
                />

                {/* Botões */}
                <div className="flex justify-end gap-2 pt-4 border-t border-[#eee]">
                    {onCancel && (
                        <Button type="button" variant="outline" onClick={onCancel}
                            className="bg-white border-[#ccc] text-[#1D2939] text-[12px] font-bold">
                            Cancelar
                        </Button>
                    )}
                    <Button type="submit" disabled={mutation.isPending}
                        className="bg-[#059669] hover:bg-[#0f1f33] text-white text-[12px] font-bold">
                        {mutation.isPending ? "Salvando..." : "Salvar"}
                    </Button>
                </div>
            </form>
        </Form>
    );
}
