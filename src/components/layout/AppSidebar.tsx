import { Link, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/contexts/AdminContext";
import { useTranslation } from "react-i18next";
import { menuGroups, footerMenu } from "@/config/menuConfig";

const logoTatica = "/favicon.png";

export function AppSidebar() {
  const location = useLocation();
  const { signOut } = useAuth();
  const { isSuperAdmin } = useAdmin();
  const { t } = useTranslation();

  const isActive = (url?: string) => (url ? location.pathname === url : false);

  const handleMenuAction = (item: { action?: "logout" | "none" }) => {
    if (item.action === "logout") {
      signOut();
    }
  };

  const visibleGroups = menuGroups.filter((group) => {
    const visibleItems = group.items.filter(
      (item) => !item.hidden && (!item.adminOnly || isSuperAdmin)
    );
    return visibleItems.length > 0;
  });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-5 flex justify-center">
        <Link
          to="/dashboard"
          className="group flex items-center gap-3"
          aria-label="Ir para o dashboard"
          title="Dashboard"
        >
          <div className="relative grid place-items-center w-10 h-10 rounded-xl bg-primary/10 overflow-hidden">
            <img
              src={logoTatica}
              alt="Tática"
              className="relative z-10 h-7 w-7 object-contain transition-transform duration-200 group-hover:scale-105"
            />
          </div>
          <span className="text-sm font-semibold text-sidebar-accent-foreground tracking-wide group-data-[collapsible=icon]:hidden">
            Tática Gestão
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="scrollbar-thin px-2 py-2">
        {visibleGroups.map((group) => (
          <SidebarGroup key={group.id}>
            {group.labelKey && (
              <SidebarGroupLabel className="text-[11px] font-medium uppercase tracking-wider text-sidebar-muted px-3 mb-1">
                {group.isHardcodedLabel ? group.labelKey : t(group.labelKey)}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.filter((item) => !item.hidden && (!item.adminOnly || isSuperAdmin)).map((item) => (
                  <SidebarMenuItem key={item.titleKey}>
                    {item.url ? (
                      <SidebarMenuButton asChild isActive={isActive(item.url)}>
                        <Link to={item.url} className="rounded-lg transition-colors duration-150">
                          <item.icon className="h-[18px] w-[18px]" />
                          <span className="text-[13px]">{item.isHardcoded ? item.titleKey : t(item.titleKey)}</span>
                        </Link>
                      </SidebarMenuButton>
                    ) : (
                      <SidebarMenuButton
                        type="button"
                        isActive={isActive(item.url)}
                        onClick={() => handleMenuAction(item)}
                        className={`rounded-lg transition-colors duration-150 ${item.action === "logout" ? "text-destructive hover:text-destructive" : ""}`}
                      >
                        <item.icon className="h-[18px] w-[18px]" />
                        <span className="text-[13px]">{item.isHardcoded ? item.titleKey : t(item.titleKey)}</span>
                      </SidebarMenuButton>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border px-2 py-2">
        <SidebarMenu>
          {footerMenu
            .filter((item) => !item.hidden && (!item.adminOnly || isSuperAdmin))
            .map((item) => (
            <SidebarMenuItem key={item.titleKey}>
              {item.url ? (
                <SidebarMenuButton asChild isActive={isActive(item.url)}>
                  <Link to={item.url} className="rounded-lg transition-colors duration-150">
                    <item.icon className="h-[18px] w-[18px]" />
                    <span className="text-[13px]">{t(item.titleKey)}</span>
                  </Link>
                </SidebarMenuButton>
              ) : (
                <SidebarMenuButton
                  type="button"
                  isActive={isActive(item.url)}
                  onClick={() => handleMenuAction(item)}
                  className={`rounded-lg transition-colors duration-150 ${item.action === "logout" ? "text-destructive hover:text-destructive" : ""}`}
                >
                  <item.icon className="h-[18px] w-[18px]" />
                  <span className="text-[13px]">{t(item.titleKey)}</span>
                </SidebarMenuButton>
              )}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
