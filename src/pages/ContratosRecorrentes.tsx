import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { safeQuery } from '@/lib/supabaseQuery'
import { formatBRL, formatData } from '@/lib/format'
import { calcularProximoVencimento } from '@/lib/financeiro/transacao'
import { AppLayout } from '@/components/layout/AppLayout'
import { format, parseISO, differenceInDays, addMonths, addDays } from 'date-fns'
import {
  Plus, Search, Pencil, Trash2, CalendarDays, RefreshCw,
  Pause, Play, MoreHorizontal, X, Loader2, ChevronDown, AlertTriangle,
} from 'lucide-react'

/* ================================================================
   TYPES
   ================================================================ */

interface Contrato {
  id: string
  company_id: string
  cliente_nome: string
  descricao: string
  valor: number
  periodicidade: string
  dia_vencimento: number
  data_inicio: string
  status: string
  proximo_vencimento: string | null
  conta_contabil_id?: string | null
  centro_custo_id?: string | null
}

interface ChartAccount { id: string; code: string; name: string }
interface CentroCusto { id: string; codigo: string; descricao: string }

/* ================================================================
   CONSTANTS
   ================================================================ */

const STATUS_OPTIONS = [
  { value: 'todos', label: 'Todos' },
  { value: 'ativo', label: 'Ativo' },
  { value: 'pausado', label: 'Pausado' },
  { value: 'inativo', label: 'Inativo' },
  { value: 'encerrado', label: 'Encerrado' },
]

const PERIODICIDADE_OPTIONS = [
  { value: 'todos', label: 'Todos' },
  { value: 'mensal', label: 'Mensal' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'semestral', label: 'Semestral' },
  { value: 'anual', label: 'Anual' },
]

const PERIODICIDADE_CARDS = [
  { value: 'mensal', label: 'Mensal' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'semestral', label: 'Semestral' },
  { value: 'anual', label: 'Anual' },
]

/* ================================================================
   HELPERS
   ================================================================ */

function statusBadge(status: string) {
  switch (status) {
    case 'ativo':
      return { label: 'Ativo', text: '#039855', bg: '#ECFDF3', border: '#039855' }
    case 'pausado':
      return { label: 'Pausado', text: '#F79009', bg: '#FFFAEB', border: '#F79009' }
    case 'inativo':
      return { label: 'Inativo', text: '#555', bg: '#F6F2EB', border: '#ccc' }
    case 'encerrado':
      return { label: 'Encerrado', text: '#D92D20', bg: '#FEF3F2', border: '#D92D20' }
    default:
      return { label: status, text: '#555', bg: '#F6F2EB', border: '#ccc' }
  }
}

function periodicidadeBadge(p: string) {
  const labels: Record<string, string> = {
    mensal: 'Mensal',
    trimestral: 'Trimestral',
    semestral: 'Semestral',
    anual: 'Anual',
  }
  return labels[p] || p
}

function vencimentoLabel(proximo: string | null): { text: string; color: string } {
  if (!proximo) return { text: '--', color: '#555' }
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const venc = parseISO(proximo)
  venc.setHours(0, 0, 0, 0)
  const diff = differenceInDays(venc, hoje)
  if (diff === 0) return { text: 'hoje', color: '#F79009' }
  if (diff > 0) return { text: `em ${diff} dia${diff > 1 ? 's' : ''}`, color: diff <= 7 ? '#F79009' : '#039855' }
  const abs = Math.abs(diff)
  return { text: `${abs} dia${abs > 1 ? 's' : ''} atras`, color: '#D92D20' }
}

function calcularPrimeiroVencimento(dataInicio: string, diaVencimento: number): string {
  const inicio = parseISO(dataInicio)
  const ano = inicio.getFullYear()
  const mes = inicio.getMonth()
  let primeiro = new Date(ano, mes, diaVencimento)
  if (primeiro <= inicio) {
    primeiro = addMonths(primeiro, 1)
  }
  return format(primeiro, 'yyyy-MM-dd')
}

