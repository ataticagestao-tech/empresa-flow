import { useState, useEffect } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface BeneficiosConfig {
  id?: string
  vtAtivo: boolean
  vtValesPorDia: number
  vtValorUnitario: number
  vaAtivo: boolean
  vaValorDia: number
  regimeTrabalho: 'seg_sex' | 'seg_sab' | 'escala_6x1'
}

export const useBeneficiosConfig = (
  client: SupabaseClient,
  companyId: string,
  employeeId: string
) => {
  const [config, setConfig] = useState<BeneficiosConfig | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!companyId || !employeeId) { setLoading(false); return }
    ;(client as any)
      .from('employee_benefits_config')
      .select('*')
      .eq('company_id', companyId)
      .eq('employee_id', employeeId)
      .single()
      .then(({ data, error }: any) => {
        if (error && error.code !== 'PGRST116') {
          console.error('[useBeneficiosConfig]', error.message)
        }
        setConfig(data ? {
          id: data.id,
          vtAtivo: data.vt_ativo ?? true,
          vtValesPorDia: data.vt_vales_por_dia ?? 0,
          vtValorUnitario: Number(data.vt_valor_unitario ?? 0),
          vaAtivo: data.va_ativo ?? true,
          vaValorDia: Number(data.va_valor_dia ?? 0),
          regimeTrabalho: data.regime_trabalho ?? 'seg_sex',
        } : null)
        setLoading(false)
      })
  }, [client, companyId, employeeId])

  return { config, loading }
}

export const salvarBeneficiosConfig = async (
  client: SupabaseClient,
  companyId: string,
  employeeId: string,
  c: BeneficiosConfig
): Promise<boolean> => {
  const { error } = await (client as any)
    .from('employee_benefits_config')
    .upsert({
      company_id: companyId,
      employee_id: employeeId,
      vt_ativo: c.vtAtivo,
      vt_vales_por_dia: c.vtValesPorDia,
      vt_valor_unitario: c.vtValorUnitario,
      va_ativo: c.vaAtivo,
      va_valor_dia: c.vaValorDia,
      regime_trabalho: c.regimeTrabalho,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id,employee_id' })

  if (error) { console.error('[salvarConfig]', error.message); return false }
  return true
}

export const useBeneficiosHistorico = (
  client: SupabaseClient,
  companyId: string,
  employeeId: string
) => {
  const [historico, setHistorico] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const reload = () => {
    if (!companyId || !employeeId) { setLoading(false); return }
    setLoading(true)
    ;(client as any)
      .from('employee_benefits_lancamentos')
      .select('*')
      .eq('company_id', companyId)
      .eq('employee_id', employeeId)
      .order('competencia', { ascending: false })
      .limit(12)
      .then(({ data, error }: any) => {
        if (error) console.error('[useBeneficiosHistorico]', error.message)
        setHistorico(data || [])
        setLoading(false)
      })
  }

  useEffect(() => { reload() }, [client, companyId, employeeId])

  return { historico, loading, reload }
}
