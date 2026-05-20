import type { ReactNode } from 'react';
import { useRole, type Role } from '@/hooks/useRole';

interface RoleGateProps {
  /**
   * Role mínimo necessário pra mostrar os children.
   * Hierarquia: owner > operador > visualizador.
   */
  minRole: Role;
  /**
   * Empresa específica pra checar o role. Default: empresa selecionada no
   * CompanyContext.
   */
  companyId?: string;
  /**
   * Conteúdo a renderizar se o usuário tem o role exigido.
   */
  children: ReactNode;
  /**
   * Conteúdo alternativo se o usuário NÃO tem o role exigido. Default: null
   * (botão/ação simplesmente some).
   */
  fallback?: ReactNode;
}

/**
 * Esconde children se o usuário não tem o role mínimo na empresa.
 *
 * Uso típico: <RoleGate minRole="owner"><Button>Excluir</Button></RoleGate>
 *
 * Importante: isso é UI cosmética. A defesa real é a policy RBAC no banco
 * (migration 20260520140000_roles_permissoes.sql). RoleGate só evita que
 * o usuário clique num botão que ia falhar com erro de permissão.
 */
export function RoleGate({ minRole, companyId, children, fallback = null }: RoleGateProps) {
  const { hasAtLeast, isLoading } = useRole(companyId);

  // Durante loading, esconde (mais restritivo — evita flash de botão e clique
  // antes da query resolver).
  if (isLoading) return <>{fallback}</>;
  if (!hasAtLeast(minRole)) return <>{fallback}</>;
  return <>{children}</>;
}
