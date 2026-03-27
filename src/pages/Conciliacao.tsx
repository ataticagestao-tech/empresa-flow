import { useState, useEffect, useCallback } from 'react'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { safeQuery } from '@/lib/supabaseQuery'
import { formatBRL, formatData } from '@/lib/format'
import { quitarCR, quitarCP } from '@/lib/financeiro/transacao'
import { AppLayout } from '@/components/layout/AppLayout'
import { DEFAULT_KEYWORD_RULES } from '@/modules/finance/presentation/hooks/useDefaultConciliationRules'
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
  Sparkles,
  X,
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
  reconciled_at?: string | null
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
  account_id: string | null
  palavras_chave: string[]
  confianca: 'Alta' | 'Média' | 'Baixa'
  acao: 'sugerir' | 'auto-conciliar'
  ativa: boolean
  criada_em?: string
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

interface ImportBatch {
  key: string
  imported_at: string
  min_date: string
  max_date: string
  count: number
  tx_ids: string[]
}

interface IASugestao {
  descricao_similar: string
  tipo_lancamento: 'cr' | 'cp'
  lancamento_nome: string
  confianca: number // 0-100
  categoria_id?: string | null
  categoria_nome?: string | null
}

interface ChartAccount {
  id: string
  code: string
  name: string
}

interface MatchEnriquecido {
  transacao: BankTransaction
  match: MatchRecord | null
  candidatos: CandidatoLancamento[]
  lancamento: CandidatoLancamento | null
  sugestaoIA?: IASugestao | null
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

  // Import history (batches)
  const [importBatches, setImportBatches] = useState<ImportBatch[]>([])
  const [batchExpandido, setBatchExpandido] = useState<string | null>(null)
  const [batchTransacoes, setBatchTransacoes] = useState<BankTransaction[]>([])

  // Plano de contas (for IA category suggestions)
  const [planoContas, setPlanoContas] = useState<ChartAccount[]>([])

  // Salvar conciliação
  const [salvando, setSalvando] = useState(false)

  // Sub-tab for filtering review items
  const [subTab, setSubTab] = useState<'pendentes' | 'nao_reconhecidos' | 'conciliados'>('pendentes')

