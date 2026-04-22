import { useState, useEffect, useMemo, useCallback } from 'react'
import { format } from 'date-fns'
import {
  UserPlus, UserMinus, Loader2, Plus, X, Search,
  RefreshCw, Check, FileText, Users
} from 'lucide-react'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { formatBRL, formatData } from '@/lib/format'
import { AppLayout } from '@/components/layout/AppLayout'
import { toast } from 'sonner'

// ─── Types ──────────────────────────────────────────────────────────
interface AdmissaoDemissao {
  id: string
  empresa_id: string
  funcionario_id: string
  tipo: 'admissao' | 'demissao'
  data_evento: string
  motivo_demissao: string | null
  aviso_previo_tipo: string | null
  data_aviso: string | null
  data_homologacao: string | null
  saldo_salario: number | null
  ferias_vencidas: number | null
  ferias_prop: number | null
  decimo_prop: number | null
  aviso_indenizado: number | null
  multa_fgts: number | null
  outros_verbas: number | null
  total_rescisao: number | null
  deducoes_rescisao: number | null
  liquido_rescisao: number | null
  trct_url: string | null
  homologacao_url: string | null
  conta_pagar_id: string | null
  created_at: string
}

interface Funcionario {
  id: string
  nome_completo: string | null
  name: string | null
  cargo: string | null
  salario: number | null
  data_admissao: string | null
}

const MOTIVO_LABELS: Record<string, string> = {
  sem_justa_causa: 'Sem justa causa',
  justa_causa: 'Justa causa',
  pedido_demissao: 'Pedido de demissao',
  acordo: 'Acordo',
  aposentadoria: 'Aposentadoria',
  outros: 'Outros',
}

const AVISO_LABELS: Record<string, string> = {
  trabalhado: 'Trabalhado',
  indenizado: 'Indenizado',
  dispensado: 'Dispensado',
}

