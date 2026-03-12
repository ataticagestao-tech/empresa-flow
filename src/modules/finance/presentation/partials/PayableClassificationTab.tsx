
import { UseFormReturn } from "react-hook-form";
import { AccountsPayable } from "../../domain/schemas/accounts-payable.schema";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useCategorySuggestion } from "../hooks/useCategorySuggestion";
import { CategorySuggestions } from "../components/CategorySuggestions";

interface PayableClassificationTabProps {
    form: UseFormReturn<AccountsPayable>;
}

export function PayableClassificationTab({ form }: PayableClassificationTabProps) {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();

    // Queries
    const { data: categories } = useQuery({
        queryKey: ["chart_of_accounts", selectedCompany?.id, 'despesa'],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data } = await activeClient
                .from("chart_of_accounts")
                .select("*")
                .eq("company_id", selectedCompany.id)
                .eq("type", 'despesa')
                .order('code');
            return data || [];
        },
        enabled: !!selectedCompany?.id
    });

    // IA Sugestiva: analisa a descrição e sugere categorias
    const description = form.watch("description") || "";
    const { suggestions } = useCategorySuggestion(description, categories || [], "despesa");

    const { data: projects } = useQuery({
        queryKey: ["projects", selectedCompany?.id],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data } = await activeClient.from("projects").select("id, name").eq("company_id", selectedCompany.id);
            return data || [];
        },
        enabled: !!selectedCompany?.id
    });

    const { data: departments } = useQuery({
        queryKey: ["departments", selectedCompany?.id],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data } = await activeClient.from("departments").select("id, name").eq("company_id", selectedCompany.id);
            return data || [];
        },
        enabled: !!selectedCompany?.id
    });


    return (
        <div className="space-y-4 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                    control={form.control}
                    name="category_id"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Categoria (Plano de Contas)</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || "none"}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger></FormControl>
                                <SelectContent>
                                    <SelectItem value="none">-- Nenhuma --</SelectItem>
                                    {categories?.map((c: any) => (
                                        <SelectItem key={c.id} value={c.id}>{c.code} - {c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <CategorySuggestions
                                suggestions={suggestions}
                                onSelect={(id) => form.setValue("category_id", id)}
                                currentValue={form.watch("category_id")}
                            />
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="project_id"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Projeto</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || "none"}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger></FormControl>
                                <SelectContent>
                                    <SelectItem value="none">-- Nenhum --</SelectItem>
                                    {projects?.map((p: any) => (
                                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="department_id"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Departamento</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || "none"}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger></FormControl>
                                <SelectContent>
                                    <SelectItem value="none">-- Nenhum --</SelectItem>
                                    {departments?.map((d: any) => (
                                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>
        </div>
    );
}
