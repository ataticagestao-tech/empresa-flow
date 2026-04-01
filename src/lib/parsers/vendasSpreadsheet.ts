import * as XLSX from 'xlsx'

/* ================================================================
   TYPES
   ================================================================ */

export interface VendaImportRow {
  linha: number
  cliente_nome: string
  cliente_cpf_cnpj: string | null
  tipo: string
  descricao: string
  quantidade: number
  valor_unitario: number
  valor_total: number
  desconto: number
  data_venda: string          // yyyy-MM-dd
  forma_pagamento: string
  parcelas: number
  observacoes: string | null
  erros: string[]
}

export interface ParseResult {
  rows: VendaImportRow[]
  totalErros: number
}

/* ================================================================
   CONSTANTS
   ================================================================ */

const FORMAS_VALIDAS = ['pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'boleto', 'parcelado']
const TIPOS_VALIDOS = ['servico', 'produto', 'pacote', 'contrato']

// Map common column names to internal keys
const COLUMN_MAP: Record<string, string> = {
  // cliente_nome
  'cliente_nome': 'cliente_nome',
  'cliente': 'cliente_nome',
  'nome_cliente': 'cliente_nome',
  'nome do cliente': 'cliente_nome',
  'nome': 'cliente_nome',

  // cliente_cpf_cnpj
  'cliente_cpf_cnpj': 'cliente_cpf_cnpj',
  'cpf_cnpj': 'cliente_cpf_cnpj',
  'cpf/cnpj': 'cliente_cpf_cnpj',
  'cpf': 'cliente_cpf_cnpj',
  'cnpj': 'cliente_cpf_cnpj',
  'documento': 'cliente_cpf_cnpj',

  // tipo
  'tipo': 'tipo',
  'tipo_venda': 'tipo',
  'tipo de venda': 'tipo',

  // descricao
  'descricao': 'descricao',
  'descrição': 'descricao',
  'descricao_item': 'descricao',
  'item': 'descricao',
  'produto': 'descricao',
  'servico': 'descricao',
  'serviço': 'descricao',
  'produto/servico': 'descricao',
  'produto/serviço': 'descricao',

  // quantidade
  'quantidade': 'quantidade',
  'qtd': 'quantidade',
  'qtde': 'quantidade',
  'qty': 'quantidade',

  // valor_unitario
  'valor_unitario': 'valor_unitario',
  'valor unitario': 'valor_unitario',
  'valor unitário': 'valor_unitario',
  'preco': 'valor_unitario',
  'preço': 'valor_unitario',
  'preco_unitario': 'valor_unitario',
  'preço unitário': 'valor_unitario',
  'valor': 'valor_unitario',

  // desconto
  'desconto': 'desconto',
  'desc': 'desconto',
  'desconto_valor': 'desconto',

  // data_venda
  'data_venda': 'data_venda',
  'data': 'data_venda',
  'data da venda': 'data_venda',
  'data venda': 'data_venda',
  'dt_venda': 'data_venda',

  // forma_pagamento
  'forma_pagamento': 'forma_pagamento',
  'forma_pag': 'forma_pagamento',
  'forma de pagamento': 'forma_pagamento',
  'pagamento': 'forma_pagamento',
  'forma pagamento': 'forma_pagamento',

  // parcelas
  'parcelas': 'parcelas',
  'num_parcelas': 'parcelas',
  'qtd_parcelas': 'parcelas',
  'nº parcelas': 'parcelas',

  // observacoes
  'observacoes': 'observacoes',
  'observações': 'observacoes',
  'obs': 'observacoes',
  'observacao': 'observacoes',
  'observação': 'observacoes',
}

/* ================================================================
   HELPERS
   ================================================================ */

function normalizeColumnName(name: string): string {
  return name
    .toString()
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // remove accents for matching
}

function parseDate(value: any): string | null {
  if (!value) return null

  // Excel serial date number
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value)
    if (date) {
      const y = date.y
      const m = String(date.m).padStart(2, '0')
      const d = String(date.d).padStart(2, '0')
      return `${y}-${m}-${d}`
    }
  }

  const str = String(value).trim()

  // DD/MM/YYYY or DD-MM-YYYY
  const brMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (brMatch) {
    const [, d, m, y] = brMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) return isoMatch[0]

  return null
}

function parseNumber(value: any): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return value
  const str = String(value).trim()
    .replace(/R\$\s*/gi, '')
    .replace(/\./g, '')     // remove thousand separator
    .replace(',', '.')       // decimal comma to dot
    .trim()
  const num = parseFloat(str)
  return isNaN(num) ? null : num
}

function normalizeFormaPagamento(value: string): string {
  const v = value.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  if (v.includes('pix') || v.includes('ted')) return 'pix'
  if (v.includes('dinheiro') || v.includes('especie')) return 'dinheiro'
  if (v.includes('credito') && v.includes('cartao')) return 'cartao_credito'
  if (v.includes('debito') && v.includes('cartao')) return 'cartao_debito'
  if (v.includes('credito')) return 'cartao_credito'
  if (v.includes('debito')) return 'cartao_debito'
  if (v.includes('boleto')) return 'boleto'
  if (v.includes('parcel')) return 'parcelado'

  // Direct match
  if (FORMAS_VALIDAS.includes(v)) return v

  return v
}

