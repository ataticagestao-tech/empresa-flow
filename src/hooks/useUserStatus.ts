import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { UserStatus } from "@/types/admin";

export function useUserStatus() {
  const { user, activeClient } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["user-status", user?.id],
    queryFn: async () => {
      if (!user?.id) {
        return { status: "active" as UserStatus, reason: null as string | null, updatedAt: null as string | null };
      }

      const { data, error } = await activeClient
        .from("profiles")
        .select("status, status_reason, status_updated_at")
        .eq("id", user.id)
        .single();

      if (error || !data) {
        return { status: "active" as UserStatus, reason: null as string | null, updatedAt: null as string | null };
      }

      return {
        status: (data.status || "active") as UserStatus,
        reason: data.status_reason || null,
        updatedAt: data.status_updated_at || null,
      };
    },
    enabled: !!user?.id,
    staleTime: 30 * 1000, // 30 segundos
    refetchOnWindowFocus: true,
    refetchInterval: 15 * 1000,
  });

  const status = data?.status || "active";
  return {
    status,
    reason: data?.reason || null,
    updatedAt: data?.updatedAt || null,
    isLoading,
    isSuspended: status === "suspended",
    isDeleted: status === "deleted",
    isActive: status === "active" || !status,
  };
}
