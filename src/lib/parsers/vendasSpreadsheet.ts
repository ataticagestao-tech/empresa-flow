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
  // Diagnostico: exibe o valor cru lido da planilha pra usuario
  // identificar discrepancia (ex.: Excel BR convertendo "32.00" em 3200).
  raw_valor_unitario: string
  raw_data_venda: string
}

export interface ParseResult {
  rows: VendaImportRow[]
  totalErros: number
}

export interface ParseOptions {
  /** Divisor aplicado ao valor_unitario apos parsing.
   *  Use 100 quando o Excel BR converteu "32.00" em 3200 (auto-deteccao
   *  de "ponto = milhar" durante digitacao). Default: 1. */
  valueDivisor?: number
}

/* ================================================================
   CONSTANTS
   ================================================================ */

const FORMAS_VALIDAS = ['pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'boleto', 'parcelado']
const TIPOS_VALIDOS = ['servico', 'produto', 'pacote', 'contrato']

const COMBINING_MARKS = /[̀-ͯ]/g

// Map common column names to internal keys. Match EXATO tem prioridade
// sobre alias na funcao de mapeamento (ver buildColumnMapping abaixo).
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

// Conjunto de chaves "canonicas" (cliente_nome, valor_unitario, etc).
// Match exato com uma dessas tem prioridade sobre qualquer alias.
const CANONICAL_KEYS = new Set([
  'cliente_nome', 'cliente_cpf_cnpj', 'tipo', 'descricao', 'quantidade',
  'valor_unitario', 'desconto', 'data_venda', 'forma_pagamento', 'parcelas', 'observacoes',
])

/* ================================================================
   HELPERS
   ================================================================ */

function normalizeColumnName(name: string): string {
  return name
    .toString()
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
}

function buildColumnMapping(sampleKeys: string[]): Record<string, string> {
  const mapping: Record<string, string> = {}
  // Pass 1: match exato com chave canonica (case-insensitive, sem acentos).
  // Garante que se a planilha tem AMBOS "valor" e "valor_unitario",
  // o canonico vence em vez do alias 'valor' que tambem mapeia pra 'valor_unitario'.
  const matchedFields = new Set<string>()
  for (const key of sampleKeys) {
    const normalized = normalizeColumnName(key)
    if (CANONICAL_KEYS.has(normalized)) {
      mapping[key] = normalized
      matchedFields.add(normalized)
    }
  }
  // Pass 2: aliases. Pula campos ja preenchidos.
  for (const key of sampleKeys) {
    if (mapping[key]) continue
    const normalized = normalizeColumnName(key)
    const mapped = COLUMN_MAP[key.toLowerCase().trim()] || COLUMN_MAP[normalized]
    if (mapped && !matchedFields.has(mapped)) {
      mapping[key] = mapped
      matchedFields.add(mapped)
    }
  }
  return mapping
}

/** Formata data manualmente a partir de serial Excel (epoch 1899-12-30,
 *  pulando o bug do leap year 1900). Evita interferencia de timezone. */
function serialToISO(serial: number): string | null {
  if (!isFinite(serial) || serial < 1 || serial > 200000) return null
  const epoch = Date.UTC(1899, 11, 30)
  const ms = epoch + Math.floor(serial) * 86400000
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() + 1
  const day = d.getUTCDate()
  if (y < 1900 || y > 2100) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function isValidYMD(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false
  if (y < 1900 || y > 2100) return false
  if (m < 1 || m > 12) return false
  if (d < 1 || d > 31) return false
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return d <= daysInMonth
}

function parseDate(value: any): string | null {
  if (value === null || value === undefined || value === '') return null

  // Date object (XLSX com cellDates: true). Usa componentes UTC pra evitar
  // shift de timezone (Brasil UTC-3 pode mover 00:00 UTC pra dia anterior).
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null
    const y = value.getUTCFullYear()
    const m = value.getUTCMonth() + 1
    const d = value.getUTCDate()
    if (!isValidYMD(y, m, d)) return null
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  // Excel serial date number
  if (typeof value === 'number') {
    if (value < 1 || value > 200000) return null
    return serialToISO(value)
  }

  let str = String(value).trim()
  if (!str) return null

  // ISO com hora: "2026-01-02T00:00:00..." -> pega so a data
  const isoTimeMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoTimeMatch) {
    const y = parseInt(isoTimeMatch[1], 10)
    const m = parseInt(isoTimeMatch[2], 10)
    const d = parseInt(isoTimeMatch[3], 10)
    if (isValidYMD(y, m, d)) return `${isoTimeMatch[1]}-${isoTimeMatch[2]}-${isoTimeMatch[3]}`
    return null
  }

  // DD/MM/YYYY ou DD-MM-YYYY ou DD.MM.YYYY (BR - sempre primeiro grupo eh dia)
  const brMatch = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/)
  if (brMatch) {
    const [, d, m, y] = brMatch
    let yy = parseInt(y, 10)
    const dd = parseInt(d, 10)
    const mm = parseInt(m, 10)
    if (yy < 100) yy = yy < 80 ? 2000 + yy : 1900 + yy
    if (dd > 12 && mm > 12) return null
    let finalY = yy
    let finalM = mm
    let finalD = dd
    if (mm > 12 && dd <= 12) {
      // Provavel MM/DD/YYYY (usuario importou de sistema US)
      finalM = dd
      finalD = mm
    }
    if (!isValidYMD(finalY, finalM, finalD)) return null
    return `${finalY}-${String(finalM).padStart(2, '0')}-${String(finalD).padStart(2, '0')}`
  }

  return null
}

