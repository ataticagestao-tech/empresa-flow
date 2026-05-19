import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import jsPDF from 'jspdf'
import JsBarcode from 'jsbarcode'
import { linhaDigitavelToBarcode } from '@/utils/boleto-barcode'
import { format, addDays, addMonths, startOfMonth, endOfMonth, isToday, isBefore, isAfter, parseISO } from 'date-fns'
import {
  DollarSign, CalendarClock, CalendarDays, CheckCircle2, Plus, X,
  MoreHorizontal, Search, ChevronDown, ChevronUp,
  AlertTriangle, Loader2, FileText, Trash2, SplitSquareVertical,
  RefreshCw, Download, Paperclip, Archive, Pencil, ScanLine, Copy
} from 'lucide-react'
import { toast } from 'sonner'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { formatBRL, formatData, toTitleCase } from '@/lib/format'
import { quitarCP, calcularProximoVencimento } from '@/lib/financeiro/transacao'
import { AppLayout } from '@/components/layout/AppLayout'
import { CollapsibleCard } from '@/components/ui/collapsible-card'
import { PendenciasBanner } from '@/modules/finance/presentation/components/PendenciasBanner'
import { TableSkeleton } from '@/components/ui/page-skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { PeriodFilter } from '@/components/ui/period-filter'
import { SupplierSheet } from '@/components/suppliers/SupplierSheet'
import { softDeleteWithUndo } from '@/lib/softDeleteWithUndo'
import { SendWhatsAppDialog } from '@/components/whatsapp/SendWhatsAppDialog'
import { SendEmailDialog } from '@/components/email/SendEmailDialog'

// ─── Types ──────────────────────────────────────────────────────────
interface ContaPagar {
  id: string
  company_id: string
  credor_nome: string
  descricao: string | null
  credor_cpf_cnpj: string | null
  valor: number
  valor_pago: number
  data_vencimento: string
  data_pagamento: string | null
  status: string
  forma_pagamento: string | null
  conta_contabil_id: string | null
  centro_custo_id: string | null
  codigo_barras: string | null
  file_url: string | null
  competencia: string | null
  is_fixed_cost: boolean
}

interface Supplier {
  id: string
  razao_social: string
  cpf_cnpj: string | null
  dados_bancarios_pix: string | null
}

interface Employee {
  id: string
  nome_completo: string | null
  name: string | null
  cpf: string | null
  chave_pix_folha: string | null
}

interface Client {
  id: string
  razao_social: string
}

type CredorTipo = 'fornecedor' | 'funcionario' | 'cliente'

interface BankAccount {
  id: string
  company_id: string
  name: string
  banco: string | null
  type: string | null
}

