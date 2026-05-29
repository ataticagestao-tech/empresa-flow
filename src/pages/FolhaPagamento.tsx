import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { format, addMonths } from 'date-fns'
import {
  Calculator, Loader2, Plus, X,
  Search, RefreshCw, Check, Lock, FileText, ChevronLeft,
  ChevronRight, MoreHorizontal, Download, AlertTriangle,
  Eye, ChevronDown
} from 'lucide-react'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { formatBRL, formatData } from '@/lib/format'
import { AppLayout } from '@/components/layout/AppLayout'
import { PagePanel } from '@/components/layout/PagePanel'
import { KpiCard, KpiCardGrid } from '@/components/ui/kpi-card'
import { ExportMenu } from '@/components/ExportMenu'
import { toast } from 'sonner'
import { calcularINSS, calcularIRRF, type FaixaINSS, type FaixaIRRF } from '@/lib/folha/calculo'
import { calcularEncargosCompetencia } from '@/lib/folha/encargos'
import { computeDropdownCoords, dropdownPositionStyle, type DropdownCoords } from '@/lib/dropdownPosition'

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
  cpf?: string | null
  role?: string | null
  salary?: number | null
  salario_base?: number | null
  hire_date?: string | null
  status: string
  tipo_contrato?: string | null
}

// ─── Status config ──────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  rascunho: { label: 'Rascunho', color: '#667085', bg: '#F3F4F6' },
  fechada: { label: 'Fechada', color: '#EA580C', bg: '#FFF0EB' },
  paga: { label: 'Paga', color: '#059669', bg: '#ECFDF4' },
  retificada: { label: 'Retificada', color: '#E53E3E', bg: '#FEE2E2' },
}

const TIPO_LABELS: Record<string, string> = {
  mensal: 'Mensal',
  ferias: 'Ferias',
  rescisao: 'Rescisao',
  '13_primeiro': '13o 1a parcela',
  '13_segundo': '13o 2a parcela',
  adiantamento: 'Adiantamento',
}

// Tipos de contrato (mesma nomenclatura do cadastro de Funcionarios)
const TIPO_CONTRATO_LABELS: Record<string, string> = {
  clt: 'CLT',
  temporario: 'Temporário',
  estagio: 'Estágio',
  pj: 'PJ',
  autonomo: 'Autônomo',
}

// REGRA DO SISTEMA: PJ e autônomo são pagos via NF/RPA e NUNCA entram na folha CLT.
// Apenas estes tipos podem ser calculados na folha de pagamento.
const TIPOS_CONTRATO_FOLHA = ['clt', 'temporario', 'estagio']

// tipo_contrato nulo no cadastro tem default 'clt'
const normalizaTipoContrato = (t?: string | null) => (t || 'clt').toLowerCase()

// Campos obrigatorios para lancar a folha de um funcionario.
// Cadastro incompleto = nao pode lancar (retorna a lista do que falta).
function getCamposFaltando(func: Funcionario): string[] {
  const faltando: string[] = []
  const nome = (func.nome_completo || func.name || '').trim()
  if (!nome) faltando.push('nome')
  if (!(func.cpf || '').trim()) faltando.push('CPF')
  const salario = Number(func.salario_base ?? func.salary ?? 0)
  if (!salario || salario <= 0) faltando.push('salário base')
  return faltando
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]

