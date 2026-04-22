import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { format } from 'date-fns'
import {
  Upload, FileText, Loader2, Search, RefreshCw,
  Check, AlertTriangle, X, Download, Trash2
} from 'lucide-react'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { formatBRL, formatData, formatDoc } from '@/lib/format'
import { AppLayout } from '@/components/layout/AppLayout'
import { toast } from 'sonner'

// ─── Types ──────────────────────────────────────────────────────────
interface ImportacaoXML {
  id: string
  empresa_id: string
  chave_acesso: string | null
  tipo_nf: string | null
  cnpj_emitente: string | null
  nome_emitente: string | null
  cnpj_destinatario: string | null
  valor_total: number | null
  data_emissao: string | null
  itens: any[] | null
  valor_iss: number | null
  valor_icms: number | null
  valor_ipi: number | null
  xml_url: string | null
  xml_storage_path: string | null
  status: string | null
  erro_descricao: string | null
  conta_pagar_id: string | null
  entrada_estoque_id: string | null
  fornecedor_id: string | null
  created_at: string | null
}

// ─── Status config ──────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  processado: { label: 'Processado', color: '#059669', bg: '#ECFDF3' },
  erro: { label: 'Erro', color: '#D92D20', bg: '#FEF3F2' },
  duplicado: { label: 'Duplicado', color: '#F79009', bg: '#FFFAEB' },
  pendente: { label: 'Pendente', color: '#667085', bg: '#F3F4F6' },
}

// ─── XML Parser (browser) ───────────────────────────────────────────
function parsearXMLNFe(xmlString: string) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlString, 'text/xml')

  const parseError = doc.querySelector('parsererror')
  if (parseError) throw new Error('XML invalido ou malformado')

  // Namespace-agnostic query helper
  const getText = (parent: Element | Document, tagName: string): string => {
    const el = parent.getElementsByTagName(tagName)[0]
    return el?.textContent?.trim() || ''
  }

  // Chave de acesso
  const infNFe = doc.getElementsByTagName('infNFe')[0]
  const chaveAcesso = infNFe?.getAttribute('Id')?.replace('NFe', '') || ''

  // Emitente
  const emit = doc.getElementsByTagName('emit')[0]
  const cnpjEmitente = emit ? getText(emit, 'CNPJ') : ''
  const nomeEmitente = emit ? getText(emit, 'xNome') : ''

  // Destinatario
  const dest = doc.getElementsByTagName('dest')[0]
  const cnpjDestinatario = dest ? getText(dest, 'CNPJ') : ''

  // Totais
  const icmsTot = doc.getElementsByTagName('ICMSTot')[0]
  const valorTotal = icmsTot ? parseFloat(getText(icmsTot, 'vNF')) || 0 : 0
  const valorICMS = icmsTot ? parseFloat(getText(icmsTot, 'vICMS')) || 0 : 0
  const valorIPI = icmsTot ? parseFloat(getText(icmsTot, 'vIPI')) || 0 : 0

  // Data emissao
  const ide = doc.getElementsByTagName('ide')[0]
  const dhEmi = ide ? getText(ide, 'dhEmi') : ''
  const dataEmissao = dhEmi ? dhEmi.slice(0, 10) : format(new Date(), 'yyyy-MM-dd')

  // Itens
  const itens: any[] = []
  const dets = doc.getElementsByTagName('det')
  for (let i = 0; i < dets.length; i++) {
    const prod = dets[i].getElementsByTagName('prod')[0]
    if (prod) {
      itens.push({
        descricao: getText(prod, 'xProd'),
        ncm: getText(prod, 'NCM'),
        quantidade: getText(prod, 'qCom'),
        valor_unitario: getText(prod, 'vUnCom'),
        valor_total: getText(prod, 'vProd'),
      })
    }
  }

  return {
    chave_acesso: chaveAcesso,
    cnpj_emitente: cnpjEmitente,
    nome_emitente: nomeEmitente,
    cnpj_destinatario: cnpjDestinatario,
    valor_total: valorTotal,
    valor_icms: valorICMS,
    valor_ipi: valorIPI,
    data_emissao: dataEmissao,
    itens,
  }
}

