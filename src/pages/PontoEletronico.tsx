import { useState, useEffect, useMemo, useCallback } from 'react'
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, parseISO, startOfMonth, endOfMonth } from 'date-fns'
import {
  Clock, Loader2, Plus, X, Search, RefreshCw,
  Check, AlertTriangle, ChevronLeft, ChevronRight, Users
} from 'lucide-react'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { formatData } from '@/lib/format'
import { AppLayout } from '@/components/layout/AppLayout'
import { toast } from 'sonner'

// ─── Types ──────────────────────────────────────────────────────────
interface Ponto {
  id: string
  empresa_id: string
  funcionario_id: string
  data: string
  entrada: string | null
  saida_almoco: string | null
  retorno_almoco: string | null
  saida: string | null
  horas_trabalhadas: number | null
  horas_extras_50: number
  horas_extras_100: number
  banco_horas_saldo: number
  justificativa: string | null
  tipo_ausencia: string | null
  aprovado: boolean
  aprovado_por: string | null
  origem: string
}

interface Funcionario {
  id: string
  nome_completo: string | null
  name: string | null
  cargo: string | null
  carga_horaria: number | null
}

const TIPO_AUSENCIA_LABELS: Record<string, { label: string; color: string }> = {
  falta: { label: 'Falta', color: '#E53E3E' },
  atraso: { label: 'Atraso', color: '#EA580C' },
  atestado: { label: 'Atestado', color: '#667085' },
  folga: { label: 'Folga', color: '#059669' },
  feriado: { label: 'Feriado', color: '#059669' },
  outros: { label: 'Outros', color: '#667085' },
}

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']

