import { useState, useEffect, useCallback } from 'react'
import { Settings, Loader2, Check, AlertTriangle, Shield } from 'lucide-react'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/layout/AppLayout'
import { toast } from 'sonner'

interface NfseConfig {
  id?: string
  company_id: string
  cnpj: string
  inscricao_municipal: string
  codigo_municipio: number | ''
  natureza_operacao: number
  optante_simples_nacional: boolean
  regime_especial_tributacao: number | ''
  aliquota_padrao: number
  item_lista_servico_padrao: string
  codigo_cnae_padrao: string
  discriminacao_padrao: string
  token_homologacao: string
  token_producao: string
  ambiente: string
  ativo: boolean
}

const NATUREZA_OPCOES = [
  { value: 1, label: '1 — Tributacao no municipio' },
  { value: 2, label: '2 — Tributacao fora do municipio' },
  { value: 3, label: '3 — Isencao' },
  { value: 4, label: '4 — Imune' },
  { value: 5, label: '5 — Exigibilidade suspensa (judicial)' },
  { value: 6, label: '6 — Exigibilidade suspensa (administrativo)' },
]

const REGIME_OPCOES = [
  { value: '', label: 'Nenhum' },
  { value: 1, label: '1 — Microempresa municipal' },
  { value: 2, label: '2 — Estimativa' },
  { value: 3, label: '3 — Sociedade de profissionais' },
  { value: 4, label: '4 — Cooperativa' },
  { value: 5, label: '5 — MEI' },
  { value: 6, label: '6 — ME/EPP Simples Nacional' },
]

const emptyConfig: NfseConfig = {
  company_id: '',
  cnpj: '',
  inscricao_municipal: '',
  codigo_municipio: '',
  natureza_operacao: 1,
  optante_simples_nacional: false,
  regime_especial_tributacao: '',
  aliquota_padrao: 3.00,
  item_lista_servico_padrao: '',
  codigo_cnae_padrao: '',
  discriminacao_padrao: '',
  token_homologacao: '',
  token_producao: '',
  ambiente: 'homologacao',
  ativo: true,
}

