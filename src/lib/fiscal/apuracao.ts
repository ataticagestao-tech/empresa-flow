import type { SupabaseClient } from '@supabase/supabase-js'
import { addMonths, format } from 'date-fns'

// =====================================================================
// Motor de PREVISÃO de imposto (regime-aware). Estimativa que vira CP no
// dia 20; o contador manda a guia real depois.
//
// - Base de faturamento = VENDAS do mês (vendas.valor_total, deleted_at null).
// - Mix tributário por empresa (config_mix_tributario) rateia a receita por
//   faixa/atividade. Cada faixa carrega anexo (Simples) e presunção IRPJ/CSLL
//   + ISS (Presumido/Real). Sem mix, usa o padrão do regime.
// - Simples: Anexos I–V. No-mix usa Fator R (folha 12m ÷ receita 12m ≥ 28%)
//   p/ decidir III↔V. Com mix, cada faixa traz seu anexo.
// - Presumido: presunção IRPJ/CSLL por faixa; DARF (IRPJ+CSLL+PIS+COFINS) + ISS.
// - Real: estimado pelo RESULTADO (receita − despesas do mês); IRPJ/CSLL sobre
//   o lucro; PIS/COFINS não-cumulativo ~9,25% sobre a receita (sem créditos).
// - MEI: DAS fixo.
// Não calcula ICMS (orientado a serviço/NFSe).
// =====================================================================

export type RegimeNorm = 'simples' | 'presumido' | 'real' | 'mei' | null
export type AnexoSimples = 'I' | 'II' | 'III' | 'IV' | 'V'

export function normalizarRegime(r?: string | null): RegimeNorm {
  const v = (r || '').toLowerCase().trim()
  if (!v) return null
  if (v.includes('mei')) return 'mei'
  if (v.includes('simples')) return 'simples'
  if (v.includes('presumido')) return 'presumido'
  if (v.includes('real')) return 'real'
  return null
}

interface FaixaSimples { min: number; max: number; aliquota: number; deducao: number; faixa: string }

