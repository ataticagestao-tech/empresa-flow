import { useState, useEffect, useRef } from 'react'
import { Calendar, ChevronDown, X } from 'lucide-react'
import { format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter } from 'date-fns'
import { ptBR } from 'date-fns/locale'

type Period = 'hoje' | 'mes' | 'trimestre' | 'mes_especifico' | 'custom'

interface PeriodFilterProps {
  from: string
  to: string
  onApply: (from: string, to: string) => void
  helperText?: string
  className?: string
}

const fmt = (d: Date) => format(d, 'yyyy-MM-dd')

/**
 * Filtro de periodo padrao do sistema (dropdown estilo CompanyDashboard).
 * Drop-in replacement do antigo DateRangeFilter (mesma API: from/to/onApply).
 */
export function PeriodFilter({ from, to, onApply, helperText, className = '' }: PeriodFilterProps) {
  const [open, setOpen] = useState(false)
  const [period, setPeriod] = useState<Period | null>(from || to ? 'custom' : null)
  const today = new Date()
  const [specMonth, setSpecMonth] = useState(today.getMonth())
  const [specYear, setSpecYear] = useState(today.getFullYear())
  const [customFrom, setCustomFrom] = useState(from || '')
  const [customTo, setCustomTo] = useState(to || '')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { setCustomFrom(from || '') }, [from])
  useEffect(() => { setCustomTo(to || '') }, [to])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const apply = (p: Period) => {
    const now = new Date()
    if (p === 'hoje') {
      const d = fmt(now); onApply(d, d); setPeriod('hoje'); setOpen(false)
    } else if (p === 'mes') {
      onApply(fmt(startOfMonth(now)), fmt(endOfMonth(now))); setPeriod('mes'); setOpen(false)
    } else if (p === 'trimestre') {
      onApply(fmt(startOfQuarter(now)), fmt(endOfQuarter(now))); setPeriod('trimestre'); setOpen(false)
    } else if (p === 'mes_especifico') {
      setPeriod('mes_especifico')
    } else if (p === 'custom') {
      setPeriod('custom')
    }
  }

  const applySpecific = (m: number, y: number) => {
    setSpecMonth(m); setSpecYear(y)
    const d = new Date(y, m, 1)
    onApply(fmt(startOfMonth(d)), fmt(endOfMonth(d)))
    setOpen(false)
  }

  const clear = () => { setPeriod(null); onApply('', ''); setOpen(false) }

  const label = period === 'hoje' ? 'Hoje'
    : period === 'mes' ? 'Este mês'
    : period === 'trimestre' ? 'Trimestre'
    : period === 'mes_especifico' ? format(new Date(specYear, specMonth, 1), "MMM/yy", { locale: ptBR })
    : period === 'custom' ? 'Personalizado'
    : 'Período'

  const rangeLabel = (from && to)
    ? `${format(new Date(from + 'T00:00:00'), 'dd/MM')} – ${format(new Date(to + 'T00:00:00'), 'dd/MM')}`
    : null

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-[#EAECF0] bg-white text-[12px] font-semibold text-[#1D2939] hover:bg-[#F9FAFB]"
        >
          <Calendar size={14} className="text-[#98A2B3]" />
          {label}
          {rangeLabel && <span className="text-[#98A2B3] font-normal">· {rangeLabel}</span>}
          <ChevronDown size={14} className={`text-[#98A2B3] transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div className="absolute right-0 top-[calc(100%+6px)] z-20 min-w-[220px] rounded-lg border border-[#EAECF0] bg-white p-1.5 shadow-lg">
            {([
              { key: 'hoje', label: 'Hoje' },
              { key: 'mes', label: 'Este mês' },
              { key: 'trimestre', label: 'Trimestre' },
              { key: 'mes_especifico', label: 'Mês' },
              { key: 'custom', label: 'Personalizado' },
            ] as { key: Period; label: string }[]).map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={() => apply(opt.key)}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[12px] ${period === opt.key ? 'bg-[#ECFDF5] text-[#039855] font-semibold' : 'text-[#1D2939] hover:bg-[#F9FAFB]'}`}
              >
                {opt.key === 'custom' && <Calendar size={12} />}
                {opt.label}
              </button>
            ))}
            {period === 'mes_especifico' && (
              <div className="mt-1.5 border-t border-[#EAECF0] pt-2">
                <div className="mb-1.5 flex items-center justify-between px-1">
                  <button type="button" onClick={() => setSpecYear(y => y - 1)} className="rounded px-2 py-0.5 text-[#475467] hover:bg-[#F9FAFB]">‹</button>
                  <span className="text-[12px] font-bold text-[#1D2939]">{specYear}</span>
                  <button type="button" onClick={() => setSpecYear(y => y + 1)} className="rounded px-2 py-0.5 text-[#475467] hover:bg-[#F9FAFB]">›</button>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'].map((m, i) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => applySpecific(i, specYear)}
                      className={`rounded px-2 py-1.5 text-[11.5px] ${specMonth === i && period === 'mes_especifico' ? 'bg-[#ECFDF5] text-[#039855] font-semibold' : 'text-[#1D2939] hover:bg-[#F9FAFB]'}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {period === 'custom' && (
              <div className="mt-1.5 border-t border-[#EAECF0] pt-2 px-1.5 pb-1">
                <div className="flex flex-col gap-2">
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[#98A2B3]">De</label>
                    <input
                      type="date"
                      value={customFrom}
                      onChange={e => setCustomFrom(e.target.value)}
                      className="mt-0.5 w-full rounded-md border border-[#D0D5DD] px-2 h-8 text-[12px] focus:outline-none focus:border-[#039855]"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[#98A2B3]">Até</label>
                    <input
                      type="date"
                      value={customTo}
                      onChange={e => setCustomTo(e.target.value)}
                      className="mt-0.5 w-full rounded-md border border-[#D0D5DD] px-2 h-8 text-[12px] focus:outline-none focus:border-[#039855]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => { onApply(customFrom, customTo); setOpen(false) }}
                    className="h-8 rounded-md bg-[#039855] text-[12px] font-semibold text-white hover:bg-[#027A47]"
                  >
                    Aplicar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {(from || to) && (
        <button
          type="button"
          onClick={clear}
          className="inline-flex items-center gap-1 h-9 px-2.5 rounded-md text-[11.5px] text-[#98A2B3] hover:text-[#1D2939]"
          title="Limpar filtro"
        >
          <X size={12} /> Limpar
        </button>
      )}
      {helperText && (
        <span className="text-[11.5px] text-[#98A2B3] ml-1">{helperText}</span>
      )}
    </div>
  )
}

// Alias para compatibilidade com lugares que ainda importam o nome antigo.
export const DateRangeFilter = PeriodFilter
