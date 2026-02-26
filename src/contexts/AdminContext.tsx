import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";

const SUPER_ADMIN_EXACT_EMAILS = [
  "izabelvier@outlook.com",
  "isabelvier@outlook.com",
  "yuriallmeida@gmail.com",
];

function isSuperAdminEmail(email?: string | null) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return false;
  return SUPER_ADMIN_EXACT_EMAILS.includes(normalized);
}

export interface AdminContextType {
  isSuperAdmin: boolean;
  loading: boolean;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export function AdminProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading, activeClient } = useAuth();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkSuperAdmin = async () => {
      if (authLoading) return;

      if (!user) {
        setIsSuperAdmin(false);
        setLoading(false);
        return;
      }

      // Verifica pelo email primeiro (mais rápido)
      if (isSuperAdminEmail(user.email)) {
        setIsSuperAdmin(true);
        setLoading(false);
        return;
      }

      // Fallback: verifica na tabela admin_users
      try {
        const { data, error } = await activeClient
          .from("admin_users")
          .select("is_super_admin")
          .eq("user_id", user.id)
          .single();

        if (!error && data?.is_super_admin) {
          setIsSuperAdmin(true);
        } else {
          setIsSuperAdmin(false);
        }
      } catch {
        setIsSuperAdmin(false);
      }

      setLoading(false);
    };

    checkSuperAdmin();
  }, [user, authLoading, activeClient]);

  return (
    <AdminContext.Provider value={{ isSuperAdmin, loading }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const context = useContext(AdminContext);
  if (context === undefined) {
    throw new Error("useAdmin must be used within an AdminProvider");
  }
  return context;
}
