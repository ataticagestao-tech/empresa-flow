import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { safeQuery } from '@/lib/supabaseQuery'
import { formatBRL } from '@/lib/format'
import { AppLayout } from '@/components/layout/AppLayout'
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
  origem: 'cr' | 'cp' | 'venda' | 'manual' | 'conciliacao'
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
  const fetchData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const client = activeClient ?? supabase

      const [movData, bankData, coaData, ccData, prodData] = await Promise.all([
        safeQuery(
          () =>
            (client as any)
              .from('movimentacoes')
              .select(
                '*, conta_bancaria:bank_accounts(id,name), conta_contabil:chart_of_accounts(code,name)'
              )
              .eq('company_id', companyId)
              .gte('data', dateStart)
              .lte('data', dateEnd)
              .order('data', { ascending: false })
              .order('created_at', { ascending: false })
              .limit(5000),
          'movimentacoes'
        ),
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
  }, [companyId, activeClient, dateStart, dateEnd])

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

  // ---- Render helpers ----

  const TypeIcon = ({ tipo }: { tipo: string }) => {
    if (tipo === 'credito')
      return (
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#e6f4ec] border border-[#0a5c2e]">
          <ArrowUp className="w-3.5 h-3.5 text-[#0a5c2e]" />
        </span>
      )
    if (tipo === 'debito')
      return (
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#fdecea] border border-[#8b0000]">
          <ArrowDown className="w-3.5 h-3.5 text-[#8b0000]" />
        </span>
      )
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#f0f4f8] border border-[#1a2e4a]">
        <ArrowLeftRight className="w-3.5 h-3.5 text-[#1a2e4a]" />
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
          <div className="border border-[#1a2e4a] rounded-lg p-4 bg-white">
            <p className="text-[10px] font-bold text-[#1a2e4a] uppercase tracking-widest mb-1">Saldo Atual</p>
            <p className="text-2xl font-bold text-[#0a0a0a]">{formatBRL(bankTotals.total)}</p>
            <p className="text-[11px] text-[#777] mt-1">Todas as contas</p>
            <span className="inline-block mt-2 text-[10px] font-semibold text-[#0a5c2e] bg-[#e6f4ec] px-2 py-0.5 rounded">
              Atualizado agora
            </span>
          </div>

          {/* Entradas do Mes */}
          <div className="border border-[#0a5c2e] rounded-lg p-4 bg-white">
            <p className="text-[10px] font-bold text-[#0a5c2e] uppercase tracking-widest mb-1">Entradas do Mes</p>
            <p className="text-2xl font-bold text-[#0a0a0a]">{formatBRL(entradasMes)}</p>
            <p className="text-[11px] text-[#777] mt-1">{qtdEntradas} lancamento{qtdEntradas !== 1 ? 's' : ''}</p>
            <span className="inline-block mt-2 text-[10px] font-semibold text-[#0a5c2e] bg-[#e6f4ec] px-2 py-0.5 rounded">
              +{formatBRL(entradasMes)}
            </span>
          </div>

          {/* Saidas do Mes */}
          <div className="border border-[#8b0000] rounded-lg p-4 bg-white">
            <p className="text-[10px] font-bold text-[#8b0000] uppercase tracking-widest mb-1">Saidas do Mes</p>
            <p className="text-2xl font-bold text-[#0a0a0a]">{formatBRL(saidasMes)}</p>
            <p className="text-[11px] text-[#777] mt-1">{qtdSaidas} lancamento{qtdSaidas !== 1 ? 's' : ''}</p>
            <span className="inline-block mt-2 text-[10px] font-semibold text-[#8b0000] bg-[#fdecea] px-2 py-0.5 rounded">
              -{formatBRL(saidasMes)}
            </span>
          </div>

          {/* Resultado do Mes */}
          <div className={`border rounded-lg p-4 bg-white ${resultadoMes >= 0 ? 'border-[#0a5c2e]' : 'border-[#8b0000]'}`}>
            <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${resultadoMes >= 0 ? 'text-[#0a5c2e]' : 'text-[#8b0000]'}`}>
              Resultado do Mes
            </p>
            <p className="text-2xl font-bold text-[#0a0a0a]">{formatBRL(Math.abs(resultadoMes))}</p>
            <p className="text-[11px] text-[#777] mt-1">Entradas - saidas</p>
            <span className={`inline-block mt-2 text-[10px] font-semibold px-2 py-0.5 rounded ${
              resultadoMes >= 0 ? 'text-[#0a5c2e] bg-[#e6f4ec]' : 'text-[#8b0000] bg-[#fdecea]'
            }`}>
              {resultadoMes >= 0 ? '\u25B2 positivo' : '\u25BC negativo'}
            </span>
          </div>
        </div>

        {/* ====== MOVIMENTACOES CARD ====== */}
        <div className="border border-[#ccc] rounded-lg overflow-hidden">

          {/* Header */}
          <div className="bg-[#1a2e4a] px-4 py-2.5 flex items-center justify-between">
            <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">
              Movimentacoes
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={exportCSV}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/10 text-white text-xs font-medium hover:bg-white/20 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Exportar
              </button>
              <button
                onClick={openModal}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white text-[#1a2e4a] text-xs font-semibold hover:bg-gray-100 transition-colors"
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
                    ? 'border-[#1a2e4a] bg-[#f0f4f8] text-[#1a2e4a]'
                    : 'border-[#ccc] bg-white text-[#555] hover:border-[#1a2e4a]'
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
                        ? 'border-[#1a2e4a] bg-[#f0f4f8] text-[#1a2e4a]'
                        : 'border-[#ccc] bg-white text-[#555] hover:border-[#1a2e4a]'
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
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#999]" />
                <input
                  type="text"
                  placeholder="Buscar descricao..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full border border-[#ccc] rounded-lg pl-9 pr-3 py-2.5 text-sm text-[#0a0a0a] placeholder:text-[#999] focus:outline-none focus:border-[#1a2e4a]"
                />
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
                      ? 'border-[#1a2e4a] bg-[#1a2e4a] text-white'
                      : 'border-[#ccc] bg-white text-[#555] hover:border-[#1a2e4a] hover:text-[#1a2e4a]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Date range */}
            <div className="px-4 pb-3 space-y-2">
              <input
                type="date"
                value={dateStart}
                onChange={(e) => setDateStart(e.target.value)}
                className="w-full border border-[#ccc] rounded-lg px-3 py-2.5 text-sm text-[#0a0a0a] focus:outline-none focus:border-[#1a2e4a]"
              />
              <p className="text-[11px] text-[#999]">ate</p>
              <input
                type="date"
                value={dateEnd}
                onChange={(e) => setDateEnd(e.target.value)}
                className="w-full border border-[#ccc] rounded-lg px-3 py-2.5 text-sm text-[#0a0a0a] focus:outline-none focus:border-[#1a2e4a]"
              />
            </div>

            {/* Account dropdown filter */}
            <div className="px-4 pb-4">
              <div className="relative">
                <select
                  value={selectedBankId || ''}
                  onChange={(e) => setSelectedBankId(e.target.value || null)}
                  className="w-full appearance-none border border-[#ccc] rounded-lg px-3 py-2.5 text-sm text-[#0a0a0a] bg-white focus:outline-none focus:border-[#1a2e4a] pr-8"
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
                  <div className="bg-[#f0f4f8] px-4 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 border-b border-[#ccc]">
                    <span className="text-[11px] font-bold text-[#1a2e4a] tracking-wide">
                      {group.label}
                    </span>
                    <div className="flex items-center gap-4 text-[11px]">
                      <span className="text-[#0a5c2e] font-semibold">
                        +{formatBRL(group.entradas)}
                      </span>
                      <span className="text-[#8b0000] font-semibold">
                        -{formatBRL(group.saidas)}
                      </span>
                      <span
                        className={`font-bold ${
                          group.saldo >= 0 ? 'text-[#0a5c2e]' : 'text-[#8b0000]'
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
                        className="flex items-center gap-3 px-4 py-3 border-b border-[#eee] hover:bg-[#fafafa] transition-colors"
                      >
                        {/* Icon */}
                        <TypeIcon tipo={row.tipo} />

                        {/* Description + badge + category */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-[#0a0a0a] truncate">
                              {row.descricao || '(sem descricao)'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              row.origem === 'cr' ? 'bg-[#e6f4ec] text-[#0a5c2e]' :
                              row.origem === 'cp' ? 'bg-[#fdecea] text-[#8b0000]' :
                              row.origem === 'venda' ? 'bg-[#e8eaf6] text-[#283593]' :
                              'bg-[#f0f0f0] text-[#555]'
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
                            row.tipo === 'credito' ? 'text-[#0a5c2e]' : 'text-[#8b0000]'
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
                              <p className={`text-xs font-semibold ${bankBal >= 0 ? 'text-[#1a2e4a]' : 'text-[#8b0000]'}`}>
                                {formatBRL(bankBal)}
                              </p>
                            </>
                          )}
                        </div>

                        {/* Action button */}
                        <button className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded border border-[#ccc] text-xs font-medium text-[#555] hover:border-[#1a2e4a] hover:text-[#1a2e4a] transition-colors whitespace-nowrap">
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
            <div className="bg-[#1a2e4a] px-4 py-3 flex items-center justify-between rounded-t-lg">
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
              <div className="flex items-start gap-2 px-3 py-2 rounded border border-[#b8960a] bg-[#fffbe6] text-[#5c3a00] text-xs">
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
                        ? 'border-[#0a5c2e] bg-[#e6f4ec] text-[#0a5c2e]'
                        : 'border-[#ccc] bg-white text-[#555] hover:border-[#0a5c2e]'
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
                        ? 'border-[#8b0000] bg-[#fdecea] text-[#8b0000]'
                        : 'border-[#ccc] bg-white text-[#555] hover:border-[#8b0000]'
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
                  Descricao (Produto/Servico) <span className="text-[#8b0000]">*</span>
                </label>
                <select
                  value={formDescricao}
                  onChange={(e) => setFormDescricao(e.target.value)}
                  className="w-full border border-[#ccc] rounded px-3 py-2 text-sm text-[#0a0a0a] bg-white focus:outline-none focus:border-[#1a2e4a]"
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
                    Valor <span className="text-[#8b0000]">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formValor}
                    onChange={(e) => setFormValor(e.target.value)}
                    placeholder="0,00"
                    className="w-full border border-[#ccc] rounded px-3 py-2 text-sm text-[#0a0a0a] placeholder:text-[#999] focus:outline-none focus:border-[#1a2e4a]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#555] mb-1">
                    Data <span className="text-[#8b0000]">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData}
                    onChange={(e) => setFormData(e.target.value)}
                    className="w-full border border-[#ccc] rounded px-3 py-2 text-sm text-[#0a0a0a] focus:outline-none focus:border-[#1a2e4a]"
                  />
                </div>
              </div>

              {/* Conta bancaria + Conta contabil */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#555] mb-1">
                    Conta bancaria <span className="text-[#8b0000]">*</span>
                  </label>
                  <select
                    value={formBankId}
                    onChange={(e) => setFormBankId(e.target.value)}
                    className="w-full border border-[#ccc] rounded px-3 py-2 text-sm text-[#0a0a0a] bg-white focus:outline-none focus:border-[#1a2e4a]"
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
                    Conta contabil <span className="text-[#8b0000]">*</span>
                  </label>
                  <select
                    value={formContaContabilId}
                    onChange={(e) => setFormContaContabilId(e.target.value)}
                    className="w-full border border-[#ccc] rounded px-3 py-2 text-sm text-[#0a0a0a] bg-white focus:outline-none focus:border-[#1a2e4a]"
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
                  className="w-full border border-[#ccc] rounded px-3 py-2 text-sm text-[#0a0a0a] bg-white focus:outline-none focus:border-[#1a2e4a]"
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
                  className="w-full border border-[#ccc] rounded px-3 py-2 text-sm text-[#0a0a0a] placeholder:text-[#999] focus:outline-none focus:border-[#1a2e4a] resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => !modalSaving && setModalOpen(false)}
                  className="px-4 py-2 rounded border border-[#ccc] text-sm text-[#555] hover:bg-[#f5f5f5] transition-colors"
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
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-[#1a2e4a] text-white text-sm font-medium hover:bg-[#15243a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
