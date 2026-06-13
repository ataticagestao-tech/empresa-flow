import { useState, useEffect, useCallback } from 'react'
import { Loader2, Check, AlertTriangle, Shield, Plug, ExternalLink, CheckCircle2, Copy } from 'lucide-react'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/layout/AppLayout'
import { PagePanel } from '@/components/layout/PagePanel'
import { toast } from 'sonner'

const WEBHOOK_URL = `${import.meta.env.VITE_SUPABASE_URL || 'https://onobornmnzemgsduscug.supabase.co'}/functions/v1/asaas-webhook-handler`

interface AsaasConfig {
  id?: string
  company_id: string
  api_key_sandbox: string
  api_key_producao: string
  ambiente: string // 'sandbox' | 'producao'
  conta_nome: string | null
  conta_email: string | null
  wallet_id: string | null
  dias_vencimento: number
  juros_mensal: number
  multa: number
  webhook_token: string
  conta_repasse_id: string | null
  ativo: boolean
}

const emptyConfig: AsaasConfig = {
  company_id: '',
  api_key_sandbox: '',
  api_key_producao: '',
  ambiente: 'sandbox',
  conta_nome: null,
  conta_email: null,
  wallet_id: null,
  dias_vencimento: 3,
  juros_mensal: 0,
  multa: 0,
  webhook_token: '',
  conta_repasse_id: null,
  ativo: false,
}

interface TesteResultado {
  ok: boolean
  message?: string
  aviso?: string | null
  conta_nome?: string | null
  conta_email?: string | null
  wallet_id?: string | null
  saldo?: number | null
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function AsaasConfiguracoes() {
  const { selectedCompany } = useCompany()
  const { activeClient } = useAuth()

  const [config, setConfig] = useState<AsaasConfig>(emptyConfig)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isNew, setIsNew] = useState(true)
  const [testando, setTestando] = useState(false)
  const [teste, setTeste] = useState<TesteResultado | null>(null)
  const [bankAccounts, setBankAccounts] = useState<Array<{ id: string; name: string; banco: string | null }>>([])

