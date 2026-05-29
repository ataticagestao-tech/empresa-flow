import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { format, endOfMonth, parseISO } from 'date-fns'
import {
  FileText, Plus, Search, Loader2, X, Download,
  Mail, MoreHorizontal, Check, Ban, RefreshCw,
  AlertTriangle, Eye, Send, XCircle, DollarSign, Activity,
  ShoppingCart, FileDown, ChevronDown, ArrowDownAZ, ArrowDownZA,
  ArrowDown01, ArrowDown10, Layers, RotateCcw, ChevronLeft,
  ChevronRight as ChevronRightIcon, Filter
} from 'lucide-react'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { formatBRL, formatData, formatDoc, formatFormaPagamento } from '@/lib/format'
import { MonthFilter } from '@/components/ui/month-filter'
import { computeDropdownCoords, dropdownPositionStyle, type DropdownCoords } from '@/lib/dropdownPosition'
import { unmask } from '@/utils/masks'
import { AppLayout } from '@/components/layout/AppLayout'
import { PagePanel } from '@/components/layout/PagePanel'
import { toast } from 'sonner'

// ─── Types ──────────────────────────────────────────────────────────
interface NfseEmissao {
  id: string
  company_id: string
  referencia: string
  numero_nfse: string | null
  codigo_verificacao: string | null
  data_emissao: string
  data_competencia: string | null
  status: string
  tomador_documento: string | null
  tomador_razao_social: string | null
  tomador_email: string | null
  tomador_telefone: string | null
  tomador_endereco_logradouro: string | null
  tomador_endereco_numero: string | null
  tomador_endereco_complemento: string | null
  tomador_endereco_bairro: string | null
  tomador_endereco_cidade: string | null
  tomador_endereco_estado: string | null
  tomador_endereco_cep: string | null
  discriminacao: string | null
  valor_servicos: number
  valor_deducoes: number
  valor_iss: number
  aliquota_iss: number
  iss_retido: boolean
  valor_liquido: number
  item_lista_servico: string | null
  codigo_cnae: string | null
  natureza_operacao: number | null
  pdf_url: string | null
  xml_url: string | null
  protocolo: string | null
  mensagem_retorno: string | null
  client_id: string | null
}

interface NfseEvento {
  id: string
  emissao_id: string
  tipo: string
  descricao: string | null
  payload: any
  created_at: string
}

interface Client {
  id: string
  razao_social: string | null
  cpf_cnpj: string | null
  email: string | null
  telefone: string | null
  endereco_logradouro: string | null
  endereco_numero: string | null
  endereco_complemento: string | null
  endereco_bairro: string | null
  endereco_cidade: string | null
  endereco_estado: string | null
  endereco_cep: string | null
}

interface NfseConfig {
  aliquota_padrao: number
  item_lista_servico_padrao: string
  codigo_cnae_padrao: string
  discriminacao_padrao: string
  natureza_operacao: number
}

interface VendaItem {
  id: string
  venda_id: string
  descricao: string | null
  quantidade: number
  valor_total: number
}

interface VendaRow {
  id: string
  data_venda: string
  cliente_nome: string | null
  cliente_cpf_cnpj: string | null
  valor_total: number
  forma_pagamento: string | null
  nf_emitida: boolean
  itens: VendaItem[]
}

// ─── Status config ──────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon?: 'check' | 'spin' | 'ban' | 'alert' }> = {
  rascunho:          { label: 'Rascunho',        color: '#667085', bg: '#F3F4F6' },
  enviando:          { label: 'Enviando',         color: '#EA580C', bg: '#FFF0EB', icon: 'spin' },
  processando:       { label: 'Processando',      color: '#EA580C', bg: '#FFF0EB', icon: 'spin' },
  autorizada:        { label: 'Autorizada',       color: '#039855', bg: '#ECFDF3', icon: 'check' },
  erro_autorizacao:  { label: 'Erro',             color: '#E53E3E', bg: '#FEE2E2', icon: 'alert' },
  cancelada:         { label: 'Cancelada',        color: '#4B5563', bg: '#EAECF0', icon: 'ban' },
}

// ─── Empty form ─────────────────────────────────────────────────────
const emptyForm = {
  client_id: '',
  tomador_documento: '',
  tomador_razao_social: '',
  tomador_email: '',
  tomador_telefone: '',
  tomador_endereco_logradouro: '',
  tomador_endereco_numero: '',
  tomador_endereco_complemento: '',
  tomador_endereco_bairro: '',
  tomador_endereco_cidade: '',
  tomador_endereco_estado: '',
  tomador_endereco_cep: '',
  discriminacao: '',
  valor_servicos: 0,
  aliquota_iss: 3,
  iss_retido: false,
  item_lista_servico: '',
  codigo_cnae: '',
}

// ─── Column header with sort/group menu ────────────────────────────
type SortKey = 'data' | 'item' | 'nome' | 'doc' | 'valor' | 'forma' | 'nf'
type ColType = 'text' | 'num' | 'date' | 'bool'

interface ColHeaderProps {
  col: SortKey
  label: string
  type: ColType
  align: 'left' | 'right' | 'center'
  menuCol: SortKey | null
  setMenuCol: (v: SortKey | null) => void
  sort: { key: SortKey; dir: 'asc' | 'desc' } | null
  groupBy: SortKey | null
  onSort: (key: SortKey, dir: 'asc' | 'desc') => void
  onGroup: (key: SortKey) => void
  onResizeStart?: (e: React.MouseEvent) => void
}

