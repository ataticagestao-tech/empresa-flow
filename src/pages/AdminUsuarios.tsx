import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserList } from "@/components/admin/UserList";
import { UserPermissionsModal } from "@/components/admin/UserPermissionsModal";
import { CreateUserModal } from "@/components/admin/CreateUserModal";
import { ResetPasswordModal } from "@/components/admin/ResetPasswordModal";
import { useAdminUsers } from "@/hooks/useAdminUsers";
import { useAdmin } from "@/contexts/AdminContext";
import { useAuth } from "@/contexts/AuthContext";
import { UserProfile, UserStatus } from "@/types/admin";
import { Navigate } from "react-router-dom";
import { Plus, Search, Users, Loader2 } from "lucide-react";

export default function AdminUsuarios() {
  const { isSuperAdmin, loading: adminLoading } = useAdmin();
  const { user } = useAuth();
  const {
    users,
    isLoading,
    updateUserStatus,
    isUpdatingStatus,
    deleteUser,
    resetPassword,
    isResettingPassword,
  } = useAdminUsers();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [isPermissionsModalOpen, setIsPermissionsModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState<UserProfile | null>(null);

  // Filtrar usuários
  const filteredUsers = useMemo(() => {
    if (!users) return [];

    return users.filter((u) => {
      // Filtro de busca
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch =
        !searchTerm ||
        u.full_name.toLowerCase().includes(searchLower) ||
        u.email?.toLowerCase().includes(searchLower);

      // Filtro de status
      const userStatus = (u.status || "active") as UserStatus;
      const matchesStatus =
        statusFilter === "all" || userStatus === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [users, searchTerm, statusFilter]);

  // Loading state
  if (adminLoading) {
    return (
      <AppLayout title="Usuários">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  // Redirect if not super admin
  if (!isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleEditPermissions = (userProfile: UserProfile) => {
    setSelectedUser(userProfile);
    setIsPermissionsModalOpen(true);
  };

  const handleUpdateStatus = (userId: string, status: UserStatus, reason?: string) => {
    updateUserStatus({ userId, status, reason });
  };

  const handleDeleteUser = (userId: string, reason: string) => {
    deleteUser({ userId, reason });
  };

  const handleOpenResetPassword = (userProfile: UserProfile) => {
    setResetPasswordUser(userProfile);
  };

  const handleSubmitResetPassword = (password: string) => {
    if (!resetPasswordUser) return;
    resetPassword(
      { userId: resetPasswordUser.id, password },
      {
        onSuccess: () => setResetPasswordUser(null),
      }
    );
  };

  // Stats
  const activeCount = users?.filter((u) => (u.status || "active") === "active").length || 0;
  const suspendedCount = users?.filter((u) => u.status === "suspended").length || 0;
  const totalCount = users?.length || 0;

  return (
    <AppLayout title="Gerenciar Usuários">
      <div className="space-y-6">

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Usuários</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Usuários Ativos</CardTitle>
              <div className="h-2 w-2 rounded-full bg-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Usuários Suspensos</CardTitle>
              <div className="h-2 w-2 rounded-full bg-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{suspendedCount}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Actions */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="suspended">Suspensos</SelectItem>
                <SelectItem value="deleted">Removidos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => setIsCreateModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Adicionar Usuário
          </Button>
        </div>

        {/* Users Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <UserList
                users={filteredUsers}
                onEditPermissions={handleEditPermissions}
                onUpdateStatus={handleUpdateStatus}
                onDeleteUser={handleDeleteUser}
                onResetPassword={handleOpenResetPassword}
                isUpdatingStatus={isUpdatingStatus}
                isResettingPassword={isResettingPassword}
                currentUserId={user?.id}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modals */}
      <UserPermissionsModal
        open={isPermissionsModalOpen}
        onOpenChange={setIsPermissionsModalOpen}
        user={selectedUser}
      />
      <CreateUserModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
      />
      <ResetPasswordModal
        open={!!resetPasswordUser}
        onOpenChange={(open) => {
          if (!open) setResetPasswordUser(null);
        }}
        user={resetPasswordUser}
        onSubmit={handleSubmitResetPassword}
        isSubmitting={isResettingPassword}
      />
    </AppLayout>
  );
}
