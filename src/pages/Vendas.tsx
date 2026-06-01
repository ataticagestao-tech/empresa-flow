import { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { Link, useSearchParams } from 'react-router-dom'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { safeQuery } from '@/lib/supabaseQuery'
import { formatBRL, formatData, formatCPF, formatCNPJ, toTitleCase } from '@/lib/format'
import { useQuery } from '@tanstack/react-query'
import { AppLayout } from '@/components/layout/AppLayout'
import { PagePanel } from '@/components/layout/PagePanel'
import { SendWhatsAppDialog } from '@/components/whatsapp/SendWhatsAppDialog'
import { SendEmailDialog } from '@/components/email/SendEmailDialog'
import { RegistrarPagamentoDialog } from '@/modules/clients/presentation/components/RegistrarPagamentoDialog'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { RoleGate } from '@/components/auth/RoleGate'
import {
  Search, Plus, Eye, Trash2, X, Pencil,
  Loader2, AlertCircle, Check, Package,
  Briefcase, FileText, RefreshCw, CreditCard, Banknote,
  QrCode, Receipt, Calendar, UserPlus, ChevronDown,
  Upload, Download, CheckCircle2, XCircle, ShoppingCart, FileSpreadsheet
} from 'lucide-react'
import { parseVendasSpreadsheet, type VendaImportRow } from '@/lib/parsers/vendasSpreadsheet'
import { gerarRelatorioListaPDF, downloadListaPDF } from '@/lib/cadastros-pdf/gerar-lista-pdf'
import * as XLSX from 'xlsx'
import { format, startOfMonth, endOfMonth, parseISO, addMonths, addDays } from 'date-fns'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList, CartesianGrid } from 'recharts'

// `db` agora é definido dentro do componente como alias do activeClient
// (antes era `const db = supabase as any` no top-level, o que ignorava o
// projeto secundário em multi-tenant e mandava vendas pro banco errado).

/* ================================================================
   TYPES
   ================================================================ */

interface Venda {
  id: string
  company_id: string
  cliente_nome: string
  cliente_cpf_cnpj: string | null
  tipo: 'servico' | 'produto' | 'pacote' | 'contrato'
  valor_total: number
  data_venda: string
  forma_pagamento: string
  status: string
  vendas_itens?: VendaItem[]
  contas_receber?: ContaReceber[]
}

interface VendaItem {
  id: string
  venda_id: string
  descricao: string
  quantidade: number
  valor_unitario: number
  valor_total: number
}

interface ContaReceber {
  id: string
  venda_id?: string
  status: string
  valor: number
  valor_pago: number | null
  data_vencimento: string
  forma_recebimento?: string | null
  conta_bancaria_id?: string | null
}

interface PagamentoSplit {
  uid: string
  forma: string
  valor: number
  conta_bancaria_id: string
  parcelas: number
  taxa: any | null
  // Só usado quando forma === 'pendente'. Default +30 dias da data da venda.
  vencimento_pendente?: string | null
}

interface BankAccount {
  id: string
  name: string
  banco?: string
  type?: string
}

interface CentroCusto {
  id: string
  codigo: string
  descricao: string
}

interface Cliente {
  id: string
  razao_social: string
  nome_fantasia: string | null
  cpf_cnpj: string | null
  email: string | null
}

interface Produto {
  id: string
  code: string | null
  description: string
  price: number | null
  unidade_medida: string | null
  conta_contabil_id: string | null
}

interface NovoItem {
  descricao: string
  quantidade: number
  valor_unitario: number
  produto_id?: string
  conta_contabil_id?: string | null
}

interface ContratoAbertoCliente {
  id: string
  tipo: 'contrato' | 'pacote'
  procedimento: string | null
  valor_total: number
  total_pago: number
  saldo: number
  data_venda: string
}

/* ================================================================
   CONSTANTS
   ================================================================ */

const TIPOS_VENDA = [
  { value: 'servico', label: 'Serviço', icon: Briefcase },
  { value: 'produto', label: 'Produto', icon: Package },
  { value: 'pacote', label: 'Pacote', icon: FileText },
  { value: 'contrato', label: 'Contrato', icon: RefreshCw },
] as const

const FORMAS_PAGAMENTO = [
  { value: 'pix', label: 'PIX/TED', icon: QrCode },
  { value: 'dinheiro', label: 'Dinheiro', icon: Banknote },
  { value: 'cartao_credito', label: 'Cartão crédito', icon: CreditCard },
  { value: 'cartao_debito', label: 'Cartão débito', icon: CreditCard },
  { value: 'boleto', label: 'Boleto', icon: Receipt },
  { value: 'parcelado', label: 'Parcelado', icon: Calendar },
  { value: 'pendente', label: 'Em aberto (a definir)', icon: AlertCircle },
] as const

const FORMAS_A_VISTA = ['pix', 'dinheiro', 'cartao_debito']
const FORMAS_A_PRAZO = ['parcelado', 'boleto', 'cartao_credito']
// 'pendente' = saldo a pagar no futuro, forma ainda indefinida (típico de contrato com entrada parcial)

const LABEL_FORMA: Record<string, string> = {
  pix: 'PIX/TED', dinheiro: 'Dinheiro', cartao_credito: 'Cartão crédito',
  cartao_debito: 'Cartão débito', boleto: 'Boleto', parcelado: 'Parcelado',
  pendente: 'Em aberto', multiplo: 'Múltiplo',
}

function novoSplit(valor = 0): PagamentoSplit {
  return {
    uid: typeof crypto !== 'undefined' && (crypto as any).randomUUID ? (crypto as any).randomUUID() : `${Date.now()}-${Math.random()}`,
    forma: 'pix',
    valor,
    conta_bancaria_id: '',
    parcelas: 1,
    taxa: null,
  }
}

const LABEL_TIPO: Record<string, string> = {
  servico: 'Serviço', produto: 'Produto', pacote: 'Pacote', contrato: 'Contrato',
}

/* ================================================================
   HEADER FILTER DROPDOWN (portal, escapa overflow da tabela)
   ================================================================ */

function HeaderFilterDropdown({
  anchor,
  align,
  width,
  innerRef,
  className = '',
  children,
}: {
  anchor: HTMLElement | null
  align: 'left' | 'center' | 'right'
  width: number
  innerRef?: React.RefObject<HTMLDivElement>
  className?: string
  children: React.ReactNode
}) {
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!anchor) return
    const update = () => {
      const r = anchor.getBoundingClientRect()
      let left: number
      if (align === 'center') left = r.left + r.width / 2 - width / 2
      else if (align === 'right') left = r.right - width
      else left = r.left
      const maxLeft = window.innerWidth - width - 8
      left = Math.max(8, Math.min(left, maxLeft))
      setCoords({ top: r.bottom + 4, left })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [anchor, align, width])

  if (!anchor || !coords) return null
  return createPortal(
    <div
      ref={innerRef}
      style={{ position: 'fixed', top: coords.top, left: coords.left, width }}
      className={`bg-white border border-[#D0D5DD] rounded-md shadow-lg z-[60] normal-case font-normal tracking-normal ${className}`}
    >
      {children}
    </div>,
    document.body
  )
}

/* ================================================================
   COMPONENT
   ================================================================ */

