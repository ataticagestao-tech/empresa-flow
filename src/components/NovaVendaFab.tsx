import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { Plus, X } from "lucide-react";

const STORAGE_KEY_HIDDEN = "nova_venda_fab_hidden";

/**
 * Botão flutuante "+ Nova Venda" — círculo verde fixo no canto inferior
 * direito, presente em qualquer página do sistema. Clicar leva a
 * /vendas?new=true, que abre o modal de nova venda automaticamente.
 *
 * Some quando:
 *   - Não há empresa selecionada / usuário deslogado
 *   - Já está na página de Vendas (botão dedicado lá)
 *   - Páginas públicas (/venda, /lp, /checkout) ou /auth, /conta-bloqueada
 *   - Usuário fechou via X (persiste no localStorage)
 */
export function NovaVendaFab() {
  const { user } = useAuth();
  const { selectedCompany } = useCompany();
  const navigate = useNavigate();
  const location = useLocation();

  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY_HIDDEN) === "true"; } catch { return false; }
  });
  const [hover, setHover] = useState(false);

  const hiddenRoute =
    location.pathname.startsWith("/auth") ||
    location.pathname.startsWith("/conta-bloqueada") ||
    location.pathname.startsWith("/lp") ||
    location.pathname === "/venda" ||
    location.pathname.startsWith("/checkout");

  if (!user) return null;
  if (!selectedCompany?.id) return null;
  if (hidden) return null;
  if (hiddenRoute) return null;

  const dismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    try { localStorage.setItem(STORAGE_KEY_HIDDEN, "true"); } catch {}
    setHidden(true);
  };

  return (
    <div
      style={{ position: "fixed", top: 76, right: 20, zIndex: 54 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Botão fechar */}
      <button
        onClick={dismiss}
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

      {/* FAB redondo */}
      <button
        onClick={() => navigate("/vendas?new=true")}
        title="Nova Venda"
        aria-label="Nova Venda"
        style={{
          height: 56,
          width: hover ? "auto" : 56,
          paddingLeft: hover ? 18 : 0,
          paddingRight: hover ? 22 : 0,
          borderRadius: 999,
          background: "#039855",
          color: "#FFFFFF",
          border: "none",
          boxShadow: "0 8px 20px rgba(3, 152, 85, 0.32)",
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          fontSize: 14, fontWeight: 700,
          whiteSpace: "nowrap",
          transition: "width 0.18s ease, padding 0.18s ease, transform 0.15s, box-shadow 0.15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 12px 24px rgba(3, 152, 85, 0.4)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 8px 20px rgba(3, 152, 85, 0.32)"; }}
      >
        <Plus size={24} strokeWidth={2.75} style={{ flexShrink: 0 }} />
        {hover && <span>Nova Venda</span>}
      </button>
    </div>
  );
}

export default NovaVendaFab;
