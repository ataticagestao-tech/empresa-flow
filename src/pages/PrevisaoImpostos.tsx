import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { addMonths, format } from 'date-fns'
import {
  Calculator, Loader2, ChevronLeft, ChevronRight, DollarSign,
  TrendingUp, FileText, Check, ExternalLink, Info, Plus, Trash2, X, Sliders, BookMarked, Users, ArrowRight,
} from 'lucide-react'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { formatBRL, formatData } from '@/lib/format'
import { AppLayout } from '@/components/layout/AppLayout'
import { PagePanel } from '@/components/layout/PagePanel'
import { KpiCard, KpiCardGrid } from '@/components/ui/kpi-card'
import { ExportMenu } from '@/components/ExportMenu'
import { toast } from 'sonner'
import { apurarImpostoCompetencia, normalizarRegime, type RegimeNorm } from '@/lib/fiscal/apuracao'

interface Apuracao {
  id: string
  competencia: string
  regime_tributario: string | null
  receita_bruta: number | null
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
  total_impostos: number | null
  data_vencimento: string | null
  status: string | null
}

interface MixRow { id: string; nome: string; cnae: string | null; pct_receita: number; anexo_simples: string | null; presuncao_irpj: number; presuncao_csll: number; aliquota_iss: number }
interface MixDraft { nome: string; cnae: string; pct: number; anexo: string; presIrpj: number; presCsll: number; iss: number }
interface CnaeRow { id: string; codigo: string; descricao: string; anexo_simples: string | null; fator_r_aplicavel: boolean; presuncao_irpj: number; presuncao_csll: number; aliquota_iss_sugerida: number }

const REGIME_LABEL: Record<string, string> = {
  simples: 'Simples Nacional', presumido: 'Lucro Presumido', real: 'Lucro Real', mei: 'MEI',
}

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  pendente: { label: 'Pendente', color: '#EA580C', bg: '#FFF0EB' },
  apurado: { label: 'Previsto', color: '#EA580C', bg: '#FFF0EB' },
  recolhido: { label: 'Recolhido', color: '#059669', bg: '#ECFDF4' },
  retificado: { label: 'Retificado', color: '#667085', bg: '#F3F4F6' },
}

const ANEXOS = ['I', 'II', 'III', 'IV', 'V']
const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

