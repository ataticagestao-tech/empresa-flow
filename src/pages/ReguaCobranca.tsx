import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { safeQuery } from '@/lib/supabaseQuery'
import { formatBRL, formatData } from '@/lib/format'
import { AppLayout } from '@/components/layout/AppLayout'
import { PagePanel } from '@/components/layout/PagePanel'
import { KpiCard, KpiCardGrid } from '@/components/ui/kpi-card'
import { Skeleton } from '@/components/ui/skeleton'
import { TablePagination } from '@/components/ui/table-pagination'
import { ExportMenu, type ExportColumn } from '@/components/ExportMenu'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { format, parseISO, differenceInDays } from 'date-fns'
import {
  Plus, Search, Trash2, Bell, Mail, MessageSquare, Play, Pause, Send, Eye, ChevronDown,
} from 'lucide-react'

/* ================================================================
   TYPES
   ================================================================ */

interface Regua {
  id: string
  company_id: string
  nome: string
  gatilho_tipo: string
  dias_referencia: number
  canal: 'email' | 'whatsapp' | 'sms'
  template: string
  ativo: boolean
}

interface EtapaForm {
  tipo_acao: 'email' | 'whatsapp' | 'sms'
  dias_antes_vencimento: number
  template_mensagem: string
  ordem: number
}

interface CR {
  id: string
  company_id: string
  pagador_nome: string
  pagador_cpf_cnpj: string | null
  valor: number
  data_vencimento: string
  status: string
}

interface LogEntry {
  id: string
  regua_id: string
  contas_receber_id: string
  tipo_acao: string
  status: string
  enviado_em: string
  regua_nome?: string
  cliente_nome?: string
}

/* ================================================================
   HELPERS
   ================================================================ */

function diasLabel(dias: number): string {
  if (dias < 0) return `${Math.abs(dias)} dias antes`
  if (dias === 0) return 'No dia do vencimento'
  return `${dias} dias depois`
}

function tipoIcon(tipo: string) {
  switch (tipo) {
    case 'email': return <Mail size={14} />
    case 'whatsapp': return <MessageSquare size={14} />
    case 'sms': return <Send size={14} />
    default: return <Bell size={14} />
  }
}

function tipoLabel(tipo: string): string {
  switch (tipo) {
    case 'email': return 'E-mail'
    case 'whatsapp': return 'WhatsApp'
    case 'sms': return 'SMS'
    default: return tipo
  }
}

function tipoBadgeColors(tipo: string) {
  switch (tipo) {
    case 'email': return { text: '#059669', bg: '#ECFDF4', border: '#059669' }
    case 'whatsapp': return { text: '#039855', bg: '#ECFDF3', border: '#039855' }
    case 'sms': return { text: '#EA580C', bg: '#FFF0EB', border: '#EA580C' }
    default: return { text: '#555', bg: '#F6F2EB', border: '#ccc' }
  }
}

function statusBadge(status: string) {
  switch (status) {
    case 'aberto':
      return { label: 'Em aberto', text: '#059669', bg: '#ECFDF4', border: '#059669' }
    case 'vencido':
      return { label: 'Vencido', text: '#E53E3E', bg: '#FEE2E2', border: '#E53E3E' }
    case 'parcial':
      return { label: 'Parcial', text: '#EA580C', bg: '#FFF0EB', border: '#EA580C' }
    case 'pago':
      return { label: 'Pago', text: '#039855', bg: '#ECFDF3', border: '#039855' }
    default:
      return { label: status, text: '#555', bg: '#F6F2EB', border: '#ccc' }
  }
}

function logStatusBadge(status: string) {
  switch (status) {
    case 'enviado':
      return { label: 'Enviado', text: '#039855', bg: '#ECFDF3', border: '#039855' }
    case 'erro':
      return { label: 'Erro', text: '#E53E3E', bg: '#FEE2E2', border: '#E53E3E' }
    case 'pendente':
      return { label: 'Pendente', text: '#EA580C', bg: '#FFF0EB', border: '#EA580C' }
    default:
      return { label: status, text: '#555', bg: '#F6F2EB', border: '#ccc' }
  }
}

function computeStatus(cr: CR): string {
  if (cr.status === 'pago' || cr.status === 'cancelado') return cr.status
  const hoje = new Date().toISOString().split('T')[0]
  if (cr.data_vencimento < hoje && cr.status !== 'pago') return 'vencido'
  return cr.status
}

/* ================================================================
   COMPONENT
   ================================================================ */

