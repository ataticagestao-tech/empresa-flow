import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { Plus, X } from "lucide-react";

/**
 * Botões flutuantes de ação rápida no canto superior direito, presentes em
 * qualquer página do sistema:
 *   - Verde: "Nova Venda"  → /vendas?new=true
 *   - Vermelho claro: "Lançar CP" → /contas-pagar?new=true
 * Ambas as rotas abrem o respectivo modal automaticamente.
 *
 * Cada botão tem um X que o oculta individualmente (persiste no localStorage).
 * Some em páginas públicas (/venda, /lp, /checkout), /auth e /conta-bloqueada,
 * ou quando não há empresa selecionada / usuário deslogado.
 */

interface FabButtonProps {
  label: string;
  color: string;
  shadow: string;
  shadowHover: string;
  iconColor: string;
  onClick: () => void;
  onDismiss: () => void;
}

function FabButton({ label, color, shadow, shadowHover, iconColor, onClick, onDismiss }: FabButtonProps) {
  const [hover, setHover] = useState(false);

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        title="Ocultar botão"
        style={{
          position: "absolute",
          top: -6, right: -6,
          width: 22, height: 22,
          borderRadius: 999,
          background: "#FFFFFF",
          border: "1px solid #EAECF0",
          boxShadow: "0 2px 6px rgba(15,23,42,0.16)",
          color: "#667085",
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 0,
          zIndex: 1,
        }}
      >
        <X size={13} strokeWidth={2.5} />
      </button>

      <button
        onClick={onClick}
        title={label}
        aria-label={label}
        style={{
          height: 56,
          width: hover ? "auto" : 56,
          paddingLeft: hover ? 18 : 0,
          paddingRight: hover ? 22 : 0,
          borderRadius: 999,
          background: color,
          color: iconColor,
          border: "none",
          boxShadow: shadow,
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          fontSize: 14, fontWeight: 700,
          whiteSpace: "nowrap",
          transition: "width 0.18s ease, padding 0.18s ease, transform 0.15s, box-shadow 0.15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = shadowHover; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = shadow; }}
      >
        <Plus size={24} strokeWidth={2.75} style={{ flexShrink: 0 }} />
        {hover && <span>{label}</span>}
      </button>
    </div>
  );
}

export function NovaVendaFab() {
  const { user } = useAuth();
  const { selectedCompany } = useCompany();
  const navigate = useNavigate();
  const location = useLocation();

  const [vendaHidden, setVendaHidden] = useState(() => {
    try { return localStorage.getItem("nova_venda_fab_hidden") === "true"; } catch { return false; }
  });
  const [cpHidden, setCpHidden] = useState(() => {
    try { return localStorage.getItem("lancar_cp_fab_hidden") === "true"; } catch { return false; }
  });

  const hiddenRoute =
    location.pathname.startsWith("/auth") ||
    location.pathname.startsWith("/conta-bloqueada") ||
    location.pathname.startsWith("/lp") ||
    location.pathname === "/venda" ||
    location.pathname.startsWith("/checkout");

  if (!user) return null;
  if (!selectedCompany?.id) return null;
  if (hiddenRoute) return null;
  if (vendaHidden && cpHidden) return null;

  const dismissVenda = () => {
    try { localStorage.setItem("nova_venda_fab_hidden", "true"); } catch {}
    setVendaHidden(true);
  };
  const dismissCp = () => {
    try { localStorage.setItem("lancar_cp_fab_hidden", "true"); } catch {}
    setCpHidden(true);
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 76, right: 20,
        zIndex: 54,
        display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 14,
      }}
    >
      {!vendaHidden && (
        <FabButton
          label="Nova Venda"
          color="#039855"
          iconColor="#FFFFFF"
          shadow="0 8px 20px rgba(3, 152, 85, 0.32)"
          shadowHover="0 12px 24px rgba(3, 152, 85, 0.4)"
          onClick={() => navigate("/vendas?new=true")}
          onDismiss={dismissVenda}
        />
      )}
      {!cpHidden && (
        <FabButton
          label="Lançar CP"
          color="#F97066"
          iconColor="#FFFFFF"
          shadow="0 8px 20px rgba(240, 68, 56, 0.30)"
          shadowHover="0 12px 24px rgba(240, 68, 56, 0.4)"
          onClick={() => navigate("/contas-pagar?new=true")}
          onDismiss={dismissCp}
        />
      )}
    </div>
  );
}

export default NovaVendaFab;