// Tabelas Simples Nacional (LC 123, vigência 2018+)
const ANEXO_I: FaixaSimples[] = [
  { min: 0, max: 180000, aliquota: 0.04, deducao: 0, faixa: 'Faixa 1' },
  { min: 180000.01, max: 360000, aliquota: 0.073, deducao: 5940, faixa: 'Faixa 2' },
  { min: 360000.01, max: 720000, aliquota: 0.095, deducao: 13860, faixa: 'Faixa 3' },
  { min: 720000.01, max: 1800000, aliquota: 0.107, deducao: 22500, faixa: 'Faixa 4' },
  { min: 1800000.01, max: 3600000, aliquota: 0.143, deducao: 87300, faixa: 'Faixa 5' },
  { min: 3600000.01, max: 4800000, aliquota: 0.19, deducao: 378000, faixa: 'Faixa 6' },
]
const ANEXO_II: FaixaSimples[] = [
  { min: 0, max: 180000, aliquota: 0.045, deducao: 0, faixa: 'Faixa 1' },
  { min: 180000.01, max: 360000, aliquota: 0.078, deducao: 5940, faixa: 'Faixa 2' },
  { min: 360000.01, max: 720000, aliquota: 0.10, deducao: 13860, faixa: 'Faixa 3' },
  { min: 720000.01, max: 1800000, aliquota: 0.112, deducao: 22500, faixa: 'Faixa 4' },
  { min: 1800000.01, max: 3600000, aliquota: 0.147, deducao: 85500, faixa: 'Faixa 5' },
  { min: 3600000.01, max: 4800000, aliquota: 0.30, deducao: 720000, faixa: 'Faixa 6' },
]
const ANEXO_III: FaixaSimples[] = [
  { min: 0, max: 180000, aliquota: 0.06, deducao: 0, faixa: 'Faixa 1' },
  { min: 180000.01, max: 360000, aliquota: 0.112, deducao: 9360, faixa: 'Faixa 2' },
  { min: 360000.01, max: 720000, aliquota: 0.135, deducao: 17640, faixa: 'Faixa 3' },
  { min: 720000.01, max: 1800000, aliquota: 0.16, deducao: 35640, faixa: 'Faixa 4' },
  { min: 1800000.01, max: 3600000, aliquota: 0.21, deducao: 125640, faixa: 'Faixa 5' },
  { min: 3600000.01, max: 4800000, aliquota: 0.33, deducao: 648000, faixa: 'Faixa 6' },
]
const ANEXO_IV: FaixaSimples[] = [
  { min: 0, max: 180000, aliquota: 0.045, deducao: 0, faixa: 'Faixa 1' },
  { min: 180000.01, max: 360000, aliquota: 0.09, deducao: 8100, faixa: 'Faixa 2' },
  { min: 360000.01, max: 720000, aliquota: 0.102, deducao: 12420, faixa: 'Faixa 3' },
  { min: 720000.01, max: 1800000, aliquota: 0.14, deducao: 39780, faixa: 'Faixa 4' },
  { min: 1800000.01, max: 3600000, aliquota: 0.22, deducao: 183780, faixa: 'Faixa 5' },
  { min: 3600000.01, max: 4800000, aliquota: 0.33, deducao: 828000, faixa: 'Faixa 6' },
]
const ANEXO_V: FaixaSimples[] = [
  { min: 0, max: 180000, aliquota: 0.155, deducao: 0, faixa: 'Faixa 1' },
  { min: 180000.01, max: 360000, aliquota: 0.18, deducao: 4500, faixa: 'Faixa 2' },
  { min: 360000.01, max: 720000, aliquota: 0.195, deducao: 9900, faixa: 'Faixa 3' },
  { min: 720000.01, max: 1800000, aliquota: 0.205, deducao: 17100, faixa: 'Faixa 4' },
  { min: 1800000.01, max: 3600000, aliquota: 0.23, deducao: 62100, faixa: 'Faixa 5' },
  { min: 3600000.01, max: 4800000, aliquota: 0.305, deducao: 540000, faixa: 'Faixa 6' },
]
const TABELAS: Record<AnexoSimples, FaixaSimples[]> = { I: ANEXO_I, II: ANEXO_II, III: ANEXO_III, IV: ANEXO_IV, V: ANEXO_V }

const FATOR_R_LIMITE = 0.28
const DAS_MEI_2025 = 76.9 // aproximado; ajustar conforme guia real

function faixaPor(rbt12: number, tabela: FaixaSimples[]): FaixaSimples {
  for (const f of tabela) if (rbt12 >= f.min && rbt12 <= f.max) return f
  return tabela[tabela.length - 1]
}
function aliqEfetivaPor(rbt12: number, tabela: FaixaSimples[]): { faixa: FaixaSimples; efetiva: number } {
  const faixa = faixaPor(rbt12, tabela)
  const efetiva = rbt12 > 0 ? (rbt12 * faixa.aliquota - faixa.deducao) / rbt12 : faixa.aliquota
  return { faixa, efetiva }
}

// Faixa do mix tributário. pct/presunções/iss em %. anexo só p/ Simples.
export interface MixFaixa {
  pct: number
  anexo?: AnexoSimples | null
  presuncaoIrpj: number
  presuncaoCsll: number
  aliquotaIss: number
}

export interface ApuracaoResultado {
  regime: RegimeNorm
  receitaBruta: number
  faturamento12m: number
  folha12m: number
  despesas: number | null      // Real
  lucroEstimado: number | null // Real
  fatorR: number | null        // fração
  anexo: string | null         // 'III', 'V', 'Misto'...
  faixaSimples: string | null
  aliquotaNominal: number | null  // fração
  aliquotaEfetiva: number | null  // fração (blended)
  valorDas: number
  valorIrpj: number
  valorCsll: number
  valorPis: number
  valorCofins: number
  valorIss: number
  darfFederal: number
  totalImpostos: number
}

