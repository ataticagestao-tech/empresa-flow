import type { SupabaseClient } from '@supabase/supabase-js'
import type { ResultadoBeneficios } from './calculos'
import type { BeneficiosConfig } from '../../hooks/useBeneficios'

export const confirmarBeneficiosMes = async ({
  client, companyId, employeeId, employeeNome,
  competencia, diasUteis, diasFaltas, diasConsiderados,
  config, resultado, usuarioId,
}: {
  client: SupabaseClient
  companyId: string
  employeeId: string
  employeeNome: string
  competencia: string
  diasUteis: number
  diasFaltas: number
  diasConsiderados: number
  config: BeneficiosConfig
  resultado: ResultadoBeneficios
  usuarioId: string
}): Promise<{ sucesso: boolean; erro?: string }> => {
  const [ano, mes] = competencia.split('-').map(Number)
  const vencimento = new Date(ano, mes, 0).toISOString().split('T')[0]

  try {
    // Lançamento existente desta competência — usado para evitar CPs duplicadas
    // ao reconfirmar (duplo clique, histórico desatualizado, 2 sessões, etc.).
    const { data: existente } = await (client as any)
      .from('employee_benefits_lancamentos')
      .select('id, cp_vt_id, cp_va_id, cp_vt:cp_vt_id(id,status,deleted_at), cp_va:cp_va_id(id,status,deleted_at)')
      .eq('company_id', companyId)
      .eq('employee_id', employeeId)
      .eq('competencia', competencia)
      .maybeSingle()

    // Bloqueio: se já há CP de benefício paga/parcial nesta competência, não recria nada.
    const temPagamento = (cp: any) =>
      cp && !cp.deleted_at && (cp.status === 'pago' || cp.status === 'parcial')
    if (temPagamento(existente?.cp_vt) || temPagamento(existente?.cp_va)) {
      return {
        sucesso: false,
        erro: 'Já existe benefício pago/parcial nesta competência. Cancele o pagamento antes de reconfirmar.',
      }
    }

    // Soft-delete das CPs antigas em aberto — serão recriadas com os valores atuais.
    const idsAntigos = [existente?.cp_vt_id, existente?.cp_va_id].filter(Boolean) as string[]
    if (idsAntigos.length) {
      await (client as any)
        .from('contas_pagar')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', idsAntigos)
        .is('deleted_at', null)
    }

    let cpVtId: string | null = null
    if (resultado.vtCustoEmpresa > 0) {
      const { data, error } = await (client as any)
        .from('contas_pagar')
        .insert({
          company_id: companyId,
          credor_nome: `Vale Transporte — ${employeeNome}`,
          observacoes: `VT ${competencia} — ${employeeNome}`,
          valor: resultado.vtCustoEmpresa,
          data_vencimento: vencimento,
          status: 'aberto',
        })
        .select('id')
        .single()
      if (error) throw new Error(`CP VT: ${error.message}`)
      cpVtId = data.id
    }

    let cpVaId: string | null = null
    if (resultado.vaCustoEmpresa > 0) {
      const { data, error } = await (client as any)
        .from('contas_pagar')
        .insert({
          company_id: companyId,
          credor_nome: `Vale Alimentação — ${employeeNome}`,
          observacoes: `VA ${competencia} — ${employeeNome}`,
          valor: resultado.vaCustoEmpresa,
          data_vencimento: vencimento,
          status: 'aberto',
        })
        .select('id')
        .single()
      if (error) throw new Error(`CP VA: ${error.message}`)
      cpVaId = data.id
    }

    const { error } = await (client as any)
      .from('employee_benefits_lancamentos')
      .upsert({
        company_id: companyId,
        employee_id: employeeId,
        competencia,
        dias_uteis: diasUteis,
        dias_faltas: diasFaltas,
        dias_considerados: diasConsiderados,
        vt_vales_por_dia: config.vtValesPorDia,
        vt_valor_unitario: config.vtValorUnitario,
        vt_valor_bruto: resultado.vtBruto,
        vt_desconto_func: resultado.vtDescontoFunc,
        vt_custo_empresa: resultado.vtCustoEmpresa,
        va_valor_dia: config.vaValorDia,
        va_valor_total: resultado.vaTotal,
        va_desconto_func: 0,
        va_custo_empresa: resultado.vaCustoEmpresa,
        total_custo_empresa: resultado.totalCustoEmpresa,
        total_desconto_func: resultado.totalDescontoFunc,
        cp_vt_id: cpVtId,
        cp_va_id: cpVaId,
        status: 'confirmado',
        confirmado_por: usuarioId,
        confirmado_em: new Date().toISOString(),
      }, { onConflict: 'company_id,employee_id,competencia' })

    if (error) throw new Error(`Lançamento: ${error.message}`)
    return { sucesso: true }
  } catch (e: any) {
    console.error('[confirmarBeneficiosMes]', e.message)
    return { sucesso: false, erro: e.message }
  }
}
