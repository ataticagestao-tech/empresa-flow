import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { safeQuery } from '@/lib/supabaseQuery'
import { formatBRL, formatData, formatCNPJ } from '@/lib/format'
import { AppLayout } from '@/components/layout/AppLayout'
import { ModuleTabs } from '@/components/layout/ModuleTabs'
import { Search, Mail, Download, FileText, ChevronRight, MessageCircle, Plus, Filter } from 'lucide-react'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { sendWhatsApp } from '@/lib/whatsapp/send-whatsapp'
import { sendReciboEmail } from '@/lib/recibos/send-recibo-email'
import { gerarReciboPDF, downloadBlob } from '@/lib/recibos/gerar-pdf'
import { ExportMenu } from '@/components/ExportMenu'
import { KpiCard, KpiCardGrid } from '@/components/ui/kpi-card'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Recibo {
  id: string
  company_id: string
  numero: string
  favorecido: string
  pagador_cpf_cnpj?: string | null
  descricao: string | null
  valor: number
  data_pagamento: string
  forma_pagamento: string | null
  status_email: 'pendente' | 'enviado' | 'erro'
  email_destino: string | null
  pdf_url: string | null
  tipo: string | null
}

interface Empresa {
  name: string
  document: string
}

interface CadMatch {
  tipo: 'funcionario' | 'fornecedor' | 'cliente'
  nome: string
  email?: string | null
  telefone?: string | null
}

interface GerarItem {
  id: string // CR/CP id (para venda: primeira CR paga da venda)
  origem: 'cr' | 'cp' | 'venda'
  vendaId?: string // só para tab venda (informativo)
  titulo: string
  subtitulo: string
  valor: number
  data: string
  email?: string | null
  telefone?: string | null
  jaTemRecibo: boolean
  match?: CadMatch | null
}

// ---------------------------------------------------------------------------
// Valor por extenso (BRL)
// ---------------------------------------------------------------------------

function valorPorExtenso(valor: number): string {
  if (valor === 0) return 'zero reais'

  const unidades = [
    '', 'um', 'dois', 'tres', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
    'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis',
    'dezessete', 'dezoito', 'dezenove',
  ]
  const dezenas = [
    '', '', 'vinte', 'trinta', 'quarenta', 'cinquenta',
    'sessenta', 'setenta', 'oitenta', 'noventa',
  ]
  const centenas = [
    '', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos',
    'seiscentos', 'setecentos', 'oitocentos', 'novecentos',
  ]

  function grupoPorExtenso(n: number): string {
    if (n === 0) return ''
    if (n === 100) return 'cem'

    const parts: string[] = []
    const c = Math.floor(n / 100)
    const rest = n % 100

    if (c > 0) parts.push(centenas[c])

    if (rest > 0 && rest < 20) {
      parts.push(unidades[rest])
    } else if (rest >= 20) {
      const d = Math.floor(rest / 10)
      const u = rest % 10
      let dezStr = dezenas[d]
      if (u > 0) dezStr += ' e ' + unidades[u]
      parts.push(dezStr)
    }

    return parts.join(' e ')
  }

  const abs = Math.abs(valor)
  const inteiro = Math.floor(abs)
  const centavos = Math.round((abs - inteiro) * 100)

  const milhoes = Math.floor(inteiro / 1_000_000)
  const milhares = Math.floor((inteiro % 1_000_000) / 1_000)
  const unidade = inteiro % 1_000

  const partes: string[] = []

  if (milhoes > 0) {
    partes.push(
      grupoPorExtenso(milhoes) +
        (milhoes === 1 ? ' milhao' : ' milhoes')
    )
  }
  if (milhares > 0) {
    partes.push(grupoPorExtenso(milhares) + ' mil')
  }
  if (unidade > 0) {
    partes.push(grupoPorExtenso(unidade))
  }

  let resultado = ''
  if (partes.length > 0) {
    resultado = partes.join(', ') + (inteiro === 1 ? ' real' : ' reais')
  }

  if (centavos > 0) {
    const centStr = grupoPorExtenso(centavos) + (centavos === 1 ? ' centavo' : ' centavos')
    resultado = resultado ? resultado + ' e ' + centStr : centStr
  }

  if (!resultado) resultado = 'zero reais'

  return resultado.charAt(0).toUpperCase() + resultado.slice(1)
}

