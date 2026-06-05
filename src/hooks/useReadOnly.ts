import { useRole } from "@/hooks/useRole";

/**
 * "Somente leitura" para a empresa selecionada: TRUE quando o usuário é
 * `visualizador` (não pode criar/editar/excluir).
 *
 * Use para ESCONDER botões de escrita (Novo/Editar/Excluir, FABs). É só UI — a
 * proteção real são as policies RBAC no banco (migration roles_permissoes).
 * Equivale a `!hasAtLeast('operador')`, mas com nome explícito.
 *
 * Durante o loading do papel retorna TRUE (mais restritivo) para não piscar
 * botões de escrita antes de saber o papel.
 */
export function useReadOnly(companyIdOverride?: string): {
  readOnly: boolean;
  isLoading: boolean;
} {
  const { hasAtLeast, isLoading } = useRole(companyIdOverride);
  return { readOnly: isLoading || !hasAtLeast("operador"), isLoading };
}
