import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { format, endOfMonth, parseISO } from 'date-fns'
import {
  FileText, Plus, Search, Loader2, X, Download,
  Mail, MoreHorizontal, Check, Ban, RefreshCw,
  AlertTriangle, Eye, Send, XCircle, DollarSign, Activity,
  ShoppingCart, FileDown
} from 'lucide-react'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { formatBRL, formatData, formatDoc } from '@/lib/format'
import { unmask } from '@/utils/masks'
import { AppLayout } from '@/components/layout/AppLayout'
import { toast } from 'sonner'

// ─── Types ──────────────────────────────────────────────────────────
interface NfseEmissao {
  id: string
  company_id: string
  referencia: string
  numero_nfse: string | null
  codigo_verificacao: string | null
  data_emissao: string
  data_competencia: string | null
  status: string
  tomador_documento: string | null
  tomador_razao_social: string | null
  tomador_email: string | null
  tomador_telefone: string | null
  tomador_endereco_logradouro: string | null
  tomador_endereco_numero: string | null
  tomador_endereco_complemento: string | null
  tomador_endereco_bairro: string | null
  tomador_endereco_cidade: string | null
  tomador_endereco_estado: string | null
  tomador_endereco_cep: string | null
  discriminacao: string | null
  valor_servicos: number
  valor_deducoes: number
  valor_iss: number
  aliquota_iss: number
  iss_retido: boolean
  valor_liquido: number
  item_lista_servico: string | null
  codigo_cnae: string | null
  natureza_operacao: number | null
  pdf_url: string | null
  xml_url: string | null
  protocolo: string | null
  mensagem_retorno: string | null
  client_id: string | null
}

interface NfseEvento {
  id: string
  emissao_id: string
  tipo: string
  descricao: string | null
  payload: any
  created_at: string
}

interface Client {
  id: string
  razao_social: string | null
  cpf_cnpj: string | null
  email: string | null
  telefone: string | null
  endereco_logradouro: string | null
  endereco_numero: string | null
  endereco_complemento: string | null
  endereco_bairro: string | null
  endereco_cidade: string | null
  endereco_estado: string | null
  endereco_cep: string | null
}

interface NfseConfig {
  aliquota_padrao: number
  item_lista_servico_padrao: string
  codigo_cnae_padrao: string
  discriminacao_padrao: string
  natureza_operacao: number
}

interface VendaItem {
  id: string
  venda_id: string
  descricao: string | null
  quantidade: number
  valor_total: number
}

interface VendaRow {
  id: string
  data_venda: string
  cliente_nome: string | null
  cliente_cpf_cnpj: string | null
  valor_total: number
  forma_pagamento: string | null
  nf_emitida: boolean
  itens: VendaItem[]
}

// ─── Status config ──────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon?: 'check' | 'spin' | 'ban' | 'alert' }> = {
  rascunho:          { label: 'Rascunho',        color: '#667085', bg: '#F3F4F6' },
  enviando:          { label: 'Enviando',         color: '#EA580C', bg: '#FFF0EB', icon: 'spin' },
  processando:       { label: 'Processando',      color: '#EA580C', bg: '#FFF0EB', icon: 'spin' },
  autorizada:        { label: 'Autorizada',       color: '#039855', bg: '#ECFDF3', icon: 'check' },
  erro_autorizacao:  { label: 'Erro',             color: '#E53E3E', bg: '#FEE2E2', icon: 'alert' },
  cancelada:         { label: 'Cancelada',        color: '#4B5563', bg: '#EAECF0', icon: 'ban' },
}

// ─── Empty form ─────────────────────────────────────────────────────
const emptyForm = {
  client_id: '',
  tomador_documento: '',
  tomador_razao_social: '',
  tomador_email: '',
  tomador_telefone: '',
  tomador_endereco_logradouro: '',
  tomador_endereco_numero: '',
  tomador_endereco_complemento: '',
  tomador_endereco_bairro: '',
  tomador_endereco_cidade: '',
  tomador_endereco_estado: '',
  tomador_endereco_cep: '',
  discriminacao: '',
  valor_servicos: 0,
  aliquota_iss: 3,
  iss_retido: false,
  item_lista_servico: '',
  codigo_cnae: '',
}

