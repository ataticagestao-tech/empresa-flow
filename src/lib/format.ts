export const formatBRL = (valor: number | null | undefined): string => {
  const v = Number(valor)
  if (isNaN(v)) return 'R$ 0,00'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export const formatCPF = (v: string) =>
  v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')

export const formatCNPJ = (v: string) =>
  v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')

export const formatData = (data: string | null | undefined): string => {
  if (!data) return '\u2014'
  try {
    const parte = data.split('T')[0]
    const [ano, mes, dia] = parte.split('-')
    if (!ano || !mes || !dia) return '\u2014'
    return `${dia}/${mes}/${ano}`
  } catch {
    return '\u2014'
  }
}

export const formatPercentual = (value: number) =>
  `${value.toFixed(1)}%`

export const toTitleCase = (str: string | null | undefined): string => {
  if (!str || str.trim() === '') return ''

  const excecoes = new Set([
    'de', 'da', 'do', 'das', 'dos',
    'e', 'ou',
    'a', 'o', 'as', 'os',
    'em', 'no', 'na', 'nos', 'nas',
    'por', 'para', 'com', 'sem', 'sob',
    'ltda', 'me', 'eireli', 'sa',
  ])

  return str
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(p => p.length > 0)
    .map((palavra, index) => {
      if (index === 0) {
        return palavra.charAt(0).toUpperCase() + palavra.slice(1)
      }
      if (excecoes.has(palavra)) return palavra
      return palavra.charAt(0).toUpperCase() + palavra.slice(1)
    })
    .join(' ')
}

export const getIniciais = (nome: string | null | undefined): string => {
  if (!nome || nome.trim() === '') return '?'
  const palavras = nome.trim().split(/\s+/).filter(p => p.length > 0)
  if (palavras.length === 0) return '?'
  if (palavras.length === 1) return palavras[0].charAt(0).toUpperCase()
  return (
    palavras[0].charAt(0).toUpperCase() +
    palavras[palavras.length - 1].charAt(0).toUpperCase()
  )
}

export const formatDoc = (doc: string | null | undefined): string => {
  if (!doc) return '\u2014'
  const limpo = doc.replace(/\D/g, '')
  if (limpo.length === 0 || /^0+$/.test(limpo)) return '\u2014'
  if (limpo.length === 11) {
    return limpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  }
  if (limpo.length === 14) {
    return limpo.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  }
  return doc
}
