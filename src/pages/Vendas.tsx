import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { safeQuery } from '@/lib/supabaseQuery'
import { formatBRL, formatData, formatCPF, formatCNPJ } from '@/lib/format'
import { quitarCR } from '@/lib/financeiro/transacao'
import { AppLayout } from '@/components/layout/AppLayout'
import {
  ShoppingCart, Search, Plus, Eye, Trash2, X,
  Loader2, AlertCircle, Check, Package,
  Briefcase, FileText, RefreshCw, CreditCard, Banknote,
  QrCode, Receipt, Calendar
} from 'lucide-react'
import { format, startOfMonth, endOfMonth, parseISO, addMonths } from 'date-fns'

/* ================================================================
   TYPES
   ================================================================ */

interface Venda {
  id: string
  company_id: string
  cliente_nome: string
  cliente_cpf_cnpj: string | null
  tipo: 'servico' | 'produto' | 'pacote' | 'contrato'
  valor_total: number
  data_venda: string
  forma_pagamento: string
  status: string
  vendas_itens?: VendaItem[]
  contas_receber?: ContaReceber[]
}

interface VendaItem {
  id: string
  venda_id: string
  descricao: string
  quantidade: number
  valor_unitario: number
  valor_total: number
}

interface ContaReceber {
  id: string
  status: string
  valor: number
  valor_pago: number | null
  data_vencimento: string
}

interface BankAccount {
  id: string
  nome: string
}

interface CentroCusto {
  id: string
  nome: string
}

interface NovoItem {
  descricao: string
  quantidade: number
  valor_unitario: number
}

/* ================================================================
   CONSTANTS
   ================================================================ */

const TIPOS_VENDA = [
  { value: 'servico', label: 'Servico', icon: Briefcase },
  { value: 'produto', label: 'Produto', icon: Package },
  { value: 'pacote', label: 'Pacote', icon: FileText },
  { value: 'contrato', label: 'Contrato', icon: RefreshCw },
] as const

const FORMAS_PAGAMENTO = [
  { value: 'pix', label: 'PIX/TED', icon: QrCode },
  { value: 'dinheiro', label: 'Dinheiro', icon: Banknote },
  { value: 'cartao_credito', label: 'Cartao credito', icon: CreditCard },
  { value: 'cartao_debito', label: 'Cartao debito', icon: CreditCard },
  { value: 'boleto', label: 'Boleto', icon: Receipt },
  { value: 'parcelado', label: 'Parcelado', icon: Calendar },
] as const

const FORMAS_A_VISTA = ['pix', 'dinheiro', 'cartao_debito']
const FORMAS_A_PRAZO = ['parcelado', 'boleto', 'cartao_credito']

const LABEL_FORMA: Record<string, string> = {
  pix: 'PIX/TED',
  dinheiro: 'Dinheiro',
  cartao_credito: 'Cartao credito',
  cartao_debito: 'Cartao debito',
  boleto: 'Boleto',
  parcelado: 'Parcelado',
}

const LABEL_TIPO: Record<string, string> = {
  servico: 'Servico',
  produto: 'Produto',
  pacote: 'Pacote',
  contrato: 'Contrato',
}

/* ================================================================
   COMPONENT
   ================================================================ */

