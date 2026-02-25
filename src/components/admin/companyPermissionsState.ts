export interface CompanyOption {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
}

export interface PermissionOption {
  company_id: string;
  can_view: boolean;
  can_edit: boolean;
  can_create: boolean;
  can_delete: boolean;
}

export interface CompanyPermissionState {
  company_id: string;
  company_name: string;
  enabled: boolean;
  can_view: boolean;
  can_edit: boolean;
  can_create: boolean;
  can_delete: boolean;
}

function getCompanyName(company: CompanyOption): string {
  return company.nome_fantasia || company.razao_social;
}

function normalizeFlags(flags: Pick<CompanyPermissionState, "can_view" | "can_edit" | "can_create" | "can_delete">) {
  const canDelete = flags.can_delete === true;
  const canEdit = flags.can_edit === true || canDelete;
  const canCreate = flags.can_create === true || canEdit;
  const canView = flags.can_view === true || canCreate;

  return {
    can_view: canView,
    can_edit: canEdit,
    can_create: canCreate,
    can_delete: canDelete,
  };
}

function getDefaultState(company: CompanyOption): CompanyPermissionState {
  return {
    company_id: company.id,
    company_name: getCompanyName(company),
    enabled: false,
    can_view: true,
    can_edit: false,
    can_create: true,
    can_delete: false,
  };
}

export function buildPermissionsFromExisting(
  companies: CompanyOption[],
  existingPermissions: PermissionOption[] = [],
): CompanyPermissionState[] {
  const permissionMap = new Map(
    existingPermissions.map((permission) => [permission.company_id, permission]),
  );

  return companies.map((company) => {
    const existing = permissionMap.get(company.id);
    if (!existing) return getDefaultState(company);
    const normalized = normalizeFlags(existing);

    return {
      company_id: company.id,
      company_name: getCompanyName(company),
      enabled:
        normalized.can_view ||
        normalized.can_edit ||
        normalized.can_create ||
        normalized.can_delete,
      can_view: normalized.can_view,
      can_edit: normalized.can_edit,
      can_create: normalized.can_create,
      can_delete: normalized.can_delete,
    };
  });
}

export function syncCreatePermissionsState(
  companies: CompanyOption[],
  current: CompanyPermissionState[],
): CompanyPermissionState[] {
  const currentMap = new Map(current.map((permission) => [permission.company_id, permission]));

  return companies.map((company) => {
    const existing = currentMap.get(company.id);
    if (!existing) return getDefaultState(company);

    return {
      ...existing,
      company_name: getCompanyName(company),
    };
  });
}
