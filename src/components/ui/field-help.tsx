import { ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface FieldHelpProps {
  children: ReactNode;
  size?: number;
  className?: string;
}

/**
 * Ícone "?" pequeno que mostra uma explicação ao passar o mouse.
 * Use ao lado de labels de campo cujo significado não é óbvio.
 *
 * Exemplo:
 *   <label>Saldo inicial <FieldHelp>Saldo do dia em que você começou...</FieldHelp></label>
 */
export function FieldHelp({ children, size = 13, className = "" }: FieldHelpProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Ajuda"
            className={`inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors align-middle ${className}`}
            style={{ marginLeft: 4 }}
          >
            <HelpCircle size={size} />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="start"
          className="max-w-xs text-xs leading-relaxed bg-[#1D2939] text-white border-[#1D2939]"
        >
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default FieldHelp;
