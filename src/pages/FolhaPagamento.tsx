import { useState, useEffect, useMemo, useCallback } from 'react'
import { format, addMonths } from 'date-fns'
import {
  DollarSign, Users, Calculator, Loader2, Plus, X,
  Search, RefreshCw, Check, Lock, FileText, ChevronLeft,
  ChevronRight, MoreHorizontal, Download, AlertTriangle
} from 'lucide-react'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { formatBRL, formatData } from '@/lib/format'
import { AppLayout } from '@/components/layout/AppLayout'
import { toast } from 'sonner'

// ─── Types ──────────────────────────────────────────────────────────
interface FolhaPagamento {
  id: string
  company_id: string
  employee_id: string
  competencia: string
  tipo: string
  salario_base: number
  horas_extras_50: number
  horas_extras_100: number
  valor_he_50: number
  valor_he_100: number
  adicional_noturno: number
  periculosidade: number
  insalubridade: number
  outros_proventos: number
  total_proventos: number
  inss_funcionario: number
  irrf: number
  vale_transporte: number
  vale_refeicao: number
  plano_saude: number
  adiantamento_desc: number
  outros_descontos: number
  total_descontos: number
  valor_liquido: number
  fgts_mes: number
  inss_patronal: number
  status: string
  holerite_url: string | null
  conta_pagar_id: string | null
  created_at: string
}

interface Funcionario {
  id: string
  nome_completo?: string | null
  name?: string | null
  role?: string | null
  salary?: number | null
  salario_base?: number | null
  hire_date?: string | null
  status: string
}

interface FaixaINSS {
  faixa_min: number
  faixa_max: number | null
  aliquota: number
}

interface FaixaIRRF {
  faixa_min: number
  faixa_max: number | null
  aliquota: number
  deducao: number
}

// ─── Status config ──────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  rascunho: { label: 'Rascunho', color: '#667085', bg: '#F3F4F6' },
  fechada: { label: 'Fechada', color: '#F79009', bg: '#FFFAEB' },
  paga: { label: 'Paga', color: '#059669', bg: '#ECFDF3' },
  retificada: { label: 'Retificada', color: '#D92D20', bg: '#FEF3F2' },
}

const TIPO_LABELS: Record<string, string> = {
  mensal: 'Mensal',
  ferias: 'Ferias',
  rescisao: 'Rescisao',
  '13_primeiro': '13o 1a parcela',
  '13_segundo': '13o 2a parcela',
  adiantamento: 'Adiantamento',
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]

// ─── Calculo INSS progressivo ───────────────────────────────────────
function calcularINSS(salarioBruto: number, faixas: FaixaINSS[]): number {
  if (faixas.length === 0) {
    // Fallback 2025
    const FAIXAS_DEFAULT: FaixaINSS[] = [
      { faixa_min: 0, faixa_max: 1518.00, aliquota: 7.50 },
      { faixa_min: 1518.01, faixa_max: 2793.88, aliquota: 9.00 },
      { faixa_min: 2793.89, faixa_max: 4190.83, aliquota: 12.00 },
      { faixa_min: 4190.84, faixa_max: 8157.41, aliquota: 14.00 },
    ]
    faixas = FAIXAS_DEFAULT
  }

  let inss = 0
  let salarioRestante = salarioBruto

  for (const faixa of faixas) {
    if (salarioRestante <= 0) break
    const teto = faixa.faixa_max || Infinity
    const base = Math.min(salarioRestante, teto - faixa.faixa_min + 0.01)
    if (base > 0) {
      inss += base * (faixa.aliquota / 100)
      salarioRestante -= base
    }
  }

  return Math.round(inss * 100) / 100
}

