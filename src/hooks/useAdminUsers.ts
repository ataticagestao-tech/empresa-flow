import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/contexts/AdminContext";
import { UserProfile, UserStatus, CreateUserInput } from "@/types/admin";
import { useToast } from "@/components/ui/use-toast";
import { buildPermissionRowsForUser } from "@/hooks/adminPermissionsUtils";
import { normalizePermissionFlags } from "@/hooks/userPermissionsUtils";

export function useAdminUsers() {
  const { activeClient, user } = useAuth();
  const { isSuperAdmin } = useAdmin();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const upsertUserPermissions = async (targetUserId: string, input: CreateUserInput) => {
    const rows = buildPermissionRowsForUser(targetUserId, input.permissions, user?.id || null);
    if (rows.length === 0) return;

    const { error } = await activeClient
      .from("user_company_permissions")
      .upsert(rows, { onConflict: "user_id,company_id" });
    if (error) throw error;
  };

  // Buscar todos os usuários (apenas para super admin)
  const {
    data: users,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      if (!isSuperAdmin) return [];

      const { data, error } = await activeClient
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      return data as UserProfile[];
    },
    enabled: isSuperAdmin,
  });

  // Atualizar status do usuário
  const updateUserStatusMutation = useMutation({
    mutationFn: async ({
      userId,
      status,
      reason,
    }: {
      userId: string;
      status: UserStatus;
      reason?: string;
    }) => {
      const reasonValue = status === "active" ? null : String(reason || "").trim();
      if (status !== "active" && !reasonValue) {
        throw new Error("Informe uma justificativa para alterar o status do usuário.");
      }

      const { error } = await activeClient
        .from("profiles")
        .update({
          status,
          status_reason: reasonValue,
          status_updated_at: new Date().toISOString(),
          status_updated_by: user?.id || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({
        title: "Sucesso",
        description: "Status do usuário atualizado",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao atualizar status do usuário",
        variant: "destructive",
      });
    },
  });

  // Criar usuário com senha
  const createUserWithPasswordMutation = useMutation({
    mutationFn: async (input: CreateUserInput) => {
      if (!input.password) {
        throw new Error("Senha é obrigatória para criar usuário");
      }

      // Usar Supabase Admin API via Edge Function ou criar via signup
      // Como não temos acesso direto à admin API, vamos usar signUp
      const { data: signUpData, error: signUpError } =
        await activeClient.auth.signUp({
          email: input.email,
          password: input.password,
          options: {
            data: { full_name: input.full_name },
          },
        });

      if (signUpError) throw signUpError;

      const newUserId = signUpData.user?.id;
      if (!newUserId) throw new Error("Falha ao criar usuário");

      // Criar permissões para as empresas selecionadas
      await upsertUserPermissions(newUserId, input);

      return newUserId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({
        title: "Sucesso",
        description: "Usuário criado com sucesso",
      });
    },
    onError: (error: Error) => {
      const msg = error.message?.toLowerCase() || "";
      if (
        msg.includes("already registered") ||
        msg.includes("already exists")
      ) {
        toast({
          title: "Erro",
          description: "Este email já está cadastrado",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Erro",
          description: error.message || "Erro ao criar usuário",
          variant: "destructive",
        });
      }
    },
  });

  // Convidar usuário por email
  const inviteUserMutation = useMutation({
    mutationFn: async (input: CreateUserInput) => {
      const normalizedEmail = input.email.trim().toLowerCase();
      const { data: existingProfiles, error: existingProfileError } = await activeClient
        .from("profiles")
        .select("id")
        .ilike("email", normalizedEmail)
        .order("created_at", { ascending: false })
        .limit(1);
      if (existingProfileError) throw existingProfileError;
      const existingProfile = (existingProfiles || [])[0];
      const targetUserId = input.existing_user_id || existingProfile?.id;

      // Se usuário já existe, não depende de email: concede acesso imediatamente.
      if (targetUserId) {
        await upsertUserPermissions(targetUserId, input);
        return { mode: "existing-user", userId: targetUserId };
      }

      // Armazenar permissões pendentes para aplicar quando o usuário concluir cadastro
      const pendingRows = input.permissions
        .map((p) => {
          const normalized = normalizePermissionFlags(p);
          return {
            company_id: p.company_id,
            ...normalized,
          };
        })
        .filter((p) => p.can_view || p.can_edit || p.can_create || p.can_delete)
        .map((p) => ({
          email: normalizedEmail,
          company_id: p.company_id,
          can_view: p.can_view,
          can_edit: p.can_edit,
          can_create: p.can_create,
          can_delete: p.can_delete,
          granted_by: user?.id,
        }));

      if (pendingRows.length > 0) {
        const { error: pendingError } = await activeClient
          .from("pending_user_company_permissions" as any)
          .upsert(pendingRows, { onConflict: "email,company_id" });
        if (pendingError) throw pendingError;
      }

      // Envia convite por email usando Supabase
      const { data, error } = await activeClient.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          shouldCreateUser: true,
          data: { full_name: input.full_name },
        },
      });

      if (error) throw error;
      return { mode: "email-invite", data };
    },
    onSuccess: (result: any) => {
      if (result?.mode === "existing-user") {
        toast({
          title: "Acesso concedido",
          description: "Usuário já cadastrado. Permissões aplicadas com sucesso.",
        });
        return;
      }

      toast({
        title: "Convite enviado",
        description: "O usuário receberá um email para criar sua conta",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao enviar convite",
        variant: "destructive",
      });
    },
  });

  // Deletar usuário (soft delete - muda status para 'deleted')
  const deleteUserMutation = useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason: string }) => {
      const reasonValue = String(reason || "").trim();
      if (!reasonValue) {
        throw new Error("Informe uma justificativa para remover o usuário.");
      }

      const { error } = await activeClient
        .from("profiles")
        .update({
          status: "deleted",
          status_reason: reasonValue,
          status_updated_at: new Date().toISOString(),
          status_updated_by: user?.id || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (error) throw error;

      // Remover permissões do usuário
      await activeClient
        .from("user_company_permissions")
        .delete()
        .eq("user_id", userId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({
        title: "Sucesso",
        description: "Usuário removido",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao remover usuário",
        variant: "destructive",
      });
    },
  });

  return {
    users,
    isLoading,
    error,
    refetch,
    updateUserStatus: updateUserStatusMutation.mutate,
    isUpdatingStatus: updateUserStatusMutation.isPending,
    createUserWithPassword: createUserWithPasswordMutation.mutate,
    isCreatingUser: createUserWithPasswordMutation.isPending,
    inviteUser: inviteUserMutation.mutate,
    isInvitingUser: inviteUserMutation.isPending,
    deleteUser: deleteUserMutation.mutate,
    isDeletingUser: deleteUserMutation.isPending,
  };
}
