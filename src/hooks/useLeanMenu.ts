import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";

/**
 * Lê a preferência `lean_menu` do usuário autenticado na empresa selecionada.
 *
 * Quando true, o menu deve mostrar apenas as telas que têm dados na empresa
 * (ver useModulesWithData + AppTopNav). É só visibilidade de menu — não mexe em
 * permissão (papel/role é quem manda nisso).
 *
 * Fallback seguro: na dúvida (sem empresa, carregando, erro) retorna false →
 * menu completo. Nunca "esconde" sem ter confirmado a flag.
 */
export function useLeanMenu(companyIdOverride?: string): {
  leanMenu: boolean;
  isLoading: boolean;
} {
  const { activeClient, user } = useAuth();
  const { selectedCompany } = useCompany();
  const companyId = companyIdOverride || selectedCompany?.id;

  const { data: leanMenu = false, isLoading } = useQuery({
    queryKey: ["lean_menu", user?.id, companyId],
    queryFn: async (): Promise<boolean> => {
      if (!user?.id || !companyId) return false;
      const { data, error } = await (activeClient as any)
        .from("user_companies")
        .select("lean_menu")
        .eq("user_id", user.id)
        .eq("company_id", companyId)
        .maybeSingle();
      if (error || !data) return false;
      return data.lean_menu === true;
    },
    enabled: !!user?.id && !!companyId,
    staleTime: 5 * 60 * 1000, // muda raramente
  });

  return { leanMenu, isLoading };
}