// ─── Component ──────────────────────────────────────────────────────
export default function FolhaPagamentoPage() {
  const { selectedCompany } = useCompany()
  const { activeClient } = useAuth()

  // Data
  const [folhas, setFolhas] = useState<FolhaPagamento[]>([])
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([])
  const [faixasINSS, setFaixasINSS] = useState<FaixaINSS[]>([])
  const [faixasIRRF, setFaixasIRRF] = useState<FaixaIRRF[]>([])
  // Horas extras aprovadas do Ponto, agregadas por funcionario na competencia
  const [pontoHoras, setPontoHoras] = useState<Record<string, { he50: number; he100: number }>>({})
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
  const [dropdownCoords, setDropdownCoords] = useState<DropdownCoords | null>(null)

  useEffect(() => {
    if (!dropdownOpen) return
    const handler = () => { setDropdownOpen(null); setDropdownCoords(null) }
    window.addEventListener('click', handler)
    window.addEventListener('scroll', handler, true)
    window.addEventListener('resize', handler)
    return () => {
      window.removeEventListener('click', handler)
      window.removeEventListener('scroll', handler, true)
      window.removeEventListener('resize', handler)
    }
  }, [dropdownOpen])
  const [submitting, setSubmitting] = useState(false)

  // ─── Padrão de planilha: colunas ajustáveis + ocultáveis ─────
  const FOLHA_COL_ORDER = ['funcionario', 'tipo', 'salario', 'proventos', 'descontos', 'liquido', 'status', 'acoes']
  const COL_LABELS: Record<string, string> = {
    funcionario: 'Funcionário', tipo: 'Tipo', salario: 'Salário base', proventos: 'Proventos',
    descontos: 'Descontos', liquido: 'Líquido', status: 'Status', acoes: 'Ações',
  }
  const COL_WIDTHS_DEFAULT: Record<string, number> = {
    funcionario: 220, tipo: 110, salario: 120, proventos: 120, descontos: 120, liquido: 120, status: 110, acoes: 90,
  }
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    try {
      const s = localStorage.getItem('folha_col_widths')
      if (s) return { ...COL_WIDTHS_DEFAULT, ...JSON.parse(s) }
    } catch { /* ignore */ }
    return COL_WIDTHS_DEFAULT
  })
  useEffect(() => { localStorage.setItem('folha_col_widths', JSON.stringify(colWidths)) }, [colWidths])
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => {
    try {
      const s = localStorage.getItem('folha_hidden_cols')
      if (s) return new Set(JSON.parse(s) as string[])
    } catch { /* ignore */ }
    return new Set()
  })
  useEffect(() => { localStorage.setItem('folha_hidden_cols', JSON.stringify([...hiddenCols])) }, [hiddenCols])
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const isColVisible = (k: string) => !hiddenCols.has(k)
  const toggleColVisible = (k: string) => setHiddenCols(prev => {
    const n = new Set(prev)
    if (n.has(k)) n.delete(k); else n.add(k)
    return n
  })
  const visibleFolhaCols = FOLHA_COL_ORDER.filter(isColVisible)
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

  // Calc form
  const [calcForm, setCalcForm] = useState({
    tipo: 'mensal',
    funcionarioIds: [] as string[],
    selectAll: true,
    tiposContrato: ['clt'] as string[],
  })

  // ─── Data Loading ───────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!selectedCompany || !activeClient) return
    setLoading(true)
    const db = activeClient as any

    const fimMes = format(addMonths(new Date(Number(competencia.split('-')[0]), Number(competencia.split('-')[1]) - 1, 1), 1), 'yyyy-MM') + '-01'

    const [folhaRes, funcRes, inssRes, irrfRes, pontoRes] = await Promise.all([
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
      // Ponto aprovado da competencia (HE entram na folha mensal)
      db.from('ponto_eletronico')
        .select('employee_id, horas_extras_50, horas_extras_100, aprovado, data')
        .eq('company_id', selectedCompany.id)
        .eq('aprovado', true)
        .gte('data', `${competencia}-01`)
        .lt('data', fimMes),
    ])

    // Agrega HE aprovadas por funcionario
    const heMap: Record<string, { he50: number; he100: number }> = {}
    for (const p of (pontoRes.data || [])) {
      const cur = heMap[p.employee_id] || { he50: 0, he100: 0 }
      cur.he50 += Number(p.horas_extras_50 || 0)
      cur.he100 += Number(p.horas_extras_100 || 0)
      heMap[p.employee_id] = cur
    }

    setFolhas(folhaRes.data || [])
    setFuncionarios(funcRes.data || [])
    setFaixasINSS(inssRes.data || [])
    setFaixasIRRF(irrfRes.data || [])
    setPontoHoras(heMap)
    setLoading(false)
  }, [selectedCompany, activeClient, competencia])

  useEffect(() => { loadData() }, [loadData])

  const funcionariosAtivos = useMemo(() =>
    funcionarios.filter(f => (f.status || '').toLowerCase() === 'ativo'), [funcionarios])

  // Contagem de ativos por tipo de contrato (para o modal)
  const contratoCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    funcionariosAtivos.forEach(f => {
      const t = normalizaTipoContrato(f.tipo_contrato)
      counts[t] = (counts[t] || 0) + 1
    })
    return counts
  }, [funcionariosAtivos])

  // Ativos cujo tipo de contrato pode entrar na folha (regra do sistema) E foi selecionado
  const funcionariosElegiveis = useMemo(() =>
    funcionariosAtivos.filter(f => {
      const t = normalizaTipoContrato(f.tipo_contrato)
      return TIPOS_CONTRATO_FOLHA.includes(t) && calcForm.tiposContrato.includes(t)
    }),
    [funcionariosAtivos, calcForm.tiposContrato])

  // Elegiveis com cadastro incompleto (nome/CPF/salario) — nao podem ser lancados
  const funcionariosIncompletos = useMemo(() =>
    funcionariosElegiveis
      .map(f => ({ func: f, faltando: getCamposFaltando(f) }))
      .filter(x => x.faltando.length > 0),
    [funcionariosElegiveis])

  // Elegiveis com cadastro completo — serao calculados
  const funcionariosCalculaveis = useMemo(() =>
    funcionariosElegiveis.filter(f => getCamposFaltando(f).length === 0),
    [funcionariosElegiveis])

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
      if (calcForm.tiposContrato.length === 0) {
        toast.error('Selecione ao menos um tipo de contrato')
        setCalculating(false)
        return
      }

      const funcsParaCalc = calcForm.selectAll
        ? funcionariosElegiveis
        : funcionariosElegiveis.filter(f => calcForm.funcionarioIds.includes(f.id))

      if (funcsParaCalc.length === 0) {
        toast.error('Nenhum funcionario elegivel para os tipos de contrato selecionados')
        setCalculating(false)
        return
      }

      // Separa quem tem cadastro completo (nome/CPF/salario) de quem nao tem
      const funcsIncompletos = funcsParaCalc.filter(f => getCamposFaltando(f).length > 0)
      const funcsCompletos = funcsParaCalc.filter(f => getCamposFaltando(f).length === 0)

      // Notifica os bloqueados por cadastro incompleto
      if (funcsIncompletos.length > 0) {
        const detalhes = funcsIncompletos
          .map(f => `${f.nome_completo || f.name || 'Sem nome'} (falta: ${getCamposFaltando(f).join(', ')})`)
          .join('; ')
        toast.warning(
          `${funcsIncompletos.length} funcionário(s) não lançado(s) — cadastro incompleto: ${detalhes}`,
          { duration: 10000 }
        )
      }

      if (funcsCompletos.length === 0) {
        toast.error('Nenhum funcionário com cadastro completo (nome, CPF e salário base) para lançar')
        setCalculating(false)
        return
      }

      let criados = 0
      let ignorados = 0

      for (const func of funcsCompletos) {
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

        // Horas extras aprovadas do Ponto — só entram na folha mensal.
        // Valor-hora = salário / 220 (CLT). HE 50% = ×1,5 · HE 100% = ×2,0.
        const he = calcForm.tipo === 'mensal' ? (pontoHoras[func.id] || { he50: 0, he100: 0 }) : { he50: 0, he100: 0 }
        const valorHora = salarioBase / 220
        const valorHE50 = Math.round(he.he50 * valorHora * 1.5 * 100) / 100
        const valorHE100 = Math.round(he.he100 * valorHora * 2.0 * 100) / 100

        // Bruto = salário base + horas extras
        const totalProventos = Math.round((salarioBase + valorHE50 + valorHE100) * 100) / 100

        // INSS progressivo sobre o bruto
        const inssFunc = calcularINSS(totalProventos, faixasINSS)

        // IRRF sobre bruto - INSS
        const baseIRRF = totalProventos - inssFunc
        const irrf = calcularIRRF(baseIRRF, faixasIRRF)

        // VT: 6% do salário base (não incide sobre HE)
        const vt = Math.round(salarioBase * 0.06 * 100) / 100

        // FGTS 8% e INSS patronal 20% sobre o bruto
        const fgts = Math.round(totalProventos * 0.08 * 100) / 100
        const inssPatronal = Math.round(totalProventos * 0.20 * 100) / 100

        const totalDescontos = Math.round((inssFunc + irrf + vt) * 100) / 100
        const valorLiquido = Math.round((totalProventos - totalDescontos) * 100) / 100

        await db.from('folha_pagamento').insert({
          company_id: selectedCompany.id,
          employee_id: func.id,
          competencia,
          tipo: calcForm.tipo,
          salario_base: salarioBase,
          horas_extras_50: he.he50,
          horas_extras_100: he.he100,
          valor_he_50: valorHE50,
          valor_he_100: valorHE100,
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
      const [ano, mes] = competencia.split('-')
      const mesLabel = MESES[parseInt(mes) - 1]
      const onlyDigits = (s?: string | null) => (s || '').replace(/\D/g, '')

      let cpsCriados = 0
      let erros = 0

      // Um Conta a Pagar por funcionario (com CPF p/ match de PIX), vinculado de volta a folha.
      // Processamento independente por linha: se uma falhar, as outras seguem; re-fechar
      // so pega os rascunhos restantes (folha fechada sai do filtro, sem duplicar CP).
      for (const folha of rascunhos) {
        try {
          const func = funcionarios.find(f => f.id === folha.employee_id)
          const nome = func?.nome_completo || func?.name || 'Funcionário'
          const cpf = onlyDigits(func?.cpf)

          const { data: cp, error: cpError } = await db.from('contas_pagar')
            .insert({
              company_id: selectedCompany.id,
              credor_nome: nome,
              credor_cpf_cnpj: cpf || null,
              descricao: `Salário ${mesLabel}/${ano}`,
              valor: folha.valor_liquido,
              data_vencimento: `${competencia}-05`,
              status: 'aberto',
              competencia,
            })
            .select('id')
            .single()

          if (cpError) throw cpError

          const { error: updError } = await db.from('folha_pagamento')
            .update({ status: 'fechada', conta_pagar_id: cp.id })
            .eq('id', folha.id)

          if (updError) throw updError

          cpsCriados++
        } catch (e) {
          console.error('Erro ao fechar folha do funcionario', folha.employee_id, e)
          erros++
        }
      }

      if (cpsCriados > 0) {
        toast.success(`Folha fechada: ${cpsCriados} conta(s) a pagar gerada(s)${erros > 0 ? ` — ${erros} com erro` : ''}`)
        // Apura os encargos da competência automaticamente (FGTS/INSS/IRRF + CPs)
        const enc = await calcularEncargosCompetencia({ client: db, companyId: selectedCompany.id, competencia })
        if (enc.sucesso) toast.success(`Encargos de ${mesLabel}/${ano} apurados: ${formatBRL(enc.totalEncargos ?? 0)}`)
        else if (!enc.semFolha) toast.error(enc.erro || 'Folha fechada, mas houve erro ao apurar encargos')
      } else {
        toast.error('Não foi possível fechar a folha')
      }
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
      <div>
        <PagePanel title="Folha de Pagamento" subtitle="Cálculo e fechamento da folha mensal">

        {/* ── KPIs ── */}
        <KpiCardGrid className="lg:grid-cols-5">
          {[
            { label: 'Total proventos', value: formatBRL(kpis.totalProventos), color: '#059669' },
            { label: 'Total descontos', value: formatBRL(kpis.totalDescontos), color: '#E53E3E' },
            { label: 'Liquido a pagar', value: formatBRL(kpis.totalLiquido), color: '#059669' },
            { label: 'Encargos patronais', value: formatBRL(kpis.totalEncargos), color: '#EA580C' },
            { label: 'Funcionarios', value: kpis.qtd, color: '#059669' },
          ].map((kpi, i) => (
            <KpiCard key={i} label={kpi.label} value={kpi.value} valueColor={kpi.color} />
          ))}
        </KpiCardGrid>

        {/* ── Toolbar ── */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowCalcModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
            style={{ backgroundColor: '#059669' }}
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

          <ExportMenu<FolhaPagamento>
            rows={() => filteredFolhas}
            columns={[
              { header: 'Funcionario', value: (f) => getNomeFuncionario(f.employee_id), pdfFlex: 22 },
              { header: 'Tipo', value: (f) => TIPO_LABELS[f.tipo] || f.tipo, pdfFlex: 12 },
              { header: 'Salario base', value: (f) => formatBRL(f.salario_base), numericValue: (f) => Number(f.salario_base || 0), align: 'right', pdfFlex: 11 },
              { header: 'Proventos', value: (f) => formatBRL(f.total_proventos), numericValue: (f) => Number(f.total_proventos || 0), align: 'right', pdfFlex: 11 },
              { header: 'Descontos', value: (f) => formatBRL(f.total_descontos), numericValue: (f) => Number(f.total_descontos || 0), align: 'right', pdfFlex: 11 },
              { header: 'Liquido', value: (f) => formatBRL(f.valor_liquido), numericValue: (f) => Number(f.valor_liquido || 0), align: 'right', pdfFlex: 11 },
              { header: 'Status', value: (f) => (STATUS_CONFIG[f.status] || STATUS_CONFIG.rascunho).label, pdfFlex: 10 },
            ]}
            titulo="FOLHA DE PAGAMENTO"
            subtitulo={compLabel}
            baseName="folha-pagamento"
            size="md"
          />
        </div>

        {/* ── Table ── */}
        <div className="rounded-xl border border-gray-100 overflow-hidden flex flex-col">
          {/* Cabecalho do container — titulo */}
          <div className="px-5 py-4 flex items-baseline justify-between flex-shrink-0" style={{ backgroundColor: '#000000' }}>
            <h3 className="font-extrabold text-white m-0" style={{ fontSize: 16, letterSpacing: '-0.015em', lineHeight: 1.15 }}>
              Folha
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-white/70 font-medium">
                {filteredFolhas.length} registro{filteredFolhas.length !== 1 ? 's' : ''}
              </span>
              <div className="relative self-center">
                <button
                  onClick={() => setColMenuOpen(o => !o)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/20 text-[12px] text-white hover:bg-white/10"
                  title="Mostrar/ocultar colunas"
                >
                  <Eye size={14} className="text-white/70" /> Colunas
                  <ChevronDown size={13} className={`text-white/60 transition-transform ${colMenuOpen ? 'rotate-180' : ''}`} />
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
            </div>
          </div>
          <div className="bg-white overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="animate-spin text-gray-400" size={24} />
            </div>
          ) : filteredFolhas.length === 0 ? (
            <div className="text-center py-20 text-gray-400 text-sm">
              Nenhuma folha para {compLabel}. Clique em "Calcular folha" para gerar.
            </div>
          ) : (
              <table className="text-sm" style={{ tableLayout: 'fixed', width: visibleFolhaCols.reduce((a, k) => a + (colWidths[k] ?? COL_WIDTHS_DEFAULT[k]), 0), minWidth: '100%' }}>
                <colgroup>
                  {FOLHA_COL_ORDER.map(k => (
                    <col key={k} className={isColVisible(k) ? '' : 'hidden'} style={{ width: colWidths[k] ?? COL_WIDTHS_DEFAULT[k] }} />
                  ))}
                </colgroup>
                <thead>
                  <tr className="bg-white text-left text-xs font-bold text-[#1D2939] uppercase tracking-wider border-b-2 border-[#D0D5DD]">
                    <th className={`px-4 py-3 relative border-r border-[#EAECF0] ${isColVisible('funcionario') ? '' : 'hidden'}`}>
                      Funcionário
                      <span onMouseDown={startResize('funcionario')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                    </th>
                    <th className={`px-4 py-3 relative border-r border-[#EAECF0] ${isColVisible('tipo') ? '' : 'hidden'}`}>
                      Tipo
                      <span onMouseDown={startResize('tipo')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                    </th>
                    <th className={`px-4 py-3 text-right relative border-r border-[#EAECF0] ${isColVisible('salario') ? '' : 'hidden'}`}>
                      Salário base
                      <span onMouseDown={startResize('salario')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                    </th>
                    <th className={`px-4 py-3 text-right relative border-r border-[#EAECF0] ${isColVisible('proventos') ? '' : 'hidden'}`}>
                      Proventos
                      <span onMouseDown={startResize('proventos')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                    </th>
                    <th className={`px-4 py-3 text-right relative border-r border-[#EAECF0] ${isColVisible('descontos') ? '' : 'hidden'}`}>
                      Descontos
                      <span onMouseDown={startResize('descontos')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                    </th>
                    <th className={`px-4 py-3 text-right relative border-r border-[#EAECF0] ${isColVisible('liquido') ? '' : 'hidden'}`}>
                      Líquido
                      <span onMouseDown={startResize('liquido')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                    </th>
                    <th className={`px-4 py-3 relative border-r border-[#EAECF0] ${isColVisible('status') ? '' : 'hidden'}`}>
                      Status
                      <span onMouseDown={startResize('status')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                    </th>
                    <th className={`px-4 py-3 text-center relative ${isColVisible('acoes') ? '' : 'hidden'}`}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFolhas.map(f => {
                    const st = STATUS_CONFIG[f.status] || STATUS_CONFIG.rascunho
                    const nomeFunc = getNomeFuncionario(f.employee_id)
                    return (
                      <tr key={f.id} className="border-b border-[#F1F3F5] hover:bg-gray-50/50 transition-colors">
                        <td className={`px-4 py-1 font-medium truncate border-r border-[#F1F3F5] ${isColVisible('funcionario') ? '' : 'hidden'}`} title={nomeFunc}>{nomeFunc}</td>
                        <td className={`px-4 py-1 text-gray-500 truncate border-r border-[#F1F3F5] ${isColVisible('tipo') ? '' : 'hidden'}`} title={TIPO_LABELS[f.tipo] || f.tipo}>{TIPO_LABELS[f.tipo] || f.tipo}</td>
                        <td className={`px-4 py-1 text-right truncate border-r border-[#F1F3F5] ${isColVisible('salario') ? '' : 'hidden'}`}>{formatBRL(f.salario_base)}</td>
                        <td className={`px-4 py-1 text-right text-green-700 truncate border-r border-[#F1F3F5] ${isColVisible('proventos') ? '' : 'hidden'}`}>{formatBRL(f.total_proventos)}</td>
                        <td className={`px-4 py-1 text-right text-red-600 truncate border-r border-[#F1F3F5] ${isColVisible('descontos') ? '' : 'hidden'}`}>{formatBRL(f.total_descontos)}</td>
                        <td className={`px-4 py-1 text-right font-semibold truncate border-r border-[#F1F3F5] ${isColVisible('liquido') ? '' : 'hidden'}`}>{formatBRL(f.valor_liquido)}</td>
                        <td className={`px-4 py-1 border-r border-[#F1F3F5] ${isColVisible('status') ? '' : 'hidden'}`}>
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{ color: st.color, backgroundColor: st.bg }}
                          >
                            {f.status === 'fechada' && <Lock size={10} />}
                            {f.status === 'paga' && <Check size={10} />}
                            {st.label}
                          </span>
                        </td>
                        <td className={`px-4 py-1 ${isColVisible('acoes') ? '' : 'hidden'}`}>
                          <div className="flex items-center justify-center gap-1 relative">
                            <button
                              onClick={() => { setSelectedFolha(f); setShowDetailModal(true) }}
                              className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                              title="Ver detalhes"
                            >
                              <FileText size={14} />
                            </button>
                            <button
                              onClick={e => {
                                e.stopPropagation()
                                if (dropdownOpen === f.id) {
                                  setDropdownOpen(null)
                                  setDropdownCoords(null)
                                } else {
                                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                                  setDropdownCoords(computeDropdownCoords(rect))
                                  setDropdownOpen(f.id)
                                }
                              }}
                              className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                            >
                              <MoreHorizontal size={14} />
                            </button>
                            {dropdownOpen === f.id && dropdownCoords && createPortal(
                              <div className="fixed bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px]" style={{ ...dropdownPositionStyle(dropdownCoords), zIndex: 100 }} onClick={e => e.stopPropagation()}>
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
                              </div>,
                              document.body
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 bg-gray-50 font-semibold text-sm">
                    <td className={`px-4 py-3 truncate ${isColVisible('funcionario') ? '' : 'hidden'}`}>Total ({filteredFolhas.length} funcionarios)</td>
                    <td className={`px-4 py-3 ${isColVisible('tipo') ? '' : 'hidden'}`}></td>
                    <td className={`px-4 py-3 ${isColVisible('salario') ? '' : 'hidden'}`}></td>
                    <td className={`px-4 py-3 text-right text-green-700 ${isColVisible('proventos') ? '' : 'hidden'}`}>{formatBRL(kpis.totalProventos)}</td>
                    <td className={`px-4 py-3 text-right text-red-600 ${isColVisible('descontos') ? '' : 'hidden'}`}>{formatBRL(kpis.totalDescontos)}</td>
                    <td className={`px-4 py-3 text-right ${isColVisible('liquido') ? '' : 'hidden'}`}>{formatBRL(kpis.totalLiquido)}</td>
                    <td className={`px-4 py-3 ${isColVisible('status') ? '' : 'hidden'}`}></td>
                    <td className={`px-4 py-3 ${isColVisible('acoes') ? '' : 'hidden'}`}></td>
                  </tr>
                </tfoot>
              </table>
          )}
          </div>
        </div>
        </PagePanel>
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
                <label className="block text-xs text-gray-500 mb-2">Tipos de contrato na folha</label>
                <div className="space-y-1.5">
                  {Object.entries(TIPO_CONTRATO_LABELS).map(([key, label]) => {
                    const count = contratoCounts[key] || 0
                    const elegivel = TIPOS_CONTRATO_FOLHA.includes(key)
                    const checked = calcForm.tiposContrato.includes(key)
                    return (
                      <label
                        key={key}
                        className={`flex items-center justify-between gap-2 text-sm ${elegivel ? 'text-gray-600 cursor-pointer' : 'text-gray-400 cursor-not-allowed'}`}
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={elegivel && checked}
                            disabled={!elegivel}
                            onChange={e => setCalcForm(prev => ({
                              ...prev,
                              tiposContrato: e.target.checked
                                ? [...prev.tiposContrato, key]
                                : prev.tiposContrato.filter(t => t !== key),
                            }))}
                            className="rounded border-gray-300 disabled:opacity-50"
                          />
                          {label}
                          {!elegivel && <span className="text-[11px] text-gray-400">— fora da folha (NF/RPA)</span>}
                        </span>
                        <span className="text-xs text-gray-400">{count} ativo(s)</span>
                      </label>
                    )
                  })}
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Serão calculados <strong>{funcionariosCalculaveis.length}</strong> funcionário(s) com cadastro completo.
                </p>
              </div>

              {/* Aviso: cadastro incompleto — nao podem ser lancados */}
              {funcionariosIncompletos.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-medium">
                    <AlertTriangle size={14} />
                    {funcionariosIncompletos.length} funcionário(s) não serão lançados — cadastro incompleto:
                  </div>
                  <ul className="ml-5 list-disc space-y-0.5">
                    {funcionariosIncompletos.map(({ func, faltando }) => (
                      <li key={func.id}>
                        <span className="font-medium">{func.nome_completo || func.name || 'Sem nome'}</span> — falta: {faltando.join(', ')}
                      </li>
                    ))}
                  </ul>
                  <p className="ml-5 text-amber-700">
                    Complete o cadastro em Funcionários (nome, CPF e salário base) para lançar a folha destes.
                  </p>
                </div>
              )}
              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1">
                <p>INSS: tabela progressiva {new Date().getFullYear()}</p>
                <p>IRRF: tabela progressiva {new Date().getFullYear()}</p>
                <p>FGTS: 8% | INSS patronal: 20%</p>
                <p>VT: 6% do salario base</p>
                <p>Horas extras: puxadas do Ponto aprovado (50% e 100%) — só na folha mensal</p>
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
                style={{ backgroundColor: '#059669' }}
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

    </AppLayout>
  )
}
