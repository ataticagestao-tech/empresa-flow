import { useEffect, useMemo, useState, useCallback } from 'react'
import { format, startOfMonth, endOfMonth, parseISO, isBefore, isToday, addMonths, subMonths } from 'date-fns'
import { ChevronLeft, ChevronRight, Pin, ExternalLink, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { formatBRL, formatData } from '@/lib/format'
import { EmptyState } from '@/components/ui/empty-state'

interface ContaPagar {
  id: string
  credor_nome: string
  valor: number
  valor_pago: number
  data_vencimento: string
  data_pagamento: string | null
  status: string
}

type StatusGroup = 'pago' | 'aberto' | 'vencido'

function classify(cp: ContaPagar): StatusGroup {
  if (cp.status === 'pago') return 'pago'
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const venc = parseISO(cp.data_vencimento)
  venc.setHours(0, 0, 0, 0)
  if (isBefore(venc, hoje) && !isToday(venc)) return 'vencido'
  return 'aberto'
}

const statusStyle: Record<StatusGroup, { label: string; bg: string; text: string }> = {
  pago: { label: 'Pago', bg: '#ECFDF3', text: '#039855' },
  aberto: { label: 'Pendente', bg: '#FFF0EB', text: '#EA580C' },
  vencido: { label: 'Atrasada', bg: '#FEE2E2', text: '#E53E3E' },
}

export default function ContasFixas() {
  const { selectedCompany } = useCompany()
  const { activeClient } = useAuth()
  const [loading, setLoading] = useState(true)
  const [contas, setContas] = useState<ContaPagar[]>([])
  const [refMes, setRefMes] = useState(new Date())

  const inicio = useMemo(() => format(startOfMonth(refMes), 'yyyy-MM-dd'), [refMes])
  const fim = useMemo(() => format(endOfMonth(refMes), 'yyyy-MM-dd'), [refMes])

  const load = useCallback(async () => {
    if (!selectedCompany) return
    setLoading(true)
    const db = activeClient as any
    const { data } = await db
      .from('contas_pagar')
      .select('id, credor_nome, valor, valor_pago, data_vencimento, data_pagamento, status')
      .eq('company_id', selectedCompany.id)
      .eq('is_fixed_cost', true)
      .is('deleted_at', null)
      .gte('data_vencimento', inicio)
      .lte('data_vencimento', fim)
      .order('data_vencimento', { ascending: true })
    setContas(data || [])
    setLoading(false)
  }, [selectedCompany, activeClient, inicio, fim])

  useEffect(() => { load() }, [load])

  const totals = useMemo(() => {
    let total = 0, pago = 0, aberto = 0, vencido = 0
    let countPago = 0, countAberto = 0, countVencido = 0
    for (const cp of contas) {
      total += cp.valor
      const g = classify(cp)
      if (g === 'pago') { pago += cp.valor; countPago++ }
      else if (g === 'aberto') { aberto += cp.valor; countAberto++ }
      else { vencido += cp.valor; countVencido++ }
    }
    return { total, pago, aberto, vencido, count: contas.length, countPago, countAberto, countVencido }
  }, [contas])

  return (
    <AppLayout>
      <div className="px-6 py-6 max-w-6xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="font-bold" style={{ fontSize: 22, color: '#1D2939', fontFamily: 'var(--font-display, "Plus Jakarta Sans", sans-serif)' }}>
              <Pin size={18} style={{ display: 'inline', marginRight: 6, color: '#059669' }} />
              Contas Fixas
            </h1>
            <p style={{ fontSize: 13, color: '#667085', marginTop: 4 }}>
              Despesas recorrentes do periodo. Marque uma conta como fixa em <Link to="/contas-pagar" style={{ color: '#059669', textDecoration: 'underline' }}>Contas a Pagar</Link>.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setRefMes(subMonths(refMes, 1))}
              className="p-2 rounded-[8px] hover:bg-[rgba(26,46,74,0.05)] transition"
              style={{ border: '1px solid rgba(26,46,74,0.18)' }}
            >
              <ChevronLeft size={16} color="#1D2939" />
            </button>
            <div className="px-4 py-2 rounded-[8px] text-[13px] font-semibold capitalize" style={{ backgroundColor: '#fff', border: '1px solid rgba(26,46,74,0.18)', color: '#1D2939', minWidth: 160, textAlign: 'center' }}>
              {format(refMes, 'MMMM/yyyy')}
            </div>
            <button
              onClick={() => setRefMes(addMonths(refMes, 1))}
              className="p-2 rounded-[8px] hover:bg-[rgba(26,46,74,0.05)] transition"
              style={{ border: '1px solid rgba(26,46,74,0.18)' }}
            >
              <ChevronRight size={16} color="#1D2939" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-6">
          <KpiCard label="Total estimado" value={totals.total} count={totals.count} accent="#1D2939" />
          <KpiCard label="Pagas" value={totals.pago} count={totals.countPago} accent="#039855" />
          <KpiCard label="Pendentes" value={totals.aberto} count={totals.countAberto} accent="#EA580C" />
          <KpiCard label="Atrasadas" value={totals.vencido} count={totals.countVencido} accent="#E53E3E" />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin" color="#059669" />
          </div>
        ) : contas.length === 0 ? (
          <EmptyState
            title="Nenhuma despesa fixa neste mes"
            description="Vá em Contas a Pagar e marque uma conta como Despesa fixa para que ela apareca aqui."
          />
        ) : (
          <div className="rounded-[10px] overflow-hidden" style={{ backgroundColor: '#fff', border: '1px solid rgba(26,46,74,0.10)' }}>
            <table className="w-full">
              <thead style={{ backgroundColor: 'rgba(26,46,74,0.04)' }}>
                <tr>
                  <th className="px-4 py-3 text-left text-[12px] font-semibold" style={{ color: '#667085' }}>Credor</th>
                  <th className="px-4 py-3 text-left text-[12px] font-semibold" style={{ color: '#667085' }}>Vencimento</th>
                  <th className="px-4 py-3 text-right text-[12px] font-semibold" style={{ color: '#667085' }}>Valor</th>
                  <th className="px-4 py-3 text-center text-[12px] font-semibold" style={{ color: '#667085' }}>Status</th>
                  <th className="px-4 py-3 text-right text-[12px] font-semibold" style={{ color: '#667085' }}></th>
                </tr>
              </thead>
              <tbody>
                {contas.map((cp) => {
                  const g = classify(cp)
                  const s = statusStyle[g]
                  return (
                    <tr key={cp.id} style={{ borderTop: '1px solid rgba(26,46,74,0.06)' }}>
                      <td className="px-4 py-3 text-[13px] font-medium" style={{ color: '#1D2939' }}>{cp.credor_nome}</td>
                      <td className="px-4 py-3 text-[13px]" style={{ color: '#667085' }}>{formatData(cp.data_vencimento)}</td>
                      <td className="px-4 py-3 text-[13px] text-right font-semibold" style={{ color: '#059669' }}>{formatBRL(cp.valor)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-block px-2 py-1 rounded-[6px] text-[11px] font-semibold" style={{ backgroundColor: s.bg, color: s.text }}>
                          {s.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/contas-pagar?highlight=${cp.id}`}
                          className="inline-flex items-center gap-1 text-[12px] font-medium hover:underline"
                          style={{ color: '#059669' }}
                        >
                          <ExternalLink size={12} /> Abrir
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  )
}

function KpiCard({ label, value, count, accent }: { label: string; value: number; count: number; accent: string }) {
  return (
    <div className="rounded-[10px] p-4" style={{ backgroundColor: '#fff', border: '1px solid rgba(26,46,74,0.10)' }}>
      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#667085' }}>{label}</p>
      <p className="font-bold mt-1" style={{ fontSize: 20, color: accent, fontFamily: 'var(--font-display, "Plus Jakarta Sans", sans-serif)' }}>
        {formatBRL(value)}
      </p>
      <p className="text-[11px] mt-1" style={{ color: '#667085' }}>{count} {count === 1 ? 'conta' : 'contas'}</p>
    </div>
  )
}
