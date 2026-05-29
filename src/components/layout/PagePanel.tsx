import * as React from "react"
import { cn } from "@/lib/utils"
import { ModuleTabs } from "./ModuleTabs"

interface PagePanelProps {
  /** Título exibido no header escuro. */
  title: string
  subtitle?: React.ReactNode
  /** Ações à direita do header escuro (botões em branco/outline). */
  headerActions?: React.ReactNode
  /** Faixa de abas opcional, renderizada abaixo do header escuro. */
  tabs?: React.ReactNode
  /** Conteúdo da página (toolbar, tabela, etc.). */
  children?: React.ReactNode
  /**
   * Ajuste da altura mínima do painel (px descontados de 100vh).
   * Aumentar = painel mais baixo; diminuir = mais alto. Default 150.
   */
  minHeightOffset?: number
  className?: string
}

/**
 * Container padrão de página: quadro branco arredondado preenchendo a tela,
 * com header escuro (título + subtítulo) e conteúdo dentro. Fonte única das
 * medidas do padrão visual (margem, respiro, altura, borda, sombra).
 */
export function PagePanel({
  title,
  subtitle,
  headerActions,
  tabs,
  children,
  minHeightOffset = 150,
  className,
}: PagePanelProps) {
  return (
    <div className="pt-0 pb-3">
      <div
        className={cn(
          "bg-white rounded-xl border border-[#EAECF0] shadow-sm p-6 pb-8 space-y-2",
          className,
        )}
        style={{ minHeight: `calc(100vh - ${minHeightOffset}px)` }}
      >
        {/* Header escuro (+ abas opcionais) */}
        <div className="border border-[#ccc] rounded-lg overflow-hidden bg-white">
          <div className="bg-[#2A2724] px-4 py-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-[14px] font-bold uppercase tracking-wider text-white truncate">{title}</h1>
              {subtitle && <p className="text-[11px] text-white/80 mt-0.5">{subtitle}</p>}
            </div>
            {headerActions && (
              <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">{headerActions}</div>
            )}
          </div>
          {/* Navegação do módulo (sempre) + abas próprias da página (se houver) */}
          <ModuleTabs />
          {tabs && (
            <div className="flex px-4 border-b border-[#EAECF0] overflow-x-auto">{tabs}</div>
          )}
        </div>

        {children}
      </div>
    </div>
  )
}
