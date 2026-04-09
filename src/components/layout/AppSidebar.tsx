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
          className="group flex items-center gap-2.5"
          aria-label="Ir para o dashboard"
          title="Dashboard"
        >
          <div className="relative grid place-items-center w-7 h-7 rounded-md bg-primary overflow-hidden">
            <img
              src={logoTatica}
              alt="Tática"
              className="relative z-10 h-5 w-5 object-contain transition-transform duration-200 group-hover:scale-105"
            />
          </div>
          <span className="text-[13px] font-semibold text-white tracking-tight group-data-[collapsible=icon]:hidden">
            Tática Gestão
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="scrollbar-thin px-2.5 py-2">
        {visibleGroups.map((group) => (
          <SidebarGroup key={group.id}>
            {group.labelKey && (
              <SidebarGroupLabel className="text-[12px] font-semibold uppercase tracking-[1px] text-sidebar-muted px-2 mb-1">
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
                          <item.icon className="h-[15px] w-[15px] opacity-60" />
                          <span className="text-[12.5px]">{item.isHardcoded ? item.titleKey : t(item.titleKey)}</span>
                        </Link>
                      </SidebarMenuButton>
                    ) : (
                      <SidebarMenuButton
                        type="button"
                        isActive={isActive(item.url)}
                        onClick={() => handleMenuAction(item)}
                        className={`rounded-lg transition-colors duration-150 ${item.action === "logout" ? "text-[#EF4444] hover:text-[#FF6B6B] hover:bg-[#3a1515]" : ""}`}
                      >
                        <item.icon className="h-[15px] w-[15px] opacity-60" />
                        <span className="text-[12.5px]">{item.isHardcoded ? item.titleKey : t(item.titleKey)}</span>
                      </SidebarMenuButton>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border px-2.5 py-2">
        <SidebarMenu>
          {footerMenu
            .filter((item) => !item.hidden && (!item.adminOnly || isSuperAdmin))
            .map((item) => (
            <SidebarMenuItem key={item.titleKey}>
              {item.url ? (
                <SidebarMenuButton asChild isActive={isActive(item.url)}>
                  <Link to={item.url} className="rounded-lg transition-colors duration-150">
                    <item.icon className="h-[15px] w-[15px] opacity-60" />
                    <span className="text-[12.5px]">{t(item.titleKey)}</span>
                  </Link>
                </SidebarMenuButton>
              ) : (
                <SidebarMenuButton
                  type="button"
                  isActive={isActive(item.url)}
                  onClick={() => handleMenuAction(item)}
                  className={`rounded-lg transition-colors duration-150 ${item.action === "logout" ? "text-[#EF4444] hover:text-[#FF6B6B] hover:bg-[#3a1515]" : ""}`}
                >
                  <item.icon className="h-[15px] w-[15px] opacity-60" />
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