// Cálculo puro (sem banco). aliquotaIss/presuncao em fração na assinatura curta.
export function calcularImposto({
  regime,
  receitaBruta,
  faturamento12m,
  folha12m,
  despesas = 0,
  aliquotaIss = 0.05,
  mix,
}: {
  regime: RegimeNorm
  receitaBruta: number
  faturamento12m: number
  folha12m: number
  despesas?: number
  aliquotaIss?: number
  mix?: MixFaixa[]
}): ApuracaoResultado {
  const base: ApuracaoResultado = {
    regime, receitaBruta, faturamento12m, folha12m,
    despesas: null, lucroEstimado: null,
    fatorR: null, anexo: null, faixaSimples: null,
    aliquotaNominal: null, aliquotaEfetiva: null,
    valorDas: 0, valorIrpj: 0, valorCsll: 0, valorPis: 0, valorCofins: 0, valorIss: 0,
    darfFederal: 0, totalImpostos: 0,
  }
  const r2 = (n: number) => Math.round(n * 100) / 100
  const temMix = !!(mix && mix.length > 0)

  if (regime === 'mei') {
    return { ...base, valorDas: DAS_MEI_2025, totalImpostos: DAS_MEI_2025 }
  }

  if (regime === 'simples') {
    const rbt12 = faturamento12m > 0 ? faturamento12m : receitaBruta * 12
    const fatorR = rbt12 > 0 ? folha12m / rbt12 : 0
    if (temMix) {
      let valorDas = 0
      const anexosUsados = new Set<string>()
      for (const f of mix!) {
        const receitaF = receitaBruta * (f.pct / 100)
        const anexo = (f.anexo || (fatorR >= FATOR_R_LIMITE ? 'III' : 'V')) as AnexoSimples
        anexosUsados.add(anexo)
        const { efetiva } = aliqEfetivaPor(rbt12, TABELAS[anexo])
        valorDas += receitaF * efetiva
      }
      valorDas = r2(valorDas)
      return {
        ...base,
        fatorR,
        anexo: anexosUsados.size === 1 ? [...anexosUsados][0] : 'Misto',
        faixaSimples: faixaPor(rbt12, ANEXO_III).faixa,
        aliquotaEfetiva: receitaBruta > 0 ? valorDas / receitaBruta : null,
        valorDas, totalImpostos: valorDas,
      }
    }
    // Sem mix: Fator R decide III/V sobre toda a receita
    const anexo: AnexoSimples = fatorR >= FATOR_R_LIMITE ? 'III' : 'V'
    const { faixa, efetiva } = aliqEfetivaPor(rbt12, TABELAS[anexo])
    const valorDas = r2(receitaBruta * efetiva)
    return {
      ...base,
      fatorR, anexo, faixaSimples: faixa.faixa,
      aliquotaNominal: faixa.aliquota, aliquotaEfetiva: efetiva,
      valorDas, totalImpostos: valorDas,
    }
  }

  if (regime === 'presumido') {
    const faixas: MixFaixa[] = temMix ? mix! : [{ pct: 100, presuncaoIrpj: 32, presuncaoCsll: 32, aliquotaIss: aliquotaIss * 100 }]
    let baseIrpj = 0, baseCsll = 0, iss = 0
    for (const f of faixas) {
      const receitaF = receitaBruta * (f.pct / 100)
      baseIrpj += receitaF * (f.presuncaoIrpj / 100)
      baseCsll += receitaF * (f.presuncaoCsll / 100)
      iss += receitaF * (f.aliquotaIss / 100)
    }
    const irpj = baseIrpj * 0.15 + Math.max(0, baseIrpj - 20000) * 0.10
    const csll = baseCsll * 0.09
    const pis = receitaBruta * 0.0065
    const cofins = receitaBruta * 0.03
    const darfFederal = r2(irpj + csll + pis + cofins)
    const total = r2(darfFederal + iss)
    return {
      ...base,
      valorIrpj: r2(irpj), valorCsll: r2(csll), valorPis: r2(pis), valorCofins: r2(cofins),
      valorIss: r2(iss), darfFederal, totalImpostos: total,
    }
  }

  if (regime === 'real') {
    const lucro = Math.max(0, receitaBruta - despesas)
    const irpj = lucro * 0.15 + Math.max(0, lucro - 20000) * 0.10
    const csll = lucro * 0.09
    // Não-cumulativo (sem créditos — estimativa conservadora): 1,65% + 7,6%
    const pis = receitaBruta * 0.0165
    const cofins = receitaBruta * 0.076
    // ISS pelo mix (ou alíquota única)
    let iss = 0
    const faixas: MixFaixa[] = temMix ? mix! : [{ pct: 100, presuncaoIrpj: 0, presuncaoCsll: 0, aliquotaIss: aliquotaIss * 100 }]
    for (const f of faixas) iss += receitaBruta * (f.pct / 100) * (f.aliquotaIss / 100)
    const darfFederal = r2(irpj + csll + pis + cofins)
    const total = r2(darfFederal + iss)
    return {
      ...base,
      despesas, lucroEstimado: lucro,
      valorIrpj: r2(irpj), valorCsll: r2(csll), valorPis: r2(pis), valorCofins: r2(cofins),
      valorIss: r2(iss), darfFederal, totalImpostos: total,
    }
  }

  return base
}

