import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useAdminUsers } from "@/hooks/useAdminUsers";
import { CompanyPermissionInput, UserProfile } from "@/types/admin";
import {
  syncCreatePermissionsState,
  type CompanyPermissionState,
} from "@/components/admin/companyPermissionsState";
import { Building2, Loader2, Mail, UserPlus } from "lucide-react";

interface CreateUserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateUserModal({ open, onOpenChange }: CreateUserModalProps) {
  const { allCompanies } = useUserPermissions();
  const {
    users,
    createUserWithPassword,
    isCreatingUser,
    inviteUser,
    isInvitingUser,
  } =
    useAdminUsers();

  const [activeTab, setActiveTab] = useState<"invite" | "create">("invite");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [companyPermissions, setCompanyPermissions] = useState<
    CompanyPermissionState[]
  >([]);

  const existingUserMatch = useMemo(() => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return null;
    return (
      users?.find((user) => (user.email || "").trim().toLowerCase() === normalizedEmail) ||
      null
    );
  }, [email, users]);

  const userSuggestions = useMemo(() => {
    const q = email.trim().toLowerCase();
    if (!q || !users) return [] as UserProfile[];

    return users
      .filter((u) => {
        const uEmail = (u.email || "").toLowerCase();
        const uName = (u.full_name || "").toLowerCase();
        return uEmail.includes(q) || uName.includes(q);
      })
      .slice(0, 6);
  }, [email, users]);

  useEffect(() => {
    if (!allCompanies) return;
    setCompanyPermissions((current) =>
      syncCreatePermissionsState(allCompanies, current)
    );
  }, [allCompanies]);

  const handleToggleCompany = (companyId: string, enabled: boolean) => {
    setCompanyPermissions((prev) =>
      prev.map((cp) =>
        cp.company_id === companyId
          ? {
              ...cp,
              enabled,
              can_view: enabled ? true : false,
            }
          : cp
      )
    );
  };

  const handleTogglePermission = (
    companyId: string,
    permission: "can_view" | "can_edit" | "can_create" | "can_delete",
    value: boolean
  ) => {
    setCompanyPermissions((prev) =>
      prev.map((cp) => {
        if (cp.company_id !== companyId) return cp;

        if (permission === "can_view" && !value) {
          return {
            ...cp,
            can_view: false,
            can_edit: false,
            can_create: false,
            can_delete: false,
            enabled: false,
          };
        }

        if (permission === "can_delete" && value) {
          return {
            ...cp,
            can_view: true,
            can_edit: true,
            can_create: true,
            can_delete: true,
            enabled: true,
          };
        }

        if (permission === "can_edit" && value) {
          return {
            ...cp,
            can_view: true,
            can_edit: true,
            can_create: true,
            enabled: true,
          };
        }

        if (permission === "can_create" && !value) {
          return {
            ...cp,
            can_create: false,
            can_edit: false,
            can_delete: false,
          };
        }

        return { ...cp, [permission]: value };
      })
    );
  };

  const resetForm = () => {
    setEmail("");
    setFullName("");
    setPassword("");
    if (allCompanies) {
      setCompanyPermissions(syncCreatePermissionsState(allCompanies, []));
    }
  };

  const getPermissionsToSave = (): CompanyPermissionInput[] => {
    return companyPermissions
      .filter((cp) => cp.enabled)
      .map((cp) => ({
        company_id: cp.company_id,
        can_view: cp.can_view,
        can_edit: cp.can_edit,
        can_create: cp.can_create,
        can_delete: cp.can_delete,
      }));
  };

  const handleInvite = () => {
    if (!email || (!fullName && !existingUserMatch)) return;

    inviteUser(
      {
        email,
        full_name: fullName || existingUserMatch?.full_name || email,
        existing_user_id: existingUserMatch?.id,
        permissions: getPermissionsToSave(),
      },
      {
        onSuccess: () => {
          resetForm();
          onOpenChange(false);
        },
      }
    );
  };

  const handleCreate = () => {
    if (!email || !fullName || !password) return;

    createUserWithPassword(
      {
        email,
        full_name: fullName,
        password,
        permissions: getPermissionsToSave(),
      },
      {
        onSuccess: () => {
          resetForm();
          onOpenChange(false);
        },
      }
    );
  };

  const isLoading = isCreatingUser || isInvitingUser;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Adicionar Usuário</DialogTitle>
          <DialogDescription>
            Convide um usuário por email ou crie uma conta com senha.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as any)}
          className="min-h-0 flex-1"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="invite" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Convidar por Email
            </TabsTrigger>
            <TabsTrigger value="create" className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Criar com Senha
            </TabsTrigger>
          </TabsList>

          <div className="mt-4 space-y-4 min-h-0">
            {/* Campos comuns */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fullName">Nome completo</Label>
                <Input
                  id="fullName"
                  placeholder="João da Silva"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="joao@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {userSuggestions.length > 0 && !existingUserMatch && (
                  <div className="rounded-md border bg-background p-1">
                    <div className="px-2 py-1 text-[11px] text-muted-foreground">
                      Usuários encontrados
                    </div>
                    <div className="space-y-1">
                      {userSuggestions.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-muted"
                          onClick={() => {
                            setEmail(u.email || "");
                            setFullName((current) => current || u.full_name || "");
                          }}
                        >
                          <span className="font-medium">{u.full_name || "Sem nome"}</span>
                          <span className="text-muted-foreground">{u.email}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {existingUserMatch && (
                  <p className="text-xs text-emerald-700">
                    Usuário já cadastrado: {existingUserMatch.full_name}. O acesso será liberado
                    imediatamente ao enviar.
                  </p>
                )}
              </div>
            </div>

            <TabsContent value="create" className="mt-0">
              <div className="space-y-2">
                <Label htmlFor="password">Senha inicial</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </TabsContent>

            <Separator />

            {/* Permissões por empresa */}
            <div className="space-y-2 min-h-0">
              <Label>Permissões por Empresa</Label>
              <ScrollArea className="h-[250px] pr-4">
                <div className="space-y-3">
                  {companyPermissions.map((cp) => (
                    <div
                      key={cp.company_id}
                      className="rounded-lg border p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">
                            {cp.company_name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`new-enabled-${cp.company_id}`}
                            checked={cp.enabled}
                            onCheckedChange={(checked) =>
                              handleToggleCompany(cp.company_id, checked === true)
                            }
                          />
                          <Label
                            htmlFor={`new-enabled-${cp.company_id}`}
                            className="text-sm"
                          >
                            Acesso
                          </Label>
                        </div>
                      </div>

                      {cp.enabled && (
                        <div className="grid grid-cols-2 gap-2 pt-2 sm:grid-cols-4">
                          <div className="flex items-center gap-1.5">
                            <Checkbox
                              id={`new-view-${cp.company_id}`}
                              checked={cp.can_view}
                              onCheckedChange={(checked) =>
                                handleTogglePermission(
                                  cp.company_id,
                                  "can_view",
                                  checked === true
                                )
                              }
                            />
                            <Label
                              htmlFor={`new-view-${cp.company_id}`}
                              className="text-xs"
                            >
                              Ver
                            </Label>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Checkbox
                              id={`new-edit-${cp.company_id}`}
                              checked={cp.can_edit}
                              onCheckedChange={(checked) =>
                                handleTogglePermission(
                                  cp.company_id,
                                  "can_edit",
                                  checked === true
                                )
                              }
                            />
                            <Label
                              htmlFor={`new-edit-${cp.company_id}`}
                              className="text-xs"
                            >
                              Editar
                            </Label>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Checkbox
                              id={`new-create-${cp.company_id}`}
                              checked={cp.can_create}
                              onCheckedChange={(checked) =>
                                handleTogglePermission(
                                  cp.company_id,
                                  "can_create",
                                  checked === true
                                )
                              }
                            />
                            <Label
                              htmlFor={`new-create-${cp.company_id}`}
                              className="text-xs"
                            >
                              Criar
                            </Label>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Checkbox
                              id={`new-delete-${cp.company_id}`}
                              checked={cp.can_delete}
                              onCheckedChange={(checked) =>
                                handleTogglePermission(
                                  cp.company_id,
                                  "can_delete",
                                  checked === true
                                )
                              }
                            />
                            <Label
                              htmlFor={`new-delete-${cp.company_id}`}
                              className="text-xs"
                            >
                              Excluir
                            </Label>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {companyPermissions.length === 0 && (
                    <div className="text-center py-4 text-muted-foreground text-sm">
                      Nenhuma empresa cadastrada
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {activeTab === "invite" ? (
            <Button
              onClick={handleInvite}
              disabled={isLoading || !email || (!fullName && !existingUserMatch)}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enviar Convite
            </Button>
          ) : (
            <Button
              onClick={handleCreate}
              disabled={isLoading || !email || !fullName || !password}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar Usuário
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
