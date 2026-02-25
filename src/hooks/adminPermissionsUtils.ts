import type { CompanyPermissionInput } from "@/types/admin";
import { normalizePermissionFlags } from "@/hooks/userPermissionsUtils";

export interface UserCompanyPermissionRow {
  user_id: string;
  company_id: string;
  can_view: boolean;
  can_edit: boolean;
  can_create: boolean;
  can_delete: boolean;
  granted_by: string | null;
}

export function buildPermissionRowsForUser(
  userId: string,
  permissions: CompanyPermissionInput[],
  grantedBy: string | null,
): UserCompanyPermissionRow[] {
  return permissions
    .map((permission) => {
      const normalized = normalizePermissionFlags(permission);
      return {
        company_id: permission.company_id,
        ...normalized,
      };
    })
    .filter((permission) =>
      permission.can_view || permission.can_edit || permission.can_create || permission.can_delete,
    )
    .map((permission) => ({
      user_id: userId,
      company_id: permission.company_id,
      can_view: permission.can_view,
      can_edit: permission.can_edit,
      can_create: permission.can_create,
      can_delete: permission.can_delete,
      granted_by: grantedBy,
    }));
}
