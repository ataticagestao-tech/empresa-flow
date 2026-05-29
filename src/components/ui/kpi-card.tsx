import * as React from "react"
import { HelpCircle } from "lucide-react"
import { cn } from "@/lib/utils"

export interface KpiCardProps {
  /** Título do indicador (ex.: "Total em aberto"). Caixa normal, 22px. */
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  /** Texto do tooltip "?" — explica o número para o cliente. */
  info?: string
  /** Ícone (chip no topo). Ex.: <Wallet size={18} />. */
  icon?: React.ReactNode
  /** Cores do chip do ícone. Default: navy institucional. */
  iconColor?: { bg: string; fg: string }
  /** Cor do valor principal. Default near-black; use verde/vermelho p/ semântica. */
  valueColor?: string
  /** Variação % vs período anterior (ex.: 12.3 ou -8). Mostra pílula ▲▼. */
  delta?: number | null
  /** Rótulo ao lado da variação (default "vs mês anterior"). */
  deltaLabel?: string
  className?: string
}

/**
 * Card de KPI padrão do sistema (rico):
 * chip de ícone + "?" → título 22px → valor grande → variação/subtexto.
 */
export function KpiCard({
  label,
  value,
  sub,
  info,
  icon,
  iconColor,
  valueColor = "#0F172A",
  delta,
  deltaLabel,
  className,
}: KpiCardProps) {
  const hasDelta = delta !== undefined && delta !== null && Number.isFinite(delta)
  return (
    <div
      className={cn("flex min-w-0 flex-col gap-1.5 rounded-xl border border-[#EAECF0] bg-white px-4 py-3.5 shadow-sm", className)}
      style={{ boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)" }}
    >
      {(icon || info) && (
        <div className="flex items-start justify-between gap-2">
          {icon ? (
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
              style={{ background: iconColor?.bg ?? "#EFF4FF", color: iconColor?.fg ?? "#1E3A8A" }}
            >
              {icon}
            </span>
          ) : (
            <span />
          )}
          {info && (
            <span title={info} className="inline-flex shrink-0 cursor-help text-[#98A2B3]">
              <HelpCircle size={14} />
            </span>
          )}
        </div>
      )}
      <p className="m-0 truncate font-bold text-black" style={{ fontSize: 14, letterSpacing: "-0.01em", lineHeight: 1.2 }}>
        {label}
      </p>
      <p
        className="truncate font-extrabold"
        style={{ fontSize: "clamp(20px, 1.8vw, 26px)", color: valueColor, letterSpacing: "-0.02em", lineHeight: 1.05, fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </p>
      {(hasDelta || sub != null) && (
        <div className="flex flex-col gap-0.5">
          {hasDelta && (
            <div className="flex items-center gap-1.5">
              <span
                className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold"
                style={{
                  backgroundColor: delta! > 0 ? "#ECFDF4" : delta! < 0 ? "#FEE2E2" : "#F1F3F5",
                  color: delta! > 0 ? "#039855" : delta! < 0 ? "#E53E3E" : "#98A2B3",
                }}
              >
                {delta! > 0 ? "▲" : delta! < 0 ? "▼" : "—"} {Math.abs(delta!).toFixed(1)}%
              </span>
              <span className="text-[12px] text-[#667085]">{deltaLabel || "vs mês anterior"}</span>
            </div>
          )}
          {sub != null && <p className="m-0 truncate text-[12px] text-[#667085]">{sub}</p>}
        </div>
      )}
    </div>
  )
}

/** Grade responsiva 2/4 colunas para os KpiCards. */
export function KpiCardGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 lg:grid-cols-4 gap-3", className)}>{children}</div>
}
