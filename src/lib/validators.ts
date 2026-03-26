export const validarCPF = (cpf: string): boolean => {
  const limpo = cpf.replace(/\D/g, '')
  if (limpo.length === 0) return true
  if (limpo.length !== 11) return false
  if (/^(\d)\1{10}$/.test(limpo)) return false

  let soma = 0
  for (let i = 0; i < 9; i++) {
    soma += parseInt(limpo.charAt(i)) * (10 - i)
  }
  let resto = (soma * 10) % 11
  if (resto === 10 || resto === 11) resto = 0
  if (resto !== parseInt(limpo.charAt(9))) return false

  soma = 0
  for (let i = 0; i < 10; i++) {
    soma += parseInt(limpo.charAt(i)) * (11 - i)
  }
  resto = (soma * 10) % 11
  if (resto === 10 || resto === 11) resto = 0
  return resto === parseInt(limpo.charAt(10))
}

export const validarCNPJ = (cnpj: string): boolean => {
  const limpo = cnpj.replace(/\D/g, '')
  if (limpo.length === 0) return true
  if (limpo.length !== 14) return false
  if (/^(\d)\1{13}$/.test(limpo)) return false

  const calcDigito = (base: string, pesos: number[]): number => {
    const soma = base
      .split('')
      .reduce((acc, d, i) => acc + parseInt(d) * pesos[i], 0)
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }

  const d1 = calcDigito(limpo.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  if (d1 !== parseInt(limpo.charAt(12))) return false

  const d2 = calcDigito(limpo.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return d2 === parseInt(limpo.charAt(13))
}

export const validarDocumento = (doc: string | null | undefined): boolean => {
  if (!doc) return true
  const limpo = doc.replace(/\D/g, '')
  if (limpo.length === 0) return true
  if (limpo.length === 11) return validarCPF(doc)
  if (limpo.length === 14) return validarCNPJ(doc)
  return false
}
