import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, ChevronDown, FileSpreadsheet, FileText } from 'lucide-react'
import * as XLSX from 'xlsx'
import { useCompany } from '@/contexts/CompanyContext'
import {
  gerarRelatorioListaPDF,
  downloadListaPDF,
  type ColunaLista,
} from '@/lib/cadastros-pdf/gerar-lista-pdf'

/**
 * Descrição de uma coluna exportável. Genérico no tipo do registro `T`.
 *
 * - `value` devolve o texto exibido (usado no PDF e como fallback no Excel).
 * - `numericValue`, quando presente, faz a célula do Excel virar número de
 *   verdade (permite soma/filtro) e alinha a coluna à direita.
 */
export interface ExportColumn<T> {
  /** Cabeçalho da coluna. */
  header: string
  /** Texto exibido na célula (PDF e Excel sem `numericValue`). */
  value: (row: T) => string | number | null | undefined
  /** Valor numérico bruto para o Excel (habilita somas). */
  numericValue?: (row: T) => number
  /** Alinhamento no PDF. Default: 'left' (ou 'right' se numérico). */
  align?: 'left' | 'right' | 'center'
  /** Peso relativo da largura no PDF. Default: 10. */
  pdfFlex?: number
  /** Largura da coluna no Excel (em caracteres). Default: 18. */
  excelWidth?: number
}

interface ExportMenuProps<T> {
  /** Registros a exportar (já filtrados pela página). Pode ser função preguiçosa. */
  rows: T[] | (() => T[])
  /** Definição das colunas. */
  columns: ExportColumn<T>[]
  /** Título do relatório (ex.: "FORNECEDORES"). */
  titulo: string
  /** Base do nome do arquivo (ex.: "fornecedores"). */
  baseName: string
  /** Orientação do PDF. Default: 'landscape' (mais colunas cabem). */
  orientacao?: 'portrait' | 'landscape'
  /** Texto extra no título (ex.: período). */
  subtitulo?: string
  /** Cor primária do cabeçalho do PDF. Default: verde. */
  corPrimaria?: string
  /** Compacto (h-7) ou padrão (h-9). Default: 'sm'. */
  size?: 'sm' | 'md'
  /** Classe extra do botão. */
  className?: string
  /** Desabilita o botão. */
  disabled?: boolean
  /**
   * Formatos oferecidos. Default: ambos. Quando contém só um, o botão exporta
   * direto (sem menu) — útil em telas que já têm um PDF customizado próprio.
   */
  formats?: Array<'excel' | 'pdf'>
}

function fmtCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return ''
  return String(v)
}

/**
 * Botão "Exportar" com menu Excel/PDF reutilizável por todos os módulos.
 * Puxa os dados da empresa (nome, CNPJ, cidade) do CompanyContext sozinho.
 */
