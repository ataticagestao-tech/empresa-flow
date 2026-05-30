import { useEffect } from "react";
import { Outlet, useLocation, Link } from "react-router-dom";
import { AppHeader } from "./AppHeader";
import { AppTopNav } from "./AppTopNav";
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

  const itemMatchesPath = (item: { url?: string; children?: any[] }): boolean =>
    (!!item.url && location.pathname.startsWith(item.url)) ||
    (item.children?.some(itemMatchesPath) ?? false);
  const matchedGroup = menuGroups.find((group) => group.items.some(itemMatchesPath));

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

  // Layout persiste entre navegações: reseta o scroll ao trocar de rota
  // (antes o remount fazia isso sozinho).
  useEffect(() => {
    const container = document.getElementById("app-scroll-container");
    if (container) container.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <main
      id="app-scroll-container"
      className="flex-1 min-w-0 py-4 sm:py-6 md:py-7 overflow-auto overflow-x-hidden"
    >
      <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-8 lg:px-12">
        {title && <PageBreadcrumb title={title} />}
        <Outlet />
      </div>
    </main>
  );
}

/**
 * Moldura persistente do app com NAVEGAÇÃO NO TOPO (menu horizontal).
 * AppHeader (logo + empresa + ações) e AppTopNav (menu de grupos) montam
 * UMA vez e sobrevivem às navegações; só o miolo (Outlet) troca.
 */
export function PersistentLayout() {
  return (
    <PageTitleProvider>
      <div className="flex flex-col h-svh overflow-hidden bg-background">
        <AppHeader />
        <AppTopNav />
        <LayoutMain />
      </div>
      <CommandPalette />
      <AgenteBanner />
      <WelcomeModal />
      <StartHereButton />
      <NovaVendaFab />
    </PageTitleProvider>
  );
}
