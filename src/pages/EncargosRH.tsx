import { useState, useEffect, useMemo, useCallback } from 'react'
import { format, addMonths } from 'date-fns'
import {
  Calculator, Loader2, RefreshCw, Check, AlertTriangle,
  ChevronLeft, ChevronRight, DollarSign, FileText, ExternalLink
} from 'lucide-react'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { formatBRL, formatData } from '@/lib/format'
import { AppLayout } from '@/components/layout/AppLayout'
import { toast } from 'sonner'

// ─── Types ──────────────────────────────────────────────────────────
interface Encargo {
  id: string
  empresa_id: string
  competencia: string
  fgts_total: number
  fgts_multa: number
  inss_patronal: number
  inss_funcionarios: number
  inss_total: number | null
  irrf_retido: number
  rat_fap: number
  total_encargos: number
  data_venc_fgts: string | null
  data_venc_inss: string | null
  data_venc_irrf: string | null
  status_fgts: string
  status_inss: string
  status_irrf: string
  guia_fgts_url: string | null
  guia_inss_url: string | null
  guia_irrf_url: string | null
  cp_fgts_id: string | null
  cp_inss_id: string | null
  cp_irrf_id: string | null
}

const STATUS_GUIA: Record<string, { label: string; color: string; bg: string }> = {
  pendente: { label: 'Pendente', color: '#F79009', bg: '#FFFAEB' },
  recolhido: { label: 'Recolhido', color: '#059669', bg: '#ECFDF3' },
  atrasado: { label: 'Atrasado', color: '#D92D20', bg: '#FEF3F2' },
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]