// ─── Component ──────────────────────────────────────────────────────
export default function ImportacaoXML() {
  const { selectedCompany } = useCompany()
  const { activeClient } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [importacoes, setImportacoes] = useState<ImportacaoXML[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [isDragging, setIsDragging] = useState(false)

  // Detail modal
  const [selectedImportacao, setSelectedImportacao] = useState<ImportacaoXML | null>(null)

  // ─── Data Loading ───────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!selectedCompany) return
    setLoading(true)
    const db = activeClient as any

    const { data } = await db.from('importacao_xml')
      .select('*')
      .eq('empresa_id', selectedCompany.id)
      .order('created_at', { ascending: false })
      .limit(100)

    setImportacoes(data || [])
    setLoading(false)
  }, [selectedCompany, activeClient])

  useEffect(() => { loadData() }, [loadData])

  // ─── Filtered ─────────────────────────────────────────────────────
  const filteredImportacoes = useMemo(() => {
    if (!searchTerm.trim()) return importacoes
    const term = searchTerm.toLowerCase()
    return importacoes.filter(imp =>
      imp.nome_emitente?.toLowerCase().includes(term) ||
      imp.cnpj_emitente?.includes(term) ||
      imp.chave_acesso?.includes(term)
    )
  }, [importacoes, searchTerm])

  // ─── KPIs ─────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const processados = importacoes.filter(i => i.status === 'processado')
    const totalValor = processados.reduce((s, i) => s + (i.valor_total || 0), 0)
    const erros = importacoes.filter(i => i.status === 'erro').length
    return { total: importacoes.length, processados: processados.length, totalValor, erros }
  }, [importacoes])

  // ─── Importar XML ─────────────────────────────────────────────────
  const processarArquivo = async (file: File) => {
    if (!selectedCompany) return
    if (!file.name.toLowerCase().endsWith('.xml')) {
      toast.error('Arquivo deve ser .xml')
      return
    }

    setUploading(true)
    const db = activeClient as any

    try {
      const xmlString = await file.text()

      // Validar que e NF-e
      if (!xmlString.includes('<nfeProc') && !xmlString.includes('<NFe') && !xmlString.includes('<infNFe')) {
        toast.error('Arquivo XML nao parece ser uma NF-e valida')
        setUploading(false)
        return
      }

      // Parsear
      const dados = parsearXMLNFe(xmlString)

      // Verificar duplicata
      if (dados.chave_acesso) {
        const { data: existing } = await db.from('importacao_xml')
          .select('id')
          .eq('empresa_id', selectedCompany.id)
          .eq('chave_acesso', dados.chave_acesso)
          .maybeSingle()

        if (existing) {
          toast.error('Este XML ja foi importado anteriormente (chave duplicada)')
          setUploading(false)
          return
        }
      }

      // Salvar XML no Storage
      let storagePath: string | null = null
      const fileName = dados.chave_acesso || `xml_${Date.now()}`
      const path = `${selectedCompany.id}/xmls/${fileName}.xml`

      try {
        const blob = new Blob([xmlString], { type: 'text/xml' })
        await (activeClient as any).storage.from('documentos').upload(path, blob, { upsert: true })
        storagePath = path
      } catch (storageErr) {
        console.warn('Storage upload falhou (continuando sem storage):', storageErr)
      }

      // Buscar/criar fornecedor pelo CNPJ
      let fornecedorId: string | null = null
      if (dados.cnpj_emitente) {
        const { data: fornecedor } = await db.from('suppliers')
          .select('id')
          .eq('company_id', selectedCompany.id)
          .eq('cpf_cnpj', dados.cnpj_emitente)
          .maybeSingle()

        if (fornecedor) {
          fornecedorId = fornecedor.id
        } else {
          // Criar fornecedor basico
          const { data: novoForn } = await db.from('suppliers').insert({
            company_id: selectedCompany.id,
            razao_social: dados.nome_emitente || `Fornecedor ${dados.cnpj_emitente}`,
            cpf_cnpj: dados.cnpj_emitente,
          }).select('id').single()
          fornecedorId = novoForn?.id || null
        }
      }

      // INSERT importacao_xml
      const { data: importacao, error } = await db.from('importacao_xml').insert({
        empresa_id: selectedCompany.id,
        chave_acesso: dados.chave_acesso || null,
        cnpj_emitente: dados.cnpj_emitente,
        nome_emitente: dados.nome_emitente,
        cnpj_destinatario: dados.cnpj_destinatario,
        valor_total: dados.valor_total,
        data_emissao: dados.data_emissao,
        itens: dados.itens,
        valor_icms: dados.valor_icms,
        valor_ipi: dados.valor_ipi,
        xml_storage_path: storagePath,
        status: 'processado',
        fornecedor_id: fornecedorId,
      }).select().single()

      if (error) throw error

      // Gerar CP automaticamente
      if (importacao && dados.valor_total > 0) {
        await db.from('contas_pagar').insert({
          company_id: selectedCompany.id,
          credor_nome: dados.nome_emitente || 'Fornecedor (XML)',
          descricao: `NF-e ${dados.chave_acesso ? dados.chave_acesso.slice(-8) : ''} - ${dados.nome_emitente}`,
          valor: dados.valor_total,
          data_vencimento: dados.data_emissao,
          status: 'aberto',
        }).then(async (cpRes: any) => {
          if (cpRes.data?.[0]?.id) {
            await db.from('importacao_xml')
              .update({ conta_pagar_id: cpRes.data[0].id })
              .eq('id', importacao.id)
          }
        })
      }

      toast.success(`XML importado: ${dados.nome_emitente} — ${formatBRL(dados.valor_total)}`)
      loadData()
    } catch (err: any) {
      console.error('Erro ao importar XML:', err)
      toast.error(err.message || 'Erro ao processar XML')
    } finally {
      setUploading(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      processarArquivo(files[0])
    }
    e.target.value = ''
  }

  // Drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }
  const handleDragLeave = () => setIsDragging(false)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      processarArquivo(files[0])
    }
  }

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <AppLayout title="Importacao de XML">
      <div className="p-6 space-y-6">

        {/* ── KPIs ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total importados', value: kpis.total, icon: FileText, color: '#1E3A8A' },
            { label: 'Processados', value: kpis.processados, icon: Check, color: '#059669' },
            { label: 'Valor total', value: formatBRL(kpis.totalValor), icon: FileText, color: '#1E3A8A' },
            { label: 'Erros', value: kpis.erros, icon: AlertTriangle, color: '#D92D20' },
          ].map((kpi, i) => (
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

        {/* ── Upload area ── */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            isDragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-white'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xml"
            onChange={handleFileChange}
            className="hidden"
          />
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 size={32} className="animate-spin text-gray-400" />
              <p className="text-sm text-gray-500">Processando XML...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload size={32} className="text-gray-400" />
              <p className="text-sm font-medium text-gray-600">
                Arraste o arquivo XML aqui ou clique para selecionar
              </p>
              <p className="text-xs text-gray-400">Aceita arquivos .xml de NF-e</p>
            </div>
          )}
        </div>

        {/* ── Toolbar ── */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar por emitente, CNPJ, chave..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <button onClick={loadData} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
            <RefreshCw size={16} className="text-gray-500" />
          </button>
        </div>

        {/* ── Table ── */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="animate-spin text-gray-400" size={24} />
            </div>
          ) : filteredImportacoes.length === 0 ? (
            <div className="text-center py-20 text-gray-400 text-sm">
              Nenhum XML importado
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase">
                    <th className="px-4 py-3">Chave de acesso</th>
                    <th className="px-4 py-3">Emitente</th>
                    <th className="px-4 py-3 text-right">Valor</th>
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredImportacoes.map(imp => {
                    const st = STATUS_CONFIG[imp.status || 'pendente'] || STATUS_CONFIG.pendente
                    return (
                      <tr
                        key={imp.id}
                        className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer"
                        onClick={() => setSelectedImportacao(imp)}
                      >
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">
                          {imp.chave_acesso
                            ? `${imp.chave_acesso.slice(0, 10)}...${imp.chave_acesso.slice(-6)}`
                            : '—'
                          }
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-700">{imp.nome_emitente || '—'}</div>
                          <div className="text-xs text-gray-400">{formatDoc(imp.cnpj_emitente)}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-medium">{formatBRL(imp.valor_total)}</td>
                        <td className="px-4 py-3 text-gray-500">{formatData(imp.data_emissao)}</td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{ color: st.color, backgroundColor: st.bg }}
                          >
                            {imp.status === 'processado' && <Check size={12} />}
                            {imp.status === 'erro' && <AlertTriangle size={12} />}
                            {st.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          MODAL: Detalhe da importacao
         ═══════════════════════════════════════════════════════════════ */}
      {selectedImportacao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-800">Detalhes da importacao</h2>
              <button onClick={() => setSelectedImportacao(null)} className="p-1 rounded hover:bg-gray-100">
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-sm">
              <div className="space-y-2">
                <div className="flex justify-between py-1 border-b border-gray-50">
                  <span className="text-gray-500">Emitente:</span>
                  <span className="font-medium">{selectedImportacao.nome_emitente || '—'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-50">
                  <span className="text-gray-500">CNPJ emitente:</span>
                  <span>{formatDoc(selectedImportacao.cnpj_emitente)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-50">
                  <span className="text-gray-500">Valor total:</span>
                  <span className="font-medium">{formatBRL(selectedImportacao.valor_total)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-50">
                  <span className="text-gray-500">Data emissao:</span>
                  <span>{formatData(selectedImportacao.data_emissao)}</span>
                </div>
                {selectedImportacao.valor_icms != null && selectedImportacao.valor_icms > 0 && (
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <span className="text-gray-500">ICMS:</span>
                    <span>{formatBRL(selectedImportacao.valor_icms)}</span>
                  </div>
                )}
                {selectedImportacao.valor_ipi != null && selectedImportacao.valor_ipi > 0 && (
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <span className="text-gray-500">IPI:</span>
                    <span>{formatBRL(selectedImportacao.valor_ipi)}</span>
                  </div>
                )}
                <div className="flex justify-between py-1 border-b border-gray-50">
                  <span className="text-gray-500">Chave de acesso:</span>
                  <span className="font-mono text-xs break-all">{selectedImportacao.chave_acesso || '—'}</span>
                </div>
              </div>

              {/* Itens */}
              {selectedImportacao.itens && selectedImportacao.itens.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Itens ({selectedImportacao.itens.length})</h4>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {selectedImportacao.itens.map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between text-xs p-2 bg-gray-50 rounded">
                        <span className="text-gray-600 truncate flex-1">{item.descricao}</span>
                        <span className="text-gray-500 ml-2 flex-shrink-0">
                          {item.quantidade} x {formatBRL(parseFloat(item.valor_unitario) || 0)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedImportacao.erro_descricao && (
                <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg">
                  <AlertTriangle size={16} className="text-red-500 mt-0.5" />
                  <p className="text-xs text-red-700">{selectedImportacao.erro_descricao}</p>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end px-6 py-4 border-t border-gray-100">
              <button
                onClick={() => setSelectedImportacao(null)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
