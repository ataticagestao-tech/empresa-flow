import { useState, useEffect, useCallback } from 'react'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { safeQuery } from '@/lib/supabaseQuery'
import { formatBRL, formatData } from '@/lib/format'
import { quitarCR, quitarCP } from '@/lib/financeiro/transacao'
import { AppLayout } from '@/components/layout/AppLayout'
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Search,
  Trash2,
  Link2,
  Plus,
  EyeOff,
  ChevronDown,
  RefreshCw,
  FileText,
  ListChecks,
  BookOpen,
  Loader2,
  History,
} from 'lucide-react'

/* ════════════════════════════════════════════════════════════════════
   Types
   ════════════════════════════════════════════════════════════════════ */

interface TransacaoOFX {
  tipo: 'credito' | 'debito'
  data: string
  valor: number
  memo: string
  fitid: string
}

interface BankTransaction {
  id: string
  company_id: string
  conta_bancaria_id: string
  data: string
  descricao: string
  valor: number
  tipo: 'credito' | 'debito'
  status_conciliacao: string
}

interface MatchRecord {
  id: string
  company_id: string
  bank_transaction_id: string
  lancamento_id: string | null
  tipo_lancamento: string | null
  status: string
  diferenca: number | null
}

interface ConciliationRule {
  id: string
  company_id: string
  padrao_descricao: string
  conta_contabil_id: string | null
  tipo: string
  ativo: boolean
  vezes_usado: number
}

interface BankAccount {
  id: string
  company_id: string
  name: string
  banco: string
}

interface CandidatoLancamento {
  id: string
  nome: string
  valor: number
  data_vencimento: string
  tipo: 'cr' | 'cp'
}

interface MatchEnriquecido {
  transacao: BankTransaction
  match: MatchRecord | null
  candidatos: CandidatoLancamento[]
  lancamento: CandidatoLancamento | null
}

/* ════════════════════════════════════════════════════════════════════
   OFX Parser
   ════════════════════════════════════════════════════════════════════ */

const parsearOFX = (conteudo: string): TransacaoOFX[] => {
  const transacoes: TransacaoOFX[] = []
  const regex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/g
  let match
  while ((match = regex.exec(conteudo)) !== null) {
    const bloco = match[1]
    const get = (tag: string) => {
      const m = new RegExp(`<${tag}>([^<]+)`).exec(bloco)
      return m ? m[1].trim() : ''
    }
    const raw = get('DTPOSTED').substring(0, 8)
    const dataFormatada =
      raw.length === 8
        ? `${raw.substring(0, 4)}-${raw.substring(4, 6)}-${raw.substring(6, 8)}`
        : ''
    transacoes.push({
      tipo: get('TRNTYPE') === 'CREDIT' ? 'credito' : 'debito',
      data: dataFormatada,
      valor: Math.abs(parseFloat(get('TRNAMT')) || 0),
      memo: get('MEMO') || get('NAME'),
      fitid: get('FITID'),
    })
  }
  return transacoes
}

/* ════════════════════════════════════════════════════════════════════
   Component
   ════════════════════════════════════════════════════════════════════ */

