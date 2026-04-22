import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { safeQuery } from '@/lib/supabaseQuery'
import { formatBRL } from '@/lib/format'
import { AppLayout } from '@/components/layout/AppLayout'
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
  Eye,
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
  conciliacao: 'Conciliacao',
}

const ORIGEM_ACTION_LABELS: Record<string, string> = {
  cr: 'Ver CR',
  cp: 'Ver CP',
  venda: 'Ver venda',
  manual: 'Ver',
  conciliacao: 'Ver',
}

type TipoFilter = 'todos' | 'entradas' | 'saidas' | 'transferencias'

function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function maskAccount(name: string): string {
  const digits = name.replace(/\D/g, '')
  if (digits.length >= 4) {
    return `${name.split(/\d/)[0].trim()} ····${digits.slice(-4)}`
  }
  return name
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

      // Se há termo de busca ativo, buscar sem filtro de data (server-side)
      // Busca em descricao + categoria (chart_of_accounts)
      // Sugestões vêm no formato "código - nome", então separamos para buscar cada parte
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

  // Filter by bank
  const afterBankFilter = useMemo(() => {
    if (!selectedBankId) return movimentacoes
    return movimentacoes.filter((m) => m.conta_bancaria_id === selectedBankId)
  }, [movimentacoes, selectedBankId])

  // Filter by tipo
  const afterTipoFilter = useMemo(() => {
    if (tipoFilter === 'todos') return afterBankFilter
    if (tipoFilter === 'entradas') return afterBankFilter.filter((m) => m.tipo === 'credito')
    if (tipoFilter === 'saidas') return afterBankFilter.filter((m) => m.tipo === 'debito')
    // transferencias - for now show manual/conciliacao as transfers
    return afterBankFilter.filter((m) => m.origem === 'conciliacao' || m.origem === 'manual')
  }, [afterBankFilter, tipoFilter])

  // Suggestions for the search dropdown: unique categories (conta_contabil)
  // plus unique descriptions from the current movimentacoes set.
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

  // Close suggestions on outside click
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

  // Filter by search
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

  // Running balance: sorted ascending by date, then compute cumulative
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

  // Group by day (display order: newest first)
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

  // Bank account balances for chips
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

  // KPI calculations
  const entradasMes = useMemo(() => movimentacoes.filter((m) => m.tipo === 'credito').reduce((s, m) => s + m.valor, 0), [movimentacoes])
  const saidasMes = useMemo(() => movimentacoes.filter((m) => m.tipo === 'debito').reduce((s, m) => s + m.valor, 0), [movimentacoes])
  const qtdEntradas = useMemo(() => movimentacoes.filter((m) => m.tipo === 'credito').length, [movimentacoes])
  const qtdSaidas = useMemo(() => movimentacoes.filter((m) => m.tipo === 'debito').length, [movimentacoes])
  const resultadoMes = entradasMes - saidasMes

  // Per-bank running balance map for display
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

  // Bank name lookup
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
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
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

    // Header
    doc.setFillColor(26, 46, 74)
    doc.rect(0, 0, W, 18, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(255, 255, 255)
    doc.text('MOVIMENTAÇÕES', margin, 8)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(`${empresa}  |  ${periodo}`, margin, 14)

    // KPIs
    let y = 24
    const totalEntradas = filtered.filter(m => m.tipo === 'credito').reduce((s, m) => s + m.valor, 0)
    const totalSaidas = filtered.filter(m => m.tipo === 'debito').reduce((s, m) => s + m.valor, 0)
    const saldo = totalEntradas - totalSaidas

    doc.setFontSize(8)
    doc.setTextColor(80, 80, 80)
    doc.text(`Entradas: ${formatBRL(totalEntradas)}    |    Saídas: ${formatBRL(totalSaidas)}    |    Saldo: ${formatBRL(saldo)}    |    ${filtered.length} registros`, margin, y)
    y += 6

    // Table header
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

    // Rows
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)

    for (const m of filtered) {
      if (y > 195) {
        doc.addPage()
        y = 12
        // Re-draw header on new page
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

      // Alternate row bg
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

    // Footer
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
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#FEF3F2] border border-[#D92D20]">
          <ArrowDown className="w-3.5 h-3.5 text-[#D92D20]" />
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
      <AppLayout title="Movimentacoes">
        <div className="flex items-center justify-center h-64 text-[#555]">
          Selecione uma empresa para visualizar movimentacoes.
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="Movimentacoes">
      <div className="space-y-5">

        {/* ====== KPI CARDS ====== */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Saldo Atual */}
          <div className="border border-[#059669] rounded-lg p-4 bg-white">
            <p className="text-[10px] font-bold text-[#059669] uppercase tracking-widest mb-1">Saldo Atual</p>
            <p className="text-2xl font-bold text-[#1D2939]">{formatBRL(bankTotals.total)}</p>
            <p className="text-[11px] text-[#777] mt-1">Todas as contas</p>
            <span className="inline-block mt-2 text-[10px] font-semibold text-[#039855] bg-[#ECFDF3] px-2 py-0.5 rounded">
              Atualizado agora
            </span>
          </div>

          {/* Entradas do Mes */}
          <div className="border border-[#039855] rounded-lg p-4 bg-white">
            <p className="text-[10px] font-bold text-[#039855] uppercase tracking-widest mb-1">Entradas do Mes</p>
            <p className="text-2xl font-bold text-[#1D2939]">{formatBRL(entradasMes)}</p>
            <p className="text-[11px] text-[#777] mt-1">{qtdEntradas} lancamento{qtdEntradas !== 1 ? 's' : ''}</p>
            <span className="inline-block mt-2 text-[10px] font-semibold text-[#039855] bg-[#ECFDF3] px-2 py-0.5 rounded">
              +{formatBRL(entradasMes)}
            </span>
          </div>

          {/* Saidas do Mes */}
          <div className="border border-[#D92D20] rounded-lg p-4 bg-white">
            <p className="text-[10px] font-bold text-[#D92D20] uppercase tracking-widest mb-1">Saidas do Mes</p>
            <p className="text-2xl font-bold text-[#1D2939]">{formatBRL(saidasMes)}</p>
            <p className="text-[11px] text-[#777] mt-1">{qtdSaidas} lancamento{qtdSaidas !== 1 ? 's' : ''}</p>
            <span className="inline-block mt-2 text-[10px] font-semibold text-[#D92D20] bg-[#FEF3F2] px-2 py-0.5 rounded">
              -{formatBRL(saidasMes)}
            </span>
          </div>

          {/* Resultado do Mes */}
          <div className={`border rounded-lg p-4 bg-white ${resultadoMes >= 0 ? 'border-[#039855]' : 'border-[#D92D20]'}`}>
            <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${resultadoMes >= 0 ? 'text-[#039855]' : 'text-[#D92D20]'}`}>
              Resultado do Mes
            </p>
            <p className="text-2xl font-bold text-[#1D2939]">{formatBRL(Math.abs(resultadoMes))}</p>
            <p className="text-[11px] text-[#777] mt-1">Entradas - saidas</p>
            <span className={`inline-block mt-2 text-[10px] font-semibold px-2 py-0.5 rounded ${
              resultadoMes >= 0 ? 'text-[#039855] bg-[#ECFDF3]' : 'text-[#D92D20] bg-[#FEF3F2]'
            }`}>
              {resultadoMes >= 0 ? '\u25B2 positivo' : '\u25BC negativo'}
            </span>
          </div>
        </div>

        {/* ====== MOVIMENTACOES CARD ====== */}
        <div className="border border-[#ccc] rounded-lg overflow-hidden">

          {/* Header */}
          <div className="bg-[#059669] px-4 py-2.5 flex items-center justify-between">
            <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">
              Movimentacoes
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={exportPDF}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/10 text-white text-xs font-medium hover:bg-white/20 transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                PDF
              </button>
              <button
                onClick={exportCSV}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/10 text-white text-xs font-medium hover:bg-white/20 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                CSV
              </button>
              <button
                onClick={openModal}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white text-[#059669] text-xs font-semibold hover:bg-gray-100 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Lancamento manual
              </button>
            </div>
          </div>

          <div className="bg-white">

            {/* Bank account chips */}
            <div className="px-4 pt-4 pb-2 flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedBankId(null)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                  ${!selectedBankId
                    ? 'border-[#059669] bg-[#ECFDF4] text-[#059669]'
                    : 'border-[#ccc] bg-white text-[#555] hover:border-[#059669]'
                  }`}
              >
                <Landmark className="w-3.5 h-3.5" />
                Todas as contas
                <span className="font-bold">{formatBRL(bankTotals.total)}</span>
              </button>
              {bankAccounts.map((ba) => {
                const bal = bankTotals.perBank.get(ba.id) || 0
                const active = selectedBankId === ba.id
                return (
                  <button
                    key={ba.id}
                    onClick={() => setSelectedBankId(active ? null : ba.id)}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                      ${active
                        ? 'border-[#059669] bg-[#ECFDF4] text-[#059669]'
                        : 'border-[#ccc] bg-white text-[#555] hover:border-[#059669]'
                      }`}
                  >
                    {maskAccount(ba.name)}
                    <span className="font-bold">{formatBRL(bal)}</span>
                  </button>
                )
              })}
            </div>

            {/* Search */}
            <div className="px-4 pb-3">
              <div ref={searchWrapRef} className="relative flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#999] pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Buscar descricao..."
                    value={searchInput}
                    onChange={(e) => {
                      setSearchInput(e.target.value)
                      setShowSuggestions(true)
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        commitSearch()
                      } else if (e.key === 'Escape') {
                        setShowSuggestions(false)
                      }
                    }}
                    className="w-full border border-[#ccc] rounded-lg pl-9 pr-9 py-2.5 text-sm text-[#1D2939] placeholder:text-[#999] focus:outline-none focus:border-[#059669]"
                  />
                  {(searchInput || searchTerm) && (
                    <button
                      type="button"
                      onClick={clearSearch}
                      aria-label="Limpar busca"
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#999] hover:text-[#059669]"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  {showSuggestions && filteredSuggestions.length > 0 && (
                    <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-[#ccc] rounded-lg shadow-lg max-h-64 overflow-y-auto">
                      {filteredSuggestions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault()
                            commitSearch(s)
                          }}
                          className="w-full text-left px-3 py-2 text-xs text-[#1D2939] hover:bg-[#ECFDF4] border-b border-[#eee] last:border-b-0"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => commitSearch()}
                  className="px-4 py-2.5 rounded-lg bg-[#059669] text-white text-xs font-semibold hover:bg-[#2a3e5a] transition-colors"
                >
                  Buscar
                </button>
              </div>
            </div>

            {/* Type filter tabs */}
            <div className="px-4 pb-3 flex gap-1">
              {([
                { id: 'todos' as TipoFilter, label: 'Todos' },
                { id: 'entradas' as TipoFilter, label: 'Entradas' },
                { id: 'saidas' as TipoFilter, label: 'Saidas' },
                { id: 'transferencias' as TipoFilter, label: 'Transferencias' },
              ]).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setTipoFilter(tab.id)}
                  className={`px-3 py-1.5 rounded text-xs font-semibold border transition-colors ${
                    tipoFilter === tab.id
                      ? 'border-[#059669] bg-[#059669] text-white'
                      : 'border-[#ccc] bg-white text-[#555] hover:border-[#059669] hover:text-[#059669]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Date range */}
            <div className="px-4 pb-3 space-y-2">
              {activeSearchTerm ? (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-lg">
                  <Search className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <p className="text-[11px] text-blue-700">
                    Buscando "<strong>{activeSearchTerm}</strong>" em todas as datas
                  </p>
                </div>
              ) : (
                <>
                  <input
                    type="date"
                    value={dateStart}
                    onChange={(e) => setDateStart(e.target.value)}
                    className="w-full border border-[#ccc] rounded-lg px-3 py-2.5 text-sm text-[#1D2939] focus:outline-none focus:border-[#059669]"
                  />
                  <p className="text-[11px] text-[#999]">ate</p>
                  <input
                    type="date"
                    value={dateEnd}
                    onChange={(e) => setDateEnd(e.target.value)}
                    className="w-full border border-[#ccc] rounded-lg px-3 py-2.5 text-sm text-[#1D2939] focus:outline-none focus:border-[#059669]"
                  />
                </>
              )}
            </div>

            {/* Account dropdown filter */}
            <div className="px-4 pb-4">
              <div className="relative">
                <select
                  value={selectedBankId || ''}
                  onChange={(e) => setSelectedBankId(e.target.value || null)}
                  className="w-full appearance-none border border-[#ccc] rounded-lg px-3 py-2.5 text-sm text-[#1D2939] bg-white focus:outline-none focus:border-[#059669] pr-8"
                >
                  <option value="">Todas as contas</option>
                  {bankAccounts.map((ba) => (
                    <option key={ba.id} value={ba.id}>{ba.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#555] pointer-events-none" />
              </div>
            </div>

            {/* Day groups */}
            {loading ? (
              <div className="flex items-center justify-center py-16 text-[#555]">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Carregando movimentacoes...
              </div>
            ) : dayGroups.length === 0 ? (
              <div className="text-center py-16 text-[#555] text-sm">
                Nenhuma movimentacao encontrada no periodo.
              </div>
            ) : (
              dayGroups.map((group) => (
                <div key={group.date}>
                  {/* Day header */}
                  <div className="bg-[#ECFDF4] px-4 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 border-b border-[#ccc]">
                    <span className="text-[11px] font-bold text-[#059669] tracking-wide">
                      {group.label}
                    </span>
                    <div className="flex items-center gap-4 text-[11px]">
                      <span className="text-[#039855] font-semibold">
                        +{formatBRL(group.entradas)}
                      </span>
                      <span className="text-[#D92D20] font-semibold">
                        -{formatBRL(group.saidas)}
                      </span>
                      <span
                        className={`font-bold ${
                          group.saldo >= 0 ? 'text-[#039855]' : 'text-[#D92D20]'
                        }`}
                      >
                        Saldo: {group.saldo >= 0 ? '+' : ''}
                        {formatBRL(group.saldo)}
                      </span>
                    </div>
                  </div>

                  {/* Rows */}
                  {group.rows.map((row) => {
                    const bankName = row.conta_bancaria_id ? bankNameMap.get(row.conta_bancaria_id) : null
                    const bankBal = row.conta_bancaria_id ? bankRunningBalances.get(row.conta_bancaria_id) : null
                    const maskedName = bankName ? maskAccount(bankName) : '-'

                    return (
                      <div
                        key={row.id}
                        className="flex items-center gap-3 px-4 py-3 border-b border-[#eee] hover:bg-[#F6F2EB] transition-colors"
                      >
                        {/* Icon */}
                        <TypeIcon tipo={row.tipo} />

                        {/* Description + badge + category */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-[#1D2939] truncate">
                              {row.descricao || '(sem descricao)'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              row.origem === 'cr' || row.origem === 'conta_receber' ? 'bg-[#ECFDF3] text-[#039855]' :
                              row.origem === 'cp' || row.origem === 'conta_pagar' ? 'bg-[#FEF3F2] text-[#D92D20]' :
                              row.origem === 'venda' ? 'bg-[#e8eaf6] text-[#283593]' :
                              'bg-[#EAECF0] text-[#555]'
                            }`}>
                              {ORIGEM_LABELS[row.origem] || row.origem}
                              {row.origem === 'venda' && row.origem_id ? ` #${row.origem_id.substring(0, 4)}` : ''}
                            </span>
                            {row.conta_contabil && (
                              <span className="text-[10px] text-[#777]">
                                {row.conta_contabil.code} — {row.conta_contabil.name}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Bank account */}
                        <div className="hidden sm:block text-xs text-[#555] text-right w-28 truncate">
                          {maskedName}
                        </div>

                        {/* Value */}
                        <div
                          className={`text-sm font-bold text-right w-28 whitespace-nowrap ${
                            row.tipo === 'credito' ? 'text-[#039855]' : 'text-[#D92D20]'
                          }`}
                        >
                          {row.tipo === 'credito' ? '+' : '-'}
                          {formatBRL(row.valor)}
                        </div>

                        {/* Per-bank running balance */}
                        <div className="hidden md:block text-right w-28">
                          {bankName && bankBal != null && (
                            <>
                              <p className="text-[10px] text-[#999]">Saldo {bankName.split(/\s/)[0]}</p>
                              <p className={`text-xs font-semibold ${bankBal >= 0 ? 'text-[#059669]' : 'text-[#D92D20]'}`}>
                                {formatBRL(bankBal)}
                              </p>
                            </>
                          )}
                        </div>

                        {/* Action button */}
                        <button className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded border border-[#ccc] text-xs font-medium text-[#555] hover:border-[#059669] hover:text-[#059669] transition-colors whitespace-nowrap">
                          <Eye className="w-3 h-3" />
                          {ORIGEM_ACTION_LABELS[row.origem] || 'Ver'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ====== MODAL: Lancamento Manual ====== */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !modalSaving && setModalOpen(false)}
          />

          {/* Panel */}
          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="bg-[#059669] px-4 py-3 flex items-center justify-between rounded-t-lg">
              <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">
                Lancamento Manual
              </h3>
              <button
                onClick={() => !modalSaving && setModalOpen(false)}
                className="text-white/70 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Warning */}
              <div className="flex items-start gap-2 px-3 py-2 rounded border border-[#F79009] bg-[#FFFAEB] text-[#F79009] text-xs">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>
                  Use lancamentos manuais apenas para transacoes sem CR ou CP.
                </span>
              </div>

              {/* Tipo */}
              <div>
                <label className="block text-xs font-medium text-[#555] mb-1.5">Tipo</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormTipo('credito')}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded border text-sm font-medium transition-colors ${
                      formTipo === 'credito'
                        ? 'border-[#039855] bg-[#ECFDF3] text-[#039855]'
                        : 'border-[#ccc] bg-white text-[#555] hover:border-[#039855]'
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
                        ? 'border-[#D92D20] bg-[#FEF3F2] text-[#D92D20]'
                        : 'border-[#ccc] bg-white text-[#555] hover:border-[#D92D20]'
                    }`}
                  >
                    <ArrowDown className="w-4 h-4" />
                    Saida
                  </button>
                </div>
              </div>

              {/* Descricao (Produto/Servico do Operacional) */}
              <div>
                <label className="block text-xs font-medium text-[#555] mb-1">
                  Descricao (Produto/Servico) <span className="text-[#D92D20]">*</span>
                </label>
                <select
                  value={formDescricao}
                  onChange={(e) => setFormDescricao(e.target.value)}
                  className="w-full border border-[#ccc] rounded px-3 py-2 text-sm text-[#1D2939] bg-white focus:outline-none focus:border-[#059669]"
                >
                  <option value="">Selecione um produto/servico...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.description}>
                      {p.code ? `${p.code} - ` : ''}{p.description}
                    </option>
                  ))}
                </select>
              </div>

              {/* Valor + Data */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#555] mb-1">
                    Valor <span className="text-[#D92D20]">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formValor}
                    onChange={(e) => setFormValor(e.target.value)}
                    placeholder="0,00"
                    className="w-full border border-[#ccc] rounded px-3 py-2 text-sm text-[#1D2939] placeholder:text-[#999] focus:outline-none focus:border-[#059669]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#555] mb-1">
                    Data <span className="text-[#D92D20]">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData}
                    onChange={(e) => setFormData(e.target.value)}
                    className="w-full border border-[#ccc] rounded px-3 py-2 text-sm text-[#1D2939] focus:outline-none focus:border-[#059669]"
                  />
                </div>
              </div>

              {/* Conta bancaria + Conta contabil */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#555] mb-1">
                    Conta bancaria <span className="text-[#D92D20]">*</span>
                  </label>
                  <select
                    value={formBankId}
                    onChange={(e) => setFormBankId(e.target.value)}
                    className="w-full border border-[#ccc] rounded px-3 py-2 text-sm text-[#1D2939] bg-white focus:outline-none focus:border-[#059669]"
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
                  <label className="block text-xs font-medium text-[#555] mb-1">
                    Conta contabil <span className="text-[#D92D20]">*</span>
                  </label>
                  <select
                    value={formContaContabilId}
                    onChange={(e) => setFormContaContabilId(e.target.value)}
                    className="w-full border border-[#ccc] rounded px-3 py-2 text-sm text-[#1D2939] bg-white focus:outline-none focus:border-[#059669]"
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

              {/* Centro de custo */}
              <div>
                <label className="block text-xs font-medium text-[#555] mb-1">
                  Centro de custo
                </label>
                <select
                  value={formCentroCustoId}
                  onChange={(e) => setFormCentroCustoId(e.target.value)}
                  className="w-full border border-[#ccc] rounded px-3 py-2 text-sm text-[#1D2939] bg-white focus:outline-none focus:border-[#059669]"
                >
                  <option value="">Nenhum</option>
                  {centrosCusto.map((cc) => (
                    <option key={cc.id} value={cc.id}>
                      {cc.codigo} - {cc.descricao}
                    </option>
                  ))}
                </select>
              </div>

              {/* Observacao */}
              <div>
                <label className="block text-xs font-medium text-[#555] mb-1">Observacao</label>
                <textarea
                  value={formObservacao}
                  onChange={(e) => setFormObservacao(e.target.value)}
                  rows={2}
                  placeholder="Observacoes adicionais..."
                  className="w-full border border-[#ccc] rounded px-3 py-2 text-sm text-[#1D2939] placeholder:text-[#999] focus:outline-none focus:border-[#059669] resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => !modalSaving && setModalOpen(false)}
                  className="px-4 py-2 rounded border border-[#ccc] text-sm text-[#555] hover:bg-[#F6F2EB] transition-colors"
                  disabled={modalSaving}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={
                    modalSaving ||
                    !formDescricao.trim() ||
                    !formValor ||
                    !formData ||
                    !formBankId ||
                    !formContaContabilId
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-[#059669] text-white text-sm font-medium hover:bg-[#15243a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {modalSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Confirmar Lancamento
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
