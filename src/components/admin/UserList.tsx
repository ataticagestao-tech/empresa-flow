import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Ban, UserCheck, Trash2, Key } from "lucide-react";
import { UserProfile, UserStatus } from "@/types/admin";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useConfirm } from "@/components/ui/confirm-dialog";

interface UserListProps {
  users: UserProfile[];
  onEditPermissions: (user: UserProfile) => void;
  onUpdateStatus: (userId: string, status: UserStatus, reason?: string) => void;
  onDeleteUser: (userId: string, reason: string) => void;
  isUpdatingStatus: boolean;
  currentUserId?: string;
}

const statusConfig: Record<
  UserStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  active: { label: "Ativo", variant: "default" },
  suspended: { label: "Suspenso", variant: "secondary" },
  deleted: { label: "Removido", variant: "destructive" },
};

export function UserList({
  users,
  onEditPermissions,
  onUpdateStatus,
  onDeleteUser,
  isUpdatingStatus,
  currentUserId,
}: UserListProps) {
  const confirm = useConfirm();
  const requestReason = (actionLabel: string, fullName: string) => {
    const reason = window.prompt(`Informe a justificativa para ${actionLabel} o usuário "${fullName}":`);
    const normalized = String(reason || "").trim();
    return normalized.length > 0 ? normalized : null;
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[300px]">Usuário</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Cadastro</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => {
            const status = (user.status || "active") as UserStatus;
            const statusInfo = statusConfig[status];
            const isCurrentUser = user.id === currentUserId;

            return (
              <TableRow key={user.id} className={status === "deleted" ? "opacity-50" : ""}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={user.avatar_url || undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {getInitials(user.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">{user.full_name}</div>
                      {isCurrentUser && (
                        <span className="text-xs text-muted-foreground">(você)</span>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{user.email}</TableCell>
                <TableCell>
                  <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {format(new Date(user.created_at), "dd/MM/yyyy", { locale: ptBR })}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" disabled={isCurrentUser}>
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Abrir menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEditPermissions(user)}>
                        <Key className="mr-2 h-4 w-4" />
                        Permissões
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {status === "active" && (
                        <DropdownMenuItem
                          onClick={() => {
                            const reason = requestReason("suspender", user.full_name);
                            if (!reason) return;
                            onUpdateStatus(user.id, "suspended", reason);
                          }}
                          disabled={isUpdatingStatus}
                        >
                          <Ban className="mr-2 h-4 w-4" />
                          Suspender
                        </DropdownMenuItem>
                      )}
                      {status === "suspended" && (
                        <DropdownMenuItem
                          onClick={() => onUpdateStatus(user.id, "active")}
                          disabled={isUpdatingStatus}
                        >
                          <UserCheck className="mr-2 h-4 w-4" />
                          Ativar
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={async () => {
                          const ok = await confirm({
                            title: `Remover o acesso de "${user.full_name}"?`,
                            description: "O usuário perderá acesso imediatamente ao sistema.",
                            confirmLabel: "Sim, remover acesso",
                            variant: "destructive",
                          });
                          if (!ok) return;
                          const reason = requestReason("remover", user.full_name);
                          if (!reason) return;
                          onDeleteUser(user.id, reason);
                        }}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Remover acesso
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
          {users.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                Nenhum usuário encontrado
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
