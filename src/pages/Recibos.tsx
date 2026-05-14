import { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { safeQuery } from '@/lib/supabaseQuery'
import { formatBRL, formatData, formatCNPJ } from '@/lib/format'
import { AppLayout } from '@/components/layout/AppLayout'
import { Search, Mail, Download, FileText, ChevronRight, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { sendWhatsApp } from '@/lib/whatsapp/send-whatsapp'
import { sendReciboEmail } from '@/lib/recibos/send-recibo-email'

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
  }, [selectedCompany?.id, activeClient])

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

    // Search filter
    const needle = normalize(busca)
    if (!needle) return true
    const haystack = normalize(
      [r.favorecido, r.numero, r.descricao, formatBRL(r.valor)].filter(Boolean).join(' ')
    )
    return haystack.includes(needle)
  })

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
      const result = await sendWhatsApp({ phone: whatsPhone, text: whatsText })
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

  return (
    <AppLayout title="Recibos">
      <div className="flex gap-4 h-[calc(100vh-120px)]">

        {/* ---- LEFT COLUMN: List ---- */}
        <div className="w-[420px] min-w-[360px] flex flex-col">
          <div className="border border-[#D1D5DB] rounded-lg overflow-hidden flex flex-col h-full">
            {/* Card header */}
            <div className="bg-[#2A2724] px-4 py-2.5 flex items-center justify-between shrink-0">
              <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">Recibos</h3>
              <span className="text-[10px] text-white/60 font-medium">{filtrados.length} registro{filtrados.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Search + filter */}
            <div className="p-3 border-b border-[#E5E7EB] bg-white space-y-2 shrink-0">
              {/* Search */}
              <div className="flex items-center gap-2 border border-[#D1D5DB] rounded px-3 py-2 bg-white">
                <Search className="w-3.5 h-3.5 text-[#9CA3AF] shrink-0" />
                <input
                  type="text"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por nome ou numero..."
                  className="flex-1 text-xs text-[#0F172A] placeholder:text-[#9CA3AF] bg-transparent outline-none border-none"
                />
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
                <div className="flex flex-col items-center justify-center h-40 text-xs text-[#9CA3AF]">
                  <FileText className="w-8 h-8 text-[#D1D5DB] mb-2" />
                  {busca ? 'Nenhum recibo encontrado.' : 'Nenhum recibo gerado ainda.'}
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
