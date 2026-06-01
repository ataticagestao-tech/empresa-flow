import { useNavigate } from "react-router-dom";
import { useCompany } from "@/contexts/CompanyContext";

/**
 * Faixa de abas do Dashboard: "Visão Geral | Indicadores".
 * A rota /dashboard/:id é dinâmica e NÃO casa com o ModuleTabs (que casa por url
 * exata do menuConfig), por isso este componente dedicado.
 * Mesma aparência do ModuleTabs (faixa com borda inferior, abas uppercase).
 */
export function DashboardTabs({ active }: { active: "visao" | "indicadores" }) {
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();
  const cId = selectedCompany?.id;

  const goVisao = () => navigate(cId ? `/dashboard/${cId}` : "/dashboard");
  const goIndicadores = () => navigate("/indicadores");

  const base =
    "px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-colors border-b-2 whitespace-nowrap";
  const cls = (isActive: boolean) =>
    `${base} ${
      isActive
        ? "text-[#059669] border-[#059669]"
        : "text-[#555] border-transparent hover:text-[#1D2939]"
    }`;

  return (
    <div className="flex border-b border-[#EAECF0] overflow-x-auto">
      <button type="button" onClick={goVisao} className={cls(active === "visao")}>
        Visão Geral
      </button>
      <button type="button" onClick={goIndicadores} className={cls(active === "indicadores")}>
        Indicadores
      </button>
    </div>
  );
}