function parseNumber(value: any): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return isFinite(value) ? value : null
  let str = String(value).trim().replace(/R\$\s*/gi, '').replace(/\s+/g, '').trim()
  if (!str) return null

  const negative = str.startsWith('-')
  if (negative) str = str.slice(1)
  if (str.startsWith('+')) str = str.slice(1)

  const lastComma = str.lastIndexOf(',')
  const lastDot = str.lastIndexOf('.')

  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      // BR "1.234,56" -> ponto eh milhar, virgula eh decimal
      str = str.replace(/\./g, '').replace(',', '.')
    } else {
      // US "1,234.56" -> virgula eh milhar, ponto eh decimal
      str = str.replace(/,/g, '')
    }
  } else if (lastComma >= 0) {
    // Soh virgula -> decimal BR. Remove dots (caso "1.500,00" sem decimal)
    str = str.replace(/\./g, '').replace(',', '.')
  } else if (lastDot >= 0) {
    // Soh ponto: ambiguo.
    // - 1-2 digitos depois -> decimal ("32.00", "1.5")
    // - 3 digitos depois -> milhar BR ("3.200")
    // - multiplos pontos -> milhar BR ("1.234.567")
    const segs = str.split('.')
    const lastSeg = segs[segs.length - 1]
    if (segs.length > 2) {
      str = str.replace(/\./g, '')
    } else if (lastSeg.length === 3) {
      str = str.replace(/\./g, '')
    }
  }

  const num = parseFloat(str)
  if (!isFinite(num)) return null
  return negative ? -num : num
}

function normalizeFormaPagamento(value: string): string {
  const v = value.toLowerCase().trim()
    .normalize('NFD').replace(COMBINING_MARKS, '')

  if (v.includes('pix') || v.includes('ted')) return 'pix'
  if (v.includes('dinheiro') || v.includes('especie')) return 'dinheiro'
  if (v.includes('credito') && v.includes('cartao')) return 'cartao_credito'
  if (v.includes('debito') && v.includes('cartao')) return 'cartao_debito'
  if (v.includes('credito')) return 'cartao_credito'
  if (v.includes('debito')) return 'cartao_debito'
  if (v.includes('boleto')) return 'boleto'
  if (v.includes('parcel')) return 'parcelado'

  if (FORMAS_VALIDAS.includes(v)) return v

  return v
}

function normalizeTipo(value: string): string {
  const v = value.toLowerCase().trim()
    .normalize('NFD').replace(COMBINING_MARKS, '')

  if (v.includes('servico')) return 'servico'
  if (v.includes('produto')) return 'produto'
  if (v.includes('pacote')) return 'pacote'
  if (v.includes('contrato')) return 'contrato'

  if (TIPOS_VALIDOS.includes(v)) return v
  return 'servico'
}

/** Converte qualquer valor cru a representacao de string para exibir no preview.
 *  Date object -> ISO; numero -> toString; string -> trim. */
function rawToString(value: any): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return String(value)
    return value.toISOString().slice(0, 10)
  }
  return String(value).trim()
}

/* ================================================================
   MAIN PARSER
   ================================================================ */

export async function parseVendasSpreadsheet(file: File, opts: ParseOptions = {}): Promise<ParseResult> {
  const valueDivisor = opts.valueDivisor && opts.valueDivisor > 0 ? opts.valueDivisor : 1

  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false })

  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error('Planilha vazia — nenhuma aba encontrada.')

  const sheet = workbook.Sheets[sheetName]
  const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true })

  if (rawRows.length === 0) throw new Error('Planilha vazia — nenhuma linha de dados encontrada.')

  // Junta as chaves de TODAS as primeiras linhas pra cobrir o caso onde a linha 1
  // tem celulas vazias que sheet_to_json omite. Usa as 5 primeiras linhas como amostra.
  const sample = rawRows.slice(0, 5)
  const sampleKeysSet = new Set<string>()
  for (const r of sample) for (const k of Object.keys(r)) sampleKeysSet.add(k)
  const sampleKeys = Array.from(sampleKeysSet)
  const columnMapping = buildColumnMapping(sampleKeys)

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

    const getValue = (field: string): any => {
      for (const [origKey, mappedKey] of Object.entries(columnMapping)) {
        if (mappedKey === field) {
          const v = raw[origKey]
          if (v !== undefined && v !== '') return v
        }
      }
      // Fallback: retorna o primeiro encontrado (mesmo vazio) pra manter o raw display
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
    const rawValorUnit = getValue('valor_unitario')
    const rawDataVenda = getValue('data_venda')
    const valorUnitarioParsed = parseNumber(rawValorUnit)
    const valorUnitario = valorUnitarioParsed !== null ? valorUnitarioParsed / valueDivisor : null
    const desconto = parseNumber(getValue('desconto')) || 0
    const dataVenda = parseDate(rawDataVenda)
    const formaPagRaw = String(getValue('forma_pagamento') || '').trim()
    const formaPagamento = normalizeFormaPagamento(formaPagRaw)
    const parcelas = parseNumber(getValue('parcelas')) || (formaPagamento === 'parcelado' ? 2 : 1)
    const observacoes = getValue('observacoes') ? String(getValue('observacoes')).trim() : null

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
      linha: i + 2,
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
      raw_valor_unitario: rawToString(rawValorUnit),
      raw_data_venda: rawToString(rawDataVenda),
    })
  }

  return { rows, totalErros }
}
