import { useState } from "react";
import { Bot, X } from "lucide-react";
import { AssistenteChat } from "./AssistenteChat";

/**
 * Botão flutuante (canto inferior direito) que abre o Assistente Tatica
 * num painel sobre a página. Disponível em todas as telas autenticadas.
 * Fica abaixo do FAB de onboarding (bottom:88) — bottom:24 aqui.
 */
export function AssistenteFab() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Painel do chat */}
      {open && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            width: "min(390px, calc(100vw - 32px))",
            height: "min(640px, calc(100vh - 96px))",
            background: "#FFFFFF",
            border: "1px solid #EAECF0",
            borderRadius: 16,
            boxShadow: "0 16px 48px rgba(15, 23, 42, 0.22)",
            zIndex: 58,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            animation: "fadeIn 0.18s ease-out",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              padding: "12px 14px",
              background: "#071D41",
              color: "#FFFFFF",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <div
                style={{
                  height: 30,
                  width: 30,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.14)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Bot size={17} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>Assistente Tatica</div>
                <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.7)" }}>Pergunte ou peça uma ação</div>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              title="Fechar"
              style={{
                background: "transparent",
                border: "none",
                color: "rgba(255,255,255,0.85)",
                cursor: "pointer",
                padding: 4,
                display: "flex",
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Conteúdo do chat */}
          <div style={{ flex: 1, minHeight: 0, padding: "0 14px 12px" }}>
            <AssistenteChat fill />
          </div>
        </div>
      )}

      {/* FAB */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="Assistente Tatica"
          aria-label="Abrir assistente"
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            height: 56,
            width: 56,
            borderRadius: 999,
            background: "#071D41",
            color: "#FFFFFF",
            border: "none",
            boxShadow: "0 8px 22px rgba(7, 29, 65, 0.38)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 57,
            transition: "transform 0.15s, box-shadow 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow = "0 12px 28px rgba(7, 29, 65, 0.46)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 8px 22px rgba(7, 29, 65, 0.38)";
          }}
        >
          <Bot size={26} />
        </button>
      )}
    </>
  );
}
