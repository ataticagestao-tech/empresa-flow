import { SidebarTrigger } from "@/components/ui/sidebar";
import { CompanySelector } from "@/components/CompanySelector";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
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
    <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-[#2a2a2a] bg-[#121212] px-5 shadow-[0_1px_3px_rgba(0,0,0,0.2)]">
      <SidebarTrigger className="text-white/60 hover:text-white transition-colors" />

      {location.pathname !== "/" && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          aria-label="Voltar"
          className="h-8 w-8 text-white/60 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
      )}

      {title && (
        <h1 className="text-[13px] font-semibold text-white">{title}</h1>
      )}

      <div className="ml-auto flex items-center gap-3">
        <CompanySelector />

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
