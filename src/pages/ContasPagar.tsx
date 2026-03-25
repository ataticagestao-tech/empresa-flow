import { useState, useEffect, useMemo, useCallback } from 'react'
import { format, addDays, startOfMonth, endOfMonth, isToday, isBefore, isAfter, parseISO } from 'date-fns'
import {
  DollarSign, CalendarClock, CalendarDays, CheckCircle2, Plus, X,
  MoreHorizontal, Search, ChevronDown, ChevronUp,
  AlertTriangle, Loader2, FileText, Trash2, SplitSquareVertical,
  RefreshCw
} from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { safeQuery } from '@/lib/supabaseQuery'
import { formatBRL, formatData } from '@/lib/format'
import { quitarCP, calcularProximoVencimento } from '@/lib/financeiro/transacao'
import { AppLayout } from '@/components/layout/AppLayout'

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
  type: string
}

interface CentroCusto {
  id: string
  company_id: string
  nome: string
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
  const [centrosCusto, setCentrosCusto] = useState<CentroCusto[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('todos')

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Modals
  const [showPayModal, setShowPayModal] = useState(false)
  const [showNewModal, setShowNewModal] = useState(false)
  const [showBatchPayModal, setShowBatchPayModal] = useState(false)
  const [payingCp, setPayingCp] = useState<ContaPagar | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

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
    valor: 0,
    dataVencimento: format(new Date(), 'yyyy-MM-dd'),
    contaContabilId: '',
    centroCustoId: '',
    recorrencia: 'sem' as Recorrencia,
    numParcelas: 3,
  })

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

    const [cpData, bankData, chartData, ccData] = await Promise.all([
      safeQuery(
        () => supabase.from('contas_pagar').select('*').eq('company_id', selectedCompany.id).in('status', ['aberto', 'parcial', 'vencido']).order('data_vencimento', { ascending: true }),
        'listar contas a pagar'
      ),
      safeQuery(
        () => supabase.from('bank_accounts').select('id, company_id, name, banco').eq('company_id', selectedCompany.id),
        'listar contas bancarias'
      ),
      safeQuery(
        () => supabase.from('chart_of_accounts').select('id, company_id, code, name, type').eq('company_id', selectedCompany.id).eq('type', 'expense'),
        'listar plano de contas'
      ),
      safeQuery(
        () => supabase.from('centros_custo').select('id, company_id, nome').eq('company_id', selectedCompany.id),
        'listar centros de custo'
      ),
    ])

    setContas((cpData as ContaPagar[]) || [])
    setBankAccounts((bankData as BankAccount[]) || [])
    setChartAccounts((chartData as ChartAccount[]) || [])
    setCentrosCusto((ccData as CentroCusto[]) || [])
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
    let venceHoje = 0
    let prox7 = 0

    for (const cp of contas) {
      const s = saldo(cp)
      totalPagar += s

      const venc = parseISO(cp.data_vencimento)
      venc.setHours(0, 0, 0, 0)

      if (isToday(venc) && cp.status === 'aberto') venceHoje += s
      if ((isToday(venc) || (isAfter(venc, hoje) && (isBefore(venc, seteDias) || venc.getTime() === seteDias.getTime())))) prox7 += s
    }

    return { totalPagar, venceHoje, prox7 }
  }, [contas])

  // Load pago no mes separately (paid CPs not in main query)
  const [pagoNoMes, setPagoNoMes] = useState(0)
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
          cp.credor_cpf_cnpj?.toLowerCase().includes(term)
      )
    }
    if (statusFilter !== 'todos') {
      list = list.filter((cp) => cp.status === statusFilter)
    }
    return list
  }, [contas, searchTerm, statusFilter])

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
      observacao: '',
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
  const openNewModal = () => {
    setNewForm({
      credorNome: '',
      descricao: '',
      valor: 0,
      dataVencimento: format(new Date(), 'yyyy-MM-dd'),
      contaContabilId: '',
      centroCustoId: '',
      recorrencia: 'sem',
      numParcelas: 3,
    })
    setShowNewModal(true)
  }

  const handleCreateCP = async () => {
    if (!selectedCompany || !newForm.descricao || !newForm.valor || !newForm.dataVencimento) return
    setSubmitting(true)

    const base = {
      company_id: selectedCompany.id,
      credor_nome: newForm.credorNome || newForm.descricao,
      valor: newForm.valor,
      valor_pago: 0,
      status: 'aberto',
      conta_contabil_id: newForm.contaContabilId || null,
      centro_custo_id: newForm.centroCustoId || null,
    }

    const inserts: any[] = []
    if (newForm.recorrencia === 'sem') {
      inserts.push({ ...base, data_vencimento: newForm.dataVencimento })
    } else {
      let dataAtual = newForm.dataVencimento
      for (let i = 0; i < newForm.numParcelas; i++) {
        inserts.push({ ...base, data_vencimento: dataAtual })
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
    for (const c of centrosCusto) m[c.id] = c.nome
    return m
  }, [centrosCusto])

  // ─── Status badge ────────────────────────────────────────────────
  const StatusBadge = ({ status }: { status: string }) => {
    const config: Record<string, { text: string; bg: string; border: string; label: string }> = {
      aberto: { text: '#5c3a00', bg: '#fffbe6', border: '#b8960a', label: 'Aberto' },
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
    icon: Icon,
    label,
    value,
    color,
  }: {
    icon: any
    label: string
    value: number
    color: string
  }) => (
    <div className="border border-[#ccc] rounded-lg overflow-hidden">
      <div className="p-4 bg-white flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: color + '18' }}>
          <Icon size={20} style={{ color }} />
        </div>
        <div>
          <p className="text-[10px] font-bold text-[#555] uppercase tracking-widest">{label}</p>
          <p className="text-lg font-bold text-[#0a0a0a]">{formatBRL(value)}</p>
        </div>
      </div>
    </div>
  )

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <AppLayout title="Contas a Pagar">
      <div className="max-w-[1400px] mx-auto space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard icon={DollarSign} label="Total a pagar" value={kpis.totalPagar} color="#1a2e4a" />
          <KPICard icon={AlertTriangle} label="Vence hoje" value={kpis.venceHoje} color="#8b0000" />
          <KPICard icon={CalendarDays} label="Proximos 7 dias" value={kpis.prox7} color="#b8960a" />
          <KPICard icon={CheckCircle2} label="Pago no mes" value={pagoNoMes} color="#0a5c2e" />
        </div>

        {/* Batch selection bar */}
        {selectedIds.size > 0 && (
          <div className="sticky top-0 z-30 bg-[#1a2e4a] text-white rounded-lg px-4 py-3 flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-3 text-sm">
              <span className="font-bold">{selectedIds.size}</span>
              <span>titulo(s) selecionado(s)</span>
              <span className="font-bold">{formatBRL(selectedTotal)}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-xs px-3 py-1.5 rounded border border-white/30 hover:bg-white/10 transition"
              >
                Desmarcar
              </button>
              <button
                onClick={openBatchPay}
                className="text-xs px-3 py-1.5 rounded bg-white text-[#1a2e4a] font-semibold hover:bg-white/90 transition flex items-center gap-1"
              >
                Pagar selecionados
                <ChevronDown size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="border border-[#ccc] rounded-lg overflow-hidden">
          <div className="bg-[#1a2e4a] px-4 py-2.5 flex items-center justify-between">
            <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">Contas a Pagar</h3>
            <button
              onClick={openNewModal}
              className="flex items-center gap-1 text-[10px] font-bold text-white uppercase tracking-widest bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded transition"
            >
              <Plus size={14} /> Nova conta
            </button>
          </div>

          <div className="p-4 bg-white">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
              <div className="relative flex-1 w-full">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555]" />
                <input
                  type="text"
                  placeholder="Buscar por credor ou CPF/CNPJ..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-[#ccc] rounded-lg focus:outline-none focus:border-[#1a2e4a] text-[#0a0a0a]"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-sm border border-[#ccc] rounded-lg px-3 py-2 focus:outline-none focus:border-[#1a2e4a] text-[#0a0a0a] bg-white"
              >
                <option value="todos">Todos os status</option>
                <option value="aberto">Aberto</option>
                <option value="parcial">Parcial</option>
                <option value="vencido">Vencido</option>
              </select>
              <button
                onClick={loadData}
                className="flex items-center gap-1 text-sm text-[#555] hover:text-[#1a2e4a] transition"
                title="Atualizar"
              >
                <RefreshCw size={16} />
              </button>
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

              return (
                <div key={group} className="mb-5">
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
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg mb-1 transition hover:opacity-80"
                    style={{ backgroundColor: config.bgColor, borderLeft: `3px solid ${config.borderColor}` }}
                  >
                    <div className="flex items-center gap-2">
                      {isCollapsed ? (
                        <ChevronDown size={16} style={{ color: config.textColor }} />
                      ) : (
                        <ChevronUp size={16} style={{ color: config.textColor }} />
                      )}
                      <span className="text-xs font-bold uppercase tracking-wider" style={{ color: config.textColor }}>
                        {config.label}
                      </span>
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ color: config.textColor, backgroundColor: config.borderColor + '20' }}
                      >
                        {items.length} titulo(s)
                      </span>
                    </div>
                    <span className="text-xs font-bold" style={{ color: config.textColor }}>
                      {formatBRL(groupTotal)}
                    </span>
                  </button>

                  {/* Table */}
                  {!isCollapsed && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[#ccc]">
                            <th className="py-2 px-2 text-left w-8">
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
                            <th className="py-2 px-2 text-left text-[10px] font-bold text-[#555] uppercase tracking-wider">Credor</th>
                            <th className="py-2 px-2 text-left text-[10px] font-bold text-[#555] uppercase tracking-wider">Categoria</th>
                            <th className="py-2 px-2 text-left text-[10px] font-bold text-[#555] uppercase tracking-wider">Vencimento</th>
                            <th className="py-2 px-2 text-right text-[10px] font-bold text-[#555] uppercase tracking-wider">Valor</th>
                            <th className="py-2 px-2 text-left text-[10px] font-bold text-[#555] uppercase tracking-wider">Centro de custo</th>
                            <th className="py-2 px-2 text-center text-[10px] font-bold text-[#555] uppercase tracking-wider">Status</th>
                            <th className="py-2 px-2 text-center text-[10px] font-bold text-[#555] uppercase tracking-wider">Acoes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((cp) => {
                            const isHoje = group === 'hoje'
                            return (
                              <tr
                                key={cp.id}
                                className="border-b border-[#ccc]/50 hover:bg-[#f0f4f8]/50 transition"
                                style={isHoje ? { borderLeft: '3px solid #1a2e4a' } : undefined}
                              >
                                <td className="py-2.5 px-2">
                                  <input
                                    type="checkbox"
                                    checked={selectedIds.has(cp.id)}
                                    onChange={() => toggleSelect(cp.id)}
                                    className="rounded border-[#ccc]"
                                  />
                                </td>
                                <td className="py-2.5 px-2">
                                  <div className="font-medium text-[#0a0a0a]">{cp.credor_nome}</div>
                                  {cp.credor_cpf_cnpj && (
                                    <div className="text-[10px] text-[#555]">{cp.credor_cpf_cnpj}</div>
                                  )}
                                </td>
                                <td className="py-2.5 px-2">
                                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#f0f0f0] text-[#555] border border-[#ccc]">
                                    {inferCategoria(cp)}
                                  </span>
                                </td>
                                <td className="py-2.5 px-2 text-[#0a0a0a]">
                                  {formatData(cp.data_vencimento)}
                                </td>
                                <td className="py-2.5 px-2 text-right font-semibold text-[#0a0a0a]">
                                  {formatBRL(saldo(cp))}
                                  {cp.valor_pago > 0 && (
                                    <div className="text-[10px] text-[#555]">
                                      total: {formatBRL(cp.valor)}
                                    </div>
                                  )}
                                </td>
                                <td className="py-2.5 px-2 text-[#555] text-xs">
                                  {cp.centro_custo_id ? centroCustoMap[cp.centro_custo_id] || '\u2014' : '\u2014'}
                                </td>
                                <td className="py-2.5 px-2 text-center">
                                  <StatusBadge status={cp.status} />
                                </td>
                                <td className="py-2.5 px-2 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      onClick={() => openPayModal(cp)}
                                      className="text-[10px] font-semibold px-2.5 py-1 rounded bg-[#1a2e4a] text-white hover:bg-[#0f1f36] transition"
                                    >
                                      Pagar
                                    </button>
                                    <div className="relative">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setDropdownOpen(dropdownOpen === cp.id ? null : cp.id)
                                        }}
                                        className="p-1 rounded hover:bg-[#f0f0f0] transition"
                                      >
                                        <MoreHorizontal size={16} className="text-[#555]" />
                                      </button>
                                      {dropdownOpen === cp.id && (
                                        <div
                                          className="absolute right-0 top-full mt-1 bg-white border border-[#ccc] rounded-lg shadow-lg py-1 z-40 min-w-[180px]"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <button
                                            onClick={() => handleRenegociar(cp)}
                                            className="w-full text-left px-3 py-2 text-xs hover:bg-[#f0f4f8] transition flex items-center gap-2 text-[#0a0a0a]"
                                          >
                                            <CalendarClock size={14} /> Renegociar
                                          </button>
                                          <button
                                            onClick={() => handleCancelar(cp)}
                                            className="w-full text-left px-3 py-2 text-xs hover:bg-[#f0f4f8] transition flex items-center gap-2 text-[#8b0000]"
                                          >
                                            <Trash2 size={14} /> Cancelar
                                          </button>
                                          <button
                                            onClick={() => handleDividir(cp)}
                                            className="w-full text-left px-3 py-2 text-xs hover:bg-[#f0f4f8] transition flex items-center gap-2 text-[#0a0a0a]"
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
                  <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Comprovante / Observacao</label>
                  <textarea
                    value={payForm.observacao}
                    onChange={(e) => setPayForm({ ...payForm, observacao: e.target.value })}
                    rows={2}
                    className="w-full border border-[#ccc] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a2e4a] text-[#0a0a0a] resize-none"
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

        {/* ─── Modal: Nova CP ───────────────────────────────────────── */}
        {showNewModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowNewModal(false)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="bg-[#1a2e4a] px-5 py-3 rounded-t-xl flex items-center justify-between sticky top-0 z-10">
                <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">Nova Conta a Pagar</h3>
                <button onClick={() => setShowNewModal(false)} className="text-white/70 hover:text-white">
                  <X size={18} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Credor (nome)</label>
                  <input
                    type="text"
                    value={newForm.credorNome}
                    onChange={(e) => setNewForm({ ...newForm, credorNome: e.target.value })}
                    placeholder="Nome do credor"
                    className="w-full border border-[#ccc] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a2e4a] text-[#0a0a0a]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Descricao *</label>
                  <input
                    type="text"
                    value={newForm.descricao}
                    onChange={(e) => setNewForm({ ...newForm, descricao: e.target.value })}
                    placeholder="Descricao do pagamento"
                    className="w-full border border-[#ccc] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a2e4a] text-[#0a0a0a]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Valor *</label>
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

                <div>
                  <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Conta contabil</label>
                  <select
                    value={newForm.contaContabilId}
                    onChange={(e) => setNewForm({ ...newForm, contaContabilId: e.target.value })}
                    className="w-full border border-[#ccc] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a2e4a] text-[#0a0a0a] bg-white"
                  >
                    <option value="">Nenhuma</option>
                    {chartAccounts.map((ca) => (
                      <option key={ca.id} value={ca.id}>{ca.code} - {ca.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Centro de custo</label>
                  <select
                    value={newForm.centroCustoId}
                    onChange={(e) => setNewForm({ ...newForm, centroCustoId: e.target.value })}
                    className="w-full border border-[#ccc] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a2e4a] text-[#0a0a0a] bg-white"
                  >
                    <option value="">Nenhum</option>
                    {centrosCusto.map((cc) => (
                      <option key={cc.id} value={cc.id}>{cc.nome}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Recorrencia</label>
                    <select
                      value={newForm.recorrencia}
                      onChange={(e) => setNewForm({ ...newForm, recorrencia: e.target.value as Recorrencia })}
                      className="w-full border border-[#ccc] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a2e4a] text-[#0a0a0a] bg-white"
                    >
                      <option value="sem">Sem recorrencia</option>
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

                {newForm.recorrencia !== 'sem' && (
                  <div className="bg-[#fffbe6] border border-[#b8960a] rounded-lg p-3">
                    <p className="text-xs text-[#5c3a00]">
                      Serao geradas <strong>{newForm.numParcelas}</strong> parcelas de{' '}
                      <strong>{formatBRL(newForm.valor)}</strong> com vencimento{' '}
                      {newForm.recorrencia === 'mensal' ? 'mensal' : newForm.recorrencia === 'trimestral' ? 'trimestral' : 'anual'}.
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={() => setShowNewModal(false)}
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
                    {newForm.recorrencia !== 'sem' ? `Criar ${newForm.numParcelas} parcelas` : 'Criar conta'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
