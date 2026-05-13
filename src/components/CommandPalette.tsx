import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { menuGroups, footerMenu, OWNER_EMAIL } from "@/config/menuConfig";
import { useAdmin } from "@/contexts/AdminContext";
import { useAuth } from "@/contexts/AuthContext";
import { ShoppingCart, UserPlus, ArrowUpCircle, ArrowDownCircle, Building2 } from "lucide-react";

const QUICK_ACTIONS: { label: string; url: string; icon: typeof ShoppingCart }[] = [
  { label: "Nova venda", url: "/vendas?new=true", icon: ShoppingCart },
  { label: "Novo cliente", url: "/clientes?new=true", icon: UserPlus },
  { label: "Novo título a receber", url: "/contas-receber?new=true", icon: ArrowUpCircle },
  { label: "Novo título a pagar", url: "/contas-pagar?new=true", icon: ArrowDownCircle },
  { label: "Nova empresa", url: "/empresas?new=true", icon: Building2 },
];

export const COMMAND_PALETTE_OPEN_EVENT = "commandpalette:open";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isSuperAdmin } = useAdmin();
  const { user } = useAuth();
  const isOwner = user?.email?.toLowerCase() === OWNER_EMAIL.toLowerCase();

  const isItemVisible = (item: { hidden?: boolean; adminOnly?: boolean; ownerOnly?: boolean; url?: string }) =>
    !item.hidden &&
    (!item.adminOnly || isSuperAdmin) &&
    (!item.ownerOnly || isOwner) &&
    Boolean(item.url);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onExternalOpen = () => setOpen(true);
    document.addEventListener("keydown", down);
    window.addEventListener(COMMAND_PALETTE_OPEN_EVENT, onExternalOpen);
    return () => {
      document.removeEventListener("keydown", down);
      window.removeEventListener(COMMAND_PALETTE_OPEN_EVENT, onExternalOpen);
    };
  }, []);

  const handleSelect = useCallback(
    (url: string) => {
      setOpen(false);
      navigate(url);
    },
    [navigate],
  );

  const visibleGroups = menuGroups.filter((group) => {
    if (group.ownerOnly && !isOwner) return false;
    const items = group.items.filter(isItemVisible);
    return items.length > 0;
  });

  const visibleFooter = footerMenu.filter(isItemVisible);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Buscar paginas, acoes..." />
      <CommandList>
        <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
        <CommandGroup heading="Ações rápidas">
          {QUICK_ACTIONS.map((action) => (
            <CommandItem
              key={action.url}
              value={action.label}
              onSelect={() => handleSelect(action.url)}
            >
              <action.icon className="mr-2 h-4 w-4 opacity-60" />
              <span>{action.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        {visibleGroups.map((group) => {
          const groupHeading = group.labelKey
            ? (group.isHardcodedLabel ? group.labelKey : t(group.labelKey))
            : "Principal";
          return (
            <CommandGroup key={group.id} heading={groupHeading}>
              {group.items
                .filter(isItemVisible)
                .map((item) => {
                  const muted = group.ownerOnly || item.ownerOnly;
                  const label = item.isHardcoded ? item.titleKey : t(item.titleKey);
                  return (
                    <CommandItem
                      key={item.url}
                      value={`${label} ${item.url}`}
                      onSelect={() => handleSelect(item.url!)}
                      className={muted ? "text-muted-foreground opacity-60" : undefined}
                    >
                      <item.icon className="mr-2 h-4 w-4 opacity-60" />
                      <span>{label}</span>
                    </CommandItem>
                  );
                })}
            </CommandGroup>
          );
        })}
        {visibleFooter.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Outros">
              {visibleFooter.map((item) => {
                const label = item.isHardcoded ? item.titleKey : t(item.titleKey);
                return (
                  <CommandItem
                    key={item.url}
                    value={`${label} ${item.url}`}
                    onSelect={() => handleSelect(item.url!)}
                  >
                    <item.icon className="mr-2 h-4 w-4 opacity-60" />
                    <span>{label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
