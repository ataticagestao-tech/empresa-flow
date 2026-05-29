import type { SupabaseClient } from '@supabase/supabase-js'
import { addMonths, format } from 'date-fns'

// RAT/FAP padrão aplicado sobre os proventos (2%).
const RAT_FAP_ALIQ = 0.02

export interface EncargosResult {
  sucesso: boolean
  totalEncargos?: number
  semFolha?: boolean
  erro?: string
}

// Apura os encargos (FGTS, INSS patronal/func, IRRF, RAT/FAP) de uma
// competência a partir das folhas 'mensal' já lançadas, faz upsert na tabela
// encargos e gera as contas a pagar de FGTS/INSS/IRRF (dedup por descrição).
// Usado tanto pela tela de Encargos quanto pelo fechamento da Folha.
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
      .select('total_proventos, inss_funcionario, irrf, fgts_mes, inss_patronal')
      .eq('company_id', companyId)
      .eq('competencia', competencia)
      .eq('tipo', 'mensal')

    if (!folhas || folhas.length === 0) {
      return { sucesso: false, semFolha: true, erro: 'Nenhuma folha encontrada para esta competência.' }
    }

    const fgtsTotal = folhas.reduce((s: number, f: any) => s + (f.fgts_mes || 0), 0)
    const inssPatronal = folhas.reduce((s: number, f: any) => s + (f.inss_patronal || 0), 0)
    const inssFuncionarios = folhas.reduce((s: number, f: any) => s + (f.inss_funcionario || 0), 0)
    const irrfRetido = folhas.reduce((s: number, f: any) => s + (f.irrf || 0), 0)
    const totalProventos = folhas.reduce((s: number, f: any) => s + (f.total_proventos || 0), 0)
    const ratFap = Math.round(totalProventos * RAT_FAP_ALIQ * 100) / 100
    const totalEncargos = Math.round((fgtsTotal + inssPatronal + inssFuncionarios + irrfRetido + ratFap) * 100) / 100

    // Todas as guias (FGTS via FGTS Digital, INSS/GPS, IRRF) vencem dia 20 do mês seguinte.
    const [ano, mes] = competencia.split('-').map(Number)
    const proxMes = addMonths(new Date(ano, mes - 1, 1), 1)
    const dataVenc20 = format(new Date(proxMes.getFullYear(), proxMes.getMonth(), 20), 'yyyy-MM-dd')
    const dataVencFgts = dataVenc20
    const dataVencInss = dataVenc20
    const dataVencIrrf = dataVenc20

    const payload = {
      company_id: companyId,
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

    const { data: existing } = await db
      .from('encargos')
      .select('id')
      .eq('company_id', companyId)
      .eq('competencia', competencia)
      .maybeSingle()

    if (existing) {
      await db.from('encargos').update(payload).eq('id', existing.id)
    } else {
      await db.from('encargos').insert(payload)
    }

    const cpItems = [
      { nome: 'FGTS', valor: fgtsTotal, venc: dataVencFgts },
      { nome: 'INSS', valor: inssPatronal + inssFuncionarios, venc: dataVencInss },
      { nome: 'IRRF', valor: irrfRetido, venc: dataVencIrrf },
    ]

    for (const item of cpItems) {
      if (item.valor <= 0) continue
      const desc = `${item.nome} - ${competencia}`
      const { data: cpExist } = await db
        .from('contas_pagar')
        .select('id')
        .eq('company_id', companyId)
        .eq('descricao', desc)
        .maybeSingle()

      if (!cpExist) {
        await db.from('contas_pagar').insert({
          company_id: companyId,
          credor_nome: item.nome === 'FGTS' ? 'Caixa Economica Federal' : 'Receita Federal',
          descricao: desc,
          observacoes: 'Previsão de encargo calculada pela folha — ajustar o valor quando chegar a guia do contador.',
          valor: Math.round(item.valor * 100) / 100,
          data_vencimento: item.venc,
          status: 'aberto',
          competencia,
        })
      }
    }

    return { sucesso: true, totalEncargos }
  } catch (e: any) {
    return { sucesso: false, erro: e.message }
  }
}
