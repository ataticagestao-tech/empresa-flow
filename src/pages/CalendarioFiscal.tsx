import { useState, useEffect, useMemo, useCallback } from 'react'
import { format, startOfMonth, endOfMonth, addMonths, subMonths, eachDayOfInterval, getDay, isSameDay, isBefore, isToday, parseISO, addDays } from 'date-fns'
import {
  Calendar, ChevronLeft, ChevronRight, Loader2, Check,
  AlertTriangle, Clock, Shield, RefreshCw, X, Upload
} from 'lucide-react'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { formatData } from '@/lib/format'
import { AppLayout } from '@/components/layout/AppLayout'
import { toast } from 'sonner'

// ─── Types ──────────────────────────────────────────────────────────
interface ObrigacaoCalendario {
  empresa_id: string
  modulo: string
  competencia: string | null
  data_vencimento: string
  status: string
  descricao: string
}

interface Obrigacao {
  id: string
  empresa_id: string
  tipo: string
  competencia: string | null
  descricao: string
  data_vencimento: string
  status: string
  responsavel: string | null
  arquivo_url: string | null
  protocolo: string | null
  entregue_em: string | null
}

interface Certificado {
  id: string
  empresa_id: string
  tipo: string | null
  titular: string | null
  cnpj_titular: string | null
  data_emissao: string | null
  data_validade: string | null
  status: string | null
  alerta_30d: boolean | null
  alerta_60d: boolean | null
}

// ─── Status config ──────────────────────────────────────────────────
const STATUS_BADGE: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  pendente: { label: 'Pendente', color: '#F79009', bg: '#FFFAEB', icon: Clock },
  entregue: { label: 'Entregue', color: '#059669', bg: '#ECFDF3', icon: Check },
  atrasado: { label: 'Atrasado', color: '#D92D20', bg: '#FEF3F2', icon: AlertTriangle },
  pago: { label: 'Pago', color: '#059669', bg: '#ECFDF3', icon: Check },
  apurado: { label: 'Apurado', color: '#059669', bg: '#ECFDF3', icon: Check },
}