export default function Vendas() {
  const { selectedCompany } = useCompany()
  const { activeClient, isUsingSecondary, user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const confirm = useConfirm()
  // Alias do client ativo — todas as queries de Vendas devem passar por aqui
  // pra respeitar o projeto em que a empresa logada está hospedada.
  const db = activeClient as any

  // ─── Data state ──────────────────────────────────────────────
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [centrosCusto, setCentrosCusto] = useState<CentroCusto[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [posVenda, setPosVenda] = useState<{
    cliente: string
    valor: number
    phone: string
    email: string
    whatsText: string
    emailAssunto: string
    emailCorpo: string
    step: 'choose' | 'whats' | 'email'
  } | null>(null)
  const [defaultReceitaContaId, setDefaultReceitaContaId] = useState<string | null>(null)
  // Set de IDs válidos no plano de contas da empresa — usado pra evitar FK
  // violation 23503 quando produto carrega conta_contabil_id órfão (ex.: plano
  // de contas resetado e produto manteve referência antiga).
  const [validContaContabilIds, setValidContaContabilIds] = useState<Set<string>>(new Set())

  // ─── Filter state ────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFrom, setDateFrom] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState(() => format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroForma, setFiltroForma] = useState('')
  const [filtroCR, setFiltroCR] = useState('')          // pago | aberto | parcial | avista
  const [filtroCliente, setFiltroCliente] = useState('') // nome exato (set ao filtrar no header)
  const [filtroCodigo, setFiltroCodigo] = useState('')
  const [filtroData, setFiltroData] = useState('')      // yyyy-MM-dd
  const [filtroProduto, setFiltroProduto] = useState('')
  const [filtroItens, setFiltroItens] = useState<number | ''>('')
  const [filtroValorMin, setFiltroValorMin] = useState<number | ''>('')
  const [filtroValorMax, setFiltroValorMax] = useState<number | ''>('')
  const [headerFiltroAberto, setHeaderFiltroAberto] = useState<string | null>(null)
  const [headerFiltroBusca, setHeaderFiltroBusca] = useState('')
  const headerFiltroRef = useRef<HTMLDivElement>(null)
  const [headerAnchor, setHeaderAnchor] = useState<HTMLElement | null>(null)
  const headerAnchorRef = useRef<HTMLElement | null>(null)
  useEffect(() => { headerAnchorRef.current = headerAnchor }, [headerAnchor])

  // ─── Padrão de planilha: colunas ajustáveis + ocultáveis ─────
  const VENDAS_COL_ORDER = ['codigo', 'data', 'cliente', 'produto', 'itens', 'forma', 'valor', 'cr', 'acoes']
  const COL_LABELS: Record<string, string> = {
    codigo: 'Código', data: 'Data', cliente: 'Cliente', produto: 'Produto',
    itens: 'Itens', forma: 'Forma pgto', valor: 'Valor', cr: 'CR', acoes: 'Ações',
  }
  const COL_WIDTHS_DEFAULT: Record<string, number> = {
    codigo: 90, data: 90, cliente: 200, produto: 180, itens: 70, forma: 130, valor: 120, cr: 90, acoes: 120,
  }
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    try {
      const s = localStorage.getItem('vendas_col_widths')
      if (s) return { ...COL_WIDTHS_DEFAULT, ...JSON.parse(s) }
    } catch { /* ignore */ }
    return COL_WIDTHS_DEFAULT
  })
  useEffect(() => { localStorage.setItem('vendas_col_widths', JSON.stringify(colWidths)) }, [colWidths])
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => {
    try {
      const s = localStorage.getItem('vendas_hidden_cols')
      if (s) return new Set(JSON.parse(s) as string[])
    } catch { /* ignore */ }
    return new Set()
  })
  useEffect(() => { localStorage.setItem('vendas_hidden_cols', JSON.stringify([...hiddenCols])) }, [hiddenCols])
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const isColVisible = (k: string) => !hiddenCols.has(k)
  const toggleColVisible = (k: string) => setHiddenCols(prev => {
    const n = new Set(prev)
    if (n.has(k)) n.delete(k); else n.add(k)
    return n
  })
  const visibleVendasCols = VENDAS_COL_ORDER.filter(isColVisible)
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
  // helper: abre/fecha dropdown de header capturando elemento âncora (pro portal)
  const toggleHeaderFiltro = (key: string) => (e: React.MouseEvent<HTMLButtonElement>) => {
    if (headerFiltroAberto === key) {
      setHeaderFiltroAberto(null)
      setHeaderAnchor(null)
    } else {
      setHeaderFiltroAberto(key)
      setHeaderAnchor(e.currentTarget)
    }
  }

  // ─── Filtro de data (dropdown suspenso) ──────────────────────
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false)
  const [tempDateFrom, setTempDateFrom] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [tempDateTo, setTempDateTo] = useState(() => format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const dateDropdownRef = useRef<HTMLDivElement>(null)

  // ─── Paginação da tabela ─────────────────────────────────────
  const ITENS_POR_PAGINA = 5
  const [paginaAtual, setPaginaAtual] = useState(1)

  // ─── Exportação (Excel / PDF) ────────────────────────────────
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)

  // ─── Banner customizado por empresa (salvo em localStorage) ──
  const [bannerUrl, setBannerUrl] = useState<string | null>(null)
  const [bannerUploading, setBannerUploading] = useState(false)
  const bannerInputRef = useRef<HTMLInputElement>(null)

  // ─── Modal state ─────────────────────────────────────────────
  const [modalAberto, setModalAberto] = useState(false)
  const [modalDetalhes, setModalDetalhes] = useState<Venda | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [confirmDeleteMes, setConfirmDeleteMes] = useState(false)
  const [deletandoMes, setDeletandoMes] = useState(false)
  const [editandoVenda, setEditandoVenda] = useState<Venda | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erroModal, setErroModal] = useState<string | null>(null)

  // ─── Import state ────────────────────────────────────────────
  const [modalImport, setModalImport] = useState(false)
  const [importRows, setImportRows] = useState<VendaImportRow[]>([])
  const [importErros, setImportErros] = useState(0)
  const [importError, setImportError] = useState<string | null>(null)
  const [importando, setImportando] = useState(false)
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 })
  const [importResult, setImportResult] = useState<{ ok: number; fail: number } | null>(null)
  const [importContaBancaria, setImportContaBancaria] = useState('')
  const [importCentroCusto, setImportCentroCusto] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ─── Form state ──────────────────────────────────────────────
  const [formTipo, setFormTipo] = useState<string>('servico')
  const [formClienteId, setFormClienteId] = useState<string | null>(null)
  const [formCliente, setFormCliente] = useState('')
  const [formCpfCnpj, setFormCpfCnpj] = useState('')
  const [formDataVenda, setFormDataVenda] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [formItens, setFormItens] = useState<NovoItem[]>([{ descricao: '', quantidade: 1, valor_unitario: 0 }])
  const [formDescontoTipo, setFormDescontoTipo] = useState<'valor' | 'percentual'>('valor')
  const [formDesconto, setFormDesconto] = useState(0)
  const [formPagamentos, setFormPagamentos] = useState<PagamentoSplit[]>([novoSplit()])
  const [formCentroCusto, setFormCentroCusto] = useState('')

  // ─── Contratos/pacotes em aberto do cliente (detecção em Nova Venda) ─
  const [contratosAbertosCliente, setContratosAbertosCliente] = useState<ContratoAbertoCliente[]>([])
  const [carregandoContratosCliente, setCarregandoContratosCliente] = useState(false)
  const [bannerContratoDispensado, setBannerContratoDispensado] = useState(false)
  const [pagamentoContrato, setPagamentoContrato] = useState<{ contrato: ContratoAbertoCliente; modoQuitacao: boolean } | null>(null)

  // ─── Client search state ─────────────────────────────────────
  const [clienteSearch, setClienteSearch] = useState('')
  const [clienteDropdownOpen, setClienteDropdownOpen] = useState(false)
  const clienteRef = useRef<HTMLDivElement>(null)

  // ─── Novo Cliente modal ──────────────────────────────────────
  const [modalNovoCliente, setModalNovoCliente] = useState(false)
  const [novoClienteNome, setNovoClienteNome] = useState('')
  const [novoClienteCpfCnpj, setNovoClienteCpfCnpj] = useState('')
  const [novoClienteEmail, setNovoClienteEmail] = useState('')
  const [salvandoCliente, setSalvandoCliente] = useState(false)

  // ─── Product modal state ──────────────────────────────────────
  const [modalProdutoIdx, setModalProdutoIdx] = useState<number | null>(null)
  const [produtoSearchTerm, setProdutoSearchTerm] = useState('')
  const [modalProdutos, setModalProdutos] = useState<Produto[]>([])
  const [loadingProdutos, setLoadingProdutos] = useState(false)

  // ─── Computed ────────────────────────────────────────────────
  const companyId = selectedCompany?.id

  // ─── Vendas (React Query: cacheia entre navegações) ──────────
  // A consulta pesada (vendas + itens + CRs do período) fica em cache: reabrir a
  // tela com o mesmo período aparece na hora, sem refazer a busca. Recarrega só
  // quando muda empresa/período — ou após salvar/excluir, via fetchVendas (refetch).
  const {
    data: vendasData,
    isLoading: vendasLoading,
    error: vendasError,
    refetch: refetchVendas,
  } = useQuery({
    queryKey: ['vendas', companyId, dateFrom, dateTo],
    enabled: !!companyId,
    queryFn: async () => {
      const inicio = dateFrom
      const fim = dateTo

      const pageSize = 1000
      const vendasBase: Venda[] = []
      let fromIdx = 0
      while (true) {
        const { data, error: err } = await db
          .from('vendas')
          .select('id, company_id, cliente_nome, cliente_cpf_cnpj, tipo, valor_total, data_venda, forma_pagamento, status')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .gte('data_venda', inicio)
          .lte('data_venda', fim)
          .order('data_venda', { ascending: false })
          .range(fromIdx, fromIdx + pageSize - 1)
        if (err) throw err
        const batch = (data as Venda[]) || []
        vendasBase.push(...batch)
        if (batch.length < pageSize) break
        fromIdx += pageSize
      }

      const vendaIds = vendasBase.map(v => v.id)
      const itensByVenda = new Map<string, VendaItem[]>()
      const crsByVenda = new Map<string, ContaReceber[]>()

      if (vendaIds.length > 0) {
        // Chunk IN (...) para não estourar limite de URL do PostgREST
        const chunkSize = 300
        const chunks: string[][] = []
        for (let i = 0; i < vendaIds.length; i += chunkSize) {
          chunks.push(vendaIds.slice(i, i + chunkSize))
        }

        const itensPromises = chunks.map(ids =>
          db.from('vendas_itens')
            .select('id, venda_id, descricao, quantidade, valor_unitario, valor_total')
            .in('venda_id', ids)
        )
        const crsPromises = chunks.map(ids =>
          db.from('contas_receber')
            .select('id, venda_id, status, valor, valor_pago, data_vencimento, forma_recebimento, conta_bancaria_id')
            .in('venda_id', ids)
            .is('deleted_at', null)
        )

        const [itensResults, crsResults] = await Promise.all([
          Promise.all(itensPromises),
          Promise.all(crsPromises),
        ])

        for (const res of itensResults) {
          if (res.error) throw res.error
          for (const it of (res.data as (VendaItem & { venda_id: string })[]) || []) {
            const arr = itensByVenda.get(it.venda_id) || []
            arr.push(it)
            itensByVenda.set(it.venda_id, arr)
          }
        }

        for (const res of crsResults) {
          if (res.error) throw res.error
          for (const cr of (res.data as (ContaReceber & { venda_id: string })[]) || []) {
            const arr = crsByVenda.get(cr.venda_id) || []
            arr.push(cr)
            crsByVenda.set(cr.venda_id, arr)
          }
        }
      }

      const all: Venda[] = vendasBase.map(v => ({
        ...v,
        cliente_nome: toTitleCase(v.cliente_nome),
        vendas_itens: (itensByVenda.get(v.id) || []).map(it => ({
          ...it,
          descricao: toTitleCase(it.descricao),
        })),
        contas_receber: crsByVenda.get(v.id) || [],
      }))

      return all
    },
  })
  const vendas = vendasData ?? []
  const loading = vendasLoading
  const error = vendasError ? ((vendasError as Error).message || 'Erro ao buscar vendas') : null
  // Mantém o nome usado nos pontos que recarregam após salvar/excluir.
  const fetchVendas = refetchVendas

  // mesDate kept for backward compat (agenda label, etc)
  const mesDate = useMemo(() => parseISO(dateFrom), [dateFrom])

  const subtotalItens = useMemo(
    () => formItens.reduce((s, it) => s + it.quantidade * it.valor_unitario, 0),
    [formItens]
  )

  const descontoCalculado = useMemo(
    () => formDescontoTipo === 'percentual' ? subtotalItens * (formDesconto / 100) : formDesconto,
    [subtotalItens, formDesconto, formDescontoTipo]
  )

  const totalVenda = useMemo(
    () => Math.max(0, subtotalItens - descontoCalculado),
    [subtotalItens, descontoCalculado]
  )

  const totalPagamentos = useMemo(
    () => formPagamentos.reduce((s, p) => s + (Number(p.valor) || 0), 0),
    [formPagamentos]
  )
  const pendentePagamento = useMemo(
    () => Math.round((totalVenda - totalPagamentos) * 100) / 100,
    [totalVenda, totalPagamentos]
  )

  // ─── Filtered data ──────────────────────────────────────────
  const vendasFiltradas = useMemo(() => {
    const getCRSt = (v: Venda) => {
      const crs = v.contas_receber || []
      if (crs.length === 0) return 'avista'
      const allPago = crs.every(c => c.status === 'pago')
      if (allPago) return 'pago'
      const naoPagos = crs.filter(c => c.status !== 'pago')
      const todosOperadora = naoPagos.length > 0 && naoPagos.every(c => {
        const f = c.forma_recebimento || v.forma_pagamento
        return f === 'cartao_credito' || f === 'parcelado'
      })
      if (todosOperadora) return 'pago'
      const anyParcial = crs.some(c => c.status === 'parcial')
      if (anyParcial) return 'parcial'
      return 'aberto'
    }
    return vendas.filter((v) => {
      if (searchTerm && !v.cliente_nome.toLowerCase().includes(searchTerm.toLowerCase())) return false
      if (filtroTipo && v.tipo !== filtroTipo) return false
      if (filtroForma && v.forma_pagamento !== filtroForma) return false
      if (filtroCliente && v.cliente_nome !== filtroCliente) return false
      if (filtroCR && getCRSt(v) !== filtroCR) return false
      if (filtroData && v.data_venda !== filtroData) return false
      if (filtroItens !== '' && (v.vendas_itens?.length || 0) !== filtroItens) return false
      if (filtroValorMin !== '' && Number(v.valor_total) < Number(filtroValorMin)) return false
      if (filtroValorMax !== '' && Number(v.valor_total) > Number(filtroValorMax)) return false
      if (filtroProduto) {
        const hasMatch = (v.vendas_itens || []).some(it =>
          (it.descricao || '').toLowerCase().includes(filtroProduto.toLowerCase())
        )
        if (!hasMatch) return false
      }
      if (filtroCodigo) {
        // recalcula o codigo (vendaCodigoMap depende de vendas mas e definido depois)
        const codigos: Record<string, string> = {}
        const ordenadas = [...vendas].sort((a, b) => {
          const d = a.data_venda.localeCompare(b.data_venda)
          return d !== 0 ? d : a.id.localeCompare(b.id)
        })
        ordenadas.forEach((vv, i) => { codigos[vv.id] = `V-${String(i + 1).padStart(4, '0')}` })
        if (!(codigos[v.id] || '').toLowerCase().includes(filtroCodigo.toLowerCase())) return false
      }
      return true
    })
  }, [vendas, searchTerm, filtroTipo, filtroForma, filtroCR, filtroCliente, filtroData, filtroItens, filtroValorMin, filtroValorMax, filtroProduto, filtroCodigo])

  // ─── Paginação derivada ─────────────────────────────────────
  const totalPaginas = Math.max(1, Math.ceil(vendasFiltradas.length / ITENS_POR_PAGINA))
  const vendasPaginadas = useMemo(() => {
    const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA
    return vendasFiltradas.slice(inicio, inicio + ITENS_POR_PAGINA)
  }, [vendasFiltradas, paginaAtual])

  // Reset para página 1 quando filtros/dados mudam
  useEffect(() => { setPaginaAtual(1) }, [searchTerm, filtroTipo, filtroForma, filtroCR, filtroCliente, filtroData, filtroItens, filtroValorMin, filtroValorMax, filtroProduto, filtroCodigo, dateFrom, dateTo])

  // Fecha o menu de exportação ao clicar fora
  useEffect(() => {
    if (!exportMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) setExportMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [exportMenuOpen])

  // ─── Top 10 produtos mais vendidos (gráfico) ───────────────
  const produtosRanking = useMemo(() => {
    const map: Record<string, { descricao: string; total: number; quantidade: number }> = {}
    vendasFiltradas.forEach(v => {
      ;(v.vendas_itens || []).forEach(it => {
        const key = (it.descricao || 'Sem descrição').trim()
        if (!map[key]) map[key] = { descricao: key, total: 0, quantidade: 0 }
        map[key].total += Number(it.valor_total || 0)
        map[key].quantidade += Number(it.quantidade || 0)
      })
    })
    return Object.values(map)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
  }, [vendasFiltradas])

  // ─── Listas únicas pros filtros de header (com count, ordenado DESC) ────
  const clientesUnicos = useMemo(() => {
    const counts: Record<string, number> = {}
    vendas.forEach(v => { if (v.cliente_nome) counts[v.cliente_nome] = (counts[v.cliente_nome] || 0) + 1 })
    return Object.entries(counts).sort((a, b) => b[1] - a[1])  // [nome, count]
  }, [vendas])

  const formasUnicas = useMemo(() => {
    const counts: Record<string, number> = {}
    vendas.forEach(v => { if (v.forma_pagamento) counts[v.forma_pagamento] = (counts[v.forma_pagamento] || 0) + 1 })
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [vendas])

  const datasUnicas = useMemo(() => {
    const counts: Record<string, number> = {}
    vendas.forEach(v => { if (v.data_venda) counts[v.data_venda] = (counts[v.data_venda] || 0) + 1 })
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [vendas])

  const itensUnicos = useMemo(() => {
    const counts: Record<number, number> = {}
    vendas.forEach(v => {
      const k = v.vendas_itens?.length || 0
      counts[k] = (counts[k] || 0) + 1
    })
    return Object.entries(counts).map(([k, c]) => [Number(k), c] as [number, number]).sort((a, b) => b[1] - a[1])
  }, [vendas])

  // CR status agrupado
  const crStatusUnicos = useMemo(() => {
    const counts: Record<string, number> = { pago: 0, aberto: 0, areceber: 0, parcial: 0, avista: 0 }
    const hoje = new Date().toISOString().slice(0, 10)
    vendas.forEach(v => {
      const crs = v.contas_receber || []
      let st: string
      if (crs.length === 0) st = 'avista'
      else if (crs.every(c => c.status === 'pago')) st = 'pago'
      else {
        const naoPagos = crs.filter(c => c.status !== 'pago')
        const todosOperadora = naoPagos.every(c => {
          const f = c.forma_recebimento || v.forma_pagamento
          return f === 'cartao_credito' || f === 'parcelado'
        })
        if (todosOperadora) st = 'pago'
        else if (crs.some(c => c.status === 'parcial')) st = 'parcial'
        else {
          const algumVencido = naoPagos.some(c => c.data_vencimento && c.data_vencimento < hoje)
          st = algumVencido ? 'aberto' : 'areceber'
        }
      }
      counts[st] = (counts[st] || 0) + 1
    })
    return Object.entries(counts).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1])
  }, [vendas])

  // ─── Mapa de código sequencial (V-0001, V-0002...) ─────────
  const vendaCodigoMap = useMemo(() => {
    const map: Record<string, string> = {}
    const ordenadas = [...vendas].sort((a, b) => {
      const d = a.data_venda.localeCompare(b.data_venda)
      return d !== 0 ? d : a.id.localeCompare(b.id)
    })
    ordenadas.forEach((v, i) => {
      map[v.id] = `V-${String(i + 1).padStart(4, '0')}`
    })
    return map
  }, [vendas])

  // ─── Filtered clients for dropdown ───────────────────────────
  const clientesFiltrados = useMemo(() => {
    if (!clienteSearch.trim()) return clientes.slice(0, 20)
    const term = clienteSearch.toLowerCase()
    return clientes.filter(c =>
      (c.nome_fantasia || '').toLowerCase().includes(term) ||
      c.razao_social.toLowerCase().includes(term) ||
      (c.cpf_cnpj || '').includes(term)
    ).slice(0, 20)
  }, [clientes, clienteSearch])

  // ─── Filtered products for modal ──────────────────────────────
  const produtosFiltrados = useMemo(() => {
    const source = modalProdutos.length > 0 ? modalProdutos : produtos
    if (!produtoSearchTerm.trim()) return source
    const term = produtoSearchTerm.toLowerCase()
    return source.filter(p =>
      p.description.toLowerCase().includes(term) ||
      (p.code || '').toLowerCase().includes(term)
    )
  }, [modalProdutos, produtos, produtoSearchTerm])

  // ─── KPIs ────────────────────────────────────────────────────
  // Invariante: aVista + aPrazo === total (sempre).
  // Usa vendasFiltradas para que QUALQUER filtro (data, tipo, forma, cliente,
  // busca, etc.) reflita imediatamente nos cards laterais.
  // Para cada venda, classificamos pelos CRs (forma_recebimento). Quando a forma
  // não está preenchida ou não é reconhecida, usamos o status do CR como fallback
  // (pago => à vista; demais => a prazo). Se a soma dos CRs divergir do
  // valor_total da venda, redistribuímos proporcionalmente para que o total bata.
  const kpis = useMemo(() => {
    const total = vendasFiltradas.reduce((s, v) => s + (v.valor_total || 0), 0)
    const count = vendasFiltradas.length
    const ticket = count > 0 ? total / count : 0
    let aVista = 0
    let aPrazo = 0
    vendasFiltradas.forEach((v) => {
      const valorVenda = Number(v.valor_total || 0)
      if (valorVenda === 0) return
      const crs = v.contas_receber || []
      if (crs.length === 0) {
        if (FORMAS_A_VISTA.includes(v.forma_pagamento)) aVista += valorVenda
        else aPrazo += valorVenda
        return
      }
      let vista = 0
      let prazo = 0
      crs.forEach((cr) => {
        const valorCr = Number(cr.valor || 0)
        const forma = cr.forma_recebimento
        if (forma && FORMAS_A_VISTA.includes(forma)) {
          vista += valorCr
        } else if (forma && FORMAS_A_PRAZO.includes(forma)) {
          prazo += valorCr
        } else if (cr.status === 'pago') {
          vista += valorCr
        } else {
          prazo += valorCr
        }
      })
      const somaCrs = vista + prazo
      if (somaCrs > 0) {
        const scale = valorVenda / somaCrs
        aVista += vista * scale
        aPrazo += prazo * scale
      } else {
        if (FORMAS_A_VISTA.includes(v.forma_pagamento)) aVista += valorVenda
        else aPrazo += valorVenda
      }
    })
    return { total, count, ticket, aVista, aPrazo }
  }, [vendasFiltradas])

  // ─── Fetch data ──────────────────────────────────────────────
  // Query dividida em 3 flat queries paralelas em vez de nested embed.
  // Nested select (`vendas_itens(*), contas_receber(*)`) estava estourando
  // statement timeout quando o histórico crescia. Flat + IN (...) é muito
  // mais barato para o PostgREST e usa os índices em venda_id.
  const fetchAuxData = useCallback(async () => {
    if (!companyId || !activeClient) return

    const ac = activeClient as any
    const [banksRes, centrosRes, clientesRes, produtosRes, receitaContaRes, allContasRes] = await Promise.all([
      ac.from('bank_accounts').select('id, name, banco, type').eq('company_id', companyId).eq('is_active', true),
      ac.from('centros_custo').select('id, codigo, descricao').eq('company_id', companyId).eq('ativo', true),
      ac.from('clients').select('id, razao_social, nome_fantasia, cpf_cnpj, email').eq('company_id', companyId).eq('is_active', true).order('razao_social'),
      ac.from('products').select('id, code, description, price, unidade_medida, conta_contabil_id').eq('company_id', companyId).order('description'),
      ac.from('chart_of_accounts')
        .select('id, code')
        .eq('company_id', companyId)
        .eq('account_type', 'revenue')
        .eq('is_analytical', true)
        .eq('status', 'active')
        .order('code')
        .limit(1)
        .maybeSingle(),
      ac.from('chart_of_accounts').select('id').eq('company_id', companyId),
    ])

    setBankAccounts((banksRes.data as BankAccount[]) || [])
    setCentrosCusto((centrosRes.data as CentroCusto[]) || [])
    setClientes(((clientesRes.data as Cliente[]) || []).map(c => ({
      ...c,
      razao_social: toTitleCase(c.razao_social),
      nome_fantasia: c.nome_fantasia ? toTitleCase(c.nome_fantasia) : c.nome_fantasia,
    })))
    setDefaultReceitaContaId((receitaContaRes.data as any)?.id || null)
    if (!(receitaContaRes.data as any)?.id) {
      console.warn('[Vendas] Nenhuma conta de receita analítica encontrada no plano de contas — CRs serão criados sem classificação e não aparecerão no DRE.')
    }
    setValidContaContabilIds(new Set(((allContasRes.data as any[]) || []).map((r: any) => r.id)))

    // Fallback: se activeClient não retornou produtos, tentar com db
    let prods = (produtosRes.data as Produto[]) || []
    if (prods.length === 0) {
      const fallback = await db.from('products').select('id, code, description, price, unidade_medida, conta_contabil_id').eq('company_id', companyId).order('description')
      prods = (fallback.data as Produto[]) || []
    }
    setProdutos(prods)
  }, [companyId, activeClient])

  // fetchVendas agora é gerenciado pelo useQuery (busca automática ao mudar empresa/período).
  useEffect(() => { fetchAuxData() }, [fetchAuxData])

  // ─── Open new sale modal when ?new=true ──────────────────────
  useEffect(() => {
    if (searchParams.get('new') === 'true') {
      resetForm()
      setEditandoVenda(null)
      setModalAberto(true)
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // ─── Conta destino sempre oculta no modal: detalhe tecnico do sistema
  //     resolvido automaticamente por pickContaPadrao. Mantemos a variavel
  //     pra possivel futuro modo avancado.
  const isOwner = false

  // ─── Escolhe conta padrão por forma de pagamento ──
  // cartao_credito/parcelado → primeiro bank_account type='cartao_credito'
  // demais formas → primeira conta corrente (qualquer type != 'cartao_credito')
  const pickContaPadrao = useCallback((forma: string): string => {
    // 'pendente' = saldo em aberto, sem destino bancário definido ainda.
    if (forma === 'pendente') return ''
    if (forma === 'cartao_credito' || forma === 'parcelado') {
      const cartao = bankAccounts.find(b => b.type === 'cartao_credito')
      if (cartao) return cartao.id
    }
    const corrente = bankAccounts.find(b => b.type !== 'cartao_credito')
    return corrente?.id || bankAccounts[0]?.id || ''
  }, [bankAccounts])

  // ─── Auto-popular conta_bancaria_id quando bankAccounts carrega ou forma muda ──
  const splitsFormaKey = formPagamentos.map(p => p.forma).join('|')
  useEffect(() => {
    if (bankAccounts.length === 0) return
    setFormPagamentos(prev => {
      let mudou = false
      const next = prev.map(p => {
        if (p.conta_bancaria_id) return p
        const def = pickContaPadrao(p.forma)
        if (!def) return p
        mudou = true
        return { ...p, conta_bancaria_id: def }
      })
      return mudou ? next : prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankAccounts, splitsFormaKey])

  // ─── Auto-sync: se houver apenas 1 forma de pagamento, mantém o valor
  //     igual ao total da venda conforme itens/desconto mudam.
  useEffect(() => {
    if (formPagamentos.length !== 1) return
    setFormPagamentos(prev => {
      if (prev.length !== 1) return prev
      if (Math.abs((prev[0].valor || 0) - totalVenda) < 0.01) return prev
      return [{ ...prev[0], valor: totalVenda }]
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalVenda, formPagamentos.length])

  // Limpa erro de validação assim que a inconsistência for resolvida pelo
  // usuário (editar item/split). Evita banner vermelho stale quando a soma
  // já passou a bater com o total.
  useEffect(() => {
    if (!erroModal) return
    if (Math.abs(pendentePagamento) < 0.01 && totalVenda > 0) setErroModal(null)
  }, [totalVenda, totalPagamentos, pendentePagamento, erroModal])

  // ─── Fetch taxa config para cada split (forma + conta bancária) ──
  // Dispara fetch sempre que a chave (forma|conta) de algum split muda.
  const splitsTaxaKey = formPagamentos
    .map(p => `${p.forma}|${p.conta_bancaria_id}`)
    .join(';')
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const novos = await Promise.all(
        formPagamentos.map(async (p) => {
          if (!p.conta_bancaria_id || !p.forma) return { ...p, taxa: null }
          const meioPgto = p.forma === 'parcelado' ? 'cartao_credito' : p.forma
          const { data } = await db
            .from('configuracao_taxas_pagamento')
            .select('*')
            .eq('bank_account_id', p.conta_bancaria_id)
            .eq('meio_pagamento', meioPgto)
            .eq('ativo', true)
            .maybeSingle()
          return { ...p, taxa: data || null }
        })
      )
      if (cancelled) return
      // Só atualiza se mudou alguma taxa, pra não loopar
      setFormPagamentos(prev => {
        if (prev.length !== novos.length) return prev
        const mesma = prev.every((p, i) => p.taxa === novos[i].taxa && p.uid === novos[i].uid)
        if (mesma) return prev
        return prev.map((p, i) => ({ ...p, taxa: novos[i]?.taxa || null }))
      })
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitsTaxaKey])

  // ─── Carregar banner customizado da empresa (localStorage) ───
  useEffect(() => {
    if (!companyId) { setBannerUrl(null); return }
    try {
      const stored = localStorage.getItem(`vendas-banner-${companyId}`)
      setBannerUrl(stored || null)
    } catch {
      setBannerUrl(null)
    }
  }, [companyId])

  const handleBannerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !companyId) return
    if (!file.type.startsWith('image/')) { alert('Selecione um arquivo de imagem.'); return }
    if (file.size > 3 * 1024 * 1024) { alert('Arquivo muito grande. Máximo 3MB.'); return }
    setBannerUploading(true)
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      try {
        localStorage.setItem(`vendas-banner-${companyId}`, dataUrl)
        setBannerUrl(dataUrl)
      } catch (err: any) {
        alert('Erro ao salvar: ' + (err.message || 'localStorage cheio. Tente uma imagem menor.'))
      }
      setBannerUploading(false)
      if (bannerInputRef.current) bannerInputRef.current.value = ''
    }
    reader.onerror = () => {
      alert('Erro ao ler o arquivo.')
      setBannerUploading(false)
    }
    reader.readAsDataURL(file)
  }

  const removerBanner = () => {
    if (!companyId) return
    if (!confirm('Remover o banner?')) return
    try { localStorage.removeItem(`vendas-banner-${companyId}`) } catch {}
    setBannerUrl(null)
  }

  // ─── Close dropdowns on outside click ────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (clienteRef.current && !clienteRef.current.contains(e.target as Node)) {
        setClienteDropdownOpen(false)
      }
      if (headerFiltroRef.current && !headerFiltroRef.current.contains(e.target as Node)) {
        // não fecha se o clique foi no próprio botão âncora (toggle)
        const anchor = headerAnchorRef.current
        if (!anchor || !anchor.contains(e.target as Node)) {
          setHeaderFiltroAberto(null)
          setHeaderFiltroBusca('')
          setHeaderAnchor(null)
        }
      }
      if (dateDropdownRef.current && !dateDropdownRef.current.contains(e.target as Node)) {
        setDateDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ─── Reset do banner sempre que cliente/tipo mudar ───────────
  useEffect(() => {
    setBannerContratoDispensado(false)
  }, [formCpfCnpj, formClienteId, formTipo])

  // ─── Detecta contratos/pacotes em aberto do cliente ──────────
  // Roda quando o usuário escolhe tipo=contrato|pacote no modal Nova Venda
  // e tem cliente identificado (por CPF/CNPJ ou por nome). Não roda em
  // modo edição (já é a própria venda).
  useEffect(() => {
    if (!modalAberto || editandoVenda) { setContratosAbertosCliente([]); return }
    if (formTipo !== 'contrato' && formTipo !== 'pacote') { setContratosAbertosCliente([]); return }
    const doc = (formCpfCnpj || '').replace(/\D/g, '')
    const nome = (formCliente || '').trim()
    if ((!doc && nome.length < 3) || !companyId) { setContratosAbertosCliente([]); return }

    let cancelled = false
    setCarregandoContratosCliente(true)
    ;(async () => {
      try {
        // Match por CPF/CNPJ se disponível; caso contrário, por nome (ilike).
        // Status: aceita qualquer um exceto 'cancelado' (contratos antigos podem
        // ter status diferente de 'confirmado' a depender de como foram criados).
        let q = db
          .from('vendas')
          .select('id, cliente_nome, cliente_cpf_cnpj, tipo, procedimento, valor_total, data_venda, status, observacoes')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .in('tipo', ['contrato', 'pacote'])
          .neq('status', 'cancelado')
          .order('data_venda', { ascending: false })

        if (doc) {
          q = q.eq('cliente_cpf_cnpj', doc)
        } else {
          q = q.ilike('cliente_nome', `%${nome}%`)
        }

        const { data: vendasData, error: vendasErr } = await q
        if (vendasErr) throw vendasErr
        console.debug('[Vendas] detecta contratos:', { doc, nome, encontradas: vendasData?.length || 0 })
        if (!vendasData || vendasData.length === 0) {
          if (!cancelled) setContratosAbertosCliente([])
          return
        }

        const ids = vendasData.map((v: any) => v.id)
        const { data: crsData, error: crsErr } = await db
          .from('contas_receber')
          .select('venda_id, valor_pago')
          .in('venda_id', ids)
          .is('deleted_at', null)
        if (crsErr) throw crsErr

        const pagoPorVenda = new Map<string, number>()
        for (const cr of (crsData as any[]) || []) {
          const cur = pagoPorVenda.get(cr.venda_id) || 0
          pagoPorVenda.set(cr.venda_id, cur + parseFloat(cr.valor_pago || 0))
        }

        const lista: ContratoAbertoCliente[] = (vendasData as any[])
          .map(v => {
            const total = parseFloat(v.valor_total || 0)
            const pago = pagoPorVenda.get(v.id) || 0
            const saldo = Math.round((total - pago) * 100) / 100
            return {
              id: v.id,
              tipo: v.tipo as 'contrato' | 'pacote',
              procedimento: v.procedimento || v.observacoes || null,
              valor_total: total,
              total_pago: pago,
              saldo,
              data_venda: v.data_venda,
            }
          })
          .filter(c => c.saldo > 0.01)

        console.debug('[Vendas] contratos com saldo > 0:', lista.length, lista)
        if (!cancelled) setContratosAbertosCliente(lista)
      } catch (e) {
        console.error('[Vendas] erro ao detectar contratos abertos:', e)
        if (!cancelled) setContratosAbertosCliente([])
      } finally {
        if (!cancelled) setCarregandoContratosCliente(false)
      }
    })()

    return () => { cancelled = true }
  }, [modalAberto, editandoVenda, formTipo, formCpfCnpj, formCliente, companyId])

  // ─── Helpers ─────────────────────────────────────────────────
  function resetForm() {
    setFormTipo('servico')
    setFormClienteId(null)
    setFormCliente('')
    setFormCpfCnpj('')
    setClienteSearch('')
    setFormDataVenda(format(new Date(), 'yyyy-MM-dd'))
    setFormItens([{ descricao: '', quantidade: 1, valor_unitario: 0 }])
    setFormDescontoTipo('valor')
    setFormDesconto(0)
    setFormPagamentos([novoSplit()])
    setFormCentroCusto('')
    setErroModal(null)
    setContratosAbertosCliente([])
    setBannerContratoDispensado(false)
  }

  async function carregarVendaParaEdicao(venda: Venda) {
    resetForm()
    setEditandoVenda(venda)
    setFormTipo(venda.tipo)
    setFormCliente(venda.cliente_nome)
    setFormCpfCnpj(venda.cliente_cpf_cnpj || '')
    setClienteSearch(venda.cliente_nome)
    setFormDataVenda(venda.data_venda)

    if (venda.vendas_itens && venda.vendas_itens.length > 0) {
      setFormItens(venda.vendas_itens.map(it => {
        const prod = produtos.find(p => p.description.trim().toLowerCase() === it.descricao.trim().toLowerCase())
        return {
          descricao: it.descricao,
          quantidade: it.quantidade,
          valor_unitario: it.valor_unitario,
          produto_id: prod?.id,
          conta_contabil_id: prod?.conta_contabil_id ?? null,
        }
      }))
    }

    // Reconstrói os splits a partir dos CRs existentes da venda.
    // Agrupamos por (forma_recebimento + conta_bancaria_id): cada grupo representa
    // um "split" cujo valor é a soma das parcelas e cujo número de parcelas é o count.
    try {
      const { data: crs } = await db
        .from('contas_receber')
        .select('valor, forma_recebimento, conta_bancaria_id, data_vencimento')
        .eq('venda_id', venda.id)
        .is('deleted_at', null)
      const groups = new Map<string, { forma: string; conta: string; valor: number; parcelas: number; vencimento?: string }>()
      for (const cr of (crs as any[]) || []) {
        const forma = cr.forma_recebimento || venda.forma_pagamento || 'pix'
        const conta = cr.conta_bancaria_id || ''
        const key = `${forma}::${conta}`
        const g = groups.get(key) || { forma, conta, valor: 0, parcelas: 0 }
        g.valor += Number(cr.valor || 0)
        g.parcelas += 1
        // Preserva o vencimento original quando for split 'pendente' (single CR).
        if (forma === 'pendente' && cr.data_vencimento) g.vencimento = cr.data_vencimento
        groups.set(key, g)
      }
      if (groups.size > 0) {
        const splits = Array.from(groups.values()).map(g => ({
          ...novoSplit(),
          forma: g.forma,
          conta_bancaria_id: g.conta,
          valor: Math.round(g.valor * 100) / 100,
          parcelas: Math.max(1, g.parcelas),
          vencimento_pendente: g.vencimento || null,
        }))
        setFormPagamentos(splits)
      } else {
        // Sem CRs (caso raro): cria split inicial com forma da venda
        setFormPagamentos([{ ...novoSplit(), forma: venda.forma_pagamento || 'pix', valor: venda.valor_total || 0 }])
      }
    } catch (e) {
      console.error('[carregarVendaParaEdicao] erro ao reconstruir splits:', e)
      setFormPagamentos([{ ...novoSplit(), forma: venda.forma_pagamento || 'pix', valor: venda.valor_total || 0 }])
    }

    // Try to find matching client
    const matchedClient = clientes.find(c =>
      c.razao_social === venda.cliente_nome ||
      c.nome_fantasia === venda.cliente_nome ||
      (venda.cliente_cpf_cnpj && c.cpf_cnpj === venda.cliente_cpf_cnpj)
    )
    if (matchedClient) {
      setFormClienteId(matchedClient.id)
    }

    setModalDetalhes(null)
    setModalAberto(true)
  }

  function selectCliente(c: Cliente) {
    setFormClienteId(c.id)
    setFormCliente(c.nome_fantasia || c.razao_social)
    setFormCpfCnpj(c.cpf_cnpj || '')
    setClienteSearch(c.nome_fantasia || c.razao_social)
    setClienteDropdownOpen(false)
  }

  function selectProduto(idx: number, p: Produto) {
    setFormItens(prev => prev.map((it, i) =>
      i === idx ? { ...it, descricao: p.description, valor_unitario: p.price || 0, produto_id: p.id, conta_contabil_id: p.conta_contabil_id ?? null } : it
    ))
    setProdutoSearchTerm('')
  }

  async function abrirModalProduto(idx: number) {
    setModalProdutoIdx(idx)
    setProdutoSearchTerm('')
    setLoadingProdutos(true)
    try {
      // Mesma query que ProdutosDepartamentos.tsx (funciona no catálogo)
      const { data, error } = await activeClient
        .from('products')
        .select('*')
        .eq('company_id', selectedCompany?.id)
        .order('code')
      if (error) {
        console.error('[abrirModalProduto] error:', error)
      }
      const prods = ((data || []) as any[]).map((p: any) => ({
        id: p.id,
        code: p.code,
        description: p.description,
        price: p.price,
        unidade_medida: p.unidade_medida,
        conta_contabil_id: p.conta_contabil_id ?? null,
      })) as Produto[]
      console.log('[abrirModalProduto] Produtos:', prods.length, 'company:', selectedCompany?.id, 'isSecondary:', isUsingSecondary)
      setModalProdutos(prods)
    } catch (e: any) {
      console.error('[abrirModalProduto] Exception:', e)
    } finally {
      setLoadingProdutos(false)
    }
  }

  function addItem() {
    setFormItens(prev => [...prev, { descricao: '', quantidade: 1, valor_unitario: 0 }])
  }

  function removeItem(idx: number) {
    setFormItens(prev => prev.filter((_, i) => i !== idx))
  }

  function updateItem(idx: number, field: keyof NovoItem, value: string | number) {
    setFormItens(prev => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)))
  }

  function getCRStatus(venda: Venda) {
    const crs = venda.contas_receber || []
    if (crs.length === 0) return 'avista'
    const allPago = crs.every(c => c.status === 'pago')
    if (allPago) return 'pago'
    const naoPagos = crs.filter(c => c.status !== 'pago')
    const todosOperadora = naoPagos.length > 0 && naoPagos.every(c => {
      const f = c.forma_recebimento || venda.forma_pagamento
      return f === 'cartao_credito' || f === 'parcelado'
    })
    if (todosOperadora) return 'pago'
    const anyParcial = crs.some(c => c.status === 'parcial')
    if (anyParcial) return 'parcial'
    const hoje = new Date().toISOString().slice(0, 10)
    const algumVencido = naoPagos.some(c => c.data_vencimento && c.data_vencimento < hoje)
    return algumVencido ? 'aberto' : 'areceber'
  }

  function formatDoc(doc: string | null) {
    if (!doc) return '-'
    const clean = doc.replace(/\D/g, '')
    return clean.length <= 11 ? formatCPF(clean) : formatCNPJ(clean)
  }

  // ─── Exportação de vendas (respeita TODOS os filtros aplicados) ──────
  const STATUS_LABEL_EXPORT: Record<string, string> = {
    pago: 'Pago', aberto: 'Inadimplente', areceber: 'A receber', parcial: 'Parcial', avista: 'À vista',
  }

  // Monta a base de dados da exportação a partir de vendasFiltradas, na mesma
  // ordem/código exibidos na tela. Retorna valores ricos (valor numérico) pro
  // Excel e já formatados pra leitura no PDF.
  function montarLinhasExport() {
    return [...vendasFiltradas]
      .sort((a, b) => (vendaCodigoMap[a.id] || '').localeCompare(vendaCodigoMap[b.id] || ''))
      .map(v => {
        const itens = (v.vendas_itens || []).map(it => it.descricao).filter(Boolean).join('; ')
        return {
          codigo: vendaCodigoMap[v.id] || '',
          data: v.data_venda ? v.data_venda.split('-').reverse().join('/') : '',
          cliente: v.cliente_nome || '',
          documento: v.cliente_cpf_cnpj ? formatDoc(v.cliente_cpf_cnpj) : '',
          tipo: LABEL_TIPO[v.tipo] || v.tipo,
          itens,
          qtdItens: v.vendas_itens?.length || 0,
          forma: LABEL_FORMA[v.forma_pagamento] || v.forma_pagamento,
          valor: Number(v.valor_total || 0),
          status: STATUS_LABEL_EXPORT[getCRStatus(v)] || '',
        }
      })
  }

  const exportBaseName = () => {
    const emp = (selectedCompany?.nome_fantasia || selectedCompany?.razao_social || 'empresa')
    return `vendas-${emp}-${dateFrom}_a_${dateTo}`
  }

  function exportarVendasExcel() {
    setExportMenuOpen(false)
    const linhas = montarLinhasExport()
    if (linhas.length === 0) { alert('Nenhuma venda para exportar com os filtros atuais.'); return }
    const aoaData = linhas.map(l => ({
      'Código': l.codigo,
      'Data': l.data,
      'Cliente': l.cliente,
      'CPF/CNPJ': l.documento,
      'Tipo': l.tipo,
      'Itens': l.itens,
      'Qtd. Itens': l.qtdItens,
      'Forma de Pagamento': l.forma,
      'Valor Total': l.valor,
      'Situação': l.status,
    }))
    const totalGeral = linhas.reduce((s, l) => s + l.valor, 0)
    const ws = XLSX.utils.json_to_sheet(aoaData)
    // Linha de total ao final
    XLSX.utils.sheet_add_aoa(ws, [['', '', '', '', '', '', '', 'TOTAL', totalGeral, '']], { origin: -1 })
    ws['!cols'] = [
      { wch: 9 }, { wch: 12 }, { wch: 28 }, { wch: 20 }, { wch: 11 },
      { wch: 36 }, { wch: 10 }, { wch: 20 }, { wch: 15 }, { wch: 14 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Vendas')
    const safe = exportBaseName().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase()
    XLSX.writeFile(wb, `${safe}.xlsx`)
  }

  function exportarVendasPDF() {
    setExportMenuOpen(false)
    const linhas = montarLinhasExport()
    if (linhas.length === 0) { alert('Nenhuma venda para exportar com os filtros atuais.'); return }
    const periodo = `${dateFrom.split('-').reverse().join('/')} a ${dateTo.split('-').reverse().join('/')}`
    const blob = gerarRelatorioListaPDF({
      empresa_nome: selectedCompany?.nome_fantasia || selectedCompany?.razao_social || 'Empresa',
      empresa_razao_social: (selectedCompany as any)?.razao_social ?? null,
      empresa_cnpj: (selectedCompany as any)?.cnpj ?? null,
      empresa_local: [(selectedCompany as any)?.endereco_cidade, (selectedCompany as any)?.endereco_estado].filter(Boolean).join('/') || null,
      titulo: `VENDAS · ${periodo}`,
      orientacao: 'landscape',
      colunas: [
        { header: 'Código', flex: 8 },
        { header: 'Data', flex: 9, align: 'center' },
        { header: 'Cliente', flex: 20 },
        { header: 'Tipo', flex: 9, align: 'center' },
        { header: 'Itens', flex: 24 },
        { header: 'Qtd', flex: 5, align: 'center' },
        { header: 'Forma', flex: 12 },
        { header: 'Valor', flex: 11, align: 'right' },
        { header: 'Situação', flex: 10, align: 'center' },
      ],
      linhas: linhas.map(l => [
        l.codigo, l.data, l.cliente, l.tipo, l.itens || '—',
        String(l.qtdItens), l.forma, formatBRL(l.valor), l.status,
      ]),
    })
    downloadListaPDF(blob, exportBaseName())
  }

  // ─── Salvar novo cliente ───────────────────────────────────
  async function salvarNovoCliente() {
    if (!companyId || !novoClienteNome.trim()) return
    setSalvandoCliente(true)
    try {
      const { data, error: err } = await db.from('clients').insert({
        company_id: companyId,
        razao_social: toTitleCase(novoClienteNome.trim()),
        cpf_cnpj: novoClienteCpfCnpj.replace(/\D/g, '') || null,
        email: novoClienteEmail.trim() || null,
        is_active: true,
      }).select().single()

      if (err) throw err

      const novoCliente: Cliente = data
      setClientes(prev => [...prev, novoCliente])
      selectCliente(novoCliente)
      setModalNovoCliente(false)
      setNovoClienteNome('')
      setNovoClienteCpfCnpj('')
      setNovoClienteEmail('')
    } catch (e: any) {
      alert('Erro ao cadastrar cliente: ' + (e.message || ''))
    } finally {
      setSalvandoCliente(false)
    }
  }

  // ─── Import planilha ──────────────────────────────────────────
  async function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = '' // reset input

    setImportError(null)
    setImportResult(null)
    setImportRows([])
    setImportErros(0)
    setImportFile(file)

    try {
      const result = await parseVendasSpreadsheet(file)
      setImportRows(result.rows)
      setImportErros(result.totalErros)
      setModalImport(true)
    } catch (err: any) {
      setImportError(err.message || 'Erro ao processar planilha.')
      setModalImport(true)
    }
  }

  async function executarImportacao() {
    if (!companyId || !importContaBancaria) return

    const validRows = importRows.filter(r => r.erros.length === 0)
    setImportProgress({ current: 0, total: validRows.length })
    setImportando(true)
    setImportError(null)
    // Yield so React renders the progress bar before the loop starts
    await new Promise(r => setTimeout(r, 50))

    let ok = 0
    let fail = 0
    const BATCH_SIZE = 200

    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE)

      // 1. Insert all vendas of this batch at once
      const vendasPayload = batch.map(row => ({
        company_id: companyId,
        cliente_nome: toTitleCase(row.cliente_nome),
        cliente_cpf_cnpj: row.cliente_cpf_cnpj,
        tipo: row.tipo,
        valor_total: Math.max(0, row.valor_total - row.desconto),
        desconto: row.desconto,
        data_venda: row.data_venda,
        forma_pagamento: row.forma_pagamento,
        status: 'confirmado',
        observacoes: row.observacoes,
      }))

      const { data: vendasData, error: vendasErr } = await db
        .from('vendas')
        .insert(vendasPayload)
        .select('id')

      if (vendasErr || !vendasData) {
        console.error(`[importVenda] Batch ${i}-${i + batch.length}:`, vendasErr)
        fail += batch.length
        setImportProgress({ current: ok + fail, total: validRows.length })
        await new Promise(r => setTimeout(r, 0))
        continue
      }

      // 2. Build itens + contas_receber payloads
      const itensPayload = batch.map((row, idx) => ({
        venda_id: vendasData[idx].id,
        descricao: toTitleCase(row.descricao),
        quantidade: row.quantidade,
        valor_unitario: row.valor_unitario,
      }))

      const crsPayload: any[] = []
      batch.forEach((row, idx) => {
        const valorLiquido = Math.max(0, row.valor_total - row.desconto)
        const isParcelado = row.forma_pagamento === 'parcelado'
        const numParcelas = isParcelado ? row.parcelas : 1
        const valorParcela = Math.round((valorLiquido / numParcelas) * 100) / 100
        // Vendas à vista (pix, dinheiro, cartão débito) não parceladas são
        // quitadas no ato, espelhando o fluxo de salvarVenda() que chama
        // quitarCR na hora. Sem isso o regime de caixa do Painel Gerencial
        // fica zerado para tudo que foi importado por planilha.
        const isImmediatePayment = FORMAS_A_VISTA.includes(row.forma_pagamento) && !isParcelado

        // Tenta casar a descrição da planilha com um produto cadastrado para
        // pegar a conta contábil correta; cai no default só se não encontrar.
        const prodMatch = produtos.find(p =>
          p.description.trim().toLowerCase() === (row.descricao || '').trim().toLowerCase()
        )
        const contaCR = prodMatch?.conta_contabil_id ?? defaultReceitaContaId

        for (let p = 0; p < numParcelas; p++) {
          const vencimento = isParcelado
            ? format(addMonths(parseISO(row.data_venda), p + 1), 'yyyy-MM-dd')
            : row.data_venda
          const valor = p === numParcelas - 1
            ? valorLiquido - valorParcela * (numParcelas - 1)
            : valorParcela

          crsPayload.push({
            company_id: companyId,
            pagador_nome: toTitleCase(row.cliente_nome),
            pagador_cpf_cnpj: row.cliente_cpf_cnpj,
            valor,
            valor_pago: isImmediatePayment ? valor : 0,
            data_vencimento: vencimento,
            data_pagamento: isImmediatePayment ? row.data_venda : null,
            status: isImmediatePayment ? 'pago' : 'aberto',
            forma_recebimento: row.forma_pagamento,
            conta_contabil_id: contaCR,
            centro_custo_id: importCentroCusto || null,
            venda_id: vendasData[idx].id,
          })
        }
      })

      // 3. Insert itens + CRs in parallel (both depend on vendasData, not on each other)
      const [itensRes, crsRes] = await Promise.all([
        db.from('vendas_itens').insert(itensPayload),
        crsPayload.length > 0
          ? db
              .from('contas_receber')
              .insert(crsPayload)
              .select('id, valor_pago, data_pagamento, status, pagador_nome, conta_contabil_id')
          : Promise.resolve({ data: [] as any[], error: null }),
      ])
      if (itensRes.error) console.error('[importVenda] Itens batch error:', itensRes.error)
      if ((crsRes as any).error) console.error('[importVenda] CRs batch error:', (crsRes as any).error)

      // 4. Para os CRs já quitados no ato (vendas à vista), gerar a movimentação
      //    bancária de crédito correspondente — mesmo efeito colateral que
      //    quitarCR() produz no fluxo manual. Sem isso, a Caixa do painel
      //    fica correta mas o saldo bancário e a conciliação ficam defasados.
      const crsPagos = (((crsRes as any).data || []) as any[]).filter((cr) => cr.status === 'pago')
      if (crsPagos.length > 0) {
        const movsPayload = crsPagos.map((cr) => ({
          company_id: companyId,
          conta_bancaria_id: importContaBancaria,
          conta_contabil_id: cr.conta_contabil_id,
          tipo: 'credito',
          valor: cr.valor_pago,
          data: cr.data_pagamento,
          descricao: `Recebimento — ${cr.pagador_nome}`,
          origem: 'conta_receber',
          conta_receber_id: cr.id,
        }))
        const { error: movErr } = await db.from('movimentacoes').insert(movsPayload)
        if (movErr) console.error('[importVenda] Movimentacoes batch error:', movErr)
      }

      ok += batch.length
      setImportProgress({ current: ok + fail, total: validRows.length })
      // Yield to browser so progress bar repaints
      await new Promise(r => setTimeout(r, 0))
    }

    setImportResult({ ok, fail })
    setImportando(false)
    await fetchVendas()
  }

  function fecharModalImport() {
    setModalImport(false)
    setImportRows([])
    setImportErros(0)
    setImportError(null)
    setImportResult(null)
    setImportProgress({ current: 0, total: 0 })
    setImportContaBancaria('')
    setImportCentroCusto('')
    setImportFile(null)
  }

  function baixarModeloPlanilha() {
    const headers = ['cliente_nome', 'cliente_cpf_cnpj', 'descricao', 'quantidade', 'valor_unitario', 'desconto', 'data_venda', 'forma_pagamento', 'parcelas', 'tipo', 'observacoes']
    const exemplo = ['João Silva', '12345678900', 'Consultoria mensal', '1', '1500.00', '0', '01/04/2026', 'pix', '1', 'servico', '']
    const csv = [headers.join(';'), exemplo.join(';')].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'modelo_importacao_vendas.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // ─── Save venda ──────────────────────────────────────────────
  async function salvarVenda() {
    if (!companyId) return
    if (!formCliente.trim()) { setErroModal('Informe o cliente.'); return }
    if (formItens.length === 0 || formItens.some(it => !it.descricao.trim())) {
      setErroModal('Preencha a descrição de todos os itens.')
      return
    }
    if (totalVenda <= 0) { setErroModal('Valor total deve ser maior que zero.'); return }
    if (formPagamentos.length === 0) { setErroModal('Adicione ao menos uma forma de pagamento.'); return }
    // Saldo faltante vira automaticamente um split 'pendente' (CR aberta).
    // Excedente continua bloqueando — significa que a usuária errou um valor.
    let pagamentosBase = formPagamentos
    if (pendentePagamento > 0.01) {
      pagamentosBase = [...formPagamentos, { ...novoSplit(Math.round(pendentePagamento * 100) / 100), forma: 'pendente' }]
    } else if (pendentePagamento < -0.01) {
      setErroModal(`A soma das formas de pagamento (${formatBRL(totalPagamentos)}) excede o total da venda (${formatBRL(totalVenda)}) em ${formatBRL(Math.abs(pendentePagamento))}.`)
      return
    }
    // Auto-fill defensivo: garante que toda forma tem conta destino (padrão se não foi escolhida)
    const pagamentosResolvidos = pagamentosBase.map(p => ({
      ...p,
      conta_bancaria_id: p.conta_bancaria_id || pickContaPadrao(p.forma),
    }))
    for (const p of pagamentosResolvidos) {
      // 'pendente' = saldo em aberto sem destino bancário definido — não exige conta.
      if (!p.conta_bancaria_id && p.forma !== 'pendente') {
        setErroModal(isOwner
          ? 'Selecione a conta bancária para cada forma de pagamento.'
          : 'Nenhuma conta bancária cadastrada para esta forma. Peça ao administrador para cadastrar uma conta.')
        return
      }
      if (!p.valor || p.valor <= 0) { setErroModal('Cada forma de pagamento precisa ter valor maior que zero.'); return }
    }

    setSalvando(true)
    setErroModal(null)

    try {
      let vendaId: string
      const formaVenda = pagamentosResolvidos.length > 1 ? 'multiplo' : pagamentosResolvidos[0].forma

      // Conta contábil dominante: somar o subtotal de cada item por conta_contabil_id
      // (preferindo o produto explicitamente vinculado; caindo no match por descrição
      // quando o item não foi escolhido via modal de produtos). A conta com maior
      // subtotal classifica todos os CRs gerados para esta venda. Sem isso, todas
      // as parcelas herdam a primeira conta de receita analítica do plano e os
      // títulos saem rotulados como "Consultas Médicas" mesmo quando o produto
      // vendido foi outro (ex.: Transplante, Minoxidil).
      const totalPorConta = new Map<string, number>()
      for (const it of formItens) {
        let contaId = it.conta_contabil_id ?? null
        if (!contaId) {
          const prod = produtos.find(p =>
            (it.produto_id && p.id === it.produto_id) ||
            p.description.trim().toLowerCase() === it.descricao.trim().toLowerCase()
          )
          contaId = prod?.conta_contabil_id ?? null
        }
        if (!contaId) continue
        const subtotal = (it.quantidade || 0) * (it.valor_unitario || 0)
        totalPorConta.set(contaId, (totalPorConta.get(contaId) || 0) + subtotal)
      }
      let contaContabilCR: string | null = defaultReceitaContaId
      if (totalPorConta.size > 0) {
        let melhorConta: string | null = null
        let melhorValor = -1
        for (const [conta, soma] of totalPorConta) {
          if (soma > melhorValor) { melhorValor = soma; melhorConta = conta }
        }
        if (melhorConta) contaContabilCR = melhorConta
      }
      // Anti-FK violation 23503: se a conta escolhida vier de um produto com
      // referência órfã (plano de contas foi resetado/recriado), cai pro default
      // analítico válido — ou null se nem o default existir mais.
      if (contaContabilCR && validContaContabilIds.size > 0 && !validContaContabilIds.has(contaContabilCR)) {
        contaContabilCR = defaultReceitaContaId && validContaContabilIds.has(defaultReceitaContaId)
          ? defaultReceitaContaId
          : null
      }

      // ─── Anti-duplicata (heuristica, só pra venda nova): cliente+valor+data ───
      const clienteTrim = toTitleCase(formCliente.trim())
      const cpfLimpo = formCpfCnpj.replace(/\D/g, '') || null
      if (!editandoVenda) {
        let dupQuery = db
          .from('vendas')
          .select('id, valor_total, data_venda')
          .eq('company_id', companyId)
          .eq('valor_total', totalVenda)
          .eq('data_venda', formDataVenda)
          .limit(1)
        if (cpfLimpo) {
          dupQuery = dupQuery.eq('cliente_cpf_cnpj', cpfLimpo)
        } else {
          dupQuery = dupQuery.eq('cliente_nome', clienteTrim)
        }
        const dup = await dupQuery
        if (dup.data && dup.data.length > 0) {
          setSalvando(false)
          const ok = await confirm({
            title: 'Venda parecida encontrada',
            description: `Ja existe uma venda de "${clienteTrim}" no valor de ${formatBRL(totalVenda)} em ${format(parseISO(formDataVenda), 'dd/MM/yyyy')}. Deseja criar mesmo assim?`,
            confirmLabel: 'Criar mesmo assim',
            variant: 'destructive',
          })
          if (!ok) return
          setSalvando(true)
        }
      }

      // ─── Montar itens ───
      const itensPayload = formItens.map(it => ({
        descricao: toTitleCase(it.descricao.trim()),
        quantidade: it.quantidade,
        valor_unitario: it.valor_unitario,
      }))

      // ─── Montar CRs (todos os splits consolidados em UM array) ───
      // _gerar_mov: true sinaliza pra RPC criar movimentação bancária junto
      // (quita imediato — vendas à vista ou cartão 1x).
      const crsPayloadCompleto: any[] = []
      for (const split of pagamentosResolvidos) {
        const splitBruto = Math.round(split.valor * 100) / 100
        const taxaCfg = split.taxa
        const taxaPct = taxaCfg?.taxa_percentual || 0
        const valorTaxa = Math.round((splitBruto * taxaPct / 100) * 100) / 100
        const valorLiquido = Math.round((splitBruto - valorTaxa) * 100) / 100

        const isParcelado = split.forma === 'parcelado' || split.forma === 'cartao_credito'
        const numParcelas = isParcelado
          ? Math.min(split.parcelas || 1, taxaCfg?.max_parcelas || split.parcelas || 1)
          : 1
        const diasRecebimento = taxaCfg?.dias_recebimento || 0
        const temAntecipacao = taxaCfg?.antecipacao_ativa || false
        const taxaAntecipacao = taxaCfg?.taxa_antecipacao || 0
        const splitIsAVista = FORMAS_A_VISTA.includes(split.forma)
        const deveQuitar = (splitIsAVista && !isParcelado) || (isParcelado && numParcelas === 1)

        if (temAntecipacao && isParcelado && numParcelas > 1) {
          const prazoMedioMeses = (numParcelas + 1) / 2
          const descontoAntecipacao = Math.round((valorLiquido * taxaAntecipacao / 100 * prazoMedioMeses) * 100) / 100
          const valorAntecipado = Math.round((valorLiquido - descontoAntecipacao) * 100) / 100
          const dataRecebimento = format(addDays(parseISO(formDataVenda), diasRecebimento || 1), 'yyyy-MM-dd')

          crsPayloadCompleto.push({
            pagador_nome: clienteTrim,
            pagador_cpf_cnpj: cpfLimpo,
            valor: valorAntecipado,
            valor_pago: 0,
            data_vencimento: dataRecebimento,
            status: 'aberto',
            forma_recebimento: split.forma,
            conta_bancaria_id: split.conta_bancaria_id || null,
            conta_contabil_id: contaContabilCR,
            centro_custo_id: formCentroCusto || null,
            observacoes: `Venda ${numParcelas}x antecipada | Bruto: R$${splitBruto.toFixed(2)} | Taxa operadora: ${taxaPct}% (R$${valorTaxa.toFixed(2)}) | Antecipação: ${taxaAntecipacao}% a.m. (R$${descontoAntecipacao.toFixed(2)})`,
            _gerar_mov: false,
          })
        } else if (isParcelado && numParcelas > 1) {
          const valorParcelaLiq = Math.round((valorLiquido / numParcelas) * 100) / 100
          for (let i = 0; i < numParcelas; i++) {
            const dataBase = addMonths(parseISO(formDataVenda), i + 1)
            const dataRecebimento = diasRecebimento > 0
              ? format(addDays(dataBase, diasRecebimento), 'yyyy-MM-dd')
              : format(dataBase, 'yyyy-MM-dd')
            const valor = i === numParcelas - 1
              ? Math.round((valorLiquido - valorParcelaLiq * (numParcelas - 1)) * 100) / 100
              : valorParcelaLiq
            crsPayloadCompleto.push({
              pagador_nome: clienteTrim,
              pagador_cpf_cnpj: cpfLimpo,
              valor,
              valor_pago: 0,
              data_vencimento: dataRecebimento,
              status: 'aberto',
              forma_recebimento: split.forma,
              conta_bancaria_id: split.conta_bancaria_id || null,
              conta_contabil_id: contaContabilCR,
              centro_custo_id: formCentroCusto || null,
              observacoes: taxaPct > 0
                ? `Parcela ${i + 1}/${numParcelas} | Taxa operadora: ${taxaPct}%`
                : `Parcela ${i + 1}/${numParcelas}`,
              _gerar_mov: false,
            })
          }
        } else {
          const dataRecebimento = split.forma === 'pendente'
            ? (split.vencimento_pendente || format(addDays(parseISO(formDataVenda), 30), 'yyyy-MM-dd'))
            : diasRecebimento > 0
              ? format(addDays(parseISO(formDataVenda), diasRecebimento), 'yyyy-MM-dd')
              : formDataVenda
          crsPayloadCompleto.push({
            pagador_nome: clienteTrim,
            pagador_cpf_cnpj: cpfLimpo,
            valor: valorLiquido,
            valor_pago: deveQuitar ? valorLiquido : 0,
            data_vencimento: dataRecebimento,
            data_pagamento: deveQuitar ? formDataVenda : null,
            status: deveQuitar ? 'pago' : 'aberto',
            forma_recebimento: split.forma,
            conta_bancaria_id: split.conta_bancaria_id || null,
            conta_contabil_id: contaContabilCR,
            centro_custo_id: formCentroCusto || null,
            observacoes: split.forma === 'pendente'
              ? 'Saldo em aberto — forma a definir'
              : taxaPct > 0
                ? `Taxa operadora: ${taxaPct}% (R$${valorTaxa.toFixed(2)})`
                : null,
            _gerar_mov: deveQuitar && !!split.conta_bancaria_id,
          })
        }
      }

      // ─── Chamada RPC atômica (venda + itens + CRs + movs em UMA transação) ───
      const vendaPayload = {
        company_id: companyId,
        cliente_nome: clienteTrim,
        cliente_cpf_cnpj: cpfLimpo,
        tipo: formTipo,
        valor_total: totalVenda,
        data_venda: formDataVenda,
        forma_pagamento: formaVenda,
        status: 'confirmado',
      }

      const rpcName = editandoVenda ? 'atualizar_venda_atomica' : 'criar_venda_atomica'
      const rpcPayload: Record<string, any> = {
        venda: vendaPayload,
        itens: itensPayload,
        crs: crsPayloadCompleto,
      }
      if (editandoVenda) {
        rpcPayload.venda_id = editandoVenda.id
        rpcPayload.user_id = user?.id || null
      }

      // Timeout defensivo: se a RPC não voltar em 30s, libera o spinner com
      // erro descritivo em vez de deixar o botão girando indefinidamente.
      const rpcPromise = (db as any).rpc(rpcName, { p_payload: rpcPayload })
      const timeoutPromise = new Promise<{ data: null; error: Error }>((resolve) =>
        setTimeout(() => resolve({
          data: null,
          error: new Error('Sem resposta do servidor em 30s. Verifique a conexão e tente novamente. Se persistir, abra o console (F12) e copie o erro.'),
        }), 30000)
      )
      const { data: rpcResult, error: rpcErr } = await Promise.race([rpcPromise, timeoutPromise]) as any
      if (rpcErr) throw rpcErr
      if (!rpcResult?.success) throw new Error('Falha ao salvar venda (RPC retornou sem sucesso).')
      vendaId = rpcResult.venda_id

      // Captura dados da venda para oferecer envio via WhatsApp apos fechar o modal.
      // Skip se for edicao (so para venda nova) e se cliente nao foi identificado.
      const vendaCriada = !editandoVenda && formCliente.trim() ? {
        cliente_nome: toTitleCase(formCliente.trim()),
        cliente_cpf_cnpj: formCpfCnpj.trim() || null,
        valor_total: totalVenda,
        data_venda: formDataVenda,
        forma_pagamento: formaVenda,
        itens: formItens.map(it => ({ descricao: it.descricao, quantidade: it.quantidade })),
      } : null

      resetForm()
      setEditandoVenda(null)
      setModalAberto(false)
      await fetchVendas()

      if (vendaCriada) {
        // Busca celular + email do cliente em uma so query
        let phone = ''
        let email = ''
        try {
          let q = db.from('clients').select('celular,telefone,email').eq('company_id', companyId).limit(1)
          if (vendaCriada.cliente_cpf_cnpj) q = q.eq('cpf_cnpj', vendaCriada.cliente_cpf_cnpj)
          else q = q.ilike('razao_social', vendaCriada.cliente_nome)
          const { data } = await q
          phone = data?.[0]?.celular || data?.[0]?.telefone || ''
          email = data?.[0]?.email || ''
        } catch { /* ignore */ }

        const itensLabel = vendaCriada.itens.length === 1
          ? vendaCriada.itens[0].descricao
          : `${vendaCriada.itens[0].descricao} +${vendaCriada.itens.length - 1} item${vendaCriada.itens.length > 2 ? 's' : ''}`
        const dataFmt = format(parseISO(vendaCriada.data_venda), 'dd/MM/yyyy')

        const whatsText = [
          `Olá ${vendaCriada.cliente_nome}!`,
          ``,
          `Recebemos o pagamento da sua venda:`,
          ``,
          `*Valor:* ${formatBRL(vendaCriada.valor_total)}`,
          `*Data:* ${dataFmt}`,
          `*Forma:* ${vendaCriada.forma_pagamento}`,
          `*Referente a:* ${itensLabel}`,
          ``,
          `Obrigado pela preferência!`,
        ].join('\n')

        const emailCorpo = [
          `Olá ${vendaCriada.cliente_nome}!`,
          ``,
          `Recebemos o pagamento da sua venda:`,
          ``,
          `Valor: ${formatBRL(vendaCriada.valor_total)}`,
          `Data: ${dataFmt}`,
          `Forma: ${vendaCriada.forma_pagamento}`,
          `Referente a: ${itensLabel}`,
          ``,
          `Obrigado pela preferência!`,
        ].join('\n')

        setPosVenda({
          cliente: vendaCriada.cliente_nome,
          valor: vendaCriada.valor_total,
          phone,
          email,
          whatsText,
          emailAssunto: `Comprovante de venda — ${formatBRL(vendaCriada.valor_total)}`,
          emailCorpo,
          step: 'choose',
        })
      }
    } catch (e: any) {
      console.error('[salvarVenda]', e)
      setErroModal(e.message || 'Erro ao salvar venda.')
    } finally {
      setSalvando(false)
    }
  }

  // ─── Delete venda ────────────────────────────────────────────
  async function deletarVenda(id: string) {
    const ac = activeClient as any
    try {
      // 1. Buscar IDs dos CRs vinculados (precisa pra apagar movimentacoes/recibos)
      const { data: crs } = await ac
        .from('contas_receber')
        .select('id')
        .eq('venda_id', id)
      const crIds = (crs || []).map((r: any) => r.id)

      // 2. Apagar movimentacoes bancarias vinculadas (estorno do recebimento)
      //    Movimentacoes sao hard-delete (sem trigger).
      if (crIds.length > 0) {
        await ac.from('movimentacoes').delete().in('conta_receber_id', crIds)
      }

      // 3. Soft-delete dos CRs (UPDATE deleted_at).
      //    O trigger bloquear_edicao_pago LIBERA esse update mesmo pra CR pago.
      const nowIso = new Date().toISOString()
      const { error: errSoft } = await ac
        .from('contas_receber')
        .update({ deleted_at: nowIso, deleted_by: user?.id || null })
        .eq('venda_id', id)
        .is('deleted_at', null)
      if (errSoft) throw errSoft

      // 4. Hard-delete dos CRs. O trigger forcar_soft_delete agora permite
      //    porque deleted_at NOT NULL.
      const { error: errHard } = await ac
        .from('contas_receber')
        .delete()
        .eq('venda_id', id)
      if (errHard) throw errHard

      // 5. Deletar itens (vendas_itens.venda_id ON DELETE CASCADE, mas explicito)
      await ac.from('vendas_itens').delete().eq('venda_id', id)

      // 6. Deletar a venda
      const { error: err } = await ac.from('vendas').delete().eq('id', id)
      if (err) throw err

      setConfirmDelete(null)
      await fetchVendas()
    } catch (e: any) {
      console.error('[deletarVenda]', e)
      alert('Erro ao excluir: ' + (e.message || 'Tente novamente'))
    }
  }

  // ─── Delete todas as vendas do mês (em lote) ────────────────
  // contas_receber tem trigger que bloqueia DELETE direto (força soft delete)
  // vendas_itens tem ON DELETE CASCADE, então basta deletar a venda
  // Processa em chunks porque `.in()` com centenas de UUIDs estoura o limite de URL do PostgREST (HTTP 400)
  async function deletarVendasDoMes() {
    const ac = activeClient as any
    if (!companyId) return
    setDeletandoMes(true)
    try {
      const inicio = dateFrom
      const fim = dateTo

      const { data: vendasMes, error: errSel } = await ac
        .from('vendas')
        .select('id')
        .eq('company_id', companyId)
        .gte('data_venda', inicio)
        .lte('data_venda', fim)

      if (errSel) throw errSel
      const ids = (vendasMes || []).map((v: { id: string }) => v.id)

      if (ids.length === 0) {
        setConfirmDeleteMes(false)
        return
      }

      const CHUNK = 100
      const nowIso = new Date().toISOString()

      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK)

        // 1. Buscar IDs dos CRs do chunk pra apagar movimentacoes
        const { data: crs } = await ac
          .from('contas_receber')
          .select('id')
          .in('venda_id', slice)
        const crIds = (crs || []).map((r: any) => r.id)

        // 2. Apagar movimentacoes vinculadas (estorno)
        if (crIds.length > 0) {
          await ac.from('movimentacoes').delete().in('conta_receber_id', crIds)
        }

        // 3. Soft-delete CRs (libera o trigger)
        const { error: errCR } = await ac
          .from('contas_receber')
          .update({ deleted_at: nowIso, deleted_by: user?.id || null })
          .in('venda_id', slice)
          .is('deleted_at', null)
        if (errCR) throw errCR

        // 4. Hard-delete CRs (agora permitido)
        const { error: errCRHard } = await ac
          .from('contas_receber')
          .delete()
          .in('venda_id', slice)
        if (errCRHard) throw errCRHard

        // 5. Hard-delete vendas (itens cascateiam)
        const { error: errVendas } = await ac.from('vendas').delete().in('id', slice)
        if (errVendas) throw errVendas
      }

      setConfirmDeleteMes(false)
      await fetchVendas()
    } catch (e: any) {
      console.error('[deletarVendasDoMes]', e)
      alert('Erro ao excluir vendas do mês: ' + (e.message || 'Tente novamente'))
    } finally {
      setDeletandoMes(false)
    }
  }

  // ─── Render helpers ──────────────────────────────────────────
  function CRBadge({ venda }: { venda: Venda }) {
    const st = getCRStatus(venda)
    const styles: Record<string, string> = {
      pago: 'text-[#039855] bg-[#ECFDF3] border border-[#039855]',
      aberto: 'text-[#B91C1C] bg-[#FEE2E2] border border-[#B91C1C]',
      areceber: 'text-[#1D4ED8] bg-[#ECFDF4] border border-[#1D4ED8]',
      parcial: 'text-[#EA580C] bg-[#FFF0EB] border border-[#EA580C]',
      avista: 'text-[#555] bg-[#F6F2EB] border border-[#ccc]',
    }
    const labels: Record<string, string> = {
      pago: 'Pago', aberto: 'Inadimplente', areceber: 'A receber', parcial: 'CR — parcial', avista: 'À vista',
    }
    return (
      <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${styles[st]}`}>
        {labels[st]}
      </span>
    )
  }

  function TipoBadge({ tipo }: { tipo: string }) {
    return (
      <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold text-[#555] bg-[#F6F2EB] border border-[#ccc]">
        {LABEL_TIPO[tipo] || tipo}
      </span>
    )
  }

  /* ================================================================
     RENDER
     ================================================================ */
  return (
    <AppLayout title="Vendas">
      <div className="max-w-[1400px] mx-auto pt-3">
        {/* ─── Banner customizado (upload de imagem por empresa) ── */}
        <div className="relative h-[140px] rounded-xl overflow-hidden border border-[#EAECF0] bg-white group">
          {bannerUrl ? (
            <>
              <img
                src={bannerUrl}
                alt="Banner"
                className="w-full h-full object-cover"
              />
              <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => bannerInputRef.current?.click()}
                  disabled={bannerUploading}
                  className="h-7 px-2.5 text-[11px] font-semibold text-[#1D2939] bg-white/95 backdrop-blur border border-[#D0D5DD] rounded hover:bg-white shadow-sm flex items-center gap-1"
                >
                  <Upload size={11} /> Trocar
                </button>
                <button
                  type="button"
                  onClick={removerBanner}
                  className="h-7 w-7 text-[#E53E3E] bg-white/95 backdrop-blur border border-[#D0D5DD] rounded hover:bg-white shadow-sm flex items-center justify-center"
                  title="Remover banner"
                >
                  <X size={13} />
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => bannerInputRef.current?.click()}
              disabled={bannerUploading}
              className="w-full h-full flex flex-col items-center justify-center gap-2 text-[#667085] hover:text-[#1D2939] hover:bg-[#F6F2EB] transition-colors"
            >
              {bannerUploading ? (
                <>
                  <Loader2 size={22} className="animate-spin" />
                  <span className="text-[12px] font-medium">Enviando…</span>
                </>
              ) : (
                <>
                  <Upload size={22} />
                  <span className="text-[13px] font-semibold">Clique para enviar um banner</span>
                  <span className="text-[11px] text-[#98A2B3]">PNG, JPG ou WebP — até 3MB</span>
                </>
              )}
            </button>
          )}
          <input
            ref={bannerInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            className="hidden"
            onChange={handleBannerUpload}
          />
        </div>
      </div>

      <PagePanel title="Vendas" subtitle="Registre vendas e acompanhe recebimentos">
      <div className="max-w-[1400px] mx-auto space-y-5">

        {/* ─── Filtro de data (suspenso, canto superior à direita) ── */}
        <div className="flex justify-end -mt-2">
          <div className="relative" ref={dateDropdownRef}>
            <button
              type="button"
              onClick={() => {
                if (!dateDropdownOpen) {
                  setTempDateFrom(dateFrom)
                  setTempDateTo(dateTo)
                }
                setDateDropdownOpen(o => !o)
              }}
              className="flex items-center gap-2 h-8 px-3 text-[12px] font-semibold text-[#1D2939] bg-white border border-[#D0D5DD] rounded-md hover:bg-[#F9FAFB] transition-colors shadow-sm"
            >
              <Calendar size={13} className="text-[#667085]" />
              <span>{formatData(dateFrom)} — {formatData(dateTo)}</span>
              <ChevronDown size={13} className={`text-[#667085] transition-transform ${dateDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {dateDropdownOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-[#EAECF0] rounded-lg shadow-lg p-3 w-[280px]">
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    setDateFrom(tempDateFrom)
                    setDateTo(tempDateTo)
                    setDateDropdownOpen(false)
                  }}
                  className="space-y-2"
                >
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[#98A2B3] mb-1 block">Data Inicial</label>
                    <input
                      type="date"
                      value={tempDateFrom}
                      onChange={e => setTempDateFrom(e.target.value)}
                      className="w-full px-2 h-8 text-[12px] border border-[#D0D5DD] rounded bg-white text-[#1D2939] focus:outline-none focus:border-[#039855]"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[#98A2B3] mb-1 block">Data Final</label>
                    <input
                      type="date"
                      value={tempDateTo}
                      onChange={e => setTempDateTo(e.target.value)}
                      className="w-full px-2 h-8 text-[12px] border border-[#D0D5DD] rounded bg-white text-[#1D2939] focus:outline-none focus:border-[#039855]"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full h-8 text-[12px] font-semibold text-white bg-[#039855] rounded hover:bg-[#027A47] transition-colors flex items-center justify-center gap-2"
                  >
                    <Search size={12} /> Pesquisar
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>

        {/* ─── Filtros (compactos, uma linha) ─────────────────── */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Search */}
          <div className="relative flex-1 min-w-[160px] max-w-[220px]">
            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#98A2B3]" />
            <input
              type="text"
              placeholder="Buscar cliente..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-7 pr-2 h-7 text-[11.5px] border border-[#D0D5DD] rounded bg-white text-black placeholder-[#98A2B3] focus:outline-none focus:border-black"
            />
          </div>
          {/* Tipo */}
          <select
            value={filtroTipo}
            onChange={e => setFiltroTipo(e.target.value)}
            className="px-2 h-7 text-[11.5px] border border-[#D0D5DD] rounded bg-white text-black focus:outline-none focus:border-black"
          >
            <option value="">Todos os tipos</option>
            {TIPOS_VENDA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          {/* Forma */}
          <select
            value={filtroForma}
            onChange={e => setFiltroForma(e.target.value)}
            className="px-2 h-7 text-[11.5px] border border-[#D0D5DD] rounded bg-white text-black focus:outline-none focus:border-black"
          >
            <option value="">Todas as formas</option>
            {FORMAS_PAGAMENTO.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            <option value="multiplo">Múltiplo</option>
          </select>
          {/* Chips de filtros ativos por clique na celula */}
          {filtroCliente && (
            <button
              onClick={() => setFiltroCliente('')}
              className="inline-flex items-center gap-1 px-2 h-7 text-[11px] font-semibold text-[#1D2939] bg-[#ECFDF4] border border-[#059669] rounded hover:bg-[#ECFDF3]"
              title="Remover filtro"
            >
              Cliente: <span className="font-normal truncate max-w-[120px]">{filtroCliente}</span>
              <X size={11} />
            </button>
          )}
          {filtroCR && (
            <button
              onClick={() => setFiltroCR('')}
              className="inline-flex items-center gap-1 px-2 h-7 text-[11px] font-semibold text-[#1D2939] bg-[#ECFDF4] border border-[#059669] rounded hover:bg-[#ECFDF3]"
              title="Remover filtro"
            >
              CR: <span className="font-normal">{filtroCR === 'pago' ? 'Pago' : filtroCR === 'aberto' ? 'Inadimplente' : filtroCR === 'areceber' ? 'A receber' : filtroCR === 'parcial' ? 'Parcial' : 'À vista'}</span>
              <X size={11} />
            </button>
          )}
          {/* Limpar */}
          {(searchTerm || filtroTipo || filtroForma || filtroCR || filtroCliente || filtroCodigo || filtroData || filtroProduto || filtroItens !== '' || filtroValorMin !== '' || filtroValorMax !== '') && (
            <button
              onClick={() => {
                setSearchTerm(''); setFiltroTipo(''); setFiltroForma(''); setFiltroCR(''); setFiltroCliente('')
                setFiltroCodigo(''); setFiltroData(''); setFiltroProduto('')
                setFiltroItens(''); setFiltroValorMin(''); setFiltroValorMax('')
              }}
              className="text-[11px] font-semibold text-[#667085] hover:text-black px-1.5 h-7"
            >
              Limpar
            </button>
          )}
          <div className="flex-1" />
          {/* Ações */}
          <button
            onClick={() => { setModalImport(true); setImportRows([]); setImportError(null); setImportResult(null); setImportFile(null) }}
            className="flex items-center gap-1 px-2.5 h-7 text-[11.5px] font-semibold text-black bg-white border border-[#D0D5DD] rounded hover:bg-[#F6F2EB] transition-colors"
          >
            <Upload size={11} /> Importar
          </button>
          {/* Exportar (Excel / PDF) — respeita os filtros aplicados */}
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setExportMenuOpen(o => !o)}
              className="flex items-center gap-1 px-2.5 h-7 text-[11.5px] font-semibold text-black bg-white border border-[#D0D5DD] rounded hover:bg-[#F6F2EB] transition-colors"
              title="Exportar vendas filtradas"
            >
              <Download size={11} /> Exportar
              <ChevronDown size={11} className={`transition-transform ${exportMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {exportMenuOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 w-44 bg-white border border-[#D0D5DD] rounded-md shadow-lg overflow-hidden">
                <div className="px-3 py-1.5 text-[11px] font-semibold text-[#98A2B3] uppercase tracking-wide border-b border-[#F1F3F5]">
                  {vendasFiltradas.length} {vendasFiltradas.length === 1 ? 'venda' : 'vendas'}
                </div>
                <button
                  onClick={exportarVendasExcel}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[12px] font-medium text-[#1D2939] hover:bg-[#ECFDF4] transition-colors"
                >
                  <FileSpreadsheet size={14} className="text-[#039855]" /> Excel (.xlsx)
                </button>
                <button
                  onClick={exportarVendasPDF}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[12px] font-medium text-[#1D2939] hover:bg-[#FEF3F2] transition-colors border-t border-[#F1F3F5]"
                >
                  <FileText size={14} className="text-[#D92D20]" /> PDF
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => { resetForm(); setEditandoVenda(null); setModalAberto(true) }}
            className="flex items-center gap-2 px-5 h-10 text-[13.5px] font-bold text-white bg-[#039855] rounded-md hover:bg-[#027A47] active:scale-[0.98] transition-all shadow-md hover:shadow-lg"
          >
            <Plus size={17} strokeWidth={2.5} /> Nova Venda
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFileImport}
          />
        </div>

        {/* ─── KPIs (esquerda) + Tabela (direita - alinhada a A vista..A prazo) ─ */}
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] lg:grid-rows-4 gap-3">
          {[
            {
              label: 'Faturamento',
              value: formatBRL(kpis.total),
              sub: `${kpis.count} venda${kpis.count !== 1 ? 's' : ''} no período`,
              valueColor: '#039855',
              row: 'lg:row-start-1',
            },
            {
              label: 'Ticket Médio',
              value: formatBRL(kpis.ticket),
              sub: 'média por venda',
              valueColor: '#1D2939',
              row: 'lg:row-start-2',
            },
            {
              label: 'À vista',
              value: formatBRL(kpis.aVista),
              sub: kpis.total > 0 ? `${((kpis.aVista / kpis.total) * 100).toFixed(1)}% do faturamento` : '—',
              valueColor: '#039855',
              row: 'lg:row-start-3',
            },
            {
              label: 'A prazo',
              value: formatBRL(kpis.aPrazo),
              sub: kpis.total > 0 ? `${((kpis.aPrazo / kpis.total) * 100).toFixed(1)}% do faturamento` : '—',
              valueColor: '#D97706',
              row: 'lg:row-start-4',
            },
          ].map(k => (
            <div
              key={k.label}
              className={`bg-white border border-[#EAECF0] rounded-xl px-5 py-5 flex flex-col justify-between gap-3 shadow-sm lg:col-start-1 ${k.row}`}
            >
              <p
                className="font-bold text-black m-0"
                style={{ fontSize: 22, letterSpacing: '-0.015em', lineHeight: 1.15 }}
              >
                {k.label}
              </p>
              <p
                className="font-extrabold truncate"
                style={{ fontSize: 34, color: k.valueColor, letterSpacing: '-0.03em', lineHeight: 1 }}
              >
                {k.value}
              </p>
              <p className="text-[13px] text-[#667085] m-0 truncate">{k.sub}</p>
            </div>
          ))}
        {/* Top 10 produtos mais vendidos — ocupa col 2 / rows 1-2 (acima da tabela) */}
        <div
          className="border border-[#EAECF0] rounded-xl overflow-hidden lg:col-start-2 lg:row-start-1 lg:row-span-2 shadow-sm flex flex-col min-h-0"
          style={{ backgroundColor: '#FBF8F1', boxShadow: '0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)' }}
        >
          <div className="px-5 py-4 flex items-baseline justify-between flex-shrink-0" style={{ backgroundColor: '#071D41' }}>
            <h3 className="font-extrabold text-white m-0" style={{ fontSize: 16, letterSpacing: '-0.015em', lineHeight: 1.15 }}>
              Top 10 produtos mais vendidos
            </h3>
            <span className="text-[13px] text-white/70 font-medium">Por faturamento</span>
          </div>
          <div className="px-5 pt-3 pb-3 flex-1 flex flex-col min-h-0">
          {produtosRanking.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-[12px] text-[#98A2B3]">
              Nenhum produto vendido no período
            </div>
          ) : (
            <div className="flex-1 min-h-0 relative">
            <div className="absolute inset-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={produtosRanking}
                margin={{ top: 28, right: 12, left: 0, bottom: 4 }}
              >
                <CartesianGrid vertical={false} stroke="#E4DDCD" strokeDasharray="3 3" />
                <XAxis
                  dataKey="descricao"
                  interval={0}
                  tick={(props: any) => {
                    const { x, y, payload } = props
                    const txt = String(payload.value || '')
                    const item = produtosRanking.find(p => p.descricao === txt)
                    const qtd = item ? item.quantidade : 0
                    const maxPerLine = 14
                    // Quebra por palavras, acumulando ate maxPerLine chars
                    const words = txt.split(/\s+/)
                    const lines: string[] = []
                    let cur = ''
                    for (const w of words) {
                      if (!cur) { cur = w }
                      else if ((cur + ' ' + w).length <= maxPerLine) { cur = cur + ' ' + w }
                      else { lines.push(cur); cur = w }
                    }
                    if (cur) lines.push(cur)
                    // Se alguma linha for muito longa (palavra unica), forca quebra dura
                    const out: string[] = []
                    lines.forEach(l => {
                      if (l.length <= maxPerLine) out.push(l)
                      else {
                        for (let i = 0; i < l.length; i += maxPerLine) {
                          out.push(l.slice(i, i + maxPerLine))
                        }
                      }
                    })
                    // Max 2 linhas pra caber em 36px de altura do eixo (+ qtd na 3a)
                    const visible = out.slice(0, 2)
                    if (out.length > 2 && visible[1]) {
                      visible[1] = visible[1].slice(0, maxPerLine - 1) + '…'
                    }
                    // Quantidade sempre na mesma altura (abaixo de 2 linhas de nome),
                    // independente do nome ter 1 ou 2 linhas — mantém a linha "un" alinhada
                    const qtdY = y + 13 + 2 * 13 + 5
                    return (
                      <g>
                        {visible.map((line, i) => (
                          <text
                            key={i}
                            x={x} y={y + 13 + i * 13}
                            textAnchor="middle"
                            fontSize={12}
                            fontWeight={500}
                            fill="#1D2939"
                          >
                            {line}
                          </text>
                        ))}
                        <text
                          x={x} y={qtdY}
                          textAnchor="middle"
                          fontSize={12}
                          fontWeight={700}
                          fill="#039855"
                        >
                          {qtd} un
                        </text>
                      </g>
                    )
                  }}
                  axisLine={{ stroke: '#1D2939', strokeWidth: 1 }}
                  tickLine={false}
                  height={48}
                />
                <YAxis type="number" hide domain={[0, (dataMax: number) => dataMax * 1.18]} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1D2939', color: '#fff', borderRadius: 8, border: 'none', padding: '8px 14px', fontSize: 12 }}
                  itemStyle={{ color: '#fff' }}
                  labelStyle={{ color: '#fff', fontWeight: 600 }}
                  formatter={(v: number, _n: string, entry: any) => [
                    `${formatBRL(v)} · ${entry.payload.quantidade} un`,
                    'Faturamento',
                  ]}
                  cursor={{ fill: 'rgba(3, 152, 85, 0.08)' }}
                />
                <Bar dataKey="total" fill="#039855" radius={[4, 4, 0, 0]} maxBarSize={42}>
                  <LabelList
                    dataKey="total"
                    position="top"
                    fontSize={12}
                    fontWeight={600}
                    fill="#1D2939"
                    formatter={(v: number) => formatBRL(v)}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </div>
            </div>
          )}
          </div>
        </div>
        <div className="bg-white border border-[#EAECF0] rounded-xl overflow-hidden min-w-0 lg:col-start-2 lg:row-start-3 lg:row-span-2 flex flex-col" style={{ boxShadow: '0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)' }}>
          {/* Cabecalho do container — titulo */}
          <div className="px-5 py-4 flex items-baseline justify-between flex-shrink-0" style={{ backgroundColor: '#071D41' }}>
            <h3 className="font-extrabold text-white m-0" style={{ fontSize: 16, letterSpacing: '-0.015em', lineHeight: 1.15 }}>
              Vendas
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-white/70 font-medium">
                {vendasFiltradas.length} registro{vendasFiltradas.length !== 1 ? 's' : ''}
              </span>
              <div className="relative self-center">
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
                      {Object.entries(COL_LABELS).map(([k, label]) => (
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
            </div>
          </div>
          <div className="bg-white overflow-x-auto flex-1 min-h-0">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-[#555]">
                <Loader2 size={20} className="animate-spin mr-2" /> Carregando...
              </div>
            ) : error ? (
              <div className="flex items-center justify-center py-12 text-[#E53E3E]">
                <AlertCircle size={16} className="mr-2" /> {error}
              </div>
            ) : vendasFiltradas.length === 0 ? (
              vendas.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4">
                  <div className="w-14 h-14 rounded-2xl bg-[#ECFDF4] flex items-center justify-center mb-4">
                    <ShoppingCart className="h-6 w-6 text-[#059669]" />
                  </div>
                  <p className="text-[15px] font-bold text-[#1D2939] mb-1.5">Nenhuma venda lançada ainda</p>
                  <p className="text-[13px] text-[#667085] text-center max-w-md mb-5 leading-relaxed">
                    Lance sua primeira venda. O sistema cuida do resto: gera conta a receber se for a prazo, atualiza o estoque
                    se for produto cadastrado, e registra a movimentação no caixa.
                  </p>
                  <button
                    onClick={() => { resetForm(); setEditandoVenda(null); setModalAberto(true) }}
                    className="flex items-center gap-2 px-5 h-10 text-[13.5px] font-bold text-white bg-[#039855] rounded-md hover:bg-[#027A47] transition-colors"
                  >
                    <Plus size={17} strokeWidth={2.5} /> Lançar primeira venda
                  </button>
                </div>
              ) : (
                <div className="text-center py-12 text-[#555] text-sm">Nenhuma venda encontrada com os filtros aplicados.</div>
              )
            ) : (
              <table className="text-sm" style={{ tableLayout: 'fixed', width: visibleVendasCols.reduce((a, k) => a + (colWidths[k] ?? COL_WIDTHS_DEFAULT[k]), 0), minWidth: '100%' }}>
                <colgroup>
                  {VENDAS_COL_ORDER.map(k => (
                    <col key={k} className={isColVisible(k) ? '' : 'hidden'} style={{ width: colWidths[k] ?? COL_WIDTHS_DEFAULT[k] }} />
                  ))}
                </colgroup>
                <thead>
                  <tr className="bg-white text-[15px] font-bold text-black uppercase tracking-wider border-b-2 border-[#D0D5DD] whitespace-nowrap">
                    <th className={`text-left px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('codigo') ? '' : 'hidden'}`}>
                      <span onMouseDown={startResize('codigo')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                      <button
                        onClick={toggleHeaderFiltro('codigo')}
                        className={`inline-flex items-center gap-1 ${filtroCodigo ? 'text-[#059669]' : 'text-black'} hover:text-[#059669]`}
                      >
                        Código
                        {filtroCodigo && <span className="w-1.5 h-1.5 rounded-full bg-[#059669]" />}
                        <ChevronDown size={15} />
                      </button>
                      {headerFiltroAberto === 'codigo' && (
                        <HeaderFilterDropdown anchor={headerAnchor} align="left" width={180} innerRef={headerFiltroRef} className="p-2">
                          <input
                            type="text"
                            value={filtroCodigo}
                            onChange={e => setFiltroCodigo(e.target.value)}
                            placeholder="Ex: V-0021"
                            autoFocus
                            className="w-full px-2 py-1 text-xs border border-[#D0D5DD] rounded focus:outline-none focus:border-[#059669]"
                          />
                          <button
                            onClick={() => { setFiltroCodigo(''); setHeaderFiltroAberto(null); setHeaderAnchor(null) }}
                            className="mt-2 text-[11px] text-[#667085] hover:text-black"
                          >
                            Limpar
                          </button>
                        </HeaderFilterDropdown>
                      )}
                    </th>
                    <th className={`text-center px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('data') ? '' : 'hidden'}`}>
                      <span onMouseDown={startResize('data')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                      <button
                        onClick={toggleHeaderFiltro('data')}
                        className={`inline-flex items-center gap-1 ${filtroData ? 'text-[#059669]' : 'text-black'} hover:text-[#059669]`}
                      >
                        Data
                        {filtroData && <span className="w-1.5 h-1.5 rounded-full bg-[#059669]" />}
                        <ChevronDown size={15} />
                      </button>
                      {headerFiltroAberto === 'data' && (
                        <HeaderFilterDropdown anchor={headerAnchor} align="left" width={160} innerRef={headerFiltroRef} className="max-h-[240px] overflow-y-auto">
                          <button
                            onClick={() => { setFiltroData(''); setHeaderFiltroAberto(null); setHeaderAnchor(null) }}
                            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[#F6F2EB] ${!filtroData ? 'bg-[#ECFDF4] text-[#059669] font-semibold' : 'text-[#1D2939]'}`}
                          >
                            Todas
                          </button>
                          {datasUnicas.map(([d, count]) => (
                            <button
                              key={d}
                              onClick={() => { setFiltroData(d); setHeaderFiltroAberto(null); setHeaderAnchor(null) }}
                              className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs hover:bg-[#F6F2EB] ${filtroData === d ? 'bg-[#ECFDF4] text-[#059669] font-semibold' : 'text-[#1D2939]'}`}
                            >
                              <span className="text-left">{d.slice(5, 10).split('-').reverse().join('/')}/{d.slice(2, 4)}</span>
                              <span className="text-[11px] text-[#98A2B3] font-normal">{count}</span>
                            </button>
                          ))}
                        </HeaderFilterDropdown>
                      )}
                    </th>
                    <th className={`text-left px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('cliente') ? '' : 'hidden'}`}>
                      <span onMouseDown={startResize('cliente')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                      <button
                        onClick={(e) => { setHeaderFiltroBusca(''); toggleHeaderFiltro('cliente')(e) }}
                        className={`inline-flex items-center gap-1 ${filtroCliente ? 'text-[#059669]' : 'text-black'} hover:text-[#059669]`}
                      >
                        Cliente
                        {filtroCliente && <span className="w-1.5 h-1.5 rounded-full bg-[#059669]" />}
                        <ChevronDown size={15} />
                      </button>
                      {headerFiltroAberto === 'cliente' && (
                        <HeaderFilterDropdown anchor={headerAnchor} align="left" width={260} innerRef={headerFiltroRef}>
                          <div className="p-2 border-b border-[#EAECF0]">
                            <input
                              type="text"
                              value={headerFiltroBusca}
                              onChange={e => setHeaderFiltroBusca(e.target.value)}
                              placeholder="Buscar cliente..."
                              autoFocus
                              className="w-full px-2 py-1 text-xs border border-[#D0D5DD] rounded focus:outline-none focus:border-[#059669]"
                            />
                          </div>
                          <div className="max-h-[240px] overflow-y-auto">
                            <button
                              onClick={() => { setFiltroCliente(''); setHeaderFiltroAberto(null); setHeaderFiltroBusca(''); setHeaderAnchor(null) }}
                              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[#F6F2EB] ${!filtroCliente ? 'bg-[#ECFDF4] text-[#059669] font-semibold' : 'text-[#1D2939]'}`}
                            >
                              Todos
                            </button>
                            {clientesUnicos
                              .filter(([c]) => !headerFiltroBusca || c.toLowerCase().includes(headerFiltroBusca.toLowerCase()))
                              .map(([c, count]) => (
                                <button
                                  key={c}
                                  onClick={() => { setFiltroCliente(c); setHeaderFiltroAberto(null); setHeaderFiltroBusca(''); setHeaderAnchor(null) }}
                                  className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs hover:bg-[#F6F2EB] ${filtroCliente === c ? 'bg-[#ECFDF4] text-[#059669] font-semibold' : 'text-[#1D2939]'}`}
                                  title={c}
                                >
                                  <span className="truncate flex-1 text-left">{c}</span>
                                  <span className="text-[11px] text-[#98A2B3] font-normal">{count}</span>
                                </button>
                              ))}
                          </div>
                        </HeaderFilterDropdown>
                      )}
                    </th>
                    <th className={`text-left px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('produto') ? '' : 'hidden'}`}>
                      <span onMouseDown={startResize('produto')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                      <button
                        onClick={toggleHeaderFiltro('produto')}
                        className={`inline-flex items-center gap-1 ${filtroProduto ? 'text-[#059669]' : 'text-black'} hover:text-[#059669]`}
                      >
                        Produto
                        {filtroProduto && <span className="w-1.5 h-1.5 rounded-full bg-[#059669]" />}
                        <ChevronDown size={15} />
                      </button>
                      {headerFiltroAberto === 'produto' && (
                        <HeaderFilterDropdown anchor={headerAnchor} align="left" width={220} innerRef={headerFiltroRef} className="p-2">
                          <input
                            type="text"
                            value={filtroProduto}
                            onChange={e => setFiltroProduto(e.target.value)}
                            placeholder="Ex: Botox, Laser..."
                            autoFocus
                            className="w-full px-2 py-1 text-xs border border-[#D0D5DD] rounded focus:outline-none focus:border-[#059669]"
                          />
                          <button
                            onClick={() => { setFiltroProduto(''); setHeaderFiltroAberto(null); setHeaderAnchor(null) }}
                            className="mt-2 text-[11px] text-[#667085] hover:text-black"
                          >
                            Limpar
                          </button>
                        </HeaderFilterDropdown>
                      )}
                    </th>
                    <th className={`text-center px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('itens') ? '' : 'hidden'}`}>
                      <span onMouseDown={startResize('itens')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                      <button
                        onClick={toggleHeaderFiltro('itens')}
                        className={`inline-flex items-center gap-1 ${filtroItens !== '' ? 'text-[#059669]' : 'text-black'} hover:text-[#059669]`}
                      >
                        Itens
                        {filtroItens !== '' && <span className="w-1.5 h-1.5 rounded-full bg-[#059669]" />}
                        <ChevronDown size={15} />
                      </button>
                      {headerFiltroAberto === 'itens' && (
                        <HeaderFilterDropdown anchor={headerAnchor} align="center" width={120} innerRef={headerFiltroRef} className="max-h-[240px] overflow-y-auto">
                          <button
                            onClick={() => { setFiltroItens(''); setHeaderFiltroAberto(null); setHeaderAnchor(null) }}
                            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[#F6F2EB] ${filtroItens === '' ? 'bg-[#ECFDF4] text-[#059669] font-semibold' : 'text-[#1D2939]'}`}
                          >
                            Todos
                          </button>
                          {itensUnicos.map(([n, count]) => (
                            <button
                              key={n}
                              onClick={() => { setFiltroItens(n); setHeaderFiltroAberto(null); setHeaderAnchor(null) }}
                              className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs hover:bg-[#F6F2EB] ${filtroItens === n ? 'bg-[#ECFDF4] text-[#059669] font-semibold' : 'text-[#1D2939]'}`}
                            >
                              <span className="text-left">{n} {n === 1 ? 'item' : 'itens'}</span>
                              <span className="text-[11px] text-[#98A2B3] font-normal">{count}</span>
                            </button>
                          ))}
                        </HeaderFilterDropdown>
                      )}
                    </th>
                    <th className={`text-center px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('forma') ? '' : 'hidden'}`}>
                      <span onMouseDown={startResize('forma')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                      <button
                        onClick={toggleHeaderFiltro('forma')}
                        className={`inline-flex items-center gap-1 ${filtroForma ? 'text-[#059669]' : 'text-black'} hover:text-[#059669]`}
                      >
                        Forma pgto
                        {filtroForma && <span className="w-1.5 h-1.5 rounded-full bg-[#059669]" />}
                        <ChevronDown size={15} />
                      </button>
                      {headerFiltroAberto === 'forma' && (
                        <HeaderFilterDropdown anchor={headerAnchor} align="right" width={180} innerRef={headerFiltroRef}>
                          <button
                            onClick={() => { setFiltroForma(''); setHeaderFiltroAberto(null); setHeaderAnchor(null) }}
                            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[#F6F2EB] ${!filtroForma ? 'bg-[#ECFDF4] text-[#059669] font-semibold' : 'text-[#1D2939]'}`}
                          >
                            Todas
                          </button>
                          {formasUnicas.map(([f, count]) => (
                            <button
                              key={f}
                              onClick={() => { setFiltroForma(f); setHeaderFiltroAberto(null); setHeaderAnchor(null) }}
                              className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs hover:bg-[#F6F2EB] ${filtroForma === f ? 'bg-[#ECFDF4] text-[#059669] font-semibold' : 'text-[#1D2939]'}`}
                            >
                              <span className="truncate text-left">{LABEL_FORMA[f] || f}</span>
                              <span className="text-[11px] text-[#98A2B3] font-normal">{count}</span>
                            </button>
                          ))}
                        </HeaderFilterDropdown>
                      )}
                    </th>
                    <th className={`text-right px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('valor') ? '' : 'hidden'}`}>
                      <span onMouseDown={startResize('valor')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                      <button
                        onClick={toggleHeaderFiltro('valor')}
                        className={`inline-flex items-center gap-1 ${(filtroValorMin !== '' || filtroValorMax !== '') ? 'text-[#059669]' : 'text-black'} hover:text-[#059669]`}
                      >
                        Valor
                        {(filtroValorMin !== '' || filtroValorMax !== '') && <span className="w-1.5 h-1.5 rounded-full bg-[#059669]" />}
                        <ChevronDown size={15} />
                      </button>
                      {headerFiltroAberto === 'valor' && (
                        <HeaderFilterDropdown anchor={headerAnchor} align="right" width={200} innerRef={headerFiltroRef} className="p-3">
                          <label className="block text-[11px] font-bold text-[#555] uppercase tracking-wider mb-1">Mínimo (R$)</label>
                          <input
                            type="number"
                            step={0.01}
                            min={0}
                            value={filtroValorMin}
                            onChange={e => setFiltroValorMin(e.target.value === '' ? '' : parseFloat(e.target.value))}
                            placeholder="0,00"
                            className="w-full px-2 py-1 text-xs border border-[#D0D5DD] rounded focus:outline-none focus:border-[#059669] mb-2"
                          />
                          <label className="block text-[11px] font-bold text-[#555] uppercase tracking-wider mb-1">Máximo (R$)</label>
                          <input
                            type="number"
                            step={0.01}
                            min={0}
                            value={filtroValorMax}
                            onChange={e => setFiltroValorMax(e.target.value === '' ? '' : parseFloat(e.target.value))}
                            placeholder="∞"
                            className="w-full px-2 py-1 text-xs border border-[#D0D5DD] rounded focus:outline-none focus:border-[#059669]"
                          />
                          <button
                            onClick={() => { setFiltroValorMin(''); setFiltroValorMax(''); setHeaderFiltroAberto(null); setHeaderAnchor(null) }}
                            className="mt-2 text-[11px] text-[#667085] hover:text-black"
                          >
                            Limpar
                          </button>
                        </HeaderFilterDropdown>
                      )}
                    </th>
                    <th className={`text-center px-3 py-3 relative border-r border-[#EAECF0] ${isColVisible('cr') ? '' : 'hidden'}`}>
                      <span onMouseDown={startResize('cr')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                      <button
                        onClick={toggleHeaderFiltro('cr')}
                        className={`inline-flex items-center gap-1 ${filtroCR ? 'text-[#059669]' : 'text-black'} hover:text-[#059669]`}
                      >
                        CR
                        {filtroCR && <span className="w-1.5 h-1.5 rounded-full bg-[#059669]" />}
                        <ChevronDown size={15} />
                      </button>
                      {headerFiltroAberto === 'cr' && (
                        <HeaderFilterDropdown anchor={headerAnchor} align="right" width={160} innerRef={headerFiltroRef}>
                          <button
                            onClick={() => { setFiltroCR(''); setHeaderFiltroAberto(null); setHeaderAnchor(null) }}
                            className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs hover:bg-[#F6F2EB] ${!filtroCR ? 'bg-[#ECFDF4] text-[#059669] font-semibold' : 'text-[#1D2939]'}`}
                          >
                            <span className="text-left">Todos</span>
                            <span className="text-[11px] text-[#98A2B3] font-normal">{vendas.length}</span>
                          </button>
                          {crStatusUnicos.map(([st, count]) => {
                            const label = st === 'pago' ? 'Pago' : st === 'aberto' ? 'Inadimplente' : st === 'parcial' ? 'Parcial' : 'À vista'
                            return (
                              <button
                                key={st}
                                onClick={() => { setFiltroCR(st); setHeaderFiltroAberto(null); setHeaderAnchor(null) }}
                                className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs hover:bg-[#F6F2EB] ${filtroCR === st ? 'bg-[#ECFDF4] text-[#059669] font-semibold' : 'text-[#1D2939]'}`}
                              >
                                <span className="text-left">{label}</span>
                                <span className="text-[11px] text-[#98A2B3] font-normal">{count}</span>
                              </button>
                            )
                          })}
                        </HeaderFilterDropdown>
                      )}
                    </th>
                    <th className={`text-center px-3 py-3 relative ${isColVisible('acoes') ? '' : 'hidden'}`}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {vendasPaginadas.map(v => (
                    <tr key={v.id} className="border-b border-[#F1F3F5] hover:bg-[#F6F2EB] transition-colors text-[12px]">
                      <td className={`px-3 py-1 font-mono text-[11px] text-[#667085] truncate border-r border-[#F1F3F5] ${isColVisible('codigo') ? '' : 'hidden'}`}>{vendaCodigoMap[v.id]}</td>
                      <td className={`px-3 py-1 text-center text-[#667085] truncate border-r border-[#F1F3F5] ${isColVisible('data') ? '' : 'hidden'}`}>{v.data_venda ? v.data_venda.slice(5, 10).split('-').reverse().join('/') : '—'}</td>
                      <td className={`px-3 py-1 font-medium text-[#1D2939] truncate text-[11px] border-r border-[#F1F3F5] ${isColVisible('cliente') ? '' : 'hidden'}`}>
                        <Link
                          to={`/clientes?cliente=${encodeURIComponent(v.cliente_cpf_cnpj || v.cliente_nome)}`}
                          className="hover:text-[#059669] hover:underline"
                          title={`Abrir cliente: ${v.cliente_nome}`}
                        >
                          {v.cliente_nome}
                        </Link>
                      </td>
                      <td className={`px-3 py-1 text-left text-[#1D2939] truncate border-r border-[#F1F3F5] ${isColVisible('produto') ? '' : 'hidden'}`}>
                        {v.vendas_itens && v.vendas_itens.length > 0
                          ? <>
                              {v.vendas_itens[0].descricao}
                              {v.vendas_itens.length > 1 && <span className="text-[#98A2B3] text-[11px] ml-1">+{v.vendas_itens.length - 1}</span>}
                            </>
                          : <span className="text-[#98A2B3] italic">—</span>}
                      </td>
                      <td className={`px-3 py-1 text-center text-[#667085] truncate border-r border-[#F1F3F5] ${isColVisible('itens') ? '' : 'hidden'}`}>{v.vendas_itens?.length || 0}</td>
                      <td className={`px-3 py-1 text-center text-[#667085] truncate border-r border-[#F1F3F5] ${isColVisible('forma') ? '' : 'hidden'}`}>{LABEL_FORMA[v.forma_pagamento] || v.forma_pagamento}</td>
                      <td className={`px-3 py-1 text-right font-semibold text-[#1D2939] truncate border-r border-[#F1F3F5] ${isColVisible('valor') ? '' : 'hidden'}`}>{formatBRL(v.valor_total)}</td>
                      <td className={`px-3 py-1 text-center border-r border-[#F1F3F5] ${isColVisible('cr') ? '' : 'hidden'}`}><CRBadge venda={v} /></td>
                      <td className={`px-3 py-1 text-center ${isColVisible('acoes') ? '' : 'hidden'}`}>
                        <div className="flex items-center justify-center gap-0.5">
                          <button onClick={() => setModalDetalhes(v)} className="p-1 rounded hover:bg-[#ECFDF4] text-[#059669] transition-colors" title="Ver detalhes">
                            <Eye size={12} />
                          </button>
                          <button onClick={() => carregarVendaParaEdicao(v)} className="p-1 rounded hover:bg-[#ECFDF4] text-[#059669] transition-colors" title="Editar venda">
                            <Pencil size={12} />
                          </button>
                          <RoleGate minRole="owner">
                            <button onClick={() => setConfirmDelete(v.id)} className="p-1 rounded hover:bg-[#FEE2E2] text-[#E53E3E] transition-colors" title="Excluir">
                              <Trash2 size={12} />
                            </button>
                          </RoleGate>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {/* Paginação — sempre visível no rodapé do container */}
          <div className="bg-white border-t border-[#EAECF0] px-5 py-3 flex items-center justify-between text-[12px] text-[#667085] mt-auto flex-shrink-0">
            <span>
              {vendasFiltradas.length === 0 ? (
                'Nenhum registro'
              ) : (
                <>
                  Mostrando <strong className="text-[#1D2939]">{(paginaAtual - 1) * ITENS_POR_PAGINA + 1}</strong>–
                  <strong className="text-[#1D2939]">{Math.min(paginaAtual * ITENS_POR_PAGINA, vendasFiltradas.length)}</strong>
                  {' '}de <strong className="text-[#1D2939]">{vendasFiltradas.length}</strong>
                </>
              )}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPaginaAtual(p => Math.max(1, p - 1))}
                disabled={paginaAtual === 1}
                className="h-7 px-2.5 text-[11.5px] font-semibold text-[#1D2939] bg-white border border-[#D0D5DD] rounded hover:bg-[#F6F2EB] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              <span className="px-2 text-[11.5px]">
                Página <strong className="text-[#1D2939]">{paginaAtual}</strong> de {totalPaginas}
              </span>
              <button
                onClick={() => setPaginaAtual(p => Math.min(totalPaginas, p + 1))}
                disabled={paginaAtual >= totalPaginas}
                className="h-7 px-2.5 text-[11.5px] font-semibold text-[#1D2939] bg-white border border-[#D0D5DD] rounded hover:bg-[#F6F2EB] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Próxima
              </button>
            </div>
          </div>
        </div>
        </div>
      </div>
      </PagePanel>

      {/* ================================================================
         MODAL NOVA VENDA
         ================================================================ */}
      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 my-auto">
            {/* Header */}
            <div className="bg-[#071D41] px-5 py-3 flex items-center justify-between rounded-t-lg">
              <h2 className="text-[11px] font-bold text-white uppercase tracking-widest">{editandoVenda ? 'Editar Venda' : 'Nova Venda'}</h2>
              <button onClick={() => { setModalAberto(false); setEditandoVenda(null) }} className="text-white/70 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* Tipo */}
              <div>
                <label className="block text-[11px] font-bold text-[#555] uppercase tracking-wider mb-2">Tipo</label>
                <div className="grid grid-cols-4 gap-2">
                  {TIPOS_VENDA.map(t => {
                    const Icon = t.icon
                    const sel = formTipo === t.value
                    return (
                      <button
                        key={t.value}
                        onClick={() => setFormTipo(t.value)}
                        className={`flex flex-col items-center gap-1 px-3 py-2.5 rounded-md border text-xs font-semibold transition-all ${
                          sel ? 'border-[#059669] bg-[#ECFDF4] text-[#059669]' : 'border-[#ccc] bg-white text-[#555] hover:border-[#999]'
                        }`}
                      >
                        <Icon size={16} />
                        {t.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Cliente — searchable dropdown */}
              <div>
                <label className="block text-[11px] font-bold text-[#555] uppercase tracking-wider mb-1">Cliente</label>
                <div ref={clienteRef} className="relative">
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#999]" />
                      <input
                        type="text"
                        value={clienteSearch}
                        onChange={e => {
                          setClienteSearch(e.target.value)
                          setClienteDropdownOpen(true)
                          if (!e.target.value.trim()) {
                            setFormClienteId(null)
                            setFormCliente('')
                            setFormCpfCnpj('')
                          }
                        }}
                        onFocus={() => setClienteDropdownOpen(true)}
                        placeholder="Buscar cliente cadastrado..."
                        className="w-full pl-9 pr-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#1D2939] placeholder-[#999] focus:outline-none focus:border-[#059669] focus:ring-1 focus:ring-[#059669]"
                      />
                    </div>
                    <button
                      onClick={() => {
                        setModalNovoCliente(true)
                        setNovoClienteNome(clienteSearch)
                      }}
                      className="flex items-center gap-1 px-3 py-2 text-xs font-semibold text-[#059669] border border-[#059669] rounded-md hover:bg-[#ECFDF4] transition-colors whitespace-nowrap"
                      title="Adicionar novo cliente"
                    >
                      <UserPlus size={14} /> Novo
                    </button>
                  </div>

                  {/* Dropdown */}
                  {clienteDropdownOpen && (
                    <div className="absolute z-20 mt-1 w-full bg-white border border-[#ccc] rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {clientesFiltrados.length === 0 ? (
                        <div className="px-3 py-4 text-sm text-[#555] text-center">
                          Nenhum cliente encontrado.
                          <button
                            onClick={() => {
                              setModalNovoCliente(true)
                              setNovoClienteNome(clienteSearch)
                              setClienteDropdownOpen(false)
                            }}
                            className="block mx-auto mt-2 text-[#059669] font-semibold hover:underline"
                          >
                            + Adicionar cliente
                          </button>
                        </div>
                      ) : (
                        clientesFiltrados.map(c => (
                          <button
                            key={c.id}
                            onClick={() => selectCliente(c)}
                            className={`w-full text-left px-3 py-2 hover:bg-[#ECFDF4] transition-colors border-b border-[#eee] last:border-b-0 ${
                              formClienteId === c.id ? 'bg-[#ECFDF4]' : ''
                            }`}
                          >
                            <div className="text-sm font-medium text-[#1D2939]">
                              {c.nome_fantasia || c.razao_social}
                            </div>
                            <div className="text-[11px] text-[#555]">
                              {c.cpf_cnpj ? formatDoc(c.cpf_cnpj) : 'Sem documento'}
                              {c.email && ` · ${c.email}`}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                {formClienteId && (
                  <div className="mt-1.5 flex items-center gap-2 text-[11px] text-[#039855]">
                    <Check size={12} />
                    <span><strong>{formCliente}</strong> {formCpfCnpj && `· ${formatDoc(formCpfCnpj)}`}</span>
                  </div>
                )}
              </div>

              {/* Banner: cliente já tem contrato/pacote em aberto */}
              {!bannerContratoDispensado &&
                (formTipo === 'contrato' || formTipo === 'pacote') &&
                (formCpfCnpj || (formCliente || '').trim().length >= 3) &&
                contratosAbertosCliente.length > 0 && (
                <div className="rounded-md border-2 border-[#EA580C] bg-[#FFFBEB] px-4 py-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle size={16} className="text-[#D97706] mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-bold text-[#92400E]">
                        {formCliente || 'Este cliente'} já tem {contratosAbertosCliente.length} {contratosAbertosCliente.length === 1 ? 'contrato/pacote' : 'contratos/pacotes'} em aberto
                      </p>
                      <p className="text-[11px] text-[#92400E]/85 mt-0.5">
                        Em vez de criar um {formTipo} novo, registre o pagamento no existente para amortizar o saldo.
                      </p>
                      <div className="mt-2 space-y-1.5">
                        {contratosAbertosCliente.map(c => (
                          <div key={c.id} className="bg-white border border-[#FCD34D] rounded px-3 py-2">
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                              <div className="min-w-0 flex-1">
                                <div className="text-[12px] font-semibold text-[#1D2939] flex items-center gap-2 flex-wrap">
                                  <span className="truncate">{c.procedimento || (c.tipo === 'contrato' ? 'Contrato' : 'Pacote')}</span>
                                  <span className="inline-block px-1.5 py-0.5 text-[10px] uppercase tracking-wider rounded bg-[#F3F4F6] text-[#555]">
                                    {c.tipo}
                                  </span>
                                  <span className="text-[11px] text-[#888] font-normal">
                                    desde {formatData(c.data_venda)}
                                  </span>
                                </div>
                                <div className="text-[10.5px] text-[#555] mt-0.5 tabular-nums">
                                  Total {formatBRL(c.valor_total)} · Pago {formatBRL(c.total_pago)} · <strong className="text-[#B45309]">Saldo {formatBRL(c.saldo)}</strong>
                                </div>
                              </div>
                              <div className="flex gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => setPagamentoContrato({ contrato: c, modoQuitacao: false })}
                                  className="px-2.5 py-1 text-[10.5px] font-bold bg-[#059669] text-white rounded hover:bg-[#039855] transition-colors"
                                >
                                  Pagar parcela
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPagamentoContrato({ contrato: c, modoQuitacao: true })}
                                  className="px-2.5 py-1 text-[10.5px] font-bold bg-[#0F1F33] text-white rounded hover:bg-black transition-colors"
                                >
                                  Quitar tudo
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setBannerContratoDispensado(true)}
                        className="mt-2 text-[11px] font-semibold text-[#92400E] underline hover:text-[#451A03]"
                      >
                        Criar {formTipo === 'contrato' ? 'contrato' : 'pacote'} novo mesmo assim →
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {carregandoContratosCliente &&
                (formTipo === 'contrato' || formTipo === 'pacote') &&
                (formCpfCnpj || (formCliente || '').trim().length >= 3) &&
                contratosAbertosCliente.length === 0 && (
                <div className="flex items-center gap-2 text-[11px] text-[#888] -mt-2">
                  <Loader2 size={12} className="animate-spin" /> Verificando contratos/pacotes em aberto...
                </div>
              )}

              {/* Data */}
              <div>
                <label className="block text-[11px] font-bold text-[#555] uppercase tracking-wider mb-1">Data da venda</label>
                <input
                  type="date"
                  value={formDataVenda}
                  onChange={e => setFormDataVenda(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#1D2939] focus:outline-none focus:border-[#059669] focus:ring-1 focus:ring-[#059669]"
                />
              </div>

              {/* Itens — with product selector */}
              <div>
                <label className="block text-[11px] font-bold text-[#555] uppercase tracking-wider mb-2">Itens</label>
                <div className="border border-[#ccc] rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#F6F2EB] text-[11px] font-bold text-[#555] uppercase tracking-wider">
                        <th className="text-left px-3 py-2">Descrição</th>
                        <th className="text-center px-3 py-2 w-20">Qtd</th>
                        <th className="text-center px-3 py-2 w-28">Valor unit.</th>
                        <th className="text-right px-3 py-2 w-28">Subtotal</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {formItens.map((it, idx) => (
                        <tr key={idx} className="border-t border-[#eee]">
                          <td className="px-2 py-1.5">
                            <button
                              type="button"
                              onClick={() => abrirModalProduto(idx)}
                              className="w-full flex items-center gap-2 px-2 py-1 text-sm border border-[#ccc] rounded bg-white text-left hover:border-[#059669] hover:bg-[#F6F2EB] transition-colors"
                            >
                              <Package size={13} className="text-[#999] shrink-0" />
                              <span className={it.descricao ? 'text-[#1D2939]' : 'text-[#999]'}>
                                {it.descricao || 'Selecionar do catálogo...'}
                              </span>
                            </button>
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              min={1}
                              value={it.quantidade}
                              onChange={e => updateItem(idx, 'quantidade', parseInt(e.target.value) || 1)}
                              className="w-full px-2 py-1 text-sm text-center border border-[#ccc] rounded bg-white text-[#1D2939] focus:outline-none focus:border-[#059669]"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              value={it.valor_unitario}
                              onChange={e => updateItem(idx, 'valor_unitario', parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1 text-sm text-center border border-[#ccc] rounded bg-white text-[#1D2939] focus:outline-none focus:border-[#059669]"
                            />
                          </td>
                          <td className="px-3 py-1.5 text-right text-sm font-medium text-[#1D2939]">
                            {formatBRL(it.quantidade * it.valor_unitario)}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            {formItens.length > 1 && (
                              <button onClick={() => removeItem(idx)} className="text-[#E53E3E] hover:text-red-700 transition-colors">
                                <X size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  onClick={addItem}
                  className="mt-2 text-[11px] font-semibold text-[#059669] hover:underline flex items-center gap-1"
                >
                  <Plus size={12} /> Item
                </button>
              </div>

              {/* Formas de pagamento (múltiplas) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-[11px] font-bold text-[#555] uppercase tracking-wider">Formas de pagamento</label>
                  <div className="text-[11px]">
                    {Math.abs(pendentePagamento) < 0.01 && totalVenda > 0 ? (
                      <span className="text-[#039855] font-semibold inline-flex items-center gap-1">
                        <Check size={12} /> OK · {formatBRL(totalPagamentos)}
                      </span>
                    ) : pendentePagamento > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          const restante = Math.round(pendentePagamento * 100) / 100
                          // Default 'pendente' = saldo em aberto sem forma definida ainda.
                          // CR fica aberta com vencimento +30 dias; usuária troca pra cartão/boleto/etc. se já souber.
                          setFormPagamentos(prev => [
                            ...prev,
                            { ...novoSplit(restante), forma: 'pendente' },
                          ])
                        }}
                        title="Lançar saldo como em aberto (sem definir forma agora). Vencimento padrão: +30 dias da data da venda."
                        className="text-[#EA580C] font-semibold hover:underline"
                      >
                        Faltam {formatBRL(pendentePagamento)} — deixar em aberto ↓
                      </button>
                    ) : (
                      <span className="text-[#E53E3E] font-semibold">Excedeu em {formatBRL(Math.abs(pendentePagamento))}</span>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  {formPagamentos.map((split, idx) => {
                    const isParcl = split.forma === 'parcelado' || split.forma === 'cartao_credito'
                    const isPendente = split.forma === 'pendente'
                    const txPct = split.taxa?.taxa_percentual || 0
                    const diasRec = split.taxa?.dias_recebimento || 0
                    const maxParcelas = Math.max(1, Math.min(split.taxa?.max_parcelas || 12, 24))
                    return (
                      <div key={split.uid} className="border border-[#ccc] rounded-md p-3 bg-[#FAFAFA]">
                        <div className="grid grid-cols-12 gap-2 items-end">
                          <div className={`col-span-12 ${isOwner ? 'sm:col-span-4' : 'sm:col-span-6'}`}>
                            <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Forma</label>
                            <select
                              value={split.forma}
                              onChange={e => setFormPagamentos(prev => prev.map((p, i) => i === idx ? { ...p, forma: e.target.value, parcelas: 1, taxa: null, conta_bancaria_id: '' } : p))}
                              className="w-full px-2 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#1D2939] focus:outline-none focus:border-[#059669] focus:ring-1 focus:ring-[#059669]"
                            >
                              {FORMAS_PAGAMENTO.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                            </select>
                          </div>
                          <div className={`col-span-6 ${isOwner ? 'sm:col-span-3' : isParcl ? 'sm:col-span-4' : 'sm:col-span-5'}`}>
                            <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Valor (R$)</label>
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              value={split.valor}
                              onChange={e => {
                                const v = parseFloat(e.target.value) || 0
                                setFormPagamentos(prev => prev.map((p, i) => i === idx ? { ...p, valor: v } : p))
                              }}
                              className="w-full px-2 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#1D2939] focus:outline-none focus:border-[#059669] focus:ring-1 focus:ring-[#059669]"
                            />
                          </div>
                          {isOwner && !isPendente && (
                            <div className={`${isParcl ? 'col-span-12 sm:col-span-3' : 'col-span-6 sm:col-span-4'}`}>
                              <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Conta destino</label>
                              <select
                                value={split.conta_bancaria_id}
                                onChange={e => setFormPagamentos(prev => prev.map((p, i) => i === idx ? { ...p, conta_bancaria_id: e.target.value, taxa: null } : p))}
                                className="w-full px-2 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#1D2939] focus:outline-none focus:border-[#059669] focus:ring-1 focus:ring-[#059669]"
                              >
                                <option value="">Selecione...</option>
                                {bankAccounts.map(ba => (
                                  <option key={ba.id} value={ba.id}>{ba.name}{ba.banco ? ` (${ba.banco})` : ''}</option>
                                ))}
                              </select>
                            </div>
                          )}
                          {isPendente && (
                            <div className="col-span-12 sm:col-span-5">
                              <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Vencimento</label>
                              <input
                                type="date"
                                value={split.vencimento_pendente || format(addDays(parseISO(formDataVenda), 30), 'yyyy-MM-dd')}
                                onChange={e => setFormPagamentos(prev => prev.map((p, i) => i === idx ? { ...p, vencimento_pendente: e.target.value } : p))}
                                className="w-full px-2 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#1D2939] focus:outline-none focus:border-[#059669] focus:ring-1 focus:ring-[#059669]"
                              />
                            </div>
                          )}
                          {isParcl && (
                            <div className="col-span-10 sm:col-span-1">
                              <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Parc.</label>
                              <select
                                value={split.parcelas}
                                onChange={e => setFormPagamentos(prev => prev.map((p, i) => i === idx ? { ...p, parcelas: parseInt(e.target.value) || 1 } : p))}
                                className="w-full px-1 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#1D2939] focus:outline-none focus:border-[#059669] focus:ring-1 focus:ring-[#059669]"
                              >
                                {Array.from({ length: maxParcelas }, (_, i) => i + 1).map(n => (
                                  <option key={n} value={n}>{n}x</option>
                                ))}
                              </select>
                            </div>
                          )}
                          <div className={`${isParcl ? 'col-span-2 sm:col-span-1' : 'col-span-12 sm:col-span-1'} flex sm:justify-center`}>
                            {formPagamentos.length > 1 && (
                              <button
                                onClick={() => setFormPagamentos(prev => prev.filter((_, i) => i !== idx))}
                                className="text-[#E53E3E] hover:bg-[#FEE2E2] p-2 rounded transition-colors"
                                title="Remover forma de pagamento"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Taxa info por split */}
                        {split.taxa && (txPct > 0 || diasRec > 0 || split.taxa.antecipacao_ativa) && (
                          <div className="mt-2 text-[10.5px] text-[#555] flex flex-wrap gap-x-3 gap-y-0.5">
                            {txPct > 0 && <span>Taxa: <strong>{txPct}%</strong></span>}
                            {diasRec > 0 && <span>Prazo: <strong>D+{diasRec}</strong></span>}
                            {split.taxa.antecipacao_ativa && <span>Antecipação: <strong>{split.taxa.taxa_antecipacao}% a.m.</strong></span>}
                            {split.taxa.max_parcelas > 1 && <span>Máx: <strong>{split.taxa.max_parcelas}x</strong></span>}
                          </div>
                        )}

                        {/* Projeção do split */}
                        {split.valor > 0 && (() => {
                          const splitBruto = split.valor
                          const vlTaxa = Math.round((splitBruto * txPct / 100) * 100) / 100
                          const vlLiq = Math.round((splitBruto - vlTaxa) * 100) / 100
                          const nParcelas = isParcl ? Math.min(split.parcelas, split.taxa?.max_parcelas || split.parcelas) : 1
                          const temAntc = split.taxa?.antecipacao_ativa || false
                          const txAntc = split.taxa?.taxa_antecipacao || 0
                          const splitIsAVista = FORMAS_A_VISTA.includes(split.forma)

                          return (
                            <div className="mt-2 text-[11px] text-[#039855]">
                              {txPct > 0 && (
                                <p className="text-[10.5px] text-[#555]">
                                  Bruto: {formatBRL(splitBruto)} − Taxa: {formatBRL(vlTaxa)} = <strong>Líquido: {formatBRL(vlLiq)}</strong>
                                </p>
                              )}
                              {temAntc && isParcl && nParcelas > 1 ? (() => {
                                const prazoMedio = (nParcelas + 1) / 2
                                const descAntc = Math.round((vlLiq * txAntc / 100 * prazoMedio) * 100) / 100
                                const vlAntecipado = Math.round((vlLiq - descAntc) * 100) / 100
                                const dataRec = format(addDays(parseISO(formDataVenda), diasRec || 1), 'dd/MM/yyyy')
                                return <p>CR antecipado {nParcelas}x: {formatBRL(vlAntecipado)} · recebimento {dataRec}</p>
                              })() : isParcl && nParcelas > 1 ? (
                                <p>
                                  {nParcelas}x de aprox. {formatBRL(Math.round((vlLiq / nParcelas) * 100) / 100)} · 1ª parcela em {format(
                                    diasRec > 0 ? addDays(addMonths(parseISO(formDataVenda), 1), diasRec) : addMonths(parseISO(formDataVenda), 1),
                                    'dd/MM/yyyy'
                                  )}
                                </p>
                              ) : isPendente ? (
                                <p className="text-[#EA580C]">
                                  CR em aberto: {formatBRL(vlLiq)} · vencimento {format(
                                    parseISO(split.vencimento_pendente || format(addDays(parseISO(formDataVenda), 30), 'yyyy-MM-dd')),
                                    'dd/MM/yyyy'
                                  )} (saldo a definir)
                                </p>
                              ) : (
                                <p>
                                  CR: {formatBRL(vlLiq)} · recebimento {
                                    diasRec > 0
                                      ? format(addDays(parseISO(formDataVenda), diasRec), 'dd/MM/yyyy')
                                      : format(parseISO(formDataVenda), 'dd/MM/yyyy')
                                  }
                                  {splitIsAVista && !isParcl && ' (quitado automaticamente)'}
                                </p>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    )
                  })}
                </div>

                <button
                  onClick={() => {
                    const restante = Math.max(0, Math.round((totalVenda - totalPagamentos) * 100) / 100)
                    setFormPagamentos(prev => [...prev, novoSplit(restante)])
                  }}
                  className="mt-2 text-[11px] font-semibold text-[#059669] hover:underline flex items-center gap-1"
                >
                  <Plus size={12} /> Adicionar forma de pagamento
                </button>
              </div>

              {/* Error */}
              {erroModal && (
                <div className="rounded-md border border-[#E53E3E] bg-[#FEE2E2] p-3 flex items-center gap-2 text-[12px] text-[#E53E3E]">
                  <AlertCircle size={14} className="flex-shrink-0" />
                  {erroModal}
                </div>
              )}

              {/* Total + actions */}
              <div className="flex items-center justify-between pt-2 border-t border-[#ccc]">
                <div>
                  <span className="text-[11px] font-bold text-[#555] uppercase tracking-wider">Total: </span>
                  <span className="text-lg font-bold text-[#1D2939]">{formatBRL(totalVenda)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setModalAberto(false); setEditandoVenda(null) }}
                    className="px-4 py-2 text-sm font-medium text-[#555] border border-[#ccc] rounded-md hover:bg-[#F6F2EB] transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={salvarVenda}
                    disabled={salvando}
                    className="px-5 py-2 text-sm font-semibold text-white bg-[#059669] rounded-md hover:bg-[#1D2939] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    {salvando && <Loader2 size={14} className="animate-spin" />}
                    {editandoVenda ? 'Salvar alterações' : 'Confirmar venda'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================
         MODAL NOVO CLIENTE (inline)
         ================================================================ */}
      {modalNovoCliente && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="bg-[#071D41] px-5 py-3 flex items-center justify-between rounded-t-lg">
              <h2 className="text-[11px] font-bold text-white uppercase tracking-widest">Novo Cliente</h2>
              <button onClick={() => setModalNovoCliente(false)} className="text-white/70 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-[#555] uppercase tracking-wider mb-1">Nome / Razão Social *</label>
                <input
                  type="text"
                  value={novoClienteNome}
                  onChange={e => setNovoClienteNome(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#1D2939] focus:outline-none focus:border-[#059669] focus:ring-1 focus:ring-[#059669]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#555] uppercase tracking-wider mb-1">CPF/CNPJ</label>
                <input
                  type="text"
                  value={novoClienteCpfCnpj}
                  onChange={e => setNovoClienteCpfCnpj(e.target.value)}
                  placeholder="Opcional"
                  className="w-full px-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#1D2939] placeholder-[#999] focus:outline-none focus:border-[#059669] focus:ring-1 focus:ring-[#059669]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#555] uppercase tracking-wider mb-1">E-mail</label>
                <input
                  type="email"
                  value={novoClienteEmail}
                  onChange={e => setNovoClienteEmail(e.target.value)}
                  placeholder="Opcional"
                  className="w-full px-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#1D2939] placeholder-[#999] focus:outline-none focus:border-[#059669] focus:ring-1 focus:ring-[#059669]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-[#ccc]">
                <button
                  onClick={() => setModalNovoCliente(false)}
                  className="px-4 py-2 text-sm font-medium text-[#555] border border-[#ccc] rounded-md hover:bg-[#F6F2EB] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={salvarNovoCliente}
                  disabled={salvandoCliente || !novoClienteNome.trim()}
                  className="px-5 py-2 text-sm font-semibold text-white bg-[#059669] rounded-md hover:bg-[#1D2939] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {salvandoCliente && <Loader2 size={14} className="animate-spin" />}
                  Cadastrar e selecionar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================
         MODAL DETALHES
         ================================================================ */}
      {modalDetalhes && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 my-auto">
            <div className="bg-[#071D41] px-5 py-3 flex items-center justify-between rounded-t-lg">
              <h2 className="text-[11px] font-bold text-white uppercase tracking-widest">Detalhes da Venda</h2>
              <button onClick={() => setModalDetalhes(null)} className="text-white/70 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-[11px] font-bold text-[#555] uppercase tracking-wider block">Cliente</span>
                  <span className="text-[#1D2939] font-medium">{modalDetalhes.cliente_nome}</span>
                  {modalDetalhes.cliente_cpf_cnpj && (
                    <span className="block text-[11px] text-[#555]">{formatDoc(modalDetalhes.cliente_cpf_cnpj)}</span>
                  )}
                </div>
                <div>
                  <span className="text-[11px] font-bold text-[#555] uppercase tracking-wider block">Data</span>
                  <span className="text-[#1D2939]">{formatData(modalDetalhes.data_venda)}</span>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-[#555] uppercase tracking-wider block">Tipo</span>
                  <TipoBadge tipo={modalDetalhes.tipo} />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-[#555] uppercase tracking-wider block">Forma pgto</span>
                  <span className="text-[#1D2939]">{LABEL_FORMA[modalDetalhes.forma_pagamento] || modalDetalhes.forma_pagamento}</span>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-[#555] uppercase tracking-wider block">Valor total</span>
                  <span className="text-[#1D2939] font-bold">{formatBRL(modalDetalhes.valor_total)}</span>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-[#555] uppercase tracking-wider block">CR</span>
                  <CRBadge venda={modalDetalhes} />
                </div>
              </div>

              {/* Itens */}
              {modalDetalhes.vendas_itens && modalDetalhes.vendas_itens.length > 0 && (
                <div>
                  <span className="text-[11px] font-bold text-[#555] uppercase tracking-wider block mb-2">Itens</span>
                  <div className="border border-[#ccc] rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[#F6F2EB] text-[11px] font-bold text-[#555] uppercase tracking-wider">
                          <th className="text-left px-3 py-2">Descrição</th>
                          <th className="text-center px-3 py-2 w-16">Qtd</th>
                          <th className="text-right px-3 py-2 w-24">Unit.</th>
                          <th className="text-right px-3 py-2 w-24">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {modalDetalhes.vendas_itens.map(it => (
                          <tr key={it.id} className="border-t border-[#eee]">
                            <td className="px-3 py-2 text-[#1D2939]">{it.descricao}</td>
                            <td className="px-3 py-2 text-center text-[#555]">{it.quantidade}</td>
                            <td className="px-3 py-2 text-right text-[#555]">{formatBRL(it.valor_unitario)}</td>
                            <td className="px-3 py-2 text-right font-medium text-[#1D2939]">{formatBRL(it.valor_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* CRs */}
              {modalDetalhes.contas_receber && modalDetalhes.contas_receber.length > 0 && (
                <div>
                  <span className="text-[11px] font-bold text-[#555] uppercase tracking-wider block mb-2">Contas a Receber</span>
                  <div className="space-y-1.5">
                    {modalDetalhes.contas_receber.map((cr, idx) => {
                      const forma = cr.forma_recebimento || modalDetalhes.forma_pagamento
                      return (
                        <div key={cr.id} className="flex items-center justify-between text-sm px-3 py-2 border border-[#eee] rounded-md bg-[#F6F2EB]">
                          <span className="text-[#555]">
                            {modalDetalhes.contas_receber!.length > 1 ? `Parcela ${idx + 1}` : 'CR'} &mdash; venc. {formatData(cr.data_vencimento)}
                            {forma && (
                              <span className="ml-2 text-[11px] text-[#667085]">· {LABEL_FORMA[forma] || forma}</span>
                            )}
                          </span>
                          <div className="flex items-center gap-3">
                            <span className="font-medium text-[#1D2939]">{formatBRL(cr.valor)}</span>
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                              cr.status === 'pago' ? 'text-[#039855] bg-[#ECFDF3]' :
                              cr.status === 'parcial' ? 'text-[#EA580C] bg-[#FFF0EB]' :
                              'text-[#059669] bg-[#ECFDF4]'
                            }`}>
                              {cr.status === 'pago' ? 'Pago' : cr.status === 'parcial' ? 'Parcial' : 'Aberto'}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-[#ccc] flex justify-end gap-2">
                <button
                  onClick={() => setModalDetalhes(null)}
                  className="px-4 py-2 text-sm font-medium text-[#555] border border-[#ccc] rounded-md hover:bg-[#F6F2EB] transition-colors"
                >
                  Fechar
                </button>
                <button
                  onClick={() => carregarVendaParaEdicao(modalDetalhes)}
                  className="px-4 py-2 text-sm font-semibold text-white bg-[#059669] rounded-md hover:bg-[#1D2939] transition-colors flex items-center gap-2"
                >
                  <Pencil size={14} /> Editar venda
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================
         MODAL CONFIRMAR EXCLUSÃO
         ================================================================ */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4">
            <div className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-[#FEE2E2] flex items-center justify-center">
                  <Trash2 size={18} className="text-[#E53E3E]" />
                </div>
                <div>
                  <h3 className="font-semibold text-[#1D2939]">Excluir venda</h3>
                  <p className="text-sm text-[#555]">Esta ação não pode ser desfeita.</p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="px-4 py-2 text-sm font-medium text-[#555] border border-[#ccc] rounded-md hover:bg-[#F6F2EB] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => deletarVenda(confirmDelete)}
                  className="px-4 py-2 text-sm font-semibold text-white bg-[#E53E3E] rounded-md hover:bg-[#6d0000] transition-colors"
                >
                  Excluir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================
         MODAL CONFIRMAR EXCLUSÃO EM LOTE (MÊS)
         ================================================================ */}
      {confirmDeleteMes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-[#FEE2E2] flex items-center justify-center">
                  <AlertCircle size={18} className="text-[#E53E3E]" />
                </div>
                <div>
                  <h3 className="font-semibold text-[#1D2939]">Excluir todas as vendas do periodo</h3>
                  <p className="text-sm text-[#555]">
                    {format(parseISO(dateFrom), 'dd/MM/yyyy')} a {format(parseISO(dateTo), 'dd/MM/yyyy')} &mdash; {vendas.length} venda{vendas.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className="mb-4 p-3 rounded-md bg-[#FFF0EB] border border-[#EA580C] text-[12px] text-[#EA580C]">
                Todas as vendas, itens e contas a receber vinculadas ao mês selecionado serão removidas permanentemente. Esta ação não pode ser desfeita.
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setConfirmDeleteMes(false)}
                  disabled={deletandoMes}
                  className="px-4 py-2 text-sm font-medium text-[#555] border border-[#ccc] rounded-md hover:bg-[#F6F2EB] disabled:opacity-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={deletarVendasDoMes}
                  disabled={deletandoMes || vendas.length === 0}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#E53E3E] rounded-md hover:bg-[#6d0000] disabled:opacity-50 transition-colors"
                >
                  {deletandoMes && <Loader2 size={14} className="animate-spin" />}
                  {deletandoMes ? 'Excluindo...' : 'Excluir tudo'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================
         MODAL SELEÇÃO DE PRODUTO/SERVIÇO DO CATÁLOGO
         ================================================================ */}
      {modalProdutoIdx !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="bg-[#071D41] px-5 py-3 flex items-center justify-between rounded-t-lg">
              <h2 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
                <Package size={16} /> Catálogo de Produtos e Serviços
              </h2>
              <button onClick={() => setModalProdutoIdx(null)} className="text-white/70 hover:text-white">
                <X size={18} />
              </button>
            </div>

            {/* Search */}
            <div className="p-4 border-b border-[#eee]">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#999]" />
                <input
                  type="text"
                  autoFocus
                  value={produtoSearchTerm}
                  onChange={e => setProdutoSearchTerm(e.target.value)}
                  placeholder="Buscar por nome ou código..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#1D2939] placeholder-[#999] focus:outline-none focus:border-[#059669] focus:ring-1 focus:ring-[#059669]"
                />
              </div>
              <p className="text-[11px] text-[#999] mt-1.5">{produtosFiltrados.length} produto{produtosFiltrados.length !== 1 ? 's' : ''} encontrado{produtosFiltrados.length !== 1 ? 's' : ''}</p>
            </div>

            {/* Product list */}
            <div className="flex-1 overflow-y-auto">
              {loadingProdutos ? (
                <div className="flex items-center justify-center py-8 gap-2 text-[#999] text-sm">
                  <Loader2 size={16} className="animate-spin" /> Carregando catálogo...
                </div>
              ) : produtosFiltrados.length === 0 ? (
                <div className="text-center py-8 text-[#999] text-sm">
                  Nenhum produto encontrado
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-[#F6F2EB] sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2 text-[11px] font-bold text-[#555] uppercase">Nome</th>
                      <th className="text-right px-4 py-2 text-[11px] font-bold text-[#555] uppercase">Preço</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eee]">
                    {produtosFiltrados.map(p => (
                      <tr
                        key={p.id}
                        onClick={() => {
                          selectProduto(modalProdutoIdx, p)
                          setModalProdutoIdx(null)
                        }}
                        className="cursor-pointer hover:bg-[#ECFDF4] transition-colors"
                      >
                        <td className="px-4 py-3 font-medium text-[#1D2939]">
                          {p.description}
                          {p.code && <span className="ml-2 text-[11px] text-[#999]">{p.code}</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-[#039855] whitespace-nowrap">
                          {p.price != null && p.price > 0 ? formatBRL(p.price) : <span className="text-[#ccc]">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-[#eee] px-5 py-3 flex justify-end bg-[#F6F2EB] rounded-b-lg">
              <button
                onClick={() => setModalProdutoIdx(null)}
                className="px-4 py-2 text-sm font-medium text-[#555] border border-[#ccc] rounded-md hover:bg-[#F6F2EB] transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================
         MODAL IMPORTAÇÃO DE PLANILHA
         ================================================================ */}
      {modalImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="bg-[#059669] px-5 py-3 flex items-center justify-between rounded-t-lg">
              <h2 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
                <Upload size={16} /> Importar Vendas da Planilha
              </h2>
              <button onClick={fecharModalImport} className="text-white/70 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {/* Tela inicial — instruções + modelo */}
              {importRows.length === 0 && !importError && !importResult && (
                <div className="space-y-4">
                  <p className="text-sm text-[#333]">
                    Importe suas vendas faturadas em outro sistema através de uma planilha <strong>.xlsx</strong>, <strong>.xls</strong> ou <strong>.csv</strong>.
                  </p>

                  <div className="border border-[#ccc] rounded-lg overflow-hidden">
                    <div className="bg-[#F6F2EB] px-4 py-2">
                      <h4 className="text-[11px] font-bold text-[#555] uppercase tracking-widest">Colunas obrigatórias</h4>
                    </div>
                    <div className="p-4">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[#eee]">
                            <th className="text-left py-1.5 text-xs font-bold text-[#555] uppercase">Coluna</th>
                            <th className="text-left py-1.5 text-xs font-bold text-[#555] uppercase">Descrição</th>
                            <th className="text-left py-1.5 text-xs font-bold text-[#555] uppercase">Exemplo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#EAECF0]">
                          {[
                            ['cliente_nome', 'Nome do cliente', 'João Silva'],
                            ['descricao', 'Descrição do item/serviço', 'Consultoria mensal'],
                            ['quantidade', 'Quantidade', '1'],
                            ['valor_unitario', 'Valor unitário', '1500,00'],
                            ['data_venda', 'Data da venda (DD/MM/AAAA)', '01/04/2026'],
                            ['forma_pagamento', 'Forma de pagamento', 'pix'],
                          ].map(([col, desc, ex]) => (
                            <tr key={col}>
                              <td className="py-1.5 font-mono text-xs font-semibold text-[#059669]">{col}</td>
                              <td className="py-1.5 text-[#333]">{desc}</td>
                              <td className="py-1.5 text-[#999] italic">{ex}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="border border-[#ccc] rounded-lg overflow-hidden">
                    <div className="bg-[#F6F2EB] px-4 py-2">
                      <h4 className="text-[11px] font-bold text-[#555] uppercase tracking-widest">Colunas opcionais</h4>
                    </div>
                    <div className="p-4">
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-[#EAECF0]">
                          {[
                            ['cliente_cpf_cnpj', 'CPF ou CNPJ do cliente', '12345678900'],
                            ['tipo', 'Tipo: servico, produto, pacote, contrato', 'servico'],
                            ['desconto', 'Valor do desconto', '50,00'],
                            ['parcelas', 'Nº de parcelas (quando parcelado)', '3'],
                            ['observacoes', 'Observações da venda', 'Ref. março/2026'],
                          ].map(([col, desc, ex]) => (
                            <tr key={col}>
                              <td className="py-1.5 font-mono text-xs font-semibold text-[#999]">{col}</td>
                              <td className="py-1.5 text-[#333]">{desc}</td>
                              <td className="py-1.5 text-[#999] italic">{ex}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="bg-[#ECFDF4] border border-[#c5d5e8] rounded-lg p-4">
                    <p className="text-xs text-[#555] mb-1"><strong>Formas de pagamento aceitas:</strong></p>
                    <p className="text-xs text-[#777]">pix, dinheiro, cartao_credito, cartao_debito, boleto, parcelado</p>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={baixarModeloPlanilha}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-[#059669] bg-white border border-[#059669] rounded-md hover:bg-[#ECFDF4] transition-colors"
                    >
                      <Download size={14} /> Baixar modelo CSV
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#059669] rounded-md hover:bg-[#1D2939] transition-colors"
                    >
                      <Upload size={14} /> Selecionar planilha
                    </button>
                  </div>
                </div>
              )}

              {/* Error de parse */}
              {importError && !importResult && (
                <div className="p-4 bg-[#FEE2E2] border border-[#e57373] rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertCircle size={18} className="text-[#E53E3E] mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold text-[#E53E3E] text-sm">Erro ao processar planilha</p>
                      <p className="text-sm text-[#E53E3E]/80 mt-1 whitespace-pre-line">{importError}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={baixarModeloPlanilha}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-[#059669] bg-white border border-[#059669] rounded hover:bg-[#ECFDF4] transition-colors"
                    >
                      <Download size={12} /> Baixar modelo
                    </button>
                  </div>
                </div>
              )}

              {/* Result */}
              {importResult && (
                <div className={`p-4 rounded-lg border ${importResult.fail > 0 ? 'bg-[#fff8e1] border-[#ffc107]' : 'bg-[#ECFDF3] border-[#039855]'}`}>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 size={20} className="text-[#039855]" />
                    <div>
                      <p className="font-semibold text-sm">Importação concluída</p>
                      <p className="text-sm mt-0.5">
                        <span className="text-[#039855] font-semibold">{importResult.ok} vendas importadas</span>
                        {importResult.fail > 0 && (
                          <span className="text-[#E53E3E] font-semibold ml-2">{importResult.fail} com erro</span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Preview table */}
              {importRows.length > 0 && !importResult && (
                <>
                  {/* Summary */}
                  <div className="flex items-center gap-4 text-sm">
                    <span className="font-semibold text-[#1D2939]">
                      {importRows.length} linha{importRows.length !== 1 ? 's' : ''} encontrada{importRows.length !== 1 ? 's' : ''}
                    </span>
                    {importErros > 0 && (
                      <span className="flex items-center gap-1 text-[#E53E3E] font-semibold">
                        <XCircle size={14} /> {importErros} com erro{importErros !== 1 ? 's' : ''} (serão ignoradas)
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-[#039855] font-semibold">
                      <CheckCircle2 size={14} /> {importRows.filter(r => r.erros.length === 0).length} válida{importRows.filter(r => r.erros.length === 0).length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Config row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#555] mb-1">Conta bancária destino *</label>
                      <select
                        value={importContaBancaria}
                        onChange={e => setImportContaBancaria(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#1D2939] focus:outline-none focus:border-[#059669] focus:ring-1 focus:ring-[#059669]"
                      >
                        <option value="">Selecione...</option>
                        {bankAccounts.map(b => (
                          <option key={b.id} value={b.id}>{b.name}{b.banco ? ` (${b.banco})` : ''}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#555] mb-1">Centro de custo (opcional)</label>
                      <select
                        value={importCentroCusto}
                        onChange={e => setImportCentroCusto(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#1D2939] focus:outline-none focus:border-[#059669] focus:ring-1 focus:ring-[#059669]"
                      >
                        <option value="">Nenhum</option>
                        {centrosCusto.map(c => (
                          <option key={c.id} value={c.id}>{c.codigo} - {c.descricao}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Table */}
                  <div className="border border-[#ccc] rounded-lg overflow-hidden">
                    <div className="overflow-x-auto max-h-[40vh]">
                      <table className="w-full text-sm">
                        <thead className="bg-[#F6F2EB] sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left text-[11px] font-bold text-[#555] uppercase">Linha</th>
                            <th className="px-3 py-2 text-left text-[11px] font-bold text-[#555] uppercase">Cliente</th>
                            <th className="px-3 py-2 text-left text-[11px] font-bold text-[#555] uppercase">Descrição</th>
                            <th className="px-3 py-2 text-right text-[11px] font-bold text-[#555] uppercase">Qtd</th>
                            <th className="px-3 py-2 text-right text-[11px] font-bold text-[#555] uppercase">Vlr Unit.</th>
                            <th className="px-3 py-2 text-right text-[11px] font-bold text-[#555] uppercase">Total</th>
                            <th className="px-3 py-2 text-left text-[11px] font-bold text-[#555] uppercase">Data</th>
                            <th className="px-3 py-2 text-left text-[11px] font-bold text-[#555] uppercase">Pagamento</th>
                            <th className="px-3 py-2 text-left text-[11px] font-bold text-[#555] uppercase">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#eee]">
                          {importRows.map((row, idx) => {
                            const hasError = row.erros.length > 0
                            return (
                              <tr key={idx} className={hasError ? 'bg-[#FEE2E2]' : 'hover:bg-[#F6F2EB]'}>
                                <td className="px-3 py-2 text-[#999] text-xs">{row.linha}</td>
                                <td className="px-3 py-2 font-medium text-[#1D2939]">
                                  {row.cliente_nome || '-'}
                                  {row.cliente_cpf_cnpj && (
                                    <span className="block text-[11px] text-[#999]">{row.cliente_cpf_cnpj}</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-[#333] max-w-[200px] truncate">{row.descricao || '-'}</td>
                                <td className="px-3 py-2 text-right text-[#333]">{row.quantidade}</td>
                                <td
                                  className="px-3 py-2 text-right text-[#333] cursor-help"
                                  title={`Valor cru da planilha: "${row.raw_valor_unitario}"`}
                                >
                                  {formatBRL(row.valor_unitario)}
                                </td>
                                <td className="px-3 py-2 text-right font-semibold text-[#1D2939]">{formatBRL(row.valor_total)}</td>
                                <td
                                  className="px-3 py-2 text-[#333] cursor-help"
                                  title={`Valor cru da planilha: "${row.raw_data_venda}"`}
                                >
                                  {row.data_venda ? formatData(row.data_venda) : '-'}
                                </td>
                                <td className="px-3 py-2 text-[#333]">{LABEL_FORMA[row.forma_pagamento] || row.forma_pagamento}</td>
                                <td className="px-3 py-2">
                                  {hasError ? (
                                    <span className="flex items-center gap-1 text-[#E53E3E] text-xs font-semibold" title={row.erros.join(', ')}>
                                      <XCircle size={12} /> {row.erros[0]}
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-1 text-[#039855] text-xs font-semibold">
                                      <CheckCircle2 size={12} /> OK
                                    </span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Progress Bar */}
            {importando && importProgress.total > 0 && (
              <div className="border-t border-[#eee] px-5 py-3 bg-white">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-[#059669]">
                    Importando vendas... {importProgress.current} de {importProgress.total}
                  </span>
                  <span className="text-xs font-bold text-[#059669]">
                    {Math.round((importProgress.current / importProgress.total) * 100)}%
                  </span>
                </div>
                <div className="w-full h-2.5 bg-[#EAECF0] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#059669] rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                  />
                </div>
                <p className="text-[11px] text-[#888] mt-1">
                  Não feche esta janela enquanto a importação estiver em andamento
                </p>
              </div>
            )}

            {/* Footer */}
            <div className="border-t border-[#eee] px-5 py-3 flex items-center justify-between bg-[#F6F2EB] rounded-b-lg">
              <button
                onClick={baixarModeloPlanilha}
                className="flex items-center gap-2 text-xs font-semibold text-[#555] hover:text-[#059669] transition-colors"
              >
                <Download size={12} /> Baixar modelo CSV
              </button>
              <div className="flex gap-2">
                <button
                  onClick={fecharModalImport}
                  disabled={importando}
                  className="px-4 py-2 text-sm font-medium text-[#555] border border-[#ccc] rounded-md hover:bg-[#F6F2EB] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {importResult ? 'Fechar' : 'Cancelar'}
                </button>
                {!importResult && importRows.length > 0 && (
                  <button
                    onClick={executarImportacao}
                    disabled={importando || !importContaBancaria || importRows.filter(r => r.erros.length === 0).length === 0}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#059669] rounded-md hover:bg-[#1D2939] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {importando ? (
                      <><Loader2 size={14} className="animate-spin" /> Importando...</>
                    ) : (
                      <><Check size={14} /> Importar {importRows.filter(r => r.erros.length === 0).length} venda{importRows.filter(r => r.erros.length === 0).length !== 1 ? 's' : ''}</>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chooser pos-venda: WhatsApp / E-mail / Pular */}
      {posVenda?.step === 'choose' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(15,30,51,0.45)' }} onClick={() => setPosVenda(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-[92%] p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-[#1D2939] mb-1">Compartilhar comprovante</h3>
            <p className="text-[12px] text-[#667085] mb-4">
              Venda de <strong>{formatBRL(posVenda.valor)}</strong> para <strong>{posVenda.cliente}</strong> registrada.
            </p>
            <div className="space-y-2">
              <button
                onClick={() => setPosVenda({ ...posVenda, step: 'whats' })}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-md border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-colors text-left"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#059669"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2z"/></svg>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-emerald-700">Enviar por WhatsApp</p>
                  {posVenda.phone && <p className="text-[11px] text-emerald-600">{posVenda.phone}</p>}
                </div>
              </button>
              <button
                onClick={() => setPosVenda({ ...posVenda, step: 'email' })}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-md border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors text-left"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1E3A8A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[#1E3A8A]">Enviar por E-mail</p>
                  {posVenda.email && <p className="text-[11px] text-blue-700">{posVenda.email}</p>}
                </div>
              </button>
              <button
                onClick={() => setPosVenda(null)}
                className="w-full px-4 py-2 text-[12px] text-[#667085] hover:bg-[#F6F2EB] rounded-md transition-colors"
              >
                Pular — não enviar agora
              </button>
            </div>
          </div>
        </div>
      )}

      <SendWhatsAppDialog
        open={posVenda?.step === 'whats'}
        onClose={() => setPosVenda(null)}
        title="Enviar comprovante de venda via WhatsApp"
        subtitle={posVenda && (
          <>
            <p className="font-semibold text-[#1D2939]">{posVenda.cliente}</p>
            <p className="text-[#667085] mt-0.5">{formatBRL(posVenda.valor)}</p>
          </>
        )}
        defaultPhone={posVenda?.phone || ''}
        defaultText={posVenda?.whatsText || ''}
      />

      <SendEmailDialog
        open={posVenda?.step === 'email'}
        onClose={() => setPosVenda(null)}
        title="Enviar comprovante de venda por E-mail"
        subtitle={posVenda && (
          <>
            <p className="font-semibold text-[#1D2939]">{posVenda.cliente}</p>
            <p className="text-[#667085] mt-0.5">{formatBRL(posVenda.valor)}</p>
          </>
        )}
        defaultTo={posVenda?.email || ''}
        defaultSubject={posVenda?.emailAssunto || ''}
        defaultBody={posVenda?.emailCorpo || ''}
      />

      {/* Dialog de pagamento/quitação de contrato existente (vindo do banner) */}
      <RegistrarPagamentoDialog
        contrato={pagamentoContrato ? ({
          id: pagamentoContrato.contrato.id,
          descricao: pagamentoContrato.contrato.procedimento || (pagamentoContrato.contrato.tipo === 'contrato' ? 'Contrato' : 'Pacote'),
          consultora: null,
          procedimento: pagamentoContrato.contrato.procedimento,
          valor_total: pagamentoContrato.contrato.valor_total,
          reserva_valor: null,
          reserva_data: null,
          forma_pagamento: null,
          parcelas_qtd: 0,
          data_venda: pagamentoContrato.contrato.data_venda,
          data_contrato: pagamentoContrato.contrato.data_venda,
          previsao_cirurgia: null,
          contrato_url: null,
          status: 'confirmado',
          crs: [],
          total_pago: pagamentoContrato.contrato.total_pago,
          saldo: pagamentoContrato.contrato.saldo,
          parcelas_pagas: 0,
        } as any) : null}
        clientName={formCliente}
        clientCpfCnpj={formCpfCnpj}
        modoQuitacao={pagamentoContrato?.modoQuitacao || false}
        onClose={() => {
          const wasOpen = !!pagamentoContrato
          setPagamentoContrato(null)
          if (wasOpen) {
            // Fecha o modal Nova Venda e recarrega a lista de vendas
            setModalAberto(false)
            setEditandoVenda(null)
            resetForm()
            fetchVendas()
          }
        }}
      />
    </AppLayout>
  )
}