// ---------------------------------------------------------------------------
// Status Badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { text: string; bg: string; border: string; color: string }> = {
    enviado: { text: 'Enviado', bg: 'bg-[#ECFDF3]', border: 'border-[#039855]', color: 'text-[#039855]' },
    pendente: { text: 'Pendente envio', bg: 'bg-[#FFF0EB]', border: 'border-[#EA580C]', color: 'text-[#EA580C]' },
    erro: { text: 'Erro', bg: 'bg-[#FEE2E2]', border: 'border-[#E53E3E]', color: 'text-[#E53E3E]' },
    manual: { text: 'Manual', bg: 'bg-[#ECFDF4]', border: 'border-[#059669]', color: 'text-[#059669]' },
  }
  const c = config[status] || config.pendente
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full border ${c.bg} ${c.border} ${c.color}`}>
      {c.text}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Preview Component
// ---------------------------------------------------------------------------

function PreviewRecibo({ recibo, empresa }: { recibo: Recibo; empresa: Empresa | null }) {
  return (
    <div className="p-6 bg-white min-h-[400px]">
      {/* Header */}
      <div className="flex justify-between pb-4 mb-4 border-b-2 border-[#059669]">
        <div>
          <div className="text-sm font-bold text-[#1E3A8A]">{empresa?.name || '---'}</div>
          <div className="text-xs text-[#4B5563]">
            CNPJ: {empresa?.document ? formatCNPJ(empresa.document) : '---'}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#4B5563]">Recibo</div>
          <div className="text-lg font-bold text-[#1E3A8A]">#{recibo.numero}</div>
          <div className="text-xs text-[#4B5563]">{formatData(recibo.data_pagamento)}</div>
        </div>
      </div>

      {/* Pagador */}
      <div className="mb-4 p-3 bg-[#F9FAFB] rounded border border-[#E5E7EB]">
        <div className="text-[10px] font-bold uppercase tracking-widest text-[#4B5563] mb-1">Pagador / Favorecido</div>
        <div className="text-sm font-semibold text-[#0F172A]">{recibo.favorecido}</div>
        {recibo.pagador_cpf_cnpj && (
          <div className="text-xs text-[#4B5563] mt-0.5">CPF/CNPJ: {recibo.pagador_cpf_cnpj}</div>
        )}
      </div>

      {/* Descricao */}
      {recibo.descricao && (
        <div className="mb-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#4B5563] mb-1">Descricao</div>
          <div className="text-sm text-[#0F172A] leading-relaxed">{recibo.descricao}</div>
        </div>
      )}

      {/* Valor total */}
      <div className="mb-4 p-4 bg-[#059669] rounded">
        <div className="text-[10px] font-bold uppercase tracking-widest text-white/70 mb-1">Valor Total</div>
        <div className="text-2xl font-bold text-white">{formatBRL(recibo.valor)}</div>
      </div>

      {/* Valor por extenso */}
      <div className="mb-4">
        <div className="text-[10px] font-bold uppercase tracking-widest text-[#4B5563] mb-1">Valor por Extenso</div>
        <div className="text-xs text-[#0F172A] italic">
          {valorPorExtenso(recibo.valor)}
        </div>
      </div>

      {/* Forma de pagamento */}
      {recibo.forma_pagamento && (
        <div className="mb-6">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#4B5563] mb-1">Forma de Pagamento</div>
          <div className="text-sm text-[#0F172A]">{recibo.forma_pagamento}</div>
        </div>
      )}

      {/* Assinaturas */}
      <div className="grid grid-cols-2 gap-8 mt-8 mb-6">
        <div className="text-center">
          <div className="border-t border-[#0F172A] pt-2 mx-4">
            <div className="text-xs text-[#4B5563]">Emitente</div>
          </div>
        </div>
        <div className="text-center">
          <div className="border-t border-[#0F172A] pt-2 mx-4">
            <div className="text-xs text-[#4B5563]">Recebedor</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-[#D1D5DB] pt-3 mt-6">
        <div className="text-[9px] text-[#9CA3AF] text-center leading-relaxed">
          Documento gerado eletronicamente. Este recibo comprova o pagamento referente aos servicos descritos acima.
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function Recibos() {
  const { selectedCompany } = useCompany()
  const { activeClient } = useAuth()

  const [recibos, setRecibos] = useState<Recibo[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<string>('todos')
  const [dataDe, setDataDe] = useState('')
  const [dataAte, setDataAte] = useState('')
  const [filtroDataAberto, setFiltroDataAberto] = useState(false)
  const filtroDataRef = useRef<HTMLDivElement>(null)
  const [selecionado, setSelecionado] = useState<Recibo | null>(null)
  const [empresa, setEmpresa] = useState<Empresa | null>(null)
  const [whatsDialog, setWhatsDialog] = useState<Recibo | null>(null)
  const [whatsPhone, setWhatsPhone] = useState('')
  const [whatsText, setWhatsText] = useState('')
  const [whatsSending, setWhatsSending] = useState(false)
  const [emailDialog, setEmailDialog] = useState<Recibo | null>(null)
  const [emailTo, setEmailTo] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [emailSending, setEmailSending] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  // Gerar Recibo (a partir de CR / CP / Venda)
  const [showGerar, setShowGerar] = useState(false)
  const [gerarTab, setGerarTab] = useState<'cr' | 'cp' | 'venda'>('cr')
  const [gerarBusca, setGerarBusca] = useState('')
  const [gerarLoading, setGerarLoading] = useState(false)
  const [gerarLista, setGerarLista] = useState<GerarItem[]>([])
  const [gerarSelecionado, setGerarSelecionado] = useState<GerarItem | null>(null)
  const [gerarEnvio, setGerarEnvio] = useState<'nenhum' | 'email' | 'whatsapp'>('nenhum')
  const [gerarEmail, setGerarEmail] = useState('')
  const [gerarTelefone, setGerarTelefone] = useState('')
  const [gerarSubmitting, setGerarSubmitting] = useState(false)

  // Fetch recibos
  useEffect(() => {
    if (!selectedCompany?.id) {
      setRecibos([])
      setLoading(false)
      return
    }

    async function fetchRecibos() {
      setLoading(true)
      const data = await safeQuery<any[]>(
        async () =>
          (activeClient ?? supabase)
            .from('recibos_v2')
            .select('*')
            .eq('company_id', selectedCompany!.id)
            .order('created_at', { ascending: false }),
        'Recibos.fetchRecibos'
      )

      const mapped: Recibo[] = ((data as any[]) || []).map((r: any) => ({
        id: r.id,
        company_id: r.company_id,
        numero: String(r.numero_sequencial || r.numero || ''),
        favorecido: r.pagador_nome || r.favorecido || '',
        pagador_cpf_cnpj: r.pagador_cpf_cnpj || null,
        descricao: r.descricao_servico || r.descricao || null,
        valor: Number(r.valor || 0),
        data_pagamento: r.data_emissao || r.data_pagamento || r.data || r.created_at,
        forma_pagamento: r.forma_pagamento || null,
        status_email: r.status_email === 'enviado' || r.enviado_email ? 'enviado' : r.status_email === 'erro' ? 'erro' : 'pendente',
        email_destino: r.email_destino || null,
        pdf_url: r.pdf_url || null,
        tipo: r.tipo || null,
      }))

      // Enriquece descricao vazia/duplicativa com itens da venda (via CR.venda_id)
      const client = activeClient ?? supabase
      const reciboToCrId: Record<string, string> = {}
      ;((data as any[]) || []).forEach((r: any) => {
        if (r.account_receivable_id && !(r.descricao_servico || r.descricao)) {
          reciboToCrId[r.id] = r.account_receivable_id
        }
      })
      const crIds = Array.from(new Set(Object.values(reciboToCrId)))
      if (crIds.length > 0) {
        const { data: crs } = await client
          .from('contas_receber')
          .select('id, venda_id')
          .in('id', crIds)
        const crToVenda: Record<string, string> = {}
        ;(crs || []).forEach((cr: any) => { if (cr.venda_id) crToVenda[cr.id] = cr.venda_id })

        const vendaIds = Array.from(new Set(Object.values(crToVenda)))
        if (vendaIds.length > 0) {
          const { data: itens } = await client
            .from('vendas_itens')
            .select('venda_id, descricao, quantidade')
            .in('venda_id', vendaIds)
          const itensByVenda: Record<string, { descricao: string; quantidade: number }[]> = {}
          ;(itens || []).forEach((it: any) => {
            if (!itensByVenda[it.venda_id]) itensByVenda[it.venda_id] = []
            itensByVenda[it.venda_id].push({ descricao: it.descricao, quantidade: Number(it.quantidade) || 1 })
          })

          const itensLabel = (arr: { descricao: string; quantidade: number }[]) => {
            if (arr.length === 1) {
              const it = arr[0]
              return it.quantidade > 1 ? `${it.descricao} (${it.quantidade}x)` : it.descricao
            }
            const extra = arr.length - 1
            return `${arr[0].descricao} · +${extra} ${extra === 1 ? 'item' : 'itens'}`
          }

          for (const m of mapped) {
            const crId = reciboToCrId[m.id]
            if (!crId) continue
            const vendaId = crToVenda[crId]
            if (!vendaId) continue
            const arr = itensByVenda[vendaId]
            if (arr && arr.length > 0) m.descricao = itensLabel(arr)
          }
        }
      }

      setRecibos(mapped)
      setLoading(false)
    }

    fetchRecibos()
  }, [selectedCompany?.id, activeClient, refreshKey])

  // Fetch empresa info
  useEffect(() => {
    if (!selectedCompany?.id) return

    async function fetchEmpresa() {
      const data = await safeQuery<any>(
        async () =>
          (activeClient ?? supabase)
            .from('companies')
            .select('nome_fantasia, razao_social, cnpj')
            .eq('id', selectedCompany!.id)
            .single(),
        'Recibos.fetchEmpresa'
      )
      if (data) {
        setEmpresa({
          name: (data as any).nome_fantasia || (data as any).razao_social || 'Empresa',
          document: (data as any).cnpj || '',
        })
      }
    }

    fetchEmpresa()
  }, [selectedCompany?.id, activeClient])

  // Normalize for search
  const normalize = (v: unknown) =>
    String(v ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()

  // Filter
  const filtrados = recibos.filter((r) => {
    // Status filter
    if (filtroStatus !== 'todos' && r.status_email !== filtroStatus) return false

    // Date range filter (compara yyyy-MM-dd)
    const dataRecibo = (r.data_pagamento || '').slice(0, 10)
    if (dataDe && dataRecibo < dataDe) return false
    if (dataAte && dataRecibo > dataAte) return false

    // Search filter
    const needle = normalize(busca)
    if (!needle) return true
    const haystack = normalize(
      [r.favorecido, r.numero, r.descricao, formatBRL(r.valor)].filter(Boolean).join(' ')
    )
    return haystack.includes(needle)
  })

  const temFiltro = !!busca || filtroStatus !== 'todos' || !!dataDe || !!dataAte

  // Fecha o popover de filtro de data ao clicar fora
  useEffect(() => {
    if (!filtroDataAberto) return
    const handler = (e: MouseEvent) => {
      if (filtroDataRef.current && !filtroDataRef.current.contains(e.target as Node)) {
        setFiltroDataAberto(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [filtroDataAberto])

  // KPIs (sobre todos os recibos da empresa, independente do filtro)
  const kpis = useMemo(() => {
    const enviados = recibos.filter((r) => r.status_email === 'enviado').length
    const pendentes = recibos.filter((r) => r.status_email === 'pendente').length
    const erros = recibos.filter((r) => r.status_email === 'erro').length
    const valorTotal = recibos.reduce((s, r) => s + Number(r.valor || 0), 0)
    return { total: recibos.length, enviados, pendentes, erros, valorTotal }
  }, [recibos])

  // Actions
  const buildEmailTemplate = (r: Recibo): { subject: string; body: string } => {
    return {
      subject: `Comprovante de pagamento — Recibo #${r.numero}`,
      body: `Olá!\n\nSegue em anexo o comprovante referente ao recibo #${r.numero} no valor de ${formatBRL(r.valor)}, pago em ${formatData(r.data_pagamento)}.${r.descricao ? `\n\nReferente a: ${r.descricao}` : ''}\n\nQualquer dúvida, estamos à disposição.`,
    }
  }

  const handleReenviarEmail = (recibo: Recibo) => {
    const { subject, body } = buildEmailTemplate(recibo)
    setEmailDialog(recibo)
    setEmailTo(recibo.email_destino || '')
    setEmailSubject(subject)
    setEmailBody(body)
  }

  const handleEnviarEmail = async () => {
    if (!emailDialog) return
    if (!emailTo.trim()) {
      toast.error('Informe o e-mail do destinatário.')
      return
    }
    if (!emailDialog.pdf_url) {
      toast.error('Este recibo não tem PDF anexado.')
      return
    }
    setEmailSending(true)
    try {
      const result = await sendReciboEmail({
        destinatario: emailTo.trim(),
        assunto: emailSubject,
        corpo: emailBody,
        pdfUrl: emailDialog.pdf_url,
        nomeArquivo: `recibo-${emailDialog.numero}.pdf`,
      })
      if (result.ok) {
        toast.success('E-mail enviado!', { description: `Para ${emailTo}` })
        setEmailDialog(null)
        setEmailTo('')
        setEmailSubject('')
        setEmailBody('')
      } else {
        toast.error('Falha ao enviar e-mail', { description: result.error })
      }
    } finally {
      setEmailSending(false)
    }
  }

  const handleDownloadPDF = (recibo: Recibo) => {
    if (recibo.pdf_url) {
      window.open(recibo.pdf_url, '_blank')
    } else {
      toast.error('PDF não disponível para este recibo.')
    }
  }

  // Template padrao para envio via WhatsApp do recibo
  const buildWhatsTemplate = (r: Recibo): string => {
    const valor = formatBRL(r.valor)
    const data = formatData(r.data_pagamento)
    const linhas = [
      `Olá! Segue comprovante de pagamento:`,
      ``,
      `*Recibo #${r.numero}*`,
      `Favorecido: ${r.favorecido}`,
      `Valor: ${valor}`,
      `Pago em: ${data}`,
    ]
    if (r.forma_pagamento) linhas.push(`Forma: ${r.forma_pagamento}`)
    if (r.descricao) linhas.push(`Descrição: ${r.descricao}`)
    if (r.pdf_url) {
      linhas.push(``)
      linhas.push(`PDF: ${r.pdf_url}`)
    }
    return linhas.join('\n')
  }

  const handleAbrirWhatsApp = (recibo: Recibo) => {
    setWhatsDialog(recibo)
    setWhatsPhone('')
    setWhatsText(buildWhatsTemplate(recibo))
  }

  const handleEnviarWhatsApp = async () => {
    if (!whatsDialog) return
    if (!whatsPhone.trim()) {
      toast.error('Informe o telefone do destinatário.')
      return
    }
    setWhatsSending(true)
    try {
      // Template Cloud (recibo_pagamento aprovado pela Meta) com 4 vars: nome, num, valor, data.
      // Texto livre vai como fallback pra Evolution / janela de 24h.
      const valorSemRS = formatBRL(whatsDialog.valor).replace(/^R\$\s*/, '')
      const result = await sendWhatsApp({
        phone: whatsPhone,
        text: whatsText,
        template: {
          name: 'recibo_pagamento',
          languageCode: 'pt_BR',
          bodyParams: [
            whatsDialog.favorecido || 'Cliente',
            String(whatsDialog.numero),
            valorSemRS,
            formatData(whatsDialog.data_pagamento),
          ],
        },
      })
      if (result.ok) {
        toast.success('WhatsApp enviado!', { description: `Para ${result.phone || whatsPhone}` })
        setWhatsDialog(null)
        setWhatsPhone('')
        setWhatsText('')
      } else {
        toast.error('Falha ao enviar WhatsApp', { description: result.error })
      }
    } finally {
      setWhatsSending(false)
    }
  }

  const fecharGerar = () => {
    setShowGerar(false)
    setGerarBusca('')
    setGerarLista([])
    setGerarSelecionado(null)
    setGerarEmail('')
    setGerarTelefone('')
    setGerarEnvio('nenhum')
  }

  // Busca CR/CP/Venda conforme aba ativa
  useEffect(() => {
    if (!showGerar || !selectedCompany?.id) return
    let cancelled = false

    async function carregar() {
      setGerarLoading(true)
      setGerarSelecionado(null)
      const client = activeClient ?? supabase
      const onlyDigits = (s: any) => String(s || '').replace(/\D/g, '')

      try {
        // 1. Carrega cadastros em paralelo (para match)
        const [empsRes, supsRes, clisRes] = await Promise.all([
          client.from('employees').select('name, cpf, email, phone').eq('company_id', selectedCompany!.id),
          client.from('suppliers').select('razao_social, nome_fantasia, cpf_cnpj, email, telefone, celular').eq('company_id', selectedCompany!.id),
          client.from('clients').select('razao_social, nome_fantasia, cpf_cnpj, email, telefone, celular').eq('company_id', selectedCompany!.id),
        ])
        if (cancelled) return

        const tokens = (s: string): string[] => {
          const n = normalize(s)
          if (!n) return []
          return n.split(/\s+/).filter(t => t.length >= 3)
        }

        const byDoc: Record<string, CadMatch> = {}
        const byName: Record<string, CadMatch> = {}
        const cadastros: { match: CadMatch; tokens: string[] }[] = []

        const addCadastro = (cad: CadMatch, nome: string, doc: string) => {
          if (doc && !byDoc[doc]) byDoc[doc] = cad
          const n = normalize(nome)
          if (n && !byName[n]) byName[n] = cad
          const tks = tokens(nome)
          if (tks.length >= 2) cadastros.push({ match: cad, tokens: tks })
        }

        ;((empsRes.data as any[]) || []).forEach(e => {
          if (!e.name) return
          const cad: CadMatch = { tipo: 'funcionario', nome: e.name, email: e.email, telefone: e.phone }
          addCadastro(cad, e.name, onlyDigits(e.cpf))
        })
        ;((supsRes.data as any[]) || []).forEach(s => {
          const nomeBase = s.nome_fantasia || s.razao_social
          if (!nomeBase) return
          const cad: CadMatch = { tipo: 'fornecedor', nome: nomeBase, email: s.email, telefone: s.celular || s.telefone }
          addCadastro(cad, nomeBase, onlyDigits(s.cpf_cnpj))
          // Indexa pelos dois nomes (fantasia + razão) sem duplicar cadastro fuzzy
          if (s.razao_social && s.razao_social !== nomeBase) {
            const n2 = normalize(s.razao_social)
            if (n2 && !byName[n2]) byName[n2] = cad
          }
        })
        ;((clisRes.data as any[]) || []).forEach(c => {
          const nomeBase = c.nome_fantasia || c.razao_social
          if (!nomeBase) return
          const cad: CadMatch = { tipo: 'cliente', nome: nomeBase, email: c.email, telefone: c.celular || c.telefone }
          addCadastro(cad, nomeBase, onlyDigits(c.cpf_cnpj))
          if (c.razao_social && c.razao_social !== nomeBase) {
            const n2 = normalize(c.razao_social)
            if (n2 && !byName[n2]) byName[n2] = cad
          }
        })

        // Match fuzzy: todos os tokens >=3 chars do cadastro precisam estar nos tokens do alvo
        const matchFuzzy = (alvoTokens: string[]): CadMatch | null => {
          if (alvoTokens.length === 0) return null
          const alvoSet = new Set(alvoTokens)
          let melhor: { match: CadMatch; score: number } | null = null
          for (const c of cadastros) {
            const todosPresentes = c.tokens.every(t => alvoSet.has(t))
            if (todosPresentes) {
              const score = c.tokens.length // mais tokens = match mais especifico
              if (!melhor || score > melhor.score) melhor = { match: c.match, score }
            }
          }
          return melhor?.match || null
        }

        const matchCadastro = (nome: string, cpfCnpj?: string | null): CadMatch | null => {
          const doc = cpfCnpj ? onlyDigits(cpfCnpj) : ''
          if (doc && byDoc[doc]) return byDoc[doc]
          const n = normalize(nome)
          if (n && byName[n]) return byName[n]
          // Fallback: fuzzy por tokens
          return matchFuzzy(tokens(nome))
        }

        // 2. Carrega lista da aba ativa
        if (gerarTab === 'cr') {
          const { data } = await client
            .from('contas_receber')
            .select('id, observacoes, pagador_nome, pagador_cpf_cnpj, valor, valor_pago, data_pagamento, data_vencimento, status')
            .eq('company_id', selectedCompany!.id)
            .eq('status', 'pago')
            .is('deleted_at', null)
            .order('data_pagamento', { ascending: false })
            .limit(200)
          if (cancelled) return
          const lista: GerarItem[] = ((data as any[]) || []).map(r => {
            const m = matchCadastro(r.pagador_nome, r.pagador_cpf_cnpj)
            return {
              id: r.id,
              origem: 'cr',
              titulo: r.pagador_nome || r.observacoes || 'Sem nome',
              subtitulo: r.observacoes || '',
              valor: Number(r.valor_pago || r.valor || 0),
              data: r.data_pagamento || r.data_vencimento || '',
              email: m?.email || null,
              telefone: m?.telefone || null,
              jaTemRecibo: false,
              match: m,
            }
          })
          setGerarLista(lista)
        } else if (gerarTab === 'cp') {
          const { data } = await client
            .from('contas_pagar')
            .select('id, descricao, credor_nome, credor_cpf_cnpj, valor, valor_pago, data_pagamento, data_vencimento, status')
            .eq('company_id', selectedCompany!.id)
            .eq('status', 'pago')
            .is('deleted_at', null)
            .order('data_pagamento', { ascending: false })
            .limit(200)
          if (cancelled) return
          const lista: GerarItem[] = ((data as any[]) || []).map(r => {
            const m = matchCadastro(r.credor_nome, r.credor_cpf_cnpj)
            return {
              id: r.id,
              origem: 'cp',
              titulo: r.credor_nome || r.descricao || 'Sem nome',
              subtitulo: r.descricao || '',
              valor: Number(r.valor_pago || r.valor || 0),
              data: r.data_pagamento || r.data_vencimento || '',
              email: m?.email || null,
              telefone: m?.telefone || null,
              jaTemRecibo: false,
              match: m,
            }
          })
          setGerarLista(lista)
        } else {
          // Vendas — vendas confirmadas (vendas NAO tem deleted_at); cruza com 1a CR paga
          const { data: vendas } = await client
            .from('vendas')
            .select('id, cliente_nome, cliente_cpf_cnpj, observacoes, valor_total, data_venda, status')
            .eq('company_id', selectedCompany!.id)
            .eq('status', 'confirmado')
            .order('data_venda', { ascending: false })
            .limit(200)
          if (cancelled) return
          const vendaIds = ((vendas as any[]) || []).map((v: any) => v.id)
          const crPorVenda: Record<string, any> = {}
          if (vendaIds.length > 0) {
            const { data: crs } = await client
              .from('contas_receber')
              .select('id, venda_id, valor_pago, valor, data_pagamento, pagador_nome, status')
              .in('venda_id', vendaIds)
              .eq('status', 'pago')
              .is('deleted_at', null)
            ;((crs as any[]) || []).forEach((cr: any) => {
              if (!crPorVenda[cr.venda_id]) crPorVenda[cr.venda_id] = cr
            })
          }
          const lista: GerarItem[] = ((vendas as any[]) || [])
            .filter((v: any) => crPorVenda[v.id])
            .map((v: any) => {
              const cr = crPorVenda[v.id]
              const m = matchCadastro(v.cliente_nome, v.cliente_cpf_cnpj)
              return {
                id: cr.id,
                origem: 'venda' as const,
                vendaId: v.id,
                titulo: v.cliente_nome || cr.pagador_nome || 'Cliente',
                subtitulo: v.observacoes || `Venda ${formatData(v.data_venda)}`,
                valor: Number(v.valor_total || cr.valor_pago || cr.valor || 0),
                data: cr.data_pagamento || v.data_venda || '',
                email: m?.email || null,
                jaTemRecibo: false,
                match: m,
              }
            })
          setGerarLista(lista)
        }
      } catch (err) {
        console.error('Erro carregar lista gerar recibo:', err)
        if (!cancelled) setGerarLista([])
      } finally {
        if (!cancelled) setGerarLoading(false)
      }
    }
    carregar()
    return () => { cancelled = true }
  }, [showGerar, gerarTab, selectedCompany?.id, activeClient])

  const gerarListaFiltrada = gerarLista.filter(item => {
    const needle = normalize(gerarBusca)
    if (!needle) return true
    const hay = normalize([item.titulo, item.subtitulo, formatBRL(item.valor)].join(' '))
    return hay.includes(needle)
  })

  const handleGerarRecibo = async () => {
    if (!gerarSelecionado || !selectedCompany?.id) {
      toast.error('Selecione um item para gerar o recibo.')
      return
    }
    if (gerarEnvio === 'email' && !gerarEmail.trim()) {
      toast.error('Informe o e-mail destinatário.')
      return
    }
    if (gerarEnvio === 'whatsapp' && !gerarTelefone.trim()) {
      toast.error('Informe o telefone do destinatário.')
      return
    }
    setGerarSubmitting(true)
    try {
      const client = activeClient ?? supabase
      const item = gerarSelecionado

      // 1. Buscar dados da CR ou CP selecionada
      const sourceTable = item.origem === 'cp' ? 'contas_pagar' : 'contas_receber'
      const { data: contaData, error: erroConta } = await client
        .from(sourceTable)
        .select('*')
        .eq('id', item.id)
        .single()
      if (erroConta || !contaData) {
        toast.error('Conta nao encontrada.')
        return
      }
      const conta = contaData as any

      // 2. Proximo numero_sequencial
      const { data: ultimoRec } = await client
        .from('recibos_v2')
        .select('numero_sequencial')
        .eq('company_id', selectedCompany.id)
        .order('numero_sequencial', { ascending: false })
        .limit(1)
        .maybeSingle()
      const proximoNumero = ((ultimoRec as any)?.numero_sequencial || 0) + 1

      // 3. Dados da empresa
      const { data: empresaData } = await client
        .from('companies')
        .select('razao_social, nome_fantasia, cnpj, dados_bancarios_pix')
        .eq('id', selectedCompany.id)
        .single()
      const empresaNome = (empresaData as any)?.nome_fantasia || (empresaData as any)?.razao_social || 'Empresa'

      // 4. Template (cor/rodape)
      const { data: template } = await client
        .from('receipt_templates')
        .select('cor_primaria, rodape_texto')
        .eq('company_id', selectedCompany.id)
        .maybeSingle()

      // 5. Montar dados do PDF
      const dataPgto = new Date(
        (conta.data_pagamento || conta.data_vencimento || new Date().toISOString().split('T')[0]) + 'T12:00:00'
      )
      const numeroStr = `RCB-${dataPgto.getFullYear()}-${String(proximoNumero).padStart(6, '0')}`
      const valorRecibo = Number(conta.valor_pago || conta.valor || item.valor || 0)
      const favorecidoNome = item.origem === 'cp' ? (conta.credor_nome || item.titulo) : (conta.pagador_nome || item.titulo)
      const cpfCnpj = item.origem === 'cp' ? conta.credor_cpf_cnpj : conta.pagador_cpf_cnpj
      const descricaoServico = (conta.descricao || conta.observacoes || item.subtitulo || item.titulo).trim() || favorecidoNome
      const formaPgto = item.origem === 'cp' ? conta.forma_pagamento : conta.forma_recebimento

      const pdfBlob = await gerarReciboPDF({
        numero: numeroStr,
        valor: valorRecibo,
        favorecido: favorecidoNome,
        forma_pagamento: formaPgto || undefined,
        data_pagamento: new Intl.DateTimeFormat('pt-BR').format(dataPgto),
        data_hora_pagamento: new Intl.DateTimeFormat('pt-BR', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        }).format(dataPgto),
        descricao: descricaoServico,
        empresa_nome: empresaNome,
        empresa_cnpj: (empresaData as any)?.cnpj ?? undefined,
        pagador_razao_social: (empresaData as any)?.razao_social || (empresaData as any)?.nome_fantasia || undefined,
        chave_pix: (empresaData as any)?.dados_bancarios_pix || undefined,
        cor_primaria: (template as any)?.cor_primaria ?? '#1D2939',
        rodape_texto: (template as any)?.rodape_texto,
        tipo: item.origem === 'cp' ? 'payable' : 'receivable',
      })

      // 6. Upload PDF
      const storagePath = `${selectedCompany.id}/recibos/${numeroStr}.pdf`
      const { error: erroUpload } = await client.storage
        .from('documentos')
        .upload(storagePath, pdfBlob, { contentType: 'application/pdf', upsert: true })

      let pdfUrl: string | null = null
      if (!erroUpload) {
        const { data: urlData } = client.storage.from('documentos').getPublicUrl(storagePath)
        pdfUrl = urlData?.publicUrl ?? null
      } else {
        console.warn('Erro upload PDF recibo:', erroUpload)
      }

      // 7. INSERT recibos_v2 (colunas REAIS do schema)
      const insertPayload: any = {
        company_id: selectedCompany.id,
        pagador_nome: favorecidoNome,
        pagador_cpf_cnpj: cpfCnpj || null,
        valor: valorRecibo,
        data: (conta.data_pagamento || conta.data_vencimento || new Date().toISOString().split('T')[0]),
        descricao_servico: descricaoServico,
        forma_pagamento: formaPgto || null,
        numero_sequencial: proximoNumero,
        email_destino: gerarEnvio === 'email' ? (gerarEmail.trim() || null) : null,
        pdf_url: pdfUrl,
      }
      if (item.origem === 'cp') {
        insertPayload.conta_pagar_id = item.id
      } else {
        insertPayload.conta_receber_id = item.id
      }

      let { error: erroInsert } = await client
        .from('recibos_v2')
        .insert(insertPayload)

      // Fallback: se a migration conta_pagar_id ainda nao foi aplicada,
      // tenta inserir sem o FK (recibo de CP fica sem vinculo)
      if (erroInsert && item.origem === 'cp' && /conta_pagar_id/i.test(erroInsert.message || '')) {
        delete insertPayload.conta_pagar_id
        const retry = await client.from('recibos_v2').insert(insertPayload)
        erroInsert = retry.error
      }

      if (erroInsert) {
        toast.error('Erro ao salvar recibo', { description: erroInsert.message })
        return
      }

      // 8. Download local sempre
      downloadBlob(pdfBlob, `${numeroStr}.pdf`)

      // 9. Envio conforme modo selecionado
      let envioMsg = `#${proximoNumero} — PDF baixado.`
      let envioOk = true

      if (gerarEnvio === 'email') {
        const emailTo = gerarEmail.trim()
        if (pdfUrl) {
          try {
            const r = await sendReciboEmail({
              destinatario: emailTo,
              assunto: `Comprovante de pagamento — Recibo ${numeroStr}`,
              corpo: `Olá!\n\nSegue em anexo o recibo no valor de ${formatBRL(valorRecibo)}.\n\n${descricaoServico}`,
              pdfUrl,
              nomeArquivo: `${numeroStr}.pdf`,
            })
            if (r.ok) envioMsg = `Enviado por e-mail para ${emailTo}`
            else { envioOk = false; envioMsg = `Falha ao enviar e-mail: ${r.error || 'erro'}` }
          } catch (err: any) {
            envioOk = false
            envioMsg = `Falha ao enviar e-mail: ${err?.message || 'erro'}`
          }
        } else {
          envioOk = false
          envioMsg = 'PDF nao subiu pro storage; envio por e-mail cancelado.'
        }
      } else if (gerarEnvio === 'whatsapp') {
        const fone = gerarTelefone.trim()
        try {
          const valorSemRS = formatBRL(valorRecibo).replace(/^R\$\s*/, '')
          const dataFmt = new Intl.DateTimeFormat('pt-BR').format(dataPgto)
          const linkPdf = pdfUrl ? `\n\nPDF: ${pdfUrl}` : ''
          const text = `Olá! Segue comprovante de pagamento:\n\n*Recibo ${numeroStr}*\nFavorecido: ${favorecidoNome}\nValor: ${formatBRL(valorRecibo)}\nPago em: ${dataFmt}${descricaoServico ? `\nDescrição: ${descricaoServico}` : ''}${linkPdf}`
          const r = await sendWhatsApp({
            phone: fone,
            text,
            template: {
              name: 'recibo_pagamento',
              languageCode: 'pt_BR',
              bodyParams: [favorecidoNome || 'Cliente', numeroStr, valorSemRS, dataFmt],
            },
          })
          if (r.ok) envioMsg = `Enviado por WhatsApp para ${r.phone || fone}`
          else { envioOk = false; envioMsg = `Falha ao enviar WhatsApp: ${r.error || 'erro'}` }
        } catch (err: any) {
          envioOk = false
          envioMsg = `Falha ao enviar WhatsApp: ${err?.message || 'erro'}`
        }
      }

      if (envioOk) {
        toast.success('Recibo gerado!', { description: envioMsg })
      } else {
        // PDF foi gerado e salvo, mas envio falhou
        toast.warning(`Recibo #${proximoNumero} gerado, mas envio falhou`, { description: envioMsg })
      }
      fecharGerar()
      setRefreshKey(k => k + 1)
    } catch (err: any) {
      console.error('Erro gerar recibo:', err)
      toast.error('Erro ao gerar recibo', { description: err?.message || 'Tente novamente.' })
    } finally {
      setGerarSubmitting(false)
    }
  }

  return (
    <AppLayout title="Recibos">
      <div className="pt-0 pb-3 h-[calc(100vh-120px)]">
        <div className="bg-white rounded-xl border border-[#EAECF0] shadow-sm p-4 h-full flex flex-col">
        {/* ═══ MENU SUPERIOR (header da página) ═══ */}
        <div className="border border-[#ccc] rounded-lg overflow-hidden bg-white shrink-0 mb-3">
          <div className="bg-[#2A2724] px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-[14px] font-bold uppercase tracking-wider text-white">Recibos</h1>
              <p className="text-[11px] text-white/80 mt-0.5">Emissão e envio de recibos de pagamento</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-white/60 font-medium">
                {filtrados.length} registro{filtrados.length !== 1 ? 's' : ''}
              </span>
              <ExportMenu
                rows={filtrados}
                baseName="recibos"
                titulo="RECIBOS"
                columns={[
                  { header: 'Número', value: (r) => r.numero, pdfFlex: 8 },
                  { header: 'Favorecido', value: (r) => r.favorecido, pdfFlex: 22, excelWidth: 30 },
                  { header: 'Descrição', value: (r) => r.descricao, pdfFlex: 24, excelWidth: 36 },
                  { header: 'Status', value: (r) => ({ enviado: 'Enviado', pendente: 'Pendente envio', erro: 'Erro' }[r.status_email] || r.status_email), align: 'center', pdfFlex: 11 },
                  { header: 'Data', value: (r) => formatData(r.data_pagamento), align: 'center', pdfFlex: 10 },
                  { header: 'Valor', value: (r) => formatBRL(r.valor), numericValue: (r) => Number(r.valor || 0), pdfFlex: 10 },
                ]}
              />
              <button
                onClick={() => setShowGerar(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider rounded bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
              >
                <Plus className="w-3 h-3" />
                Gerar Recibo
              </button>
            </div>
          </div>
          <ModuleTabs />
        </div>
        <KpiCardGrid className="mb-4">
        <KpiCard
          label="Total de recibos"
          value={kpis.total}
          sub={`${formatBRL(kpis.valorTotal)} emitido`}
        />
        <KpiCard label="Enviados" value={kpis.enviados} valueColor="#039855" sub="entregues por e-mail/WhatsApp" />
        <KpiCard label="Pendentes" value={kpis.pendentes} valueColor="#EA580C" sub="aguardando envio" />
        <KpiCard label="Erros" value={kpis.erros} valueColor="#E53E3E" sub="falha no envio" />
      </KpiCardGrid>
        <div className="flex gap-4 flex-1 min-h-0">

        {/* ---- LEFT COLUMN: List ---- */}
        <div className="w-[420px] min-w-[360px] flex flex-col">
          <div className="border border-[#D1D5DB] rounded-lg overflow-hidden flex flex-col h-full">
            {/* Search + filter */}
            <div className="p-3 border-b border-[#E5E7EB] bg-white space-y-2 shrink-0">
              {/* Search + botão de filtro de data (suspenso) */}
              <div className="flex items-center gap-1.5">
                <div className="flex-1 flex items-center gap-2 border border-[#D1D5DB] rounded px-3 py-2 bg-white">
                  <Search className="w-3.5 h-3.5 text-[#9CA3AF] shrink-0" />
                  <input
                    type="text"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar por nome ou numero..."
                    className="flex-1 text-xs text-[#0F172A] placeholder:text-[#9CA3AF] bg-transparent outline-none border-none"
                  />
                </div>

                <div className="relative shrink-0" ref={filtroDataRef}>
                  <button
                    type="button"
                    onClick={() => setFiltroDataAberto((o) => !o)}
                    title="Filtrar por data"
                    className={`relative flex items-center justify-center w-[34px] h-[34px] rounded border transition-colors ${
                      dataDe || dataAte
                        ? 'bg-[#2A2724] text-white border-[#2A2724]'
                        : 'bg-white text-[#4B5563] border-[#D1D5DB] hover:bg-[#F3F4F6]'
                    }`}
                  >
                    <Filter className="w-3.5 h-3.5" />
                    {(dataDe || dataAte) && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#059669] border border-white" />
                    )}
                  </button>

                  {filtroDataAberto && (
                    <div className="absolute right-0 top-full mt-1 z-30 w-[240px] bg-white border border-[#E5E7EB] rounded-lg shadow-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#9CA3AF]">Filtrar por data</span>
                        {(dataDe || dataAte) && (
                          <button
                            onClick={() => { setDataDe(''); setDataAte('') }}
                            className="text-[10px] font-semibold text-[#E53E3E] hover:underline"
                          >
                            Limpar
                          </button>
                        )}
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-[#4B5563] block mb-1">De</label>
                        <input
                          type="date"
                          value={dataDe}
                          max={dataAte || undefined}
                          onChange={(e) => setDataDe(e.target.value)}
                          className="w-full border border-[#D1D5DB] rounded px-2 py-1.5 text-[11px] text-[#0F172A] bg-white outline-none focus:border-[#059669]"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-[#4B5563] block mb-1">Até</label>
                        <input
                          type="date"
                          value={dataAte}
                          min={dataDe || undefined}
                          onChange={(e) => setDataAte(e.target.value)}
                          className="w-full border border-[#D1D5DB] rounded px-2 py-1.5 text-[11px] text-[#0F172A] bg-white outline-none focus:border-[#059669]"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Status filter */}
              <div className="flex gap-1.5">
                {[
                  { key: 'todos', label: 'Todos' },
                  { key: 'enviado', label: 'Enviado' },
                  { key: 'pendente', label: 'Pendente' },
                  { key: 'erro', label: 'Erro' },
                ].map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFiltroStatus(f.key)}
                    className={`px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider rounded border transition-colors ${
                      filtroStatus === f.key
                        ? 'bg-[#2A2724] text-white border-[#2A2724]'
                        : 'bg-white text-[#4B5563] border-[#D1D5DB] hover:bg-[#F3F4F6]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* List items */}
            <div className="flex-1 overflow-y-auto bg-white">
              {loading ? (
                <div>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="px-4 py-3 border-b border-[#E5E7EB]">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <Skeleton className="h-3 w-12" />
                            <Skeleton className="h-3 w-14 rounded-full" />
                          </div>
                          <Skeleton className="h-3.5 w-40" />
                          <Skeleton className="h-3 w-32" />
                          <Skeleton className="h-2.5 w-16" />
                        </div>
                        <div className="flex flex-col items-end shrink-0 gap-1">
                          <Skeleton className="h-4 w-16" />
                          <Skeleton className="h-3 w-3" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : filtrados.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 px-4 text-center text-xs text-[#9CA3AF]">
                  <FileText className="w-8 h-8 text-[#D1D5DB] mb-2" />
                  <p className="mb-3">{temFiltro ? 'Nenhum recibo encontrado.' : 'Nenhum recibo gerado ainda.'}</p>
                  {!temFiltro && (
                    <button
                      onClick={() => setShowGerar(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider rounded bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                    >
                      <Plus className="w-3 h-3" /> Gerar primeiro recibo
                    </button>
                  )}
                </div>
              ) : (
                filtrados.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setSelecionado(r)}
                    className={`w-full text-left px-4 py-3 border-b border-[#E5E7EB] transition-colors hover:bg-[#F9FAFB] ${
                      selecionado?.id === r.id ? 'bg-[#ECFDF4] border-l-2 border-l-[#059669]' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[10px] font-mono text-[#1E3A8A] font-bold">#{r.numero}</span>
                          <StatusBadge status={r.status_email} />
                        </div>
                        <div className="text-xs font-semibold text-[#0F172A] truncate">{r.favorecido}</div>
                        {r.descricao && (
                          <div className="text-[11px] text-[#4B5563] truncate mt-0.5">
                            {r.descricao.length > 60 ? r.descricao.slice(0, 60) + '...' : r.descricao}
                          </div>
                        )}
                        <div className="text-[10px] text-[#9CA3AF] mt-1">{formatData(r.data_pagamento)}</div>
                      </div>
                      <div className="flex flex-col items-end shrink-0">
                        <div className="text-sm font-bold text-[#0F172A]">{formatBRL(r.valor)}</div>
                        <ChevronRight className="w-3.5 h-3.5 text-[#D1D5DB] mt-1" />
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ---- RIGHT COLUMN: Preview ---- */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="border border-[#D1D5DB] rounded-lg overflow-hidden flex flex-col h-full">
            {selecionado ? (
              <>
                {/* Preview header */}
                <div className="bg-[#2A2724] px-4 py-2.5 flex items-center justify-between shrink-0">
                  <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">
                    Recibo #{selecionado.numero}
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleAbrirWhatsApp(selecionado)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider rounded bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                    >
                      <MessageCircle className="w-3 h-3" />
                      Enviar WhatsApp
                    </button>
                    <button
                      onClick={() => handleReenviarEmail(selecionado)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider rounded bg-white/10 text-white hover:bg-white/20 transition-colors border border-white/20"
                    >
                      <Mail className="w-3 h-3" />
                      Reenviar e-mail
                    </button>
                    <button
                      onClick={() => handleDownloadPDF(selecionado)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider rounded bg-white text-[#2A2724] hover:bg-white/90 transition-colors"
                    >
                      <Download className="w-3 h-3" />
                      Download PDF
                    </button>
                  </div>
                </div>

                {/* Preview body */}
                <div className="flex-1 overflow-y-auto bg-[#F6F2EB] p-4">
                  <div className="max-w-[700px] mx-auto shadow-sm border border-[#E5E7EB] rounded bg-white">
                    <PreviewRecibo recibo={selecionado} empresa={empresa} />
                  </div>
                </div>
              </>
            ) : (
              /* Empty state */
              <div className="flex-1 flex flex-col items-center justify-center bg-white">
                <FileText className="w-12 h-12 text-[#D1D5DB] mb-3" />
                <div className="text-sm text-[#9CA3AF]">Selecione um recibo para visualizar</div>
              </div>
            )}
          </div>
        </div>

        </div>
        </div>
      </div>

      <Dialog open={showGerar} onOpenChange={(o) => { if (!o) fecharGerar() }}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-emerald-600" />
              Gerar Recibo
            </DialogTitle>
          </DialogHeader>

          {/* Tabs CR / CP / Venda */}
          <div className="flex gap-1.5 border-b border-[#E5E7EB] pb-2">
            {([
              { key: 'cr', label: 'Conta a Receber' },
              { key: 'cp', label: 'Conta a Pagar' },
              { key: 'venda', label: 'Venda' },
            ] as const).map(t => (
              <button
                key={t.key}
                onClick={() => { setGerarTab(t.key); setGerarSelecionado(null); setGerarBusca('') }}
                className={`px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider rounded border transition-colors ${
                  gerarTab === t.key
                    ? 'bg-[#2A2724] text-white border-[#2A2724]'
                    : 'bg-white text-[#4B5563] border-[#D1D5DB] hover:bg-[#F3F4F6]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Busca */}
          <div className="flex items-center gap-2 border border-[#D1D5DB] rounded px-3 py-2 bg-white">
            <Search className="w-3.5 h-3.5 text-[#9CA3AF] shrink-0" />
            <input
              type="text"
              value={gerarBusca}
              onChange={(e) => setGerarBusca(e.target.value)}
              placeholder={gerarTab === 'cp' ? 'Buscar por credor, descricao, valor...' : gerarTab === 'venda' ? 'Buscar por cliente, descricao, valor...' : 'Buscar por pagador, descricao, valor...'}
              className="flex-1 text-xs text-[#0F172A] placeholder:text-[#9CA3AF] bg-transparent outline-none border-none"
            />
          </div>

          {/* Lista */}
          <div className="border border-[#E5E7EB] rounded max-h-[280px] overflow-y-auto bg-white">
            {gerarLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : gerarListaFiltrada.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-xs text-[#9CA3AF]">
                <FileText className="w-7 h-7 text-[#D1D5DB] mb-2" />
                {gerarTab === 'cp' ? 'Nenhuma CP paga encontrada.' : gerarTab === 'venda' ? 'Nenhuma venda com pagamento encontrado.' : 'Nenhuma CR paga encontrada.'}
              </div>
            ) : (
              gerarListaFiltrada.map(item => (
                <button
                  key={`${item.origem}-${item.id}`}
                  onClick={() => {
                    setGerarSelecionado(item)
                    setGerarEmail(item.email || '')
                    setGerarTelefone(item.telefone || '')
                    // Auto-seleciona modo se tem contato; senao mantem 'nenhum'
                    if (item.email) setGerarEnvio('email')
                    else if (item.telefone) setGerarEnvio('whatsapp')
                    else setGerarEnvio('nenhum')
                  }}
                  className={`w-full text-left px-3 py-2.5 border-b border-[#E5E7EB] last:border-b-0 transition-colors hover:bg-[#F9FAFB] ${
                    gerarSelecionado?.id === item.id && gerarSelecionado?.origem === item.origem ? 'bg-[#ECFDF4] border-l-2 border-l-[#059669]' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-[#0F172A] truncate">{item.titulo}</span>
                        {item.match && (
                          <span
                            className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                              item.match.tipo === 'funcionario'
                                ? 'bg-[#ECFDF3] border-[#039855] text-[#039855]'
                                : item.match.tipo === 'fornecedor'
                                ? 'bg-[#FFF7ED] border-[#EA580C] text-[#EA580C]'
                                : 'bg-[#EFF6FF] border-[#1E3A8A] text-[#1E3A8A]'
                            }`}
                          >
                            {item.match.tipo === 'funcionario' ? 'Func.' : item.match.tipo === 'fornecedor' ? 'Forn.' : 'Cli.'}
                          </span>
                        )}
                      </div>
                      {item.subtitulo && (
                        <div className="text-[11px] text-[#4B5563] truncate mt-0.5">{item.subtitulo}</div>
                      )}
                      <div className="text-[10px] text-[#9CA3AF] mt-0.5">
                        {item.data ? formatData(item.data) : '—'}
                      </div>
                    </div>
                    <div className="text-sm font-bold text-[#0F172A] shrink-0">{formatBRL(item.valor)}</div>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Envio: nenhum / email / whatsapp */}
          {gerarSelecionado && (
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-[#555]">
                Como enviar o recibo?
              </Label>
              <div className="flex gap-1.5">
                {([
                  { key: 'nenhum', label: 'Só baixar PDF', icon: <Download className="w-3 h-3" /> },
                  { key: 'email', label: 'E-mail', icon: <Mail className="w-3 h-3" /> },
                  { key: 'whatsapp', label: 'WhatsApp', icon: <MessageCircle className="w-3 h-3" /> },
                ] as const).map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setGerarEnvio(opt.key)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider rounded border transition-colors ${
                      gerarEnvio === opt.key
                        ? opt.key === 'whatsapp'
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : opt.key === 'email'
                          ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                          : 'bg-[#2A2724] text-white border-[#2A2724]'
                        : 'bg-white text-[#4B5563] border-[#D1D5DB] hover:bg-[#F3F4F6]'
                    }`}
                  >
                    {opt.icon}
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Campo dinâmico conforme modo */}
              {gerarEnvio === 'email' && (
                <div className="space-y-1 pt-1">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-[#555]">
                    E-mail destinatário <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="email"
                    value={gerarEmail}
                    onChange={(e) => setGerarEmail(e.target.value)}
                    placeholder="cliente@exemplo.com"
                    className="h-9"
                  />
                </div>
              )}
              {gerarEnvio === 'whatsapp' && (
                <div className="space-y-1 pt-1">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-[#555]">
                    Telefone (WhatsApp) <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={gerarTelefone}
                    onChange={(e) => setGerarTelefone(e.target.value)}
                    placeholder="11999999999 (com DDD)"
                    className="h-9"
                  />
                  <p className="text-[10px] text-[#999]">Aceita com ou sem DDI/parênteses/traços.</p>
                </div>
              )}

              {/* Feedback do match cadastro */}
              {gerarSelecionado.match ? (
                <div className="text-[10px] text-[#039855] flex items-start gap-1 pt-1">
                  <span>✓</span>
                  <span>
                    Cadastro <strong>{gerarSelecionado.match.tipo === 'funcionario' ? 'Funcionário' : gerarSelecionado.match.tipo === 'fornecedor' ? 'Fornecedor' : 'Cliente'}</strong>: {gerarSelecionado.match.nome}
                    {gerarSelecionado.match.email && <> · E-mail: {gerarSelecionado.match.email}</>}
                    {gerarSelecionado.match.telefone && <> · Tel: {gerarSelecionado.match.telefone}</>}
                    {!gerarSelecionado.match.email && !gerarSelecionado.match.telefone && <> · <span className="text-[#EA580C]">sem contato cadastrado</span></>}
                  </span>
                </div>
              ) : (
                <div className="text-[10px] text-[#9CA3AF] pt-1">
                  Nenhum cadastro encontrado para "<strong>{gerarSelecionado.titulo}</strong>". Preencha manualmente o {gerarEnvio === 'whatsapp' ? 'telefone' : gerarEnvio === 'email' ? 'e-mail' : 'campo'} acima ou só baixe o PDF.
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={fecharGerar} disabled={gerarSubmitting}>
              Cancelar
            </Button>
            <Button
              onClick={handleGerarRecibo}
              disabled={
                gerarSubmitting ||
                !gerarSelecionado ||
                (gerarEnvio === 'email' && !gerarEmail.trim()) ||
                (gerarEnvio === 'whatsapp' && !gerarTelefone.trim())
              }
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {gerarSubmitting
                ? 'Gerando...'
                : gerarEnvio === 'email'
                ? 'Gerar e enviar por e-mail'
                : gerarEnvio === 'whatsapp'
                ? 'Gerar e enviar por WhatsApp'
                : 'Gerar recibo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!emailDialog} onOpenChange={(o) => { if (!o) setEmailDialog(null) }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-[#1E3A8A]" />
              Reenviar Recibo por E-mail
            </DialogTitle>
          </DialogHeader>
          {emailDialog && (
            <div className="space-y-3 py-2">
              <div className="rounded-md bg-[#F6F2EB] p-3 text-xs">
                <p className="font-semibold text-[#1D2939]">Recibo #{emailDialog.numero}</p>
                <p className="text-[#667085] mt-0.5">{emailDialog.favorecido} — {formatBRL(emailDialog.valor)}</p>
              </div>
              {!emailDialog.pdf_url && (
                <div className="rounded-md bg-amber-50 border border-amber-200 p-2 text-[11px] text-amber-800">
                  ⚠️ Este recibo não tem PDF anexado e não pode ser reenviado.
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-[#555]">
                  E-mail destinatário <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="email"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="cliente@exemplo.com"
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-[#555]">Assunto</Label>
                <Input
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-[#555]">Mensagem</Label>
                <textarea
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#1D2939] focus:outline-none focus:border-[#059669]"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEmailDialog(null)} disabled={emailSending}>
              Cancelar
            </Button>
            <Button
              onClick={handleEnviarEmail}
              disabled={emailSending || !emailTo.trim() || !emailDialog?.pdf_url}
              className="bg-[#1E3A8A] hover:bg-[#1D2939] text-white"
            >
              {emailSending ? 'Enviando...' : 'Enviar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!whatsDialog} onOpenChange={(o) => { if (!o) setWhatsDialog(null) }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-emerald-600" />
              Enviar Recibo por WhatsApp
            </DialogTitle>
          </DialogHeader>
          {whatsDialog && (
            <div className="space-y-3 py-2">
              <div className="rounded-md bg-[#F6F2EB] p-3 text-xs">
                <p className="font-semibold text-[#1D2939]">Recibo #{whatsDialog.numero}</p>
                <p className="text-[#667085] mt-0.5">{whatsDialog.favorecido} — {formatBRL(whatsDialog.valor)}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-[#555]">
                  Telefone do destinatário <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={whatsPhone}
                  onChange={(e) => setWhatsPhone(e.target.value)}
                  placeholder="11999999999 (com DDD)"
                  className="h-9"
                />
                <p className="text-[10px] text-[#999]">Aceita formatos com ou sem DDI/parênteses/traços.</p>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-[#555]">Mensagem</Label>
                <textarea
                  value={whatsText}
                  onChange={(e) => setWhatsText(e.target.value)}
                  rows={8}
                  className="w-full px-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#1D2939] focus:outline-none focus:border-[#059669] font-mono"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setWhatsDialog(null)} disabled={whatsSending}>
              Cancelar
            </Button>
            <Button
              onClick={handleEnviarWhatsApp}
              disabled={whatsSending || !whatsPhone.trim() || !whatsText.trim()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {whatsSending ? 'Enviando...' : 'Enviar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  )
}
