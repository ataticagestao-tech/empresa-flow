import type { PlanoId } from "@/config/entitlements";

/** Preço base por plano (vem de tatica_config.precos_planos). */
export interface PrecosPlanos {
  assistente: number;
  controller: number;
  gestor: number;
}

export function precoDoPlano(
  plano: PlanoId | null | undefined,
  precos?: Partial<PrecosPlanos> | null,
): number {
  if (!plano) return 0;
  return Number(precos?.[plano] ?? 0);
}

/**
 * Preço efetivo da mensalidade de uma empresa:
 * override da empresa (se houver) senão o preço base do plano.
 */
export function precoEfetivo(
  plano: PlanoId | null | undefined,
  override: number | null | undefined,
  precos?: Partial<PrecosPlanos> | null,
): number {
  if (override != null && Number.isFinite(Number(override))) return Number(override);
  return precoDoPlano(plano, precos);
}
