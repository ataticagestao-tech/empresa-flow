import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Eye } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { safeQuery } from '@/lib/supabaseQuery'
import { formatBRL } from '@/lib/format'
import { AppLayout } from '@/components/layout/AppLayout'
import { PagePanel } from '@/components/layout/PagePanel'
import { PeriodFilter } from '@/components/ui/period-filter'
import { KpiCard, KpiCardGrid } from '@/components/ui/kpi-card'
import { Button } from '@/components/ui/button'
import { ExportMenu } from '@/components/ExportMenu'
import { typography } from '@/styles/designSystem'
import jsPDF from 'jspdf'
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  isToday,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Search,
  ArrowUp,
  ArrowDown,
  ArrowLeftRight,
  Plus,
  X,
  AlertTriangle,
  Landmark,
  Loader2,
  Download,
  ChevronDown,
  FileText,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Movimentacao {
  id: string
  company_id: string
  conta_bancaria_id: string | null
  conta_contabil_id: string | null
  tipo: 'credito' | 'debito'
  valor: number
  data: string
  descricao: string | null
  origem: 'cr' | 'cp' | 'conta_receber' | 'conta_pagar' | 'venda' | 'manual' | 'conciliacao'
  origem_id: string | null
  created_at: string
  conta_bancaria: { id: string; name: string } | null
  conta_contabil: { code: string; name: string } | null
}

interface BankAccount {
  id: string
  company_id: string
  name: string
  banco: string | null
}

interface ChartAccount {
  id: string
  company_id: string
  code: string
  name: string
}

interface CentroCusto {
  id: string
  company_id: string
  codigo: string
  descricao: string
}

interface Product {
  id: string
  description: string
  code: string | null
}

