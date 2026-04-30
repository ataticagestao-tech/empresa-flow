import { useState, useEffect } from 'react'
import { Search } from 'lucide-react'

interface DateRangeFilterProps {
  from: string
  to: string
  onApply: (from: string, to: string) => void
  helperText?: string
  className?: string
}

/**
 * Filtro de intervalo de data padrao do sistema.
 * Posicionado abaixo dos KPIs. Aplica filtro apenas no clique de "Pesquisar".
 */
export function DateRangeFilter({
  from,
  to,
  onApply,
  helperText = 'Filtrar por intervalo de data.',
  className = '',
}: DateRangeFilterProps) {
  const [localFrom, setLocalFrom] = useState(from)
  const [localTo, setLocalTo] = useState(to)

  // Sync se o pai mudar (ex: limpar filtros)
  useEffect(() => { setLocalFrom(from) }, [from])
  useEffect(() => { setLocalTo(to) }, [to])

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    onApply(localFrom, localTo)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`rounded-lg border border-[#EAECF0] bg-white px-4 py-3 ${className}`}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col">
          <label className="text-[10px] font-bold uppercase tracking-wider text-[#98A2B3] mb-1">
            Data Inicial
          </label>
          <input
            type="date"
            value={localFrom}
            onChange={e => setLocalFrom(e.target.value)}
            className="px-3 h-9 text-[12.5px] border border-[#D0D5DD] rounded-md bg-white text-[#1D2939] focus:outline-none focus:border-[#039855]"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-[10px] font-bold uppercase tracking-wider text-[#98A2B3] mb-1">
            Data Final
          </label>
          <input
            type="date"
            value={localTo}
            onChange={e => setLocalTo(e.target.value)}
            className="px-3 h-9 text-[12.5px] border border-[#D0D5DD] rounded-md bg-white text-[#1D2939] focus:outline-none focus:border-[#039855]"
          />
        </div>
        <button
          type="submit"
          className="h-9 px-4 text-[12.5px] font-semibold text-white bg-[#039855] rounded-md hover:bg-[#027A47] transition-colors flex items-center gap-2"
        >
          <Search size={14} /> Pesquisar
        </button>
        {helperText && (
          <span className="text-[11.5px] text-[#98A2B3] ml-1 mb-1.5">{helperText}</span>
        )}
      </div>
    </form>
  )
}
