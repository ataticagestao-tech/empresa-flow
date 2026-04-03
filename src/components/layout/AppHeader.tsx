import { SidebarTrigger } from "@/components/ui/sidebar";
import { CompanySelector } from "@/components/CompanySelector";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

interface AppHeaderProps {
  title?: string;
}

export function AppHeader({ title }: AppHeaderProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const getInitials = (email: string) => {
    return email.substring(0, 2).toUpperCase();
  };

  return (
    <header className="sticky top-0 z-10 flex h-12 sm:h-14 items-center gap-2 sm:gap-3 border-b border-[#2a2a2a] bg-[#121212] px-3 sm:px-5 shadow-[0_1px_3px_rgba(0,0,0,0.2)]">
      <SidebarTrigger className="text-white/60 hover:text-white transition-colors flex-shrink-0" />

      {location.pathname !== "/" && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          aria-label="Voltar"
          className="h-7 w-7 sm:h-8 sm:w-8 text-white/60 hover:text-white flex-shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
      )}

      {title && (
        <h1 className="text-[11px] sm:text-[13px] font-semibold text-white truncate min-w-0">{title}</h1>
      )}

      <div className="ml-auto flex items-center gap-2 sm:gap-3 flex-shrink-0">
        <CompanySelector />
        <button
          onClick={() => navigate("/empresas?nova=1")}
          title="Adicionar nova empresa"
          className="h-7 w-7 sm:h-8 sm:w-8 flex items-center justify-center rounded-md bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-colors"
        >
          <Plus className="h-4 w-4" />
        </button>

        <div className="relative flex items-center">
          <Avatar className="h-[32px] w-[32px]">
            <AvatarFallback className="bg-[#2563EB] text-white text-[11px] font-semibold tracking-wide">
              {user?.email ? getInitials(user.email) : "US"}
            </AvatarFallback>
          </Avatar>
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-[#22C55E] border-2 border-[#121212]" />
        </div>
      </div>
    </header>
  );
}