export default function Conciliacao() {
  const { selectedCompany } = useCompany()
  const { activeClient } = useAuth()
  const companyId = selectedCompany?.id

  // ── State ───────────────────────────────────────────────────────
  const [abaAtiva, setAbaAtiva] = useState<'conciliacao' | 'historico' | 'regras'>('conciliacao')
  const [carregando, setCarregando] = useState(false)
  const [importando, setImportando] = useState(false)

  // Upload
  const [contas, setContas] = useState<BankAccount[]>([])
  const [contaSelecionada, setContaSelecionada] = useState('')
  const [arrastando, setArrastando] = useState(false)

  // Transactions & matches
  const [matchesEnriquecidos, setMatchesEnriquecidos] = useState<MatchEnriquecido[]>([])
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())

  // Regras
  const [regras, setRegras] = useState<ConciliationRule[]>([])

  // Modal vincular
  const [modalVincular, setModalVincular] = useState<{
    transacao: BankTransaction | null
    aberto: boolean
  }>({ transacao: null, aberto: false })
  const [buscaVincular, setBuscaVincular] = useState('')
  const [candidatosVincular, setCandidatosVincular] = useState<CandidatoLancamento[]>([])
  const [buscandoVincular, setBuscandoVincular] = useState(false)

  // Modal salvar regra
  const [modalRegra, setModalRegra] = useState<{
    aberto: boolean
    descricao: string
    tipo: string
    transacaoId: string
  }>({ aberto: false, descricao: '', tipo: '', transacaoId: '' })

  // Historico from conciliacao_bancaria
  const [historicoConciliacoes, setHistoricoConciliacoes] = useState<any[]>([])
  const [carregandoHistorico, setCarregandoHistorico] = useState(false)

  const carregarHistorico = useCallback(async () => {
    if (!companyId) return
    setCarregandoHistorico(true)
    const items: any[] = []

    // Helper: safe fetch from any table
    const safeFetch = async (table: string, filters?: Record<string, any>) => {
      try {
        let q = activeClient.from(table).select('*').eq('company_id', companyId)
        if (filters) {
          for (const [key, val] of Object.entries(filters)) {
            if (Array.isArray(val)) q = q.in(key, val)
            else q = q.eq(key, val)
          }
        }
        const { data, error } = await q
        if (error) {
          console.warn('[Hist] ' + table + ' erro:', error.message)
          return []
        }
        return data || []
      } catch {
        return []
      }
    }

    try {
      // 1) CR pagas
      const crRows = await safeFetch('contas_receber', { status: ['pago', 'parcial'] })
      for (const r of crRows) {
        items.push({
          id: 'cr-' + r.id,
          descricao: (r.pagador_nome || '-') + (r.observacoes ? ' \u2014 ' + r.observacoes : ''),
          valor: r.valor_pago || r.valor,
          data: r.data_pagamento || r.data_vencimento,
          tipo: 'credito',
          status: r.status === 'pago' ? 'Pago' : 'Parcial',
          origem: 'Conta a Receber',
          forma: r.forma_recebimento || '-',
        })
      }

      // 2) CP pagas
      const cpRows = await safeFetch('contas_pagar', { status: ['pago', 'parcial'] })
      for (const r of cpRows) {
        items.push({
          id: 'cp-' + r.id,
          descricao: (r.credor_nome || '-') + (r.observacoes ? ' \u2014 ' + r.observacoes : ''),
          valor: r.valor_pago || r.valor,
          data: r.data_pagamento || r.data_vencimento,
          tipo: 'debito',
          status: r.status === 'pago' ? 'Pago' : 'Parcial',
          origem: 'Conta a Pagar',
          forma: r.forma_pagamento || '-',
        })
      }

      // 3) Movimentacoes
      const movRows = await safeFetch('movimentacoes')
      for (const r of movRows) {
        items.push({
          id: 'mov-' + r.id,
          descricao: r.descricao || '-',
          valor: r.valor,
          data: r.data,
          tipo: r.tipo || 'debito',
          status: r.status_conciliacao === 'conciliado' ? 'Conciliado' : 'Registrado',
          origem: 'Movimentacao',
          forma: r.origem || '-',
        })
      }

      // 4) bank_transactions
      const btRows = await safeFetch('bank_transactions')
      for (const r of btRows) {
        items.push({
          id: 'bt-' + r.id,
          descricao: r.descricao || r.description || r.memo || '-',
          valor: r.valor != null ? r.valor : Math.abs(r.amount || 0),
          data: r.data || r.date,
          tipo: r.tipo || (r.amount != null ? (r.amount >= 0 ? 'credito' : 'debito') : 'debito'),
          status: r.status_conciliacao || r.status || 'Importado',
          origem: 'Extrato Bancario',
          forma: '-',
        })
      }

      // 5) conciliacao_bancaria
      const cbRows = await safeFetch('conciliacao_bancaria')
      for (const r of cbRows) {
        items.push({
          id: 'cb-' + r.id,
          descricao: r.descricao_extrato || '-',
          valor: r.valor_extrato,
          data: r.data_extrato,
          tipo: r.tipo_extrato || 'debito',
          status: r.status === 'conciliado' ? 'Conciliado' : r.status || '-',
          origem: 'Conciliacao OFX',
          forma: '-',
        })
      }

      // 6) bank_reconciliation_matches
      const brmRows = await safeFetch('bank_reconciliation_matches')
      for (const r of brmRows) {
        items.push({
          id: 'brm-' + r.id,
          descricao: r.note || 'Match #' + (r.id || '').substring(0, 8),
          valor: r.matched_amount || 0,
          data: r.matched_date || (r.created_at ? r.created_at.substring(0, 10) : '-'),
          tipo: r.receivable_id ? 'credito' : 'debito',
          status: r.status === 'matched' ? 'Conciliado' : r.status || '-',
          origem: 'Match Bancario',
          forma: r.match_type || '-',
        })
      }

      items.sort((a: any, b: any) => (b.data || '').localeCompare(a.data || ''))
      setHistoricoConciliacoes(items)
    } catch (err: any) {
      console.error('[Hist] erro geral:', err)
    } finally {
      setCarregandoHistorico(false)
    }
  }, [companyId, activeClient])

    // ── KPIs ────────────────────────────────────────────────────────
  const totalImportadas = matchesEnriquecidos.length
  const conciliadasAuto = matchesEnriquecidos.filter(
    (m) => m.match?.status === 'match_auto' || m.match?.status === 'match_regra'
  ).length
  const pendentesRevisao = matchesEnriquecidos.filter(
    (m) => m.match?.status === 'match_dif' || m.match?.status === 'revisao'
  ).length
  const naoReconhecidas = matchesEnriquecidos.filter(
    (m) => m.match?.status === 'nao_reconhecido' || !m.match
  ).length

  // ── Load bank accounts ─────────────────────────────────────────
  const carregarContas = useCallback(async () => {
    if (!companyId) return
    const data = await safeQuery(
      async () =>
        await activeClient
          .from('bank_accounts')
          .select('id, company_id, name, banco')
          .eq('company_id', companyId),
      'carregar contas bancarias'
    )
    if (data) setContas(data as BankAccount[])
  }, [companyId, activeClient])

  // ── Load existing transactions & matches ───────────────────────
  const carregarDados = useCallback(async () => {
    if (!companyId) return
    setCarregando(true)
    try {
      const transacoes = await safeQuery(
        async () =>
          await activeClient
            .from('bank_transactions')
            .select('*')
            .eq('company_id', companyId)
            .order('data', { ascending: false }),
        'carregar transacoes bancarias'
      )
      if (!transacoes || (transacoes as any[]).length === 0) {
        setMatchesEnriquecidos([])
        setCarregando(false)
        return
      }

      const txList = transacoes as BankTransaction[]
      const txIds = txList.map((t) => t.id)

      const matches = await safeQuery(
        async () =>
          await activeClient
            .from('bank_reconciliation_matches')
            .select('*')
            .eq('company_id', companyId)
            .in('bank_transaction_id', txIds),
        'carregar matches'
      )
      const matchList = (matches || []) as MatchRecord[]
      const matchMap = new Map<string, MatchRecord>()
      matchList.forEach((m) => matchMap.set(m.bank_transaction_id, m))

      // Enrich with lancamento info
      const lancIds = matchList
        .filter((m) => m.lancamento_id)
        .map((m) => ({ id: m.lancamento_id!, tipo: m.tipo_lancamento }))

      const crIds = lancIds.filter((l) => l.tipo === 'cr').map((l) => l.id)
      const cpIds = lancIds.filter((l) => l.tipo === 'cp').map((l) => l.id)

      const crMap = new Map<string, CandidatoLancamento>()
      const cpMap = new Map<string, CandidatoLancamento>()

      if (crIds.length > 0) {
        const crData = await safeQuery(
          async () =>
            await activeClient
              .from('contas_receber')
              .select('id, pagador_nome, valor, data_vencimento')
              .in('id', crIds),
          'buscar CRs'
        )
        ;((crData || []) as any[]).forEach((cr: any) =>
          crMap.set(cr.id, {
            id: cr.id,
            nome: cr.pagador_nome,
            valor: cr.valor,
            data_vencimento: cr.data_vencimento,
            tipo: 'cr',
          })
        )
      }
      if (cpIds.length > 0) {
        const cpData = await safeQuery(
          async () =>
            await activeClient
              .from('contas_pagar')
              .select('id, credor_nome, valor, data_vencimento')
              .in('id', cpIds),
          'buscar CPs'
        )
        ;((cpData || []) as any[]).forEach((cp: any) =>
          cpMap.set(cp.id, {
            id: cp.id,
            nome: cp.credor_nome,
            valor: cp.valor,
            data_vencimento: cp.data_vencimento,
            tipo: 'cp',
          })
        )
      }

      const enriquecidos: MatchEnriquecido[] = txList.map((tx) => {
        const mt = matchMap.get(tx.id) || null
        let lancamento: CandidatoLancamento | null = null
        if (mt?.lancamento_id) {
          lancamento = crMap.get(mt.lancamento_id) || cpMap.get(mt.lancamento_id) || null
        }
        return { transacao: tx, match: mt, candidatos: [], lancamento }
      })

      setMatchesEnriquecidos(enriquecidos)
    } catch (err) {
      console.error('[Conciliacao] erro carregar dados:', err)
    } finally {
      setCarregando(false)
    }
  }, [companyId, activeClient])

  // ── Load rules ─────────────────────────────────────────────────
  const carregarRegras = useCallback(async () => {
    if (!companyId) return
    const data = await safeQuery(
      async () =>
        await activeClient
          .from('conciliation_rules')
          .select('*')
          .eq('company_id', companyId)
          .order('vezes_usado', { ascending: false }),
      'carregar regras'
    )
    if (data) setRegras(data as ConciliationRule[])
  }, [companyId, activeClient])

  useEffect(() => {
    carregarContas()
    carregarDados()
    carregarRegras()
    carregarHistorico()
  }, [carregarContas, carregarDados, carregarRegras, carregarHistorico])

  // ── Matching Engine ────────────────────────────────────────────
  const executarMatching = useCallback(
    async (transacoes: BankTransaction[]) => {
      if (!companyId) return

      const ruleData = await safeQuery(
        async () =>
          await activeClient
            .from('conciliation_rules')
            .select('*')
            .eq('company_id', companyId)
            .eq('ativo', true),
        'buscar regras ativas'
      )
      const rules = (ruleData || []) as ConciliationRule[]

      for (const tx of transacoes) {
        // 1. Check rules
        const regraMatch = rules.find((r) => {
          const padrao = r.padrao_descricao.toLowerCase()
          return tx.descricao.toLowerCase().includes(padrao)
        })

        if (regraMatch) {
          await activeClient.from('bank_reconciliation_matches').insert({
            company_id: companyId,
            bank_transaction_id: tx.id,
            lancamento_id: null,
            tipo_lancamento: null,
            status: 'match_regra',
            diferenca: 0,
          })
          await activeClient
            .from('conciliation_rules')
            .update({ vezes_usado: (regraMatch.vezes_usado || 0) + 1 })
            .eq('id', regraMatch.id)
          continue
        }

        // 2. Search by valor + data +-3 days
        const dataMin = new Date(tx.data)
        dataMin.setDate(dataMin.getDate() - 3)
        const dataMax = new Date(tx.data)
        dataMax.setDate(dataMax.getDate() + 3)
        const dMin = dataMin.toISOString().split('T')[0]
        const dMax = dataMax.toISOString().split('T')[0]

        let candidatos: any[] = []

        if (tx.tipo === 'credito') {
          const crData = await safeQuery(
            async () =>
              await activeClient
                .from('contas_receber')
                .select('id, pagador_nome, valor, data_vencimento')
                .eq('company_id', companyId)
                .in('status', ['pendente', 'parcial', 'vencido'])
                .gte('data_vencimento', dMin)
                .lte('data_vencimento', dMax),
            'buscar CRs candidatos'
          )
          candidatos = ((crData || []) as any[]).map((c: any) => ({ ...c, tipo_lanc: 'cr' }))
        } else {
          const cpData = await safeQuery(
            async () =>
              await activeClient
                .from('contas_pagar')
                .select('id, credor_nome, valor, data_vencimento')
                .eq('company_id', companyId)
                .in('status', ['pendente', 'parcial', 'vencido'])
                .gte('data_vencimento', dMin)
                .lte('data_vencimento', dMax),
            'buscar CPs candidatos'
          )
          candidatos = ((cpData || []) as any[]).map((c: any) => ({ ...c, tipo_lanc: 'cp' }))
        }

        // Filter by value proximity
        const valorExatos = candidatos.filter(
          (c: any) => Math.abs(c.valor - tx.valor) < 0.01
        )
        const valorProximos = candidatos.filter(
          (c: any) =>
            Math.abs(c.valor - tx.valor) >= 0.01 &&
            Math.abs(c.valor - tx.valor) <= tx.valor * 0.1
        )

        if (valorExatos.length === 1) {
          // 3. Exact match
          const cand = valorExatos[0]
          await activeClient.from('bank_reconciliation_matches').insert({
            company_id: companyId,
            bank_transaction_id: tx.id,
            lancamento_id: cand.id,
            tipo_lancamento: cand.tipo_lanc,
            status: 'match_auto',
            diferenca: 0,
          })
        } else if (valorExatos.length > 1) {
          // 4. Multiple exact: needs review
          await activeClient.from('bank_reconciliation_matches').insert({
            company_id: companyId,
            bank_transaction_id: tx.id,
            lancamento_id: null,
            tipo_lancamento: null,
            status: 'revisao',
            diferenca: null,
          })
        } else if (valorProximos.length === 1) {
          // Close value match with diff
          const cand = valorProximos[0]
          await activeClient.from('bank_reconciliation_matches').insert({
            company_id: companyId,
            bank_transaction_id: tx.id,
            lancamento_id: cand.id,
            tipo_lancamento: cand.tipo_lanc,
            status: 'match_dif',
            diferenca: Math.round((tx.valor - cand.valor) * 100) / 100,
          })
        } else {
          // 5. None
          await activeClient.from('bank_reconciliation_matches').insert({
            company_id: companyId,
            bank_transaction_id: tx.id,
            lancamento_id: null,
            tipo_lancamento: null,
            status: 'nao_reconhecido',
            diferenca: null,
          })
        }
      }
    },
    [companyId, activeClient]
  )

  // ── Handle OFX Upload ──────────────────────────────────────────
  const handleArquivo = useCallback(
    async (file: File) => {
      if (!companyId || !contaSelecionada) return
      if (!file.name.toLowerCase().endsWith('.ofx')) {
        alert('Selecione um arquivo .ofx')
        return
      }

      setImportando(true)
      try {
        const conteudo = await file.text()
        const transacoesOFX = parsearOFX(conteudo)

        if (transacoesOFX.length === 0) {
          alert('Nenhuma transacao encontrada no arquivo OFX.')
          setImportando(false)
          return
        }

        const datas = transacoesOFX.map((t) => t.data).sort()

        // Insert bank_statement_files
        const { data: stmtFile, error: errStmt } = await activeClient
          .from('bank_statement_files')
          .insert({
            company_id: companyId,
            conta_bancaria_id: contaSelecionada,
            nome_arquivo: file.name,
            data_inicio: datas[0],
            data_fim: datas[datas.length - 1],
            total_transacoes: transacoesOFX.length,
          })
          .select()
          .single()

        if (errStmt) {
          console.error('[Upload OFX] erro statement_file:', errStmt)
          alert('Erro ao salvar arquivo de extrato.')
          setImportando(false)
          return
        }

        // Insert bank_transactions
        const rows = transacoesOFX.map((t) => ({
          company_id: companyId,
          conta_bancaria_id: contaSelecionada,
          data: t.data,
          descricao: t.memo,
          valor: t.valor,
          tipo: t.tipo,
          status_conciliacao: 'pendente',
        }))

        const { data: insertedTx, error: errTx } = await activeClient
          .from('bank_transactions')
          .insert(rows)
          .select()

        if (errTx) {
          console.error('[Upload OFX] erro transactions:', errTx)
          alert('Erro ao inserir transacoes.')
          setImportando(false)
          return
        }

        // Run matching
        await executarMatching(insertedTx as BankTransaction[])

        // Reload
        await carregarDados()
        await carregarRegras()
      } catch (err) {
        console.error('[Upload OFX]', err)
        alert('Erro ao processar arquivo OFX.')
      } finally {
        setImportando(false)
      }
    },
    [companyId, contaSelecionada, activeClient, executarMatching, carregarDados, carregarRegras]
  )

  // ── Drag & drop handlers ───────────────────────────────────────
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setArrastando(true)
  }
  const onDragLeave = () => setArrastando(false)
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setArrastando(false)
    const f = e.dataTransfer.files[0]
    if (f) handleArquivo(f)
  }
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) handleArquivo(f)
    e.target.value = ''
  }

  // ── Approve single match ───────────────────────────────────────
  const aprovar = async (matchId: string, item: MatchEnriquecido) => {
    const { error } = await activeClient
      .from('bank_reconciliation_matches')
      .update({ status: 'aprovado' })
      .eq('id', matchId)

    if (error) {
      console.error('[Aprovar]', error)
      return
    }

    // If has lancamento, quitar
    if (item.lancamento && item.match) {
      const hoje = new Date().toISOString().split('T')[0]
      if (item.lancamento.tipo === 'cr') {
        await quitarCR(item.lancamento.id, {
          valorPago: item.transacao.valor,
          dataPagamento: hoje,
          formaRecebimento: 'transferencia',
          contaBancariaId: item.transacao.conta_bancaria_id,
        })
      } else {
        await quitarCP(item.lancamento.id, {
          valorPago: item.transacao.valor,
          dataPagamento: hoje,
          formaPagamento: 'transferencia',
          contaBancariaId: item.transacao.conta_bancaria_id,
        })
      }
    }

    await carregarDados()
  }

  // ── Batch approval ─────────────────────────────────────────────
  const aprovarSelecionados = async () => {
    const itens = matchesEnriquecidos.filter(
      (m) => selecionados.has(m.transacao.id) && m.match && m.match.status !== 'aprovado'
    )
    for (const item of itens) {
      if (item.match) await aprovar(item.match.id, item)
    }
    setSelecionados(new Set())
  }

  // ── Toggle selection ───────────────────────────────────────────
  const toggleSelecao = (txId: string) => {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(txId)) next.delete(txId)
      else next.add(txId)
      return next
    })
  }

  const toggleTodos = () => {
    if (selecionados.size === matchesEnriquecidos.length) {
      setSelecionados(new Set())
    } else {
      setSelecionados(new Set(matchesEnriquecidos.map((m) => m.transacao.id)))
    }
  }

  // ── Ignorar ────────────────────────────────────────────────────
  const ignorar = async (matchId: string) => {
    await activeClient
      .from('bank_reconciliation_matches')
      .update({ status: 'ignorado' })
      .eq('id', matchId)
    await carregarDados()
  }

  // ── Vincular a CP/CR ───────────────────────────────────────────
  const abrirVincular = (tx: BankTransaction) => {
    setModalVincular({ transacao: tx, aberto: true })
    setBuscaVincular('')
    setCandidatosVincular([])
  }

  const buscarCandidatos = async () => {
    if (!companyId || !modalVincular.transacao) return
    setBuscandoVincular(true)
    const tx = modalVincular.transacao
    try {
      if (tx.tipo === 'credito') {
        const data = await safeQuery(
          () =>
            activeClient
              .from('contas_receber')
              .select('id, pagador_nome, valor, data_vencimento')
              .eq('company_id', companyId)
              .in('status', ['pendente', 'parcial', 'vencido'])
              .ilike('pagador_nome', `%${buscaVincular}%`)
              .limit(20),
          'buscar CRs vincular'
        )
        setCandidatosVincular(
          ((data || []) as any[]).map((c) => ({
            id: c.id,
            nome: c.pagador_nome,
            valor: c.valor,
            data_vencimento: c.data_vencimento,
            tipo: 'cr' as const,
          }))
        )
      } else {
        const data = await safeQuery(
          () =>
            activeClient
              .from('contas_pagar')
              .select('id, credor_nome, valor, data_vencimento')
              .eq('company_id', companyId)
              .in('status', ['pendente', 'parcial', 'vencido'])
              .ilike('credor_nome', `%${buscaVincular}%`)
              .limit(20),
          'buscar CPs vincular'
        )
        setCandidatosVincular(
          ((data || []) as any[]).map((c) => ({
            id: c.id,
            nome: c.credor_nome,
            valor: c.valor,
            data_vencimento: c.data_vencimento,
            tipo: 'cp' as const,
          }))
        )
      }
    } finally {
      setBuscandoVincular(false)
    }
  }

  const vincular = async (candidato: CandidatoLancamento) => {
    if (!companyId || !modalVincular.transacao) return
    const tx = modalVincular.transacao
    const diff = Math.round((tx.valor - candidato.valor) * 100) / 100
    const status = Math.abs(diff) < 0.01 ? 'match_auto' : 'match_dif'

    const existing = matchesEnriquecidos.find((m) => m.transacao.id === tx.id)
    if (existing?.match) {
      await activeClient
        .from('bank_reconciliation_matches')
        .update({
          lancamento_id: candidato.id,
          tipo_lancamento: candidato.tipo,
          status,
          diferenca: diff,
        })
        .eq('id', existing.match.id)
    } else {
      await activeClient.from('bank_reconciliation_matches').insert({
        company_id: companyId,
        bank_transaction_id: tx.id,
        lancamento_id: candidato.id,
        tipo_lancamento: candidato.tipo,
        status,
        diferenca: diff,
      })
    }

    setModalVincular({ transacao: null, aberto: false })
    await carregarDados()
  }

  // ── Criar movimentacao (nao_reconhecido) ───────────────────────
  const criarMovimentacao = async (item: MatchEnriquecido) => {
    if (!companyId) return
    const tx = item.transacao
    const hoje = new Date().toISOString().split('T')[0]

    if (tx.tipo === 'credito') {
      const { error } = await activeClient.from('contas_receber').insert({
        company_id: companyId,
        pagador_nome: tx.descricao.substring(0, 100),
        valor: tx.valor,
        data_vencimento: tx.data,
        status: 'pago',
        data_pagamento: hoje,
      })
      if (error) {
        console.error('[CriarMov CR]', error)
        return
      }
    } else {
      const { error } = await activeClient.from('contas_pagar').insert({
        company_id: companyId,
        credor_nome: tx.descricao.substring(0, 100),
        valor: tx.valor,
        data_vencimento: tx.data,
        status: 'pago',
        data_pagamento: hoje,
      })
      if (error) {
        console.error('[CriarMov CP]', error)
        return
      }
    }

    // Ask to save rule
    setModalRegra({
      aberto: true,
      descricao: tx.descricao,
      tipo: tx.tipo,
      transacaoId: tx.id,
    })

    // Update match status
    if (item.match) {
      await activeClient
        .from('bank_reconciliation_matches')
        .update({ status: 'aprovado' })
        .eq('id', item.match.id)
    }

    await carregarDados()
  }

  // ── Salvar regra ───────────────────────────────────────────────
  const salvarRegra = async () => {
    if (!companyId || !modalRegra.descricao.trim()) return
    await activeClient.from('conciliation_rules').insert({
      company_id: companyId,
      padrao_descricao: modalRegra.descricao.trim().toLowerCase(),
      conta_contabil_id: null,
      tipo: modalRegra.tipo,
      ativo: true,
      vezes_usado: 1,
    })
    setModalRegra({ aberto: false, descricao: '', tipo: '', transacaoId: '' })
    await carregarRegras()
  }

  // ── Excluir regra ──────────────────────────────────────────────
  const excluirRegra = async (id: string) => {
    await activeClient.from('conciliation_rules').delete().eq('id', id)
    await carregarRegras()
  }

  // ── Badge helper ───────────────────────────────────────────────
  const renderBadge = (status: string, diferenca: number | null) => {
    switch (status) {
      case 'match_auto':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-[#e6f4ec] text-[#0a5c2e] border border-[#0a5c2e]">
            <CheckCircle2 size={12} /> Match automatico
          </span>
        )
      case 'match_regra':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-[#f0f4f8] text-[#1a2e4a] border border-[#1a2e4a]">
            <CheckCircle2 size={12} /> Por regra salva
          </span>
        )
      case 'match_dif':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-[#fffbe6] text-[#5c3a00] border border-[#b8960a]">
            <AlertTriangle size={12} /> Diferenca de {formatBRL(Math.abs(diferenca || 0))}
          </span>
        )
      case 'nao_reconhecido':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-[#fdecea] text-[#8b0000] border border-[#8b0000]">
            <XCircle size={12} /> Nao reconhecido
          </span>
        )
      case 'aprovado':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-[#e6f4ec] text-[#0a5c2e] border border-[#0a5c2e]">
            <CheckCircle2 size={12} /> Aprovado
          </span>
        )
      case 'ignorado':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-100 text-gray-500 border border-gray-300">
            <EyeOff size={12} /> Ignorado
          </span>
        )
      case 'revisao':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-[#fffbe6] text-[#5c3a00] border border-[#b8960a]">
            <AlertTriangle size={12} /> Pendente revisao
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-100 text-gray-500 border border-gray-300">
            Pendente
          </span>
        )
    }
  }

  // ════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════

  if (!companyId) {
    return (
      <AppLayout title="Conciliacao Bancaria">
        <div className="flex items-center justify-center h-64 text-[#555] text-sm">
          Selecione uma empresa para acessar a conciliacao bancaria.
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="Conciliacao Bancaria">
      <div className="max-w-[1400px] mx-auto space-y-4">
        {/* ── KPIs ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            {
              label: 'Total importadas',
              value: totalImportadas,
              bg: 'bg-[#f0f4f8]',
              border: 'border-[#1a2e4a]',
              text: 'text-[#1a2e4a]',
              icon: <FileText size={18} />,
            },
            {
              label: 'Conciliadas auto',
              value: conciliadasAuto,
              bg: 'bg-[#e6f4ec]',
              border: 'border-[#0a5c2e]',
              text: 'text-[#0a5c2e]',
              icon: <CheckCircle2 size={18} />,
            },
            {
              label: 'Pendentes revisao',
              value: pendentesRevisao,
              bg: 'bg-[#fffbe6]',
              border: 'border-[#b8960a]',
              text: 'text-[#5c3a00]',
              icon: <AlertTriangle size={18} />,
            },
            {
              label: 'Nao reconhecidas',
              value: naoReconhecidas,
              bg: 'bg-[#fdecea]',
              border: 'border-[#8b0000]',
              text: 'text-[#8b0000]',
              icon: <XCircle size={18} />,
            },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className={`${kpi.bg} ${kpi.border} ${kpi.text} border rounded-lg p-4 flex items-center gap-3`}
            >
              {kpi.icon}
              <div>
                <p className="text-2xl font-bold leading-none">{kpi.value}</p>
                <p className="text-[11px] uppercase tracking-wide mt-0.5 opacity-80">
                  {kpi.label}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Tabs ───────────────────────────────────────────────── */}
        <div className="flex gap-1 border-b border-[#ccc]">
          {[
            { id: 'conciliacao' as const, label: 'Conciliacao', icon: <ListChecks size={14} /> },
            { id: 'historico' as const, label: 'Historico', icon: <History size={14} /> },
            { id: 'regras' as const, label: 'Regras Salvas', icon: <BookOpen size={14} /> },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setAbaAtiva(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
                abaAtiva === tab.id
                  ? 'border-b-2 border-[#1a2e4a] text-[#1a2e4a]'
                  : 'text-[#555] hover:text-[#1a2e4a]'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* ════════════════════════════════════════════════════════
           TAB: CONCILIACAO
           ════════════════════════════════════════════════════════ */}
        {abaAtiva === 'conciliacao' && (
          <>
            {/* ── Upload OFX Card ─────────────────────────────── */}
            <div className="border border-[#ccc] rounded-lg overflow-hidden mb-4">
              <div className="bg-[#1a2e4a] px-4 py-2.5 flex items-center justify-between">
                <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">
                  Importar Extrato OFX
                </h3>
              </div>
              <div className="p-4 bg-white space-y-3">
                {/* Conta select */}
                <div>
                  <label className="block text-[11px] font-semibold text-[#0a0a0a] uppercase tracking-wider mb-1">
                    Conta Bancaria
                  </label>
                  <div className="relative">
                    <select
                      value={contaSelecionada}
                      onChange={(e) => setContaSelecionada(e.target.value)}
                      className="w-full md:w-72 appearance-none border border-[#ccc] rounded px-3 py-2 text-sm text-[#0a0a0a] bg-white focus:outline-none focus:border-[#1a2e4a] pr-8"
                    >
                      <option value="">Selecione a conta...</option>
                      {contas.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} - {c.banco}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={14}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#555] pointer-events-none"
                    />
                  </div>
                </div>

                {/* Drop zone */}
                <div
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  className={`relative border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer ${
                    arrastando
                      ? 'border-[#1a2e4a] bg-[#f0f4f8]'
                      : 'border-[#ccc] bg-[#fafafa] hover:border-[#1a2e4a] hover:bg-[#f0f4f8]'
                  } ${!contaSelecionada ? 'opacity-50 pointer-events-none' : ''}`}
                >
                  <input
                    type="file"
                    accept=".ofx"
                    onChange={onFileChange}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    disabled={!contaSelecionada || importando}
                  />
                  {importando ? (
                    <>
                      <Loader2 size={28} className="text-[#1a2e4a] animate-spin" />
                      <p className="text-sm text-[#555]">Processando extrato...</p>
                    </>
                  ) : (
                    <>
                      <Upload size={28} className="text-[#1a2e4a]" />
                      <p className="text-sm text-[#555]">
                        Arraste um arquivo <strong>.ofx</strong> ou clique para selecionar
                      </p>
                      <p className="text-[11px] text-[#999]">
                        O arquivo sera processado e as transacoes importadas automaticamente
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* ── Batch bar ───────────────────────────────────── */}
            {selecionados.size > 0 && (
              <div className="sticky top-0 z-20 bg-[#1a2e4a] text-white rounded-lg px-4 py-3 flex items-center justify-between shadow-lg">
                <span className="text-sm font-medium">
                  {selecionados.size} transac{selecionados.size === 1 ? 'ao' : 'oes'}{' '}
                  selecionada{selecionados.size === 1 ? '' : 's'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelecionados(new Set())}
                    className="px-3 py-1.5 text-xs border border-white/30 rounded hover:bg-white/10 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={aprovarSelecionados}
                    className="px-3 py-1.5 text-xs bg-white text-[#1a2e4a] font-semibold rounded hover:bg-gray-100 transition"
                  >
                    Aprovar selecionadas
                  </button>
                </div>
              </div>
            )}

            {/* ── Review Interface Card ───────────────────────── */}
            <div className="border border-[#ccc] rounded-lg overflow-hidden mb-4">
              <div className="bg-[#1a2e4a] px-4 py-2.5 flex items-center justify-between">
                <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">
                  Transacoes & Conciliacao
                </h3>
                <button
                  onClick={() => {
                    carregarDados()
                    carregarRegras()
                  }}
                  className="text-white/70 hover:text-white transition"
                  title="Recarregar"
                >
                  <RefreshCw size={14} />
                </button>
              </div>
              <div className="bg-white">
                {carregando ? (
                  <div className="flex items-center justify-center py-16 gap-2 text-[#555] text-sm">
                    <Loader2 size={18} className="animate-spin" />
                    Carregando transacoes...
                  </div>
                ) : matchesEnriquecidos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-[#555] text-sm gap-1">
                    <FileText size={32} className="text-[#ccc] mb-2" />
                    Nenhuma transacao importada.
                    <span className="text-[11px] text-[#999]">
                      Importe um extrato OFX para comecar.
                    </span>
                  </div>
                ) : (
                  <>
                    {/* Table header */}
                    <div className="hidden md:grid md:grid-cols-[40px_1fr_1fr_180px] border-b border-[#ccc] bg-[#f9f9f9] text-[10px] font-bold text-[#555] uppercase tracking-wider">
                      <div className="p-3 flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={
                            selecionados.size === matchesEnriquecidos.length &&
                            matchesEnriquecidos.length > 0
                          }
                          onChange={toggleTodos}
                          className="w-3.5 h-3.5 accent-[#1a2e4a]"
                        />
                      </div>
                      <div className="p-3">Extrato Bancario</div>
                      <div className="p-3">Lancamento no Sistema</div>
                      <div className="p-3 text-center">Acoes</div>
                    </div>

                    {/* Rows */}
                    {matchesEnriquecidos.map((item) => {
                      const tx = item.transacao
                      const mt = item.match
                      const status = mt?.status || 'pendente'
                      const isAprovado = status === 'aprovado' || status === 'ignorado'

                      return (
                        <div key={tx.id} className="border-b border-[#eee] last:border-b-0">
                          <div
                            className={`grid grid-cols-1 md:grid-cols-[40px_1fr_1fr_180px] gap-0 ${
                              isAprovado ? 'opacity-60' : ''
                            }`}
                          >
                            {/* Checkbox */}
                            <div className="p-3 flex items-start justify-center">
                              <input
                                type="checkbox"
                                checked={selecionados.has(tx.id)}
                                onChange={() => toggleSelecao(tx.id)}
                                className="w-3.5 h-3.5 accent-[#1a2e4a] mt-1"
                                disabled={isAprovado}
                              />
                            </div>

                            {/* Extrato */}
                            <div className="p-3">
                              <div className="flex items-center gap-2 mb-1">
                                <span
                                  className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                                    tx.tipo === 'credito'
                                      ? 'bg-[#e6f4ec] text-[#0a5c2e]'
                                      : 'bg-[#fdecea] text-[#8b0000]'
                                  }`}
                                >
                                  {tx.tipo === 'credito' ? 'C' : 'D'}
                                </span>
                                <span className="text-sm font-semibold text-[#0a0a0a]">
                                  {formatBRL(tx.valor)}
                                </span>
                                <span className="text-[11px] text-[#555]">
                                  {formatData(tx.data)}
                                </span>
                              </div>
                              <p className="text-xs text-[#555] truncate max-w-[400px]">
                                {tx.descricao}
                              </p>
                              <div className="mt-1.5">
                                {renderBadge(status, mt?.diferenca ?? null)}
                              </div>
                            </div>

                            {/* Lancamento */}
                            <div className="p-3">
                              {item.lancamento ? (
                                <div>
                                  <p className="text-sm font-medium text-[#0a0a0a]">
                                    {item.lancamento.nome}
                                  </p>
                                  <p className="text-xs text-[#555]">
                                    {formatBRL(item.lancamento.valor)} - Venc.{' '}
                                    {formatData(item.lancamento.data_vencimento)}
                                  </p>
                                  <span className="text-[10px] uppercase text-[#555] font-semibold">
                                    {item.lancamento.tipo === 'cr'
                                      ? 'Conta a Receber'
                                      : 'Conta a Pagar'}
                                  </span>
                                </div>
                              ) : status === 'match_regra' ? (
                                <p className="text-xs text-[#555] italic">
                                  Classificado por regra salva
                                </p>
                              ) : status === 'revisao' ? (
                                <p className="text-xs text-[#5c3a00] italic">
                                  Multiplos candidatos encontrados - vincule manualmente
                                </p>
                              ) : (
                                <p className="text-xs text-[#999] italic">
                                  Sem lancamento vinculado
                                </p>
                              )}
                            </div>

                            {/* Acoes */}
                            <div className="p-3 flex items-start justify-center gap-1.5 flex-wrap">
                              {!isAprovado && (
                                <>
                                  {mt &&
                                    (status === 'match_auto' ||
                                      status === 'match_regra' ||
                                      status === 'match_dif') && (
                                      <button
                                        onClick={() => aprovar(mt.id, item)}
                                        className="px-2.5 py-1 text-[11px] font-semibold rounded bg-[#e6f4ec] text-[#0a5c2e] border border-[#0a5c2e] hover:bg-[#d0eddb] transition"
                                      >
                                        Aprovar
                                      </button>
                                    )}
                                  {(status === 'nao_reconhecido' || status === 'revisao') && (
                                    <button
                                      onClick={() => abrirVincular(tx)}
                                      className="px-2.5 py-1 text-[11px] font-semibold rounded bg-[#f0f4f8] text-[#1a2e4a] border border-[#1a2e4a] hover:bg-[#e0e8f0] transition flex items-center gap-1"
                                    >
                                      <Link2 size={11} /> Vincular
                                    </button>
                                  )}
                                  {status === 'nao_reconhecido' && (
                                    <>
                                      <button
                                        onClick={() => criarMovimentacao(item)}
                                        className="px-2.5 py-1 text-[11px] font-semibold rounded bg-[#fffbe6] text-[#5c3a00] border border-[#b8960a] hover:bg-[#fff5cc] transition flex items-center gap-1"
                                      >
                                        <Plus size={11} /> Criar
                                      </button>
                                      {mt && (
                                        <button
                                          onClick={() => ignorar(mt.id)}
                                          className="px-2.5 py-1 text-[11px] font-semibold rounded bg-gray-100 text-gray-500 border border-gray-300 hover:bg-gray-200 transition flex items-center gap-1"
                                        >
                                          <EyeOff size={11} /> Ignorar
                                        </button>
                                      )}
                                    </>
                                  )}
                                </>
                              )}
                            </div>
                          </div>

                          {/* Footer: amber for match_dif */}
                          {status === 'match_dif' && mt?.diferenca && (
                            <div className="bg-[#fffbe6] border-t border-[#b8960a] px-4 py-2 text-[11px] text-[#5c3a00]">
                              <AlertTriangle size={12} className="inline mr-1 -mt-0.5" />
                              Diferenca de{' '}
                              <strong>{formatBRL(Math.abs(mt.diferenca))}</strong> entre o
                              extrato ({formatBRL(tx.valor)}) e o lancamento (
                              {item.lancamento ? formatBRL(item.lancamento.valor) : '--'}).
                              Verifique antes de aprovar.
                            </div>
                          )}

                          {/* Footer: red for nao_reconhecido */}
                          {status === 'nao_reconhecido' && (
                            <div className="bg-[#fdecea] border-t border-[#8b0000] px-4 py-2 text-[11px] text-[#8b0000]">
                              <XCircle size={12} className="inline mr-1 -mt-0.5" />
                              Transacao nao encontrada no sistema. Use as acoes acima para
                              criar uma movimentacao, vincular a um CP/CR existente ou
                              ignorar.
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </>
                )}
              </div>
            </div>
          </>
        )}


        {/* ════════════════════════════════════════════════════════
           TAB: HISTORICO
           ════════════════════════════════════════════════════════ */}
        {abaAtiva === 'historico' && (
          <div className="border border-[#ccc] rounded-lg overflow-hidden mb-4">
            <div className="bg-[#1a2e4a] px-4 py-2.5 flex items-center justify-between">
              <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">
                Historico de Conciliacoes
              </h3>
              <button
                onClick={carregarHistorico}
                className="text-white/70 hover:text-white transition"
                title="Recarregar"
              >
                <RefreshCw size={14} />
              </button>
            </div>
            <div className="bg-white">
              {carregandoHistorico ? (
                <div className="flex items-center justify-center py-16 gap-2 text-[#555] text-sm">
                  <Loader2 size={18} className="animate-spin" />
                  Carregando historico...
                </div>
              ) : historicoConciliacoes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-[#555] text-sm gap-1">
                  <History size={32} className="text-[#ccc] mb-2" />
                  Nenhuma conciliacao realizada ainda.
                  <span className="text-[11px] text-[#999]">
                    Conciliacoes aprovadas aparecerao aqui.
                  </span>
                </div>
              ) : (
                <>
                  <div className="px-4 py-2 bg-[#f9f9f9] border-b border-[#ccc] flex items-center justify-between">
                    <span className="text-[11px] text-[#555] font-semibold">
                      {historicoConciliacoes.length} conciliacoes encontradas
                    </span>
                  </div>
                  {/* Header */}
                  <div className="hidden md:grid md:grid-cols-[1fr_120px_100px_120px_120px_100px] border-b border-[#ccc] bg-[#f9f9f9] text-[10px] font-bold text-[#555] uppercase tracking-wider">
                    <div className="p-3">Descricao</div>
                    <div className="p-3 text-right">Valor</div>
                    <div className="p-3 text-center">Data</div>
                    <div className="p-3 text-center">Status</div>
                    <div className="p-3 text-center">Origem</div>
                    <div className="p-3 text-center">Forma</div>
                  </div>
                  {historicoConciliacoes.map((item) => (
                    <div
                      key={item.id}
                      className="grid grid-cols-1 md:grid-cols-[1fr_120px_100px_120px_120px_100px] border-b border-[#eee] last:border-b-0 hover:bg-[#fafafa]"
                    >
                      <div className="p-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                              item.tipo === 'credito'
                                ? 'bg-[#e6f4ec] text-[#0a5c2e]'
                                : 'bg-[#fdecea] text-[#8b0000]'
                            }`}
                          >
                            {item.tipo === 'credito' ? 'C' : 'D'}
                          </span>
                          <p className="text-sm text-[#0a0a0a] truncate max-w-[400px]">
                            {item.descricao}
                          </p>
                        </div>
                      </div>
                      <div className="p-3 text-right">
                        <span className={`text-sm font-semibold ${
                          item.tipo === 'credito' ? 'text-[#0a5c2e]' : 'text-[#8b0000]'
                        }`}>
                          {item.tipo === 'credito' ? '+' : '-'}{formatBRL(Math.abs(item.valor))}
                        </span>
                      </div>
                      <div className="p-3 text-center text-[11px] text-[#555]">
                        {formatData(item.data)}
                      </div>
                      <div className="p-3 flex items-center justify-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${
                          item.status === 'conciliado' || item.status === 'pago'
                            ? 'bg-[#e6f4ec] text-[#0a5c2e] border border-[#0a5c2e]'
                            : item.status === 'parcial'
                              ? 'bg-[#fffbe6] text-[#5c3a00] border border-[#b8960a]'
                              : item.status === 'pendente'
                                ? 'bg-[#f0f4f8] text-[#1a2e4a] border border-[#1a2e4a]'
                                : 'bg-gray-100 text-gray-500 border border-gray-300'
                        }`}>
                          <CheckCircle2 size={12} />
                          {item.status === 'conciliado' ? 'Conciliado'
                            : item.status === 'pago' ? 'Pago'
                            : item.status === 'parcial' ? 'Parcial'
                            : item.status === 'pendente' ? 'Pendente'
                            : item.status === 'ignorado' ? 'Ignorado'
                            : item.status}
                        </span>
                      </div>
                      <div className="p-3 text-center">
                        <span className="text-[10px] text-[#999] uppercase font-semibold">
                          {item.origem}
                        </span>
                      </div>
                      <div className="p-3 text-center">
                        <span className="text-[10px] text-[#555]">
                          {item.forma}
                        </span>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
           TAB: REGRAS SALVAS
           ════════════════════════════════════════════════════════ */}
        {abaAtiva === 'regras' && (
          <div className="border border-[#ccc] rounded-lg overflow-hidden mb-4">
            <div className="bg-[#1a2e4a] px-4 py-2.5 flex items-center justify-between">
              <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">
                Regras de Conciliacao
              </h3>
              <button
                onClick={carregarRegras}
                className="text-white/70 hover:text-white transition"
                title="Recarregar"
              >
                <RefreshCw size={14} />
              </button>
            </div>
            <div className="bg-white">
              {regras.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-[#555] text-sm gap-1">
                  <BookOpen size={32} className="text-[#ccc] mb-2" />
                  Nenhuma regra salva.
                  <span className="text-[11px] text-[#999]">
                    Regras sao criadas automaticamente ao classificar transacoes nao
                    reconhecidas.
                  </span>
                </div>
              ) : (
                <>
                  {/* Header */}
                  <div className="hidden md:grid md:grid-cols-[1fr_200px_100px_80px] border-b border-[#ccc] bg-[#f9f9f9] text-[10px] font-bold text-[#555] uppercase tracking-wider">
                    <div className="p-3">Padrao de Descricao</div>
                    <div className="p-3">Tipo</div>
                    <div className="p-3 text-center">Vezes Usada</div>
                    <div className="p-3 text-center">Acao</div>
                  </div>

                  {regras.map((r) => (
                    <div
                      key={r.id}
                      className="grid grid-cols-1 md:grid-cols-[1fr_200px_100px_80px] border-b border-[#eee] last:border-b-0"
                    >
                      <div className="p-3">
                        <p className="text-sm text-[#0a0a0a] font-medium">
                          {r.padrao_descricao}
                        </p>
                        {!r.ativo && (
                          <span className="text-[10px] text-[#8b0000] font-semibold">
                            INATIVA
                          </span>
                        )}
                      </div>
                      <div className="p-3">
                        <span
                          className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                            r.tipo === 'credito'
                              ? 'bg-[#e6f4ec] text-[#0a5c2e]'
                              : 'bg-[#fdecea] text-[#8b0000]'
                          }`}
                        >
                          {r.tipo === 'credito' ? 'Credito' : 'Debito'}
                        </span>
                      </div>
                      <div className="p-3 text-center text-sm text-[#0a0a0a] font-semibold">
                        {r.vezes_usado}
                      </div>
                      <div className="p-3 flex items-center justify-center">
                        <button
                          onClick={() => excluirRegra(r.id)}
                          className="p-1.5 rounded text-[#8b0000] hover:bg-[#fdecea] transition"
                          title="Excluir regra"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════
         MODAL: Vincular a CP/CR
         ═══════════════════════════════════════════════════════════ */}
      {modalVincular.aberto && modalVincular.transacao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="bg-[#1a2e4a] px-4 py-3 flex items-center justify-between">
              <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">
                Vincular Transacao
              </h3>
              <button
                onClick={() => setModalVincular({ transacao: null, aberto: false })}
                className="text-white/70 hover:text-white text-lg leading-none"
              >
                &times;
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="bg-[#f0f4f8] border border-[#1a2e4a] rounded p-3 text-sm">
                <p className="font-semibold text-[#1a2e4a]">
                  {modalVincular.transacao.tipo === 'credito' ? 'Credito' : 'Debito'}:{' '}
                  {formatBRL(modalVincular.transacao.valor)}
                </p>
                <p className="text-xs text-[#555] mt-0.5">
                  {modalVincular.transacao.descricao} -{' '}
                  {formatData(modalVincular.transacao.data)}
                </p>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={`Buscar ${
                    modalVincular.transacao.tipo === 'credito'
                      ? 'contas a receber'
                      : 'contas a pagar'
                  }...`}
                  value={buscaVincular}
                  onChange={(e) => setBuscaVincular(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && buscarCandidatos()}
                  className="flex-1 border border-[#ccc] rounded px-3 py-2 text-sm focus:outline-none focus:border-[#1a2e4a]"
                />
                <button
                  onClick={buscarCandidatos}
                  disabled={buscandoVincular}
                  className="px-3 py-2 bg-[#1a2e4a] text-white rounded text-sm font-semibold hover:bg-[#15253d] transition flex items-center gap-1"
                >
                  {buscandoVincular ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Search size={14} />
                  )}
                  Buscar
                </button>
              </div>

              {candidatosVincular.length > 0 && (
                <div className="max-h-60 overflow-y-auto border border-[#ccc] rounded divide-y divide-[#eee]">
                  {candidatosVincular.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => vincular(c)}
                      className="w-full text-left px-3 py-2.5 hover:bg-[#f0f4f8] transition"
                    >
                      <p className="text-sm font-medium text-[#0a0a0a]">{c.nome}</p>
                      <p className="text-xs text-[#555]">
                        {formatBRL(c.valor)} - Venc. {formatData(c.data_vencimento)}
                      </p>
                    </button>
                  ))}
                </div>
              )}

              {candidatosVincular.length === 0 && buscaVincular && !buscandoVincular && (
                <p className="text-xs text-[#999] text-center py-4">
                  Nenhum resultado encontrado. Tente outro termo.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
         MODAL: Salvar Regra
         ═══════════════════════════════════════════════════════════ */}
      {modalRegra.aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="bg-[#1a2e4a] px-4 py-3 flex items-center justify-between">
              <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">
                Salvar como Regra?
              </h3>
              <button
                onClick={() =>
                  setModalRegra({ aberto: false, descricao: '', tipo: '', transacaoId: '' })
                }
                className="text-white/70 hover:text-white text-lg leading-none"
              >
                &times;
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-[#555]">
                Deseja salvar um padrao para classificar automaticamente transacoes semelhantes
                no futuro?
              </p>

              <div>
                <label className="block text-[11px] font-semibold text-[#0a0a0a] uppercase tracking-wider mb-1">
                  Padrao de descricao
                </label>
                <input
                  type="text"
                  value={modalRegra.descricao}
                  onChange={(e) =>
                    setModalRegra((prev) => ({ ...prev, descricao: e.target.value }))
                  }
                  className="w-full border border-[#ccc] rounded px-3 py-2 text-sm focus:outline-none focus:border-[#1a2e4a]"
                  placeholder="Ex: PIX RECEBIDO FULANO"
                />
                <p className="text-[10px] text-[#999] mt-1">
                  Transacoes que contenham esse texto serao classificadas automaticamente.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() =>
                    setModalRegra({
                      aberto: false,
                      descricao: '',
                      tipo: '',
                      transacaoId: '',
                    })
                  }
                  className="px-4 py-2 text-xs border border-[#ccc] rounded text-[#555] hover:bg-gray-50 transition"
                >
                  Nao, obrigada
                </button>
                <button
                  onClick={salvarRegra}
                  className="px-4 py-2 text-xs bg-[#1a2e4a] text-white font-semibold rounded hover:bg-[#15253d] transition"
                >
                  Salvar regra
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
