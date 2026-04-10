import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { safeQuery } from '@/lib/supabaseQuery'
import { formatBRL, formatData, formatCPF, formatCNPJ } from '@/lib/format'
import { quitarCR } from '@/lib/financeiro/transacao'
import { AppLayout } from '@/components/layout/AppLayout'
import {
  Search, Plus, Eye, Trash2, X, Pencil,
  Loader2, AlertCircle, Check, Package,
  Briefcase, FileText, RefreshCw, CreditCard, Banknote,
  QrCode, Receipt, Calendar, UserPlus, ChevronDown,
  Upload, Download, CheckCircle2, XCircle
} from 'lucide-react'
import { parseVendasSpreadsheet, type VendaImportRow } from '@/lib/parsers/vendasSpreadsheet'
import { format, startOfMonth, endOfMonth, parseISO, addMonths, addDays } from 'date-fns'

// Cast supabase for GESTAP tables not in the generated types
const db = supabase as any

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
}

interface BankAccount {
  id: string
  name: string
  banco?: string
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
}

interface NovoItem {
  descricao: string
  quantidade: number
  valor_unitario: number
  produto_id?: string
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
] as const

const FORMAS_A_VISTA = ['pix', 'dinheiro', 'cartao_debito']
const FORMAS_A_PRAZO = ['parcelado', 'boleto', 'cartao_credito']

const LABEL_FORMA: Record<string, string> = {
  pix: 'PIX/TED', dinheiro: 'Dinheiro', cartao_credito: 'Cartão crédito',
  cartao_debito: 'Cartão débito', boleto: 'Boleto', parcelado: 'Parcelado',
}

const LABEL_TIPO: Record<string, string> = {
  servico: 'Serviço', produto: 'Produto', pacote: 'Pacote', contrato: 'Contrato',
}

/* ================================================================
   COMPONENT
   ================================================================ */

