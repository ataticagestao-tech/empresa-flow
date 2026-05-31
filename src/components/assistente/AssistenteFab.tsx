import { useState } from "react";
import { X } from "lucide-react";
import { AssistenteChat } from "./AssistenteChat";

/** Glifo oficial do WhatsApp (lucide não tem ícone de marca). */
function WhatsappIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

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
            width: "min(340px, calc(100vw - 32px))",
            height: "min(460px, calc(100vh - 120px))",
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
              background: "#075E54",
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
                <WhatsappIcon size={17} />
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
          <div style={{ flex: 1, minHeight: 0, padding: 10 }}>
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
            background: "#25D366",
            color: "#FFFFFF",
            border: "none",
            boxShadow: "0 8px 22px rgba(37, 211, 102, 0.42)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 57,
            transition: "transform 0.15s, box-shadow 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow = "0 12px 28px rgba(37, 211, 102, 0.5)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 8px 22px rgba(37, 211, 102, 0.42)";
          }}
        >
          <WhatsappIcon size={30} />
        </button>
      )}
    </>
  );
}
