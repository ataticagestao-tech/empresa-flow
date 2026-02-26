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
  useSidebar,
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
  const { setOpenMobile } = useSidebar();

  const isActive = (url?: string) => (url ? location.pathname === url : false);

  const handleMenuAction = (item: { action?: "logout" | "none" }) => {
    if (item.action === "logout") {
      signOut();
    }
  };

  // Filtrar grupos que têm pelo menos um item visível
  const visibleGroups = menuGroups.filter((group) => {
    const visibleItems = group.items.filter(
      (item) => !item.hidden && (!item.adminOnly || isSuperAdmin)
    );
    return visibleItems.length > 0;
  });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="bg-[#1C3D5A] border-b border-[#1C3D5A]/50 p-4 flex justify-center">
        <Link
          to="/dashboard"
          onClick={() => setOpenMobile(false)}
          className="group flex items-center gap-3"
          aria-label="Ir para o dashboard"
          title="Dashboard"
        >
          <div className="relative grid place-items-center w-14 h-14 rounded-2xl border border-white/14 bg-white/7 shadow-[0_14px_34px_rgba(0,0,0,0.35)] overflow-visible">
            {/* Halo colorido sutil (por trás) */}
            <div
              className="tatica-sidebar-halo pointer-events-none absolute -inset-3 rounded-[22px] blur-xl opacity-70"
              aria-hidden="true"
            />
            {/* Vidro/shine */}
            <div
              className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-white/14 via-white/6 to-transparent"
              aria-hidden="true"
            />
            <img
              src={logoTatica}
              alt="Tática"
              className="relative z-10 h-10 w-10 object-contain drop-shadow-[0_10px_22px_rgba(0,0,0,0.45)] transition-transform duration-300 group-hover:scale-[1.03]"
              style={{ filter: "brightness(1.08) contrast(1.18)" }}
            />
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="scrollbar-thin">
        {visibleGroups.map((group) => (
          <SidebarGroup key={group.id}>
            {group.labelKey && (
              <SidebarGroupLabel>
                {group.isHardcodedLabel ? group.labelKey : t(group.labelKey)}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.filter((item) => !item.hidden && (!item.adminOnly || isSuperAdmin)).map((item) => (
                  <SidebarMenuItem key={item.titleKey}>
                    {item.url ? (
                      <SidebarMenuButton asChild isActive={isActive(item.url)}>
                        <Link to={item.url} onClick={() => setOpenMobile(false)}>
                          <item.icon />
                          <span>{item.isHardcoded ? item.titleKey : t(item.titleKey)}</span>
                        </Link>
                      </SidebarMenuButton>
                    ) : (
                      <SidebarMenuButton
                        type="button"
                        isActive={isActive(item.url)}
                        onClick={() => handleMenuAction(item)}
                        className={item.action === "logout" ? "text-destructive hover:text-destructive" : ""}
                      >
                        <item.icon />
                        <span>{item.isHardcoded ? item.titleKey : t(item.titleKey)}</span>
                      </SidebarMenuButton>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          {footerMenu
            .filter((item) => !item.hidden && (!item.adminOnly || isSuperAdmin))
            .map((item) => (
            <SidebarMenuItem key={item.titleKey}>
              {item.url ? (
                <SidebarMenuButton asChild isActive={isActive(item.url)}>
                  <Link to={item.url} onClick={() => setOpenMobile(false)}>
                    <item.icon />
                    <span>{t(item.titleKey)}</span>
                  </Link>
                </SidebarMenuButton>
              ) : (
                <SidebarMenuButton
                  type="button"
                  isActive={isActive(item.url)}
                  onClick={() => handleMenuAction(item)}
                  className={item.action === "logout" ? "text-destructive hover:text-destructive" : ""}
                >
                  <item.icon />
                  <span>{t(item.titleKey)}</span>
                </SidebarMenuButton>
              )}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
