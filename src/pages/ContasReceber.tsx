import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useCompany } from '@/contexts/CompanyContext'
import { safeQuery } from '@/lib/supabaseQuery'
import { formatBRL, formatData, formatCPF, formatCNPJ } from '@/lib/format'
import { quitarCR } from '@/lib/financeiro/transacao'
import { AppLayout } from '@/components/layout/AppLayout'
import {
  addDays, differenceInDays, parseISO, startOfMonth, endOfMonth, format,
} from 'date-fns'
import {
  Search, Plus, DollarSign, Clock, AlertTriangle, CheckCircle2,
  MoreHorizontal, X, ChevronDown, Loader2, UserPlus,
} from 'lucide-react'

// Cast for GESTAP tables not in generated types
const db = supabase as any

/* ================================================================
   TYPES
   ================================================================ */

interface CR {
  id: string
  company_id: string
  pagador_nome: string
  pagador_cpf_cnpj: string | null
  pagador_email: string | null
  valor: number
  valor_pago: number | null
  data_vencimento: string
  data_pagamento: string | null
  status: string
  forma_recebimento: string | null
  conta_contabil_id: string | null
  centro_custo_id: string | null
  observacoes: string | null
  venda_id: string | null
  contrato_recorrente_id: string | null
}

interface BankAccount { id: string; name: string; banco?: string }
interface ChartAccount { id: string; code: string; name: string }
interface CentroCusto { id: string; codigo: string; descricao: string }
interface Cliente { id: string; razao_social: string; nome_fantasia: string | null; cpf_cnpj: string | null; email: string | null }
interface Product { id: string; description: string; code: string | null }

/* ================================================================
   CONSTANTS
   ================================================================ */

const STATUS_OPTIONS = [
  { value: 'todos', label: 'Todos' },
  { value: 'aberto', label: 'Aberto' },
  { value: 'parcial', label: 'Parcial' },
  { value: 'vencido', label: 'Vencido' },
  { value: 'pago', label: 'Pago' },
]

const FORMAS_RECEBIMENTO = [
  'PIX', 'Dinheiro', 'Transferencia', 'Cartao debito', 'Cartao credito', 'Boleto',
]

const TIPO_TITULO_OPTIONS = [
  { value: 'unica', label: 'Parcela unica', icon: '1x' },
  { value: 'parcelado', label: 'Parcelado', icon: 'Nx' },
  { value: 'recorrente', label: 'Recorrente', icon: '~' },
  { value: 'avulsa', label: 'Cobranca avulsa', icon: '$' },
  { value: 'contrato', label: 'Contrato', icon: '#' },
]

/* ================================================================
   HELPERS
   ================================================================ */

function deriveTipo(cr: CR): string {
  if (cr.contrato_recorrente_id) return 'Contrato'
  if (cr.venda_id) return 'Parcela unica'
  return 'Cobranca avulsa'
}

function statusBadge(status: string) {
  switch (status) {
    case 'aberto':
      return { label: 'Em aberto', text: '#1a2e4a', bg: '#f0f4f8', border: '#1a2e4a' }
    case 'vencido':
      return { label: 'Vencido', text: '#8b0000', bg: '#fdecea', border: '#8b0000' }
    case 'parcial':
      return { label: 'Parcial', text: '#5c3a00', bg: '#fffbe6', border: '#b8960a' }
    case 'pago':
      return { label: 'Pago', text: '#0a5c2e', bg: '#e6f4ec', border: '#0a5c2e' }
    default:
      return { label: status, text: '#555', bg: '#f5f5f5', border: '#ccc' }
  }
}

function computeStatus(cr: CR): string {
  if (cr.status === 'pago' || cr.status === 'cancelado') return cr.status
  const hoje = new Date().toISOString().split('T')[0]
  if (cr.data_vencimento < hoje && cr.status !== 'pago') {
    return (cr.valor_pago || 0) > 0 ? 'parcial' : 'vencido'
  }
  if ((cr.valor_pago || 0) > 0 && (cr.valor_pago || 0) < cr.valor) return 'parcial'
  return cr.status
}

/* ================================================================
   COMPONENT
   ================================================================ */

