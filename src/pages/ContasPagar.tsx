import { useState, useEffect, useMemo, useCallback } from 'react'
import { format, addDays, addMonths, startOfMonth, endOfMonth, isToday, isBefore, isAfter, parseISO } from 'date-fns'
import {
  DollarSign, CalendarClock, CalendarDays, CheckCircle2, Plus, X,
  MoreHorizontal, Search, ChevronDown, ChevronUp,
  AlertTriangle, Loader2, FileText, Trash2, SplitSquareVertical,
  RefreshCw, Download, Paperclip, Archive, Pencil, ScanLine
} from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { safeQuery } from '@/lib/supabaseQuery'
import { formatBRL, formatData } from '@/lib/format'
import { quitarCP, calcularProximoVencimento } from '@/lib/financeiro/transacao'
import { AppLayout } from '@/components/layout/AppLayout'
import { SupplierSheet } from '@/components/suppliers/SupplierSheet'

// ─── Types ──────────────────────────────────────────────────────────
interface ContaPagar {
  id: string
  company_id: string
  credor_nome: string
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
}

interface Supplier {
  id: string
  razao_social: string
}

interface Employee {
  id: string
  nome_completo: string | null
  name: string | null
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
type UrgencyGroup = 'hoje' | 'proximos7' | 'proximos30' | 'vencidos'

const FORMAS_PAGAMENTO = ['PIX', 'Transferencia', 'Boleto', 'Debito automatico', 'Dinheiro'] as const

// ─── Helpers ────────────────────────────────────────────────────────
function classifyUrgency(dataVencimento: string): UrgencyGroup {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const venc = parseISO(dataVencimento)
  venc.setHours(0, 0, 0, 0)

  if (isBefore(venc, hoje)) return 'vencidos'
  if (isToday(venc)) return 'hoje'
  const seteDias = addDays(hoje, 7)
  if (isBefore(venc, seteDias) || venc.getTime() === seteDias.getTime()) return 'proximos7'
  return 'proximos30'
}

const urgencyConfig: Record<UrgencyGroup, { label: string; textColor: string; bgColor: string; borderColor: string }> = {
  hoje: { label: 'Vence hoje', textColor: '#8b0000', bgColor: '#fdecea', borderColor: '#8b0000' },
  proximos7: { label: 'Proximos 7 dias', textColor: '#5c3a00', bgColor: '#fffbe6', borderColor: '#b8960a' },
  proximos30: { label: 'Proximos 30 dias', textColor: '#1a2e4a', bgColor: '#f0f4f8', borderColor: '#1a2e4a' },
  vencidos: { label: 'Vencidos', textColor: '#8b0000', bgColor: '#fdecea', borderColor: '#8b0000' },
}

function saldo(cp: ContaPagar) {
  return cp.valor - (cp.valor_pago || 0)
}

// ─── Component ──────────────────────────────────────────────────────
export default function ContasPagar() {
  const { selectedCompany } = useCompany()
  const { activeClient } = useAuth()

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
  const [payingCp, setPayingCp] = useState<ContaPagar | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null)
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
  })

  const MONTHS = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ]
  const [competenciaYear, setCompetenciaYear] = useState(new Date().getFullYear())
  const [showCompetenciaPicker, setShowCompetenciaPicker] = useState(false)

  // Batch pay form
  const [batchForm, setBatchForm] = useState({
    dataPagamento: format(new Date(), 'yyyy-MM-dd'),
    formaPagamento: 'PIX' as string,
    contaBancariaId: '',
  })

  // Collapsed groups
  const [collapsedGroups, setCollapsedGroups] = useState<Set<UrgencyGroup>>(new Set())

  // ─── Data Loading ───────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!selectedCompany) return
    setLoading(true)

    const db = activeClient as any

    const [cpRes, bankRes, chartRes, ccRes, prodRes, supRes, empRes, cliRes] = await Promise.all([
      db.from('contas_pagar').select('*').eq('company_id', selectedCompany.id).in('status', ['aberto', 'parcial', 'vencido']).order('data_vencimento', { ascending: true }),
      db.from('bank_accounts').select('id, company_id, name, banco').eq('company_id', selectedCompany.id),
      db.from('chart_of_accounts').select('id, company_id, code, name, type').eq('company_id', selectedCompany.id).order('code'),
      db.from('centros_custo').select('id, company_id, codigo, descricao').eq('company_id', selectedCompany.id).eq('ativo', true),
      db.from('products').select('id, description, code').eq('company_id', selectedCompany.id).eq('is_active', true).order('description'),
      db.from('suppliers').select('id, razao_social').eq('company_id', selectedCompany.id).order('razao_social'),
      db.from('employees').select('id, nome_completo, name').eq('company_id', selectedCompany.id),
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
  }, [selectedCompany])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ─── KPIs ─────────────────────────────────────────────────────────
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

    for (const cp of contas) {
      const s = saldo(cp)
      totalPagar += s
      totalCount++

      const venc = parseISO(cp.data_vencimento)
      venc.setHours(0, 0, 0, 0)

      if (isToday(venc) && cp.status === 'aberto') { venceHoje += s; hojeCount++ }
      if ((isToday(venc) || (isAfter(venc, hoje) && (isBefore(venc, seteDias) || venc.getTime() === seteDias.getTime())))) { prox7 += s; prox7Count++ }
    }

    return { totalPagar, totalCount, venceHoje, hojeCount, prox7, prox7Count }
  }, [contas])

  // Load pago no mes separately (paid CPs not in main query)
  const [pagoNoMes, setPagoNoMes] = useState(0)
  const [pagoNoMesCount, setPagoNoMesCount] = useState(0)
  useEffect(() => {
    if (!selectedCompany) return
    const hoje = new Date()
    const inicio = format(startOfMonth(hoje), 'yyyy-MM-dd')
    const fim = format(endOfMonth(hoje), 'yyyy-MM-dd')

    safeQuery(
      () => supabase
        .from('contas_pagar')
        .select('valor_pago')
        .eq('company_id', selectedCompany.id)
        .eq('status', 'pago')
        .gte('data_pagamento', inicio)
        .lte('data_pagamento', fim),
      'pago no mes'
    ).then((data) => {
      if (data && Array.isArray(data)) {
        setPagoNoMes(data.reduce((acc: number, r: any) => acc + (r.valor_pago || 0), 0))
        setPagoNoMesCount(data.length)
      }
    })
  }, [selectedCompany, contas])

  // ─── Filtered + Grouped ───────────────────────────────────────────
  const filteredContas = useMemo(() => {
    let list = contas
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      list = list.filter(
        (cp) =>
          cp.credor_nome?.toLowerCase().includes(term) ||
          cp.credor_cpf_cnpj?.toLowerCase().includes(term) ||
          String(cp.valor).includes(term)
      )
    }
    if (statusFilter === 'aberto') {
      list = list.filter((cp) => cp.status === 'aberto' || cp.status === 'parcial')
    } else if (statusFilter === 'vencidos') {
      list = list.filter((cp) => cp.status === 'vencido' || classifyUrgency(cp.data_vencimento) === 'vencidos')
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
    const groups: Record<UrgencyGroup, ContaPagar[]> = { hoje: [], proximos7: [], proximos30: [], vencidos: [] }
    for (const cp of filteredContas) {
      const g = classifyUrgency(cp.data_vencimento)
      groups[g].push(cp)
    }
    for (const key of Object.keys(groups) as UrgencyGroup[]) {
      groups[key].sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento))
    }
    return groups
  }, [filteredContas])

  const visibleGroups = useMemo(() => {
    return (['hoje', 'proximos7', 'proximos30', 'vencidos'] as UrgencyGroup[]).filter(
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
  const openPayModal = (cp: ContaPagar) => {
    setPayingCp(cp)
    setPayForm({
      valorPago: saldo(cp),
      dataPagamento: format(new Date(), 'yyyy-MM-dd'),
      formaPagamento: 'PIX',
      contaBancariaId: bankAccounts[0]?.id || '',
      juros: 0,
      desconto: 0,
      observacao: cp.codigo_barras || '',
    })
    setShowPayModal(true)
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
    const selected = filteredContas.filter((cp) => selectedIds.has(cp.id))
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
  })

  const openNewModal = () => {
    setNewForm(resetNewForm())
    setEditingCpId(null)
    setShowNewModal(true)
  }

  const openEditModal = (cp: ContaPagar) => {
    setNewForm({
      credorNome: cp.credor_nome || '',
      descricao: cp.credor_nome || '',
      credorTipo: 'fornecedor',
      credorId: '',
      valor: cp.valor || 0,
      dataVencimento: cp.data_vencimento || format(new Date(), 'yyyy-MM-dd'),
      competencia: cp.competencia || '',
      contaContabilId: cp.conta_contabil_id || '',
      centroCustoId: cp.centro_custo_id || '',
      recorrencia: 'sem',
      numParcelas: 3,
      codigoBarras: cp.codigo_barras || '',
      fileUrl: cp.file_url || '',
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

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
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
      const { data, error } = await supabase.functions.invoke('ler-boleto', {
        body: { fileBase64: base64, mimeType },
      })

      if (error) throw error
      if (data?.error) throw new Error(data.error)

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

      alert('Boleto lido com sucesso! Verifique os campos preenchidos.')
    } catch (error: any) {
      console.error('[lerBoleto]', error)
      alert('Erro ao ler boleto: ' + (error.message || 'Tente novamente'))
    } finally {
      setIsReadingBoleto(false)
    }
  }

  const handleCreateCP = async () => {
    if (!selectedCompany || !newForm.descricao || !newForm.valor || !newForm.dataVencimento) return
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
      credor_nome: credorNome,
      valor: newForm.valor,
      status: 'aberto',
      conta_contabil_id: newForm.contaContabilId || null,
      centro_custo_id: newForm.centroCustoId || null,
      competencia: newForm.competencia || null,
      codigo_barras: newForm.codigoBarras || null,
      file_url: newForm.fileUrl || null,
    }

    if (editingCpId) {
      // Edição
      const { error } = await supabase
        .from('contas_pagar')
        .update({
          ...base,
          data_vencimento: newForm.dataVencimento,
        })
        .eq('id', editingCpId)

      setSubmitting(false)
      if (error) {
        console.error('[editarCP]', error)
        alert('Erro ao editar: ' + error.message)
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
          inserts.push({ ...base, valor_pago: 0, data_vencimento: dataAtual })
          dataAtual = calcularProximoVencimento(dataAtual, newForm.recorrencia)
        }
      }

      const { error } = await supabase.from('contas_pagar').insert(inserts)
      setSubmitting(false)

      if (error) {
        console.error('[criarCP]', error)
        alert('Erro ao criar: ' + error.message)
      } else {
        setShowNewModal(false)
        await loadData()
      }
    }
  }

  const handleArquivar = async (cp: ContaPagar) => {
    if (!confirm(`Arquivar conta de ${cp.credor_nome}?`)) return
    await supabase.from('contas_pagar').update({ status: 'arquivado' }).eq('id', cp.id)
    setDropdownOpen(null)
    await loadData()
  }

  // ─── Actions (dropdown) ──────────────────────────────────────────
  const handleCancelar = async (cp: ContaPagar) => {
    if (!confirm(`Cancelar conta de ${cp.credor_nome}?`)) return
    await supabase.from('contas_pagar').update({ status: 'cancelado' }).eq('id', cp.id)
    setDropdownOpen(null)
    await loadData()
  }

  const handleRenegociar = async (cp: ContaPagar) => {
    const novaData = prompt('Nova data de vencimento (YYYY-MM-DD):', cp.data_vencimento)
    if (!novaData) return
    await supabase.from('contas_pagar').update({ data_vencimento: novaData }).eq('id', cp.id)
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

    await supabase.from('contas_pagar').update({ status: 'cancelado' }).eq('id', cp.id)
    await supabase.from('contas_pagar').insert(inserts)
    setDropdownOpen(null)
    await loadData()
  }

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return
    const handler = () => setDropdownOpen(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [dropdownOpen])

  // ─── Lookup helpers ───────────────────────────────────────────────
  const contaContabilMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const c of chartAccounts) m[c.id] = `${c.code} - ${c.name}`
    return m
  }, [chartAccounts])

  const centroCustoMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const c of centrosCusto) m[c.id] = `${c.codigo} - ${c.descricao}`
    return m
  }, [centrosCusto])

  // ─── Status badge ────────────────────────────────────────────────
  const StatusBadge = ({ status }: { status: string }) => {
    const config: Record<string, { text: string; bg: string; border: string; label: string }> = {
      aberto: { text: '#5c3a00', bg: '#fffbe6', border: '#b8960a', label: 'Em aberto' },
      parcial: { text: '#1a2e4a', bg: '#f0f4f8', border: '#1a2e4a', label: 'Parcial' },
      vencido: { text: '#8b0000', bg: '#fdecea', border: '#8b0000', label: 'Vencido' },
      pago: { text: '#0a5c2e', bg: '#e6f4ec', border: '#0a5c2e', label: 'Pago' },
    }
    const c = config[status] || config.aberto
    return (
      <span
        className="text-[10px] font-semibold px-2 py-0.5 rounded-full border"
        style={{ color: c.text, backgroundColor: c.bg, borderColor: c.border }}
      >
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

  // ─── KPI Card ─────────────────────────────────────────────────────
  const KPICard = ({
    label,
    value,
    subtitle,
    badge,
    headerBg,
    badgeBg,
    badgeText,
  }: {
    label: string
    value: number
    subtitle: string
    badge: string
    headerBg: string
    badgeBg?: string
    badgeText?: string
  }) => (
    <div className="rounded-lg overflow-hidden border border-[#e0e0e0] shadow-sm">
      <div className="px-4 py-2" style={{ backgroundColor: headerBg }}>
        <p className="text-[10px] font-bold text-white uppercase tracking-widest">{label}</p>
      </div>
      <div className="bg-white px-4 py-3">
        <p className="text-2xl font-bold text-[#0a0a0a]">{formatBRL(value)}</p>
        <p className="text-xs text-[#777] mt-0.5">{subtitle}</p>
        <span
          className="inline-block mt-2 text-[10px] font-semibold px-2.5 py-0.5 rounded border"
          style={{
            color: badgeText || headerBg,
            backgroundColor: badgeBg || headerBg + '12',
            borderColor: badgeText || headerBg,
          }}
        >
          {badge}
        </span>
      </div>
    </div>
  )

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <AppLayout title="Contas a Pagar">
      <div className="max-w-[1400px] mx-auto space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="Total a pagar"
            value={kpis.totalPagar}
            subtitle={`${kpis.totalCount} titulo${kpis.totalCount !== 1 ? 's' : ''} em aberto`}
            badge="Mes atual"
            headerBg="#1a2e4a"
          />
          <KPICard
            label="Vence hoje"
            value={kpis.venceHoje}
            subtitle={`${kpis.hojeCount} titulo${kpis.hojeCount !== 1 ? 's' : ''}`}
            badge="Urgente"
            headerBg="#8b0000"
          />
          <KPICard
            label="Proximos 7 dias"
            value={kpis.prox7}
            subtitle={`${kpis.prox7Count} titulo${kpis.prox7Count !== 1 ? 's' : ''}`}
            badge="Atencao"
            headerBg="#b8860b"
            badgeBg="#b8860b18"
            badgeText="#b8860b"
          />
          <KPICard
            label="Pago no mes"
            value={pagoNoMes}
            subtitle={`${pagoNoMesCount} titulo${pagoNoMesCount !== 1 ? 's' : ''} quitado${pagoNoMesCount !== 1 ? 's' : ''}`}
            badge="Mes atual"
            headerBg="#0a5c2e"
          />
        </div>

        {/* Toolbar */}
        <div className="border border-[#e0e0e0] rounded-lg overflow-hidden shadow-sm">
          {/* Header */}
          <div className="bg-white px-5 py-4 border-b border-[#e0e0e0]">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-bold text-[#1a2e4a] uppercase tracking-widest">Contas a Pagar</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {/* export */}}
                  className="flex items-center gap-1.5 text-xs font-medium text-[#555] border border-[#ccc] px-3 py-1.5 rounded-lg hover:bg-[#f5f5f5] transition"
                >
                  <Download size={14} /> Exportar
                </button>
                <button
                  onClick={openNewModal}
                  className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#1a2e4a] px-3 py-1.5 rounded-lg hover:bg-[#0f1f36] transition"
                >
                  <Plus size={14} /> Nova conta
                </button>
              </div>
            </div>

            {/* Batch selection bar */}
            {selectedIds.size > 0 && (
              <div className="mt-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-[#1a2e4a]">
                  {selectedIds.size} titulo{selectedIds.size !== 1 ? 's' : ''} selecionado{selectedIds.size !== 1 ? 's' : ''} — {formatBRL(selectedTotal)}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="text-xs px-3 py-1.5 rounded-lg border border-[#ccc] text-[#555] hover:bg-[#f5f5f5] transition"
                  >
                    Cancelar selecao
                  </button>
                  <button
                    onClick={openBatchPay}
                    className="text-xs px-3 py-1.5 rounded-lg bg-[#1a2e4a] text-white font-semibold hover:bg-[#0f1f36] transition"
                  >
                    Pagar selecionados
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="p-5 bg-white">
            {/* Search */}
            <div className="mb-4">
              <div className="relative w-full">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#999]" />
                <input
                  type="text"
                  placeholder="Buscar por credor, valor..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-[#ccc] rounded-lg focus:outline-none focus:border-[#1a2e4a] text-[#0a0a0a] bg-[#fafafa]"
                />
              </div>
            </div>

            {/* Status tabs */}
            <div className="flex items-center gap-1 mb-4">
              {[
                { key: 'todos', label: 'Todos' },
                { key: 'aberto', label: 'Em aberto' },
                { key: 'vencidos', label: 'Vencidos' },
                { key: 'pagos', label: 'Pagos' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(tab.key)}
                  className={`text-xs font-semibold px-4 py-2 rounded-lg border transition ${
                    statusFilter === tab.key
                      ? 'bg-[#1a2e4a] text-white border-[#1a2e4a]'
                      : 'bg-white text-[#555] border-[#ccc] hover:bg-[#f5f5f5]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Date filter */}
            <div className="mb-4">
              <label className="block text-[10px] font-bold text-[#888] uppercase tracking-wider mb-1.5">Periodo</label>
              <select
                value={datePreset}
                onChange={(e) => applyDatePreset(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-[#ccc] rounded-lg focus:outline-none focus:border-[#1a2e4a] text-[#0a0a0a] bg-[#fafafa] mb-3"
              >
                <option value="hoje">Hoje</option>
                <option value="semana">Proximos 7 dias</option>
                <option value="mes_atual">Mes atual</option>
                <option value="proximo_mes">Proximo mes</option>
                <option value="trimestre">Trimestre</option>
                <option value="todos">Todas as datas</option>
                <option value="personalizado">Personalizado</option>
              </select>

              {datePreset === 'personalizado' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-[#888] uppercase tracking-wider mb-1">De</label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border border-[#ccc] rounded-lg focus:outline-none focus:border-[#1a2e4a] text-[#0a0a0a] bg-[#fafafa]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[#888] uppercase tracking-wider mb-1">Ate</label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border border-[#ccc] rounded-lg focus:outline-none focus:border-[#1a2e4a] text-[#0a0a0a] bg-[#fafafa]"
                    />
                  </div>
                </div>
              )}

              {datePreset !== 'personalizado' && datePreset !== 'todos' && dateFrom && dateTo && (
                <p className="text-[10px] text-[#999] mt-1">
                  {format(parseISO(dateFrom), 'dd/MM/yyyy')} ate {format(parseISO(dateTo), 'dd/MM/yyyy')}
                </p>
              )}
            </div>

            {/* Sector filter */}
            <div className="mb-4">
              <select
                value={sectorFilter}
                onChange={(e) => setSectorFilter(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-[#ccc] rounded-lg focus:outline-none focus:border-[#1a2e4a] text-[#0a0a0a] bg-[#fafafa] appearance-none"
                style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23999\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'%3E%3C/polyline%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
              >
                <option value="todos">Todos os setores</option>
                {centrosCusto.map((cc) => (
                  <option key={cc.id} value={cc.id}>{cc.descricao}</option>
                ))}
              </select>
            </div>

            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={24} className="animate-spin text-[#1a2e4a]" />
                <span className="ml-2 text-sm text-[#555]">Carregando...</span>
              </div>
            )}

            {/* Empty */}
            {!loading && filteredContas.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-[#555]">
                <FileText size={40} className="mb-3 opacity-40" />
                <p className="text-sm">Nenhuma conta a pagar encontrada.</p>
              </div>
            )}

            {/* Grouped table */}
            {!loading && visibleGroups.map((group) => {
              const items = groupedContas[group]
              const config = urgencyConfig[group]
              const groupTotal = items.reduce((acc, cp) => acc + saldo(cp), 0)
              const isCollapsed = collapsedGroups.has(group)
              const todayStr = format(new Date(), 'dd/MM/yyyy')

              return (
                <div key={group} className="mb-6">
                  {/* Group header */}
                  <button
                    onClick={() => {
                      setCollapsedGroups((prev) => {
                        const next = new Set(prev)
                        if (next.has(group)) next.delete(group)
                        else next.add(group)
                        return next
                      })
                    }}
                    className="w-full flex items-center justify-between px-3 py-2.5 mb-2 transition hover:opacity-80"
                    style={{ borderBottom: `2px solid ${config.borderColor}` }}
                  >
                    <div className="flex items-center gap-2">
                      {(group === 'hoje' || group === 'vencidos') && (
                        <AlertTriangle size={14} style={{ color: config.textColor }} />
                      )}
                      <span className="text-xs font-bold uppercase tracking-wider" style={{ color: config.textColor }}>
                        {config.label} — {todayStr}
                      </span>
                    </div>
                    <span className="text-xs font-bold" style={{ color: config.textColor }}>
                      {formatBRL(groupTotal)} · {items.length} titulo{items.length !== 1 ? 's' : ''}
                    </span>
                  </button>

                  {/* Table */}
                  {!isCollapsed && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[#e0e0e0]">
                            <th className="py-2.5 px-3 text-left w-8">
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
                                className="rounded border-[#ccc]"
                              />
                            </th>
                            <th className="py-2.5 px-3 text-left text-[10px] font-bold text-[#888] uppercase tracking-wider">Credor</th>
                            <th className="py-2.5 px-3 text-left text-[10px] font-bold text-[#888] uppercase tracking-wider">Categoria</th>
                            <th className="py-2.5 px-3 text-left text-[10px] font-bold text-[#888] uppercase tracking-wider">Vencimento</th>
                            <th className="py-2.5 px-3 text-left text-[10px] font-bold text-[#888] uppercase tracking-wider">Valor</th>
                            <th className="py-2.5 px-3 text-left text-[10px] font-bold text-[#888] uppercase tracking-wider">Centro de custo</th>
                            <th className="py-2.5 px-3 text-left text-[10px] font-bold text-[#888] uppercase tracking-wider">Status</th>
                            <th className="py-2.5 px-3 text-right text-[10px] font-bold text-[#888] uppercase tracking-wider">Acoes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((cp) => {
                            const isHoje = isToday(parseISO(cp.data_vencimento))
                            const categoria = inferCategoria(cp)
                            const ccLabel = cp.centro_custo_id
                              ? (centrosCusto.find(c => c.id === cp.centro_custo_id)?.descricao || '\u2014')
                              : '\u2014'
                            return (
                              <tr
                                key={cp.id}
                                className="border-b border-[#f0f0f0] hover:bg-[#fafafa] transition"
                                style={isHoje ? { borderLeft: '3px solid #1a2e4a' } : undefined}
                              >
                                <td className="py-3 px-3">
                                  <input
                                    type="checkbox"
                                    checked={selectedIds.has(cp.id)}
                                    onChange={() => toggleSelect(cp.id)}
                                    className="rounded border-[#ccc] w-4 h-4 accent-[#1a2e4a]"
                                  />
                                </td>
                                <td className="py-3 px-3">
                                  <div className="font-semibold text-[#0a0a0a]">{cp.credor_nome}</div>
                                  {cp.credor_cpf_cnpj && (
                                    <div className="text-[10px] text-[#999] mt-0.5">{cp.credor_cpf_cnpj}</div>
                                  )}
                                </td>
                                <td className="py-3 px-3">
                                  <span className="text-[10px] font-medium px-2.5 py-0.5 rounded-full bg-[#f5f5f5] text-[#555] border border-[#ddd]">
                                    {categoria}
                                  </span>
                                </td>
                                <td className="py-3 px-3">
                                  {isHoje ? (
                                    <span className="font-bold text-[#8b0000]">Hoje</span>
                                  ) : (
                                    <span className="text-[#0a0a0a]">{formatData(cp.data_vencimento)}</span>
                                  )}
                                </td>
                                <td className="py-3 px-3">
                                  <div className="font-semibold text-[#0a0a0a]">
                                    {formatBRL(saldo(cp))}
                                  </div>
                                  {cp.valor_pago > 0 && (
                                    <div className="text-[10px] text-[#999]">
                                      total: {formatBRL(cp.valor)}
                                    </div>
                                  )}
                                </td>
                                <td className="py-3 px-3 text-xs text-[#555]">
                                  {ccLabel}
                                </td>
                                <td className="py-3 px-3">
                                  <span
                                    className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full border"
                                    style={{
                                      color: cp.status === 'aberto' ? '#5c3a00' : cp.status === 'vencido' ? '#8b0000' : cp.status === 'pago' ? '#0a5c2e' : '#1a2e4a',
                                      backgroundColor: cp.status === 'aberto' ? '#fffbe6' : cp.status === 'vencido' ? '#fdecea' : cp.status === 'pago' ? '#e6f4ec' : '#f0f4f8',
                                      borderColor: cp.status === 'aberto' ? '#b8960a' : cp.status === 'vencido' ? '#8b0000' : cp.status === 'pago' ? '#0a5c2e' : '#1a2e4a',
                                    }}
                                  >
                                    {cp.status === 'aberto' ? 'Em aberto' : cp.status === 'vencido' ? 'Vencido' : cp.status === 'pago' ? 'Pago' : cp.status === 'parcial' ? 'Parcial' : cp.status}
                                  </span>
                                </td>
                                <td className="py-3 px-3 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <button
                                      onClick={() => openPayModal(cp)}
                                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#1a2e4a] text-[#1a2e4a] hover:bg-[#1a2e4a] hover:text-white transition"
                                    >
                                      Pagar
                                    </button>
                                    <div className="relative">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setDropdownOpen(dropdownOpen === cp.id ? null : cp.id)
                                        }}
                                        className="p-1.5 rounded-lg hover:bg-[#f0f0f0] transition"
                                      >
                                        <MoreHorizontal size={16} className="text-[#555]" />
                                      </button>
                                      {dropdownOpen === cp.id && (
                                        <div
                                          className="absolute right-0 top-full mt-1 bg-white border border-[#e0e0e0] rounded-lg shadow-lg py-1 z-40 min-w-[180px]"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <button
                                            onClick={() => openEditModal(cp)}
                                            className="w-full text-left px-3 py-2 text-xs hover:bg-[#f5f5f5] transition flex items-center gap-2 text-[#0a0a0a]"
                                          >
                                            <Pencil size={14} /> Editar
                                          </button>
                                          <button
                                            onClick={() => handleArquivar(cp)}
                                            className="w-full text-left px-3 py-2 text-xs hover:bg-[#f5f5f5] transition flex items-center gap-2 text-[#0a0a0a]"
                                          >
                                            <Archive size={14} /> Arquivar boleto
                                          </button>
                                          <button
                                            onClick={() => handleRenegociar(cp)}
                                            className="w-full text-left px-3 py-2 text-xs hover:bg-[#f5f5f5] transition flex items-center gap-2 text-[#0a0a0a]"
                                          >
                                            <CalendarClock size={14} /> Renegociar
                                          </button>
                                          <button
                                            onClick={() => handleCancelar(cp)}
                                            className="w-full text-left px-3 py-2 text-xs hover:bg-[#f5f5f5] transition flex items-center gap-2 text-[#8b0000]"
                                          >
                                            <Trash2 size={14} /> Cancelar
                                          </button>
                                          <button
                                            onClick={() => handleDividir(cp)}
                                            className="w-full text-left px-3 py-2 text-xs hover:bg-[#f5f5f5] transition flex items-center gap-2 text-[#0a0a0a]"
                                          >
                                            <SplitSquareVertical size={14} /> Dividir lancamento
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
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ─── Modal: Pagar CP ──────────────────────────────────────── */}
        {showPayModal && payingCp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowPayModal(false)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
              <div className="bg-[#1a2e4a] px-5 py-3 rounded-t-xl flex items-center justify-between">
                <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">Pagar Conta</h3>
                <button onClick={() => setShowPayModal(false)} className="text-white/70 hover:text-white">
                  <X size={18} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div className="bg-[#f0f4f8] rounded-lg p-3 border border-[#1a2e4a]/20">
                  <p className="text-xs font-semibold text-[#1a2e4a]">{payingCp.credor_nome}</p>
                  <p className="text-xs text-[#555]">
                    Saldo: {formatBRL(saldo(payingCp))} | Venc: {formatData(payingCp.data_vencimento)}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Valor pago *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={payForm.valorPago}
                      onChange={(e) => setPayForm({ ...payForm, valorPago: parseFloat(e.target.value) || 0 })}
                      className="w-full border border-[#ccc] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a2e4a] text-[#0a0a0a]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Data pagamento *</label>
                    <input
                      type="date"
                      value={payForm.dataPagamento}
                      onChange={(e) => setPayForm({ ...payForm, dataPagamento: e.target.value })}
                      className="w-full border border-[#ccc] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a2e4a] text-[#0a0a0a]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Forma pagamento *</label>
                  <select
                    value={payForm.formaPagamento}
                    onChange={(e) => setPayForm({ ...payForm, formaPagamento: e.target.value })}
                    className="w-full border border-[#ccc] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a2e4a] text-[#0a0a0a] bg-white"
                  >
                    {FORMAS_PAGAMENTO.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Conta bancaria *</label>
                  <select
                    value={payForm.contaBancariaId}
                    onChange={(e) => setPayForm({ ...payForm, contaBancariaId: e.target.value })}
                    className="w-full border border-[#ccc] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a2e4a] text-[#0a0a0a] bg-white"
                  >
                    <option value="">Selecione...</option>
                    {bankAccounts.map((ba) => (
                      <option key={ba.id} value={ba.id}>{ba.name}{ba.banco ? ` (${ba.banco})` : ''}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Juros / Multa</label>
                    <input
                      type="number"
                      step="0.01"
                      value={payForm.juros}
                      onChange={(e) => setPayForm({ ...payForm, juros: parseFloat(e.target.value) || 0 })}
                      className="w-full border border-[#ccc] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a2e4a] text-[#0a0a0a]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Desconto</label>
                    <input
                      type="number"
                      step="0.01"
                      value={payForm.desconto}
                      onChange={(e) => setPayForm({ ...payForm, desconto: parseFloat(e.target.value) || 0 })}
                      className="w-full border border-[#ccc] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a2e4a] text-[#0a0a0a]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Código de Barras</label>
                  <input
                    type="text"
                    value={payForm.observacao}
                    onChange={(e) => setPayForm({ ...payForm, observacao: e.target.value })}
                    placeholder="Linha digitável do boleto"
                    className="w-full border border-[#ccc] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a2e4a] text-[#0a0a0a]"
                  />
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={() => setShowPayModal(false)}
                    className="flex-1 py-2.5 border border-[#ccc] rounded-lg text-sm font-medium text-[#555] hover:bg-[#f0f0f0] transition"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handlePay}
                    disabled={submitting || !payForm.contaBancariaId}
                    className="flex-1 py-2.5 bg-[#1a2e4a] text-white rounded-lg text-sm font-semibold hover:bg-[#0f1f36] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowBatchPayModal(false)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
              <div className="bg-[#1a2e4a] px-5 py-3 rounded-t-xl flex items-center justify-between">
                <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">Pagar em lote</h3>
                <button onClick={() => setShowBatchPayModal(false)} className="text-white/70 hover:text-white">
                  <X size={18} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div className="bg-[#f0f4f8] rounded-lg p-3 border border-[#1a2e4a]/20">
                  <p className="text-xs font-semibold text-[#1a2e4a]">
                    {selectedIds.size} titulo(s) selecionado(s)
                  </p>
                  <p className="text-lg font-bold text-[#0a0a0a]">{formatBRL(selectedTotal)}</p>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Data pagamento *</label>
                  <input
                    type="date"
                    value={batchForm.dataPagamento}
                    onChange={(e) => setBatchForm({ ...batchForm, dataPagamento: e.target.value })}
                    className="w-full border border-[#ccc] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a2e4a] text-[#0a0a0a]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Forma pagamento *</label>
                  <select
                    value={batchForm.formaPagamento}
                    onChange={(e) => setBatchForm({ ...batchForm, formaPagamento: e.target.value })}
                    className="w-full border border-[#ccc] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a2e4a] text-[#0a0a0a] bg-white"
                  >
                    {FORMAS_PAGAMENTO.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Conta bancaria *</label>
                  <select
                    value={batchForm.contaBancariaId}
                    onChange={(e) => setBatchForm({ ...batchForm, contaBancariaId: e.target.value })}
                    className="w-full border border-[#ccc] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a2e4a] text-[#0a0a0a] bg-white"
                  >
                    <option value="">Selecione...</option>
                    {bankAccounts.map((ba) => (
                      <option key={ba.id} value={ba.id}>{ba.name}{ba.banco ? ` (${ba.banco})` : ''}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={() => setShowBatchPayModal(false)}
                    className="flex-1 py-2.5 border border-[#ccc] rounded-lg text-sm font-medium text-[#555] hover:bg-[#f0f0f0] transition"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleBatchPay}
                    disabled={submitting || !batchForm.contaBancariaId}
                    className="flex-1 py-2.5 bg-[#1a2e4a] text-white rounded-lg text-sm font-semibold hover:bg-[#0f1f36] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {submitting && <Loader2 size={14} className="animate-spin" />}
                    Pagar {selectedIds.size} titulo(s)
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Modal: Nova / Editar CP ──────────────────────────────── */}
        {showNewModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setShowNewModal(false); setEditingCpId(null) }}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="bg-[#1a2e4a] px-5 py-3 rounded-t-xl flex items-center justify-between sticky top-0 z-10">
                <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">
                  {editingCpId ? 'Editar Conta a Pagar' : 'Nova Conta a Pagar'}
                </h3>
                <button onClick={() => { setShowNewModal(false); setEditingCpId(null) }} className="text-white/70 hover:text-white">
                  <X size={18} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                {/* Descrição */}
                <div>
                  <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Descrição *</label>
                  <input
                    type="text"
                    value={newForm.descricao}
                    onChange={(e) => setNewForm({ ...newForm, descricao: e.target.value })}
                    placeholder="Ex: Aluguel janeiro, Material escritório..."
                    className="w-full border border-[#ccc] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a2e4a] text-[#0a0a0a]"
                  />
                </div>

                {/* Fornecedor / Funcionário / Cliente */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider">Credor</label>
                    {newForm.credorTipo === 'fornecedor' && (
                      <button
                        type="button"
                        onClick={() => setIsSupplierSheetOpen(true)}
                        className="flex items-center gap-1 text-[10px] font-semibold text-green-600 hover:text-green-700 transition"
                      >
                        <Plus size={12} /> Novo fornecedor
                      </button>
                    )}
                  </div>
                  {/* Tipo de credor */}
                  <div className="flex gap-1 mb-2">
                    {([
                      { key: 'fornecedor' as CredorTipo, label: 'Fornecedores' },
                      { key: 'funcionario' as CredorTipo, label: 'Funcionários' },
                      { key: 'cliente' as CredorTipo, label: 'Clientes' },
                    ]).map((tipo) => (
                      <button
                        key={tipo.key}
                        type="button"
                        onClick={() => setNewForm({ ...newForm, credorTipo: tipo.key, credorId: '', credorNome: '' })}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${
                          newForm.credorTipo === tipo.key
                            ? 'bg-[#1a2e4a] text-white border-[#1a2e4a]'
                            : 'bg-white text-[#555] border-[#ccc] hover:bg-[#f5f5f5]'
                        }`}
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
                    className="w-full border border-[#ccc] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a2e4a] text-[#0a0a0a] bg-white"
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
                    <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Valor (R$) *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newForm.valor || ''}
                      onChange={(e) => setNewForm({ ...newForm, valor: parseFloat(e.target.value) || 0 })}
                      placeholder="0,00"
                      className="w-full border border-[#ccc] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a2e4a] text-[#0a0a0a]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Vencimento *</label>
                    <input
                      type="date"
                      value={newForm.dataVencimento}
                      onChange={(e) => setNewForm({ ...newForm, dataVencimento: e.target.value })}
                      className="w-full border border-[#ccc] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a2e4a] text-[#0a0a0a]"
                    />
                  </div>
                </div>

                {/* Competência */}
                <div className="relative">
                  <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Competência (mês/ano)</label>
                  <button
                    type="button"
                    onClick={() => setShowCompetenciaPicker(!showCompetenciaPicker)}
                    className="w-full border border-[#ccc] rounded-lg px-3 py-2 text-sm text-left focus:outline-none focus:border-[#1a2e4a] text-[#0a0a0a] bg-white flex items-center justify-between"
                  >
                    <span className={newForm.competencia ? 'text-[#0a0a0a]' : 'text-[#999]'}>
                      {newForm.competencia || 'Selecione mês/ano'}
                    </span>
                    <CalendarDays size={14} className="text-[#999]" />
                  </button>
                  {showCompetenciaPicker && (
                    <div className="absolute z-20 mt-1 bg-white border border-[#ccc] rounded-lg shadow-lg p-3 w-[280px]">
                      <div className="flex items-center justify-between mb-3">
                        <button type="button" onClick={() => setCompetenciaYear(y => y - 1)} className="text-xs px-2 py-1 hover:bg-[#f0f0f0] rounded">&lt;</button>
                        <span className="text-sm font-semibold">{competenciaYear}</span>
                        <button type="button" onClick={() => setCompetenciaYear(y => y + 1)} className="text-xs px-2 py-1 hover:bg-[#f0f0f0] rounded">&gt;</button>
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
                              className={`text-xs px-2 py-1.5 rounded border transition ${
                                isSelected
                                  ? 'bg-[#1a2e4a] text-white border-[#1a2e4a]'
                                  : 'bg-white text-[#555] border-[#ccc] hover:bg-[#f5f5f5]'
                              }`}
                            >
                              {month.slice(0, 3)}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Conta contábil */}
                <div>
                  <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Conta contábil</label>
                  <select
                    value={newForm.contaContabilId}
                    onChange={(e) => setNewForm({ ...newForm, contaContabilId: e.target.value })}
                    className="w-full border border-[#ccc] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a2e4a] text-[#0a0a0a] bg-white"
                  >
                    <option value="">Selecione do plano de contas...</option>
                    {chartAccounts.map((ca) => (
                      <option key={ca.id} value={ca.id}>{ca.code} - {ca.name}</option>
                    ))}
                  </select>
                </div>

                {/* Centro de custo */}
                <div>
                  <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Centro de custo</label>
                  <select
                    value={newForm.centroCustoId}
                    onChange={(e) => setNewForm({ ...newForm, centroCustoId: e.target.value })}
                    className="w-full border border-[#ccc] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a2e4a] text-[#0a0a0a] bg-white"
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
                      <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Recorrência</label>
                      <select
                        value={newForm.recorrencia}
                        onChange={(e) => setNewForm({ ...newForm, recorrencia: e.target.value as Recorrencia })}
                        className="w-full border border-[#ccc] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a2e4a] text-[#0a0a0a] bg-white"
                      >
                        <option value="sem">Sem recorrência</option>
                        <option value="mensal">Mensal</option>
                        <option value="trimestral">Trimestral</option>
                        <option value="anual">Anual</option>
                      </select>
                    </div>
                    {newForm.recorrencia !== 'sem' && (
                      <div>
                        <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Num. parcelas</label>
                        <input
                          type="number"
                          min={2}
                          max={60}
                          value={newForm.numParcelas}
                          onChange={(e) => setNewForm({ ...newForm, numParcelas: parseInt(e.target.value) || 2 })}
                          className="w-full border border-[#ccc] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a2e4a] text-[#0a0a0a]"
                        />
                      </div>
                    )}
                  </div>
                )}

                {!editingCpId && newForm.recorrencia !== 'sem' && (
                  <div className="bg-[#fffbe6] border border-[#b8960a] rounded-lg p-3">
                    <p className="text-xs text-[#5c3a00]">
                      Serão geradas <strong>{newForm.numParcelas}</strong> parcelas de{' '}
                      <strong>{formatBRL(newForm.valor)}</strong> com vencimento{' '}
                      {newForm.recorrencia === 'mensal' ? 'mensal' : newForm.recorrencia === 'trimestral' ? 'trimestral' : 'anual'}.
                    </p>
                  </div>
                )}

                {/* Código de Barras */}
                <div>
                  <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Código de Barras</label>
                  <input
                    type="text"
                    value={newForm.codigoBarras}
                    onChange={(e) => setNewForm({ ...newForm, codigoBarras: e.target.value })}
                    placeholder="Linha digitável do boleto"
                    className="w-full border border-[#ccc] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a2e4a] text-[#0a0a0a]"
                  />
                </div>

                {/* Anexar arquivo + Leitura automática */}
                <div className="rounded-lg border border-dashed border-[#ccc] p-4 space-y-3">
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
                        className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-white bg-[#1a2e4a] rounded-lg px-3 py-2.5 hover:bg-[#0f1f36] transition disabled:opacity-50"
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
                        className="w-full flex items-center justify-center gap-2 text-xs text-[#555] border border-[#ccc] rounded-lg px-3 py-2 hover:bg-[#f5f5f5] transition disabled:opacity-50"
                      >
                        <Paperclip size={12} /> Apenas anexar (sem leitura)
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 size={16} className="text-green-600 shrink-0" />
                        <a href={newForm.fileUrl} target="_blank" rel="noreferrer" className="text-sm text-[#1a2e4a] hover:underline flex-1 truncate">
                          Arquivo anexado — clique para visualizar
                        </a>
                        <button
                          type="button"
                          onClick={() => setNewForm({ ...newForm, fileUrl: '' })}
                          className="text-xs px-2 py-1.5 text-[#8b0000] hover:bg-[#fdecea] rounded-lg transition"
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => document.getElementById('file-upload-cp-auto')?.click()}
                          disabled={isUploading || isReadingBoleto}
                          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-[#1a2e4a] border border-[#1a2e4a] rounded-lg px-2 py-1.5 hover:bg-[#f0f4f8] transition disabled:opacity-50"
                        >
                          {isReadingBoleto ? <Loader2 size={12} className="animate-spin" /> : <ScanLine size={12} />}
                          {isReadingBoleto ? 'Lendo...' : 'Trocar e ler'}
                        </button>
                        <button
                          type="button"
                          onClick={() => document.getElementById('file-upload-cp')?.click()}
                          disabled={isUploading}
                          className="flex-1 flex items-center justify-center gap-1.5 text-xs text-[#555] border border-[#ccc] rounded-lg px-2 py-1.5 hover:bg-[#f5f5f5] transition"
                        >
                          <Paperclip size={12} /> Trocar arquivo
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Botões */}
                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={() => { setShowNewModal(false); setEditingCpId(null) }}
                    className="flex-1 py-2.5 border border-[#ccc] rounded-lg text-sm font-medium text-[#555] hover:bg-[#f0f0f0] transition"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleCreateCP}
                    disabled={submitting || !newForm.descricao || !newForm.valor || !newForm.dataVencimento}
                    className="flex-1 py-2.5 bg-[#1a2e4a] text-white rounded-lg text-sm font-semibold hover:bg-[#0f1f36] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
      </div>
    </AppLayout>
  )
}
