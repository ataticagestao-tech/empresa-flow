import { Link, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/contexts/AdminContext";
import { useTranslation } from "react-i18next";
import { menuGroups, footerMenu, OWNER_EMAIL } from "@/config/menuConfig";

const logoSymbol = "/favicon.svg";

export function AppSidebar() {
  const location = useLocation();
  const { signOut, user } = useAuth();
  const { isSuperAdmin } = useAdmin();
  const { t } = useTranslation();
  const isActive = (url?: string) => (url ? location.pathname === url : false);
  const isOwner = user?.email?.toLowerCase() === OWNER_EMAIL.toLowerCase();

  const handleMenuAction = (item: { action?: "logout" | "none" }) => {
    if (item.action === "logout") {
      signOut();
    }
  };

  const isItemVisible = (item: { hidden?: boolean; adminOnly?: boolean; ownerOnly?: boolean }) =>
    !item.hidden && (!item.adminOnly || isSuperAdmin) && (!item.ownerOnly || isOwner);

  const visibleGroups = menuGroups.filter((group) => {
    if (group.ownerOnly && !isOwner) return false;
    const visibleItems = group.items.filter(isItemVisible);
    return visibleItems.length > 0;
  });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-3 h-14 sm:h-16 flex-row items-center">
        <Link
          to="/dashboard"
          className="group flex items-center gap-2.5 w-full group-data-[collapsible=icon]:justify-center"
          aria-label="Ir para o dashboard"
          title="Dashboard"
        >
          <img
            src={logoSymbol}
            alt="Gestap System"
            className="h-9 w-9 object-contain shrink-0 transition-transform duration-200 group-hover:scale-105"
          />
          <div className="flex flex-col min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="text-[12px] font-semibold text-sidebar-foreground tracking-tight leading-tight truncate">
              Gestap System.
            </span>
            <span className="text-[9px] font-medium text-sidebar-foreground/50 uppercase tracking-[0.08em] leading-tight mt-0.5">
              Gestão Empresarial
            </span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="scrollbar-thin px-2.5 py-2">
        {visibleGroups.map((group) => {
          const visibleItems = group.items.filter(isItemVisible);
          const groupLabel = group.labelKey
            ? (group.isHardcodedLabel ? group.labelKey : t(group.labelKey))
            : "";
          const hasActiveChild = visibleItems.some((item) => isActive(item.url));

          if (!group.labelKey) {
            return (
              <SidebarGroup key={group.id}>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {visibleItems.map((item) => {
                      const muted = item.ownerOnly ? " opacity-50" : "";
                      return (
                        <SidebarMenuItem key={item.titleKey}>
                          <SidebarMenuButton asChild isActive={isActive(item.url)}>
                            <Link to={item.url!} className={`rounded-lg transition-colors duration-150${muted}`}>
                              <item.icon className="h-4 w-4 text-sidebar-foreground/80" />
                              <span className="text-[12.5px]">{item.isHardcoded ? item.titleKey : t(item.titleKey)}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          }

          const groupMuted = group.ownerOnly ? " opacity-50" : "";

          return (
            <Collapsible key={group.id} defaultOpen={hasActiveChild} className="group/collapsible">
              <SidebarGroup className="py-0">
                <SidebarMenu>
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        className={`rounded-lg transition-colors duration-150 data-[state=open]:bg-sidebar-accent${groupMuted}`}
                        data-state-group={hasActiveChild ? "active" : undefined}
                      >
                        {group.icon && <group.icon className="h-4 w-4 text-sidebar-foreground/80" />}
                        <span className="text-[12.5px] font-medium">{groupLabel}</span>
                        <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-sidebar-foreground/60 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                      <SidebarMenuSub className="mt-1">
                        {visibleItems.map((item) => {
                          const itemMuted = (group.ownerOnly || item.ownerOnly) ? " opacity-50" : "";
                          return (
                            <SidebarMenuSubItem key={item.titleKey}>
                              {item.url ? (
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={isActive(item.url)}
                                  size="sm"
                                  className={`text-[10.5px] font-normal text-sidebar-foreground/75 data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground${itemMuted}`}
                                >
                                  <Link to={item.url} className="transition-colors duration-150">
                                    <span>{item.isHardcoded ? item.titleKey : t(item.titleKey)}</span>
                                  </Link>
                                </SidebarMenuSubButton>
                              ) : (
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={isActive(item.url)}
                                  size="sm"
                                  className={`text-[10.5px] font-normal text-sidebar-foreground/75 data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground${itemMuted}`}
                                >
                                  <button type="button" onClick={() => handleMenuAction(item)} className="w-full text-left">
                                    <span>{item.isHardcoded ? item.titleKey : t(item.titleKey)}</span>
                                  </button>
                                </SidebarMenuSubButton>
                              )}
                            </SidebarMenuSubItem>
                          );
                        })}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>
            </Collapsible>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border px-2.5 py-2">
        <SidebarMenu>
          {footerMenu
            .filter(isItemVisible)
            .map((item) => (
            <SidebarMenuItem key={item.titleKey}>
              {item.url ? (
                <SidebarMenuButton asChild isActive={isActive(item.url)}>
                  <Link to={item.url} className="rounded-lg transition-colors duration-150">
                    <item.icon className="h-4 w-4 text-sidebar-foreground/80" />
                    <span className="text-[12.5px]">{t(item.titleKey)}</span>
                  </Link>
                </SidebarMenuButton>
              ) : (
                <SidebarMenuButton
                  type="button"
                  isActive={isActive(item.url)}
                  onClick={() => handleMenuAction(item)}
                  className={`rounded-lg transition-colors duration-150 ${item.action === "logout" ? "text-[#E53E3E] hover:text-[#E53E3E] hover:bg-[#FEE2E2]" : ""}`}
                >
                  <item.icon className={`h-[17px] w-[17px] ${item.action === "logout" ? "" : "text-white"}`} />
                  <span className="text-[12.5px]">{t(item.titleKey)}</span>
                </SidebarMenuButton>
              )}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