  const loadConfig = useCallback(async () => {
    if (!selectedCompany) { setLoading(false); return }
    setLoading(true)
    setTeste(null)
    const db = activeClient as any

    try {
      const { data, error } = await db.from('asaas_configuracoes')
        .select('*')
        .eq('company_id', selectedCompany.id)
        .maybeSingle()

      if (error) throw error

      if (data) {
        setConfig({
          ...data,
          api_key_sandbox: data.api_key_sandbox || '',
          api_key_producao: data.api_key_producao || '',
          webhook_token: data.webhook_token || '',
        })
        setIsNew(false)
      } else {
        setConfig({ ...emptyConfig, company_id: selectedCompany.id })
        setIsNew(true)
      }
    } catch (e: any) {
      console.error('[AsaasConfig] erro ao carregar:', e)
      toast.error('Erro ao carregar config Asaas: ' + (e?.message || e?.code || 'desconhecido'))
      setConfig({ ...emptyConfig, company_id: selectedCompany.id })
      setIsNew(true)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompany?.id, activeClient])

  useEffect(() => { loadConfig() }, [loadConfig])

  useEffect(() => {
    if (!selectedCompany) return
    const db = activeClient as any
    db.from('bank_accounts')
      .select('id, name, banco')
      .eq('company_id', selectedCompany.id)
      .eq('is_active', true)
      .order('name')
      .then(({ data }: any) => {
        setBankAccounts((data || []).filter((a: any) => a.name !== 'Asaas (a receber)'))
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompany?.id, activeClient])

  const chaveAtual = config.ambiente === 'producao' ? config.api_key_producao : config.api_key_sandbox

  const copiarTexto = async (t: string) => {
    if (!t) return
    try { await navigator.clipboard.writeText(t); toast.success('Copiado!') }
    catch { toast.error('Não consegui copiar — copie manualmente.') }
  }

  const handleTestar = async () => {
    if (!chaveAtual.trim()) {
      toast.error(`Cole a chave de ${config.ambiente === 'producao' ? 'Produção' : 'Teste'} antes de testar.`)
      return
    }
    setTestando(true)
    setTeste(null)
    try {
      const { data, error } = await (activeClient as any).functions.invoke('asaas-testar-conexao', {
        body: { apiKey: chaveAtual.trim(), ambiente: config.ambiente },
      })
      if (error) throw error
      const res = data as TesteResultado
      setTeste(res)
      if (res.ok) {
        // Guarda o nome/email/wallet pra persistir no salvar (confirmação).
        setConfig(prev => ({
          ...prev,
          conta_nome: res.conta_nome ?? prev.conta_nome,
          conta_email: res.conta_email ?? prev.conta_email,
          wallet_id: res.wallet_id ?? prev.wallet_id,
        }))
        toast.success('Conexão com o Asaas confirmada!')
      } else {
        toast.error(res.message || 'Não foi possível conectar.')
      }
    } catch (err: any) {
      setTeste({ ok: false, message: err?.message || 'Falha ao testar conexão.' })
      toast.error(err?.message || 'Falha ao testar conexão.')
    } finally {
      setTestando(false)
    }
  }

  const handleSave = async () => {
    if (!selectedCompany) return
    setSaving(true)
    const db = activeClient as any

    try {
      const temChave = config.ambiente === 'producao'
        ? !!config.api_key_producao.trim()
        : !!config.api_key_sandbox.trim()

      const payload = {
        company_id: selectedCompany.id,
        api_key_sandbox: config.api_key_sandbox.trim() || null,
        api_key_producao: config.api_key_producao.trim() || null,
        ambiente: config.ambiente,
        conta_nome: config.conta_nome || null,
        conta_email: config.conta_email || null,
        wallet_id: config.wallet_id || null,
        dias_vencimento: Number(config.dias_vencimento) || 3,
        juros_mensal: Number(config.juros_mensal) || 0,
        multa: Number(config.multa) || 0,
        webhook_token: config.webhook_token || null,
        conta_repasse_id: config.conta_repasse_id || null,
        ativo: temChave,
      }

      if (isNew) {
        const { error } = await db.from('asaas_configuracoes').insert(payload)
        if (error) throw error
        setIsNew(false)
      } else {
        const { error } = await db.from('asaas_configuracoes').update(payload).eq('id', config.id)
        if (error) throw error
      }

      toast.success('Configurações salvas com sucesso')
      loadConfig()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppLayout title="Cobrança Asaas">
      <div className="animate-fade-in">
        <PagePanel title="Cobrança (Asaas)" subtitle="Conecte a conta Asaas desta empresa para cobrar por Pix e boleto">

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-gray-400" size={24} />
          </div>
        ) : (
        <>

        {/* Ambiente badge */}
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
              config.ambiente === 'producao'
                ? 'bg-green-100 text-green-700'
                : 'bg-yellow-100 text-yellow-700'
            }`}
          >
            <Shield size={12} />
            {config.ambiente === 'producao' ? 'Produção (cobranças reais)' : 'Teste (sandbox)'}
          </span>
          {isNew && (
            <span className="text-xs text-gray-400">Nenhuma conta conectada ainda</span>
          )}
        </div>

        {/* Onde pego a chave */}
        <div className="bg-blue-50 rounded-xl border border-blue-100 p-4 flex items-start gap-3">
          <Plug size={16} className="text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-blue-800 space-y-1">
            <p className="font-semibold">Onde encontro a minha chave do Asaas?</p>
            <p>
              No painel do Asaas, em <strong>Configurações → Integrações → Chave de API</strong>.
              Use a chave de <strong>Sandbox</strong> para testar (dinheiro de mentira) e a de
              <strong> Produção</strong> para cobrar de verdade. O dinheiro cai direto na sua conta Asaas.
            </p>
            <a
              href="https://www.asaas.com/customerApiAccessToken/index"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-blue-600 font-medium hover:underline"
            >
              Abrir painel do Asaas <ExternalLink size={11} />
            </a>
          </div>
        </div>

        {/* Ambiente + chaves */}
        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
          <h3 className="text-sm font-semibold text-gray-800">Conexão</h3>

          <div className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg">
            <AlertTriangle size={16} className="text-yellow-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-yellow-700">
              As chaves ficam guardadas de forma segura no banco. O sistema nunca as exibe de volta.
            </p>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Ambiente ativo</label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="ambiente"
                  value="sandbox"
                  checked={config.ambiente === 'sandbox'}
                  onChange={() => { setConfig(prev => ({ ...prev, ambiente: 'sandbox' })); setTeste(null) }}
                  className="text-blue-600"
                />
                Teste (sandbox)
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="ambiente"
                  value="producao"
                  checked={config.ambiente === 'producao'}
                  onChange={() => { setConfig(prev => ({ ...prev, ambiente: 'producao' })); setTeste(null) }}
                  className="text-blue-600"
                />
                Produção (cobranças reais)
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Chave de Teste (sandbox)</label>
              <input
                type="password"
                value={config.api_key_sandbox}
                onChange={e => { setConfig(prev => ({ ...prev, api_key_sandbox: e.target.value })); setTeste(null) }}
                placeholder="$aact_hmlg_…"
                autoComplete="off"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Chave de Produção</label>
              <input
                type="password"
                value={config.api_key_producao}
                onChange={e => { setConfig(prev => ({ ...prev, api_key_producao: e.target.value })); setTeste(null) }}
                placeholder="$aact_prod_…"
                autoComplete="off"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
              />
            </div>
          </div>

          {/* Testar conexão */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleTestar}
              disabled={testando}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              style={{ border: '1px solid #1A2E4A', color: '#1A2E4A' }}
            >
              {testando ? <Loader2 size={15} className="animate-spin" /> : <Plug size={15} />}
              Testar conexão ({config.ambiente === 'producao' ? 'Produção' : 'Teste'})
            </button>

            {teste && teste.ok && (
              <span className="inline-flex items-center gap-1.5 text-sm text-green-700 font-medium">
                <CheckCircle2 size={16} />
                Conectado{teste.conta_nome ? `: ${teste.conta_nome}` : ''}
                {typeof teste.saldo === 'number' ? ` · saldo ${fmtBRL(teste.saldo)}` : ''}
              </span>
            )}
            {teste && !teste.ok && (
              <span className="inline-flex items-center gap-1.5 text-sm text-red-600 font-medium">
                <AlertTriangle size={16} />
                {teste.message || 'Não conectou'}
              </span>
            )}
          </div>
          {teste?.aviso && (
            <p className="text-xs text-yellow-700 -mt-1">{teste.aviso}</p>
          )}
        </div>

        {/* Recebimento automático (webhook) */}
        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
          <h3 className="text-sm font-semibold text-gray-800">Recebimento automático (baixa sozinha)</h3>
          <p className="text-xs text-gray-500 -mt-2">
            Cadastre esta URL e este token no painel do Asaas, em <strong>Configurações → Integrações → Webhooks</strong>.
            Assim, quando o cliente pagar, a conta a receber baixa sozinha aqui no sistema.
          </p>

          <div>
            <label className="block text-xs text-gray-500 mb-1">URL do webhook</label>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={WEBHOOK_URL}
                onFocus={e => e.currentTarget.select()}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-xs bg-gray-50"
              />
              <button
                onClick={() => copiarTexto(WEBHOOK_URL)}
                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600"
                title="Copiar URL"
              >
                <Copy size={16} />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Token de autenticação</label>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={config.webhook_token}
                placeholder="Gere um token e cole no Asaas"
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-xs bg-gray-50"
                onFocus={e => e.currentTarget.select()}
              />
              <button
                onClick={() => copiarTexto(config.webhook_token)}
                disabled={!config.webhook_token}
                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 disabled:opacity-40"
                title="Copiar token"
              >
                <Copy size={16} />
              </button>
              <button
                onClick={() => setConfig(prev => ({ ...prev, webhook_token: crypto.randomUUID().replace(/-/g, '') }))}
                className="px-3 py-2 rounded-lg text-xs font-medium text-white whitespace-nowrap"
                style={{ backgroundColor: '#1A2E4A' }}
              >
                Gerar token
              </button>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Cole este token no campo "Token de autenticação" do webhook no Asaas. Depois clique em <strong>Salvar configurações</strong>.
            </p>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Conta que recebe os repasses do Asaas (opcional)</label>
            <select
              value={config.conta_repasse_id || ''}
              onChange={e => setConfig(prev => ({ ...prev, conta_repasse_id: e.target.value || null }))}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
            >
              <option value="">— Conciliar manualmente —</option>
              {bankAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.name}{a.banco ? ` · ${a.banco}` : ''}</option>
              ))}
            </select>
            <p className="text-[11px] text-gray-400 mt-1">
              Quando o Asaas repassar o dinheiro pra esta conta, o sistema lança como <strong>transferência</strong> da conta "Asaas (a receber)" — assim a receita não é contada de novo quando cair no extrato.
            </p>
          </div>
        </div>

        {/* Padrões de cobrança */}
        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
          <h3 className="text-sm font-semibold text-gray-800">Padrões de cobrança</h3>
          <p className="text-xs text-gray-500 -mt-2">
            Valores aplicados por padrão ao gerar uma cobrança (dá pra ajustar em cada cobrança).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Vencimento (dias a partir de hoje)</label>
              <input
                type="number"
                min={0}
                value={config.dias_vencimento}
                onChange={e => setConfig(prev => ({ ...prev, dias_vencimento: e.target.value ? Number(e.target.value) : 0 }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Juros ao mês (%)</label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={config.juros_mensal}
                onChange={e => setConfig(prev => ({ ...prev, juros_mensal: parseFloat(e.target.value) || 0 }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Multa por atraso (%)</label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={config.multa}
                onChange={e => setConfig(prev => ({ ...prev, multa: parseFloat(e.target.value) || 0 }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Salvar */}
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: '#059669' }}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            Salvar configurações
          </button>
        </div>

        </>
        )}
        </PagePanel>
      </div>
    </AppLayout>
  )
}
