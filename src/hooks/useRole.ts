import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';

export type Role = 'owner' | 'operador' | 'visualizador';

const ROLE_RANK: Record<Role, number> = {
  owner: 3,
  operador: 2,
  visualizador: 1,
};

/**
 * Retorna o role do usuário autenticado na empresa selecionada (ou em uma
 * empresa específica via override). Hierarquia: owner > operador > visualizador.
 *
 * Fonte: tabela `user_companies.role` (lida do DB). Fallback: se o usuário é
 * `companies.owner_id`, considera 'owner' mesmo sem row em user_companies.
 *
 * Loading: retorna 'visualizador' (mais restritivo) até a query resolver.
 * Sem empresa selecionada: retorna 'visualizador'.
 */
export function useRole(companyIdOverride?: string): {
  role: Role;
  isOwner: boolean;
  isOperador: boolean;
  isVisualizador: boolean;
  hasAtLeast: (minRole: Role) => boolean;
  isLoading: boolean;
} {
  const { activeClient, user } = useAuth();
  const { selectedCompany } = useCompany();
  const companyId = companyIdOverride || selectedCompany?.id;

  const { data: role = 'visualizador' as Role, isLoading } = useQuery({
    queryKey: ['user_role', user?.id, companyId],
    queryFn: async (): Promise<Role> => {
      if (!user?.id || !companyId) return 'visualizador';

      // 1. Fallback owner_id: se o usuário é dono da empresa, é owner
      const { data: company } = await (activeClient as any)
        .from('companies')
        .select('owner_id')
        .eq('id', companyId)
        .maybeSingle();
      if (company?.owner_id === user.id) return 'owner';

      // 2. Lê role de user_companies
      const { data: link } = await (activeClient as any)
        .from('user_companies')
        .select('role')
        .eq('user_id', user.id)
        .eq('company_id', companyId)
        .maybeSingle();

      const r = (link?.role || 'visualizador') as Role;
      if (r === 'owner' || r === 'operador' || r === 'visualizador') return r;
      return 'visualizador';
    },
    enabled: !!user?.id && !!companyId,
    staleTime: 5 * 60 * 1000, // 5 min — role muda raramente
  });

  const hasAtLeast = (minRole: Role) => ROLE_RANK[role] >= ROLE_RANK[minRole];

  return {
    role,
    isOwner: role === 'owner',
    isOperador: role === 'operador',
    isVisualizador: role === 'visualizador',
    hasAtLeast,
    isLoading,
  };
}
