import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";

export interface ProfessionalSelf {
    id: string;
    company_id: string;
    name: string | null;
    nome_completo: string | null;
}

/**
 * Funcionário vinculado ao usuário logado (employees.user_id = auth.uid()).
 * A policy `employees_select_self` libera a leitura da própria linha mesmo para
 * usuários que NÃO estão em user_companies (o caso do profissional).
 *
 * Retorna `employee = null` quando o usuário logado não é um profissional.
 */
export function useProfessionalSelf() {
    const { activeClient, user } = useAuth();

    const { data: employee = null, isLoading } = useQuery({
        queryKey: ["professional_self", user?.id],
        queryFn: async (): Promise<ProfessionalSelf | null> => {
            if (!user?.id) return null;
            const { data, error } = await (activeClient as any)
                .from("employees")
                .select("id, company_id, name, nome_completo")
                .eq("user_id", user.id)
                .maybeSingle();
            if (error) return null;
            return (data as ProfessionalSelf) || null;
        },
        enabled: !!user?.id,
        staleTime: 5 * 60 * 1000,
    });

    return { employee, isProfessional: !!employee, isLoading };
}