export default function ContasReceber() {
  const { selectedCompany } = useCompany()

  // ── Data ──
  const [items, setItems] = useState<CR[]>([])
  const [loading, setLoading] = useState(true)
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([])
  const [centrosCusto, setCentrosCusto] = useState<CentroCusto[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [products, setProducts] = useState<Product[]>([])

  // ── Filters ──
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // ── Modals ──
  const [quitarModal, setQuitarModal] = useState<CR | null>(null)
  const [novoModal, setNovoModal] = useState(false)
  const [renegociarModal, setRenegociarModal] = useState<CR | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null)

  // ── Bulk selection ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [quitarLoteModal, setQuitarLoteModal] = useState(false)
  const [loteProgress, setLoteProgress] = useState({ current: 0, total: 0 })

  // ── Submitting state ──
  const [submitting, setSubmitting] = useState(false)

  const companyId = selectedCompany?.id

  // ── Fetch items ──
  async function fetchItems() {
    if (!companyId) return
    setLoading(true)
    // Paginar para trazer todos (Supabase limita 1000/request)
    const pageSize = 1000
    let allData: any[] = []
    let page = 0
    while (true) {
      const { data } = await db
        .from('contas_receber')
        .select('*')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('data_vencimento', { ascending: true })
        .range(page * pageSize, (page + 1) * pageSize - 1)
      if (!data || data.length === 0) break
      allData = allData.concat(data)
      if (data.length < pageSize) break
      page++
    }
    setItems((allData as CR[]) || [])
    setLoading(false)
  }

  // ── Fetch lookups ──
  async function fetchLookups() {
    if (!companyId) return
    const [banksRes, accountsRes, centrosRes, clientesRes, prodRes] = await Promise.all([
      db.from('bank_accounts').select('id, name, banco').eq('company_id', companyId).eq('is_active', true),
      db.from('chart_of_accounts').select('id, code, name').eq('company_id', companyId),
      db.from('centros_custo').select('id, codigo, descricao').eq('company_id', companyId).eq('ativo', true),
      db.from('clients').select('id, razao_social, nome_fantasia, cpf_cnpj, email').eq('company_id', companyId).eq('is_active', true).order('razao_social'),
      db.from('products').select('id, description, code').eq('company_id', companyId).eq('is_active', true).order('description'),
    ])
    setBankAccounts((banksRes.data as BankAccount[]) || [])
    setChartAccounts((accountsRes.data as ChartAccount[]) || [])
    setCentrosCusto((centrosRes.data as CentroCusto[]) || [])
    setClientes((clientesRes.data as Cliente[]) || [])
    setProducts((prodRes.data as Product[]) || [])
  }

  useEffect(() => {
    fetchItems()
    fetchLookups()
  }, [companyId])

  // ── Close dropdown on outside click ──
  useEffect(() => {
    if (!dropdownOpen) return
    const handler = () => setDropdownOpen(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [dropdownOpen])

  // ── Derived data ──
  const categoryMap = useMemo(() => {
    const m: Record<string, string> = {}
    chartAccounts.forEach(a => { m[a.id] = a.name })
    return m
  }, [chartAccounts])

  const enrichedItems = useMemo(() => items.map(cr => ({ ...cr, _status: computeStatus(cr) })), [items])

  const filtered = useMemo(() => {
    let list = enrichedItems
    if (search) {
      const s = search.toLowerCase()
      list = list.filter(cr => cr.pagador_nome.toLowerCase().includes(s))
    }
    if (statusFilter !== 'todos') {
      list = list.filter(cr => cr._status === statusFilter)
    }
    if (dateFrom) list = list.filter(cr => cr.data_vencimento >= dateFrom)
    if (dateTo) list = list.filter(cr => cr.data_vencimento <= dateTo)
    return list
  }, [enrichedItems, search, statusFilter, dateFrom, dateTo])

  // ── Bulk selection helpers ──
  const selectableItems = useMemo(() => filtered.filter(cr => cr._status !== 'pago' && cr._status !== 'cancelado'), [filtered])
  const allSelectableSelected = selectableItems.length > 0 && selectableItems.every(cr => selectedIds.has(cr.id))
  const someSelected = selectedIds.size > 0

  const toggleSelectAll = () => {
    if (allSelectableSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(selectableItems.map(cr => cr.id)))
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ── KPIs ──
  const kpis = useMemo(() => {
    const hoje = new Date().toISOString().split('T')[0]
    const em7dias = format(addDays(new Date(), 7), 'yyyy-MM-dd')
    const mesInicio = format(startOfMonth(new Date()), 'yyyy-MM-dd')
    const mesFim = format(endOfMonth(new Date()), 'yyyy-MM-dd')

    let totalAberto = 0
    let vencendo7d = 0
    let totalVencido = 0
    let recebidoMes = 0

    for (const cr of enrichedItems) {
      const saldo = cr.valor - (cr.valor_pago || 0)
      const st = cr._status

      if (['aberto', 'parcial', 'vencido'].includes(st)) {
        totalAberto += saldo
      }
      if (st === 'aberto' && cr.data_vencimento >= hoje && cr.data_vencimento <= em7dias) {
        vencendo7d += saldo
      }
      if (cr.data_vencimento < hoje && ['aberto', 'parcial'].includes(st)) {
        totalVencido += saldo
      }
      if (cr.data_pagamento && cr.data_pagamento >= mesInicio && cr.data_pagamento <= mesFim) {
        recebidoMes += (cr.valor_pago || 0)
      }
    }

    return { totalAberto, vencendo7d, totalVencido, recebidoMes }
  }, [enrichedItems])

  /* ================================================================
     RENDER
     ================================================================ */

  return (
    <AppLayout>
      <div className="p-6 max-w-[1400px] mx-auto space-y-6">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#0a0a0a] tracking-tight">Contas a Receber</h1>
            <p className="text-[13px] text-[#555] mt-0.5">Gerencie titulos, cobran&ccedil;as e recebimentos</p>
          </div>
          <button
            onClick={() => setNovoModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#1a2e4a] text-white text-[13px] font-semibold rounded-lg hover:bg-[#15253d] transition-colors"
          >
            <Plus size={16} />
            Novo titulo
          </button>
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            icon={<DollarSign size={18} />}
            label="Total em aberto"
            value={formatBRL(kpis.totalAberto)}
            color={{ text: '#1a2e4a', bg: '#f0f4f8', border: '#1a2e4a', icon: '#1a2e4a' }}
          />
          <KpiCard
            icon={<Clock size={18} />}
            label="Vencendo em 7 dias"
            value={formatBRL(kpis.vencendo7d)}
            color={{ text: '#5c3a00', bg: '#fffbe6', border: '#b8960a', icon: '#b8960a' }}
          />
          <KpiCard
            icon={<AlertTriangle size={18} />}
            label="Vencidos"
            value={formatBRL(kpis.totalVencido)}
            color={{ text: '#8b0000', bg: '#fdecea', border: '#8b0000', icon: '#8b0000' }}
          />
          <KpiCard
            icon={<CheckCircle2 size={18} />}
            label="Recebido no mes"
            value={formatBRL(kpis.recebidoMes)}
            color={{ text: '#0a5c2e', bg: '#e6f4ec', border: '#0a5c2e', icon: '#0a5c2e' }}
          />
        </div>

        {/* ── Filters ── */}
        <div className="border border-[#ccc] rounded-lg overflow-hidden">
          <div className="bg-[#1a2e4a] px-4 py-2.5">
            <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">Filtros</h3>
          </div>
          <div className="p-4 bg-white flex flex-wrap gap-3 items-end">
            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[11px] font-semibold text-[#555] uppercase tracking-wide mb-1">Pagador</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#999]" />
                <input
                  type="text"
                  placeholder="Buscar por nome..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-[#ccc] rounded-md text-[13px] text-[#0a0a0a] placeholder:text-[#999] focus:outline-none focus:border-[#1a2e4a] focus:ring-1 focus:ring-[#1a2e4a]"
                />
              </div>
            </div>
            {/* Status */}
            <div className="min-w-[140px]">
              <label className="block text-[11px] font-semibold text-[#555] uppercase tracking-wide mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-[#ccc] rounded-md text-[13px] text-[#0a0a0a] bg-white focus:outline-none focus:border-[#1a2e4a] focus:ring-1 focus:ring-[#1a2e4a]"
              >
                {STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            {/* Date from */}
            <div className="min-w-[140px]">
              <label className="block text-[11px] font-semibold text-[#555] uppercase tracking-wide mb-1">De</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 border border-[#ccc] rounded-md text-[13px] text-[#0a0a0a] focus:outline-none focus:border-[#1a2e4a] focus:ring-1 focus:ring-[#1a2e4a]"
              />
            </div>
            {/* Date to */}
            <div className="min-w-[140px]">
              <label className="block text-[11px] font-semibold text-[#555] uppercase tracking-wide mb-1">Ate</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="w-full px-3 py-2 border border-[#ccc] rounded-md text-[13px] text-[#0a0a0a] focus:outline-none focus:border-[#1a2e4a] focus:ring-1 focus:ring-[#1a2e4a]"
              />
            </div>
            {/* Clear */}
            {(search || statusFilter !== 'todos' || dateFrom || dateTo) && (
              <button
                onClick={() => { setSearch(''); setStatusFilter('todos'); setDateFrom(''); setDateTo('') }}
                className="px-3 py-2 text-[12px] text-[#8b0000] font-semibold hover:underline"
              >
                Limpar
              </button>
            )}
          </div>
        </div>

        {/* ── Table ── */}
        <div className="border border-[#ccc] rounded-lg overflow-hidden">
          <div className="bg-[#1a2e4a] px-4 py-2.5 flex items-center justify-between">
            <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">
              Titulos ({filtered.length})
            </h3>
            {someSelected && (
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-white/70">
                  {selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}
                </span>
                <button
                  onClick={() => setQuitarLoteModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-[#0a5c2e] bg-white rounded hover:bg-[#e6f4ec] transition-colors"
                >
                  <CheckCircle2 size={12} />
                  Quitar em lote
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-white/60 hover:text-white transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
          <div className="bg-white overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={24} className="animate-spin text-[#1a2e4a]" />
                <span className="ml-2 text-[13px] text-[#555]">Carregando...</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-[13px] text-[#999]">
                Nenhum titulo encontrado.
              </div>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[#e5e5e5]">
                    <th className="px-3 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allSelectableSelected}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-[#ccc] text-[#1a2e4a] focus:ring-[#1a2e4a] cursor-pointer"
                      />
                    </th>
                    {['Pagador', 'Tipo', 'Categoria', 'Vencimento', 'Valor', 'Pago', 'Saldo', 'Status', 'Acoes'].map(h => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-[10px] font-bold text-[#555] uppercase tracking-widest"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(cr => {
                    const saldo = cr.valor - (cr.valor_pago || 0)
                    const st = statusBadge(cr._status)
                    const hoje = new Date().toISOString().split('T')[0]
                    const isVencido = cr.data_vencimento < hoje && !['pago', 'cancelado'].includes(cr._status)
                    const diasAtraso = isVencido ? differenceInDays(new Date(), parseISO(cr.data_vencimento)) : 0

                    const isSelectable = cr._status !== 'pago' && cr._status !== 'cancelado'
                    return (
                      <tr
                        key={cr.id}
                        className={`border-b border-[#f0f0f0] hover:bg-[#fafafa] transition-colors ${selectedIds.has(cr.id) ? 'bg-[#f0f4f8]' : ''}`}
                      >
                        {/* Checkbox */}
                        <td className="px-3 py-3 w-10">
                          {isSelectable && (
                            <input
                              type="checkbox"
                              checked={selectedIds.has(cr.id)}
                              onChange={() => toggleSelect(cr.id)}
                              className="w-4 h-4 rounded border-[#ccc] text-[#1a2e4a] focus:ring-[#1a2e4a] cursor-pointer"
                            />
                          )}
                        </td>
                        {/* Pagador */}
                        <td className="px-4 py-3">
                          <div className="font-semibold text-[#0a0a0a]">{cr.pagador_nome}</div>
                          {cr.pagador_cpf_cnpj && (
                            <div className="text-[11px] text-[#999] mt-0.5">{cr.pagador_cpf_cnpj}</div>
                          )}
                        </td>
                        {/* Tipo */}
                        <td className="px-4 py-3">
                          <span className="inline-block px-2 py-0.5 text-[11px] font-medium text-[#555] bg-[#f5f5f5] border border-[#ddd] rounded">
                            {deriveTipo(cr)}
                          </span>
                        </td>
                        {/* Categoria */}
                        <td className="px-4 py-3 text-[13px] text-[#555]">
                          {cr.conta_contabil_id ? (categoryMap[cr.conta_contabil_id] || '—') : '—'}
                        </td>
                        {/* Vencimento */}
                        <td className="px-4 py-3">
                          <span className={isVencido ? 'text-[#8b0000] font-semibold' : 'text-[#0a0a0a]'}>
                            {formatData(cr.data_vencimento)}
                          </span>
                          {isVencido && diasAtraso > 0 && (
                            <div className="text-[10px] text-[#8b0000] mt-0.5">
                              {diasAtraso} {diasAtraso === 1 ? 'dia' : 'dias'} em atraso
                            </div>
                          )}
                        </td>
                        {/* Valor */}
                        <td className="px-4 py-3 font-medium text-[#0a0a0a]">
                          {formatBRL(cr.valor)}
                        </td>
                        {/* Pago */}
                        <td className="px-4 py-3 text-[#0a5c2e] font-medium">
                          {formatBRL(cr.valor_pago || 0)}
                        </td>
                        {/* Saldo */}
                        <td className="px-4 py-3 font-semibold text-[#0a0a0a]">
                          {formatBRL(saldo)}
                        </td>
                        {/* Status */}
                        <td className="px-4 py-3">
                          <span
                            className="inline-block px-2.5 py-1 text-[11px] font-semibold rounded border"
                            style={{ color: st.text, backgroundColor: st.bg, borderColor: st.border }}
                          >
                            {st.label}
                          </span>
                        </td>
                        {/* Acoes */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {cr._status !== 'pago' && cr._status !== 'cancelado' && (
                              <button
                                onClick={() => setQuitarModal(cr)}
                                className="px-3 py-1.5 text-[11px] font-semibold text-white bg-[#0a5c2e] rounded hover:bg-[#084d25] transition-colors"
                              >
                                Quitar
                              </button>
                            )}
                            {/* Dropdown */}
                            <div className="relative">
                              <button
                                onClick={e => { e.stopPropagation(); setDropdownOpen(dropdownOpen === cr.id ? null : cr.id) }}
                                className="p-1.5 rounded hover:bg-[#f0f0f0] transition-colors"
                              >
                                <MoreHorizontal size={16} className="text-[#555]" />
                              </button>
                              {dropdownOpen === cr.id && (
                                <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-[#ccc] rounded-lg shadow-lg z-50">
                                  <button
                                    onClick={() => { setRenegociarModal(cr); setDropdownOpen(null) }}
                                    className="w-full px-4 py-2.5 text-left text-[13px] text-[#0a0a0a] hover:bg-[#f5f5f5] transition-colors first:rounded-t-lg"
                                  >
                                    Renegociar
                                  </button>
                                  <button
                                    onClick={async () => {
                                      setDropdownOpen(null)
                                      if (!confirm('Cancelar este titulo?')) return
                                      await db.from('contas_receber').update({ status: 'cancelado' }).eq('id', cr.id)
                                      fetchItems()
                                    }}
                                    className="w-full px-4 py-2.5 text-left text-[13px] text-[#8b0000] hover:bg-[#fdecea] transition-colors"
                                  >
                                    Cancelar titulo
                                  </button>
                                  <button
                                    onClick={() => {
                                      setDropdownOpen(null)
                                      alert('Funcionalidade de cobranca manual sera implementada em breve.')
                                    }}
                                    className="w-full px-4 py-2.5 text-left text-[13px] text-[#0a0a0a] hover:bg-[#f5f5f5] transition-colors"
                                  >
                                    Enviar cobranca manual
                                  </button>
                                  <button
                                    onClick={async () => {
                                      setDropdownOpen(null)
                                      if (!confirm(`Excluir este titulo de ${formatBRL(cr.valor)}? Esta acao nao pode ser desfeita.`)) return
                                      const { error } = await db.from('contas_receber').delete().eq('id', cr.id)
                                      if (error) { alert('Erro ao excluir: ' + error.message); return }
                                      fetchItems()
                                    }}
                                    className="w-full px-4 py-2.5 text-left text-[13px] text-[#8b0000] hover:bg-[#fdecea] transition-colors last:rounded-b-lg"
                                  >
                                    Excluir titulo
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ── Modal: Quitar CR ── */}
      {quitarModal && (
        <ModalQuitarCR
          cr={quitarModal}
          bankAccounts={bankAccounts}
          submitting={submitting}
          onClose={() => setQuitarModal(null)}
          onConfirm={async (dados) => {
            setSubmitting(true)
            const result = await quitarCR(quitarModal.id, dados)
            setSubmitting(false)
            if (result.sucesso) {
              setQuitarModal(null)
              fetchItems()
            } else {
              alert('Erro ao quitar: ' + (result.erro || 'Erro desconhecido'))
            }
          }}
        />
      )}

      {/* ── Modal: Novo CR ── */}
      {novoModal && (
        <ModalNovoCR
          companyId={companyId!}
          chartAccounts={chartAccounts}
          centrosCusto={centrosCusto}
          clientes={clientes}
          products={products}
          submitting={submitting}
          onClose={() => setNovoModal(false)}
          onConfirm={async () => {
            setNovoModal(false)
            fetchItems()
          }}
          onClienteAdded={(c: Cliente) => setClientes(prev => [...prev, c])}
        />
      )}

      {/* ── Modal: Renegociar ── */}
      {renegociarModal && (
        <ModalRenegociar
          cr={renegociarModal}
          submitting={submitting}
          onClose={() => setRenegociarModal(null)}
          onConfirm={async (novaData: string) => {
            setSubmitting(true)
            await supabase
              .from('contas_receber')
              .update({ data_vencimento: novaData })
              .eq('id', renegociarModal.id)
            setSubmitting(false)
            setRenegociarModal(null)
            fetchItems()
          }}
        />
      )}

      {/* ── Modal: Quitar em Lote ── */}
      {quitarLoteModal && (
        <ModalQuitarLote
          selectedCrs={items.filter(cr => selectedIds.has(cr.id))}
          bankAccounts={bankAccounts}
          submitting={submitting}
          progress={loteProgress}
          onClose={() => { if (!submitting) { setQuitarLoteModal(false); setLoteProgress({ current: 0, total: 0 }) } }}
          onConfirm={async (dados) => {
            setSubmitting(true)
            const crs = items.filter(cr => selectedIds.has(cr.id))
            setLoteProgress({ current: 0, total: crs.length })
            await new Promise(r => setTimeout(r, 50))

            const BATCH = 100
            let ok = 0, fail = 0

            for (let i = 0; i < crs.length; i += BATCH) {
              const batch = crs.slice(i, i + BATCH)

              // 1. Update all CRs in batch — set as paid (parallel within batch)
              await Promise.all(batch.map(cr => {
                const dataPgto = dados.usarDataVencimento ? cr.data_vencimento : dados.dataPagamento
                return db.from('contas_receber').update({
                  valor_pago: cr.valor,
                  status: 'pago',
                  data_pagamento: dataPgto,
                  forma_recebimento: dados.formaRecebimento,
                }).eq('id', cr.id)
              }))

              // 2. Insert all movimentacoes for this batch at once
              const movsPayload = batch.map(cr => {
                const saldo = cr.valor - (cr.valor_pago || 0)
                const dataPgto = dados.usarDataVencimento ? cr.data_vencimento : dados.dataPagamento
                return {
                  company_id: companyId,
                  conta_bancaria_id: dados.contaBancariaId,
                  conta_contabil_id: cr.conta_contabil_id || null,
                  tipo: 'credito',
                  valor: saldo,
                  data: dataPgto,
                  descricao: `Recebimento — ${cr.pagador_nome}`,
                  origem: 'conta_receber',
                  conta_receber_id: cr.id,
                }
              })

              const { error: movErr } = await db.from('movimentacoes').insert(movsPayload)
              if (movErr) console.error('[quitarLote] movimentacoes batch error:', movErr)

              ok += batch.length
              setLoteProgress({ current: ok, total: crs.length })
              await new Promise(r => setTimeout(r, 0))
            }

            setSubmitting(false)
            setSelectedIds(new Set())
            setQuitarLoteModal(false)
            setLoteProgress({ current: 0, total: 0 })
            fetchItems()

            if (fail > 0) alert(`${ok} quitados com sucesso, ${fail} falharam.`)
          }}
        />
      )}
    </AppLayout>
  )
}

/* ================================================================
   MODAL: QUITAR EM LOTE
   ================================================================ */

function ModalQuitarLote({
  selectedCrs, bankAccounts, submitting, progress, onClose, onConfirm,
}: {
  selectedCrs: CR[]
  bankAccounts: BankAccount[]
  submitting: boolean
  progress: { current: number; total: number }
  onClose: () => void
  onConfirm: (dados: { dataPagamento: string; formaRecebimento: string; contaBancariaId: string; usarDataVencimento: boolean }) => void
}) {
  const [usarDataVencimento, setUsarDataVencimento] = useState(false)
  const [dataPagamento, setDataPagamento] = useState(new Date().toISOString().split('T')[0])
  const [formaRecebimento, setFormaRecebimento] = useState('pix')
  const [contaBancariaId, setContaBancariaId] = useState(bankAccounts[0]?.id || '')

  const totalSaldo = selectedCrs.reduce((sum, cr) => sum + (cr.valor - (cr.valor_pago || 0)), 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-[#0a5c2e] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-white" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Quitar em Lote</h2>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white" disabled={submitting}>
            <X size={18} />
          </button>
        </div>

        {/* Summary */}
        <div className="px-6 py-4 bg-[#e6f4ec] border-b border-[#c3e6d1]">
          <div className="flex justify-between text-sm">
            <span className="text-[#0a5c2e] font-semibold">{selectedCrs.length} titulo{selectedCrs.length !== 1 ? 's' : ''} selecionado{selectedCrs.length !== 1 ? 's' : ''}</span>
            <span className="text-[#0a5c2e] font-bold">{formatBRL(totalSaldo)}</span>
          </div>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-[#555] uppercase tracking-wide mb-1">Conta bancaria destino *</label>
            <select
              value={contaBancariaId}
              onChange={e => setContaBancariaId(e.target.value)}
              className="w-full px-3 py-2 border border-[#ccc] rounded-md text-[13px] bg-white focus:outline-none focus:border-[#0a5c2e]"
              disabled={submitting}
            >
              <option value="">Selecione...</option>
              {bankAccounts.map(ba => (
                <option key={ba.id} value={ba.id}>{ba.nome} ({ba.banco})</option>
              ))}
            </select>
          </div>
          {/* Data pagamento mode */}
          <div>
            <label className="block text-[11px] font-bold text-[#555] uppercase tracking-wide mb-1">Data pagamento</label>
            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={() => setUsarDataVencimento(false)}
                disabled={submitting}
                className={`flex-1 px-3 py-2 text-[12px] font-semibold rounded-md border transition-colors ${!usarDataVencimento ? 'bg-[#0a5c2e] text-white border-[#0a5c2e]' : 'bg-white text-[#555] border-[#ccc] hover:bg-[#f5f5f5]'}`}
              >
                Data fixa
              </button>
              <button
                type="button"
                onClick={() => setUsarDataVencimento(true)}
                disabled={submitting}
                className={`flex-1 px-3 py-2 text-[12px] font-semibold rounded-md border transition-colors ${usarDataVencimento ? 'bg-[#0a5c2e] text-white border-[#0a5c2e]' : 'bg-white text-[#555] border-[#ccc] hover:bg-[#f5f5f5]'}`}
              >
                Na data de vencimento
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              {!usarDataVencimento ? (
                <input
                  type="date"
                  value={dataPagamento}
                  onChange={e => setDataPagamento(e.target.value)}
                  className="w-full px-3 py-2 border border-[#ccc] rounded-md text-[13px] focus:outline-none focus:border-[#0a5c2e]"
                  disabled={submitting}
                />
              ) : (
                <div className="w-full px-3 py-2 border border-[#ccc] rounded-md text-[12px] text-[#555] bg-[#f9f9f9]">
                  Cada titulo sera quitado na sua data de vencimento
                </div>
              )}
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[#555] uppercase tracking-wide mb-1">Forma recebimento</label>
              <select
                value={formaRecebimento}
                onChange={e => setFormaRecebimento(e.target.value)}
                className="w-full px-3 py-2 border border-[#ccc] rounded-md text-[13px] bg-white focus:outline-none focus:border-[#0a5c2e]"
                disabled={submitting}
              >
                <option value="pix">PIX</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="transferencia">Transferência</option>
                <option value="cartao_debito">Cartão débito</option>
                <option value="cartao_credito">Cartão crédito</option>
                <option value="boleto">Boleto</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>
          </div>

          {/* Progress */}
          {submitting && progress.total > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-[#0a5c2e]">
                  Quitando... {progress.current} de {progress.total}
                </span>
                <span className="text-xs font-bold text-[#0a5c2e]">
                  {Math.round((progress.current / progress.total) * 100)}%
                </span>
              </div>
              <div className="w-full h-2.5 bg-[#e5e7eb] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#0a5c2e] rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[#eee] px-6 py-4 flex justify-end gap-3 bg-[#fafafa]">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-[#555] border border-[#ccc] rounded-md hover:bg-[#f5f5f5] transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm({ dataPagamento, formaRecebimento, contaBancariaId, usarDataVencimento })}
            disabled={submitting || !contaBancariaId || (!usarDataVencimento && !dataPagamento)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-[#0a5c2e] rounded-md hover:bg-[#084d25] transition-colors disabled:opacity-50"
          >
            {submitting ? (
              <><Loader2 size={14} className="animate-spin" /> Quitando...</>
            ) : (
              <><CheckCircle2 size={14} /> Quitar {selectedCrs.length} titulo{selectedCrs.length !== 1 ? 's' : ''}</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ================================================================
   KPI CARD
   ================================================================ */

function KpiCard({
  icon, label, value, color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color: { text: string; bg: string; border: string; icon: string }
}) {
  return (
    <div
      className="rounded-lg border p-4 flex items-center gap-4"
      style={{ borderColor: color.border, backgroundColor: color.bg }}
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: color.border + '18' }}
      >
        <span style={{ color: color.icon }}>{icon}</span>
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: color.text }}>
          {label}
        </p>
        <p className="text-lg font-bold mt-0.5" style={{ color: color.text }}>
          {value}
        </p>
      </div>
    </div>
  )
}

/* ================================================================
   MODAL OVERLAY
   ================================================================ */

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div
        className="bg-white rounded-xl border border-[#ccc] shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="bg-[#1a2e4a] px-5 py-3 flex items-center justify-between rounded-t-xl">
      <h3 className="text-[12px] font-bold text-white uppercase tracking-widest">{title}</h3>
      <button onClick={onClose} className="text-[#a8bfd4] hover:text-white transition-colors">
        <X size={18} />
      </button>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-semibold text-[#555] uppercase tracking-wide mb-1">
      {children}
    </label>
  )
}

const inputCls =
  'w-full px-3 py-2 border border-[#ccc] rounded-md text-[13px] text-[#0a0a0a] bg-white focus:outline-none focus:border-[#1a2e4a] focus:ring-1 focus:ring-[#1a2e4a] disabled:bg-[#f5f5f5] disabled:text-[#999]'

/* ================================================================
   MODAL: QUITAR CR
   ================================================================ */

function ModalQuitarCR({
  cr,
  bankAccounts,
  submitting,
  onClose,
  onConfirm,
}: {
  cr: CR
  bankAccounts: BankAccount[]
  submitting: boolean
  onClose: () => void
  onConfirm: (dados: {
    valorPago: number
    dataPagamento: string
    formaRecebimento: string
    contaBancariaId: string
    juros?: number
    desconto?: number
  }) => void
}) {
  const saldo = cr.valor - (cr.valor_pago || 0)
  const [valorRecebido, setValorRecebido] = useState(saldo.toFixed(2))
  const [dataRecebimento, setDataRecebimento] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [formaRecebimento, setFormaRecebimento] = useState('PIX')
  const [contaBancariaId, setContaBancariaId] = useState(bankAccounts[0]?.id || '')
  const [juros, setJuros] = useState('')
  const [desconto, setDesconto] = useState('')
  const [observacao, setObservacao] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const v = parseFloat(valorRecebido)
    if (!v || v <= 0) return alert('Informe um valor valido.')
    if (!contaBancariaId) return alert('Selecione a conta bancaria.')
    onConfirm({
      valorPago: v,
      dataPagamento: dataRecebimento,
      formaRecebimento,
      contaBancariaId,
      juros: juros ? parseFloat(juros) : undefined,
      desconto: desconto ? parseFloat(desconto) : undefined,
    })
  }

  return (
    <ModalOverlay onClose={onClose}>
      <ModalHeader title="Quitar conta a receber" onClose={onClose} />
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        {/* Saldo devedor badge */}
        <div
          className="flex items-center gap-2 px-4 py-3 rounded-lg border"
          style={{ backgroundColor: '#f0f4f8', borderColor: '#1a2e4a' }}
        >
          <DollarSign size={16} className="text-[#1a2e4a]" />
          <div>
            <span className="text-[10px] font-bold text-[#1a2e4a] uppercase tracking-widest">Saldo devedor</span>
            <p className="text-lg font-bold text-[#1a2e4a]">{formatBRL(saldo)}</p>
          </div>
        </div>

        {/* Pagador info */}
        <div className="text-[13px] text-[#555]">
          Pagador: <span className="font-semibold text-[#0a0a0a]">{cr.pagador_nome}</span>
        </div>

        {/* Valor recebido */}
        <div>
          <FieldLabel>Valor recebido *</FieldLabel>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={valorRecebido}
            onChange={e => setValorRecebido(e.target.value)}
            className={inputCls}
            required
          />
        </div>

        {/* Data recebimento */}
        <div>
          <FieldLabel>Data recebimento *</FieldLabel>
          <input
            type="date"
            value={dataRecebimento}
            onChange={e => setDataRecebimento(e.target.value)}
            className={inputCls}
            required
          />
        </div>

        {/* Forma recebimento */}
        <div>
          <FieldLabel>Forma de recebimento *</FieldLabel>
          <select
            value={formaRecebimento}
            onChange={e => setFormaRecebimento(e.target.value)}
            className={inputCls}
            required
          >
            {FORMAS_RECEBIMENTO.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

        {/* Conta bancaria */}
        <div>
          <FieldLabel>Conta bancaria *</FieldLabel>
          <select
            value={contaBancariaId}
            onChange={e => setContaBancariaId(e.target.value)}
            className={inputCls}
            required
          >
            <option value="">Selecione...</option>
            {bankAccounts.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        {/* Juros / Desconto */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Juros / Multa</FieldLabel>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0,00"
              value={juros}
              onChange={e => setJuros(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <FieldLabel>Desconto</FieldLabel>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0,00"
              value={desconto}
              onChange={e => setDesconto(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        {/* Observacao */}
        <div>
          <FieldLabel>Observacao</FieldLabel>
          <textarea
            value={observacao}
            onChange={e => setObservacao(e.target.value)}
            rows={2}
            className={inputCls + ' resize-none'}
            placeholder="Opcional..."
          />
        </div>

        {/* Recibo badge */}
        <div
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg border text-[12px] font-medium"
          style={{ backgroundColor: '#e6f4ec', borderColor: '#0a5c2e', color: '#0a5c2e' }}
        >
          <CheckCircle2 size={14} />
          Recibo sera gerado e enviado automaticamente por e-mail ao pagador
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-[13px] font-semibold text-[#555] border border-[#ccc] rounded-lg hover:bg-[#f5f5f5] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 text-[13px] font-semibold text-white bg-[#0a5c2e] rounded-lg hover:bg-[#084d25] transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            Confirmar recebimento
          </button>
        </div>
      </form>
    </ModalOverlay>
  )
}

/* ================================================================
   MODAL: NOVO CR
   ================================================================ */

function ModalNovoCR({
  companyId,
  chartAccounts,
  centrosCusto,
  clientes,
  products,
  submitting: parentSubmitting,
  onClose,
  onConfirm,
  onClienteAdded,
}: {
  companyId: string
  chartAccounts: ChartAccount[]
  centrosCusto: CentroCusto[]
  clientes: Cliente[]
  products: Product[]
  submitting: boolean
  onClose: () => void
  onConfirm: () => void
  onClienteAdded: (c: Cliente) => void
}) {
  const [tipo, setTipo] = useState('unica')
  const [pagadorNome, setPagadorNome] = useState('')
  const [pagadorCpfCnpj, setPagadorCpfCnpj] = useState('')
  const [pagadorEmail, setPagadorEmail] = useState('')
  const [valor, setValor] = useState('')
  const [vencimento, setVencimento] = useState('')
  const [numParcelas, setNumParcelas] = useState('2')
  const [contaContabilId, setContaContabilId] = useState('')
  const [centroCustoId, setCentroCustoId] = useState('')
  const [descricao, setDescricao] = useState('')
  const [saving, setSaving] = useState(false)

  // Client search
  const [clienteSearch, setClienteSearch] = useState('')
  const [clienteDropdownOpen, setClienteDropdownOpen] = useState(false)
  const [showNovoCliente, setShowNovoCliente] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novoCpf, setNovoCpf] = useState('')
  const [novoEmail, setNovoEmail] = useState('')
  const clienteRef = useRef<HTMLDivElement>(null)

  const formatDoc = (d: string | null) => {
    if (!d) return ''
    const c = d.replace(/\D/g, '')
    return c.length <= 11 ? formatCPF(c) : formatCNPJ(c)
  }

  const clientesFiltrados = useMemo(() => {
    if (!clienteSearch.trim()) return clientes.slice(0, 20)
    const t = clienteSearch.toLowerCase()
    return clientes.filter(c =>
      (c.nome_fantasia || '').toLowerCase().includes(t) ||
      c.razao_social.toLowerCase().includes(t) ||
      (c.cpf_cnpj || '').includes(t)
    ).slice(0, 20)
  }, [clientes, clienteSearch])

  function selectCliente(c: Cliente) {
    setPagadorNome(c.nome_fantasia || c.razao_social)
    setPagadorCpfCnpj(c.cpf_cnpj || '')
    setPagadorEmail(c.email || '')
    setClienteSearch(c.nome_fantasia || c.razao_social)
    setClienteDropdownOpen(false)
  }

  async function salvarNovoCliente() {
    if (!novoNome.trim()) return
    try {
      const { data, error } = await db.from('clients').insert({
        company_id: companyId,
        razao_social: novoNome.trim(),
        cpf_cnpj: novoCpf.replace(/\D/g, '') || null,
        email: novoEmail.trim() || null,
        is_active: true,
      }).select().single()
      if (error) throw error
      const nc: Cliente = data
      onClienteAdded(nc)
      selectCliente(nc)
      setShowNovoCliente(false)
      setNovoNome(''); setNovoCpf(''); setNovoEmail('')
    } catch (e: any) {
      alert('Erro ao cadastrar cliente: ' + (e.message || ''))
    }
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (clienteRef.current && !clienteRef.current.contains(e.target as Node)) setClienteDropdownOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const v = parseFloat(valor)
    if (!v || v <= 0) return alert('Informe o valor.')
    if (!vencimento) return alert('Informe o vencimento.')
    if (!pagadorNome.trim()) return alert('Informe o nome do pagador.')

    setSaving(true)

    try {
      if (tipo === 'parcelado') {
        const n = parseInt(numParcelas) || 2
        const valorParcela = Math.round((v / n) * 100) / 100
        const records = []
        for (let i = 0; i < n; i++) {
          const dataVenc = format(addDays(parseISO(vencimento), i * 30), 'yyyy-MM-dd')
          records.push({
            company_id: companyId,
            pagador_nome: pagadorNome.trim(),
            pagador_cpf_cnpj: pagadorCpfCnpj.trim() || null,
            pagador_email: pagadorEmail.trim() || null,
            valor: i === n - 1 ? Math.round((v - valorParcela * (n - 1)) * 100) / 100 : valorParcela,
            valor_pago: 0,
            data_vencimento: dataVenc,
            status: 'aberto',
            conta_contabil_id: contaContabilId || null,
            centro_custo_id: centroCustoId || null,
            observacoes: descricao ? `${descricao} (${i + 1}/${n})` : `Parcela ${i + 1}/${n}`,
          })
        }
        const { error } = await db.from('contas_receber').insert(records)
        if (error) throw error
      } else {
        const { error } = await db.from('contas_receber').insert({
          company_id: companyId,
          pagador_nome: pagadorNome.trim(),
          pagador_cpf_cnpj: pagadorCpfCnpj.trim() || null,
          pagador_email: pagadorEmail.trim() || null,
          valor: v,
          valor_pago: 0,
          data_vencimento: vencimento,
          status: 'aberto',
          conta_contabil_id: contaContabilId || null,
          centro_custo_id: centroCustoId || null,
          observacoes: descricao || null,
        })
        if (error) throw error
      }

      onConfirm()
    } catch (err: any) {
      console.error('[NovoCR]', err)
      alert('Erro ao criar titulo: ' + (err.message || 'Erro desconhecido'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <ModalHeader title="Novo titulo a receber" onClose={onClose} />
      <form onSubmit={handleSubmit} className="p-5 space-y-4">

        {/* Tipo - cards */}
        <div>
          <FieldLabel>Tipo de titulo</FieldLabel>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
            {TIPO_TITULO_OPTIONS.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTipo(t.value)}
                className={`px-3 py-2.5 rounded-lg border text-[12px] font-semibold text-center transition-colors ${
                  tipo === t.value
                    ? 'border-[#1a2e4a] bg-[#f0f4f8] text-[#1a2e4a]'
                    : 'border-[#ccc] bg-white text-[#555] hover:bg-[#fafafa]'
                }`}
              >
                <span className="block text-[16px] mb-0.5">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Pagador — searchable client dropdown */}
        <div className="space-y-3">
          <div ref={clienteRef} className="relative">
            <FieldLabel>Pagador *</FieldLabel>
            <input
              type="text"
              value={clienteSearch}
              onChange={e => { setClienteSearch(e.target.value); setClienteDropdownOpen(true) }}
              onFocus={() => setClienteDropdownOpen(true)}
              className={inputCls}
              placeholder="Buscar cliente por nome ou CPF/CNPJ..."
              autoComplete="off"
            />
            {/* Hidden required field to enforce selection */}
            <input type="hidden" value={pagadorNome} required />

            {clienteDropdownOpen && (
              <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-[#ccc] rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {clientesFiltrados.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selectCliente(c)}
                    className="w-full text-left px-3 py-2 hover:bg-[#f0f4f8] border-b border-[#eee] last:border-0"
                  >
                    <div className="text-[13px] font-semibold text-[#0a0a0a]">
                      {c.nome_fantasia || c.razao_social}
                    </div>
                    {c.cpf_cnpj && (
                      <div className="text-[11px] text-[#999]">{formatDoc(c.cpf_cnpj)}</div>
                    )}
                  </button>
                ))}
                {clientesFiltrados.length === 0 && (
                  <div className="px-3 py-2 text-[12px] text-[#999]">Nenhum cliente encontrado</div>
                )}
                <button
                  type="button"
                  onClick={() => setShowNovoCliente(true)}
                  className="w-full text-left px-3 py-2 text-[13px] font-semibold text-[#1a2e4a] hover:bg-[#f0f4f8] flex items-center gap-2 border-t border-[#ccc]"
                >
                  <UserPlus size={14} /> + Adicionar cliente
                </button>
              </div>
            )}
          </div>

          {/* Novo cliente inline modal */}
          {showNovoCliente && (
            <div className="border border-[#1a2e4a] rounded-lg p-3 bg-[#f0f4f8] space-y-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12px] font-bold text-[#1a2e4a] uppercase tracking-wider">Novo cliente</span>
                <button type="button" onClick={() => setShowNovoCliente(false)}><X size={14} className="text-[#999]" /></button>
              </div>
              <input
                type="text"
                value={novoNome}
                onChange={e => setNovoNome(e.target.value)}
                className={inputCls}
                placeholder="Razao social / Nome *"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={novoCpf}
                  onChange={e => setNovoCpf(e.target.value)}
                  className={inputCls}
                  placeholder="CPF / CNPJ"
                />
                <input
                  type="email"
                  value={novoEmail}
                  onChange={e => setNovoEmail(e.target.value)}
                  className={inputCls}
                  placeholder="E-mail"
                />
              </div>
              <button
                type="button"
                onClick={salvarNovoCliente}
                className="px-4 py-1.5 text-[12px] font-semibold text-white bg-[#1a2e4a] rounded-lg hover:bg-[#15253d]"
              >
                Salvar cliente
              </button>
            </div>
          )}

          {/* Show selected client info */}
          {pagadorNome && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>CPF / CNPJ</FieldLabel>
                <input
                  type="text"
                  value={pagadorCpfCnpj}
                  onChange={e => setPagadorCpfCnpj(e.target.value)}
                  className={inputCls}
                  placeholder="000.000.000-00"
                />
              </div>
              <div>
                <FieldLabel>E-mail</FieldLabel>
                <input
                  type="email"
                  value={pagadorEmail}
                  onChange={e => setPagadorEmail(e.target.value)}
                  className={inputCls}
                  placeholder="email@exemplo.com"
                />
              </div>
            </div>
          )}
        </div>

        {/* Valor / Vencimento */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Valor *</FieldLabel>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={valor}
              onChange={e => setValor(e.target.value)}
              className={inputCls}
              placeholder="0,00"
              required
            />
          </div>
          <div>
            <FieldLabel>Vencimento *</FieldLabel>
            <input
              type="date"
              value={vencimento}
              onChange={e => setVencimento(e.target.value)}
              className={inputCls}
              required
            />
          </div>
        </div>

        {/* Parcelas (only for parcelado) */}
        {tipo === 'parcelado' && (
          <div>
            <FieldLabel>Numero de parcelas</FieldLabel>
            <input
              type="number"
              min="2"
              max="120"
              value={numParcelas}
              onChange={e => setNumParcelas(e.target.value)}
              className={inputCls}
            />
            <p className="text-[11px] text-[#999] mt-1">
              Valor por parcela: {formatBRL(parseFloat(valor || '0') / (parseInt(numParcelas) || 2))}
            </p>
          </div>
        )}

        {/* Conta contabil / Centro de custo */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Conta contabil</FieldLabel>
            <select
              value={contaContabilId}
              onChange={e => setContaContabilId(e.target.value)}
              className={inputCls}
            >
              <option value="">Nenhuma</option>
              {chartAccounts.map(c => (
                <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>Centro de custo</FieldLabel>
            <select
              value={centroCustoId}
              onChange={e => setCentroCustoId(e.target.value)}
              className={inputCls}
            >
              <option value="">Nenhum</option>
              {centrosCusto.map(c => (
                <option key={c.id} value={c.id}>{c.codigo} - {c.descricao}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Descricao (Produto/Servico do Operacional) */}
        <div>
          <FieldLabel>Descricao (Produto/Servico)</FieldLabel>
          <select
            value={descricao}
            onChange={e => setDescricao(e.target.value)}
            className={inputCls}
          >
            <option value="">Selecione um produto/servico...</option>
            {products.map(p => (
              <option key={p.id} value={p.description}>
                {p.code ? `${p.code} - ` : ''}{p.description}
              </option>
            ))}
          </select>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-[13px] font-semibold text-[#555] border border-[#ccc] rounded-lg hover:bg-[#f5f5f5] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 text-[13px] font-semibold text-white bg-[#1a2e4a] rounded-lg hover:bg-[#15253d] transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {tipo === 'parcelado' ? `Criar ${parseInt(numParcelas) || 2} parcelas` : 'Criar titulo'}
          </button>
        </div>
      </form>
    </ModalOverlay>
  )
}

/* ================================================================
   MODAL: RENEGOCIAR
   ================================================================ */

function ModalRenegociar({
  cr,
  submitting,
  onClose,
  onConfirm,
}: {
  cr: CR
  submitting: boolean
  onClose: () => void
  onConfirm: (novaData: string) => void
}) {
  const [novaData, setNovaData] = useState(cr.data_vencimento)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!novaData) return alert('Informe a nova data de vencimento.')
    if (novaData === cr.data_vencimento) return alert('Selecione uma data diferente da atual.')
    onConfirm(novaData)
  }

  return (
    <ModalOverlay onClose={onClose}>
      <ModalHeader title="Renegociar titulo" onClose={onClose} />
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        {/* Info */}
        <div className="text-[13px] text-[#555] space-y-1">
          <p>Pagador: <span className="font-semibold text-[#0a0a0a]">{cr.pagador_nome}</span></p>
          <p>Valor: <span className="font-semibold text-[#0a0a0a]">{formatBRL(cr.valor)}</span></p>
          <p>Vencimento atual: <span className="font-semibold text-[#0a0a0a]">{formatData(cr.data_vencimento)}</span></p>
        </div>

        <div>
          <FieldLabel>Nova data de vencimento *</FieldLabel>
          <input
            type="date"
            value={novaData}
            onChange={e => setNovaData(e.target.value)}
            className={inputCls}
            required
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-[13px] font-semibold text-[#555] border border-[#ccc] rounded-lg hover:bg-[#f5f5f5] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 text-[13px] font-semibold text-white bg-[#1a2e4a] rounded-lg hover:bg-[#15253d] transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            Confirmar renegociacao
          </button>
        </div>
      </form>
    </ModalOverlay>
  )
}
