import { CompanySelector } from "@/components/CompanySelector";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowLeft, Plus, Moon, Sun, LogOut, Settings, Building2 } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import { COMMAND_PALETTE_OPEN_EVENT } from "@/components/CommandPalette";
import { NotificationBell } from "@/components/NotificationBell";

export function AppHeader() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, setTheme } = useTheme();

  const getInitials = (email: string) => {
    return email.substring(0, 2).toUpperCase();
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
  };

  return (
    <header className="sticky top-0 z-10 h-16 sm:h-20 border-b border-sidebar-border bg-sidebar shadow-[0_1px_2px_rgba(0,0,0,0.2)]">
      <div className="h-full flex items-center gap-1.5 sm:gap-3 mx-auto w-full max-w-[1280px] px-4 sm:px-8 lg:px-12">
      <Link
        to="/dashboard"
        className="flex items-center gap-2.5 flex-shrink-0 mr-1"
        aria-label="Ir para o dashboard"
        title="Dashboard"
      >
        <img src="/favicon.svg" alt="Gestap System" className="h-8 w-8 object-contain" />
        <span className="hidden md:flex flex-col leading-tight min-w-0">
          <span className="text-[13px] font-semibold text-sidebar-foreground tracking-tight">Gestap System.</span>
          <span className="text-[10px] font-medium text-sidebar-foreground/50 uppercase tracking-[0.08em]">Gestão Empresarial</span>
        </span>
      </Link>

      {location.pathname !== "/" && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          aria-label="Voltar"
          className="hidden sm:inline-flex h-7 w-7 sm:h-8 sm:w-8 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent flex-shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
      )}

      <div className="ml-auto flex items-center gap-1.5 sm:gap-3 flex-shrink min-w-0">
        <CompanySelector />
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          title={theme === "dark" ? "Modo claro" : "Modo escuro"}
          className="hidden sm:flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-md border border-sidebar-border text-white/70 hover:bg-sidebar-accent hover:text-white transition-colors flex-shrink-0"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <button
          onClick={() => window.dispatchEvent(new Event(COMMAND_PALETTE_OPEN_EVENT))}
          title="Buscar páginas e ações (Ctrl+K)"
          aria-label="Abrir busca rápida"
          className="hidden sm:flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-md border border-sidebar-border text-white/70 hover:bg-sidebar-accent hover:text-white transition-colors flex-shrink-0"
        >
          <Plus className="h-4 w-4" />
        </button>
        <NotificationBell />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="relative flex items-center outline-none focus-visible:ring-2 focus-visible:ring-[#059669]/40 rounded-full"
              aria-label="Abrir menu do usuário"
            >
              <Avatar className="h-[32px] w-[32px]">
                <AvatarFallback className="bg-[#059669] text-white text-[12px] font-semibold tracking-wide">
                  {user?.email ? getInitials(user.email) : "US"}
                </AvatarFallback>
              </Avatar>
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-[#059669] border-2 border-sidebar" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {user?.email && (
              <>
                <DropdownMenuLabel className="font-normal">
                  <p className="text-[11px] text-muted-foreground">Conectado como</p>
                  <p className="text-[13px] font-medium truncate">{user.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onSelect={() => navigate("/empresas")}>
              <Building2 className="mr-2 h-4 w-4" /> Minhas empresas
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate("/configuracoes")}>
              <Settings className="mr-2 h-4 w-4" /> Configurações
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={handleLogout}
              className="text-[#E53E3E] focus:text-[#E53E3E] focus:bg-[#FEE2E2]"
            >
              <LogOut className="mr-2 h-4 w-4" /> Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      </div>
    </header>
  );
}
