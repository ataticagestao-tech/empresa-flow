import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { safeQuery } from '@/lib/supabaseQuery'
import { formatBRL, formatData, formatCPF, formatCNPJ } from '@/lib/format'
import { quitarCR } from '@/lib/financeiro/transacao'
import { AppLayout } from '@/components/layout/AppLayout'
import {
  Search, Plus, Eye, Trash2, X,
  Loader2, AlertCircle, Check, Package,
  Briefcase, FileText, RefreshCw, CreditCard, Banknote,
  QrCode, Receipt, Calendar, UserPlus, ChevronDown,
  Upload, Download, CheckCircle2, XCircle
} from 'lucide-react'
import { parseVendasSpreadsheet, type VendaImportRow } from '@/lib/parsers/vendasSpreadsheet'
import { format, startOfMonth, endOfMonth, parseISO, addMonths } from 'date-fns'

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
  const { activeClient, isUsingSecondary } = useAuth()

  // ─── Data state ──────────────────────────────────────────────
  const [vendas, setVendas] = useState<Venda[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [centrosCusto, setCentrosCusto] = useState<CentroCusto[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
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
  const [salvando, setSalvando] = useState(false)
  const [erroModal, setErroModal] = useState<string | null>(null)

  // ─── Import state ────────────────────────────────────────────
  const [modalImport, setModalImport] = useState(false)
  const [importRows, setImportRows] = useState<VendaImportRow[]>([])
  const [importErros, setImportErros] = useState(0)
  const [importError, setImportError] = useState<string | null>(null)
  const [importando, setImportando] = useState(false)
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
  const [formParcelas, setFormParcelas] = useState(2)
  const [formContaBancaria, setFormContaBancaria] = useState('')
  const [formCentroCusto, setFormCentroCusto] = useState('')

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
    return { total, ticket, aVista, aPrazo }
  }, [vendas])

  // ─── Fetch data ──────────────────────────────────────────────
  const fetchVendas = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    try {
      const inicio = format(startOfMonth(mesDate), 'yyyy-MM-dd')
      const fim = format(endOfMonth(mesDate), 'yyyy-MM-dd')

      const { data, error: err } = await db
        .from('vendas')
        .select('*, vendas_itens(*), contas_receber(*)')
        .eq('company_id', companyId)
        .gte('data_venda', inicio)
        .lte('data_venda', fim)
        .order('data_venda', { ascending: false })

      if (err) throw err
      setVendas((data as Venda[]) || [])
    } catch (e: any) {
      setError(e.message || 'Erro ao buscar vendas')
    } finally {
      setLoading(false)
    }
  }, [companyId, mesDate])

  const fetchAuxData = useCallback(async () => {
    if (!companyId || !activeClient) return

    const ac = activeClient as any
    const [banksRes, centrosRes, clientesRes, produtosRes] = await Promise.all([
      ac.from('bank_accounts').select('id, name, banco').eq('company_id', companyId).eq('is_active', true),
      ac.from('centros_custo').select('id, codigo, descricao').eq('company_id', companyId).eq('ativo', true),
      ac.from('clients').select('id, razao_social, nome_fantasia, cpf_cnpj, email').eq('company_id', companyId).eq('is_active', true).order('razao_social'),
      ac.from('products').select('id, code, description, price, unidade_medida').eq('company_id', companyId).order('description'),
    ])

    setBankAccounts((banksRes.data as BankAccount[]) || [])
    setCentrosCusto((centrosRes.data as CentroCusto[]) || [])
    setClientes((clientesRes.data as Cliente[]) || [])

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
    setFormParcelas(2)
    setFormContaBancaria('')
    setFormCentroCusto('')
    setErroModal(null)
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

    setImportando(true)
    setImportError(null)

    const FORMAS_A_VISTA_SET = new Set(['pix', 'dinheiro', 'cartao_debito'])
    const validRows = importRows.filter(r => r.erros.length === 0)
    let ok = 0
    let fail = 0

    for (const row of validRows) {
      try {
        // 1. Insert venda
        const valorLiquido = Math.max(0, row.valor_total - row.desconto)
        const { data: vendaData, error: vendaErr } = await db
          .from('vendas')
          .insert({
            company_id: companyId,
            cliente_nome: row.cliente_nome,
            cliente_cpf_cnpj: row.cliente_cpf_cnpj,
            tipo: row.tipo,
            valor_total: valorLiquido,
            desconto: row.desconto,
            data_venda: row.data_venda,
            forma_pagamento: row.forma_pagamento,
            status: 'confirmado',
            observacoes: row.observacoes,
          })
          .select()
          .single()

        if (vendaErr) throw vendaErr

        // 2. Insert item
        await db.from('vendas_itens').insert({
          venda_id: vendaData.id,
          descricao: row.descricao,
          quantidade: row.quantidade,
          valor_unitario: row.valor_unitario,
          valor_total: row.valor_total,
        })

        // 3. Generate contas_receber
        const isParcelado = row.forma_pagamento === 'parcelado'
        const numParcelas = isParcelado ? row.parcelas : 1
        const valorParcela = Math.round((valorLiquido / numParcelas) * 100) / 100

        const crsPayload = Array.from({ length: numParcelas }, (_, i) => {
          const vencimento = isParcelado
            ? format(addMonths(parseISO(row.data_venda), i + 1), 'yyyy-MM-dd')
            : row.data_venda

          const valor = i === numParcelas - 1
            ? valorLiquido - valorParcela * (numParcelas - 1)
            : valorParcela

          return {
            company_id: companyId,
            pagador_nome: row.cliente_nome,
            pagador_cpf_cnpj: row.cliente_cpf_cnpj,
            valor,
            valor_pago: 0,
            data_vencimento: vencimento,
            status: 'aberto',
            forma_recebimento: row.forma_pagamento,
            conta_contabil_id: null,
            centro_custo_id: importCentroCusto || null,
            venda_id: vendaData.id,
          }
        })

        const { data: crsData, error: crsErr } = await db
          .from('contas_receber')
          .insert(crsPayload)
          .select()

        if (crsErr) throw crsErr

        // 4. CRs ficam "aberto" para serem conciliadas com o extrato bancário.
        //    Não quitar automaticamente — a quitação acontece na conciliação.

        ok++
      } catch (err: any) {
        console.error(`[importVenda] Linha ${row.linha}:`, err)
        fail++
      }
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
      // 1. Insert venda
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

      // 2. Insert itens
      const itensPayload = formItens.map(it => ({
        venda_id: vendaData.id,
        descricao: it.descricao.trim(),
        quantidade: it.quantidade,
        valor_unitario: it.valor_unitario,
        valor_total: it.quantidade * it.valor_unitario,
      }))

      const { error: itensErr } = await db.from('vendas_itens').insert(itensPayload)
      if (itensErr) throw itensErr

      // 3. Generate CRs
      const isParcelado = formPagamento === 'parcelado'
      const numParcelas = isParcelado ? formParcelas : 1
      const valorParcela = Math.round((totalVenda / numParcelas) * 100) / 100

      const crsPayload = Array.from({ length: numParcelas }, (_, i) => {
        const vencimento = isParcelado
          ? format(addMonths(parseISO(formDataVenda), i + 1), 'yyyy-MM-dd')
          : formDataVenda

        const valor = i === numParcelas - 1
          ? totalVenda - valorParcela * (numParcelas - 1)
          : valorParcela

        return {
          company_id: companyId,
          pagador_nome: formCliente.trim(),
          pagador_cpf_cnpj: formCpfCnpj.replace(/\D/g, '') || null,
          valor,
          valor_pago: 0,
          data_vencimento: vencimento,
          status: 'aberto',
          forma_recebimento: formPagamento,
          conta_contabil_id: null,
          centro_custo_id: formCentroCusto || null,
          venda_id: vendaData.id,
        }
      })

      const { data: crsData, error: crsErr } = await db
        .from('contas_receber')
        .insert(crsPayload)
        .select()

      if (crsErr) throw crsErr

      // 4. If à vista, quitar immediately
      if (isAVista && crsData && crsData.length > 0) {
        const cr = crsData[0]
        await quitarCR(cr.id, {
          valorPago: cr.valor,
          dataPagamento: formDataVenda,
          formaRecebimento: formPagamento,
          contaBancariaId: formContaBancaria,
        })
      }

      resetForm()
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
    try {
      await db.from('vendas_itens').delete().eq('venda_id', id)
      const { error: err } = await db.from('vendas').delete().eq('id', id)
      if (err) throw err
      setConfirmDelete(null)
      await fetchVendas()
    } catch (e: any) {
      console.error('[deletarVenda]', e)
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Vendas do mês', value: formatBRL(kpis.total), color: '#1a2e4a' },
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
                onClick={() => { resetForm(); setModalAberto(true) }}
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
          <div className="bg-[#1a2e4a] px-4 py-2.5">
            <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">
              Vendas &mdash; {vendasFiltradas.length} registro{vendasFiltradas.length !== 1 ? 's' : ''}
            </h3>
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
                    <th className="text-center px-3 py-2.5 w-20">Ações</th>
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
              <h2 className="text-[11px] font-bold text-white uppercase tracking-widest">Nova Venda</h2>
              <button onClick={() => setModalAberto(false)} className="text-[#a8bfd4] hover:text-white transition-colors">
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

              {/* Parcelas */}
              {formPagamento === 'parcelado' && (
                <div>
                  <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Número de parcelas</label>
                  <select
                    value={formParcelas}
                    onChange={e => setFormParcelas(parseInt(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#0a0a0a] focus:outline-none focus:border-[#1a2e4a] focus:ring-1 focus:ring-[#1a2e4a]"
                  >
                    {Array.from({ length: 11 }, (_, i) => i + 2).map(n => (
                      <option key={n} value={n}>{n}x de {formatBRL(totalVenda / n)}</option>
                    ))}
                  </select>
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

              {/* Preview */}
              {totalVenda > 0 && (
                <div className="rounded-md border border-[#0a5c2e] bg-[#e6f4ec] p-3">
                  <div className="flex items-start gap-2">
                    <Check size={16} className="text-[#0a5c2e] mt-0.5 flex-shrink-0" />
                    <div className="text-[12px] text-[#0a5c2e]">
                      {formPagamento === 'parcelado' ? (
                        <>
                          <p className="font-semibold mb-1">CR gerado automaticamente &mdash; {formParcelas}x parcelas:</p>
                          <ul className="space-y-0.5">
                            {Array.from({ length: formParcelas }, (_, i) => {
                              const vp = Math.round((totalVenda / formParcelas) * 100) / 100
                              const valor = i === formParcelas - 1 ? totalVenda - vp * (formParcelas - 1) : vp
                              const venc = format(addMonths(parseISO(formDataVenda), i + 1), 'dd/MM/yyyy')
                              return <li key={i}>Parcela {i + 1}: {formatBRL(valor)} &middot; vencimento {venc}</li>
                            })}
                          </ul>
                        </>
                      ) : (
                        <p className="font-semibold">
                          CR gerado automaticamente &mdash; {formatBRL(totalVenda)} &middot; vencimento {format(parseISO(formDataVenda), 'dd/MM/yyyy')}
                          {isAVista && ' (quitado automaticamente)'}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

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
                    onClick={() => setModalAberto(false)}
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
                    Confirmar venda
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

              <div className="pt-2 border-t border-[#ccc] flex justify-end">
                <button
                  onClick={() => setModalDetalhes(null)}
                  className="px-4 py-2 text-sm font-medium text-[#555] border border-[#ccc] rounded-md hover:bg-[#f5f5f5] transition-colors"
                >
                  Fechar
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
                  className="px-4 py-2 text-sm font-medium text-[#555] border border-[#ccc] rounded-md hover:bg-[#f5f5f5] transition-colors"
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
