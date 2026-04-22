import { useState, useEffect, useMemo, useCallback } from 'react'
import { format, addMonths } from 'date-fns'
import {
  Calculator, Loader2, RefreshCw, FileText,
  DollarSign, TrendingUp, AlertCircle, Check,
  ChevronLeft, ChevronRight, ExternalLink
} from 'lucide-react'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { formatBRL, formatData } from '@/lib/format'
import { AppLayout } from '@/components/layout/AppLayout'
import { toast } from 'sonner'

// ─── Types ──────────────────────────────────────────────────────────
interface Apuracao {
  id: string
  empresa_id: string
  competencia: string
  regime_tributario: string | null
  receita_bruta: number | null
  deducoes: number | null
  receita_liquida: number | null
  faturamento_12m: number | null
  faixa_simples: string | null
  aliquota_nominal: number | null
  fator_r: number | null
  aliquota_efetiva: number | null
  valor_das: number | null
  valor_irpj: number | null
  valor_csll: number | null
  valor_pis: number | null
  valor_cofins: number | null
  valor_iss: number | null
  valor_cpp: number | null
  total_impostos: number | null
  data_vencimento: string | null
  status: string | null
  guia_url: string | null
  conta_pagar_id: string | null
}

interface Empresa {
  id: string
  regime_tributario: string | null
  razao_social: string | null
}

// ─── Simples Nacional tables ────────────────────────────────────────
const FAIXAS_ANEXO_III = [
  { min: 0, max: 180000, aliquota: 0.06, deducao: 0, faixa: 'Faixa 1' },
  { min: 180000.01, max: 360000, aliquota: 0.112, deducao: 9360, faixa: 'Faixa 2' },
  { min: 360000.01, max: 720000, aliquota: 0.135, deducao: 17640, faixa: 'Faixa 3' },
  { min: 720000.01, max: 1800000, aliquota: 0.16, deducao: 35640, faixa: 'Faixa 4' },
  { min: 1800000.01, max: 3600000, aliquota: 0.21, deducao: 125640, faixa: 'Faixa 5' },
  { min: 3600000.01, max: 4800000, aliquota: 0.33, deducao: 648000, faixa: 'Faixa 6' },
]

const REGIME_LABELS: Record<string, string> = {
  simples_nacional: 'Simples Nacional',
  lucro_presumido: 'Lucro Presumido',
  lucro_real: 'Lucro Real',
  mei: 'MEI',
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  apurado: { label: 'Apurado', color: '#059669', bg: '#ECFDF3' },
  pendente: { label: 'Pendente', color: '#F79009', bg: '#FFFAEB' },
  pago: { label: 'Pago', color: '#059669', bg: '#ECFDF3' },
  retificado: { label: 'Retificado', color: '#667085', bg: '#F3F4F6' },
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]

