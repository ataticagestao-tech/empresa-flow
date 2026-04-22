import { useState, useEffect, useMemo, useCallback } from 'react'
import { format, parseISO, differenceInDays } from 'date-fns'
import {
  Palmtree, Loader2, Plus, X, Search, RefreshCw,
  Check, AlertTriangle, Calendar, Users, FileText
} from 'lucide-react'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { formatBRL, formatData } from '@/lib/format'
import { AppLayout } from '@/components/layout/AppLayout'
import { toast } from 'sonner'

// ─── Types ──────────────────────────────────────────────────────────
interface FeriaAfastamento {
  id: string
  empresa_id: string
  funcionario_id: string
  tipo: string
  periodo_aquisitivo_inicio: string | null
  periodo_aquisitivo_fim: string | null
  data_inicio: string
  data_fim: string
  dias_corridos: number | null
  dias_abono: number
  valor_ferias: number | null
  valor_abono: number | null
  inss_ferias: number | null
  irrf_ferias: number | null
  documento_url: string | null
  cid: string | null
  status: string
  folha_id: string | null
  created_at: string
}

interface Funcionario {
  id: string
  nome_completo: string | null
  name: string | null
  cargo: string | null
  data_admissao: string | null
  salario: number | null
}

const TIPO_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  ferias: { label: 'Ferias', color: '#059669', icon: Palmtree },
  licenca_maternidade: { label: 'Licenca maternidade', color: '#7C3AED', icon: Users },
  licenca_paternidade: { label: 'Licenca paternidade', color: '#059669', icon: Users },
  atestado: { label: 'Atestado', color: '#F79009', icon: FileText },
  afastamento_inss: { label: 'Afastamento INSS', color: '#D92D20', icon: AlertTriangle },
  suspensao: { label: 'Suspensao', color: '#D92D20', icon: AlertTriangle },
  outros: { label: 'Outros', color: '#667085', icon: FileText },
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  programado: { label: 'Programado', color: '#059669', bg: '#BFDBFE' },
  em_curso: { label: 'Em curso', color: '#F79009', bg: '#FFFAEB' },
  concluido: { label: 'Concluido', color: '#059669', bg: '#ECFDF3' },
  cancelado: { label: 'Cancelado', color: '#D92D20', bg: '#FEF3F2' },
}

