import { useLocation, useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { menuGroups, OWNER_EMAIL, type MenuItem } from "@/config/menuConfig"
import { useAuth } from "@/contexts/AuthContext"
import { useAdmin } from "@/contexts/AdminContext"

/**
 * Sub-menu de abas do módulo da rota atual. Lê o menuConfig, descobre a qual
 * grupo a rota pertence e renderiza as abas dos itens daquele grupo (navegando
 * entre as rotas). Respeita ownerOnly/adminOnly/hidden e traduz labels igual à
 * sidebar. Renderiza a própria faixa (ou nada, quando o grupo tem < 2 telas
 * visíveis ou a rota não pertence a nenhum grupo).
 */
export function ModuleTabs() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { user } = useAuth()
  const { isSuperAdmin } = useAdmin()

  const isOwner = user?.email?.toLowerCase() === OWNER_EMAIL.toLowerCase()
  const isItemVisible = (item: MenuItem) =>
    !item.hidden && (!item.adminOnly || isSuperAdmin) && (!item.ownerOnly || isOwner)

  // Grupo cuja lista de itens contém a rota atual
  const group = menuGroups.find((g) => g.items.some((it) => it.url && it.url === pathname))
  if (!group) return null
  if (group.ownerOnly && !isOwner) return null

  const items = group.items.filter((it) => it.url && isItemVisible(it))
  if (items.length < 2) return null // só faz sentido como menu com 2+ telas

  return (
    <div className="flex px-4 border-b border-[#EAECF0] overflow-x-auto">
      {items.map((it) => {
        const active = pathname === it.url
        const label = it.isHardcoded ? it.titleKey : t(it.titleKey)
        return (
          <button
            key={it.url}
            onClick={() => navigate(it.url!)}
            className={`px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-colors border-b-2 whitespace-nowrap ${
              active
                ? "text-[#059669] border-[#059669]"
                : "text-[#555] border-transparent hover:text-[#1D2939]"
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
