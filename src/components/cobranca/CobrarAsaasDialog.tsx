import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X, Copy, Check, QrCode, ExternalLink, AlertTriangle, RefreshCw, Ban } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { sendWhatsApp } from '@/lib/whatsapp/send-whatsapp'
import { toast } from 'sonner'

/**
 * Alvo da cobrança — uma Conta a Receber (a unidade de dinheiro do sistema).
 * Vem tanto de Contas a Receber quanto de Vendas (a parcela em aberto).
 */
export interface CobrarAlvo {
  id: string                    // conta_receber_id
  company_id: string
  pagador_nome: string
  pagador_cpf_cnpj: string | null
  pagador_email?: string | null
  valor: number
  valor_pago?: number | null
  data_vencimento: string
  venda_id?: string | null
  /** Telefone do cliente, se conhecido (pré-preenche o envio por WhatsApp). */
  telefone?: string | null
}

interface Props {
  alvo: CobrarAlvo | null
  onClose: () => void
  /** Chamado após criar a cobrança (ex.: recarregar a lista). */
  onCreated?: () => void
}

interface Resultado {
  paymentId: string
  status?: string
  invoiceUrl: string | null
  pixPayload: string | null
  pixQrImage: string | null
  vencimento?: string
  ambiente?: string
}

const onlyDigits = (s: string) => (s || '').replace(/\D/g, '')

const maskCpfCnpj = (s: string) => {
  const d = onlyDigits(s).slice(0, 14)
  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1-$2')
  }
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

const PAGO_STATUS = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH']
const isPago = (s: string) => PAGO_STATUS.includes(s)
const statusInfo = (s: string) => {
  if (isPago(s)) return { label: 'Pago', cls: 'text-emerald-700 bg-emerald-50' }
  if (s === 'OVERDUE') return { label: 'Vencida', cls: 'text-red-600 bg-red-50' }
  return { label: 'Aguardando pagamento', cls: 'text-amber-700 bg-amber-50' }
}