// ─── Component ──────────────────────────────────────────────────────
export default function AdmissoesDemissoes() {
  const { selectedCompany } = useCompany()
  const { activeClient } = useAuth()

  const [registros, setRegistros] = useState<AdmissaoDemissao[]>([])
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [tipoFilter, setTipoFilter] = useState('todos')
  const [anoFilter, setAnoFilter] = useState(new Date().getFullYear())

  // Modal
  const [showNewModal, setShowNewModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedReg, setSelectedReg] = useState<AdmissaoDemissao | null>(null)
  const [newForm, setNewForm] = useState({
    funcionario_id: '',
    tipo: 'admissao' as 'admissao' | 'demissao',
    data_evento: format(new Date(), 'yyyy-MM-dd'),
    motivo_demissao: '',
    aviso_previo_tipo: '',
    data_aviso: '',
    data_homologacao: '',
    saldo_salario: 0,
    ferias_vencidas: 0,
    ferias_prop: 0,
    decimo_prop: 0,
    aviso_indenizado: 0,
    multa_fgts: 0,
    outros_verbas: 0,
    deducoes_rescisao: 0,
  })

  // ─── Data Loading ───────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!selectedCompany) return
    setLoading(true)
    const db = activeClient as any

    const [regRes, funcRes] = await Promise.all([
      db.from('admissoes_demissoes')
        .select('*')
        .eq('empresa_id', selectedCompany.id)
        .gte('data_evento', `${anoFilter}-01-01`)
        .lte('data_evento', `${anoFilter}-12-31`)
        .order('data_evento', { ascending: false }),
      db.from('funcionarios')
        .select('id, nome_completo, name, cargo, salario, data_admissao')
        .eq('company_id', selectedCompany.id)
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
    const admissoes = registros.filter(r => r.tipo === 'admissao')
    const demissoes = registros.filter(r => r.tipo === 'demissao')
    const totalRescisao = demissoes.reduce((s, r) => s + (r.liquido_rescisao || 0), 0)
    return { total: registros.length, admissoes: admissoes.length, demissoes: demissoes.length, totalRescisao }
  }, [registros])

  // ─── Filtered ─────────────────────────────────────────────────────
  const filteredRegistros = useMemo(() => {
    let list = registros
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      list = list.filter(r => getNomeFuncionario(r.funcionario_id).toLowerCase().includes(term))
    }
    if (tipoFilter !== 'todos') list = list.filter(r => r.tipo === tipoFilter)
    return list
  }, [registros, searchTerm, tipoFilter, funcionarios])

  // ─── Totais do form ───────────────────────────────────────────────
  const formTotais = useMemo(() => {
    const total = newForm.saldo_salario + newForm.ferias_vencidas + newForm.ferias_prop +
      newForm.decimo_prop + newForm.aviso_indenizado + newForm.multa_fgts + newForm.outros_verbas
    const liquido = total - newForm.deducoes_rescisao
    return { total, liquido }
  }, [newForm])

  // ─── Salvar ───────────────────────────────────────────────────────
  const handleSalvar = async () => {
    if (!selectedCompany) return
    if (!newForm.funcionario_id) { toast.error('Selecione o funcionario'); return }

    setSubmitting(true)
    const db = activeClient as any

    try {
      const totalRescisao = formTotais.total
      const liquidoRescisao = formTotais.liquido

      const payload: any = {
        empresa_id: selectedCompany.id,
        funcionario_id: newForm.funcionario_id,
        tipo: newForm.tipo,
        data_evento: newForm.data_evento,
      }

      if (newForm.tipo === 'demissao') {
        Object.assign(payload, {
          motivo_demissao: newForm.motivo_demissao || null,
          aviso_previo_tipo: newForm.aviso_previo_tipo || null,
          data_aviso: newForm.data_aviso || null,
          data_homologacao: newForm.data_homologacao || null,
          saldo_salario: newForm.saldo_salario,
          ferias_vencidas: newForm.ferias_vencidas,
          ferias_prop: newForm.ferias_prop,
          decimo_prop: newForm.decimo_prop,
          aviso_indenizado: newForm.aviso_indenizado,
          multa_fgts: newForm.multa_fgts,
          outros_verbas: newForm.outros_verbas,
          total_rescisao: totalRescisao,
          deducoes_rescisao: newForm.deducoes_rescisao,
          liquido_rescisao: liquidoRescisao,
        })
      }

      const { error } = await db.from('admissoes_demissoes').insert(payload)
      if (error) throw error

      // Gerar CP para rescisao
      if (newForm.tipo === 'demissao' && liquidoRescisao > 0) {
        await db.from('contas_pagar').insert({
          company_id: selectedCompany.id,
          credor_nome: getNomeFuncionario(newForm.funcionario_id),
          descricao: `Rescisao - ${getNomeFuncionario(newForm.funcionario_id)}`,
          valor: liquidoRescisao,
          data_vencimento: newForm.data_homologacao || newForm.data_evento,
          status: 'aberto',
        })
      }

      toast.success(`${newForm.tipo === 'admissao' ? 'Admissao' : 'Demissao'} registrada`)
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
    <AppLayout title="Admissoes e Demissoes">
      <div className="p-6 space-y-6">

        {/* ── KPIs ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total registros', value: kpis.total, icon: Users, color: '#059669' },
            { label: 'Admissoes', value: kpis.admissoes, icon: UserPlus, color: '#059669' },
            { label: 'Demissoes', value: kpis.demissoes, icon: UserMinus, color: '#E53E3E' },
            { label: 'Total rescisoes', value: formatBRL(kpis.totalRescisao), icon: FileText, color: '#EA580C' },
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
                funcionario_id: '', tipo: 'admissao', data_evento: format(new Date(), 'yyyy-MM-dd'),
                motivo_demissao: '', aviso_previo_tipo: '', data_aviso: '', data_homologacao: '',
                saldo_salario: 0, ferias_vencidas: 0, ferias_prop: 0, decimo_prop: 0,
                aviso_indenizado: 0, multa_fgts: 0, outros_verbas: 0, deducoes_rescisao: 0,
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
            {[2024, 2025, 2026, 2027].map(a => <option key={a} value={a}>{a}</option>)}
          </select>

          <select
            value={tipoFilter}
            onChange={e => setTipoFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
          >
            <option value="todos">Todos</option>
            <option value="admissao">Admissoes</option>
            <option value="demissao">Demissoes</option>
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
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3">Motivo</th>
                    <th className="px-4 py-3 text-right">Valor rescisao</th>
                    <th className="px-4 py-3 text-center">Detalhes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRegistros.map(r => (
                    <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 font-medium">{getNomeFuncionario(r.funcionario_id)}</td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{
                            color: r.tipo === 'admissao' ? '#059669' : '#E53E3E',
                            backgroundColor: r.tipo === 'admissao' ? '#ECFDF3' : '#FEE2E2',
                          }}
                        >
                          {r.tipo === 'admissao' ? <UserPlus size={12} /> : <UserMinus size={12} />}
                          {r.tipo === 'admissao' ? 'Admissao' : 'Demissao'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{formatData(r.data_evento)}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {r.motivo_demissao ? MOTIVO_LABELS[r.motivo_demissao] || r.motivo_demissao : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {r.liquido_rescisao ? formatBRL(r.liquido_rescisao) : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {r.tipo === 'demissao' && (
                          <button
                            onClick={() => { setSelectedReg(r); setShowDetailModal(true) }}
                            className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                          >
                            <FileText size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ═══ MODAL: Novo registro ═══ */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto mx-4">
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Tipo *</label>
                  <select
                    value={newForm.tipo}
                    onChange={e => setNewForm(prev => ({ ...prev, tipo: e.target.value as any }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                  >
                    <option value="admissao">Admissao</option>
                    <option value="demissao">Demissao</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Data *</label>
                  <input
                    type="date"
                    value={newForm.data_evento}
                    onChange={e => setNewForm(prev => ({ ...prev, data_evento: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                  />
                </div>
              </div>

              {newForm.tipo === 'demissao' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Motivo</label>
                      <select
                        value={newForm.motivo_demissao}
                        onChange={e => setNewForm(prev => ({ ...prev, motivo_demissao: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                      >
                        <option value="">Selecione...</option>
                        {Object.entries(MOTIVO_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Aviso previo</label>
                      <select
                        value={newForm.aviso_previo_tipo}
                        onChange={e => setNewForm(prev => ({ ...prev, aviso_previo_tipo: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                      >
                        <option value="">Selecione...</option>
                        {Object.entries(AVISO_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <h4 className="text-xs font-semibold text-gray-500 uppercase mt-4">Verbas rescisorias</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key: 'saldo_salario', label: 'Saldo salario' },
                      { key: 'ferias_vencidas', label: 'Ferias vencidas' },
                      { key: 'ferias_prop', label: 'Ferias proporcionais' },
                      { key: 'decimo_prop', label: '13o proporcional' },
                      { key: 'aviso_indenizado', label: 'Aviso indenizado' },
                      { key: 'multa_fgts', label: 'Multa FGTS (40%)' },
                      { key: 'outros_verbas', label: 'Outros' },
                      { key: 'deducoes_rescisao', label: 'Deducoes' },
                    ].map(({ key, label }) => (
                      <div key={key}>
                        <label className="block text-xs text-gray-500 mb-1">{label}</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={(newForm as any)[key]}
                          onChange={e => setNewForm(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Total bruto:</span>
                      <span className="font-medium">{formatBRL(formTotais.total)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Deducoes:</span>
                      <span className="text-red-600">{formatBRL(newForm.deducoes_rescisao)}</span>
                    </div>
                    <div className="flex justify-between font-semibold border-t border-gray-200 pt-1">
                      <span>Liquido rescisao:</span>
                      <span>{formatBRL(formTotais.liquido)}</span>
                    </div>
                  </div>
                </>
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

      {/* ═══ MODAL: Detalhe rescisao ═══ */}
      {showDetailModal && selectedReg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] overflow-y-auto mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-800">Detalhes da rescisao</h2>
              <button onClick={() => setShowDetailModal(false)} className="p-1 rounded hover:bg-gray-100">
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-gray-500">Funcionario:</span>
                <span className="font-medium">{getNomeFuncionario(selectedReg.funcionario_id)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-gray-500">Data:</span>
                <span>{formatData(selectedReg.data_evento)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-gray-500">Motivo:</span>
                <span>{MOTIVO_LABELS[selectedReg.motivo_demissao || ''] || '—'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-gray-500">Aviso previo:</span>
                <span>{AVISO_LABELS[selectedReg.aviso_previo_tipo || ''] || '—'}</span>
              </div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase mt-3">Verbas</h4>
              {[
                ['Saldo salario', selectedReg.saldo_salario],
                ['Ferias vencidas', selectedReg.ferias_vencidas],
                ['Ferias proporcionais', selectedReg.ferias_prop],
                ['13o proporcional', selectedReg.decimo_prop],
                ['Aviso indenizado', selectedReg.aviso_indenizado],
                ['Multa FGTS', selectedReg.multa_fgts],
                ['Outros', selectedReg.outros_verbas],
              ].filter(([_, v]) => (v as number || 0) > 0).map(([label, valor], i) => (
                <div key={i} className="flex justify-between py-1 border-b border-gray-50">
                  <span className="text-gray-500">{label as string}</span>
                  <span>{formatBRL(valor as number)}</span>
                </div>
              ))}
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-gray-500">Total bruto:</span>
                <span className="font-medium">{formatBRL(selectedReg.total_rescisao)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-gray-500">Deducoes:</span>
                <span className="text-red-600">{formatBRL(selectedReg.deducoes_rescisao)}</span>
              </div>
              <div className="flex justify-between py-2 border-t-2 border-gray-200 font-bold">
                <span>Liquido rescisao:</span>
                <span>{formatBRL(selectedReg.liquido_rescisao)}</span>
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
    </AppLayout>
  )
}
