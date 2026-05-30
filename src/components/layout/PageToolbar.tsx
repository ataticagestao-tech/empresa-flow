import * as React from "react"
import { cn } from "@/lib/utils"

interface PageToolbarProps {
  title: string
  subtitle?: React.ReactNode
  /** Lado direito: filtros, ações e botões da página. */
  children?: React.ReactNode
  className?: string
}

/**
 * Cabeçalho padrão de página: título (+ subtítulo) à esquerda, filtros/ações à direita.
 * Padroniza o topo das páginas, que hoje montam headers ad-hoc cada uma do seu jeito.
 */
export function PageToolbar({ title, subtitle, children, className }: PageToolbarProps) {
  return (
    <div
      className={cn(
        "mb-5 flex flex-col gap-3 border-b border-[#EAECF0] pb-4 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="truncate text-[20px] font-bold tracking-tight text-[#1D2939]">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[12px] text-[#667085]">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{children}</div>}
    </div>
  )
}
