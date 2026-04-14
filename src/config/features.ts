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

/**
 * Fallback: empresas cuja razao_social ou nome_fantasia contem um destes termos
 * tambem recebem a feature (defesa contra UUID hardcoded desalinhado do banco).
 */
const CONTRATOS_NAME_FALLBACK = ["HAIR OF BRASIL"];

export function hasContratos(companyId: string | null | undefined): boolean {
  if (!companyId) return false;
  return COMPANIES_WITH_CONTRATOS.includes(companyId);
}

export function hasContratosByCompany(
  company: { id?: string | null; razao_social?: string | null; nome_fantasia?: string | null } | null | undefined
): boolean {
  if (!company) return false;
  if (company.id && COMPANIES_WITH_CONTRATOS.includes(company.id)) return true;
  const hay = `${company.razao_social || ""} ${company.nome_fantasia || ""}`.toUpperCase();
  return CONTRATOS_NAME_FALLBACK.some((term) => hay.includes(term));
}
