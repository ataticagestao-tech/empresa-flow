import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useCompany } from "@/contexts/CompanyContext";
import { useImplantacao } from "@/hooks/useImplantacao";
import { Sparkles, X, ChevronRight, CheckCircle2, Circle } from "lucide-react";

const STORAGE_KEY_HIDDEN = "start_here_button_hidden";

/**
 * Botão flutuante "Comece por aqui" — aparece em qualquer página enquanto
 * o checklist de onboarding está incompleto. Clicar abre um popover compacto
 * com os passos pendentes e link pra ir direto ou abrir o dashboard.
 *
 * Some automaticamente quando:
 *   - Não há empresa selecionada
 *   - Checklist 100% concluído
 *   - Usuário está nas páginas /auth ou /conta-bloqueada
 *   - Usuário fechou via X (persiste por empresa)
 */
export function StartHereButton() {
  const { selectedCompany } = useCompany();
  const navigate = useNavigate();
  const location = useLocation();
  const [popOpen, setPopOpen] = useState(false);

  const companyId = selectedCompany?.id;
  const hiddenKey = companyId ? `${STORAGE_KEY_HIDDEN}_${companyId}` : null;
  const [hidden, setHidden] = useState(() => {
    if (!hiddenKey) return false;
    try { return localStorage.getItem(hiddenKey) === "true"; } catch { return false; }
  });

  const { steps, doneCount, total, allDone, isLoading } = useImplantacao(companyId);
  const remaining = total - doneCount;

  const hideFab = () => {
    if (hiddenKey) { try { localStorage.setItem(hiddenKey, "true"); } catch {} }
    setHidden(true);
    setPopOpen(false);
  };

  // Hidden routes (auth, blocked account, etc) — keep FAB out of context
  const hiddenRoute =
    location.pathname.startsWith("/auth") ||
    location.pathname.startsWith("/conta-bloqueada") ||
    location.pathname.startsWith("/lp") ||
    location.pathname.startsWith("/venda");

  if (!companyId) return null;
  if (isLoading) return null;
  if (allDone) return null;
  if (hidden) return null;
  if (hiddenRoute) return null;
  // Quando já está no dashboard o card grande aparece — evita redundância
  if (location.pathname.startsWith("/dashboard")) return null;

  return (
    <>
      {/* Popover */}
      {popOpen && (
        <div
          style={{
            position: "fixed",
            bottom: 152, right: 20,
            width: 320,
            background: "#FFFFFF",
            border: "1px solid #EAECF0",
            borderRadius: 14,
            boxShadow: "0 12px 32px rgba(15, 23, 42, 0.16)",
            zIndex: 60,
            overflow: "hidden",
            animation: "fadeIn 0.18s ease-out",
          }}
        >
          <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid #F2F4F7" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1D2939" }}>Comece por aqui</div>
              <button
                onClick={() => setPopOpen(false)}
                style={{ background: "transparent", border: "none", padding: 2, cursor: "pointer", color: "#98A2B3", display: "flex" }}
                title="Fechar"
              >
                <X size={14} />
              </button>
            </div>
            <div style={{ fontSize: 12, color: "#667085" }}>
              Faltam <b style={{ color: "#1D2939" }}>{remaining}</b> de {total} passos para terminar o setup.
            </div>
            <div style={{ marginTop: 10, height: 4, background: "#F2F4F7", borderRadius: 999, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${(doneCount / total) * 100}%`,
                  background: "#059669",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
          </div>
          <div style={{ padding: 6, maxHeight: 280, overflowY: "auto" }}>
            {steps.map(step => (
              <button
                key={step.key}
                onClick={() => { setPopOpen(false); navigate(step.route); }}
                disabled={step.done && step.key === "empresa"}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 10px",
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  borderRadius: 8,
                  cursor: step.done && step.key === "empresa" ? "default" : "pointer",
                  textAlign: "left",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (!(step.done && step.key === "empresa")) e.currentTarget.style.background = "#F9FAFB";
                }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                {step.done ? (
                  <CheckCircle2 size={16} style={{ color: "#039855", flexShrink: 0 }} />
                ) : (
                  <Circle size={16} style={{ color: "#D0D5DD", flexShrink: 0 }} strokeWidth={1.5} />
                )}
                <span
                  style={{
                    flex: 1,
                    fontSize: 13,
                    fontWeight: 500,
                    color: step.done ? "#98A2B3" : "#1D2939",
                    textDecoration: step.done ? "line-through" : "none",
                  }}
                >
                  {step.title}
                </span>
                {!step.done && <ChevronRight size={14} style={{ color: "#98A2B3", flexShrink: 0 }} />}
              </button>
            ))}
          </div>
          <div
            style={{
              padding: "10px 16px",
              borderTop: "1px solid #F2F4F7",
              background: "#FAFAFA",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}
          >
            <button
              onClick={() => { setPopOpen(false); navigate("/implantacao"); }}
              style={{
                background: "transparent", border: "none", padding: 0,
                fontSize: 12, fontWeight: 600, color: "#059669", cursor: "pointer",
              }}
            >
              Ver checklist completo →
            </button>
            <button
              onClick={hideFab}
              style={{
                background: "transparent", border: "none", padding: 0,
                fontSize: 11, color: "#98A2B3", cursor: "pointer",
              }}
              title="Não mostrar mais"
            >
              Ocultar
            </button>
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setPopOpen(o => !o)}
        title="Comece por aqui"
        style={{
          position: "fixed",
          bottom: 88, right: 20,
          height: 48, paddingLeft: 16, paddingRight: 18,
          borderRadius: 999,
          background: "#039855",
          color: "#FFFFFF",
          border: "none",
          boxShadow: "0 8px 20px rgba(3, 152, 85, 0.32)",
          cursor: "pointer",
          display: "flex", alignItems: "center", gap: 8,
          fontSize: 13, fontWeight: 700,
          zIndex: 55,
          transition: "transform 0.15s, box-shadow 0.15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 12px 24px rgba(3, 152, 85, 0.4)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 8px 20px rgba(3, 152, 85, 0.32)"; }}
      >
        <Sparkles size={16} />
        <span>Comece por aqui</span>
        <span
          style={{
            background: "#FFFFFF",
            color: "#039855",
            fontSize: 11,
            fontWeight: 800,
            borderRadius: 999,
            padding: "1px 7px",
            marginLeft: 2,
          }}
        >
          {remaining}
        </span>
      </button>

      {/* X para ocultar o FAB da tela */}
      <button
        onClick={hideFab}
        title="Ocultar"
        style={{
          position: "fixed",
          bottom: 124, right: 16,
          width: 20, height: 20,
          borderRadius: 999,
          background: "#FFFFFF",
          color: "#667085",
          border: "1px solid #EAECF0",
          boxShadow: "0 2px 6px rgba(15, 23, 42, 0.18)",
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 0,
          zIndex: 56,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "#F2F4F7"; e.currentTarget.style.color = "#1D2939"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "#FFFFFF"; e.currentTarget.style.color = "#667085"; }}
      >
        <X size={12} strokeWidth={2.5} />
      </button>
    </>
  );
}

export default StartHereButton;