function ColHeader({ col, label, type, align, menuCol, setMenuCol, sort, groupBy, onSort, onGroup, onResizeStart }: ColHeaderProps) {
  const isOpen = menuCol === col
  const isActiveSort = sort?.key === col
  const isActiveGroup = groupBy === col
  const alignClass = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'

  const ascLabel = type === 'num' ? 'Menor → Maior' : type === 'date' ? 'Mais antiga primeiro' : type === 'bool' ? 'Pendentes primeiro' : 'A → Z'
  const descLabel = type === 'num' ? 'Maior → Menor' : type === 'date' ? 'Mais recente primeiro' : type === 'bool' ? 'Emitidas primeiro' : 'Z → A'

  return (
    <th className={`px-4 py-3 font-semibold whitespace-nowrap relative border-r border-white/10 ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}`}>
      <button
        onClick={e => { e.stopPropagation(); setMenuCol(isOpen ? null : col) }}
        className={`inline-flex items-center gap-1.5 ${alignClass} w-full hover:text-gray-200 transition-colors ${(isActiveSort || isActiveGroup) ? 'text-emerald-300' : ''}`}
      >
        <span>{label}</span>
        {isActiveSort && (sort!.dir === 'asc' ? <ArrowDownAZ size={12} /> : <ArrowDownZA size={12} />)}
        {isActiveGroup && <Layers size={12} />}
        <ChevronDown size={12} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div
          onClick={e => e.stopPropagation()}
          className="absolute z-30 mt-1 left-2 bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-[200px] text-gray-700 normal-case tracking-normal font-normal"
        >
          <button
            onClick={() => onSort(col, 'desc')}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50 text-left"
          >
            {type === 'num' || type === 'date' ? <ArrowDown10 size={14} /> : <ArrowDownZA size={14} />}
            {descLabel}
          </button>
          <button
            onClick={() => onSort(col, 'asc')}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50 text-left"
          >
            {type === 'num' || type === 'date' ? <ArrowDown01 size={14} /> : <ArrowDownAZ size={14} />}
            {ascLabel}
          </button>
          <div className="border-t border-gray-100 my-1" />
          <button
            onClick={() => onGroup(col)}
            className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50 text-left ${isActiveGroup ? 'text-emerald-700 font-medium' : ''}`}
          >
            <Layers size={14} />
            {isActiveGroup ? 'Desagrupar' : 'Agrupar por esta coluna'}
          </button>
        </div>
      )}
      {onResizeStart && (
        <span
          onMouseDown={onResizeStart}
          onClick={e => e.stopPropagation()}
          className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-white/30 active:bg-white/50"
          title="Arraste para ajustar a largura"
        />
      )}
    </th>
  )
}

// ─── Component ──────────────────────────────────────────────────────
export default function NfseEmissao() {
  const { selectedCompany } = useCompany()
  const { activeClient } = useAuth()

  // Data
  const [emissoes, setEmissoes] = useState<NfseEmissao[]>([])
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState<NfseConfig | null>(null)
  const [clients, setClients] = useState<Client[]>([])

  // Tabs
  const [activeTab, setActiveTab] = useState<'vendas' | 'emissoes'>('vendas')

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [mesAno, setMesAno] = useState(() => format(new Date(), 'yyyy-MM'))

  // Vendas (relação a faturar)
  const [vendas, setVendas] = useState<VendaRow[]>([])
  const [loadingVendas, setLoadingVendas] = useState(true)
  const [vendasFiltro, setVendasFiltro] = useState<'todas' | 'pendentes' | 'emitidas'>('pendentes')
  const [vendasSearch, setVendasSearch] = useState('')
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Sort + Agrupar por coluna (default: data desc)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' } | null>({ key: 'data', dir: 'desc' })
  const [groupBy, setGroupBy] = useState<SortKey | null>(null)
  const [menuCol, setMenuCol] = useState<SortKey | null>(null)

  // Selecao de vendas para emissao (calculo de imposto em tempo real)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Larguras de coluna ajustáveis (planilha "Vendas a faturar"), persistidas no navegador
  const COL_WIDTHS_DEFAULT: Record<string, number> = {
    sel: 44, data: 110, item: 280, nome: 200, doc: 150, valor: 120, forma: 180, nf: 110, acoes: 130,
  }
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('nfse_vendas_col_widths')
      if (saved) return { ...COL_WIDTHS_DEFAULT, ...JSON.parse(saved) }
    } catch { /* ignore */ }
    return COL_WIDTHS_DEFAULT
  })
  useEffect(() => {
    localStorage.setItem('nfse_vendas_col_widths', JSON.stringify(colWidths))
  }, [colWidths])

  const resizingRef = useRef<{ key: string; startX: number; startW: number } | null>(null)
  const startResize = (key: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    resizingRef.current = { key, startX: e.clientX, startW: colWidths[key] ?? COL_WIDTHS_DEFAULT[key] }
    const onMove = (ev: MouseEvent) => {
      const r = resizingRef.current
      if (!r) return
      const min = r.key === 'sel' ? 36 : 60
      const newW = Math.max(min, r.startW + (ev.clientX - r.startX))
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
  const VENDAS_COL_ORDER = ['sel', 'data', 'item', 'nome', 'doc', 'valor', 'forma', 'nf', 'acoes']

  // Colunas ocultáveis (sel sempre visível), persistidas no navegador
  const COL_LABELS: Record<string, string> = {
    data: 'Data', item: 'Item/s', nome: 'Nome', doc: 'CPF/CNPJ',
    valor: 'Valor', forma: 'Forma de pagamento', nf: 'NF emitida', acoes: 'Ações',
  }
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => {
    try {
      const s = localStorage.getItem('nfse_vendas_hidden_cols')
      if (s) return new Set(JSON.parse(s) as string[])
    } catch { /* ignore */ }
    return new Set()
  })
  useEffect(() => {
    localStorage.setItem('nfse_vendas_hidden_cols', JSON.stringify([...hiddenCols]))
  }, [hiddenCols])
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const isColVisible = (k: string) => !hiddenCols.has(k)
  const toggleColVisible = (k: string) => setHiddenCols(prev => {
    const n = new Set(prev)
    if (n.has(k)) n.delete(k); else n.add(k)
    return n
  })
  const visibleVendasCols = VENDAS_COL_ORDER.filter(isColVisible)

  // ─── Tabela "NFSe emitidas" (estado independente) ──────────────────
  const EMITIDAS_COL_WIDTHS_DEFAULT: Record<string, number> = {
    numero: 140, data: 110, tomador: 240, servico: 280, valor: 130, status: 140, acoes: 130,
  }
  const EMITIDAS_COL_ORDER = ['numero', 'data', 'tomador', 'servico', 'valor', 'status', 'acoes']
  const EMITIDAS_COL_LABELS: Record<string, string> = {
    numero: 'Numero', data: 'Data', tomador: 'Tomador', servico: 'Servico',
    valor: 'Valor', status: 'Status', acoes: 'Ações',
  }
  const [emitidasColWidths, setEmitidasColWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('nfse_emitidas_col_widths')
      if (saved) return { ...EMITIDAS_COL_WIDTHS_DEFAULT, ...JSON.parse(saved) }
    } catch { /* ignore */ }
    return EMITIDAS_COL_WIDTHS_DEFAULT
  })
  useEffect(() => {
    localStorage.setItem('nfse_emitidas_col_widths', JSON.stringify(emitidasColWidths))
  }, [emitidasColWidths])

  const emitidasResizingRef = useRef<{ key: string; startX: number; startW: number } | null>(null)
  const startResizeEmitidas = (key: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    emitidasResizingRef.current = { key, startX: e.clientX, startW: emitidasColWidths[key] ?? EMITIDAS_COL_WIDTHS_DEFAULT[key] }
    const onMove = (ev: MouseEvent) => {
      const r = emitidasResizingRef.current
      if (!r) return
      const newW = Math.max(60, r.startW + (ev.clientX - r.startX))
      setEmitidasColWidths(prev => ({ ...prev, [r.key]: newW }))
    }
    const onUp = () => {
      emitidasResizingRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const [emitidasHiddenCols, setEmitidasHiddenCols] = useState<Set<string>>(() => {
    try {
      const s = localStorage.getItem('nfse_emitidas_hidden_cols')
      if (s) return new Set(JSON.parse(s) as string[])
    } catch { /* ignore */ }
    return new Set()
  })
  useEffect(() => {
    localStorage.setItem('nfse_emitidas_hidden_cols', JSON.stringify([...emitidasHiddenCols]))
  }, [emitidasHiddenCols])
  const [emitidasColMenuOpen, setEmitidasColMenuOpen] = useState(false)
  const isEmitidasColVisible = (k: string) => !emitidasHiddenCols.has(k)
  const toggleEmitidasColVisible = (k: string) => setEmitidasHiddenCols(prev => {
    const n = new Set(prev)
    if (n.has(k)) n.delete(k); else n.add(k)
    return n
  })
  const visibleEmitidasCols = EMITIDAS_COL_ORDER.filter(isEmitidasColVisible)

  // Paginacao
  const PAGE_SIZE = 10
  const [page, setPage] = useState(1)
  useEffect(() => {
    if (!menuCol) return
    const handler = () => setMenuCol(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [menuCol])

  // Modals
  const [showNovaModal, setShowNovaModal] = useState(false)
  const [showCancelarModal, setShowCancelarModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedEmissao, setSelectedEmissao] = useState<NfseEmissao | null>(null)
  const [eventos, setEventos] = useState<NfseEvento[]>([])
  const [loadingEventos, setLoadingEventos] = useState(false)

  // Form
  const [form, setForm] = useState({ ...emptyForm })
  const [submitting, setSubmitting] = useState(false)

  // Cliente typeahead (busca com autocomplete)
  const [clientSearch, setClientSearch] = useState('')
  const [showClientDropdown, setShowClientDropdown] = useState(false)
  useEffect(() => {
    if (!showClientDropdown) return
    const handler = () => setShowClientDropdown(false)
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [showClientDropdown])
  const [polling, setPolling] = useState(false)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollingCountRef = useRef(0)

  // Cancel
  const [justificativa, setJustificativa] = useState('')
  const [cancelling, setCancelling] = useState(false)

  // Dropdown
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null)
  const [dropdownCoords, setDropdownCoords] = useState<DropdownCoords | null>(null)

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

  // ─── Data Loading ─────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!selectedCompany) return
    setLoading(true)
    const db = activeClient as any

    const inicioMes = `${mesAno}-01`
    const fimMes = format(endOfMonth(parseISO(inicioMes)), 'yyyy-MM-dd')

    const [emRes, cfgRes] = await Promise.all([
      db.from('nfse_emissoes')
        .select('*')
        .eq('company_id', selectedCompany.id)
        .gte('data_emissao', inicioMes)
        .lte('data_emissao', fimMes)
        .order('data_emissao', { ascending: false }),
      db.from('nfse_configuracoes')
        .select('aliquota_padrao, item_lista_servico_padrao, codigo_cnae_padrao, discriminacao_padrao, natureza_operacao')
        .eq('company_id', selectedCompany.id)
        .maybeSingle(),
    ])

    setEmissoes(emRes.data || [])
    if (cfgRes.data) setConfig(cfgRes.data)
    setLoading(false)
  }, [selectedCompany, activeClient, mesAno])

  const loadVendas = useCallback(async () => {
    if (!selectedCompany) return
    setLoadingVendas(true)
    const db = activeClient as any

    const inicioMes = `${mesAno}-01`
    const fimMes = format(endOfMonth(parseISO(inicioMes)), 'yyyy-MM-dd')

    try {
      const { data: vData } = await db.from('vendas')
        .select('id, data_venda, cliente_nome, cliente_cpf_cnpj, valor_total, forma_pagamento, nf_emitida')
        .eq('company_id', selectedCompany.id)
        .is('deleted_at', null)
        .gte('data_venda', inicioMes)
        .lte('data_venda', fimMes)
        .order('data_venda', { ascending: false })

      const lista = (vData || []) as VendaRow[]
      const ids = lista.map(v => v.id)

      const itensByVenda = new Map<string, VendaItem[]>()
      if (ids.length > 0) {
        const chunkSize = 300
        for (let i = 0; i < ids.length; i += chunkSize) {
          const chunk = ids.slice(i, i + chunkSize)
          const { data: itensData } = await db.from('vendas_itens')
            .select('id, venda_id, descricao, quantidade, valor_total')
            .in('venda_id', chunk)
          for (const it of (itensData || []) as VendaItem[]) {
            const arr = itensByVenda.get(it.venda_id) || []
            arr.push(it)
            itensByVenda.set(it.venda_id, arr)
          }
        }
      }

      setVendas(lista.map(v => ({ ...v, itens: itensByVenda.get(v.id) || [] })))
    } catch (err: any) {
      console.error('Erro ao carregar vendas:', err)
      toast.error(err.message || 'Erro ao carregar vendas')
    } finally {
      setLoadingVendas(false)
    }
  }, [selectedCompany, activeClient, mesAno])

  const loadClients = useCallback(async () => {
    if (!selectedCompany) return
    const db = activeClient as any
    const { data } = await db.from('clients')
      .select('id, razao_social, cpf_cnpj, email, telefone, endereco_logradouro, endereco_numero, endereco_complemento, endereco_bairro, endereco_cidade, endereco_estado, endereco_cep')
      .eq('company_id', selectedCompany.id)
      .order('razao_social')
    setClients(data || [])
  }, [selectedCompany, activeClient])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => { loadVendas() }, [loadVendas])
  useEffect(() => { loadClients() }, [loadClients])

  // ─── KPIs ─────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const autorizadas = emissoes.filter(e => e.status === 'autorizada')
    const processando = emissoes.filter(e => e.status === 'enviando' || e.status === 'processando')
    const totalEmitido = autorizadas.reduce((s, e) => s + (e.valor_servicos || 0), 0)
    return {
      total: emissoes.length,
      autorizadas: autorizadas.length,
      totalEmitido,
      processando: processando.length,
    }
  }, [emissoes])

  // ─── Vendas: KPIs + filtros ────────────────────────────────────────
  const vendasKpis = useMemo(() => {
    const total = vendas.length
    const emitidas = vendas.filter(v => v.nf_emitida).length
    const pendentes = total - emitidas
    const valorPendente = vendas.filter(v => !v.nf_emitida).reduce((s, v) => s + (v.valor_total || 0), 0)
    return { total, emitidas, pendentes, valorPendente }
  }, [vendas])

  const vendaSortValue = useCallback((v: VendaRow, key: SortKey): string | number => {
    switch (key) {
      case 'data':  return v.data_venda || ''
      case 'item':  return v.itens.map(it => it.descricao || '').join(', ').toLowerCase()
      case 'nome':  return (v.cliente_nome || '').toLowerCase()
      case 'doc':   return (v.cliente_cpf_cnpj || '').replace(/\D/g, '')
      case 'valor': return v.valor_total || 0
      case 'forma': return (v.forma_pagamento || '').toLowerCase()
      case 'nf':    return v.nf_emitida ? 1 : 0
    }
  }, [])

  const vendasFiltradas = useMemo(() => {
    let list = vendas
    if (vendasFiltro === 'pendentes') list = list.filter(v => !v.nf_emitida)
    if (vendasFiltro === 'emitidas') list = list.filter(v => v.nf_emitida)
    if (vendasSearch.trim()) {
      const term = vendasSearch.toLowerCase()
      list = list.filter(v =>
        v.cliente_nome?.toLowerCase().includes(term) ||
        v.cliente_cpf_cnpj?.includes(term) ||
        v.itens.some(it => it.descricao?.toLowerCase().includes(term))
      )
    }
    if (sort) {
      const { key, dir } = sort
      list = [...list].sort((a, b) => {
        const va = vendaSortValue(a, key)
        const vb = vendaSortValue(b, key)
        if (va < vb) return dir === 'asc' ? -1 : 1
        if (va > vb) return dir === 'asc' ? 1 : -1
        return 0
      })
    }
    return list
  }, [vendas, vendasFiltro, vendasSearch, sort, vendaSortValue])

  const vendasAgrupadas = useMemo(() => {
    if (!groupBy) return null
    const map = new Map<string, VendaRow[]>()
    for (const v of vendasFiltradas) {
      const raw = vendaSortValue(v, groupBy)
      const key = groupBy === 'nf'
        ? (v.nf_emitida ? 'NF emitida' : 'NF pendente')
        : groupBy === 'data'
          ? formatData(v.data_venda)
          : groupBy === 'valor'
            ? formatBRL(v.valor_total)
            : String(raw || '—')
      const arr = map.get(key) || []
      arr.push(v)
      map.set(key, arr)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [vendasFiltradas, groupBy, vendaSortValue])

  const aplicarSort = useCallback((key: SortKey, dir: 'asc' | 'desc') => {
    setSort({ key, dir })
    setGroupBy(null)
    setMenuCol(null)
  }, [])

  const aplicarGroup = useCallback((key: SortKey) => {
    setGroupBy(prev => prev === key ? null : key)
    setMenuCol(null)
  }, [])

  const limparOrdenacao = useCallback(() => {
    setSort({ key: 'data', dir: 'desc' })
    setGroupBy(null)
    setMenuCol(null)
  }, [])

  // Paginacao: total de paginas + lista da pagina atual
  const totalPaginas = Math.max(1, Math.ceil(vendasFiltradas.length / PAGE_SIZE))
  const vendasPaginadas = useMemo(() => {
    if (groupBy) return vendasFiltradas
    const start = (page - 1) * PAGE_SIZE
    return vendasFiltradas.slice(start, start + PAGE_SIZE)
  }, [vendasFiltradas, page, groupBy])

  useEffect(() => { setPage(1) }, [vendasFiltro, vendasSearch, sort, groupBy, mesAno])
  useEffect(() => {
    if (page > totalPaginas) setPage(totalPaginas)
  }, [page, totalPaginas])

  // Selecao
  const toggleSelecionada = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelecionarTodasDaPagina = useCallback(() => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      const list = groupBy ? vendasFiltradas : vendasPaginadas
      const allSelected = list.every(v => next.has(v.id))
      if (allSelected) {
        list.forEach(v => next.delete(v.id))
      } else {
        list.forEach(v => next.add(v.id))
      }
      return next
    })
  }, [groupBy, vendasFiltradas, vendasPaginadas])

  const totaisSelecao = useMemo(() => {
    let count = 0
    let subtotal = 0
    for (const v of vendas) {
      if (selectedIds.has(v.id)) {
        count++
        subtotal += v.valor_total || 0
      }
    }
    const aliquota = config?.aliquota_padrao ?? 3
    const iss = (subtotal * aliquota) / 100
    return { count, subtotal, iss, aliquota, liquido: subtotal - iss }
  }, [vendas, selectedIds, config])

  const renderVendaRow = (v: VendaRow) => {
    const itensTxt = v.itens.length > 0
      ? v.itens.map(it => `${it.quantidade}x ${it.descricao || 'Item'}`).join(', ')
      : '—'
    const isSelected = selectedIds.has(v.id)
    return (
      <tr key={v.id} className={`border-b border-gray-200 hover:bg-gray-50/60 transition-colors ${isSelected ? 'bg-emerald-50/40' : ''}`}>
        <td className="px-3 py-0.5 text-center border-r border-gray-100">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleSelecionada(v.id)}
            className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-200 cursor-pointer"
          />
        </td>
        {isColVisible('data')  && <td className="px-4 py-0.5 text-gray-600 truncate border-r border-gray-100">{formatData(v.data_venda)}</td>}
        {isColVisible('item')  && <td className="px-4 py-0.5 text-gray-600 border-r border-gray-100">
          <div className="truncate" title={itensTxt}>{itensTxt}</div>
        </td>}
        {isColVisible('nome')  && <td className="px-4 py-0.5 font-medium truncate border-r border-gray-100" title={v.cliente_nome || ''}>{v.cliente_nome || '—'}</td>}
        {isColVisible('doc')   && <td className="px-4 py-0.5 text-gray-500 truncate border-r border-gray-100">{formatDoc(v.cliente_cpf_cnpj) || '—'}</td>}
        {isColVisible('valor') && <td className="px-4 py-0.5 text-right font-medium truncate border-r border-gray-100">{formatBRL(v.valor_total)}</td>}
        {isColVisible('forma') && <td className="px-4 py-0.5 text-gray-600 truncate border-r border-gray-100">{formatFormaPagamento(v.forma_pagamento)}</td>}
        {isColVisible('nf')    && <td className="px-4 py-0.5 text-center border-r border-gray-100">
          <button
            onClick={() => toggleNfEmitida(v)}
            disabled={togglingId === v.id}
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors disabled:opacity-50 ${
              v.nf_emitida
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
            }`}
            title={v.nf_emitida ? 'Clique para desmarcar' : 'Clique para marcar como emitida'}
          >
            {togglingId === v.id ? (
              <Loader2 size={12} className="animate-spin" />
            ) : v.nf_emitida ? (
              <Check size={12} />
            ) : (
              <X size={12} />
            )}
            {v.nf_emitida ? 'Sim' : 'Nao'}
          </button>
        </td>}
        {isColVisible('acoes') && <td className="px-4 py-0.5 text-center">
          <button
            onClick={() => emitirParaVenda(v)}
            className="inline-flex items-center gap-1 px-3 py-0.5 rounded-lg border border-emerald-200 text-xs font-medium text-emerald-700 hover:bg-emerald-50 transition-colors"
            title="Abrir Nova NFSe com dados desta venda"
          >
            <Send size={12} /> Emitir NFSe
          </button>
        </td>}
      </tr>
    )
  }

  const toggleNfEmitida = useCallback(async (venda: VendaRow) => {
    if (togglingId) return
    setTogglingId(venda.id)
    const db = activeClient as any
    const novoStatus = !venda.nf_emitida
    try {
      const { error } = await db.from('vendas')
        .update({
          nf_emitida: novoStatus,
          nf_emitida_em: novoStatus ? new Date().toISOString() : null,
        })
        .eq('id', venda.id)
      if (error) throw error
      setVendas(prev => prev.map(v => v.id === venda.id ? { ...v, nf_emitida: novoStatus } : v))
      toast.success(novoStatus ? 'Marcada como NF emitida' : 'Desmarcada')
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar')
    } finally {
      setTogglingId(null)
    }
  }, [activeClient, togglingId])

  const filteredClients = useMemo(() => {
    const term = clientSearch.toLowerCase().trim()
    const termDigits = clientSearch.replace(/\D/g, '')
    if (!term) return clients.slice(0, 30)
    return clients.filter(c => {
      if (c.razao_social?.toLowerCase().includes(term)) return true
      if (termDigits && (c.cpf_cnpj || '').replace(/\D/g, '').includes(termDigits)) return true
      return false
    }).slice(0, 30)
  }, [clients, clientSearch])

  const emitirParaVenda = useCallback((v: VendaRow) => {
    const discriminacao = v.itens.length > 0
      ? v.itens.map(it => `${it.quantidade}x ${it.descricao || 'Item'} — ${formatBRL(it.valor_total)}`).join('\n')
      : ''
    resetForm()
    setClientSearch('')

    // Tenta achar cliente cadastrado pelo CPF/CNPJ da venda
    const vendaDoc = (v.cliente_cpf_cnpj || '').replace(/\D/g, '')
    const matched = vendaDoc ? clients.find(c => (c.cpf_cnpj || '').replace(/\D/g, '') === vendaDoc) : null

    if (matched) {
      handleClientSelect(matched.id)
      setForm(prev => ({
        ...prev,
        client_id: matched.id,
        tomador_documento: matched.cpf_cnpj || vendaDoc,
        tomador_razao_social: matched.razao_social || v.cliente_nome || '',
        tomador_email: matched.email || '',
        tomador_telefone: matched.telefone || '',
        tomador_endereco_logradouro: matched.endereco_logradouro || '',
        tomador_endereco_numero: matched.endereco_numero || '',
        tomador_endereco_complemento: matched.endereco_complemento || '',
        tomador_endereco_bairro: matched.endereco_bairro || '',
        tomador_endereco_cidade: matched.endereco_cidade || '',
        tomador_endereco_estado: matched.endereco_estado || '',
        tomador_endereco_cep: matched.endereco_cep || '',
        discriminacao: discriminacao || prev.discriminacao,
        valor_servicos: v.valor_total || 0,
      }))
      setClientSearch(matched.razao_social || '')
    } else {
      setForm(prev => ({
        ...prev,
        tomador_documento: v.cliente_cpf_cnpj || '',
        tomador_razao_social: v.cliente_nome || '',
        discriminacao: discriminacao || prev.discriminacao,
        valor_servicos: v.valor_total || 0,
      }))
      setClientSearch(v.cliente_nome || '')
    }

    setShowNovaModal(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients])

  const exportarCSV = useCallback(() => {
    const linhas = [
      ['Data', 'Itens', 'Nome', 'CNPJ/CPF', 'Valor', 'Forma de pagamento', 'NF emitida'],
      ...vendasFiltradas.map(v => [
        formatData(v.data_venda),
        v.itens.map(it => `${it.quantidade}x ${it.descricao || ''}`.trim()).join(' | '),
        v.cliente_nome || '',
        formatDoc(v.cliente_cpf_cnpj) || '',
        (v.valor_total || 0).toFixed(2).replace('.', ','),
        formatFormaPagamento(v.forma_pagamento),
        v.nf_emitida ? 'Sim' : 'Nao',
      ]),
    ]
    const csv = linhas.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `relacao-nf-${mesAno}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }, [vendasFiltradas, mesAno])

  // ─── Filtered ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = emissoes
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      list = list.filter(e =>
        e.tomador_razao_social?.toLowerCase().includes(term) ||
        e.tomador_documento?.includes(term) ||
        e.numero_nfse?.includes(term) ||
        e.referencia?.toLowerCase().includes(term)
      )
    }
    if (statusFilter !== 'todos') {
      list = list.filter(e => e.status === statusFilter)
    }
    return list
  }, [emissoes, searchTerm, statusFilter])

  // ─── Form helpers ─────────────────────────────────────────────────
  const resetForm = () => {
    setForm({
      ...emptyForm,
      aliquota_iss: config?.aliquota_padrao ?? 3,
      item_lista_servico: config?.item_lista_servico_padrao ?? '',
      codigo_cnae: config?.codigo_cnae_padrao ?? '',
      discriminacao: config?.discriminacao_padrao ?? '',
    })
  }

  const openNovaModal = () => {
    resetForm()
    setClientSearch('')
    loadClients()
    setShowNovaModal(true)
  }

  const handleClientSelect = (clientId: string) => {
    const c = clients.find(cl => cl.id === clientId)
    if (!c) return
    setForm(prev => ({
      ...prev,
      client_id: clientId,
      tomador_documento: c.cpf_cnpj || '',
      tomador_razao_social: c.razao_social || '',
      tomador_email: c.email || '',
      tomador_telefone: c.telefone || '',
      tomador_endereco_logradouro: c.endereco_logradouro || '',
      tomador_endereco_numero: c.endereco_numero || '',
      tomador_endereco_complemento: c.endereco_complemento || '',
      tomador_endereco_bairro: c.endereco_bairro || '',
      tomador_endereco_cidade: c.endereco_cidade || '',
      tomador_endereco_estado: c.endereco_estado || '',
      tomador_endereco_cep: c.endereco_cep || '',
    }))
  }

  // ─── Calculated values ────────────────────────────────────────────
  const issCalculado = useMemo(() => {
    return (form.valor_servicos * form.aliquota_iss) / 100
  }, [form.valor_servicos, form.aliquota_iss])

  const valorLiquido = useMemo(() => {
    return form.iss_retido
      ? form.valor_servicos - issCalculado
      : form.valor_servicos
  }, [form.valor_servicos, form.iss_retido, issCalculado])

  // ─── Polling logic ────────────────────────────────────────────────
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
    pollingCountRef.current = 0
    setPolling(false)
  }, [])

  const startPolling = useCallback((emissaoId: string) => {
    setPolling(true)
    pollingCountRef.current = 0
    const db = activeClient as any

    pollingRef.current = setInterval(async () => {
      pollingCountRef.current += 1

      try {
        const { data, error } = await db.functions.invoke('consultar-nfse', {
          body: { emissao_id: emissaoId },
        })

        if (error) {
          console.error('Polling error:', error)
        }

        if (data?.status === 'autorizada') {
          stopPolling()
          toast.success(`NFSe autorizada! Numero: ${data.numero || emissaoId}`)
          loadData()
          setShowNovaModal(false)
          return
        }

        if (data?.status === 'erro_autorizacao') {
          stopPolling()
          toast.error(`Erro na emissao: ${data.mensagem || 'Verifique os dados e tente novamente'}`)
          loadData()
          return
        }
      } catch (err) {
        console.error('Polling exception:', err)
      }

      if (pollingCountRef.current >= 12) {
        stopPolling()
        toast.info('Consulta encerrada. A NFSe ainda esta sendo processada. Atualize a pagina para verificar.')
        loadData()
      }
    }, 5000)
  }, [activeClient, stopPolling, loadData])

  useEffect(() => {
    return () => { stopPolling() }
  }, [stopPolling])

  // ─── Salvar Rascunho ──────────────────────────────────────────────
  const handleSalvarRascunho = async (): Promise<string | null> => {
    if (!selectedCompany) return null
    if (!form.tomador_razao_social.trim()) {
      toast.error('Informe a razao social do tomador')
      return null
    }
    if (form.valor_servicos <= 0) {
      toast.error('Informe o valor dos servicos')
      return null
    }
    if (!form.discriminacao.trim()) {
      toast.error('Informe a discriminacao do servico')
      return null
    }

    setSubmitting(true)
    const db = activeClient as any

    try {
      const referencia = `nfse_${crypto.randomUUID().slice(0, 8)}`
      const { data, error } = await db.from('nfse_emissoes').insert({
        company_id: selectedCompany.id,
        referencia,
        data_emissao: format(new Date(), 'yyyy-MM-dd'),
        data_competencia: format(new Date(), 'yyyy-MM-dd'),
        status: 'rascunho',
        client_id: form.client_id || null,
        tomador_documento: unmask(form.tomador_documento) || null,
        tomador_razao_social: form.tomador_razao_social,
        tomador_email: form.tomador_email || null,
        tomador_telefone: form.tomador_telefone || null,
        tomador_endereco_logradouro: form.tomador_endereco_logradouro || null,
        tomador_endereco_numero: form.tomador_endereco_numero || null,
        tomador_endereco_complemento: form.tomador_endereco_complemento || null,
        tomador_endereco_bairro: form.tomador_endereco_bairro || null,
        tomador_endereco_cidade: form.tomador_endereco_cidade || null,
        tomador_endereco_estado: form.tomador_endereco_estado || null,
        tomador_endereco_cep: unmask(form.tomador_endereco_cep) || null,
        discriminacao: form.discriminacao,
        valor_servicos: form.valor_servicos,
        valor_deducoes: 0,
        valor_iss: issCalculado,
        aliquota_iss: form.aliquota_iss,
        iss_retido: form.iss_retido,
        valor_liquido: valorLiquido,
        item_lista_servico: form.item_lista_servico || null,
        codigo_cnae: form.codigo_cnae || null,
        natureza_operacao: config?.natureza_operacao ?? 1,
      }).select('id').single()

      if (error) throw error

      toast.success('Rascunho salvo com sucesso')
      loadData()
      return data?.id || null
    } catch (err: any) {
      console.error('Erro ao salvar rascunho:', err)
      toast.error(err.message || 'Erro ao salvar rascunho')
      return null
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Emitir NFSe ─────────────────────────────────────────────────
  const handleEmitir = async () => {
    setSubmitting(true)
    const db = activeClient as any

    try {
      const emissaoId = await handleSalvarRascunho()
      if (!emissaoId) {
        setSubmitting(false)
        return
      }

      toast.info('Enviando NFSe para processamento...')

      const { error } = await db.functions.invoke('emitir-nfse', {
        body: { emissao_id: emissaoId },
      })

      if (error) {
        toast.error('Erro ao enviar: ' + error.message)
        setSubmitting(false)
        return
      }

      startPolling(emissaoId)
    } catch (err: any) {
      console.error('Erro ao emitir NFSe:', err)
      toast.error(err.message || 'Erro ao emitir NFSe')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Cancelar NFSe ───────────────────────────────────────────────
  const openCancelarModal = (em: NfseEmissao) => {
    setSelectedEmissao(em)
    setJustificativa('')
    setShowCancelarModal(true)
    setDropdownOpen(null)
  }

  const handleCancelar = async () => {
    if (!selectedEmissao) return
    if (justificativa.length < 15) {
      toast.error('Justificativa deve ter pelo menos 15 caracteres')
      return
    }

    setCancelling(true)
    const db = activeClient as any

    try {
      const { error } = await db.functions.invoke('cancelar-nfse', {
        body: { emissao_id: selectedEmissao.id, justificativa },
      })

      if (error) throw error

      toast.success('Solicitacao de cancelamento enviada')
      setShowCancelarModal(false)
      setSelectedEmissao(null)
      loadData()
    } catch (err: any) {
      console.error('Erro ao cancelar:', err)
      toast.error(err.message || 'Erro ao cancelar NFSe')
    } finally {
      setCancelling(false)
    }
  }

  // ─── Detail / Events ─────────────────────────────────────────────
  const openDetail = async (em: NfseEmissao) => {
    setSelectedEmissao(em)
    setShowDetailModal(true)
    setDropdownOpen(null)
    setLoadingEventos(true)

    const db = activeClient as any
    const { data } = await db.from('nfse_eventos')
      .select('*')
      .eq('emissao_id', em.id)
      .order('created_at', { ascending: true })

    setEventos(data || [])
    setLoadingEventos(false)
  }

  // ─── Reenviar email ──────────────────────────────────────────────
  const handleReenviarEmail = async (em: NfseEmissao) => {
    if (!em.tomador_email) {
      toast.error('Tomador sem email cadastrado')
      return
    }
    const db = activeClient as any
    try {
      await db.functions.invoke('reenviar-email-nfse', {
        body: { emissao_id: em.id },
      })
      toast.success('Email reenviado com sucesso')
    } catch {
      toast.error('Erro ao reenviar email')
    }
    setDropdownOpen(null)
  }

  // ─── Status badge renderer ───────────────────────────────────────
  const renderStatusBadge = (status: string) => {
    const st = STATUS_CONFIG[status] || STATUS_CONFIG.rascunho
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
        style={{ color: st.color, backgroundColor: st.bg }}
      >
        {st.icon === 'check' && <Check size={12} />}
        {st.icon === 'spin' && <Loader2 size={12} className="animate-spin" />}
        {st.icon === 'ban' && <Ban size={12} />}
        {st.icon === 'alert' && <AlertTriangle size={12} />}
        {st.label}
      </span>
    )
  }

  // ─── Input class helper ───────────────────────────────────────────
  const inputClass = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100'
  const labelClass = 'block text-xs font-medium text-gray-600 mb-1'

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <AppLayout title="NFSe - Emissao">
      <div className="p-6">
        <PagePanel title="NFSe - Emissão" subtitle="Emita NFS-e a partir das vendas e acompanhe as emissões">

        {/* ── KPIs ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {(activeTab === 'vendas' ? [
            { label: 'Vendas no periodo', value: vendasKpis.total, icon: ShoppingCart, color: '#059669' },
            { label: 'NF pendentes', value: vendasKpis.pendentes, icon: AlertTriangle, color: '#EA580C' },
            { label: 'NF emitidas', value: vendasKpis.emitidas, icon: Check, color: '#059669' },
            { label: 'Valor pendente', value: formatBRL(vendasKpis.valorPendente), icon: DollarSign, color: '#EA580C' },
          ] : [
            { label: 'Total NFSe', value: kpis.total, icon: FileText, color: '#059669' },
            { label: 'Autorizadas', value: kpis.autorizadas, icon: Check, color: '#059669' },
            { label: 'Valor emitido', value: formatBRL(kpis.totalEmitido), icon: DollarSign, color: '#059669' },
            { label: 'Processando', value: kpis.processando, icon: Activity, color: '#EA580C' },
          ]).map((kpi, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: kpi.color + '12' }}>
                <kpi.icon size={20} style={{ color: kpi.color }} />
              </div>
              <div>
                <p className="text-xs text-gray-500">{kpi.label}</p>
                <p className="text-lg font-semibold" style={{ color: kpi.color }}>{kpi.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div className="flex items-center gap-1 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('vendas')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'vendas'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="inline-flex items-center gap-2"><ShoppingCart size={15} /> Vendas a faturar</span>
          </button>
          <button
            onClick={() => setActiveTab('emissoes')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'emissoes'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="inline-flex items-center gap-2"><FileText size={15} /> NFSe emitidas</span>
          </button>
        </div>

        {/* ── Toolbar ── */}
        {activeTab === 'emissoes' ? (
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={openNovaModal}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
              style={{ backgroundColor: '#059669' }}
            >
              <Plus size={16} /> Nova NFSe
            </button>

            <div className="relative flex-1 max-w-xs">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar por tomador, numero..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <MonthFilter value={mesAno} onChange={setMesAno} />

            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="todos">Todos status</option>
              <option value="autorizada">Autorizada</option>
              <option value="rascunho">Rascunho</option>
              <option value="enviando">Enviando</option>
              <option value="processando">Processando</option>
              <option value="erro_autorizacao">Erro</option>
              <option value="cancelada">Cancelada</option>
            </select>

            <button onClick={loadData} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50" title="Atualizar">
              <RefreshCw size={16} className="text-gray-500" />
            </button>

            <div className="relative">
              <button
                onClick={() => setEmitidasColMenuOpen(o => !o)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm hover:bg-gray-50"
                title="Mostrar/ocultar colunas"
              >
                <Eye size={15} className="text-gray-500" /> Colunas
                <ChevronDown size={14} className={`text-gray-400 transition-transform ${emitidasColMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {emitidasColMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setEmitidasColMenuOpen(false)} />
                  <div className="absolute right-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-[200px]">
                    <p className="px-3 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Exibir colunas</p>
                    {Object.entries(EMITIDAS_COL_LABELS).map(([k, label]) => (
                      <label key={k} className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isEmitidasColVisible(k)}
                          onChange={() => toggleEmitidasColVisible(k)}
                          className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-200"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-600 pointer-events-none" />
              <select
                value={vendasFiltro}
                onChange={e => setVendasFiltro(e.target.value as 'todas' | 'pendentes' | 'emitidas')}
                className="pl-9 pr-8 py-2 rounded-lg border-2 border-emerald-200 bg-emerald-50/60 text-sm font-medium text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              >
                <option value="pendentes">Pendentes (NF nao emitida)</option>
                <option value="emitidas">NF ja emitida</option>
                <option value="todas">Todas as vendas</option>
              </select>
            </div>

            <div className="relative flex-1 max-w-xs">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={vendasSearch}
                onChange={e => setVendasSearch(e.target.value)}
                placeholder="Buscar por cliente, CPF/CNPJ, item..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <MonthFilter value={mesAno} onChange={setMesAno} />

            <button onClick={loadVendas} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50" title="Atualizar">
              <RefreshCw size={16} className="text-gray-500" />
            </button>

            <button
              onClick={exportarCSV}
              disabled={vendasFiltradas.length === 0}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm hover:bg-gray-50 disabled:opacity-50"
              title="Exportar CSV"
            >
              <FileDown size={15} className="text-gray-500" /> Exportar CSV
            </button>

            <div className="relative">
              <button
                onClick={() => setColMenuOpen(o => !o)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm hover:bg-gray-50"
                title="Mostrar/ocultar colunas"
              >
                <Eye size={15} className="text-gray-500" /> Colunas
                <ChevronDown size={14} className={`text-gray-400 transition-transform ${colMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {colMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setColMenuOpen(false)} />
                  <div className="absolute right-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-[200px]">
                    <p className="px-3 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Exibir colunas</p>
                    {Object.entries(COL_LABELS).map(([k, label]) => (
                      <label key={k} className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isColVisible(k)}
                          onChange={() => toggleColVisible(k)}
                          className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-200"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Table: Vendas a faturar ── */}
        {activeTab === 'vendas' && (
          <div className="bg-gray-400 rounded-xl p-px">
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {loadingVendas ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="animate-spin text-gray-400" size={24} />
              </div>
            ) : vendasFiltradas.length === 0 ? (
              <div className="text-center py-20 text-gray-400 text-sm">
                Nenhuma venda neste filtro
              </div>
            ) : (
              <>
              {(sort || groupBy) && (
                <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs text-gray-600">
                  {sort && <span>Ordenado por <strong>{sort.key}</strong> ({sort.dir === 'asc' ? 'crescente' : 'decrescente'})</span>}
                  {groupBy && <span>Agrupado por <strong>{groupBy}</strong></span>}
                  <button onClick={limparOrdenacao} className="ml-auto inline-flex items-center gap-1 text-emerald-700 hover:underline">
                    <RotateCcw size={12} /> Limpar
                  </button>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="text-sm" style={{ tableLayout: 'fixed', width: visibleVendasCols.reduce((a, k) => a + (colWidths[k] ?? COL_WIDTHS_DEFAULT[k]), 0), minWidth: '100%' }}>
                  <colgroup>
                    {visibleVendasCols.map(k => (
                      <col key={k} style={{ width: colWidths[k] ?? COL_WIDTHS_DEFAULT[k] }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr style={{ backgroundColor: '#1A2434' }} className="text-left text-sm text-white uppercase tracking-wider">
                      <th className="px-3 py-3 text-center relative border-r border-white/10">
                        <input
                          type="checkbox"
                          checked={(groupBy ? vendasFiltradas : vendasPaginadas).length > 0 && (groupBy ? vendasFiltradas : vendasPaginadas).every(v => selectedIds.has(v.id))}
                          onChange={toggleSelecionarTodasDaPagina}
                          className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-200 cursor-pointer"
                          title="Selecionar todas desta pagina"
                        />
                        <span onMouseDown={startResize('sel')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-white/30 active:bg-white/50" title="Arraste para ajustar a largura" />
                      </th>
                      {isColVisible('data')  && <ColHeader col="data"  label="Data"               type="date" align="left"   menuCol={menuCol} setMenuCol={setMenuCol} sort={sort} groupBy={groupBy} onSort={aplicarSort} onGroup={aplicarGroup} onResizeStart={startResize('data')} />}
                      {isColVisible('item')  && <ColHeader col="item"  label="Item/s"             type="text" align="left"   menuCol={menuCol} setMenuCol={setMenuCol} sort={sort} groupBy={groupBy} onSort={aplicarSort} onGroup={aplicarGroup} onResizeStart={startResize('item')} />}
                      {isColVisible('nome')  && <ColHeader col="nome"  label="Nome"               type="text" align="left"   menuCol={menuCol} setMenuCol={setMenuCol} sort={sort} groupBy={groupBy} onSort={aplicarSort} onGroup={aplicarGroup} onResizeStart={startResize('nome')} />}
                      {isColVisible('doc')   && <ColHeader col="doc"   label="CPF/CNPJ"           type="text" align="left"   menuCol={menuCol} setMenuCol={setMenuCol} sort={sort} groupBy={groupBy} onSort={aplicarSort} onGroup={aplicarGroup} onResizeStart={startResize('doc')} />}
                      {isColVisible('valor') && <ColHeader col="valor" label="Valor"              type="num"  align="right"  menuCol={menuCol} setMenuCol={setMenuCol} sort={sort} groupBy={groupBy} onSort={aplicarSort} onGroup={aplicarGroup} onResizeStart={startResize('valor')} />}
                      {isColVisible('forma') && <ColHeader col="forma" label="Forma de pagamento" type="text" align="left"   menuCol={menuCol} setMenuCol={setMenuCol} sort={sort} groupBy={groupBy} onSort={aplicarSort} onGroup={aplicarGroup} onResizeStart={startResize('forma')} />}
                      {isColVisible('nf')    && <ColHeader col="nf"    label="NF emitida"         type="bool" align="center" menuCol={menuCol} setMenuCol={setMenuCol} sort={sort} groupBy={groupBy} onSort={aplicarSort} onGroup={aplicarGroup} onResizeStart={startResize('nf')} />}
                      {isColVisible('acoes') && <th className="px-4 py-3 font-semibold text-center whitespace-nowrap">Ações</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {groupBy && vendasAgrupadas ? (
                      vendasAgrupadas.flatMap(([groupKey, rows]) => {
                        const total = rows.reduce((s, r) => s + (r.valor_total || 0), 0)
                        return [
                          <tr key={`group-${groupKey}`} className="bg-emerald-50/60 border-y border-emerald-100">
                            <td colSpan={visibleVendasCols.length} className="px-4 py-2 text-xs font-semibold text-emerald-900">
                              {groupKey} <span className="ml-2 font-normal text-emerald-700">· {rows.length} venda(s) · {formatBRL(total)}</span>
                            </td>
                          </tr>,
                          ...rows.map(v => renderVendaRow(v))
                        ]
                      })
                    ) : (
                      vendasPaginadas.map(v => renderVendaRow(v))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Paginacao (oculta quando agrupado) */}
              {!groupBy && vendasFiltradas.length > 0 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50 text-xs text-gray-600">
                  <span>
                    Mostrando {Math.min((page - 1) * PAGE_SIZE + 1, vendasFiltradas.length)}–
                    {Math.min(page * PAGE_SIZE, vendasFiltradas.length)} de {vendasFiltradas.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft size={14} /> Anterior
                    </button>
                    <span className="px-3 py-1.5 font-medium text-gray-700">
                      Página {page} de {totalPaginas}
                    </span>
                    <button
                      onClick={() => setPage(p => Math.min(totalPaginas, p + 1))}
                      disabled={page >= totalPaginas}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Próxima <ChevronRightIcon size={14} />
                    </button>
                  </div>
                </div>
              )}
              </>
            )}
          </div>
          </div>
        )}

        {/* ── Resumo de selecao + calculo de imposto ── */}
        {activeTab === 'vendas' && totaisSelecao.count > 0 && (
          <div className="bg-white rounded-xl border-2 border-emerald-200 p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <Check size={20} className="text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Vendas selecionadas para emissão</p>
                  <p className="text-lg font-semibold text-emerald-700">{totaisSelecao.count} venda(s)</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-6 text-sm">
                <div>
                  <p className="text-xs text-gray-500">Subtotal</p>
                  <p className="font-semibold text-gray-800">{formatBRL(totaisSelecao.subtotal)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">ISS ({totaisSelecao.aliquota}%)</p>
                  <p className="font-semibold text-orange-600">{formatBRL(totaisSelecao.iss)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Valor líquido</p>
                  <p className="font-semibold text-emerald-700">{formatBRL(totaisSelecao.liquido)}</p>
                </div>
              </div>

              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                Limpar seleção
              </button>
            </div>
          </div>
        )}

        {/* ── Table: NFSe emitidas ── */}
        {activeTab === 'emissoes' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="animate-spin text-gray-400" size={24} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-gray-400 text-sm">
              Nenhuma NFSe encontrada neste periodo
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="text-sm" style={{ tableLayout: 'fixed', width: visibleEmitidasCols.reduce((a, k) => a + (emitidasColWidths[k] ?? EMITIDAS_COL_WIDTHS_DEFAULT[k]), 0), minWidth: '100%' }}>
                <colgroup>
                  {visibleEmitidasCols.map(k => (
                    <col key={k} style={{ width: emitidasColWidths[k] ?? EMITIDAS_COL_WIDTHS_DEFAULT[k] }} />
                  ))}
                </colgroup>
                <thead>
                  <tr style={{ backgroundColor: '#000000' }} className="text-left text-xs text-white uppercase tracking-wider">
                    {isEmitidasColVisible('numero')  && <th className="px-4 py-3 font-semibold whitespace-nowrap relative border-r border-white/10">Numero<span onMouseDown={startResizeEmitidas('numero')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-white/30 active:bg-white/50" title="Arraste para ajustar a largura" /></th>}
                    {isEmitidasColVisible('data')    && <th className="px-4 py-3 font-semibold whitespace-nowrap relative border-r border-white/10">Data<span onMouseDown={startResizeEmitidas('data')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-white/30 active:bg-white/50" title="Arraste para ajustar a largura" /></th>}
                    {isEmitidasColVisible('tomador') && <th className="px-4 py-3 font-semibold whitespace-nowrap relative border-r border-white/10">Tomador<span onMouseDown={startResizeEmitidas('tomador')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-white/30 active:bg-white/50" title="Arraste para ajustar a largura" /></th>}
                    {isEmitidasColVisible('servico') && <th className="px-4 py-3 font-semibold whitespace-nowrap relative border-r border-white/10">Servico<span onMouseDown={startResizeEmitidas('servico')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-white/30 active:bg-white/50" title="Arraste para ajustar a largura" /></th>}
                    {isEmitidasColVisible('valor')   && <th className="px-4 py-3 font-semibold text-right whitespace-nowrap relative border-r border-white/10">Valor<span onMouseDown={startResizeEmitidas('valor')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-white/30 active:bg-white/50" title="Arraste para ajustar a largura" /></th>}
                    {isEmitidasColVisible('status')  && <th className="px-4 py-3 font-semibold whitespace-nowrap relative border-r border-white/10">Status<span onMouseDown={startResizeEmitidas('status')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-white/30 active:bg-white/50" title="Arraste para ajustar a largura" /></th>}
                    {isEmitidasColVisible('acoes')   && <th className="px-4 py-3 font-semibold text-center whitespace-nowrap">Acoes</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(em => (
                    <tr key={em.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      {isEmitidasColVisible('numero') && <td className="px-4 py-1 font-medium truncate border-r border-[#F1F3F5]" title={em.numero_nfse || em.referencia}>
                        {em.numero_nfse || <span className="text-gray-400">{em.referencia}</span>}
                      </td>}
                      {isEmitidasColVisible('data') && <td className="px-4 py-1 text-gray-500 truncate border-r border-[#F1F3F5]">{formatData(em.data_emissao)}</td>}
                      {isEmitidasColVisible('tomador') && <td className="px-4 py-1 border-r border-[#F1F3F5]">
                        <div className="font-medium truncate" title={em.tomador_razao_social || ''}>{em.tomador_razao_social || '\u2014'}</div>
                        <div className="text-xs text-gray-400 truncate">{formatDoc(em.tomador_documento)}</div>
                      </td>}
                      {isEmitidasColVisible('servico') && <td className="px-4 py-1 text-gray-500 truncate border-r border-[#F1F3F5]" title={em.discriminacao || ''}>
                        {em.discriminacao || '\u2014'}
                      </td>}
                      {isEmitidasColVisible('valor') && <td className="px-4 py-1 text-right font-medium truncate border-r border-[#F1F3F5]">{formatBRL(em.valor_servicos)}</td>}
                      {isEmitidasColVisible('status') && <td className="px-4 py-1 border-r border-[#F1F3F5]">{renderStatusBadge(em.status)}</td>}
                      {isEmitidasColVisible('acoes') && <td className="px-4 py-1">
                        <div className="flex items-center justify-center gap-1 relative">
                          {em.pdf_url && (
                            <a
                              href={em.pdf_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                              title="Download PDF"
                            >
                              <Download size={14} />
                            </a>
                          )}
                          {em.xml_url && (
                            <a
                              href={em.xml_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                              title="Download XML"
                            >
                              <FileText size={14} />
                            </a>
                          )}
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              if (dropdownOpen === em.id) {
                                setDropdownOpen(null)
                                setDropdownCoords(null)
                              } else {
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                                setDropdownCoords(computeDropdownCoords(rect))
                                setDropdownOpen(em.id)
                              }
                            }}
                            className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                          >
                            <MoreHorizontal size={14} />
                          </button>

                          {dropdownOpen === em.id && dropdownCoords && createPortal(
                            <div className="fixed bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px]" style={{ ...dropdownPositionStyle(dropdownCoords), zIndex: 100 }} onClick={e => e.stopPropagation()}>
                              <button
                                onClick={() => openDetail(em)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-left"
                              >
                                <Eye size={14} /> Ver detalhes
                              </button>
                              {em.status === 'autorizada' && (
                                <>
                                  <button
                                    onClick={() => openCancelarModal(em)}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-left text-red-600"
                                  >
                                    <XCircle size={14} /> Cancelar NFSe
                                  </button>
                                  <button
                                    onClick={() => handleReenviarEmail(em)}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-left"
                                  >
                                    <Mail size={14} /> Reenviar email
                                  </button>
                                </>
                              )}
                              {em.status === 'rascunho' && (
                                <button
                                  onClick={async () => {
                                    setDropdownOpen(null)
                                    const db = activeClient as any
                                    toast.info('Enviando NFSe...')
                                    try {
                                      const { error } = await db.functions.invoke('emitir-nfse', {
                                        body: { emissao_id: em.id },
                                      })
                                      if (error) throw error
                                      startPolling(em.id)
                                    } catch (err: any) {
                                      toast.error(err.message || 'Erro ao emitir')
                                    }
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-left"
                                >
                                  <Send size={14} /> Emitir rascunho
                                </button>
                              )}
                              {em.status === 'erro_autorizacao' && (
                                <button
                                  onClick={async () => {
                                    setDropdownOpen(null)
                                    const db = activeClient as any
                                    toast.info('Reenviando NFSe...')
                                    try {
                                      const { error } = await db.functions.invoke('emitir-nfse', {
                                        body: { emissao_id: em.id },
                                      })
                                      if (error) throw error
                                      startPolling(em.id)
                                    } catch (err: any) {
                                      toast.error(err.message || 'Erro ao reenviar')
                                    }
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-left"
                                >
                                  <RefreshCw size={14} /> Reenviar
                                </button>
                              )}
                            </div>,
                            document.body
                          )}
                        </div>
                      </td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            MODAL: Nova NFSe
        ════════════════════════════════════════════════════════════════ */}
        {showNovaModal && (
          <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 relative">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h2 className="text-lg font-semibold" style={{ color: '#059669' }}>Nova NFSe</h2>
                <button onClick={() => { setShowNovaModal(false); stopPolling() }} className="p-1 rounded hover:bg-gray-100">
                  <X size={20} className="text-gray-400" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-6 max-h-[70vh] overflow-y-auto">

                {/* ── Tomador ── */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <FileText size={16} style={{ color: '#059669' }} /> Tomador do Servico
                  </h3>

                  <div className="space-y-3">
                    <div className="relative" onMouseDown={e => e.stopPropagation()}>
                      <label className={labelClass}>Buscar cliente cadastrado</label>
                      <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        <input
                          type="text"
                          value={clientSearch}
                          onChange={e => { setClientSearch(e.target.value); setShowClientDropdown(true) }}
                          onFocus={() => setShowClientDropdown(true)}
                          placeholder="Digite o nome ou CPF/CNPJ..."
                          className={`${inputClass} pl-9`}
                          autoComplete="off"
                        />
                        {form.client_id && (
                          <button
                            type="button"
                            onClick={() => {
                              setClientSearch('')
                              setForm(prev => ({
                                ...prev,
                                client_id: '',
                                tomador_documento: '',
                                tomador_razao_social: '',
                                tomador_email: '',
                                tomador_telefone: '',
                                tomador_endereco_logradouro: '',
                                tomador_endereco_numero: '',
                                tomador_endereco_complemento: '',
                                tomador_endereco_bairro: '',
                                tomador_endereco_cidade: '',
                                tomador_endereco_estado: '',
                                tomador_endereco_cep: '',
                              }))
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100 text-gray-400"
                            title="Limpar"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                      {showClientDropdown && (
                        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                          {filteredClients.length === 0 ? (
                            <div className="px-3 py-3 text-xs text-gray-400 text-center">
                              {clients.length === 0 ? 'Carregando clientes...' : 'Nenhum cliente encontrado. Preencha manualmente abaixo.'}
                            </div>
                          ) : (
                            filteredClients.map(c => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => {
                                  handleClientSelect(c.id)
                                  setClientSearch(c.razao_social || '')
                                  setShowClientDropdown(false)
                                }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 border-b border-gray-50 last:border-0"
                              >
                                <div className="font-medium text-gray-800">{c.razao_social || '(sem nome)'}</div>
                                {c.cpf_cnpj && <div className="text-xs text-gray-500">{formatDoc(c.cpf_cnpj)}</div>}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>CPF/CNPJ *</label>
                        <input
                          type="text"
                          value={form.tomador_documento}
                          onChange={e => setForm(p => ({ ...p, tomador_documento: e.target.value }))}
                          className={inputClass}
                          placeholder="00.000.000/0000-00"
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Razao Social *</label>
                        <input
                          type="text"
                          value={form.tomador_razao_social}
                          onChange={e => setForm(p => ({ ...p, tomador_razao_social: e.target.value }))}
                          className={inputClass}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>Email</label>
                        <input
                          type="email"
                          value={form.tomador_email}
                          onChange={e => setForm(p => ({ ...p, tomador_email: e.target.value }))}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Telefone</label>
                        <input
                          type="text"
                          value={form.tomador_telefone}
                          onChange={e => setForm(p => ({ ...p, tomador_telefone: e.target.value }))}
                          className={inputClass}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-3">
                      <div className="col-span-2">
                        <label className={labelClass}>Logradouro</label>
                        <input
                          type="text"
                          value={form.tomador_endereco_logradouro}
                          onChange={e => setForm(p => ({ ...p, tomador_endereco_logradouro: e.target.value }))}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Numero</label>
                        <input
                          type="text"
                          value={form.tomador_endereco_numero}
                          onChange={e => setForm(p => ({ ...p, tomador_endereco_numero: e.target.value }))}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Complemento</label>
                        <input
                          type="text"
                          value={form.tomador_endereco_complemento}
                          onChange={e => setForm(p => ({ ...p, tomador_endereco_complemento: e.target.value }))}
                          className={inputClass}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <label className={labelClass}>Bairro</label>
                        <input
                          type="text"
                          value={form.tomador_endereco_bairro}
                          onChange={e => setForm(p => ({ ...p, tomador_endereco_bairro: e.target.value }))}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Cidade</label>
                        <input
                          type="text"
                          value={form.tomador_endereco_cidade}
                          onChange={e => setForm(p => ({ ...p, tomador_endereco_cidade: e.target.value }))}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>UF</label>
                        <input
                          type="text"
                          value={form.tomador_endereco_estado}
                          onChange={e => setForm(p => ({ ...p, tomador_endereco_estado: e.target.value }))}
                          className={inputClass}
                          maxLength={2}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>CEP</label>
                        <input
                          type="text"
                          value={form.tomador_endereco_cep}
                          onChange={e => setForm(p => ({ ...p, tomador_endereco_cep: e.target.value }))}
                          className={inputClass}
                          placeholder="00000-000"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Servico ── */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <DollarSign size={16} style={{ color: '#059669' }} /> Dados do Servico
                  </h3>

                  <div className="space-y-3">
                    <div>
                      <label className={labelClass}>Discriminacao do servico *</label>
                      <textarea
                        value={form.discriminacao}
                        onChange={e => setForm(p => ({ ...p, discriminacao: e.target.value }))}
                        rows={3}
                        className={inputClass + ' resize-none'}
                        placeholder="Descreva o servico prestado..."
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className={labelClass}>Valor dos servicos (R$) *</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={form.valor_servicos || ''}
                          onChange={e => setForm(p => ({ ...p, valor_servicos: parseFloat(e.target.value) || 0 }))}
                          className={inputClass}
                          placeholder="0,00"
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Aliquota ISS (%)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={form.aliquota_iss}
                          onChange={e => setForm(p => ({ ...p, aliquota_iss: parseFloat(e.target.value) || 0 }))}
                          className={inputClass}
                        />
                      </div>
                      <div className="flex items-end pb-1">
                        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={form.iss_retido}
                            onChange={e => setForm(p => ({ ...p, iss_retido: e.target.checked }))}
                            className="w-4 h-4 rounded border-gray-300"
                          />
                          ISS retido
                        </label>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>Item lista servico</label>
                        <input
                          type="text"
                          value={form.item_lista_servico}
                          onChange={e => setForm(p => ({ ...p, item_lista_servico: e.target.value }))}
                          className={inputClass}
                          placeholder="Ex: 17.01"
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Codigo CNAE</label>
                        <input
                          type="text"
                          value={form.codigo_cnae}
                          onChange={e => setForm(p => ({ ...p, codigo_cnae: e.target.value }))}
                          className={inputClass}
                          placeholder="Ex: 6201-5/00"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Summary card ── */}
                <div className="rounded-xl p-4 border border-gray-100" style={{ backgroundColor: '#F6F2EB' }}>
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">Resumo</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Valor dos servicos</span>
                      <span className="font-medium">{formatBRL(form.valor_servicos)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">ISS calculado ({form.aliquota_iss}%)</span>
                      <span className="font-medium">{formatBRL(issCalculado)}</span>
                    </div>
                    {form.iss_retido && (
                      <div className="flex justify-between text-red-600">
                        <span>ISS retido (deducao)</span>
                        <span className="font-medium">- {formatBRL(issCalculado)}</span>
                      </div>
                    )}
                    <div className="border-t border-gray-200 pt-2 flex justify-between">
                      <span className="font-semibold text-gray-700">Valor liquido</span>
                      <span className="font-bold text-lg" style={{ color: '#059669' }}>{formatBRL(valorLiquido)}</span>
                    </div>
                  </div>
                </div>

                {/* Polling indicator */}
                {polling && (
                  <div className="flex items-center gap-3 rounded-xl p-4 border border-yellow-200 bg-yellow-50">
                    <Loader2 size={20} className="animate-spin text-yellow-600" />
                    <div>
                      <p className="text-sm font-medium text-yellow-800">Processando NFSe...</p>
                      <p className="text-xs text-yellow-600">Aguardando resposta da prefeitura. Isso pode levar ate 1 minuto.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
                <button
                  onClick={() => { setShowNovaModal(false); stopPolling() }}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
                  disabled={submitting || polling}
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    const id = await handleSalvarRascunho()
                    if (id) {
                      setShowNovaModal(false)
                    }
                  }}
                  disabled={submitting || polling}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
                >
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : 'Salvar Rascunho'}
                </button>
                <button
                  onClick={handleEmitir}
                  disabled={submitting || polling}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: '#059669' }}
                >
                  {(submitting || polling) ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                  Emitir NFSe
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            MODAL: Cancelar NFSe
        ════════════════════════════════════════════════════════════════ */}
        {showCancelarModal && selectedEmissao && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-red-600 flex items-center gap-2">
                  <XCircle size={20} /> Cancelar NFSe
                </h2>
                <button onClick={() => setShowCancelarModal(false)} className="p-1 rounded hover:bg-gray-100">
                  <X size={20} className="text-gray-400" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-4">
                <div className="rounded-lg bg-red-50 border border-red-100 p-3 text-sm text-red-700">
                  <p className="font-medium">NFSe: {selectedEmissao.numero_nfse || selectedEmissao.referencia}</p>
                  <p>Tomador: {selectedEmissao.tomador_razao_social}</p>
                  <p>Valor: {formatBRL(selectedEmissao.valor_servicos)}</p>
                </div>

                <div>
                  <label className={labelClass}>Justificativa do cancelamento *</label>
                  <textarea
                    value={justificativa}
                    onChange={e => setJustificativa(e.target.value)}
                    rows={3}
                    className={inputClass + ' resize-none'}
                    placeholder="Informe o motivo do cancelamento (minimo 15 caracteres)..."
                  />
                  <p className="text-xs text-gray-400 mt-1">{justificativa.length}/15 caracteres minimos</p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
                <button
                  onClick={() => setShowCancelarModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
                  disabled={cancelling}
                >
                  Voltar
                </button>
                <button
                  onClick={handleCancelar}
                  disabled={cancelling || justificativa.length < 15}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
                >
                  {cancelling ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                  Confirmar Cancelamento
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            MODAL: Detalhes NFSe
        ════════════════════════════════════════════════════════════════ */}
        {showDetailModal && selectedEmissao && (
          <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 relative">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h2 className="text-lg font-semibold" style={{ color: '#059669' }}>
                  Detalhes - {selectedEmissao.numero_nfse || selectedEmissao.referencia}
                </h2>
                <button onClick={() => { setShowDetailModal(false); setSelectedEmissao(null) }} className="p-1 rounded hover:bg-gray-100">
                  <X size={20} className="text-gray-400" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-6 max-h-[75vh] overflow-y-auto">

                {/* Status + info */}
                <div className="flex items-center justify-between">
                  {renderStatusBadge(selectedEmissao.status)}
                  {selectedEmissao.protocolo && (
                    <span className="text-xs text-gray-400">Protocolo: {selectedEmissao.protocolo}</span>
                  )}
                </div>

                {selectedEmissao.mensagem_retorno && (
                  <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-800">
                    <p className="font-medium mb-1">Mensagem de retorno:</p>
                    <p>{selectedEmissao.mensagem_retorno}</p>
                  </div>
                )}

                {/* Dados gerais */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-gray-400">Referencia</p>
                    <p className="font-medium">{selectedEmissao.referencia}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Numero NFSe</p>
                    <p className="font-medium">{selectedEmissao.numero_nfse || '\u2014'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Data Emissao</p>
                    <p className="font-medium">{formatData(selectedEmissao.data_emissao)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Cod. Verificacao</p>
                    <p className="font-medium font-mono text-xs">{selectedEmissao.codigo_verificacao || '\u2014'}</p>
                  </div>
                </div>

                {/* Tomador */}
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Tomador</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-gray-400">Razao Social</p>
                      <p className="font-medium">{selectedEmissao.tomador_razao_social || '\u2014'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">CPF/CNPJ</p>
                      <p className="font-medium">{formatDoc(selectedEmissao.tomador_documento)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Email</p>
                      <p className="font-medium">{selectedEmissao.tomador_email || '\u2014'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Telefone</p>
                      <p className="font-medium">{selectedEmissao.tomador_telefone || '\u2014'}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-gray-400">Endereco</p>
                      <p className="font-medium">
                        {[
                          selectedEmissao.tomador_endereco_logradouro,
                          selectedEmissao.tomador_endereco_numero,
                          selectedEmissao.tomador_endereco_complemento,
                          selectedEmissao.tomador_endereco_bairro,
                          selectedEmissao.tomador_endereco_cidade,
                          selectedEmissao.tomador_endereco_estado,
                          selectedEmissao.tomador_endereco_cep,
                        ].filter(Boolean).join(', ') || '\u2014'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Servico */}
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Servico</h4>
                  <div className="text-sm space-y-2">
                    <div>
                      <p className="text-xs text-gray-400">Discriminacao</p>
                      <p className="font-medium whitespace-pre-wrap">{selectedEmissao.discriminacao || '\u2014'}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-xs text-gray-400">Item Lista</p>
                        <p className="font-medium">{selectedEmissao.item_lista_servico || '\u2014'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">CNAE</p>
                        <p className="font-medium">{selectedEmissao.codigo_cnae || '\u2014'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">ISS Retido</p>
                        <p className="font-medium">{selectedEmissao.iss_retido ? 'Sim' : 'Nao'}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Valores */}
                <div className="rounded-xl p-4 border border-gray-100" style={{ backgroundColor: '#F6F2EB' }}>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">Valores</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Valor dos servicos</span>
                      <span className="font-medium">{formatBRL(selectedEmissao.valor_servicos)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Deducoes</span>
                      <span className="font-medium">{formatBRL(selectedEmissao.valor_deducoes)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">ISS ({selectedEmissao.aliquota_iss}%)</span>
                      <span className="font-medium">{formatBRL(selectedEmissao.valor_iss)}</span>
                    </div>
                    <div className="border-t border-gray-200 pt-2 flex justify-between">
                      <span className="font-semibold text-gray-700">Valor liquido</span>
                      <span className="font-bold text-lg" style={{ color: '#059669' }}>{formatBRL(selectedEmissao.valor_liquido)}</span>
                    </div>
                  </div>
                </div>

                {/* Links */}
                {(selectedEmissao.pdf_url || selectedEmissao.xml_url) && (
                  <div className="flex gap-3">
                    {selectedEmissao.pdf_url && (
                      <a
                        href={selectedEmissao.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:bg-gray-50"
                      >
                        <Download size={16} /> Download PDF
                      </a>
                    )}
                    {selectedEmissao.xml_url && (
                      <a
                        href={selectedEmissao.xml_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:bg-gray-50"
                      >
                        <FileText size={16} /> Download XML
                      </a>
                    )}
                  </div>
                )}

                {/* Timeline de eventos */}
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">Timeline de Eventos</h4>
                  {loadingEventos ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 size={20} className="animate-spin text-gray-400" />
                    </div>
                  ) : eventos.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">Nenhum evento registrado</p>
                  ) : (
                    <div className="relative pl-6 space-y-4">
                      {/* Vertical line */}
                      <div className="absolute left-[9px] top-1 bottom-1 w-px bg-gray-200" />

                      {eventos.map((ev, idx) => {
                        const isLast = idx === eventos.length - 1
                        let dotColor = '#98A2B3'
                        if (ev.tipo === 'autorizada' || ev.tipo === 'emissao_sucesso') dotColor = '#059669'
                        if (ev.tipo === 'erro' || ev.tipo === 'erro_autorizacao') dotColor = '#E53E3E'
                        if (ev.tipo === 'enviado' || ev.tipo === 'processando') dotColor = '#EA580C'
                        if (ev.tipo === 'cancelada') dotColor = '#4B5563'

                        return (
                          <div key={ev.id} className="relative">
                            {/* Dot */}
                            <div
                              className="absolute -left-6 top-1 w-[10px] h-[10px] rounded-full border-2 border-white"
                              style={{ backgroundColor: dotColor }}
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-gray-700 capitalize">{ev.tipo.replace(/_/g, ' ')}</span>
                                <span className="text-xs text-gray-400">
                                  {formatData(ev.created_at)}
                                  {ev.created_at && (
                                    <> {format(parseISO(ev.created_at), 'HH:mm')}</>
                                  )}
                                </span>
                              </div>
                              {ev.descricao && (
                                <p className="text-xs text-gray-500 mt-0.5">{ev.descricao}</p>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end px-6 py-4 border-t border-gray-100">
                <button
                  onClick={() => { setShowDetailModal(false); setSelectedEmissao(null) }}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}

      </PagePanel>
      </div>
    </AppLayout>
  )
}