  // Expanded unrecognized transaction actions
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null)

  // IA category dropdown (which tx id has dropdown open) + search term
  const [iaCatDropdownOpen, setIaCatDropdownOpen] = useState<string | null>(null)
  const [iaCatBusca, setIaCatBusca] = useState<string>('')

  // IA patterns (learned from past reconciliations)
  const [iaPatterns, setIaPatterns] = useState<Array<{
    descricao: string
    tipo_lancamento: 'cr' | 'cp'
    lancamento_nome: string
    categoria_id?: string | null
    categoria_nome?: string | null
  }>>([])

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
      // 0) Load chart_of_accounts for name lookup
      const contasMap = new Map<string, string>()
      const coaRows = await safeFetch('chart_of_accounts')
      for (const c of coaRows) {
        contasMap.set(c.id, c.code + ' - ' + c.name)
      }

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
          categoria: r.conta_contabil_id ? (contasMap.get(r.conta_contabil_id) || '-') : '-',
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
          categoria: r.conta_contabil_id ? (contasMap.get(r.conta_contabil_id) || '-') : '-',
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
          categoria: r.conta_contabil_id ? (contasMap.get(r.conta_contabil_id) || '-') : '-',
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
          categoria: r.sugestao_conta_id ? (contasMap.get(r.sugestao_conta_id) || '-') : '-',
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
          categoria: '-',
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
          categoria: '-',
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
            .order('date', { ascending: false }),
        'carregar transacoes bancarias'
      )
      if (!transacoes || (transacoes as any[]).length === 0) {
        setMatchesEnriquecidos([])
        setCarregando(false)
        return
      }

      const txList = ((transacoes || []) as any[]).map(mapDbToTx)
      const txIds = txList.map((t) => t.id)

      // Fetch matches in batches to avoid huge IN() queries
      const allMatches: any[] = []
      const batchSize = 50
      for (let i = 0; i < txIds.length; i += batchSize) {
        const batchIds = txIds.slice(i, i + batchSize)
        const batchData = await safeQuery(
          async () =>
            await activeClient
              .from('bank_reconciliation_matches')
              .select('*')
              .eq('company_id', companyId)
              .in('bank_transaction_id', batchIds),
          'carregar matches'
        )
        if (batchData) allMatches.push(...(batchData as any[]))
      }
      const matches = allMatches
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
        // Suggest IA for any non-approved transaction
        const statusNorm = mt?.status === 'pending' ? 'pendente' : (mt?.status || 'pendente')
        const needsSuggestion = !mt || ['nao_reconhecido', 'pendente', 'revisao'].includes(statusNorm)
        const sugestaoIA = needsSuggestion ? buscarSugestaoIA(tx.descricao) : null
        return { transacao: tx, match: mt, candidatos: [], lancamento, sugestaoIA }
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
          .select('id, company_id, account_id, palavras_chave, confianca, acao, ativa, criada_em')
          .eq('company_id', companyId)
          .order('criada_em', { ascending: false }),
      'carregar regras'
    )
    if (data) setRegras(data as ConciliationRule[])
  }, [companyId, activeClient])

  // ── Load plano de contas ───────────────────────────────────────
  const carregarPlanoContas = useCallback(async () => {
    if (!companyId) return
    const data = await safeQuery(
      async () =>
        await activeClient
          .from('chart_of_accounts')
          .select('id, code, name')
          .eq('company_id', companyId)
          .eq('is_analytical', true)
          .order('code', { ascending: true }),
      'carregar plano de contas'
    )
    if (data) setPlanoContas(data as ChartAccount[])
  }, [companyId, activeClient])

  // ── Load import batches ───────────────────────────────────────
  const carregarImportBatches = useCallback(async () => {
    if (!companyId) return
    const allTx = await safeQuery(
      async () =>
        await activeClient
          .from('bank_transactions')
          .select('id, date, created_at, fit_id')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false }),
      'carregar import batches'
    )
    if (!allTx || !(allTx as any[]).length) {
      setImportBatches([])
      return
    }
    const groups = new Map<string, ImportBatch>()
    for (const tx of allTx as any[]) {
      const createdMinute = tx.created_at?.substring(0, 16) || 'unknown'
      const groupKey = `import_${createdMinute}`
      const existing = groups.get(groupKey)
      if (existing) {
        existing.count++
        existing.tx_ids.push(tx.id)
        if (tx.date < existing.min_date) existing.min_date = tx.date
        if (tx.date > existing.max_date) existing.max_date = tx.date
      } else {
        groups.set(groupKey, {
          key: groupKey,
          imported_at: tx.created_at,
          min_date: tx.date,
          max_date: tx.date,
          count: 1,
          tx_ids: [tx.id],
        })
      }
    }
    const result = Array.from(groups.values())
    result.sort((a, b) => new Date(b.imported_at).getTime() - new Date(a.imported_at).getTime())
    setImportBatches(result)
  }, [companyId, activeClient])

  // ── Load IA patterns (from past approved reconciliations + categorized tx) ──
  const carregarIAPatterns = useCallback(async () => {
    if (!companyId) return
    // Load reconciled bank_transactions with their matched CR/CP info + category
    const reconciledTx = await safeQuery(
      async () =>
        await activeClient
          .from('bank_transactions')
          .select('id, description, memo, amount, reconciled_payable_id, reconciled_receivable_id, sugestao_conta_id')
          .eq('company_id', companyId)
          .not('description', 'is', null)
          .limit(500),
      'carregar padroes IA'
    )
    if (!reconciledTx || !(reconciledTx as any[]).length) return

    // Load chart_of_accounts for category name lookup
    const coaData = await safeQuery(
      async () =>
        await activeClient
          .from('chart_of_accounts')
          .select('id, code, name')
          .eq('company_id', companyId),
      'carregar categorias IA'
    )
    const catMap = new Map<string, string>()
    for (const c of (coaData || []) as any[]) catMap.set(c.id, `${c.code} - ${c.name}`)

    const patterns: typeof iaPatterns = []
    const txList = (reconciledTx as any[]).filter(t => t.reconciled_payable_id || t.reconciled_receivable_id || t.sugestao_conta_id)

    // Gather CR/CP IDs to fetch names
    const crIds = txList.filter(t => t.reconciled_receivable_id).map(t => t.reconciled_receivable_id)
    const cpIds = txList.filter(t => t.reconciled_payable_id).map(t => t.reconciled_payable_id)

    const crNomes = new Map<string, string>()
    const cpNomes = new Map<string, string>()

    if (crIds.length > 0) {
      const crData = await safeQuery(
        async () => await activeClient.from('contas_receber').select('id, pagador_nome').in('id', crIds) as any,
        'buscar nomes CR para IA'
      )
      for (const c of (crData || []) as any[]) crNomes.set(c.id, c.pagador_nome || 'Recebimento')
    }
    if (cpIds.length > 0) {
      const cpData = await safeQuery(
        async () => await activeClient.from('contas_pagar').select('id, credor_nome').in('id', cpIds) as any,
        'buscar nomes CP para IA'
      )
      for (const c of (cpData || []) as any[]) cpNomes.set(c.id, c.credor_nome || 'Pagamento')
    }

    for (const tx of txList) {
      const desc = (tx.description || tx.memo || '').trim()
      if (desc.length < 3) continue

      const catId = tx.sugestao_conta_id || null
      const catNome = catId ? catMap.get(catId) || null : null

      if (tx.reconciled_receivable_id && crNomes.has(tx.reconciled_receivable_id)) {
        patterns.push({
          descricao: desc.toLowerCase(),
          tipo_lancamento: 'cr',
          lancamento_nome: crNomes.get(tx.reconciled_receivable_id)!,
          categoria_id: catId,
          categoria_nome: catNome,
        })
      } else if (tx.reconciled_payable_id && cpNomes.has(tx.reconciled_payable_id)) {
        patterns.push({
          descricao: desc.toLowerCase(),
          tipo_lancamento: 'cp',
          lancamento_nome: cpNomes.get(tx.reconciled_payable_id)!,
          categoria_id: catId,
          categoria_nome: catNome,
        })
      } else if (catId) {
        // Transaction only has category, no CR/CP match
        patterns.push({
          descricao: desc.toLowerCase(),
          tipo_lancamento: Number(tx.amount || 0) >= 0 ? 'cr' : 'cp',
          lancamento_nome: catNome || 'Categorizado',
          categoria_id: catId,
          categoria_nome: catNome,
        })
      }
    }

    setIaPatterns(patterns)
  }, [companyId, activeClient])

  // ── IA: find suggestion for a description ─────────────────────
  const buscarSugestaoIA = useCallback(
    (descricao: string): IASugestao | null => {
      if (!descricao) return null
      const descLower = descricao.toLowerCase()
      const descUpper = descricao.toUpperCase()

      // 0. Check DEFAULT_KEYWORD_RULES first (always available, no history needed)
      for (const rule of DEFAULT_KEYWORD_RULES) {
        for (const keyword of rule.keywords) {
          if (descUpper.includes(keyword)) {
            // Find matching plano de contas entry
            const catMatch = planoContas.find(c => c.code === rule.accountCode)
            return {
              descricao_similar: keyword,
              tipo_lancamento: rule.accountCode.startsWith('1') ? 'cr' as const : 'cp' as const,
              lancamento_nome: `${rule.accountCode} — ${rule.accountName}`,
              confianca: rule.confidence,
              categoria_id: catMatch?.id || null,
              categoria_nome: catMatch ? `${catMatch.code} - ${catMatch.name}` : `${rule.accountCode} - ${rule.accountName}`,
            }
          }
        }
      }

      if (iaPatterns.length === 0) return null

      // 1. Exact match from history
      const exact = iaPatterns.find(p => p.descricao === descLower)
      if (exact) return { ...exact, descricao_similar: exact.descricao, confianca: 100, categoria_id: exact.categoria_id, categoria_nome: exact.categoria_nome }

      // 2. Contains match (description contains pattern or vice-versa)
      const contains = iaPatterns.find(
        p => descLower.includes(p.descricao) || p.descricao.includes(descLower)
      )
      if (contains) return { ...contains, descricao_similar: contains.descricao, confianca: 85, categoria_id: contains.categoria_id, categoria_nome: contains.categoria_nome }

      // 3. Word overlap (at least 2 significant words in common)
      const descWords = descLower.split(/\s+/).filter(w => w.length > 3)
      if (descWords.length >= 2) {
        let bestMatch: typeof iaPatterns[0] | null = null
        let bestScore = 0
        for (const p of iaPatterns) {
          const pWords = p.descricao.split(/\s+/).filter(w => w.length > 3)
          const commonWords = descWords.filter(w => pWords.some(pw => pw.includes(w) || w.includes(pw)))
          const score = commonWords.length / Math.max(descWords.length, pWords.length)
          if (score > bestScore && commonWords.length >= 2) {
            bestScore = score
            bestMatch = p
          }
        }
        if (bestMatch && bestScore >= 0.4) {
          return {
            ...bestMatch,
            descricao_similar: bestMatch.descricao,
            confianca: Math.round(bestScore * 80),
          }
        }
      }

      return null
    },
    [iaPatterns, planoContas]
  )

  // ── Salvar Conciliação (batch approve all matched) ────────────
  const salvarConciliacao = useCallback(async () => {
    if (!companyId) return
    setSalvando(true)
    try {
      const agora = new Date().toISOString()
      const pendentes = matchesEnriquecidos.filter(
        m => m.match && (m.match.status === 'match_auto' || m.match.status === 'match_regra' || m.match.status === 'match_dif')
      )

      for (const item of pendentes) {
        if (!item.match) continue

        // Update match status
        await activeClient
          .from('bank_reconciliation_matches')
          .update({ status: 'aprovado' })
          .eq('id', item.match.id)

        // Update bank_transaction
        await activeClient
          .from('bank_transactions')
          .update({
            status: 'reconciled',
            reconciled_at: agora,
          })
          .eq('id', item.transacao.id)

        // If has lancamento, quitar
        if (item.lancamento && item.match) {
          const hoje = agora.split('T')[0]
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

        // Learn pattern for IA
        const desc = item.transacao.descricao?.trim()
        if (desc && desc.length >= 3 && item.lancamento) {
          const alreadyExists = iaPatterns.some(p => p.descricao === desc.toLowerCase())
          if (!alreadyExists) {
            setIaPatterns(prev => [
              ...prev,
              {
                descricao: desc.toLowerCase(),
                tipo_lancamento: item.lancamento!.tipo as 'cr' | 'cp',
                lancamento_nome: item.lancamento!.nome,
              },
            ])
          }
        }
      }

      // Update local state instead of reloading
      setMatchesEnriquecidos(prev => prev.map(m => {
        if (m.match && ['match_auto', 'match_regra', 'match_dif'].includes(m.match.status)) {
          return { ...m, match: { ...m.match, status: 'aprovado' } }
        }
        return m
      }))
      alert(`Conciliacao salva! ${pendentes.length} transacoes aprovadas.`)
    } catch (err) {
      console.error('[SalvarConciliacao]', err)
      alert('Erro ao salvar conciliacao.')
    } finally {
      setSalvando(false)
    }
  }, [companyId, activeClient, matchesEnriquecidos, iaPatterns])

  // ── Delete import batch ───────────────────────────────────────
  const excluirImportBatch = useCallback(async (txIds: string[]) => {
    if (!confirm(`Excluir ${txIds.length} transacoes deste lote?`)) return
    const batchSize = 50
    for (let i = 0; i < txIds.length; i += batchSize) {
      const batch = txIds.slice(i, i + batchSize)
      await activeClient.from('bank_transactions').delete().in('id', batch)
      // Also delete matches
      await activeClient.from('bank_reconciliation_matches').delete().in('bank_transaction_id', batch)
    }
    await carregarDados()
    await carregarImportBatches()
  }, [activeClient, carregarDados, carregarImportBatches])

  // ── Expand batch to show its transactions ──────────────────────
  const expandirBatch = useCallback(async (batch: ImportBatch) => {
    if (batchExpandido === batch.key) {
      setBatchExpandido(null)
      setBatchTransacoes([])
      return
    }
    setBatchExpandido(batch.key)
    const batchSize = 50
    const allTx: any[] = []
    for (let i = 0; i < batch.tx_ids.length; i += batchSize) {
      const ids = batch.tx_ids.slice(i, i + batchSize)
      const data = await safeQuery(
        async () => await activeClient.from('bank_transactions').select('*').in('id', ids),
        'carregar transacoes do lote'
      )
      if (data) allTx.push(...(data as any[]))
    }
    setBatchTransacoes(allTx.map(mapDbToTx))
  }, [batchExpandido, activeClient])

  // ── Categorize transaction (set category_id) ──────────────────
  const categorizarTransacao = useCallback(async (txId: string, categoryId: string) => {
    const { error } = await activeClient
      .from('bank_transactions')
      .update({
        sugestao_conta_id: categoryId,
        metodo_match: 'manual',
        confianca_match: 100,
      })
      .eq('id', txId)
    if (error) {
      console.error('[Categorizar] erro:', error)
      alert('Erro ao categorizar: ' + error.message)
      return
    }
    // Update local state instead of reloading everything
    const catName = planoContas.find(c => c.id === categoryId)
    setMatchesEnriquecidos(prev => prev.map(item => {
      if (item.transacao.id === txId) {
        return {
          ...item,
          sugestaoIA: catName ? {
            descricao_similar: '',
            tipo_lancamento: item.transacao.tipo === 'credito' ? 'cr' as const : 'cp' as const,
            lancamento_nome: `${catName.code} - ${catName.name}`,
            confianca: 100,
            categoria_id: categoryId,
            categoria_nome: `${catName.code} - ${catName.name}`,
          } : item.sugestaoIA,
        }
      }
      return item
    }))
  }, [activeClient, planoContas])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!companyId) return
    carregarContas()
    carregarRegras()
    carregarHistorico()
    carregarImportBatches()
    carregarPlanoContas()
    // Load IA patterns first, then data (so suggestions work)
    carregarIAPatterns().then(() => carregarDados())
  }, [companyId])

  // Re-enrich with IA suggestions when patterns change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (iaPatterns.length > 0 && matchesEnriquecidos.length > 0) {
      setMatchesEnriquecidos(prev => prev.map(item => {
        const statusNorm = item.match?.status === 'pending' ? 'pendente' : (item.match?.status || 'pendente')
        const needsSuggestion = !item.match || ['nao_reconhecido', 'pendente', 'revisao'].includes(statusNorm)
        if (needsSuggestion && !item.sugestaoIA) {
          return { ...item, sugestaoIA: buscarSugestaoIA(item.transacao.descricao) }
        }
        return item
      }))
    }
  }, [iaPatterns])

  // Close category dropdown when clicking outside
  useEffect(() => {
    if (!iaCatDropdownOpen) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-cat-dropdown]')) {
        setIaCatDropdownOpen(null)
        setIaCatBusca('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [iaCatDropdownOpen])

  // ── Matching Engine ────────────────────────────────────────────
  const executarMatching = useCallback(
    async (transacoes: BankTransaction[]) => {
      if (!companyId) return

      const ruleData = await safeQuery(
        async () =>
          await activeClient
            .from('conciliation_rules')
            .select('id, company_id, account_id, palavras_chave, confianca, acao, ativa')
            .eq('company_id', companyId)
            .eq('ativa', true),
        'buscar regras ativas'
      )
      const rules = (ruleData || []) as ConciliationRule[]

      for (const tx of transacoes) {
        // 1. Check rules (palavras_chave array match)
        const descUpper = tx.descricao.toUpperCase()
        let regraMatch: ConciliationRule | null = null
        let melhorScore = 0

        for (const r of rules) {
          const palavras = r.palavras_chave || []
          const matches = palavras.filter(kw => descUpper.includes(kw.toUpperCase()))
          if (matches.length > 0) {
            const score = Math.round((matches.length / palavras.length) * 100)
            if (score > melhorScore) {
              melhorScore = score
              regraMatch = r
            }
          }
        }

        if (regraMatch) {
          // Gravar sugestão da IA na bank_transaction
          const confiancaNum = regraMatch.confianca === 'Alta' ? 90 : regraMatch.confianca === 'Média' ? 65 : 40
          await activeClient
            .from('bank_transactions')
            .update({
              sugestao_conta_id: regraMatch.account_id,
              confianca_match: Math.max(melhorScore, confiancaNum),
              metodo_match: 'regra',
            })
            .eq('id', tx.id)

          await activeClient.from('bank_reconciliation_matches').insert({
            company_id: companyId,
            bank_transaction_id: tx.id,
            lancamento_id: null,
            tipo_lancamento: null,
            status: 'match_regra',
            diferenca: 0,
          })
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

  // ── Helper: map DB row (English cols) to internal BankTransaction ──
  const mapDbToTx = (r: any): BankTransaction => ({
    id: r.id,
    company_id: r.company_id,
    conta_bancaria_id: r.bank_account_id,
    data: r.date,
    descricao: r.description || r.memo || '',
    valor: Math.abs(Number(r.amount || 0)),
    tipo: Number(r.amount || 0) >= 0 ? 'credito' : 'debito',
    status_conciliacao: r.status || 'pendente',
    reconciled_at: r.reconciled_at || null,
  })

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

        // Insert bank_transactions with correct DB column names
        const rows = transacoesOFX.map((t) => ({
          company_id: companyId,
          bank_account_id: contaSelecionada,
          date: t.data,
          description: t.memo,
          memo: '',
          amount: t.tipo === 'debito' ? -Math.abs(t.valor) : Math.abs(t.valor),
          fit_id: t.fitid || `ofx_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          status: 'pending',
        }))

        const { data: insertedTx, error: errTx } = await activeClient
          .from('bank_transactions')
          .upsert(rows, { onConflict: 'bank_account_id,fit_id', ignoreDuplicates: true })
          .select()

        if (errTx) {
          console.error('[Upload OFX] erro transactions:', errTx)
          alert('Erro ao inserir transacoes.')
          setImportando(false)
          return
        }

        // Map DB rows to internal BankTransaction format
        const mapped = ((insertedTx || []) as any[]).map(mapDbToTx)

        // Run matching
        await executarMatching(mapped)

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
    const agora = new Date().toISOString()

    // 1. Atualizar status do match
    const { error } = await activeClient
      .from('bank_reconciliation_matches')
      .update({ status: 'aprovado' })
      .eq('id', matchId)

    if (error) {
      console.error('[Aprovar]', error)
      return
    }

    // 2. Atualizar status da bank_transaction para 'reconciled'
    const { error: btError } = await activeClient
      .from('bank_transactions')
      .update({
        status: 'reconciled',
        reconciled_at: agora,
        reconciled_by: null, // será preenchido se tiver user id
      })
      .eq('id', item.transacao.id)

    if (btError) {
      console.error('[Aprovar] erro ao atualizar bank_transaction:', btError)
    }

    // 3. If has lancamento, quitar
    if (item.lancamento && item.match) {
      const hoje = agora.split('T')[0]
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

    // 4. Update local state
    setMatchesEnriquecidos(prev => prev.map(m => {
      if (m.match?.id === matchId) {
        return {
          ...m,
          match: { ...m.match!, status: 'aprovado' },
          transacao: { ...m.transacao, status_conciliacao: 'reconciled' },
        }
      }
      return m
    }))
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

  // ── Ignorar (com ou sem match existente) ──────────────────────
  const ignorarTransacao = async (txId: string, matchId: string | null) => {
    if (matchId) {
      await activeClient
        .from('bank_reconciliation_matches')
        .update({ status: 'ignorado' })
        .eq('id', matchId)
    } else if (companyId) {
      // Create a new match with status ignorado
      await activeClient.from('bank_reconciliation_matches').insert({
        company_id: companyId,
        bank_transaction_id: txId,
        lancamento_id: null,
        tipo_lancamento: null,
        status: 'ignorado',
        diferenca: null,
      })
    }
    // Atualizar bank_transactions.status para 'ignored'
    await activeClient
      .from('bank_transactions')
      .update({ status: 'ignored' })
      .eq('id', txId)
    // Update local state
    setMatchesEnriquecidos(prev => prev.map(m => {
      if (m.transacao.id === txId) {
        const updatedMatch: MatchRecord = m.match
          ? { ...m.match, status: 'ignorado' }
          : { id: 'temp-' + Date.now(), company_id: companyId || '', bank_transaction_id: txId, lancamento_id: null, tipo_lancamento: null, status: 'ignorado', diferenca: null }
        return { ...m, match: updatedMatch }
      }
      return m
    }))
  }

  // ── Vincular a CP/CR ───────────────────────────────────────────
  const abrirVincular = (tx: BankTransaction) => {
    setModalVincular({ transacao: tx, aberto: true })
    setBuscaVincular('')
    setCandidatosVincular([])
    // Auto-load candidates on open
    setTimeout(() => buscarCandidatosParaTx(tx, ''), 100)
  }

  const buscarCandidatosParaTx = async (tx: BankTransaction, termo: string) => {
    if (!companyId) return
    setBuscandoVincular(true)
    try {
      const allCandidatos: CandidatoLancamento[] = []

      // Always fetch both CR and CP
      const crData = await safeQuery(
        async () => {
          let q = activeClient
            .from('contas_receber')
            .select('id, pagador_nome, valor, data_vencimento')
            .eq('company_id', companyId)
            .in('status', ['pendente', 'parcial', 'vencido'])
          if (termo) q = q.ilike('pagador_nome', `%${termo}%`)
          return await q.limit(20)
        },
        'buscar CRs vincular'
      )
      for (const c of ((crData || []) as any[])) {
        allCandidatos.push({
          id: c.id,
          nome: c.pagador_nome,
          valor: c.valor,
          data_vencimento: c.data_vencimento,
          tipo: 'cr' as const,
        })
      }

      const cpData = await safeQuery(
        async () => {
          let q = activeClient
            .from('contas_pagar')
            .select('id, credor_nome, valor, data_vencimento')
            .eq('company_id', companyId)
            .in('status', ['pendente', 'parcial', 'vencido'])
          if (termo) q = q.ilike('credor_nome', `%${termo}%`)
          return await q.limit(20)
        },
        'buscar CPs vincular'
      )
      for (const c of ((cpData || []) as any[])) {
        allCandidatos.push({
          id: c.id,
          nome: c.credor_nome,
          valor: c.valor,
          data_vencimento: c.data_vencimento,
          tipo: 'cp' as const,
        })
      }

      // Sort by value proximity to transaction
      allCandidatos.sort((a, b) => Math.abs(a.valor - tx.valor) - Math.abs(b.valor - tx.valor))

      setCandidatosVincular(allCandidatos.slice(0, 20))
    } finally {
      setBuscandoVincular(false)
    }
  }

  const buscarCandidatos = async () => {
    if (!modalVincular.transacao) return
    await buscarCandidatosParaTx(modalVincular.transacao, buscaVincular)
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
    // Update local state
    setMatchesEnriquecidos(prev => prev.map(m => {
      if (m.transacao.id === tx.id) {
        const matchRecord: MatchRecord = {
          id: existing?.match?.id || 'temp-' + Date.now(),
          company_id: companyId,
          bank_transaction_id: tx.id,
          lancamento_id: candidato.id,
          tipo_lancamento: candidato.tipo,
          status,
          diferenca: diff,
        }
        return { ...m, match: matchRecord, lancamento: candidato }
      }
      return m
    }))
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

    // Update match status or create one
    if (item.match) {
      await activeClient
        .from('bank_reconciliation_matches')
        .update({ status: 'aprovado' })
        .eq('id', item.match.id)
    } else {
      await activeClient.from('bank_reconciliation_matches').insert({
        company_id: companyId,
        bank_transaction_id: tx.id,
        lancamento_id: null,
        tipo_lancamento: null,
        status: 'aprovado',
        diferenca: null,
      })
    }

    // Atualizar bank_transactions.status para 'reconciled'
    await activeClient
      .from('bank_transactions')
      .update({
        status: 'reconciled',
        reconciled_at: new Date().toISOString(),
      })
      .eq('id', tx.id)

    // Update local state
    setMatchesEnriquecidos(prev => prev.map(m => {
      if (m.transacao.id === tx.id) {
        const updatedMatch: MatchRecord = m.match
          ? { ...m.match, status: 'aprovado' }
          : { id: 'temp-' + Date.now(), company_id: companyId, bank_transaction_id: tx.id, lancamento_id: null, tipo_lancamento: null, status: 'aprovado', diferenca: null }
        return { ...m, match: updatedMatch }
      }
      return m
    }))
  }

  // ── Salvar regra ───────────────────────────────────────────────
  const salvarRegra = async () => {
    if (!companyId || !modalRegra.descricao.trim()) return
    // Extrair palavras-chave significativas da descrição
    const palavras = modalRegra.descricao
      .trim()
      .toUpperCase()
      .split(/\s+/)
      .filter(w => w.length >= 3)
    await activeClient.from('conciliation_rules').insert({
      company_id: companyId,
      account_id: null,
      palavras_chave: palavras.length > 0 ? palavras : [modalRegra.descricao.trim().toUpperCase()],
      confianca: 'Alta',
      acao: 'sugerir',
      ativa: true,
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

  // ── Filtered lists for sub-tabs ──────────────────────────────
  const pendentes = matchesEnriquecidos.filter(m => {
    const s = m.match?.status || 'pendente'
    return ['match_auto', 'match_regra', 'match_dif', 'revisao', 'pendente', 'pending'].includes(s)
  })
  const naoReconhecidosList = matchesEnriquecidos.filter(m => {
    const s = m.match?.status
    return s === 'nao_reconhecido' || (!m.match && !['reconciled', 'aprovado', 'ignorado'].includes(m.transacao.status_conciliacao))
  })
  const conciliadosList = matchesEnriquecidos.filter(m => {
    const s = m.match?.status || m.transacao.status_conciliacao
    return s === 'aprovado' || s === 'reconciled' || s === 'ignorado'
  })

  const filteredItems = subTab === 'pendentes' ? pendentes
    : subTab === 'nao_reconhecidos' ? naoReconhecidosList
    : conciliadosList

  // ── Percentage conciliated ────────────────────────────────────
  const pctConciliado = totalImportadas > 0 ? Math.round((conciliadasAuto / totalImportadas) * 100) : 0

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

  // Helper: render row for a single enriched item (card-based layout)
  const renderItemCard = (item: MatchEnriquecido) => {
    const tx = item.transacao
    const mt = item.match
    const rawStatus = mt?.status || tx.status_conciliacao || 'pendente'
    const status = rawStatus === 'pending' ? 'pendente' : rawStatus
    const isAprovado = status === 'aprovado' || status === 'ignorado' || status === 'reconciled'
    const isExpanded = expandedTxId === tx.id

    return (
      <div key={tx.id} className={`border border-[#e0e0e0] rounded-lg bg-white ${isAprovado ? 'opacity-50' : ''}`}>
        <div className="flex flex-col lg:flex-row">
          {/* ── LEFT: Checkbox + Extrato ────────────── */}
          <div className="flex items-start gap-3 p-4 lg:w-[38%] lg:border-r lg:border-dashed lg:border-[#ccc]">
            {!isAprovado && (
              <input
                type="checkbox"
                checked={selecionados.has(tx.id)}
                onChange={() => toggleSelecao(tx.id)}
                className="w-4 h-4 accent-[#1a2e4a] mt-1 shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-bold text-[#888] uppercase tracking-wider mb-1">Extrato</p>
              <p className="text-sm font-semibold text-[#0a0a0a] break-words leading-tight">{tx.descricao}</p>
              <p className="text-[11px] text-[#777] mt-1">{formatData(tx.data)}</p>
              <p className={`text-base font-bold mt-1 ${tx.tipo === 'credito' ? 'text-[#0a5c2e]' : 'text-[#8b0000]'}`}>
                {tx.tipo === 'credito' ? '+' : '-'}R$ {formatBRL(tx.valor)}
              </p>
            </div>
          </div>

          {/* ── MIDDLE: Lancamento no sistema ──────── */}
          <div className="flex-1 p-4 lg:border-r lg:border-dashed lg:border-[#ccc]">
            <p className="text-[9px] font-bold text-[#888] uppercase tracking-wider mb-2">Lancamento no Sistema</p>

            {/* Badge de status */}
            <div className="mb-2">{renderBadge(status, mt?.diferenca ?? null)}</div>

            {/* Lancamento vinculado */}
            {item.lancamento ? (
              <div>
                <p className="text-sm font-medium text-[#0a0a0a]">
                  {item.lancamento.tipo === 'cr' ? 'CR' : 'CP'} — {item.lancamento.nome}
                </p>
                <p className="text-[11px] text-[#777]">
                  Vencimento {formatData(item.lancamento.data_vencimento)} · Conta: {item.sugestaoIA?.categoria_nome || '-'}
                </p>
                <p className="text-sm font-bold text-[#0a0a0a] mt-0.5">R$ {formatBRL(item.lancamento.valor)}</p>
              </div>
            ) : status === 'nao_reconhecido' || (!mt && !isAprovado) ? (
              <div>
                <span className="text-[11px] font-semibold text-[#8b0000]">Nenhum lancamento encontrado</span>
                <p className="text-[10px] text-[#999]">Sem correspondencia no sistema</p>
              </div>
            ) : (
              <div>
                {item.sugestaoIA && (
                  <button
                    onClick={() => { if (item.sugestaoIA?.categoria_id) categorizarTransacao(tx.id, item.sugestaoIA.categoria_id) }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-50 border border-purple-200 hover:bg-purple-100 transition text-[11px]"
                    title={`Aceitar sugestao IA: ${item.sugestaoIA.categoria_nome || item.sugestaoIA.lancamento_nome}`}
                  >
                    <Sparkles size={12} className="text-purple-600" />
                    <span className="font-semibold text-purple-700">{item.sugestaoIA.confianca}%</span>
                    <span className="text-purple-800">{item.sugestaoIA.categoria_nome || item.sugestaoIA.lancamento_nome}</span>
                  </button>
                )}
              </div>
            )}

            {/* IA suggestion for matched items too */}
            {item.lancamento && item.sugestaoIA && (
              <div className="mt-1.5">
                <button
                  onClick={() => { if (item.sugestaoIA?.categoria_id) categorizarTransacao(tx.id, item.sugestaoIA.categoria_id) }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-50 border border-purple-200 hover:bg-purple-100 transition text-[10px]"
                >
                  <Sparkles size={10} className="text-purple-600" />
                  <span className="font-semibold text-purple-700">{item.sugestaoIA.confianca}% {item.sugestaoIA.categoria_nome || item.sugestaoIA.lancamento_nome}</span>
                </button>
              </div>
            )}
          </div>

          {/* ── RIGHT: Acoes ──────────────────────── */}
          <div className="flex flex-row lg:flex-col items-center justify-center gap-2 p-4 lg:w-[160px]">
            {!isAprovado && (
              <>
                {mt && ['match_auto', 'match_regra', 'match_dif'].includes(status) && (
                  <>
                    <button onClick={() => aprovar(mt.id, item)} className="w-full px-3 py-2 rounded-md bg-[#e6f4ec] text-[#0a5c2e] font-semibold text-xs hover:bg-[#d0eddb] transition flex items-center justify-center gap-1.5">
                      <CheckCircle2 size={14} /> Aprovar
                    </button>
                    <button onClick={() => abrirVincular(tx)} className="w-full px-3 py-2 rounded-md border border-[#ccc] text-[#555] text-xs hover:bg-gray-50 transition">
                      Alterar
                    </button>
                  </>
                )}
                {status === 'match_dif' && mt?.diferenca && Math.abs(mt.diferenca) > 0 && (
                  <button onClick={() => aprovar(mt!.id, item)} className="w-full px-3 py-2 rounded-md bg-[#fffbe6] text-[#5c3a00] font-semibold text-xs hover:bg-[#fff5cc] transition flex items-center justify-center gap-1.5">
                    <AlertTriangle size={14} /> Ajustar
                  </button>
                )}
                {(status === 'nao_reconhecido' || status === 'pendente' || (!mt && !isAprovado)) && (
                  <>
                    <button onClick={() => setExpandedTxId(isExpanded ? null : tx.id)} className="w-full px-3 py-2 rounded-md bg-[#f0f4f8] text-[#1a2e4a] font-semibold text-xs hover:bg-[#e0e8f0] transition flex items-center justify-center gap-1.5">
                      <Plus size={14} /> Criar
                    </button>
                    <button onClick={() => abrirVincular(tx)} className="w-full px-3 py-2 rounded-md border border-[#ccc] text-[#555] text-xs hover:bg-gray-50 transition">
                      Vincular
                    </button>
                    <button onClick={() => ignorarTransacao(tx.id, mt?.id || null)} className="w-full px-3 py-2 rounded-md border border-[#ccc] text-[#999] text-xs hover:bg-gray-50 transition">
                      Ignorar
                    </button>
                  </>
                )}
                {status === 'revisao' && (
                  <button onClick={() => abrirVincular(tx)} className="w-full px-3 py-2 rounded-md bg-[#f0f4f8] text-[#1a2e4a] font-semibold text-xs hover:bg-[#e0e8f0] transition flex items-center justify-center gap-1.5">
                    <Link2 size={14} /> Vincular
                  </button>
                )}
              </>
            )}
            {isAprovado && (
              <div className="flex items-center gap-1.5 text-[#0a5c2e]">
                <CheckCircle2 size={16} />
                <span className="text-xs font-semibold">{status === 'ignorado' ? 'Ignorado' : 'Aprovado'}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Diff warning bar ────────────────────────── */}
        {mt?.diferenca && Math.abs(mt.diferenca) > 0 && status === 'match_dif' && (
          <div className="border-t border-[#f0d080] bg-[#fffbe6] px-4 py-2.5 text-[11px] text-[#5c3a00]">
            <AlertTriangle size={12} className="inline mr-1.5" />
            Diferenca de {formatBRL(Math.abs(mt.diferenca))} — possivelmente juros ou taxa bancaria. Aprovar lancara {formatBRL(Math.abs(mt.diferenca))} em 4.6.03 — Tarifas bancarias.
          </div>
        )}

        {/* ── Expanded: unrecognized actions ──────────── */}
        {isExpanded && !isAprovado && (
          <div className="border-t border-[#e0e0e0] bg-[#fafafa] px-4 py-4">
            <p className="text-[11px] font-semibold text-[#8b0000] mb-3">O que fazer com este lancamento?</p>
            <div className="flex flex-wrap gap-2">
              {item.sugestaoIA?.categoria_nome && (
                <button
                  onClick={() => criarMovimentacao(item)}
                  className="px-4 py-2.5 rounded-lg border-2 border-[#1a2e4a] bg-white text-[#1a2e4a] text-xs font-semibold hover:bg-[#f0f4f8] transition"
                >
                  Criar movimentacao ({item.sugestaoIA.categoria_nome})
                </button>
              )}
              {!item.sugestaoIA?.categoria_nome && (
                <button
                  onClick={() => criarMovimentacao(item)}
                  className="px-4 py-2.5 rounded-lg border-2 border-[#1a2e4a] bg-white text-[#1a2e4a] text-xs font-semibold hover:bg-[#f0f4f8] transition"
                >
                  Criar movimentacao
                </button>
              )}
              <button
                onClick={() => { setExpandedTxId(null); abrirVincular(tx) }}
                className="px-4 py-2.5 rounded-lg border-2 border-[#ccc] bg-white text-[#555] text-xs font-semibold hover:bg-gray-50 transition"
              >
                Vincular a CP existente
              </button>
              <button
                onClick={() => { setExpandedTxId(null); ignorarTransacao(tx.id, mt?.id || null) }}
                className="px-4 py-2.5 rounded-lg border border-[#ccc] bg-white text-[#999] text-xs hover:bg-gray-50 transition"
              >
                Ignorar (nao lancar)
              </button>
            </div>

            {/* IA Category selector */}
            <div className="mt-3 relative" data-cat-dropdown>
              <p className="text-[10px] font-bold text-[#888] uppercase tracking-wider mb-1">Categorizar manualmente</p>
              <input
                type="text"
                placeholder="Buscar conta contabil..."
                className="w-full max-w-sm text-[12px] border border-[#ddd] rounded-lg px-3 py-2 bg-white text-[#333] focus:outline-none focus:border-[#1a2e4a] focus:ring-1 focus:ring-[#1a2e4a]/20"
                value={iaCatDropdownOpen === tx.id ? (iaCatBusca ?? '') : ''}
                onFocus={() => { setIaCatDropdownOpen(tx.id); setIaCatBusca('') }}
                onChange={(e) => setIaCatBusca(e.target.value)}
              />
              {iaCatDropdownOpen === tx.id && (
                <div className="absolute top-full left-0 mt-1 z-30 bg-white border border-[#ccc] rounded-lg shadow-xl w-80 max-h-48 overflow-y-auto">
                  {planoContas
                    .filter(cat => !iaCatBusca || `${cat.code} ${cat.name}`.toLowerCase().includes((iaCatBusca || '').toLowerCase()))
                    .slice(0, 15)
                    .map(cat => (
                      <button
                        key={cat.id}
                        onClick={() => { categorizarTransacao(tx.id, cat.id); setIaCatDropdownOpen(null); setIaCatBusca(''); setExpandedTxId(null) }}
                        className="w-full text-left px-3 py-2 text-[12px] text-[#333] hover:bg-[#f0f4f8] transition"
                      >
                        <span className="font-semibold">{cat.code}</span> — {cat.name}
                      </button>
                    ))
                  }
                  {planoContas.filter(cat => !iaCatBusca || `${cat.code} ${cat.name}`.toLowerCase().includes((iaCatBusca || '').toLowerCase())).length === 0 && (
                    <p className="px-3 py-2 text-[11px] text-[#999]">Nenhuma categoria encontrada</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <AppLayout title="Conciliacao Bancaria">
      <div className="space-y-4">
        {/* ══════════════════════════════════════════════════════
           KPI CARDS
           ══════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Extrato Importado */}
          <div className="bg-[#1a2e4a] text-white rounded-lg p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">Extrato Importado</p>
            <p className="text-3xl font-bold mt-1">{totalImportadas}</p>
            <p className="text-[11px] opacity-60 mt-0.5">itens · {importBatches.length > 0 ? `${importBatches.length} lote(s)` : 'nenhum lote'}</p>
            {importBatches.length > 0 && (
              <span className="inline-block mt-1.5 text-[9px] font-semibold bg-white/20 px-2 py-0.5 rounded">OFX importado</span>
            )}
          </div>

          {/* Conciliados */}
          <div className="bg-[#0a5c2e] text-white rounded-lg p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">Conciliados</p>
            <p className="text-3xl font-bold mt-1">{conciliadasAuto}</p>
            <p className="text-[11px] opacity-60 mt-0.5">por regras e automatico</p>
            <span className="inline-block mt-1.5 text-[9px] font-semibold bg-white/20 px-2 py-0.5 rounded">{pctConciliado}% do extrato</span>
          </div>

          {/* Pendentes Revisao */}
          <div className="bg-[#1a5fb4] text-white rounded-lg p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">Pendentes Revisao</p>
            <p className="text-3xl font-bold mt-1">{pendentesRevisao}</p>
            <p className="text-[11px] opacity-60 mt-0.5">aguardando aprovacao</p>
            {pendentesRevisao > 0 && (
              <button onClick={() => { setAbaAtiva('conciliacao'); setSubTab('pendentes') }} className="inline-block mt-1.5 text-[9px] font-semibold bg-white/20 px-2 py-0.5 rounded hover:bg-white/30 transition">
                Revisar
              </button>
            )}
          </div>

          {/* Nao Reconhecidos */}
          <div className="bg-[#8b0000] text-white rounded-lg p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">Nao Reconhecidos</p>
            <p className="text-3xl font-bold mt-1">{naoReconhecidas}</p>
            <p className="text-[11px] opacity-60 mt-0.5">sem correspondencia</p>
            {naoReconhecidas > 0 && (
              <button onClick={() => { setAbaAtiva('conciliacao'); setSubTab('nao_reconhecidos') }} className="inline-block mt-1.5 text-[9px] font-semibold bg-white/20 px-2 py-0.5 rounded hover:bg-white/30 transition">
                Acao necessaria
              </button>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════
           IMPORT INFO BANNER
           ══════════════════════════════════════════════════════ */}
        {importBatches.length > 0 && (
          <div className="bg-[#f0f4f8] border border-[#d0d8e0] rounded-lg px-4 py-3 flex items-center gap-3">
            <FileText size={20} className="text-[#1a2e4a] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#0a0a0a]">
                Extrato importado
              </p>
              <p className="text-[11px] text-[#555]">
                {importBatches[0] ? `${formatData(importBatches[0].min_date)} a ${formatData(importBatches[0].max_date)}` : ''} · {totalImportadas} transacoes · importado {importBatches[0] ? new Date(importBatches[0].imported_at).toLocaleDateString('pt-BR') : ''}
              </p>
            </div>
            <label className="text-xs text-[#8b0000] font-semibold cursor-pointer hover:underline shrink-0">
              Trocar arquivo
              <input type="file" accept=".ofx" onChange={onFileChange} className="hidden" disabled={!contaSelecionada || importando} />
            </label>
          </div>
        )}

        {/* ── Tabs ───────────────────────────────────────────────── */}
        <div className="flex gap-1 border-b border-[#ccc]">
          {[
            { id: 'conciliacao' as const, label: 'Conciliacao', icon: <ListChecks size={14} /> },
            { id: 'historico' as const, label: 'Importacoes', icon: <History size={14} /> },
            { id: 'regras' as const, label: 'Regras', icon: <BookOpen size={14} /> },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setAbaAtiva(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
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
            {/* ── Upload OFX (only when no transactions) ──── */}
            {matchesEnriquecidos.length === 0 && (
              <div className="border border-[#ccc] rounded-lg overflow-hidden">
                <div className="bg-[#1a2e4a] px-4 py-2.5">
                  <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">Importar Extrato OFX</h3>
                </div>
                <div className="p-4 bg-white space-y-3">
                  <div className="relative w-full max-w-xs">
                    <select
                      value={contaSelecionada}
                      onChange={(e) => setContaSelecionada(e.target.value)}
                      className="w-full appearance-none border border-[#ccc] rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#1a2e4a] pr-8"
                    >
                      <option value="">Selecione a conta...</option>
                      {contas.map((c) => (
                        <option key={c.id} value={c.id}>{c.name} - {c.banco}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#555] pointer-events-none" />
                  </div>
                  <div
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    className={`relative border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer ${
                      arrastando ? 'border-[#1a2e4a] bg-[#f0f4f8]' : 'border-[#ccc] bg-[#fafafa] hover:border-[#1a2e4a]'
                    } ${!contaSelecionada ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    <input type="file" accept=".ofx" onChange={onFileChange} className="absolute inset-0 opacity-0 cursor-pointer" disabled={!contaSelecionada || importando} />
                    {importando ? (
                      <><Loader2 size={24} className="text-[#1a2e4a] animate-spin" /><p className="text-sm text-[#555]">Processando...</p></>
                    ) : (
                      <><Upload size={24} className="text-[#1a2e4a]" /><p className="text-sm text-[#555]">Arraste um <strong>.ofx</strong> ou clique</p></>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════
               REVIEW SECTION
               ══════════════════════════════════════════════════ */}
            {matchesEnriquecidos.length > 0 && (
              <div className="space-y-3">
                {/* Header bar */}
                <div className="bg-[#1a2e4a] rounded-t-lg px-4 py-3 flex items-center justify-between">
                  <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">Revisao de Conciliacao</h3>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setSubTab('conciliados')} className="text-[11px] text-white/70 hover:text-white transition font-medium">
                      Ver conciliados
                    </button>
                    {pendentes.length > 0 && (
                      <button onClick={salvarConciliacao} disabled={salvando} className="text-[11px] text-white/70 hover:text-white transition font-medium">
                        {salvando ? 'Salvando...' : 'Aprovar todos pendentes'}
                      </button>
                    )}
                    <button onClick={() => { carregarDados(); carregarRegras() }} className="text-white/50 hover:text-white transition" title="Recarregar">
                      <RefreshCw size={14} />
                    </button>
                  </div>
                </div>

                {/* Sub-tabs */}
                <div className="flex gap-1 bg-[#f5f5f5] rounded-lg p-1">
                  <button
                    onClick={() => setSubTab('pendentes')}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-semibold transition ${
                      subTab === 'pendentes' ? 'bg-white text-[#1a2e4a] shadow-sm' : 'text-[#777] hover:text-[#333]'
                    }`}
                  >
                    Pendentes revisao
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${subTab === 'pendentes' ? 'bg-[#1a5fb4] text-white' : 'bg-[#ddd] text-[#555]'}`}>
                      {pendentes.length}
                    </span>
                  </button>
                  <button
                    onClick={() => setSubTab('nao_reconhecidos')}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-semibold transition ${
                      subTab === 'nao_reconhecidos' ? 'bg-white text-[#8b0000] shadow-sm' : 'text-[#777] hover:text-[#333]'
                    }`}
                  >
                    Nao reconhecidos
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${subTab === 'nao_reconhecidos' ? 'bg-[#8b0000] text-white' : 'bg-[#ddd] text-[#555]'}`}>
                      {naoReconhecidosList.length}
                    </span>
                  </button>
                  <button
                    onClick={() => setSubTab('conciliados')}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-semibold transition ${
                      subTab === 'conciliados' ? 'bg-white text-[#0a5c2e] shadow-sm' : 'text-[#777] hover:text-[#333]'
                    }`}
                  >
                    Conciliados
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${subTab === 'conciliados' ? 'bg-[#0a5c2e] text-white' : 'bg-[#ddd] text-[#555]'}`}>
                      {conciliadosList.length}
                    </span>
                  </button>
                </div>

                {/* ── Batch selection bar ──────────────────── */}
                {selecionados.size > 0 && (
                  <div className="bg-[#f0f4f8] border border-[#1a2e4a]/20 rounded-lg px-4 py-3 flex items-center justify-between">
                    <span className="text-sm font-semibold text-[#1a2e4a]">
                      {selecionados.size} itens selecionados — Aprovar em lote?
                    </span>
                    <div className="flex items-center gap-3">
                      <button onClick={() => setSelecionados(new Set())} className="text-xs text-[#1a5fb4] font-medium hover:underline">
                        Desmarcar
                      </button>
                      <button onClick={aprovarSelecionados} className="px-4 py-2 text-xs bg-[#1a2e4a] text-white font-semibold rounded-lg hover:bg-[#15253d] transition">
                        Aprovar {selecionados.size} itens
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Column headers ───────────────────────── */}
                <div className="hidden lg:flex items-center px-4 py-2 text-[9px] font-bold text-[#888] uppercase tracking-widest">
                  <div className="w-[38%] pl-7">Extrato Bancario</div>
                  <div className="flex-1">Lancamento no Sistema</div>
                  <div className="w-[160px] text-center">Acao</div>
                </div>

                {/* ── Item cards ───────────────────────────── */}
                {carregando ? (
                  <div className="flex items-center justify-center py-16 gap-2 text-[#555] text-sm">
                    <Loader2 size={18} className="animate-spin" /> Carregando...
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-[#555] text-sm gap-1">
                    <FileText size={32} className="text-[#ccc] mb-2" />
                    {subTab === 'pendentes' && 'Nenhuma transacao pendente de revisao.'}
                    {subTab === 'nao_reconhecidos' && 'Nenhuma transacao nao reconhecida.'}
                    {subTab === 'conciliados' && 'Nenhuma transacao conciliada ainda.'}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredItems.map(renderItemCard)}
                  </div>
                )}

                {/* ── SALVAR CONCILIACAO sticky bar ─────── */}
                {matchesEnriquecidos.some(m => m.match && ['match_auto', 'match_regra', 'match_dif'].includes(m.match.status)) && (
                  <div className="sticky bottom-4 z-20">
                    <div className="bg-gradient-to-r from-[#0a5c2e] to-[#1a6e3e] rounded-lg px-6 py-4 shadow-xl flex items-center justify-between">
                      <div className="text-white">
                        <p className="text-sm font-bold">{matchesEnriquecidos.filter(m => m.match && ['match_auto', 'match_regra', 'match_dif'].includes(m.match!.status)).length} conciliacoes pendentes</p>
                        <p className="text-[11px] text-white/70">Aprovar todas e baixar lancamentos vinculados</p>
                      </div>
                      <button onClick={salvarConciliacao} disabled={salvando} className="px-6 py-3 bg-white text-[#0a5c2e] font-bold text-sm rounded-lg hover:bg-gray-100 transition flex items-center gap-2 shadow-md disabled:opacity-50">
                        {salvando ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                        {salvando ? 'SALVANDO...' : 'SALVAR CONCILIACAO'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Upload when we have data but want to add more */}
            {matchesEnriquecidos.length > 0 && (
              <div className="border border-[#ccc] rounded-lg overflow-hidden">
                <div className="bg-[#1a2e4a] px-4 py-2.5">
                  <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">Importar Extrato OFX</h3>
                </div>
                <div className="p-4 bg-white space-y-3">
                  <div className="relative w-full max-w-xs">
                    <select
                      value={contaSelecionada}
                      onChange={(e) => setContaSelecionada(e.target.value)}
                      className="w-full appearance-none border border-[#ccc] rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#1a2e4a] pr-8"
                    >
                      <option value="">Selecione a conta...</option>
                      {contas.map((c) => (
                        <option key={c.id} value={c.id}>{c.name} - {c.banco}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#555] pointer-events-none" />
                  </div>
                  <div
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    className={`relative border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer ${
                      arrastando ? 'border-[#1a2e4a] bg-[#f0f4f8]' : 'border-[#ccc] bg-[#fafafa] hover:border-[#1a2e4a]'
                    } ${!contaSelecionada ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    <input type="file" accept=".ofx" onChange={onFileChange} className="absolute inset-0 opacity-0 cursor-pointer" disabled={!contaSelecionada || importando} />
                    {importando ? (
                      <><Loader2 size={24} className="text-[#1a2e4a] animate-spin" /><p className="text-sm text-[#555]">Processando...</p></>
                    ) : (
                      <><Upload size={24} className="text-[#1a2e4a]" /><p className="text-sm text-[#555]">Arraste um <strong>.ofx</strong> ou clique</p></>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ════════════════════════════════════════════════════════
           TAB: IMPORTACOES
           ════════════════════════════════════════════════════════ */}
        {abaAtiva === 'historico' && (
          <div className="border border-[#ccc] rounded-lg overflow-hidden">
            <div className="bg-[#1a2e4a] px-4 py-2.5 flex items-center justify-between">
              <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">Arquivos Importados</h3>
              <button onClick={carregarImportBatches} className="text-white/70 hover:text-white transition" title="Recarregar"><RefreshCw size={14} /></button>
            </div>
            <div className="bg-white">
              {importBatches.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-[#555] text-sm gap-1">
                  <FileText size={32} className="text-[#ccc] mb-2" />
                  Nenhum arquivo importado ainda.
                </div>
              ) : (
                <div className="divide-y divide-[#eee]">
                  {importBatches.map((batch) => {
                    const isExpanded = batchExpandido === batch.key
                    return (
                      <div key={batch.key}>
                        <button onClick={() => expandirBatch(batch)} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-[#f9f9f9] transition">
                          <ChevronDown size={16} className={`text-[#1a2e4a] transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[#0a0a0a]">
                              {new Date(batch.imported_at).toLocaleDateString('pt-BR')} <span className="text-[#999] font-normal text-xs">as {new Date(batch.imported_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                            </p>
                            <p className="text-[11px] text-[#555]">{formatData(batch.min_date)} a {formatData(batch.max_date)}</p>
                          </div>
                          <span className="text-xs font-bold text-[#1a2e4a] bg-[#f0f4f8] px-2 py-1 rounded shrink-0">{batch.count} tx</span>
                          <button onClick={(e) => { e.stopPropagation(); excluirImportBatch(batch.tx_ids) }} className="p-1 rounded text-[#8b0000] hover:bg-[#fdecea] transition shrink-0" title="Excluir lote">
                            <Trash2 size={14} />
                          </button>
                        </button>
                        {isExpanded && (
                          <div className="bg-[#f9f9f9] border-t border-[#eee] overflow-x-auto">
                            {batchTransacoes.length === 0 ? (
                              <div className="flex items-center justify-center py-8 text-[#555] text-sm gap-2"><Loader2 size={16} className="animate-spin" /> Carregando...</div>
                            ) : (
                              <table className="w-full text-sm">
                                <thead><tr className="bg-[#f0f0f0] text-[10px] font-bold text-[#555] uppercase tracking-wider border-b border-[#ddd]">
                                  <th className="px-3 py-2 text-left">Data</th><th className="px-3 py-2 text-left">Descricao</th><th className="px-3 py-2 text-right">Valor</th><th className="px-3 py-2 text-center">Status</th>
                                </tr></thead>
                                <tbody>{batchTransacoes.map((tx) => (
                                  <tr key={tx.id} className="border-b border-[#eee] hover:bg-white">
                                    <td className="px-3 py-2 text-[11px] text-[#555] whitespace-nowrap">{formatData(tx.data)}</td>
                                    <td className="px-3 py-2 text-[#0a0a0a] truncate max-w-[300px]">{tx.descricao}</td>
                                    <td className="px-3 py-2 text-right whitespace-nowrap">
                                      <span className={`font-semibold ${tx.tipo === 'credito' ? 'text-[#0a5c2e]' : 'text-[#8b0000]'}`}>{tx.tipo === 'credito' ? '+' : '-'}{formatBRL(tx.valor)}</span>
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${tx.status_conciliacao === 'reconciled' ? 'bg-[#e6f4ec] text-[#0a5c2e]' : 'bg-[#f0f4f8] text-[#1a2e4a]'}`}>
                                        {tx.status_conciliacao === 'reconciled' ? 'OK' : 'Pendente'}
                                      </span>
                                    </td>
                                  </tr>
                                ))}</tbody>
                              </table>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
           TAB: REGRAS (always visible at bottom when on conciliacao)
           ════════════════════════════════════════════════════════ */}
        {(abaAtiva === 'regras' || (abaAtiva === 'conciliacao' && regras.length > 0)) && (
          <div className="border border-[#ccc] rounded-lg overflow-hidden">
            <div className="bg-[#1a2e4a] px-4 py-2.5 flex items-center justify-between">
              <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">Regras de Conciliacao Salvas</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => setModalRegra({ aberto: true, descricao: '', tipo: 'debito', transacaoId: '' })} className="text-[10px] text-white/70 hover:text-white transition font-medium">
                  + Nova regra
                </button>
                <button onClick={carregarRegras} className="text-white/50 hover:text-white transition" title="Recarregar"><RefreshCw size={14} /></button>
              </div>
            </div>
            <div className="bg-white">
              {regras.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-[#555] text-sm gap-1">
                  <BookOpen size={28} className="text-[#ccc] mb-2" />
                  Nenhuma regra salva.
                </div>
              ) : (
                <div className="divide-y divide-[#eee]">
                  {regras.map((r) => (
                    <div key={r.id} className="px-4 py-3 flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#0a0a0a]">{(r.palavras_chave || []).join(', ')}</p>
                        <p className="text-[10px] text-[#777]">
                          Palavras-chave: &quot;{(r.palavras_chave || []).join('&quot;, &quot;')}&quot; · Confiança: {r.confianca} · Ação: {r.acao}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-semibold text-[#1a2e4a]">
                          {r.account_id ? planoContas.find(c => c.id === r.account_id)?.code || '' : ''} {r.account_id ? '— ' + (planoContas.find(c => c.id === r.account_id)?.name || '') : ''}
                        </p>
                      </div>
                      <span className={`text-[10px] shrink-0 px-1.5 py-0.5 rounded ${r.ativa ? 'bg-[#e6f4ec] text-[#0a5c2e]' : 'bg-[#fdecea] text-[#8b0000]'}`}>{r.ativa ? 'Ativa' : 'Inativa'}</span>
                      <button onClick={() => excluirRegra(r.id)} className="text-xs text-[#8b0000] font-semibold hover:underline shrink-0">
                        Excluir
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════
         MODAL: Conciliar - Vincular a CP/CR
         ═══════════════════════════════════════════════════════════ */}
      {modalVincular.aberto && modalVincular.transacao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setModalVincular({ transacao: null, aberto: false })}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-[#1a2e4a] px-5 py-3 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-widest">Conciliar Transacao</h3>
                <p className="text-[10px] text-white/60 mt-0.5">Selecione o lancamento CP ou CR para vincular</p>
              </div>
              <button onClick={() => setModalVincular({ transacao: null, aberto: false })} className="text-white/70 hover:text-white transition"><X size={18} /></button>
            </div>

            <div className="p-5 space-y-4">
              {/* Transacao info */}
              <div className="bg-[#f0f4f8] rounded-lg p-4 flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-semibold text-[#0a0a0a]">{modalVincular.transacao.descricao}</p>
                  <p className="text-[11px] text-[#555] mt-0.5">{formatData(modalVincular.transacao.data)}</p>
                </div>
                <div className="text-right">
                  <span className={`text-lg font-bold ${modalVincular.transacao.tipo === 'credito' ? 'text-[#0a5c2e]' : 'text-[#8b0000]'}`}>
                    {modalVincular.transacao.tipo === 'credito' ? '+' : '-'}{formatBRL(modalVincular.transacao.valor)}
                  </span>
                  <p className={`text-[10px] font-bold uppercase ${modalVincular.transacao.tipo === 'credito' ? 'text-[#0a5c2e]' : 'text-[#8b0000]'}`}>
                    {modalVincular.transacao.tipo === 'credito' ? 'Credito' : 'Debito'}
                  </p>
                </div>
              </div>

              {/* Busca */}
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#999]" />
                  <input
                    type="text"
                    placeholder="Filtrar por nome..."
                    value={buscaVincular}
                    onChange={(e) => setBuscaVincular(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && buscarCandidatos()}
                    className="w-full border border-[#ccc] rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-[#1a2e4a] focus:ring-1 focus:ring-[#1a2e4a]/20"
                  />
                </div>
                <button onClick={buscarCandidatos} disabled={buscandoVincular} className="px-4 py-2.5 bg-[#1a2e4a] text-white rounded-lg text-sm font-semibold hover:bg-[#15253d] transition shrink-0">
                  {buscandoVincular ? <Loader2 size={14} className="animate-spin" /> : 'Buscar'}
                </button>
              </div>

              {/* Loading */}
              {buscandoVincular && candidatosVincular.length === 0 && (
                <div className="flex items-center justify-center py-8 gap-2 text-[#555] text-sm">
                  <Loader2 size={16} className="animate-spin" /> Buscando lancamentos...
                </div>
              )}

              {/* Candidatos */}
              {candidatosVincular.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-[#555] uppercase tracking-wider mb-2">{candidatosVincular.length} lancamentos encontrados</p>
                  <div className="max-h-[300px] overflow-y-auto border border-[#ddd] rounded-lg divide-y divide-[#eee]">
                    {candidatosVincular.map((c) => {
                      const diff = Math.round((modalVincular.transacao!.valor - c.valor) * 100) / 100
                      const absDiff = Math.abs(diff)
                      const isExact = absDiff < 0.01
                      return (
                        <button
                          key={`${c.tipo}-${c.id}`}
                          onClick={() => vincular(c)}
                          className={`w-full text-left px-4 py-3 hover:bg-[#f0f4f8] transition flex items-center gap-3 ${isExact ? 'bg-[#f0fdf4]' : ''}`}
                        >
                          <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded shrink-0 ${
                            c.tipo === 'cr' ? 'bg-[#e6f4ec] text-[#0a5c2e]' : 'bg-[#fdecea] text-[#8b0000]'
                          }`}>
                            {c.tipo === 'cr' ? 'CR' : 'CP'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium text-[#0a0a0a] truncate">{c.nome}</p>
                            <p className="text-[11px] text-[#777]">Venc. {formatData(c.data_vencimento)}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[13px] font-bold text-[#0a0a0a]">{formatBRL(c.valor)}</p>
                            {isExact ? (
                              <span className="text-[9px] font-bold text-[#0a5c2e] bg-[#e6f4ec] px-1.5 py-0.5 rounded">VALOR EXATO</span>
                            ) : (
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${absDiff <= modalVincular.transacao!.valor * 0.05 ? 'bg-[#fffbe6] text-[#5c3a00]' : 'bg-[#fdecea] text-[#8b0000]'}`}>
                                {diff > 0 ? '+' : ''}{formatBRL(diff)}
                              </span>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {candidatosVincular.length === 0 && !buscandoVincular && (
                <p className="text-xs text-[#999] text-center py-6">Nenhum lancamento encontrado. Use o campo acima para buscar.</p>
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
              <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">Salvar como Regra?</h3>
              <button onClick={() => setModalRegra({ aberto: false, descricao: '', tipo: '', transacaoId: '' })} className="text-white/70 hover:text-white text-lg leading-none">&times;</button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-[#555]">Salvar padrao para classificar automaticamente transacoes semelhantes?</p>
              <div>
                <label className="block text-[11px] font-semibold text-[#0a0a0a] uppercase tracking-wider mb-1">Padrao de descricao</label>
                <input type="text" value={modalRegra.descricao} onChange={(e) => setModalRegra((prev) => ({ ...prev, descricao: e.target.value }))} className="w-full border border-[#ccc] rounded px-3 py-2 text-sm focus:outline-none focus:border-[#1a2e4a]" placeholder="Ex: PIX RECEBIDO FULANO" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setModalRegra({ aberto: false, descricao: '', tipo: '', transacaoId: '' })}
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
