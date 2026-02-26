// Tipos para o sistema de administração

export interface AdminUser {
  id: string;
  user_id: string;
  email: string;
  is_super_admin: boolean;
  created_at: string;
}

export interface UserCompanyPermission {
  id: string;
  user_id: string;
  company_id: string;
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_create: boolean;
  granted_by: string | null;
  created_at: string;
  updated_at: string;
}

export type UserStatus = 'active' | 'suspended' | 'deleted';

export interface UserProfile {
  id: string;
  full_name: string;
  email: string | null;
  avatar_url: string | null;
  status: UserStatus;
  status_reason?: string | null;
  status_updated_at?: string | null;
  status_updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserWithPermissions extends UserProfile {
  permissions: UserCompanyPermission[];
}

export interface CompanyPermissionInput {
  company_id: string;
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_create: boolean;
}

export interface CreateUserInput {
  email: string;
  full_name: string;
  password?: string; // Se não fornecido, envia convite por email
  existing_user_id?: string;
  permissions: CompanyPermissionInput[];
}

export interface UpdateUserPermissionsInput {
  user_id: string;
  permissions: CompanyPermissionInput[];
}
