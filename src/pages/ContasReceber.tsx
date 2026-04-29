import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useCompany } from '@/contexts/CompanyContext'
import { safeQuery } from '@/lib/supabaseQuery'
import { formatBRL, formatData, formatCPF, formatCNPJ } from '@/lib/format'
import { quitarCR } from '@/lib/financeiro/transacao'
import { AppLayout } from '@/components/layout/AppLayout'
import { TableSkeleton } from '@/components/ui/page-skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { TablePagination } from '@/components/ui/table-pagination'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  addDays, differenceInDays, parseISO, startOfMonth, endOfMonth, format,
} from 'date-fns'
import {
  Search, Plus, DollarSign, Clock, AlertTriangle, CheckCircle2,
  MoreHorizontal, X, ChevronDown, ChevronUp, Loader2, UserPlus, Copy,
} from 'lucide-react'
import { toast } from 'sonner'

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
      return { label: 'Em aberto', text: '#059669', bg: '#ECFDF4', border: '#059669' }
    case 'vencido':
      return { label: 'Vencido', text: '#E53E3E', bg: '#FEE2E2', border: '#E53E3E' }
    case 'parcial':
      return { label: 'Parcial', text: '#EA580C', bg: '#FFF0EB', border: '#EA580C' }
    case 'pago':
      return { label: 'Pago', text: '#039855', bg: '#ECFDF3', border: '#039855' }
    default:
      return { label: status, text: '#555', bg: '#FFFFFF', border: '#ccc' }
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
  const confirm = useConfirm()

  // ── Data ──
  const [items, setItems] = useState<CR[]>([])
  const [loading, setLoading] = useState(true)
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([])
  const [centrosCusto, setCentrosCusto] = useState<CentroCusto[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [products, setProducts] = useState<Product[]>([])

  // ── Pagination ──
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 30

  // ── Filters ──
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  const [selectedAgendaDate, setSelectedAgendaDate] = useState<string | null>(null)

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

  useEffect(() => { setPage(0) }, [search, statusFilter, dateFrom, dateTo])

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
    let countAberto = 0
    let vencendo7d = 0
    let countVencendo = 0
    let totalVencido = 0
    let countVencido = 0
    let recebidoMes = 0
    let countRecebido = 0

    for (const cr of enrichedItems) {
      const saldo = cr.valor - (cr.valor_pago || 0)
      const st = cr._status

      if (['aberto', 'parcial', 'vencido'].includes(st)) {
        totalAberto += saldo
        countAberto += 1
      }
      if (st === 'aberto' && cr.data_vencimento >= hoje && cr.data_vencimento <= em7dias) {
        vencendo7d += saldo
        countVencendo += 1
      }
      if (cr.data_vencimento < hoje && ['aberto', 'parcial'].includes(st)) {
        totalVencido += saldo
        countVencido += 1
      }
      if (cr.data_pagamento && cr.data_pagamento >= mesInicio && cr.data_pagamento <= mesFim) {
        recebidoMes += (cr.valor_pago || 0)
        countRecebido += 1
      }
    }

    return {
      totalAberto, countAberto,
      vencendo7d, countVencendo,
      totalVencido, countVencido,
      recebidoMes, countRecebido,
    }
  }, [enrichedItems])

  // ─── Agenda 30 dias (heatmap estilo GitHub) ─────────────────────
  const agenda30 = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const startDate = addDays(today, -15)
    const days: { date: Date; dateStr: string; value: number; count: number; isPast: boolean; hasOverdue: boolean }[] = []
    const byDay: Record<string, { value: number; count: number; hasOverdue: boolean }> = {}

    for (const cr of enrichedItems) {
      if (cr._status === 'pago' || cr._status === 'cancelado') continue
      const key = cr.data_vencimento
      if (!key) continue
      const venc = parseISO(key)
      venc.setHours(0, 0, 0, 0)
      const diff = differenceInDays(venc, today)
      if (diff < -15 || diff > 14) continue
      const pendente = Number(cr.valor || 0) - Number(cr.valor_pago || 0)
      if (pendente <= 0) continue
      if (!byDay[key]) byDay[key] = { value: 0, count: 0, hasOverdue: false }
      byDay[key].value += pendente
      byDay[key].count += 1
      if (venc < today) byDay[key].hasOverdue = true
    }

    for (let i = 0; i < 30; i++) {
      const d = addDays(startDate, i)
      const dateStr = format(d, 'yyyy-MM-dd')
      const b = byDay[dateStr]
      days.push({
        date: d,
        dateStr,
        value: b?.value || 0,
        count: b?.count || 0,
        isPast: d < today,
        hasOverdue: b?.hasOverdue || false,
      })
    }

    const vals = days.map(x => x.value).filter(v => v > 0)
    const max = vals.length ? Math.max(...vals) : 0
    const total = days.reduce((s, x) => s + x.value, 0)
    const totalVencido = days.filter(d => d.hasOverdue).reduce((s, d) => s + d.value, 0)
    const diasComEntrada = days.filter(d => d.value > 0).length
    const diasVencidos = days.filter(d => d.hasOverdue).length

    const weeks: (typeof days[number] | null)[][] = []
    let col: (typeof days[number] | null)[] = Array(7).fill(null)
    days.forEach((day, idx) => {
      const dow = day.date.getDay()
      col[dow] = day
      if (dow === 6 || idx === days.length - 1) {
        weeks.push(col)
        col = Array(7).fill(null)
      }
    })

    const monthLabels: { weekIndex: number; label: string }[] = []
    let lastMonth = -1
    weeks.forEach((week, i) => {
      const firstDay = week.find((x): x is typeof days[number] => x !== null)
      if (!firstDay) return
      const m = firstDay.date.getMonth()
      if (m !== lastMonth) {
        monthLabels.push({
          weekIndex: i,
          label: format(firstDay.date, 'MMM').replace(/^./, c => c.toUpperCase()),
        })
        lastMonth = m
      }
    })

    return { days, weeks, max, total, totalVencido, diasComEntrada, diasVencidos, monthLabels }
  }, [enrichedItems])

  // Lista de recebimentos para o painel lateral da agenda
  const agendaDiaLista = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const inicio = addDays(today, -15)
    const fim = addDays(today, 14)
    const result: (typeof enrichedItems[number] & { _pendente: number })[] = []
    for (const cr of enrichedItems) {
      if (cr._status === 'pago' || cr._status === 'cancelado') continue
      if (!cr.data_vencimento) continue
      const venc = parseISO(cr.data_vencimento)
      venc.setHours(0, 0, 0, 0)
      if (venc < inicio || venc > fim) continue
      const pendente = Number(cr.valor || 0) - Number(cr.valor_pago || 0)
      if (pendente <= 0) continue
      if (selectedAgendaDate && cr.data_vencimento !== selectedAgendaDate) continue
      result.push({ ...cr, _pendente: pendente })
    }
    result.sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento) || b._pendente - a._pendente)
    return result
  }, [enrichedItems, selectedAgendaDate])

  const agendaDiaTotal = useMemo(
    () => agendaDiaLista.reduce((s, cr) => s + cr._pendente, 0),
    [agendaDiaLista]
  )

  const agendaColor = (value: number, max: number, isOverdue: boolean) => {
    if (value === 0 || max === 0) return '#F3F4F6'
    const r = value / max
    if (isOverdue) {
      if (r < 0.25) return '#FED7AA'
      if (r < 0.5) return '#FDBA74'
      if (r < 0.75) return '#F97316'
      return '#C2410C'
    }
    if (r < 0.25) return '#BBF7D0'
    if (r < 0.5) return '#86EFAC'
    if (r < 0.75) return '#22C55E'
    return '#15803D'
  }

  /* ================================================================
     RENDER
     ================================================================ */

  return (
    <AppLayout title="Contas a Receber">
      <div className="p-6 max-w-[1400px] mx-auto space-y-6">


        {/* ── KPI Cards (padrão Vendas) ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              label: 'Total em aberto',
              value: formatBRL(kpis.totalAberto),
              color: '#1D2939',
              sub: `${kpis.countAberto} título${kpis.countAberto !== 1 ? 's' : ''} em aberto`,
            },
            {
              label: 'Vencendo em 7 dias',
              value: formatBRL(kpis.vencendo7d),
              color: '#EA580C',
              sub: `${kpis.countVencendo} título${kpis.countVencendo !== 1 ? 's' : ''} a vencer`,
            },
            {
              label: 'Vencidos',
              value: formatBRL(kpis.totalVencido),
              color: '#7F1D1D',
              sub: `${kpis.countVencido} título${kpis.countVencido !== 1 ? 's' : ''} em atraso`,
            },
            {
              label: 'Recebido no mês',
              value: formatBRL(kpis.recebidoMes),
              color: '#039855',
              sub: `${kpis.countRecebido} recebimento${kpis.countRecebido !== 1 ? 's' : ''} no período`,
            },
          ].map(kpi => (
            <div
              key={kpi.label}
              className="bg-white border border-[#EAECF0] rounded-xl px-4 py-3 min-w-0"
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)' }}
            >
              <p className="text-[11.5px] font-bold uppercase tracking-[0.04em] text-black m-0 whitespace-nowrap">{kpi.label}</p>
              <p
                className="mt-1.5 font-extrabold truncate"
                style={{ fontSize: 18, color: kpi.color, letterSpacing: '-0.02em', lineHeight: 1.15 }}
              >
                {kpi.value}
              </p>
              <p className="text-[11px] text-[#98A2B3] mt-1 truncate">{kpi.sub}</p>
            </div>
          ))}
        </div>

        {/* ── Agenda 30d (esquerda) + Contas a receber do dia (direita) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Agenda heatmap */}
          <div className="bg-white border border-[#EAECF0] rounded-xl overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#EAECF0]">
              <div>
                <div className="text-[20px] font-extrabold text-[#1D2939] tracking-[-0.02em]">Agenda de Recebimentos</div>
                <div className="text-[12px] text-[#98A2B3] mt-1">
                  Pr&oacute;ximos 30 dias &middot; {agenda30.diasComEntrada} dia{agenda30.diasComEntrada !== 1 ? 's' : ''} com entrada
                  {agenda30.diasVencidos > 0 && (
                    <span className="text-[#C2410C] font-semibold"> &middot; {agenda30.diasVencidos} em atraso</span>
                  )}
                  &middot; clique em um dia
                </div>
              </div>
              <div className="flex items-center gap-3 text-[10.5px] text-[#98A2B3]">
                <div className="flex items-center gap-1">
                  <span style={{ width: 10, height: 10, background: '#22C55E', borderRadius: 2 }} />
                  A receber
                </div>
                <div className="flex items-center gap-1">
                  <span style={{ width: 10, height: 10, background: '#F97316', borderRadius: 2 }} />
                  Vencida
                </div>
              </div>
            </div>
            <div className="px-5 py-5">
              <div className="flex gap-2">
                {/* Day-of-week labels */}
                <div className="flex flex-col gap-1.5 text-[11px] text-[#98A2B3]" style={{ paddingTop: 22 }}>
                  {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'S\u00e1b'].map(d => (
                    <div key={d} style={{ height: 32, display: 'flex', alignItems: 'center' }}>{d}</div>
                  ))}
                </div>
                {/* Weeks */}
                <div className="flex flex-col flex-1 min-w-0">
                  {/* Month labels row */}
                  <div className="flex gap-1.5 mb-1" style={{ height: 14 }}>
                    {agenda30.weeks.map((_, wi) => {
                      const monthAtCol = agenda30.monthLabels.find(m => m.weekIndex === wi)
                      return (
                        <div key={wi} className="flex-1" style={{ fontSize: 11, fontWeight: 600, color: '#667085', marginLeft: wi > 0 && agenda30.monthLabels.some(m => m.weekIndex === wi) ? 6 : 0 }}>
                          {monthAtCol?.label || ''}
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex gap-1.5">
                    {agenda30.weeks.map((week, wi) => (
                      <div key={wi} className="flex flex-col gap-1.5 flex-1 min-w-0" style={{ marginLeft: wi > 0 && agenda30.monthLabels.some(m => m.weekIndex === wi) ? 6 : 0 }}>
                        {week.map((day, di) => day ? (
                          <button
                            key={di}
                            type="button"
                            onClick={() => day.value > 0 ? setSelectedAgendaDate(d => d === day.dateStr ? null : day.dateStr) : undefined}
                            title={`${format(day.date, 'dd/MM')}${day.value > 0 ? ` \u00b7 ${formatBRL(day.value)} \u00b7 ${day.count} t\u00edtulo${day.count !== 1 ? 's' : ''}${day.hasOverdue ? ' (vencido sem baixa)' : ''}` : ' \u00b7 sem recebimentos'}`}
                            className={day.value > 0 ? 'transition-transform hover:scale-110' : ''}
                            style={{
                              width: '100%', aspectRatio: '1 / 1', maxWidth: 40, minHeight: 32, height: 32, borderRadius: 6,
                              background: agendaColor(day.value, agenda30.max, day.hasOverdue),
                              border: selectedAgendaDate === day.dateStr
                                ? '2px solid #1D2939'
                                : format(day.date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
                                ? '2px solid #059669'
                                : day.value === 0 ? '1px solid #EAECF0' : 'none',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 11, fontWeight: 700,
                              color: day.value === 0 ? '#98A2B3' : (day.value / (agenda30.max || 1)) >= 0.5 ? '#fff' : (day.hasOverdue ? '#7C2D12' : '#14532D'),
                              cursor: day.value > 0 ? 'pointer' : 'default',
                            }}
                          >
                            {format(day.date, 'd')}
                          </button>
                        ) : (
                          <div key={di} style={{ aspectRatio: '1 / 1', minHeight: 32, height: 32 }} />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {/* Rodapé com totais */}
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#EAECF0]">
                <div className="flex flex-col">
                  <span className="text-[10.5px] text-[#98A2B3] font-semibold uppercase tracking-wide">Total previsto (30d)</span>
                  <span className="text-[16px] font-extrabold text-[#039855] tracking-[-0.01em] tabular-nums">{formatBRL(agenda30.total)}</span>
                </div>
                {agenda30.totalVencido > 0 && (
                  <div className="flex flex-col items-end">
                    <span className="text-[10.5px] text-[#98A2B3] font-semibold uppercase tracking-wide">Vencido sem baixa</span>
                    <span className="text-[16px] font-extrabold text-[#C2410C] tracking-[-0.01em] tabular-nums">{formatBRL(agenda30.totalVencido)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Contas a receber (painel lateral) */}
          <div className="bg-white border border-[#EAECF0] rounded-xl overflow-hidden flex flex-col" style={{ boxShadow: '0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#EAECF0]">
              <div>
                <div className="text-[20px] font-extrabold text-[#1D2939] tracking-[-0.02em]">Contas a receber</div>
                <div className="text-[12px] text-[#98A2B3] mt-1">
                  {selectedAgendaDate
                    ? `Vencimento em ${format(parseISO(selectedAgendaDate), 'dd/MM/yyyy')}`
                    : 'Todas \u00b7 janela de 30 dias'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="px-2.5 py-1 rounded-full text-[10.5px] font-bold uppercase tracking-wide"
                  style={{
                    background: selectedAgendaDate ? '#1D2939' : '#E5E7EB',
                    color: selectedAgendaDate ? '#fff' : '#1D2939',
                  }}
                >
                  {selectedAgendaDate ? format(parseISO(selectedAgendaDate), 'dd/MM') : 'Todas'}
                </span>
                <button
                  onClick={async () => {
                    if (agendaDiaLista.length === 0) {
                      toast.error('Nenhuma conta para copiar')
                      return
                    }
                    const titulo = selectedAgendaDate
                      ? `*Contas a receber - ${format(parseISO(selectedAgendaDate), 'dd/MM/yyyy')}*`
                      : '*Contas a receber - Janela de 30 dias*'
                    const linhas = agendaDiaLista.map(cr => {
                      const data = selectedAgendaDate ? '' : `${format(parseISO(cr.data_vencimento), 'dd/MM')} \u2014 `
                      const cat = cr.conta_contabil_id ? (categoryMap[cr.conta_contabil_id] || '\u2014') : '\u2014'
                      return `\u2022 ${data}${cr.pagador_nome} \u2014 ${cat} \u2014 ${formatBRL(cr._pendente)}`
                    }).join('\n')
                    const total = `*Total a receber: ${formatBRL(agendaDiaTotal)}*`
                    const texto = `${titulo}\n\n${linhas}\n\n${total}`
                    try {
                      await navigator.clipboard.writeText(texto)
                      toast.success('Lista copiada! Cole no WhatsApp.')
                    } catch {
                      toast.error('N\u00e3o foi poss\u00edvel copiar')
                    }
                  }}
                  title="Copiar lista para WhatsApp"
                  className="flex items-center gap-1 text-[11px] font-semibold text-[#667085] hover:text-black px-2 h-7 border border-[#D0D5DD] rounded"
                >
                  <Copy size={11} /> Copiar
                </button>
                {selectedAgendaDate && (
                  <button
                    onClick={() => setSelectedAgendaDate(null)}
                    className="text-[11px] font-semibold text-[#667085] hover:text-black"
                  >
                    Limpar
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-auto" style={{ maxHeight: 360 }}>
              {agendaDiaLista.length === 0 ? (
                <div className="px-5 py-10 text-center text-[13px] text-[#98A2B3]">
                  Nenhuma conta a receber {selectedAgendaDate ? 'nesta data' : 'nesta janela'}.
                </div>
              ) : (
                <table className="w-full text-[12.5px]">
                  <thead className="bg-[#F9FAFB] sticky top-0">
                    <tr>
                      <th className="py-2 px-3 text-left font-semibold uppercase tracking-wider text-[10.5px] text-[#98A2B3]">Nome</th>
                      <th className="py-2 px-3 text-left font-semibold uppercase tracking-wider text-[10.5px] text-[#98A2B3]">Categoria</th>
                      <th className="py-2 px-3 text-right font-semibold uppercase tracking-wider text-[10.5px] text-[#98A2B3]">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agendaDiaLista.map(cr => {
                      const hoje = format(new Date(), 'yyyy-MM-dd')
                      const isVencido = cr.data_vencimento < hoje
                      return (
                        <tr key={cr.id} style={{ borderTop: '1px solid #F2F4F7' }}>
                          <td className="py-2 px-3 text-[#1D2939]">
                            <div className="font-semibold truncate" style={{ maxWidth: 180 }}>{cr.pagador_nome}</div>
                            {!selectedAgendaDate && (
                              <div className={`text-[10.5px] ${isVencido ? 'text-[#C2410C] font-semibold' : 'text-[#98A2B3]'}`}>
                                {format(parseISO(cr.data_vencimento), 'dd/MM')}{isVencido ? ' · vencida' : ''}
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-3 text-[#555]">
                            {cr.conta_contabil_id ? (categoryMap[cr.conta_contabil_id] || '—') : '—'}
                          </td>
                          <td className={`py-2 px-3 text-right font-semibold tabular-nums ${isVencido ? 'text-[#C2410C]' : 'text-[#1D2939]'}`}>
                            {formatBRL(cr._pendente)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="px-5 py-3 border-t border-[#EAECF0] bg-[#F9FAFB] flex items-center justify-between">
              <span className="text-[11.5px] font-bold uppercase tracking-wide text-[#1D2939]">Total a receber</span>
              <span className="text-[18px] font-extrabold text-[#039855] tracking-[-0.01em] tabular-nums">
                {formatBRL(agendaDiaTotal)}
              </span>
            </div>
          </div>
        </div>

        {/* ── Filtros compactos (padrão Vendas — minimizados, clique em "Mais filtros" para expandir) ── */}
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Search */}
            <div className="relative flex-1 min-w-[160px] max-w-[240px]">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#98A2B3]" />
              <input
                type="text"
                placeholder="Buscar pagador..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-7 pr-2 h-7 text-[11.5px] border border-[#D0D5DD] rounded bg-white text-black placeholder-[#98A2B3] focus:outline-none focus:border-black"
              />
            </div>
            {/* Status */}
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-2 h-7 text-[11.5px] border border-[#D0D5DD] rounded bg-white text-black focus:outline-none focus:border-black"
            >
              {STATUS_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {/* Limpar */}
            {(search || statusFilter !== 'todos' || dateFrom || dateTo) && (
              <button
                onClick={() => { setSearch(''); setStatusFilter('todos'); setDateFrom(''); setDateTo('') }}
                className="text-[11px] font-semibold text-[#667085] hover:text-black px-1.5 h-7"
              >
                Limpar
              </button>
            )}
            {/* Expandir */}
            <button
              onClick={() => setFiltersExpanded(v => !v)}
              className="flex items-center gap-1 px-2 h-7 text-[11px] font-semibold text-[#667085] hover:text-black"
            >
              {filtersExpanded ? 'Recolher' : 'Mais filtros'}
              {filtersExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
            <div className="flex-1" />
            {(dateFrom || dateTo) && (
              <span className="text-[10.5px] text-[#98A2B3] whitespace-nowrap">
                {dateFrom ? format(parseISO(dateFrom), 'dd/MM/yyyy') : '—'} &ndash; {dateTo ? format(parseISO(dateTo), 'dd/MM/yyyy') : '—'}
              </span>
            )}
            <button
              onClick={() => setNovoModal(true)}
              className="flex items-center gap-1 px-2.5 h-7 text-[11.5px] font-semibold text-white bg-black rounded hover:bg-[#1D2939] transition-colors"
            >
              <Plus size={11} /> Novo t&iacute;tulo
            </button>
          </div>

          {/* Painel expandido: período por datas */}
          {filtersExpanded && (
            <div className="flex flex-wrap items-end gap-2 mt-2 p-3 border border-[#EAECF0] rounded-lg bg-[#FAFBFC]">
              <div>
                <label className="block text-[10px] font-semibold text-[#555] uppercase tracking-wide mb-1">De</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="px-2 h-7 text-[11.5px] border border-[#D0D5DD] rounded bg-white text-black focus:outline-none focus:border-black"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[#555] uppercase tracking-wide mb-1">At&eacute;</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="px-2 h-7 text-[11.5px] border border-[#D0D5DD] rounded bg-white text-black focus:outline-none focus:border-black"
                />
              </div>
              <p className="text-[10.5px] text-[#98A2B3] ml-1 mb-1">
                Filtrar por intervalo de vencimento.
              </p>
            </div>
          )}
        </div>

        {/* ── Table ── */}
        <div className="border border-[#EAECF0] rounded-xl overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)' }}>
          <div className="bg-[#2A2724] px-4 py-2.5 flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-widest">
              T&iacute;tulos ({filtered.length})
            </h3>
            {someSelected && (
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-white/70">
                  {selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}
                </span>
                <button
                  onClick={() => setQuitarLoteModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-[#039855] bg-white rounded hover:bg-[#ECFDF3] transition-colors"
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
              <div className="py-4"><TableSkeleton rows={8} cols={5} /></div>
            ) : filtered.length === 0 ? (
              <EmptyState
                title="Nenhum titulo encontrado"
                description="Ajuste os filtros ou o periodo para ver resultados."
              />
            ) : (<>
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[#e5e5e5]">
                    <th className="px-3 py-2 w-10">
                      <input
                        type="checkbox"
                        checked={allSelectableSelected}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-[#ccc] text-[#059669] focus:ring-[#059669] cursor-pointer"
                      />
                    </th>
                    {['Pagador', 'Tipo', 'Categoria', 'Vencimento', 'Valor', 'Pago', 'Saldo', 'Status', 'Acoes'].map(h => (
                      <th
                        key={h}
                        className="px-4 py-2 text-left text-[10px] font-bold text-[#555] uppercase tracking-widest"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(cr => {
                    const saldo = cr.valor - (cr.valor_pago || 0)
                    const st = statusBadge(cr._status)
                    const hoje = new Date().toISOString().split('T')[0]
                    const isVencido = cr.data_vencimento < hoje && !['pago', 'cancelado'].includes(cr._status)
                    const diasAtraso = isVencido ? differenceInDays(new Date(), parseISO(cr.data_vencimento)) : 0

                    const isSelectable = cr._status !== 'pago' && cr._status !== 'cancelado'
                    return (
                      <tr
                        key={cr.id}
                        className={`border-b border-[#EAECF0] hover:bg-gray-50 transition-colors ${selectedIds.has(cr.id) ? 'bg-[#ECFDF4]' : ''}`}
                      >
                        {/* Checkbox */}
                        <td className="px-3 py-2 w-10 align-middle">
                          {isSelectable && (
                            <input
                              type="checkbox"
                              checked={selectedIds.has(cr.id)}
                              onChange={() => toggleSelect(cr.id)}
                              className="w-4 h-4 rounded border-[#ccc] text-[#059669] focus:ring-[#059669] cursor-pointer"
                            />
                          )}
                        </td>
                        {/* Pagador */}
                        <td className="px-4 py-2 align-middle">
                          <div className="font-semibold text-[#1D2939]">{cr.pagador_nome}</div>
                          {cr.pagador_cpf_cnpj && (
                            <div className="text-[11px] text-[#999] mt-0.5">{cr.pagador_cpf_cnpj}</div>
                          )}
                        </td>
                        {/* Tipo */}
                        <td className="px-4 py-2 align-middle">
                          <span className="inline-block px-2 py-0.5 text-[11px] font-medium text-[#555] bg-white border border-[#ddd] rounded">
                            {deriveTipo(cr)}
                          </span>
                        </td>
                        {/* Categoria */}
                        <td className="px-4 py-3 text-[13px] text-[#555]">
                          {cr.conta_contabil_id ? (categoryMap[cr.conta_contabil_id] || '—') : '—'}
                        </td>
                        {/* Vencimento */}
                        <td className="px-4 py-2 align-middle">
                          <span className={isVencido ? 'text-[#E53E3E] font-semibold' : 'text-[#1D2939]'}>
                            {formatData(cr.data_vencimento)}
                          </span>
                          {isVencido && diasAtraso > 0 && (
                            <div className="text-[10px] text-[#E53E3E] mt-0.5">
                              {diasAtraso} {diasAtraso === 1 ? 'dia' : 'dias'} em atraso
                            </div>
                          )}
                        </td>
                        {/* Valor */}
                        <td className="px-4 py-3 font-medium text-[#1D2939]">
                          {formatBRL(cr.valor)}
                        </td>
                        {/* Pago */}
                        <td className="px-4 py-3 text-[#039855] font-medium">
                          {formatBRL(cr.valor_pago || 0)}
                        </td>
                        {/* Saldo */}
                        <td className="px-4 py-3 font-semibold text-[#1D2939]">
                          {formatBRL(saldo)}
                        </td>
                        {/* Status */}
                        <td className="px-4 py-2 align-middle">
                          <span
                            className="inline-block px-2.5 py-1 text-[11px] font-semibold rounded border"
                            style={{ color: st.text, backgroundColor: st.bg, borderColor: st.border }}
                          >
                            {st.label}
                          </span>
                        </td>
                        {/* Acoes */}
                        <td className="px-4 py-2 align-middle">
                          <div className="flex items-center gap-2">
                            {cr._status !== 'pago' && cr._status !== 'cancelado' && (
                              <button
                                onClick={() => setQuitarModal(cr)}
                                className="px-3 py-1.5 text-[11px] font-semibold text-white bg-[#039855] rounded hover:bg-[#084d25] transition-colors"
                              >
                                Quitar
                              </button>
                            )}
                            {/* Dropdown */}
                            <div className="relative">
                              <button
                                onClick={e => { e.stopPropagation(); setDropdownOpen(dropdownOpen === cr.id ? null : cr.id) }}
                                className="p-1.5 rounded hover:bg-[#EAECF0] transition-colors"
                              >
                                <MoreHorizontal size={16} className="text-[#555]" />
                              </button>
                              {dropdownOpen === cr.id && (
                                <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-[#ccc] rounded-lg shadow-lg z-50">
                                  <button
                                    onClick={() => { setRenegociarModal(cr); setDropdownOpen(null) }}
                                    className="w-full px-4 py-2.5 text-left text-[13px] text-[#1D2939] hover:bg-gray-50 transition-colors first:rounded-t-lg"
                                  >
                                    Renegociar
                                  </button>
                                  <button
                                    onClick={async () => {
                                      setDropdownOpen(null)
                                      const ok = await confirm({
                                        title: 'Cancelar este título?',
                                        description: 'O lançamento será marcado como cancelado e sairá do total a receber.',
                                        confirmLabel: 'Sim, cancelar título',
                                        variant: 'destructive',
                                      })
                                      if (!ok) return
                                      await db.from('contas_receber').update({ status: 'cancelado' }).eq('id', cr.id)
                                      fetchItems()
                                    }}
                                    className="w-full px-4 py-2.5 text-left text-[13px] text-[#E53E3E] hover:bg-[#FEE2E2] transition-colors"
                                  >
                                    Cancelar titulo
                                  </button>
                                  <button
                                    onClick={() => {
                                      setDropdownOpen(null)
                                      alert('Funcionalidade de cobranca manual sera implementada em breve.')
                                    }}
                                    className="w-full px-4 py-2.5 text-left text-[13px] text-[#1D2939] hover:bg-gray-50 transition-colors"
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
                                    className="w-full px-4 py-2.5 text-left text-[13px] text-[#E53E3E] hover:bg-[#FEE2E2] transition-colors last:rounded-b-lg"
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
              <TablePagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={(p) => setPage(p)} />
            </>)}
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
        <div className="bg-[#039855] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-white" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Quitar em Lote</h2>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white" disabled={submitting}>
            <X size={18} />
          </button>
        </div>

        {/* Summary */}
        <div className="px-6 py-4 bg-[#ECFDF3] border-b border-[#c3e6d1]">
          <div className="flex justify-between text-sm">
            <span className="text-[#039855] font-semibold">{selectedCrs.length} titulo{selectedCrs.length !== 1 ? 's' : ''} selecionado{selectedCrs.length !== 1 ? 's' : ''}</span>
            <span className="text-[#039855] font-bold">{formatBRL(totalSaldo)}</span>
          </div>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-[#555] uppercase tracking-wide mb-1">Conta bancaria destino *</label>
            <select
              value={contaBancariaId}
              onChange={e => setContaBancariaId(e.target.value)}
              className="w-full px-3 py-2 border border-[#ccc] rounded-md text-[13px] bg-white focus:outline-none focus:border-[#039855]"
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
                className={`flex-1 px-3 py-2 text-[12px] font-semibold rounded-md border transition-colors ${!usarDataVencimento ? 'bg-[#039855] text-white border-[#039855]' : 'bg-white text-[#555] border-[#ccc] hover:bg-gray-50'}`}
              >
                Data fixa
              </button>
              <button
                type="button"
                onClick={() => setUsarDataVencimento(true)}
                disabled={submitting}
                className={`flex-1 px-3 py-2 text-[12px] font-semibold rounded-md border transition-colors ${usarDataVencimento ? 'bg-[#039855] text-white border-[#039855]' : 'bg-white text-[#555] border-[#ccc] hover:bg-gray-50'}`}
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
                  className="w-full px-3 py-2 border border-[#ccc] rounded-md text-[13px] focus:outline-none focus:border-[#039855]"
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
                className="w-full px-3 py-2 border border-[#ccc] rounded-md text-[13px] bg-white focus:outline-none focus:border-[#039855]"
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
                <span className="text-xs font-semibold text-[#039855]">
                  Quitando... {progress.current} de {progress.total}
                </span>
                <span className="text-xs font-bold text-[#039855]">
                  {Math.round((progress.current / progress.total) * 100)}%
                </span>
              </div>
              <div className="w-full h-2.5 bg-[#EAECF0] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#039855] rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[#eee] px-6 py-4 flex justify-end gap-3 bg-white">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-[#555] border border-[#ccc] rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm({ dataPagamento, formaRecebimento, contaBancariaId, usarDataVencimento })}
            disabled={submitting || !contaBancariaId || (!usarDataVencimento && !dataPagamento)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-[#039855] rounded-md hover:bg-[#084d25] transition-colors disabled:opacity-50"
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
      className="bg-white border border-[#EAECF0] rounded-xl p-5 flex flex-col gap-2"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-[13px] font-bold text-[#1D2939] uppercase tracking-[0.05em] whitespace-nowrap">
          {label}
        </div>
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: color.bg, color: color.icon }}
        >
          {icon}
        </div>
      </div>
      <div
        className="font-extrabold leading-[1.1]"
        style={{
          color: color.text,
          fontSize: 'clamp(18px, 1.8vw, 26px)',
          letterSpacing: '-0.5px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {value}
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
    <div className="bg-[#2A2724] px-5 py-3 flex items-center justify-between rounded-t-xl">
      <h3 className="text-[12px] font-bold text-white uppercase tracking-widest">{title}</h3>
      <button onClick={onClose} className="text-[#BFDBFE] hover:text-white transition-colors">
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
  'w-full px-3 py-2 border border-[#ccc] rounded-md text-[13px] text-[#1D2939] bg-white focus:outline-none focus:border-[#059669] focus:ring-1 focus:ring-[#059669] disabled:bg-white disabled:text-[#999]'

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
          style={{ backgroundColor: '#ECFDF4', borderColor: '#059669' }}
        >
          <DollarSign size={16} className="text-[#059669]" />
          <div>
            <span className="text-[10px] font-bold text-[#059669] uppercase tracking-widest">Saldo devedor</span>
            <p className="text-lg font-bold text-[#059669]">{formatBRL(saldo)}</p>
          </div>
        </div>

        {/* Pagador info */}
        <div className="text-[13px] text-[#555]">
          Pagador: <span className="font-semibold text-[#1D2939]">{cr.pagador_nome}</span>
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
          style={{ backgroundColor: '#ECFDF3', borderColor: '#039855', color: '#039855' }}
        >
          <CheckCircle2 size={14} />
          Recibo sera gerado e enviado automaticamente por e-mail ao pagador
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-[13px] font-semibold text-[#555] border border-[#ccc] rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 text-[13px] font-semibold text-white bg-[#039855] rounded-lg hover:bg-[#084d25] transition-colors disabled:opacity-50 flex items-center gap-2"
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
                    ? 'border-[#059669] bg-[#ECFDF4] text-[#059669]'
                    : 'border-[#ccc] bg-white text-[#555] hover:bg-gray-50'
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
                    className="w-full text-left px-3 py-2 hover:bg-[#ECFDF4] border-b border-[#eee] last:border-0"
                  >
                    <div className="text-[13px] font-semibold text-[#1D2939]">
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
                  className="w-full text-left px-3 py-2 text-[13px] font-semibold text-[#059669] hover:bg-[#ECFDF4] flex items-center gap-2 border-t border-[#ccc]"
                >
                  <UserPlus size={14} /> + Adicionar cliente
                </button>
              </div>
            )}
          </div>

          {/* Novo cliente inline modal */}
          {showNovoCliente && (
            <div className="border border-[#059669] rounded-lg p-3 bg-[#ECFDF4] space-y-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12px] font-bold text-[#059669] uppercase tracking-wider">Novo cliente</span>
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
                className="px-4 py-1.5 text-[12px] font-semibold text-white bg-[#059669] rounded-lg hover:bg-[#1D2939]"
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
            className="px-4 py-2 text-[13px] font-semibold text-[#555] border border-[#ccc] rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 text-[13px] font-semibold text-white bg-[#059669] rounded-lg hover:bg-[#1D2939] transition-colors disabled:opacity-50 flex items-center gap-2"
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
          <p>Pagador: <span className="font-semibold text-[#1D2939]">{cr.pagador_nome}</span></p>
          <p>Valor: <span className="font-semibold text-[#1D2939]">{formatBRL(cr.valor)}</span></p>
          <p>Vencimento atual: <span className="font-semibold text-[#1D2939]">{formatData(cr.data_vencimento)}</span></p>
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
            className="px-4 py-2 text-[13px] font-semibold text-[#555] border border-[#ccc] rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 text-[13px] font-semibold text-white bg-[#059669] rounded-lg hover:bg-[#1D2939] transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            Confirmar renegociacao
          </button>
        </div>
      </form>
    </ModalOverlay>
  )
}
