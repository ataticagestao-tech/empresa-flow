import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { format, parseISO, differenceInDays } from 'date-fns'
import {
  Palmtree, Loader2, Plus, X, Search, RefreshCw,
  Check, AlertTriangle, Calendar, Users, FileText, Eye, ChevronDown
} from 'lucide-react'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { formatBRL, formatData } from '@/lib/format'
import { AppLayout } from '@/components/layout/AppLayout'
import { PagePanel } from '@/components/layout/PagePanel'
import { ExportMenu } from '@/components/ExportMenu'
import { toast } from 'sonner'

// ─── Types ──────────────────────────────────────────────────────────
interface FeriaAfastamento {
  id: string
  company_id: string
  employee_id: string
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
  role: string | null
  hire_date: string | null
  salary: number | null
  salario_base: number | null
}

const TIPO_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  ferias: { label: 'Ferias', color: '#059669', icon: Palmtree },
  licenca_maternidade: { label: 'Licenca maternidade', color: '#7C3AED', icon: Users },
  licenca_paternidade: { label: 'Licenca paternidade', color: '#059669', icon: Users },
  atestado: { label: 'Atestado', color: '#EA580C', icon: FileText },
  afastamento_inss: { label: 'Afastamento INSS', color: '#E53E3E', icon: AlertTriangle },
  suspensao: { label: 'Suspensao', color: '#E53E3E', icon: AlertTriangle },
  outros: { label: 'Outros', color: '#667085', icon: FileText },
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  programado: { label: 'Programado', color: '#059669', bg: '#BFDBFE' },
  em_curso: { label: 'Em curso', color: '#EA580C', bg: '#FFF0EB' },
  concluido: { label: 'Concluido', color: '#059669', bg: '#ECFDF4' },
  cancelado: { label: 'Cancelado', color: '#E53E3E', bg: '#FEE2E2' },
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

  // ─── Padrão de planilha: colunas ajustáveis + ocultáveis ─────
  const COL_ORDER = ['funcionario', 'tipo', 'inicio', 'fim', 'dias', 'valor', 'status']
  const COL_LABELS: Record<string, string> = {
    funcionario: 'Funcionario', tipo: 'Tipo', inicio: 'Inicio', fim: 'Fim',
    dias: 'Dias', valor: 'Valor', status: 'Status',
  }
  const COL_WIDTHS_DEFAULT: Record<string, number> = {
    funcionario: 220, tipo: 170, inicio: 110, fim: 110, dias: 80, valor: 130, status: 130,
  }
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    try {
      const s = localStorage.getItem('feriasafastamentos_col_widths')
      if (s) return { ...COL_WIDTHS_DEFAULT, ...JSON.parse(s) }
    } catch { /* ignore */ }
    return COL_WIDTHS_DEFAULT
  })
  useEffect(() => { localStorage.setItem('feriasafastamentos_col_widths', JSON.stringify(colWidths)) }, [colWidths])
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => {
    try {
      const s = localStorage.getItem('feriasafastamentos_hidden_cols')
      if (s) return new Set(JSON.parse(s) as string[])
    } catch { /* ignore */ }
    return new Set()
  })
  useEffect(() => { localStorage.setItem('feriasafastamentos_hidden_cols', JSON.stringify([...hiddenCols])) }, [hiddenCols])
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const isColVisible = (k: string) => !hiddenCols.has(k)
  const toggleColVisible = (k: string) => setHiddenCols(prev => {
    const n = new Set(prev)
    if (n.has(k)) n.delete(k); else n.add(k)
    return n
  })
  const visibleCols = COL_ORDER.filter(isColVisible)
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

  // ─── Data Loading ───────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!selectedCompany) return
    setLoading(true)
    const db = activeClient as any

    const [regRes, funcRes] = await Promise.all([
      db.from('ferias_afastamentos')
        .select('*')
        .eq('company_id', selectedCompany.id)
        .gte('data_inicio', `${anoFilter}-01-01`)
        .lte('data_inicio', `${anoFilter}-12-31`)
        .order('data_inicio', { ascending: false }),
      db.from('employees')
        .select('id, nome_completo, name, role, hire_date, salary, salario_base')
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
      list = list.filter(r => getNomeFuncionario(r.employee_id).toLowerCase().includes(term))
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
      const salario = func?.salario_base ?? func?.salary ?? 0
      let valorFerias: number | null = null
      let valorAbono: number | null = null

      if (newForm.tipo === 'ferias' && salario > 0) {
        const dias = differenceInDays(parseISO(newForm.data_fim), parseISO(newForm.data_inicio)) + 1
        const salarioDia = salario / 30
        valorFerias = Math.round((salarioDia * dias + salario / 3) * 100) / 100  // ferias + 1/3
        if (newForm.dias_abono > 0) {
          valorAbono = Math.round(salarioDia * newForm.dias_abono * 100) / 100
        }
      }

      const { error } = await db.from('ferias_afastamentos').insert({
        company_id: selectedCompany.id,
        employee_id: newForm.funcionario_id,
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
      <div>

        <PagePanel title="Férias e Afastamentos" subtitle="Controle de férias, afastamentos e licenças">

        {/* ── KPIs ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total registros', value: kpis.total, icon: Calendar, color: '#059669' },
            { label: 'Ferias', value: kpis.ferias, icon: Palmtree, color: '#059669' },
            { label: 'Em curso', value: kpis.emCurso, icon: Calendar, color: '#EA580C' },
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

          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setColMenuOpen(o => !o)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
                title="Mostrar/ocultar colunas"
              >
                <Eye size={14} className="text-gray-400" /> Colunas
                <ChevronDown size={13} className={`text-gray-400 transition-transform ${colMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {colMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setColMenuOpen(false)} />
                  <div className="absolute right-0 mt-1 z-50 bg-white border border-[#EAECF0] rounded-lg shadow-xl py-1 min-w-[190px]">
                    <p className="px-3 py-1.5 text-[10px] font-bold text-[#98A2B3] uppercase tracking-wider">Exibir colunas</p>
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
            <ExportMenu
              rows={filteredRegistros}
              baseName="ferias-afastamentos"
              titulo="FÉRIAS E AFASTAMENTOS"
              subtitulo={String(anoFilter)}
              columns={[
                { header: 'Funcionário', value: (r) => getNomeFuncionario(r.employee_id), pdfFlex: 22, excelWidth: 28 },
                { header: 'Tipo', value: (r) => (TIPO_LABELS[r.tipo] || TIPO_LABELS.outros).label, pdfFlex: 14, excelWidth: 20 },
                { header: 'Início', value: (r) => formatData(r.data_inicio), align: 'center', pdfFlex: 9 },
                { header: 'Fim', value: (r) => formatData(r.data_fim), align: 'center', pdfFlex: 9 },
                { header: 'Dias', value: (r) => r.dias_corridos ?? '', numericValue: (r) => Number(r.dias_corridos || 0), pdfFlex: 7 },
                { header: 'Valor', value: (r) => r.valor_ferias ? formatBRL(r.valor_ferias) : '', numericValue: (r) => Number(r.valor_ferias || 0), pdfFlex: 11 },
                { header: 'Status', value: (r) => (STATUS_CONFIG[r.status] || STATUS_CONFIG.programado).label, pdfFlex: 10 },
              ]}
            />
          </div>
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
              <table className="text-sm" style={{ tableLayout: 'fixed', width: visibleCols.reduce((a, k) => a + (colWidths[k] ?? COL_WIDTHS_DEFAULT[k]), 0), minWidth: '100%' }}>
                <colgroup>
                  {COL_ORDER.map(k => (
                    <col key={k} className={isColVisible(k) ? '' : 'hidden'} style={{ width: colWidths[k] ?? COL_WIDTHS_DEFAULT[k] }} />
                  ))}
                </colgroup>
                <thead>
                  <tr className="text-left text-xs text-white uppercase" style={{ backgroundColor: '#000000' }}>
                    <th className={`px-4 py-3 relative border-r border-white/10 ${isColVisible('funcionario') ? '' : 'hidden'}`}>
                      Funcionario
                      <span onMouseDown={startResize('funcionario')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-white/20 z-10" title="Arraste para ajustar a largura" />
                    </th>
                    <th className={`px-4 py-3 relative border-r border-white/10 ${isColVisible('tipo') ? '' : 'hidden'}`}>
                      Tipo
                      <span onMouseDown={startResize('tipo')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-white/20 z-10" title="Arraste para ajustar a largura" />
                    </th>
                    <th className={`px-4 py-3 relative border-r border-white/10 ${isColVisible('inicio') ? '' : 'hidden'}`}>
                      Inicio
                      <span onMouseDown={startResize('inicio')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-white/20 z-10" title="Arraste para ajustar a largura" />
                    </th>
                    <th className={`px-4 py-3 relative border-r border-white/10 ${isColVisible('fim') ? '' : 'hidden'}`}>
                      Fim
                      <span onMouseDown={startResize('fim')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-white/20 z-10" title="Arraste para ajustar a largura" />
                    </th>
                    <th className={`px-4 py-3 text-center relative border-r border-white/10 ${isColVisible('dias') ? '' : 'hidden'}`}>
                      Dias
                      <span onMouseDown={startResize('dias')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-white/20 z-10" title="Arraste para ajustar a largura" />
                    </th>
                    <th className={`px-4 py-3 text-right relative border-r border-white/10 ${isColVisible('valor') ? '' : 'hidden'}`}>
                      Valor
                      <span onMouseDown={startResize('valor')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-white/20 z-10" title="Arraste para ajustar a largura" />
                    </th>
                    <th className={`px-4 py-3 relative ${isColVisible('status') ? '' : 'hidden'}`}>
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRegistros.map(r => {
                    const tipo = TIPO_LABELS[r.tipo] || TIPO_LABELS.outros
                    const st = STATUS_CONFIG[r.status] || STATUS_CONFIG.programado
                    const nome = getNomeFuncionario(r.employee_id)

                    return (
                      <tr key={r.id} className="border-b border-[#F1F3F5] hover:bg-gray-50/50 transition-colors">
                        <td className={`px-4 py-1 font-medium truncate border-r border-[#F1F3F5] ${isColVisible('funcionario') ? '' : 'hidden'}`} title={nome}>{nome}</td>
                        <td className={`px-4 py-1 border-r border-[#F1F3F5] ${isColVisible('tipo') ? '' : 'hidden'}`}>
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{ color: tipo.color, backgroundColor: tipo.color + '15' }}
                          >
                            <tipo.icon size={12} />
                            {tipo.label}
                          </span>
                        </td>
                        <td className={`px-4 py-1 text-gray-500 truncate border-r border-[#F1F3F5] ${isColVisible('inicio') ? '' : 'hidden'}`} title={formatData(r.data_inicio)}>{formatData(r.data_inicio)}</td>
                        <td className={`px-4 py-1 text-gray-500 truncate border-r border-[#F1F3F5] ${isColVisible('fim') ? '' : 'hidden'}`} title={formatData(r.data_fim)}>{formatData(r.data_fim)}</td>
                        <td className={`px-4 py-1 text-center font-medium truncate border-r border-[#F1F3F5] ${isColVisible('dias') ? '' : 'hidden'}`}>{r.dias_corridos ?? '—'}</td>
                        <td className={`px-4 py-1 text-right truncate border-r border-[#F1F3F5] ${isColVisible('valor') ? '' : 'hidden'}`}>
                          {r.valor_ferias ? formatBRL(r.valor_ferias) : '—'}
                        </td>
                        <td className={`px-4 py-1 ${isColVisible('status') ? '' : 'hidden'}`}>
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
        </PagePanel>
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
