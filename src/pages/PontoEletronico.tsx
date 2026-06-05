import { useState, useEffect, useMemo, useCallback } from 'react'
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, parseISO, startOfMonth, endOfMonth } from 'date-fns'
import {
  Clock, Loader2, Plus, X, Search, RefreshCw,
  Check, CheckCheck, ChevronLeft, ChevronRight,
  Camera, Trash2, Upload, Printer
} from 'lucide-react'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { formatData } from '@/lib/format'
import { gerarRelatorioListaPDF, downloadListaPDF } from '@/lib/cadastros-pdf/gerar-lista-pdf'
import { AppLayout } from '@/components/layout/AppLayout'
import { PagePanel } from '@/components/layout/PagePanel'
import { KpiCard, KpiCardGrid } from '@/components/ui/kpi-card'
import { ExportMenu } from '@/components/ExportMenu'
import { toast } from 'sonner'

// ─── Types ──────────────────────────────────────────────────────────
interface Ponto {
  id: string
  company_id: string
  employee_id: string
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
  role: string | null
}

interface DiaImport {
  dia: number
  entrada: string | null
  saida_almoco: string | null
  retorno_almoco: string | null
  saida: string | null
  tipo_ausencia: string | null
  obs: string | null
}

// Carga horária diária padrão (CLT 44h/semana ≈ 8h/dia). employees não tem coluna própria.
const CARGA_HORARIA_DIARIA = 8

