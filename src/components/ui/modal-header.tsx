import { type ReactNode } from "react";
import { X } from "lucide-react";

interface ModalHeaderProps {
  title: string;
  subtitle?: ReactNode;
  onClose?: () => void;
}

/**
 * Cabeçalho padrão dos modais do sistema: barra azul-escura (#071D41)
 * com título branco em maiúsculas e subtítulo translúcido.
 * Use dentro de um DialogContent com `hideClose` + `p-0` (corpo num <div className="p-5">),
 * ou no topo de um modal próprio (overlay + card branco).
 */
export function ModalHeader({ title, subtitle, onClose }: ModalHeaderProps) {
  return (
    <div className="flex items-center justify-between px-5 py-4 sticky top-0 z-20" style={{ backgroundColor: "#071D41", borderTopLeftRadius: 14, borderTopRightRadius: 14 }}>
      <div className="min-w-0">
        <h3
          className="uppercase truncate"
          style={{ fontSize: 17, fontWeight: 800, letterSpacing: "0.07em", color: "#FFFFFF", fontFamily: 'var(--font-display, "Inter", sans-serif)' }}
        >
          {title}
        </h3>
        {subtitle ? (
          <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.72)", marginTop: 2, fontFamily: 'var(--font-body, "Inter", sans-serif)' }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {onClose ? (
        <button type="button" onClick={onClose} aria-label="Fechar" className="text-white/55 hover:text-white transition shrink-0 ml-3">
          <X size={18} />
        </button>
      ) : null}
    </div>
  );
}