// ─── Component ──────────────────────────────────────────────────────
export default function NfseEmissao() {
  const { selectedCompany } = useCompany()
  const { activeClient } = useAuth()

  // Data
  const [emissoes, setEmissoes] = useState<NfseEmissao[]>([])
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState<NfseConfig | null>(null)
  const [clients, setClients] = useState<Client[]>([])

  // Tabs
  const [activeTab, setActiveTab] = useState<'vendas' | 'emissoes'>('vendas')

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [mesAno, setMesAno] = useState(() => format(new Date(), 'yyyy-MM'))

  // Vendas (relação a faturar)
  const [vendas, setVendas] = useState<VendaRow[]>([])
  const [loadingVendas, setLoadingVendas] = useState(true)
  const [vendasFiltro, setVendasFiltro] = useState<'todas' | 'pendentes' | 'emitidas'>('pendentes')
  const [vendasSearch, setVendasSearch] = useState('')
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Filtros por coluna
  const [filtroItem, setFiltroItem] = useState('')
  const [filtroNome, setFiltroNome] = useState('')
  const [filtroDoc, setFiltroDoc] = useState('')
  const [filtroForma, setFiltroForma] = useState('todas')

  // Modals
  const [showNovaModal, setShowNovaModal] = useState(false)
  const [showCancelarModal, setShowCancelarModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedEmissao, setSelectedEmissao] = useState<NfseEmissao | null>(null)
  const [eventos, setEventos] = useState<NfseEvento[]>([])
  const [loadingEventos, setLoadingEventos] = useState(false)

  // Form
  const [form, setForm] = useState({ ...emptyForm })
  const [submitting, setSubmitting] = useState(false)
  const [polling, setPolling] = useState(false)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollingCountRef = useRef(0)

  // Cancel
  const [justificativa, setJustificativa] = useState('')
  const [cancelling, setCancelling] = useState(false)

  // Dropdown
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null)
  const [dropdownCoords, setDropdownCoords] = useState<{ top: number; right: number } | null>(null)

  useEffect(() => {
    if (!dropdownOpen) return
    const handler = () => { setDropdownOpen(null); setDropdownCoords(null) }
    window.addEventListener('click', handler)
    window.addEventListener('scroll', handler, true)
    window.addEventListener('resize', handler)
    return () => {
      window.removeEventListener('click', handler)
      window.removeEventListener('scroll', handler, true)
      window.removeEventListener('resize', handler)
    }
  }, [dropdownOpen])

  // ─── Data Loading ─────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!selectedCompany) return
    setLoading(true)
    const db = activeClient as any

    const inicioMes = `${mesAno}-01`
    const fimMes = format(endOfMonth(parseISO(inicioMes)), 'yyyy-MM-dd')

    const [emRes, cfgRes] = await Promise.all([
      db.from('nfse_emissoes')
        .select('*')
        .eq('company_id', selectedCompany.id)
        .gte('data_emissao', inicioMes)
        .lte('data_emissao', fimMes)
        .order('data_emissao', { ascending: false }),
      db.from('nfse_configuracoes')
        .select('aliquota_padrao, item_lista_servico_padrao, codigo_cnae_padrao, discriminacao_padrao, natureza_operacao')
        .eq('company_id', selectedCompany.id)
        .maybeSingle(),
    ])

    setEmissoes(emRes.data || [])
    if (cfgRes.data) setConfig(cfgRes.data)
    setLoading(false)
  }, [selectedCompany, activeClient, mesAno])

  const loadVendas = useCallback(async () => {
    if (!selectedCompany) return
    setLoadingVendas(true)
    const db = activeClient as any

    const inicioMes = `${mesAno}-01`
    const fimMes = format(endOfMonth(parseISO(inicioMes)), 'yyyy-MM-dd')

    try {
      const { data: vData } = await db.from('vendas')
        .select('id, data_venda, cliente_nome, cliente_cpf_cnpj, valor_total, forma_pagamento, nf_emitida')
        .eq('company_id', selectedCompany.id)
        .gte('data_venda', inicioMes)
        .lte('data_venda', fimMes)
        .order('data_venda', { ascending: false })

      const lista = (vData || []) as VendaRow[]
      const ids = lista.map(v => v.id)

      const itensByVenda = new Map<string, VendaItem[]>()
      if (ids.length > 0) {
        const chunkSize = 300
        for (let i = 0; i < ids.length; i += chunkSize) {
          const chunk = ids.slice(i, i + chunkSize)
          const { data: itensData } = await db.from('vendas_itens')
            .select('id, venda_id, descricao, quantidade, valor_total')
            .in('venda_id', chunk)
          for (const it of (itensData || []) as VendaItem[]) {
            const arr = itensByVenda.get(it.venda_id) || []
            arr.push(it)
            itensByVenda.set(it.venda_id, arr)
          }
        }
      }

      setVendas(lista.map(v => ({ ...v, itens: itensByVenda.get(v.id) || [] })))
    } catch (err: any) {
      console.error('Erro ao carregar vendas:', err)
      toast.error(err.message || 'Erro ao carregar vendas')
    } finally {
      setLoadingVendas(false)
    }
  }, [selectedCompany, activeClient, mesAno])

  const loadClients = useCallback(async () => {
    if (!selectedCompany) return
    const db = activeClient as any
    const { data } = await db.from('clients')
      .select('id, razao_social, cpf_cnpj, email, telefone, endereco_logradouro, endereco_numero, endereco_complemento, endereco_bairro, endereco_cidade, endereco_estado, endereco_cep')
      .eq('company_id', selectedCompany.id)
      .order('razao_social')
    setClients(data || [])
  }, [selectedCompany, activeClient])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => { loadVendas() }, [loadVendas])

  // ─── KPIs ─────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const autorizadas = emissoes.filter(e => e.status === 'autorizada')
    const processando = emissoes.filter(e => e.status === 'enviando' || e.status === 'processando')
    const totalEmitido = autorizadas.reduce((s, e) => s + (e.valor_servicos || 0), 0)
    return {
      total: emissoes.length,
      autorizadas: autorizadas.length,
      totalEmitido,
      processando: processando.length,
    }
  }, [emissoes])

  // ─── Vendas: KPIs + filtros ────────────────────────────────────────
  const vendasKpis = useMemo(() => {
    const total = vendas.length
    const emitidas = vendas.filter(v => v.nf_emitida).length
    const pendentes = total - emitidas
    const valorPendente = vendas.filter(v => !v.nf_emitida).reduce((s, v) => s + (v.valor_total || 0), 0)
    return { total, emitidas, pendentes, valorPendente }
  }, [vendas])

  const formasDisponiveis = useMemo(() => {
    const set = new Set<string>()
    vendas.forEach(v => { if (v.forma_pagamento) set.add(v.forma_pagamento) })
    return Array.from(set).sort()
  }, [vendas])

  const vendasFiltradas = useMemo(() => {
    let list = vendas
    if (vendasFiltro === 'pendentes') list = list.filter(v => !v.nf_emitida)
    if (vendasFiltro === 'emitidas') list = list.filter(v => v.nf_emitida)
    if (vendasSearch.trim()) {
      const term = vendasSearch.toLowerCase()
      list = list.filter(v =>
        v.cliente_nome?.toLowerCase().includes(term) ||
        v.cliente_cpf_cnpj?.includes(term) ||
        v.itens.some(it => it.descricao?.toLowerCase().includes(term))
      )
    }
    if (filtroItem.trim()) {
      const t = filtroItem.toLowerCase()
      list = list.filter(v => v.itens.some(it => it.descricao?.toLowerCase().includes(t)))
    }
    if (filtroNome.trim()) {
      const t = filtroNome.toLowerCase()
      list = list.filter(v => v.cliente_nome?.toLowerCase().includes(t))
    }
    if (filtroDoc.trim()) {
      const t = filtroDoc.replace(/\D/g, '')
      if (t) list = list.filter(v => (v.cliente_cpf_cnpj || '').replace(/\D/g, '').includes(t))
    }
    if (filtroForma !== 'todas') {
      list = list.filter(v => v.forma_pagamento === filtroForma)
    }
    return list
  }, [vendas, vendasFiltro, vendasSearch, filtroItem, filtroNome, filtroDoc, filtroForma])

  const toggleNfEmitida = useCallback(async (venda: VendaRow) => {
    if (togglingId) return
    setTogglingId(venda.id)
    const db = activeClient as any
    const novoStatus = !venda.nf_emitida
    try {
      const { error } = await db.from('vendas')
        .update({
          nf_emitida: novoStatus,
          nf_emitida_em: novoStatus ? new Date().toISOString() : null,
        })
        .eq('id', venda.id)
      if (error) throw error
      setVendas(prev => prev.map(v => v.id === venda.id ? { ...v, nf_emitida: novoStatus } : v))
      toast.success(novoStatus ? 'Marcada como NF emitida' : 'Desmarcada')
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar')
    } finally {
      setTogglingId(null)
    }
  }, [activeClient, togglingId])

  const emitirParaVenda = useCallback((v: VendaRow) => {
    const discriminacao = v.itens.length > 0
      ? v.itens.map(it => `${it.quantidade}x ${it.descricao || 'Item'} — ${formatBRL(it.valor_total)}`).join('\n')
      : ''
    resetForm()
    setForm(prev => ({
      ...prev,
      tomador_documento: v.cliente_cpf_cnpj || '',
      tomador_razao_social: v.cliente_nome || '',
      discriminacao: discriminacao || prev.discriminacao,
      valor_servicos: v.valor_total || 0,
    }))
    loadClients()
    setShowNovaModal(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const exportarCSV = useCallback(() => {
    const linhas = [
      ['Data', 'Itens', 'Nome', 'CNPJ/CPF', 'Valor', 'Forma de pagamento', 'NF emitida'],
      ...vendasFiltradas.map(v => [
        formatData(v.data_venda),
        v.itens.map(it => `${it.quantidade}x ${it.descricao || ''}`.trim()).join(' | '),
        v.cliente_nome || '',
        formatDoc(v.cliente_cpf_cnpj) || '',
        (v.valor_total || 0).toFixed(2).replace('.', ','),
        v.forma_pagamento || '',
        v.nf_emitida ? 'Sim' : 'Nao',
      ]),
    ]
    const csv = linhas.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `relacao-nf-${mesAno}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }, [vendasFiltradas, mesAno])

  // ─── Filtered ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = emissoes
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      list = list.filter(e =>
        e.tomador_razao_social?.toLowerCase().includes(term) ||
        e.tomador_documento?.includes(term) ||
        e.numero_nfse?.includes(term) ||
        e.referencia?.toLowerCase().includes(term)
      )
    }
    if (statusFilter !== 'todos') {
      list = list.filter(e => e.status === statusFilter)
    }
    return list
  }, [emissoes, searchTerm, statusFilter])

  // ─── Form helpers ─────────────────────────────────────────────────
  const resetForm = () => {
    setForm({
      ...emptyForm,
      aliquota_iss: config?.aliquota_padrao ?? 3,
      item_lista_servico: config?.item_lista_servico_padrao ?? '',
      codigo_cnae: config?.codigo_cnae_padrao ?? '',
      discriminacao: config?.discriminacao_padrao ?? '',
    })
  }

  const openNovaModal = () => {
    resetForm()
    loadClients()
    setShowNovaModal(true)
  }

  const handleClientSelect = (clientId: string) => {
    const c = clients.find(cl => cl.id === clientId)
    if (!c) return
    setForm(prev => ({
      ...prev,
      client_id: clientId,
      tomador_documento: c.cpf_cnpj || '',
      tomador_razao_social: c.razao_social || '',
      tomador_email: c.email || '',
      tomador_telefone: c.telefone || '',
      tomador_endereco_logradouro: c.endereco_logradouro || '',
      tomador_endereco_numero: c.endereco_numero || '',
      tomador_endereco_complemento: c.endereco_complemento || '',
      tomador_endereco_bairro: c.endereco_bairro || '',
      tomador_endereco_cidade: c.endereco_cidade || '',
      tomador_endereco_estado: c.endereco_estado || '',
      tomador_endereco_cep: c.endereco_cep || '',
    }))
  }

  // ─── Calculated values ────────────────────────────────────────────
  const issCalculado = useMemo(() => {
    return (form.valor_servicos * form.aliquota_iss) / 100
  }, [form.valor_servicos, form.aliquota_iss])

  const valorLiquido = useMemo(() => {
    return form.iss_retido
      ? form.valor_servicos - issCalculado
      : form.valor_servicos
  }, [form.valor_servicos, form.iss_retido, issCalculado])

  // ─── Polling logic ────────────────────────────────────────────────
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
    pollingCountRef.current = 0
    setPolling(false)
  }, [])

  const startPolling = useCallback((emissaoId: string) => {
    setPolling(true)
    pollingCountRef.current = 0
    const db = activeClient as any

    pollingRef.current = setInterval(async () => {
      pollingCountRef.current += 1

      try {
        const { data, error } = await db.functions.invoke('consultar-nfse', {
          body: { emissao_id: emissaoId },
        })

        if (error) {
          console.error('Polling error:', error)
        }

        if (data?.status === 'autorizada') {
          stopPolling()
          toast.success(`NFSe autorizada! Numero: ${data.numero || emissaoId}`)
          loadData()
          setShowNovaModal(false)
          return
        }

        if (data?.status === 'erro_autorizacao') {
          stopPolling()
          toast.error(`Erro na emissao: ${data.mensagem || 'Verifique os dados e tente novamente'}`)
          loadData()
          return
        }
      } catch (err) {
        console.error('Polling exception:', err)
      }

      if (pollingCountRef.current >= 12) {
        stopPolling()
        toast.info('Consulta encerrada. A NFSe ainda esta sendo processada. Atualize a pagina para verificar.')
        loadData()
      }
    }, 5000)
  }, [activeClient, stopPolling, loadData])

  useEffect(() => {
    return () => { stopPolling() }
  }, [stopPolling])

  // ─── Salvar Rascunho ──────────────────────────────────────────────
  const handleSalvarRascunho = async (): Promise<string | null> => {
    if (!selectedCompany) return null
    if (!form.tomador_razao_social.trim()) {
      toast.error('Informe a razao social do tomador')
      return null
    }
    if (form.valor_servicos <= 0) {
      toast.error('Informe o valor dos servicos')
      return null
    }
    if (!form.discriminacao.trim()) {
      toast.error('Informe a discriminacao do servico')
      return null
    }

    setSubmitting(true)
    const db = activeClient as any

    try {
      const referencia = `nfse_${crypto.randomUUID().slice(0, 8)}`
      const { data, error } = await db.from('nfse_emissoes').insert({
        company_id: selectedCompany.id,
        referencia,
        data_emissao: format(new Date(), 'yyyy-MM-dd'),
        data_competencia: format(new Date(), 'yyyy-MM-dd'),
        status: 'rascunho',
        client_id: form.client_id || null,
        tomador_documento: unmask(form.tomador_documento) || null,
        tomador_razao_social: form.tomador_razao_social,
        tomador_email: form.tomador_email || null,
        tomador_telefone: form.tomador_telefone || null,
        tomador_endereco_logradouro: form.tomador_endereco_logradouro || null,
        tomador_endereco_numero: form.tomador_endereco_numero || null,
        tomador_endereco_complemento: form.tomador_endereco_complemento || null,
        tomador_endereco_bairro: form.tomador_endereco_bairro || null,
        tomador_endereco_cidade: form.tomador_endereco_cidade || null,
        tomador_endereco_estado: form.tomador_endereco_estado || null,
        tomador_endereco_cep: unmask(form.tomador_endereco_cep) || null,
        discriminacao: form.discriminacao,
        valor_servicos: form.valor_servicos,
        valor_deducoes: 0,
        valor_iss: issCalculado,
        aliquota_iss: form.aliquota_iss,
        iss_retido: form.iss_retido,
        valor_liquido: valorLiquido,
        item_lista_servico: form.item_lista_servico || null,
        codigo_cnae: form.codigo_cnae || null,
        natureza_operacao: config?.natureza_operacao ?? 1,
      }).select('id').single()

      if (error) throw error

      toast.success('Rascunho salvo com sucesso')
      loadData()
      return data?.id || null
    } catch (err: any) {
      console.error('Erro ao salvar rascunho:', err)
      toast.error(err.message || 'Erro ao salvar rascunho')
      return null
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Emitir NFSe ─────────────────────────────────────────────────
  const handleEmitir = async () => {
    setSubmitting(true)
    const db = activeClient as any

    try {
      const emissaoId = await handleSalvarRascunho()
      if (!emissaoId) {
        setSubmitting(false)
        return
      }

      toast.info('Enviando NFSe para processamento...')

      const { error } = await db.functions.invoke('emitir-nfse', {
        body: { emissao_id: emissaoId },
      })

      if (error) {
        toast.error('Erro ao enviar: ' + error.message)
        setSubmitting(false)
        return
      }

      startPolling(emissaoId)
    } catch (err: any) {
      console.error('Erro ao emitir NFSe:', err)
      toast.error(err.message || 'Erro ao emitir NFSe')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Cancelar NFSe ───────────────────────────────────────────────
  const openCancelarModal = (em: NfseEmissao) => {
    setSelectedEmissao(em)
    setJustificativa('')
    setShowCancelarModal(true)
    setDropdownOpen(null)
  }

  const handleCancelar = async () => {
    if (!selectedEmissao) return
    if (justificativa.length < 15) {
      toast.error('Justificativa deve ter pelo menos 15 caracteres')
      return
    }

    setCancelling(true)
    const db = activeClient as any

    try {
      const { error } = await db.functions.invoke('cancelar-nfse', {
        body: { emissao_id: selectedEmissao.id, justificativa },
      })

      if (error) throw error

      toast.success('Solicitacao de cancelamento enviada')
      setShowCancelarModal(false)
      setSelectedEmissao(null)
      loadData()
    } catch (err: any) {
      console.error('Erro ao cancelar:', err)
      toast.error(err.message || 'Erro ao cancelar NFSe')
    } finally {
      setCancelling(false)
    }
  }

  // ─── Detail / Events ─────────────────────────────────────────────
  const openDetail = async (em: NfseEmissao) => {
    setSelectedEmissao(em)
    setShowDetailModal(true)
    setDropdownOpen(null)
    setLoadingEventos(true)

    const db = activeClient as any
    const { data } = await db.from('nfse_eventos')
      .select('*')
      .eq('emissao_id', em.id)
      .order('created_at', { ascending: true })

    setEventos(data || [])
    setLoadingEventos(false)
  }

  // ─── Reenviar email ──────────────────────────────────────────────
  const handleReenviarEmail = async (em: NfseEmissao) => {
    if (!em.tomador_email) {
      toast.error('Tomador sem email cadastrado')
      return
    }
    const db = activeClient as any
    try {
      await db.functions.invoke('reenviar-email-nfse', {
        body: { emissao_id: em.id },
      })
      toast.success('Email reenviado com sucesso')
    } catch {
      toast.error('Erro ao reenviar email')
    }
    setDropdownOpen(null)
  }

  // ─── Status badge renderer ───────────────────────────────────────
  const renderStatusBadge = (status: string) => {
    const st = STATUS_CONFIG[status] || STATUS_CONFIG.rascunho
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
        style={{ color: st.color, backgroundColor: st.bg }}
      >
        {st.icon === 'check' && <Check size={12} />}
        {st.icon === 'spin' && <Loader2 size={12} className="animate-spin" />}
        {st.icon === 'ban' && <Ban size={12} />}
        {st.icon === 'alert' && <AlertTriangle size={12} />}
        {st.label}
      </span>
    )
  }

  // ─── Input class helper ───────────────────────────────────────────
  const inputClass = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100'
  const labelClass = 'block text-xs font-medium text-gray-600 mb-1'

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <AppLayout title="NFSe - Emissao">
      <div className="p-6 space-y-6">

        {/* ── KPIs ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {(activeTab === 'vendas' ? [
            { label: 'Vendas no periodo', value: vendasKpis.total, icon: ShoppingCart, color: '#059669' },
            { label: 'NF pendentes', value: vendasKpis.pendentes, icon: AlertTriangle, color: '#EA580C' },
            { label: 'NF emitidas', value: vendasKpis.emitidas, icon: Check, color: '#059669' },
            { label: 'Valor pendente', value: formatBRL(vendasKpis.valorPendente), icon: DollarSign, color: '#EA580C' },
          ] : [
            { label: 'Total NFSe', value: kpis.total, icon: FileText, color: '#059669' },
            { label: 'Autorizadas', value: kpis.autorizadas, icon: Check, color: '#059669' },
            { label: 'Valor emitido', value: formatBRL(kpis.totalEmitido), icon: DollarSign, color: '#059669' },
            { label: 'Processando', value: kpis.processando, icon: Activity, color: '#EA580C' },
          ]).map((kpi, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: kpi.color + '12' }}>
                <kpi.icon size={20} style={{ color: kpi.color }} />
              </div>
              <div>
                <p className="text-xs text-gray-500">{kpi.label}</p>
                <p className="text-lg font-semibold" style={{ color: kpi.color }}>{kpi.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div className="flex items-center gap-1 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('vendas')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'vendas'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="inline-flex items-center gap-2"><ShoppingCart size={15} /> Vendas a faturar</span>
          </button>
          <button
            onClick={() => setActiveTab('emissoes')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'emissoes'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="inline-flex items-center gap-2"><FileText size={15} /> NFSe emitidas</span>
          </button>
        </div>

        {/* ── Toolbar ── */}
        {activeTab === 'emissoes' ? (
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={openNovaModal}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
              style={{ backgroundColor: '#059669' }}
            >
              <Plus size={16} /> Nova NFSe
            </button>

            <div className="relative flex-1 max-w-xs">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar por tomador, numero..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <input
              type="month"
              value={mesAno}
              onChange={e => setMesAno(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
            />

            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="todos">Todos status</option>
              <option value="autorizada">Autorizada</option>
              <option value="rascunho">Rascunho</option>
              <option value="enviando">Enviando</option>
              <option value="processando">Processando</option>
              <option value="erro_autorizacao">Erro</option>
              <option value="cancelada">Cancelada</option>
            </select>

            <button onClick={loadData} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50" title="Atualizar">
              <RefreshCw size={16} className="text-gray-500" />
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={vendasSearch}
                onChange={e => setVendasSearch(e.target.value)}
                placeholder="Buscar por cliente, CPF/CNPJ, item..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <input
              type="month"
              value={mesAno}
              onChange={e => setMesAno(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
            />

            <select
              value={vendasFiltro}
              onChange={e => setVendasFiltro(e.target.value as 'todas' | 'pendentes' | 'emitidas')}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="pendentes">Pendentes (NF nao emitida)</option>
              <option value="emitidas">NF ja emitida</option>
              <option value="todas">Todas as vendas</option>
            </select>

            <button onClick={loadVendas} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50" title="Atualizar">
              <RefreshCw size={16} className="text-gray-500" />
            </button>

            <button
              onClick={exportarCSV}
              disabled={vendasFiltradas.length === 0}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm hover:bg-gray-50 disabled:opacity-50"
              title="Exportar CSV"
            >
              <FileDown size={15} className="text-gray-500" /> Exportar CSV
            </button>
          </div>
        )}

        {/* ── Table: Vendas a faturar ── */}
        {activeTab === 'vendas' && (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {loadingVendas ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="animate-spin text-gray-400" size={24} />
              </div>
            ) : vendasFiltradas.length === 0 ? (
              <div className="text-center py-20 text-gray-400 text-sm">
                Nenhuma venda neste filtro
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: '#1A2434' }} className="text-left text-xs text-white uppercase tracking-wider">
                      <th className="px-4 py-3 font-semibold whitespace-nowrap">Data</th>
                      <th className="px-4 py-3 font-semibold whitespace-nowrap">Item/s</th>
                      <th className="px-4 py-3 font-semibold whitespace-nowrap">Nome</th>
                      <th className="px-4 py-3 font-semibold whitespace-nowrap">CPF/CNPJ</th>
                      <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">Valor</th>
                      <th className="px-4 py-3 font-semibold whitespace-nowrap">Forma de pagamento</th>
                      <th className="px-4 py-3 font-semibold text-center whitespace-nowrap">NF emitida</th>
                      <th className="px-4 py-3 font-semibold text-center whitespace-nowrap">Ações</th>
                    </tr>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-3 py-2"></th>
                      <th className="px-3 py-2">
                        <input
                          type="text"
                          value={filtroItem}
                          onChange={e => setFiltroItem(e.target.value)}
                          placeholder="filtrar..."
                          className="w-full px-2 py-1 text-xs font-normal normal-case rounded border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-blue-200"
                        />
                      </th>
                      <th className="px-3 py-2">
                        <input
                          type="text"
                          value={filtroNome}
                          onChange={e => setFiltroNome(e.target.value)}
                          placeholder="filtrar..."
                          className="w-full px-2 py-1 text-xs font-normal normal-case rounded border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-blue-200"
                        />
                      </th>
                      <th className="px-3 py-2">
                        <input
                          type="text"
                          value={filtroDoc}
                          onChange={e => setFiltroDoc(e.target.value)}
                          placeholder="filtrar..."
                          className="w-full px-2 py-1 text-xs font-normal normal-case rounded border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-blue-200"
                        />
                      </th>
                      <th className="px-3 py-2"></th>
                      <th className="px-3 py-2">
                        <select
                          value={filtroForma}
                          onChange={e => setFiltroForma(e.target.value)}
                          className="w-full px-2 py-1 text-xs font-normal normal-case rounded border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-blue-200"
                        >
                          <option value="todas">todas</option>
                          {formasDisponiveis.map(f => (
                            <option key={f} value={f}>{f}</option>
                          ))}
                        </select>
                      </th>
                      <th className="px-3 py-2"></th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendasFiltradas.map(v => {
                      const itensTxt = v.itens.length > 0
                        ? v.itens.map(it => `${it.quantidade}x ${it.descricao || 'Item'}`).join(', ')
                        : '—'
                      return (
                        <tr key={v.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatData(v.data_venda)}</td>
                          <td className="px-4 py-3 text-gray-600">
                            <div className="max-w-[260px] truncate" title={itensTxt}>{itensTxt}</div>
                          </td>
                          <td className="px-4 py-3 font-medium whitespace-nowrap">{v.cliente_nome || '—'}</td>
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDoc(v.cliente_cpf_cnpj) || '—'}</td>
                          <td className="px-4 py-3 text-right font-medium whitespace-nowrap">{formatBRL(v.valor_total)}</td>
                          <td className="px-4 py-3 text-gray-600 capitalize whitespace-nowrap">{v.forma_pagamento || '—'}</td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => toggleNfEmitida(v)}
                              disabled={togglingId === v.id}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors disabled:opacity-50 ${
                                v.nf_emitida
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                                  : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                              }`}
                              title={v.nf_emitida ? 'Clique para desmarcar' : 'Clique para marcar como emitida'}
                            >
                              {togglingId === v.id ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : v.nf_emitida ? (
                                <Check size={12} />
                              ) : (
                                <X size={12} />
                              )}
                              {v.nf_emitida ? 'Sim' : 'Nao'}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => emitirParaVenda(v)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-emerald-200 text-xs font-medium text-emerald-700 hover:bg-emerald-50 transition-colors"
                              title="Abrir Nova NFSe com dados desta venda"
                            >
                              <Send size={12} /> Emitir NFSe
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Table: NFSe emitidas ── */}
        {activeTab === 'emissoes' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="animate-spin text-gray-400" size={24} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-gray-400 text-sm">
              Nenhuma NFSe encontrada neste periodo
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: '#1A2434' }} className="text-left text-xs text-white uppercase tracking-wider">
                    <th className="px-4 py-3 font-semibold whitespace-nowrap">Numero</th>
                    <th className="px-4 py-3 font-semibold whitespace-nowrap">Data</th>
                    <th className="px-4 py-3 font-semibold whitespace-nowrap">Tomador</th>
                    <th className="px-4 py-3 font-semibold whitespace-nowrap">Servico</th>
                    <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">Valor</th>
                    <th className="px-4 py-3 font-semibold whitespace-nowrap">Status</th>
                    <th className="px-4 py-3 font-semibold text-center whitespace-nowrap">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(em => (
                    <tr key={em.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 font-medium">
                        {em.numero_nfse || <span className="text-gray-400">{em.referencia}</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{formatData(em.data_emissao)}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{em.tomador_razao_social || '\u2014'}</div>
                        <div className="text-xs text-gray-400">{formatDoc(em.tomador_documento)}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate" title={em.discriminacao || ''}>
                        {em.discriminacao
                          ? em.discriminacao.length > 50
                            ? em.discriminacao.slice(0, 50) + '...'
                            : em.discriminacao
                          : '\u2014'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{formatBRL(em.valor_servicos)}</td>
                      <td className="px-4 py-3">{renderStatusBadge(em.status)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1 relative">
                          {em.pdf_url && (
                            <a
                              href={em.pdf_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                              title="Download PDF"
                            >
                              <Download size={14} />
                            </a>
                          )}
                          {em.xml_url && (
                            <a
                              href={em.xml_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                              title="Download XML"
                            >
                              <FileText size={14} />
                            </a>
                          )}
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              if (dropdownOpen === em.id) {
                                setDropdownOpen(null)
                                setDropdownCoords(null)
                              } else {
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                                setDropdownCoords({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
                                setDropdownOpen(em.id)
                              }
                            }}
                            className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                          >
                            <MoreHorizontal size={14} />
                          </button>

                          {dropdownOpen === em.id && dropdownCoords && createPortal(
                            <div className="fixed bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px]" style={{ top: dropdownCoords.top, right: dropdownCoords.right, zIndex: 100 }} onClick={e => e.stopPropagation()}>
                              <button
                                onClick={() => openDetail(em)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-left"
                              >
                                <Eye size={14} /> Ver detalhes
                              </button>
                              {em.status === 'autorizada' && (
                                <>
                                  <button
                                    onClick={() => openCancelarModal(em)}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-left text-red-600"
                                  >
                                    <XCircle size={14} /> Cancelar NFSe
                                  </button>
                                  <button
                                    onClick={() => handleReenviarEmail(em)}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-left"
                                  >
                                    <Mail size={14} /> Reenviar email
                                  </button>
                                </>
                              )}
                              {em.status === 'rascunho' && (
                                <button
                                  onClick={async () => {
                                    setDropdownOpen(null)
                                    const db = activeClient as any
                                    toast.info('Enviando NFSe...')
                                    try {
                                      const { error } = await db.functions.invoke('emitir-nfse', {
                                        body: { emissao_id: em.id },
                                      })
                                      if (error) throw error
                                      startPolling(em.id)
                                    } catch (err: any) {
                                      toast.error(err.message || 'Erro ao emitir')
                                    }
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-left"
                                >
                                  <Send size={14} /> Emitir rascunho
                                </button>
                              )}
                              {em.status === 'erro_autorizacao' && (
                                <button
                                  onClick={async () => {
                                    setDropdownOpen(null)
                                    const db = activeClient as any
                                    toast.info('Reenviando NFSe...')
                                    try {
                                      const { error } = await db.functions.invoke('emitir-nfse', {
                                        body: { emissao_id: em.id },
                                      })
                                      if (error) throw error
                                      startPolling(em.id)
                                    } catch (err: any) {
                                      toast.error(err.message || 'Erro ao reenviar')
                                    }
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-left"
                                >
                                  <RefreshCw size={14} /> Reenviar
                                </button>
                              )}
                            </div>,
                            document.body
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            MODAL: Nova NFSe
        ════════════════════════════════════════════════════════════════ */}
        {showNovaModal && (
          <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 relative">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h2 className="text-lg font-semibold" style={{ color: '#059669' }}>Nova NFSe</h2>
                <button onClick={() => { setShowNovaModal(false); stopPolling() }} className="p-1 rounded hover:bg-gray-100">
                  <X size={20} className="text-gray-400" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-6 max-h-[70vh] overflow-y-auto">

                {/* ── Tomador ── */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <FileText size={16} style={{ color: '#059669' }} /> Tomador do Servico
                  </h3>

                  <div className="space-y-3">
                    <div>
                      <label className={labelClass}>Selecionar cliente</label>
                      <select
                        value={form.client_id}
                        onChange={e => handleClientSelect(e.target.value)}
                        className={inputClass}
                      >
                        <option value="">-- Selecione ou preencha manualmente --</option>
                        {clients.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.razao_social} {c.cpf_cnpj ? `(${formatDoc(c.cpf_cnpj)})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>CPF/CNPJ *</label>
                        <input
                          type="text"
                          value={form.tomador_documento}
                          onChange={e => setForm(p => ({ ...p, tomador_documento: e.target.value }))}
                          className={inputClass}
                          placeholder="00.000.000/0000-00"
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Razao Social *</label>
                        <input
                          type="text"
                          value={form.tomador_razao_social}
                          onChange={e => setForm(p => ({ ...p, tomador_razao_social: e.target.value }))}
                          className={inputClass}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>Email</label>
                        <input
                          type="email"
                          value={form.tomador_email}
                          onChange={e => setForm(p => ({ ...p, tomador_email: e.target.value }))}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Telefone</label>
                        <input
                          type="text"
                          value={form.tomador_telefone}
                          onChange={e => setForm(p => ({ ...p, tomador_telefone: e.target.value }))}
                          className={inputClass}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-3">
                      <div className="col-span-2">
                        <label className={labelClass}>Logradouro</label>
                        <input
                          type="text"
                          value={form.tomador_endereco_logradouro}
                          onChange={e => setForm(p => ({ ...p, tomador_endereco_logradouro: e.target.value }))}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Numero</label>
                        <input
                          type="text"
                          value={form.tomador_endereco_numero}
                          onChange={e => setForm(p => ({ ...p, tomador_endereco_numero: e.target.value }))}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Complemento</label>
                        <input
                          type="text"
                          value={form.tomador_endereco_complemento}
                          onChange={e => setForm(p => ({ ...p, tomador_endereco_complemento: e.target.value }))}
                          className={inputClass}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <label className={labelClass}>Bairro</label>
                        <input
                          type="text"
                          value={form.tomador_endereco_bairro}
                          onChange={e => setForm(p => ({ ...p, tomador_endereco_bairro: e.target.value }))}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Cidade</label>
                        <input
                          type="text"
                          value={form.tomador_endereco_cidade}
                          onChange={e => setForm(p => ({ ...p, tomador_endereco_cidade: e.target.value }))}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>UF</label>
                        <input
                          type="text"
                          value={form.tomador_endereco_estado}
                          onChange={e => setForm(p => ({ ...p, tomador_endereco_estado: e.target.value }))}
                          className={inputClass}
                          maxLength={2}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>CEP</label>
                        <input
                          type="text"
                          value={form.tomador_endereco_cep}
                          onChange={e => setForm(p => ({ ...p, tomador_endereco_cep: e.target.value }))}
                          className={inputClass}
                          placeholder="00000-000"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Servico ── */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <DollarSign size={16} style={{ color: '#059669' }} /> Dados do Servico
                  </h3>

                  <div className="space-y-3">
                    <div>
                      <label className={labelClass}>Discriminacao do servico *</label>
                      <textarea
                        value={form.discriminacao}
                        onChange={e => setForm(p => ({ ...p, discriminacao: e.target.value }))}
                        rows={3}
                        className={inputClass + ' resize-none'}
                        placeholder="Descreva o servico prestado..."
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className={labelClass}>Valor dos servicos (R$) *</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={form.valor_servicos || ''}
                          onChange={e => setForm(p => ({ ...p, valor_servicos: parseFloat(e.target.value) || 0 }))}
                          className={inputClass}
                          placeholder="0,00"
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Aliquota ISS (%)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={form.aliquota_iss}
                          onChange={e => setForm(p => ({ ...p, aliquota_iss: parseFloat(e.target.value) || 0 }))}
                          className={inputClass}
                        />
                      </div>
                      <div className="flex items-end pb-1">
                        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={form.iss_retido}
                            onChange={e => setForm(p => ({ ...p, iss_retido: e.target.checked }))}
                            className="w-4 h-4 rounded border-gray-300"
                          />
                          ISS retido
                        </label>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>Item lista servico</label>
                        <input
                          type="text"
                          value={form.item_lista_servico}
                          onChange={e => setForm(p => ({ ...p, item_lista_servico: e.target.value }))}
                          className={inputClass}
                          placeholder="Ex: 17.01"
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Codigo CNAE</label>
                        <input
                          type="text"
                          value={form.codigo_cnae}
                          onChange={e => setForm(p => ({ ...p, codigo_cnae: e.target.value }))}
                          className={inputClass}
                          placeholder="Ex: 6201-5/00"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Summary card ── */}
                <div className="rounded-xl p-4 border border-gray-100" style={{ backgroundColor: '#F6F2EB' }}>
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">Resumo</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Valor dos servicos</span>
                      <span className="font-medium">{formatBRL(form.valor_servicos)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">ISS calculado ({form.aliquota_iss}%)</span>
                      <span className="font-medium">{formatBRL(issCalculado)}</span>
                    </div>
                    {form.iss_retido && (
                      <div className="flex justify-between text-red-600">
                        <span>ISS retido (deducao)</span>
                        <span className="font-medium">- {formatBRL(issCalculado)}</span>
                      </div>
                    )}
                    <div className="border-t border-gray-200 pt-2 flex justify-between">
                      <span className="font-semibold text-gray-700">Valor liquido</span>
                      <span className="font-bold text-lg" style={{ color: '#059669' }}>{formatBRL(valorLiquido)}</span>
                    </div>
                  </div>
                </div>

                {/* Polling indicator */}
                {polling && (
                  <div className="flex items-center gap-3 rounded-xl p-4 border border-yellow-200 bg-yellow-50">
                    <Loader2 size={20} className="animate-spin text-yellow-600" />
                    <div>
                      <p className="text-sm font-medium text-yellow-800">Processando NFSe...</p>
                      <p className="text-xs text-yellow-600">Aguardando resposta da prefeitura. Isso pode levar ate 1 minuto.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
                <button
                  onClick={() => { setShowNovaModal(false); stopPolling() }}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
                  disabled={submitting || polling}
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    const id = await handleSalvarRascunho()
                    if (id) {
                      setShowNovaModal(false)
                    }
                  }}
                  disabled={submitting || polling}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
                >
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : 'Salvar Rascunho'}
                </button>
                <button
                  onClick={handleEmitir}
                  disabled={submitting || polling}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: '#059669' }}
                >
                  {(submitting || polling) ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                  Emitir NFSe
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            MODAL: Cancelar NFSe
        ════════════════════════════════════════════════════════════════ */}
        {showCancelarModal && selectedEmissao && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-red-600 flex items-center gap-2">
                  <XCircle size={20} /> Cancelar NFSe
                </h2>
                <button onClick={() => setShowCancelarModal(false)} className="p-1 rounded hover:bg-gray-100">
                  <X size={20} className="text-gray-400" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-4">
                <div className="rounded-lg bg-red-50 border border-red-100 p-3 text-sm text-red-700">
                  <p className="font-medium">NFSe: {selectedEmissao.numero_nfse || selectedEmissao.referencia}</p>
                  <p>Tomador: {selectedEmissao.tomador_razao_social}</p>
                  <p>Valor: {formatBRL(selectedEmissao.valor_servicos)}</p>
                </div>

                <div>
                  <label className={labelClass}>Justificativa do cancelamento *</label>
                  <textarea
                    value={justificativa}
                    onChange={e => setJustificativa(e.target.value)}
                    rows={3}
                    className={inputClass + ' resize-none'}
                    placeholder="Informe o motivo do cancelamento (minimo 15 caracteres)..."
                  />
                  <p className="text-xs text-gray-400 mt-1">{justificativa.length}/15 caracteres minimos</p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
                <button
                  onClick={() => setShowCancelarModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
                  disabled={cancelling}
                >
                  Voltar
                </button>
                <button
                  onClick={handleCancelar}
                  disabled={cancelling || justificativa.length < 15}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
                >
                  {cancelling ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                  Confirmar Cancelamento
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            MODAL: Detalhes NFSe
        ════════════════════════════════════════════════════════════════ */}
        {showDetailModal && selectedEmissao && (
          <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 relative">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h2 className="text-lg font-semibold" style={{ color: '#059669' }}>
                  Detalhes - {selectedEmissao.numero_nfse || selectedEmissao.referencia}
                </h2>
                <button onClick={() => { setShowDetailModal(false); setSelectedEmissao(null) }} className="p-1 rounded hover:bg-gray-100">
                  <X size={20} className="text-gray-400" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-6 max-h-[75vh] overflow-y-auto">

                {/* Status + info */}
                <div className="flex items-center justify-between">
                  {renderStatusBadge(selectedEmissao.status)}
                  {selectedEmissao.protocolo && (
                    <span className="text-xs text-gray-400">Protocolo: {selectedEmissao.protocolo}</span>
                  )}
                </div>

                {selectedEmissao.mensagem_retorno && (
                  <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-800">
                    <p className="font-medium mb-1">Mensagem de retorno:</p>
                    <p>{selectedEmissao.mensagem_retorno}</p>
                  </div>
                )}

                {/* Dados gerais */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-gray-400">Referencia</p>
                    <p className="font-medium">{selectedEmissao.referencia}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Numero NFSe</p>
                    <p className="font-medium">{selectedEmissao.numero_nfse || '\u2014'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Data Emissao</p>
                    <p className="font-medium">{formatData(selectedEmissao.data_emissao)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Cod. Verificacao</p>
                    <p className="font-medium font-mono text-xs">{selectedEmissao.codigo_verificacao || '\u2014'}</p>
                  </div>
                </div>

                {/* Tomador */}
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Tomador</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-gray-400">Razao Social</p>
                      <p className="font-medium">{selectedEmissao.tomador_razao_social || '\u2014'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">CPF/CNPJ</p>
                      <p className="font-medium">{formatDoc(selectedEmissao.tomador_documento)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Email</p>
                      <p className="font-medium">{selectedEmissao.tomador_email || '\u2014'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Telefone</p>
                      <p className="font-medium">{selectedEmissao.tomador_telefone || '\u2014'}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-gray-400">Endereco</p>
                      <p className="font-medium">
                        {[
                          selectedEmissao.tomador_endereco_logradouro,
                          selectedEmissao.tomador_endereco_numero,
                          selectedEmissao.tomador_endereco_complemento,
                          selectedEmissao.tomador_endereco_bairro,
                          selectedEmissao.tomador_endereco_cidade,
                          selectedEmissao.tomador_endereco_estado,
                          selectedEmissao.tomador_endereco_cep,
                        ].filter(Boolean).join(', ') || '\u2014'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Servico */}
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Servico</h4>
                  <div className="text-sm space-y-2">
                    <div>
                      <p className="text-xs text-gray-400">Discriminacao</p>
                      <p className="font-medium whitespace-pre-wrap">{selectedEmissao.discriminacao || '\u2014'}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-xs text-gray-400">Item Lista</p>
                        <p className="font-medium">{selectedEmissao.item_lista_servico || '\u2014'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">CNAE</p>
                        <p className="font-medium">{selectedEmissao.codigo_cnae || '\u2014'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">ISS Retido</p>
                        <p className="font-medium">{selectedEmissao.iss_retido ? 'Sim' : 'Nao'}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Valores */}
                <div className="rounded-xl p-4 border border-gray-100" style={{ backgroundColor: '#F6F2EB' }}>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">Valores</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Valor dos servicos</span>
                      <span className="font-medium">{formatBRL(selectedEmissao.valor_servicos)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Deducoes</span>
                      <span className="font-medium">{formatBRL(selectedEmissao.valor_deducoes)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">ISS ({selectedEmissao.aliquota_iss}%)</span>
                      <span className="font-medium">{formatBRL(selectedEmissao.valor_iss)}</span>
                    </div>
                    <div className="border-t border-gray-200 pt-2 flex justify-between">
                      <span className="font-semibold text-gray-700">Valor liquido</span>
                      <span className="font-bold text-lg" style={{ color: '#059669' }}>{formatBRL(selectedEmissao.valor_liquido)}</span>
                    </div>
                  </div>
                </div>

                {/* Links */}
                {(selectedEmissao.pdf_url || selectedEmissao.xml_url) && (
                  <div className="flex gap-3">
                    {selectedEmissao.pdf_url && (
                      <a
                        href={selectedEmissao.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:bg-gray-50"
                      >
                        <Download size={16} /> Download PDF
                      </a>
                    )}
                    {selectedEmissao.xml_url && (
                      <a
                        href={selectedEmissao.xml_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:bg-gray-50"
                      >
                        <FileText size={16} /> Download XML
                      </a>
                    )}
                  </div>
                )}

                {/* Timeline de eventos */}
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">Timeline de Eventos</h4>
                  {loadingEventos ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 size={20} className="animate-spin text-gray-400" />
                    </div>
                  ) : eventos.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">Nenhum evento registrado</p>
                  ) : (
                    <div className="relative pl-6 space-y-4">
                      {/* Vertical line */}
                      <div className="absolute left-[9px] top-1 bottom-1 w-px bg-gray-200" />

                      {eventos.map((ev, idx) => {
                        const isLast = idx === eventos.length - 1
                        let dotColor = '#98A2B3'
                        if (ev.tipo === 'autorizada' || ev.tipo === 'emissao_sucesso') dotColor = '#059669'
                        if (ev.tipo === 'erro' || ev.tipo === 'erro_autorizacao') dotColor = '#E53E3E'
                        if (ev.tipo === 'enviado' || ev.tipo === 'processando') dotColor = '#EA580C'
                        if (ev.tipo === 'cancelada') dotColor = '#4B5563'

                        return (
                          <div key={ev.id} className="relative">
                            {/* Dot */}
                            <div
                              className="absolute -left-6 top-1 w-[10px] h-[10px] rounded-full border-2 border-white"
                              style={{ backgroundColor: dotColor }}
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-gray-700 capitalize">{ev.tipo.replace(/_/g, ' ')}</span>
                                <span className="text-xs text-gray-400">
                                  {formatData(ev.created_at)}
                                  {ev.created_at && (
                                    <> {format(parseISO(ev.created_at), 'HH:mm')}</>
                                  )}
                                </span>
                              </div>
                              {ev.descricao && (
                                <p className="text-xs text-gray-500 mt-0.5">{ev.descricao}</p>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end px-6 py-4 border-t border-gray-100">
                <button
                  onClick={() => { setShowDetailModal(false); setSelectedEmissao(null) }}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </AppLayout>
  )
}
