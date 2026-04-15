import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Company, CompanyFormData } from "@/types/company";
import { toast } from "sonner";

export function useCompanies(userId?: string) {
    const queryClient = useQueryClient();
    const { activeClient, isUsingSecondary } = useAuth();

    const buildSuggestedCategories = (activityProfile?: Company["activity_profile"]) => {
        const add = (
            list: Array<{ name: string; type: "income" | "expense"; description?: string | null; code?: string | null }>,
            item: { name: string; type: "income" | "expense"; description?: string | null; code?: string | null },
        ) => {
            if (!list.some((c) => c.type === item.type && c.name.toLowerCase() === item.name.toLowerCase())) list.push(item);
        };

        const categories: Array<{ name: string; type: "income" | "expense"; description?: string | null; code?: string | null }> = [];

        add(categories, { name: "Receitas Diversas", type: "income", description: "Outras receitas não categorizadas" });
        add(categories, { name: "Despesas Administrativas", type: "expense", description: "Custos administrativos e gerais" });
        add(categories, { name: "Tarifas Bancárias", type: "expense", description: "Tarifas, taxas e serviços bancários" });
        add(categories, { name: "Impostos e Tributos", type: "expense", description: "DAS/ISS/ICMS e demais tributos" });

        if (activityProfile === "servico" || activityProfile === "mista") {
            add(categories, { name: "Serviços", type: "income", description: "Receita de prestação de serviços" });
            add(categories, { name: "Mensalidades", type: "income", description: "Planos, recorrências e contratos" });
            add(categories, { name: "Folha de Pagamento", type: "expense", description: "Salários, encargos e benefícios" });
            add(categories, { name: "Prestadores e Terceiros", type: "expense", description: "Serviços de terceiros e freelancers" });
            add(categories, { name: "Software e Ferramentas", type: "expense", description: "SaaS, licenças e assinaturas" });
        }

        if (activityProfile === "comercio" || activityProfile === "mista") {
            add(categories, { name: "Vendas de Produtos", type: "income", description: "Receita de vendas de mercadorias" });
            add(categories, { name: "Frete e Logística", type: "expense", description: "Fretes, entregas e logística" });
            add(categories, { name: "Compras de Mercadorias (CMV)", type: "expense", description: "Aquisição de mercadorias para revenda" });
            add(categories, { name: "Taxas de Cartão", type: "expense", description: "Taxas e antecipações de cartão" });
        }

        add(categories, { name: "Marketing e Vendas", type: "expense", description: "Anúncios, campanhas e comissões" });

        return categories;
    };

    const { data: companies, isLoading, error, refetch } = useQuery({
        // Include isUsingSecondary in queryKey to differentiate cache between DBs
        queryKey: ["companies", isUsingSecondary, userId],
        queryFn: async () => {
            if (!userId) return [];

            const { data: accessRows, error: accessError } = await activeClient
                .from("user_companies")
                .select("company:companies(*)")
                .eq("user_id", userId);

            if (!accessError) {
                const mapped = (accessRows || [])
                    .map((row: any) => row.company)
                    .filter((c: any) => c && c.is_active);
                mapped.sort((a: any, b: any) => (a.razao_social || "").localeCompare(b.razao_social || ""));
                return mapped as Company[];
            }

            const { data: companiesData, error: companiesError } = await activeClient
                .from("companies")
                .select("*")
                .eq("is_active", true)
                .order("razao_social");

            if (companiesError) throw companiesError;
            return (companiesData || []) as Company[];
        },
        enabled: !!userId,
    });

    const suggestCategoriesMutation = useMutation({
        mutationFn: async (params: { companyId: string; activityProfile?: Company["activity_profile"] }) => {
            const { companyId, activityProfile } = params;
            const { data: existing, error: existingError } = await activeClient
                .from("categories")
                .select("id, name, type")
                .eq("company_id", companyId);
            if (existingError) throw existingError;

            const existingSet = new Set(
                (existing || []).map((c: any) => `${String(c.type).toLowerCase()}::${String(c.name).toLowerCase().trim()}`),
            );

            const suggested = buildSuggestedCategories(activityProfile);
            const payload = suggested
                .filter((c) => !existingSet.has(`${c.type.toLowerCase()}::${c.name.toLowerCase().trim()}`))
                .map((c) => ({
                    company_id: companyId,
                    name: c.name,
                    type: c.type,
                    description: c.description ?? null,
                    code: c.code ?? null,
                    is_active: true,
                }));

            if (!payload.length) return { inserted: 0 };

            const { error: insertError } = await activeClient.from("categories").insert(payload);
            if (insertError) throw insertError;

            return { inserted: payload.length };
        },
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries({ queryKey: ["categories", variables.companyId, isUsingSecondary] });
            if (data.inserted > 0) {
                toast.success(`${data.inserted} categoria(s) sugerida(s) adicionada(s)!`);
            } else {
                toast.success("Nenhuma nova categoria para adicionar.");
            }
        },
        onError: () => {
            toast.error("Erro ao gerar categorias sugeridas");
        },
    });

    const createMutation = useMutation({
        mutationFn: async (data: CompanyFormData) => {
            if (!userId) throw new Error("Usuário não encontrado");

            const { data: insertedCompany, error: insertError } = await activeClient
                .from("companies")
                .insert([data])
                .select("*")
                .single();

            if (insertError) throw insertError;
            if (!insertedCompany?.id) throw new Error("Falha ao criar empresa");

            await activeClient.from("user_companies").update({ is_default: false }).eq("user_id", userId);

            const { error: linkError } = await activeClient.from("user_companies").upsert(
                [
                    {
                        user_id: userId,
                        company_id: insertedCompany.id,
                        is_default: true,
                    },
                ],
                { onConflict: "user_id,company_id" },
            );

            if (linkError) throw linkError;

            try {
                const { count, error: countError } = await activeClient
                    .from("categories")
                    .select("id", { count: "exact", head: true })
                    .eq("company_id", insertedCompany.id);

                if (!countError && (count ?? 0) === 0) {
                    const suggested = buildSuggestedCategories((data as any)?.activity_profile);
                    if (suggested.length) {
                        const payload = suggested.map((c) => ({
                            company_id: insertedCompany.id,
                            name: c.name,
                            type: c.type,
                            description: c.description ?? null,
                            code: c.code ?? null,
                            is_active: true,
                        }));
                        await activeClient.from("categories").insert(payload);
                    }
                }
            } catch (error) {
                console.error("Erro ao criar categorias sugeridas:", error);
            }

            return insertedCompany as Company;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["companies", isUsingSecondary, userId] });
            toast.success("Empresa criada com sucesso!");
        },
        onError: () => {
            toast.error("Erro ao criar empresa");
        },
    });

    const updateMutation = useMutation({
        mutationFn: async ({ id, data }: { id: string; data: CompanyFormData }) => {
            const { error } = await activeClient
                .from("companies")
                .update(data)
                .eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["companies", isUsingSecondary, userId] });
            toast.success("Empresa atualizada com sucesso!");
        },
        onError: () => {
            toast.error("Erro ao atualizar empresa");
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error: delError } = await activeClient
                .from("companies")
                .delete()
                .eq("id", id);

            if (!delError) return { softDeleted: false };

            const isFkError =
                (delError as any).code === "23503" ||
                /foreign key|violates foreign/i.test(delError.message || "");

            if (!isFkError) throw delError;

            const { error: updError } = await activeClient
                .from("companies")
                .update({ is_active: false })
                .eq("id", id);
            if (updError) throw updError;

            return { softDeleted: true };
        },
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ["companies", isUsingSecondary, userId] });
            if (result?.softDeleted) {
                toast.success("Empresa marcada como inativa (tem histórico vinculado)");
            } else {
                toast.success("Empresa excluída com sucesso!");
            }
        },
        onError: (err: any) => {
            toast.error("Erro ao excluir empresa: " + (err?.message || "desconhecido"));
        },
    });

    const forceDeleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await activeClient.rpc("delete_company_cascade", { p_company_id: id });
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["companies", isUsingSecondary, userId] });
            toast.success("Empresa e todo o histórico excluídos definitivamente");
        },
        onError: (err: any) => {
            toast.error("Erro ao excluir definitivamente: " + (err?.message || "desconhecido"));
        },
    });

    return {
        companies,
        isLoading,
        error,
        refetch,
        createCompany: createMutation,
        updateCompany: updateMutation,
        deleteCompany: deleteMutation.mutateAsync,
        forceDeleteCompany: forceDeleteMutation.mutateAsync,
        suggestCategories: suggestCategoriesMutation,
    };
}
