import { useState, useEffect, useMemo, useCallback } from 'react'
import { calcularEncargosCompetencia } from '@/lib/folha/encargos'
import {
  Calculator, Loader2, RefreshCw, Check, AlertTriangle,
  ChevronLeft, ChevronRight, FileText, ExternalLink
} from 'lucide-react'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { formatBRL, formatData } from '@/lib/format'
import { AppLayout } from '@/components/layout/AppLayout'
import { PagePanel } from '@/components/layout/PagePanel'
import { KpiCard, KpiCardGrid } from '@/components/ui/kpi-card'
import { ExportMenu } from '@/components/ExportMenu'
import { toast } from 'sonner'

// ─── Types ──────────────────────────────────────────────────────────
interface Encargo {
  id: string
  company_id: string
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
  pendente: { label: 'Pendente', color: '#EA580C', bg: '#FFF0EB' },
  recolhido: { label: 'Recolhido', color: '#059669', bg: '#ECFDF4' },
  atrasado: { label: 'Atrasado', color: '#E53E3E', bg: '#FEE2E2' },
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
  const [mesCalc, setMesCalc] = useState(new Date().getMonth() + 1)

  // ─── Data Loading ───────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!selectedCompany) return
    setLoading(true)
    const db = activeClient as any

    const { data } = await db.from('encargos')
      .select('*')
      .eq('company_id', selectedCompany.id)
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
    try {
      const res = await calcularEncargosCompetencia({ client: activeClient as any, companyId: selectedCompany.id, competencia })
      if (res.sucesso) {
        toast.success(`Encargos ${competencia} calculados: ${formatBRL(res.totalEncargos ?? 0)}`)
        loadData()
      } else if (res.semFolha) {
        toast.error('Nenhuma folha encontrada para esta competencia. Calcule a folha primeiro.')
      } else {
        toast.error(res.erro || 'Erro ao calcular encargos')
      }
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
      <div>

        <PagePanel title="Encargos Trabalhistas" subtitle="Encargos trabalhistas e provisões sobre a folha">

        {/* ── KPIs ── */}
        <KpiCardGrid>
          {[
            { label: 'FGTS total', value: formatBRL(kpis.totalFGTS), color: '#059669' },
            { label: 'INSS total', value: formatBRL(kpis.totalINSS), color: '#EA580C' },
            { label: 'IRRF retido', value: formatBRL(kpis.totalIRRF), color: '#E53E3E' },
            { label: 'Total encargos', value: formatBRL(kpis.totalGeral), color: '#059669' },
          ].map((kpi, i) => (
            <KpiCard key={i} label={kpi.label} value={kpi.value} valueColor={kpi.color} />
          ))}
        </KpiCardGrid>

        {/* ── Toolbar: ano + calcular mês + export ── */}
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setSelectedAno(a => a - 1)} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
            <ChevronLeft size={16} className="text-gray-500" />
          </button>
          <span className="text-sm font-medium text-gray-700 min-w-[60px] text-center">{selectedAno}</span>
          <button onClick={() => setSelectedAno(a => a + 1)} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
            <ChevronRight size={16} className="text-gray-500" />
          </button>

