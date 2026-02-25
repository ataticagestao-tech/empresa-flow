import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { UserProfile, CompanyPermissionInput } from "@/types/admin";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import {
  buildPermissionsFromExisting,
  type CompanyPermissionState,
} from "@/components/admin/companyPermissionsState";
import { Building2, Loader2 } from "lucide-react";

interface UserPermissionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserProfile | null;
}

export function UserPermissionsModal({
  open,
  onOpenChange,
  user,
}: UserPermissionsModalProps) {
  const {
    permissions,
    allCompanies,
    isLoading,
    updatePermissions,
    isUpdatingPermissions,
  } = useUserPermissions(user?.id);

  const [companyPermissions, setCompanyPermissions] = useState<
    CompanyPermissionState[]
  >([]);

  // Inicializar estado quando dados carregarem
  useEffect(() => {
    if (!allCompanies || !user) return;
    setCompanyPermissions(buildPermissionsFromExisting(allCompanies, permissions || []));
  }, [allCompanies, permissions, user]);

  const handleToggleCompany = (companyId: string, enabled: boolean) => {
    setCompanyPermissions((prev) =>
      prev.map((cp) =>
        cp.company_id === companyId
          ? {
              ...cp,
              enabled,
              can_view: enabled ? true : false,
              can_edit: enabled ? cp.can_edit : false,
              can_create: enabled ? cp.can_create : false,
              can_delete: enabled ? cp.can_delete : false,
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

        // Se desmarcar can_view, desmarcar tudo
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

  const handleSave = () => {
    if (!user) return;

    const permissionsToSave: CompanyPermissionInput[] = companyPermissions
      .filter((cp) => cp.enabled)
      .map((cp) => ({
        company_id: cp.company_id,
        can_view: cp.can_view,
        can_edit: cp.can_edit,
        can_create: cp.can_create,
        can_delete: cp.can_delete,
      }));

    updatePermissions(
      { user_id: user.id, permissions: permissionsToSave },
      {
        onSuccess: () => onOpenChange(false),
      }
    );
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden p-0">
        <div className="grid h-full max-h-[85vh] grid-rows-[auto_minmax(0,1fr)_auto]">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle>Permissões de {user.full_name}</DialogTitle>
            <DialogDescription>
              Configure as permissões do usuário para cada empresa.
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center px-6 py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="min-h-0 px-6">
              <ScrollArea className="h-full pr-4">
                <div className="space-y-4 pb-4">
                  {companyPermissions.map((cp) => (
                    <div
                      key={cp.company_id}
                      className="rounded-lg border p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{cp.company_name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`enabled-${cp.company_id}`}
                            checked={cp.enabled}
                            onCheckedChange={(checked) =>
                              handleToggleCompany(cp.company_id, checked === true)
                            }
                          />
                          <Label
                            htmlFor={`enabled-${cp.company_id}`}
                            className="text-sm"
                          >
                            Acesso
                          </Label>
                        </div>
                      </div>

                      {cp.enabled && (
                        <>
                          <Separator />
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id={`view-${cp.company_id}`}
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
                                htmlFor={`view-${cp.company_id}`}
                                className="text-sm"
                              >
                                Visualizar
                              </Label>
                            </div>
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id={`edit-${cp.company_id}`}
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
                                htmlFor={`edit-${cp.company_id}`}
                                className="text-sm"
                              >
                                Editar
                              </Label>
                            </div>
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id={`create-${cp.company_id}`}
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
                                htmlFor={`create-${cp.company_id}`}
                                className="text-sm"
                              >
                                Criar
                              </Label>
                            </div>
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id={`delete-${cp.company_id}`}
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
                                htmlFor={`delete-${cp.company_id}`}
                                className="text-sm"
                              >
                                Excluir
                              </Label>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ))}

                  {companyPermissions.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      Nenhuma empresa cadastrada
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}

          <DialogFooter className="border-t bg-background px-6 py-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isUpdatingPermissions}>
              {isUpdatingPermissions && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