export default function ReguaCobranca() {
  const { selectedCompany } = useCompany()
  const { activeClient } = useAuth()
  const confirm = useConfirm()
  const companyId = selectedCompany?.id

  // ── Reguas state ── (each row in regua_cobranca is one etapa/step)
  const [reguas, setReguas] = useState<Regua[]>([])
  const [loadingReguas, setLoadingReguas] = useState(true)

  // ── CRs state ──
  const [crs, setCrs] = useState<CR[]>([])
  const [loadingCrs, setLoadingCrs] = useState(true)

  // ── Logs state ──
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loadingLogs, setLoadingLogs] = useState(true)

  // ── Modal state ──
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRegua, setEditingRegua] = useState<Regua | null>(null)
  const [reguaNome, setReguaNome] = useState('')
  const [etapasForm, setEtapasForm] = useState<EtapaForm[]>([])
  const [saving, setSaving] = useState(false)

  // ── Processing state ──
  const [processing, setProcessing] = useState(false)

  // ── Search ──
  const [searchCr, setSearchCr] = useState('')

  // ── Pagination ──
  const PAGE_SIZE = 10
  const [crPage, setCrPage] = useState(0)
  const [logPage, setLogPage] = useState(0)

  // ─── Padrão de planilha: colunas ajustáveis + ocultáveis ─────
  // Tabela de Contas a Receber com Cobrança
  const CR_COL_ORDER = ['cliente', 'valor', 'vencimento', 'status', 'ultima', 'proxima', 'regua']
  const CR_COL_LABELS: Record<string, string> = {
    cliente: 'Cliente', valor: 'Valor', vencimento: 'Vencimento', status: 'Status',
    ultima: 'Última ação', proxima: 'Próxima ação', regua: 'Régua',
  }
  const CR_COL_WIDTHS_DEFAULT: Record<string, number> = {
    'cr:cliente': 220, 'cr:valor': 120, 'cr:vencimento': 120, 'cr:status': 110,
    'cr:ultima': 150, 'cr:proxima': 150, 'cr:regua': 150,
  }
  // Tabela de Log de Cobranças
  const LOG_COL_ORDER = ['datahora', 'cliente', 'tipo', 'status', 'regua']
  const LOG_COL_LABELS: Record<string, string> = {
    datahora: 'Data/hora', cliente: 'Cliente', tipo: 'Tipo', status: 'Status', regua: 'Régua',
  }
  const LOG_COL_WIDTHS_DEFAULT: Record<string, number> = {
    'log:datahora': 130, 'log:cliente': 220, 'log:tipo': 130, 'log:status': 110, 'log:regua': 160,
  }

  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    try {
      const s = localStorage.getItem('reguacobranca_col_widths')
      if (s) return { ...CR_COL_WIDTHS_DEFAULT, ...LOG_COL_WIDTHS_DEFAULT, ...JSON.parse(s) }
    } catch { /* ignore */ }
    return { ...CR_COL_WIDTHS_DEFAULT, ...LOG_COL_WIDTHS_DEFAULT }
  })
  useEffect(() => { localStorage.setItem('reguacobranca_col_widths', JSON.stringify(colWidths)) }, [colWidths])
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => {
    try {
      const s = localStorage.getItem('reguacobranca_hidden_cols')
      if (s) return new Set(JSON.parse(s) as string[])
    } catch { /* ignore */ }
    return new Set()
  })
  useEffect(() => { localStorage.setItem('reguacobranca_hidden_cols', JSON.stringify([...hiddenCols])) }, [hiddenCols])
  const [crColMenuOpen, setCrColMenuOpen] = useState(false)
  const [logColMenuOpen, setLogColMenuOpen] = useState(false)
  const colKey = (table: string, k: string) => `${table}:${k}`
  const isColVisible = (k: string) => !hiddenCols.has(k)
  const toggleColVisible = (k: string) => setHiddenCols(prev => {
    const n = new Set(prev)
    if (n.has(k)) n.delete(k); else n.add(k)
    return n
  })
  const visibleCrCols = CR_COL_ORDER.filter(k => isColVisible(colKey('cr', k)))
  const visibleLogCols = LOG_COL_ORDER.filter(k => isColVisible(colKey('log', k)))
  const resizingRef = useRef<{ key: string; startX: number; startW: number } | null>(null)
  const startResize = (key: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    resizingRef.current = { key, startX: e.clientX, startW: colWidths[key] ?? 120 }
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

  /* ── Fetch reguas ── */
  async function fetchReguas() {
    if (!companyId) return
    setLoadingReguas(true)
    const data = await safeQuery(
      () =>
        supabase
          .from('regua_cobranca')
          .select('*')
          .eq('company_id', companyId)
          .order('nome'),
      'listar reguas',
    )
    setReguas((data as Regua[]) || [])
    setLoadingReguas(false)
  }

  // Group reguas by nome (each "regua" is a group of rows sharing the same nome)
  const reguasGrouped = useMemo(() => {
    const map: Record<string, Regua[]> = {}
    for (const r of reguas) {
      if (!map[r.nome]) map[r.nome] = []
      map[r.nome].push(r)
    }
    return map
  }, [reguas])

  /* ── Fetch CRs ── */
  async function fetchCrs() {
    if (!companyId) return
    setLoadingCrs(true)
    const data = await safeQuery(
      () =>
        supabase
          .from('contas_receber')
          .select('id, company_id, pagador_nome, pagador_cpf_cnpj, valor, data_vencimento, status')
          .eq('company_id', companyId)
          .in('status', ['aberto', 'vencido', 'parcial'])
          .is('deleted_at', null)
          .order('data_vencimento', { ascending: true }),
      'listar CRs para cobranca',
    )
    setCrs((data as CR[]) || [])
    setLoadingCrs(false)
  }

  /* ── Fetch logs ── */
  async function fetchLogs() {
    if (!companyId) return
    setLoadingLogs(true)

    const data = await safeQuery(
      () =>
        supabase
          .from('regua_cobranca_log')
          .select('*, regua:regua_cobranca(nome), cr:contas_receber(pagador_nome)')
          .order('enviado_em', { ascending: false })
          .limit(100),
      'listar logs de cobranca',
    )

    const logList = ((data as any[]) || []).map((l: any) => ({
      id: l.id,
      regua_id: l.regua_id,
      contas_receber_id: l.contas_receber_id,
      tipo_acao: l.tipo_acao,
      status: l.status,
      enviado_em: l.enviado_em,
      regua_nome: l.regua?.nome || '-',
      cliente_nome: l.cr?.pagador_nome || '-',
    }))
    setLogs(logList)
    setLoadingLogs(false)
  }

  useEffect(() => {
    fetchReguas()
    fetchCrs()
    fetchLogs()
  }, [companyId])

  useEffect(() => { setCrPage(0) }, [searchCr, companyId])
  useEffect(() => { setLogPage(0) }, [companyId])

  /* ── Derived: CRs with regua info ── */
  const crsWithRegua = useMemo(() => {
    const hoje = new Date()
    return crs.map(cr => {
      const realStatus = computeStatus(cr)
      const venc = parseISO(cr.data_vencimento)
      const diasDiff = differenceInDays(hoje, venc) // positive = after vencimento

      // Find last log for this CR
      const crLogs = logs.filter(l => l.contas_receber_id === cr.id)
      const lastLog = crLogs.length > 0 ? crLogs[0] : null

      // Find active regua rows (etapas)
      const activeEtapas = reguas.filter(r => r.ativo).sort((a, b) => a.dias_referencia - b.dias_referencia)

      // Calculate next action
      let nextAction: { tipo: string; diasLabel: string } | null = null
      let activeRegua = activeEtapas.length > 0 ? activeEtapas[0] : null
      if (activeEtapas.length > 0) {
        for (const etapa of activeEtapas) {
          const targetDayDiff = etapa.dias_referencia
          if (targetDayDiff > diasDiff) {
            nextAction = { tipo: tipoLabel(etapa.canal), diasLabel: diasLabel(etapa.dias_referencia) }
            break
          }
        }
      }

      return {
        ...cr,
        realStatus,
        lastLog,
        activeRegua,
        nextAction,
      }
    })
  }, [crs, logs, reguas])

  const filteredCrs = useMemo(() => {
    if (!searchCr.trim()) return crsWithRegua
    const q = searchCr.toLowerCase()
    return crsWithRegua.filter(cr =>
      cr.pagador_nome?.toLowerCase().includes(q) ||
      cr.pagador_cpf_cnpj?.toLowerCase().includes(q)
    )
  }, [crsWithRegua, searchCr])

  /* ── Colunas do relatório de cobrança ── */
  type CrRow = (typeof crsWithRegua)[number]
  const reportColumns: ExportColumn<CrRow>[] = [
    { header: 'Cliente', value: r => r.pagador_nome, pdfFlex: 18, excelWidth: 28 },
    { header: 'CPF/CNPJ', value: r => r.pagador_cpf_cnpj || '', pdfFlex: 11, excelWidth: 18 },
    { header: 'Valor', value: r => formatBRL(r.valor), numericValue: r => Number(r.valor || 0), pdfFlex: 9, excelWidth: 14 },
    { header: 'Vencimento', value: r => formatData(r.data_vencimento), pdfFlex: 8, excelWidth: 12 },
    { header: 'Status', value: r => statusBadge(r.realStatus).label, pdfFlex: 7, excelWidth: 12 },
    {
      header: 'Última ação',
      value: r => r.lastLog
        ? `${tipoLabel(r.lastLog.tipo_acao)}${r.lastLog.enviado_em ? ' · ' + format(parseISO(r.lastLog.enviado_em), 'dd/MM HH:mm') : ''}`
        : '-',
      pdfFlex: 12, excelWidth: 18,
    },
    {
      header: 'Próxima ação',
      value: r => r.nextAction ? `${r.nextAction.tipo} · ${r.nextAction.diasLabel}` : '-',
      pdfFlex: 12, excelWidth: 20,
    },
    { header: 'Régua', value: r => r.activeRegua?.nome || '-', pdfFlex: 10, excelWidth: 18 },
  ]

  /* ── Colunas do relatório de log de disparos ── */
  const logColumns: ExportColumn<LogEntry>[] = [
    { header: 'Data/hora', value: l => l.enviado_em ? format(parseISO(l.enviado_em), 'dd/MM/yy HH:mm') : '-', pdfFlex: 9, excelWidth: 16 },
    { header: 'Cliente', value: l => l.cliente_nome || '-', pdfFlex: 18, excelWidth: 28 },
    { header: 'Tipo', value: l => tipoLabel(l.tipo_acao), pdfFlex: 8, excelWidth: 12 },
    { header: 'Status', value: l => logStatusBadge(l.status).label, pdfFlex: 8, excelWidth: 12 },
    { header: 'Régua', value: l => l.regua_nome || '-', pdfFlex: 12, excelWidth: 20 },
  ]

  /* ── KPIs ── */
  const kpis = useMemo(() => {
    const vencidas = crsWithRegua.filter(cr => cr.realStatus === 'vencido')
    const clientesInadimplentes = new Set(
      vencidas.map(cr => cr.pagador_cpf_cnpj || cr.pagador_nome)
    ).size
    const valorAtraso = vencidas.reduce((s, cr) => s + Number(cr.valor || 0), 0)
    const reguasAtivas = Object.values(reguasGrouped).filter(g => g[0]?.ativo).length
    const mesAtual = new Date().toISOString().slice(0, 7)
    const disparosMes = logs.filter(l => (l.enviado_em || '').slice(0, 7) === mesAtual).length
    return { clientesInadimplentes, totalVencidas: vencidas.length, valorAtraso, reguasAtivas, disparosMes }
  }, [crsWithRegua, reguasGrouped, logs])

  /* ── Modal: open new/edit ── */
  function openModal(reguaNomeKey?: string) {
    if (reguaNomeKey && reguasGrouped[reguaNomeKey]) {
      const group = reguasGrouped[reguaNomeKey]
      setEditingRegua(group[0]) // use first row as reference
      setReguaNome(reguaNomeKey)
      const existingEtapas = group
        .sort((a, b) => a.dias_referencia - b.dias_referencia)
        .map((r, i) => ({
          tipo_acao: r.canal,
          dias_antes_vencimento: r.dias_referencia,
          template_mensagem: r.template,
          ordem: i + 1,
        }))
      setEtapasForm(existingEtapas.length > 0 ? existingEtapas : getDefaultEtapas())
    } else {
      setEditingRegua(null)
      setReguaNome('')
      setEtapasForm(getDefaultEtapas())
    }
    setModalOpen(true)
  }

  function getDefaultEtapas(): EtapaForm[] {
    return [
      {
        tipo_acao: 'whatsapp',
        dias_antes_vencimento: -3,
        template_mensagem: 'Ola {nome}, lembramos que sua fatura de {valor} vence em {data_vencimento}.',
        ordem: 1,
      },
      {
        tipo_acao: 'email',
        dias_antes_vencimento: 0,
        template_mensagem: 'Prezado(a) {nome}, sua fatura de {valor} vence hoje.',
        ordem: 2,
      },
      {
        tipo_acao: 'whatsapp',
        dias_antes_vencimento: 2,
        template_mensagem: '{nome}, identificamos que a fatura de {valor} venceu em {data_vencimento}. Por favor, regularize.',
        ordem: 3,
      },
      {
        tipo_acao: 'email',
        dias_antes_vencimento: 5,
        template_mensagem: 'Segundo aviso: sua fatura de {valor} esta {dias_atraso} dias em atraso.',
        ordem: 4,
      },
    ]
  }

  function addEtapa() {
    const maxOrdem = etapasForm.reduce((max, e) => Math.max(max, e.ordem), 0)
    setEtapasForm([...etapasForm, {
      tipo_acao: 'email',
      dias_antes_vencimento: 0,
      template_mensagem: '',
      ordem: maxOrdem + 1,
    }])
  }

  function removeEtapa(index: number) {
    setEtapasForm(etapasForm.filter((_, i) => i !== index))
  }

  function updateEtapa(index: number, field: keyof EtapaForm, value: any) {
    setEtapasForm(etapasForm.map((e, i) => i === index ? { ...e, [field]: value } : e))
  }

  /* ── Save regua ── */
  async function handleSave() {
    if (!companyId || !reguaNome.trim() || etapasForm.length === 0) return
    setSaving(true)

    try {
      if (editingRegua) {
        // Delete all old rows for this regua group (same nome + company)
        const oldGroup = reguasGrouped[editingRegua.nome] || []
        if (oldGroup.length > 0) {
          const ids = oldGroup.map(r => r.id)
          await supabase.from('regua_cobranca').delete().in('id', ids)
        }
      }

      // Insert each etapa as a separate row
      const rowsToInsert = etapasForm.map(e => ({
        company_id: companyId,
        nome: reguaNome.trim(),
        gatilho_tipo: e.dias_antes_vencimento < 0 ? 'antes_vencimento' : e.dias_antes_vencimento === 0 ? 'no_vencimento' : 'apos_vencimento',
        dias_referencia: e.dias_antes_vencimento,
        canal: e.tipo_acao,
        template: e.template_mensagem,
        ativo: true,
      }))

      const { error } = await supabase.from('regua_cobranca').insert(rowsToInsert)
      if (error) throw error

      setModalOpen(false)
      await fetchReguas()
    } catch (err: any) {
      console.error('Erro ao salvar regua:', err.message)
      alert('Erro ao salvar: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  /* ── Toggle ativo (all rows in group) ── */
  async function toggleAtivo(nomeKey: string) {
    const group = reguasGrouped[nomeKey] || []
    if (group.length === 0) return
    const newAtivo = !group[0].ativo
    const ids = group.map(r => r.id)
    const { error } = await supabase
      .from('regua_cobranca')
      .update({ ativo: newAtivo })
      .in('id', ids)
    if (!error) {
      setReguas(reguas.map(r => ids.includes(r.id) ? { ...r, ativo: newAtivo } : r))
    }
  }

  /* ── Delete regua (all rows in group) ── */
  async function deleteRegua(nomeKey: string) {
    const ok = await confirm({
      title: 'Excluir esta régua de cobrança?',
      description: 'Todas as etapas desta régua serão removidas. Esta ação não pode ser desfeita.',
      confirmLabel: 'Sim, excluir',
      variant: 'destructive',
    })
    if (!ok) return
    const group = reguasGrouped[nomeKey] || []
    const ids = group.map(r => r.id)
    const { error } = await supabase.from('regua_cobranca').delete().in('id', ids)
    if (!error) {
      setReguas(reguas.filter(r => !ids.includes(r.id)))
    }
  }

  /* ── Process regua (simulation) ── */
  async function processarRegua() {
    if (!companyId) return
    setProcessing(true)

    try {
      const activeEtapas = reguas.filter(r => r.ativo)
      if (activeEtapas.length === 0) {
        alert('Nenhuma regua ativa encontrada.')
        setProcessing(false)
        return
      }

      const hoje = new Date()
      let count = 0

      for (const cr of crs) {
        const venc = parseISO(cr.data_vencimento)
        const diasDiff = differenceInDays(hoje, venc)

        for (const etapa of activeEtapas) {
          if (etapa.dias_referencia === diasDiff) {
            const diasAtraso = diasDiff > 0 ? diasDiff : 0
            const msg = etapa.template
              .replace(/\{nome\}/g, cr.pagador_nome)
              .replace(/\{valor\}/g, formatBRL(cr.valor))
              .replace(/\{data_vencimento\}/g, formatData(cr.data_vencimento))
              .replace(/\{dias_atraso\}/g, String(diasAtraso))

            console.log(`[Regua] ${tipoLabel(etapa.canal)} para ${cr.pagador_nome}: ${msg}`)

            await supabase.from('regua_cobranca_log').insert({
              regua_id: etapa.id,
              contas_receber_id: cr.id,
              tipo_acao: etapa.canal,
              status: 'pendente',
              enviado_em: new Date().toISOString(),
            })

            count++
          }
        }
      }

      alert(`${count} cobrancas processadas.`)
      await fetchLogs()
    } catch (err: any) {
      console.error('Erro ao processar regua:', err.message)
      alert('Erro: ' + err.message)
    } finally {
      setProcessing(false)
    }
  }

  /* ================================================================
     RENDER
     ================================================================ */

  return (
    <AppLayout title="Regua de Cobranca">
      <div className="flex flex-col">

        <PagePanel title="Régua de Cobrança" subtitle="Configure réguas automáticas e acompanhe disparos de cobrança">
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <button
              onClick={processarRegua}
              disabled={processing}
              className="flex items-center gap-2 px-4 py-2 bg-[#059669] text-white text-[12px] font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <Play size={14} />
              {processing ? 'Processando...' : 'Processar régua agora'}
            </button>
          </div>

        {/* ── KPI Cards ── */}
        <KpiCardGrid>
          <KpiCard
            label="Clientes inadimplentes"
            value={kpis.clientesInadimplentes}
            valueColor="#7F1D1D"
            sub={`${kpis.totalVencidas} título${kpis.totalVencidas !== 1 ? 's' : ''} vencido${kpis.totalVencidas !== 1 ? 's' : ''}`}
          />
          <KpiCard
            label="Valor em atraso"
            value={formatBRL(kpis.valorAtraso)}
            valueColor="#E53E3E"
            sub="total vencido em aberto"
          />
          <KpiCard
            label="Réguas ativas"
            value={kpis.reguasAtivas}
            valueColor="#039855"
            sub={`${Object.keys(reguasGrouped).length} régua${Object.keys(reguasGrouped).length !== 1 ? 's' : ''} cadastrada${Object.keys(reguasGrouped).length !== 1 ? 's' : ''}`}
          />
          <KpiCard
            label="Disparos no mês"
            value={kpis.disparosMes}
            sub="cobranças enviadas"
          />
        </KpiCardGrid>

        {/* ================================================================
           SECTION 1: Reguas de Cobranca
           ================================================================ */}
        <div className="border border-[#ccc] rounded-lg overflow-hidden mb-4">
          <div className="bg-[#2A2724] px-4 py-2.5 flex items-center justify-between">
            <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">Reguas de Cobranca</h3>
            <button
              onClick={() => openModal()}
              className="flex items-center gap-1 text-[11px] font-semibold text-white/70 hover:text-white transition-colors"
            >
              <Plus size={13} /> Nova Regua
            </button>
          </div>
          <div className="p-4 bg-white">
            {loadingReguas ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 border border-[#EAECF0] rounded">
                    <Skeleton className="h-9 w-9 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-2/5" />
                      <Skeleton className="h-3 w-3/5" />
                    </div>
                    <Skeleton className="h-6 w-16" />
                  </div>
                ))}
              </div>
            ) : reguas.length === 0 ? (
              <div className="text-center py-10">
                <Bell size={36} className="mx-auto text-[#ccc] mb-3" />
                <p className="text-[13px] text-[#555]">Nenhuma régua configurada.</p>
                <p className="text-[11px] text-[#999] mt-1 mb-4">Crie sua primeira régua para automatizar lembretes e avisos de vencimento.</p>
                <button
                  onClick={() => openModal()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#059669] text-white text-[12px] font-semibold rounded-lg hover:opacity-90 transition-opacity"
                >
                  <Plus size={14} /> Nova Régua
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {Object.entries(reguasGrouped).map(([nomeKey, group]) => {
                  const isAtivo = group[0]?.ativo ?? false
                  return (
                    <div
                      key={nomeKey}
                      className="flex items-center justify-between border border-[#e5e5e5] rounded-lg px-4 py-3 hover:bg-[#F6F2EB] transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${isAtivo ? 'bg-[#039855]' : 'bg-[#ccc]'}`} />
                        <div>
                          <p className="text-[13px] font-semibold text-[#1D2939]">{nomeKey}</p>
                          <p className="text-[11px] text-[#555]">{group.length} etapa{group.length !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => toggleAtivo(nomeKey)}
                          className="flex items-center gap-1.5 text-[11px] font-medium"
                          style={{ color: isAtivo ? '#039855' : '#E53E3E' }}
                        >
                          {isAtivo ? <Play size={12} /> : <Pause size={12} />}
                          {isAtivo ? 'Ativa' : 'Inativa'}
                        </button>
                        <button
                          onClick={() => openModal(nomeKey)}
                          className="text-[11px] font-medium text-[#059669] hover:underline"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => deleteRegua(nomeKey)}
                          className="text-[#E53E3E] hover:opacity-70"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ================================================================
           SECTION 2: CRs com Cobranca Ativa
           ================================================================ */}
        <div className="border border-[#ccc] rounded-lg overflow-hidden mb-4">
          <div className="bg-[#2A2724] px-4 py-2.5 flex items-center justify-between">
            <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">Contas a Receber com Cobranca</h3>
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-white/10 rounded px-2 py-1">
                <Search size={12} className="text-white/60" />
                <input
                  type="text"
                  value={searchCr}
                  onChange={e => setSearchCr(e.target.value)}
                  placeholder="Buscar cliente..."
                  className="bg-transparent border-none outline-none text-[11px] text-white placeholder-white/50 ml-1.5 w-[140px]"
                />
              </div>
              <div className="relative self-center">
                <button
                  onClick={() => setCrColMenuOpen(o => !o)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/20 text-[11px] text-white hover:bg-white/10"
                  title="Mostrar/ocultar colunas"
                >
                  <Eye size={13} className="text-white/70" /> Colunas
                  <ChevronDown size={12} className={`text-white/60 transition-transform ${crColMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {crColMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setCrColMenuOpen(false)} />
                    <div className="absolute right-0 mt-1 z-50 bg-white border border-[#EAECF0] rounded-lg shadow-xl py-1 min-w-[190px]">
                      <p className="px-3 py-1.5 text-[10px] font-bold text-[#98A2B3] uppercase tracking-wider">Exibir colunas</p>
                      {Object.entries(CR_COL_LABELS).map(([k, label]) => (
                        <label key={k} className="flex items-center gap-2 px-3 py-1.5 text-[13px] text-[#1D2939] hover:bg-[#F6F2EB] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isColVisible(colKey('cr', k))}
                            onChange={() => toggleColVisible(colKey('cr', k))}
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
                rows={filteredCrs}
                columns={reportColumns}
                titulo="RELATÓRIO DE COBRANÇA"
                baseName="relatorio-cobranca"
                disabled={loadingCrs || filteredCrs.length === 0}
              />
            </div>
          </div>
          <div className="bg-white overflow-x-auto">
            {loadingCrs ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 py-2">
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            ) : filteredCrs.length === 0 ? (
              <p className="text-[13px] text-[#555] text-center py-6">Nenhuma conta a receber em aberto ou vencida.</p>
            ) : (
              <>
              <table className="text-left" style={{ tableLayout: 'fixed', width: visibleCrCols.reduce((a, k) => a + (colWidths[colKey('cr', k)] ?? CR_COL_WIDTHS_DEFAULT[colKey('cr', k)]), 0), minWidth: '100%' }}>
                <colgroup>
                  {CR_COL_ORDER.map(k => (
                    <col key={k} className={isColVisible(colKey('cr', k)) ? '' : 'hidden'} style={{ width: colWidths[colKey('cr', k)] ?? CR_COL_WIDTHS_DEFAULT[colKey('cr', k)] }} />
                  ))}
                </colgroup>
                <thead>
                  <tr style={{ backgroundColor: '#000000' }}>
                    <th className={`text-[10px] font-bold text-white uppercase tracking-wider px-4 py-2.5 relative border-r border-white/10 ${isColVisible(colKey('cr', 'cliente')) ? '' : 'hidden'}`}>
                      <span onMouseDown={startResize(colKey('cr', 'cliente'))} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-white/20 z-10" title="Arraste para ajustar a largura" />
                      Cliente
                    </th>
                    <th className={`text-[10px] font-bold text-white uppercase tracking-wider px-4 py-2.5 relative border-r border-white/10 ${isColVisible(colKey('cr', 'valor')) ? '' : 'hidden'}`}>
                      <span onMouseDown={startResize(colKey('cr', 'valor'))} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-white/20 z-10" title="Arraste para ajustar a largura" />
                      Valor
                    </th>
                    <th className={`text-[10px] font-bold text-white uppercase tracking-wider px-4 py-2.5 relative border-r border-white/10 ${isColVisible(colKey('cr', 'vencimento')) ? '' : 'hidden'}`}>
                      <span onMouseDown={startResize(colKey('cr', 'vencimento'))} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-white/20 z-10" title="Arraste para ajustar a largura" />
                      Vencimento
                    </th>
                    <th className={`text-[10px] font-bold text-white uppercase tracking-wider px-4 py-2.5 relative border-r border-white/10 ${isColVisible(colKey('cr', 'status')) ? '' : 'hidden'}`}>
                      <span onMouseDown={startResize(colKey('cr', 'status'))} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-white/20 z-10" title="Arraste para ajustar a largura" />
                      Status
                    </th>
                    <th className={`text-[10px] font-bold text-white uppercase tracking-wider px-4 py-2.5 relative border-r border-white/10 ${isColVisible(colKey('cr', 'ultima')) ? '' : 'hidden'}`}>
                      <span onMouseDown={startResize(colKey('cr', 'ultima'))} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-white/20 z-10" title="Arraste para ajustar a largura" />
                      Ultima acao
                    </th>
                    <th className={`text-[10px] font-bold text-white uppercase tracking-wider px-4 py-2.5 relative border-r border-white/10 ${isColVisible(colKey('cr', 'proxima')) ? '' : 'hidden'}`}>
                      <span onMouseDown={startResize(colKey('cr', 'proxima'))} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-white/20 z-10" title="Arraste para ajustar a largura" />
                      Proxima acao
                    </th>
                    <th className={`text-[10px] font-bold text-white uppercase tracking-wider px-4 py-2.5 relative ${isColVisible(colKey('cr', 'regua')) ? '' : 'hidden'}`}>
                      Regua
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCrs.slice(crPage * PAGE_SIZE, (crPage + 1) * PAGE_SIZE).map(cr => {
                    const badge = statusBadge(cr.realStatus)
                    return (
                      <tr key={cr.id} className="border-b border-[#F1F3F5] hover:bg-[#F6F2EB]">
                        <td className={`px-4 py-1 border-r border-[#F1F3F5] ${isColVisible(colKey('cr', 'cliente')) ? '' : 'hidden'}`}>
                          <p className="text-[13px] font-medium text-[#1D2939] truncate" title={cr.pagador_nome}>{cr.pagador_nome}</p>
                          {cr.pagador_cpf_cnpj && (
                            <p className="text-[10px] text-[#999] truncate">{cr.pagador_cpf_cnpj}</p>
                          )}
                        </td>
                        <td className={`px-4 py-1 text-[13px] font-semibold text-[#1D2939] truncate border-r border-[#F1F3F5] ${isColVisible(colKey('cr', 'valor')) ? '' : 'hidden'}`}>
                          {formatBRL(cr.valor)}
                        </td>
                        <td className={`px-4 py-1 text-[12px] text-[#555] truncate border-r border-[#F1F3F5] ${isColVisible(colKey('cr', 'vencimento')) ? '' : 'hidden'}`}>
                          {formatData(cr.data_vencimento)}
                        </td>
                        <td className={`px-4 py-1 border-r border-[#F1F3F5] ${isColVisible(colKey('cr', 'status')) ? '' : 'hidden'}`}>
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded border"
                            style={{ color: badge.text, backgroundColor: badge.bg, borderColor: badge.border }}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td className={`px-4 py-1 border-r border-[#F1F3F5] ${isColVisible(colKey('cr', 'ultima')) ? '' : 'hidden'}`}>
                          {cr.lastLog ? (
                            <div>
                              <span
                                className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                                style={(() => {
                                  const c = tipoBadgeColors(cr.lastLog.tipo_acao)
                                  return { color: c.text, backgroundColor: c.bg }
                                })()}
                              >
                                {tipoLabel(cr.lastLog.tipo_acao)}
                              </span>
                              <p className="text-[10px] text-[#999] mt-0.5 truncate">
                                {cr.lastLog.enviado_em ? format(parseISO(cr.lastLog.enviado_em), 'dd/MM HH:mm') : '-'}
                              </p>
                            </div>
                          ) : (
                            <span className="text-[11px] text-[#999]">-</span>
                          )}
                        </td>
                        <td className={`px-4 py-1 border-r border-[#F1F3F5] ${isColVisible(colKey('cr', 'proxima')) ? '' : 'hidden'}`}>
                          {cr.nextAction ? (
                            <div>
                              <p className="text-[11px] font-medium text-[#059669] truncate">{cr.nextAction.tipo}</p>
                              <p className="text-[10px] text-[#999] truncate">{cr.nextAction.diasLabel}</p>
                            </div>
                          ) : (
                            <span className="text-[11px] text-[#999]">-</span>
                          )}
                        </td>
                        <td className={`px-4 py-1 text-[11px] text-[#555] truncate ${isColVisible(colKey('cr', 'regua')) ? '' : 'hidden'}`} title={cr.activeRegua?.nome || '-'}>
                          {cr.activeRegua?.nome || '-'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <TablePagination
                page={crPage}
                pageSize={PAGE_SIZE}
                total={filteredCrs.length}
                onPageChange={setCrPage}
              />
              </>
            )}
          </div>
        </div>

        {/* ================================================================
           SECTION 3: Log de Cobrancas
           ================================================================ */}
        <div className="border border-[#ccc] rounded-lg overflow-hidden mb-4">
          <div className="bg-[#2A2724] px-4 py-2.5 flex items-center justify-between">
            <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">Log de Cobrancas</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchLogs}
                className="text-[11px] font-semibold text-white/70 hover:text-white transition-colors"
              >
                Atualizar
              </button>
              <div className="relative self-center">
                <button
                  onClick={() => setLogColMenuOpen(o => !o)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/20 text-[11px] text-white hover:bg-white/10"
                  title="Mostrar/ocultar colunas"
                >
                  <Eye size={13} className="text-white/70" /> Colunas
                  <ChevronDown size={12} className={`text-white/60 transition-transform ${logColMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {logColMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setLogColMenuOpen(false)} />
                    <div className="absolute right-0 mt-1 z-50 bg-white border border-[#EAECF0] rounded-lg shadow-xl py-1 min-w-[190px]">
                      <p className="px-3 py-1.5 text-[10px] font-bold text-[#98A2B3] uppercase tracking-wider">Exibir colunas</p>
                      {Object.entries(LOG_COL_LABELS).map(([k, label]) => (
                        <label key={k} className="flex items-center gap-2 px-3 py-1.5 text-[13px] text-[#1D2939] hover:bg-[#F6F2EB] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isColVisible(colKey('log', k))}
                            onChange={() => toggleColVisible(colKey('log', k))}
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
                rows={logs}
                columns={logColumns}
                titulo="LOG DE COBRANÇAS"
                baseName="log-cobranca"
                disabled={loadingLogs || logs.length === 0}
              />
            </div>
          </div>
          <div className="bg-white overflow-x-auto">
            {loadingLogs ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 py-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            ) : logs.length === 0 ? (
              <p className="text-[13px] text-[#555] text-center py-6">Nenhum disparo registrado.</p>
            ) : (
              <>
              <table className="text-left" style={{ tableLayout: 'fixed', width: visibleLogCols.reduce((a, k) => a + (colWidths[colKey('log', k)] ?? LOG_COL_WIDTHS_DEFAULT[colKey('log', k)]), 0), minWidth: '100%' }}>
                <colgroup>
                  {LOG_COL_ORDER.map(k => (
                    <col key={k} className={isColVisible(colKey('log', k)) ? '' : 'hidden'} style={{ width: colWidths[colKey('log', k)] ?? LOG_COL_WIDTHS_DEFAULT[colKey('log', k)] }} />
                  ))}
                </colgroup>
                <thead>
                  <tr style={{ backgroundColor: '#000000' }}>
                    <th className={`text-[10px] font-bold text-white uppercase tracking-wider px-4 py-2.5 relative border-r border-white/10 ${isColVisible(colKey('log', 'datahora')) ? '' : 'hidden'}`}>
                      <span onMouseDown={startResize(colKey('log', 'datahora'))} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-white/20 z-10" title="Arraste para ajustar a largura" />
                      Data/hora
                    </th>
                    <th className={`text-[10px] font-bold text-white uppercase tracking-wider px-4 py-2.5 relative border-r border-white/10 ${isColVisible(colKey('log', 'cliente')) ? '' : 'hidden'}`}>
                      <span onMouseDown={startResize(colKey('log', 'cliente'))} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-white/20 z-10" title="Arraste para ajustar a largura" />
                      Cliente
                    </th>
                    <th className={`text-[10px] font-bold text-white uppercase tracking-wider px-4 py-2.5 relative border-r border-white/10 ${isColVisible(colKey('log', 'tipo')) ? '' : 'hidden'}`}>
                      <span onMouseDown={startResize(colKey('log', 'tipo'))} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-white/20 z-10" title="Arraste para ajustar a largura" />
                      Tipo
                    </th>
                    <th className={`text-[10px] font-bold text-white uppercase tracking-wider px-4 py-2.5 relative border-r border-white/10 ${isColVisible(colKey('log', 'status')) ? '' : 'hidden'}`}>
                      <span onMouseDown={startResize(colKey('log', 'status'))} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-white/20 z-10" title="Arraste para ajustar a largura" />
                      Status
                    </th>
                    <th className={`text-[10px] font-bold text-white uppercase tracking-wider px-4 py-2.5 relative ${isColVisible(colKey('log', 'regua')) ? '' : 'hidden'}`}>
                      Regua
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {logs.slice(logPage * PAGE_SIZE, (logPage + 1) * PAGE_SIZE).map(log => {
                    const tipoBadge = tipoBadgeColors(log.tipo_acao)
                    const stBadge = logStatusBadge(log.status)
                    return (
                      <tr key={log.id} className="border-b border-[#F1F3F5] hover:bg-[#F6F2EB]">
                        <td className={`px-4 py-1 text-[12px] text-[#555] truncate border-r border-[#F1F3F5] ${isColVisible(colKey('log', 'datahora')) ? '' : 'hidden'}`}>
                          {log.enviado_em ? format(parseISO(log.enviado_em), 'dd/MM/yy HH:mm') : '-'}
                        </td>
                        <td className={`px-4 py-1 text-[13px] font-medium text-[#1D2939] truncate border-r border-[#F1F3F5] ${isColVisible(colKey('log', 'cliente')) ? '' : 'hidden'}`} title={log.cliente_nome}>
                          {log.cliente_nome}
                        </td>
                        <td className={`px-4 py-1 border-r border-[#F1F3F5] ${isColVisible(colKey('log', 'tipo')) ? '' : 'hidden'}`}>
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border"
                            style={{ color: tipoBadge.text, backgroundColor: tipoBadge.bg, borderColor: tipoBadge.border }}
                          >
                            {tipoIcon(log.tipo_acao)}
                            {tipoLabel(log.tipo_acao)}
                          </span>
                        </td>
                        <td className={`px-4 py-1 border-r border-[#F1F3F5] ${isColVisible(colKey('log', 'status')) ? '' : 'hidden'}`}>
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded border"
                            style={{ color: stBadge.text, backgroundColor: stBadge.bg, borderColor: stBadge.border }}
                          >
                            {stBadge.label}
                          </span>
                        </td>
                        <td className={`px-4 py-1 text-[11px] text-[#555] truncate ${isColVisible(colKey('log', 'regua')) ? '' : 'hidden'}`} title={log.regua_nome}>
                          {log.regua_nome}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <TablePagination
                page={logPage}
                pageSize={PAGE_SIZE}
                total={logs.length}
                onPageChange={setLogPage}
              />
              </>
            )}
          </div>
        </div>

        </PagePanel>

        {/* ================================================================
           MODAL: Nova/Editar Regua
           ================================================================ */}
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-[640px] max-h-[90vh] overflow-y-auto mx-4">
              {/* Modal header */}
              <div className="bg-[#2A2724] px-5 py-3 flex items-center justify-between rounded-t-lg">
                <h3 className="text-[12px] font-bold text-white uppercase tracking-widest">
                  {editingRegua ? 'Editar Regua' : 'Nova Regua de Cobranca'}
                </h3>
                <button onClick={() => setModalOpen(false)} className="text-white/70 hover:text-white text-[18px] leading-none">
                  &times;
                </button>
              </div>

              <div className="p-5 flex flex-col gap-5">
                {/* Nome */}
                <div>
                  <label className="block text-[11px] font-semibold text-[#555] uppercase tracking-wider mb-1">
                    Nome da regua *
                  </label>
                  <input
                    type="text"
                    value={reguaNome}
                    onChange={e => setReguaNome(e.target.value)}
                    placeholder="Ex: Cobranca Padrao"
                    className="w-full border border-[#ccc] rounded-lg px-3 py-2 text-[13px] text-[#1D2939] outline-none focus:border-[#059669] transition-colors"
                  />
                </div>

                {/* Timeline de etapas */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-[11px] font-semibold text-[#555] uppercase tracking-wider">
                      Etapas da regua
                    </label>
                    <button
                      onClick={addEtapa}
                      className="flex items-center gap-1 text-[11px] font-semibold text-[#059669] hover:underline"
                    >
                      <Plus size={13} /> Adicionar etapa
                    </button>
                  </div>

                  {etapasForm.length === 0 ? (
                    <p className="text-[12px] text-[#999] text-center py-4">Nenhuma etapa. Clique em "+ Adicionar etapa".</p>
                  ) : (
                    <div className="relative pl-6">
                      {/* Vertical timeline line */}
                      <div
                        className="absolute left-[9px] top-2 bottom-2 w-[2px] bg-[#ccc]"
                      />

                      <div className="flex flex-col gap-4">
                        {etapasForm.map((etapa, index) => (
                          <div key={index} className="relative">
                            {/* Timeline dot */}
                            <div
                              className="absolute -left-6 top-3 w-[14px] h-[14px] rounded-full border-2 border-[#059669] bg-white z-10"
                              style={{
                                left: '-18px',
                              }}
                            />

                            <div className="border border-[#e5e5e5] rounded-lg p-3 bg-[#F6F2EB]">
                              {/* Header row: type selector + days + remove */}
                              <div className="flex items-start gap-3 mb-3">
                                {/* Tipo acao cards */}
                                <div className="flex gap-1.5">
                                  {(['email', 'whatsapp', 'sms'] as const).map(tipo => (
                                    <button
                                      key={tipo}
                                      onClick={() => updateEtapa(index, 'tipo_acao', tipo)}
                                      className="flex items-center gap-1 px-2.5 py-1.5 rounded text-[10px] font-semibold border transition-colors"
                                      style={{
                                        backgroundColor: etapa.tipo_acao === tipo ? tipoBadgeColors(tipo).bg : '#fff',
                                        borderColor: etapa.tipo_acao === tipo ? tipoBadgeColors(tipo).border : '#e5e5e5',
                                        color: etapa.tipo_acao === tipo ? tipoBadgeColors(tipo).text : '#999',
                                      }}
                                    >
                                      {tipoIcon(tipo)}
                                      {tipoLabel(tipo)}
                                    </button>
                                  ))}
                                </div>

                                {/* Dias input */}
                                <div className="flex items-center gap-1.5 ml-auto">
                                  <input
                                    type="number"
                                    value={etapa.dias_antes_vencimento}
                                    onChange={e => updateEtapa(index, 'dias_antes_vencimento', parseInt(e.target.value) || 0)}
                                    className="w-[60px] border border-[#ccc] rounded px-2 py-1 text-[12px] text-center outline-none focus:border-[#059669]"
                                  />
                                  <span className="text-[10px] text-[#555] whitespace-nowrap">
                                    {diasLabel(etapa.dias_antes_vencimento)}
                                  </span>
                                </div>

                                {/* Remove */}
                                <button
                                  onClick={() => removeEtapa(index)}
                                  className="text-[#E53E3E] hover:opacity-70 ml-1 mt-0.5"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>

                              {/* Template */}
                              <textarea
                                value={etapa.template_mensagem}
                                onChange={e => updateEtapa(index, 'template_mensagem', e.target.value)}
                                placeholder="Mensagem da cobranca. Use {nome}, {valor}, {data_vencimento}, {dias_atraso}..."
                                rows={2}
                                className="w-full border border-[#ccc] rounded px-3 py-2 text-[12px] text-[#1D2939] outline-none focus:border-[#059669] resize-none"
                              />

                              {/* Preview line */}
                              <p className="text-[10px] text-[#999] mt-1 truncate">
                                {tipoLabel(etapa.tipo_acao)} -- {diasLabel(etapa.dias_antes_vencimento)} -- "{etapa.template_mensagem.slice(0, 60)}{etapa.template_mensagem.length > 60 ? '...' : ''}"
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-2 border-t border-[#e5e5e5]">
                  <button
                    onClick={() => setModalOpen(false)}
                    className="flex-1 px-4 py-2 border border-[#ccc] rounded-lg text-[12px] font-semibold text-[#555] hover:bg-[#F6F2EB] transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || !reguaNome.trim() || etapasForm.length === 0}
                    className="flex-1 px-4 py-2 bg-[#059669] text-white rounded-lg text-[12px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {saving ? 'Salvando...' : editingRegua ? 'Salvar Alteracoes' : 'Criar Regua'}
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