interface DayGroup {
  date: string
  label: string
  entradas: number
  saidas: number
  saldo: number
  rows: (Movimentacao & { runningBalance: number })[]
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const ORIGEM_LABELS: Record<string, string> = {
  cr: 'CR quitado',
  cp: 'CP quitado',
  conta_receber: 'Receita conciliada',
  conta_pagar: 'Despesa conciliada',
  venda: 'Venda',
  manual: 'Manual',
  conciliacao: 'Conciliação',
}

type TipoFilter = 'todos' | 'entradas' | 'saidas' | 'transferencias'

function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function Movimentacoes() {
  const { selectedCompany } = useCompany()
  const { activeClient } = useAuth()
  const companyId = selectedCompany?.id

  // ---- State ----
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([])
  const [centrosCusto, setCentrosCusto] = useState<CentroCusto[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)

  const [selectedBankId, setSelectedBankId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const searchWrapRef = useRef<HTMLDivElement | null>(null)
  const [tipoFilter, setTipoFilter] = useState<TipoFilter>('todos')
  const [dateStart, setDateStart] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [dateEnd, setDateEnd] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [currentPage, setCurrentPage] = useState(1)

  // ---- Padrão de planilha: colunas ajustáveis + ocultáveis ----
  const MOV_COL_ORDER = ['icone', 'descricao', 'categoria', 'conta', 'valor', 'saldo']
  const COL_LABELS: Record<string, string> = {
    icone: 'Tipo', descricao: 'Descrição', categoria: 'Categoria',
    conta: 'Conta', valor: 'Valor (R$)', saldo: 'Saldo conta',
  }
  const COL_WIDTHS_DEFAULT: Record<string, number> = {
    icone: 44, descricao: 360, categoria: 220, conta: 160, valor: 140, saldo: 130,
  }
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    try {
      const s = localStorage.getItem('movimentacoes_col_widths')
      if (s) return { ...COL_WIDTHS_DEFAULT, ...JSON.parse(s) }
    } catch { /* ignore */ }
    return COL_WIDTHS_DEFAULT
  })
  useEffect(() => { localStorage.setItem('movimentacoes_col_widths', JSON.stringify(colWidths)) }, [colWidths])
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => {
    try {
      const s = localStorage.getItem('movimentacoes_hidden_cols')
      if (s) return new Set(JSON.parse(s) as string[])
    } catch { /* ignore */ }
    return new Set()
  })
  useEffect(() => { localStorage.setItem('movimentacoes_hidden_cols', JSON.stringify([...hiddenCols])) }, [hiddenCols])
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const isColVisible = (k: string) => !hiddenCols.has(k)
  const toggleColVisible = (k: string) => setHiddenCols(prev => {
    const n = new Set(prev)
    if (n.has(k)) n.delete(k); else n.add(k)
    return n
  })
  const visibleMovCols = MOV_COL_ORDER.filter(isColVisible)
  const resizingRef = useRef<{ key: string; startX: number; startW: number } | null>(null)
  const startResize = (key: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    resizingRef.current = { key, startX: e.clientX, startW: colWidths[key] ?? COL_WIDTHS_DEFAULT[key] }
    const onMove = (ev: MouseEvent) => {
      const r = resizingRef.current
      if (!r) return
      const newW = Math.max(60, r.startW + (ev.clientX - r.startX))
      setColWidths(prev => ({ ...prev, [r.key]: newW }))
    }
    const onUp = () => {
      resizingRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [modalSaving, setModalSaving] = useState(false)
  const [formTipo, setFormTipo] = useState<'credito' | 'debito'>('credito')
  const [formDescricao, setFormDescricao] = useState('')
  const [formValor, setFormValor] = useState('')
  const [formData, setFormData] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [formBankId, setFormBankId] = useState('')
  const [formContaContabilId, setFormContaContabilId] = useState('')
  const [formCentroCustoId, setFormCentroCustoId] = useState('')
  const [formObservacao, setFormObservacao] = useState('')

  // ---- Fetch data ----
  const [activeSearchTerm, setActiveSearchTerm] = useState('')

  const fetchData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const client = activeClient ?? supabase

      let matchingCoaIds: string[] = []
      if (activeSearchTerm) {
        const dashMatch = activeSearchTerm.match(/^(\S+)\s*[-–]\s*(.+)/)
        const codePart = dashMatch ? dashMatch[1] : activeSearchTerm
        const namePart = dashMatch ? dashMatch[2].trim() : activeSearchTerm
        const orParts = [`name.ilike.%${namePart}%`, `code.ilike.%${codePart}%`]
        if (!dashMatch) {
          orParts.push(`name.ilike.%${activeSearchTerm}%`)
        }
        const { data: coaMatches } = await (client as any)
          .from('chart_of_accounts')
          .select('id')
          .eq('company_id', companyId)
          .or(orParts.join(','))
        matchingCoaIds = (coaMatches || []).map((c: any) => c.id)
      }

      const buildMovQuery = () => {
        let q = (client as any)
          .from('movimentacoes')
          .select(
            '*, conta_bancaria:bank_accounts(id,name), conta_contabil:chart_of_accounts(code,name)'
          )
          .eq('company_id', companyId)

        if (activeSearchTerm) {
          const descTerm = activeSearchTerm.match(/^(\S+)\s*[-–]\s*(.+)/)
            ? activeSearchTerm.match(/^(\S+)\s*[-–]\s*(.+)/)![2].trim()
            : activeSearchTerm
          if (matchingCoaIds.length > 0) {
            q = q.or(`descricao.ilike.%${descTerm}%,conta_contabil_id.in.(${matchingCoaIds.join(',')})`)
          } else {
            q = q.ilike('descricao', `%${descTerm}%`)
          }
        } else {
          q = q.gte('data', dateStart).lte('data', dateEnd)
        }

        return q
          .order('data', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(5000)
      }

      const [movData, bankData, coaData, ccData, prodData] = await Promise.all([
        safeQuery(buildMovQuery, 'movimentacoes'),
        safeQuery(
          () =>
            (client as any)
              .from('bank_accounts')
              .select('id, company_id, name, banco')
              .eq('company_id', companyId),
          'bank_accounts'
        ),
        safeQuery(
          () =>
            (client as any)
              .from('chart_of_accounts')
              .select('id, company_id, code, name')
              .eq('company_id', companyId)
              .order('code'),
          'chart_of_accounts'
        ),
        safeQuery(
          () =>
            (client as any)
              .from('centros_custo')
              .select('id, company_id, codigo, descricao')
              .eq('company_id', companyId)
              .order('descricao'),
          'centros_custo'
        ),
        safeQuery(
          () =>
            (client as any)
              .from('products')
              .select('id, description, code')
              .eq('company_id', companyId)
              .eq('is_active', true)
              .order('description'),
          'products'
        ),
      ])

      setMovimentacoes((movData as Movimentacao[]) || [])
      setBankAccounts((bankData as BankAccount[]) || [])
      setChartAccounts((coaData as ChartAccount[]) || [])
      setCentrosCusto((ccData as CentroCusto[]) || [])
      setProducts((prodData as Product[]) || [])
    } finally {
      setLoading(false)
    }
  }, [companyId, activeClient, dateStart, dateEnd, activeSearchTerm])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ---- Derived data ----
  const afterBankFilter = useMemo(() => {
    if (!selectedBankId) return movimentacoes
    return movimentacoes.filter((m) => m.conta_bancaria_id === selectedBankId)
  }, [movimentacoes, selectedBankId])

  const afterTipoFilter = useMemo(() => {
    if (tipoFilter === 'todos') return afterBankFilter
    if (tipoFilter === 'entradas') return afterBankFilter.filter((m) => m.tipo === 'credito')
    if (tipoFilter === 'saidas') return afterBankFilter.filter((m) => m.tipo === 'debito')
    return afterBankFilter.filter((m) => m.origem === 'conciliacao' || m.origem === 'manual')
  }, [afterBankFilter, tipoFilter])

  const searchSuggestions = useMemo(() => {
    const set = new Set<string>()
    for (const m of movimentacoes) {
      if (m.conta_contabil) {
        const label = `${m.conta_contabil.code} - ${m.conta_contabil.name}`
        set.add(label)
      }
      if (m.descricao && m.descricao.trim()) {
        set.add(m.descricao.trim())
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [movimentacoes])

  const filteredSuggestions = useMemo(() => {
    const needle = normalizeSearch(searchInput)
    if (!needle) return searchSuggestions.slice(0, 50)
    return searchSuggestions
      .filter((s) => normalizeSearch(s).includes(needle))
      .slice(0, 50)
  }, [searchSuggestions, searchInput])

  const commitSearch = useCallback((value?: string) => {
    const v = value ?? searchInput
    setSearchInput(v)
    setSearchTerm(v)
    setActiveSearchTerm(v.trim())
    setShowSuggestions(false)
  }, [searchInput])

  const clearSearch = useCallback(() => {
    setSearchInput('')
    setSearchTerm('')
    setActiveSearchTerm('')
    setShowSuggestions(false)
  }, [])

  useEffect(() => {
    if (!showSuggestions) return
    const handler = (e: MouseEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showSuggestions])

  const filtered = useMemo(() => {
    const needle = normalizeSearch(searchTerm)
    if (!needle) return afterTipoFilter
    return afterTipoFilter.filter((m) => {
      const haystack = [
        m.descricao,
        m.conta_bancaria?.name,
        m.conta_contabil ? `${m.conta_contabil.code} ${m.conta_contabil.name}` : '',
        ORIGEM_LABELS[m.origem] || m.origem,
        formatBRL(m.valor),
        m.data ? format(parseISO(m.data), 'dd/MM/yyyy') : '',
      ]
        .join(' ')
      return normalizeSearch(haystack).includes(needle)
    })
  }, [afterTipoFilter, searchTerm])

  const withRunningBalance = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => {
      const cmp = a.data.localeCompare(b.data)
      if (cmp !== 0) return cmp
      return (a.created_at || '').localeCompare(b.created_at || '')
    })
    let balance = 0
    return sorted.map((m) => {
      balance += m.tipo === 'credito' ? m.valor : -m.valor
      return { ...m, runningBalance: balance }
    })
  }, [filtered])

  const dayGroups = useMemo(() => {
    const map = new Map<string, DayGroup>()
    for (const row of withRunningBalance) {
      const dateKey = row.data
      if (!map.has(dateKey)) {
        const d = parseISO(dateKey)
        const todayPrefix = isToday(d) ? 'HOJE — ' : ''
        map.set(dateKey, {
          date: dateKey,
          label: todayPrefix + format(d, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }).toUpperCase(),
          entradas: 0,
          saidas: 0,
          saldo: 0,
          rows: [],
        })
      }
      const group = map.get(dateKey)!
      if (row.tipo === 'credito') group.entradas += row.valor
      else group.saidas += row.valor
      group.saldo = group.entradas - group.saidas
      group.rows.push(row)
    }
    for (const g of map.values()) {
      g.rows.reverse()
    }
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date))
  }, [withRunningBalance])

  // ---- Paginação (20 movimentações por página) ----
  const PAGE_SIZE = 20
  const orderedRows = useMemo(() => dayGroups.flatMap((g) => g.rows), [dayGroups])
  const totalRows = orderedRows.length
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE))
  const page = Math.min(currentPage, totalPages)

  // Reset para a 1ª página quando o conjunto filtrado muda
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, tipoFilter, selectedBankId, dateStart, dateEnd, activeSearchTerm])

  const pageDayGroups = useMemo(() => {
    const pageRows = orderedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    const map = new Map<string, DayGroup>()
    const order: string[] = []
    for (const row of pageRows) {
      if (!map.has(row.data)) {
        order.push(row.data)
        const orig = dayGroups.find((g) => g.date === row.data)
        map.set(row.data, {
          date: row.data,
          label: orig?.label ?? row.data,
          entradas: 0,
          saidas: 0,
          saldo: 0,
          rows: [],
        })
      }
      const group = map.get(row.data)!
      if (row.tipo === 'credito') group.entradas += row.valor
      else group.saidas += row.valor
      group.saldo = group.entradas - group.saidas
      group.rows.push(row)
    }
    return order.map((d) => map.get(d)!)
  }, [orderedRows, dayGroups, page])

  const bankTotals = useMemo(() => {
    const map = new Map<string, number>()
    let total = 0
    for (const m of movimentacoes) {
      const delta = m.tipo === 'credito' ? m.valor : -m.valor
      total += delta
      if (m.conta_bancaria_id) {
        map.set(m.conta_bancaria_id, (map.get(m.conta_bancaria_id) || 0) + delta)
      }
    }
    return { total, perBank: map }
  }, [movimentacoes])

  const entradasMes = useMemo(() => movimentacoes.filter((m) => m.tipo === 'credito').reduce((s, m) => s + m.valor, 0), [movimentacoes])
  const saidasMes = useMemo(() => movimentacoes.filter((m) => m.tipo === 'debito').reduce((s, m) => s + m.valor, 0), [movimentacoes])
  const qtdEntradas = useMemo(() => movimentacoes.filter((m) => m.tipo === 'credito').length, [movimentacoes])
  const qtdSaidas = useMemo(() => movimentacoes.filter((m) => m.tipo === 'debito').length, [movimentacoes])
  const resultadoMes = entradasMes - saidasMes

  const bankRunningBalances = useMemo(() => {
    const balances = new Map<string, number>()
    const sorted = [...movimentacoes].sort((a, b) => {
      const cmp = a.data.localeCompare(b.data)
      if (cmp !== 0) return cmp
      return (a.created_at || '').localeCompare(b.created_at || '')
    })
    for (const m of sorted) {
      if (m.conta_bancaria_id) {
        const current = balances.get(m.conta_bancaria_id) || 0
        balances.set(m.conta_bancaria_id, current + (m.tipo === 'credito' ? m.valor : -m.valor))
      }
    }
    return balances
  }, [movimentacoes])

  const bankNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const ba of bankAccounts) {
      map.set(ba.id, ba.name)
    }
    return map
  }, [bankAccounts])

  // ---- Modal submit ----
  const handleSubmit = async () => {
    if (!companyId || !formDescricao.trim() || !formValor || !formData || !formBankId || !formContaContabilId) return
    setModalSaving(true)
    try {
      const client = activeClient ?? supabase
      const payload: Record<string, any> = {
        company_id: companyId,
        tipo: formTipo,
        descricao: formDescricao.trim(),
        valor: parseFloat(formValor),
        data: formData,
        conta_bancaria_id: formBankId,
        conta_contabil_id: formContaContabilId,
        origem: 'manual',
      }
      if (formCentroCustoId) payload.centro_custo_id = formCentroCustoId
      if (formObservacao.trim()) payload.observacao = formObservacao.trim()

      const { error } = await (client as any).from('movimentacoes').insert(payload)
      if (error) {
        console.error('[Movimentacoes] insert error:', error)
        return
      }
      resetForm()
      setModalOpen(false)
      fetchData()
    } finally {
      setModalSaving(false)
    }
  }

  const resetForm = () => {
    setFormTipo('credito')
    setFormDescricao('')
    setFormValor('')
    setFormData(format(new Date(), 'yyyy-MM-dd'))
    setFormBankId('')
    setFormContaContabilId('')
    setFormCentroCustoId('')
    setFormObservacao('')
  }

  const openModal = () => {
    resetForm()
    setModalOpen(true)
  }

  // ---- Export CSV ----
  const exportCSV = () => {
    if (filtered.length === 0) return
    const header = 'Data;Descricao;Tipo;Valor;Conta Bancaria;Categoria;Origem\n'
    const rows = filtered.map((m) => {
      const d = m.data ? format(parseISO(m.data), 'dd/MM/yyyy') : ''
      const desc = (m.descricao || '').replace(/;/g, ',')
      const tipo = m.tipo === 'credito' ? 'Entrada' : 'Saida'
      const valor = m.valor.toFixed(2).replace('.', ',')
      const banco = m.conta_bancaria?.name || '-'
      const cat = m.conta_contabil ? `${m.conta_contabil.code} - ${m.conta_contabil.name}` : '-'
      const origem = ORIGEM_LABELS[m.origem] || m.origem
      return `${d};${desc};${tipo};${valor};${banco};${cat};${origem}`
    })
    const csv = header + rows.join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `movimentacoes_${dateStart}_${dateEnd}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ---- Export PDF ----
  const exportPDF = () => {
    if (filtered.length === 0) return
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
    const W = 297
    const margin = 12
    const contentW = W - margin * 2
    const empresa = selectedCompany?.nome_fantasia || selectedCompany?.razao_social || ''
    const periodo = activeSearchTerm
      ? `Busca: "${activeSearchTerm}"`
      : `${format(parseISO(dateStart), 'dd/MM/yyyy')} a ${format(parseISO(dateEnd), 'dd/MM/yyyy')}`

    doc.setFillColor(26, 46, 74)
    doc.rect(0, 0, W, 18, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(255, 255, 255)
    doc.text('MOVIMENTAÇÕES', margin, 8)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(`${empresa}  |  ${periodo}`, margin, 14)

    let y = 24
    const totalEntradas = filtered.filter(m => m.tipo === 'credito').reduce((s, m) => s + m.valor, 0)
    const totalSaidas = filtered.filter(m => m.tipo === 'debito').reduce((s, m) => s + m.valor, 0)
    const saldo = totalEntradas - totalSaidas

    doc.setFontSize(8)
    doc.setTextColor(80, 80, 80)
    doc.text(`Entradas: ${formatBRL(totalEntradas)}    |    Saídas: ${formatBRL(totalSaidas)}    |    Saldo: ${formatBRL(saldo)}    |    ${filtered.length} registros`, margin, y)
    y += 6

    const cols = [
      { label: 'Data', x: margin, w: 22 },
      { label: 'Descrição', x: margin + 22, w: 95 },
      { label: 'Tipo', x: margin + 117, w: 18 },
      { label: 'Valor (R$)', x: margin + 135, w: 30 },
      { label: 'Conta', x: margin + 165, w: 35 },
      { label: 'Categoria', x: margin + 200, w: 55 },
      { label: 'Origem', x: margin + 255, w: 18 },
    ]

    doc.setFillColor(240, 244, 248)
    doc.rect(margin, y, contentW, 6, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    doc.setTextColor(30, 30, 30)
    cols.forEach(c => doc.text(c.label, c.x + 1, y + 4))
    y += 7

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)

    for (const m of filtered) {
      if (y > 195) {
        doc.addPage()
        y = 12
        doc.setFillColor(240, 244, 248)
        doc.rect(margin, y, contentW, 6, 'F')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(6.5)
        doc.setTextColor(30, 30, 30)
        cols.forEach(c => doc.text(c.label, c.x + 1, y + 4))
        y += 7
        doc.setFont('helvetica', 'normal')
      }

      const d = m.data ? format(parseISO(m.data), 'dd/MM/yyyy') : ''
      const desc = (m.descricao || '—').substring(0, 65)
      const tipo = m.tipo === 'credito' ? 'Entrada' : 'Saída'
      const valor = m.valor.toFixed(2).replace('.', ',')
      const banco = (m.conta_bancaria?.name || '—').substring(0, 22)
      const cat = m.conta_contabil ? `${m.conta_contabil.code} - ${m.conta_contabil.name}`.substring(0, 38) : '—'
      const origem = (ORIGEM_LABELS[m.origem] || m.origem).substring(0, 12)

      if (filtered.indexOf(m) % 2 === 0) {
        doc.setFillColor(250, 250, 250)
        doc.rect(margin, y - 3, contentW, 5, 'F')
      }

      doc.setTextColor(m.tipo === 'credito' ? 10 : 139, m.tipo === 'credito' ? 92 : 0, m.tipo === 'credito' ? 46 : 0)
      doc.text(valor, cols[3].x + 1, y)

      doc.setTextColor(30, 30, 30)
      doc.text(d, cols[0].x + 1, y)
      doc.text(desc, cols[1].x + 1, y)
      doc.text(tipo, cols[2].x + 1, y)
      doc.text(banco, cols[4].x + 1, y)
      doc.text(cat, cols[5].x + 1, y)
      doc.text(origem, cols[6].x + 1, y)

      y += 5
    }

    y += 4
    doc.setDrawColor(200, 200, 200)
    doc.line(margin, y, W - margin, y)
    y += 5
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(10, 92, 46)
    doc.text(`Total Entradas: ${formatBRL(totalEntradas)}`, margin, y)
    doc.setTextColor(139, 0, 0)
    doc.text(`Total Saídas: ${formatBRL(totalSaidas)}`, margin + 70, y)
    doc.setTextColor(30, 30, 30)
    doc.text(`Saldo: ${formatBRL(saldo)}`, margin + 140, y)

    const filename = activeSearchTerm
      ? `movimentacoes_busca_${activeSearchTerm.replace(/\s+/g, '_')}.pdf`
      : `movimentacoes_${dateStart}_${dateEnd}.pdf`
    doc.save(filename)
  }

  // ---- Render helpers ----

  const TypeIcon = ({ tipo }: { tipo: string }) => {
    if (tipo === 'credito')
      return (
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#ECFDF3] border border-[#039855]">
          <ArrowUp className="w-3.5 h-3.5 text-[#039855]" />
        </span>
      )
    if (tipo === 'debito')
      return (
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#FEE2E2] border border-[#E53E3E]">
          <ArrowDown className="w-3.5 h-3.5 text-[#E53E3E]" />
        </span>
      )
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#ECFDF4] border border-[#059669]">
        <ArrowLeftRight className="w-3.5 h-3.5 text-[#059669]" />
      </span>
    )
  }

  if (!companyId) {
    return (
      <AppLayout title="Movimentações">
        <div className="flex items-center justify-center h-64 text-[13px] text-[#9CA3AF]">
          Selecione uma empresa para visualizar movimentações.
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="Movimentações">
      <div className="animate-fade-in">

        <PagePanel
          title="Movimentações financeiras"
          subtitle="Entradas e saídas consolidadas a partir de CR, CP, vendas e lançamentos manuais"
          tabs={([
            { value: 'todos', label: 'Todos' },
            { value: 'entradas', label: 'Entradas' },
            { value: 'saidas', label: 'Saídas' },
            { value: 'transferencias', label: 'Transferências' },
          ] as { value: TipoFilter; label: string }[]).map((t) => (
            <button
              key={t.value}
              onClick={() => setTipoFilter(t.value)}
              className={`px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-colors border-b-2 whitespace-nowrap ${
                tipoFilter === t.value
                  ? 'text-[#059669] border-[#059669]'
                  : 'text-[#4B5563] border-transparent hover:text-[#0F172A]'
              }`}
            >
              {t.label}
            </button>
          ))}
        >
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Button variant="outline" size="sm" onClick={exportPDF} disabled={filtered.length === 0}>
              <FileText className="h-3.5 w-3.5 mr-1" /> PDF
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV} disabled={filtered.length === 0}>
              <Download className="h-3.5 w-3.5 mr-1" /> Excel
            </Button>
            <ExportMenu
              rows={filtered}
              baseName="movimentacoes"
              titulo="MOVIMENTAÇÕES"
              size="md"
              disabled={filtered.length === 0}
              columns={[
                { header: 'Data', value: (m) => (m.data ? format(parseISO(m.data), 'dd/MM/yyyy') : ''), align: 'center', pdfFlex: 9 },
                { header: 'Descrição', value: (m) => m.descricao || '—', pdfFlex: 26, excelWidth: 38 },
                { header: 'Tipo', value: (m) => (m.tipo === 'credito' ? 'Entrada' : 'Saída'), pdfFlex: 8 },
                { header: 'Categoria', value: (m) => (m.conta_contabil ? `${m.conta_contabil.code} - ${m.conta_contabil.name}` : '—'), pdfFlex: 20, excelWidth: 30 },
                { header: 'Conta', value: (m) => m.conta_bancaria?.name || '—', pdfFlex: 14, excelWidth: 22 },
                { header: 'Origem', value: (m) => ORIGEM_LABELS[m.origem] || m.origem, pdfFlex: 11 },
                { header: 'Valor', value: (m) => `${m.tipo === 'credito' ? '+' : '-'}${formatBRL(m.valor)}`, numericValue: (m) => (m.tipo === 'credito' ? m.valor : -m.valor), pdfFlex: 11 },
              ]}
            />
            <Button size="sm" onClick={openModal} className="text-white" style={{ backgroundColor: '#059669' }}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Lançamento manual
            </Button>
          </div>

        {/* ====== KPIs ====== */}
        <KpiCardGrid>
          {[
            { label: 'Saldo atual', value: formatBRL(bankTotals.total), hint: 'Todas as contas', color: '#059669' },
            { label: 'Entradas do mês', value: formatBRL(entradasMes), hint: `${qtdEntradas} lançamento${qtdEntradas !== 1 ? 's' : ''}`, color: '#039855' },
            { label: 'Saídas do mês', value: formatBRL(saidasMes), hint: `${qtdSaidas} lançamento${qtdSaidas !== 1 ? 's' : ''}`, color: '#E53E3E' },
            { label: 'Resultado do mês', value: formatBRL(Math.abs(resultadoMes)), hint: resultadoMes >= 0 ? '▲ positivo' : '▼ negativo', color: resultadoMes >= 0 ? '#039855' : '#E53E3E' },
          ].map((kpi) => (
            <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} valueColor={kpi.color} sub={kpi.hint} />
          ))}
        </KpiCardGrid>

        {/* ====== FILTROS (linha única) ====== */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Busca */}
          <div ref={searchWrapRef} className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF] pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por descrição ou categoria..."
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value)
                setShowSuggestions(true)
              }}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitSearch() }
                else if (e.key === 'Escape') setShowSuggestions(false)
              }}
              className="w-full h-9 border border-[#D1D5DB] rounded-md pl-9 pr-9 text-[13px] text-[#0F172A] bg-white outline-none focus:border-[#059669] focus:ring-1 focus:ring-[#059669]"
            />
            {(searchInput || searchTerm) && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Limpar busca"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#9CA3AF] hover:text-[#0F172A]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            {showSuggestions && filteredSuggestions.length > 0 && (
              <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-[#E5E7EB] rounded-md shadow-lg max-h-64 overflow-y-auto">
                {filteredSuggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); commitSearch(s) }}
                    className="w-full text-left px-3 py-2 text-[12px] text-[#0F172A] hover:bg-[#F3F4F6] border-b border-[#F1F3F5] last:border-b-0"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Conta bancária */}
          <div className="relative">
            <Landmark className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF] pointer-events-none" />
            <select
              value={selectedBankId || ''}
              onChange={(e) => setSelectedBankId(e.target.value || null)}
              className="appearance-none h-9 border border-[#D1D5DB] rounded-md pl-9 pr-8 text-[13px] text-[#0F172A] bg-white min-w-[180px] outline-none focus:border-[#059669] focus:ring-1 focus:ring-[#059669]"
            >
              <option value="">Todas as contas</option>
              {bankAccounts.map((ba) => (
                <option key={ba.id} value={ba.id}>{ba.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF] pointer-events-none" />
          </div>

          {/* Período */}
          <PeriodFilter
            from={dateStart}
            to={dateEnd}
            onApply={(f, t) => { setDateStart(f); setDateEnd(t) }}
          />
        </div>

        {activeSearchTerm && (
          <div className="flex items-center gap-2 px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-md">
            <Search className="w-3.5 h-3.5 text-[#9CA3AF] shrink-0" />
            <p className={typography.bodyMuted}>
              Buscando "<strong className="font-semibold text-[#0F172A]">{activeSearchTerm}</strong>" em todas as datas (período ignorado)
            </p>
          </div>
        )}

        {/* ====== CARD PRINCIPAL ====== */}
        <div className="bg-white border border-[#E5E7EB] rounded-lg overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: '#000000' }}>
            <h3 className="font-bold text-white m-0 text-[14px] tracking-tight">Movimentações</h3>
            <div className="flex items-center gap-3">
              <span className="text-[12px] text-white/70 font-medium">
                {totalRows} registro{totalRows !== 1 ? 's' : ''}
              </span>
              <div className="relative">
                <button
                  onClick={() => setColMenuOpen(o => !o)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/20 text-[12px] text-white hover:bg-white/10"
                  title="Mostrar/ocultar colunas"
                >
                  <Eye size={14} className="text-white/70" /> Colunas
                  <ChevronDown size={13} className={`text-white/60 transition-transform ${colMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {colMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setColMenuOpen(false)} />
                    <div className="absolute right-0 mt-1 z-50 bg-white border border-[#EAECF0] rounded-lg shadow-xl py-1 min-w-[190px]">
                      <p className="px-3 py-1.5 text-[11px] font-bold text-[#98A2B3] uppercase tracking-wider">Exibir colunas</p>
                      {MOV_COL_ORDER.map((k) => (
                        <label key={k} className="flex items-center gap-2 px-3 py-1.5 text-[13px] text-[#1D2939] hover:bg-[#F3F4F6] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isColVisible(k)}
                            onChange={() => toggleColVisible(k)}
                            className="w-4 h-4 rounded border-[#D0D5DD] text-[#059669] focus:ring-[#059669]/30"
                          />
                          {COL_LABELS[k]}
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          {loading ? (
            <div className="text-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-[#059669] mx-auto mb-3" />
              <p className="text-[13px] text-[#9CA3AF]">Carregando movimentações...</p>
            </div>
          ) : dayGroups.length === 0 ? (
            <div className="text-center py-16">
              <ArrowLeftRight className="h-10 w-10 text-[#9CA3AF] mx-auto mb-3 opacity-40" />
              <p className="text-[13px] font-bold text-[#0F172A]">Nenhuma movimentação encontrada.</p>
              <p className="text-[12px] text-[#9CA3AF] mt-1">
                Ajuste os filtros acima ou registre um lançamento manual.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="text-[12px]" style={{ tableLayout: 'fixed', width: visibleMovCols.reduce((a, k) => a + (colWidths[k] ?? COL_WIDTHS_DEFAULT[k]), 0), minWidth: '100%' }}>
                  <colgroup>
                    {MOV_COL_ORDER.map((k) => (
                      <col key={k} className={isColVisible(k) ? '' : 'hidden'} style={{ width: colWidths[k] ?? COL_WIDTHS_DEFAULT[k] }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr className="bg-white border-b-2 border-[#D1D5DB] text-[11.5px] font-bold uppercase tracking-wider text-[#0F172A]">
                      <th className={`text-left py-2.5 px-4 relative border-r border-[#EAECF0] ${isColVisible('icone') ? '' : 'hidden'}`}>
                        <span onMouseDown={startResize('icone')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                      </th>
                      <th className={`text-left py-2.5 px-4 relative border-r border-[#EAECF0] ${isColVisible('descricao') ? '' : 'hidden'}`}>
                        Descrição
                        <span onMouseDown={startResize('descricao')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                      </th>
                      <th className={`text-left py-2.5 px-4 relative border-r border-[#EAECF0] ${isColVisible('categoria') ? '' : 'hidden'}`}>
                        Categoria
                        <span onMouseDown={startResize('categoria')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                      </th>
                      <th className={`text-left py-2.5 px-4 relative border-r border-[#EAECF0] ${isColVisible('conta') ? '' : 'hidden'}`}>
                        Conta
                        <span onMouseDown={startResize('conta')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                      </th>
                      <th className={`text-right py-2.5 px-4 relative border-r border-[#EAECF0] ${isColVisible('valor') ? '' : 'hidden'}`}>
                        Valor (R$)
                        <span onMouseDown={startResize('valor')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                      </th>
                      <th className={`text-right py-2.5 px-4 relative ${isColVisible('saldo') ? '' : 'hidden'}`}>
                        Saldo conta
                        <span onMouseDown={startResize('saldo')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageDayGroups.map((group) => (
                      <DiaMovimentacoes
                        key={group.date}
                        group={group}
                        bankNameMap={bankNameMap}
                        bankRunningBalances={bankRunningBalances}
                        TypeIcon={TypeIcon}
                        isColVisible={isColVisible}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ====== PAGINAÇÃO ====== */}
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-[#E5E7EB] bg-white">
                <span className="text-[12px] text-[#4B5563]">
                  Mostrando{' '}
                  <strong className="font-semibold text-[#0F172A]">
                    {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalRows)}
                  </strong>{' '}
                  de <strong className="font-semibold text-[#0F172A]">{totalRows}</strong> movimentações
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="text-[12px] font-semibold px-3 py-1.5 rounded-md border border-[#D1D5DB] bg-white text-[#0F172A] hover:bg-[#F9FAFB] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    ← Anterior
                  </button>
                  <span className="text-[12px] font-semibold text-[#0F172A] tabular-nums">
                    Página {page} de {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="text-[12px] font-semibold px-3 py-1.5 rounded-md border border-[#D1D5DB] bg-white text-[#0F172A] hover:bg-[#F9FAFB] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Próxima →
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
        </PagePanel>
      </div>

      {/* ====== MODAL: Lançamento Manual ====== */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !modalSaving && setModalOpen(false)}
          />

          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-4 py-3 flex items-center justify-between rounded-t-lg" style={{ backgroundColor: '#059669' }}>
              <h3 className="text-[13px] font-bold text-white tracking-tight">
                Lançamento manual
              </h3>
              <button
                onClick={() => !modalSaving && setModalOpen(false)}
                className="text-white/80 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex items-start gap-2 px-3 py-2 rounded border border-amber-300 bg-amber-50 text-amber-800 text-xs">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>
                  Use lançamentos manuais apenas para transações sem CR ou CP.
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Tipo</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormTipo('credito')}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded border text-sm font-medium transition-colors ${
                      formTipo === 'credito'
                        ? 'border-[#039855] bg-[#ECFDF3] text-[#039855]'
                        : 'border-input bg-background text-muted-foreground hover:border-[#039855]'
                    }`}
                  >
                    <ArrowUp className="w-4 h-4" />
                    Entrada
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormTipo('debito')}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded border text-sm font-medium transition-colors ${
                      formTipo === 'debito'
                        ? 'border-[#E53E3E] bg-[#FEE2E2] text-[#E53E3E]'
                        : 'border-input bg-background text-muted-foreground hover:border-[#E53E3E]'
                    }`}
                  >
                    <ArrowDown className="w-4 h-4" />
                    Saída
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Descrição (produto/serviço) <span className="text-[#E53E3E]">*</span>
                </label>
                <select
                  value={formDescricao}
                  onChange={(e) => setFormDescricao(e.target.value)}
                  className="w-full border border-input rounded px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">Selecione um produto/serviço...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.description}>
                      {p.code ? `${p.code} - ` : ''}{p.description}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Valor <span className="text-[#E53E3E]">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formValor}
                    onChange={(e) => setFormValor(e.target.value)}
                    placeholder="0,00"
                    className="w-full border border-input rounded px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Data <span className="text-[#E53E3E]">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData}
                    onChange={(e) => setFormData(e.target.value)}
                    className="w-full border border-input rounded px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Conta bancária <span className="text-[#E53E3E]">*</span>
                  </label>
                  <select
                    value={formBankId}
                    onChange={(e) => setFormBankId(e.target.value)}
                    className="w-full border border-input rounded px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">Selecione...</option>
                    {bankAccounts.map((ba) => (
                      <option key={ba.id} value={ba.id}>
                        {ba.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Conta contábil <span className="text-[#E53E3E]">*</span>
                  </label>
                  <select
                    value={formContaContabilId}
                    onChange={(e) => setFormContaContabilId(e.target.value)}
                    className="w-full border border-input rounded px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">Selecione...</option>
                    {chartAccounts.map((ca) => (
                      <option key={ca.id} value={ca.id}>
                        {ca.code} - {ca.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Centro de custo
                </label>
                <select
                  value={formCentroCustoId}
                  onChange={(e) => setFormCentroCustoId(e.target.value)}
                  className="w-full border border-input rounded px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">Nenhum</option>
                  {centrosCusto.map((cc) => (
                    <option key={cc.id} value={cc.id}>
                      {cc.codigo} - {cc.descricao}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Observação</label>
                <textarea
                  value={formObservacao}
                  onChange={(e) => setFormObservacao(e.target.value)}
                  rows={2}
                  placeholder="Observações adicionais..."
                  className="w-full border border-input rounded px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => !modalSaving && setModalOpen(false)}
                  disabled={modalSaving}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={
                    modalSaving ||
                    !formDescricao.trim() ||
                    !formValor ||
                    !formData ||
                    !formBankId ||
                    !formContaContabilId
                  }
                  className="text-white"
                  style={{ backgroundColor: '#059669' }}
                >
                  {modalSaving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
                  Confirmar lançamento
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}

/* ------------------------------------------------------------------ */
/*  Sub-component: cabeçalho do dia + rows                             */
/* ------------------------------------------------------------------ */

function DiaMovimentacoes({
  group,
  bankNameMap,
  bankRunningBalances,
  TypeIcon,
  isColVisible,
}: {
  group: DayGroup
  bankNameMap: Map<string, string>
  bankRunningBalances: Map<string, number>
  TypeIcon: (props: { tipo: string }) => JSX.Element
  isColVisible: (k: string) => boolean
}) {
  // colSpan da célula de rótulo do dia = nº de colunas visíveis antes de "valor"
  const labelSpan = ['icone', 'descricao', 'categoria', 'conta'].filter(isColVisible).length || 1
  return (
    <>
      <tr className="bg-[#F3F4F6] border-y border-[#E5E7EB]">
        <td colSpan={labelSpan} className="px-4 py-1 text-[11px] font-bold uppercase tracking-wider text-[#0F172A]">
          {group.label}
        </td>
        <td className={`px-4 py-1 text-right text-[11px] font-semibold text-[#039855] tabular-nums border-r border-[#F1F3F5] ${isColVisible('valor') ? '' : 'hidden'}`}>
          +{formatBRL(group.entradas)}
        </td>
        <td className={`px-4 py-1 text-right text-[11px] font-bold tabular-nums ${group.saldo >= 0 ? 'text-[#039855]' : 'text-[#E53E3E]'} ${isColVisible('saldo') ? '' : 'hidden'}`}>
          {group.saldo >= 0 ? '+' : ''}{formatBRL(group.saldo)}
        </td>
      </tr>
      {group.rows.map((row) => {
        const bankName = row.conta_bancaria_id ? bankNameMap.get(row.conta_bancaria_id) : null
        const bankBal = row.conta_bancaria_id ? bankRunningBalances.get(row.conta_bancaria_id) : null

        return (
          <tr key={row.id} className="border-b border-[#F1F3F5] hover:bg-[#F3F4F6] transition-colors">
            <td className={`px-4 py-1 align-middle border-r border-[#F1F3F5] ${isColVisible('icone') ? '' : 'hidden'}`}>
              <TypeIcon tipo={row.tipo} />
            </td>
            <td className={`px-4 py-1 align-middle border-r border-[#F1F3F5] ${isColVisible('descricao') ? '' : 'hidden'}`}>
              <div className="text-[12px] font-medium text-[#0F172A] truncate" title={row.descricao || '(sem descrição)'}>
                {row.descricao || '(sem descrição)'}
              </div>
              <div className="mt-0.5">
                <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-bold ${
                  row.origem === 'cr' || row.origem === 'conta_receber' ? 'bg-[#ECFDF3] text-[#039855]' :
                  row.origem === 'cp' || row.origem === 'conta_pagar' ? 'bg-[#FEE2E2] text-[#E53E3E]' :
                  row.origem === 'venda' ? 'bg-[#e8eaf6] text-[#283593]' :
                  'bg-[#F3F4F6] text-[#4B5563]'
                }`}>
                  {(ORIGEM_LABELS[row.origem] || row.origem)}
                </span>
              </div>
            </td>
            <td className={`px-4 py-1 align-middle text-[12px] text-[#4B5563] truncate border-r border-[#F1F3F5] ${isColVisible('categoria') ? '' : 'hidden'}`}
                title={row.conta_contabil ? `${row.conta_contabil.code} — ${row.conta_contabil.name}` : 'sem categoria'}>
              {row.conta_contabil
                ? <span><span className="font-mono">{row.conta_contabil.code}</span> — {row.conta_contabil.name}</span>
                : <span className="italic">sem categoria</span>}
            </td>
            <td className={`px-4 py-1 align-middle text-[12px] text-[#4B5563] truncate border-r border-[#F1F3F5] ${isColVisible('conta') ? '' : 'hidden'}`} title={bankName || '—'}>
              {bankName || '—'}
            </td>
            <td className={`px-4 py-1 align-middle text-right text-[12px] font-bold tabular-nums border-r border-[#F1F3F5] ${row.tipo === 'credito' ? 'text-[#039855]' : 'text-[#E53E3E]'} ${isColVisible('valor') ? '' : 'hidden'}`}>
              {row.tipo === 'credito' ? '+' : '-'}{formatBRL(row.valor)}
            </td>
            <td className={`px-4 py-1 align-middle text-right tabular-nums ${isColVisible('saldo') ? '' : 'hidden'}`}>
              {bankBal != null
                ? <span className={`text-[12px] font-semibold ${bankBal >= 0 ? 'text-[#059669]' : 'text-[#E53E3E]'}`}>{formatBRL(bankBal)}</span>
                : <span className="text-[#9CA3AF]">—</span>}
            </td>
          </tr>
        )
      })}
    </>
  )
}
