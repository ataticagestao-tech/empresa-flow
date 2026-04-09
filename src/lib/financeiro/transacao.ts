import { supabase } from '@/integrations/supabase/client'
import { safeQuery } from '@/lib/supabaseQuery'

// ─── Quitar Conta a Receber ─────────────────────────────────────
export async function quitarCR(
  crId: string,
  dados: {
    valorPago: number
    dataPagamento: string
    formaRecebimento: string
    contaBancariaId: string
    juros?: number
    desconto?: number
  }
): Promise<{ sucesso: boolean; recibo?: any; erro?: string }> {
  try {
    const cr = await safeQuery(
      () => supabase.from('contas_receber').select('*').eq('id', crId).single(),
      'buscar CR'
    )
    if (!cr) return { sucesso: false, erro: 'CR não encontrado' }

    const valorFinal = dados.valorPago + (dados.juros || 0) - (dados.desconto || 0)
    const novoValorPago = (cr.valor_pago || 0) + valorFinal
    const novoStatus = novoValorPago >= cr.valor ? 'pago' : 'parcial'

    // 1. Atualizar CR
    const { error: erroCR } = await supabase
      .from('contas_receber')
      .update({
        valor_pago: novoValorPago,
        status: novoStatus,
        data_pagamento: dados.dataPagamento,
        forma_recebimento: dados.formaRecebimento,
      })
      .eq('id', crId)
    if (erroCR) throw erroCR

    // 2. Gerar movimentação
    const { error: erroMov } = await supabase.from('movimentacoes').insert({
      company_id: cr.company_id,
      conta_bancaria_id: dados.contaBancariaId,
      conta_contabil_id: cr.conta_contabil_id,
      tipo: 'credito',
      valor: valorFinal,
      data: dados.dataPagamento,
      descricao: `Recebimento — ${cr.pagador_nome}`,
      origem: 'conta_receber',
      conta_receber_id: crId,
    })
    if (erroMov) throw erroMov

    // 3. Gerar recibo apenas se totalmente pago
    let recibo = null
    if (novoStatus === 'pago') {
      recibo = await gerarRecibo(cr, valorFinal, dados)
    }

    return { sucesso: true, recibo }
  } catch (erro: any) {
    console.error('[quitarCR]', erro)
    return { sucesso: false, erro: erro.message }
  }
}

// ─── Quitar Conta a Pagar ───────────────────────────────────────
export async function quitarCP(
  cpId: string,
  dados: {
    valorPago: number
    dataPagamento: string
    formaPagamento: string
    contaBancariaId: string
    juros?: number
    desconto?: number
  }
): Promise<{ sucesso: boolean; erro?: string }> {
  try {
    const cp = await safeQuery(
      () => supabase.from('contas_pagar').select('*').eq('id', cpId).single(),
      'buscar CP'
    )
    if (!cp) return { sucesso: false, erro: 'CP não encontrado' }

    // Não permitir pagamento duplicado — registro já quitado
    if (cp.status === 'pago') return { sucesso: true }

    const valorFinal = dados.valorPago + (dados.juros || 0) - (dados.desconto || 0)
    const novoValorPago = (cp.valor_pago || 0) + valorFinal
    const novoStatus = novoValorPago >= cp.valor ? 'pago' : 'parcial'

    // 1. Atualizar CP
    const { error: erroCP } = await supabase
      .from('contas_pagar')
      .update({
        valor_pago: novoValorPago,
        status: novoStatus,
        data_pagamento: dados.dataPagamento,
        forma_pagamento: dados.formaPagamento,
      })
      .eq('id', cpId)
    if (erroCP) throw erroCP

    // 2. Gerar movimentação
    const { error: erroMov } = await supabase.from('movimentacoes').insert({
      company_id: cp.company_id,
      conta_bancaria_id: dados.contaBancariaId,
      conta_contabil_id: cp.conta_contabil_id,
      tipo: 'debito',
      valor: valorFinal,
      data: dados.dataPagamento,
      descricao: `Pagamento — ${cp.credor_nome}`,
      origem: 'conta_pagar',
      conta_pagar_id: cpId,
    })
    if (erroMov) throw erroMov

    return { sucesso: true }
  } catch (erro: any) {
    console.error('[quitarCP]', erro)
    return { sucesso: false, erro: erro.message }
  }
}

// ─── Gerar Recibo ───────────────────────────────────────────────
export async function gerarRecibo(
  cr: any,
  valorPago: number,
  dados: { dataPagamento: string; formaRecebimento: string }
): Promise<any> {
  try {
    const { count } = await supabase
      .from('receipts')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', cr.company_id)

    const numero = (count || 0) + 1

    const { data: recibo, error } = await supabase
      .from('receipts')
      .insert({
        company_id: cr.company_id,
        numero_sequencial: numero,
        pagador_nome: cr.pagador_nome,
        pagador_cpf_cnpj: cr.pagador_cpf_cnpj,
        descricao: cr.observacoes || 'Pagamento de serviços',
        valor: valorPago,
        data_emissao: dados.dataPagamento,
        forma_pagamento: dados.formaRecebimento,
        status: 'gerado',
        contas_receber_id: cr.id,
      })
      .select()
      .single()

    if (error) {
      console.error('[gerarRecibo] erro insert:', error)
      return null
    }

    // Envio de e-mail (log apenas — integração Resend não implementada ainda)
    if (cr.pagador_email) {
      console.log(`[gerarRecibo] E-mail seria enviado para ${cr.pagador_email} — recibo #${numero}`)
    }

    return recibo
  } catch (erro: any) {
    console.error('[gerarRecibo]', erro)
    return null
  }
}

// ─── Helpers ────────────────────────────────────────────────────
export function calcularProximoVencimento(dataAtual: string, periodicidade: string): string {
  const d = new Date(dataAtual)
  switch (periodicidade) {
    case 'mensal':
      d.setMonth(d.getMonth() + 1)
      break
    case 'trimestral':
      d.setMonth(d.getMonth() + 3)
      break
    case 'semestral':
      d.setMonth(d.getMonth() + 6)
      break
    case 'anual':
      d.setFullYear(d.getFullYear() + 1)
      break
  }
  return d.toISOString().split('T')[0]
}
