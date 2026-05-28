import * as React from "react"
import { cn } from "@/lib/utils"

export interface KpiCardProps {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  /** Cor do valor principal (hex/CSS). Default: #1D2939 */
  valueColor?: string
  className?: string
}

/** Card de KPI padrão do sistema (label + valor + subtexto opcional). */
export function KpiCard({ label, value, sub, valueColor = "#1D2939", className }: KpiCardProps) {
  return (
    <div
      className={cn("bg-white border border-[#EAECF0] rounded-xl px-4 py-3 min-w-0", className)}
      style={{ boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)" }}
    >
      <p className="text-[11.5px] font-bold uppercase tracking-[0.04em] text-black m-0 whitespace-nowrap">{label}</p>
      <p
        className="mt-1.5 font-extrabold truncate"
        style={{ fontSize: 18, color: valueColor, letterSpacing: "-0.02em", lineHeight: 1.15 }}
      >
        {value}
      </p>
      {sub != null && <p className="text-[11px] text-[#98A2B3] mt-1 truncate">{sub}</p>}
    </div>
  )
}

/** Grade responsiva 2/4 colunas para os KpiCards. */
export function KpiCardGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 lg:grid-cols-4 gap-3", className)}>{children}</div>
}
