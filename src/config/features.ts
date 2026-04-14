/**
 * Feature flags por empresa.
 *
 * Cada flag aqui limita uma funcionalidade a um conjunto de empresas.
 * Conforme a funcionalidade vai sendo validada, a empresa pode ser removida
 * daqui (virando disponivel para todas) ou a feature pode ser expandida.
 */

const HAIR_OF_BRASIL = "6d41eb71-e593-4ff2-8e3b-e36089a2aca7";

export const COMPANIES_WITH_CONTRATOS: string[] = [
  HAIR_OF_BRASIL,
];

export function hasContratos(companyId: string | null | undefined): boolean {
  if (!companyId) return false;
  return COMPANIES_WITH_CONTRATOS.includes(companyId);
}