export function CobrarAsaasDialog({ alvo, onClose, onCreated }: Props) {
  const { activeClient } = useAuth()

  const saldo = alvo ? Math.max(0, alvo.valor - (alvo.valor_pago || 0)) : 0

  const [cpf, setCpf] = useState('')
  const [valor, setValor] = useState('')
  const [vencimento, setVencimento] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [descricao, setDescricao] = useState('')

  const [gerando, setGerando] = useState(false)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [copiado, setCopiado] = useState<string | null>(null)
  const [existente, setExistente] = useState<any | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [modoNovo, setModoNovo] = useState(false)

  // Inicializa os campos quando o alvo muda (sem useEffect: deriva por chave).
  const [alvoId, setAlvoId] = useState<string | null>(null)
  if (alvo && alvo.id !== alvoId) {
    setAlvoId(alvo.id)
    setCpf(alvo.pagador_cpf_cnpj ? maskCpfCnpj(alvo.pagador_cpf_cnpj) : '')
    setValor(String(Math.max(0, alvo.valor - (alvo.valor_pago || 0)).toFixed(2)))
    const hoje = new Date().toISOString().slice(0, 10)
    setVencimento(alvo.data_vencimento && alvo.data_vencimento >= hoje ? alvo.data_vencimento : hoje)
    setEmail(alvo.pagador_email || '')
    setTelefone(alvo.telefone ? onlyDigits(alvo.telefone) : '')
    setDescricao(`Cobrança — ${alvo.pagador_nome}`)
    setResultado(null)
    setCopiado(null)
  }

  useEffect(() => {
    if (!alvo) { setExistente(null); return }
    setModoNovo(false)
    setExistente(null)
    setCarregando(true)
    ;(activeClient as any)
      .from('asaas_cobrancas')
      .select('*')
      .eq('conta_receber_id', alvo.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }: any) => {
        const c = (data || [])[0]
        const cancelada = c && ['CANCELLED', 'cancelado', 'REFUNDED'].includes(c.status)
        setExistente(c && !cancelada ? c : null)
        setCarregando(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alvo?.id])

  if (!alvo) return null

  const copiar = async (texto: string, qual: string) => {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(qual)
      setTimeout(() => setCopiado(null), 1800)
    } catch {
      toast.error('Não consegui copiar — copie manualmente.')
    }
  }

  const gerar = async () => {
    if (!onlyDigits(cpf)) { toast.error('Informe o CPF/CNPJ de quem vai pagar.'); return }
    const v = parseFloat(valor.replace(',', '.'))
    if (!v || v <= 0) { toast.error('Valor inválido.'); return }

    setGerando(true)
    try {
      const { data, error } = await (activeClient as any).functions.invoke('asaas-criar-cobranca', {
        body: {
          company_id: alvo.company_id,
          conta_receber_id: alvo.id,
          venda_id: alvo.venda_id || null,
          valor: v,
          vencimento,
          descricao,
          cliente: {
            nome: alvo.pagador_nome,
            cpfCnpj: onlyDigits(cpf),
            email: email || null,
            phone: telefone || null,
          },
        },
      })
      if (error) throw error
      if (!data?.ok) { toast.error(data?.message || 'Não foi possível gerar a cobrança.'); return }

      setResultado({
        paymentId: data.paymentId,
        status: data.status,
        invoiceUrl: data.invoiceUrl ?? null,
        pixPayload: data.pixPayload ?? null,
        pixQrImage: data.pixQrImage ?? null,
        vencimento: data.vencimento,
        ambiente: data.ambiente,
      })
      toast.success('Cobrança gerada!')
      onCreated?.()
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao gerar a cobrança.')
    } finally {
      setGerando(false)
    }
  }

  const enviarWhatsApp = async (invoiceUrl?: string | null, pixPayload?: string | null) => {
    const url = invoiceUrl ?? resultado?.invoiceUrl
    const pix = pixPayload ?? resultado?.pixPayload
    if (!url) { toast.error('Sem link para enviar.'); return }
    const fone = onlyDigits(telefone)
    if (!fone) { toast.error('Informe o telefone do cliente para enviar.'); return }
    setEnviando(true)
    try {
      const linhas = [
        `Olá ${alvo.pagador_nome}!`,
        `Segue o link para pagamento (Pix, boleto ou cartão):`,
        url,
      ]
      if (pix) {
        linhas.push('', 'Pix copia-e-cola:', pix)
      }
      const res = await sendWhatsApp({ phone: fone, text: linhas.join('\n') })
      if (!res.ok) { toast.error(res.error || 'Falha ao enviar pelo WhatsApp.'); return }
      toast.success('Cobrança enviada pelo WhatsApp!')
    } finally {
      setEnviando(false)
    }
  }

  const cancelar = async () => {
    if (!existente) return
    setCancelando(true)
    try {
      const { data, error } = await (activeClient as any).functions.invoke('asaas-cancelar-cobranca', {
        body: { company_id: alvo.company_id, asaas_payment_id: existente.asaas_payment_id },
      })
      if (error) throw error
      if (!data?.ok) { toast.error(data?.message || 'Não foi possível cancelar.'); return }
      toast.success('Cobrança cancelada.')
      setExistente(null)
      setModoNovo(true)
      onCreated?.()
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao cancelar.')
    } finally {
      setCancelando(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <QrCode size={18} className="text-emerald-600" />
            <h3 className="text-sm font-semibold text-gray-800">Cobrar por Pix / boleto</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {carregando ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="animate-spin text-gray-400" size={22} />
            </div>
          ) : (existente && !modoNovo) ? (
            <>
              {(() => {
                const st = statusInfo(existente.status)
                const pago = isPago(existente.status)
                return (
                  <>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-500">Já existe uma cobrança:</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                      {existente.ambiente === 'sandbox' && (
                        <span className="text-[11px] font-semibold text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full">TESTE</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      Valor: <span className="font-medium text-gray-700">{Number(existente.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                      {existente.vencimento ? <span className="ml-2">· venc. {existente.vencimento}</span> : null}
                    </div>

                    {existente.invoice_url && (
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Link de pagamento</label>
                        <div className="flex items-center gap-2">
                          <input
                            readOnly
                            value={existente.invoice_url}
                            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm bg-gray-50"
                            onFocus={e => e.currentTarget.select()}
                          />
                          <button onClick={() => copiar(existente.invoice_url, 'link')} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600" title="Copiar link">
                            {copiado === 'link' ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                          </button>
                          <a href={existente.invoice_url} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600" title="Abrir">
                            <ExternalLink size={16} />
                          </a>
                        </div>
                      </div>
                    )}

                    {existente.pix_payload && (
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Pix copia-e-cola</label>
                        <div className="flex items-start gap-2">
                          <textarea readOnly value={existente.pix_payload} rows={2} className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-xs bg-gray-50 resize-none break-all" onFocus={e => e.currentTarget.select()} />
                          <button onClick={() => copiar(existente.pix_payload, 'pix')} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600" title="Copiar Pix">
                            {copiado === 'pix' ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                          </button>
                        </div>
                      </div>
                    )}

                    {pago ? (
                      <div className="flex items-center gap-2 p-2.5 bg-emerald-50 rounded-lg text-sm text-emerald-700 font-medium">
                        <Check size={16} /> Esta cobrança já foi paga.
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 pt-1">
                          <input
                            value={telefone}
                            onChange={e => setTelefone(e.target.value)}
                            placeholder="WhatsApp do cliente (DDD + número)"
                            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm"
                          />
                          <button
                            onClick={() => enviarWhatsApp(existente.invoice_url, existente.pix_payload)}
                            disabled={enviando}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 whitespace-nowrap"
                            style={{ backgroundColor: '#22A565' }}
                          >
                            {enviando ? <Loader2 size={15} className="animate-spin" /> : (
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2z"/></svg>
                            )}
                            Reenviar
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={cancelar}
                            disabled={cancelando}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-red-200 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            {cancelando ? <Loader2 size={15} className="animate-spin" /> : <Ban size={15} />}
                            Cancelar cobrança
                          </button>
                          <button
                            onClick={() => setModoNovo(true)}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50"
                          >
                            <RefreshCw size={15} /> Gerar nova
                          </button>
                        </div>
                      </>
                    )}

                    <button onClick={onClose} className="w-full px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
                      Fechar
                    </button>
                  </>
                )
              })()}
            </>
          ) : !resultado ? (
            <>
              <div className="text-xs text-gray-500">
                Pagador: <span className="font-medium text-gray-700">{alvo.pagador_nome}</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">CPF / CNPJ de quem paga *</label>
                  <input
                    value={cpf}
                    onChange={e => setCpf(maskCpfCnpj(e.target.value))}
                    placeholder="Obrigatório para o Asaas"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Valor (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={valor}
                    onChange={e => setValor(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                  />
                  {alvo.valor_pago ? (
                    <p className="text-[11px] text-gray-400 mt-0.5">Saldo em aberto: {saldo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                  ) : null}
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Vencimento *</label>
                  <input
                    type="date"
                    value={vencimento}
                    onChange={e => setVencimento(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">E-mail (opcional)</label>
                  <input
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="cliente@email.com"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">WhatsApp (opcional)</label>
                  <input
                    value={telefone}
                    onChange={e => setTelefone(e.target.value)}
                    placeholder="DDD + número"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Descrição</label>
                  <input
                    value={descricao}
                    onChange={e => setDescricao(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                  />
                </div>
              </div>

              <button
                onClick={gerar}
                disabled={gerando}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: '#059669' }}
              >
                {gerando ? <Loader2 size={16} className="animate-spin" /> : <QrCode size={16} />}
                Gerar cobrança
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm text-emerald-700 font-medium">
                <Check size={16} /> Cobrança gerada
                {resultado.ambiente === 'sandbox' && (
                  <span className="ml-1 text-[11px] font-semibold text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full">TESTE</span>
                )}
              </div>

              {/* Link de pagamento */}
              {resultado.invoiceUrl && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Link de pagamento (o cliente escolhe Pix, boleto ou cartão)</label>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={resultado.invoiceUrl}
                      className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm bg-gray-50"
                      onFocus={e => e.currentTarget.select()}
                    />
                    <button
                      onClick={() => copiar(resultado.invoiceUrl!, 'link')}
                      className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600"
                      title="Copiar link"
                    >
                      {copiado === 'link' ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                    </button>
                    <a
                      href={resultado.invoiceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600"
                      title="Abrir"
                    >
                      <ExternalLink size={16} />
                    </a>
                  </div>
                </div>
              )}

              {/* QR Pix */}
              {resultado.pixQrImage && (
                <div className="flex flex-col items-center gap-2">
                  <label className="text-xs text-gray-500">QR code do Pix</label>
                  <img
                    src={`data:image/png;base64,${resultado.pixQrImage}`}
                    alt="QR code Pix"
                    className="w-44 h-44 border border-gray-100 rounded-lg"
                  />
                </div>
              )}

              {/* Pix copia-e-cola */}
              {resultado.pixPayload && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Pix copia-e-cola</label>
                  <div className="flex items-start gap-2">
                    <textarea
                      readOnly
                      value={resultado.pixPayload}
                      rows={2}
                      className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-xs bg-gray-50 resize-none break-all"
                      onFocus={e => e.currentTarget.select()}
                    />
                    <button
                      onClick={() => copiar(resultado.pixPayload!, 'pix')}
                      className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600"
                      title="Copiar Pix"
                    >
                      {copiado === 'pix' ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>
              )}

              {!resultado.pixQrImage && !resultado.pixPayload && (
                <div className="flex items-start gap-2 p-2.5 bg-yellow-50 rounded-lg">
                  <AlertTriangle size={14} className="text-yellow-600 mt-0.5 flex-shrink-0" />
                  <p className="text-[11px] text-yellow-700">
                    O Pix instantâneo não veio (a conta Asaas pode não ter chave Pix cadastrada),
                    mas o link de pagamento acima já funciona para Pix, boleto e cartão.
                  </p>
                </div>
              )}

              {/* Enviar WhatsApp */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  value={telefone}
                  onChange={e => setTelefone(e.target.value)}
                  placeholder="WhatsApp do cliente (DDD + número)"
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm"
                />
                <button
                  onClick={() => enviarWhatsApp()}
                  disabled={enviando}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 whitespace-nowrap"
                  style={{ backgroundColor: '#22A565' }}
                >
                  {enviando ? <Loader2 size={15} className="animate-spin" /> : (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2z"/></svg>
                  )}
                  Enviar
                </button>
              </div>

              <button
                onClick={onClose}
                className="w-full px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
              >
                Fechar
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