/* ================================================================
   COMPONENT
   ================================================================ */

export default function ContratosRecorrentes() {
  const { selectedCompany } = useCompany()
  const { activeClient } = useAuth()

  // -- Data --
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [loading, setLoading] = useState(true)
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([])
  const [centrosCusto, setCentrosCusto] = useState<CentroCusto[]>([])

  // -- Filters --
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [periodicidadeFilter, setPeriodicidadeFilter] = useState('todos')

  // -- Modals --
  const [showModal, setShowModal] = useState(false)
  const [editingContrato, setEditingContrato] = useState<Contrato | null>(null)

  // -- Actions dropdown --
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // -- Toast --
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // -- Processing flag --
  const processedRef = useRef(false)

  /* ────────────────────────────────────────────────────────────────
     FETCH DATA
     ──────────────────────────────────────────────────────────────── */

  async function fetchContratos() {
    if (!selectedCompany) return
    setLoading(true)
    const data = await safeQuery(
      () => activeClient
        .from('contratos_recorrentes')
        .select('*')
        .eq('company_id', selectedCompany.id)
        .order('cliente_nome'),
      'listar contratos recorrentes',
    )
    setContratos((data as Contrato[]) || [])
    setLoading(false)
  }

  async function fetchAuxData() {
    if (!selectedCompany) return
    const [ca, cc] = await Promise.all([
      safeQuery(
        () => activeClient
          .from('chart_of_accounts')
          .select('id, code, name')
          .eq('company_id', selectedCompany.id)
          .or('type.eq.receita,type.eq.revenue')
          .order('code'),
        'chart_of_accounts receita',
      ),
      safeQuery(
        () => activeClient
          .from('centros_custo')
          .select('id, codigo, descricao')
          .eq('company_id', selectedCompany.id)
          .order('codigo'),
        'centros_custo',
      ),
    ])
    setChartAccounts((ca as ChartAccount[]) || [])
    setCentrosCusto((cc as CentroCusto[]) || [])
  }

  /* ────────────────────────────────────────────────────────────────
     AUTO-PROCESSING
     ──────────────────────────────────────────────────────────────── */

  async function processarContratosVencendo() {
    if (!selectedCompany) return
    const hoje = new Date().toISOString().split('T')[0]

    const vencidos = await safeQuery(
      () => activeClient
        .from('contratos_recorrentes')
        .select('*')
        .eq('company_id', selectedCompany.id)
        .eq('status', 'ativo')
        .lte('proximo_vencimento', hoje),
      'contratos vencendo',
    )

    if (!vencidos || (vencidos as Contrato[]).length === 0) return

    let gerados = 0
    for (const contrato of vencidos as Contrato[]) {
      // Insert CR
      const { error: errCR } = await activeClient.from('contas_receber').insert({
        company_id: contrato.company_id,
        pagador_nome: contrato.cliente_nome,
        valor: contrato.valor,
        data_vencimento: contrato.proximo_vencimento,
        status: 'aberto',
        contrato_recorrente_id: contrato.id,
        observacoes: contrato.descricao,
      })
      if (errCR) {
        console.error('[processarContratos] erro CR:', errCR)
        continue
      }

      // Update proximo_vencimento
      const novoVencimento = calcularProximoVencimento(
        contrato.proximo_vencimento!,
        contrato.periodicidade,
      )
      await activeClient
        .from('contratos_recorrentes')
        .update({ proximo_vencimento: novoVencimento })
        .eq('id', contrato.id)

      gerados++
    }

    if (gerados > 0) {
      showToast(`${gerados} conta(s) a receber gerada(s) automaticamente.`, 'success')
      fetchContratos()
    }
  }

  /* ────────────────────────────────────────────────────────────────
     EFFECTS
     ──────────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (selectedCompany) {
      processedRef.current = false
      fetchContratos()
      fetchAuxData()
    }
  }, [selectedCompany])

  useEffect(() => {
    if (!loading && contratos.length >= 0 && selectedCompany && !processedRef.current) {
      processedRef.current = true
      processarContratosVencendo()
    }
  }, [loading, selectedCompany])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  /* ────────────────────────────────────────────────────────────────
     TOAST
     ──────────────────────────────────────────────────────────────── */

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  /* ────────────────────────────────────────────────────────────────
     ACTIONS
     ──────────────────────────────────────────────────────────────── */

  async function togglePausar(contrato: Contrato) {
    const novoStatus = contrato.status === 'ativo' ? 'pausado' : 'ativo'
    const { error } = await activeClient
      .from('contratos_recorrentes')
      .update({ status: novoStatus })
      .eq('id', contrato.id)
    if (error) { showToast('Erro ao atualizar status.', 'error'); return }
    showToast(novoStatus === 'pausado' ? 'Contrato pausado.' : 'Contrato reativado.')
    setOpenDropdown(null)
    fetchContratos()
  }

  async function encerrarContrato(contrato: Contrato) {
    if (!confirm(`Encerrar contrato de ${contrato.cliente_nome}?`)) return
    const { error } = await activeClient
      .from('contratos_recorrentes')
      .update({ status: 'encerrado' })
      .eq('id', contrato.id)
    if (error) { showToast('Erro ao encerrar.', 'error'); return }
    showToast('Contrato encerrado.')
    setOpenDropdown(null)
    fetchContratos()
  }

  async function excluirContrato(contrato: Contrato) {
    if (!confirm(`Excluir contrato de ${contrato.cliente_nome}? Esta acao nao pode ser desfeita.`)) return
    const { error } = await activeClient
      .from('contratos_recorrentes')
      .delete()
      .eq('id', contrato.id)
    if (error) { showToast('Erro ao excluir.', 'error'); return }
    showToast('Contrato excluido.')
    setOpenDropdown(null)
    fetchContratos()
  }

  async function gerarCRAgora(contrato: Contrato) {
    const hoje = new Date().toISOString().split('T')[0]
    const diaStr = String(contrato.dia_vencimento).padStart(2, '0')
    const mesAtual = format(new Date(), 'yyyy-MM')
    const dataVencimento = `${mesAtual}-${diaStr}`

    const { error } = await activeClient.from('contas_receber').insert({
      company_id: contrato.company_id,
      pagador_nome: contrato.cliente_nome,
      valor: contrato.valor,
      data_vencimento: dataVencimento,
      status: 'aberto',
      contrato_recorrente_id: contrato.id,
      observacoes: contrato.descricao,
    })
    if (error) { showToast('Erro ao gerar CR.', 'error'); return }
    showToast('Conta a receber gerada com sucesso.')
    setOpenDropdown(null)
  }

  /* ────────────────────────────────────────────────────────────────
     KPIs
     ──────────────────────────────────────────────────────────────── */

  const kpis = useMemo(() => {
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const em7dias = addDays(hoje, 7)

    const ativos = contratos.filter(c => c.status === 'ativo')
    const receitaMensal = ativos
      .filter(c => c.periodicidade === 'mensal')
      .reduce((s, c) => s + c.valor, 0)
    const vencendoSemana = ativos.filter(c => {
      if (!c.proximo_vencimento) return false
      const v = parseISO(c.proximo_vencimento)
      return v >= hoje && v <= em7dias
    }).length
    const inativosPausados = contratos.filter(c => c.status === 'inativo' || c.status === 'pausado').length

    return { ativos: ativos.length, receitaMensal, vencendoSemana, inativosPausados }
  }, [contratos])

  /* ────────────────────────────────────────────────────────────────
     FILTERED LIST
     ──────────────────────────────────────────────────────────────── */

  const filtered = useMemo(() => {
    return contratos.filter(c => {
      if (statusFilter !== 'todos' && c.status !== statusFilter) return false
      if (periodicidadeFilter !== 'todos' && c.periodicidade !== periodicidadeFilter) return false
      if (search && !c.cliente_nome.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [contratos, statusFilter, periodicidadeFilter, search])

  /* ────────────────────────────────────────────────────────────────
     RENDER
     ──────────────────────────────────────────────────────────────── */

  return (
    <AppLayout title="Contratos Recorrentes">
      <div className="max-w-[1200px] mx-auto space-y-6">

        {/* TOAST */}
        {toast && (
          <div
            className="fixed top-4 right-4 z-[9999] px-4 py-3 rounded-lg border text-[13px] font-medium shadow-lg flex items-center gap-2"
            style={{
              background: toast.type === 'success' ? '#ECFDF3' : '#FEF3F2',
              borderColor: toast.type === 'success' ? '#039855' : '#D92D20',
              color: toast.type === 'success' ? '#039855' : '#D92D20',
            }}
          >
            {toast.msg}
            <button onClick={() => setToast(null)} className="ml-2 opacity-60 hover:opacity-100">
              <X size={14} />
            </button>
          </div>
        )}

        {/* HEADER */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#1D2939]">Contratos Recorrentes</h1>
            <p className="text-[13px] text-[#555] mt-0.5">
              Gerencie contratos e gere contas a receber automaticamente.
            </p>
          </div>
          <button
            onClick={() => { setEditingContrato(null); setShowModal(true) }}
            className="flex items-center gap-2 bg-[#059669] text-white text-[13px] font-semibold px-4 py-2.5 rounded-lg hover:bg-[#1D2939] transition-colors"
          >
            <Plus size={16} />
            Novo contrato
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard title="Contratos ativos" value={String(kpis.ativos)} color="#039855" bgColor="#ECFDF3" />
          <KPICard title="Receita mensal recorrente" value={formatBRL(kpis.receitaMensal)} color="#059669" bgColor="#ECFDF4" />
          <KPICard title="Vencendo esta semana" value={String(kpis.vencendoSemana)} color="#F79009" bgColor="#FFFAEB" />
          <KPICard title="Inativos / Pausados" value={String(kpis.inativosPausados)} color="#555" bgColor="#F6F2EB" />
        </div>

        {/* FILTERS */}
        <div className="border border-[#ccc] rounded-lg overflow-hidden">
          <div className="bg-[#059669] px-4 py-2.5 flex items-center justify-between">
            <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">Filtros</h3>
            <button
              onClick={() => { setSearch(''); setStatusFilter('todos'); setPeriodicidadeFilter('todos') }}
              className="text-[11px] font-semibold text-[#BFDBFE] hover:text-white transition-colors"
            >
              Limpar
            </button>
          </div>
          <div className="p-4 bg-white flex flex-wrap gap-3 items-end">
            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[11px] font-semibold text-[#555] uppercase tracking-wide mb-1">Buscar cliente</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#999]" />
                <input
                  type="text"
                  placeholder="Nome do cliente..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-[13px] border border-[#ccc] rounded-lg focus:outline-none focus:border-[#059669] focus:ring-1 focus:ring-[#059669]"
                />
              </div>
            </div>

            {/* Status */}
            <div className="min-w-[150px]">
              <label className="block text-[11px] font-semibold text-[#555] uppercase tracking-wide mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 text-[13px] border border-[#ccc] rounded-lg bg-white focus:outline-none focus:border-[#059669] focus:ring-1 focus:ring-[#059669]"
              >
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* Periodicidade */}
            <div className="min-w-[150px]">
              <label className="block text-[11px] font-semibold text-[#555] uppercase tracking-wide mb-1">Periodicidade</label>
              <select
                value={periodicidadeFilter}
                onChange={e => setPeriodicidadeFilter(e.target.value)}
                className="w-full px-3 py-2 text-[13px] border border-[#ccc] rounded-lg bg-white focus:outline-none focus:border-[#059669] focus:ring-1 focus:ring-[#059669]"
              >
                {PERIODICIDADE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* TABLE */}
        <div className="border border-[#ccc] rounded-lg overflow-hidden">
          <div className="bg-[#059669] px-4 py-2.5 flex items-center justify-between">
            <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">
              Contratos ({filtered.length})
            </h3>
            <button
              onClick={fetchContratos}
              className="text-[11px] font-semibold text-[#BFDBFE] hover:text-white transition-colors flex items-center gap-1"
            >
              <RefreshCw size={12} />
              Atualizar
            </button>
          </div>
          <div className="bg-white overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={20} className="animate-spin text-[#059669]" />
                <span className="ml-2 text-[13px] text-[#555]">Carregando...</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-[#555]">
                <CalendarDays size={32} className="mb-2 opacity-40" />
                <p className="text-[13px]">Nenhum contrato encontrado.</p>
              </div>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[#eee]">
                    <th className="text-left px-4 py-3 text-[11px] font-bold text-[#555] uppercase tracking-wide">Cliente</th>
                    <th className="text-left px-4 py-3 text-[11px] font-bold text-[#555] uppercase tracking-wide">Descricao</th>
                    <th className="text-right px-4 py-3 text-[11px] font-bold text-[#555] uppercase tracking-wide">Valor</th>
                    <th className="text-center px-4 py-3 text-[11px] font-bold text-[#555] uppercase tracking-wide">Periodicidade</th>
                    <th className="text-center px-4 py-3 text-[11px] font-bold text-[#555] uppercase tracking-wide">Prox. vencimento</th>
                    <th className="text-center px-4 py-3 text-[11px] font-bold text-[#555] uppercase tracking-wide">Status</th>
                    <th className="text-center px-4 py-3 text-[11px] font-bold text-[#555] uppercase tracking-wide w-[60px]">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => {
                    const sb = statusBadge(c.status)
                    const vl = vencimentoLabel(c.proximo_vencimento)
                    return (
                      <tr key={c.id} className="border-b border-[#EAECF0] hover:bg-[#fafbfc] transition-colors">
                        <td className="px-4 py-3 font-medium text-[#1D2939]">{c.cliente_nome}</td>
                        <td className="px-4 py-3 text-[#555] max-w-[200px] truncate">{c.descricao}</td>
                        <td className="px-4 py-3 text-right font-medium text-[#1D2939]">{formatBRL(c.valor)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-block px-2 py-0.5 text-[11px] font-semibold rounded-full border"
                            style={{ color: '#555', background: '#F6F2EB', borderColor: '#ccc' }}>
                            {periodicidadeBadge(c.periodicidade)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="text-[12px] font-medium" style={{ color: vl.color }}>
                            {c.proximo_vencimento ? formatData(c.proximo_vencimento) : '--'}
                          </div>
                          <div className="text-[11px]" style={{ color: vl.color }}>{vl.text}</div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className="inline-block px-2.5 py-0.5 text-[11px] font-semibold rounded-full border"
                            style={{ color: sb.text, background: sb.bg, borderColor: sb.border }}
                          >
                            {sb.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center relative" ref={openDropdown === c.id ? dropdownRef : undefined}>
                          <button
                            onClick={() => setOpenDropdown(openDropdown === c.id ? null : c.id)}
                            className="p-1.5 rounded-lg hover:bg-[#EAECF0] transition-colors"
                          >
                            <MoreHorizontal size={16} className="text-[#555]" />
                          </button>
                          {openDropdown === c.id && (
                            <div className="absolute right-4 top-10 z-50 bg-white border border-[#ccc] rounded-lg shadow-lg py-1 min-w-[180px]">
                              <button
                                onClick={() => togglePausar(c)}
                                className="w-full text-left px-3 py-2 text-[13px] hover:bg-[#F6F2EB] flex items-center gap-2 transition-colors"
                              >
                                {c.status === 'ativo' ? <Pause size={14} className="text-[#F79009]" /> : <Play size={14} className="text-[#039855]" />}
                                {c.status === 'ativo' ? 'Pausar' : 'Reativar'}
                              </button>
                              <button
                                onClick={() => { setEditingContrato(c); setShowModal(true); setOpenDropdown(null) }}
                                className="w-full text-left px-3 py-2 text-[13px] hover:bg-[#F6F2EB] flex items-center gap-2 transition-colors"
                              >
                                <Pencil size={14} className="text-[#555]" />
                                Editar
                              </button>
                              <button
                                onClick={() => encerrarContrato(c)}
                                className="w-full text-left px-3 py-2 text-[13px] hover:bg-[#F6F2EB] flex items-center gap-2 transition-colors"
                              >
                                <AlertTriangle size={14} className="text-[#F79009]" />
                                Encerrar contrato
                              </button>
                              <button
                                onClick={() => gerarCRAgora(c)}
                                className="w-full text-left px-3 py-2 text-[13px] hover:bg-[#F6F2EB] flex items-center gap-2 transition-colors"
                              >
                                <RefreshCw size={14} className="text-[#059669]" />
                                Gerar CR agora
                              </button>
                              <div className="border-t border-[#eee] my-1" />
                              <button
                                onClick={() => excluirContrato(c)}
                                className="w-full text-left px-3 py-2 text-[13px] hover:bg-[#FEF3F2] flex items-center gap-2 text-[#D92D20] transition-colors"
                              >
                                <Trash2 size={14} />
                                Excluir
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* MODAL */}
        {showModal && (
          <ContratoModal
            contrato={editingContrato}
            companyId={selectedCompany?.id || ''}
            activeClient={activeClient}
            chartAccounts={chartAccounts}
            centrosCusto={centrosCusto}
            onClose={() => { setShowModal(false); setEditingContrato(null) }}
            onSaved={() => { setShowModal(false); setEditingContrato(null); fetchContratos(); showToast(editingContrato ? 'Contrato atualizado.' : 'Contrato criado.') }}
          />
        )}
      </div>
    </AppLayout>
  )
}

/* ================================================================
   KPI CARD
   ================================================================ */

function KPICard({ title, value, color, bgColor }: { title: string; value: string; color: string; bgColor: string }) {
  return (
    <div className="border border-[#ccc] rounded-lg overflow-hidden">
      <div className="px-4 py-3" style={{ background: bgColor }}>
        <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color }}>{title}</p>
        <p className="text-lg font-bold" style={{ color }}>{value}</p>
      </div>
    </div>
  )
}

/* ================================================================
   MODAL NOVO / EDITAR CONTRATO
   ================================================================ */

interface ModalProps {
  contrato: Contrato | null
  companyId: string
  activeClient: any
  chartAccounts: ChartAccount[]
  centrosCusto: CentroCusto[]
  onClose: () => void
  onSaved: () => void
}

function ContratoModal({ contrato, companyId, activeClient, chartAccounts, centrosCusto, onClose, onSaved }: ModalProps) {
  const isEdit = !!contrato

  const [clienteNome, setClienteNome] = useState(contrato?.cliente_nome || '')
  const [descricao, setDescricao] = useState(contrato?.descricao || '')
  const [valor, setValor] = useState(contrato ? String(contrato.valor) : '')
  const [periodicidade, setPeriodicidade] = useState(contrato?.periodicidade || 'mensal')
  const [diaVencimento, setDiaVencimento] = useState(contrato ? String(contrato.dia_vencimento) : '10')
  const [dataInicio, setDataInicio] = useState(contrato?.data_inicio || format(new Date(), 'yyyy-MM-dd'))
  const [contaContabilId, setContaContabilId] = useState(contrato?.conta_contabil_id || '')
  const [centroCustoId, setCentroCustoId] = useState(contrato?.centro_custo_id || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const valorNum = parseFloat(valor) || 0
  const diaNum = parseInt(diaVencimento) || 10

  const primeiroVencimento = useMemo(() => {
    if (!dataInicio || diaNum < 1 || diaNum > 28) return null
    return calcularPrimeiroVencimento(dataInicio, diaNum)
  }, [dataInicio, diaNum])

  async function handleSave() {
    setError('')
    if (!clienteNome.trim()) { setError('Cliente e obrigatorio.'); return }
    if (!descricao.trim()) { setError('Descricao e obrigatoria.'); return }
    if (valorNum <= 0) { setError('Valor deve ser maior que zero.'); return }
    if (diaNum < 1 || diaNum > 28) { setError('Dia do vencimento deve ser entre 1 e 28.'); return }
    if (!dataInicio) { setError('Data de inicio e obrigatoria.'); return }

    setSaving(true)

    const payload: any = {
      company_id: companyId,
      cliente_nome: clienteNome.trim(),
      descricao: descricao.trim(),
      valor: valorNum,
      periodicidade,
      dia_vencimento: diaNum,
      data_inicio: dataInicio,
      conta_contabil_id: contaContabilId || null,
      centro_custo_id: centroCustoId || null,
    }

    if (!isEdit) {
      payload.status = 'ativo'
      payload.proximo_vencimento = primeiroVencimento
    }

    let err: any
    if (isEdit) {
      // Recalc proximo_vencimento if periodicidade or dia changed
      if (contrato!.periodicidade !== periodicidade || contrato!.dia_vencimento !== diaNum) {
        payload.proximo_vencimento = calcularPrimeiroVencimento(
          new Date().toISOString().split('T')[0],
          diaNum,
        )
      }
      const res = await activeClient
        .from('contratos_recorrentes')
        .update(payload)
        .eq('id', contrato!.id)
      err = res.error
    } else {
      const res = await activeClient
        .from('contratos_recorrentes')
        .insert(payload)
      err = res.error
    }

    setSaving(false)
    if (err) { setError(err.message || 'Erro ao salvar.'); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-[540px] max-h-[90vh] overflow-y-auto mx-4">
        {/* Header */}
        <div className="bg-[#059669] px-5 py-3.5 flex items-center justify-between rounded-t-xl">
          <h2 className="text-[12px] font-bold text-white uppercase tracking-widest">
            {isEdit ? 'Editar contrato' : 'Novo contrato'}
          </h2>
          <button onClick={onClose} className="text-[#BFDBFE] hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="px-3 py-2 rounded-lg text-[13px] font-medium border"
              style={{ background: '#FEF3F2', borderColor: '#D92D20', color: '#D92D20' }}>
              {error}
            </div>
          )}

          {/* Cliente */}
          <div>
            <label className="block text-[11px] font-semibold text-[#555] uppercase tracking-wide mb-1">
              Cliente *
            </label>
            <input
              type="text"
              value={clienteNome}
              onChange={e => setClienteNome(e.target.value)}
              placeholder="Nome do cliente"
              className="w-full px-3 py-2 text-[13px] border border-[#ccc] rounded-lg focus:outline-none focus:border-[#059669] focus:ring-1 focus:ring-[#059669]"
            />
          </div>

          {/* Descricao */}
          <div>
            <label className="block text-[11px] font-semibold text-[#555] uppercase tracking-wide mb-1">
              Descricao *
            </label>
            <input
              type="text"
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              placeholder="Servico mensal, consultoria, etc."
              className="w-full px-3 py-2 text-[13px] border border-[#ccc] rounded-lg focus:outline-none focus:border-[#059669] focus:ring-1 focus:ring-[#059669]"
            />
          </div>

          {/* Valor */}
          <div>
            <label className="block text-[11px] font-semibold text-[#555] uppercase tracking-wide mb-1">
              Valor *
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={valor}
              onChange={e => setValor(e.target.value)}
              placeholder="0,00"
              className="w-full px-3 py-2 text-[13px] border border-[#ccc] rounded-lg focus:outline-none focus:border-[#059669] focus:ring-1 focus:ring-[#059669]"
            />
          </div>

          {/* Periodicidade */}
          <div>
            <label className="block text-[11px] font-semibold text-[#555] uppercase tracking-wide mb-1">
              Periodicidade *
            </label>
            <div className="grid grid-cols-4 gap-2">
              {PERIODICIDADE_CARDS.map(p => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPeriodicidade(p.value)}
                  className="py-2 px-2 text-[12px] font-semibold rounded-lg border text-center transition-colors"
                  style={{
                    borderColor: periodicidade === p.value ? '#059669' : '#ccc',
                    background: periodicidade === p.value ? '#059669' : '#fff',
                    color: periodicidade === p.value ? '#fff' : '#555',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Dia vencimento + Data inicio */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-[#555] uppercase tracking-wide mb-1">
                Dia do vencimento *
              </label>
              <input
                type="number"
                min="1"
                max="28"
                value={diaVencimento}
                onChange={e => setDiaVencimento(e.target.value)}
                className="w-full px-3 py-2 text-[13px] border border-[#ccc] rounded-lg focus:outline-none focus:border-[#059669] focus:ring-1 focus:ring-[#059669]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#555] uppercase tracking-wide mb-1">
                Data de inicio *
              </label>
              <input
                type="date"
                value={dataInicio}
                onChange={e => setDataInicio(e.target.value)}
                className="w-full px-3 py-2 text-[13px] border border-[#ccc] rounded-lg focus:outline-none focus:border-[#059669] focus:ring-1 focus:ring-[#059669]"
              />
            </div>
          </div>

          {/* Conta contabil */}
          <div>
            <label className="block text-[11px] font-semibold text-[#555] uppercase tracking-wide mb-1">
              Conta contabil
            </label>
            <select
              value={contaContabilId}
              onChange={e => setContaContabilId(e.target.value)}
              className="w-full px-3 py-2 text-[13px] border border-[#ccc] rounded-lg bg-white focus:outline-none focus:border-[#059669] focus:ring-1 focus:ring-[#059669]"
            >
              <option value="">Selecionar (opcional)</option>
              {chartAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
              ))}
            </select>
          </div>

          {/* Centro de custo */}
          <div>
            <label className="block text-[11px] font-semibold text-[#555] uppercase tracking-wide mb-1">
              Centro de custo
            </label>
            <select
              value={centroCustoId}
              onChange={e => setCentroCustoId(e.target.value)}
              className="w-full px-3 py-2 text-[13px] border border-[#ccc] rounded-lg bg-white focus:outline-none focus:border-[#059669] focus:ring-1 focus:ring-[#059669]"
            >
              <option value="">Selecionar (opcional)</option>
              {centrosCusto.map(cc => (
                <option key={cc.id} value={cc.id}>{cc.codigo} - {cc.descricao}</option>
              ))}
            </select>
          </div>

          {/* Preview */}
          {!isEdit && primeiroVencimento && valorNum > 0 && (
            <div
              className="px-4 py-3 rounded-lg border text-[13px] font-medium"
              style={{ background: '#ECFDF3', borderColor: '#039855', color: '#039855' }}
            >
              Primeiro CR sera gerado em {formatData(primeiroVencimento)} no valor de {formatBRL(valorNum)}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2.5 text-[13px] font-semibold text-[#555] border border-[#ccc] rounded-lg hover:bg-[#F6F2EB] transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2.5 text-[13px] font-semibold text-white bg-[#059669] rounded-lg hover:bg-[#1D2939] transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {isEdit ? 'Salvar alteracoes' : 'Criar contrato'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
