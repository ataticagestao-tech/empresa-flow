export interface CompanyPermissionFlags {
  can_view: boolean;
  can_edit: boolean;
  can_create: boolean;
  can_delete: boolean;
}

export const NO_COMPANY_PERMISSIONS: CompanyPermissionFlags = {
  can_view: false,
  can_edit: false,
  can_create: false,
  can_delete: false,
};

export const FULL_COMPANY_PERMISSIONS: CompanyPermissionFlags = {
  can_view: true,
  can_edit: true,
  can_create: true,
  can_delete: true,
};

export function normalizePermissionFlags(
  data: Partial<CompanyPermissionFlags> | null | undefined,
): CompanyPermissionFlags {
  if (!data) {
    return NO_COMPANY_PERMISSIONS;
  }

  const canDelete = data.can_delete === true;
  const canEdit = data.can_edit === true || canDelete;
  const canCreate = data.can_create === true || canEdit;
  const canView = data.can_view === true || canCreate;

  return {
    can_view: canView,
    can_edit: canEdit,
    can_create: canCreate,
    can_delete: canDelete,
  };
}

export function normalizeCompanyPermissions(
  data: Partial<CompanyPermissionFlags> | null | undefined,
): CompanyPermissionFlags {
  return normalizePermissionFlags(data);
}
