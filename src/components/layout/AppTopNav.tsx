import { Link, useLocation } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/contexts/AdminContext";
import { useEntitlements } from "@/hooks/useEntitlements";
import { useTranslation } from "react-i18next";
import { menuGroups, OWNER_EMAIL, type MenuGroup, type MenuItem } from "@/config/menuConfig";

/**
 * Menu principal horizontal no topo (substitui a barra lateral).
 * Cada grupo do menuConfig vira um botão; grupos com itens abrem um dropdown.
 * Respeita visibilidade ownerOnly / adminOnly igual ao antigo AppSidebar.
 */
export function AppTopNav() {
  const location = useLocation();
  const { user } = useAuth();
  const { isSuperAdmin } = useAdmin();
  const { hasModule } = useEntitlements();
  const { t } = useTranslation();

  const isOwner = user?.email?.toLowerCase() === OWNER_EMAIL.toLowerCase();
  const isActive = (url?: string) => (url ? location.pathname === url : false);
  const startsWith = (url?: string) => (url ? location.pathname.startsWith(url) : false);

  const isItemVisible = (item: MenuItem) =>
    !item.hidden && (!item.adminOnly || isSuperAdmin) && (!item.ownerOnly || isOwner) && hasModule(item.module);

  const visibleGroups = menuGroups.filter((group) => {
    if (group.ownerOnly && !isOwner) return false;
    if (!hasModule(group.module)) return false;
    return group.items.filter(isItemVisible).length > 0;
  });

  const groupLabel = (g: MenuGroup) =>
    g.labelKey ? (g.isHardcodedLabel ? g.labelKey : t(g.labelKey)) : "";

  const itemLabel = (it: MenuItem) => (it.isHardcoded ? it.titleKey : t(it.titleKey));

  // Renderiza um item do dropdown. Se tiver `children`, vira submenu em cascata.
  const renderItem = (item: MenuItem) => {
    const kids = item.children?.filter(isItemVisible) ?? [];

    if (kids.length > 0) {
      return (
        <DropdownMenuSub key={item.titleKey}>
          <DropdownMenuSubTrigger className="flex items-center gap-2">
            <item.icon className="h-4 w-4 opacity-70" />
            {itemLabel(item)}
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="w-56">
              {kids.map(renderItem)}
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
      );
    }

    return (
      <DropdownMenuItem key={item.titleKey} asChild>
        <Link
          to={item.url!}
          className={`flex items-center gap-2 cursor-pointer ${
            isActive(item.url) ? "font-medium text-emerald-700" : ""
          }`}
        >
          <item.icon className="h-4 w-4 opacity-70" />
          {itemLabel(item)}
        </Link>
      </DropdownMenuItem>
    );
  };

  const baseBtn =
    "flex items-center gap-1 px-2.5 h-9 rounded-md text-[14.5px] whitespace-nowrap transition-colors outline-none";

  return (
    <nav className="relative z-10 bg-sidebar border-b border-sidebar-border h-12 shrink-0 shadow-[0_4px_12px_-2px_rgba(0,0,0,0.22)]">
      <div className="h-full flex items-center gap-0 mx-auto w-full max-w-[1280px] px-2 sm:px-6 lg:px-8 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      {visibleGroups.map((group) => {
        const items = group.items.filter(isItemVisible);
        const itemMatches = (it: MenuItem): boolean =>
          isActive(it.url) || startsWith(it.url) || (it.children?.some(itemMatches) ?? false);
        const hasActiveChild = items.some(itemMatches);

        // Grupo sem rótulo (Dashboard): link direto, sem dropdown.
        if (!group.labelKey) {
          return items.map((item) => (
            <Link
              key={item.titleKey}
              to={item.url!}
              className={`${baseBtn} ${
                isActive(item.url)
                  ? "bg-sidebar-accent text-white font-semibold"
                  : "text-white/75 hover:bg-sidebar-accent hover:text-white"
              }`}
            >
              {itemLabel(item)}
            </Link>
          ));
        }

        return (
          <DropdownMenu key={group.id}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={`${baseBtn} ${
                  hasActiveChild
                    ? "bg-sidebar-accent text-white font-semibold"
                    : "text-white/75 hover:bg-sidebar-accent hover:text-white"
                }`}
              >
                {groupLabel(group)}
                <ChevronDown className="h-3 w-3 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {items.map(renderItem)}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}
      </div>
    </nav>
  );
}
