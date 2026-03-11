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
    <header className="sticky top-0 z-10 flex h-[60px] items-center gap-3 border-b border-border bg-white px-5">
      <SidebarTrigger className="text-muted-foreground hover:text-foreground transition-colors" />

      {location.pathname !== "/" && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          aria-label="Voltar"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
      )}

      {title && (
        <h1 className="text-sm font-semibold text-foreground">{title}</h1>
      )}

      <div className="ml-auto flex items-center gap-3">
        <CompanySelector />

        <div className="flex items-center">
          <Avatar className="h-[30px] w-[30px]">
            <AvatarFallback className="bg-primary text-white text-[11px] font-semibold tracking-wide">
              {user?.email ? getInitials(user.email) : "US"}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  );
}