// Converte horas decimais (ex.: 8.69) em formato legível "8h41". Banco guarda decimal.
const formatHoras = (decimal: number | null | undefined): string => {
  if (decimal == null || isNaN(Number(decimal))) return '—'
  const totalMin = Math.round(Number(decimal) * 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h${String(m).padStart(2, '0')}`
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

const MESES = [
  'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

// Mês inicial da tela: lembra o último mês olhado (localStorage); na primeira vez
// abre no mês ANTERIOR — folha de ponto se revisa/aprova depois do mês fechar.
const PONTO_MES_KEY = 'ponto_mesAno'
const mesPadraoPonto = (): string => {
  try {
    const salvo = localStorage.getItem(PONTO_MES_KEY)
    if (salvo && /^\d{4}-\d{2}$/.test(salvo)) return salvo
  } catch { /* localStorage indisponível */ }
  const n = new Date()
  return format(new Date(n.getFullYear(), n.getMonth() - 1, 1), 'yyyy-MM')
}

// ─── Component ──────────────────────────────────────────────────────
export default function PontoEletronico() {
  const { selectedCompany } = useCompany()
  const { activeClient } = useAuth()

  const [pontos, setPontos] = useState<Ponto[]>([])
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [aprovandoTodos, setAprovandoTodos] = useState(false)

  // Filters
  const [mesAno, setMesAno] = useState(mesPadraoPonto)
  const [funcFilter, setFuncFilter] = useState('todos')
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState<'diario' | 'consolidado'>('diario')
  const [detalheFunc, setDetalheFunc] = useState<{ employee_id: string; nome: string } | null>(null)

  // Lembra o mês escolhido para a tela não voltar pro mês atual ao reabrir.
  useEffect(() => {
    try { localStorage.setItem(PONTO_MES_KEY, mesAno) } catch { /* ignore */ }
  }, [mesAno])

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

  // Import por foto
  const [showImportModal, setShowImportModal] = useState(false)
  const [importFuncId, setImportFuncId] = useState('')
  const [importMesAno, setImportMesAno] = useState(() => format(new Date(), 'yyyy-MM'))
  const [importFileName, setImportFileName] = useState('')
  const [reading, setReading] = useState(false)
  const [savingImport, setSavingImport] = useState(false)
  const [preview, setPreview] = useState<DiaImport[]>([])

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
        .eq('company_id', selectedCompany.id)
        .gte('data', inicioMes)
        .lte('data', fimMes)
        .order('data', { ascending: false }),
      db.from('employees')
        .select('id, nome_completo, name, role')
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

  // Calcula horas a partir do que houver: jornada completa, só entrada/saída
  // (sem almoço registrado) ou null se não der pra calcular.
  const calcularHorasFlex = (
    entrada: string | null, saidaAlm: string | null, retornoAlm: string | null, saida: string | null
  ): number | null => {
    const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
    if (entrada && saidaAlm && retornoAlm && saida) {
      return calcularHoras(entrada, saidaAlm, retornoAlm, saida)
    }
    if (entrada && saida) {
      return Math.round(((toMin(saida) - toMin(entrada)) / 60) * 100) / 100
    }
    return null
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
      list = list.filter(p => p.employee_id === funcFilter)
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      list = list.filter(p => getNomeFuncionario(p.employee_id).toLowerCase().includes(term))
    }
    return list
  }, [pontos, funcFilter, searchTerm, funcionarios])

  // ─── Consolidado por funcionária (somatória do mês) ───────────────
  const consolidado = useMemo(() => {
    const mapa = new Map<string, {
      employee_id: string
      nome: string
      diasTrabalhados: number
      horas: number
      he50: number
      he100: number
      faltas: number
      folgas: number
      pendentes: number
    }>()
    filteredPontos.forEach(p => {
      let row = mapa.get(p.employee_id)
      if (!row) {
        row = {
          employee_id: p.employee_id,
          nome: getNomeFuncionario(p.employee_id),
          diasTrabalhados: 0, horas: 0, he50: 0, he100: 0, faltas: 0, folgas: 0, pendentes: 0,
        }
        mapa.set(p.employee_id, row)
      }
      if (p.tipo_ausencia === 'falta') row.faltas += 1
      else if (p.tipo_ausencia === 'folga' || p.tipo_ausencia === 'feriado') row.folgas += 1
      else if (p.horas_trabalhadas != null || p.entrada) row.diasTrabalhados += 1
      row.horas += p.horas_trabalhadas || 0
      row.he50 += p.horas_extras_50 || 0
      row.he100 += p.horas_extras_100 || 0
      if (!p.aprovado) row.pendentes += 1
    })
    return Array.from(mapa.values())
      .map(r => ({ ...r, heTotal: r.he50 + r.he100 }))
      .sort((a, b) => a.nome.localeCompare(b.nome))
  }, [filteredPontos, funcionarios])

  // ─── Detalhe por semana de uma funcionária ────────────────────────
  // Extra = horas além de 8h/dia (HE). Faltante = horas abaixo de 8h/dia
  // nos dias trabalhados + 8h por dia de FALTA. Folga/feriado/atestado não contam.
  const detalheSemanas = useMemo(() => {
    if (!detalheFunc) return null
    const dias = filteredPontos
      .filter(p => p.employee_id === detalheFunc.employee_id)
      .slice()
      .sort((a, b) => a.data.localeCompare(b.data))

    type Sem = {
      inicio: string; fim: string; pontos: Ponto[]
      dias: number; horas: number; extra: number; faltante: number; faltas: number
    }
    const map = new Map<string, Sem>()
    dias.forEach(p => {
      const wk = format(startOfWeek(parseISO(p.data), { weekStartsOn: 0 }), 'yyyy-MM-dd')
      let s = map.get(wk)
      if (!s) { s = { inicio: p.data, fim: p.data, pontos: [], dias: 0, horas: 0, extra: 0, faltante: 0, faltas: 0 }; map.set(wk, s) }
      s.pontos.push(p)
      if (p.data < s.inicio) s.inicio = p.data
      if (p.data > s.fim) s.fim = p.data
      if (p.tipo_ausencia === 'falta') {
        s.faltas += 1
        s.faltante += CARGA_HORARIA_DIARIA
      } else if (!p.tipo_ausencia) {
        if (p.horas_trabalhadas != null || p.entrada) s.dias += 1
        s.horas += p.horas_trabalhadas || 0
        s.extra += (p.horas_extras_50 || 0) + (p.horas_extras_100 || 0)
        if (p.horas_trabalhadas != null) {
          s.faltante += Math.max(0, CARGA_HORARIA_DIARIA - p.horas_trabalhadas)
        }
      }
    })

    const semanas = Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, s], i) => ({ num: i + 1, ...s }))
    const total = semanas.reduce((t, s) => ({
      dias: t.dias + s.dias, horas: t.horas + s.horas, extra: t.extra + s.extra,
      faltante: t.faltante + s.faltante, faltas: t.faltas + s.faltas,
    }), { dias: 0, horas: 0, extra: 0, faltante: 0, faltas: 0 })
    return { semanas, total }
  }, [detalheFunc, filteredPontos])

  // PDF do detalhe semanal (reaproveita o gerador padrão com cabeçalho da empresa).
  const handleBaixarDetalhePDF = () => {
    if (!detalheFunc || !detalheSemanas) return
    const { semanas, total } = detalheSemanas
    const linhas: string[][] = semanas.map(s => ([
      `Semana ${s.num}`,
      `${formatData(s.inicio).slice(0, 5)} a ${formatData(s.fim).slice(0, 5)}`,
      String(s.dias),
      formatHoras(s.horas),
      s.extra > 0 ? formatHoras(s.extra) : '—',
      s.faltante > 0 ? formatHoras(s.faltante) : '—',
      s.faltas > 0 ? String(s.faltas) : '—',
    ]))
    linhas.push([
      'TOTAL', '',
      String(total.dias),
      formatHoras(total.horas),
      total.extra > 0 ? formatHoras(total.extra) : '—',
      total.faltante > 0 ? formatHoras(total.faltante) : '—',
      total.faltas > 0 ? String(total.faltas) : '—',
    ])
    const blob = gerarRelatorioListaPDF({
      empresa_nome: selectedCompany?.nome_fantasia || selectedCompany?.razao_social || 'Empresa',
      empresa_razao_social: (selectedCompany as any)?.razao_social ?? null,
      empresa_cnpj: (selectedCompany as any)?.cnpj ?? null,
      empresa_local: [(selectedCompany as any)?.endereco_cidade, (selectedCompany as any)?.endereco_estado].filter(Boolean).join('/') || null,
      titulo: `PONTO · ${detalheFunc.nome} · ${mesLabel}`,
      orientacao: 'portrait',
      colunas: [
        { header: 'Semana', flex: 12 },
        { header: 'Período', flex: 14, align: 'center' },
        { header: 'Dias', flex: 8, align: 'center' },
        { header: 'Horas trab.', flex: 12, align: 'center' },
        { header: 'Extra', flex: 11, align: 'center' },
        { header: 'Faltante', flex: 11, align: 'center' },
        { header: 'Faltas', flex: 8, align: 'center' },
      ],
      linhas,
    })
    downloadListaPDF(blob, `ponto-${detalheFunc.nome}-${mesAno}`)
  }

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

      const cargaHoraria = CARGA_HORARIA_DIARIA
      const he50 = horasTrabalhadas > cargaHoraria ? Math.min(horasTrabalhadas - cargaHoraria, 2) : 0
      const he100 = horasTrabalhadas > cargaHoraria + 2 ? horasTrabalhadas - cargaHoraria - 2 : 0

      const { error } = await db.from('ponto_eletronico').upsert({
        company_id: selectedCompany.id,
        employee_id: newForm.funcionario_id,
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
      }, { onConflict: 'employee_id,data' })

      if (error) throw error

      toast.success('Ponto registrado')
      setShowNewModal(false)
      // Pula para o mês do ponto salvo, senão ele "some" se for de outro mês.
      setMesAno(newForm.data.slice(0, 7))
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

  // ─── Aprovar todos os pendentes (do filtro atual) ────────────────
  const handleAprovarTodos = async () => {
    const pendentes = filteredPontos.filter(p => !p.aprovado)
    if (pendentes.length === 0) {
      toast.info('Não há pontos pendentes para aprovar')
      return
    }
    setAprovandoTodos(true)
    const db = activeClient as any
    const ids = pendentes.map(p => p.id)
    const { error } = await db.from('ponto_eletronico')
      .update({ aprovado: true })
      .in('id', ids)
    if (error) {
      toast.error('Erro ao aprovar os pontos')
    } else {
      toast.success(`${ids.length} ${ids.length === 1 ? 'ponto aprovado' : 'pontos aprovados'}`)
      loadData()
    }
    setAprovandoTodos(false)
  }

  // ─── Import por foto ──────────────────────────────────────────────
  const openImportModal = () => {
    setImportFuncId(funcFilter !== 'todos' ? funcFilter : '')
    setImportMesAno(mesAno)
    setImportFileName('')
    setPreview([])
    setShowImportModal(true)
  }

  const handleLerFolha = async (file: File) => {
    setReading(true)
    setImportFileName(file.name)
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const [ano, mes] = importMesAno.split('-')
      const { data, error } = await (activeClient as any).functions.invoke('ler-folha-ponto', {
        body: { fileBase64: base64, mimeType: file.type || 'image/jpeg', ano, mes },
      })

      if (error) throw error
      if (data?.error) throw new Error(data.error)

      const dias: DiaImport[] = data?.dias || []
      if (dias.length === 0) {
        // Não apaga um preview já carregado por causa de uma leitura vazia.
        toast.warning('Nenhum dia foi identificado na foto. Tente uma foto mais nítida.')
      } else {
        toast.success(`${dias.length} dias lidos. Confira antes de salvar.`)
        setPreview(dias)
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao ler a folha de ponto')
    } finally {
      setReading(false)
    }
  }

  const updatePreviewRow = (idx: number, field: keyof DiaImport, value: string) => {
    setPreview(prev => prev.map((r, i) => {
      if (i !== idx) return r
      if (field === 'tipo_ausencia') {
        // Ao marcar ausencia, limpa horarios; ao desmarcar, mantem
        return value
          ? { ...r, tipo_ausencia: value, entrada: null, saida_almoco: null, retorno_almoco: null, saida: null }
          : { ...r, tipo_ausencia: null }
      }
      return { ...r, [field]: value || null }
    }))
  }

  const removePreviewRow = (idx: number) => {
    setPreview(prev => prev.filter((_, i) => i !== idx))
  }

  const handleSalvarImport = async () => {
    if (!selectedCompany) return
    if (!importFuncId) {
      toast.error('Selecione a funcionária')
      return
    }
    if (preview.length === 0) {
      toast.error('Nada para salvar')
      return
    }

    setSavingImport(true)
    const db = activeClient as any
    const [ano, mes] = importMesAno.split('-')
    const anoN = parseInt(ano, 10)
    const mesN = parseInt(mes, 10)
    // Último dia real do mês (ex.: abril = 30) — descarta dias impossíveis (31/04).
    const diasNoMes = new Date(anoN, mesN, 0).getDate()

    try {
      const cargaHoraria = CARGA_HORARIA_DIARIA

      // 1) normaliza o dia para número e descarta dias inválidos para este mês.
      const validos = preview
        .map(r => ({ ...r, dia: Number(r.dia) }))
        .filter(r => Number.isFinite(r.dia) && r.dia >= 1 && r.dia <= diasNoMes)

      // 2) dedupe por dia (mantém a última linha) — um upsert não pode tocar a
      //    mesma (funcionário, data) duas vezes no mesmo lote, senão falha tudo.
      const porDia = new Map<number, typeof validos[number]>()
      validos.forEach(r => porDia.set(r.dia, r))
      const linhas = Array.from(porDia.values()).sort((a, b) => a.dia - b.dia)

      if (linhas.length === 0) {
        toast.error(`Nenhum dia válido para ${MESES[mesN - 1]}/${ano} (esse mês tem ${diasNoMes} dias). Confira os números da coluna "Dia".`)
        setSavingImport(false)
        return
      }

      const descartados = preview.length - linhas.length

      const records = linhas.map(r => {
        const data = `${ano}-${mes}-${String(r.dia).padStart(2, '0')}`
        const horas = r.tipo_ausencia
          ? 0
          : calcularHorasFlex(r.entrada, r.saida_almoco, r.retorno_almoco, r.saida)
        const he50 = horas && horas > cargaHoraria ? Math.min(horas - cargaHoraria, 2) : 0
        const he100 = horas && horas > cargaHoraria + 2 ? horas - cargaHoraria - 2 : 0
        return {
          company_id: selectedCompany.id,
          employee_id: importFuncId,
          data,
          entrada: r.tipo_ausencia ? null : r.entrada,
          saida_almoco: r.tipo_ausencia ? null : r.saida_almoco,
          retorno_almoco: r.tipo_ausencia ? null : r.retorno_almoco,
          saida: r.tipo_ausencia ? null : r.saida,
          horas_trabalhadas: horas,
          horas_extras_50: he50,
          horas_extras_100: he100,
          justificativa: r.obs || null,
          tipo_ausencia: r.tipo_ausencia || null,
          origem: 'importado',
        }
      })

      const { error } = await db.from('ponto_eletronico')
        .upsert(records, { onConflict: 'employee_id,data' })

      if (error) {
        // Mostra o motivo real do banco (RLS, constraint, etc.) em vez de falhar mudo.
        const detalhe = [error.message, error.details, error.hint].filter(Boolean).join(' · ')
        throw new Error(detalhe || 'Erro ao salvar no banco')
      }
      if (descartados > 0) {
        toast.warning(`${descartados} linha(s) ignorada(s) por dia inválido ou repetido.`)
      }

      toast.success(`${records.length} registros importados`)
      setShowImportModal(false)
      setPreview([])
      setMesAno(importMesAno)
      loadData()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar importação')
    } finally {
      setSavingImport(false)
    }
  }

  const mesLabel = useMemo(() => {
    const [ano, mes] = mesAno.split('-')
    return `${MESES[parseInt(mes) - 1]} ${ano}`
  }, [mesAno])

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <AppLayout title="Ponto Eletronico">
      <div>

        <PagePanel title="Ponto Eletrônico" subtitle="Registro de jornada e banco de horas">

        {/* ── KPIs ── */}
        <KpiCardGrid className="lg:grid-cols-5">
          {[
            { label: 'Registros', value: kpis.totalRegistros, color: '#059669' },
            { label: 'Horas trabalhadas', value: formatHoras(kpis.totalHoras), color: '#059669' },
            { label: 'Horas extras', value: kpis.totalHE > 0 ? formatHoras(kpis.totalHE) : '0h', color: '#EA580C' },
            { label: 'Faltas', value: kpis.faltas, color: '#E53E3E' },
            { label: 'Pendentes aprovacao', value: kpis.pendentes, color: '#667085' },
          ].map((kpi, i) => (
            <KpiCard key={i} label={kpi.label} value={kpi.value} valueColor={kpi.color} />
          ))}
        </KpiCardGrid>

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

          <button
            onClick={openImportModal}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border"
            style={{ borderColor: '#059669', color: '#059669' }}
          >
            <Camera size={16} /> Importar foto da folha
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

          {/* Alternância Por dia / Consolidado */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm font-medium">
            <button
              onClick={() => setViewMode('diario')}
              className="px-3 py-2 transition-colors"
              style={viewMode === 'diario'
                ? { backgroundColor: '#059669', color: '#fff' }
                : { color: '#667085' }}
            >
              Por dia
            </button>
            <button
              onClick={() => setViewMode('consolidado')}
              className="px-3 py-2 transition-colors border-l border-gray-200"
              style={viewMode === 'consolidado'
                ? { backgroundColor: '#059669', color: '#fff' }
                : { color: '#667085' }}
            >
              Consolidado
            </button>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {filteredPontos.some(p => !p.aprovado) && (
              <button
                onClick={handleAprovarTodos}
                disabled={aprovandoTodos}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: '#059669' }}
                title="Aprovar todos os pontos pendentes do filtro atual"
              >
                {aprovandoTodos ? <Loader2 size={16} className="animate-spin" /> : <CheckCheck size={16} />}
                Aprovar todos ({filteredPontos.filter(p => !p.aprovado).length})
              </button>
            )}
            {viewMode === 'consolidado' ? (
              <ExportMenu
                rows={consolidado}
                baseName="ponto-consolidado"
                titulo="PONTO ELETRÔNICO · CONSOLIDADO"
                subtitulo={mesLabel}
                columns={[
                  { header: 'Funcionário', value: (r) => r.nome, pdfFlex: 24, excelWidth: 30 },
                  { header: 'Dias', value: (r) => r.diasTrabalhados, align: 'center', numericValue: (r) => r.diasTrabalhados, pdfFlex: 7 },
                  { header: 'Horas trab.', value: (r) => formatHoras(r.horas), numericValue: (r) => Math.round(r.horas * 100) / 100, pdfFlex: 9 },
                  { header: 'HE 50%', value: (r) => r.he50 > 0 ? formatHoras(r.he50) : '', numericValue: (r) => Math.round(r.he50 * 100) / 100, pdfFlex: 8 },
                  { header: 'HE 100%', value: (r) => r.he100 > 0 ? formatHoras(r.he100) : '', numericValue: (r) => Math.round(r.he100 * 100) / 100, pdfFlex: 8 },
                  { header: 'HE total', value: (r) => r.heTotal > 0 ? formatHoras(r.heTotal) : '', numericValue: (r) => Math.round(r.heTotal * 100) / 100, pdfFlex: 8 },
                  { header: 'Faltas', value: (r) => r.faltas, align: 'center', numericValue: (r) => r.faltas, pdfFlex: 7 },
                ]}
              />
            ) : (
              <ExportMenu
                rows={filteredPontos}
                baseName="ponto-eletronico"
                titulo="PONTO ELETRÔNICO"
                subtitulo={mesLabel}
                columns={[
                  { header: 'Funcionário', value: (p) => getNomeFuncionario(p.employee_id), pdfFlex: 20, excelWidth: 28 },
                  { header: 'Data', value: (p) => formatData(p.data), align: 'center', pdfFlex: 9 },
                  { header: 'Entrada', value: (p) => p.entrada || '', align: 'center', pdfFlex: 7 },
                  { header: 'Saída alm.', value: (p) => p.saida_almoco || '', align: 'center', pdfFlex: 7 },
                  { header: 'Retorno', value: (p) => p.retorno_almoco || '', align: 'center', pdfFlex: 7 },
                  { header: 'Saída', value: (p) => p.saida || '', align: 'center', pdfFlex: 7 },
                  { header: 'Horas', value: (p) => p.horas_trabalhadas != null ? formatHoras(p.horas_trabalhadas) : '', numericValue: (p) => Number(p.horas_trabalhadas || 0), pdfFlex: 7 },
                  { header: 'HE', value: (p) => (p.horas_extras_50 + p.horas_extras_100) > 0 ? formatHoras(p.horas_extras_50 + p.horas_extras_100) : '', numericValue: (p) => p.horas_extras_50 + p.horas_extras_100, pdfFlex: 7 },
                  { header: 'Obs', value: (p) => p.tipo_ausencia ? (TIPO_AUSENCIA_LABELS[p.tipo_ausencia]?.label || p.tipo_ausencia) : (p.justificativa || ''), pdfFlex: 14 },
                  { header: 'Status', value: (p) => p.aprovado ? 'Aprovado' : 'Pendente', align: 'center', pdfFlex: 8 },
                ]}
              />
            )}
          </div>
        </div>

        {viewMode === 'consolidado' && (
          <p className="text-xs text-gray-400 mb-2">
            Clique em uma funcionária para ver o detalhe por semana (extra/faltante) e imprimir em PDF.
          </p>
        )}

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
          ) : viewMode === 'consolidado' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase">
                    <th className="px-4 py-3">Funcionário</th>
                    <th className="px-4 py-3 text-center">Dias</th>
                    <th className="px-4 py-3 text-center">Horas trab.</th>
                    <th className="px-4 py-3 text-center">HE 50%</th>
                    <th className="px-4 py-3 text-center">HE 100%</th>
                    <th className="px-4 py-3 text-center">HE total</th>
                    <th className="px-4 py-3 text-center">Faltas</th>
                  </tr>
                </thead>
                <tbody>
                  {consolidado.map(r => (
                    <tr
                      key={r.employee_id}
                      onClick={() => setDetalheFunc({ employee_id: r.employee_id, nome: r.nome })}
                      className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer"
                      title="Ver detalhe por semana"
                    >
                      <td className="px-4 py-3 font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          {r.nome}
                          <ChevronRight size={14} className="text-gray-300" />
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600">{r.diasTrabalhados}</td>
                      <td className="px-4 py-3 text-center font-medium">{formatHoras(r.horas)}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{r.he50 > 0 ? formatHoras(r.he50) : '—'}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{r.he100 > 0 ? formatHoras(r.he100) : '—'}</td>
                      <td className="px-4 py-3 text-center">
                        {r.heTotal > 0
                          ? <span className="text-orange-600 font-semibold">{formatHoras(r.heTotal)}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {r.faltas > 0
                          ? <span className="text-red-600 font-medium">{r.faltas}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-gray-800">
                    <td className="px-4 py-3">TOTAL ({consolidado.length})</td>
                    <td className="px-4 py-3 text-center">{consolidado.reduce((s, r) => s + r.diasTrabalhados, 0)}</td>
                    <td className="px-4 py-3 text-center">{formatHoras(consolidado.reduce((s, r) => s + r.horas, 0))}</td>
                    <td className="px-4 py-3 text-center">{formatHoras(consolidado.reduce((s, r) => s + r.he50, 0))}</td>
                    <td className="px-4 py-3 text-center">{formatHoras(consolidado.reduce((s, r) => s + r.he100, 0))}</td>
                    <td className="px-4 py-3 text-center text-orange-600">{formatHoras(consolidado.reduce((s, r) => s + r.heTotal, 0))}</td>
                    <td className="px-4 py-3 text-center text-red-600">{consolidado.reduce((s, r) => s + r.faltas, 0)}</td>
                  </tr>
                </tfoot>
              </table>
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
                        <td className="px-4 py-3 font-medium">{getNomeFuncionario(p.employee_id)}</td>
                        <td className="px-4 py-3 text-gray-500">
                          {diaSemana} {formatData(p.data)}
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-xs">{p.entrada || '—'}</td>
                        <td className="px-4 py-3 text-center font-mono text-xs">{p.saida_almoco || '—'}</td>
                        <td className="px-4 py-3 text-center font-mono text-xs">{p.retorno_almoco || '—'}</td>
                        <td className="px-4 py-3 text-center font-mono text-xs">{p.saida || '—'}</td>
                        <td className="px-4 py-3 text-center font-medium">
                          {p.horas_trabalhadas != null ? formatHoras(p.horas_trabalhadas) : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {(p.horas_extras_50 + p.horas_extras_100) > 0 && (
                            <span className="text-orange-600 font-medium">
                              {formatHoras(p.horas_extras_50 + p.horas_extras_100)}
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
        </PagePanel>
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

      {/* ═══ MODAL: Importar foto da folha ═══ */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <Camera size={18} style={{ color: '#059669' }} /> Importar foto da folha de ponto
              </h2>
              <button onClick={() => setShowImportModal(false)} className="p-1 rounded hover:bg-gray-100">
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              {/* Seleção funcionária + mês */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Funcionária *</label>
                  <select
                    value={importFuncId}
                    onChange={e => setImportFuncId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">Selecione...</option>
                    {funcionarios.map(f => (
                      <option key={f.id} value={f.id}>{f.nome_completo || f.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Mês de referência *</label>
                  <input
                    type="month"
                    value={importMesAno}
                    onChange={e => setImportMesAno(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              {/* Upload */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Foto da folha</label>
                <label className="flex items-center justify-center gap-2 px-4 py-6 rounded-lg border-2 border-dashed border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
                  {reading ? (
                    <>
                      <Loader2 size={18} className="animate-spin text-gray-400" />
                      <span className="text-sm text-gray-500">Lendo a folha...</span>
                    </>
                  ) : (
                    <>
                      <Upload size={18} className="text-gray-400" />
                      <span className="text-sm text-gray-500">
                        {importFileName || 'Tirar foto ou selecionar imagem'}
                      </span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    capture="environment"
                    className="hidden"
                    disabled={reading}
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) handleLerFolha(file)
                      e.target.value = ''
                    }}
                  />
                </label>
                <p className="text-xs text-gray-400 mt-1">
                  A leitura é automática. Por ser letra manuscrita, confira os horários abaixo antes de salvar.
                </p>
              </div>

              {/* Preview editável */}
              {preview.length > 0 && (
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto max-h-[40vh]">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr className="text-left text-xs text-gray-500 uppercase">
                          <th className="px-2 py-2 w-12">Dia</th>
                          <th className="px-2 py-2">Entrada</th>
                          <th className="px-2 py-2">Saída alm.</th>
                          <th className="px-2 py-2">Retorno</th>
                          <th className="px-2 py-2">Saída</th>
                          <th className="px-2 py-2">Ausência</th>
                          <th className="px-2 py-2 w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map((r, idx) => (
                          <tr key={idx} className="border-t border-gray-50">
                            <td className="px-2 py-1.5">
                              <input
                                type="number" min={1} max={31}
                                value={r.dia}
                                onChange={e => updatePreviewRow(idx, 'dia', e.target.value)}
                                className="w-12 px-1 py-1 rounded border border-gray-200 text-sm text-center"
                              />
                            </td>
                            {(['entrada', 'saida_almoco', 'retorno_almoco', 'saida'] as const).map(campo => (
                              <td key={campo} className="px-2 py-1.5">
                                <input
                                  type="time"
                                  value={r[campo] || ''}
                                  disabled={!!r.tipo_ausencia}
                                  onChange={e => updatePreviewRow(idx, campo, e.target.value)}
                                  className="w-full px-1 py-1 rounded border border-gray-200 text-sm font-mono disabled:bg-gray-50 disabled:text-gray-300"
                                />
                              </td>
                            ))}
                            <td className="px-2 py-1.5">
                              <select
                                value={r.tipo_ausencia || ''}
                                onChange={e => updatePreviewRow(idx, 'tipo_ausencia', e.target.value)}
                                className="w-full px-1 py-1 rounded border border-gray-200 text-sm"
                              >
                                <option value="">—</option>
                                <option value="falta">Falta</option>
                                <option value="atraso">Atraso</option>
                                <option value="atestado">Atestado</option>
                                <option value="folga">Folga</option>
                                <option value="feriado">Feriado</option>
                                <option value="outros">Outros</option>
                              </select>
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              <button
                                onClick={() => removePreviewRow(idx)}
                                className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-3 py-2 bg-gray-50 text-xs text-gray-500 border-t border-gray-100">
                    {preview.length} dias. Edite o que estiver errado, remova linhas indevidas, depois salve.
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSalvarImport}
                disabled={savingImport || preview.length === 0 || !importFuncId}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: '#059669' }}
              >
                {savingImport ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Salvar {preview.length > 0 ? `${preview.length} dias` : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: Detalhe por semana ═══ */}
      {detalheFunc && detalheSemanas && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            {/* Cabeçalho */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">{detalheFunc.nome}</h2>
                <p className="text-xs text-gray-500">Detalhe por semana · {mesLabel}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleBaixarDetalhePDF}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: '#D92D20' }}
                  title="Baixar este detalhe em PDF"
                >
                  <Printer size={15} /> PDF
                </button>
                <button onClick={() => setDetalheFunc(null)} className="p-1 rounded hover:bg-gray-100">
                  <X size={20} className="text-gray-400" />
                </button>
              </div>
            </div>

            {/* Corpo: uma caixa por semana */}
            <div className="p-6 overflow-y-auto space-y-4">
              {detalheSemanas.semanas.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Sem registros neste mês.</p>
              ) : detalheSemanas.semanas.map(s => (
                <div key={s.num} className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                    <div className="text-sm font-semibold text-gray-700">
                      Semana {s.num}
                      <span className="font-normal text-gray-400"> · {formatData(s.inicio).slice(0, 5)} a {formatData(s.fim).slice(0, 5)}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-gray-500">{s.dias} {s.dias === 1 ? 'dia' : 'dias'}</span>
                      <span className="font-medium text-gray-700">{formatHoras(s.horas)}</span>
                      {s.extra > 0 && <span className="font-semibold text-orange-600">+{formatHoras(s.extra)} extra</span>}
                      {s.faltante > 0 && <span className="font-semibold text-red-600">−{formatHoras(s.faltante)} faltante</span>}
                    </div>
                  </div>
                  <table className="w-full text-xs">
                    <tbody>
                      {s.pontos.map(p => {
                        const ausencia = p.tipo_ausencia ? TIPO_AUSENCIA_LABELS[p.tipo_ausencia] : null
                        const extraDia = (p.horas_extras_50 || 0) + (p.horas_extras_100 || 0)
                        const faltanteDia = p.tipo_ausencia === 'falta'
                          ? CARGA_HORARIA_DIARIA
                          : (!p.tipo_ausencia && p.horas_trabalhadas != null ? Math.max(0, CARGA_HORARIA_DIARIA - p.horas_trabalhadas) : 0)
                        return (
                          <tr key={p.id} className="border-b border-gray-50 last:border-0">
                            <td className="px-4 py-1.5 text-gray-500 w-28 whitespace-nowrap">
                              {DIAS_SEMANA[parseISO(p.data).getDay()]} {formatData(p.data).slice(0, 5)}
                            </td>
                            <td className="px-2 py-1.5 font-mono text-gray-600 whitespace-nowrap">
                              {p.entrada || '—'}{p.saida ? ` → ${p.saida}` : ''}
                            </td>
                            <td className="px-2 py-1.5 text-center font-medium text-gray-700 w-20">
                              {ausencia ? '' : (p.horas_trabalhadas != null ? formatHoras(p.horas_trabalhadas) : '—')}
                            </td>
                            <td className="px-3 py-1.5 text-right w-28 whitespace-nowrap">
                              {ausencia
                                ? <span style={{ color: ausencia.color }}>{ausencia.label}</span>
                                : extraDia > 0
                                  ? <span className="text-orange-600 font-medium">+{formatHoras(extraDia)}</span>
                                  : faltanteDia > 0
                                    ? <span className="text-red-600 font-medium">−{formatHoras(faltanteDia)}</span>
                                    : ''}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>

            {/* Rodapé: consolidado do mês */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <span className="font-semibold text-gray-800">Consolidado do mês</span>
                <div className="flex flex-wrap items-center gap-4">
                  <span className="text-gray-600">{detalheSemanas.total.dias} dias</span>
                  <span className="font-medium text-gray-800">{formatHoras(detalheSemanas.total.horas)} trab.</span>
                  {detalheSemanas.total.extra > 0 && (
                    <span className="font-semibold text-orange-600">+{formatHoras(detalheSemanas.total.extra)} extra</span>
                  )}
                  {detalheSemanas.total.faltante > 0 && (
                    <span className="font-semibold text-red-600">−{formatHoras(detalheSemanas.total.faltante)} faltante</span>
                  )}
                  {detalheSemanas.total.extra === 0 && detalheSemanas.total.faltante === 0 && (
                    <span className="text-gray-400">sem extra/faltante</span>
                  )}
                  {detalheSemanas.total.faltas > 0 && (
                    <span className="text-red-600">{detalheSemanas.total.faltas} falta(s)</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
