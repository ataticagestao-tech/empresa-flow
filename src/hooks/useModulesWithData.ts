import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import {
  DATA_SOURCES,
  resolvePresenceForPath,
} from "@/config/moduleDataSources";

/**
 * Descobre quais módulos têm dados na empresa selecionada — base do MENU ENXUTO.
 *
 * Conta (em lote, head-only) cada tabela de DATA_SOURCES filtrando por empresa,
 * e expõe `hasData(url)` que resolve a regra de presença da rota.
 *
 * Garantias:
 *  - Só roda quando `enabled` (usuário com lean_menu) e há empresa → custo zero
 *    para a dona/operadores normais.
 *  - "Falha mostrando": se uma contagem der erro (coluna/tabela divergente), a
 *    fonte é tratada como NÃO-vazia → a tela aparece. Nunca esconde dado real.
 *  - Enquanto carrega, `hasData` é otimista (mostra) para evitar menu piscando
 *    vazio; telas `hideWhenLean` já somem de imediato.
 */
export function useModulesWithData(enabled: boolean): {
  hasData: (url?: string) => boolean;
  isLoading: boolean;
} {
  const { activeClient } = useAuth();
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;

  const queryEnabled = enabled && !!companyId;

  const { data: nonEmpty, isLoading } = useQuery({
    queryKey: ["modules-with-data", companyId],
    enabled: queryEnabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Set<string>> => {
      const result = new Set<string>();
      await Promise.all(
        Object.entries(DATA_SOURCES).map(async ([key, src]) => {
          try {
            let q = (activeClient as any)
              .from(src.table)
              .select("*", { count: "exact", head: true })
              .eq(src.companyCol, companyId);
            if (src.softDelete) q = q.is("deleted_at", null);
            const { count, error } = await q;
            if (error) {
              result.add(key); // falha mostrando
              return;
            }
            if ((count ?? 0) > 0) result.add(key);
          } catch {
            result.add(key); // falha mostrando
          }
        })
      );
      return result;
    },
  });

  const nonEmptySet = nonEmpty ?? new Set<string>();
  const stillLoading = queryEnabled && isLoading;

  const hasData = (url?: string): boolean => {
    if (!url) return true; // item-pai sem url: visibilidade vem dos filhos
    const rule = resolvePresenceForPath(url);
    if (!rule) return true; // rota não mapeada → não gateia
    if (rule.kind === "always") return true;
    if (rule.kind === "hideWhenLean") return false;
    // anyOf
    if (stillLoading) return true; // otimista enquanto conta
    return rule.sources.some((s) => nonEmptySet.has(s));
  };

  return { hasData, isLoading: stillLoading };
}