export default function Vendas() {
  const { selectedCompany } = useCompany()
  const { activeClient } = useAuth()

  // ─── Data state ──────────────────────────────────────────────
  const [vendas, setVendas] = useState<Venda[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [centrosCusto, setCentrosCusto] = useState<CentroCusto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ─── Filter state ────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('')
  const [mesAtual, setMesAtual] = useState(() => format(new Date(), 'yyyy-MM'))
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroForma, setFiltroForma] = useState('')

  // ─── Modal state ─────────────────────────────────────────────
  const [modalAberto, setModalAberto] = useState(false)
  const [modalDetalhes, setModalDetalhes] = useState<Venda | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erroModal, setErroModal] = useState<string | null>(null)

  // ─── Form state ──────────────────────────────────────────────
  const [formTipo, setFormTipo] = useState<string>('servico')
  const [formCliente, setFormCliente] = useState('')
  const [formCpfCnpj, setFormCpfCnpj] = useState('')
  const [formDataVenda, setFormDataVenda] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [formItens, setFormItens] = useState<NovoItem[]>([{ descricao: '', quantidade: 1, valor_unitario: 0 }])
  const [formDescontoTipo, setFormDescontoTipo] = useState<'valor' | 'percentual'>('valor')
  const [formDesconto, setFormDesconto] = useState(0)
  const [formPagamento, setFormPagamento] = useState<string>('pix')
  const [formParcelas, setFormParcelas] = useState(2)
  const [formContaBancaria, setFormContaBancaria] = useState('')
  const [formCentroCusto, setFormCentroCusto] = useState('')

  // ─── Computed ────────────────────────────────────────────────
  const companyId = selectedCompany?.id

  const mesDate = useMemo(() => {
    const [y, m] = mesAtual.split('-').map(Number)
    return new Date(y, m - 1, 1)
  }, [mesAtual])

  const subtotalItens = useMemo(
    () => formItens.reduce((s, it) => s + it.quantidade * it.valor_unitario, 0),
    [formItens]
  )

  const descontoCalculado = useMemo(
    () => formDescontoTipo === 'percentual' ? subtotalItens * (formDesconto / 100) : formDesconto,
    [subtotalItens, formDesconto, formDescontoTipo]
  )

  const totalVenda = useMemo(
    () => Math.max(0, subtotalItens - descontoCalculado),
    [subtotalItens, descontoCalculado]
  )

  const isAVista = FORMAS_A_VISTA.includes(formPagamento)

  // ─── Filtered data ──────────────────────────────────────────
  const vendasFiltradas = useMemo(() => {
    return vendas.filter((v) => {
      if (searchTerm && !v.cliente_nome.toLowerCase().includes(searchTerm.toLowerCase())) return false
      if (filtroTipo && v.tipo !== filtroTipo) return false
      if (filtroForma && v.forma_pagamento !== filtroForma) return false
      return true
    })
  }, [vendas, searchTerm, filtroTipo, filtroForma])

  // ─── KPIs ────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total = vendas.reduce((s, v) => s + (v.valor_total || 0), 0)
    const count = vendas.length
    const ticket = count > 0 ? total / count : 0
    const aVista = vendas
      .filter((v) => FORMAS_A_VISTA.includes(v.forma_pagamento))
      .reduce((s, v) => s + (v.valor_total || 0), 0)
    const aPrazo = vendas
      .filter((v) => FORMAS_A_PRAZO.includes(v.forma_pagamento))
      .reduce((s, v) => s + (v.valor_total || 0), 0)
    return { total, ticket, aVista, aPrazo }
  }, [vendas])

  // ─── Fetch data ──────────────────────────────────────────────
  const fetchVendas = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    try {
      const inicio = format(startOfMonth(mesDate), 'yyyy-MM-dd')
      const fim = format(endOfMonth(mesDate), 'yyyy-MM-dd')

      const data = await safeQuery(
        () =>
          supabase
            .from('vendas')
            .select('*, vendas_itens(*), contas_receber(*)')
            .eq('company_id', companyId)
            .gte('data_venda', inicio)
            .lte('data_venda', fim)
            .order('data_venda', { ascending: false }),
        'buscar vendas'
      )
      setVendas((data as Venda[]) || [])
    } catch (e: any) {
      setError(e.message || 'Erro ao buscar vendas')
    } finally {
      setLoading(false)
    }
  }, [companyId, mesDate])

  const fetchAuxData = useCallback(async () => {
    if (!companyId) return
    const [banks, centros] = await Promise.all([
      safeQuery(
        () => supabase.from('bank_accounts').select('id, nome').eq('company_id', companyId),
        'buscar contas bancarias'
      ),
      safeQuery(
        () => supabase.from('centros_custo').select('id, nome').eq('company_id', companyId),
        'buscar centros de custo'
      ),
    ])
    setBankAccounts((banks as BankAccount[]) || [])
    setCentrosCusto((centros as CentroCusto[]) || [])
  }, [companyId])

  useEffect(() => {
    fetchVendas()
  }, [fetchVendas])

  useEffect(() => {
    fetchAuxData()
  }, [fetchAuxData])

  // ─── Helpers ─────────────────────────────────────────────────
  function resetForm() {
    setFormTipo('servico')
    setFormCliente('')
    setFormCpfCnpj('')
    setFormDataVenda(format(new Date(), 'yyyy-MM-dd'))
    setFormItens([{ descricao: '', quantidade: 1, valor_unitario: 0 }])
    setFormDescontoTipo('valor')
    setFormDesconto(0)
    setFormPagamento('pix')
    setFormParcelas(2)
    setFormContaBancaria('')
    setFormCentroCusto('')
    setErroModal(null)
  }

  function addItem() {
    setFormItens((prev) => [...prev, { descricao: '', quantidade: 1, valor_unitario: 0 }])
  }

  function removeItem(idx: number) {
    setFormItens((prev) => prev.filter((_, i) => i !== idx))
  }

  function updateItem(idx: number, field: keyof NovoItem, value: string | number) {
    setFormItens((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it))
    )
  }

  function getCRStatus(venda: Venda) {
    const crs = venda.contas_receber || []
    if (crs.length === 0) return 'avista'
    const allPago = crs.every((c) => c.status === 'pago')
    if (allPago) return 'pago'
    const anyParcial = crs.some((c) => c.status === 'parcial')
    if (anyParcial) return 'parcial'
    return 'aberto'
  }

  function formatDoc(doc: string | null) {
    if (!doc) return '-'
    const clean = doc.replace(/\D/g, '')
    return clean.length <= 11 ? formatCPF(clean) : formatCNPJ(clean)
  }

  // ─── Save venda ──────────────────────────────────────────────
  async function salvarVenda() {
    if (!companyId) return
    if (!formCliente.trim()) { setErroModal('Informe o nome do cliente.'); return }
    if (formItens.length === 0 || formItens.some((it) => !it.descricao.trim())) {
      setErroModal('Preencha a descricao de todos os itens.')
      return
    }
    if (totalVenda <= 0) { setErroModal('Valor total deve ser maior que zero.'); return }
    if (!formContaBancaria) { setErroModal('Selecione a conta bancaria destino.'); return }

    setSalvando(true)
    setErroModal(null)

    try {
      // 1. Insert venda
      const { data: vendaData, error: vendaErr } = await supabase
        .from('vendas')
        .insert({
          company_id: companyId,
          cliente_nome: formCliente.trim(),
          cliente_cpf_cnpj: formCpfCnpj.replace(/\D/g, '') || null,
          tipo: formTipo,
          valor_total: totalVenda,
          data_venda: formDataVenda,
          forma_pagamento: formPagamento,
          status: 'concluida',
        })
        .select()
        .single()

      if (vendaErr) throw vendaErr

      // 2. Insert itens
      const itensPayload = formItens.map((it) => ({
        venda_id: vendaData.id,
        descricao: it.descricao.trim(),
        quantidade: it.quantidade,
        valor_unitario: it.valor_unitario,
        valor_total: it.quantidade * it.valor_unitario,
      }))

      const { error: itensErr } = await supabase.from('vendas_itens').insert(itensPayload)
      if (itensErr) throw itensErr

      // 3. Generate CRs
      const isParcelado = formPagamento === 'parcelado'
      const numParcelas = isParcelado ? formParcelas : 1
      const valorParcela = Math.round((totalVenda / numParcelas) * 100) / 100

      const crsPayload = Array.from({ length: numParcelas }, (_, i) => {
        const vencimento = isParcelado
          ? format(addMonths(parseISO(formDataVenda), i + 1), 'yyyy-MM-dd')
          : formDataVenda

        // Adjust last parcela for rounding
        const valor = i === numParcelas - 1
          ? totalVenda - valorParcela * (numParcelas - 1)
          : valorParcela

        return {
          company_id: companyId,
          pagador_nome: formCliente.trim(),
          pagador_cpf_cnpj: formCpfCnpj.replace(/\D/g, '') || null,
          valor,
          valor_pago: 0,
          data_vencimento: vencimento,
          status: 'aberto',
          forma_recebimento: formPagamento,
          conta_contabil_id: null,
          centro_custo_id: formCentroCusto || null,
        }
      })

      const { data: crsData, error: crsErr } = await supabase
        .from('contas_receber')
        .insert(crsPayload)
        .select()

      if (crsErr) throw crsErr

      // 4. If a vista, quitar immediately
      if (isAVista && crsData && crsData.length > 0) {
        const cr = crsData[0]
        await quitarCR(cr.id, {
          valorPago: cr.valor,
          dataPagamento: formDataVenda,
          formaRecebimento: formPagamento,
          contaBancariaId: formContaBancaria,
        })
      }

      resetForm()
      setModalAberto(false)
      await fetchVendas()
    } catch (e: any) {
      console.error('[salvarVenda]', e)
      setErroModal(e.message || 'Erro ao salvar venda.')
    } finally {
      setSalvando(false)
    }
  }

  // ─── Delete venda ────────────────────────────────────────────
  async function deletarVenda(id: string) {
    try {
      await supabase.from('vendas_itens').delete().eq('venda_id', id)
      const { error } = await supabase.from('vendas').delete().eq('id', id)
      if (error) throw error
      setConfirmDelete(null)
      await fetchVendas()
    } catch (e: any) {
      console.error('[deletarVenda]', e)
    }
  }

  // ─── Render helpers ──────────────────────────────────────────
  function CRBadge({ venda }: { venda: Venda }) {
    const st = getCRStatus(venda)
    const styles: Record<string, string> = {
      pago: 'text-[#0a5c2e] bg-[#e6f4ec] border border-[#0a5c2e]',
      aberto: 'text-[#1a2e4a] bg-[#f0f4f8] border border-[#1a2e4a]',
      parcial: 'text-[#5c3a00] bg-[#fffbe6] border border-[#b8960a]',
      avista: 'text-[#555] bg-[#f5f5f5] border border-[#ccc]',
    }
    const labels: Record<string, string> = {
      pago: 'Pago',
      aberto: 'CR \u2014 aberto',
      parcial: 'CR \u2014 parcial',
      avista: 'A vista',
    }
    return (
      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${styles[st]}`}>
        {labels[st]}
      </span>
    )
  }

  function TipoBadge({ tipo }: { tipo: string }) {
    return (
      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold text-[#555] bg-[#f5f5f5] border border-[#ccc]">
        {LABEL_TIPO[tipo] || tipo}
      </span>
    )
  }

  /* ================================================================
     RENDER
     ================================================================ */
  return (
    <AppLayout title="Vendas">
      <div className="max-w-[1400px] mx-auto space-y-5">

        {/* ─── KPIs ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Vendas do mes', value: formatBRL(kpis.total), color: '#1a2e4a' },
            { label: 'Ticket medio', value: formatBRL(kpis.ticket), color: '#1a2e4a' },
            { label: 'A vista', value: formatBRL(kpis.aVista), color: '#0a5c2e' },
            { label: 'A prazo', value: formatBRL(kpis.aPrazo), color: '#5c3a00' },
          ].map((kpi) => (
            <div key={kpi.label} className="border border-[#ccc] rounded-lg overflow-hidden">
              <div className="bg-[#1a2e4a] px-4 py-2">
                <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">{kpi.label}</h3>
              </div>
              <div className="p-4 bg-white">
                <p className="text-xl font-bold" style={{ color: kpi.color }}>{kpi.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ─── Filtros ──────────────────────────────────────── */}
        <div className="border border-[#ccc] rounded-lg overflow-hidden">
          <div className="bg-[#1a2e4a] px-4 py-2.5 flex items-center justify-between">
            <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">Filtros</h3>
            <button
              onClick={() => { setSearchTerm(''); setFiltroTipo(''); setFiltroForma('') }}
              className="text-[11px] font-semibold text-[#a8bfd4] hover:text-white transition-colors"
            >
              Limpar
            </button>
          </div>
          <div className="p-4 bg-white grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#999]" />
              <input
                type="text"
                placeholder="Buscar cliente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#0a0a0a] placeholder-[#999] focus:outline-none focus:border-[#1a2e4a] focus:ring-1 focus:ring-[#1a2e4a]"
              />
            </div>

            {/* Month */}
            <input
              type="month"
              value={mesAtual}
              onChange={(e) => setMesAtual(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#0a0a0a] focus:outline-none focus:border-[#1a2e4a] focus:ring-1 focus:ring-[#1a2e4a]"
            />

            {/* Tipo */}
            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#0a0a0a] focus:outline-none focus:border-[#1a2e4a] focus:ring-1 focus:ring-[#1a2e4a]"
            >
              <option value="">Todos os tipos</option>
              {TIPOS_VENDA.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>

            {/* Forma pagamento */}
            <select
              value={filtroForma}
              onChange={(e) => setFiltroForma(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#0a0a0a] focus:outline-none focus:border-[#1a2e4a] focus:ring-1 focus:ring-[#1a2e4a]"
            >
              <option value="">Todas as formas</option>
              {FORMAS_PAGAMENTO.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ─── Tabela de Vendas ─────────────────────────────── */}
        <div className="border border-[#ccc] rounded-lg overflow-hidden">
          <div className="bg-[#1a2e4a] px-4 py-2.5 flex items-center justify-between">
            <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">
              Vendas ({vendasFiltradas.length})
            </h3>
            <button
              onClick={() => { resetForm(); setModalAberto(true) }}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-[#a8bfd4] hover:text-white transition-colors"
            >
              <Plus size={13} /> Nova venda
            </button>
          </div>
          <div className="bg-white overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-[#555]">
                <Loader2 size={20} className="animate-spin mr-2" /> Carregando...
              </div>
            ) : error ? (
              <div className="flex items-center justify-center py-16 text-[#8b0000]">
                <AlertCircle size={16} className="mr-2" /> {error}
              </div>
            ) : vendasFiltradas.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-[#555]">
                <ShoppingCart size={32} className="mb-2 text-[#ccc]" />
                <p className="text-sm">Nenhuma venda encontrada</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#ccc] text-[10px] font-bold text-[#555] uppercase tracking-wider">
                    <th className="text-left px-4 py-3">Cliente</th>
                    <th className="text-left px-4 py-3">Itens</th>
                    <th className="text-left px-4 py-3">Tipo</th>
                    <th className="text-left px-4 py-3">Data</th>
                    <th className="text-left px-4 py-3">Forma pgto</th>
                    <th className="text-right px-4 py-3">Valor total</th>
                    <th className="text-center px-4 py-3">CR gerado</th>
                    <th className="text-center px-4 py-3">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {vendasFiltradas.map((v) => (
                    <tr key={v.id} className="border-b border-[#eee] hover:bg-[#fafafa] transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#0a0a0a]">{v.cliente_nome}</div>
                        {v.cliente_cpf_cnpj && (
                          <div className="text-[11px] text-[#555]">{formatDoc(v.cliente_cpf_cnpj)}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#555]">
                        {v.vendas_itens?.length || 0} item(ns)
                      </td>
                      <td className="px-4 py-3"><TipoBadge tipo={v.tipo} /></td>
                      <td className="px-4 py-3 text-[#555]">{formatData(v.data_venda)}</td>
                      <td className="px-4 py-3 text-[#555]">{LABEL_FORMA[v.forma_pagamento] || v.forma_pagamento}</td>
                      <td className="px-4 py-3 text-right font-semibold text-[#0a0a0a]">{formatBRL(v.valor_total)}</td>
                      <td className="px-4 py-3 text-center"><CRBadge venda={v} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => setModalDetalhes(v)}
                            className="p-1.5 rounded hover:bg-[#f0f4f8] text-[#1a2e4a] transition-colors"
                            title="Ver detalhes"
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            onClick={() => setConfirmDelete(v.id)}
                            className="p-1.5 rounded hover:bg-[#fdecea] text-[#8b0000] transition-colors"
                            title="Excluir"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ================================================================
         MODAL NOVA VENDA
         ================================================================ */}
      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 my-auto">
            {/* Header */}
            <div className="bg-[#1a2e4a] px-5 py-3 flex items-center justify-between rounded-t-lg">
              <h2 className="text-[11px] font-bold text-white uppercase tracking-widest">Nova Venda</h2>
              <button onClick={() => setModalAberto(false)} className="text-[#a8bfd4] hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* Tipo */}
              <div>
                <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-2">Tipo</label>
                <div className="grid grid-cols-4 gap-2">
                  {TIPOS_VENDA.map((t) => {
                    const Icon = t.icon
                    const sel = formTipo === t.value
                    return (
                      <button
                        key={t.value}
                        onClick={() => setFormTipo(t.value)}
                        className={`flex flex-col items-center gap-1 px-3 py-2.5 rounded-md border text-xs font-semibold transition-all ${
                          sel
                            ? 'border-[#1a2e4a] bg-[#f0f4f8] text-[#1a2e4a]'
                            : 'border-[#ccc] bg-white text-[#555] hover:border-[#999]'
                        }`}
                      >
                        <Icon size={16} />
                        {t.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Cliente */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Cliente</label>
                  <input
                    type="text"
                    value={formCliente}
                    onChange={(e) => setFormCliente(e.target.value)}
                    placeholder="Nome do cliente"
                    className="w-full px-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#0a0a0a] placeholder-[#999] focus:outline-none focus:border-[#1a2e4a] focus:ring-1 focus:ring-[#1a2e4a]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">CPF/CNPJ</label>
                  <input
                    type="text"
                    value={formCpfCnpj}
                    onChange={(e) => setFormCpfCnpj(e.target.value)}
                    placeholder="Opcional"
                    className="w-full px-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#0a0a0a] placeholder-[#999] focus:outline-none focus:border-[#1a2e4a] focus:ring-1 focus:ring-[#1a2e4a]"
                  />
                </div>
              </div>

              {/* Data */}
              <div>
                <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Data da venda</label>
                <input
                  type="date"
                  value={formDataVenda}
                  onChange={(e) => setFormDataVenda(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#0a0a0a] focus:outline-none focus:border-[#1a2e4a] focus:ring-1 focus:ring-[#1a2e4a]"
                />
              </div>

              {/* Itens */}
              <div>
                <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-2">Itens</label>
                <div className="border border-[#ccc] rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#f5f5f5] text-[10px] font-bold text-[#555] uppercase tracking-wider">
                        <th className="text-left px-3 py-2">Descricao</th>
                        <th className="text-center px-3 py-2 w-20">Qtd</th>
                        <th className="text-center px-3 py-2 w-28">Valor unit.</th>
                        <th className="text-right px-3 py-2 w-28">Subtotal</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {formItens.map((it, idx) => (
                        <tr key={idx} className="border-t border-[#eee]">
                          <td className="px-2 py-1.5">
                            <input
                              type="text"
                              value={it.descricao}
                              onChange={(e) => updateItem(idx, 'descricao', e.target.value)}
                              placeholder="Descricao do item"
                              className="w-full px-2 py-1 text-sm border border-[#ccc] rounded bg-white text-[#0a0a0a] placeholder-[#999] focus:outline-none focus:border-[#1a2e4a]"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              min={1}
                              value={it.quantidade}
                              onChange={(e) => updateItem(idx, 'quantidade', parseInt(e.target.value) || 1)}
                              className="w-full px-2 py-1 text-sm text-center border border-[#ccc] rounded bg-white text-[#0a0a0a] focus:outline-none focus:border-[#1a2e4a]"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              value={it.valor_unitario}
                              onChange={(e) => updateItem(idx, 'valor_unitario', parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1 text-sm text-center border border-[#ccc] rounded bg-white text-[#0a0a0a] focus:outline-none focus:border-[#1a2e4a]"
                            />
                          </td>
                          <td className="px-3 py-1.5 text-right text-sm font-medium text-[#0a0a0a]">
                            {formatBRL(it.quantidade * it.valor_unitario)}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            {formItens.length > 1 && (
                              <button
                                onClick={() => removeItem(idx)}
                                className="text-[#8b0000] hover:text-red-700 transition-colors"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  onClick={addItem}
                  className="mt-2 text-[11px] font-semibold text-[#1a2e4a] hover:underline flex items-center gap-1"
                >
                  <Plus size={12} /> Item
                </button>
              </div>

              {/* Desconto */}
              <div>
                <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Desconto</label>
                <div className="flex items-center gap-2">
                  <select
                    value={formDescontoTipo}
                    onChange={(e) => setFormDescontoTipo(e.target.value as 'valor' | 'percentual')}
                    className="px-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#0a0a0a] focus:outline-none focus:border-[#1a2e4a]"
                  >
                    <option value="valor">R$</option>
                    <option value="percentual">%</option>
                  </select>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={formDesconto}
                    onChange={(e) => setFormDesconto(parseFloat(e.target.value) || 0)}
                    className="flex-1 px-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#0a0a0a] focus:outline-none focus:border-[#1a2e4a] focus:ring-1 focus:ring-[#1a2e4a]"
                  />
                </div>
                {descontoCalculado > 0 && (
                  <p className="mt-1 text-[11px] text-[#555]">Desconto aplicado: {formatBRL(descontoCalculado)}</p>
                )}
              </div>

              {/* Forma de pagamento */}
              <div>
                <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-2">Forma de pagamento</label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {FORMAS_PAGAMENTO.map((f) => {
                    const Icon = f.icon
                    const sel = formPagamento === f.value
                    return (
                      <button
                        key={f.value}
                        onClick={() => setFormPagamento(f.value)}
                        className={`flex flex-col items-center gap-1 px-2 py-2 rounded-md border text-[10px] font-semibold transition-all ${
                          sel
                            ? 'border-[#1a2e4a] bg-[#f0f4f8] text-[#1a2e4a]'
                            : 'border-[#ccc] bg-white text-[#555] hover:border-[#999]'
                        }`}
                      >
                        <Icon size={14} />
                        {f.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Parcelas */}
              {formPagamento === 'parcelado' && (
                <div>
                  <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Numero de parcelas</label>
                  <select
                    value={formParcelas}
                    onChange={(e) => setFormParcelas(parseInt(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#0a0a0a] focus:outline-none focus:border-[#1a2e4a] focus:ring-1 focus:ring-[#1a2e4a]"
                  >
                    {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => (
                      <option key={n} value={n}>{n}x de {formatBRL(totalVenda / n)}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Conta bancaria */}
              <div>
                <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Conta bancaria destino</label>
                <select
                  value={formContaBancaria}
                  onChange={(e) => setFormContaBancaria(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#0a0a0a] focus:outline-none focus:border-[#1a2e4a] focus:ring-1 focus:ring-[#1a2e4a]"
                >
                  <option value="">Selecione...</option>
                  {bankAccounts.map((ba) => (
                    <option key={ba.id} value={ba.id}>{ba.nome}</option>
                  ))}
                </select>
              </div>

              {/* Centro de custo */}
              <div>
                <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-1">Centro de custo</label>
                <select
                  value={formCentroCusto}
                  onChange={(e) => setFormCentroCusto(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#0a0a0a] focus:outline-none focus:border-[#1a2e4a] focus:ring-1 focus:ring-[#1a2e4a]"
                >
                  <option value="">Nenhum</option>
                  {centrosCusto.map((cc) => (
                    <option key={cc.id} value={cc.id}>{cc.nome}</option>
                  ))}
                </select>
              </div>

              {/* Preview */}
              {totalVenda > 0 && (
                <div className="rounded-md border border-[#0a5c2e] bg-[#e6f4ec] p-3">
                  <div className="flex items-start gap-2">
                    <Check size={16} className="text-[#0a5c2e] mt-0.5 flex-shrink-0" />
                    <div className="text-[12px] text-[#0a5c2e]">
                      {formPagamento === 'parcelado' ? (
                        <>
                          <p className="font-semibold mb-1">CR gerado automaticamente &mdash; {formParcelas}x parcelas:</p>
                          <ul className="space-y-0.5">
                            {Array.from({ length: formParcelas }, (_, i) => {
                              const valorParcela = Math.round((totalVenda / formParcelas) * 100) / 100
                              const valor = i === formParcelas - 1
                                ? totalVenda - valorParcela * (formParcelas - 1)
                                : valorParcela
                              const venc = format(addMonths(parseISO(formDataVenda), i + 1), 'dd/MM/yyyy')
                              return (
                                <li key={i}>Parcela {i + 1}: {formatBRL(valor)} &middot; vencimento {venc}</li>
                              )
                            })}
                          </ul>
                        </>
                      ) : (
                        <p className="font-semibold">
                          CR gerado automaticamente &mdash; {formatBRL(totalVenda)} &middot; vencimento {format(parseISO(formDataVenda), 'dd/MM/yyyy')}
                          {isAVista && ' (quitado automaticamente)'}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Error */}
              {erroModal && (
                <div className="rounded-md border border-[#8b0000] bg-[#fdecea] p-3 flex items-center gap-2 text-[12px] text-[#8b0000]">
                  <AlertCircle size={14} className="flex-shrink-0" />
                  {erroModal}
                </div>
              )}

              {/* Total + actions */}
              <div className="flex items-center justify-between pt-2 border-t border-[#ccc]">
                <div>
                  <span className="text-[10px] font-bold text-[#555] uppercase tracking-wider">Total: </span>
                  <span className="text-lg font-bold text-[#0a0a0a]">{formatBRL(totalVenda)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setModalAberto(false)}
                    className="px-4 py-2 text-sm font-medium text-[#555] border border-[#ccc] rounded-md hover:bg-[#f5f5f5] transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={salvarVenda}
                    disabled={salvando}
                    className="px-5 py-2 text-sm font-semibold text-white bg-[#1a2e4a] rounded-md hover:bg-[#15253d] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    {salvando && <Loader2 size={14} className="animate-spin" />}
                    Confirmar venda
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================
         MODAL DETALHES
         ================================================================ */}
      {modalDetalhes && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 my-auto">
            <div className="bg-[#1a2e4a] px-5 py-3 flex items-center justify-between rounded-t-lg">
              <h2 className="text-[11px] font-bold text-white uppercase tracking-widest">Detalhes da Venda</h2>
              <button onClick={() => setModalDetalhes(null)} className="text-[#a8bfd4] hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-[10px] font-bold text-[#555] uppercase tracking-wider block">Cliente</span>
                  <span className="text-[#0a0a0a] font-medium">{modalDetalhes.cliente_nome}</span>
                  {modalDetalhes.cliente_cpf_cnpj && (
                    <span className="block text-[11px] text-[#555]">{formatDoc(modalDetalhes.cliente_cpf_cnpj)}</span>
                  )}
                </div>
                <div>
                  <span className="text-[10px] font-bold text-[#555] uppercase tracking-wider block">Data</span>
                  <span className="text-[#0a0a0a]">{formatData(modalDetalhes.data_venda)}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-[#555] uppercase tracking-wider block">Tipo</span>
                  <TipoBadge tipo={modalDetalhes.tipo} />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-[#555] uppercase tracking-wider block">Forma pgto</span>
                  <span className="text-[#0a0a0a]">{LABEL_FORMA[modalDetalhes.forma_pagamento] || modalDetalhes.forma_pagamento}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-[#555] uppercase tracking-wider block">Valor total</span>
                  <span className="text-[#0a0a0a] font-bold">{formatBRL(modalDetalhes.valor_total)}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-[#555] uppercase tracking-wider block">CR</span>
                  <CRBadge venda={modalDetalhes} />
                </div>
              </div>

              {/* Itens */}
              {modalDetalhes.vendas_itens && modalDetalhes.vendas_itens.length > 0 && (
                <div>
                  <span className="text-[10px] font-bold text-[#555] uppercase tracking-wider block mb-2">Itens</span>
                  <div className="border border-[#ccc] rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[#f5f5f5] text-[10px] font-bold text-[#555] uppercase tracking-wider">
                          <th className="text-left px-3 py-2">Descricao</th>
                          <th className="text-center px-3 py-2 w-16">Qtd</th>
                          <th className="text-right px-3 py-2 w-24">Unit.</th>
                          <th className="text-right px-3 py-2 w-24">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {modalDetalhes.vendas_itens.map((it) => (
                          <tr key={it.id} className="border-t border-[#eee]">
                            <td className="px-3 py-2 text-[#0a0a0a]">{it.descricao}</td>
                            <td className="px-3 py-2 text-center text-[#555]">{it.quantidade}</td>
                            <td className="px-3 py-2 text-right text-[#555]">{formatBRL(it.valor_unitario)}</td>
                            <td className="px-3 py-2 text-right font-medium text-[#0a0a0a]">{formatBRL(it.valor_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* CRs */}
              {modalDetalhes.contas_receber && modalDetalhes.contas_receber.length > 0 && (
                <div>
                  <span className="text-[10px] font-bold text-[#555] uppercase tracking-wider block mb-2">Contas a Receber</span>
                  <div className="space-y-1.5">
                    {modalDetalhes.contas_receber.map((cr, idx) => (
                      <div key={cr.id} className="flex items-center justify-between text-sm px-3 py-2 border border-[#eee] rounded-md bg-[#fafafa]">
                        <span className="text-[#555]">
                          {modalDetalhes.contas_receber!.length > 1 ? `Parcela ${idx + 1}` : 'CR'} &mdash; venc. {formatData(cr.data_vencimento)}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-[#0a0a0a]">{formatBRL(cr.valor)}</span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                            cr.status === 'pago'
                              ? 'text-[#0a5c2e] bg-[#e6f4ec]'
                              : cr.status === 'parcial'
                              ? 'text-[#5c3a00] bg-[#fffbe6]'
                              : 'text-[#1a2e4a] bg-[#f0f4f8]'
                          }`}>
                            {cr.status === 'pago' ? 'Pago' : cr.status === 'parcial' ? 'Parcial' : 'Aberto'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-[#ccc] flex justify-end">
                <button
                  onClick={() => setModalDetalhes(null)}
                  className="px-4 py-2 text-sm font-medium text-[#555] border border-[#ccc] rounded-md hover:bg-[#f5f5f5] transition-colors"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================
         MODAL CONFIRMAR EXCLUSAO
         ================================================================ */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4">
            <div className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-[#fdecea] flex items-center justify-center">
                  <Trash2 size={18} className="text-[#8b0000]" />
                </div>
                <div>
                  <h3 className="font-semibold text-[#0a0a0a]">Excluir venda</h3>
                  <p className="text-sm text-[#555]">Esta acao nao pode ser desfeita.</p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="px-4 py-2 text-sm font-medium text-[#555] border border-[#ccc] rounded-md hover:bg-[#f5f5f5] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => deletarVenda(confirmDelete)}
                  className="px-4 py-2 text-sm font-semibold text-white bg-[#8b0000] rounded-md hover:bg-[#6d0000] transition-colors"
                >
                  Excluir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