// ─── Component ──────────────────────────────────────────────────────
export default function ApuracaoImpostos() {
  const { selectedCompany } = useCompany()
  const { activeClient } = useAuth()

  const [apuracoes, setApuracoes] = useState<Apuracao[]>([])
  const [empresa, setEmpresa] = useState<Empresa | null>(null)
  const [loading, setLoading] = useState(true)
  const [calculating, setCalculating] = useState(false)
  const [selectedAno, setSelectedAno] = useState(new Date().getFullYear())
  const [selectedApuracao, setSelectedApuracao] = useState<Apuracao | null>(null)

  // ─── Data Loading ───────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!selectedCompany) return
    setLoading(true)
    const db = activeClient as any

    const [apRes, empRes] = await Promise.all([
      db.from('apuracao_impostos')
        .select('*')
        .eq('empresa_id', selectedCompany.id)
        .gte('competencia', `${selectedAno}-01`)
        .lte('competencia', `${selectedAno}-12`)
        .order('competencia', { ascending: true }),
      db.from('empresas')
        .select('id, regime_tributario, razao_social')
        .eq('id', selectedCompany.id)
        .maybeSingle(),
    ])

    setApuracoes(apRes.data || [])
    setEmpresa(empRes.data || null)
    setLoading(false)
  }, [selectedCompany, activeClient, selectedAno])

  useEffect(() => { loadData() }, [loadData])

  // ─── KPIs ─────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const totalImpostos = apuracoes.reduce((s, a) => s + (a.total_impostos || 0), 0)
    const totalReceita = apuracoes.reduce((s, a) => s + (a.receita_bruta || 0), 0)
    const cargaTributaria = totalReceita > 0 ? (totalImpostos / totalReceita) * 100 : 0
    return { totalImpostos, totalReceita, cargaTributaria, mesesApurados: apuracoes.length }
  }, [apuracoes])

  // ─── Calcular apuracao ────────────────────────────────────────────
  const calcularApuracao = async (competencia: string) => {
    if (!selectedCompany || !empresa) return
    setCalculating(true)
    const db = activeClient as any

    try {
      // 1. Buscar NFs autorizadas do periodo
      const { data: nfs } = await db.from('notas_fiscais')
        .select('valor_total')
        .eq('empresa_id', selectedCompany.id)
        .eq('status', 'autorizada')
        .gte('data_emissao', `${competencia}-01`)
        .lte('data_emissao', `${competencia}-31`)

      const receitaBruta = (nfs || []).reduce((s: number, n: any) => s + (n.valor_total || 0), 0)

      // 2. Calcular por regime
      let resultado: any = {}
      const regime = empresa.regime_tributario || 'simples_nacional'

      if (regime === 'simples_nacional') {
        // Buscar faturamento 12 meses
        const [ano, mes] = competencia.split('-').map(Number)
        const inicio12m = format(addMonths(new Date(ano, mes - 1, 1), -12), 'yyyy-MM')
        const fim12m = format(addMonths(new Date(ano, mes - 1, 1), -1), 'yyyy-MM')

        const { data: fat12m } = await db.from('notas_fiscais')
          .select('valor_total')
          .eq('empresa_id', selectedCompany.id)
          .eq('status', 'autorizada')
          .gte('data_emissao', `${inicio12m}-01`)
          .lte('data_emissao', `${fim12m}-31`)

        const faturamento12m = (fat12m || []).reduce((s: number, n: any) => s + (n.valor_total || 0), 0)

        // Encontrar faixa
        let faixa = FAIXAS_ANEXO_III[0]
        for (const f of FAIXAS_ANEXO_III) {
          if (faturamento12m >= f.min && faturamento12m <= f.max) {
            faixa = f
            break
          }
        }

        const aliquotaEfetiva = faturamento12m > 0
          ? (faturamento12m * faixa.aliquota - faixa.deducao) / faturamento12m
          : faixa.aliquota

        const valorDas = receitaBruta * aliquotaEfetiva

        resultado = {
          faturamento_12m: faturamento12m,
          faixa_simples: faixa.faixa,
          aliquota_nominal: faixa.aliquota,
          aliquota_efetiva: Math.round(aliquotaEfetiva * 10000) / 10000,
          valor_das: Math.round(valorDas * 100) / 100,
          total_impostos: Math.round(valorDas * 100) / 100,
        }
      } else if (regime === 'lucro_presumido') {
        const irpj = receitaBruta * 0.32 * 0.15
        const csll = receitaBruta * 0.32 * 0.09
        const pis = receitaBruta * 0.0065
        const cofins = receitaBruta * 0.03
        const iss = receitaBruta * 0.05
        const total = irpj + csll + pis + cofins + iss

        resultado = {
          valor_irpj: Math.round(irpj * 100) / 100,
          valor_csll: Math.round(csll * 100) / 100,
          valor_pis: Math.round(pis * 100) / 100,
          valor_cofins: Math.round(cofins * 100) / 100,
          valor_iss: Math.round(iss * 100) / 100,
          total_impostos: Math.round(total * 100) / 100,
        }
      } else if (regime === 'mei') {
        // MEI: valor fixo mensal (R$ 75,60 servicos - 2025)
        resultado = {
          valor_das: 75.60,
          total_impostos: 75.60,
        }
      }

      // 3. Vencimento: dia 20 do mes seguinte
      const [anoC, mesC] = competencia.split('-').map(Number)
      const proxMes = addMonths(new Date(anoC, mesC - 1, 1), 1)
      const dataVencimento = format(new Date(proxMes.getFullYear(), proxMes.getMonth(), 20), 'yyyy-MM-dd')

      // 4. Upsert apuracao
      const payload = {
        empresa_id: selectedCompany.id,
        competencia,
        regime_tributario: regime,
        receita_bruta: receitaBruta,
        data_vencimento: dataVencimento,
        status: 'apurado',
        ...resultado,
      }

      // Check if exists
      const { data: existing } = await db.from('apuracao_impostos')
        .select('id')
        .eq('empresa_id', selectedCompany.id)
        .eq('competencia', competencia)
        .maybeSingle()

      if (existing) {
        await db.from('apuracao_impostos').update(payload).eq('id', existing.id)
      } else {
        await db.from('apuracao_impostos').insert(payload)
      }

      // 5. Gerar CP para pagamento
      const totalImp = resultado.total_impostos || 0
      if (totalImp > 0) {
        const descricaoImp = regime === 'mei' ? 'DAS MEI' :
          regime === 'simples_nacional' ? 'DAS Simples Nacional' : 'Impostos Federais'

        const { data: cpExisting } = await db.from('contas_pagar')
          .select('id')
          .eq('company_id', selectedCompany.id)
          .eq('descricao', `${descricaoImp} - ${competencia}`)
          .maybeSingle()

        if (!cpExisting) {
          await db.from('contas_pagar').insert({
            company_id: selectedCompany.id,
            credor_nome: 'Receita Federal / Prefeitura',
            descricao: `${descricaoImp} - ${competencia}`,
            valor: totalImp,
            data_vencimento: dataVencimento,
            status: 'aberto',
            competencia,
          })
        }
      }

      toast.success(`Apuracao ${competencia} calculada: ${formatBRL(resultado.total_impostos || 0)}`)
      loadData()
    } catch (err: any) {
      console.error('Erro na apuracao:', err)
      toast.error(err.message || 'Erro ao calcular apuracao')
    } finally {
      setCalculating(false)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <AppLayout title="Apuracao de Impostos">
      <div className="p-6 space-y-6">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500">
              Regime: <span className="font-medium text-gray-700">
                {REGIME_LABELS[empresa?.regime_tributario || ''] || 'Nao definido'}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedAno(a => a - 1)}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
            >
              <ChevronLeft size={16} className="text-gray-500" />
            </button>
            <span className="text-sm font-medium text-gray-700 min-w-[60px] text-center">{selectedAno}</span>
            <button
              onClick={() => setSelectedAno(a => a + 1)}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
            >
              <ChevronRight size={16} className="text-gray-500" />
            </button>
          </div>
        </div>

        {/* ── KPIs ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Receita bruta anual', value: formatBRL(kpis.totalReceita), icon: DollarSign, color: '#1E3A8A' },
            { label: 'Total impostos', value: formatBRL(kpis.totalImpostos), icon: Calculator, color: '#D92D20' },
            { label: 'Carga tributaria', value: `${kpis.cargaTributaria.toFixed(1)}%`, icon: TrendingUp, color: '#F79009' },
            { label: 'Meses apurados', value: kpis.mesesApurados, icon: FileText, color: '#059669' },
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

        {/* ── Grid mensal ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {MESES.map((mes, idx) => {
            const competencia = `${selectedAno}-${String(idx + 1).padStart(2, '0')}`
            const apuracao = apuracoes.find(a => a.competencia === competencia)
            const st = apuracao ? (STATUS_CONFIG[apuracao.status || 'pendente'] || STATUS_CONFIG.pendente) : null

            return (
              <div
                key={competencia}
                className={`bg-white rounded-xl border p-4 space-y-3 cursor-pointer transition-all hover:shadow-md ${
                  selectedApuracao?.competencia === competencia ? 'border-blue-300 ring-2 ring-blue-100' : 'border-gray-100'
                }`}
                onClick={() => apuracao && setSelectedApuracao(apuracao)}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">{mes}</h3>
                  {apuracao && st && (
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ color: st.color, backgroundColor: st.bg }}
                    >
                      {st.label}
                    </span>
                  )}
                </div>

                {apuracao ? (
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Receita bruta:</span>
                      <span className="font-medium">{formatBRL(apuracao.receita_bruta)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Total impostos:</span>
                      <span className="font-medium text-red-600">{formatBRL(apuracao.total_impostos)}</span>
                    </div>
                    {apuracao.data_vencimento && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Vencimento:</span>
                        <span>{formatData(apuracao.data_vencimento)}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-3">
                    <p className="text-xs text-gray-400 mb-2">Nao apurado</p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        calcularApuracao(competencia)
                      }}
                      disabled={calculating}
                      className="flex items-center gap-1.5 mx-auto px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50"
                      style={{ backgroundColor: '#1E3A8A' }}
                    >
                      {calculating ? <Loader2 size={12} className="animate-spin" /> : <Calculator size={12} />}
                      Calcular
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Detalhe da apuracao selecionada ── */}
        {selectedApuracao && (
          <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-800">
                Detalhes — {MESES[parseInt(selectedApuracao.competencia.split('-')[1]) - 1]} {selectedApuracao.competencia.split('-')[0]}
              </h3>
              <button
                onClick={() => setSelectedApuracao(null)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Fechar
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-1 border-b border-gray-50">
                  <span className="text-gray-500">Regime tributario:</span>
                  <span className="font-medium">{REGIME_LABELS[selectedApuracao.regime_tributario || ''] || '—'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-50">
                  <span className="text-gray-500">Receita bruta:</span>
                  <span className="font-medium">{formatBRL(selectedApuracao.receita_bruta)}</span>
                </div>
                {selectedApuracao.faturamento_12m != null && (
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <span className="text-gray-500">Faturamento 12 meses:</span>
                    <span>{formatBRL(selectedApuracao.faturamento_12m)}</span>
                  </div>
                )}
                {selectedApuracao.faixa_simples && (
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <span className="text-gray-500">Faixa do Simples:</span>
                    <span>{selectedApuracao.faixa_simples} — Anexo III</span>
                  </div>
                )}
                {selectedApuracao.aliquota_nominal != null && (
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <span className="text-gray-500">Aliquota nominal:</span>
                    <span>{(selectedApuracao.aliquota_nominal * 100).toFixed(1)}%</span>
                  </div>
                )}
                {selectedApuracao.aliquota_efetiva != null && (
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <span className="text-gray-500">Aliquota efetiva:</span>
                    <span className="font-medium">{(selectedApuracao.aliquota_efetiva * 100).toFixed(2)}%</span>
                  </div>
                )}
              </div>

              <div className="space-y-2 text-sm">
                {selectedApuracao.valor_das != null && selectedApuracao.valor_das > 0 && (
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <span className="text-gray-500">DAS:</span>
                    <span className="font-medium">{formatBRL(selectedApuracao.valor_das)}</span>
                  </div>
                )}
                {selectedApuracao.valor_irpj != null && selectedApuracao.valor_irpj > 0 && (
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <span className="text-gray-500">IRPJ:</span>
                    <span>{formatBRL(selectedApuracao.valor_irpj)}</span>
                  </div>
                )}
                {selectedApuracao.valor_csll != null && selectedApuracao.valor_csll > 0 && (
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <span className="text-gray-500">CSLL:</span>
                    <span>{formatBRL(selectedApuracao.valor_csll)}</span>
                  </div>
                )}
                {selectedApuracao.valor_pis != null && selectedApuracao.valor_pis > 0 && (
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <span className="text-gray-500">PIS:</span>
                    <span>{formatBRL(selectedApuracao.valor_pis)}</span>
                  </div>
                )}
                {selectedApuracao.valor_cofins != null && selectedApuracao.valor_cofins > 0 && (
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <span className="text-gray-500">COFINS:</span>
                    <span>{formatBRL(selectedApuracao.valor_cofins)}</span>
                  </div>
                )}
                {selectedApuracao.valor_iss != null && selectedApuracao.valor_iss > 0 && (
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <span className="text-gray-500">ISS:</span>
                    <span>{formatBRL(selectedApuracao.valor_iss)}</span>
                  </div>
                )}
                <div className="flex justify-between py-2 border-t border-gray-200 font-semibold">
                  <span>Total impostos:</span>
                  <span className="text-red-600">{formatBRL(selectedApuracao.total_impostos)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-500">Vencimento:</span>
                  <span>{formatData(selectedApuracao.data_vencimento)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => calcularApuracao(selectedApuracao.competencia)}
                disabled={calculating}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                {calculating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Recalcular
              </button>
              {selectedApuracao.conta_pagar_id && (
                <a
                  href={`/contas-pagar`}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm hover:bg-gray-50"
                >
                  <ExternalLink size={14} /> Ver CP gerado
                </a>
              )}
              {selectedApuracao.guia_url && (
                <a
                  href={selectedApuracao.guia_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
                  style={{ backgroundColor: '#1E3A8A' }}
                >
                  <FileText size={14} /> Baixar guia DAS
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