export interface ApurarResult {
  sucesso: boolean
  semRegime?: boolean
  semReceita?: boolean
  erro?: string
  resultado?: ApuracaoResultado
}

// Regex das CPs de imposto/encargo (excluídas das despesas do Lucro Real p/ não circular).
const RE_TRIBUTO = /^(DARF|ISS|DAS|DAS-MEI|FGTS|INSS|IRRF)\b/i

export async function apurarImpostoCompetencia({
  client,
  companyId,
  competencia,
}: {
  client: SupabaseClient
  companyId: string
  competencia: string
}): Promise<ApurarResult> {
  const db = client as any
  try {
    const { data: comp } = await db
      .from('companies').select('regime_tributario').eq('id', companyId).maybeSingle()

    const regime = normalizarRegime(comp?.regime_tributario)
    if (!regime) return { sucesso: false, semRegime: true, erro: 'Regime tributário não definido no cadastro da empresa.' }

    const [ano, mes] = competencia.split('-').map(Number)
    const inicioMes = `${competencia}-01`
    const fimMes = `${competencia}-31`
    const inicio12m = format(addMonths(new Date(ano, mes - 1, 1), -12), 'yyyy-MM') + '-01'
    const fim12m = format(addMonths(new Date(ano, mes - 1, 1), -1), 'yyyy-MM') + '-31'

    const [mesRes, ano12Res, folhaRes, cfgRes, mixRes] = await Promise.all([
      db.from('vendas').select('valor_total').eq('company_id', companyId).is('deleted_at', null)
        .gte('data_venda', inicioMes).lte('data_venda', fimMes),
      db.from('vendas').select('valor_total').eq('company_id', companyId).is('deleted_at', null)
        .gte('data_venda', inicio12m).lte('data_venda', fim12m),
      db.from('folha_pagamento').select('total_proventos').eq('company_id', companyId)
        .gte('competencia', format(addMonths(new Date(ano, mes - 1, 1), -12), 'yyyy-MM'))
        .lte('competencia', format(addMonths(new Date(ano, mes - 1, 1), -1), 'yyyy-MM')),
      db.from('nfse_configuracoes').select('aliquota_padrao').eq('company_id', companyId).maybeSingle(),
      db.from('config_mix_tributario')
        .select('pct_receita, anexo_simples, presuncao_irpj, presuncao_csll, aliquota_iss')
        .eq('company_id', companyId).order('ordem'),
    ])

    const somaVendas = (rows: any[]) => (rows || []).reduce((s: number, n: any) => s + (Number(n.valor_total) || 0), 0)
    const receitaBruta = somaVendas(mesRes.data)
    const faturamento12m = somaVendas(ano12Res.data)
    const folha12m = (folhaRes.data || []).reduce((s: number, f: any) => s + (Number(f.total_proventos) || 0), 0)
    const aliquotaIss = cfgRes.data?.aliquota_padrao ? Number(cfgRes.data.aliquota_padrao) / 100 : 0.03
    const mix: MixFaixa[] = (mixRes.data || []).map((m: any) => ({
      pct: Number(m.pct_receita) || 0,
      anexo: m.anexo_simples || null,
      presuncaoIrpj: Number(m.presuncao_irpj) || 0,
      presuncaoCsll: Number(m.presuncao_csll) || 0,
      aliquotaIss: Number(m.aliquota_iss) || 0,
    })).filter((m: MixFaixa) => m.pct > 0)

    if (receitaBruta <= 0 && regime !== 'mei') {
      return { sucesso: false, semReceita: true, erro: 'Nenhuma venda nesta competência para apurar.' }
    }

    // Despesas do mês (Lucro Real) — contas a pagar da competência, exceto as próprias guias.
    let despesas = 0
    if (regime === 'real') {
      const { data: cps } = await db.from('contas_pagar')
        .select('valor, descricao, status').eq('company_id', companyId)
        .eq('competencia', competencia).is('deleted_at', null)
      despesas = (cps || [])
        .filter((c: any) => c.status !== 'cancelado' && !RE_TRIBUTO.test((c.descricao || '').trim()))
        .reduce((s: number, c: any) => s + (Number(c.valor) || 0), 0)
    }

    const res = calcularImposto({ regime, receitaBruta, faturamento12m, folha12m, despesas, aliquotaIss, mix })

    const dataVenc = format(new Date(ano, mes, 20), 'yyyy-MM-dd') // dia 20 do mês seguinte
    const pct = (frac: number | null) => (frac == null ? null : Math.round(frac * 10000) / 100)
    const payload = {
      company_id: companyId,
      competencia,
      regime_tributario: regime,
      receita_bruta: res.receitaBruta,
      faturamento_12m: res.faturamento12m,
      faixa_simples: res.faixaSimples,
      aliquota_nominal: pct(res.aliquotaNominal),
      fator_r: pct(res.fatorR),
      aliquota_efetiva: pct(res.aliquotaEfetiva),
      valor_das: res.valorDas,
      valor_irpj: res.valorIrpj,
      valor_csll: res.valorCsll,
      valor_pis: res.valorPis,
      valor_cofins: res.valorCofins,
      valor_iss: res.valorIss,
      total_impostos: res.totalImpostos,
      data_vencimento: dataVenc,
      status: 'apurado',
    }

    const { data: existing } = await db.from('apuracao_impostos')
      .select('id').eq('company_id', companyId).eq('competencia', competencia).maybeSingle()
    if (existing) await db.from('apuracao_impostos').update(payload).eq('id', existing.id)
    else await db.from('apuracao_impostos').insert(payload)

    // CPs de previsão (dedup por descrição). Simples/MEI = uma guia; Presumido/Real = DARF + ISS.
    const obs = 'Previsão de imposto calculada pela apuração — ajustar o valor quando chegar a guia do contador.'
    const cps: { nome: string; credor: string; valor: number }[] = []
    if (regime === 'simples') cps.push({ nome: 'DAS Simples Nacional', credor: 'Receita Federal', valor: res.valorDas })
    else if (regime === 'mei') cps.push({ nome: 'DAS-MEI', credor: 'Receita Federal', valor: res.valorDas })
    else {
      if (res.darfFederal > 0) cps.push({ nome: 'DARF (IRPJ+CSLL+PIS+COFINS)', credor: 'Receita Federal', valor: res.darfFederal })
      if (res.valorIss > 0) cps.push({ nome: 'ISS', credor: 'Prefeitura', valor: res.valorIss })
    }

    for (const cp of cps) {
      if (cp.valor <= 0) continue
      const desc = `${cp.nome} - ${competencia}`
      const { data: cpExist } = await db.from('contas_pagar')
        .select('id').eq('company_id', companyId).eq('descricao', desc).maybeSingle()
      if (!cpExist) {
        await db.from('contas_pagar').insert({
          company_id: companyId,
          credor_nome: cp.credor,
          descricao: desc,
          observacoes: obs,
          valor: Math.round(cp.valor * 100) / 100,
          data_vencimento: dataVenc,
          status: 'aberto',
          competencia,
        })
      }
    }

    return { sucesso: true, resultado: res }
  } catch (e: any) {
    return { sucesso: false, erro: e.message }
  }
}