export default function Vendas() {
  const { selectedCompany } = useCompany()
  const { activeClient, isUsingSecondary, user } = useAuth()

  // ─── Data state ──────────────────────────────────────────────
  const [vendas, setVendas] = useState<Venda[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [centrosCusto, setCentrosCusto] = useState<CentroCusto[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [defaultReceitaContaId, setDefaultReceitaContaId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ─── Filter state ────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('')
  const [mesAtual, setMesAtual] = useState(() => format(new Date(), 'yyyy-MM'))
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroForma, setFiltroForma] = useState('')

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
  const [formPagamento, setFormPagamento] = useState<string>('pix')
  const [formParcelas, setFormParcelas] = useState(1)
  const [formContaBancaria, setFormContaBancaria] = useState('')
  const [formCentroCusto, setFormCentroCusto] = useState('')

  // ─── Taxa preview state ──────────────────────────────────────
  const [taxaPreview, setTaxaPreview] = useState<any>(null)

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

  const mesDate = useMemo(() => {
    const [y, m] = mesAtual.split('-').map(Number)
    return new Date(y, m - 1, 1)
  }, [mesAtual])

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

  const isAVista = FORMAS_A_VISTA.includes(formPagamento)

  // ─── Filtered data ──────────────────────────────────────────
  const vendasFiltradas = useMemo(() => {
    return vendas.filter((v) => {
      if (searchTerm && !v.cliente_nome.toLowerCase().includes(searchTerm.toLowerCase())) return false
      if (filtroTipo && v.tipo !== filtroTipo) return false
      if (filtroForma && v.forma_pagamento !== filtroForma) return false
      return true
    })
  }, [vendas, searchTerm, filtroTipo, filtroForma])

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
  const kpis = useMemo(() => {
    const total = vendas.reduce((s, v) => s + (v.valor_total || 0), 0)
    const count = vendas.length
    const ticket = count > 0 ? total / count : 0
    const aVista = vendas
      .filter((v) => FORMAS_A_VISTA.includes(v.forma_pagamento))
      .reduce((s, v) => s + (v.valor_total || 0), 0)
    const aPrazo = vendas
      .filter((v) => FORMAS_A_PRAZO.includes(v.forma_pagamento))
      .reduce((s, v) => s + (v.valor_total || 0), 0)
    return { total, count, ticket, aVista, aPrazo }
  }, [vendas])

  // ─── Fetch data ──────────────────────────────────────────────
  // Query dividida em 3 flat queries paralelas em vez de nested embed.
  // Nested select (`vendas_itens(*), contas_receber(*)`) estava estourando
  // statement timeout quando o histórico crescia. Flat + IN (...) é muito
  // mais barato para o PostgREST e usa os índices em venda_id.
  const fetchVendas = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    try {
      const inicio = format(startOfMonth(mesDate), 'yyyy-MM-dd')
      const fim = format(endOfMonth(mesDate), 'yyyy-MM-dd')

      const pageSize = 1000
      const vendasBase: Venda[] = []
      let fromIdx = 0
      while (true) {
        const { data, error: err } = await db
          .from('vendas')
          .select('id, company_id, cliente_nome, cliente_cpf_cnpj, tipo, valor_total, data_venda, forma_pagamento, status')
          .eq('company_id', companyId)
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
            .select('id, venda_id, status, valor, valor_pago, data_vencimento')
            .in('venda_id', ids)
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
        vendas_itens: itensByVenda.get(v.id) || [],
        contas_receber: crsByVenda.get(v.id) || [],
      }))

      setVendas(all)
    } catch (e: any) {
      setError(e.message || 'Erro ao buscar vendas')
    } finally {
      setLoading(false)
    }
  }, [companyId, mesDate])

  const fetchAuxData = useCallback(async () => {
    if (!companyId || !activeClient) return

    const ac = activeClient as any
    const [banksRes, centrosRes, clientesRes, produtosRes, receitaContaRes] = await Promise.all([
      ac.from('bank_accounts').select('id, name, banco').eq('company_id', companyId).eq('is_active', true),
      ac.from('centros_custo').select('id, codigo, descricao').eq('company_id', companyId).eq('ativo', true),
      ac.from('clients').select('id, razao_social, nome_fantasia, cpf_cnpj, email').eq('company_id', companyId).eq('is_active', true).order('razao_social'),
      ac.from('products').select('id, code, description, price, unidade_medida').eq('company_id', companyId).order('description'),
      ac.from('chart_of_accounts')
        .select('id, code')
        .eq('company_id', companyId)
        .eq('account_type', 'revenue')
        .eq('is_analytical', true)
        .eq('status', 'active')
        .order('code')
        .limit(1)
        .maybeSingle(),
    ])

    setBankAccounts((banksRes.data as BankAccount[]) || [])
    setCentrosCusto((centrosRes.data as CentroCusto[]) || [])
    setClientes((clientesRes.data as Cliente[]) || [])
    setDefaultReceitaContaId((receitaContaRes.data as any)?.id || null)
    if (!(receitaContaRes.data as any)?.id) {
      console.warn('[Vendas] Nenhuma conta de receita analítica encontrada no plano de contas — CRs serão criados sem classificação e não aparecerão no DRE.')
    }

    // Fallback: se activeClient não retornou produtos, tentar com db
    let prods = (produtosRes.data as Produto[]) || []
    if (prods.length === 0) {
      const fallback = await db.from('products').select('id, code, description, price, unidade_medida').eq('company_id', companyId).order('description')
      prods = (fallback.data as Produto[]) || []
    }
    setProdutos(prods)
  }, [companyId, activeClient])

  useEffect(() => { fetchVendas() }, [fetchVendas])
  useEffect(() => { fetchAuxData() }, [fetchAuxData])

  // ─── Fetch taxa config when account + payment method changes ──
  useEffect(() => {
    if (!formContaBancaria || !formPagamento) { setTaxaPreview(null); return }
    const meioPgto = formPagamento === 'parcelado' ? 'cartao_credito' : formPagamento
    ;(async () => {
      const { data } = await db
        .from('configuracao_taxas_pagamento')
        .select('*')
        .eq('bank_account_id', formContaBancaria)
        .eq('meio_pagamento', meioPgto)
        .eq('ativo', true)
        .maybeSingle()
      setTaxaPreview(data || null)
    })()
  }, [formContaBancaria, formPagamento])

  // ─── Close dropdowns on outside click ────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (clienteRef.current && !clienteRef.current.contains(e.target as Node)) {
        setClienteDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

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
    setFormPagamento('pix')
    setFormParcelas(1)
    setFormContaBancaria('')
    setFormCentroCusto('')
    setErroModal(null)
    setTaxaPreview(null)
  }

  function carregarVendaParaEdicao(venda: Venda) {
    resetForm()
    setEditandoVenda(venda)
    setFormTipo(venda.tipo)
    setFormCliente(venda.cliente_nome)
    setFormCpfCnpj(venda.cliente_cpf_cnpj || '')
    setClienteSearch(venda.cliente_nome)
    setFormDataVenda(venda.data_venda)
    setFormPagamento(venda.forma_pagamento)

    if (venda.vendas_itens && venda.vendas_itens.length > 0) {
      setFormItens(venda.vendas_itens.map(it => ({
        descricao: it.descricao,
        quantidade: it.quantidade,
        valor_unitario: it.valor_unitario,
      })))
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
      i === idx ? { ...it, descricao: p.description, valor_unitario: p.price || 0, produto_id: p.id } : it
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
    const anyParcial = crs.some(c => c.status === 'parcial')
    if (anyParcial) return 'parcial'
    return 'aberto'
  }

  function formatDoc(doc: string | null) {
    if (!doc) return '-'
    const clean = doc.replace(/\D/g, '')
    return clean.length <= 11 ? formatCPF(clean) : formatCNPJ(clean)
  }

  // ─── Salvar novo cliente ───────────────────────────────────
  async function salvarNovoCliente() {
    if (!companyId || !novoClienteNome.trim()) return
    setSalvandoCliente(true)
    try {
      const { data, error: err } = await db.from('clients').insert({
        company_id: companyId,
        razao_social: novoClienteNome.trim(),
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
        cliente_nome: row.cliente_nome,
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
        descricao: row.descricao,
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

        for (let p = 0; p < numParcelas; p++) {
          const vencimento = isParcelado
            ? format(addMonths(parseISO(row.data_venda), p + 1), 'yyyy-MM-dd')
            : row.data_venda
          const valor = p === numParcelas - 1
            ? valorLiquido - valorParcela * (numParcelas - 1)
            : valorParcela

          crsPayload.push({
            company_id: companyId,
            pagador_nome: row.cliente_nome,
            pagador_cpf_cnpj: row.cliente_cpf_cnpj,
            valor,
            valor_pago: isImmediatePayment ? valor : 0,
            data_vencimento: vencimento,
            data_pagamento: isImmediatePayment ? row.data_venda : null,
            status: isImmediatePayment ? 'pago' : 'aberto',
            forma_recebimento: row.forma_pagamento,
            conta_contabil_id: defaultReceitaContaId,
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
    if (!formContaBancaria) { setErroModal('Selecione a conta bancária destino.'); return }

    setSalvando(true)
    setErroModal(null)

    try {
      let vendaId: string

      if (editandoVenda) {
        // UPDATE existing venda
        const { error: vendaErr } = await db
          .from('vendas')
          .update({
            cliente_nome: formCliente.trim(),
            cliente_cpf_cnpj: formCpfCnpj.replace(/\D/g, '') || null,
            tipo: formTipo,
            valor_total: totalVenda,
            data_venda: formDataVenda,
            forma_pagamento: formPagamento,
          })
          .eq('id', editandoVenda.id)

        if (vendaErr) throw vendaErr
        vendaId = editandoVenda.id

        // Delete old itens and CRs to re-create
        const ac = activeClient as any
        await ac.from('contas_receber').delete().eq('venda_id', vendaId)
        await ac.from('vendas_itens').delete().eq('venda_id', vendaId)
      } else {
        // INSERT new venda
        const { data: vendaData, error: vendaErr } = await db
          .from('vendas')
          .insert({
            company_id: companyId,
            cliente_nome: formCliente.trim(),
            cliente_cpf_cnpj: formCpfCnpj.replace(/\D/g, '') || null,
            tipo: formTipo,
            valor_total: totalVenda,
            data_venda: formDataVenda,
            forma_pagamento: formPagamento,
            status: 'confirmado',
          })
          .select()
          .single()

        if (vendaErr) throw vendaErr
        vendaId = vendaData.id
      }

      // 2. Insert itens
      const itensPayload = formItens.map(it => ({
        venda_id: vendaId,
        descricao: it.descricao.trim(),
        quantidade: it.quantidade,
        valor_unitario: it.valor_unitario,
      }))

      const { error: itensErr } = await db.from('vendas_itens').insert(itensPayload)
      if (itensErr) throw itensErr

      // 3. Buscar configuração de taxas para esta conta + meio de pagamento
      const meioPgto = formPagamento === 'parcelado' ? 'cartao_credito' : formPagamento
      let taxaConfig: any = null
      {
        const { data: cfgData } = await db
          .from('configuracao_taxas_pagamento')
          .select('*')
          .eq('bank_account_id', formContaBancaria)
          .eq('meio_pagamento', meioPgto)
          .eq('ativo', true)
          .maybeSingle()
        taxaConfig = cfgData
      }

      // 4. Calcular valores com taxa
      const taxaPct = taxaConfig?.taxa_percentual || 0
      const valorTaxa = Math.round((totalVenda * taxaPct / 100) * 100) / 100
      const valorLiquido = Math.round((totalVenda - valorTaxa) * 100) / 100

      const isParcelado = formPagamento === 'parcelado' || formPagamento === 'cartao_credito'
      const numParcelas = isParcelado
        ? Math.min(formParcelas, taxaConfig?.max_parcelas || formParcelas)
        : 1

      const diasRecebimento = taxaConfig?.dias_recebimento || 0
      const temAntecipacao = taxaConfig?.antecipacao_ativa || false
      const taxaAntecipacao = taxaConfig?.taxa_antecipacao || 0

      // 5. Generate CRs com projeção de recebimento
      let crsPayload: any[]

      if (temAntecipacao && isParcelado && numParcelas > 1) {
        // COM ANTECIPAÇÃO: recebe tudo de uma vez, mas com desconto extra
        // Taxa de antecipação = taxa_antecipacao% * (prazo médio em meses)
        const prazoMedioMeses = (numParcelas + 1) / 2  // média das parcelas
        const descontoAntecipacao = Math.round((valorLiquido * taxaAntecipacao / 100 * prazoMedioMeses) * 100) / 100
        const valorAntecipado = Math.round((valorLiquido - descontoAntecipacao) * 100) / 100

        const dataRecebimento = format(
          addDays(parseISO(formDataVenda), diasRecebimento || 1),
          'yyyy-MM-dd'
        )

        crsPayload = [{
          company_id: companyId,
          pagador_nome: formCliente.trim(),
          pagador_cpf_cnpj: formCpfCnpj.replace(/\D/g, '') || null,
          valor: valorAntecipado,
          valor_pago: 0,
          data_vencimento: dataRecebimento,
          status: 'aberto',
          forma_recebimento: formPagamento,
          conta_contabil_id: null,
          centro_custo_id: formCentroCusto || null,
          venda_id: vendaId,
          observacoes: `Venda ${numParcelas}x antecipada | Bruto: R$${totalVenda.toFixed(2)} | Taxa operadora: ${taxaPct}% (R$${valorTaxa.toFixed(2)}) | Antecipação: ${taxaAntecipacao}% a.m. (R$${descontoAntecipacao.toFixed(2)})`,
        }]
      } else if (isParcelado && numParcelas > 1) {
        // SEM ANTECIPAÇÃO: recebe parcela a parcela
        const valorParcelaLiq = Math.round((valorLiquido / numParcelas) * 100) / 100

        crsPayload = Array.from({ length: numParcelas }, (_, i) => {
          const dataBase = addMonths(parseISO(formDataVenda), i + 1)
          const dataRecebimento = diasRecebimento > 0
            ? format(addDays(dataBase, diasRecebimento), 'yyyy-MM-dd')
            : format(dataBase, 'yyyy-MM-dd')

          const valor = i === numParcelas - 1
            ? Math.round((valorLiquido - valorParcelaLiq * (numParcelas - 1)) * 100) / 100
            : valorParcelaLiq

          return {
            company_id: companyId,
            pagador_nome: formCliente.trim(),
            pagador_cpf_cnpj: formCpfCnpj.replace(/\D/g, '') || null,
            valor,
            valor_pago: 0,
            data_vencimento: dataRecebimento,
            status: 'aberto',
            forma_recebimento: formPagamento,
            conta_contabil_id: defaultReceitaContaId,
            centro_custo_id: formCentroCusto || null,
            venda_id: vendaId,
            observacoes: taxaPct > 0
              ? `Parcela ${i + 1}/${numParcelas} | Taxa operadora: ${taxaPct}%`
              : `Parcela ${i + 1}/${numParcelas}`,
          }
        })
      } else {
        // À VISTA (pix, dinheiro, débito, boleto sem parcela)
        const dataRecebimento = diasRecebimento > 0
          ? format(addDays(parseISO(formDataVenda), diasRecebimento), 'yyyy-MM-dd')
          : formDataVenda

        crsPayload = [{
          company_id: companyId,
          pagador_nome: formCliente.trim(),
          pagador_cpf_cnpj: formCpfCnpj.replace(/\D/g, '') || null,
          valor: valorLiquido,
          valor_pago: 0,
          data_vencimento: dataRecebimento,
          status: 'aberto',
          forma_recebimento: formPagamento,
          conta_contabil_id: null,
          centro_custo_id: formCentroCusto || null,
          venda_id: vendaId,
          observacoes: taxaPct > 0
            ? `Taxa operadora: ${taxaPct}% (R$${valorTaxa.toFixed(2)})`
            : null,
        }]
      }

      const { data: crsData, error: crsErr } = await db
        .from('contas_receber')
        .insert(crsPayload)
        .select()

      if (crsErr) throw crsErr

      // 6. If à vista (sem parcelas ou crédito 1x), quitar immediately
      const deveQuitar = (isAVista && !isParcelado) || (isParcelado && numParcelas === 1)
      if (deveQuitar && crsData && crsData.length > 0) {
        const cr = crsData[0]
        await quitarCR(cr.id, {
          valorPago: cr.valor,
          dataPagamento: formDataVenda,
          formaRecebimento: formPagamento,
          contaBancariaId: formContaBancaria,
        })
      }

      resetForm()
      setEditandoVenda(null)
      setModalAberto(false)
      await fetchVendas()
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
      // Deletar CRs vinculados, itens e a venda
      await ac.from('contas_receber').delete().eq('venda_id', id)
      await ac.from('vendas_itens').delete().eq('venda_id', id)
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
      const inicio = format(startOfMonth(mesDate), 'yyyy-MM-dd')
      const fim = format(endOfMonth(mesDate), 'yyyy-MM-dd')

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

        const { error: errCR } = await ac
          .from('contas_receber')
          .update({ deleted_at: nowIso, deleted_by: user?.id || null })
          .in('venda_id', slice)
          .is('deleted_at', null)
        if (errCR) throw errCR

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
      pago: 'text-[#0a5c2e] bg-[#e6f4ec] border border-[#0a5c2e]',
      aberto: 'text-[#1a2e4a] bg-[#f0f4f8] border border-[#1a2e4a]',
      parcial: 'text-[#5c3a00] bg-[#fffbe6] border border-[#b8960a]',
      avista: 'text-[#555] bg-[#f5f5f5] border border-[#ccc]',
    }
    const labels: Record<string, string> = {
      pago: 'Pago', aberto: 'CR \u2014 aberto', parcial: 'CR \u2014 parcial', avista: 'À vista',
    }
    return (
      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${styles[st]}`}>
        {labels[st]}
      </span>
    )
  }

  function TipoBadge({ tipo }: { tipo: string }) {
    return (
      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold text-[#555] bg-[#f5f5f5] border border-[#ccc]">
        {LABEL_TIPO[tipo] || tipo}
      </span>
    )
  }

  /* ================================================================
     RENDER
     ================================================================ */
  return (
    <AppLayout>
      <div className="max-w-[1400px] mx-auto space-y-5">

        {/* ─── KPIs ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: 'Vendas do mês', value: formatBRL(kpis.total), color: '#1a2e4a' },
            { label: 'Vendas', value: String(kpis.count), color: '#1a2e4a' },
            { label: 'Ticket médio', value: formatBRL(kpis.ticket), color: '#1a2e4a' },
            { label: 'À vista', value: formatBRL(kpis.aVista), color: '#0a5c2e' },
            { label: 'A prazo', value: formatBRL(kpis.aPrazo), color: '#5c3a00' },
          ].map(kpi => (
            <div key={kpi.label} className="border border-[#ccc] rounded-lg overflow-hidden">
              <div className="bg-[#1a2e4a] px-4 py-2">
                <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">{kpi.label}</h3>
              </div>
              <div className="p-4 bg-white">
                <p className="text-xl font-bold" style={{ color: kpi.color }}>{kpi.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ─── Filtros ──────────────────────────────────────── */}
        <div className="border border-[#ccc] rounded-lg overflow-hidden">
          <div className="bg-[#1a2e4a] px-4 py-2.5 flex items-center justify-between">
            <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">Filtros</h3>
            <button
              onClick={() => { setSearchTerm(''); setFiltroTipo(''); setFiltroForma('') }}
              className="text-[11px] font-semibold text-[#a8bfd4] hover:text-white transition-colors"
            >
              Limpar
            </button>
          </div>
          <div className="p-4 bg-white grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#999]" />
              <input
                type="text"
                placeholder="Buscar cliente..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#0a0a0a] placeholder-[#999] focus:outline-none focus:border-[#1a2e4a] focus:ring-1 focus:ring-[#1a2e4a]"
              />
            </div>
            {/* Month */}
            <input
              type="month"
              value={mesAtual}
              onChange={e => setMesAtual(e.target.value)}
              className="px-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#0a0a0a] focus:outline-none focus:border-[#1a2e4a] focus:ring-1 focus:ring-[#1a2e4a]"
            />
            {/* Tipo */}
            <select
              value={filtroTipo}
              onChange={e => setFiltroTipo(e.target.value)}
              className="px-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#0a0a0a] focus:outline-none focus:border-[#1a2e4a]"
            >
              <option value="">Todos os tipos</option>
              {TIPOS_VENDA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            {/* Forma */}
            <select
              value={filtroForma}
              onChange={e => setFiltroForma(e.target.value)}
              className="px-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#0a0a0a] focus:outline-none focus:border-[#1a2e4a]"
            >
              <option value="">Todas as formas</option>
              {FORMAS_PAGAMENTO.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            {/* Ações */}
            <div className="flex gap-2">
              <button
                onClick={() => { setModalImport(true); setImportRows([]); setImportError(null); setImportResult(null) }}
                className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-[#1a2e4a] bg-white border border-[#1a2e4a] rounded-md hover:bg-[#f0f4f8] transition-colors"
              >
                <Upload size={14} /> Importar
              </button>
              <button
                onClick={() => { resetForm(); setEditandoVenda(null); setModalAberto(true) }}
                className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#1a2e4a] rounded-md hover:bg-[#15253d] transition-colors"
              >
                <Plus size={14} /> Nova Venda
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileImport}
            />
          </div>
        </div>

        {/* ─── Tabela ───────────────────────────────────────── */}
        <div className="border border-[#ccc] rounded-lg overflow-hidden">
          <div className="bg-[#1a2e4a] px-4 py-2.5 flex items-center justify-between">
            <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">
              Vendas &mdash; {vendasFiltradas.length} registro{vendasFiltradas.length !== 1 ? 's' : ''}
            </h3>
            <button
              onClick={() => setConfirmDeleteMes(true)}
              disabled={vendas.length === 0}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-[#a8bfd4] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Excluir todas as vendas do mês selecionado"
            >
              <Trash2 size={12} /> Excluir mês
            </button>
          </div>
          <div className="bg-white overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-[#555]">
                <Loader2 size={20} className="animate-spin mr-2" /> Carregando...
              </div>
            ) : error ? (
              <div className="flex items-center justify-center py-12 text-[#8b0000]">
                <AlertCircle size={16} className="mr-2" /> {error}
              </div>
            ) : vendasFiltradas.length === 0 ? (
              <div className="text-center py-12 text-[#555] text-sm">Nenhuma venda encontrada.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#f5f5f5] text-[10px] font-bold text-[#555] uppercase tracking-wider border-b border-[#ccc]">
                    <th className="text-left px-4 py-2.5">Cliente</th>
                    <th className="text-center px-3 py-2.5">Itens</th>
                    <th className="text-center px-3 py-2.5">Tipo</th>
                    <th className="text-center px-3 py-2.5">Data</th>
                    <th className="text-center px-3 py-2.5">Forma pgto</th>
                    <th className="text-right px-3 py-2.5">Valor total</th>
                    <th className="text-center px-3 py-2.5">CR</th>
                    <th className="text-center px-3 py-2.5 w-28">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {vendasFiltradas.map(v => (
                    <tr key={v.id} className="border-b border-[#eee] hover:bg-[#fafafa] transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#0a0a0a]">{v.cliente_nome}</div>
                        {v.cliente_cpf_cnpj && (
                          <div className="text-[11px] text-[#555]">{formatDoc(v.cliente_cpf_cnpj)}</div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center text-[#555]">{v.vendas_itens?.length || 0}</td>
                      <td className="px-3 py-3 text-center"><TipoBadge tipo={v.tipo} /></td>
                      <td className="px-3 py-3 text-center text-[#555]">{formatData(v.data_venda)}</td>
                      <td className="px-3 py-3 text-center text-[#555]">{LABEL_FORMA[v.forma_pagamento] || v.forma_pagamento}</td>
                      <td className="px-3 py-3 text-right font-semibold text-[#0a0a0a]">{formatBRL(v.valor_total)}</td>
                      <td className="px-3 py-3 text-center"><CRBadge venda={v} /></td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setModalDetalhes(v)} className="p-1.5 rounded hover:bg-[#f0f4f8] text-[#1a2e4a] transition-colors" title="Ver detalhes">
                            <Eye size={14} />
                          </button>
                          <button onClick={() => carregarVendaParaEdicao(v)} className="p-1.5 rounded hover:bg-[#f0f4f8] text-[#1a2e4a] transition-colors" title="Editar venda">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => setConfirmDelete(v.id)} className="p-1.5 rounded hover:bg-[#fdecea] text-[#8b0000] transition-colors" title="Excluir">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ================================================================
         MODAL NOVA VENDA
         ================================================================ */}
      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 my-auto">
            {/* Header */}
            <div className="bg-[#1a2e4a] px-5 py-3 flex items-center justify-between rounded-t-lg">
              <h2 className="text-[11px] font-bold text-white uppercase tracking-widest">{editandoVenda ? 'Editar Venda' : 'Nova Venda'}</h2>
              <button onClick={() => { setModalAberto(false); setEditandoVenda(null) }} className="text-[#a8bfd4] hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* Tipo */}
              <div>
                <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-2">Tipo</label>
                <div className="grid grid-cols-4 gap-2">
                  {TIPOS_VENDA.map(t => {
                    const Icon = t.icon
                    const sel = formTipo === t.value
                    return (
                      <button
                        key={t.value}
                        onClick={() => setFormTipo(t.value)}
                        className={`flex flex-col items-center gap-1 px-3 py-2.5 rounded-md border text-xs font-semibold transition-all ${
                          sel ? 'border-[#1a2e4a] bg-[#f0f4f8] text-[#1a2e4a]' : 'border-[#ccc] bg-white text-[#555] hover:border-[#999]'
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
                <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Cliente</label>
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
                        className="w-full pl-9 pr-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#0a0a0a] placeholder-[#999] focus:outline-none focus:border-[#1a2e4a] focus:ring-1 focus:ring-[#1a2e4a]"
                      />
                    </div>
                    <button
                      onClick={() => {
                        setModalNovoCliente(true)
                        setNovoClienteNome(clienteSearch)
                      }}
                      className="flex items-center gap-1 px-3 py-2 text-xs font-semibold text-[#1a2e4a] border border-[#1a2e4a] rounded-md hover:bg-[#f0f4f8] transition-colors whitespace-nowrap"
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
                            className="block mx-auto mt-2 text-[#1a2e4a] font-semibold hover:underline"
                          >
                            + Adicionar cliente
                          </button>
                        </div>
                      ) : (
                        clientesFiltrados.map(c => (
                          <button
                            key={c.id}
                            onClick={() => selectCliente(c)}
                            className={`w-full text-left px-3 py-2 hover:bg-[#f0f4f8] transition-colors border-b border-[#eee] last:border-b-0 ${
                              formClienteId === c.id ? 'bg-[#f0f4f8]' : ''
                            }`}
                          >
                            <div className="text-sm font-medium text-[#0a0a0a]">
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
                  <div className="mt-1.5 flex items-center gap-2 text-[11px] text-[#0a5c2e]">
                    <Check size={12} />
                    <span><strong>{formCliente}</strong> {formCpfCnpj && `· ${formatDoc(formCpfCnpj)}`}</span>
                  </div>
                )}
              </div>

              {/* Data */}
              <div>
                <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Data da venda</label>
                <input
                  type="date"
                  value={formDataVenda}
                  onChange={e => setFormDataVenda(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#0a0a0a] focus:outline-none focus:border-[#1a2e4a] focus:ring-1 focus:ring-[#1a2e4a]"
                />
              </div>

              {/* Itens — with product selector */}
              <div>
                <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-2">Itens</label>
                <div className="border border-[#ccc] rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#f5f5f5] text-[10px] font-bold text-[#555] uppercase tracking-wider">
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
                              className="w-full flex items-center gap-2 px-2 py-1 text-sm border border-[#ccc] rounded bg-white text-left hover:border-[#1a2e4a] hover:bg-[#f8fafc] transition-colors"
                            >
                              <Package size={13} className="text-[#999] shrink-0" />
                              <span className={it.descricao ? 'text-[#0a0a0a]' : 'text-[#999]'}>
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
                              className="w-full px-2 py-1 text-sm text-center border border-[#ccc] rounded bg-white text-[#0a0a0a] focus:outline-none focus:border-[#1a2e4a]"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              value={it.valor_unitario}
                              onChange={e => updateItem(idx, 'valor_unitario', parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1 text-sm text-center border border-[#ccc] rounded bg-white text-[#0a0a0a] focus:outline-none focus:border-[#1a2e4a]"
                            />
                          </td>
                          <td className="px-3 py-1.5 text-right text-sm font-medium text-[#0a0a0a]">
                            {formatBRL(it.quantidade * it.valor_unitario)}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            {formItens.length > 1 && (
                              <button onClick={() => removeItem(idx)} className="text-[#8b0000] hover:text-red-700 transition-colors">
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
                  className="mt-2 text-[11px] font-semibold text-[#1a2e4a] hover:underline flex items-center gap-1"
                >
                  <Plus size={12} /> Item
                </button>
              </div>

              {/* Forma de pagamento */}
              <div>
                <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-2">Forma de pagamento</label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {FORMAS_PAGAMENTO.map(f => {
                    const Icon = f.icon
                    const sel = formPagamento === f.value
                    return (
                      <button
                        key={f.value}
                        onClick={() => setFormPagamento(f.value)}
                        className={`flex flex-col items-center gap-1 px-2 py-2 rounded-md border text-[10px] font-semibold transition-all ${
                          sel ? 'border-[#1a2e4a] bg-[#f0f4f8] text-[#1a2e4a]' : 'border-[#ccc] bg-white text-[#555] hover:border-[#999]'
                        }`}
                      >
                        <Icon size={14} />
                        {f.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Parcelas — cartão crédito e parcelado */}
              {(formPagamento === 'parcelado' || formPagamento === 'cartao_credito') && (
                <div>
                  <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Numero de parcelas</label>
                  <select
                    value={formParcelas}
                    onChange={e => setFormParcelas(parseInt(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#0a0a0a] focus:outline-none focus:border-[#1a2e4a] focus:ring-1 focus:ring-[#1a2e4a]"
                  >
                    <option value={1}>1x de {formatBRL(totalVenda)} (à vista)</option>
                    {Array.from({ length: Math.min(taxaPreview?.max_parcelas || 12, 24) - 1 }, (_, i) => i + 2).map(n => (
                      <option key={n} value={n}>{n}x de {formatBRL(totalVenda / n)}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Taxa info badge */}
              {taxaPreview && (
                <div className="bg-[#f0f4f8] border border-[#1a2e4a]/20 rounded-md px-4 py-2.5 text-xs text-[#333]">
                  <p className="font-bold text-[10px] uppercase tracking-wider text-[#1a2e4a] mb-1">Taxas configuradas para esta conta</p>
                  <div className="flex flex-wrap gap-4">
                    <span>Taxa: <strong>{taxaPreview.taxa_percentual}%</strong></span>
                    <span>Prazo: <strong>D+{taxaPreview.dias_recebimento}</strong></span>
                    <span>Antecipacao: <strong>{taxaPreview.antecipacao_ativa ? `Sim (${taxaPreview.taxa_antecipacao}% a.m.)` : 'Nao'}</strong></span>
                    {taxaPreview.max_parcelas > 1 && <span>Max parcelas: <strong>{taxaPreview.max_parcelas}x</strong></span>}
                  </div>
                </div>
              )}

              {/* Conta bancária */}
              <div>
                <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Conta bancária destino</label>
                <select
                  value={formContaBancaria}
                  onChange={e => setFormContaBancaria(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#0a0a0a] focus:outline-none focus:border-[#1a2e4a] focus:ring-1 focus:ring-[#1a2e4a]"
                >
                  <option value="">Selecione...</option>
                  {bankAccounts.map(ba => (
                    <option key={ba.id} value={ba.id}>{ba.name}{ba.banco ? ` (${ba.banco})` : ''}</option>
                  ))}
                </select>
              </div>

              {/* Preview com taxas */}
              {totalVenda > 0 && (() => {
                const txPct = taxaPreview?.taxa_percentual || 0
                const vlTaxa = Math.round((totalVenda * txPct / 100) * 100) / 100
                const vlLiq = Math.round((totalVenda - vlTaxa) * 100) / 100
                const isParcl = formPagamento === 'parcelado' || formPagamento === 'cartao_credito'
                const nParcelas = isParcl ? Math.min(formParcelas, taxaPreview?.max_parcelas || formParcelas) : 1
                const diasRec = taxaPreview?.dias_recebimento || 0
                const temAntc = taxaPreview?.antecipacao_ativa || false
                const txAntc = taxaPreview?.taxa_antecipacao || 0

                return (
                  <div className="rounded-md border border-[#0a5c2e] bg-[#e6f4ec] p-3">
                    <div className="flex items-start gap-2">
                      <Check size={16} className="text-[#0a5c2e] mt-0.5 flex-shrink-0" />
                      <div className="text-[12px] text-[#0a5c2e] w-full">
                        {txPct > 0 && (
                          <p className="mb-1 text-[11px] text-[#555]">
                            Bruto: {formatBRL(totalVenda)} &minus; Taxa {txPct}%: {formatBRL(vlTaxa)} = <strong>Liquido: {formatBRL(vlLiq)}</strong>
                          </p>
                        )}

                        {temAntc && isParcl && nParcelas > 1 ? (() => {
                          const prazoMedio = (nParcelas + 1) / 2
                          const descAntc = Math.round((vlLiq * txAntc / 100 * prazoMedio) * 100) / 100
                          const vlAntecipado = Math.round((vlLiq - descAntc) * 100) / 100
                          const dataRec = format(addDays(parseISO(formDataVenda), diasRec || 1), 'dd/MM/yyyy')
                          return (
                            <>
                              <p className="font-semibold mb-1">CR antecipado ({nParcelas}x em parcela unica):</p>
                              <p>Valor: {formatBRL(vlAntecipado)} (antecipacao {txAntc}% a.m. = -{formatBRL(descAntc)})</p>
                              <p>Recebimento: {dataRec}</p>
                            </>
                          )
                        })() : isParcl && nParcelas > 1 ? (
                          <>
                            <p className="font-semibold mb-1">Contas a Receber &mdash; {nParcelas}x parcelas:</p>
                            <ul className="space-y-0.5">
                              {Array.from({ length: nParcelas }, (_, i) => {
                                const vpLiq = Math.round((vlLiq / nParcelas) * 100) / 100
                                const valor = i === nParcelas - 1 ? Math.round((vlLiq - vpLiq * (nParcelas - 1)) * 100) / 100 : vpLiq
                                const dataBase = addMonths(parseISO(formDataVenda), i + 1)
                                const venc = diasRec > 0
                                  ? format(addDays(dataBase, diasRec), 'dd/MM/yyyy')
                                  : format(dataBase, 'dd/MM/yyyy')
                                return <li key={i}>Parcela {i + 1}: {formatBRL(valor)} &middot; recebimento {venc}</li>
                              })}
                            </ul>
                          </>
                        ) : (
                          <p className="font-semibold">
                            CR: {formatBRL(vlLiq)} &middot; recebimento {
                              diasRec > 0
                                ? format(addDays(parseISO(formDataVenda), diasRec), 'dd/MM/yyyy')
                                : format(parseISO(formDataVenda), 'dd/MM/yyyy')
                            }
                            {isAVista && !isParcl && ' (quitado automaticamente)'}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* Error */}
              {erroModal && (
                <div className="rounded-md border border-[#8b0000] bg-[#fdecea] p-3 flex items-center gap-2 text-[12px] text-[#8b0000]">
                  <AlertCircle size={14} className="flex-shrink-0" />
                  {erroModal}
                </div>
              )}

              {/* Total + actions */}
              <div className="flex items-center justify-between pt-2 border-t border-[#ccc]">
                <div>
                  <span className="text-[10px] font-bold text-[#555] uppercase tracking-wider">Total: </span>
                  <span className="text-lg font-bold text-[#0a0a0a]">{formatBRL(totalVenda)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setModalAberto(false); setEditandoVenda(null) }}
                    className="px-4 py-2 text-sm font-medium text-[#555] border border-[#ccc] rounded-md hover:bg-[#f5f5f5] transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={salvarVenda}
                    disabled={salvando}
                    className="px-5 py-2 text-sm font-semibold text-white bg-[#1a2e4a] rounded-md hover:bg-[#15253d] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
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
            <div className="bg-[#1a2e4a] px-5 py-3 flex items-center justify-between rounded-t-lg">
              <h2 className="text-[11px] font-bold text-white uppercase tracking-widest">Novo Cliente</h2>
              <button onClick={() => setModalNovoCliente(false)} className="text-[#a8bfd4] hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Nome / Razão Social *</label>
                <input
                  type="text"
                  value={novoClienteNome}
                  onChange={e => setNovoClienteNome(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#0a0a0a] focus:outline-none focus:border-[#1a2e4a] focus:ring-1 focus:ring-[#1a2e4a]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">CPF/CNPJ</label>
                <input
                  type="text"
                  value={novoClienteCpfCnpj}
                  onChange={e => setNovoClienteCpfCnpj(e.target.value)}
                  placeholder="Opcional"
                  className="w-full px-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#0a0a0a] placeholder-[#999] focus:outline-none focus:border-[#1a2e4a] focus:ring-1 focus:ring-[#1a2e4a]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">E-mail</label>
                <input
                  type="email"
                  value={novoClienteEmail}
                  onChange={e => setNovoClienteEmail(e.target.value)}
                  placeholder="Opcional"
                  className="w-full px-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#0a0a0a] placeholder-[#999] focus:outline-none focus:border-[#1a2e4a] focus:ring-1 focus:ring-[#1a2e4a]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-[#ccc]">
                <button
                  onClick={() => setModalNovoCliente(false)}
                  className="px-4 py-2 text-sm font-medium text-[#555] border border-[#ccc] rounded-md hover:bg-[#f5f5f5] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={salvarNovoCliente}
                  disabled={salvandoCliente || !novoClienteNome.trim()}
                  className="px-5 py-2 text-sm font-semibold text-white bg-[#1a2e4a] rounded-md hover:bg-[#15253d] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
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
            <div className="bg-[#1a2e4a] px-5 py-3 flex items-center justify-between rounded-t-lg">
              <h2 className="text-[11px] font-bold text-white uppercase tracking-widest">Detalhes da Venda</h2>
              <button onClick={() => setModalDetalhes(null)} className="text-[#a8bfd4] hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-[10px] font-bold text-[#555] uppercase tracking-wider block">Cliente</span>
                  <span className="text-[#0a0a0a] font-medium">{modalDetalhes.cliente_nome}</span>
                  {modalDetalhes.cliente_cpf_cnpj && (
                    <span className="block text-[11px] text-[#555]">{formatDoc(modalDetalhes.cliente_cpf_cnpj)}</span>
                  )}
                </div>
                <div>
                  <span className="text-[10px] font-bold text-[#555] uppercase tracking-wider block">Data</span>
                  <span className="text-[#0a0a0a]">{formatData(modalDetalhes.data_venda)}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-[#555] uppercase tracking-wider block">Tipo</span>
                  <TipoBadge tipo={modalDetalhes.tipo} />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-[#555] uppercase tracking-wider block">Forma pgto</span>
                  <span className="text-[#0a0a0a]">{LABEL_FORMA[modalDetalhes.forma_pagamento] || modalDetalhes.forma_pagamento}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-[#555] uppercase tracking-wider block">Valor total</span>
                  <span className="text-[#0a0a0a] font-bold">{formatBRL(modalDetalhes.valor_total)}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-[#555] uppercase tracking-wider block">CR</span>
                  <CRBadge venda={modalDetalhes} />
                </div>
              </div>

              {/* Itens */}
              {modalDetalhes.vendas_itens && modalDetalhes.vendas_itens.length > 0 && (
                <div>
                  <span className="text-[10px] font-bold text-[#555] uppercase tracking-wider block mb-2">Itens</span>
                  <div className="border border-[#ccc] rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[#f5f5f5] text-[10px] font-bold text-[#555] uppercase tracking-wider">
                          <th className="text-left px-3 py-2">Descrição</th>
                          <th className="text-center px-3 py-2 w-16">Qtd</th>
                          <th className="text-right px-3 py-2 w-24">Unit.</th>
                          <th className="text-right px-3 py-2 w-24">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {modalDetalhes.vendas_itens.map(it => (
                          <tr key={it.id} className="border-t border-[#eee]">
                            <td className="px-3 py-2 text-[#0a0a0a]">{it.descricao}</td>
                            <td className="px-3 py-2 text-center text-[#555]">{it.quantidade}</td>
                            <td className="px-3 py-2 text-right text-[#555]">{formatBRL(it.valor_unitario)}</td>
                            <td className="px-3 py-2 text-right font-medium text-[#0a0a0a]">{formatBRL(it.valor_total)}</td>
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
                  <span className="text-[10px] font-bold text-[#555] uppercase tracking-wider block mb-2">Contas a Receber</span>
                  <div className="space-y-1.5">
                    {modalDetalhes.contas_receber.map((cr, idx) => (
                      <div key={cr.id} className="flex items-center justify-between text-sm px-3 py-2 border border-[#eee] rounded-md bg-[#fafafa]">
                        <span className="text-[#555]">
                          {modalDetalhes.contas_receber!.length > 1 ? `Parcela ${idx + 1}` : 'CR'} &mdash; venc. {formatData(cr.data_vencimento)}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-[#0a0a0a]">{formatBRL(cr.valor)}</span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                            cr.status === 'pago' ? 'text-[#0a5c2e] bg-[#e6f4ec]' :
                            cr.status === 'parcial' ? 'text-[#5c3a00] bg-[#fffbe6]' :
                            'text-[#1a2e4a] bg-[#f0f4f8]'
                          }`}>
                            {cr.status === 'pago' ? 'Pago' : cr.status === 'parcial' ? 'Parcial' : 'Aberto'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-[#ccc] flex justify-end gap-2">
                <button
                  onClick={() => setModalDetalhes(null)}
                  className="px-4 py-2 text-sm font-medium text-[#555] border border-[#ccc] rounded-md hover:bg-[#f5f5f5] transition-colors"
                >
                  Fechar
                </button>
                <button
                  onClick={() => carregarVendaParaEdicao(modalDetalhes)}
                  className="px-4 py-2 text-sm font-semibold text-white bg-[#1a2e4a] rounded-md hover:bg-[#15253d] transition-colors flex items-center gap-2"
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
                <div className="w-10 h-10 rounded-full bg-[#fdecea] flex items-center justify-center">
                  <Trash2 size={18} className="text-[#8b0000]" />
                </div>
                <div>
                  <h3 className="font-semibold text-[#0a0a0a]">Excluir venda</h3>
                  <p className="text-sm text-[#555]">Esta ação não pode ser desfeita.</p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="px-4 py-2 text-sm font-medium text-[#555] border border-[#ccc] rounded-md hover:bg-[#f5f5f5] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => deletarVenda(confirmDelete)}
                  className="px-4 py-2 text-sm font-semibold text-white bg-[#8b0000] rounded-md hover:bg-[#6d0000] transition-colors"
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
                <div className="w-10 h-10 rounded-full bg-[#fdecea] flex items-center justify-center">
                  <AlertCircle size={18} className="text-[#8b0000]" />
                </div>
                <div>
                  <h3 className="font-semibold text-[#0a0a0a]">Excluir todas as vendas do mês</h3>
                  <p className="text-sm text-[#555]">
                    {format(mesDate, 'MM/yyyy')} &mdash; {vendas.length} venda{vendas.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className="mb-4 p-3 rounded-md bg-[#fffbe6] border border-[#b8960a] text-[12px] text-[#5c3a00]">
                Todas as vendas, itens e contas a receber vinculadas ao mês selecionado serão removidas permanentemente. Esta ação não pode ser desfeita.
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setConfirmDeleteMes(false)}
                  disabled={deletandoMes}
                  className="px-4 py-2 text-sm font-medium text-[#555] border border-[#ccc] rounded-md hover:bg-[#f5f5f5] disabled:opacity-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={deletarVendasDoMes}
                  disabled={deletandoMes || vendas.length === 0}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#8b0000] rounded-md hover:bg-[#6d0000] disabled:opacity-50 transition-colors"
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
            <div className="bg-[#1a2e4a] px-5 py-3 flex items-center justify-between rounded-t-lg">
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
                  className="w-full pl-9 pr-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#0a0a0a] placeholder-[#999] focus:outline-none focus:border-[#1a2e4a] focus:ring-1 focus:ring-[#1a2e4a]"
                />
              </div>
              <p className="text-[10px] text-[#999] mt-1.5">{produtosFiltrados.length} produto{produtosFiltrados.length !== 1 ? 's' : ''} encontrado{produtosFiltrados.length !== 1 ? 's' : ''}</p>
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
                  <thead className="bg-[#f5f5f5] sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2 text-[10px] font-bold text-[#555] uppercase">Nome</th>
                      <th className="text-right px-4 py-2 text-[10px] font-bold text-[#555] uppercase">Preço</th>
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
                        className="cursor-pointer hover:bg-[#f0f4f8] transition-colors"
                      >
                        <td className="px-4 py-3 font-medium text-[#0a0a0a]">
                          {p.description}
                          {p.code && <span className="ml-2 text-[10px] text-[#999]">{p.code}</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-[#0a5c2e] whitespace-nowrap">
                          {p.price != null && p.price > 0 ? formatBRL(p.price) : <span className="text-[#ccc]">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-[#eee] px-5 py-3 flex justify-end bg-[#fafafa] rounded-b-lg">
              <button
                onClick={() => setModalProdutoIdx(null)}
                className="px-4 py-2 text-sm font-medium text-[#555] border border-[#ccc] rounded-md hover:bg-[#f5f5f5] transition-colors"
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
            <div className="bg-[#1a2e4a] px-5 py-3 flex items-center justify-between rounded-t-lg">
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
                    <div className="bg-[#f5f5f5] px-4 py-2">
                      <h4 className="text-[10px] font-bold text-[#555] uppercase tracking-widest">Colunas obrigatórias</h4>
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
                        <tbody className="divide-y divide-[#f0f0f0]">
                          {[
                            ['cliente_nome', 'Nome do cliente', 'João Silva'],
                            ['descricao', 'Descrição do item/serviço', 'Consultoria mensal'],
                            ['quantidade', 'Quantidade', '1'],
                            ['valor_unitario', 'Valor unitário', '1500,00'],
                            ['data_venda', 'Data da venda (DD/MM/AAAA)', '01/04/2026'],
                            ['forma_pagamento', 'Forma de pagamento', 'pix'],
                          ].map(([col, desc, ex]) => (
                            <tr key={col}>
                              <td className="py-1.5 font-mono text-xs font-semibold text-[#1a2e4a]">{col}</td>
                              <td className="py-1.5 text-[#333]">{desc}</td>
                              <td className="py-1.5 text-[#999] italic">{ex}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="border border-[#ccc] rounded-lg overflow-hidden">
                    <div className="bg-[#f5f5f5] px-4 py-2">
                      <h4 className="text-[10px] font-bold text-[#555] uppercase tracking-widest">Colunas opcionais</h4>
                    </div>
                    <div className="p-4">
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-[#f0f0f0]">
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

                  <div className="bg-[#f0f4f8] border border-[#c5d5e8] rounded-lg p-4">
                    <p className="text-xs text-[#555] mb-1"><strong>Formas de pagamento aceitas:</strong></p>
                    <p className="text-xs text-[#777]">pix, dinheiro, cartao_credito, cartao_debito, boleto, parcelado</p>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={baixarModeloPlanilha}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-[#1a2e4a] bg-white border border-[#1a2e4a] rounded-md hover:bg-[#f0f4f8] transition-colors"
                    >
                      <Download size={14} /> Baixar modelo CSV
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#1a2e4a] rounded-md hover:bg-[#15253d] transition-colors"
                    >
                      <Upload size={14} /> Selecionar planilha
                    </button>
                  </div>
                </div>
              )}

              {/* Error de parse */}
              {importError && !importResult && (
                <div className="p-4 bg-[#fdecea] border border-[#e57373] rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertCircle size={18} className="text-[#8b0000] mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold text-[#8b0000] text-sm">Erro ao processar planilha</p>
                      <p className="text-sm text-[#8b0000]/80 mt-1 whitespace-pre-line">{importError}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={baixarModeloPlanilha}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-[#1a2e4a] bg-white border border-[#1a2e4a] rounded hover:bg-[#f0f4f8] transition-colors"
                    >
                      <Download size={12} /> Baixar modelo
                    </button>
                  </div>
                </div>
              )}

              {/* Result */}
              {importResult && (
                <div className={`p-4 rounded-lg border ${importResult.fail > 0 ? 'bg-[#fff8e1] border-[#ffc107]' : 'bg-[#e6f4ec] border-[#0a5c2e]'}`}>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 size={20} className="text-[#0a5c2e]" />
                    <div>
                      <p className="font-semibold text-sm">Importação concluída</p>
                      <p className="text-sm mt-0.5">
                        <span className="text-[#0a5c2e] font-semibold">{importResult.ok} vendas importadas</span>
                        {importResult.fail > 0 && (
                          <span className="text-[#8b0000] font-semibold ml-2">{importResult.fail} com erro</span>
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
                    <span className="font-semibold text-[#0a0a0a]">
                      {importRows.length} linha{importRows.length !== 1 ? 's' : ''} encontrada{importRows.length !== 1 ? 's' : ''}
                    </span>
                    {importErros > 0 && (
                      <span className="flex items-center gap-1 text-[#8b0000] font-semibold">
                        <XCircle size={14} /> {importErros} com erro{importErros !== 1 ? 's' : ''} (serão ignoradas)
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-[#0a5c2e] font-semibold">
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
                        className="w-full px-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#0a0a0a] focus:outline-none focus:border-[#1a2e4a] focus:ring-1 focus:ring-[#1a2e4a]"
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
                        className="w-full px-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#0a0a0a] focus:outline-none focus:border-[#1a2e4a] focus:ring-1 focus:ring-[#1a2e4a]"
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
                        <thead className="bg-[#f5f5f5] sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left text-[10px] font-bold text-[#555] uppercase">Linha</th>
                            <th className="px-3 py-2 text-left text-[10px] font-bold text-[#555] uppercase">Cliente</th>
                            <th className="px-3 py-2 text-left text-[10px] font-bold text-[#555] uppercase">Descrição</th>
                            <th className="px-3 py-2 text-right text-[10px] font-bold text-[#555] uppercase">Qtd</th>
                            <th className="px-3 py-2 text-right text-[10px] font-bold text-[#555] uppercase">Vlr Unit.</th>
                            <th className="px-3 py-2 text-right text-[10px] font-bold text-[#555] uppercase">Total</th>
                            <th className="px-3 py-2 text-left text-[10px] font-bold text-[#555] uppercase">Data</th>
                            <th className="px-3 py-2 text-left text-[10px] font-bold text-[#555] uppercase">Pagamento</th>
                            <th className="px-3 py-2 text-left text-[10px] font-bold text-[#555] uppercase">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#eee]">
                          {importRows.map((row, idx) => {
                            const hasError = row.erros.length > 0
                            return (
                              <tr key={idx} className={hasError ? 'bg-[#fdecea]' : 'hover:bg-[#fafafa]'}>
                                <td className="px-3 py-2 text-[#999] text-xs">{row.linha}</td>
                                <td className="px-3 py-2 font-medium text-[#0a0a0a]">
                                  {row.cliente_nome || '-'}
                                  {row.cliente_cpf_cnpj && (
                                    <span className="block text-[10px] text-[#999]">{row.cliente_cpf_cnpj}</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-[#333] max-w-[200px] truncate">{row.descricao || '-'}</td>
                                <td className="px-3 py-2 text-right text-[#333]">{row.quantidade}</td>
                                <td className="px-3 py-2 text-right text-[#333]">{formatBRL(row.valor_unitario)}</td>
                                <td className="px-3 py-2 text-right font-semibold text-[#0a0a0a]">{formatBRL(row.valor_total)}</td>
                                <td className="px-3 py-2 text-[#333]">{row.data_venda ? formatData(row.data_venda) : '-'}</td>
                                <td className="px-3 py-2 text-[#333]">{LABEL_FORMA[row.forma_pagamento] || row.forma_pagamento}</td>
                                <td className="px-3 py-2">
                                  {hasError ? (
                                    <span className="flex items-center gap-1 text-[#8b0000] text-xs font-semibold" title={row.erros.join(', ')}>
                                      <XCircle size={12} /> {row.erros[0]}
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-1 text-[#0a5c2e] text-xs font-semibold">
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
                  <span className="text-xs font-semibold text-[#1a2e4a]">
                    Importando vendas... {importProgress.current} de {importProgress.total}
                  </span>
                  <span className="text-xs font-bold text-[#1a2e4a]">
                    {Math.round((importProgress.current / importProgress.total) * 100)}%
                  </span>
                </div>
                <div className="w-full h-2.5 bg-[#e5e7eb] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#1a2e4a] rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                  />
                </div>
                <p className="text-[10px] text-[#888] mt-1">
                  Não feche esta janela enquanto a importação estiver em andamento
                </p>
              </div>
            )}

            {/* Footer */}
            <div className="border-t border-[#eee] px-5 py-3 flex items-center justify-between bg-[#fafafa] rounded-b-lg">
              <button
                onClick={baixarModeloPlanilha}
                className="flex items-center gap-2 text-xs font-semibold text-[#555] hover:text-[#1a2e4a] transition-colors"
              >
                <Download size={12} /> Baixar modelo CSV
              </button>
              <div className="flex gap-2">
                <button
                  onClick={fecharModalImport}
                  disabled={importando}
                  className="px-4 py-2 text-sm font-medium text-[#555] border border-[#ccc] rounded-md hover:bg-[#f5f5f5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {importResult ? 'Fechar' : 'Cancelar'}
                </button>
                {!importResult && importRows.length > 0 && (
                  <button
                    onClick={executarImportacao}
                    disabled={importando || !importContaBancaria || importRows.filter(r => r.erros.length === 0).length === 0}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#1a2e4a] rounded-md hover:bg-[#15253d] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
    </AppLayout>
  )
}