          <div className="flex items-center gap-2 ml-3 pl-3 border-l border-gray-200">
            <select
              value={mesCalc}
              onChange={e => setMesCalc(Number(e.target.value))}
              className="text-sm border border-gray-200 rounded-lg px-2 py-2 bg-white focus:outline-none focus:border-[#059669]"
            >
              {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <button
              onClick={() => calcularEncargos(`${selectedAno}-${String(mesCalc).padStart(2, '0')}`)}
              disabled={calculating}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: '#059669' }}
            >
              {calculating ? <Loader2 size={14} className="animate-spin" /> : <Calculator size={14} />}
              {encargos.some(e => e.competencia === `${selectedAno}-${String(mesCalc).padStart(2, '0')}`) ? 'Recalcular' : 'Calcular'}
            </button>
          </div>

          <div className="ml-auto">
            <ExportMenu<Encargo>
              rows={() => encargos}
              titulo="ENCARGOS TRABALHISTAS"
              baseName="encargos-trabalhistas"
              subtitulo={String(selectedAno)}
              size="md"
              columns={[
                { header: 'Competencia', value: e => e.competencia, align: 'center', excelWidth: 14 },
                { header: 'FGTS', value: e => formatBRL(e.fgts_total), numericValue: e => e.fgts_total || 0, excelWidth: 14 },
                { header: 'INSS', value: e => formatBRL(e.inss_total ?? e.inss_patronal + e.inss_funcionarios), numericValue: e => e.inss_total ?? e.inss_patronal + e.inss_funcionarios, excelWidth: 14 },
                { header: 'IRRF', value: e => formatBRL(e.irrf_retido), numericValue: e => e.irrf_retido || 0, excelWidth: 14 },
                { header: 'RAT/FAP', value: e => formatBRL(e.rat_fap), numericValue: e => e.rat_fap || 0, excelWidth: 14 },
                { header: 'Total', value: e => formatBRL(e.total_encargos), numericValue: e => e.total_encargos || 0, excelWidth: 14 },
                { header: 'Status FGTS', value: e => STATUS_GUIA[e.status_fgts]?.label || e.status_fgts, align: 'center', excelWidth: 14 },
                { header: 'Status INSS', value: e => STATUS_GUIA[e.status_inss]?.label || e.status_inss, align: 'center', excelWidth: 14 },
                { header: 'Status IRRF', value: e => STATUS_GUIA[e.status_irrf]?.label || e.status_irrf, align: 'center', excelWidth: 14 },
              ]}
            />
          </div>
        </div>

        {/* ── Tabela (só meses calculados) ── */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="animate-spin text-gray-400" size={24} />
            </div>
          ) : encargos.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">
              Nenhum encargo calculado em {selectedAno}. Escolha um mês acima e clique em <span className="font-medium text-gray-600">Calcular</span>.
              <div className="mt-1 text-xs">Os encargos são apurados a partir das folhas fechadas da competência.</div>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white text-left text-xs font-bold text-[#1D2939] uppercase tracking-wider border-b-2 border-[#D0D5DD]">
                  <th className="px-4 py-3 border-r border-[#EAECF0]">Competência</th>
                  <th className="px-4 py-3 text-right border-r border-[#EAECF0]">FGTS</th>
                  <th className="px-4 py-3 text-right border-r border-[#EAECF0]">INSS</th>
                  <th className="px-4 py-3 text-right border-r border-[#EAECF0]">IRRF</th>
                  <th className="px-4 py-3 text-right border-r border-[#EAECF0]">RAT/FAP</th>
                  <th className="px-4 py-3 text-right border-r border-[#EAECF0]">Total</th>
                  <th className="px-4 py-3">Guias</th>
                </tr>
              </thead>
              <tbody>
                {encargos.map(enc => {
                  const idx = Number(enc.competencia.split('-')[1]) - 1
                  const inssTotal = enc.inss_total ?? enc.inss_patronal + enc.inss_funcionarios
                  const guia = (tipo: 'fgts' | 'inss' | 'irrf', label: string, status: string, venc: string | null) => {
                    const st = STATUS_GUIA[status] || STATUS_GUIA.pendente
                    const pendente = status === 'pendente'
                    return (
                      <button
                        key={tipo}
                        onClick={() => pendente && marcarRecolhido(enc.id, tipo)}
                        disabled={!pendente}
                        title={`${label} · ${st.label} · vence ${formatData(venc)}${pendente ? ' · clique para marcar recolhido' : ''}`}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${pendente ? 'cursor-pointer hover:ring-1 hover:ring-current' : 'cursor-default'}`}
                        style={{ color: st.color, backgroundColor: st.bg }}
                      >
                        {!pendente && <Check size={10} />}{label}
                      </button>
                    )
                  }
                  return (
                    <tr key={enc.id} className="border-b border-[#F1F3F5] hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-2 font-medium border-r border-[#F1F3F5] whitespace-nowrap">{MESES[idx]} {selectedAno}</td>
                      <td className="px-4 py-2 text-right tabular-nums border-r border-[#F1F3F5]">{formatBRL(enc.fgts_total)}</td>
                      <td className="px-4 py-2 text-right tabular-nums border-r border-[#F1F3F5]" title={`Patronal ${formatBRL(enc.inss_patronal)} · Func. ${formatBRL(enc.inss_funcionarios)}`}>{formatBRL(inssTotal)}</td>
                      <td className="px-4 py-2 text-right tabular-nums border-r border-[#F1F3F5]">{formatBRL(enc.irrf_retido)}</td>
                      <td className="px-4 py-2 text-right tabular-nums border-r border-[#F1F3F5]">{formatBRL(enc.rat_fap)}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-semibold border-r border-[#F1F3F5]">{formatBRL(enc.total_encargos)}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {guia('fgts', 'FGTS', enc.status_fgts, enc.data_venc_fgts)}
                          {guia('inss', 'INSS', enc.status_inss, enc.data_venc_inss)}
                          {guia('irrf', 'IRRF', enc.status_irrf, enc.data_venc_irrf)}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
        </PagePanel>
      </div>
    </AppLayout>
  )
}