// ─── Component ──────────────────────────────────────────────────────
export default function CalendarioFiscal() {
  const { selectedCompany } = useCompany()
  const { activeClient } = useAuth()

  const [eventos, setEventos] = useState<ObrigacaoCalendario[]>([])
  const [obrigacoes, setObrigacoes] = useState<Obrigacao[]>([])
  const [certificado, setCertificado] = useState<Certificado | null>(null)
  const [loading, setLoading] = useState(true)
  const [mesAtual, setMesAtual] = useState(new Date())
  const [submitting, setSubmitting] = useState(false)

  // Modal
  const [showEntregarModal, setShowEntregarModal] = useState(false)
  const [entregarObrigacao, setEntregarObrigacao] = useState<Obrigacao | null>(null)
  const [entregarForm, setEntregarForm] = useState({ protocolo: '', arquivo_url: '' })

  // ─── Data Loading ───────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!selectedCompany) return
    setLoading(true)
    const db = activeClient as any

    const inicioMes = format(startOfMonth(mesAtual), 'yyyy-MM-dd')
    const fimMes = format(endOfMonth(mesAtual), 'yyyy-MM-dd')
    const competencia = format(mesAtual, 'yyyy-MM')

    const [calRes, obRes, certRes] = await Promise.all([
      db.from('v_calendario_fiscal')
        .select('*')
        .eq('empresa_id', selectedCompany.id)
        .gte('data_vencimento', inicioMes)
        .lte('data_vencimento', fimMes)
        .order('data_vencimento', { ascending: true }),
      db.from('obrigacoes_acessorias')
        .select('*')
        .eq('empresa_id', selectedCompany.id)
        .gte('data_vencimento', inicioMes)
        .lte('data_vencimento', fimMes)
        .order('data_vencimento', { ascending: true }),
      db.from('certificados_digitais')
        .select('*')
        .eq('empresa_id', selectedCompany.id)
        .eq('status', 'ativo')
        .order('data_validade', { ascending: true })
        .limit(1)
        .maybeSingle(),
    ])

    setEventos(calRes.data || [])
    setObrigacoes(obRes.data || [])
    setCertificado(certRes.data || null)
    setLoading(false)
  }, [selectedCompany, activeClient, mesAtual])

  useEffect(() => { loadData() }, [loadData])

  // ─── Calendar grid ────────────────────────────────────────────────
  const calendarDays = useMemo(() => {
    const inicio = startOfMonth(mesAtual)
    const fim = endOfMonth(mesAtual)
    const dias = eachDayOfInterval({ start: inicio, end: fim })

    // Pad start with empty days (week starts on Monday)
    const startDay = getDay(inicio) // 0=Sun, 1=Mon...
    const padStart = startDay === 0 ? 6 : startDay - 1
    const padded: (Date | null)[] = Array(padStart).fill(null).concat(dias)

    return padded
  }, [mesAtual])

  const eventosPorDia = useMemo(() => {
    const map = new Map<string, ObrigacaoCalendario[]>()
    for (const ev of eventos) {
      const key = ev.data_vencimento?.split('T')[0] || ''
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(ev)
    }
    return map
  }, [eventos])

  // ─── Proximos vencimentos ─────────────────────────────────────────
  const proximosVencimentos = useMemo(() => {
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    return eventos
      .filter(ev => {
        const d = parseISO(ev.data_vencimento)
        return !isBefore(d, hoje) || ev.status === 'pendente'
      })
      .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento))
  }, [eventos])

  // ─── Marcar entregue ──────────────────────────────────────────────
  const handleMarcarEntregue = async () => {
    if (!entregarObrigacao) return
    setSubmitting(true)
    const db = activeClient as any

    try {
      const { error } = await db.from('obrigacoes_acessorias')
        .update({
          status: 'entregue',
          protocolo: entregarForm.protocolo || null,
          arquivo_url: entregarForm.arquivo_url || null,
          entregue_em: new Date().toISOString(),
        })
        .eq('id', entregarObrigacao.id)

      if (error) throw error

      toast.success('Obrigacao marcada como entregue')
      setShowEntregarModal(false)
      setEntregarObrigacao(null)
      loadData()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao marcar obrigacao')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Criticidade ──────────────────────────────────────────────────
  const getCriticidade = (dataVenc: string) => {
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const venc = parseISO(dataVenc)
    venc.setHours(0, 0, 0, 0)

    if (isBefore(venc, hoje)) return { color: '#D92D20', label: 'Vencido' }
    const diff = Math.ceil((venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
    if (diff <= 5) return { color: '#F79009', label: `${diff} dias` }
    return { color: '#059669', label: 'OK' }
  }

  // ─── Certificado status ───────────────────────────────────────────
  const certStatus = useMemo(() => {
    if (!certificado?.data_validade) return null
    const hoje = new Date()
    const validade = parseISO(certificado.data_validade)
    const diff = Math.ceil((validade.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))

    if (diff <= 0) return { label: 'Expirado', color: '#D92D20', bg: '#FEF3F2', dias: diff }
    if (diff <= 30) return { label: 'Vencendo', color: '#F79009', bg: '#FFFAEB', dias: diff }
    if (diff <= 60) return { label: 'Atencao', color: '#F79009', bg: '#FFFAEB', dias: diff }
    return { label: 'Valido', color: '#059669', bg: '#ECFDF3', dias: diff }
  }, [certificado])

  const DIAS_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom']
  const MESES = [
    'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ]

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <AppLayout title="Calendario Fiscal">
      <div className="p-6 space-y-6">

        {/* ── Certificado digital alert ── */}
        {certificado && certStatus && certStatus.dias <= 60 && (
          <div
            className="flex items-center gap-3 p-4 rounded-xl border"
            style={{ backgroundColor: certStatus.bg, borderColor: certStatus.color + '30' }}
          >
            <Shield size={20} style={{ color: certStatus.color }} />
            <div className="flex-1">
              <p className="text-sm font-medium" style={{ color: certStatus.color }}>
                Certificado digital — {certStatus.label}
              </p>
              <p className="text-xs text-gray-600">
                {certificado.titular} — Validade: {formatData(certificado.data_validade)}
                {certStatus.dias > 0 ? ` (${certStatus.dias} dias restantes)` : ' (expirado)'}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Calendario ── */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 p-4">
            {/* Nav mes */}
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setMesAtual(m => subMonths(m, 1))} className="p-2 rounded-lg hover:bg-gray-50">
                <ChevronLeft size={16} className="text-gray-500" />
              </button>
              <h2 className="text-base font-semibold text-gray-800">
                {MESES[mesAtual.getMonth()]} {mesAtual.getFullYear()}
              </h2>
              <button onClick={() => setMesAtual(m => addMonths(m, 1))} className="p-2 rounded-lg hover:bg-gray-50">
                <ChevronRight size={16} className="text-gray-500" />
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="animate-spin text-gray-400" size={24} />
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {DIAS_SEMANA.map(d => (
                    <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
                  ))}
                </div>

                {/* Days */}
                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((dia, idx) => {
                    if (!dia) return <div key={`pad-${idx}`} className="h-16" />

                    const key = format(dia, 'yyyy-MM-dd')
                    const evsDia = eventosPorDia.get(key) || []
                    const hoje = isToday(dia)

                    return (
                      <div
                        key={key}
                        className={`h-16 rounded-lg p-1 text-xs transition-colors ${
                          hoje ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className={`font-medium ${hoje ? 'text-blue-600' : 'text-gray-700'}`}>
                          {dia.getDate()}
                        </div>
                        <div className="space-y-0.5 mt-0.5">
                          {evsDia.slice(0, 2).map((ev, i) => {
                            const crit = getCriticidade(ev.data_vencimento)
                            return (
                              <div
                                key={i}
                                className="truncate px-1 py-0.5 rounded text-[10px] font-medium"
                                style={{ backgroundColor: crit.color + '15', color: crit.color }}
                                title={ev.descricao}
                              >
                                {ev.descricao.length > 12 ? ev.descricao.slice(0, 12) + '...' : ev.descricao}
                              </div>
                            )
                          })}
                          {evsDia.length > 2 && (
                            <div className="text-[10px] text-gray-400 px-1">+{evsDia.length - 2}</div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          {/* ── Proximos vencimentos ── */}
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Proximos vencimentos</h3>

            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="animate-spin text-gray-400" size={20} />
              </div>
            ) : proximosVencimentos.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-10">Nenhuma obrigacao no periodo</p>
            ) : (
              <div className="space-y-3">
                {proximosVencimentos.map((ev, idx) => {
                  const crit = getCriticidade(ev.data_vencimento)
                  const st = STATUS_BADGE[ev.status] || STATUS_BADGE.pendente
                  const obrig = obrigacoes.find(o =>
                    o.data_vencimento === ev.data_vencimento && o.descricao === ev.descricao
                  )

                  return (
                    <div key={idx} className="flex items-start gap-3 p-3 rounded-lg border border-gray-50 hover:border-gray-200 transition-colors">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold"
                        style={{ backgroundColor: crit.color + '12', color: crit.color }}
                      >
                        {ev.data_vencimento.split('-')[2]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-700 truncate">{ev.descricao}</p>
                        <p className="text-xs text-gray-400">{formatData(ev.data_vencimento)}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
                          style={{ color: st.color, backgroundColor: st.bg }}
                        >
                          {st.label}
                        </span>
                        {ev.status === 'pendente' && obrig && (
                          <button
                            onClick={() => {
                              setEntregarObrigacao(obrig)
                              setEntregarForm({ protocolo: '', arquivo_url: '' })
                              setShowEntregarModal(true)
                            }}
                            className="text-[10px] px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium"
                          >
                            Entregar
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Certificado info */}
            {certificado && (
              <div className="mt-6 pt-4 border-t border-gray-100">
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Certificado Digital</h4>
                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Titular:</span>
                    <span className="font-medium text-gray-700 truncate ml-2">{certificado.titular || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Validade:</span>
                    <span className="font-medium">{formatData(certificado.data_validade)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Status:</span>
                    {certStatus && (
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ color: certStatus.color, backgroundColor: certStatus.bg }}
                      >
                        {certStatus.label}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          MODAL: Marcar obrigacao entregue
         ═══════════════════════════════════════════════════════════════ */}
      {showEntregarModal && entregarObrigacao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-800">Marcar como entregue</h2>
              <button onClick={() => setShowEntregarModal(false)} className="p-1 rounded hover:bg-gray-100">
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <p className="font-medium text-gray-700">{entregarObrigacao.descricao}</p>
                <p className="text-gray-500 text-xs mt-1">Vencimento: {formatData(entregarObrigacao.data_vencimento)}</p>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Protocolo de entrega</label>
                <input
                  type="text"
                  value={entregarForm.protocolo}
                  onChange={e => setEntregarForm(prev => ({ ...prev, protocolo: e.target.value }))}
                  placeholder="Numero do protocolo (opcional)"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">URL do comprovante</label>
                <input
                  type="text"
                  value={entregarForm.arquivo_url}
                  onChange={e => setEntregarForm(prev => ({ ...prev, arquivo_url: e.target.value }))}
                  placeholder="Link do arquivo (opcional)"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button
                onClick={() => setShowEntregarModal(false)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleMarcarEntregue}
                disabled={submitting}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: '#059669' }}
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Confirmar entrega
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
