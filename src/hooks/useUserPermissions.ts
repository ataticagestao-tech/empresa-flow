import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/contexts/AdminContext";
import {
  UserCompanyPermission,
  CompanyPermissionInput,
  UpdateUserPermissionsInput,
} from "@/types/admin";
import { useToast } from "@/components/ui/use-toast";
import {
  FULL_COMPANY_PERMISSIONS,
  NO_COMPANY_PERMISSIONS,
  normalizePermissionFlags,
  normalizeCompanyPermissions,
} from "@/hooks/userPermissionsUtils";

export function useUserPermissions(userId?: string) {
  const { activeClient, user } = useAuth();
  const { isSuperAdmin } = useAdmin();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Buscar permissões de um usuário específico
  const {
    data: permissions,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["user-permissions", userId],
    queryFn: async () => {
      if (!userId) return [];

      const { data, error } = await activeClient
        .from("user_company_permissions")
        .select(
          `
          *,
          company:companies(id, razao_social, nome_fantasia)
        `
        )
        .eq("user_id", userId);

      if (error) throw error;

      return data as (UserCompanyPermission & {
        company: { id: string; razao_social: string; nome_fantasia: string | null };
      })[];
    },
    enabled: !!userId && (isSuperAdmin || userId === user?.id),
  });

  // Buscar todas as empresas disponíveis (para o modal de permissões)
  const { data: allCompanies } = useQuery({
    queryKey: ["all-companies-admin"],
    queryFn: async () => {
      const { data, error } = await activeClient
        .from("companies")
        .select("id, razao_social, nome_fantasia")
        .eq("is_active", true)
        .order("razao_social");

      if (error) throw error;
      return data;
    },
    enabled: isSuperAdmin,
  });

  // Atualizar permissões de um usuário
  const updatePermissionsMutation = useMutation({
    mutationFn: async (input: UpdateUserPermissionsInput) => {
      // Deletar permissões existentes
      const { error: deleteError } = await activeClient
        .from("user_company_permissions")
        .delete()
        .eq("user_id", input.user_id);
      if (deleteError) throw deleteError;

      // Inserir novas permissões (apenas as que têm pelo menos can_view)
      const permissionsToInsert = input.permissions
        .map((p) => {
          const normalized = normalizePermissionFlags(p);
          return {
            company_id: p.company_id,
            ...normalized,
          };
        })
        .filter((p) => p.can_view || p.can_edit || p.can_create || p.can_delete)
        .map((p) => ({
          user_id: input.user_id,
          company_id: p.company_id,
          can_view: p.can_view,
          can_edit: p.can_edit,
          can_delete: p.can_delete,
          can_create: p.can_create,
          granted_by: user?.id,
        }));

      if (permissionsToInsert.length > 0) {
        const { error } = await activeClient
          .from("user_company_permissions")
          .insert(permissionsToInsert);

        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["user-permissions", variables.user_id],
      });
      toast({
        title: "Sucesso",
        description: "Permissões atualizadas",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao atualizar permissões",
        variant: "destructive",
      });
    },
  });

  // Verificar permissão específica do usuário atual para uma empresa
  const checkPermission = async (
    companyId: string,
    permission: "can_view" | "can_edit" | "can_create" | "can_delete"
  ): Promise<boolean> => {
    if (!user?.id) return false;

    // Super admin tem todas as permissões
    if (isSuperAdmin) return true;

    const { data, error } = await activeClient
      .from("user_company_permissions")
      .select(permission)
      .eq("user_id", user.id)
      .eq("company_id", companyId)
      .single();

    if (error || !data) return false;

    return data[permission] === true;
  };

  // Hook para buscar permissões do usuário atual para uma empresa específica
  const useCurrentUserPermissions = (companyId?: string) => {
    return useQuery({
      queryKey: ["current-user-permissions", companyId],
      queryFn: async () => {
        if (!companyId || !user?.id) {
          return NO_COMPANY_PERMISSIONS;
        }

        // Super admin tem todas as permissões
        if (isSuperAdmin) {
          return FULL_COMPANY_PERMISSIONS;
        }

        const { data, error } = await activeClient
          .from("user_company_permissions")
          .select("can_view, can_edit, can_create, can_delete")
          .eq("user_id", user.id)
          .eq("company_id", companyId)
          .single();

        if (error || !data) return NO_COMPANY_PERMISSIONS;

        return normalizeCompanyPermissions(data);
      },
      enabled: !!companyId && !!user?.id,
    });
  };

  return {
    permissions,
    isLoading,
    error,
    refetch,
    allCompanies,
    updatePermissions: updatePermissionsMutation.mutate,
    isUpdatingPermissions: updatePermissionsMutation.isPending,
    checkPermission,
    useCurrentUserPermissions,
  };
}

// Hook separado para usar em outros lugares
export function useCurrentUserCompanyPermissions(companyId?: string) {
  const { activeClient, user } = useAuth();
  const { isSuperAdmin } = useAdmin();

  return useQuery({
    queryKey: ["current-user-permissions", companyId, user?.id],
    queryFn: async () => {
      if (!companyId || !user?.id) {
        return NO_COMPANY_PERMISSIONS;
      }

      // Super admin tem todas as permissões
      if (isSuperAdmin) {
        return FULL_COMPANY_PERMISSIONS;
      }

      const { data, error } = await activeClient
        .from("user_company_permissions")
        .select("can_view, can_edit, can_create, can_delete")
        .eq("user_id", user.id)
        .eq("company_id", companyId)
        .single();

      if (error || !data) return NO_COMPANY_PERMISSIONS;

      return normalizeCompanyPermissions(data);
    },
    enabled: !!companyId && !!user?.id,
  });
}
