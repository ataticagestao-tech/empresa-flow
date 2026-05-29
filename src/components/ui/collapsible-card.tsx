import { useState, useEffect, ReactNode } from 'react'
import { Minus, Plus } from 'lucide-react'

interface CollapsibleCardProps {
  title: ReactNode
  subtitle?: ReactNode
  rightSlot?: ReactNode
  storageKey?: string
  defaultCollapsed?: boolean
  className?: string
  bodyClassName?: string
  children: ReactNode
}

export function CollapsibleCard({
  title,
  subtitle,
  rightSlot,
  storageKey,
  defaultCollapsed = false,
  className = '',
  bodyClassName = 'p-4',
  children,
}: CollapsibleCardProps) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (!storageKey) return defaultCollapsed
    try {
      const v = localStorage.getItem(`cc:${storageKey}`)
      if (v === '1') return true
      if (v === '0') return false
    } catch {}
    return defaultCollapsed
  })

  useEffect(() => {
    if (!storageKey) return
    try { localStorage.setItem(`cc:${storageKey}`, collapsed ? '1' : '0') } catch {}
  }, [collapsed, storageKey])

  return (
    <div
      className={`bg-white border border-[#EAECF0] rounded-xl overflow-hidden ${className}`}
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)' }}
    >
      <div className="flex items-start justify-between gap-3 px-4 py-3 bg-[#2A2724]">
        <div className="min-w-0">
          <div className="text-[14px] font-bold uppercase tracking-wider text-white truncate">{title}</div>
          {subtitle && <div className="text-[11px] text-white/80 mt-0.5 truncate">{subtitle}</div>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {rightSlot}
          <button
            type="button"
            onClick={() => setCollapsed(v => !v)}
            title={collapsed ? 'Expandir' : 'Minimizar'}
            aria-label={collapsed ? 'Expandir' : 'Minimizar'}
            className="w-7 h-7 flex items-center justify-center rounded border border-white/40 text-white hover:bg-white/20 transition-colors"
          >
            {collapsed ? <Plus size={14} /> : <Minus size={14} />}
          </button>
        </div>
      </div>
      {!collapsed && <div className={bodyClassName}>{children}</div>}
    </div>
  )
}
