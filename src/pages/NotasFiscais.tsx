import { useState, useEffect, useMemo, useCallback } from 'react'
import { format, startOfMonth, endOfMonth, addMonths, parseISO } from 'date-fns'
import {
  FileText, Plus, Search, Loader2, X, Download,
  Mail, MoreHorizontal, AlertTriangle, Check, Ban,
  Trash2, ChevronDown, RefreshCw
} from 'lucide-react'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { safeQuery } from '@/lib/supabaseQuery'
import { formatBRL, formatData, formatDoc } from '@/lib/format'
import { unmask } from '@/utils/masks'
import { AppLayout } from '@/components/layout/AppLayout'
import { toast } from 'sonner'

// ─── Types ──────────────────────────────────────────────────────────
interface NotaFiscal {
  id: string
  empresa_id: string
  certificado_id: string | null
  venda_id: string | null
  conta_receber_id: string | null
  tipo: 'nfe' | 'nfse' | 'nfce'
  numero: string | null
  serie: string | null
  data_emissao: string
  tomador_nome: string | null
  tomador_cpf_cnpj: string | null
  tomador_email: string | null
  tomador_municipio: string | null
  valor_servicos: number | null
  valor_produtos: number | null
  valor_total: number
  valor_desconto: number | null
  valor_iss: number | null
  valor_pis: number | null
  valor_cofins: number | null
  valor_irrf: number | null
  valor_csll: number | null
  aliquota_iss: number | null
  aliquota_efetiva: number | null
  chave_acesso: string | null
  protocolo_sefaz: string | null
  numero_rps: string | null
  codigo_verificacao: string | null
  xml_url: string | null
  danfe_url: string | null
  status: string
  motivo_cancelamento: string | null
  enviado_email: boolean | null
}

interface ItemNFSe {
  descricao: string
  cnae: string
  quantidade: number
  valor_unitario: number
  aliquota_iss: number | null
}

interface Empresa {
  id: string
  regime_tributario: string | null
  cnpj: string | null
  inscricao_municipal: string | null
  cidade: string | null
}

// ─── Status config ──────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  rascunho: { label: 'Rascunho', color: '#667085', bg: '#F3F4F6' },
  enviando: { label: 'Enviando', color: '#EA580C', bg: '#FFF0EB' },
  autorizada: { label: 'Autorizada', color: '#059669', bg: '#ECFDF3' },
  cancelada: { label: 'Cancelada', color: '#E53E3E', bg: '#FEE2E2' },
  denegada: { label: 'Denegada', color: '#E53E3E', bg: '#FEE2E2' },
  rejeitada: { label: 'Rejeitada', color: '#E53E3E', bg: '#FEE2E2' },
}

// ─── Helpers ────────────────────────────────────────────────────────
function calcularImpostosNFSe(regime: string | null, valorServicos: number): {
  aliquota_iss: number; valor_iss: number; valor_pis: number;
  valor_cofins: number; valor_irrf: number; valor_csll: number;
} {
  const result = {
    aliquota_iss: 0, valor_iss: 0, valor_pis: 0,
    valor_cofins: 0, valor_irrf: 0, valor_csll: 0,
  }

  if (regime === 'simples_nacional' || regime === 'mei') {
    result.aliquota_iss = 0.02
    result.valor_iss = valorServicos * 0.02
  } else if (regime === 'lucro_presumido') {
    result.aliquota_iss = 0.05
    result.valor_iss = valorServicos * 0.05
    result.valor_pis = valorServicos * 0.0065
    result.valor_cofins = valorServicos * 0.03
    result.valor_irrf = valorServicos * 0.015
    result.valor_csll = valorServicos * 0.01
  }

  return result
}