function normalizeTipo(value: string): string {
  const v = value.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  if (v.includes('servico') || v.includes('serviço')) return 'servico'
  if (v.includes('produto')) return 'produto'
  if (v.includes('pacote')) return 'pacote'
  if (v.includes('contrato')) return 'contrato'

  if (TIPOS_VALIDOS.includes(v)) return v
  return 'servico' // default
}

/* ================================================================
   MAIN PARSER
   ================================================================ */

export async function parseVendasSpreadsheet(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false })

  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error('Planilha vazia — nenhuma aba encontrada.')

  const sheet = workbook.Sheets[sheetName]
  const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' })

  if (rawRows.length === 0) throw new Error('Planilha vazia — nenhuma linha de dados encontrada.')

  // Map columns
  const sampleKeys = Object.keys(rawRows[0])
  const columnMapping: Record<string, string> = {}

  for (const key of sampleKeys) {
    const normalized = normalizeColumnName(key)
    // Try exact match first, then normalized (accent-stripped) match
    const mapped = COLUMN_MAP[key.toLowerCase().trim()] || COLUMN_MAP[normalized]
    if (mapped) {
      columnMapping[key] = mapped
    }
  }

  // Check required columns
  const mappedFields = new Set(Object.values(columnMapping))
  const required = ['cliente_nome', 'descricao', 'quantidade', 'valor_unitario', 'data_venda', 'forma_pagamento']
  const missing = required.filter(f => !mappedFields.has(f))

  if (missing.length > 0) {
    const labels: Record<string, string> = {
      cliente_nome: 'Cliente (cliente_nome)',
      descricao: 'Descrição (descricao)',
      quantidade: 'Quantidade (quantidade)',
      valor_unitario: 'Valor Unitário (valor_unitario)',
      data_venda: 'Data da Venda (data_venda)',
      forma_pagamento: 'Forma de Pagamento (forma_pagamento)',
    }
    throw new Error(
      `Colunas obrigatórias não encontradas: ${missing.map(f => labels[f] || f).join(', ')}.\n\n` +
      `Colunas encontradas na planilha: ${sampleKeys.join(', ')}`
    )
  }

  // Parse rows
  const rows: VendaImportRow[] = []
  let totalErros = 0

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i]
    const erros: string[] = []

    // Extract mapped values
    const getValue = (field: string): any => {
      for (const [origKey, mappedKey] of Object.entries(columnMapping)) {
        if (mappedKey === field) return raw[origKey]
      }
      return null
    }

    const clienteNome = String(getValue('cliente_nome') || '').trim()
    const clienteCpfCnpj = getValue('cliente_cpf_cnpj')
      ? String(getValue('cliente_cpf_cnpj')).replace(/\D/g, '') || null
      : null
    const tipo = normalizeTipo(String(getValue('tipo') || 'servico'))
    const descricao = String(getValue('descricao') || '').trim()
    const quantidade = parseNumber(getValue('quantidade'))
    const valorUnitario = parseNumber(getValue('valor_unitario'))
    const desconto = parseNumber(getValue('desconto')) || 0
    const dataVenda = parseDate(getValue('data_venda'))
    const formaPagRaw = String(getValue('forma_pagamento') || '').trim()
    const formaPagamento = normalizeFormaPagamento(formaPagRaw)
    const parcelas = parseNumber(getValue('parcelas')) || (formaPagamento === 'parcelado' ? 2 : 1)
    const observacoes = getValue('observacoes') ? String(getValue('observacoes')).trim() : null

    // Validations
    if (!clienteNome) erros.push('Cliente vazio')
    if (!descricao) erros.push('Descrição vazia')
    if (quantidade === null || quantidade <= 0) erros.push('Quantidade inválida')
    if (valorUnitario === null || valorUnitario <= 0) erros.push('Valor unitário inválido')
    if (!dataVenda) erros.push('Data inválida')
    if (!FORMAS_VALIDAS.includes(formaPagamento)) erros.push(`Forma de pagamento "${formaPagRaw}" não reconhecida`)

    if (erros.length > 0) totalErros++

    const qty = quantidade || 0
    const vUnit = valorUnitario || 0

    rows.push({
      linha: i + 2, // +2 because row 1 is header, data starts at 2
      cliente_nome: clienteNome,
      cliente_cpf_cnpj: clienteCpfCnpj,
      tipo,
      descricao,
      quantidade: qty,
      valor_unitario: vUnit,
      valor_total: Math.round(qty * vUnit * 100) / 100,
      desconto,
      data_venda: dataVenda || '',
      forma_pagamento: formaPagamento,
      parcelas: Math.max(1, Math.round(parcelas)),
      observacoes,
      erros,
    })
  }

  return { rows, totalErros }
}