// ─── Calculo IRRF ───────────────────────────────────────────────────
function calcularIRRF(baseCalculo: number, faixas: FaixaIRRF[]): number {
  if (faixas.length === 0) {
    const FAIXAS_DEFAULT: FaixaIRRF[] = [
      { faixa_min: 0, faixa_max: 2259.20, aliquota: 0, deducao: 0 },
      { faixa_min: 2259.21, faixa_max: 2826.65, aliquota: 7.50, deducao: 169.44 },
      { faixa_min: 2826.66, faixa_max: 3751.05, aliquota: 15.00, deducao: 381.44 },
      { faixa_min: 3751.06, faixa_max: 4664.68, aliquota: 22.50, deducao: 662.77 },
      { faixa_min: 4664.69, faixa_max: null, aliquota: 27.50, deducao: 896.00 },
    ]
    faixas = FAIXAS_DEFAULT
  }

  for (let i = faixas.length - 1; i >= 0; i--) {
    if (baseCalculo >= faixas[i].faixa_min) {
      const irrf = baseCalculo * (faixas[i].aliquota / 100) - faixas[i].deducao
      return Math.max(0, Math.round(irrf * 100) / 100)
    }
  }
  return 0
}

// ─── Component ──────────────────────────────────────────────────────
export default function FolhaPagamentoPage() {
  const { selectedCompany } = useCompany()
  const { activeClient } = useAuth()

  // Data
  const [folhas, setFolhas] = useState<FolhaPagamento[]>([])
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([])
  const [faixasINSS, setFaixasINSS] = useState<FaixaINSS[]>([])
  const [faixasIRRF, setFaixasIRRF] = useState<FaixaIRRF[]>([])
  const [loading, setLoading] = useState(true)
  const [calculating, setCalculating] = useState(false)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [competencia, setCompetencia] = useState(() => format(new Date(), 'yyyy-MM'))
  const [statusFilter, setStatusFilter] = useState('todos')

  // Modals
  const [showCalcModal, setShowCalcModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedFolha, setSelectedFolha] = useState<FolhaPagamento | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Calc form
  const [calcForm, setCalcForm] = useState({
    tipo: 'mensal',
    funcionarioIds: [] as string[],
    selectAll: true,
  })

  // ─── Data Loading ───────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!selectedCompany || !activeClient) return
    setLoading(true)
    const db = activeClient as any

    const [folhaRes, funcRes, inssRes, irrfRes] = await Promise.all([
      db.from('folha_pagamento')
        .select('*')
        .eq('company_id', selectedCompany.id)
        .eq('competencia', competencia)
        .order('created_at', { ascending: false }),
      db.from('employees')
        .select('*')
        .eq('company_id', selectedCompany.id)
        .order('created_at', { ascending: false }),
      db.from('config_tabela_inss')
        .select('faixa_min, faixa_max, aliquota')
        .eq('ano', new Date().getFullYear())
        .order('faixa_min'),
      db.from('config_tabela_irrf')
        .select('faixa_min, faixa_max, aliquota, deducao')
        .eq('ano', new Date().getFullYear())
        .order('faixa_min'),
    ])

    console.log('[FolhaPag] company_id:', selectedCompany.id)
    console.log('[FolhaPag] funcRes:', funcRes)
    console.log('[FolhaPag] funcRes.error:', funcRes.error)
    console.log('[FolhaPag] funcRes.data:', funcRes.data)

    setFolhas(folhaRes.data || [])
    setFuncionarios(funcRes.data || [])
    setFaixasINSS(inssRes.data || [])
    setFaixasIRRF(irrfRes.data || [])
    setLoading(false)
  }, [selectedCompany, activeClient, competencia])

  useEffect(() => { loadData() }, [loadData])

  const funcionariosAtivos = useMemo(() =>
    funcionarios.filter(f => (f.status || '').toLowerCase() === 'ativo'), [funcionarios])

  // ─── KPIs ─────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const totalProventos = folhas.reduce((s, f) => s + (f.total_proventos || 0), 0)
    const totalDescontos = folhas.reduce((s, f) => s + (f.total_descontos || 0), 0)
    const totalLiquido = folhas.reduce((s, f) => s + (f.valor_liquido || 0), 0)
    const totalEncargos = folhas.reduce((s, f) => s + (f.fgts_mes || 0) + (f.inss_patronal || 0), 0)
    const custoTotal = totalProventos + totalEncargos
    return { totalProventos, totalDescontos, totalLiquido, totalEncargos, custoTotal, qtd: folhas.length }
  }, [folhas])

  // ─── Nome do funcionario ──────────────────────────────────────────
  const getNomeFuncionario = (funcId: string) => {
    const func = funcionarios.find(f => f.id === funcId)
    return func?.nome_completo || func?.name || '—'
  }

  // ─── Filtered ─────────────────────────────────────────────────────
  const filteredFolhas = useMemo(() => {
    let list = folhas
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      list = list.filter(f => getNomeFuncionario(f.employee_id).toLowerCase().includes(term))
    }
    if (statusFilter !== 'todos') {
      list = list.filter(f => f.status === statusFilter)
    }
    return list
  }, [folhas, searchTerm, statusFilter, funcionarios])

  // ─── Calcular folha ───────────────────────────────────────────────
  const handleCalcularFolha = async () => {
    if (!selectedCompany) return
    setCalculating(true)
    const db = activeClient as any

    try {
      const funcsParaCalc = calcForm.selectAll
        ? funcionariosAtivos
        : funcionariosAtivos.filter(f => calcForm.funcionarioIds.includes(f.id))

      if (funcsParaCalc.length === 0) {
        toast.error('Nenhum funcionario selecionado')
        setCalculating(false)
        return
      }

      let criados = 0
      let ignorados = 0

      for (const func of funcsParaCalc) {
        // Verificar se ja existe
        const { data: existing } = await db.from('folha_pagamento')
          .select('id')
          .eq('company_id', selectedCompany.id)
          .eq('employee_id', func.id)
          .eq('competencia', competencia)
          .eq('tipo', calcForm.tipo)
          .maybeSingle()

        if (existing) {
          ignorados++
          continue
        }

        const salarioBase = func.salario_base || func.salary || 0

        // Calcular INSS progressivo
        const inssFunc = calcularINSS(salarioBase, faixasINSS)

        // Calcular IRRF
        const baseIRRF = salarioBase - inssFunc
        const irrf = calcularIRRF(baseIRRF, faixasIRRF)

        // VT: 6% do salario (desconto funcionario)
        const vt = Math.round(salarioBase * 0.06 * 100) / 100

        // FGTS: 8% do salario
        const fgts = Math.round(salarioBase * 0.08 * 100) / 100

        // INSS patronal: 20% (se nao Simples Nacional)
        const inssPatronal = Math.round(salarioBase * 0.20 * 100) / 100

        const totalProventos = salarioBase
        const totalDescontos = Math.round((inssFunc + irrf + vt) * 100) / 100
        const valorLiquido = Math.round((totalProventos - totalDescontos) * 100) / 100

        await db.from('folha_pagamento').insert({
          company_id: selectedCompany.id,
          employee_id: func.id,
          competencia,
          tipo: calcForm.tipo,
          salario_base: salarioBase,
          total_proventos: totalProventos,
          inss_funcionario: inssFunc,
          irrf,
          vale_transporte: vt,
          total_descontos: totalDescontos,
          valor_liquido: valorLiquido,
          fgts_mes: fgts,
          inss_patronal: inssPatronal,
          status: 'rascunho',
        })

        criados++
      }

      toast.success(`Folha calculada: ${criados} funcionario(s). ${ignorados > 0 ? `${ignorados} ja existente(s).` : ''}`)
      setShowCalcModal(false)
      loadData()
    } catch (err: any) {
      console.error('Erro ao calcular folha:', err)
      toast.error(err.message || 'Erro ao calcular folha')
    } finally {
      setCalculating(false)
    }
  }

  // ─── Fechar folha (todas do mes) ──────────────────────────────────
  const handleFecharFolha = async () => {
    if (!selectedCompany) return
    const rascunhos = folhas.filter(f => f.status === 'rascunho')
    if (rascunhos.length === 0) {
      toast.error('Nenhuma folha em rascunho para fechar')
      return
    }

    setSubmitting(true)
    const db = activeClient as any

    try {
      const ids = rascunhos.map(f => f.id)
      const { error } = await db.from('folha_pagamento')
        .update({ status: 'fechada' })
        .in('id', ids)

      if (error) throw error

      // Gerar CP consolidado
      const totalLiquido = rascunhos.reduce((s, f) => s + f.valor_liquido, 0)
      const [ano, mes] = competencia.split('-')
      const mesLabel = MESES[parseInt(mes) - 1]

      await db.from('contas_pagar').insert({
        company_id: selectedCompany.id,
        credor_nome: 'Folha de pagamento',
        descricao: `Folha ${mesLabel}/${ano} - ${rascunhos.length} funcionario(s)`,
        valor: totalLiquido,
        data_vencimento: `${competencia}-05`,
        status: 'aberto',
        competencia,
      })

      toast.success(`Folha fechada: ${rascunhos.length} registro(s)`)
      loadData()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao fechar folha')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Competencia label ────────────────────────────────────────────
  const compLabel = useMemo(() => {
    const [ano, mes] = competencia.split('-')
    return `${MESES[parseInt(mes) - 1]} ${ano}`
  }, [competencia])

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <AppLayout title="Folha de Pagamento">
      <div className="p-6 space-y-6">

        {/* ── KPIs ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: 'Total proventos', value: formatBRL(kpis.totalProventos), icon: DollarSign, color: '#1E3A8A' },
            { label: 'Total descontos', value: formatBRL(kpis.totalDescontos), icon: Calculator, color: '#D92D20' },
            { label: 'Liquido a pagar', value: formatBRL(kpis.totalLiquido), icon: DollarSign, color: '#059669' },
            { label: 'Encargos patronais', value: formatBRL(kpis.totalEncargos), icon: Calculator, color: '#F79009' },
            { label: 'Funcionarios', value: kpis.qtd, icon: Users, color: '#1E3A8A' },
          ].map((kpi, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: kpi.color + '12' }}>
                <kpi.icon size={18} style={{ color: kpi.color }} />
              </div>
              <div>
                <p className="text-xs text-gray-500">{kpi.label}</p>
                <p className="text-base font-semibold" style={{ color: kpi.color }}>{kpi.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Toolbar ── */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowCalcModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
            style={{ backgroundColor: '#1E3A8A' }}
          >
            <Calculator size={16} /> Calcular folha
          </button>

          <button
            onClick={handleFecharFolha}
            disabled={submitting || folhas.filter(f => f.status === 'rascunho').length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            <Lock size={16} /> Fechar folha
          </button>

          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={() => {
                const [a, m] = competencia.split('-').map(Number)
                const prev = addMonths(new Date(a, m - 1, 1), -1)
                setCompetencia(format(prev, 'yyyy-MM'))
              }}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
            >
              <ChevronLeft size={16} className="text-gray-500" />
            </button>
            <span className="text-sm font-medium text-gray-700 min-w-[120px] text-center">{compLabel}</span>
            <button
              onClick={() => {
                const [a, m] = competencia.split('-').map(Number)
                const next = addMonths(new Date(a, m - 1, 1), 1)
                setCompetencia(format(next, 'yyyy-MM'))
              }}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
            >
              <ChevronRight size={16} className="text-gray-500" />
            </button>
          </div>

          <div className="relative max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar funcionario..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
          >
            <option value="todos">Todos status</option>
            <option value="rascunho">Rascunho</option>
            <option value="fechada">Fechada</option>
            <option value="paga">Paga</option>
          </select>

          <button onClick={loadData} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
            <RefreshCw size={16} className="text-gray-500" />
          </button>
        </div>

        {/* ── Table ── */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="animate-spin text-gray-400" size={24} />
            </div>
          ) : filteredFolhas.length === 0 ? (
            <div className="text-center py-20 text-gray-400 text-sm">
              Nenhuma folha para {compLabel}. Clique em "Calcular folha" para gerar.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase">
                    <th className="px-4 py-3">Funcionario</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3 text-right">Salario base</th>
                    <th className="px-4 py-3 text-right">Proventos</th>
                    <th className="px-4 py-3 text-right">Descontos</th>
                    <th className="px-4 py-3 text-right">Liquido</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-center">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFolhas.map(f => {
                    const st = STATUS_CONFIG[f.status] || STATUS_CONFIG.rascunho
                    return (
                      <tr key={f.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3 font-medium">{getNomeFuncionario(f.employee_id)}</td>
                        <td className="px-4 py-3 text-gray-500">{TIPO_LABELS[f.tipo] || f.tipo}</td>
                        <td className="px-4 py-3 text-right">{formatBRL(f.salario_base)}</td>
                        <td className="px-4 py-3 text-right text-green-700">{formatBRL(f.total_proventos)}</td>
                        <td className="px-4 py-3 text-right text-red-600">{formatBRL(f.total_descontos)}</td>
                        <td className="px-4 py-3 text-right font-semibold">{formatBRL(f.valor_liquido)}</td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{ color: st.color, backgroundColor: st.bg }}
                          >
                            {f.status === 'fechada' && <Lock size={10} />}
                            {f.status === 'paga' && <Check size={10} />}
                            {st.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1 relative">
                            <button
                              onClick={() => { setSelectedFolha(f); setShowDetailModal(true) }}
                              className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                              title="Ver detalhes"
                            >
                              <FileText size={14} />
                            </button>
                            <button
                              onClick={() => setDropdownOpen(dropdownOpen === f.id ? null : f.id)}
                              className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                            >
                              <MoreHorizontal size={14} />
                            </button>
                            {dropdownOpen === f.id && (
                              <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px]">
                                {f.status === 'rascunho' && (
                                  <button
                                    onClick={async () => {
                                      const db = activeClient as any
                                      await db.from('folha_pagamento').delete().eq('id', f.id)
                                      toast.success('Folha excluida')
                                      setDropdownOpen(null)
                                      loadData()
                                    }}
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 text-red-600"
                                  >
                                    <X size={14} /> Excluir
                                  </button>
                                )}
                                {f.holerite_url && (
                                  <a
                                    href={f.holerite_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                                  >
                                    <Download size={14} /> Holerite
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 bg-gray-50 font-semibold text-sm">
                    <td className="px-4 py-3" colSpan={3}>Total ({filteredFolhas.length} funcionarios)</td>
                    <td className="px-4 py-3 text-right text-green-700">{formatBRL(kpis.totalProventos)}</td>
                    <td className="px-4 py-3 text-right text-red-600">{formatBRL(kpis.totalDescontos)}</td>
                    <td className="px-4 py-3 text-right">{formatBRL(kpis.totalLiquido)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ═══ MODAL: Calcular folha ═══ */}
      {showCalcModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-800">Calcular folha — {compLabel}</h2>
              <button onClick={() => setShowCalcModal(false)} className="p-1 rounded hover:bg-gray-100">
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tipo</label>
                <select
                  value={calcForm.tipo}
                  onChange={e => setCalcForm(prev => ({ ...prev, tipo: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                >
                  <option value="mensal">Mensal</option>
                  <option value="adiantamento">Adiantamento</option>
                  <option value="13_primeiro">13o — 1a parcela</option>
                  <option value="13_segundo">13o — 2a parcela</option>
                  <option value="ferias">Ferias</option>
                </select>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={calcForm.selectAll}
                    onChange={e => setCalcForm(prev => ({ ...prev, selectAll: e.target.checked }))}
                    className="rounded border-gray-300"
                  />
                  Todos os funcionarios ativos ({funcionariosAtivos.length})
                </label>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1">
                <p>INSS: tabela progressiva {new Date().getFullYear()}</p>
                <p>IRRF: tabela progressiva {new Date().getFullYear()}</p>
                <p>FGTS: 8% | INSS patronal: 20%</p>
                <p>VT: 6% do salario base</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button
                onClick={() => setShowCalcModal(false)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCalcularFolha}
                disabled={calculating}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: '#1E3A8A' }}
              >
                {calculating ? <Loader2 size={16} className="animate-spin" /> : <Calculator size={16} />}
                Calcular
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: Detalhe da folha ═══ */}
      {showDetailModal && selectedFolha && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-800">
                {getNomeFuncionario(selectedFolha.employee_id)}
              </h2>
              <button onClick={() => setShowDetailModal(false)} className="p-1 rounded hover:bg-gray-100">
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-sm">
              {/* Proventos */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Proventos</h4>
                <div className="space-y-1">
                  {[
                    ['Salario base', selectedFolha.salario_base],
                    ['Horas extras 50%', selectedFolha.valor_he_50],
                    ['Horas extras 100%', selectedFolha.valor_he_100],
                    ['Adicional noturno', selectedFolha.adicional_noturno],
                    ['Periculosidade', selectedFolha.periculosidade],
                    ['Insalubridade', selectedFolha.insalubridade],
                    ['Outros proventos', selectedFolha.outros_proventos],
                  ].filter(([_, v]) => (v as number) > 0).map(([label, valor], i) => (
                    <div key={i} className="flex justify-between py-1 border-b border-gray-50">
                      <span className="text-gray-500">{label as string}</span>
                      <span className="text-green-700">{formatBRL(valor as number)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-1 font-semibold">
                    <span>Total proventos</span>
                    <span className="text-green-700">{formatBRL(selectedFolha.total_proventos)}</span>
                  </div>
                </div>
              </div>

              {/* Descontos */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Descontos</h4>
                <div className="space-y-1">
                  {[
                    ['INSS', selectedFolha.inss_funcionario],
                    ['IRRF', selectedFolha.irrf],
                    ['Vale transporte', selectedFolha.vale_transporte],
                    ['Vale refeicao', selectedFolha.vale_refeicao],
                    ['Plano de saude', selectedFolha.plano_saude],
                    ['Adiantamento', selectedFolha.adiantamento_desc],
                    ['Outros descontos', selectedFolha.outros_descontos],
                  ].filter(([_, v]) => (v as number) > 0).map(([label, valor], i) => (
                    <div key={i} className="flex justify-between py-1 border-b border-gray-50">
                      <span className="text-gray-500">{label as string}</span>
                      <span className="text-red-600">{formatBRL(valor as number)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-1 font-semibold">
                    <span>Total descontos</span>
                    <span className="text-red-600">{formatBRL(selectedFolha.total_descontos)}</span>
                  </div>
                </div>
              </div>

              {/* Liquido */}
              <div className="flex justify-between py-3 border-t-2 border-gray-200 text-base font-bold">
                <span>Valor liquido</span>
                <span>{formatBRL(selectedFolha.valor_liquido)}</span>
              </div>

              {/* Encargos patronais */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Encargos patronais</h4>
                <div className="space-y-1">
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <span className="text-gray-500">FGTS (8%)</span>
                    <span>{formatBRL(selectedFolha.fgts_mes)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <span className="text-gray-500">INSS patronal (20%)</span>
                    <span>{formatBRL(selectedFolha.inss_patronal)}</span>
                  </div>
                  <div className="flex justify-between py-1 font-semibold">
                    <span>Total encargos</span>
                    <span className="text-orange-600">{formatBRL(selectedFolha.fgts_mes + selectedFolha.inss_patronal)}</span>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500">
                Custo total empresa: {formatBRL(selectedFolha.total_proventos + selectedFolha.fgts_mes + selectedFolha.inss_patronal)}
              </div>
            </div>
            <div className="flex items-center justify-end px-6 py-4 border-t border-gray-100">
              <button
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {dropdownOpen && <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(null)} />}
    </AppLayout>
  )
}
