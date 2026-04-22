import { AlertTriangle, MessageCircle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useUserStatus } from "@/hooks/useUserStatus";
import { useAuth } from "@/contexts/AuthContext";

const supportWhatsAppRaw = String(import.meta.env.VITE_SUPPORT_WHATSAPP || "5585000000000");
const supportWhatsAppDigits = supportWhatsAppRaw.replace(/\D/g, "");
const supportWhatsAppHref = supportWhatsAppDigits ? `https://wa.me/${supportWhatsAppDigits}` : "";
const supportWhatsAppLabel = supportWhatsAppDigits ? `+${supportWhatsAppDigits}` : supportWhatsAppRaw;

export default function ContaBloqueada() {
  const { status, reason, updatedAt } = useUserStatus();
  const { signOut } = useAuth();

  const statusLabel = status === "deleted" ? "Conta removida" : "Conta suspensa";
  const fallbackReason =
    status === "deleted"
      ? "Seu acesso foi removido pela administração da plataforma."
      : "Seu acesso foi suspenso temporariamente pela administração da plataforma.";
  const reasonText = String(reason || "").trim() || fallbackReason;
  const updatedAtText = updatedAt
    ? new Date(updatedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : null;

  return (
    <div className="min-h-screen bg-[#F6F2EB] p-4 sm:p-8 flex items-center justify-center">
      <Card className="w-full max-w-2xl shadow-xl border-[#EAECF0]">
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-amber-600" />
            <Badge variant="destructive" className="text-sm">
              {statusLabel}
            </Badge>
          </div>
          <CardTitle className="text-2xl text-foreground">Acesso restrito</CardTitle>
          <CardDescription>
            Você não pode usar o sistema neste momento. Entre em contato com o suporte.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-muted-foreground">Motivo informado pela administração</p>
            <p className="mt-2 text-sm text-muted-foreground">{reasonText}</p>
            {updatedAtText && (
              <p className="mt-2 text-xs text-muted-foreground">Atualizado em: {updatedAtText}</p>
            )}
          </div>

          <div className="rounded-lg border border-[#EAECF0] bg-white p-4">
            <p className="text-sm font-semibold text-muted-foreground">Suporte da plataforma</p>
            <a
              href={supportWhatsAppHref}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-emerald-700 hover:text-emerald-800"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp: {supportWhatsAppLabel}
            </a>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => signOut()}>
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
