import { useState, useEffect, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import jsPDF from 'jspdf'
import { SendWhatsAppDialog } from '@/components/whatsapp/SendWhatsAppDialog'
import { sendWhatsApp } from '@/lib/whatsapp/send-whatsapp'
import { SendEmailDialog } from '@/components/email/SendEmailDialog'
import { sendEmail } from '@/lib/email/send-email'
import { CobrarAsaasDialog, type CobrarAlvo } from '@/components/cobranca/CobrarAsaasDialog'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { useCompany } from '@/contexts/CompanyContext'
import { useConciliadasIds, SeloConciliado } from '@/modules/finance/presentation/hooks/useConciliadasIds'
import { safeQuery } from '@/lib/supabaseQuery'
import { formatBRL, formatData, formatCPF, formatCNPJ, toTitleCase } from '@/lib/format'
import { quitarCR } from '@/lib/financeiro/transacao'
import { AppLayout } from '@/components/layout/AppLayout'
import { PagePanel } from '@/components/layout/PagePanel'
import { KpiCard, KpiCardGrid } from '@/components/ui/kpi-card'
import { TableSkeleton } from '@/components/ui/page-skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { TablePagination } from '@/components/ui/table-pagination'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { PeriodFilter } from '@/components/ui/period-filter'
import { softDeleteWithUndo } from '@/lib/softDeleteWithUndo'
import { computeDropdownCoords, dropdownPositionStyle, type DropdownCoords } from '@/lib/dropdownPosition'
import { RoleGate } from '@/components/auth/RoleGate'
import { ExportMenu } from '@/components/ExportMenu'
import { SpreadsheetTable, type SpreadsheetColumn } from '@/components/SpreadsheetTable'
import {
  addDays, differenceInDays, parseISO, startOfMonth, endOfMonth, format,
} from 'date-fns'
import {
  Search, Plus, DollarSign, Clock, AlertTriangle, CheckCircle2,
  MoreHorizontal, X, ChevronDown, ChevronUp, Loader2, UserPlus, Copy, Pencil, Download, Trash2, Eye, QrCode,
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
  descricao: string | null
  observacoes: string | null
  venda_id: string | null
  contrato_recorrente_id: string | null
  _itensVenda?: string | null
}

interface BankAccount { id: string; name: string; banco?: string }
interface ChartAccount { id: string; code: string; name: string }
interface CentroCusto { id: string; codigo: string; descricao: string }
interface Cliente { id: string; razao_social: string; nome_fantasia: string | null; cpf_cnpj: string | null; email: string | null }
interface Product { id: string; description: string; code: string | null; fornecedor_id?: string | null }

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
      return { label: status, text: '#555', bg: '#F6F2EB', border: '#ccc' }
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
  const [searchParams, setSearchParams] = useSearchParams()

  // ── Data ──
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([])
  const [centrosCusto, setCentrosCusto] = useState<CentroCusto[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [products, setProducts] = useState<Product[]>([])

  // ── Pagination ──
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 10

  // ─── Padrão de planilha: colunas ajustáveis + ocultáveis ─────
  // 'sel' = coluna do checkbox de seleção (NÃO ocultável).
  const CR_COL_ORDER = ['sel', 'pagador', 'descricao', 'categoria', 'vencimento', 'valor', 'pago', 'saldo', 'status', 'acoes']
  const CR_COL_LABELS: Record<string, string> = {
    pagador: 'Pagador', descricao: 'Descrição', categoria: 'Categoria', vencimento: 'Vencimento',
    valor: 'Valor', pago: 'Pago', saldo: 'Saldo', status: 'Status', acoes: 'Ações',
  }
  const CR_COL_WIDTHS_DEFAULT: Record<string, number> = {
    sel: 44, pagador: 220, descricao: 220, categoria: 200, vencimento: 130, valor: 110, pago: 110, saldo: 110, status: 110, acoes: 130,
  }
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    try {
      const s = localStorage.getItem('contasreceber_col_widths')
      if (s) return { ...CR_COL_WIDTHS_DEFAULT, ...JSON.parse(s) }
    } catch { /* ignore */ }
    return CR_COL_WIDTHS_DEFAULT
  })
  useEffect(() => { localStorage.setItem('contasreceber_col_widths', JSON.stringify(colWidths)) }, [colWidths])
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => {
    try {
      const s = localStorage.getItem('contasreceber_hidden_cols')
      if (s) return new Set(JSON.parse(s) as string[])
    } catch { /* ignore */ }
    return new Set()
  })
  useEffect(() => { localStorage.setItem('contasreceber_hidden_cols', JSON.stringify([...hiddenCols])) }, [hiddenCols])
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const isColVisible = (k: string) => !hiddenCols.has(k)
  const toggleColVisible = (k: string) => setHiddenCols(prev => {
    const n = new Set(prev)
    if (n.has(k)) n.delete(k); else n.add(k)
    return n
  })
  const visibleCRCols = CR_COL_ORDER.filter(isColVisible)
  const resizingRef = useRef<{ key: string; startX: number; startW: number } | null>(null)
  const startResize = (key: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    resizingRef.current = { key, startX: e.clientX, startW: colWidths[key] ?? CR_COL_WIDTHS_DEFAULT[key] }
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

  // ── Filters ──
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  const [selectedAgendaDate, setSelectedAgendaDate] = useState<string | null>(null)

  // ── Modals ──
  const [quitarModal, setQuitarModal] = useState<CR | null>(null)
  const [novoModal, setNovoModal] = useState(false)
  const [editarModal, setEditarModal] = useState<CR | null>(null)
  const [renegociarModal, setRenegociarModal] = useState<CR | null>(null)
  const [cobrarAlvo, setCobrarAlvo] = useState<CobrarAlvo | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null)
  const [dropdownCoords, setDropdownCoords] = useState<DropdownCoords | null>(null)
  const [whatsCobrancaModal, setWhatsCobrancaModal] = useState<{ cr: CR; phone: string; text: string } | null>(null)
  const [emailCobrancaModal, setEmailCobrancaModal] = useState<{ cr: CR; email: string; assunto: string; corpo: string } | null>(null)
  const [enviandoLote, setEnviandoLote] = useState(false)
  const [loteEnviando, setLoteEnviando] = useState<{ current: number; total: number }>({ current: 0, total: 0 })

  // ── Bulk selection ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [quitarLoteModal, setQuitarLoteModal] = useState(false)
  const [loteProgress, setLoteProgress] = useState({ current: 0, total: 0 })

  // ── Submitting state ──
  const [submitting, setSubmitting] = useState(false)

  const companyId = selectedCompany?.id
  const { isCRConciliada } = useConciliadasIds(companyId)

  // ── Fetch items ──
  // Contas a receber (React Query: cacheia entre navegações — reabrir a tela
  // com a mesma empresa aparece na hora). Recarrega via fetchItems após mutações.
  const { data: itemsData, isLoading, refetch: refetchItems } = useQuery({
    queryKey: ['contas-receber', companyId],
    enabled: !!companyId,
    queryFn: async () => {
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

      // Itens da venda vinculada (para mostrar o que foi vendido em cada titulo)
      const vendaIds = Array.from(new Set(allData.filter((cr: any) => cr.venda_id).map((cr: any) => cr.venda_id as string)))
      const itensLabelByVenda: Record<string, string> = {}
      if (vendaIds.length > 0) {
        const chunkSize = 200
        for (let i = 0; i < vendaIds.length; i += chunkSize) {
          const chunk = vendaIds.slice(i, i + chunkSize)
          const { data: itens } = await db
            .from('vendas_itens')
            .select('venda_id, descricao, quantidade')
            .in('venda_id', chunk)
          const byVenda: Record<string, { descricao: string; quantidade: number }[]> = {}
          ;(itens || []).forEach((it: any) => {
            if (!byVenda[it.venda_id]) byVenda[it.venda_id] = []
            byVenda[it.venda_id].push({ descricao: it.descricao, quantidade: Number(it.quantidade) || 1 })
          })
          for (const vid of Object.keys(byVenda)) {
            const arr = byVenda[vid]
            if (arr.length === 1) {
              const it = arr[0]
              itensLabelByVenda[vid] = it.quantidade > 1 ? `${it.descricao} (${it.quantidade}x)` : it.descricao
            } else {
              const extra = arr.length - 1
              itensLabelByVenda[vid] = `${arr[0].descricao} · +${extra} ${extra === 1 ? 'item' : 'itens'}`
            }
          }
        }
      }

      const enriched: CR[] = (allData as CR[]).map(cr => ({
        ...cr,
        _itensVenda: cr.venda_id ? (itensLabelByVenda[cr.venda_id] || null) : null,
      }))
      return enriched
    },
  })
  const items = itemsData ?? []
  const loading = isLoading
  // Mantém o nome usado nos pontos que recarregam após mutação; ignora args (ex.: onChange).
  const fetchItems = () => refetchItems()

  // ── Fetch lookups ──
  async function fetchLookups() {
    if (!companyId) return
    const [banksRes, accountsRes, centrosRes, clientesRes, prodRes] = await Promise.all([
      db.from('bank_accounts').select('id, name, banco').eq('company_id', companyId).eq('is_active', true),
      db.from('chart_of_accounts').select('id, code, name').eq('company_id', companyId).eq('account_type', 'revenue').order('code'),
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
    // fetchItems agora é automático via useQuery; aqui só os lookups.
    fetchLookups()
  }, [companyId])

  // ── Open new title modal when ?new=true ──
  useEffect(() => {
    if (searchParams.get('new') === 'true') {
      setNovoModal(true)
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // ── Close dropdown on outside click / scroll / resize ──
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

  // ── Derived data ──
  const categoryMap = useMemo(() => {
    const m: Record<string, string> = {}
    chartAccounts.forEach(a => { m[a.id] = a.code ? `${a.code} - ${a.name}` : a.name })
    return m
  }, [chartAccounts])

  const enrichedItems = useMemo(() => items.map(cr => ({ ...cr, _status: computeStatus(cr) })), [items])

  // Date-range filter aplicado a TUDO da pagina (KPIs, agenda, tabela).
  // CRs pagos filtram pela data_pagamento (quando o dinheiro entrou) — assim
  // ao filtrar "hoje" voce ve tudo que recebeu hoje + tudo que vence hoje.
  // CRs em aberto/vencidos continuam filtrando por data_vencimento.
  const refDateFor = (cr: any): string =>
    cr._status === 'pago' && cr.data_pagamento ? cr.data_pagamento : cr.data_vencimento

  // ── Cobranca via WhatsApp ──
  async function abrirCobrancaWhatsApp(cr: CR) {
    if (!companyId) return
    // Tenta achar o celular do cliente pelo CPF/CNPJ ou nome
    let phone = ''
    try {
      let q = db.from('clients').select('celular,telefone').eq('company_id', companyId).limit(1)
      if (cr.pagador_cpf_cnpj) {
        q = q.eq('cpf_cnpj', cr.pagador_cpf_cnpj)
      } else {
        q = q.ilike('razao_social', cr.pagador_nome)
      }
      const { data } = await q
      const row = data?.[0]
      phone = row?.celular || row?.telefone || ''
    } catch { /* ignore */ }

    // Monta template de cobranca
    const hoje = format(new Date(), 'yyyy-MM-dd')
    const isVencido = cr.data_vencimento < hoje && cr._status !== 'pago' && cr._status !== 'cancelado'
    const diasAtraso = isVencido ? differenceInDays(new Date(), parseISO(cr.data_vencimento)) : 0
    const saldo = cr.valor - (cr.valor_pago || 0)
    const linhas = [
      `Olá ${cr.pagador_nome}!`,
      ``,
      isVencido
        ? `Identificamos um título *em atraso* há ${diasAtraso} dia${diasAtraso > 1 ? 's' : ''}:`
        : `Lembrete de cobrança — título com vencimento próximo:`,
      ``,
      `*Valor:* ${formatBRL(saldo)}`,
      `*Vencimento:* ${formatData(cr.data_vencimento)}`,
    ]
    if (cr.observacoes) linhas.push(`*Referente a:* ${cr.observacoes}`)
    linhas.push(``)
    linhas.push(`Por favor, providencie o pagamento. Qualquer dúvida, estamos à disposição.`)
    const text = linhas.join('\n')

    setWhatsCobrancaModal({ cr, phone, text })
  }

  // Cobranca via e-mail (linha)
  async function abrirCobrancaEmail(cr: CR) {
    if (!companyId) return
    let email = cr.pagador_email || ''
    if (!email) {
      try {
        let q = db.from('clients').select('email').eq('company_id', companyId).limit(1)
        if (cr.pagador_cpf_cnpj) q = q.eq('cpf_cnpj', cr.pagador_cpf_cnpj)
        else q = q.ilike('razao_social', cr.pagador_nome)
        const { data } = await q
        email = data?.[0]?.email || ''
      } catch { /* ignore */ }
    }

    const hoje = format(new Date(), 'yyyy-MM-dd')
    const isVencido = cr.data_vencimento < hoje && cr._status !== 'pago' && cr._status !== 'cancelado'
    const diasAtraso = isVencido ? differenceInDays(new Date(), parseISO(cr.data_vencimento)) : 0
    const saldo = cr.valor - (cr.valor_pago || 0)
    const assunto = isVencido
      ? `Título em atraso — ${formatBRL(saldo)}`
      : `Lembrete de cobrança — vencimento ${formatData(cr.data_vencimento)}`
    const corpo = [
      `Olá ${cr.pagador_nome}!`,
      ``,
      isVencido
        ? `Identificamos um título em atraso há ${diasAtraso} dia${diasAtraso > 1 ? 's' : ''}:`
        : `Lembrete de cobrança — título com vencimento próximo:`,
      ``,
      `Valor: ${formatBRL(saldo)}`,
      `Vencimento: ${formatData(cr.data_vencimento)}`,
      cr.observacoes ? `Referente a: ${cr.observacoes}` : '',
      ``,
      `Por favor, providencie o pagamento. Qualquer dúvida, estamos à disposição.`,
    ].filter(Boolean).join('\n')

    setEmailCobrancaModal({ cr, email, assunto, corpo })
  }

  // Envia lembrete WhatsApp em lote para os CRs selecionados
  async function enviarLembreteLote() {
    if (!companyId || selectedIds.size === 0) return
    const selecionados = enrichedItems.filter(cr => selectedIds.has(cr.id))
    if (selecionados.length === 0) return

    const ok = await confirm({
      title: `Enviar lembrete WhatsApp para ${selecionados.length} cliente${selecionados.length > 1 ? 's' : ''}?`,
      description: 'Vamos buscar o celular cadastrado de cada cliente e enviar uma mensagem padrão de cobrança. Clientes sem celular cadastrado serão pulados.',
      confirmLabel: 'Sim, enviar',
    })
    if (!ok) return

    setEnviandoLote(true)
    setLoteEnviando({ current: 0, total: selecionados.length })

    // Busca celulares dos clientes em batch (1 query por CPF/CNPJ)
    const cpfs = selecionados.map(cr => cr.pagador_cpf_cnpj).filter(Boolean) as string[]
    let clientsByCpf: Record<string, { celular?: string; telefone?: string }> = {}
    if (cpfs.length > 0) {
      const { data } = await db.from('clients').select('cpf_cnpj, celular, telefone').eq('company_id', companyId).in('cpf_cnpj', cpfs)
      ;(data || []).forEach((c: any) => { if (c.cpf_cnpj) clientsByCpf[c.cpf_cnpj] = { celular: c.celular, telefone: c.telefone } })
    }

    const hoje = format(new Date(), 'yyyy-MM-dd')
    let enviados = 0, falhou = 0, semCelular = 0
    for (let i = 0; i < selecionados.length; i++) {
      const cr = selecionados[i]
      setLoteEnviando({ current: i + 1, total: selecionados.length })

      const c = cr.pagador_cpf_cnpj ? clientsByCpf[cr.pagador_cpf_cnpj] : null
      const phone = c?.celular || c?.telefone || ''
      if (!phone) { semCelular++; continue }

      const isVencido = cr.data_vencimento < hoje && cr._status !== 'pago' && cr._status !== 'cancelado'
      const diasAtraso = isVencido ? differenceInDays(new Date(), parseISO(cr.data_vencimento)) : 0
      const saldo = cr.valor - (cr.valor_pago || 0)
      const text = [
        `Olá ${cr.pagador_nome}!`,
        ``,
        isVencido
          ? `Identificamos um título em atraso há ${diasAtraso} dia${diasAtraso > 1 ? 's' : ''}:`
          : `Lembrete de cobrança — título com vencimento próximo:`,
        ``,
        `*Valor:* ${formatBRL(saldo)}`,
        `*Vencimento:* ${formatData(cr.data_vencimento)}`,
        cr.observacoes ? `*Referente a:* ${cr.observacoes}` : null,
        ``,
        `Por favor, providencie o pagamento. Qualquer dúvida, estamos à disposição.`,
      ].filter(Boolean).join('\n')

      const result = await sendWhatsApp({ phone, text })
      if (result.ok) enviados++; else falhou++
      // pequeno delay pra nao saturar a Evolution API
      await new Promise(r => setTimeout(r, 350))
    }

    setEnviandoLote(false)
    setLoteEnviando({ current: 0, total: 0 })

    const partes: string[] = []
    if (enviados > 0) partes.push(`${enviados} enviados`)
    if (falhou > 0) partes.push(`${falhou} falharam`)
    if (semCelular > 0) partes.push(`${semCelular} sem celular`)
    toast(enviados > 0 ? 'Lembretes enviados' : 'Nada enviado', { description: partes.join(' · ') })
    if (enviados > 0) setSelectedIds(new Set())
  }

  const dateFilteredItems = useMemo(() => {
    let list = enrichedItems
    if (dateFrom) list = list.filter(cr => refDateFor(cr) >= dateFrom)
    if (dateTo) list = list.filter(cr => refDateFor(cr) <= dateTo)
    return list
  }, [enrichedItems, dateFrom, dateTo])

  const filtered = useMemo(() => {
    let list = dateFilteredItems
    if (search) {
      const s = search.toLowerCase().trim()
      list = list.filter(cr => {
        const saldo = cr.valor - (cr.valor_pago || 0)
        const categoria = cr.conta_contabil_id ? (categoryMap[cr.conta_contabil_id] || '') : ''
        const statusLabel = statusBadge(cr._status).label
        const haystack = [
          cr.pagador_nome,
          cr.pagador_cpf_cnpj || '',
          categoria,
          cr.data_vencimento,
          formatData(cr.data_vencimento),
          cr.data_pagamento || '',
          cr.data_pagamento ? formatData(cr.data_pagamento) : '',
          formatBRL(cr.valor),
          formatBRL(cr.valor_pago || 0),
          formatBRL(saldo),
          String(cr.valor),
          String(cr.valor_pago || 0),
          String(saldo),
          statusLabel,
          cr._status,
        ].join(' ').toLowerCase()
        return haystack.includes(s)
      })
    }
    if (statusFilter !== 'todos') {
      list = list.filter(cr => cr._status === statusFilter)
    }
    return list
  }, [dateFilteredItems, search, statusFilter, categoryMap])

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
  // KPIs refletem o período do filtro (dateFrom/dateTo via dateFilteredItems).
  // CR pago entra pelo data_pagamento; CR em aberto/vencido pelo data_vencimento
  // (essa lógica de "qual data importa" já está em refDateFor).
  const kpis = useMemo(() => {
    const hoje = new Date().toISOString().split('T')[0]
    const em7dias = format(addDays(new Date(), 7), 'yyyy-MM-dd')

    let totalAberto = 0
    let countAberto = 0
    let vencendo7d = 0
    let countVencendo = 0
    let totalVencido = 0
    let countVencido = 0
    let recebidoMes = 0
    let countRecebido = 0

    for (const cr of dateFilteredItems) {
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
      if (cr.data_pagamento && (cr._status === 'pago' || cr._status === 'parcial')) {
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
  }, [dateFilteredItems])

  // ─── Agenda heatmap (estilo GitHub) ─────────────────────
  // Janela dinamica: usa [dateFrom, dateTo] do filtro quando setado, senao default ±15 dias.
  const agenda30 = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    let startDate: Date
    let endDate: Date
    if (dateFrom || dateTo) {
      startDate = dateFrom ? parseISO(dateFrom) : addDays(today, -15)
      endDate = dateTo ? parseISO(dateTo) : addDays(today, 14)
    } else {
      startDate = addDays(today, -15)
      endDate = addDays(today, 14)
    }
    startDate.setHours(0, 0, 0, 0)
    endDate.setHours(0, 0, 0, 0)
    if (endDate < startDate) endDate = startDate
    const totalDays = differenceInDays(endDate, startDate) + 1

    const days: { date: Date; dateStr: string; value: number; count: number; isPast: boolean; hasOverdue: boolean }[] = []
    const byDay: Record<string, { value: number; count: number; hasOverdue: boolean }> = {}

    for (const cr of dateFilteredItems) {
      if (cr._status === 'pago' || cr._status === 'cancelado') continue
      const key = cr.data_vencimento
      if (!key) continue
      const venc = parseISO(key)
      venc.setHours(0, 0, 0, 0)
      if (venc < startDate || venc > endDate) continue
      const pendente = Number(cr.valor || 0) - Number(cr.valor_pago || 0)
      if (pendente <= 0) continue
      if (!byDay[key]) byDay[key] = { value: 0, count: 0, hasOverdue: false }
      byDay[key].value += pendente
      byDay[key].count += 1
      if (venc < today) byDay[key].hasOverdue = true
    }

    for (let i = 0; i < totalDays; i++) {
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

    return { days, weeks, max, total, totalVencido, diasComEntrada, diasVencidos, monthLabels, totalDays }
  }, [dateFilteredItems, dateFrom, dateTo])

  // Lista de recebimentos para o painel lateral da agenda
  // Usa a mesma janela do heatmap (dateFrom/dateTo ou default ±15 dias)
  const agendaDiaLista = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    let inicio: Date
    let fim: Date
    if (dateFrom || dateTo) {
      inicio = dateFrom ? parseISO(dateFrom) : addDays(today, -15)
      fim = dateTo ? parseISO(dateTo) : addDays(today, 14)
    } else {
      inicio = addDays(today, -15)
      fim = addDays(today, 14)
    }
    inicio.setHours(0, 0, 0, 0)
    fim.setHours(0, 0, 0, 0)
    const result: (typeof dateFilteredItems[number] & { _pendente: number })[] = []
    for (const cr of dateFilteredItems) {
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
  }, [dateFilteredItems, selectedAgendaDate, dateFrom, dateTo])

  const agendaDiaTotal = useMemo(
    () => agendaDiaLista.reduce((s, cr) => s + cr._pendente, 0),
    [agendaDiaLista]
  )

  // Agenda agrupada por plano de contas (mesmo layout de Contas a Pagar):
  // cada plano vira uma seção com subtotal e os itens listados embaixo.
  const agendaAgrupadoPorPlano = useMemo(() => {
    const groups = new Map<string, { items: typeof agendaDiaLista; total: number }>()
    for (const cr of agendaDiaLista) {
      const plano = cr.conta_contabil_id
        ? (categoryMap[cr.conta_contabil_id] || 'Sem plano de contas')
        : 'Sem plano de contas'
      const g = groups.get(plano) || { items: [], total: 0 }
      g.items.push(cr)
      g.total += cr._pendente
      groups.set(plano, g)
    }
    return Array.from(groups.entries())
      .map(([plano, g]) => ({ plano, ...g }))
      .sort((a, b) => b.total - a.total)
  }, [agendaDiaLista, categoryMap])

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

  // ─── Excluir titulo (soft-delete + cascata) ──────────────────────
  const excluirCR = async (cr: CR) => {
    const ok = await confirm({
      title: `Excluir este titulo de ${formatBRL(cr.valor)}?`,
      description: 'Esta acao nao pode ser desfeita. Todas as movimentacoes e conciliacoes associadas serao removidas.',
      confirmLabel: 'Sim, excluir',
      variant: 'destructive',
    })
    if (!ok) return
    try {
      await softDeleteWithUndo({
        client: db,
        table: 'contas_receber',
        id: cr.id,
        successLabel: 'Titulo excluido',
        onChange: fetchItems,
        cleanup: async () => {
          await db.from('movimentacoes').delete().eq('conta_receber_id', cr.id)
          await db.from('bank_reconciliation_matches').update({ receivable_id: null }).eq('receivable_id', cr.id)
          await db.from('bank_transactions').update({ reconciled_receivable_id: null }).eq('reconciled_receivable_id', cr.id)
        },
      })
    } catch (err: any) {
      console.error('[excluirCR]', err)
      toast.error('Erro ao excluir: ' + (err.message || 'Erro desconhecido'))
    }
  }

  // ─── PDF: Relatório Mensal de Contas a Receber Previstas ─────────
  const centroCustoMap = useMemo(() => {
    const m: Record<string, string> = {}
    centrosCusto.forEach(c => { m[c.id] = `${c.codigo} - ${c.descricao}` })
    return m
  }, [centrosCusto])

  const exportarPrevistasPDF = () => {
    const previstas = filtered.filter(
      cr => cr._status !== 'pago' && cr._status !== 'cancelado'
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
    const GREEN = [10, 92, 46] as const
    const RED = [180, 30, 30] as const
    const ORANGE = [234, 88, 12] as const
    const MUTED = [110, 110, 110] as const

    const fmt = (v: number) =>
      v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    const saldoCR = (cr: typeof previstas[number]) =>
      Number(cr.valor || 0) - Number(cr.valor_pago || 0)

    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })

    // Classifica por urgência (mesma lógica de Contas a Pagar, adaptada para CR).
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayIso = format(today, 'yyyy-MM-dd')
    const seteIso = format(addDays(today, 7), 'yyyy-MM-dd')

    type Bucket = 'vencidos' | 'hoje' | 'proximos7' | 'proximos30'
    const classify = (cr: typeof previstas[number]): Bucket => {
      const v = cr.data_vencimento
      if (v < todayIso) return 'vencidos'
      if (v === todayIso) return 'hoje'
      if (v <= seteIso) return 'proximos7'
      return 'proximos30'
    }

    const grupos: { key: Bucket; label: string; cor: readonly [number, number, number]; items: typeof previstas }[] = [
      { key: 'vencidos', label: 'VENCIDOS', cor: RED, items: [] as any },
      { key: 'hoje', label: 'VENCE HOJE', cor: RED, items: [] as any },
      { key: 'proximos7', label: 'PRÓXIMOS 7 DIAS', cor: ORANGE, items: [] as any },
      { key: 'proximos30', label: 'A RECEBER (DEMAIS)', cor: GREEN, items: [] as any },
    ]
    for (const cr of previstas) {
      const g = classify(cr)
      const bucket = grupos.find(x => x.key === g)
      if (bucket) (bucket.items as any).push(cr)
    }
    grupos.forEach(g =>
      g.items.sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento))
    )

    const totalGeral = previstas.reduce((s, cr) => s + saldoCR(cr), 0)
    const totalVencidos = grupos[0].items.reduce((s, cr) => s + saldoCR(cr), 0)
    const totalHoje = grupos[1].items.reduce((s, cr) => s + saldoCR(cr), 0)
    const total7 = grupos[2].items.reduce((s, cr) => s + saldoCR(cr), 0)

    const cols = {
      venc: { x: MARGIN + 2, label: 'Vencimento' },
      pagador: { x: MARGIN + 22, label: 'Pagador' },
      plano: { x: MARGIN + 84, label: 'Plano de Contas' },
      centro: { x: MARGIN + 136, label: 'Centro' },
      valor: { x: W - MARGIN - 2, label: 'Valor (R$)' },
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
      doc.text('Relatório de Contas a Receber Previstas', MARGIN, 19)

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
      doc.text(cols.pagador.label, cols.pagador.x, y + 5.3)
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

    drawHeader()
    let y = HEADER_H + 6

    // KPIs
    const kpiW = (contentW - 9) / 4
    const kpiCards = [
      { label: 'TOTAL A RECEBER', val: fmt(totalGeral), color: GREEN },
      { label: 'VENCIDOS', val: fmt(totalVencidos), color: RED },
      { label: 'VENCE HOJE', val: fmt(totalHoje), color: RED },
      { label: 'PRÓX. 7 DIAS', val: fmt(total7), color: ORANGE },
    ]
    kpiCards.forEach((k, i) => {
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

    const truncate = (s: string, max: number) =>
      !s ? '—' : s.length > max ? s.slice(0, max - 1) + '…' : s

    for (const g of grupos) {
      if (g.items.length === 0) continue
      const subtotal = g.items.reduce((s, cr) => s + saldoCR(cr), 0)

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
      for (const cr of g.items) {
        y = ensureSpace(y, 6)
        if (zebra) {
          doc.setFillColor(252, 252, 253)
          doc.rect(MARGIN, y, contentW, 5.4, 'F')
        }
        zebra = !zebra

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(60, 60, 60)
        doc.text(format(parseISO(cr.data_vencimento), 'dd/MM/yyyy'), cols.venc.x, y + 3.8)
        doc.text(truncate(cr.pagador_nome || '—', 32), cols.pagador.x, y + 3.8)

        const plano = cr.conta_contabil_id ? categoryMap[cr.conta_contabil_id] || '—' : '—'
        doc.text(truncate(plano, 28), cols.plano.x, y + 3.8)

        const centro = cr.centro_custo_id ? centroCustoMap[cr.centro_custo_id] || '—' : '—'
        doc.text(truncate(centro, 12), cols.centro.x, y + 3.8)

        doc.setFont('helvetica', 'bold')
        doc.setTextColor(g.cor[0], g.cor[1], g.cor[2])
        doc.text(fmt(saldoCR(cr)), cols.valor.x, y + 3.8, { align: 'right' })
        y += 5.4
      }
      y += 2
    }

    y = ensureSpace(y, 18)
    y += 2
    doc.setDrawColor(BRAND[0], BRAND[1], BRAND[2])
    doc.setLineWidth(0.5)
    doc.line(MARGIN, y, W - MARGIN, y)
    y += 7
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(BRAND[0], BRAND[1], BRAND[2])
    doc.text('Total a Receber', MARGIN, y)
    doc.text(fmt(totalGeral), W - MARGIN, y, { align: 'right' })

    drawFooter()

    const fileName =
      dateFrom && dateTo
        ? `Contas_Receber_Previstas_${dateFrom}_${dateTo}.pdf`
        : `Contas_Receber_Previstas_${format(new Date(), 'yyyy-MM-dd')}.pdf`
    doc.save(fileName)
    toast.success('Relatório exportado em PDF')
  }

  /* ================================================================
     RENDER
     ================================================================ */

  return (
    <AppLayout title="Contas a Receber">
      <div className="max-w-[1400px] mx-auto">

        <PagePanel title="Contas a Receber" subtitle="Recebimentos previstos e realizados por cliente">

        {/* ── KPI Cards (padrão único do sistema) ── */}
        <KpiCardGrid>
          <KpiCard
            label="Total em aberto"
            value={formatBRL(kpis.totalAberto)}
            valueColor="#1D2939"
            sub={`${kpis.countAberto} título${kpis.countAberto !== 1 ? 's' : ''} em aberto`}
          />
          <KpiCard
            label="Vencendo em 7 dias"
            value={formatBRL(kpis.vencendo7d)}
            valueColor="#EA580C"
            sub={`${kpis.countVencendo} título${kpis.countVencendo !== 1 ? 's' : ''} a vencer`}
          />
          <KpiCard
            label="Vencidos"
            value={formatBRL(kpis.totalVencido)}
            valueColor="#E53E3E"
            sub={`${kpis.countVencido} título${kpis.countVencido !== 1 ? 's' : ''} em atraso`}
          />
          <KpiCard
            label="Recebido no período"
            value={formatBRL(kpis.recebidoMes)}
            valueColor="#039855"
            sub={`${kpis.countRecebido} recebimento${kpis.countRecebido !== 1 ? 's' : ''} no período`}
          />
        </KpiCardGrid>

        {/* ── Filtro de periodo (padrao do sistema) ── */}
        <div className="flex justify-end">
          <PeriodFilter
            from={dateFrom}
            to={dateTo}
            onApply={(f, t) => { setDateFrom(f); setDateTo(t) }}
          />
        </div>

        {/* ── Agenda 30d (esquerda) + Contas a receber do dia (direita) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Agenda heatmap */}
          <div className="bg-white border border-[#EAECF0] rounded-xl overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)' }}>
            <div className="flex items-center justify-between px-4 py-3 bg-[#071D41]">
              <div>
                <div className="text-[16px] font-bold uppercase tracking-[0.5px] text-white">Agenda de recebimentos</div>
                <div className="text-[11px] text-white/80 mt-0.5">
                  {(dateFrom || dateTo) ? 'Período filtrado' : 'Próximos 30 dias'} &middot; {agenda30.totalDays} dia{agenda30.totalDays !== 1 ? 's' : ''} &middot; {agenda30.diasComEntrada} com entrada
                  {agenda30.diasVencidos > 0 && (
                    <span className="text-[#FB923C] font-semibold"> &middot; {agenda30.diasVencidos} em atraso</span>
                  )}
                  &middot; clique em um dia
                </div>
              </div>
              <div className="flex items-center gap-3 text-[10.5px] text-white/70">
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
                  <span className="text-[10.5px] text-[#98A2B3] font-semibold uppercase tracking-wide">Total previsto ({agenda30.totalDays}d)</span>
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
            <div className="flex items-center justify-between px-4 py-3 bg-[#071D41]">
              <div>
                <div className="text-[16px] font-bold uppercase tracking-[0.5px] text-white">Contas a receber</div>
                <div className="text-[11px] text-white/80 mt-0.5">
                  {selectedAgendaDate
                    ? `Vencimento em ${format(parseISO(selectedAgendaDate), 'dd/MM/yyyy')}`
                    : (dateFrom || dateTo)
                    ? `Todas \u00b7 per\u00edodo filtrado (${agenda30.totalDays}d)`
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
                  className="flex items-center gap-1 text-[11px] font-semibold text-white hover:bg-white/20 px-2 h-7 border border-white/40 rounded"
                >
                  <Copy size={11} /> Copiar
                </button>
                {selectedAgendaDate && (
                  <button
                    onClick={() => setSelectedAgendaDate(null)}
                    className="text-[11px] font-semibold text-white/80 hover:text-white"
                  >
                    Limpar
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 p-3" style={{ minHeight: 0 }}>
              <div className="border border-[#EAECF0] rounded-lg overflow-auto bg-white" style={{ maxHeight: 336 }}>
              {agendaDiaLista.length === 0 ? (
                <div className="px-5 py-10 text-center text-[13px] text-[#98A2B3]">
                  Nenhuma conta a receber {selectedAgendaDate ? 'nesta data' : 'nesta janela'}.
                </div>
              ) : (
                <div className="divide-y divide-[#F2F4F7]">
                  {agendaAgrupadoPorPlano.map(g => (
                    <div key={g.plano}>
                      <div className="px-3 py-2 bg-[#F9FAFB] flex items-center justify-between sticky top-0 z-[1]">
                        <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#1D2939] truncate" style={{ maxWidth: 280 }} title={g.plano}>
                          {g.plano}
                        </span>
                        <span className="text-[11px] font-bold text-[#039855] tabular-nums">
                          {formatBRL(g.total)}
                        </span>
                      </div>
                      <SpreadsheetTable
                        rows={g.items}
                        rowKey={(cr: any) => cr.id}
                        showHeader={false}
                        resetKey={`${selectedAgendaDate ?? 'all'}|${g.plano}`}
                        className="text-[12px]"
                        cellClassName="border-[#F2F4F7]"
                        columns={[
                          {
                            id: 'nome',
                            weight: 24,
                            truncate: false,
                            header: 'Nome',
                            title: (cr: any) => cr.pagador_nome ?? '',
                            cellClassName: 'text-[#1D2939]',
                            render: (cr: any) => {
                              const isVencido = cr.data_vencimento < format(new Date(), 'yyyy-MM-dd')
                              return (
                                <>
                                  <div className="font-medium truncate">{cr.pagador_nome}</div>
                                  {!selectedAgendaDate && (
                                    <div className={`text-[10.5px] ${isVencido ? 'text-[#C2410C] font-semibold' : 'text-[#98A2B3]'}`}>
                                      {format(parseISO(cr.data_vencimento), 'dd/MM')}{isVencido ? ' · vencida' : ''}
                                    </div>
                                  )}
                                </>
                              )
                            },
                          },
                          {
                            id: 'valor',
                            weight: 10,
                            numeric: true,
                            header: 'Valor',
                            cellClassName: 'font-semibold',
                            render: (cr: any) => {
                              const isVencido = cr.data_vencimento < format(new Date(), 'yyyy-MM-dd')
                              return (
                                <span className={isVencido ? 'text-[#C2410C]' : 'text-[#1D2939]'}>
                                  {formatBRL(cr._pendente)}
                                </span>
                              )
                            },
                          },
                        ]}
                      />
                    </div>
                  ))}
                </div>
              )}
              </div>
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
                placeholder="Buscar por pagador, plano de contas, vencimento, valor, status..."
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
                onClick={() => {
                  setSearch(''); setStatusFilter('todos')
                  setDateFrom(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
                  setDateTo(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
                }}
                className="text-[11px] font-semibold text-[#667085] hover:text-black px-1.5 h-7"
              >
                Limpar
              </button>
            )}
            <div className="flex-1" />
            <RoleGate minRole="operador">
              <button
                onClick={() => setNovoModal(true)}
                className="flex items-center gap-1 px-2.5 h-7 text-[11.5px] font-semibold text-white bg-black rounded hover:bg-[#1D2939] transition-colors"
              >
                <Plus size={11} /> Novo t&iacute;tulo
              </button>
            </RoleGate>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="border border-[#EAECF0] rounded-xl overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)' }}>
          <div className="px-4 py-2.5 flex items-center justify-between" style={{ backgroundColor: '#071D41' }}>
            <h3 className="text-[13px] font-bold text-white tracking-tight">
              Títulos · {filtered.length}
            </h3>
            {someSelected ? (
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-white/70">
                  {selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}
                </span>
                <button
                  onClick={enviarLembreteLote}
                  disabled={enviandoLote}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-white bg-emerald-600 rounded hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  title="Enviar lembrete via WhatsApp para todos os selecionados"
                >
                  {enviandoLote ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2z"/></svg>
                  )}
                  {enviandoLote ? `Enviando ${loteEnviando.current}/${loteEnviando.total}...` : 'Enviar lembrete WhatsApp'}
                </button>
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
            ) : (
              <div className="flex items-center gap-2">
                <div className="relative self-center">
                  <button
                    onClick={() => setColMenuOpen(o => !o)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-white/20 text-[11px] text-white hover:bg-white/10"
                    title="Mostrar/ocultar colunas"
                  >
                    <Eye size={13} className="text-white/70" /> Colunas
                    <ChevronDown size={12} className={`text-white/60 transition-transform ${colMenuOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {colMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setColMenuOpen(false)} />
                      <div className="absolute right-0 mt-1 z-50 bg-white border border-[#EAECF0] rounded-lg shadow-xl py-1 min-w-[190px]">
                        <p className="px-3 py-1.5 text-[11px] font-bold text-[#98A2B3] uppercase tracking-wider">Exibir colunas</p>
                        {Object.entries(CR_COL_LABELS).map(([k, label]) => (
                          <label key={k} className="flex items-center gap-2 px-3 py-1.5 text-[13px] text-[#1D2939] hover:bg-[#F6F2EB] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isColVisible(k)}
                              onChange={() => toggleColVisible(k)}
                              className="w-4 h-4 rounded border-[#D0D5DD] text-[#059669] focus:ring-[#059669]/30"
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <button
                  onClick={exportarPrevistasPDF}
                  title="Exportar contas previstas em PDF"
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-white/90 hover:text-white border border-white/30 px-3 py-1 rounded-md hover:bg-white/10 transition"
                >
                  <Download size={12} /> Exportar PDF
                </button>
                <ExportMenu<CR & { _status: string }>
                  rows={() => filtered}
                  columns={[
                    { header: 'Vencimento', value: (cr) => formatData(cr.data_vencimento), pdfFlex: 8 },
                    { header: 'Cliente', value: (cr) => cr.pagador_nome || '—', pdfFlex: 16 },
                    { header: 'Descrição', value: (cr) => cr.descricao || cr.observacoes || '—', pdfFlex: 16 },
                    { header: 'Categoria', value: (cr) => cr.conta_contabil_id ? (categoryMap[cr.conta_contabil_id] || '—') : '—', pdfFlex: 16 },
                    { header: 'Valor', value: (cr) => formatBRL(cr.valor), numericValue: (cr) => Number(cr.valor || 0), align: 'right', pdfFlex: 9 },
                    { header: 'Pago', value: (cr) => formatBRL(cr.valor_pago || 0), numericValue: (cr) => Number(cr.valor_pago || 0), align: 'right', pdfFlex: 9 },
                    { header: 'Saldo', value: (cr) => formatBRL(cr.valor - (cr.valor_pago || 0)), numericValue: (cr) => Number(cr.valor || 0) - Number(cr.valor_pago || 0), align: 'right', pdfFlex: 9 },
                    { header: 'Status', value: (cr) => statusBadge(cr._status).label, pdfFlex: 9 },
                  ]}
                  titulo="CONTAS A RECEBER"
                  baseName="contas-receber"
                  formats={['excel']}
                  size="sm"
                />
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
              <table className="text-[12px]" style={{ tableLayout: 'fixed', width: visibleCRCols.reduce((a, k) => a + (colWidths[k] ?? CR_COL_WIDTHS_DEFAULT[k]), 0), minWidth: '100%' }}>
                <colgroup>
                  {CR_COL_ORDER.map(k => (
                    <col key={k} className={isColVisible(k) ? '' : 'hidden'} style={{ width: colWidths[k] ?? CR_COL_WIDTHS_DEFAULT[k] }} />
                  ))}
                </colgroup>
                <thead>
                  <tr className="bg-[#F9FAFB] border-b border-[#EAECF0]">
                    <th className="px-3 py-2 relative border-r border-[#EAECF0]">
                      <input
                        type="checkbox"
                        checked={allSelectableSelected}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-[#ccc] text-[#059669] focus:ring-[#059669] cursor-pointer"
                      />
                    </th>
                    <th className={`px-3 py-2 text-left text-[11px] font-semibold text-[#667085] relative border-r border-[#EAECF0] ${isColVisible('pagador') ? '' : 'hidden'}`}>
                      <span onMouseDown={startResize('pagador')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                      Pagador
                    </th>
                    <th className={`px-3 py-2 text-left text-[11px] font-semibold text-[#667085] relative border-r border-[#EAECF0] ${isColVisible('descricao') ? '' : 'hidden'}`}>
                      <span onMouseDown={startResize('descricao')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                      Descrição
                    </th>
                    <th className={`px-3 py-2 text-left text-[11px] font-semibold text-[#667085] relative border-r border-[#EAECF0] ${isColVisible('categoria') ? '' : 'hidden'}`}>
                      <span onMouseDown={startResize('categoria')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                      Categoria
                    </th>
                    <th className={`px-3 py-2 text-left text-[11px] font-semibold text-[#667085] relative border-r border-[#EAECF0] ${isColVisible('vencimento') ? '' : 'hidden'}`}>
                      <span onMouseDown={startResize('vencimento')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                      Vencimento
                    </th>
                    <th className={`px-3 py-2 text-right text-[11px] font-semibold text-[#667085] relative border-r border-[#EAECF0] ${isColVisible('valor') ? '' : 'hidden'}`}>
                      <span onMouseDown={startResize('valor')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                      Valor
                    </th>
                    <th className={`px-3 py-2 text-right text-[11px] font-semibold text-[#667085] relative border-r border-[#EAECF0] ${isColVisible('pago') ? '' : 'hidden'}`}>
                      <span onMouseDown={startResize('pago')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                      Pago
                    </th>
                    <th className={`px-3 py-2 text-right text-[11px] font-semibold text-[#667085] relative border-r border-[#EAECF0] ${isColVisible('saldo') ? '' : 'hidden'}`}>
                      <span onMouseDown={startResize('saldo')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                      Saldo
                    </th>
                    <th className={`px-3 py-2 text-left text-[11px] font-semibold text-[#667085] relative border-r border-[#EAECF0] ${isColVisible('status') ? '' : 'hidden'}`}>
                      <span onMouseDown={startResize('status')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                      Status
                    </th>
                    <th className={`px-3 py-2 text-right text-[11px] font-semibold text-[#667085] ${isColVisible('acoes') ? '' : 'hidden'}`}>Ações</th>
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
                        className={`border-b border-[#EAECF0] hover:bg-[#F6F2EB] transition-colors ${selectedIds.has(cr.id) ? 'bg-[#ECFDF4]' : ''}`}
                        style={{ height: 44 }}
                      >
                        {/* Checkbox */}
                        <td className="px-3 py-1 align-middle border-r border-[#F1F3F5]">
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
                        <td className={`px-3 py-1 align-middle border-r border-[#F1F3F5] ${isColVisible('pagador') ? '' : 'hidden'}`}>
                          <button
                            type="button"
                            onClick={() => setEditarModal(cr)}
                            title={cr._itensVenda ? `${cr.pagador_nome} — ${cr._itensVenda}` : `Abrir titulo de ${cr.pagador_nome}`}
                            className="font-semibold text-[12px] text-[#1D2939] truncate text-left hover:text-[#059669] hover:underline transition-colors cursor-pointer focus:outline-none focus:text-[#059669] block w-full"
                          >
                            {cr.pagador_nome}
                          </button>
                          {cr._itensVenda ? (
                            <div className="text-[11px] text-[#555] leading-tight truncate" title={cr._itensVenda}>{cr._itensVenda}</div>
                          ) : cr.pagador_cpf_cnpj && (
                            <div className="text-[11px] text-[#999] leading-tight truncate">{cr.pagador_cpf_cnpj}</div>
                          )}
                        </td>
                        {/* Descrição (bandeira/crédito-débito em repasses de cartão; nota nos demais) */}
                        <td className={`px-3 py-1 text-[11.5px] text-[#555] align-middle border-r border-[#F1F3F5] ${isColVisible('descricao') ? '' : 'hidden'}`}>
                          <div className="truncate" title={cr.descricao || cr.observacoes || ''}>
                            {cr.descricao || cr.observacoes || '—'}
                          </div>
                        </td>
                        {/* Categoria */}
                        <td className={`px-3 py-1 text-[11.5px] text-[#555] align-middle border-r border-[#F1F3F5] ${isColVisible('categoria') ? '' : 'hidden'}`}>
                          <div className="truncate" title={cr.conta_contabil_id ? categoryMap[cr.conta_contabil_id] : ''}>
                            {cr.conta_contabil_id ? (categoryMap[cr.conta_contabil_id] || '—') : '—'}
                          </div>
                        </td>
                        {/* Vencimento (ou Pago em, se ja pago) */}
                        <td className={`px-3 py-1 align-middle text-[12px] border-r border-[#F1F3F5] ${isColVisible('vencimento') ? '' : 'hidden'}`}>
                          {cr._status === 'pago' && cr.data_pagamento ? (
                            <>
                              <span className="text-[#039855] font-semibold">
                                {formatData(cr.data_pagamento)}
                              </span>
                              <div className="text-[11px] text-[#999] leading-tight">
                                venc. {formatData(cr.data_vencimento)}
                              </div>
                            </>
                          ) : (
                            <>
                              <span className={isVencido ? 'text-[#E53E3E] font-semibold' : 'text-[#1D2939]'}>
                                {formatData(cr.data_vencimento)}
                              </span>
                              {isVencido && diasAtraso > 0 && (
                                <div className="text-[11px] text-[#E53E3E] leading-tight">
                                  {diasAtraso} {diasAtraso === 1 ? 'dia' : 'dias'} em atraso
                                </div>
                              )}
                            </>
                          )}
                        </td>
                        {/* Valor */}
                        <td className={`px-3 py-1 font-medium text-[12px] text-[#1D2939] align-middle tabular-nums text-right truncate border-r border-[#F1F3F5] ${isColVisible('valor') ? '' : 'hidden'}`}>
                          {formatBRL(cr.valor)}
                        </td>
                        {/* Pago */}
                        <td className={`px-3 py-1 text-[12px] text-[#039855] font-medium align-middle tabular-nums text-right truncate border-r border-[#F1F3F5] ${isColVisible('pago') ? '' : 'hidden'}`}>
                          {formatBRL(cr.valor_pago || 0)}
                        </td>
                        {/* Saldo */}
                        <td className={`px-3 py-1 font-semibold text-[12px] text-[#1D2939] align-middle tabular-nums text-right truncate border-r border-[#F1F3F5] ${isColVisible('saldo') ? '' : 'hidden'}`}>
                          {formatBRL(saldo)}
                        </td>
                        {/* Status */}
                        <td className={`px-3 py-1 align-middle border-r border-[#F1F3F5] ${isColVisible('status') ? '' : 'hidden'}`}>
                          <span
                            className="inline-block px-2 py-0.5 text-[10.5px] font-semibold rounded border"
                            style={{ color: st.text, backgroundColor: st.bg, borderColor: st.border }}
                          >
                            {st.label}
                          </span>
                          {(cr._status === 'pago' || cr._status === 'parcial') && (
                            <div className="mt-0.5">
                              <SeloConciliado conciliado={isCRConciliada(cr.id)} />
                            </div>
                          )}
                        </td>
                        {/* Acoes */}
                        <td className={`px-3 py-1 align-middle text-right ${isColVisible('acoes') ? '' : 'hidden'}`}>
                          <div className="flex items-center justify-end gap-1.5">
                            {cr._status !== 'pago' && cr._status !== 'cancelado' && (
                              <button
                                onClick={() => setQuitarModal(cr)}
                                className="px-2.5 py-1 text-[10.5px] font-semibold text-white bg-[#039855] rounded hover:bg-[#084d25] transition-colors"
                              >
                                Quitar
                              </button>
                            )}
                            {/* Excluir direto (operador+) */}
                            <RoleGate minRole="operador">
                              <button
                                onClick={() => excluirCR(cr)}
                                title="Excluir titulo"
                                className="p-1 rounded hover:bg-[#FEE2E2] text-[#E53E3E] transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </RoleGate>
                            {/* Dropdown */}
                            <div className="relative">
                              <button
                                onClick={e => {
                                  e.stopPropagation()
                                  if (dropdownOpen === cr.id) {
                                    setDropdownOpen(null)
                                    setDropdownCoords(null)
                                  } else {
                                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                                    setDropdownCoords(computeDropdownCoords(rect))
                                    setDropdownOpen(cr.id)
                                  }
                                }}
                                className="p-1 rounded hover:bg-[#EAECF0] transition-colors"
                              >
                                <MoreHorizontal size={14} className="text-[#555]" />
                              </button>
                              {dropdownOpen === cr.id && dropdownCoords && createPortal(
                                <div className="fixed w-48 bg-white border border-[#ccc] rounded-lg shadow-lg" style={{ ...dropdownPositionStyle(dropdownCoords), zIndex: 100 }} onClick={e => e.stopPropagation()}>
                                  <button
                                    onClick={() => { setEditarModal(cr); setDropdownOpen(null) }}
                                    className="w-full px-4 py-2.5 text-left text-[13px] text-[#1D2939] hover:bg-[#F6F2EB] transition-colors first:rounded-t-lg flex items-center gap-2"
                                  >
                                    <Pencil size={13} /> Editar
                                  </button>
                                  <button
                                    onClick={() => { setRenegociarModal(cr); setDropdownOpen(null) }}
                                    className="w-full px-4 py-2.5 text-left text-[13px] text-[#1D2939] hover:bg-[#F6F2EB] transition-colors"
                                  >
                                    Renegociar
                                  </button>
                                  {(cr.valor - (cr.valor_pago || 0)) > 0.005 && (
                                    <button
                                      onClick={() => { setDropdownOpen(null); setCobrarAlvo(cr) }}
                                      className="w-full px-4 py-2.5 text-left text-[13px] text-emerald-700 hover:bg-emerald-50 transition-colors flex items-center gap-2"
                                    >
                                      <QrCode size={13} /> Cobrar por Pix/boleto
                                    </button>
                                  )}
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
                                    onClick={() => { setDropdownOpen(null); abrirCobrancaWhatsApp(cr) }}
                                    className="w-full px-4 py-2.5 text-left text-[13px] text-emerald-700 hover:bg-emerald-50 transition-colors flex items-center gap-2"
                                  >
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2zm0 18.15h-.01c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.32a8.234 8.234 0 01-1.27-4.37c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 012.41 5.83c.02 4.54-3.68 8.23-8.21 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.37-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.42-.14-.01-.31-.01-.48-.01s-.43.06-.66.31c-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.66 4.23 3.73.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29z"/></svg>
                                    Enviar cobrança WhatsApp
                                  </button>
                                  <button
                                    onClick={() => { setDropdownOpen(null); abrirCobrancaEmail(cr) }}
                                    className="w-full px-4 py-2.5 text-left text-[13px] text-[#1E3A8A] hover:bg-blue-50 transition-colors flex items-center gap-2"
                                  >
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>
                                    Enviar cobrança E-mail
                                  </button>
                                  <button
                                    onClick={() => { setDropdownOpen(null); excluirCR(cr) }}
                                    className="w-full px-4 py-2.5 text-left text-[13px] text-[#E53E3E] hover:bg-[#FEE2E2] transition-colors last:rounded-b-lg"
                                  >
                                    Excluir titulo
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
              <TablePagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={(p) => setPage(p)} />
            </>)}
          </div>
        </div>
        </PagePanel>
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

      {/* ── Modal: Editar CR ── */}
      {editarModal && (
        <ModalNovoCR
          companyId={companyId!}
          chartAccounts={chartAccounts}
          centrosCusto={centrosCusto}
          clientes={clientes}
          products={products}
          submitting={submitting}
          editing={editarModal}
          onClose={() => setEditarModal(null)}
          onConfirm={async () => {
            setEditarModal(null)
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

      {/* ── Diálogo: Cobrar por Pix/boleto (Asaas) ── */}
      <CobrarAsaasDialog
        alvo={cobrarAlvo}
        onClose={() => setCobrarAlvo(null)}
        onCreated={fetchItems}
      />

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

      <SendWhatsAppDialog
        open={!!whatsCobrancaModal}
        onClose={() => setWhatsCobrancaModal(null)}
        title="Enviar cobrança via WhatsApp"
        subtitle={whatsCobrancaModal && (
          <>
            <p className="font-semibold text-[#1D2939]">{whatsCobrancaModal.cr.pagador_nome}</p>
            <p className="text-[#667085] mt-0.5">{formatBRL(whatsCobrancaModal.cr.valor)} — Venc: {formatData(whatsCobrancaModal.cr.data_vencimento)}</p>
          </>
        )}
        defaultPhone={whatsCobrancaModal?.phone || ''}
        defaultText={whatsCobrancaModal?.text || ''}
      />

      <SendEmailDialog
        open={!!emailCobrancaModal}
        onClose={() => setEmailCobrancaModal(null)}
        title="Enviar cobrança via E-mail"
        subtitle={emailCobrancaModal && (
          <>
            <p className="font-semibold text-[#1D2939]">{emailCobrancaModal.cr.pagador_nome}</p>
            <p className="text-[#667085] mt-0.5">{formatBRL(emailCobrancaModal.cr.valor)} — Venc: {formatData(emailCobrancaModal.cr.data_vencimento)}</p>
          </>
        )}
        defaultTo={emailCobrancaModal?.email || ''}
        defaultSubject={emailCobrancaModal?.assunto || ''}
        defaultBody={emailCobrancaModal?.corpo || ''}
      />
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
        <div className="px-6 py-4 bg-[#ECFDF4] border-b border-[#c3e6d1]">
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
                className={`flex-1 px-3 py-2 text-[12px] font-semibold rounded-md border transition-colors ${!usarDataVencimento ? 'bg-[#039855] text-white border-[#039855]' : 'bg-white text-[#555] border-[#ccc] hover:bg-[#F6F2EB]'}`}
              >
                Data fixa
              </button>
              <button
                type="button"
                onClick={() => setUsarDataVencimento(true)}
                disabled={submitting}
                className={`flex-1 px-3 py-2 text-[12px] font-semibold rounded-md border transition-colors ${usarDataVencimento ? 'bg-[#039855] text-white border-[#039855]' : 'bg-white text-[#555] border-[#ccc] hover:bg-[#F6F2EB]'}`}
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
        <div className="border-t border-[#eee] px-6 py-4 flex justify-end gap-3 bg-[#F6F2EB]">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-[#555] border border-[#ccc] rounded-md hover:bg-[#F6F2EB] transition-colors disabled:opacity-50"
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
    <div className="bg-[#071D41] px-5 py-3 flex items-center justify-between rounded-t-xl">
      <h3 className="text-[12px] font-bold text-white uppercase tracking-widest">{title}</h3>
      <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
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
  'w-full px-3 py-2 border border-[#ccc] rounded-md text-[13px] text-[#1D2939] bg-white focus:outline-none focus:border-[#059669] focus:ring-1 focus:ring-[#059669] disabled:bg-[#F6F2EB] disabled:text-[#999]'

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
            <span className="text-[11px] font-bold text-[#059669] uppercase tracking-widest">Saldo devedor</span>
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
            className="px-4 py-2 text-[13px] font-semibold text-[#555] border border-[#ccc] rounded-lg hover:bg-[#F6F2EB] transition-colors"
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
  editing,
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
  editing?: CR | null
  onClose: () => void
  onConfirm: () => void
  onClienteAdded: (c: Cliente) => void
}) {
  const isEditing = !!editing
  const isPaid = editing?.status === 'pago' || editing?.status === 'conciliado'
  const lockFinancial = isEditing && isPaid
  const confirm = useConfirm()

  const [tipo, setTipo] = useState('unica')
  const [pagadorNome, setPagadorNome] = useState(editing?.pagador_nome || '')
  const [pagadorCpfCnpj, setPagadorCpfCnpj] = useState(editing?.pagador_cpf_cnpj || '')
  const [pagadorEmail, setPagadorEmail] = useState(editing?.pagador_email || '')
  const [valor, setValor] = useState(editing ? String(editing.valor) : '')
  const [vencimento, setVencimento] = useState(editing?.data_vencimento || '')
  const [numParcelas, setNumParcelas] = useState('2')
  const [contaContabilId, setContaContabilId] = useState(editing?.conta_contabil_id || '')
  const [centroCustoId, setCentroCustoId] = useState(editing?.centro_custo_id || '')

  // Combobox: conta contabil
  const initialContaLabel = (() => {
    const id = editing?.conta_contabil_id
    if (!id) return ''
    const c = chartAccounts.find(x => x.id === id)
    return c ? `${c.code} - ${c.name}` : ''
  })()
  const [contaContabilSearch, setContaContabilSearch] = useState(initialContaLabel)
  const [contaContabilOpen, setContaContabilOpen] = useState(false)
  const contaContabilRef = useRef<HTMLDivElement>(null)

  // Combobox: centro de custo
  const initialCentroLabel = (() => {
    const id = editing?.centro_custo_id
    if (!id) return ''
    const c = centrosCusto.find(x => x.id === id)
    return c ? `${c.codigo} - ${c.descricao}` : ''
  })()
  const [centroCustoSearch, setCentroCustoSearch] = useState(initialCentroLabel)
  const [centroCustoOpen, setCentroCustoOpen] = useState(false)
  const centroCustoRef = useRef<HTMLDivElement>(null)
  const [descricao, setDescricao] = useState(editing?.observacoes || '')
  const [produtoId, setProdutoId] = useState<string | null>((editing as any)?.produto_id || null)
  const [saving, setSaving] = useState(false)

  // Client search
  const [clienteSearch, setClienteSearch] = useState(editing?.pagador_nome || '')
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
      if (contaContabilRef.current && !contaContabilRef.current.contains(e.target as Node)) setContaContabilOpen(false)
      if (centroCustoRef.current && !centroCustoRef.current.contains(e.target as Node)) setCentroCustoOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Sync labels quando os lookups carregarem (chartAccounts/centrosCusto chegam async)
  useEffect(() => {
    if (!contaContabilId) return
    const c = chartAccounts.find(x => x.id === contaContabilId)
    if (c) setContaContabilSearch(`${c.code} - ${c.name}`)
  }, [chartAccounts, contaContabilId])

  useEffect(() => {
    if (!centroCustoId) return
    const c = centrosCusto.find(x => x.id === centroCustoId)
    if (c) setCentroCustoSearch(`${c.codigo} - ${c.descricao}`)
  }, [centrosCusto, centroCustoId])

  const chartAccountsFiltrados = useMemo(() => {
    const t = contaContabilSearch.trim().toLowerCase()
    if (!t) return chartAccounts.slice(0, 50)
    return chartAccounts.filter(c =>
      c.code.toLowerCase().includes(t) || c.name.toLowerCase().includes(t)
    ).slice(0, 50)
  }, [chartAccounts, contaContabilSearch])

  const centrosCustoFiltrados = useMemo(() => {
    const t = centroCustoSearch.trim().toLowerCase()
    if (!t) return centrosCusto.slice(0, 50)
    return centrosCusto.filter(c =>
      c.codigo.toLowerCase().includes(t) || c.descricao.toLowerCase().includes(t)
    ).slice(0, 50)
  }, [centrosCusto, centroCustoSearch])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const v = parseFloat(valor)
    if (!v || v <= 0) return alert('Informe o valor.')
    if (!vencimento) return alert('Informe o vencimento.')
    if (!pagadorNome.trim()) return alert('Informe o nome do pagador.')

    setSaving(true)

    try {
      if (isEditing && editing) {
        // Edicao: UPDATE em registro existente
        const novoContaContabilId = contaContabilId || null
        const novoCentroCustoId = centroCustoId || null
        const categoriaMudou = novoContaContabilId !== (editing.conta_contabil_id || null)
        const centroMudou = novoCentroCustoId !== (editing.centro_custo_id || null)

        const payload: Record<string, any> = {
          conta_contabil_id: novoContaContabilId,
          centro_custo_id: novoCentroCustoId,
          produto_id: produtoId,
        }
        if (!lockFinancial) {
          payload.pagador_nome = pagadorNome.trim()
          payload.pagador_cpf_cnpj = pagadorCpfCnpj.trim() || null
          payload.pagador_email = pagadorEmail.trim() || null
          payload.valor = v
          payload.data_vencimento = vencimento
          payload.observacoes = descricao || null
        }
        const { error } = await db.from('contas_receber').update(payload).eq('id', editing.id)
        if (error) throw error

        // Propagar para movimentacoes vinculadas (Fluxo de Caixa / fn_relatorio_fluxo)
        if (categoriaMudou || centroMudou) {
          const movPayload: Record<string, any> = {}
          if (categoriaMudou) movPayload.conta_contabil_id = novoContaContabilId
          if (centroMudou) movPayload.centro_custo_id = novoCentroCustoId
          const { error: movErr } = await db
            .from('movimentacoes')
            .update(movPayload)
            .eq('conta_receber_id', editing.id)
          if (movErr) {
            console.error('[editarCR] erro propagando para movimentacoes:', movErr)
            alert('Titulo atualizado, mas houve erro propagando categoria para movimentacoes: ' + movErr.message)
          }
        }

        onConfirm()
        return
      }

      if (tipo === 'parcelado') {
        const n = parseInt(numParcelas) || 2
        const valorParcela = Math.round((v / n) * 100) / 100
        const records = []
        for (let i = 0; i < n; i++) {
          const dataVenc = format(addDays(parseISO(vencimento), i * 30), 'yyyy-MM-dd')
          records.push({
            company_id: companyId,
            pagador_nome: toTitleCase(pagadorNome.trim()),
            pagador_cpf_cnpj: pagadorCpfCnpj.trim() || null,
            pagador_email: pagadorEmail.trim() || null,
            valor: i === n - 1 ? Math.round((v - valorParcela * (n - 1)) * 100) / 100 : valorParcela,
            valor_pago: 0,
            data_vencimento: dataVenc,
            status: 'aberto',
            conta_contabil_id: contaContabilId || null,
            centro_custo_id: centroCustoId || null,
            produto_id: produtoId,
            observacoes: descricao ? `${descricao} (${i + 1}/${n})` : `Parcela ${i + 1}/${n}`,
          })
        }
        const { error } = await db.from('contas_receber').insert(records)
        if (error) throw error
      } else {
        const pagadorTrim = toTitleCase(pagadorNome.trim())
        // ─── Anti-duplicata (heuristica): mesmo pagador + valor + vencimento ───
        const dup = await db
          .from('contas_receber')
          .select('id, status')
          .eq('company_id', companyId)
          .eq('pagador_nome', pagadorTrim)
          .eq('valor', v)
          .eq('data_vencimento', vencimento)
          .is('deleted_at', null)
          .neq('status', 'cancelado')
          .limit(1)
        if (dup.data && dup.data.length > 0) {
          setSaving(false)
          const ok = await confirm({
            title: 'Lancamento parecido encontrado',
            description: `Ja existe um titulo de "${pagadorTrim}" no valor de R$ ${v.toFixed(2).replace('.', ',')} vencendo em ${format(parseISO(vencimento), 'dd/MM/yyyy')}. Deseja criar mesmo assim?`,
            confirmLabel: 'Criar mesmo assim',
            variant: 'destructive',
          })
          if (!ok) return
          setSaving(true)
        }

        const { error } = await db.from('contas_receber').insert({
          company_id: companyId,
          pagador_nome: pagadorTrim,
          pagador_cpf_cnpj: pagadorCpfCnpj.trim() || null,
          pagador_email: pagadorEmail.trim() || null,
          valor: v,
          valor_pago: 0,
          data_vencimento: vencimento,
          status: 'aberto',
          conta_contabil_id: contaContabilId || null,
          centro_custo_id: centroCustoId || null,
          produto_id: produtoId,
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
      <ModalHeader title={isEditing ? 'Editar titulo a receber' : 'Novo titulo a receber'} onClose={onClose} />
      <form onSubmit={handleSubmit} className="p-5 space-y-4">

        {lockFinancial && (
          <div className="rounded-lg border border-[#FCD34D] bg-[#FFF0EB] px-3 py-2 text-[12px] text-[#92400E] flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold">Titulo ja {editing?.status === 'conciliado' ? 'conciliado' : 'pago'}</div>
              <div>Apenas o plano de contas e o centro de custo podem ser alterados. A nova categoria sera propagada para o Fluxo de Caixa. Para mudar valores, use estorno.</div>
            </div>
          </div>
        )}

        {/* Tipo - cards (apenas em criacao) */}
        {!isEditing && (
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
                      : 'border-[#ccc] bg-white text-[#555] hover:bg-[#F6F2EB]'
                  }`}
                >
                  <span className="block text-[16px] mb-0.5">{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Pagador — searchable client dropdown */}
        <div className="space-y-3">
          <div ref={clienteRef} className="relative">
            <FieldLabel>Pagador *</FieldLabel>
            <input
              type="text"
              value={clienteSearch}
              onChange={e => { setClienteSearch(e.target.value); setClienteDropdownOpen(true) }}
              onFocus={() => { if (!lockFinancial) setClienteDropdownOpen(true) }}
              className={inputCls}
              placeholder="Buscar cliente por nome ou CPF/CNPJ..."
              autoComplete="off"
              disabled={lockFinancial}
            />
            {/* Hidden required field to enforce selection */}
            <input type="hidden" value={pagadorNome} required />

            {clienteDropdownOpen && !lockFinancial && (
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
                  disabled={lockFinancial}
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
                  disabled={lockFinancial}
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
              disabled={lockFinancial}
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
              disabled={lockFinancial}
            />
          </div>
        </div>

        {/* Parcelas (only for parcelado, e nao em edicao) */}
        {tipo === 'parcelado' && !isEditing && (
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
          <div ref={contaContabilRef} className="relative">
            <FieldLabel>Conta contabil (receita)</FieldLabel>
            <input
              type="text"
              value={contaContabilSearch}
              onChange={e => {
                setContaContabilSearch(e.target.value)
                setContaContabilOpen(true)
                if (!e.target.value.trim()) setContaContabilId('')
              }}
              onFocus={() => setContaContabilOpen(true)}
              className={inputCls}
              placeholder="Buscar por codigo ou nome..."
              autoComplete="off"
            />
            {contaContabilOpen && (
              <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-[#ccc] rounded-lg shadow-lg max-h-60 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => {
                    setContaContabilId('')
                    setContaContabilSearch('')
                    setContaContabilOpen(false)
                  }}
                  className="w-full text-left px-3 py-2 text-[13px] text-[#999] hover:bg-[#F6F2EB] border-b border-[#eee]"
                >
                  Nenhuma
                </button>
                {chartAccountsFiltrados.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setContaContabilId(c.id)
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
                  <div className="px-3 py-2 text-[12px] text-[#999]">Nenhuma conta de receita encontrada</div>
                )}
              </div>
            )}
          </div>
          <div ref={centroCustoRef} className="relative">
            <FieldLabel>Centro de custo</FieldLabel>
            <input
              type="text"
              value={centroCustoSearch}
              onChange={e => {
                setCentroCustoSearch(e.target.value)
                setCentroCustoOpen(true)
                if (!e.target.value.trim()) setCentroCustoId('')
              }}
              onFocus={() => setCentroCustoOpen(true)}
              className={inputCls}
              placeholder="Buscar por codigo ou nome..."
              autoComplete="off"
            />
            {centroCustoOpen && (
              <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-[#ccc] rounded-lg shadow-lg max-h-60 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => {
                    setCentroCustoId('')
                    setCentroCustoSearch('')
                    setCentroCustoOpen(false)
                  }}
                  className="w-full text-left px-3 py-2 text-[13px] text-[#999] hover:bg-[#F6F2EB] border-b border-[#eee]"
                >
                  Nenhum
                </button>
                {centrosCustoFiltrados.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setCentroCustoId(c.id)
                      setCentroCustoSearch(`${c.codigo} - ${c.descricao}`)
                      setCentroCustoOpen(false)
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-[#ECFDF4] border-b border-[#eee] last:border-0"
                  >
                    <div className="text-[13px] text-[#1D2939]">
                      <span className="font-semibold">{c.codigo}</span> - {c.descricao}
                    </div>
                  </button>
                ))}
                {centrosCustoFiltrados.length === 0 && (
                  <div className="px-3 py-2 text-[12px] text-[#999]">Nenhum centro encontrado</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Descricao */}
        <div>
          <FieldLabel>{isEditing ? 'Descricao / Observacoes' : 'Descricao (Produto/Servico)'}</FieldLabel>
          {isEditing ? (
            <input
              type="text"
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              className={inputCls}
              placeholder="Descricao do titulo"
              disabled={lockFinancial}
            />
          ) : (
            <select
              value={produtoId || ''}
              onChange={e => {
                const id = e.target.value || null
                setProdutoId(id)
                const p = products.find(x => x.id === id)
                setDescricao(p ? p.description : '')
              }}
              className={inputCls}
            >
              <option value="">Selecione um produto/servico...</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>
                  {p.code ? `${p.code} - ` : ''}{p.description}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-[13px] font-semibold text-[#555] border border-[#ccc] rounded-lg hover:bg-[#F6F2EB] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 text-[13px] font-semibold text-white bg-[#059669] rounded-lg hover:bg-[#1D2939] transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {isEditing
              ? 'Salvar alteracoes'
              : tipo === 'parcelado'
                ? `Criar ${parseInt(numParcelas) || 2} parcelas`
                : 'Criar titulo'}
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
            className="px-4 py-2 text-[13px] font-semibold text-[#555] border border-[#ccc] rounded-lg hover:bg-[#F6F2EB] transition-colors"
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