interface ChartAccount {
  id: string
  company_id: string
  code: string
  name: string
  type: string
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

type Recorrencia = 'sem' | 'mensal' | 'trimestral' | 'anual'
type UrgencyGroup = 'hoje' | 'proximos7' | 'proximos30' | 'vencidos' | 'pagos'

const FORMAS_PAGAMENTO = ['PIX', 'Transferencia', 'Boleto', 'Debito automatico', 'Cartao de credito', 'Dinheiro'] as const

// ─── Helpers ────────────────────────────────────────────────────────
function classifyUrgency(cp: ContaPagar): UrgencyGroup {
  if (cp.status === 'pago' || cp.status === 'cancelado') return 'pagos'
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const venc = parseISO(cp.data_vencimento)
  venc.setHours(0, 0, 0, 0)

  if (isBefore(venc, hoje)) return 'vencidos'
  if (isToday(venc)) return 'hoje'
  const seteDias = addDays(hoje, 7)
  if (isBefore(venc, seteDias) || venc.getTime() === seteDias.getTime()) return 'proximos7'
  return 'proximos30'
}

const urgencyConfig: Record<UrgencyGroup, { label: string; textColor: string; bgColor: string; borderColor: string }> = {
  hoje: { label: 'Vence hoje', textColor: '#E53E3E', bgColor: '#FEE2E2', borderColor: '#E53E3E' },
  proximos7: { label: 'Proximos 7 dias', textColor: '#EA580C', bgColor: '#FFF0EB', borderColor: '#EA580C' },
  proximos30: { label: 'Proximos 30 dias', textColor: '#059669', bgColor: 'rgba(26,46,74,0.04)', borderColor: '#059669' },
  vencidos: { label: 'Vencidos', textColor: '#E53E3E', bgColor: '#FEE2E2', borderColor: '#E53E3E' },
  pagos: { label: 'Pagos', textColor: '#039855', bgColor: '#ECFDF3', borderColor: '#039855' },
}

function saldo(cp: ContaPagar) {
  return cp.valor - (cp.valor_pago || 0)
}

// ─── Component ──────────────────────────────────────────────────────
export default function ContasPagar() {
  const { selectedCompany } = useCompany()
  const { activeClient } = useAuth()
  const confirm = useConfirm()
  const [searchParams, setSearchParams] = useSearchParams()

  // Data
  const [contas, setContas] = useState<ContaPagar[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [centrosCusto, setCentrosCusto] = useState<CentroCusto[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('todos')
  const [datePreset, setDatePreset] = useState<string>('mes_atual')
  const [dateFrom, setDateFrom] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState(() => format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [sectorFilter, setSectorFilter] = useState<string>('todos')
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  const [selectedAgendaDate, setSelectedAgendaDate] = useState<string | null>(null)

  const applyDatePreset = (preset: string) => {
    setDatePreset(preset)
    const hoje = new Date()
    switch (preset) {
      case 'hoje':
        setDateFrom(format(hoje, 'yyyy-MM-dd'))
        setDateTo(format(hoje, 'yyyy-MM-dd'))
        break
      case 'semana':
        setDateFrom(format(hoje, 'yyyy-MM-dd'))
        setDateTo(format(addDays(hoje, 7), 'yyyy-MM-dd'))
        break
      case 'mes_atual':
        setDateFrom(format(startOfMonth(hoje), 'yyyy-MM-dd'))
        setDateTo(format(endOfMonth(hoje), 'yyyy-MM-dd'))
        break
      case 'proximo_mes':
        setDateFrom(format(startOfMonth(addMonths(hoje, 1)), 'yyyy-MM-dd'))
        setDateTo(format(endOfMonth(addMonths(hoje, 1)), 'yyyy-MM-dd'))
        break
      case 'trimestre':
        setDateFrom(format(startOfMonth(hoje), 'yyyy-MM-dd'))
        setDateTo(format(endOfMonth(addMonths(hoje, 2)), 'yyyy-MM-dd'))
        break
      case 'todos':
        setDateFrom('')
        setDateTo('')
        break
      case 'personalizado':
        break
    }
  }

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Modals
  const [showPayModal, setShowPayModal] = useState(false)
  const [showNewModal, setShowNewModal] = useState(false)
  const [showBatchPayModal, setShowBatchPayModal] = useState(false)
  const [showBatchCategorizeModal, setShowBatchCategorizeModal] = useState(false)
  const [batchCategorize, setBatchCategorize] = useState<{ contaContabilId: string; centroCustoId: string }>({ contaContabilId: '', centroCustoId: '' })
  const [payingCp, setPayingCp] = useState<ContaPagar | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null)
  const [dropdownCoords, setDropdownCoords] = useState<{ top: number; right: number } | null>(null)
  const [whatsComprovanteModal, setWhatsComprovanteModal] = useState<{ cp: ContaPagar; phone: string; text: string } | null>(null)
  const [emailComprovanteModal, setEmailComprovanteModal] = useState<{ cp: ContaPagar; email: string; assunto: string; corpo: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [editingCpId, setEditingCpId] = useState<string | null>(null)
  const [isSupplierSheetOpen, setIsSupplierSheetOpen] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isReadingBoleto, setIsReadingBoleto] = useState(false)

  // Pay form
  const [payForm, setPayForm] = useState({
    valorPago: 0,
    dataPagamento: format(new Date(), 'yyyy-MM-dd'),
    formaPagamento: 'PIX' as string,
    contaBancariaId: '',
    juros: 0,
    desconto: 0,
    observacao: '',
    credorTipo: null as 'funcionario' | 'fornecedor' | null,
  })

  // New CP form
  const [newForm, setNewForm] = useState({
    credorNome: '',
    descricao: '',
    credorTipo: 'fornecedor' as CredorTipo,
    credorId: '',
    valor: 0,
    dataVencimento: format(new Date(), 'yyyy-MM-dd'),
    competencia: '',
    contaContabilId: '',
    centroCustoId: '',
    recorrencia: 'sem' as Recorrencia,
    numParcelas: 3,
    codigoBarras: '',
    fileUrl: '',
    isFixedCost: false,
  })

  const MONTHS = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ]
  const [competenciaYear, setCompetenciaYear] = useState(new Date().getFullYear())
  const [showCompetenciaPicker, setShowCompetenciaPicker] = useState(false)

  // Autocomplete conta contábil (digitável)
  const [contaContabilSearch, setContaContabilSearch] = useState('')
  const [contaContabilOpen, setContaContabilOpen] = useState(false)
  const contaContabilRef = useRef<HTMLDivElement>(null)

  // Sincroniza texto exibido quando contaContabilId muda externamente (ex.: edição)
  useEffect(() => {
    if (!newForm.contaContabilId) {
      setContaContabilSearch('')
      return
    }
    const c = chartAccounts.find(x => x.id === newForm.contaContabilId)
    if (c) setContaContabilSearch(`${c.code} - ${c.name}`)
  }, [newForm.contaContabilId, chartAccounts])

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    if (!contaContabilOpen) return
    const onClick = (e: MouseEvent) => {
      if (contaContabilRef.current && !contaContabilRef.current.contains(e.target as Node)) {
        setContaContabilOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [contaContabilOpen])

  const chartAccountsFiltrados = useMemo(() => {
    const t = contaContabilSearch.trim().toLowerCase()
    if (!t) return chartAccounts.slice(0, 50)
    return chartAccounts.filter(c =>
      `${c.code || ''} ${c.name}`.toLowerCase().includes(t)
    ).slice(0, 50)
  }, [chartAccounts, contaContabilSearch])

  // Batch pay form
  const [batchForm, setBatchForm] = useState({
    dataPagamento: format(new Date(), 'yyyy-MM-dd'),
    formaPagamento: 'PIX' as string,
    contaBancariaId: '',
  })

  // Collapsed groups
  const [collapsedGroups, setCollapsedGroups] = useState<Set<UrgencyGroup>>(new Set())
  const [globalPage, setGlobalPage] = useState(0)
  const PAGE_SIZE = 10

  useEffect(() => { setGlobalPage(0) }, [searchTerm, statusFilter, sectorFilter, dateFrom, dateTo])

  // ─── Data Loading ───────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!selectedCompany) return
    setLoading(true)

    const db = activeClient as any

    const [cpRes, bankRes, chartRes, ccRes, prodRes, supRes, empRes, cliRes] = await Promise.all([
      db.from('contas_pagar').select('*').or(`company_id.eq.${selectedCompany.id},unidade_destino_id.eq.${selectedCompany.id}`).is('deleted_at', null).in('status', ['aberto', 'parcial', 'vencido', 'pago']).order('data_vencimento', { ascending: true }).limit(5000),
      db.from('bank_accounts').select('id, company_id, name, banco, type').eq('company_id', selectedCompany.id),
      db.from('chart_of_accounts').select('id, company_id, code, name, type').eq('company_id', selectedCompany.id).order('code'),
      db.from('centros_custo').select('id, company_id, codigo, descricao').eq('company_id', selectedCompany.id).eq('ativo', true),
      db.from('products').select('id, description, code').eq('company_id', selectedCompany.id).eq('is_active', true).order('description'),
      db.from('suppliers').select('id, razao_social, cpf_cnpj, dados_bancarios_pix').eq('company_id', selectedCompany.id).order('razao_social'),
      db.from('employees').select('id, nome_completo, name, cpf, chave_pix_folha').eq('company_id', selectedCompany.id),
      db.from('clients').select('id, razao_social').eq('company_id', selectedCompany.id).eq('is_active', true).order('razao_social'),
    ])

    setContas(cpRes.data || [])
    setBankAccounts(bankRes.data || [])
    setChartAccounts(chartRes.data || [])
    setCentrosCusto(ccRes.data || [])
    setProducts(prodRes.data || [])
    setSuppliers(supRes.data || [])
    setEmployees(empRes.data || [])
    setClients(cliRes.data || [])
    setSelectedIds(new Set())
    setLoading(false)
  }, [selectedCompany, activeClient])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ─── Open new title modal when ?new=true ─────────────────────────
  useEffect(() => {
    if (searchParams.get('new') === 'true') {
      openNewModal()
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // ─── KPIs ─────────────────────────────────────────────────────────
  // Total a pagar e Pago no período seguem o filtro (dateFrom..dateTo).
  // Vence hoje e Próximos 7 dias permanecem ancorados na data atual — é a
  // semântica deles (não fariam sentido fora desse contexto).
  const kpis = useMemo(() => {
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const seteDias = addDays(hoje, 7)

    let totalPagar = 0
    let totalCount = 0
    let venceHoje = 0
    let hojeCount = 0
    let prox7 = 0
    let prox7Count = 0
    let pagoPeriodo = 0
    let pagoPeriodoCount = 0

    for (const cp of contas) {
      if (cp.status === 'cancelado') continue

      // Pago no período: olha data_pagamento (não vencimento)
      if (cp.status === 'pago') {
        if (cp.data_pagamento && cp.data_pagamento >= dateFrom && cp.data_pagamento <= dateTo) {
          pagoPeriodo += Number(cp.valor_pago || 0)
          pagoPeriodoCount++
        }
        continue
      }

      // CPs em aberto/parcial/vencido — todos os 3 cards de pendência
      const s = saldo(cp)
      const dataVenc = cp.data_vencimento
      const venc = parseISO(dataVenc)
      venc.setHours(0, 0, 0, 0)

      // Total a pagar: respeita o filtro (vencimento no intervalo)
      if (dataVenc >= dateFrom && dataVenc <= dateTo) {
        totalPagar += s
        totalCount++
      }

      // Vence hoje / Próximos 7 — ancorados no dia atual, ignoram filtro
      if (isToday(venc) && (cp.status === 'aberto' || cp.status === 'parcial')) { venceHoje += s; hojeCount++ }
      if ((isToday(venc) || (isAfter(venc, hoje) && (isBefore(venc, seteDias) || venc.getTime() === seteDias.getTime())))) { prox7 += s; prox7Count++ }
    }

    return { totalPagar, totalCount, venceHoje, hojeCount, prox7, prox7Count, pagoPeriodo, pagoPeriodoCount }
  }, [contas, dateFrom, dateTo])

  // ─── Agenda do mês corrente (heatmap estilo GitHub) ──────────────
  const agendaMes = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const inicioMes = startOfMonth(today)
    const fimMes = endOfMonth(today)
    fimMes.setHours(0, 0, 0, 0)

    const inicioIso = format(inicioMes, 'yyyy-MM-dd')
    const fimIso = format(fimMes, 'yyyy-MM-dd')

    const byDay: Record<string, { value: number; count: number }> = {}
    for (const cp of contas) {
      if (cp.status === 'pago' || cp.status === 'cancelado') continue
      const key = cp.data_vencimento
      if (key < inicioIso || key > fimIso) continue
      const pendente = Number(cp.valor || 0) - Number(cp.valor_pago || 0)
      if (pendente <= 0) continue
      if (!byDay[key]) byDay[key] = { value: 0, count: 0 }
      byDay[key].value += pendente
      byDay[key].count += 1
    }

    const days: { date: Date; dateStr: string; value: number; count: number }[] = []
    const totalDias = fimMes.getDate()
    for (let i = 0; i < totalDias; i++) {
      const d = addDays(inicioMes, i)
      const dateStr = format(d, 'yyyy-MM-dd')
      const b = byDay[dateStr]
      days.push({ date: d, dateStr, value: b?.value || 0, count: b?.count || 0 })
    }

    const vals = days.map(x => x.value).filter(v => v > 0)
    const max = vals.length ? Math.max(...vals) : 0
    const total = days.reduce((s, x) => s + x.value, 0)
    const diasComSaida = days.filter(d => d.value > 0).length

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

    // Um único rótulo de mês (o mês corrente) — mantido como array pra compatibilizar com render existente
    const monthLabels: { weekIndex: number; label: string }[] = [{
      weekIndex: 0,
      label: format(inicioMes, 'MMM').replace(/^./, c => c.toUpperCase()),
    }]

    const mesRotulo = format(inicioMes, 'MMMM/yyyy').replace(/^./, c => c.toUpperCase())

    return { days, weeks, max, total, diasComSaida, monthLabels, mesRotulo }
  }, [contas])

  // Lista de contas a vencer no mês corrente (para o painel lateral)
  const agendaDiaLista = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const inicioIso = format(startOfMonth(today), 'yyyy-MM-dd')
    const fimIso = format(endOfMonth(today), 'yyyy-MM-dd')
    const result: (ContaPagar & { _pendente: number })[] = []
    for (const cp of contas) {
      if (cp.status === 'pago' || cp.status === 'cancelado') continue
      if (cp.data_vencimento < inicioIso || cp.data_vencimento > fimIso) continue
      const pendente = Number(cp.valor || 0) - Number(cp.valor_pago || 0)
      if (pendente <= 0) continue
      if (selectedAgendaDate && cp.data_vencimento !== selectedAgendaDate) continue
      result.push({ ...cp, _pendente: pendente })
    }
    result.sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento) || b._pendente - a._pendente)
    return result
  }, [contas, selectedAgendaDate])

  const agendaDiaTotal = useMemo(
    () => agendaDiaLista.reduce((s, cp) => s + cp._pendente, 0),
    [agendaDiaLista]
  )
  // agendaAgrupadoPorPlano é declarado mais abaixo, depois de contaContabilMap
  // (acessar contaContabilMap antes da sua declaração crashava em TDZ).

  const agendaColor = (value: number, max: number) => {
    if (value === 0 || max === 0) return '#F3F4F6'
    const r = value / max
    if (r < 0.25) return '#FECACA'
    if (r < 0.5) return '#FCA5A5'
    if (r < 0.75) return '#E53E3E'
    return '#B91C1C'
  }

  // "Pago no período" agora é calculado direto no useMemo de kpis a partir
  // de contas[] (a query já carrega status=pago), respeitando dateFrom/dateTo.

  // ─── Filtered + Grouped ───────────────────────────────────────────
  const filteredContas = useMemo(() => {
    let list = contas
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      list = list.filter(
        (cp) =>
          cp.credor_nome?.toLowerCase().includes(term) ||
          cp.descricao?.toLowerCase().includes(term) ||
          cp.credor_cpf_cnpj?.toLowerCase().includes(term) ||
          String(cp.valor).includes(term)
      )
    }
    if (statusFilter === 'aberto') {
      list = list.filter((cp) => cp.status === 'aberto' || cp.status === 'parcial')
    } else if (statusFilter === 'vencidos') {
      list = list.filter((cp) => classifyUrgency(cp) === 'vencidos')
    } else if (statusFilter === 'pagos') {
      list = list.filter((cp) => cp.status === 'pago')
    }
    if (dateFrom) {
      list = list.filter((cp) => cp.data_vencimento >= dateFrom)
    }
    if (dateTo) {
      list = list.filter((cp) => cp.data_vencimento <= dateTo)
    }
    if (sectorFilter !== 'todos') {
      list = list.filter((cp) => cp.centro_custo_id === sectorFilter)
    }
    return list
  }, [contas, searchTerm, statusFilter, dateFrom, dateTo, sectorFilter])

  const groupedContas = useMemo(() => {
    const groups: Record<UrgencyGroup, ContaPagar[]> = { hoje: [], proximos7: [], proximos30: [], vencidos: [], pagos: [] }
    for (const cp of filteredContas) {
      const g = classifyUrgency(cp)
      groups[g].push(cp)
    }
    for (const key of Object.keys(groups) as UrgencyGroup[]) {
      groups[key].sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento))
    }
    return groups
  }, [filteredContas])

  const visibleGroups = useMemo(() => {
    return (['vencidos', 'hoje', 'proximos7', 'proximos30', 'pagos'] as UrgencyGroup[]).filter(
      (g) => groupedContas[g].length > 0
    )
  }, [groupedContas])

  // ─── Selection ────────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedTotal = useMemo(() => {
    return filteredContas.filter((cp) => selectedIds.has(cp.id)).reduce((acc, cp) => acc + saldo(cp), 0)
  }, [filteredContas, selectedIds])

  // ─── Pay Single ───────────────────────────────────────────────────
  const onlyDigits = (v: string | null | undefined) => (v || '').replace(/\D/g, '')
  const normalizeName = (v: string | null | undefined) =>
    (v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()

  const identifyCredor = (cp: ContaPagar): { tipo: 'funcionario' | 'fornecedor' | null; pix: string | null } => {
    const cpfDigits = onlyDigits(cp.credor_cpf_cnpj)
    const credorNome = normalizeName(cp.credor_nome)

    if (cpfDigits) {
      const emp = employees.find(e => onlyDigits(e.cpf) === cpfDigits)
      if (emp) return { tipo: 'funcionario', pix: emp.chave_pix_folha || null }
      const sup = suppliers.find(s => onlyDigits(s.cpf_cnpj) === cpfDigits)
      if (sup) return { tipo: 'fornecedor', pix: sup.dados_bancarios_pix || null }
    }

    if (credorNome) {
      const emp = employees.find(e =>
        normalizeName(e.nome_completo) === credorNome || normalizeName(e.name) === credorNome
      )
      if (emp) return { tipo: 'funcionario', pix: emp.chave_pix_folha || null }
      const sup = suppliers.find(s => normalizeName(s.razao_social) === credorNome)
      if (sup) return { tipo: 'fornecedor', pix: sup.dados_bancarios_pix || null }
    }
    return { tipo: null, pix: null }
  }

  const openPayModal = (cp: ContaPagar) => {
    setPayingCp(cp)
    const credor = identifyCredor(cp)
    const isFuncionario = credor.tipo === 'funcionario'
    setPayForm({
      valorPago: saldo(cp),
      dataPagamento: format(new Date(), 'yyyy-MM-dd'),
      formaPagamento: 'PIX',
      contaBancariaId: bankAccounts[0]?.id || '',
      juros: 0,
      desconto: 0,
      observacao: isFuncionario ? (credor.pix || '') : (cp.codigo_barras || ''),
      credorTipo: credor.tipo,
    })
    setShowPayModal(true)
  }

  const handleCopyPix = async () => {
    if (!payForm.observacao) return
    try {
      await navigator.clipboard.writeText(payForm.observacao)
      toast.success('Chave PIX copiada')
    } catch {
      toast.error('Nao foi possivel copiar')
    }
  }

  // Envia comprovante de pagamento via WhatsApp para o credor
  async function abrirComprovanteWhatsApp(cp: ContaPagar) {
    if (!selectedCompany?.id) return
    // Tenta achar telefone do credor: suppliers > employees > clients (por nome)
    let phone = ''
    const ac = activeClient as any
    try {
      // Tenta suppliers por razao_social
      const { data: sup } = await ac.from('suppliers').select('celular, telefone').eq('company_id', selectedCompany.id).ilike('razao_social', cp.credor_nome || '').limit(1)
      if (sup?.[0]) phone = sup[0].celular || sup[0].telefone || ''
      // Se nao achou, tenta employees
      if (!phone) {
        const { data: emp } = await ac.from('employees').select('celular, telefone').eq('company_id', selectedCompany.id).ilike('nome_completo', cp.credor_nome || '').limit(1)
        if (emp?.[0]) phone = emp[0].celular || emp[0].telefone || ''
      }
      // Por fim, clients
      if (!phone) {
        const { data: cli } = await ac.from('clients').select('celular, telefone').eq('company_id', selectedCompany.id).ilike('razao_social', cp.credor_nome || '').limit(1)
        if (cli?.[0]) phone = cli[0].celular || cli[0].telefone || ''
      }
    } catch { /* ignore */ }

    const isPago = cp.status === 'pago' || cp.status === 'parcial'
    const valor = formatBRL(cp.valor || 0)
    const linhas: string[] = [
      `Olá ${cp.credor_nome || ''}!`,
      ``,
    ]
    if (isPago && cp.data_pagamento) {
      linhas.push(`Confirmamos o pagamento realizado:`)
      linhas.push(``)
      linhas.push(`*Valor:* ${valor}`)
      linhas.push(`*Data:* ${formatData(cp.data_pagamento)}`)
      if (cp.descricao) linhas.push(`*Referente a:* ${cp.descricao}`)
    } else {
      linhas.push(`Informação sobre seu título:`)
      linhas.push(``)
      linhas.push(`*Valor:* ${valor}`)
      linhas.push(`*Vencimento:* ${formatData(cp.data_vencimento)}`)
      if (cp.descricao) linhas.push(`*Referente a:* ${cp.descricao}`)
    }
    linhas.push(``)
    linhas.push(`Qualquer dúvida, estamos à disposição.`)

    setWhatsComprovanteModal({ cp, phone, text: linhas.join('\n') })
  }

  // Envia comprovante por e-mail
  async function abrirComprovanteEmail(cp: ContaPagar) {
    if (!selectedCompany?.id) return
    let email = ''
    const ac = activeClient as any
    try {
      const { data: sup } = await ac.from('suppliers').select('email').eq('company_id', selectedCompany.id).ilike('razao_social', cp.credor_nome || '').limit(1)
      if (sup?.[0]?.email) email = sup[0].email
      if (!email) {
        const { data: emp } = await ac.from('employees').select('email').eq('company_id', selectedCompany.id).ilike('nome_completo', cp.credor_nome || '').limit(1)
        if (emp?.[0]?.email) email = emp[0].email
      }
      if (!email) {
        const { data: cli } = await ac.from('clients').select('email').eq('company_id', selectedCompany.id).ilike('razao_social', cp.credor_nome || '').limit(1)
        if (cli?.[0]?.email) email = cli[0].email
      }
    } catch { /* ignore */ }

    const isPago = cp.status === 'pago' || cp.status === 'parcial'
    const valor = formatBRL(cp.valor || 0)
    const assunto = isPago
      ? `Comprovante de pagamento — ${valor}`
      : `Título a vencer em ${formatData(cp.data_vencimento)}`
    const linhas: string[] = [
      `Olá ${cp.credor_nome || ''}!`,
      ``,
    ]
    if (isPago && cp.data_pagamento) {
      linhas.push(`Confirmamos o pagamento realizado:`)
      linhas.push(``)
      linhas.push(`Valor: ${valor}`)
      linhas.push(`Data: ${formatData(cp.data_pagamento)}`)
      if (cp.descricao) linhas.push(`Referente a: ${cp.descricao}`)
    } else {
      linhas.push(`Informação sobre seu título:`)
      linhas.push(``)
      linhas.push(`Valor: ${valor}`)
      linhas.push(`Vencimento: ${formatData(cp.data_vencimento)}`)
      if (cp.descricao) linhas.push(`Referente a: ${cp.descricao}`)
    }
    linhas.push(``)
    linhas.push(`Qualquer dúvida, estamos à disposição.`)

    setEmailComprovanteModal({ cp, email, assunto, corpo: linhas.join('\n') })
  }

  const handleGerarBarcode = () => {
    const linha = payForm.observacao || ''
    const result = linhaDigitavelToBarcode(linha)
    if (!result.ok) {
      console.warn('[handleGerarBarcode] parse failed:', result.error, '| input:', JSON.stringify(linha))
      toast.error(result.error)
      return
    }
    console.debug('[handleGerarBarcode] tipo:', result.tipo, '| barcode (44):', result.barcode)

    const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    try {
      JsBarcode(tempSvg, result.barcode, {
        format: 'ITF',
        width: 3,
        height: 180,
        displayValue: true,
        fontSize: 22,
        margin: 10,
      })
    } catch (err) {
      console.error('[handleGerarBarcode] JsBarcode error:', err, '| barcode:', result.barcode)
      toast.error(`Erro ao gerar codigo de barras: ${(err as Error)?.message || 'desconhecido'}`)
      return
    }
    const svgString = new XMLSerializer().serializeToString(tempSvg)
    const linhaLabel = linha.replace(/\s+/g, ' ').trim()
    const titulo = payingCp?.descricao || payingCp?.credor_nome || ''
    const credor = payingCp?.credor_nome || ''
    const credorSub = credor && credor !== titulo ? credor : ''

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>Codigo de Barras${titulo ? ' - ' + titulo : ''}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 24px; }
  h1 { font-size: 18px; color: #059669; margin: 0 0 4px 0; font-weight: 700; }
  .meta { font-size: 13px; color: #667085; margin-bottom: 28px; word-break: break-all; max-width: 90vw; text-align: center; }
  .barcode { width: 95vw; max-width: 1400px; }
  .barcode svg { width: 100%; height: auto; }
  .actions { margin-top: 24px; display: flex; gap: 12px; }
  button { background: #059669; color: #fff; border: 0; padding: 10px 18px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  button.secondary { background: transparent; color: #667085; border: 1px solid rgba(26,46,74,0.18); }
  @media print { .actions { display: none; } body { padding: 0; } }
</style>
</head>
<body>
  ${titulo ? `<h1>${titulo}</h1>` : ''}
  ${credorSub ? `<div style="font-size:12px;color:#98A2B3;margin-bottom:8px;">${credorSub}</div>` : ''}
  <div class="meta">${linhaLabel}</div>
  <div class="barcode">${svgString}</div>
  <div class="actions">
    <button onclick="window.print()">Imprimir</button>
    <button class="secondary" onclick="window.close()">Fechar</button>
  </div>
</body>
</html>`

    const win = window.open('', '_blank')
    if (!win) {
      toast.error('Habilite popups para gerar o codigo')
      return
    }
    win.document.open()
    win.document.write(html)
    win.document.close()
  }

  const handlePay = async () => {
    if (!payingCp || !payForm.contaBancariaId) return
    setSubmitting(true)
    const result = await quitarCP(payingCp.id, {
      valorPago: payForm.valorPago,
      dataPagamento: payForm.dataPagamento,
      formaPagamento: payForm.formaPagamento,
      contaBancariaId: payForm.contaBancariaId,
      juros: payForm.juros || undefined,
      desconto: payForm.desconto || undefined,
    })
    setSubmitting(false)
    if (result.sucesso) {
      setShowPayModal(false)
      setPayingCp(null)
      await loadData()
    } else {
      alert('Erro ao pagar: ' + (result.erro || 'Erro desconhecido'))
    }
  }

  // ─── Batch Pay ────────────────────────────────────────────────────
  const openBatchPay = () => {
    setBatchForm({
      dataPagamento: format(new Date(), 'yyyy-MM-dd'),
      formaPagamento: 'PIX',
      contaBancariaId: bankAccounts[0]?.id || '',
    })
    setShowBatchPayModal(true)
  }

  const handleBatchPay = async () => {
    if (!batchForm.contaBancariaId) return
    setSubmitting(true)
    const selected = filteredContas.filter((cp) => selectedIds.has(cp.id) && cp.status !== 'pago')
    let erros = 0
    for (const cp of selected) {
      const result = await quitarCP(cp.id, {
        valorPago: saldo(cp),
        dataPagamento: batchForm.dataPagamento,
        formaPagamento: batchForm.formaPagamento,
        contaBancariaId: batchForm.contaBancariaId,
      })
      if (!result.sucesso) erros++
    }
    setSubmitting(false)
    setShowBatchPayModal(false)
    setSelectedIds(new Set())
    await loadData()
    if (erros > 0) alert(`${erros} pagamento(s) falharam.`)
  }

  const openBatchCategorize = () => {
    setBatchCategorize({ contaContabilId: '', centroCustoId: '' })
    setShowBatchCategorizeModal(true)
  }

  const handleBatchCategorize = async () => {
    if (!batchCategorize.contaContabilId && !batchCategorize.centroCustoId) return
    setSubmitting(true)
    const selected = filteredContas.filter((cp) => selectedIds.has(cp.id))
    const db = activeClient as any
    const patch: Record<string, any> = {}
    if (batchCategorize.contaContabilId) patch.conta_contabil_id = batchCategorize.contaContabilId
    if (batchCategorize.centroCustoId) patch.centro_custo_id = batchCategorize.centroCustoId

    let erros = 0
    const results = await Promise.all(
      selected.map((cp) => db.from('contas_pagar').update(patch).eq('id', cp.id))
    )
    for (const r of results) {
      if (r.error) {
        erros++
        console.error('[batchCategorize]', r.error)
      }
    }
    setSubmitting(false)
    setShowBatchCategorizeModal(false)
    setSelectedIds(new Set())
    await loadData()
    if (erros > 0) alert(`${erros} de ${selected.length} titulo(s) nao puderam ser reclassificados.`)
  }

  // ─── New CP ───────────────────────────────────────────────────────
  const resetNewForm = () => ({
    credorNome: '',
    descricao: '',
    supplierId: '',
    valor: 0,
    dataVencimento: format(new Date(), 'yyyy-MM-dd'),
    competencia: '',
    contaContabilId: '',
    centroCustoId: '',
    recorrencia: 'sem' as Recorrencia,
    numParcelas: 3,
    codigoBarras: '',
    fileUrl: '',
    isFixedCost: false,
  })

  const openNewModal = () => {
    setNewForm(resetNewForm())
    setEditingCpId(null)
    setShowNewModal(true)
  }

  const openEditModal = (cp: ContaPagar) => {
    // Recupera o credor: tabela contas_pagar guarda só credor_nome/credor_cpf_cnpj
    // (não tem FK), então busca match nos cadastros locais por CPF/CNPJ ou nome.
    const cpfClean = (cp.credor_cpf_cnpj || '').replace(/\D/g, '')
    const nomeLower = (cp.credor_nome || '').trim().toLowerCase()
    let credorTipo: CredorTipo = 'fornecedor'
    let credorId = ''
    const matchSupplier = suppliers.find(s =>
      (cpfClean && (s.cpf_cnpj || '').replace(/\D/g, '') === cpfClean) ||
      (s.razao_social || '').trim().toLowerCase() === nomeLower
    )
    if (matchSupplier) {
      credorTipo = 'fornecedor'
      credorId = matchSupplier.id
    } else {
      const matchEmployee = employees.find(emp =>
        (cpfClean && (emp.cpf || '').replace(/\D/g, '') === cpfClean) ||
        ((emp.nome_completo || emp.name || '').trim().toLowerCase() === nomeLower)
      )
      if (matchEmployee) {
        credorTipo = 'funcionario'
        credorId = matchEmployee.id
      } else {
        const matchClient = clients.find(c =>
          (c.razao_social || '').trim().toLowerCase() === nomeLower
        )
        if (matchClient) {
          credorTipo = 'cliente'
          credorId = matchClient.id
        }
      }
    }
    setNewForm({
      credorNome: cp.credor_nome || '',
      descricao: cp.descricao || cp.credor_nome || '',
      credorTipo,
      credorId,
      valor: cp.valor || 0,
      dataVencimento: cp.data_vencimento || format(new Date(), 'yyyy-MM-dd'),
      competencia: cp.competencia || '',
      contaContabilId: cp.conta_contabil_id || '',
      centroCustoId: cp.centro_custo_id || '',
      recorrencia: 'sem',
      numParcelas: 3,
      codigoBarras: cp.codigo_barras || '',
      fileUrl: cp.file_url || '',
      isFixedCost: !!cp.is_fixed_cost,
    })
    setEditingCpId(cp.id)
    setDropdownOpen(null)
    setShowNewModal(true)
  }

  const handleFileUpload = async (file: File, autoRead = false) => {
    if (!selectedCompany) return
    try {
      setIsUploading(true)
      const fileExt = file.name.split('.').pop()
      const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`
      const filePath = `${selectedCompany.id}/payables/${fileName}`

      const { error: uploadError } = await (activeClient as any).storage
        .from('documents')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = (activeClient as any).storage
        .from('documents')
        .getPublicUrl(filePath)

      setNewForm(prev => ({ ...prev, fileUrl: publicUrl }))

      // Leitura automática do boleto
      if (autoRead) {
        await handleLerBoleto(file)
      }
    } catch (error) {
      console.error('[upload]', error)
      alert('Erro no upload do arquivo')
    } finally {
      setIsUploading(false)
    }
  }

  const handleLerBoleto = async (file: File) => {
    try {
      setIsReadingBoleto(true)

      // Converter arquivo para base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          // Remover o prefixo "data:...;base64,"
          resolve(result.split(',')[1])
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const mimeType = file.type || 'image/png'

      // Chamar Edge Function
      const { data, error } = await (activeClient as any).functions.invoke('ler-boleto', {
        body: { fileBase64: base64, mimeType },
      })

      if (error) throw error
      if (data?.error) throw new Error(data.error)

      let avisoCodigo = ''
      if (data?.codigo_barras) {
        const parsed = linhaDigitavelToBarcode(data.codigo_barras)
        if (!parsed.ok) {
          avisoCodigo = `\n\nAtencao: o codigo de barras lido parece invalido (${parsed.error}). Confira a linha digitavel na fatura antes de salvar.`
        }
      }

      // Preencher formulário com dados extraídos
      setNewForm(prev => ({
        ...prev,
        descricao: data.descricao || prev.descricao,
        credorNome: data.fornecedor || prev.credorNome,
        valor: data.valor || prev.valor,
        dataVencimento: data.vencimento || prev.dataVencimento,
        competencia: data.competencia || prev.competencia,
        codigoBarras: data.codigo_barras || prev.codigoBarras,
      }))

      alert('Boleto lido com sucesso! Verifique os campos preenchidos.' + avisoCodigo)
    } catch (error: any) {
      console.error('[lerBoleto]', error)
      alert('Erro ao ler boleto: ' + (error.message || 'Tente novamente'))
    } finally {
      setIsReadingBoleto(false)
    }
  }

  const handleCreateCP = async () => {
    if (!selectedCompany || !newForm.descricao || !newForm.valor || !newForm.dataVencimento) return

    if (newForm.codigoBarras && newForm.codigoBarras.trim()) {
      const result = linhaDigitavelToBarcode(newForm.codigoBarras)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
    }

    setSubmitting(true)

    // Resolver nome do credor baseado no tipo selecionado
    let credorNome = newForm.credorNome || newForm.descricao
    if (newForm.credorId) {
      if (newForm.credorTipo === 'fornecedor') {
        const sup = suppliers.find(s => s.id === newForm.credorId)
        if (sup) credorNome = sup.razao_social
      } else if (newForm.credorTipo === 'funcionario') {
        const emp = employees.find(e => e.id === newForm.credorId)
        if (emp) credorNome = emp.nome_completo || emp.name || credorNome
      } else if (newForm.credorTipo === 'cliente') {
        const cli = clients.find(c => c.id === newForm.credorId)
        if (cli) credorNome = cli.razao_social
      }
    }

    const base: Record<string, any> = {
      company_id: selectedCompany.id,
      credor_nome: toTitleCase(credorNome),
      descricao: newForm.descricao ? toTitleCase(newForm.descricao) : null,
      valor: newForm.valor,
      status: 'aberto',
      conta_contabil_id: newForm.contaContabilId || null,
      centro_custo_id: newForm.centroCustoId || null,
      competencia: newForm.competencia || null,
      codigo_barras: newForm.codigoBarras || null,
      file_url: newForm.fileUrl || null,
      is_fixed_cost: !!newForm.isFixedCost,
    }

    const db = activeClient as any

    // ─── Anti-duplicata (heuristica): mesmo credor + valor + vencimento ───
    if (!editingCpId && newForm.recorrencia === 'sem') {
      const dup = await db
        .from('contas_pagar')
        .select('id')
        .eq('company_id', selectedCompany.id)
        .eq('credor_nome', credorNome)
        .eq('valor', newForm.valor)
        .eq('data_vencimento', newForm.dataVencimento)
        .is('deleted_at', null)
        .neq('status', 'cancelado')
        .limit(1)
      if (dup.data && dup.data.length > 0) {
        setSubmitting(false)
        const ok = await confirm({
          title: 'Lancamento parecido encontrado',
          description: `Ja existe um titulo de "${credorNome}" no valor de ${formatBRL(newForm.valor)} vencendo em ${formatData(newForm.dataVencimento)}. Deseja criar mesmo assim?`,
          confirmLabel: 'Criar mesmo assim',
          variant: 'destructive',
        })
        if (!ok) return
        setSubmitting(true)
      }
    }

    const isCodigoBarrasDup = (err: any) =>
      err?.code === '23505' && String(err?.message || '').includes('uq_contas_pagar_codigo_barras')

    if (editingCpId) {
      // Edição
      const { error } = await db
        .from('contas_pagar')
        .update({
          ...base,
          data_vencimento: newForm.dataVencimento,
        })
        .eq('id', editingCpId)

      setSubmitting(false)
      if (error) {
        console.error('[editarCP]', error)
        if (isCodigoBarrasDup(error)) {
          alert('Ja existe outra conta a pagar ativa com este codigo de barras nesta empresa.')
        } else {
          alert('Erro ao editar: ' + error.message)
        }
      } else {
        setShowNewModal(false)
        setEditingCpId(null)
        await loadData()
      }
    } else {
      // Criação
      const inserts: any[] = []
      if (newForm.recorrencia === 'sem') {
        inserts.push({ ...base, valor_pago: 0, data_vencimento: newForm.dataVencimento })
      } else {
        let dataAtual = newForm.dataVencimento
        for (let i = 0; i < newForm.numParcelas; i++) {
          inserts.push({
            ...base,
            // codigo_barras so na primeira parcela (UNIQUE bloquearia parcelas com mesmo codigo)
            codigo_barras: i === 0 ? base.codigo_barras : null,
            valor_pago: 0,
            data_vencimento: dataAtual,
          })
          dataAtual = calcularProximoVencimento(dataAtual, newForm.recorrencia)
        }
      }

      const { error } = await db.from('contas_pagar').insert(inserts)
      setSubmitting(false)

      if (error) {
        console.error('[criarCP]', error)
        if (isCodigoBarrasDup(error)) {
          alert('Ja existe outra conta a pagar ativa com este codigo de barras nesta empresa.')
        } else {
          alert('Erro ao criar: ' + error.message)
        }
      } else {
        setShowNewModal(false)
        await loadData()
      }
    }
  }

  const handleArquivar = async (cp: ContaPagar) => {
    const ok = await confirm({ title: `Arquivar conta "${cp.descricao || cp.credor_nome}"?`, description: "A conta sera movida para o arquivo e nao aparecera mais na listagem.", confirmLabel: "Sim, arquivar", variant: "default" })
    if (!ok) return
    await (activeClient as any).from('contas_pagar').update({ status: 'arquivado' }).eq('id', cp.id)
    setDropdownOpen(null)
    await loadData()
  }

  // ─── Actions (dropdown) ──────────────────────────────────────────
  const handleCancelar = async (cp: ContaPagar) => {
    const db = activeClient as any
    const isPago = cp.status === 'pago' || cp.status === 'parcial'

    if (isPago) {
      const ok = await confirm({
        title: `Cancelar pagamento de "${cp.descricao || cp.credor_nome}"?`,
        description: 'O pagamento sera revertido, a movimentacao bancaria sera removida e a conta voltara como aberta.',
        confirmLabel: 'Sim, cancelar pagamento',
        variant: 'destructive',
      })
      if (!ok) return

      const { error: errMov } = await db
        .from('movimentacoes')
        .delete()
        .eq('conta_pagar_id', cp.id)
      if (errMov) {
        console.error('[handleCancelar] erro deletando movimentacao:', errMov)
        toast.error('Erro ao reverter movimentacao bancaria')
        return
      }

      const { error: errCp } = await db
        .from('contas_pagar')
        .update({
          status: 'aberto',
          valor_pago: 0,
          data_pagamento: null,
          forma_pagamento: null,
          conta_bancaria_id: null,
        })
        .eq('id', cp.id)
      if (errCp) {
        console.error('[handleCancelar] erro atualizando CP:', errCp)
        toast.error('Erro ao reverter pagamento')
        return
      }

      toast.success('Pagamento cancelado, conta voltou como aberta')
      setDropdownOpen(null)
      await loadData()
      return
    }

    const ok = await confirm({
      title: `Cancelar conta "${cp.descricao || cp.credor_nome}"?`,
      description: 'O lancamento sera marcado como cancelado.',
      confirmLabel: 'Sim, cancelar conta',
      variant: 'destructive',
    })
    if (!ok) return
    await db.from('contas_pagar').update({ status: 'cancelado' }).eq('id', cp.id)
    setDropdownOpen(null)
    await loadData()
  }

  const handleRenegociar = async (cp: ContaPagar) => {
    const novaData = prompt('Nova data de vencimento (YYYY-MM-DD):', cp.data_vencimento)
    if (!novaData) return
    await (activeClient as any).from('contas_pagar').update({ data_vencimento: novaData }).eq('id', cp.id)
    setDropdownOpen(null)
    await loadData()
  }

  const handleDividir = async (cp: ContaPagar) => {
    const numStr = prompt('Dividir em quantas parcelas?', '2')
    if (!numStr) return
    const num = parseInt(numStr)
    if (isNaN(num) || num < 2) return
    const valorParcela = Math.round((saldo(cp) / num) * 100) / 100

    const inserts = []
    let dataAtual = cp.data_vencimento
    for (let i = 0; i < num; i++) {
      inserts.push({
        company_id: cp.company_id,
        credor_nome: cp.credor_nome,
        credor_cpf_cnpj: cp.credor_cpf_cnpj,
        valor: valorParcela,
        valor_pago: 0,
        data_vencimento: dataAtual,
        status: 'aberto',
        conta_contabil_id: cp.conta_contabil_id,
        centro_custo_id: cp.centro_custo_id,
      })
      dataAtual = calcularProximoVencimento(dataAtual, 'mensal')
    }

    await (activeClient as any).from('contas_pagar').update({ status: 'cancelado' }).eq('id', cp.id)
    await (activeClient as any).from('contas_pagar').insert(inserts)
    setDropdownOpen(null)
    await loadData()
  }

  // Close dropdown on outside click / scroll / resize
  useEffect(() => {
    if (!dropdownOpen) return
    const handler = () => { setDropdownOpen(null); setDropdownCoords(null) }
    window.addEventListener('click', handler)
    window.addEventListener('scroll', handler, true)
    window.addEventListener('resize', handler)
    return () => {
      window.removeEventListener('click', handler)
      window.removeEventListener('scroll', handler, true)
      window.removeEventListener('resize', handler)
    }
  }, [dropdownOpen])

  // ─── Lookup helpers ───────────────────────────────────────────────
  const contaContabilMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const c of chartAccounts) m[c.id] = `${c.code} - ${c.name}`
    return m
  }, [chartAccounts])

  // Agenda agrupada por plano de contas (depende de agendaDiaLista + contaContabilMap).
  // Ordenado por total desc — o que mais pesa aparece primeiro no painel/WhatsApp.
  const agendaAgrupadoPorPlano = useMemo(() => {
    const groups = new Map<string, { items: typeof agendaDiaLista; total: number }>()
    for (const cp of agendaDiaLista) {
      const plano = cp.conta_contabil_id
        ? (contaContabilMap[cp.conta_contabil_id] || 'Sem plano de contas')
        : 'Sem plano de contas'
      const g = groups.get(plano) || { items: [], total: 0 }
      g.items.push(cp)
      g.total += cp._pendente
      groups.set(plano, g)
    }
    return Array.from(groups.entries())
      .map(([plano, g]) => ({ plano, ...g }))
      .sort((a, b) => b.total - a.total)
  }, [agendaDiaLista, contaContabilMap])

  const centroCustoMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const c of centrosCusto) m[c.id] = `${c.codigo} - ${c.descricao}`
    return m
  }, [centrosCusto])

  // ─── Status badge ────────────────────────────────────────────────
  const StatusBadge = ({ status }: { status: string }) => {
    const config: Record<string, { dot: string; text: string; bg: string; label: string }> = {
      aberto: { dot: '#EA580C', text: '#EA580C', bg: '#FFF0EB', label: 'Em aberto' },
      parcial: { dot: '#059669', text: '#059669', bg: '#ECFDF4', label: 'Parcial' },
      vencido: { dot: '#E53E3E', text: '#E53E3E', bg: '#FEE2E2', label: 'Vencido' },
      pago: { dot: '#039855', text: '#039855', bg: '#e1f5ee', label: 'Pago' },
    }
    const c = config[status] || config.aberto
    return (
      <span
        className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold px-2.5 py-1 rounded-full"
        style={{ color: c.text, backgroundColor: c.bg, fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: c.dot, flexShrink: 0 }} />
        {c.label}
      </span>
    )
  }

  // ─── Categoria badge (inferred from conta_contabil name) ──────────
  const inferCategoria = (cp: ContaPagar): string => {
    if (!cp.conta_contabil_id) return 'Outros'
    const name = (contaContabilMap[cp.conta_contabil_id] || '').toLowerCase()
    if (name.includes('fornec')) return 'Fornecedor'
    if (name.includes('alugu') || name.includes('ocupa')) return 'Ocupacao'
    if (name.includes('imposto') || name.includes('fiscal') || name.includes('tribut')) return 'Fiscal'
    if (name.includes('salari') || name.includes('pessoal') || name.includes('folha')) return 'Pessoal'
    if (name.includes('tecno') || name.includes('software') || name.includes('licen')) return 'Tecnologia'
    if (name.includes('admin')) return 'Administrativo'
    return 'Outros'
  }

  // ─── PDF: Relatório Mensal de Contas Previstas ───────────────────
  const exportarPrevistasPDF = () => {
    const previstas = filteredContas.filter(
      (cp) => cp.status !== 'pago' && cp.status !== 'cancelado'
    )
    if (previstas.length === 0) {
      toast.error('Nenhuma conta prevista no período selecionado')
      return
    }

    const empresa = (selectedCompany as any)?.nome_fantasia || (selectedCompany as any)?.razao_social || ''
    const periodo =
      dateFrom && dateTo
        ? `${format(parseISO(dateFrom), 'dd/MM/yyyy')} a ${format(parseISO(dateTo), 'dd/MM/yyyy')}`
        : 'Todas as datas'

    const W = 210
    const H = 297
    const MARGIN = 15
    const HEADER_H = 28
    const FOOTER_H = 14
    const contentW = W - MARGIN * 2
    const BRAND = [26, 46, 74] as const
    const RED = [180, 30, 30] as const
    const ORANGE = [234, 88, 12] as const
    const MUTED = [110, 110, 110] as const

    const fmt = (v: number) =>
      v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })

    // Agrupa por urgência
    const grupos: { key: UrgencyGroup; label: string; cor: readonly [number, number, number]; items: ContaPagar[] }[] = [
      { key: 'vencidos', label: 'VENCIDOS', cor: RED, items: [] },
      { key: 'hoje', label: 'VENCE HOJE', cor: RED, items: [] },
      { key: 'proximos7', label: 'PRÓXIMOS 7 DIAS', cor: ORANGE, items: [] },
      { key: 'proximos30', label: 'PRÓXIMOS 30 DIAS', cor: BRAND, items: [] },
    ]
    for (const cp of previstas) {
      const g = classifyUrgency(cp)
      const bucket = grupos.find((x) => x.key === g)
      if (bucket) bucket.items.push(cp)
    }
    grupos.forEach((g) =>
      g.items.sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento))
    )

    const totalGeral = previstas.reduce((s, cp) => s + saldo(cp), 0)
    const totalVencidos = grupos[0].items.reduce((s, cp) => s + saldo(cp), 0)
    const totalHoje = grupos[1].items.reduce((s, cp) => s + saldo(cp), 0)
    const total7 = grupos[2].items.reduce((s, cp) => s + saldo(cp), 0)

    // Layout colunas (mm)
    const cols = {
      venc: { x: MARGIN + 2, w: 18, label: 'Vencimento' },
      credor: { x: MARGIN + 22, w: 60, label: 'Credor' },
      plano: { x: MARGIN + 84, w: 50, label: 'Plano de Contas' },
      centro: { x: MARGIN + 136, w: 22, label: 'Centro' },
      valor: { x: W - MARGIN - 2, w: 22, label: 'Valor (R$)' },
    }

    const drawHeader = () => {
      doc.setFillColor(BRAND[0], BRAND[1], BRAND[2])
      doc.rect(0, 0, W, 4, 'F')

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
      doc.text(empresa.toUpperCase(), MARGIN, 11)
      doc.text(`Emitido em ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, W - MARGIN, 11, { align: 'right' })

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(14)
      doc.setTextColor(BRAND[0], BRAND[1], BRAND[2])
      doc.text('Relatório de Contas a Pagar Previstas', MARGIN, 19)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(80, 80, 80)
      doc.text(`Período: ${periodo}  ·  ${previstas.length} título(s)`, MARGIN, 24.5)

      doc.setDrawColor(220, 220, 220)
      doc.setLineWidth(0.3)
      doc.line(MARGIN, HEADER_H, W - MARGIN, HEADER_H)
    }

    const drawTableHead = (y: number) => {
      doc.setFillColor(242, 245, 249)
      doc.rect(MARGIN, y, contentW, 8, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      doc.setTextColor(40, 40, 40)
      doc.text(cols.venc.label, cols.venc.x, y + 5.3)
      doc.text(cols.credor.label, cols.credor.x, y + 5.3)
      doc.text(cols.plano.label, cols.plano.x, y + 5.3)
      doc.text(cols.centro.label, cols.centro.x, y + 5.3)
      doc.text(cols.valor.label, cols.valor.x, y + 5.3, { align: 'right' })
      return y + 9
    }

    const drawFooter = () => {
      const total = doc.getNumberOfPages()
      for (let p = 1; p <= total; p++) {
        doc.setPage(p)
        doc.setDrawColor(220, 220, 220)
        doc.setLineWidth(0.3)
        doc.line(MARGIN, H - FOOTER_H + 2, W - MARGIN, H - FOOTER_H + 2)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
        doc.text('Tatica Gestão — Relatório gerado automaticamente', MARGIN, H - 6)
        doc.text(`Página ${p} de ${total}`, W - MARGIN, H - 6, { align: 'right' })
      }
    }

    const drawPageChrome = () => {
      drawHeader()
      return drawTableHead(HEADER_H + 6)
    }

    const ensureSpace = (y: number, needed: number): number => {
      if (y + needed > H - FOOTER_H) {
        doc.addPage()
        return drawPageChrome()
      }
      return y
    }

    // Página 1: header + KPIs + tabela
    drawHeader()
    let y = HEADER_H + 6

    // KPIs
    const kpiW = (contentW - 9) / 4
    const kpis = [
      { label: 'TOTAL PREVISTO', val: fmt(totalGeral), color: BRAND },
      { label: 'VENCIDOS', val: fmt(totalVencidos), color: RED },
      { label: 'VENCE HOJE', val: fmt(totalHoje), color: RED },
      { label: 'PRÓX. 7 DIAS', val: fmt(total7), color: ORANGE },
    ]
    kpis.forEach((k, i) => {
      const kx = MARGIN + i * (kpiW + 3)
      doc.setDrawColor(230, 230, 230)
      doc.setFillColor(250, 251, 253)
      doc.roundedRect(kx, y, kpiW, 16, 1.5, 1.5, 'FD')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
      doc.text(k.label, kx + 3, y + 5.5)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(k.color[0], k.color[1], k.color[2])
      doc.text(k.val, kx + 3, y + 12.5)
    })
    y += 22

    y = drawTableHead(y)

    // Truncate helper baseado em largura (mm) com chars aproximados
    const truncate = (s: string, max: number) =>
      !s ? '—' : s.length > max ? s.slice(0, max - 1) + '…' : s

    // Renderiza cada grupo
    for (const g of grupos) {
      if (g.items.length === 0) continue
      const subtotal = g.items.reduce((s, cp) => s + saldo(cp), 0)

      y = ensureSpace(y, 10)
      doc.setFillColor(g.cor[0], g.cor[1], g.cor[2])
      doc.rect(MARGIN, y, contentW, 6.5, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(255, 255, 255)
      doc.text(`${g.label}  (${g.items.length})`, MARGIN + 3, y + 4.5)
      doc.text(fmt(subtotal), W - MARGIN - 2, y + 4.5, { align: 'right' })
      y += 8

      let zebra = false
      for (const cp of g.items) {
        y = ensureSpace(y, 6)
        if (zebra) {
          doc.setFillColor(252, 252, 253)
          doc.rect(MARGIN, y, contentW, 5.4, 'F')
        }
        zebra = !zebra

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(60, 60, 60)
        doc.text(format(parseISO(cp.data_vencimento), 'dd/MM/yyyy'), cols.venc.x, y + 3.8)
        doc.text(truncate(cp.descricao || cp.credor_nome || '—', 32), cols.credor.x, y + 3.8)

        const plano = cp.conta_contabil_id ? contaContabilMap[cp.conta_contabil_id] || '—' : '—'
        doc.text(truncate(plano, 28), cols.plano.x, y + 3.8)

        const centro = cp.centro_custo_id ? centroCustoMap[cp.centro_custo_id] || '—' : '—'
        doc.text(truncate(centro, 12), cols.centro.x, y + 3.8)

        doc.setFont('helvetica', 'bold')
        doc.setTextColor(g.cor[0], g.cor[1], g.cor[2])
        doc.text(fmt(saldo(cp)), cols.valor.x, y + 3.8, { align: 'right' })
        y += 5.4
      }
      y += 2
    }

    // Total geral
    y = ensureSpace(y, 18)
    y += 2
    doc.setDrawColor(BRAND[0], BRAND[1], BRAND[2])
    doc.setLineWidth(0.5)
    doc.line(MARGIN, y, W - MARGIN, y)
    y += 7
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(BRAND[0], BRAND[1], BRAND[2])
    doc.text('Total Previsto', MARGIN, y)
    doc.text(fmt(totalGeral), W - MARGIN, y, { align: 'right' })

    drawFooter()

    const fileName =
      dateFrom && dateTo
        ? `Contas_Previstas_${dateFrom}_${dateTo}.pdf`
        : `Contas_Previstas_${format(new Date(), 'yyyy-MM-dd')}.pdf`
    doc.save(fileName)
    toast.success('Relatório exportado em PDF')
  }

  // ─── KPI Card ─────────────────────────────────────────────────────
  const KPICard = ({
    label,
    value,
    subtitle,
    headerBg,
  }: {
    label: string
    value: number
    subtitle: string
    badge?: string
    headerBg: string
    badgeBg?: string
    badgeText?: string
  }) => (
    <div
      className="bg-white border border-[#EAECF0] rounded-xl p-5 flex flex-col gap-2"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)' }}
    >
      <div className="text-[13px] font-bold text-[#1D2939] uppercase tracking-[0.05em] whitespace-nowrap">
        {label}
      </div>
      <div
        className="font-extrabold leading-[1.1]"
        style={{
          color: headerBg,
          fontSize: 'clamp(18px, 1.8vw, 26px)',
          letterSpacing: '-0.5px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formatBRL(value)}
      </div>
      <p className="text-[12px] text-[#98A2B3]">{subtitle}</p>
    </div>
  )

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <AppLayout title="Contas a Pagar">
      <div className="max-w-[1400px] mx-auto space-y-6 p-6" style={{ backgroundColor: '#F6F2EB', minHeight: '100%' }}>

        <PendenciasBanner variant="full" filter="debito" />
        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Total a pagar', value: formatBRL(kpis.totalPagar), color: '#059669', sub: `${kpis.totalCount} t\u00edtulo${kpis.totalCount !== 1 ? 's' : ''} em aberto no per\u00edodo` },
            { label: 'Vence hoje', value: formatBRL(kpis.venceHoje), color: '#E53E3E', sub: `${kpis.hojeCount} t\u00edtulo${kpis.hojeCount !== 1 ? 's' : ''} vencendo` },
            { label: 'Pr\u00f3ximos 7 dias', value: formatBRL(kpis.prox7), color: '#EA580C', sub: `${kpis.prox7Count} t\u00edtulo${kpis.prox7Count !== 1 ? 's' : ''} a vencer` },
            { label: 'Pago no per\u00edodo', value: formatBRL(kpis.pagoPeriodo), color: '#039855', sub: `${kpis.pagoPeriodoCount} t\u00edtulo${kpis.pagoPeriodoCount !== 1 ? 's' : ''} quitado${kpis.pagoPeriodoCount !== 1 ? 's' : ''}` },
          ].map(kpi => (
            <div key={kpi.label} className="bg-white border border-[#EAECF0] rounded-xl px-4 py-3 min-w-0" style={{ boxShadow: '0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)' }}>
              <p className="text-[11.5px] font-bold uppercase tracking-[0.04em] text-black m-0 whitespace-nowrap">{kpi.label}</p>
              <p className="mt-1.5 font-extrabold truncate" style={{ fontSize: 18, color: kpi.color, letterSpacing: '-0.02em', lineHeight: 1.15 }}>{kpi.value}</p>
              <p className="text-[11px] text-[#98A2B3] mt-1 truncate">{kpi.sub}</p>
            </div>
          ))}
        </div>

        {/* ── Filtro de periodo (padrao do sistema) ── */}
        <div className="flex justify-end">
          <PeriodFilter
            from={dateFrom}
            to={dateTo}
            onApply={(f, t) => { setDateFrom(f); setDateTo(t); setDatePreset('personalizado') }}
          />
        </div>

        {/* ── Agenda do mês (esquerda) + Contas do dia (direita) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Agenda heatmap */}
          <CollapsibleCard
            storageKey="cp-agenda-pagamentos"
            title="Agenda de Pagamentos"
            subtitle={`${agendaMes.mesRotulo} · ${agendaMes.diasComSaida} dia${agendaMes.diasComSaida !== 1 ? 's' : ''} com saída · clique em um dia`}
            rightSlot={
              <div className="flex items-center gap-1.5 text-[10.5px] text-[#98A2B3]">
                <span>Menos</span>
                {['#F3F4F6', '#FECACA', '#FCA5A5', '#E53E3E', '#B91C1C'].map((c) => (
                  <span key={c} style={{ width: 12, height: 12, background: c, borderRadius: 3, border: c === '#F3F4F6' ? '1px solid #EAECF0' : 'none' }} />
                ))}
                <span>Mais</span>
              </div>
            }
            bodyClassName="px-5 py-5"
          >
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
                    {agendaMes.weeks.map((_, wi) => {
                      const monthAtCol = agendaMes.monthLabels.find(m => m.weekIndex === wi)
                      return (
                        <div key={wi} className="flex-1" style={{ fontSize: 11, fontWeight: 600, color: '#667085', marginLeft: wi > 0 && agendaMes.monthLabels.some(m => m.weekIndex === wi) ? 6 : 0 }}>
                          {monthAtCol?.label || ''}
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex gap-1.5">
                    {agendaMes.weeks.map((week, wi) => (
                      <div key={wi} className="flex flex-col gap-1.5 flex-1 min-w-0" style={{ marginLeft: wi > 0 && agendaMes.monthLabels.some(m => m.weekIndex === wi) ? 6 : 0 }}>
                        {week.map((day, di) => day ? (
                          <button
                            key={di}
                            type="button"
                            onClick={() => setSelectedAgendaDate(d => d === day.dateStr ? null : day.dateStr)}
                            title={`${format(day.date, 'dd/MM')}${day.value > 0 ? ` · ${formatBRL(day.value)} · ${day.count} t\u00edtulo${day.count !== 1 ? 's' : ''}` : ' · sem pagamentos'}`}
                            className="transition-transform hover:scale-110"
                            style={{
                              width: '100%', aspectRatio: '1 / 1', maxWidth: 40, minHeight: 32, height: 32, borderRadius: 6,
                              background: agendaColor(day.value, agendaMes.max),
                              border: selectedAgendaDate === day.dateStr
                                ? '2px solid #1D2939'
                                : day.value === 0 ? '1px solid #EAECF0' : 'none',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 11, fontWeight: 700,
                              color: day.value === 0 ? '#98A2B3' : (day.value / (agendaMes.max || 1)) >= 0.5 ? '#fff' : '#7F1D1D',
                              cursor: 'pointer',
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
              {/* Rodapé com total do mês */}
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#EAECF0]">
                <span className="text-[11.5px] text-[#98A2B3] font-semibold uppercase tracking-wide">Total previsto no mês</span>
                <span className="text-[16px] font-extrabold text-[#E53E3E] tracking-[-0.01em] tabular-nums">{formatBRL(agendaMes.total)}</span>
              </div>
          </CollapsibleCard>

          {/* Contas a vencer (painel lateral) */}
          <div className="bg-white border border-[#EAECF0] rounded-xl overflow-hidden flex flex-col" style={{ boxShadow: '0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#EAECF0]">
              <div>
                <div className="text-[20px] font-extrabold text-[#1D2939] tracking-[-0.02em]">
                  {selectedAgendaDate && selectedAgendaDate === format(new Date(), 'yyyy-MM-dd')
                    ? 'Contas a pagar hoje'
                    : selectedAgendaDate
                      ? 'Contas a pagar'
                      : 'Contas a vencer'}
                </div>
                <div className="text-[12px] text-[#98A2B3] mt-1">
                  {selectedAgendaDate
                    ? `${format(parseISO(selectedAgendaDate), 'dd/MM/yyyy')} · agrupado por plano de contas`
                    : 'Próximos 30 dias · agrupado por plano de contas'}
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
                    const hoje = format(new Date(), 'yyyy-MM-dd')
                    const titulo = selectedAgendaDate
                      ? (selectedAgendaDate === hoje
                        ? `*CONTAS A PAGAR HOJE, ${format(parseISO(selectedAgendaDate), 'dd/MM')}*`
                        : `*CONTAS A PAGAR DIA ${format(parseISO(selectedAgendaDate), 'dd/MM/yyyy')}*`)
                      : '*CONTAS A PAGAR \u2014 PR\u00d3XIMOS 30 DIAS*'
                    const blocos = agendaAgrupadoPorPlano.map(g => {
                      const itens = g.items.map(cp => {
                        const dataPrefix = selectedAgendaDate ? '' : `${format(parseISO(cp.data_vencimento), 'dd/MM')} \u2014 `
                        return `${dataPrefix}${cp.descricao || cp.credor_nome} \u2014 ${formatBRL(cp._pendente)}`
                      }).join('\n')
                      return `*${g.plano}*\n${itens}`
                    }).join('\n\n')
                    const total = `*TOTAL A PAGAR: ${formatBRL(agendaDiaTotal)}*`
                    const texto = `${titulo}\n\n${blocos}\n\n${total}`
                    try {
                      await navigator.clipboard.writeText(texto)
                      toast.success('Lista copiada! Cole no WhatsApp.')
                    } catch {
                      toast.error('N\u00e3o foi poss\u00edvel copiar')
                    }
                  }}
                  title="Copiar lista agrupada por plano de contas para WhatsApp"
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
                  Nenhuma conta a vencer {selectedAgendaDate ? 'nesta data' : 'nos pr\u00f3ximos 30 dias'}.
                </div>
              ) : (() => {
                // Layout agrupado por plano de contas, sem paginação dentro do painel:
                // cada plano vira uma seção com seu próprio total e os itens listados embaixo.
                return (
                <>
                <div className="divide-y divide-[#F2F4F7]">
                  {agendaAgrupadoPorPlano.map(g => (
                    <div key={g.plano}>
                      <div className="px-5 py-2 bg-[#F9FAFB] flex items-center justify-between sticky top-0 z-[1]">
                        <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#1D2939] truncate" style={{ maxWidth: 280 }} title={g.plano}>
                          {g.plano}
                        </span>
                        <span className="text-[11px] font-bold text-[#E53E3E] tabular-nums">
                          {formatBRL(g.total)}
                        </span>
                      </div>
                      <ul>
                        {g.items.map(cp => (
                          <li key={cp.id} className="px-5 py-2 flex items-center justify-between gap-3 hover:bg-[#FAFAFA] transition-colors">
                            <div className="min-w-0">
                              <div className="text-[12.5px] font-medium text-[#1D2939] truncate" style={{ maxWidth: 280 }} title={cp.descricao || cp.credor_nome}>
                                {cp.descricao || cp.credor_nome}
                              </div>
                              {!selectedAgendaDate && (
                                <div className="text-[10.5px] text-[#98A2B3]">
                                  {format(parseISO(cp.data_vencimento), 'dd/MM')}
                                </div>
                              )}
                            </div>
                            <span className="text-[12.5px] font-semibold text-[#1D2939] tabular-nums shrink-0">
                              {formatBRL(cp._pendente)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                </>
                )
              })()}
            </div>

            <div className="px-5 py-3 border-t border-[#EAECF0] bg-[#F9FAFB] flex items-center justify-between">
              <span className="text-[11.5px] font-bold uppercase tracking-wide text-[#1D2939]">Total a pagar</span>
              <span className="text-[18px] font-extrabold text-[#E53E3E] tracking-[-0.01em] tabular-nums">
                {formatBRL(agendaDiaTotal)}
              </span>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="bg-white border border-[#EAECF0] rounded-xl overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)' }}>
          {/* Header */}
          <div className="bg-[#2A2724] px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-white uppercase tracking-widest">T&iacute;tulos</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-white bg-white/15">{filteredContas.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={exportarPrevistasPDF}
                title="Exportar contas previstas em PDF"
                className="flex items-center gap-1.5 text-[11px] font-semibold text-white/90 hover:text-white border border-white/30 px-3 py-1 rounded-md hover:bg-white/10 transition"
              >
                <Download size={12} /> Exportar PDF
              </button>
            </div>
          </div>
          {/* Batch selection bar */}
          {selectedIds.size > 0 && (
            <div className="px-5 py-3 border-b border-[#EAECF0] bg-[#F9FAFB] flex items-center justify-between">
              <p className="text-[13px] font-semibold text-[#059669]">
                {selectedIds.size} t&iacute;tulo{selectedIds.size !== 1 ? 's' : ''} selecionado{selectedIds.size !== 1 ? 's' : ''} &mdash; {formatBRL(selectedTotal)}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs px-3 py-1.5 rounded-md border border-[#EAECF0] text-[#667085] hover:bg-white transition"
                >
                  Cancelar sele&ccedil;&atilde;o
                </button>
                <button
                  onClick={openBatchCategorize}
                  className="text-xs px-3 py-1.5 rounded-md border border-[#EAECF0] font-semibold text-[#059669] hover:bg-white transition"
                >
                  Categorizar
                </button>
                <button
                  onClick={openBatchPay}
                  className="text-xs px-3 py-1.5 rounded-md bg-[#059669] text-white font-semibold hover:bg-[#243d5f] transition"
                >
                  Pagar selecionados
                </button>
              </div>
            </div>
          )}

          <div className="p-5">
            {/* Filtros compactos (padrão Vendas — minimizados, clique em "Mais filtros" para expandir) */}
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              {/* Search */}
              <div className="relative flex-1 min-w-[160px] max-w-[240px]">
                <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#98A2B3]" />
                <input
                  type="text"
                  placeholder="Buscar credor, valor..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-7 pr-2 h-7 text-[11.5px] border border-[#D0D5DD] rounded bg-white text-black placeholder-[#98A2B3] focus:outline-none focus:border-black"
                />
              </div>
              {/* Período */}
              <select
                value={datePreset}
                onChange={e => applyDatePreset(e.target.value)}
                className="px-2 h-7 text-[11.5px] border border-[#D0D5DD] rounded bg-white text-black focus:outline-none focus:border-black"
              >
                <option value="hoje">Hoje</option>
                <option value="semana">Pr&oacute;ximos 7 dias</option>
                <option value="mes_atual">M&ecirc;s atual</option>
                <option value="proximo_mes">Pr&oacute;ximo m&ecirc;s</option>
                <option value="trimestre">Trimestre</option>
                <option value="todos">Todas as datas</option>
                <option value="personalizado">Personalizado</option>
              </select>
              {/* Status */}
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="px-2 h-7 text-[11.5px] border border-[#D0D5DD] rounded bg-white text-black focus:outline-none focus:border-black"
              >
                <option value="todos">Todos os status</option>
                <option value="aberto">Em aberto</option>
                <option value="vencidos">Vencidos</option>
                <option value="pagos">Pagos</option>
              </select>
              {/* Setor */}
              <select
                value={sectorFilter}
                onChange={e => setSectorFilter(e.target.value)}
                className="px-2 h-7 text-[11.5px] border border-[#D0D5DD] rounded bg-white text-black focus:outline-none focus:border-black"
              >
                <option value="todos">Todos os setores</option>
                {centrosCusto.map(cc => (
                  <option key={cc.id} value={cc.id}>{cc.descricao}</option>
                ))}
              </select>
              {/* Limpar */}
              {(searchTerm || statusFilter !== 'todos' || sectorFilter !== 'todos' || datePreset !== 'mes_atual') && (
                <button
                  onClick={() => { setSearchTerm(''); setStatusFilter('todos'); setSectorFilter('todos'); applyDatePreset('mes_atual') }}
                  className="text-[11px] font-semibold text-[#667085] hover:text-black px-1.5 h-7"
                >
                  Limpar
                </button>
              )}
              <div className="flex-1" />
              {datePreset !== 'personalizado' && datePreset !== 'todos' && dateFrom && dateTo && (
                <span className="text-[10.5px] text-[#98A2B3] whitespace-nowrap">
                  {format(parseISO(dateFrom), 'dd/MM/yyyy')} &ndash; {format(parseISO(dateTo), 'dd/MM/yyyy')}
                </span>
              )}
              <input
                type="file"
                className="hidden"
                id="file-upload-cp-toolbar"
                accept="image/*,application/pdf"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  e.target.value = ''
                  openNewModal()
                  await handleFileUpload(file, true)
                }}
              />
              <button
                onClick={() => document.getElementById('file-upload-cp-toolbar')?.click()}
                disabled={isUploading || isReadingBoleto}
                title="Selecione um boleto ou fatura (PDF/imagem) — o sistema le os dados via IA e abre o lancamento ja preenchido"
                className="flex items-center gap-1 px-2.5 h-7 text-[11.5px] font-semibold text-white bg-[#059669] rounded hover:bg-[#047857] transition-colors disabled:opacity-50"
              >
                {isReadingBoleto ? <><Loader2 size={11} className="animate-spin" /> Lendo...</> :
                 isUploading ? <><Loader2 size={11} className="animate-spin" /> Enviando...</> :
                 <><ScanLine size={11} /> Importar boleto/fatura</>}
              </button>
              <button
                onClick={openNewModal}
                className="flex items-center gap-1 px-2.5 h-7 text-[11.5px] font-semibold text-white bg-black rounded hover:bg-[#1D2939] transition-colors"
              >
                <Plus size={11} /> Nova conta
              </button>
            </div>

            {/* Loading */}
            {loading && <TableSkeleton rows={8} cols={6} />}

            {/* Empty */}
            {!loading && filteredContas.length === 0 && (
              <EmptyState
                title="Nenhuma conta a pagar encontrada"
                description="Cadastre uma nova conta ou ajuste os filtros para ver resultados."
                actionLabel="Nova conta a pagar"
                onAction={() => setShowNewModal(true)}
              />
            )}

            {/* Grouped tables — paginacao GLOBAL (10 titulos por pagina no total) */}
            {!loading && (() => {
              const totalItems = visibleGroups.reduce((sum, g) => sum + groupedContas[g].length, 0)
              const totalPagesGlobal = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
              const currentGlobalPage = Math.min(globalPage, totalPagesGlobal - 1)
              const pageStart = currentGlobalPage * PAGE_SIZE
              const pageEnd = pageStart + PAGE_SIZE
              let runningOffset = 0
              return (
                <>
                  {visibleGroups.map((group) => {
                    const allItems = groupedContas[group]
                    const groupStart = runningOffset
                    const groupEnd = runningOffset + allItems.length
                    runningOffset = groupEnd
                    // Slice deste grupo que cabe na pagina global atual
                    const sliceFrom = Math.max(0, pageStart - groupStart)
                    const sliceTo = Math.min(allItems.length, pageEnd - groupStart)
                    const items = sliceFrom < sliceTo ? allItems.slice(sliceFrom, sliceTo) : []
                    // Se o grupo nao tem item nesta pagina, nao renderiza
                    if (items.length === 0) return null
              const config = urgencyConfig[group]
              const groupTotal = group === 'pagos'
                ? allItems.reduce((acc, cp) => acc + Number(cp.valor_pago || cp.valor || 0), 0)
                : allItems.reduce((acc, cp) => acc + saldo(cp), 0)
              const isCollapsed = collapsedGroups.has(group)
              const todayStr = format(new Date(), 'dd/MM/yyyy')

              return (
                <div key={group} className="mb-6">
                  {/* Group header — neutro, sem cor de alerta (só Hoje na linha continua sinalizando) */}
                  <button
                    onClick={() => {
                      setCollapsedGroups((prev) => {
                        const next = new Set(prev)
                        if (next.has(group)) next.delete(group)
                        else next.add(group)
                        return next
                      })
                    }}
                    className="w-full flex items-center justify-between px-3 py-2.5 mb-2 transition hover:opacity-80 rounded-[6px]"
                    style={{ borderBottom: '1px solid rgba(26,46,74,0.10)', backgroundColor: 'rgba(26,46,74,0.03)' }}
                  >
                    <span className="font-bold uppercase tracking-wider" style={{ fontSize: '12px', color: '#1D2939', fontFamily: 'var(--font-body, "DM Sans", sans-serif)', letterSpacing: '0.06em' }}>
                      {config.label}
                    </span>
                    <span className="font-bold" style={{ fontSize: '12px', color: '#1D2939', fontFamily: 'var(--font-display, "Plus Jakarta Sans", sans-serif)', fontVariantNumeric: 'tabular-nums' }}>
                      {formatBRL(groupTotal)} · {allItems.length} titulo{allItems.length !== 1 ? 's' : ''}
                    </span>
                  </button>

                  {/* Table — Pagos usa renderizacao compacta (data, nome, valor) */}
                  {!isCollapsed && group === 'pagos' && (
                    <div className="overflow-x-auto">
                      <table className="w-full" style={{ fontSize: 11.5 }}>
                        <thead>
                          <tr style={{ backgroundColor: 'rgba(26,46,74,0.03)' }}>
                            <th className="py-1 px-2 text-left font-semibold uppercase tracking-wider" style={{ fontSize: '10px', color: '#98A2B3', letterSpacing: '0.06em', fontFamily: 'var(--font-body, "DM Sans", sans-serif)', width: 76 }}>Data</th>
                            <th className="py-1 px-2 text-left font-semibold uppercase tracking-wider" style={{ fontSize: '10px', color: '#98A2B3', letterSpacing: '0.06em', fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}>Nome</th>
                            <th className="py-1 px-2 text-right font-semibold uppercase tracking-wider" style={{ fontSize: '10px', color: '#98A2B3', letterSpacing: '0.06em', fontFamily: 'var(--font-body, "DM Sans", sans-serif)', width: 90 }}>Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((cp) => (
                            <tr key={cp.id} style={{ borderBottom: '1px solid rgba(26,46,74,0.06)' }}>
                              <td className="py-1 px-2" style={{ fontSize: 11.5, color: '#1D2939', fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}>
                                {cp.data_pagamento ? formatData(cp.data_pagamento) : formatData(cp.data_vencimento)}
                              </td>
                              <td className="py-1 px-2 truncate" style={{ fontSize: 11.5, color: '#1D2939', fontFamily: 'var(--font-body, "DM Sans", sans-serif)', maxWidth: 280 }} title={cp.descricao || cp.credor_nome}>
                                {cp.descricao || cp.credor_nome}
                              </td>
                              <td className="py-1 px-2 text-right" style={{ fontSize: 11.5, color: '#1D2939', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                {formatBRL(Number(cp.valor_pago || cp.valor || 0))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {!isCollapsed && group !== 'pagos' && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr style={{ backgroundColor: 'rgba(26,46,74,0.03)' }}>
                            <th className="py-1.5 px-2.5 text-left w-8">
                              <input
                                type="checkbox"
                                checked={items.every((cp) => selectedIds.has(cp.id))}
                                onChange={() => {
                                  const allSelected = items.every((cp) => selectedIds.has(cp.id))
                                  setSelectedIds((prev) => {
                                    const next = new Set(prev)
                                    items.forEach((cp) => {
                                      if (allSelected) next.delete(cp.id)
                                      else next.add(cp.id)
                                    })
                                    return next
                                  })
                                }}
                                className="rounded"
                                style={{ borderColor: 'rgba(26,46,74,0.18)' }}
                              />
                            </th>
                            <th className="py-1.5 px-2.5 text-left font-semibold uppercase tracking-wider" style={{ fontSize: '12px', color: '#98A2B3', letterSpacing: '0.06em', fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}>Vencimento</th>
                            <th className="py-1.5 px-2.5 text-left font-semibold uppercase tracking-wider" style={{ fontSize: '12px', color: '#98A2B3', letterSpacing: '0.06em', fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}>Descrição</th>
                            <th className="py-1.5 px-2.5 text-right font-semibold uppercase tracking-wider" style={{ fontSize: '12px', color: '#98A2B3', letterSpacing: '0.06em', fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}>Valor</th>
                            <th className="py-1.5 px-2.5 text-left font-semibold uppercase tracking-wider" style={{ fontSize: '12px', color: '#98A2B3', letterSpacing: '0.06em', fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}>Categoria</th>
                            <th className="py-1.5 px-2.5 text-left font-semibold uppercase tracking-wider" style={{ fontSize: '12px', color: '#98A2B3', letterSpacing: '0.06em', fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}>Categoria contábil</th>
                            <th className="py-1.5 px-2.5 text-left font-semibold uppercase tracking-wider" style={{ fontSize: '12px', color: '#98A2B3', letterSpacing: '0.06em', fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}>Status</th>
                            <th className="py-1.5 px-2.5 text-right font-semibold uppercase tracking-wider" style={{ fontSize: '12px', color: '#98A2B3', letterSpacing: '0.06em', fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}>Acoes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((cp) => {
                            const isHoje = isToday(parseISO(cp.data_vencimento))
                            const categoria = inferCategoria(cp)
                            const contaContabilLabel = cp.conta_contabil_id
                              ? (contaContabilMap[cp.conta_contabil_id] || '\u2014')
                              : '\u2014'
                            return (
                              <tr
                                key={cp.id}
                                className="transition"
                                style={{
                                  borderBottom: '1px solid rgba(26,46,74,0.06)',
                                  ...(isHoje ? { borderLeft: '3px solid #059669' } : {}),
                                }}
                                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(26,46,74,0.02)' }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '' }}
                              >
                                <td className="py-1 px-2.5">
                                  <input
                                    type="checkbox"
                                    checked={selectedIds.has(cp.id)}
                                    onChange={() => toggleSelect(cp.id)}
                                    className="rounded w-4 h-4 accent-[#059669]"
                                    style={{ borderColor: 'rgba(26,46,74,0.18)' }}
                                  />
                                </td>
                                {/* Vencimento */}
                                <td className="py-1 px-2.5" style={{ fontSize: 13 }}>
                                  {isHoje ? (
                                    <span className="font-bold" style={{ color: '#E53E3E' }}>Hoje</span>
                                  ) : (
                                    <span style={{ color: '#1D2939', fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}>{formatData(cp.data_vencimento)}</span>
                                  )}
                                </td>
                                {/* Descri\u00e7\u00e3o (credor abaixo, menor) */}
                                <td className="py-1 px-2.5" style={{ fontSize: 13, fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}>
                                  <div className="font-semibold" style={{ color: '#1D2939' }}>{cp.descricao || cp.credor_nome}</div>
                                  {cp.descricao && cp.credor_nome && cp.descricao !== cp.credor_nome && (
                                    <div style={{ fontSize: 11, color: '#667085', marginTop: 1 }}>{cp.credor_nome}</div>
                                  )}
                                  {cp.credor_cpf_cnpj && (
                                    <div style={{ fontSize: 11, color: '#98A2B3', marginTop: 2 }}>{cp.credor_cpf_cnpj}</div>
                                  )}
                                </td>
                                {/* Valor */}
                                <td className="py-1 px-2.5 text-right">
                                  <div className="font-semibold" style={{ color: '#1D2939', fontVariantNumeric: 'tabular-nums', fontSize: 13, fontFamily: 'var(--font-display, "Plus Jakarta Sans", sans-serif)' }}>
                                    {formatBRL(saldo(cp))}
                                  </div>
                                  {cp.valor_pago > 0 && (
                                    <div style={{ fontSize: 11, color: '#98A2B3', fontVariantNumeric: 'tabular-nums' }}>
                                      total: {formatBRL(cp.valor)}
                                    </div>
                                  )}
                                </td>
                                {/* Categoria (badge) */}
                                <td className="py-1 px-2.5">
                                  <span className="font-medium px-2.5 py-0.5 rounded-full" style={{ fontSize: '12px', backgroundColor: 'rgba(26,46,74,0.05)', color: '#1D2939', border: '1px solid rgba(26,46,74,0.08)' }}>
                                    {categoria}
                                  </span>
                                </td>
                                {/* Categoria cont\u00e1bil (plano de contas) */}
                                <td className="py-1 px-2.5" style={{ fontSize: 13, color: '#1D2939', fontFamily: 'var(--font-body, "DM Sans", sans-serif)', maxWidth: 220 }} title={contaContabilLabel}>
                                  <div className="truncate">{contaContabilLabel}</div>
                                </td>
                                <td className="py-1 px-2.5">
                                  {(() => {
                                    const statusConf: Record<string, { dot: string; text: string; bg: string; label: string }> = {
                                      aberto: { dot: '#EA580C', text: '#EA580C', bg: '#FFF0EB', label: 'Em aberto' },
                                      parcial: { dot: '#059669', text: '#059669', bg: '#ECFDF4', label: 'Parcial' },
                                      vencido: { dot: '#E53E3E', text: '#E53E3E', bg: '#FEE2E2', label: 'Vencido' },
                                      pago: { dot: '#039855', text: '#039855', bg: '#e1f5ee', label: 'Pago' },
                                    }
                                    const sc = statusConf[cp.status] || statusConf.aberto
                                    return (
                                      <span
                                        className="inline-flex items-center gap-1.5 font-semibold px-2.5 py-1 rounded-full"
                                        style={{ fontSize: '12px', color: sc.text, backgroundColor: sc.bg }}
                                      >
                                        <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: sc.dot, flexShrink: 0 }} />
                                        {sc.label}
                                      </span>
                                    )
                                  })()}
                                </td>
                                <td className="py-1 px-2.5 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <button
                                      onClick={() => openPayModal(cp)}
                                      className="text-xs font-semibold px-3 py-1.5 rounded-[6px] transition"
                                      style={{ border: '1px solid #059669', color: '#059669', fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}
                                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '#059669'; (e.currentTarget as HTMLElement).style.color = '#ffffff' }}
                                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = ''; (e.currentTarget as HTMLElement).style.color = '#059669' }}
                                    >
                                      Pagar
                                    </button>
                                    <div className="relative">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          if (dropdownOpen === cp.id) {
                                            setDropdownOpen(null)
                                            setDropdownCoords(null)
                                          } else {
                                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                                            setDropdownCoords({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
                                            setDropdownOpen(cp.id)
                                          }
                                        }}
                                        className="p-1.5 rounded-[6px] transition"
                                        style={{ color: '#667085' }}
                                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(26,46,74,0.05)' }}
                                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '' }}
                                      >
                                        <MoreHorizontal size={16} />
                                      </button>
                                      {dropdownOpen === cp.id && dropdownCoords && createPortal(
                                        <div
                                          className="fixed py-1 min-w-[180px]"
                                          style={{ top: dropdownCoords.top, right: dropdownCoords.right, zIndex: 100, backgroundColor: '#ffffff', border: '1px solid rgba(26,46,74,0.10)', borderRadius: 8, boxShadow: '0 4px 16px rgba(26,46,74,0.10)' }}
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <button
                                            onClick={() => openEditModal(cp)}
                                            className="w-full text-left px-3 py-2 text-xs transition flex items-center gap-2"
                                            style={{ color: '#059669', fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}
                                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(26,46,74,0.03)' }}
                                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '' }}
                                          >
                                            <Pencil size={14} /> Editar
                                          </button>
                                          <button
                                            onClick={() => handleArquivar(cp)}
                                            className="w-full text-left px-3 py-2 text-xs transition flex items-center gap-2"
                                            style={{ color: '#059669', fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}
                                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(26,46,74,0.03)' }}
                                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '' }}
                                          >
                                            <Archive size={14} /> Arquivar boleto
                                          </button>
                                          <button
                                            onClick={() => handleRenegociar(cp)}
                                            className="w-full text-left px-3 py-2 text-xs transition flex items-center gap-2"
                                            style={{ color: '#059669', fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}
                                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(26,46,74,0.03)' }}
                                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '' }}
                                          >
                                            <CalendarClock size={14} /> Renegociar
                                          </button>
                                          <button
                                            onClick={() => handleCancelar(cp)}
                                            className="w-full text-left px-3 py-2 text-xs transition flex items-center gap-2"
                                            style={{ color: '#E53E3E', fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}
                                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(26,46,74,0.03)' }}
                                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '' }}
                                          >
                                            <Trash2 size={14} /> {(cp.status === 'pago' || cp.status === 'parcial') ? 'Cancelar pagamento' : 'Cancelar'}
                                          </button>
                                          <button
                                            onClick={() => handleDividir(cp)}
                                            className="w-full text-left px-3 py-2 text-xs transition flex items-center gap-2"
                                            style={{ color: '#059669', fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}
                                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(26,46,74,0.03)' }}
                                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '' }}
                                          >
                                            <SplitSquareVertical size={14} /> Dividir lancamento
                                          </button>
                                          <button
                                            onClick={() => { setDropdownOpen(null); abrirComprovanteWhatsApp(cp) }}
                                            className="w-full text-left px-3 py-2 text-xs transition flex items-center gap-2"
                                            style={{ color: '#059669', fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}
                                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(16,185,129,0.08)' }}
                                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '' }}
                                          >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2z"/></svg>
                                            {(cp.status === 'pago' || cp.status === 'parcial') ? 'Enviar comprovante WhatsApp' : 'Enviar info WhatsApp'}
                                          </button>
                                          <button
                                            onClick={() => { setDropdownOpen(null); abrirComprovanteEmail(cp) }}
                                            className="w-full text-left px-3 py-2 text-xs transition flex items-center gap-2"
                                            style={{ color: '#1E3A8A', fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}
                                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(30,58,138,0.08)' }}
                                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '' }}
                                          >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>
                                            {(cp.status === 'pago' || cp.status === 'parcial') ? 'Enviar comprovante E-mail' : 'Enviar info E-mail'}
                                          </button>
                                          <button
                                            onClick={async () => {
                                              setDropdownOpen(null)
                                              const ok = await confirm({ title: `Excluir lancamento "${cp.descricao || cp.credor_nome}"?`, description: "Esta acao nao pode ser desfeita. Todas as movimentacoes e conciliacoes associadas serao removidas.", confirmLabel: "Sim, excluir", variant: "destructive" })
                                              if (!ok) return
                                              try {
                                                const ac = activeClient as any
                                                await softDeleteWithUndo({
                                                  client: ac,
                                                  table: 'contas_pagar',
                                                  id: cp.id,
                                                  successLabel: 'Lancamento excluido',
                                                  onChange: () => { void loadData() },
                                                  cleanup: async () => {
                                                    await ac.from('movimentacoes').delete().eq('conta_pagar_id', cp.id)
                                                    await ac.from('bank_reconciliation_matches').update({ payable_id: null }).eq('payable_id', cp.id)
                                                    await ac.from('bank_transactions').update({ reconciled_payable_id: null }).eq('reconciled_payable_id', cp.id)
                                                  },
                                                })
                                              } catch (err: any) {
                                                console.error('[excluirCP]', err)
                                                toast.error('Erro ao excluir: ' + (err.message || 'Erro desconhecido'))
                                              }
                                            }}
                                            className="w-full text-left px-3 py-2 text-xs transition flex items-center gap-2"
                                            style={{ color: '#E53E3E', fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}
                                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(139,0,0,0.05)' }}
                                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '' }}
                                          >
                                            <Trash2 size={14} /> Excluir lancamento
                                          </button>
                                        </div>,
                                        document.body
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
                  })}
                  {totalPagesGlobal > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid rgba(26,46,74,0.10)', backgroundColor: 'rgba(26,46,74,0.03)', borderRadius: 6, marginTop: 8 }}>
                      <span style={{ fontSize: 12, color: '#667085', fontWeight: 500 }}>
                        Página {currentGlobalPage + 1} de {totalPagesGlobal} · {pageStart + 1}–{Math.min(pageEnd, totalItems)} de {totalItems} títulos
                      </span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => setGlobalPage(p => Math.max(0, p - 1))}
                          disabled={currentGlobalPage === 0}
                          style={{ fontSize: 12, fontWeight: 600, padding: '5px 12px', border: '1px solid rgba(26,46,74,0.18)', borderRadius: 4, backgroundColor: currentGlobalPage === 0 ? '#F3F4F6' : '#ffffff', color: currentGlobalPage === 0 ? '#98A2B3' : '#1D2939', cursor: currentGlobalPage === 0 ? 'not-allowed' : 'pointer' }}
                        >
                          Anterior
                        </button>
                        <button
                          onClick={() => setGlobalPage(p => Math.min(totalPagesGlobal - 1, p + 1))}
                          disabled={currentGlobalPage >= totalPagesGlobal - 1}
                          style={{ fontSize: 12, fontWeight: 600, padding: '5px 12px', border: '1px solid rgba(26,46,74,0.18)', borderRadius: 4, backgroundColor: currentGlobalPage >= totalPagesGlobal - 1 ? '#F3F4F6' : '#ffffff', color: currentGlobalPage >= totalPagesGlobal - 1 ? '#98A2B3' : '#1D2939', cursor: currentGlobalPage >= totalPagesGlobal - 1 ? 'not-allowed' : 'pointer' }}
                        >
                          Próxima
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        </div>

        {/* ─── Modal: Pagar CP ──────────────────────────────────────── */}
        {showPayModal && payingCp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(15,30,51,0.45)' }} onClick={() => setShowPayModal(false)}>
            <div className="w-full max-w-md mx-4" style={{ backgroundColor: '#ffffff', borderRadius: 10, boxShadow: '0 8px 32px rgba(15,30,51,0.18)' }} onClick={(e) => e.stopPropagation()}>
              <div className="px-5 py-4 flex items-center justify-between" style={{ backgroundColor: '#059669', borderRadius: '10px 10px 0 0' }}>
                <div>
                  <h3 className="font-bold text-white" style={{ fontSize: 15, fontFamily: 'var(--font-display, "Plus Jakarta Sans", sans-serif)' }}>Pagar Conta</h3>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.50)', fontFamily: 'var(--font-body, "DM Sans", sans-serif)', marginTop: 2 }}>Registrar pagamento</p>
                </div>
                <button onClick={() => setShowPayModal(false)} className="text-white/50 hover:text-white transition">
                  <X size={18} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div className="rounded-[8px] p-3" style={{ backgroundColor: 'rgba(26,46,74,0.04)', border: '1px solid rgba(26,46,74,0.10)' }}>
                  <p className="font-semibold" style={{ fontSize: 13, color: '#059669', fontFamily: 'var(--font-display, "Plus Jakarta Sans", sans-serif)' }}>{payingCp.credor_nome}</p>
                  <p style={{ fontSize: 12, color: '#667085', fontFamily: 'var(--font-body, "DM Sans", sans-serif)', marginTop: 2 }}>
                    Saldo: {formatBRL(saldo(payingCp))} | Venc: {formatData(payingCp.data_vencimento)}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium" style={{ fontSize: 12, color: '#667085', marginBottom: 6, fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}>Valor pago *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={payForm.valorPago}
                      onChange={(e) => setPayForm({ ...payForm, valorPago: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 text-[13px] rounded-[8px] focus:outline-none"
                      style={{ border: '1px solid rgba(26,46,74,0.18)', color: '#059669', height: 36 }}
                    />
                  </div>
                  <div>
                    <label className="block font-medium" style={{ fontSize: 12, color: '#667085', marginBottom: 6, fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}>Data pagamento *</label>
                    <input
                      type="date"
                      value={payForm.dataPagamento}
                      onChange={(e) => setPayForm({ ...payForm, dataPagamento: e.target.value })}
                      className="w-full px-3 text-[13px] rounded-[8px] focus:outline-none"
                      style={{ border: '1px solid rgba(26,46,74,0.18)', color: '#059669', height: 36 }}
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-medium" style={{ fontSize: 12, color: '#667085', marginBottom: 6, fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}>Forma pagamento *</label>
                  <select
                    value={payForm.formaPagamento}
                    onChange={(e) => setPayForm({ ...payForm, formaPagamento: e.target.value })}
                    className="w-full px-3 text-[13px] rounded-[8px] focus:outline-none bg-white"
                    style={{ border: '1px solid rgba(26,46,74,0.18)', color: '#059669', height: 36 }}
                  >
                    {FORMAS_PAGAMENTO.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium" style={{ fontSize: 12, color: '#667085', marginBottom: 6, fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}>{payForm.formaPagamento === 'Cartao de credito' ? 'Cartao de credito *' : 'Conta bancaria *'}</label>
                  <select
                    value={payForm.contaBancariaId}
                    onChange={(e) => setPayForm({ ...payForm, contaBancariaId: e.target.value })}
                    className="w-full px-3 text-[13px] rounded-[8px] focus:outline-none bg-white"
                    style={{ border: '1px solid rgba(26,46,74,0.18)', color: '#059669', height: 36 }}
                  >
                    <option value="">Selecione...</option>
                    {bankAccounts
                      .filter((ba) => payForm.formaPagamento === 'Cartao de credito' ? ba.type === 'cartao_credito' : ba.type !== 'cartao_credito')
                      .map((ba) => (
                        <option key={ba.id} value={ba.id}>{ba.name}{ba.banco ? ` (${ba.banco})` : ''}</option>
                      ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium" style={{ fontSize: 12, color: '#667085', marginBottom: 6, fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}>Juros / Multa</label>
                    <input
                      type="number"
                      step="0.01"
                      value={payForm.juros}
                      onChange={(e) => setPayForm({ ...payForm, juros: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 text-[13px] rounded-[8px] focus:outline-none"
                      style={{ border: '1px solid rgba(26,46,74,0.18)', color: '#059669', height: 36 }}
                    />
                  </div>
                  <div>
                    <label className="block font-medium" style={{ fontSize: 12, color: '#667085', marginBottom: 6, fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}>Desconto</label>
                    <input
                      type="number"
                      step="0.01"
                      value={payForm.desconto}
                      onChange={(e) => setPayForm({ ...payForm, desconto: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 text-[13px] rounded-[8px] focus:outline-none"
                      style={{ border: '1px solid rgba(26,46,74,0.18)', color: '#059669', height: 36 }}
                    />
                  </div>
                </div>

                {payForm.credorTipo === 'funcionario' ? (
                  <div>
                    <label className="block font-medium" style={{ fontSize: 12, color: '#667085', marginBottom: 6, fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}>Chave PIX</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={payForm.observacao}
                        onChange={(e) => setPayForm({ ...payForm, observacao: e.target.value })}
                        placeholder={payForm.observacao ? 'Chave PIX do funcionario' : 'Cadastre a chave PIX no funcionario'}
                        className="flex-1 px-3 text-[13px] rounded-[8px] focus:outline-none"
                        style={{ border: '1px solid rgba(26,46,74,0.18)', color: '#059669', height: 36 }}
                      />
                      <button
                        type="button"
                        onClick={handleCopyPix}
                        disabled={!payForm.observacao}
                        className="px-3 text-[12px] font-semibold rounded-[8px] hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                        style={{ backgroundColor: '#059669', color: '#fff', height: 36, fontFamily: 'var(--font-display, "Plus Jakarta Sans", sans-serif)' }}
                      >
                        <Copy size={13} /> Copiar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block font-medium" style={{ fontSize: 12, color: '#667085', marginBottom: 6, fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}>Codigo de Barras</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={payForm.observacao}
                        onChange={(e) => setPayForm({ ...payForm, observacao: e.target.value })}
                        placeholder="Linha digitavel do boleto"
                        className="flex-1 px-3 text-[13px] rounded-[8px] focus:outline-none"
                        style={{ border: '1px solid rgba(26,46,74,0.18)', color: '#059669', height: 36 }}
                      />
                      <button
                        type="button"
                        onClick={handleGerarBarcode}
                        disabled={!payForm.observacao}
                        className="px-3 text-[12px] font-semibold rounded-[8px] hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ backgroundColor: '#059669', color: '#fff', height: 36, fontFamily: 'var(--font-display, "Plus Jakarta Sans", sans-serif)' }}
                      >
                        Gerar
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-end pt-2" style={{ borderTop: '1px solid rgba(26,46,74,0.10)', gap: 8, paddingTop: 16 }}>
                  <button
                    onClick={() => setShowPayModal(false)}
                    className="px-4 py-2 rounded-[8px] text-[13px] font-medium transition"
                    style={{ color: '#667085', border: '1px solid rgba(26,46,74,0.18)' }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handlePay}
                    disabled={submitting || !payForm.contaBancariaId}
                    className="px-4 py-2 text-white rounded-[8px] text-[13px] font-semibold hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    style={{ backgroundColor: '#059669', fontFamily: 'var(--font-display, "Plus Jakarta Sans", sans-serif)' }}
                  >
                    {submitting && <Loader2 size={14} className="animate-spin" />}
                    Confirmar pagamento
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Modal: Batch Pay ─────────────────────────────────────── */}
        {showBatchPayModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(15,30,51,0.45)' }} onClick={() => setShowBatchPayModal(false)}>
            <div className="w-full max-w-md mx-4" style={{ backgroundColor: '#ffffff', borderRadius: 10, boxShadow: '0 8px 32px rgba(15,30,51,0.18)' }} onClick={(e) => e.stopPropagation()}>
              <div className="px-5 py-4 flex items-center justify-between" style={{ backgroundColor: '#059669', borderRadius: '10px 10px 0 0' }}>
                <div>
                  <h3 className="font-bold text-white" style={{ fontSize: 15, fontFamily: 'var(--font-display, "Plus Jakarta Sans", sans-serif)' }}>Pagar em lote</h3>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.50)', fontFamily: 'var(--font-body, "DM Sans", sans-serif)', marginTop: 2 }}>Pagamento em massa</p>
                </div>
                <button onClick={() => setShowBatchPayModal(false)} className="text-white/50 hover:text-white transition">
                  <X size={18} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div className="rounded-[8px] p-3" style={{ backgroundColor: 'rgba(26,46,74,0.04)', border: '1px solid rgba(26,46,74,0.10)' }}>
                  <p className="font-semibold" style={{ fontSize: 13, color: '#059669', fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}>
                    {selectedIds.size} titulo(s) selecionado(s)
                  </p>
                  <p className="font-bold" style={{ fontSize: 18, color: '#059669', fontFamily: 'var(--font-display, "Plus Jakarta Sans", sans-serif)', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{formatBRL(selectedTotal)}</p>
                </div>

                <div>
                  <label className="block font-medium" style={{ fontSize: 12, color: '#667085', marginBottom: 6, fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}>Data pagamento *</label>
                  <input
                    type="date"
                    value={batchForm.dataPagamento}
                    onChange={(e) => setBatchForm({ ...batchForm, dataPagamento: e.target.value })}
                    className="w-full px-3 text-[13px] rounded-[8px] focus:outline-none"
                    style={{ border: '1px solid rgba(26,46,74,0.18)', color: '#059669', height: 36 }}
                  />
                </div>

                <div>
                  <label className="block font-medium" style={{ fontSize: 12, color: '#667085', marginBottom: 6, fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}>Forma pagamento *</label>
                  <select
                    value={batchForm.formaPagamento}
                    onChange={(e) => setBatchForm({ ...batchForm, formaPagamento: e.target.value })}
                    className="w-full px-3 text-[13px] rounded-[8px] focus:outline-none bg-white"
                    style={{ border: '1px solid rgba(26,46,74,0.18)', color: '#059669', height: 36 }}
                  >
                    {FORMAS_PAGAMENTO.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium" style={{ fontSize: 12, color: '#667085', marginBottom: 6, fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}>{batchForm.formaPagamento === 'Cartao de credito' ? 'Cartao de credito *' : 'Conta bancaria *'}</label>
                  <select
                    value={batchForm.contaBancariaId}
                    onChange={(e) => setBatchForm({ ...batchForm, contaBancariaId: e.target.value })}
                    className="w-full px-3 text-[13px] rounded-[8px] focus:outline-none bg-white"
                    style={{ border: '1px solid rgba(26,46,74,0.18)', color: '#059669', height: 36 }}
                  >
                    <option value="">Selecione...</option>
                    {bankAccounts
                      .filter((ba) => batchForm.formaPagamento === 'Cartao de credito' ? ba.type === 'cartao_credito' : ba.type !== 'cartao_credito')
                      .map((ba) => (
                        <option key={ba.id} value={ba.id}>{ba.name}{ba.banco ? ` (${ba.banco})` : ''}</option>
                      ))}
                  </select>
                </div>

                <div className="flex items-center justify-end pt-2" style={{ borderTop: '1px solid rgba(26,46,74,0.10)', gap: 8, paddingTop: 16 }}>
                  <button
                    onClick={() => setShowBatchPayModal(false)}
                    className="px-4 py-2 rounded-[8px] text-[13px] font-medium transition"
                    style={{ color: '#667085', border: '1px solid rgba(26,46,74,0.18)' }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleBatchPay}
                    disabled={submitting || !batchForm.contaBancariaId}
                    className="px-4 py-2 text-white rounded-[8px] text-[13px] font-semibold hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    style={{ backgroundColor: '#059669', fontFamily: 'var(--font-display, "Plus Jakarta Sans", sans-serif)' }}
                  >
                    {submitting && <Loader2 size={14} className="animate-spin" />}
                    Pagar {selectedIds.size} titulo(s)
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Modal: Batch Categorize ──────────────────────────────── */}
        {showBatchCategorizeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(15,30,51,0.45)' }} onClick={() => setShowBatchCategorizeModal(false)}>
            <div className="w-full max-w-md mx-4" style={{ backgroundColor: '#ffffff', borderRadius: 10, boxShadow: '0 8px 32px rgba(15,30,51,0.18)' }} onClick={(e) => e.stopPropagation()}>
              <div className="px-5 py-4 flex items-center justify-between" style={{ backgroundColor: '#059669', borderRadius: '10px 10px 0 0' }}>
                <div>
                  <h3 className="font-bold text-white" style={{ fontSize: 15, fontFamily: 'var(--font-display, "Plus Jakarta Sans", sans-serif)' }}>Categorizar em lote</h3>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.50)', fontFamily: 'var(--font-body, "DM Sans", sans-serif)', marginTop: 2 }}>Reclassificacao contabil (inclui pagos)</p>
                </div>
                <button onClick={() => setShowBatchCategorizeModal(false)} className="text-white/50 hover:text-white transition">
                  <X size={18} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div className="rounded-[8px] p-3" style={{ backgroundColor: 'rgba(26,46,74,0.04)', border: '1px solid rgba(26,46,74,0.10)' }}>
                  <p className="font-semibold" style={{ fontSize: 13, color: '#059669', fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}>
                    {selectedIds.size} titulo{selectedIds.size !== 1 ? 's' : ''} selecionado{selectedIds.size !== 1 ? 's' : ''}
                  </p>
                  <p style={{ fontSize: 11, color: '#98A2B3', fontFamily: 'var(--font-body, "DM Sans", sans-serif)', marginTop: 2 }}>
                    Os campos abaixo serao aplicados em todos. Campos financeiros (valor, vencimento, status) permanecem intactos.
                  </p>
                </div>

                <div>
                  <label className="block font-medium" style={{ fontSize: 12, color: '#667085', marginBottom: 6, fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}>Conta contabil</label>
                  <select
                    value={batchCategorize.contaContabilId}
                    onChange={(e) => setBatchCategorize({ ...batchCategorize, contaContabilId: e.target.value })}
                    className="w-full px-3 text-[13px] rounded-[8px] focus:outline-none bg-white"
                    style={{ border: '1px solid rgba(26,46,74,0.18)', color: '#059669', height: 36 }}
                  >
                    <option value="">Nao alterar</option>
                    {chartAccounts.map((ca) => (
                      <option key={ca.id} value={ca.id}>{ca.code} - {ca.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium" style={{ fontSize: 12, color: '#667085', marginBottom: 6, fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}>Centro de custo</label>
                  <select
                    value={batchCategorize.centroCustoId}
                    onChange={(e) => setBatchCategorize({ ...batchCategorize, centroCustoId: e.target.value })}
                    className="w-full px-3 text-[13px] rounded-[8px] focus:outline-none bg-white"
                    style={{ border: '1px solid rgba(26,46,74,0.18)', color: '#059669', height: 36 }}
                  >
                    <option value="">Nao alterar</option>
                    {centrosCusto.map((cc) => (
                      <option key={cc.id} value={cc.id}>{cc.codigo} - {cc.descricao}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-end pt-2" style={{ borderTop: '1px solid rgba(26,46,74,0.10)', gap: 8, paddingTop: 16 }}>
                  <button
                    onClick={() => setShowBatchCategorizeModal(false)}
                    className="px-4 py-2 rounded-[8px] text-[13px] font-medium transition"
                    style={{ color: '#667085', border: '1px solid rgba(26,46,74,0.18)' }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleBatchCategorize}
                    disabled={submitting || (!batchCategorize.contaContabilId && !batchCategorize.centroCustoId)}
                    className="px-4 py-2 text-white rounded-[8px] text-[13px] font-semibold hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    style={{ backgroundColor: '#059669', fontFamily: 'var(--font-display, "Plus Jakarta Sans", sans-serif)' }}
                  >
                    {submitting && <Loader2 size={14} className="animate-spin" />}
                    Aplicar em {selectedIds.size} titulo(s)
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Modal: Nova / Editar CP ──────────────────────────────── */}
        {showNewModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(15,30,51,0.45)' }} onClick={() => { setShowNewModal(false); setEditingCpId(null) }}>
            <div className="w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" style={{ backgroundColor: '#ffffff', borderRadius: 10, boxShadow: '0 8px 32px rgba(15,30,51,0.18)' }} onClick={(e) => e.stopPropagation()}>
              <div className="px-5 py-4 flex items-center justify-between sticky top-0 z-10" style={{ backgroundColor: '#059669', borderRadius: '10px 10px 0 0' }}>
                <div>
                  <h3 className="font-bold text-white" style={{ fontSize: 15, fontFamily: 'var(--font-display, "Plus Jakarta Sans", sans-serif)' }}>
                    {editingCpId ? 'Editar Conta a Pagar' : 'Nova Conta a Pagar'}
                  </h3>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.50)', fontFamily: 'var(--font-body, "DM Sans", sans-serif)', marginTop: 2 }}>
                    {editingCpId ? 'Alterar dados da conta' : 'Cadastrar nova despesa'}
                  </p>
                </div>
                <button onClick={() => { setShowNewModal(false); setEditingCpId(null) }} className="text-white/50 hover:text-white transition">
                  <X size={18} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                {/* Descrição */}
                <div>
                  <label className="block" style={{ fontSize: 14, color: '#000', marginBottom: 6, fontFamily: 'var(--font-body, "DM Sans", sans-serif)', fontWeight: 700 }}>Descricao *</label>
                  <input
                    type="text"
                    value={newForm.descricao}
                    onChange={(e) => setNewForm({ ...newForm, descricao: e.target.value })}
                    placeholder="Ex: Aluguel janeiro, Material escritorio..."
                    className="w-full px-3 text-[13px] rounded-[8px] focus:outline-none"
                    style={{ border: '1px solid rgba(26,46,74,0.18)', color: '#059669', height: 36 }}
                  />
                </div>

                {/* Fornecedor / Funcionário / Cliente */}
                <div>
                  <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                    <label className="block" style={{ fontSize: 14, color: '#000', fontFamily: 'var(--font-body, "DM Sans", sans-serif)', fontWeight: 700 }}>Credor</label>
                    {newForm.credorTipo === 'fornecedor' && (
                      <button
                        type="button"
                        onClick={() => setIsSupplierSheetOpen(true)}
                        className="flex items-center gap-1 font-semibold transition"
                        style={{ fontSize: 11, color: '#039855' }}
                      >
                        <Plus size={12} /> Novo fornecedor
                      </button>
                    )}
                  </div>
                  {/* Tipo de credor */}
                  <div className="flex gap-1.5 mb-2">
                    {([
                      { key: 'fornecedor' as CredorTipo, label: 'Fornecedores' },
                      { key: 'funcionario' as CredorTipo, label: 'Funcionarios' },
                      { key: 'cliente' as CredorTipo, label: 'Clientes' },
                    ]).map((tipo) => (
                      <button
                        key={tipo.key}
                        type="button"
                        onClick={() => setNewForm({ ...newForm, credorTipo: tipo.key, credorId: '', credorNome: '' })}
                        className="text-xs font-medium px-3 py-1.5 rounded-full transition"
                        style={
                          newForm.credorTipo === tipo.key
                            ? { backgroundColor: '#059669', color: '#ffffff' }
                            : { backgroundColor: 'transparent', color: '#667085', border: '1px solid rgba(26,46,74,0.18)' }
                        }
                      >
                        {tipo.label}
                      </button>
                    ))}
                  </div>
                  {/* Lista de nomes */}
                  <select
                    value={newForm.credorId}
                    onChange={(e) => {
                      const id = e.target.value
                      let nome = ''
                      if (newForm.credorTipo === 'fornecedor') {
                        nome = suppliers.find(s => s.id === id)?.razao_social || ''
                      } else if (newForm.credorTipo === 'funcionario') {
                        const emp = employees.find(e => e.id === id)
                        nome = emp?.nome_completo || emp?.name || ''
                      } else if (newForm.credorTipo === 'cliente') {
                        nome = clients.find(c => c.id === id)?.razao_social || ''
                      }
                      setNewForm({ ...newForm, credorId: id, credorNome: nome })
                    }}
                    className="w-full px-3 text-[13px] rounded-[8px] focus:outline-none bg-white"
                    style={{ border: '1px solid rgba(26,46,74,0.18)', color: '#059669', height: 36 }}
                  >
                    <option value="">
                      {newForm.credorTipo === 'fornecedor' ? 'Selecione um fornecedor...' :
                       newForm.credorTipo === 'funcionario' ? 'Selecione um funcionário...' :
                       'Selecione um cliente...'}
                    </option>
                    {newForm.credorTipo === 'fornecedor' && suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.razao_social}</option>
                    ))}
                    {newForm.credorTipo === 'funcionario' && employees.map((e) => (
                      <option key={e.id} value={e.id}>{e.nome_completo || e.name}</option>
                    ))}
                    {newForm.credorTipo === 'cliente' && clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.razao_social}</option>
                    ))}
                  </select>
                </div>

                {/* Valor + Vencimento */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block" style={{ fontSize: 14, color: '#000', marginBottom: 6, fontFamily: 'var(--font-body, "DM Sans", sans-serif)', fontWeight: 700 }}>Valor (R$) *</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={newForm.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '')
                        const valor = digits ? parseInt(digits, 10) / 100 : 0
                        setNewForm({ ...newForm, valor })
                      }}
                      placeholder="0,00"
                      className="w-full px-3 text-[13px] rounded-[8px] focus:outline-none"
                      style={{ border: '1px solid rgba(26,46,74,0.18)', color: '#059669', height: 36 }}
                    />
                  </div>
                  <div>
                    <label className="block" style={{ fontSize: 14, color: '#000', marginBottom: 6, fontFamily: 'var(--font-body, "DM Sans", sans-serif)', fontWeight: 700 }}>Vencimento *</label>
                    <input
                      type="date"
                      value={newForm.dataVencimento}
                      onChange={(e) => setNewForm({ ...newForm, dataVencimento: e.target.value })}
                      className="w-full px-3 text-[13px] rounded-[8px] focus:outline-none"
                      style={{ border: '1px solid rgba(26,46,74,0.18)', color: '#059669', height: 36 }}
                    />
                  </div>
                </div>

                {/* Competência */}
                <div className="relative">
                  <label className="block" style={{ fontSize: 14, color: '#000', marginBottom: 6, fontFamily: 'var(--font-body, "DM Sans", sans-serif)', fontWeight: 700 }}>Competencia (mes/ano)</label>
                  <button
                    type="button"
                    onClick={() => setShowCompetenciaPicker(!showCompetenciaPicker)}
                    className="w-full px-3 text-[13px] text-left rounded-[8px] focus:outline-none bg-white flex items-center justify-between"
                    style={{ border: '1px solid rgba(26,46,74,0.18)', color: '#059669', height: 36 }}
                  >
                    <span style={{ color: newForm.competencia ? '#059669' : '#98A2B3' }}>
                      {newForm.competencia || 'Selecione mes/ano'}
                    </span>
                    <CalendarDays size={14} style={{ color: '#98A2B3' }} />
                  </button>
                  {showCompetenciaPicker && (
                    <div className="absolute z-20 mt-1 p-3 w-[280px]" style={{ backgroundColor: '#ffffff', border: '1px solid rgba(26,46,74,0.10)', borderRadius: 8, boxShadow: '0 4px 16px rgba(26,46,74,0.10)' }}>
                      <div className="flex items-center justify-between mb-3">
                        <button type="button" onClick={() => setCompetenciaYear(y => y - 1)} className="text-xs px-2 py-1 rounded-[6px] transition" style={{ color: '#667085' }} onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(26,46,74,0.05)' }} onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '' }}>&lt;</button>
                        <span className="text-sm font-semibold" style={{ color: '#059669', fontFamily: 'var(--font-display, "Plus Jakarta Sans", sans-serif)' }}>{competenciaYear}</span>
                        <button type="button" onClick={() => setCompetenciaYear(y => y + 1)} className="text-xs px-2 py-1 rounded-[6px] transition" style={{ color: '#667085' }} onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(26,46,74,0.05)' }} onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '' }}>&gt;</button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {MONTHS.map((month, idx) => {
                          const val = `${String(idx + 1).padStart(2, '0')}/${competenciaYear}`
                          const isSelected = newForm.competencia === val
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                setNewForm({ ...newForm, competencia: val })
                                setShowCompetenciaPicker(false)
                              }}
                              className="text-xs px-2 py-1.5 rounded-[6px] transition"
                              style={
                                isSelected
                                  ? { backgroundColor: '#059669', color: '#ffffff' }
                                  : { backgroundColor: '#ffffff', color: '#667085', border: '1px solid rgba(26,46,74,0.12)' }
                              }
                            >
                              {month.slice(0, 3)}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Conta contábil (digitável + dropdown) */}
                <div ref={contaContabilRef} className="relative">
                  <label className="block" style={{ fontSize: 14, color: '#000', marginBottom: 6, fontFamily: 'var(--font-body, "DM Sans", sans-serif)', fontWeight: 700 }}>Conta contabil</label>
                  <input
                    type="text"
                    value={contaContabilSearch}
                    onChange={(e) => {
                      setContaContabilSearch(e.target.value)
                      setContaContabilOpen(true)
                      if (!e.target.value.trim()) setNewForm({ ...newForm, contaContabilId: '' })
                    }}
                    onFocus={() => setContaContabilOpen(true)}
                    placeholder="Digite codigo ou nome..."
                    autoComplete="off"
                    className="w-full px-3 text-[13px] rounded-[8px] focus:outline-none bg-white"
                    style={{ border: '1px solid rgba(26,46,74,0.18)', color: '#059669', height: 36 }}
                  />
                  {contaContabilOpen && (
                    <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-[#ccc] rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      <button
                        type="button"
                        onClick={() => {
                          setNewForm({ ...newForm, contaContabilId: '' })
                          setContaContabilSearch('')
                          setContaContabilOpen(false)
                        }}
                        className="w-full text-left px-3 py-2 text-[13px] text-[#999] hover:bg-[#F6F2EB] border-b border-[#eee]"
                      >
                        Nenhuma
                      </button>
                      {chartAccountsFiltrados.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setNewForm({ ...newForm, contaContabilId: c.id })
                            setContaContabilSearch(`${c.code} - ${c.name}`)
                            setContaContabilOpen(false)
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-[#ECFDF4] border-b border-[#eee] last:border-0"
                        >
                          <div className="text-[13px] text-[#1D2939]">
                            <span className="font-semibold">{c.code}</span> - {c.name}
                          </div>
                        </button>
                      ))}
                      {chartAccountsFiltrados.length === 0 && (
                        <div className="px-3 py-2 text-[12px] text-[#999]">Nenhuma conta encontrada</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Centro de custo */}
                <div>
                  <label className="block" style={{ fontSize: 14, color: '#000', marginBottom: 6, fontFamily: 'var(--font-body, "DM Sans", sans-serif)', fontWeight: 700 }}>Centro de custo</label>
                  <select
                    value={newForm.centroCustoId}
                    onChange={(e) => setNewForm({ ...newForm, centroCustoId: e.target.value })}
                    className="w-full px-3 text-[13px] rounded-[8px] focus:outline-none bg-white"
                    style={{ border: '1px solid rgba(26,46,74,0.18)', color: '#059669', height: 36 }}
                  >
                    <option value="">Nenhum</option>
                    {centrosCusto.map((cc) => (
                      <option key={cc.id} value={cc.id}>{cc.codigo} - {cc.descricao}</option>
                    ))}
                  </select>
                </div>

                {/* Recorrência */}
                {!editingCpId && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block" style={{ fontSize: 14, color: '#000', marginBottom: 6, fontFamily: 'var(--font-body, "DM Sans", sans-serif)', fontWeight: 700 }}>Recorrencia</label>
                      <select
                        value={newForm.recorrencia}
                        onChange={(e) => setNewForm({ ...newForm, recorrencia: e.target.value as Recorrencia })}
                        className="w-full px-3 text-[13px] rounded-[8px] focus:outline-none bg-white"
                        style={{ border: '1px solid rgba(26,46,74,0.18)', color: '#059669', height: 36 }}
                      >
                        <option value="sem">Sem recorrência</option>
                        <option value="mensal">Mensal</option>
                        <option value="trimestral">Trimestral</option>
                        <option value="anual">Anual</option>
                      </select>
                    </div>
                    {newForm.recorrencia !== 'sem' && (
                      <div>
                        <label className="block" style={{ fontSize: 14, color: '#000', marginBottom: 6, fontFamily: 'var(--font-body, "DM Sans", sans-serif)', fontWeight: 700 }}>Num. parcelas</label>
                        <input
                          type="number"
                          min={2}
                          max={60}
                          value={newForm.numParcelas}
                          onChange={(e) => setNewForm({ ...newForm, numParcelas: parseInt(e.target.value) || 2 })}
                          className="w-full px-3 text-[13px] rounded-[8px] focus:outline-none"
                          style={{ border: '1px solid rgba(26,46,74,0.18)', color: '#059669', height: 36 }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {!editingCpId && newForm.recorrencia !== 'sem' && (
                  <div className="rounded-[8px] p-3" style={{ backgroundColor: '#FFF0EB', border: '1px solid rgba(186,117,23,0.25)' }}>
                    <p style={{ fontSize: 12, color: '#EA580C', fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}>
                      Serão geradas <strong>{newForm.numParcelas}</strong> parcelas de{' '}
                      <strong>{formatBRL(newForm.valor)}</strong> com vencimento{' '}
                      {newForm.recorrencia === 'mensal' ? 'mensal' : newForm.recorrencia === 'trimestral' ? 'trimestral' : 'anual'}.
                    </p>
                  </div>
                )}

                {/* Despesa fixa */}
                <label className="flex items-center gap-2 cursor-pointer select-none" style={{ fontSize: 13, color: '#1D2939', fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}>
                  <input
                    type="checkbox"
                    checked={!!newForm.isFixedCost}
                    onChange={(e) => setNewForm({ ...newForm, isFixedCost: e.target.checked })}
                    style={{ accentColor: '#059669', width: 16, height: 16 }}
                  />
                  <span>Despesa fixa <span style={{ color: '#667085', fontSize: 12 }}>(aluguel, internet, salarios, etc — aparece em /contas-fixas)</span></span>
                </label>

                {/* Código de Barras */}
                <div>
                  <label className="block" style={{ fontSize: 14, color: '#000', marginBottom: 6, fontFamily: 'var(--font-body, "DM Sans", sans-serif)', fontWeight: 700 }}>Codigo de Barras</label>
                  <input
                    type="text"
                    value={newForm.codigoBarras}
                    onChange={(e) => setNewForm({ ...newForm, codigoBarras: e.target.value })}
                    placeholder="Linha digitavel do boleto"
                    className="w-full px-3 text-[13px] rounded-[8px] focus:outline-none"
                    style={{ border: '1px solid rgba(26,46,74,0.18)', color: '#059669', height: 36 }}
                  />
                </div>

                {/* Anexar arquivo + Leitura automática */}
                <div className="rounded-[8px] p-4 space-y-3" style={{ border: '1px dashed rgba(26,46,74,0.18)' }}>
                  <input
                    type="file"
                    className="hidden"
                    id="file-upload-cp"
                    accept="image/*,application/pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleFileUpload(file)
                    }}
                    disabled={isUploading || isReadingBoleto}
                  />
                  <input
                    type="file"
                    className="hidden"
                    id="file-upload-cp-auto"
                    accept="image/*,application/pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleFileUpload(file, true)
                    }}
                    disabled={isUploading || isReadingBoleto}
                  />
                  {!newForm.fileUrl ? (
                    <div className="space-y-2">
                      {/* Botão principal: Ler boleto automaticamente */}
                      <button
                        type="button"
                        onClick={() => document.getElementById('file-upload-cp-auto')?.click()}
                        disabled={isUploading || isReadingBoleto}
                        className="w-full flex items-center justify-center gap-2 text-[13px] font-semibold text-white rounded-[8px] px-3 py-2.5 hover:opacity-90 transition disabled:opacity-50"
                        style={{ backgroundColor: '#059669', fontFamily: 'var(--font-display, "Plus Jakarta Sans", sans-serif)' }}
                      >
                        {isReadingBoleto ? (
                          <><Loader2 size={14} className="animate-spin" /> Lendo boleto com IA...</>
                        ) : isUploading ? (
                          <><Loader2 size={14} className="animate-spin" /> Enviando...</>
                        ) : (
                          <><ScanLine size={14} /> Ler Boleto Automaticamente</>
                        )}
                      </button>
                      {/* Botão secundário: Apenas anexar */}
                      <button
                        type="button"
                        onClick={() => document.getElementById('file-upload-cp')?.click()}
                        disabled={isUploading || isReadingBoleto}
                        className="w-full flex items-center justify-center gap-2 text-xs rounded-[8px] px-3 py-2 transition disabled:opacity-50"
                        style={{ color: '#667085', border: '1px solid rgba(26,46,74,0.18)' }}
                      >
                        <Paperclip size={12} /> Apenas anexar (sem leitura)
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 size={16} className="text-green-600 shrink-0" />
                        <a href={newForm.fileUrl} target="_blank" rel="noreferrer" className="text-[13px] hover:underline flex-1 truncate" style={{ color: '#059669', fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}>
                          Arquivo anexado — clique para visualizar
                        </a>
                        <button
                          type="button"
                          onClick={() => setNewForm({ ...newForm, fileUrl: '' })}
                          className="text-xs px-2 py-1.5 rounded-[6px] transition"
                          style={{ color: '#E53E3E' }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => document.getElementById('file-upload-cp-auto')?.click()}
                          disabled={isUploading || isReadingBoleto}
                          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold rounded-[6px] px-2 py-1.5 hover:opacity-80 transition disabled:opacity-50"
                          style={{ color: '#059669', border: '1px solid #059669' }}
                        >
                          {isReadingBoleto ? <Loader2 size={12} className="animate-spin" /> : <ScanLine size={12} />}
                          {isReadingBoleto ? 'Lendo...' : 'Trocar e ler'}
                        </button>
                        <button
                          type="button"
                          onClick={() => document.getElementById('file-upload-cp')?.click()}
                          disabled={isUploading}
                          className="flex-1 flex items-center justify-center gap-1.5 text-xs rounded-[6px] px-2 py-1.5 transition"
                          style={{ color: '#667085', border: '1px solid rgba(26,46,74,0.18)' }}
                        >
                          <Paperclip size={12} /> Trocar arquivo
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Botões */}
                <div className="flex items-center justify-end pt-2" style={{ borderTop: '1px solid rgba(26,46,74,0.10)', gap: 8, paddingTop: 16 }}>
                  <button
                    onClick={() => { setShowNewModal(false); setEditingCpId(null) }}
                    className="px-4 py-2 rounded-[8px] text-[13px] font-medium transition"
                    style={{ color: '#667085', border: '1px solid rgba(26,46,74,0.18)' }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleCreateCP}
                    disabled={submitting || !newForm.descricao || !newForm.valor || !newForm.dataVencimento}
                    className="px-4 py-2 text-white rounded-[8px] text-[13px] font-semibold hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    style={{ backgroundColor: '#059669', fontFamily: 'var(--font-display, "Plus Jakarta Sans", sans-serif)' }}
                  >
                    {submitting && <Loader2 size={14} className="animate-spin" />}
                    {editingCpId
                      ? 'Salvar alterações'
                      : newForm.recorrencia !== 'sem'
                        ? `Criar ${newForm.numParcelas} parcelas`
                        : 'Criar conta'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Supplier Sheet ──────────────────────────────────────── */}
        <SupplierSheet
          isOpen={isSupplierSheetOpen}
          onClose={() => {
            setIsSupplierSheetOpen(false)
            loadData()
          }}
        />

        <SendWhatsAppDialog
          open={!!whatsComprovanteModal}
          onClose={() => setWhatsComprovanteModal(null)}
          title={whatsComprovanteModal && (whatsComprovanteModal.cp.status === 'pago' || whatsComprovanteModal.cp.status === 'parcial')
            ? 'Enviar comprovante via WhatsApp'
            : 'Enviar informação via WhatsApp'}
          subtitle={whatsComprovanteModal && (
            <>
              <p className="font-semibold text-[#1D2939]">{whatsComprovanteModal.cp.credor_nome}</p>
              <p className="text-[#667085] mt-0.5">{formatBRL(whatsComprovanteModal.cp.valor)} — Venc: {formatData(whatsComprovanteModal.cp.data_vencimento)}</p>
            </>
          )}
          defaultPhone={whatsComprovanteModal?.phone || ''}
          defaultText={whatsComprovanteModal?.text || ''}
        />

        <SendEmailDialog
          open={!!emailComprovanteModal}
          onClose={() => setEmailComprovanteModal(null)}
          title={emailComprovanteModal && (emailComprovanteModal.cp.status === 'pago' || emailComprovanteModal.cp.status === 'parcial')
            ? 'Enviar comprovante por E-mail'
            : 'Enviar informação por E-mail'}
          subtitle={emailComprovanteModal && (
            <>
              <p className="font-semibold text-[#1D2939]">{emailComprovanteModal.cp.credor_nome}</p>
              <p className="text-[#667085] mt-0.5">{formatBRL(emailComprovanteModal.cp.valor)} — Venc: {formatData(emailComprovanteModal.cp.data_vencimento)}</p>
            </>
          )}
          defaultTo={emailComprovanteModal?.email || ''}
          defaultSubject={emailComprovanteModal?.assunto || ''}
          defaultBody={emailComprovanteModal?.corpo || ''}
        />
      </div>
    </AppLayout>
  )
}