// ─── Component ──────────────────────────────────────────────────────
export default function FeriasAfastamentos() {
  const { selectedCompany } = useCompany()
  const { activeClient } = useAuth()

  const [registros, setRegistros] = useState<FeriaAfastamento[]>([])
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [tipoFilter, setTipoFilter] = useState('todos')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [anoFilter, setAnoFilter] = useState(new Date().getFullYear())

  // Modal
  const [showNewModal, setShowNewModal] = useState(false)
  const [newForm, setNewForm] = useState({
    funcionario_id: '',
    tipo: 'ferias',
    data_inicio: '',
    data_fim: '',
    dias_abono: 0,
    periodo_aquisitivo_inicio: '',
    periodo_aquisitivo_fim: '',
    cid: '',
    documento_url: '',
  })

  // ─── Data Loading ───────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!selectedCompany) return
    setLoading(true)
    const db = activeClient as any

    const [regRes, funcRes] = await Promise.all([
      db.from('ferias_afastamentos')
        .select('*')
        .eq('empresa_id', selectedCompany.id)
        .gte('data_inicio', `${anoFilter}-01-01`)
        .lte('data_inicio', `${anoFilter}-12-31`)
        .order('data_inicio', { ascending: false }),
      db.from('funcionarios')
        .select('id, nome_completo, name, cargo, data_admissao, salario')
        .eq('company_id', selectedCompany.id)
        .eq('status', 'ativo')
        .order('nome_completo'),
    ])

    setRegistros(regRes.data || [])
    setFuncionarios(funcRes.data || [])
    setLoading(false)
  }, [selectedCompany, activeClient, anoFilter])

  useEffect(() => { loadData() }, [loadData])

  // ─── Helpers ──────────────────────────────────────────────────────
  const getNomeFuncionario = (funcId: string) => {
    const func = funcionarios.find(f => f.id === funcId)
    return func?.nome_completo || func?.name || '—'
  }

  // ─── KPIs ─────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const ferias = registros.filter(r => r.tipo === 'ferias')
    const afastamentos = registros.filter(r => r.tipo !== 'ferias')
    const emCurso = registros.filter(r => r.status === 'em_curso')
    const programados = registros.filter(r => r.status === 'programado')
    return {
      total: registros.length,
      ferias: ferias.length,
      afastamentos: afastamentos.length,
      emCurso: emCurso.length,
      programados: programados.length,
    }
  }, [registros])

  // ─── Filtered ─────────────────────────────────────────────────────
  const filteredRegistros = useMemo(() => {
    let list = registros
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      list = list.filter(r => getNomeFuncionario(r.funcionario_id).toLowerCase().includes(term))
    }
    if (tipoFilter !== 'todos') list = list.filter(r => r.tipo === tipoFilter)
    if (statusFilter !== 'todos') list = list.filter(r => r.status === statusFilter)
    return list
  }, [registros, searchTerm, tipoFilter, statusFilter, funcionarios])

  // ─── Salvar ───────────────────────────────────────────────────────
  const handleSalvar = async () => {
    if (!selectedCompany) return
    if (!newForm.funcionario_id) { toast.error('Selecione o funcionario'); return }
    if (!newForm.data_inicio || !newForm.data_fim) { toast.error('Informe as datas'); return }

    setSubmitting(true)
    const db = activeClient as any

    try {
      const func = funcionarios.find(f => f.id === newForm.funcionario_id)
      let valorFerias: number | null = null
      let valorAbono: number | null = null

      if (newForm.tipo === 'ferias' && func?.salario) {
        const dias = differenceInDays(parseISO(newForm.data_fim), parseISO(newForm.data_inicio)) + 1
        const salarioDia = func.salario / 30
        valorFerias = Math.round((salarioDia * dias + func.salario / 3) * 100) / 100  // ferias + 1/3
        if (newForm.dias_abono > 0) {
          valorAbono = Math.round(salarioDia * newForm.dias_abono * 100) / 100
        }
      }

      const { error } = await db.from('ferias_afastamentos').insert({
        empresa_id: selectedCompany.id,
        funcionario_id: newForm.funcionario_id,
        tipo: newForm.tipo,
        data_inicio: newForm.data_inicio,
        data_fim: newForm.data_fim,
        dias_abono: newForm.dias_abono,
        valor_ferias: valorFerias,
        valor_abono: valorAbono,
        periodo_aquisitivo_inicio: newForm.periodo_aquisitivo_inicio || null,
        periodo_aquisitivo_fim: newForm.periodo_aquisitivo_fim || null,
        cid: newForm.cid || null,
        documento_url: newForm.documento_url || null,
        status: 'programado',
      })

      if (error) throw error

      toast.success('Registro criado com sucesso')
      setShowNewModal(false)
      loadData()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <AppLayout title="Ferias e Afastamentos">
      <div className="p-6 space-y-6">

        {/* ── KPIs ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total registros', value: kpis.total, icon: Calendar, color: '#059669' },
            { label: 'Ferias', value: kpis.ferias, icon: Palmtree, color: '#059669' },
            { label: 'Em curso', value: kpis.emCurso, icon: Calendar, color: '#F79009' },
            { label: 'Programados', value: kpis.programados, icon: Calendar, color: '#059669' },
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
            onClick={() => {
              setNewForm({
                funcionario_id: '', tipo: 'ferias', data_inicio: '', data_fim: '',
                dias_abono: 0, periodo_aquisitivo_inicio: '', periodo_aquisitivo_fim: '',
                cid: '', documento_url: '',
              })
              setShowNewModal(true)
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
            style={{ backgroundColor: '#059669' }}
          >
            <Plus size={16} /> Novo registro
          </button>

          <select
            value={String(anoFilter)}
            onChange={e => setAnoFilter(Number(e.target.value))}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
          >
            {[2024, 2025, 2026, 2027].map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>

          <select
            value={tipoFilter}
            onChange={e => setTipoFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
          >
            <option value="todos">Todos os tipos</option>
            {Object.entries(TIPO_LABELS).map(([key, val]) => (
              <option key={key} value={key}>{val.label}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
          >
            <option value="todos">Todos status</option>
            {Object.entries(STATUS_CONFIG).map(([key, val]) => (
              <option key={key} value={key}>{val.label}</option>
            ))}
          </select>

          <div className="relative flex-1 max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar funcionario..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

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
          ) : filteredRegistros.length === 0 ? (
            <div className="text-center py-20 text-gray-400 text-sm">
              Nenhum registro encontrado
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase">
                    <th className="px-4 py-3">Funcionario</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Inicio</th>
                    <th className="px-4 py-3">Fim</th>
                    <th className="px-4 py-3 text-center">Dias</th>
                    <th className="px-4 py-3 text-right">Valor</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRegistros.map(r => {
                    const tipo = TIPO_LABELS[r.tipo] || TIPO_LABELS.outros
                    const st = STATUS_CONFIG[r.status] || STATUS_CONFIG.programado

                    return (
                      <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3 font-medium">{getNomeFuncionario(r.funcionario_id)}</td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{ color: tipo.color, backgroundColor: tipo.color + '15' }}
                          >
                            <tipo.icon size={12} />
                            {tipo.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500">{formatData(r.data_inicio)}</td>
                        <td className="px-4 py-3 text-gray-500">{formatData(r.data_fim)}</td>
                        <td className="px-4 py-3 text-center font-medium">{r.dias_corridos ?? '—'}</td>
                        <td className="px-4 py-3 text-right">
                          {r.valor_ferias ? formatBRL(r.valor_ferias) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{ color: st.color, backgroundColor: st.bg }}
                          >
                            {st.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ═══ MODAL: Novo registro ═══ */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-800">Novo registro</h2>
              <button onClick={() => setShowNewModal(false)} className="p-1 rounded hover:bg-gray-100">
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Funcionario *</label>
                <select
                  value={newForm.funcionario_id}
                  onChange={e => setNewForm(prev => ({ ...prev, funcionario_id: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                >
                  <option value="">Selecione...</option>
                  {funcionarios.map(f => (
                    <option key={f.id} value={f.id}>{f.nome_completo || f.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tipo *</label>
                <select
                  value={newForm.tipo}
                  onChange={e => setNewForm(prev => ({ ...prev, tipo: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                >
                  {Object.entries(TIPO_LABELS).map(([key, val]) => (
                    <option key={key} value={key}>{val.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Data inicio *</label>
                  <input
                    type="date"
                    value={newForm.data_inicio}
                    onChange={e => setNewForm(prev => ({ ...prev, data_inicio: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Data fim *</label>
                  <input
                    type="date"
                    value={newForm.data_fim}
                    onChange={e => setNewForm(prev => ({ ...prev, data_fim: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                  />
                </div>
              </div>

              {newForm.tipo === 'ferias' && (
                <>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Dias de abono pecuniario (venda)</label>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={newForm.dias_abono}
                      onChange={e => setNewForm(prev => ({ ...prev, dias_abono: parseInt(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Periodo aquisitivo inicio</label>
                      <input
                        type="date"
                        value={newForm.periodo_aquisitivo_inicio}
                        onChange={e => setNewForm(prev => ({ ...prev, periodo_aquisitivo_inicio: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Periodo aquisitivo fim</label>
                      <input
                        type="date"
                        value={newForm.periodo_aquisitivo_fim}
                        onChange={e => setNewForm(prev => ({ ...prev, periodo_aquisitivo_fim: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                      />
                    </div>
                  </div>
                </>
              )}

              {newForm.tipo === 'atestado' && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">CID</label>
                  <input
                    type="text"
                    value={newForm.cid}
                    onChange={e => setNewForm(prev => ({ ...prev, cid: e.target.value }))}
                    placeholder="Codigo CID (opcional)"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                  />
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button
                onClick={() => setShowNewModal(false)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSalvar}
                disabled={submitting}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: '#059669' }}
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
