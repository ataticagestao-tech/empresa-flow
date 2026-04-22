import { SidebarTrigger } from "@/components/ui/sidebar";
import { CompanySelector } from "@/components/CompanySelector";
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
import { ArrowLeft, Plus, Moon, Sun, LogOut, Settings, User } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";

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
    <header className="sticky top-0 z-10 flex h-14 sm:h-16 items-center gap-2 sm:gap-3 border-b border-sidebar-border bg-sidebar px-3 sm:px-5 shadow-[0_1px_2px_rgba(0,0,0,0.2)]">
      <SidebarTrigger className="text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors flex-shrink-0" />

      {location.pathname !== "/" && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          aria-label="Voltar"
          className="h-7 w-7 sm:h-8 sm:w-8 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent flex-shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
      )}

      <div className="ml-auto flex items-center gap-2 sm:gap-3 flex-shrink-0">
        <CompanySelector />
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          title={theme === "dark" ? "Modo claro" : "Modo escuro"}
          className="h-7 w-7 sm:h-8 sm:w-8 flex items-center justify-center rounded-md border border-sidebar-border text-white/70 hover:bg-sidebar-accent hover:text-white transition-colors"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <button
          onClick={() => navigate("/empresas?nova=1")}
          title="Adicionar nova empresa"
          className="h-7 w-7 sm:h-8 sm:w-8 flex items-center justify-center rounded-md border border-sidebar-border text-white/70 hover:bg-sidebar-accent hover:text-white transition-colors"
        >
          <Plus className="h-4 w-4" />
        </button>

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
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-[#0BE041] border-2 border-sidebar" />
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
            <DropdownMenuItem onSelect={() => navigate("/configuracoes")}>
              <User className="mr-2 h-4 w-4" /> Perfil
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate("/configuracoes")}>
              <Settings className="mr-2 h-4 w-4" /> Configurações
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={handleLogout}
              className="text-[#D92D20] focus:text-[#D92D20] focus:bg-[#FEF3F2]"
            >
              <LogOut className="mr-2 h-4 w-4" /> Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