export default function PrevisaoImpostos() {
  const { selectedCompany } = useCompany()
  const { activeClient } = useAuth()

  const [apuracoes, setApuracoes] = useState<Apuracao[]>([])
  const [regime, setRegime] = useState<RegimeNorm>(null)
  const [cnae, setCnae] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [calculating, setCalculating] = useState(false)
  const [selectedAno, setSelectedAno] = useState(new Date().getFullYear())
  const [mesCalc, setMesCalc] = useState(new Date().getMonth() + 1)

  // Mix tributário
  const [mix, setMix] = useState<MixRow[]>([])
  const [mixOpen, setMixOpen] = useState(false)
  const [mixDraft, setMixDraft] = useState<MixDraft[]>([])
  const [savingMix, setSavingMix] = useState(false)

  // Fator R (Simples) — puxado da Folha de Pagamento dos 12 meses anteriores
  const [fatorR, setFatorR] = useState<{ folha12m: number; receita12m: number; fator: number; anexo: 'III' | 'V'; meses: number } | null>(null)

  // Biblioteca CNAE
  const [cnaeLib, setCnaeLib] = useState<CnaeRow[]>([])
  const [cnaeOpen, setCnaeOpen] = useState(false)
  const [novoCnae, setNovoCnae] = useState({ codigo: '', descricao: '', anexo: 'III', presIrpj: 32, presCsll: 32, iss: 3 })
  const [savingCnae, setSavingCnae] = useState(false)

  const loadData = useCallback(async () => {
    if (!selectedCompany) return
    setLoading(true)
    const db = activeClient as any
    const [apRes, compRes, mixRes, cnaeRes] = await Promise.all([
      db.from('apuracao_impostos').select('*')
        .eq('company_id', selectedCompany.id)
        .gte('competencia', `${selectedAno}-01`).lte('competencia', `${selectedAno}-12`)
        .order('competencia', { ascending: true }),
      db.from('companies').select('regime_tributario, cnae_principal_desc').eq('id', selectedCompany.id).maybeSingle(),
      db.from('config_mix_tributario').select('id, nome, cnae, pct_receita, anexo_simples, presuncao_irpj, presuncao_csll, aliquota_iss').eq('company_id', selectedCompany.id).order('ordem'),
      db.from('cnae_tributacao').select('id, codigo, descricao, anexo_simples, fator_r_aplicavel, presuncao_irpj, presuncao_csll, aliquota_iss_sugerida').order('codigo'),
    ])
    setApuracoes(apRes.data || [])
    setRegime(normalizarRegime(compRes.data?.regime_tributario))
    setCnae(compRes.data?.cnae_principal_desc || '')
    setMix(mixRes.data || [])
    setCnaeLib(cnaeRes.data || [])
    setLoading(false)
  }, [selectedCompany, activeClient, selectedAno])

  useEffect(() => { loadData() }, [loadData])

  // Fator R ao vivo: folha 12m ÷ receita 12m (janela anterior à competência alvo)
  useEffect(() => {
    if (regime !== 'simples' || !selectedCompany) { setFatorR(null); return }
    let cancelado = false
    ;(async () => {
      const db = activeClient as any
      const ref = new Date(selectedAno, mesCalc - 1, 1)
      const ini = format(addMonths(ref, -12), 'yyyy-MM')
      const fim = format(addMonths(ref, -1), 'yyyy-MM')
      const [folhaRes, vendasRes] = await Promise.all([
        db.from('folha_pagamento').select('total_proventos, competencia')
          .eq('company_id', selectedCompany.id).gte('competencia', ini).lte('competencia', fim),
        db.from('vendas').select('valor_total')
          .eq('company_id', selectedCompany.id).is('deleted_at', null)
          .gte('data_venda', `${ini}-01`).lte('data_venda', `${fim}-31`),
      ])
      if (cancelado) return
      const folha12m = (folhaRes.data || []).reduce((s: number, f: any) => s + (Number(f.total_proventos) || 0), 0)
      const receita12m = (vendasRes.data || []).reduce((s: number, v: any) => s + (Number(v.valor_total) || 0), 0)
      const meses = new Set((folhaRes.data || []).map((f: any) => f.competencia)).size
      const fator = receita12m > 0 ? folha12m / receita12m : 0
      setFatorR({ folha12m, receita12m, fator, anexo: fator >= 0.28 ? 'III' : 'V', meses })
    })()
    return () => { cancelado = true }
  }, [regime, selectedCompany, activeClient, selectedAno, mesCalc])

  const kpis = useMemo(() => {
    const totalImpostos = apuracoes.reduce((s, a) => s + (a.total_impostos || 0), 0)
    const totalReceita = apuracoes.reduce((s, a) => s + (a.receita_bruta || 0), 0)
    const carga = totalReceita > 0 ? (totalImpostos / totalReceita) * 100 : 0
    return { totalImpostos, totalReceita, carga, meses: apuracoes.length }
  }, [apuracoes])

  const provisionar = async (competencia: string) => {
    if (!selectedCompany) return
    setCalculating(true)
    try {
      const res = await apurarImpostoCompetencia({ client: activeClient as any, companyId: selectedCompany.id, competencia })
      if (res.sucesso) {
        toast.success(`Imposto de ${competencia} provisionado: ${formatBRL(res.resultado?.totalImpostos ?? 0)}`)
        loadData()
      } else if (res.semRegime) {
        toast.error('Defina o regime tributário no cadastro da empresa (aba Fiscal).')
      } else if (res.semReceita) {
        toast.error('Nenhuma venda nesta competência para provisionar.')
      } else {
        toast.error(res.erro || 'Erro ao provisionar imposto')
      }
    } finally {
      setCalculating(false)
    }
  }

  const abrirMix = () => {
    setMixDraft(mix.length
      ? mix.map(m => ({ nome: m.nome, cnae: m.cnae || '', pct: Number(m.pct_receita), anexo: m.anexo_simples || 'III', presIrpj: Number(m.presuncao_irpj), presCsll: Number(m.presuncao_csll), iss: Number(m.aliquota_iss) }))
      : [{ nome: 'Serviços', cnae: '', pct: 100, anexo: 'III', presIrpj: 32, presCsll: 32, iss: 3 }])
    setMixOpen(true)
  }

  const setLinha = (i: number, patch: Partial<MixDraft>) => setMixDraft(d => d.map((x, j) => j === i ? { ...x, ...patch } : x))

  const pickCnae = (i: number, codigo: string) => {
    const c = cnaeLib.find(x => x.codigo === codigo)
    setMixDraft(d => d.map((x, j) => j === i ? {
      ...x, cnae: codigo,
      nome: x.nome.trim() ? x.nome : (c?.descricao ?? x.nome),
      anexo: c?.anexo_simples ?? x.anexo,
      presIrpj: c ? Number(c.presuncao_irpj) : x.presIrpj,
      presCsll: c ? Number(c.presuncao_csll) : x.presCsll,
      iss: c ? Number(c.aliquota_iss_sugerida) : x.iss,
    } : x))
  }

  const salvarMix = async () => {
    if (!selectedCompany) return
    const linhas = mixDraft.filter(l => l.nome.trim() && l.pct > 0)
    setSavingMix(true)
    const db = activeClient as any
    try {
      await db.from('config_mix_tributario').delete().eq('company_id', selectedCompany.id)
      if (linhas.length) {
        await db.from('config_mix_tributario').insert(linhas.map((l, i) => ({
          company_id: selectedCompany.id,
          nome: l.nome.trim(),
          cnae: l.cnae || null,
          pct_receita: l.pct,
          anexo_simples: regime === 'simples' ? l.anexo : null,
          presuncao_irpj: l.presIrpj,
          presuncao_csll: l.presCsll,
          aliquota_iss: l.iss,
          ordem: i,
        })))
      }
      toast.success('Mix tributário salvo. Reprovisione os meses para aplicar.')
      setMixOpen(false)
      loadData()
    } catch (e: any) {
      toast.error('Erro ao salvar mix: ' + (e.message || 'desconhecido'))
    } finally {
      setSavingMix(false)
    }
  }

  const addCnaeLib = async () => {
    if (!novoCnae.codigo.trim() || !novoCnae.descricao.trim()) { toast.error('Informe código e descrição.'); return }
    setSavingCnae(true)
    const db = activeClient as any
    try {
      const { error } = await db.from('cnae_tributacao').insert({
        codigo: novoCnae.codigo.trim(),
        descricao: novoCnae.descricao.trim(),
        anexo_simples: novoCnae.anexo,
        fator_r_aplicavel: novoCnae.anexo === 'III' || novoCnae.anexo === 'V',
        presuncao_irpj: novoCnae.presIrpj,
        presuncao_csll: novoCnae.presCsll,
        aliquota_iss_sugerida: novoCnae.iss,
      })
      if (error) throw error
      toast.success('CNAE adicionado à biblioteca.')
      setNovoCnae({ codigo: '', descricao: '', anexo: 'III', presIrpj: 32, presCsll: 32, iss: 3 })
      loadData()
    } catch (e: any) {
      toast.error('Erro: ' + (e.message || 'desconhecido'))
    } finally {
      setSavingCnae(false)
    }
  }

  const delCnaeLib = async (id: string) => {
    const db = activeClient as any
    const { error } = await db.from('cnae_tributacao').delete().eq('id', id)
    if (error) toast.error('Erro ao excluir')
    else { toast.success('CNAE removido'); loadData() }
  }

  const marcarRecolhido = async (id: string) => {
    const db = activeClient as any
    const { error } = await db.from('apuracao_impostos').update({ status: 'recolhido' }).eq('id', id)
    if (error) toast.error('Erro ao atualizar')
    else { toast.success('Marcado como recolhido'); loadData() }
  }

  const somaPct = mixDraft.reduce((s, l) => s + (Number(l.pct) || 0), 0)
  const isSimplesLike = regime === 'simples' || regime === 'mei'
  const podeMix = regime === 'simples' || regime === 'presumido' || regime === 'real'
  const compAlvo = `${selectedAno}-${String(mesCalc).padStart(2, '0')}`
  const jaExiste = apuracoes.some(a => a.competencia === compAlvo)

  return (
    <AppLayout title="Previsão de Impostos">
      <div className="p-6">
        <PagePanel title="Previsão de Impostos" subtitle="Provisão mensal de impostos por regime tributário — vira conta a pagar prevista no dia 20">

          {/* Regime + CNAE */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 flex flex-wrap items-start gap-x-8 gap-y-2">
            <div>
              <p className="text-[11px] text-gray-400 uppercase tracking-wide">Regime tributário</p>
              <p className="font-semibold text-gray-700">{REGIME_LABEL[regime || ''] || 'Não definido'}</p>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-gray-400 uppercase tracking-wide">CNAE principal</p>
              <p className="font-semibold text-gray-700 truncate" title={cnae}>{cnae || '—'}</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => setCnaeOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50">
                <BookMarked size={14} /> Biblioteca CNAE
              </button>
              {podeMix && (
                <button onClick={abrirMix}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#059669] text-[#059669] text-sm font-medium hover:bg-[#ECFDF4]">
                  <Sliders size={14} /> Configurar mix tributário
                </button>
              )}
            </div>
          </div>

          {/* Painel Fator R (Simples) — interage com a Folha */}
          {regime === 'simples' && (
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Users size={15} className="text-[#059669]" /> Fator R — base nos 12 meses anteriores a {MESES[mesCalc - 1]}/{selectedAno}
                </h3>
                <Link to="/folha-pagamento" className="text-xs font-medium text-[#059669] hover:underline flex items-center gap-1">
                  Ver Folha de Pagamento <ArrowRight size={12} />
                </Link>
              </div>
              {fatorR ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div><p className="text-[11px] text-gray-400 uppercase tracking-wide">Folha (12m)</p><p className="font-semibold">{formatBRL(fatorR.folha12m)}</p></div>
                    <div><p className="text-[11px] text-gray-400 uppercase tracking-wide">Receita (12m)</p><p className="font-semibold">{formatBRL(fatorR.receita12m)}</p></div>
                    <div><p className="text-[11px] text-gray-400 uppercase tracking-wide">Fator R</p><p className="font-bold" style={{ color: fatorR.fator >= 0.28 ? '#059669' : '#EA580C' }}>{(fatorR.fator * 100).toFixed(1)}%</p></div>
                    <div><p className="text-[11px] text-gray-400 uppercase tracking-wide">Enquadramento</p><p className="font-bold" style={{ color: fatorR.fator >= 0.28 ? '#059669' : '#EA580C' }}>Anexo {fatorR.anexo}</p></div>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-3 flex items-start gap-1.5">
                    <Info size={13} className="text-[#059669] shrink-0 mt-0.5" />
                    Fator R ≥ 28% → <strong>Anexo III</strong> (menor); abaixo → <strong>Anexo V</strong>. A folha é puxada de <strong>Folha de Pagamento</strong> ({fatorR.meses} de 12 meses lançados). Com mix configurado, cada faixa usa o anexo que você definir.
                  </p>
                  {fatorR.folha12m === 0 && (
                    <p className="text-[11px] text-[#EA580C] mt-1 flex items-start gap-1.5">
                      <Info size={13} className="shrink-0 mt-0.5" />
                      Sem folha lançada nos 12 meses → Fator R = 0 → cai no Anexo V (mais caro). Lance a folha para enquadrar no Anexo III.
                    </p>
                  )}
                  {fatorR.meses > 0 && fatorR.meses < 12 && (
                    <p className="text-[11px] text-[#EA580C] mt-1 flex items-start gap-1.5">
                      <Info size={13} className="shrink-0 mt-0.5" />
                      Só {fatorR.meses} de 12 meses de folha lançados — o Fator R fica subestimado até completar o histórico.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs text-gray-400">Calculando…</p>
              )}
            </div>
          )}
          {regime === 'real' && (
            <p className="text-[11px] text-gray-500 flex items-start gap-1.5">
              <Info size={13} className="text-[#059669] shrink-0 mt-0.5" />
              Lucro Real: imposto estimado pelo <strong>resultado</strong> (receita − despesas do mês). IRPJ/CSLL sobre o lucro; PIS/COFINS não-cumulativo (~9,25%, sem créditos). O mix define só o ISS.
            </p>
          )}

          {/* Resumo do mix configurado */}
          {podeMix && mix.length > 0 && !mixOpen && (
            <div className="bg-[#F8FAF9] border border-[#D1FADF] rounded-xl p-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span className="font-semibold text-[#059669] uppercase tracking-wide text-[10px]">Mix aplicado</span>
              {mix.map(m => (
                <span key={m.id} className="text-gray-600">
                  {m.nome}: <strong>{Number(m.pct_receita).toFixed(0)}%</strong>
                  {regime === 'simples'
                    ? <> · Anexo {m.anexo_simples || '—'}</>
                    : <> · presunção IRPJ {Number(m.presuncao_irpj).toFixed(0)}%/CSLL {Number(m.presuncao_csll).toFixed(0)}%</>}
                  {' '}· ISS {Number(m.aliquota_iss).toFixed(0)}%
                </span>
              ))}
            </div>
          )}

          {/* Editor do mix */}
          {mixOpen && (
            <div className="bg-white rounded-xl border border-[#059669] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">Mix tributário — rateio da receita por atividade</h3>
                <button onClick={() => setMixOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
              </div>
              <p className="text-xs text-gray-500">
                Diga quanto da receita é de cada atividade. Escolher o CNAE pré-preenche a tributação (editável).
                {regime === 'simples' ? ' No Simples, cada faixa usa um Anexo.' : regime === 'real' ? ' No Real, defina só o ISS por faixa.' : ' No Presumido, defina a presunção de IRPJ e CSLL.'}
              </p>

              {/* Cabeçalho */}
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-gray-400 px-1">
                <span className="flex-1">Atividade</span>
                <span style={{ width: 150 }}>CNAE</span>
                <span style={{ width: 70 }} className="text-right">% rec.</span>
                {regime === 'simples' && <span style={{ width: 70 }}>Anexo</span>}
                {regime === 'presumido' && <><span style={{ width: 90 }} className="text-right">Pres. IRPJ</span><span style={{ width: 90 }} className="text-right">Pres. CSLL</span></>}
                <span style={{ width: 70 }} className="text-right">ISS %</span>
                <span style={{ width: 28 }}></span>
              </div>

              {mixDraft.map((l, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={l.nome} onChange={e => setLinha(i, { nome: e.target.value })} placeholder="Ex.: Procedimentos"
                    className="flex-1 border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-[#059669]" />
                  <select value={l.cnae} onChange={e => pickCnae(i, e.target.value)} style={{ width: 150 }}
                    className="border border-gray-200 rounded-md px-1 py-1.5 text-xs bg-white focus:outline-none focus:border-[#059669]">
                    <option value="">— CNAE —</option>
                    {cnaeLib.map(c => <option key={c.id} value={c.codigo}>{c.codigo}</option>)}
                  </select>
                  <input type="number" value={l.pct || ''} onChange={e => setLinha(i, { pct: Number(e.target.value) })} style={{ width: 70 }}
                    className="border border-gray-200 rounded-md px-2 py-1.5 text-sm text-right focus:outline-none focus:border-[#059669]" />
                  {regime === 'simples' && (
                    <select value={l.anexo} onChange={e => setLinha(i, { anexo: e.target.value })} style={{ width: 70 }}
                      className="border border-gray-200 rounded-md px-1 py-1.5 text-sm bg-white focus:outline-none focus:border-[#059669]">
                      {ANEXOS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  )}
                  {regime === 'presumido' && (
                    <>
                      <input type="number" value={l.presIrpj || ''} onChange={e => setLinha(i, { presIrpj: Number(e.target.value) })} style={{ width: 90 }}
                        className="border border-gray-200 rounded-md px-2 py-1.5 text-sm text-right focus:outline-none focus:border-[#059669]" />
                      <input type="number" value={l.presCsll || ''} onChange={e => setLinha(i, { presCsll: Number(e.target.value) })} style={{ width: 90 }}
                        className="border border-gray-200 rounded-md px-2 py-1.5 text-sm text-right focus:outline-none focus:border-[#059669]" />
                    </>
                  )}
                  <input type="number" value={l.iss || ''} onChange={e => setLinha(i, { iss: Number(e.target.value) })} style={{ width: 70 }}
                    className="border border-gray-200 rounded-md px-2 py-1.5 text-sm text-right focus:outline-none focus:border-[#059669]" />
                  <button onClick={() => setMixDraft(d => d.filter((_, j) => j !== i))} style={{ width: 28 }} className="text-gray-400 hover:text-[#E53E3E] flex justify-center"><Trash2 size={15} /></button>
                </div>
              ))}

              <div className="flex items-center justify-between">
                <button onClick={() => setMixDraft(d => [...d, { nome: '', cnae: '', pct: 0, anexo: 'III', presIrpj: 32, presCsll: 32, iss: 3 }])}
                  className="flex items-center gap-1.5 text-sm text-[#059669] font-medium hover:bg-[#ECFDF4] rounded px-2 py-1">
                  <Plus size={14} /> Adicionar faixa
                </button>
                <span className={`text-xs font-semibold ${Math.round(somaPct) === 100 ? 'text-[#059669]' : 'text-[#EA580C]'}`}>
                  Soma: {somaPct.toFixed(0)}% {Math.round(somaPct) !== 100 && '(ideal: 100%)'}
                </span>
              </div>
              <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
                <button onClick={() => setMixOpen(false)} className="px-4 py-2 rounded-lg border border-gray-200 text-sm hover:bg-gray-50">Cancelar</button>
                <button onClick={salvarMix} disabled={savingMix}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50" style={{ backgroundColor: '#059669' }}>
                  {savingMix ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Salvar mix
                </button>
              </div>
            </div>
          )}

          {/* KPIs */}
          <KpiCardGrid>
            {[
              { label: 'Receita do ano (vendas)', value: formatBRL(kpis.totalReceita), icon: DollarSign, color: '#059669' },
              { label: 'Impostos previstos', value: formatBRL(kpis.totalImpostos), icon: Calculator, color: '#E53E3E' },
              { label: 'Carga tributária', value: `${kpis.carga.toFixed(1)}%`, icon: TrendingUp, color: '#EA580C' },
              { label: 'Meses provisionados', value: kpis.meses, icon: FileText, color: '#059669' },
            ].map((kpi, i) => (
              <KpiCard
                key={i}
                label={kpi.label}
                value={kpi.value}
                valueColor={kpi.color}
              />
            ))}
          </KpiCardGrid>

          {/* Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setSelectedAno(a => a - 1)} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
              <ChevronLeft size={16} className="text-gray-500" />
            </button>
            <span className="text-sm font-medium text-gray-700 min-w-[60px] text-center">{selectedAno}</span>
            <button onClick={() => setSelectedAno(a => a + 1)} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
              <ChevronRight size={16} className="text-gray-500" />
            </button>

            <div className="flex items-center gap-2 ml-3 pl-3 border-l border-gray-200">
              <select value={mesCalc} onChange={e => setMesCalc(Number(e.target.value))}
                className="text-sm border border-gray-200 rounded-lg px-2 py-2 bg-white focus:outline-none focus:border-[#059669]">
                {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
              <button onClick={() => provisionar(compAlvo)} disabled={calculating}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: '#059669' }}>
                {calculating ? <Loader2 size={14} className="animate-spin" /> : <Calculator size={14} />}
                {jaExiste ? 'Reprovisionar' : 'Provisionar'}
              </button>
            </div>

            <div className="ml-auto">
              <ExportMenu<Apuracao>
                rows={() => apuracoes}
                titulo="PREVISÃO DE IMPOSTOS"
                baseName="previsao-impostos"
                subtitulo={String(selectedAno)}
                size="md"
                columns={[
                  { header: 'Competencia', value: a => a.competencia, align: 'center', excelWidth: 14 },
                  { header: 'Receita', value: a => formatBRL(a.receita_bruta), numericValue: a => a.receita_bruta || 0, excelWidth: 14 },
                  { header: 'Total impostos', value: a => formatBRL(a.total_impostos), numericValue: a => a.total_impostos || 0, excelWidth: 14 },
                  { header: 'Vencimento', value: a => formatData(a.data_vencimento), align: 'center', excelWidth: 14 },
                  { header: 'Status', value: a => STATUS_CFG[a.status || 'apurado']?.label || a.status, align: 'center', excelWidth: 14 },
                ]}
              />
            </div>
          </div>

          {/* Tabela */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-gray-400" size={24} /></div>
            ) : apuracoes.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-sm">
                Nenhuma previsão em {selectedAno}. Escolha um mês acima e clique em <span className="font-medium text-gray-600">Provisionar</span>.
                <div className="mt-1 text-xs">A previsão é estimada sobre as vendas da competência.</div>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white text-left text-xs font-bold text-[#1D2939] uppercase tracking-wider border-b-2 border-[#D0D5DD]">
                    <th className="px-4 py-3 border-r border-[#EAECF0]">Competência</th>
                    <th className="px-4 py-3 text-right border-r border-[#EAECF0]">Receita</th>
                    {isSimplesLike ? (
                      <>
                        <th className="px-4 py-3 text-right border-r border-[#EAECF0]">Fator R</th>
                        <th className="px-4 py-3 text-right border-r border-[#EAECF0]">Folha 12m</th>
                        <th className="px-4 py-3 border-r border-[#EAECF0]">Anexo / Faixa</th>
                        <th className="px-4 py-3 text-right border-r border-[#EAECF0]">Alíq. efet.</th>
                        <th className="px-4 py-3 text-right border-r border-[#EAECF0]">DAS</th>
                      </>
                    ) : (
                      <>
                        <th className="px-4 py-3 text-right border-r border-[#EAECF0]">DARF</th>
                        <th className="px-4 py-3 text-right border-r border-[#EAECF0]">ISS</th>
                      </>
                    )}
                    <th className="px-4 py-3 text-right border-r border-[#EAECF0]">Total</th>
                    <th className="px-4 py-3 border-r border-[#EAECF0]">Vencimento</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {apuracoes.map(a => {
                    const idx = Number(a.competencia.split('-')[1]) - 1
                    const st = STATUS_CFG[a.status || 'apurado'] || STATUS_CFG.apurado
                    const darf = (a.valor_irpj || 0) + (a.valor_csll || 0) + (a.valor_pis || 0) + (a.valor_cofins || 0)
                    const folha12m = (a.faturamento_12m && a.fator_r != null) ? (Number(a.fator_r) / 100) * Number(a.faturamento_12m) : null
                    return (
                      <tr key={a.id} className="border-b border-[#F1F3F5] hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-2 font-medium border-r border-[#F1F3F5] whitespace-nowrap">{MESES[idx]} {selectedAno}</td>
                        <td className="px-4 py-2 text-right tabular-nums border-r border-[#F1F3F5]">{formatBRL(a.receita_bruta)}</td>
                        {isSimplesLike ? (
                          <>
                            <td className="px-4 py-2 text-right tabular-nums border-r border-[#F1F3F5]">{a.fator_r != null ? `${Number(a.fator_r).toFixed(1)}%` : '—'}</td>
                            <td className="px-4 py-2 text-right tabular-nums border-r border-[#F1F3F5]" title={a.faturamento_12m ? `Receita 12m: ${formatBRL(a.faturamento_12m)}` : undefined}>{folha12m != null ? formatBRL(folha12m) : '—'}</td>
                            <td className="px-4 py-2 border-r border-[#F1F3F5] whitespace-nowrap">{a.faixa_simples ? `${a.faixa_simples}` : '—'}</td>
                            <td className="px-4 py-2 text-right tabular-nums border-r border-[#F1F3F5]">{a.aliquota_efetiva != null ? `${Number(a.aliquota_efetiva).toFixed(2)}%` : '—'}</td>
                            <td className="px-4 py-2 text-right tabular-nums border-r border-[#F1F3F5]">{formatBRL(a.valor_das)}</td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-2 text-right tabular-nums border-r border-[#F1F3F5]" title="IRPJ + CSLL + PIS + COFINS">{formatBRL(darf)}</td>
                            <td className="px-4 py-2 text-right tabular-nums border-r border-[#F1F3F5]">{formatBRL(a.valor_iss)}</td>
                          </>
                        )}
                        <td className="px-4 py-2 text-right tabular-nums font-semibold border-r border-[#F1F3F5]">{formatBRL(a.total_impostos)}</td>
                        <td className="px-4 py-2 border-r border-[#F1F3F5] whitespace-nowrap">{formatData(a.data_vencimento)}</td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ color: st.color, backgroundColor: st.bg }}>
                              {a.status === 'recolhido' && <Check size={10} />}{st.label}
                            </span>
                            {a.status !== 'recolhido' && (
                              <button onClick={() => marcarRecolhido(a.id)} className="text-[10px] font-bold text-[#059669] hover:bg-[#ECFDF4] rounded px-1.5 py-0.5">
                                Marcar recolhido
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
            <ExternalLink size={12} />
            Previsão estimada — ao provisionar, uma conta a pagar prevista é criada (dia 20). Ajuste o valor quando o contador enviar a guia.
          </p>
        </PagePanel>
      </div>

      {/* Modal: Biblioteca CNAE */}
      {cnaeOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setCnaeOpen(false)}>
          <div className="bg-white rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><BookMarked size={16} className="text-[#059669]" /> Biblioteca CNAE → tributação</h3>
              <button onClick={() => setCnaeOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            {/* Form novo */}
            <div className="p-4 border-b border-gray-100 grid grid-cols-[120px_1fr_70px_90px_90px_70px_auto] gap-2 items-end">
              <div><label className="text-[10px] text-gray-400 uppercase">Código</label><input value={novoCnae.codigo} onChange={e => setNovoCnae(v => ({ ...v, codigo: e.target.value }))} placeholder="0000-0/00" className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm" /></div>
              <div><label className="text-[10px] text-gray-400 uppercase">Descrição</label><input value={novoCnae.descricao} onChange={e => setNovoCnae(v => ({ ...v, descricao: e.target.value }))} className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm" /></div>
              <div><label className="text-[10px] text-gray-400 uppercase">Anexo</label><select value={novoCnae.anexo} onChange={e => setNovoCnae(v => ({ ...v, anexo: e.target.value }))} className="w-full border border-gray-200 rounded-md px-1 py-1.5 text-sm bg-white">{ANEXOS.map(a => <option key={a} value={a}>{a}</option>)}</select></div>
              <div><label className="text-[10px] text-gray-400 uppercase">Pres. IRPJ</label><input type="number" value={novoCnae.presIrpj} onChange={e => setNovoCnae(v => ({ ...v, presIrpj: Number(e.target.value) }))} className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm text-right" /></div>
              <div><label className="text-[10px] text-gray-400 uppercase">Pres. CSLL</label><input type="number" value={novoCnae.presCsll} onChange={e => setNovoCnae(v => ({ ...v, presCsll: Number(e.target.value) }))} className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm text-right" /></div>
              <div><label className="text-[10px] text-gray-400 uppercase">ISS %</label><input type="number" value={novoCnae.iss} onChange={e => setNovoCnae(v => ({ ...v, iss: Number(e.target.value) }))} className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm text-right" /></div>
              <button onClick={addCnaeLib} disabled={savingCnae} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-white text-sm font-medium disabled:opacity-50" style={{ backgroundColor: '#059669' }}>{savingCnae ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add</button>
            </div>

            {/* Lista */}
            <div className="overflow-y-auto p-2">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-[10px] font-bold uppercase text-gray-400">
                  <th className="px-2 py-1">Código</th><th className="px-2 py-1">Descrição</th><th className="px-2 py-1 text-center">Anexo</th><th className="px-2 py-1 text-right">IRPJ</th><th className="px-2 py-1 text-right">CSLL</th><th className="px-2 py-1 text-right">ISS</th><th className="px-2 py-1"></th>
                </tr></thead>
                <tbody>
                  {cnaeLib.map(c => (
                    <tr key={c.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                      <td className="px-2 py-1.5 font-medium whitespace-nowrap">{c.codigo}</td>
                      <td className="px-2 py-1.5 text-gray-600">{c.descricao}</td>
                      <td className="px-2 py-1.5 text-center">{c.anexo_simples || '—'}</td>
                      <td className="px-2 py-1.5 text-right">{Number(c.presuncao_irpj).toFixed(0)}%</td>
                      <td className="px-2 py-1.5 text-right">{Number(c.presuncao_csll).toFixed(0)}%</td>
                      <td className="px-2 py-1.5 text-right">{Number(c.aliquota_iss_sugerida).toFixed(0)}%</td>
                      <td className="px-2 py-1.5 text-right"><button onClick={() => delCnaeLib(c.id)} className="text-gray-400 hover:text-[#E53E3E]"><Trash2 size={13} /></button></td>
                    </tr>
                  ))}
                  {cnaeLib.length === 0 && <tr><td colSpan={7} className="px-2 py-6 text-center text-gray-400">Biblioteca vazia. Adicione CNAEs acima.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