// ─── Component ──────────────────────────────────────────────────────
export default function NotasFiscais() {
  const { selectedCompany } = useCompany()
  const { activeClient } = useAuth()

  // Data
  const [notas, setNotas] = useState<NotaFiscal[]>([])
  const [empresa, setEmpresa] = useState<Empresa | null>(null)
  const [loading, setLoading] = useState(true)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [mesAno, setMesAno] = useState(() => format(new Date(), 'yyyy-MM'))

  // Modal
  const [showEmitirModal, setShowEmitirModal] = useState(false)
  const [showCancelarModal, setShowCancelarModal] = useState(false)
  const [cancelandoNf, setCancelendoNf] = useState<NotaFiscal | null>(null)
  const [motivoCancelamento, setMotivoCancelamento] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null)

  // Emissao form
  const emptyItem: ItemNFSe = { descricao: '', cnae: '', quantidade: 1, valor_unitario: 0, aliquota_iss: null }
  const [emitirForm, setEmitirForm] = useState({
    tomador_nome: '',
    tomador_cpf_cnpj: '',
    tomador_email: '',
    tomador_municipio: '',
    itens: [{ ...emptyItem }] as ItemNFSe[],
    enviar_email: true,
    venda_id: '',
    conta_receber_id: '',
  })

  // ─── Data Loading ───────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!selectedCompany) return
    setLoading(true)
    const db = activeClient as any

    const inicioMes = `${mesAno}-01`
    const fimMes = format(endOfMonth(parseISO(inicioMes)), 'yyyy-MM-dd')

    const [nfRes, empRes] = await Promise.all([
      db.from('notas_fiscais')
        .select('*')
        .eq('empresa_id', selectedCompany.id)
        .gte('data_emissao', inicioMes)
        .lte('data_emissao', fimMes)
        .order('data_emissao', { ascending: false }),
      db.from('empresas')
        .select('id, regime_tributario, cnpj, inscricao_municipal, cidade')
        .eq('id', selectedCompany.id)
        .maybeSingle(),
    ])

    setNotas(nfRes.data || [])
    setEmpresa(empRes.data || null)
    setLoading(false)
  }, [selectedCompany, activeClient, mesAno])

  useEffect(() => { loadData() }, [loadData])

  // ─── KPIs ─────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const autorizadas = notas.filter(n => n.status === 'autorizada')
    const totalEmitido = autorizadas.reduce((s, n) => s + (n.valor_total || 0), 0)
    const totalISS = autorizadas.reduce((s, n) => s + (n.valor_iss || 0), 0)
    return {
      total: notas.length,
      autorizadas: autorizadas.length,
      totalEmitido,
      totalISS,
    }
  }, [notas])

  // ─── Filtered ─────────────────────────────────────────────────────
  const filteredNotas = useMemo(() => {
    let list = notas
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      list = list.filter(n =>
        n.tomador_nome?.toLowerCase().includes(term) ||
        n.tomador_cpf_cnpj?.includes(term) ||
        n.numero?.includes(term)
      )
    }
    if (statusFilter !== 'todos') {
      list = list.filter(n => n.status === statusFilter)
    }
    return list
  }, [notas, searchTerm, statusFilter])

  // ─── Calcular totais do form ──────────────────────────────────────
  const formTotais = useMemo(() => {
    const valorServicos = emitirForm.itens.reduce((s, i) => s + (i.quantidade * i.valor_unitario), 0)
    const impostos = calcularImpostosNFSe(empresa?.regime_tributario || null, valorServicos)
    return { valorServicos, ...impostos }
  }, [emitirForm.itens, empresa])

  // ─── Emitir NFS-e ─────────────────────────────────────────────────
  const handleEmitir = async () => {
    if (!selectedCompany || !empresa) return
    if (!emitirForm.tomador_nome.trim()) {
      toast.error('Informe o nome do tomador')
      return
    }
    if (!emitirForm.tomador_cpf_cnpj.trim()) {
      toast.error('Informe o CPF/CNPJ do tomador')
      return
    }
    if (emitirForm.itens.length === 0 || emitirForm.itens.every(i => !i.descricao.trim())) {
      toast.error('Adicione pelo menos um item de servico')
      return
    }

    setSubmitting(true)
    const db = activeClient as any

    try {
      const valorServicos = formTotais.valorServicos
      const impostos = calcularImpostosNFSe(empresa.regime_tributario, valorServicos)

      // 1. INSERT nota fiscal (rascunho)
      const { data: nf, error } = await db.from('notas_fiscais').insert({
        empresa_id: selectedCompany.id,
        tipo: 'nfse',
        data_emissao: format(new Date(), 'yyyy-MM-dd'),
        tomador_nome: emitirForm.tomador_nome,
        tomador_cpf_cnpj: unmask(emitirForm.tomador_cpf_cnpj),
        tomador_email: emitirForm.tomador_email || null,
        tomador_municipio: emitirForm.tomador_municipio || null,
        valor_servicos: valorServicos,
        valor_total: valorServicos,
        valor_iss: impostos.valor_iss,
        valor_pis: impostos.valor_pis,
        valor_cofins: impostos.valor_cofins,
        valor_irrf: impostos.valor_irrf,
        valor_csll: impostos.valor_csll,
        aliquota_iss: impostos.aliquota_iss,
        status: 'rascunho',
        venda_id: emitirForm.venda_id || null,
        conta_receber_id: emitirForm.conta_receber_id || null,
      }).select().single()

      if (error) throw error

      // 2. INSERT itens
      if (nf) {
        const itensData = emitirForm.itens.filter(i => i.descricao.trim()).map(i => ({
          nota_fiscal_id: nf.id,
          descricao: i.descricao,
          cnae: i.cnae || null,
          quantidade: i.quantidade,
          valor_unitario: i.valor_unitario,
          valor_total: i.quantidade * i.valor_unitario,
          aliquota_iss: i.aliquota_iss ?? impostos.aliquota_iss,
        }))

        if (itensData.length > 0) {
          await db.from('nf_itens').insert(itensData)
        }
      }

      // 3. Enviar para Focus NF-e via Edge Function
      if (nf) {
        toast.info('Enviando para a prefeitura via Focus NF-e...')

        const { data: focusResult, error: focusError } = await db.functions.invoke('emitir-nfse', {
          body: {
            nota_fiscal_id: nf.id,
            empresa_id: selectedCompany.id,
            cnpj: empresa.cnpj || '',
            inscricao_municipal: empresa.inscricao_municipal || '',
            codigo_municipio: empresa.cidade || '',
            razao_social: '',
            tomador_nome: emitirForm.tomador_nome,
            tomador_cpf_cnpj: unmask(emitirForm.tomador_cpf_cnpj),
            tomador_email: emitirForm.tomador_email || undefined,
            itens: emitirForm.itens.filter(i => i.descricao.trim()),
            valor_servicos: valorServicos,
            valor_iss: impostos.valor_iss,
            aliquota_iss: impostos.aliquota_iss,
            enviar_email_tomador: emitirForm.enviar_email,
          },
        })

        if (focusError) {
          console.error('Focus NF-e error:', focusError)
          toast.error('NF salva como rascunho. Erro ao enviar para Focus: ' + focusError.message)
        } else if (focusResult?.sucesso) {
          toast.success(`NFS-e ${focusResult.status === 'autorizada' ? 'autorizada' : 'enviada'}!${focusResult.numero ? ` Numero: ${focusResult.numero}` : ''}`)
        } else {
          toast.error('NF salva. Focus retornou: ' + (focusResult?.erro || 'Erro desconhecido'))
        }
      }

      setShowEmitirModal(false)
      resetEmitirForm()
      loadData()
    } catch (err: any) {
      console.error('Erro ao emitir NFS-e:', err)
      toast.error(err.message || 'Erro ao emitir NFS-e')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Cancelar NF ──────────────────────────────────────────────────
  const handleCancelar = async () => {
    if (!cancelandoNf) return
    if (motivoCancelamento.length < 15) {
      toast.error('Motivo deve ter pelo menos 15 caracteres (exigencia SEFAZ)')
      return
    }

    setSubmitting(true)
    const db = activeClient as any

    try {
      // Cancelar via Edge Function (Focus NF-e)
      const { data: cancelResult, error: cancelError } = await db.functions.invoke('cancelar-nfse', {
        body: {
          nota_fiscal_id: cancelandoNf.id,
          motivo: motivoCancelamento,
        },
      })

      if (cancelError) {
        // Fallback: cancelar localmente se Edge Function falhar
        await db.from('notas_fiscais')
          .update({ status: 'cancelada', motivo_cancelamento: motivoCancelamento })
          .eq('id', cancelandoNf.id)
        toast.success('NF cancelada localmente (Focus NF-e indisponivel)')
      } else if (cancelResult?.sucesso) {
        toast.success('NF cancelada com sucesso')
      } else {
        throw new Error(cancelResult?.erro || 'Erro ao cancelar')
      }
      setShowCancelarModal(false)
      setCancelendoNf(null)
      setMotivoCancelamento('')
      loadData()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao cancelar NF')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Reenviar e-mail ──────────────────────────────────────────────
  const handleReenviarEmail = async (nf: NotaFiscal) => {
    if (!nf.tomador_email) {
      toast.error('Tomador sem e-mail cadastrado')
      return
    }
    toast.info('Funcionalidade de envio de e-mail sera integrada com o hub emissor (Focus NF-e)')
  }

  // ─── Helpers ──────────────────────────────────────────────────────
  const resetEmitirForm = () => {
    setEmitirForm({
      tomador_nome: '', tomador_cpf_cnpj: '', tomador_email: '',
      tomador_municipio: '', itens: [{ ...emptyItem }],
      enviar_email: true, venda_id: '', conta_receber_id: '',
    })
  }

  const addItem = () => {
    setEmitirForm(prev => ({ ...prev, itens: [...prev.itens, { ...emptyItem }] }))
  }

  const removeItem = (idx: number) => {
    setEmitirForm(prev => ({
      ...prev,
      itens: prev.itens.filter((_, i) => i !== idx),
    }))
  }

  const updateItem = (idx: number, field: keyof ItemNFSe, value: any) => {
    setEmitirForm(prev => ({
      ...prev,
      itens: prev.itens.map((item, i) => i === idx ? { ...item, [field]: value } : item),
    }))
  }

  // ─── Meses ────────────────────────────────────────────────────────
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
    <AppLayout title="Notas Fiscais">
      <div className="p-6 space-y-6">

        {/* ── KPIs ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total NFs', value: kpis.total, icon: FileText, color: '#059669' },
            { label: 'Autorizadas', value: kpis.autorizadas, icon: Check, color: '#059669' },
            { label: 'Total emitido', value: formatBRL(kpis.totalEmitido), icon: FileText, color: '#059669' },
            { label: 'ISS destacado', value: formatBRL(kpis.totalISS), icon: FileText, color: '#EA580C' },
          ].map((kpi, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: kpi.color + '12' }}>
                <kpi.icon size={20} style={{ color: kpi.color }} />
              </div>
              <div>
                <p className="text-xs text-gray-500">{kpi.label}</p>
                <p className="text-lg font-semibold" style={{ color: kpi.color }}>{kpi.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Toolbar ── */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => { resetEmitirForm(); setShowEmitirModal(true) }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
            style={{ backgroundColor: '#059669' }}
          >
            <Plus size={16} /> Emitir NFS-e
          </button>

          <div className="relative flex-1 max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar por tomador, numero..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <input
            type="month"
            value={mesAno}
            onChange={e => setMesAno(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
          />

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
          >
            <option value="todos">Todos status</option>
            <option value="autorizada">Autorizada</option>
            <option value="rascunho">Rascunho</option>
            <option value="enviando">Enviando</option>
            <option value="cancelada">Cancelada</option>
            <option value="rejeitada">Rejeitada</option>
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
          ) : filteredNotas.length === 0 ? (
            <div className="text-center py-20 text-gray-400 text-sm">
              Nenhuma nota fiscal encontrada
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase">
                    <th className="px-4 py-3">Numero</th>
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3">Tomador</th>
                    <th className="px-4 py-3 text-right">Valor</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-center">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredNotas.map(nf => {
                    const st = STATUS_CONFIG[nf.status] || STATUS_CONFIG.rascunho
                    return (
                      <tr key={nf.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3 font-medium">
                          {nf.numero ? `${nf.numero}/${nf.serie || '1'}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{formatData(nf.data_emissao)}</td>
                        <td className="px-4 py-3">
                          <div>{nf.tomador_nome || '—'}</div>
                          <div className="text-xs text-gray-400">{formatDoc(nf.tomador_cpf_cnpj)}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-medium">{formatBRL(nf.valor_total)}</td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{ color: st.color, backgroundColor: st.bg }}
                          >
                            {nf.status === 'autorizada' && <Check size={12} />}
                            {nf.status === 'enviando' && <Loader2 size={12} className="animate-spin" />}
                            {(nf.status === 'cancelada' || nf.status === 'rejeitada') && <Ban size={12} />}
                            {st.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1 relative">
                            {nf.danfe_url && (
                              <a
                                href={nf.danfe_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                                title="Download PDF"
                              >
                                <Download size={14} />
                              </a>
                            )}
                            {nf.xml_url && (
                              <a
                                href={nf.xml_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                                title="Download XML"
                              >
                                <FileText size={14} />
                              </a>
                            )}
                            <button
                              onClick={() => setDropdownOpen(dropdownOpen === nf.id ? null : nf.id)}
                              className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                            >
                              <MoreHorizontal size={14} />
                            </button>
                            {dropdownOpen === nf.id && (
                              <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px]">
                                {nf.status === 'autorizada' && (
                                  <>
                                    <button
                                      onClick={() => {
                                        handleReenviarEmail(nf)
                                        setDropdownOpen(null)
                                      }}
                                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                                    >
                                      <Mail size={14} /> Reenviar e-mail
                                    </button>
                                    <button
                                      onClick={() => {
                                        setCancelendoNf(nf)
                                        setMotivoCancelamento('')
                                        setShowCancelarModal(true)
                                        setDropdownOpen(null)
                                      }}
                                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 text-red-600"
                                    >
                                      <Ban size={14} /> Cancelar NF
                                    </button>
                                  </>
                                )}
                                {nf.status === 'rascunho' && (
                                  <button
                                    onClick={async () => {
                                      const db = activeClient as any
                                      await db.from('notas_fiscais').delete().eq('id', nf.id)
                                      toast.success('Rascunho excluido')
                                      setDropdownOpen(null)
                                      loadData()
                                    }}
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 text-red-600"
                                  >
                                    <Trash2 size={14} /> Excluir rascunho
                                  </button>
                                )}
                              </div>
                            )}
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
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          MODAL: Emitir NFS-e
         ═══════════════════════════════════════════════════════════════ */}
      {showEmitirModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-800">Emitir NFS-e</h2>
              <button onClick={() => setShowEmitirModal(false)} className="p-1 rounded hover:bg-gray-100">
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Dados do tomador */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Dados do Tomador</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">CPF/CNPJ *</label>
                    <input
                      type="text"
                      value={emitirForm.tomador_cpf_cnpj}
                      onChange={e => setEmitirForm(prev => ({ ...prev, tomador_cpf_cnpj: e.target.value }))}
                      placeholder="000.000.000-00"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Nome / Razao Social *</label>
                    <input
                      type="text"
                      value={emitirForm.tomador_nome}
                      onChange={e => setEmitirForm(prev => ({ ...prev, tomador_nome: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">E-mail</label>
                    <input
                      type="email"
                      value={emitirForm.tomador_email}
                      onChange={e => setEmitirForm(prev => ({ ...prev, tomador_email: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Municipio</label>
                    <input
                      type="text"
                      value={emitirForm.tomador_municipio}
                      onChange={e => setEmitirForm(prev => ({ ...prev, tomador_municipio: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>
              </div>

              {/* Itens / Servicos */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">Servicos</h3>
                  <button
                    onClick={addItem}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                  >
                    <Plus size={14} /> Adicionar item
                  </button>
                </div>
                <div className="space-y-3">
                  {emitirForm.itens.map((item, idx) => (
                    <div key={idx} className="border border-gray-100 rounded-lg p-3 space-y-2 relative">
                      {emitirForm.itens.length > 1 && (
                        <button
                          onClick={() => removeItem(idx)}
                          className="absolute top-2 right-2 p-1 rounded hover:bg-gray-100"
                        >
                          <X size={14} className="text-gray-400" />
                        </button>
                      )}
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Descricao *</label>
                        <input
                          type="text"
                          value={item.descricao}
                          onChange={e => updateItem(idx, 'descricao', e.target.value)}
                          placeholder="Descricao do servico"
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">CNAE</label>
                          <input
                            type="text"
                            value={item.cnae}
                            onChange={e => updateItem(idx, 'cnae', e.target.value)}
                            placeholder="8630-5/01"
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Quantidade</label>
                          <input
                            type="number"
                            min={1}
                            value={item.quantidade}
                            onChange={e => updateItem(idx, 'quantidade', parseFloat(e.target.value) || 1)}
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Valor unit.</label>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={item.valor_unitario}
                            onChange={e => updateItem(idx, 'valor_unitario', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                          />
                        </div>
                      </div>
                      <div className="text-xs text-gray-500">
                        ISS calculado: {formatBRL(
                          (item.quantidade * item.valor_unitario) *
                          (item.aliquota_iss ?? formTotais.aliquota_iss)
                        )} ({((item.aliquota_iss ?? formTotais.aliquota_iss) * 100).toFixed(0)}%)
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totais */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Total de servicos:</span>
                  <span className="font-medium">{formatBRL(formTotais.valorServicos)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">ISS:</span>
                  <span>{formatBRL(formTotais.valor_iss)}</span>
                </div>
                {formTotais.valor_pis > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">PIS:</span>
                    <span>{formatBRL(formTotais.valor_pis)}</span>
                  </div>
                )}
                {formTotais.valor_cofins > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">COFINS:</span>
                    <span>{formatBRL(formTotais.valor_cofins)}</span>
                  </div>
                )}
                {formTotais.valor_irrf > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">IRRF:</span>
                    <span>{formatBRL(formTotais.valor_irrf)}</span>
                  </div>
                )}
                {formTotais.valor_csll > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">CSLL:</span>
                    <span>{formatBRL(formTotais.valor_csll)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-gray-200 font-semibold">
                  <span>Total da NF:</span>
                  <span>{formatBRL(formTotais.valorServicos)}</span>
                </div>
              </div>

              {/* Enviar email */}
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={emitirForm.enviar_email}
                  onChange={e => setEmitirForm(prev => ({ ...prev, enviar_email: e.target.checked }))}
                  className="rounded border-gray-300"
                />
                Enviar NFS-e por e-mail para o tomador
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button
                onClick={() => setShowEmitirModal(false)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleEmitir}
                disabled={submitting}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: '#059669' }}
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                Emitir NFS-e
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          MODAL: Cancelar NF
         ═══════════════════════════════════════════════════════════════ */}
      {showCancelarModal && cancelandoNf && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-800">Cancelar NF</h2>
              <button onClick={() => setShowCancelarModal(false)} className="p-1 rounded hover:bg-gray-100">
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg">
                <AlertTriangle size={20} className="text-red-500 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-red-700">
                  <p className="font-medium">Atencao!</p>
                  <p>O cancelamento de NF e irreversivel. Informe o motivo com pelo menos 15 caracteres.</p>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">NF: {cancelandoNf.numero || '—'} — {cancelandoNf.tomador_nome}</label>
                <textarea
                  value={motivoCancelamento}
                  onChange={e => setMotivoCancelamento(e.target.value)}
                  rows={3}
                  placeholder="Motivo do cancelamento (min. 15 caracteres)"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 resize-none"
                />
                <p className="text-xs text-gray-400 mt-1">{motivoCancelamento.length}/15 caracteres</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button
                onClick={() => setShowCancelarModal(false)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
              >
                Voltar
              </button>
              <button
                onClick={handleCancelar}
                disabled={submitting || motivoCancelamento.length < 15}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium bg-red-600 hover:bg-red-700 disabled:opacity-50"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
                Confirmar cancelamento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Click-outside handler for dropdowns */}
      {dropdownOpen && (
        <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(null)} />
      )}
    </AppLayout>
  )
}
