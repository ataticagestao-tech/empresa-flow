import { useEffect } from "react";
import { Outlet, useLocation, Link } from "react-router-dom";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { CommandPalette } from "@/components/CommandPalette";
import { AgenteBanner } from "@/components/AgenteBanner";
import { WelcomeModal } from "@/components/onboarding/WelcomeModal";
import { StartHereButton } from "@/components/onboarding/StartHereButton";
import { NovaVendaFab } from "@/components/NovaVendaFab";
import { PageTitleProvider, usePageTitle } from "@/contexts/PageTitleContext";
import { menuGroups } from "@/config/menuConfig";
import { Home, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

function PageBreadcrumb({ title }: { title: string }) {
  const location = useLocation();
  const { t } = useTranslation();

  const matchedGroup = menuGroups.find((group) =>
    group.items.some((item) => item.url && location.pathname.startsWith(item.url))
  );

  const sectionLabel =
    matchedGroup?.labelKey && matchedGroup.id !== "dashboard"
      ? matchedGroup.isHardcodedLabel
        ? matchedGroup.labelKey
        : t(matchedGroup.labelKey)
      : null;

  const isDashboard = location.pathname === "/" || location.pathname.startsWith("/dashboard");

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1.5 text-[12px] text-[#667085] mb-2 select-none"
    >
      <Link
        to="/dashboard"
        className="flex items-center hover:text-[#059669] transition-colors"
        aria-label="Ir para o dashboard"
      >
        <Home className="h-3.5 w-3.5" />
      </Link>
      {sectionLabel && !isDashboard && (
        <>
          <ChevronRight className="h-3 w-3 text-[#98A2B3]" />
          <span>{sectionLabel}</span>
        </>
      )}
      <ChevronRight className="h-3 w-3 text-[#98A2B3]" />
      <span className="text-[#1D2939] font-medium truncate">{title}</span>
    </nav>
  );
}

function LayoutMain() {
  const { title } = usePageTitle();
  const location = useLocation();

  // Layout persiste entre navegações: precisamos resetar o scroll manualmente
  // ao trocar de rota (antes o remount fazia isso sozinho).
  useEffect(() => {
    const container = document.getElementById("app-scroll-container");
    if (container) container.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <main
      id="app-scroll-container"
      className="flex-1 min-w-0 p-3 sm:p-5 md:px-8 md:py-7 overflow-auto overflow-x-hidden"
    >
      {title && <PageBreadcrumb title={title} />}
      <Outlet />
    </main>
  );
}

/**
 * Moldura persistente do app: sidebar + header montam UMA vez e sobrevivem
 * às navegações. Só o miolo (Outlet) troca. Isso elimina a piscada e as
 * RPCs redundantes que disparavam a cada mudança de tela.
 */
export function PersistentLayout() {
  return (
    <PageTitleProvider>
      <SidebarProvider className="!min-h-0 h-svh overflow-hidden">
        <AppSidebar />
        <SidebarInset className="!min-h-0 h-svh overflow-hidden">
          <AppHeader />
          <LayoutMain />
        </SidebarInset>
        <CommandPalette />
        <AgenteBanner />
        <WelcomeModal />
        <StartHereButton />
        <NovaVendaFab />
      </SidebarProvider>
    </PageTitleProvider>
  );
}
