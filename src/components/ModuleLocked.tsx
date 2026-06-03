import { Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { MODULE_LABELS, type ModuleId } from "@/config/entitlements";

/**
 * Tela mostrada quando a rota pertence a um módulo que o pacote da empresa
 * não inclui (guard de rota da modularização por pacote).
 */
export function ModuleLocked({ module }: { module: ModuleId }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-24 px-4">
      <div className="w-14 h-14 rounded-full bg-[#F6F2EB] flex items-center justify-center mb-4">
        <Lock className="w-6 h-6 text-[#667085]" />
      </div>
      <h2 className="text-lg font-semibold text-[#1D2939] mb-1">
        Módulo não incluído no seu plano
      </h2>
      <p className="text-sm text-[#667085] max-w-md mb-1">
        O módulo <strong>{MODULE_LABELS[module]}</strong> não faz parte do pacote
        contratado por esta empresa.
      </p>
      <p className="text-sm text-[#667085] max-w-md mb-6">
        Fale com a Tática para liberar este recurso ou fazer upgrade do plano.
      </p>
      <Link
        to="/dashboard"
        className="text-sm font-medium text-emerald-700 hover:underline"
      >
        Voltar ao Dashboard
      </Link>
    </div>
  );
}
