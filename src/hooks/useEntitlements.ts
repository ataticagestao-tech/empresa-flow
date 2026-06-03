import { useMemo } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { useAdmin } from "@/contexts/AdminContext";
import {
  getPlanModules,
  getPlanLimits,
  hasModule as hasModuleFn,
  type ModuleId,
  type LimitKey,
} from "@/config/entitlements";

/**
 * Entitlements da empresa ativa (modularização por pacote).
 *
 * - `hasModule(id)` → o módulo está liberado? Super-admin e empresa sem plano
 *   (legado) liberam tudo; `core`/undefined sempre true.
 * - `limitFor(key)` → limite efetivo do pacote (Infinity p/ super-admin / sem plano).
 *
 * Tudo deriva de `selectedCompany.plano` + `plano_config` (CompanyContext).
 */
export function useEntitlements() {
  const { selectedCompany } = useCompany();
  const { isSuperAdmin } = useAdmin();

  const plano = selectedCompany?.plano ?? null;
  const config = selectedCompany?.plano_config ?? null;

  const modules = useMemo(() => getPlanModules(plano, config), [plano, config]);
  const limits = useMemo(() => getPlanLimits(plano, config), [plano, config]);

  const hasModule = (moduleId?: ModuleId | null) =>
    isSuperAdmin || hasModuleFn(modules, moduleId);

  const limitFor = (key: LimitKey): number =>
    isSuperAdmin ? Infinity : limits[key];

  return { hasModule, limitFor, plano, isSuperAdmin };
}

export interface LimitState {
  limit: number;
  used: number;
  remaining: number;
  atLimit: boolean;
  isUnlimited: boolean;
}

/**
 * Estado de um limite do pacote dado o uso atual (a página passa `used`,
 * que ela já tem em mãos). Super-admin / empresa sem plano = ilimitado.
 */
export function useLimit(key: LimitKey, used: number): LimitState {
  const { limitFor } = useEntitlements();
  const limit = limitFor(key);
  const isUnlimited = !Number.isFinite(limit);
  return {
    limit,
    used,
    remaining: isUnlimited ? Infinity : Math.max(0, limit - used),
    atLimit: !isUnlimited && used >= limit,
    isUnlimited,
  };
}
