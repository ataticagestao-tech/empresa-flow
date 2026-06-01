import type { SupabaseClient } from '@supabase/supabase-js'
import { addMonths, format } from 'date-fns'
import { normalizarRegime, type AnexoSimples } from '../fiscal/apuracao'
import { isSalarioPuro } from './calculo'

// Terceiros / Sistema S (SESI+SENAI+SENAC+SEBRAE+INCRA+Salário-Educação ≈ 5,8%)
const TERCEIROS_ALIQ = 0.058
// Defaults quando CNAE/empresa não trazem valor configurado
const RAT_DEFAULT_PCT = 2.0
const FAP_DEFAULT = 1.0

export interface EncargosResult {
  sucesso: boolean
  totalEncargos?: number
  recolheInssFolha?: boolean
  semFolha?: boolean
  erro?: string
}

// Apura os encargos da competência a partir das folhas 'mensal' e gera as CPs
// de previsão (FGTS sempre, IRRF se houver retenção, INSS Folha conforme regime).
//
// Regra do INSS Folha (1 guia única = Patronal + RAT×FAP + Terceiros + Retido):
//   - Simples Anexo IV       → recolhe
//   - Lucro Presumido / Real → recolhe
//   - Simples I/II/III/V     → NÃO recolhe (já está no DAS)
//   - MEI / sem regime       → NÃO recolhe
//
// RAT vem de cnae_tributacao.rat_aliquota (por código), FAP vem de
// companies.fap_fator. Anexo (Simples) vem de config_mix_tributario;
// fallback no CNAE; se ambos faltarem, assume não-IV.
export async function calcularEncargosCompetencia({
  client,
  companyId,
  competencia,
}: {
  client: SupabaseClient
  companyId: string
  competencia: string
}): Promise<EncargosResult> {
  const db = client as any

  try {
    const { data: folhas } = await db
      .from('folha_pagamento')
      .select('employee_id, total_proventos, inss_funcionario, irrf, fgts_mes, inss_patronal')
      .eq('company_id', companyId)
      .eq('competencia', competencia)
      .eq('tipo', 'mensal')
    if (!folhas || folhas.length === 0) {
      return { sucesso: false, semFolha: true, erro: 'Nenhuma folha encontrada para esta competência.' }
    }

    // Estágio/PJ/autônomo entram na folha só com o salário — não geram encargos
    // patronais. FGTS/INSS já vêm zerados da folha; aqui também os tiramos da
    // base de proventos do RAT×FAP e Terceiros.
    const empIds = [...new Set(folhas.map((f: any) => f.employee_id).filter(Boolean))]
    let salarioPuroIds = new Set<string>()
    if (empIds.length > 0) {
      const { data: emps } = await db
        .from('employees')
        .select('id, tipo_contrato')
        .in('id', empIds)
      salarioPuroIds = new Set(
        (emps || [])
          .filter((e: any) => isSalarioPuro(e.tipo_contrato))
          .map((e: any) => e.id)
      )
    }
    const folhasComEncargo = folhas.filter((f: any) => !salarioPuroIds.has(f.employee_id))

    const { data: comp } = await db
      .from('companies')
      .select('regime_tributario, cnae_principal_code, fap_fator')
      .eq('id', companyId)
      .maybeSingle()
    const regime = normalizarRegime(comp?.regime_tributario)
    const fap = Number(comp?.fap_fator) || FAP_DEFAULT
    const cnaeCode = (comp?.cnae_principal_code || '').trim()

    let ratPct = RAT_DEFAULT_PCT
    let anexo: AnexoSimples | null = null
    if (cnaeCode) {
      const { data: cnae } = await db
        .from('cnae_tributacao')
        .select('rat_aliquota, anexo_simples')
        .eq('codigo', cnaeCode)
        .maybeSingle()
      if (cnae?.rat_aliquota != null) ratPct = Number(cnae.rat_aliquota)
      if (cnae?.anexo_simples) anexo = cnae.anexo_simples as AnexoSimples
    }

    // Mix tributário sobrepõe o anexo do CNAE; se IV aparecer no mix, predomina.
    if (regime === 'simples') {
      const { data: mixRows } = await db
        .from('config_mix_tributario')
        .select('anexo_simples')
        .eq('company_id', companyId)
        .not('anexo_simples', 'is', null)
      const mixAnexos = (mixRows || [])
        .map((r: any) => r.anexo_simples as AnexoSimples)
        .filter(Boolean)
      if (mixAnexos.length > 0) {
        anexo = mixAnexos.includes('IV') ? 'IV' : mixAnexos[0]
      }
    }

    const ratFapAliq = (ratPct / 100) * fap

    const fgtsTotal = folhasComEncargo.reduce((s: number, f: any) => s + (f.fgts_mes || 0), 0)
    const inssPatronal = folhasComEncargo.reduce((s: number, f: any) => s + (f.inss_patronal || 0), 0)
    const inssFuncionarios = folhasComEncargo.reduce((s: number, f: any) => s + (f.inss_funcionario || 0), 0)
    const irrfRetido = folhasComEncargo.reduce((s: number, f: any) => s + (f.irrf || 0), 0)
    const totalProventos = folhasComEncargo.reduce((s: number, f: any) => s + (f.total_proventos || 0), 0)

    const ratFap = round2(totalProventos * ratFapAliq)
    const terceiros = round2(totalProventos * TERCEIROS_ALIQ)

    const recolheInssFolha =
      regime === 'presumido' || regime === 'real' ||
      (regime === 'simples' && anexo === 'IV')

    const inssGuia = recolheInssFolha
      ? round2(inssPatronal + ratFap + terceiros + inssFuncionarios)
      : 0
    const totalEncargos = round2(fgtsTotal + inssGuia + irrfRetido)

    const [ano, mes] = competencia.split('-').map(Number)
    const proxMes = addMonths(new Date(ano, mes - 1, 1), 1)
    const dataVenc20 = format(new Date(proxMes.getFullYear(), proxMes.getMonth(), 20), 'yyyy-MM-dd')

    const payload = {
      company_id: companyId,
      competencia,
      fgts_total: round2(fgtsTotal),
      inss_patronal: round2(inssPatronal),
      inss_funcionarios: round2(inssFuncionarios),
      irrf_retido: round2(irrfRetido),
      rat_fap: ratFap,
      terceiros,
      total_encargos: totalEncargos,
      data_venc_fgts: dataVenc20,
      data_venc_inss: dataVenc20,
      data_venc_irrf: dataVenc20,
    }

    const { data: existing } = await db.from('encargos')
      .select('id').eq('company_id', companyId).eq('competencia', competencia).maybeSingle()
    if (existing) await db.from('encargos').update(payload).eq('id', existing.id)
    else await db.from('encargos').insert(payload)

    const cpItems: Array<{ nome: string; credor: string; valor: number }> = [
      { nome: 'FGTS', credor: 'Caixa Economica Federal', valor: fgtsTotal },
    ]
    if (recolheInssFolha) {
      cpItems.push({ nome: 'INSS', credor: 'Receita Federal', valor: inssGuia })
    }
    cpItems.push({ nome: 'IRRF', credor: 'Receita Federal', valor: irrfRetido })

    for (const item of cpItems) {
      if (item.valor <= 0) continue
      const desc = `${item.nome} - ${competencia}`
      const { data: cpExist } = await db.from('contas_pagar')
        .select('id').eq('company_id', companyId).eq('descricao', desc).maybeSingle()
      if (!cpExist) {
        await db.from('contas_pagar').insert({
          company_id: companyId,
          credor_nome: item.credor,
          descricao: desc,
          observacoes: 'Previsão de encargo calculada pela folha — ajustar o valor quando chegar a guia do contador.',
          valor: round2(item.valor),
          data_vencimento: dataVenc20,
          status: 'aberto',
          competencia,
        })
      }
    }

    return { sucesso: true, totalEncargos, recolheInssFolha }
  } catch (e: any) {
    return { sucesso: false, erro: e.message }
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