export default function NfseConfiguracoes() {
  const { selectedCompany } = useCompany()
  const { activeClient } = useAuth()

  const [config, setConfig] = useState<NfseConfig>(emptyConfig)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isNew, setIsNew] = useState(true)

  const loadConfig = useCallback(async () => {
    if (!selectedCompany) return
    setLoading(true)
    const db = activeClient as any

    const { data } = await db.from('nfse_configuracoes')
      .select('*')
      .eq('company_id', selectedCompany.id)
      .maybeSingle()

    if (data) {
      setConfig({ ...data, token_homologacao: data.token_homologacao || '', token_producao: data.token_producao || '' })
      setIsNew(false)
    } else {
      // Pre-preencher CNPJ da empresa
      const { data: emp } = await db.from('companies')
        .select('cnpj, inscricao_municipal')
        .eq('id', selectedCompany.id)
        .maybeSingle()

      setConfig({
        ...emptyConfig,
        company_id: selectedCompany.id,
        cnpj: emp?.cnpj || '',
        inscricao_municipal: emp?.inscricao_municipal || '',
      })
      setIsNew(true)
    }
    setLoading(false)
  }, [selectedCompany, activeClient])

  useEffect(() => { loadConfig() }, [loadConfig])

  const handleSave = async () => {
    if (!selectedCompany) return
    if (!config.cnpj.trim()) { toast.error('CNPJ obrigatorio'); return }
    if (!config.inscricao_municipal.trim()) { toast.error('Inscricao Municipal obrigatoria'); return }
    if (!config.codigo_municipio) { toast.error('Codigo do Municipio (IBGE) obrigatorio'); return }

    setSaving(true)
    const db = activeClient as any

    try {
      const payload = {
        company_id: selectedCompany.id,
        cnpj: config.cnpj,
        inscricao_municipal: config.inscricao_municipal,
        codigo_municipio: Number(config.codigo_municipio),
        natureza_operacao: config.natureza_operacao,
        optante_simples_nacional: config.optante_simples_nacional,
        regime_especial_tributacao: config.regime_especial_tributacao || null,
        aliquota_padrao: config.aliquota_padrao,
        item_lista_servico_padrao: config.item_lista_servico_padrao || null,
        codigo_cnae_padrao: config.codigo_cnae_padrao || null,
        discriminacao_padrao: config.discriminacao_padrao || null,
        token_homologacao: config.token_homologacao || null,
        token_producao: config.token_producao || null,
        ambiente: config.ambiente,
        ativo: true,
      }

      if (isNew) {
        const { error } = await db.from('nfse_configuracoes').insert(payload)
        if (error) throw error
        setIsNew(false)
      } else {
        const { error } = await db.from('nfse_configuracoes').update(payload).eq('id', config.id)
        if (error) throw error
      }

      toast.success('Configuracoes salvas com sucesso')
      loadConfig()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const maskToken = (token: string) => {
    if (!token || token.length < 8) return token
    return '••••••••' + token.slice(-4)
  }

  if (loading) {
    return (
      <AppLayout title="Configuracoes NFSe">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-gray-400" size={24} />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="Configuracoes NFSe">
      <div className="p-6 max-w-3xl space-y-6">

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
            {config.ambiente === 'producao' ? 'Producao' : 'Homologacao'}
          </span>
          {isNew && (
            <span className="text-xs text-gray-400">Nenhuma configuracao salva ainda</span>
          )}
        </div>

        {/* Dados do prestador */}
        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
          <h3 className="text-sm font-semibold text-gray-800">Dados do Prestador</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">CNPJ *</label>
              <input
                type="text"
                value={config.cnpj}
                onChange={e => setConfig(prev => ({ ...prev, cnpj: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Inscricao Municipal *</label>
              <input
                type="text"
                value={config.inscricao_municipal}
                onChange={e => setConfig(prev => ({ ...prev, inscricao_municipal: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Codigo Municipio (IBGE) *</label>
              <input
                type="number"
                value={config.codigo_municipio}
                onChange={e => setConfig(prev => ({ ...prev, codigo_municipio: e.target.value ? Number(e.target.value) : '' }))}
                placeholder="Ex: 3170701 (Varginha)"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Natureza da Operacao</label>
              <select
                value={config.natureza_operacao}
                onChange={e => setConfig(prev => ({ ...prev, natureza_operacao: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
              >
                {NATUREZA_OPCOES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={config.optante_simples_nacional}
                onChange={e => setConfig(prev => ({ ...prev, optante_simples_nacional: e.target.checked }))}
                className="rounded border-gray-300"
              />
              Optante Simples Nacional
            </label>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Regime Especial Tributacao</label>
              <select
                value={config.regime_especial_tributacao}
                onChange={e => setConfig(prev => ({ ...prev, regime_especial_tributacao: e.target.value ? Number(e.target.value) : '' }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
              >
                {REGIME_OPCOES.map(o => <option key={String(o.value)} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Padrao de servico */}
        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
          <h3 className="text-sm font-semibold text-gray-800">Padrao de Servico</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Aliquota ISS padrao (%)</label>
              <input
                type="number"
                step="0.01"
                value={config.aliquota_padrao}
                onChange={e => setConfig(prev => ({ ...prev, aliquota_padrao: parseFloat(e.target.value) || 0 }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Item Lista Servico (LC 116)</label>
              <input
                type="text"
                value={config.item_lista_servico_padrao}
                onChange={e => setConfig(prev => ({ ...prev, item_lista_servico_padrao: e.target.value }))}
                placeholder="Ex: 17.01"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">CNAE padrao</label>
              <input
                type="text"
                value={config.codigo_cnae_padrao}
                onChange={e => setConfig(prev => ({ ...prev, codigo_cnae_padrao: e.target.value }))}
                placeholder="Ex: 6311900"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Discriminacao padrao do servico</label>
            <textarea
              value={config.discriminacao_padrao}
              onChange={e => setConfig(prev => ({ ...prev, discriminacao_padrao: e.target.value }))}
              rows={3}
              placeholder="Texto padrao que aparece na descricao do servico da NFSe"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm resize-none"
            />
          </div>
        </div>

        {/* Tokens Focus NF-e */}
        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
          <h3 className="text-sm font-semibold text-gray-800">Tokens Focus NF-e</h3>
          <div className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg mb-2">
            <AlertTriangle size={16} className="text-yellow-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-yellow-700">
              Os tokens sao armazenados de forma segura no banco. O frontend nunca os expoe.
              Copie o token do seu painel Focus NF-e e cole aqui.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Token Homologacao</label>
              <input
                type="password"
                value={config.token_homologacao}
                onChange={e => setConfig(prev => ({ ...prev, token_homologacao: e.target.value }))}
                placeholder="Cole o token de homologacao"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Token Producao</label>
              <input
                type="password"
                value={config.token_producao}
                onChange={e => setConfig(prev => ({ ...prev, token_producao: e.target.value }))}
                placeholder="Cole o token de producao"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Ambiente ativo</label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="ambiente"
                  value="homologacao"
                  checked={config.ambiente === 'homologacao'}
                  onChange={() => setConfig(prev => ({ ...prev, ambiente: 'homologacao' }))}
                  className="text-blue-600"
                />
                Homologacao (testes)
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="ambiente"
                  value="producao"
                  checked={config.ambiente === 'producao'}
                  onChange={() => setConfig(prev => ({ ...prev, ambiente: 'producao' }))}
                  className="text-blue-600"
                />
                Producao (notas reais)
              </label>
            </div>
          </div>
        </div>

        {/* Salvar */}
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: '#1E3A8A' }}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            Salvar configuracoes
          </button>
        </div>
      </div>
    </AppLayout>
  )
}
