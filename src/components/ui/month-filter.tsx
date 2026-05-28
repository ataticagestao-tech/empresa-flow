import { useState, useEffect, useRef } from 'react'
import { Calendar, ChevronDown } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface MonthFilterProps {
  /** Mês selecionado no formato 'yyyy-MM'. */
  value: string
  onChange: (value: string) => void
  className?: string
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

/**
 * Seletor de mês com o visual padrão do sistema (mesma linguagem do PeriodFilter).
 * Substitui o <input type="month"> nativo. Retorna sempre 'yyyy-MM'.
 */
export function MonthFilter({ value, onChange, className = '' }: MonthFilterProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const now = new Date()
  const selectedYear = value ? Number(value.split('-')[0]) : now.getFullYear()
  const selectedMonth = value ? Number(value.split('-')[1]) - 1 : now.getMonth()
  const [viewYear, setViewYear] = useState(selectedYear)

  useEffect(() => { if (value) setViewYear(Number(value.split('-')[0])) }, [value])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const label = value
    ? format(new Date(selectedYear, selectedMonth, 1), 'MMM/yy', { locale: ptBR })
    : 'Mês'

  const pick = (monthIdx: number) => {
    onChange(`${viewYear}-${String(monthIdx + 1).padStart(2, '0')}`)
    setOpen(false)
  }

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-[#EAECF0] bg-white text-[12.5px] font-semibold text-[#1D2939] hover:bg-[#F9FAFB]"
      >
        <Calendar size={14} className="text-[#98A2B3]" />
        <span className="capitalize">{label}</span>
        <ChevronDown size={14} className={`text-[#98A2B3] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-20 min-w-[220px] rounded-lg border border-[#EAECF0] bg-white p-2 shadow-lg">
          <div className="mb-1.5 flex items-center justify-between px-1">
            <button type="button" onClick={() => setViewYear(v => v - 1)} className="rounded px-2 py-0.5 text-[#475467] hover:bg-[#F9FAFB]">‹</button>
            <span className="text-[12.5px] font-bold text-[#1D2939]">{viewYear}</span>
            <button type="button" onClick={() => setViewYear(v => v + 1)} className="rounded px-2 py-0.5 text-[#475467] hover:bg-[#F9FAFB]">›</button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {MESES.map((mes, i) => (
              <button
                key={mes}
                type="button"
                onClick={() => pick(i)}
                className={`rounded px-2 py-1.5 text-[11.5px] ${selectedMonth === i && selectedYear === viewYear ? 'bg-[#ECFDF5] text-[#039855] font-semibold' : 'text-[#1D2939] hover:bg-[#F9FAFB]'}`}
              >
                {mes}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