// ─── Component ──────────────────────────────────────────────────────
export default function PontoEletronico() {
  const { selectedCompany } = useCompany()
  const { activeClient } = useAuth()

  const [pontos, setPontos] = useState<Ponto[]>([])
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // Filters
  const [mesAno, setMesAno] = useState(() => format(new Date(), 'yyyy-MM'))
  const [funcFilter, setFuncFilter] = useState('todos')
  const [searchTerm, setSearchTerm] = useState('')

  // Modal
  const [showNewModal, setShowNewModal] = useState(false)
  const [newForm, setNewForm] = useState({
    funcionario_id: '',
    data: format(new Date(), 'yyyy-MM-dd'),
    entrada: '08:00',
    saida_almoco: '12:00',
    retorno_almoco: '13:00',
    saida: '17:00',
    justificativa: '',
    tipo_ausencia: '' as string,
  })

  // ─── Data Loading ───────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!selectedCompany) return
    setLoading(true)
    const db = activeClient as any

    const inicioMes = `${mesAno}-01`
    const fimMes = format(endOfMonth(parseISO(inicioMes)), 'yyyy-MM-dd')

    const [pontoRes, funcRes] = await Promise.all([
      db.from('ponto_eletronico')
        .select('*')
        .eq('empresa_id', selectedCompany.id)
        .gte('data', inicioMes)
        .lte('data', fimMes)
        .order('data', { ascending: false }),
      db.from('funcionarios')
        .select('id, nome_completo, name, cargo, carga_horaria')
        .eq('company_id', selectedCompany.id)
        .eq('status', 'ativo')
        .order('nome_completo'),
    ])

    setPontos(pontoRes.data || [])
    setFuncionarios(funcRes.data || [])
    setLoading(false)
  }, [selectedCompany, activeClient, mesAno])

  useEffect(() => { loadData() }, [loadData])

  // ─── Helpers ──────────────────────────────────────────────────────
  const getNomeFuncionario = (funcId: string) => {
    const func = funcionarios.find(f => f.id === funcId)
    return func?.nome_completo || func?.name || '—'
  }

  const calcularHoras = (entrada: string, saidaAlm: string, retornoAlm: string, saida: string): number => {
    const toMinutes = (t: string) => {
      const [h, m] = t.split(':').map(Number)
      return h * 60 + m
    }
    const manha = toMinutes(saidaAlm) - toMinutes(entrada)
    const tarde = toMinutes(saida) - toMinutes(retornoAlm)
    return Math.round(((manha + tarde) / 60) * 100) / 100
  }

  // ─── KPIs ─────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const totalRegistros = pontos.length
    const totalHoras = pontos.reduce((s, p) => s + (p.horas_trabalhadas || 0), 0)
    const totalHE = pontos.reduce((s, p) => s + p.horas_extras_50 + p.horas_extras_100, 0)
    const faltas = pontos.filter(p => p.tipo_ausencia === 'falta').length
    const pendentes = pontos.filter(p => !p.aprovado).length
    return { totalRegistros, totalHoras: Math.round(totalHoras * 100) / 100, totalHE, faltas, pendentes }
  }, [pontos])

  // ─── Filtered ─────────────────────────────────────────────────────
  const filteredPontos = useMemo(() => {
    let list = pontos
    if (funcFilter !== 'todos') {
      list = list.filter(p => p.funcionario_id === funcFilter)
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      list = list.filter(p => getNomeFuncionario(p.funcionario_id).toLowerCase().includes(term))
    }
    return list
  }, [pontos, funcFilter, searchTerm, funcionarios])

  // ─── Salvar ponto ─────────────────────────────────────────────────
  const handleSalvarPonto = async () => {
    if (!selectedCompany) return
    if (!newForm.funcionario_id) {
      toast.error('Selecione o funcionario')
      return
    }

    setSubmitting(true)
    const db = activeClient as any

    try {
      const horasTrabalhadas = newForm.tipo_ausencia
        ? 0
        : calcularHoras(newForm.entrada, newForm.saida_almoco, newForm.retorno_almoco, newForm.saida)

      const cargaHoraria = funcionarios.find(f => f.id === newForm.funcionario_id)?.carga_horaria || 8
      const he50 = horasTrabalhadas > cargaHoraria ? Math.min(horasTrabalhadas - cargaHoraria, 2) : 0
      const he100 = horasTrabalhadas > cargaHoraria + 2 ? horasTrabalhadas - cargaHoraria - 2 : 0

      const { error } = await db.from('ponto_eletronico').upsert({
        empresa_id: selectedCompany.id,
        funcionario_id: newForm.funcionario_id,
        data: newForm.data,
        entrada: newForm.tipo_ausencia ? null : newForm.entrada,
        saida_almoco: newForm.tipo_ausencia ? null : newForm.saida_almoco,
        retorno_almoco: newForm.tipo_ausencia ? null : newForm.retorno_almoco,
        saida: newForm.tipo_ausencia ? null : newForm.saida,
        horas_trabalhadas: horasTrabalhadas,
        horas_extras_50: he50,
        horas_extras_100: he100,
        justificativa: newForm.justificativa || null,
        tipo_ausencia: newForm.tipo_ausencia || null,
        origem: 'manual',
      }, { onConflict: 'funcionario_id,data' })

      if (error) throw error

      toast.success('Ponto registrado')
      setShowNewModal(false)
      loadData()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao registrar ponto')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Aprovar ponto ────────────────────────────────────────────────
  const handleAprovar = async (pontoId: string) => {
    const db = activeClient as any
    const { error } = await db.from('ponto_eletronico')
      .update({ aprovado: true })
      .eq('id', pontoId)
    if (error) {
      toast.error('Erro ao aprovar')
    } else {
      toast.success('Ponto aprovado')
      loadData()
    }
  }

  const MESES = [
    'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ]

  const mesLabel = useMemo(() => {
    const [ano, mes] = mesAno.split('-')
    return `${MESES[parseInt(mes) - 1]} ${ano}`
  }, [mesAno])

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <AppLayout title="Ponto Eletronico">
      <div className="p-6 space-y-6">

        {/* ── KPIs ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: 'Registros', value: kpis.totalRegistros, icon: Clock, color: '#059669' },
            { label: 'Horas trabalhadas', value: `${kpis.totalHoras}h`, icon: Clock, color: '#059669' },
            { label: 'Horas extras', value: `${kpis.totalHE}h`, icon: Clock, color: '#EA580C' },
            { label: 'Faltas', value: kpis.faltas, icon: AlertTriangle, color: '#E53E3E' },
            { label: 'Pendentes aprovacao', value: kpis.pendentes, icon: Clock, color: '#667085' },
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
                funcionario_id: '', data: format(new Date(), 'yyyy-MM-dd'),
                entrada: '08:00', saida_almoco: '12:00', retorno_almoco: '13:00', saida: '17:00',
                justificativa: '', tipo_ausencia: '',
              })
              setShowNewModal(true)
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
            style={{ backgroundColor: '#059669' }}
          >
            <Plus size={16} /> Registrar ponto
          </button>

          <input
            type="month"
            value={mesAno}
            onChange={e => setMesAno(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
          />

          <select
            value={funcFilter}
            onChange={e => setFuncFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
          >
            <option value="todos">Todos funcionarios</option>
            {funcionarios.map(f => (
              <option key={f.id} value={f.id}>{f.nome_completo || f.name}</option>
            ))}
          </select>

          <div className="relative flex-1 max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar..."
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
          ) : filteredPontos.length === 0 ? (
            <div className="text-center py-20 text-gray-400 text-sm">
              Nenhum registro de ponto para {mesLabel}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase">
                    <th className="px-4 py-3">Funcionario</th>
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3 text-center">Entrada</th>
                    <th className="px-4 py-3 text-center">Saida alm.</th>
                    <th className="px-4 py-3 text-center">Retorno</th>
                    <th className="px-4 py-3 text-center">Saida</th>
                    <th className="px-4 py-3 text-center">Horas</th>
                    <th className="px-4 py-3 text-center">HE</th>
                    <th className="px-4 py-3">Obs</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPontos.map(p => {
                    const dataObj = parseISO(p.data)
                    const diaSemana = DIAS_SEMANA[dataObj.getDay()]
                    const ausencia = p.tipo_ausencia ? TIPO_AUSENCIA_LABELS[p.tipo_ausencia] : null

                    return (
                      <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3 font-medium">{getNomeFuncionario(p.funcionario_id)}</td>
                        <td className="px-4 py-3 text-gray-500">
                          {diaSemana} {formatData(p.data)}
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-xs">{p.entrada || '—'}</td>
                        <td className="px-4 py-3 text-center font-mono text-xs">{p.saida_almoco || '—'}</td>
                        <td className="px-4 py-3 text-center font-mono text-xs">{p.retorno_almoco || '—'}</td>
                        <td className="px-4 py-3 text-center font-mono text-xs">{p.saida || '—'}</td>
                        <td className="px-4 py-3 text-center font-medium">
                          {p.horas_trabalhadas != null ? `${p.horas_trabalhadas}h` : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {(p.horas_extras_50 + p.horas_extras_100) > 0 && (
                            <span className="text-orange-600 font-medium">
                              {(p.horas_extras_50 + p.horas_extras_100).toFixed(1)}h
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {ausencia && (
                            <span
                              className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium"
                              style={{ color: ausencia.color, backgroundColor: ausencia.color + '15' }}
                            >
                              {ausencia.label}
                            </span>
                          )}
                          {p.justificativa && !ausencia && (
                            <span className="text-xs text-gray-400 truncate max-w-[100px] block">{p.justificativa}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {p.aprovado ? (
                            <span className="inline-flex items-center gap-1 text-xs text-green-600">
                              <Check size={12} /> Aprovado
                            </span>
                          ) : (
                            <button
                              onClick={() => handleAprovar(p.id)}
                              className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium"
                            >
                              Aprovar
                            </button>
                          )}
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

      {/* ═══ MODAL: Registrar ponto ═══ */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-800">Registrar ponto</h2>
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
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Selecione...</option>
                  {funcionarios.map(f => (
                    <option key={f.id} value={f.id}>{f.nome_completo || f.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Data *</label>
                <input
                  type="date"
                  value={newForm.data}
                  onChange={e => setNewForm(prev => ({ ...prev, data: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tipo de ausencia (se aplicavel)</label>
                <select
                  value={newForm.tipo_ausencia}
                  onChange={e => setNewForm(prev => ({ ...prev, tipo_ausencia: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Nenhum (dia normal)</option>
                  <option value="falta">Falta</option>
                  <option value="atraso">Atraso</option>
                  <option value="atestado">Atestado</option>
                  <option value="folga">Folga</option>
                  <option value="feriado">Feriado</option>
                  <option value="outros">Outros</option>
                </select>
              </div>

              {!newForm.tipo_ausencia && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Entrada</label>
                    <input
                      type="time"
                      value={newForm.entrada}
                      onChange={e => setNewForm(prev => ({ ...prev, entrada: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Saida almoco</label>
                    <input
                      type="time"
                      value={newForm.saida_almoco}
                      onChange={e => setNewForm(prev => ({ ...prev, saida_almoco: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Retorno almoco</label>
                    <input
                      type="time"
                      value={newForm.retorno_almoco}
                      onChange={e => setNewForm(prev => ({ ...prev, retorno_almoco: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Saida</label>
                    <input
                      type="time"
                      value={newForm.saida}
                      onChange={e => setNewForm(prev => ({ ...prev, saida: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs text-gray-500 mb-1">Justificativa / observacao</label>
                <input
                  type="text"
                  value={newForm.justificativa}
                  onChange={e => setNewForm(prev => ({ ...prev, justificativa: e.target.value }))}
                  placeholder="Opcional"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button
                onClick={() => setShowNewModal(false)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSalvarPonto}
                disabled={submitting}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: '#059669' }}
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Clock size={16} />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