// ─── Component ──────────────────────────────────────────────────────
export default function EncargosRH() {
  const { selectedCompany } = useCompany()
  const { activeClient } = useAuth()

  const [encargos, setEncargos] = useState<Encargo[]>([])
  const [loading, setLoading] = useState(true)
  const [calculating, setCalculating] = useState(false)
  const [selectedAno, setSelectedAno] = useState(new Date().getFullYear())

  // ─── Data Loading ───────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!selectedCompany) return
    setLoading(true)
    const db = activeClient as any

    const { data } = await db.from('encargos')
      .select('*')
      .eq('empresa_id', selectedCompany.id)
      .gte('competencia', `${selectedAno}-01`)
      .lte('competencia', `${selectedAno}-12`)
      .order('competencia', { ascending: true })

    setEncargos(data || [])
    setLoading(false)
  }, [selectedCompany, activeClient, selectedAno])

  useEffect(() => { loadData() }, [loadData])

  // ─── KPIs ─────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const totalFGTS = encargos.reduce((s, e) => s + (e.fgts_total || 0), 0)
    const totalINSS = encargos.reduce((s, e) => s + (e.inss_total || e.inss_patronal + e.inss_funcionarios || 0), 0)
    const totalIRRF = encargos.reduce((s, e) => s + (e.irrf_retido || 0), 0)
    const totalGeral = encargos.reduce((s, e) => s + (e.total_encargos || 0), 0)
    return { totalFGTS, totalINSS, totalIRRF, totalGeral }
  }, [encargos])

  // ─── Calcular encargos do mes ─────────────────────────────────────
  const calcularEncargos = async (competencia: string) => {
    if (!selectedCompany) return
    setCalculating(true)
    const db = activeClient as any

    try {
      // Buscar folhas do mes
      const { data: folhas } = await db.from('folha_pagamento')
        .select('total_proventos, inss_funcionario, irrf, fgts_mes, inss_patronal')
        .eq('empresa_id', selectedCompany.id)
        .eq('competencia', competencia)
        .eq('tipo', 'mensal')

      if (!folhas || folhas.length === 0) {
        toast.error('Nenhuma folha encontrada para esta competencia. Calcule a folha primeiro.')
        setCalculating(false)
        return
      }

      const fgtsTotal = folhas.reduce((s: number, f: any) => s + (f.fgts_mes || 0), 0)
      const inssPatronal = folhas.reduce((s: number, f: any) => s + (f.inss_patronal || 0), 0)
      const inssFuncionarios = folhas.reduce((s: number, f: any) => s + (f.inss_funcionario || 0), 0)
      const irrfRetido = folhas.reduce((s: number, f: any) => s + (f.irrf || 0), 0)
      const totalProventos = folhas.reduce((s: number, f: any) => s + (f.total_proventos || 0), 0)
      const ratFap = Math.round(totalProventos * 0.02 * 100) / 100 // RAT 2% padrao
      const totalEncargos = Math.round((fgtsTotal + inssPatronal + inssFuncionarios + irrfRetido + ratFap) * 100) / 100

      // Vencimentos
      const [ano, mes] = competencia.split('-').map(Number)
      const proxMes = addMonths(new Date(ano, mes - 1, 1), 1)
      const dataVencFgts = format(new Date(proxMes.getFullYear(), proxMes.getMonth(), 7), 'yyyy-MM-dd')
      const dataVencInss = format(new Date(proxMes.getFullYear(), proxMes.getMonth(), 20), 'yyyy-MM-dd')
      const dataVencIrrf = format(new Date(proxMes.getFullYear(), proxMes.getMonth(), 20), 'yyyy-MM-dd')

      const payload = {
        empresa_id: selectedCompany.id,
        competencia,
        fgts_total: Math.round(fgtsTotal * 100) / 100,
        inss_patronal: Math.round(inssPatronal * 100) / 100,
        inss_funcionarios: Math.round(inssFuncionarios * 100) / 100,
        irrf_retido: Math.round(irrfRetido * 100) / 100,
        rat_fap: ratFap,
        total_encargos: totalEncargos,
        data_venc_fgts: dataVencFgts,
        data_venc_inss: dataVencInss,
        data_venc_irrf: dataVencIrrf,
      }

      // Upsert
      const { data: existing } = await db.from('encargos')
        .select('id')
        .eq('empresa_id', selectedCompany.id)
        .eq('competencia', competencia)
        .maybeSingle()

      if (existing) {
        await db.from('encargos').update(payload).eq('id', existing.id)
      } else {
        await db.from('encargos').insert(payload)
      }

      // Gerar CPs
      const cpItems = [
        { nome: 'FGTS', valor: fgtsTotal, venc: dataVencFgts },
        { nome: 'INSS', valor: inssPatronal + inssFuncionarios, venc: dataVencInss },
        { nome: 'IRRF', valor: irrfRetido, venc: dataVencIrrf },
      ]

      for (const item of cpItems) {
        if (item.valor <= 0) continue
        const desc = `${item.nome} - ${competencia}`
        const { data: cpExist } = await db.from('contas_pagar')
          .select('id')
          .eq('company_id', selectedCompany.id)
          .eq('descricao', desc)
          .maybeSingle()

        if (!cpExist) {
          await db.from('contas_pagar').insert({
            company_id: selectedCompany.id,
            credor_nome: item.nome === 'FGTS' ? 'Caixa Economica Federal' : 'Receita Federal',
            descricao: desc,
            valor: Math.round(item.valor * 100) / 100,
            data_vencimento: item.venc,
            status: 'aberto',
            competencia,
          })
        }
      }

      toast.success(`Encargos ${competencia} calculados: ${formatBRL(totalEncargos)}`)
      loadData()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao calcular encargos')
    } finally {
      setCalculating(false)
    }
  }

  // ─── Marcar recolhido ─────────────────────────────────────────────
  const marcarRecolhido = async (encargoId: string, tipo: 'fgts' | 'inss' | 'irrf') => {
    const db = activeClient as any
    const field = `status_${tipo}`
    const { error } = await db.from('encargos').update({ [field]: 'recolhido' }).eq('id', encargoId)
    if (error) toast.error('Erro ao atualizar')
    else { toast.success(`${tipo.toUpperCase()} marcado como recolhido`); loadData() }
  }

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <AppLayout title="Encargos Trabalhistas">
      <div className="p-6 space-y-6">

        {/* ── KPIs ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'FGTS total', value: formatBRL(kpis.totalFGTS), icon: DollarSign, color: '#1E3A8A' },
            { label: 'INSS total', value: formatBRL(kpis.totalINSS), icon: Calculator, color: '#F79009' },
            { label: 'IRRF retido', value: formatBRL(kpis.totalIRRF), icon: Calculator, color: '#D92D20' },
            { label: 'Total encargos', value: formatBRL(kpis.totalGeral), icon: DollarSign, color: '#1E3A8A' },
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

        {/* ── Ano selector ── */}
        <div className="flex items-center gap-2">
          <button onClick={() => setSelectedAno(a => a - 1)} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
            <ChevronLeft size={16} className="text-gray-500" />
          </button>
          <span className="text-sm font-medium text-gray-700 min-w-[60px] text-center">{selectedAno}</span>
          <button onClick={() => setSelectedAno(a => a + 1)} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
            <ChevronRight size={16} className="text-gray-500" />
          </button>
        </div>

        {/* ── Grid mensal ── */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-gray-400" size={24} />
          </div>
        ) : (
          <div className="space-y-4">
            {MESES.map((mes, idx) => {
              const comp = `${selectedAno}-${String(idx + 1).padStart(2, '0')}`
              const enc = encargos.find(e => e.competencia === comp)

              return (
                <div key={comp} className="bg-white rounded-xl border border-gray-100 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-700">{mes} {selectedAno}</h3>
                    {!enc && (
                      <button
                        onClick={() => calcularEncargos(comp)}
                        disabled={calculating}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50"
                        style={{ backgroundColor: '#1E3A8A' }}
                      >
                        {calculating ? <Loader2 size={12} className="animate-spin" /> : <Calculator size={12} />}
                        Calcular
                      </button>
                    )}
                  </div>

                  {enc ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* FGTS */}
                      <div className="border border-gray-50 rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-blue-700">FGTS</span>
                          <span
                            className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                            style={{ ...STATUS_GUIA[enc.status_fgts] && { color: STATUS_GUIA[enc.status_fgts].color, backgroundColor: STATUS_GUIA[enc.status_fgts].bg } }}
                          >
                            {STATUS_GUIA[enc.status_fgts]?.label || enc.status_fgts}
                          </span>
                        </div>
                        <p className="text-base font-semibold">{formatBRL(enc.fgts_total)}</p>
                        <p className="text-xs text-gray-400">Venc: {formatData(enc.data_venc_fgts)}</p>
                        {enc.status_fgts === 'pendente' && (
                          <button
                            onClick={() => marcarRecolhido(enc.id, 'fgts')}
                            className="text-[10px] px-2 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 font-medium"
                          >
                            Marcar recolhido
                          </button>
                        )}
                      </div>

                      {/* INSS */}
                      <div className="border border-gray-50 rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-orange-700">INSS</span>
                          <span
                            className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                            style={{ ...STATUS_GUIA[enc.status_inss] && { color: STATUS_GUIA[enc.status_inss].color, backgroundColor: STATUS_GUIA[enc.status_inss].bg } }}
                          >
                            {STATUS_GUIA[enc.status_inss]?.label || enc.status_inss}
                          </span>
                        </div>
                        <p className="text-base font-semibold">{formatBRL((enc.inss_total ?? enc.inss_patronal + enc.inss_funcionarios))}</p>
                        <p className="text-[10px] text-gray-400">Patronal: {formatBRL(enc.inss_patronal)} | Func: {formatBRL(enc.inss_funcionarios)}</p>
                        <p className="text-xs text-gray-400">Venc: {formatData(enc.data_venc_inss)}</p>
                        {enc.status_inss === 'pendente' && (
                          <button
                            onClick={() => marcarRecolhido(enc.id, 'inss')}
                            className="text-[10px] px-2 py-1 rounded bg-orange-50 text-orange-600 hover:bg-orange-100 font-medium"
                          >
                            Marcar recolhido
                          </button>
                        )}
                      </div>

                      {/* IRRF */}
                      <div className="border border-gray-50 rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-red-700">IRRF</span>
                          <span
                            className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                            style={{ ...STATUS_GUIA[enc.status_irrf] && { color: STATUS_GUIA[enc.status_irrf].color, backgroundColor: STATUS_GUIA[enc.status_irrf].bg } }}
                          >
                            {STATUS_GUIA[enc.status_irrf]?.label || enc.status_irrf}
                          </span>
                        </div>
                        <p className="text-base font-semibold">{formatBRL(enc.irrf_retido)}</p>
                        <p className="text-xs text-gray-400">Venc: {formatData(enc.data_venc_irrf)}</p>
                        {enc.status_irrf === 'pendente' && (
                          <button
                            onClick={() => marcarRecolhido(enc.id, 'irrf')}
                            className="text-[10px] px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 font-medium"
                          >
                            Marcar recolhido
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 text-center py-2">Nao calculado</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
