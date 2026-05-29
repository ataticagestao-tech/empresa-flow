// Cálculo de folha CLT (INSS progressivo + IRRF) compartilhado entre a
// tela de Folha de Pagamento e a Calculadora de Salário em Funcionários.
// Faixas vêm de config_tabela_inss/config_tabela_irrf; se vazias, usa 2025.

export interface FaixaINSS {
  faixa_min: number
  faixa_max: number | null
  aliquota: number
}

export interface FaixaIRRF {
  faixa_min: number
  faixa_max: number | null
  aliquota: number
  deducao: number
}

export const FAIXAS_INSS_2025: FaixaINSS[] = [
  { faixa_min: 0, faixa_max: 1518.00, aliquota: 7.50 },
  { faixa_min: 1518.01, faixa_max: 2793.88, aliquota: 9.00 },
  { faixa_min: 2793.89, faixa_max: 4190.83, aliquota: 12.00 },
  { faixa_min: 4190.84, faixa_max: 8157.41, aliquota: 14.00 },
]

export const FAIXAS_IRRF_2025: FaixaIRRF[] = [
  { faixa_min: 0, faixa_max: 2259.20, aliquota: 0, deducao: 0 },
  { faixa_min: 2259.21, faixa_max: 2826.65, aliquota: 7.50, deducao: 169.44 },
  { faixa_min: 2826.66, faixa_max: 3751.05, aliquota: 15.00, deducao: 381.44 },
  { faixa_min: 3751.06, faixa_max: 4664.68, aliquota: 22.50, deducao: 662.77 },
  { faixa_min: 4664.69, faixa_max: null, aliquota: 27.50, deducao: 896.00 },
]

export const DEDUCAO_DEPENDENTE = 189.59

// INSS progressivo sobre o salário bruto.
export function calcularINSS(salarioBruto: number, faixas: FaixaINSS[] = []): number {
  if (faixas.length === 0) faixas = FAIXAS_INSS_2025

  let inss = 0
  let salarioRestante = salarioBruto

  for (const faixa of faixas) {
    if (salarioRestante <= 0) break
    const teto = faixa.faixa_max || Infinity
    const base = Math.min(salarioRestante, teto - faixa.faixa_min + 0.01)
    if (base > 0) {
      inss += base * (faixa.aliquota / 100)
      salarioRestante -= base
    }
  }

  return Math.round(inss * 100) / 100
}

// IRRF sobre a base de cálculo (bruto − INSS − deduções de dependentes).
export function calcularIRRF(baseCalculo: number, faixas: FaixaIRRF[] = []): number {
  if (faixas.length === 0) faixas = FAIXAS_IRRF_2025

  for (let i = faixas.length - 1; i >= 0; i--) {
    if (baseCalculo >= faixas[i].faixa_min) {
      const irrf = baseCalculo * (faixas[i].aliquota / 100) - faixas[i].deducao
      return Math.max(0, Math.round(irrf * 100) / 100)
    }
  }
  return 0
}
