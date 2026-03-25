import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { safeQuery } from '@/lib/supabaseQuery'
import { formatBRL, formatData } from '@/lib/format'
import { AppLayout } from '@/components/layout/AppLayout'
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
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

function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function maskAccount(name: string): string {
  // Show last 4 digits if name has numbers, else just return name
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
              .order('created_at', { ascending: false }),
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

  // Filter by search
  const filtered = useMemo(() => {
    const needle = normalizeSearch(searchTerm)
    if (!needle) return afterBankFilter
    return afterBankFilter.filter((m) => {
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
  }, [afterBankFilter, searchTerm])

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
    // withRunningBalance is sorted ascending; we iterate to build groups
    for (const row of withRunningBalance) {
      const dateKey = row.data
      if (!map.has(dateKey)) {
        const d = parseISO(dateKey)
        map.set(dateKey, {
          date: dateKey,
          label: format(d, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }),
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
    // Reverse rows within each group so newest appears first
    for (const g of map.values()) {
      g.rows.reverse()
    }
    // Return groups sorted newest first
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
      // Reset form & close
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

        {/* ====== BANK ACCOUNT CHIPS ====== */}
        <div className="flex flex-wrap gap-2">
          {/* "Todas" chip */}
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

        {/* ====== DATE RANGE + SEARCH + NEW BUTTON ====== */}
        <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-[#555] font-medium">De</label>
            <input
              type="date"
              value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
              className="border border-[#ccc] rounded px-2 py-1.5 text-sm text-[#0a0a0a] focus:outline-none focus:border-[#1a2e4a]"
            />
            <label className="text-xs text-[#555] font-medium">Ate</label>
            <input
              type="date"
              value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
              className="border border-[#ccc] rounded px-2 py-1.5 text-sm text-[#0a0a0a] focus:outline-none focus:border-[#1a2e4a]"
            />
          </div>
          <div className="relative flex-1 min-w-0 w-full md:w-auto">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#999]" />
            <input
              type="text"
              placeholder="Buscar descricao, conta, valor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full border border-[#ccc] rounded pl-8 pr-3 py-1.5 text-sm text-[#0a0a0a] placeholder:text-[#999] focus:outline-none focus:border-[#1a2e4a]"
            />
          </div>
          <button
            onClick={openModal}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded bg-[#1a2e4a] text-white text-sm font-medium hover:bg-[#15243a] transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Lancamento Manual
          </button>
        </div>

        {/* ====== MAIN CARD ====== */}
        <div className="border border-[#ccc] rounded-lg overflow-hidden">
          <div className="bg-[#1a2e4a] px-4 py-2.5 flex items-center justify-between">
            <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">
              Extrato de Movimentacoes
            </h3>
            <span className="text-[10px] text-white/70">
              {filtered.length} lancamento{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="bg-white">
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
                  <div className="bg-[#f0f4f8] px-4 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 border-b border-[#ccc]">
                    <span className="text-xs font-semibold text-[#1a2e4a] capitalize">
                      {group.label}
                    </span>
                    <div className="flex items-center gap-3 text-[11px]">
                      <span className="text-[#0a5c2e] font-medium">
                        Entradas: +{formatBRL(group.entradas)}
                      </span>
                      <span className="text-[#8b0000] font-medium">
                        Saidas: -{formatBRL(group.saidas)}
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
                  {group.rows.map((row) => (
                    <div
                      key={row.id}
                      className="flex items-center gap-3 px-4 py-2.5 border-b border-[#eee] hover:bg-[#fafafa] transition-colors"
                    >
                      {/* Icon */}
                      <TypeIcon tipo={row.tipo} />

                      {/* Description + origem + conta contabil */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-[#0a0a0a] truncate">
                            {row.descricao || '(sem descricao)'}
                          </span>
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#f0f0f0] text-[#555] border border-[#ddd]">
                            {ORIGEM_LABELS[row.origem] || row.origem}
                          </span>
                        </div>
                        {row.conta_contabil && (
                          <span className="text-[11px] text-[#777]">
                            {row.conta_contabil.code} - {row.conta_contabil.name}
                          </span>
                        )}
                      </div>

                      {/* Bank account */}
                      <div className="hidden sm:block text-xs text-[#555] text-right w-28 truncate">
                        {row.conta_bancaria?.name || '-'}
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

                      {/* Running balance */}
                      <div
                        className={`text-xs font-medium text-right w-28 whitespace-nowrap hidden md:block ${
                          row.runningBalance >= 0 ? 'text-[#1a2e4a]' : 'text-[#8b0000]'
                        }`}
                      >
                        {formatBRL(row.runningBalance)}
                      </div>
                    </div>
                  ))}
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