export function ExportMenu<T>({
  rows,
  columns,
  titulo,
  baseName,
  orientacao = 'landscape',
  subtitulo,
  corPrimaria,
  size = 'sm',
  className,
  disabled,
  formats = ['excel', 'pdf'],
}: ExportMenuProps<T>) {
  const { selectedCompany } = useCompany()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onScrollResize = () => setOpen(false)
    document.addEventListener('mousedown', close)
    window.addEventListener('scroll', onScrollResize, true)
    window.addEventListener('resize', onScrollResize)
    return () => {
      document.removeEventListener('mousedown', close)
      window.removeEventListener('scroll', onScrollResize, true)
      window.removeEventListener('resize', onScrollResize)
    }
  }, [open])

  const toggleMenu = () => {
    if (open) { setOpen(false); return }
    const rect = ref.current?.getBoundingClientRect()
    if (rect) setCoords({ top: rect.bottom + 4, right: Math.max(8, window.innerWidth - rect.right) })
    setOpen(true)
  }

  const getRows = (): T[] => (typeof rows === 'function' ? (rows as () => T[])() : rows)

  const count = useMemo(() => {
    try { return getRows().length } catch { return 0 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows])

  const baseFileName = () => {
    const emp = selectedCompany?.nome_fantasia || selectedCompany?.razao_social || ''
    const nome = emp ? `${baseName}-${emp}` : baseName
    return nome.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase()
  }

  const exportarExcel = () => {
    setOpen(false)
    const data = getRows()
    if (data.length === 0) { alert('Nenhum registro para exportar com os filtros atuais.'); return }

    const aoa = data.map(row => {
      const obj: Record<string, string | number> = {}
      columns.forEach(c => {
        obj[c.header] = c.numericValue ? c.numericValue(row) : fmtCell(c.value(row))
      })
      return obj
    })

    const ws = XLSX.utils.json_to_sheet(aoa, { header: columns.map(c => c.header) })

    // Linha de total para colunas numéricas (se houver alguma)
    const numericIdx = columns.map((c, i) => (c.numericValue ? i : -1)).filter(i => i >= 0)
    if (numericIdx.length > 0) {
      const totalRow: (string | number)[] = columns.map(() => '')
      const firstNum = numericIdx[0]
      if (firstNum > 0) totalRow[firstNum - 1] = 'TOTAL'
      else totalRow[0] = 'TOTAL'
      numericIdx.forEach(i => {
        totalRow[i] = data.reduce((s, r) => s + (columns[i].numericValue!(r) || 0), 0)
      })
      XLSX.utils.sheet_add_aoa(ws, [totalRow], { origin: -1 })
    }

    ws['!cols'] = columns.map(c => ({ wch: c.excelWidth ?? 18 }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Dados')
    XLSX.writeFile(wb, `${baseFileName()}.xlsx`)
  }

  const exportarPDF = () => {
    setOpen(false)
    const data = getRows()
    if (data.length === 0) { alert('Nenhum registro para exportar com os filtros atuais.'); return }

    const colunas: ColunaLista[] = columns.map(c => ({
      header: c.header,
      flex: c.pdfFlex ?? 10,
      align: c.align ?? (c.numericValue ? 'right' : 'left'),
    }))
    const linhas: string[][] = data.map(row => columns.map(c => fmtCell(c.value(row))))

    const blob = gerarRelatorioListaPDF({
      empresa_nome: selectedCompany?.nome_fantasia || selectedCompany?.razao_social || 'Empresa',
      empresa_razao_social: (selectedCompany as any)?.razao_social ?? null,
      empresa_cnpj: (selectedCompany as any)?.cnpj ?? null,
      empresa_local: [(selectedCompany as any)?.endereco_cidade, (selectedCompany as any)?.endereco_estado].filter(Boolean).join('/') || null,
      titulo: subtitulo ? `${titulo} · ${subtitulo}` : titulo,
      orientacao,
      cor_primaria: corPrimaria,
      colunas,
      linhas,
    })
    downloadListaPDF(blob, baseName)
  }

  const h = size === 'md' ? 'h-9' : 'h-7'
  const txt = size === 'md' ? 'text-[13px]' : 'text-[11.5px]'
  const iconSz = size === 'md' ? 14 : 11
  const btnBase = `flex items-center gap-1 px-2.5 ${h} ${txt} font-semibold text-black bg-white border border-[#D0D5DD] rounded hover:bg-[#F6F2EB] transition-colors disabled:opacity-50 disabled:cursor-not-allowed`

  // Um só formato → botão direto, sem menu.
  if (formats.length === 1) {
    const only = formats[0]
    return (
      <button
        type="button"
        onClick={only === 'excel' ? exportarExcel : exportarPDF}
        disabled={disabled}
        title={only === 'excel' ? 'Exportar para Excel' : 'Exportar para PDF'}
        className={`${btnBase} ${className || ''}`}
      >
        {only === 'excel'
          ? <FileSpreadsheet size={iconSz} className="text-[#039855]" />
          : <FileText size={iconSz} className="text-[#D92D20]" />}
        {only === 'excel' ? 'Excel' : 'PDF'}
      </button>
    )
  }

  return (
    <div className={`relative ${className || ''}`} ref={ref}>
      <button
        type="button"
        onClick={toggleMenu}
        disabled={disabled}
        title="Exportar (Excel ou PDF)"
        className={btnBase}
      >
        <Download size={iconSz} /> Exportar
        <ChevronDown size={iconSz} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && coords && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: coords.top, right: coords.right, zIndex: 1000 }}
          className="w-44 bg-white border border-[#D0D5DD] rounded-md shadow-lg overflow-hidden"
        >
          <div className="px-3 py-1.5 text-[10px] font-semibold text-[#98A2B3] uppercase tracking-wide border-b border-[#F1F3F5]">
            {count} {count === 1 ? 'registro' : 'registros'}
          </div>
          <button
            type="button"
            onClick={exportarExcel}
            className="w-full flex items-center gap-2 px-3 py-2 text-[12px] font-medium text-[#1D2939] hover:bg-[#ECFDF4] transition-colors"
          >
            <FileSpreadsheet size={14} className="text-[#039855]" /> Excel (.xlsx)
          </button>
          <button
            type="button"
            onClick={exportarPDF}
            className="w-full flex items-center gap-2 px-3 py-2 text-[12px] font-medium text-[#1D2939] hover:bg-[#FEF3F2] transition-colors border-t border-[#F1F3F5]"
          >
            <FileText size={14} className="text-[#D92D20]" /> PDF
          </button>
        </div>,
        document.body
      )}
    </div>
  )
}
