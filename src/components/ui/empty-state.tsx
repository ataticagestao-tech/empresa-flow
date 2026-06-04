import { LucideIcon, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export interface EmptyStateAction {
  label: string;
  /** Rota interna — vira um <Link> (atalho de saída pro pré-requisito). */
  to?: string;
  /** Ação custom (ou complementa o Link, ex.: fechar um modal antes de navegar). */
  onClick?: () => void;
  variant?: "default" | "outline" | "secondary";
}

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** Atalho de uma ação só (legado — mantém compatibilidade). */
  actionLabel?: string;
  onAction?: () => void;
  /** Ações de saída — levam o usuário ao lugar que resolve a limitação. */
  actions?: EmptyStateAction[];
}

/**
 * Estado vazio padrão: ícone + título + explicação + botão(ões).
 * Quando uma tela depende de um dado que mora em outro lugar, passe `actions`
 * com `to` pra apontar o caminho (ex.: "+ Cadastrar produto" → /operacional)
 * em vez de deixar o usuário travado num "nenhum registro".
 */
export function EmptyState({
  icon: Icon = FileText,
  title,
  description,
  actionLabel,
  onAction,
  actions,
}: EmptyStateProps) {
  const all: EmptyStateAction[] = [
    ...(actionLabel && onAction ? [{ label: actionLabel, onClick: onAction }] : []),
    ...(actions ?? []),
  ];
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-[14px] font-medium text-foreground mb-1">{title}</p>
      {description && (
        <p className="text-[13px] text-muted-foreground text-center max-w-sm">{description}</p>
      )}
      {all.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {all.map((a) =>
            a.to ? (
              <Button key={a.label} asChild variant={a.variant} className="h-9 px-4 text-[13px]">
                <Link to={a.to} onClick={a.onClick}>
                  {a.label}
                </Link>
              </Button>
            ) : (
              <Button key={a.label} onClick={a.onClick} variant={a.variant} className="h-9 px-4 text-[13px]">
                {a.label}
              </Button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
