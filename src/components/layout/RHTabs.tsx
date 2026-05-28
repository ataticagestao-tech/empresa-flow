import { useLocation, useNavigate } from "react-router-dom"

// Abas de navegação do módulo RH & Folha. Renderizadas no slot `tabs` do PagePanel
// de cada tela de RH para acoplar as 5 telas num sub-menu único.
const RH_TABS = [
  { label: "Folha", path: "/folha-pagamento" },
  { label: "Ponto", path: "/ponto-eletronico" },
  { label: "Férias", path: "/ferias-afastamentos" },
  { label: "Encargos", path: "/encargos" },
  { label: "Admissões", path: "/admissoes-demissoes" },
]

export function RHTabs() {
  const { pathname } = useLocation()
  const navigate = useNavigate()

  return (
    <>
      {RH_TABS.map((t) => {
        const active = pathname === t.path
        return (
          <button
            key={t.path}
            onClick={() => navigate(t.path)}
            className={`px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-colors border-b-2 whitespace-nowrap ${
              active
                ? "text-[#059669] border-[#059669]"
                : "text-[#555] border-transparent hover:text-[#1D2939]"
            }`}
          >
            {t.label}
          </button>
        )
      })}
    </>
  )
}
