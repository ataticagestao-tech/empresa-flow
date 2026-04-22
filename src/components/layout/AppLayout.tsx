import { ReactNode } from "react";
import { Navigate, useLocation, Link } from "react-router-dom";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useUserStatus } from "@/hooks/useUserStatus";
import { CommandPalette } from "@/components/CommandPalette";
import { LoadingScreen } from "@/components/LoadingScreen";
import { menuGroups } from "@/config/menuConfig";
import { Home, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
}

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
      className="flex items-center gap-1.5 text-[12px] text-[#667085] mb-4 select-none"
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

export function AppLayout({ children, title }: AppLayoutProps) {
  const { user, loading } = useAuth();
  const { isSuspended, isDeleted } = useUserStatus();
  const location = useLocation();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    const redirect = location.pathname !== "/" ? `?redirect=${encodeURIComponent(location.pathname)}` : "";
    return <Navigate to={`/auth${redirect}`} replace />;
  }

  if (isSuspended || isDeleted) {
    return <Navigate to="/conta-bloqueada" replace />;
  }

  return (
    <SidebarProvider className="!min-h-0 h-svh overflow-hidden">
      <AppSidebar />
      <SidebarInset className="!min-h-0 h-svh overflow-hidden">
        <AppHeader />
        <main id="app-scroll-container" className="flex-1 min-w-0 p-3 sm:p-5 md:px-8 md:py-7 overflow-auto overflow-x-hidden">
          {title && <PageBreadcrumb title={title} />}
          {children}
        </main>
      </SidebarInset>
      <CommandPalette />
    </SidebarProvider>
  );
}
