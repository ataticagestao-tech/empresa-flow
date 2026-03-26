/**
 * Calcula a data da Páscoa pelo algoritmo de Meeus/Jones/Butcher.
 */
const calcularPascoa = (ano: number): Date => {
  const a = ano % 19
  const b = Math.floor(ano / 100)
  const c = ano % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(ano, mes - 1, dia)
}

const isoDate = (d: Date): string => d.toISOString().split('T')[0]

const addDias = (d: Date, n: number): string => {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return isoDate(r)
}

export const feriadosNacionais = (ano: number): Set<string> => {
  const pascoa = calcularPascoa(ano)
  const fixos = [
    `${ano}-01-01`,
    `${ano}-04-21`,
    `${ano}-05-01`,
    `${ano}-09-07`,
    `${ano}-10-12`,
    `${ano}-11-02`,
    `${ano}-11-15`,
    `${ano}-11-20`,
    `${ano}-12-25`,
  ]
  const moveis = [
    addDias(pascoa, -48),
    addDias(pascoa, -47),
    addDias(pascoa, -2),
    isoDate(pascoa),
    addDias(pascoa, 60),
  ]
  return new Set([...fixos, ...moveis])
}

export type TipoDia = 'util' | 'fds' | 'feriado'

export interface DiaMes {
  data: string
  tipo: TipoDia
}

export type RegimeTrabalho = 'seg_sex' | 'seg_sab' | 'escala_6x1'

export const calcularDiasUteis = (
  ano: number,
  mes: number,
  regime: RegimeTrabalho
): { diasUteis: number; diasDetalhados: DiaMes[] } => {
  const feriados = feriadosNacionais(ano)
  const totalDias = new Date(ano, mes, 0).getDate()
  const detalhados: DiaMes[] = []
  let diasUteis = 0

  for (let dia = 1; dia <= totalDias; dia++) {
    const data = new Date(ano, mes - 1, dia)
    const semana = data.getDay()
    const dataStr = isoDate(data)
    let tipo: TipoDia = 'util'

    if (feriados.has(dataStr)) {
      tipo = 'feriado'
    } else if (regime === 'seg_sex' && (semana === 0 || semana === 6)) {
      tipo = 'fds'
    } else if (regime === 'seg_sab' && semana === 0) {
      tipo = 'fds'
    }

    if (tipo === 'util') diasUteis++
    detalhados.push({ data: dataStr, tipo })
  }

  return { diasUteis, diasDetalhados: detalhados }
}

export interface InputBeneficios {
  salarioBase: number
  diasConsiderados: number
  vtAtivo: boolean
  vtValesPorDia: number
  vtValorUnitario: number
  vaAtivo: boolean
  vaValorDia: number
}

export interface ResultadoBeneficios {
  vtBruto: number
  vtDescontoFunc: number
  vtCustoEmpresa: number
  vaTotal: number
  vaDescontoFunc: number
  vaCustoEmpresa: number
  totalCustoEmpresa: number
  totalDescontoFunc: number
}

const arred = (v: number) => Math.round(v * 100) / 100

export const calcularBeneficios = (i: InputBeneficios): ResultadoBeneficios => {
  const vtBruto = i.vtAtivo ? arred(i.diasConsiderados * i.vtValesPorDia * i.vtValorUnitario) : 0
  const vtDescontoFunc = i.vtAtivo ? arred(Math.min(i.salarioBase * 0.06, vtBruto)) : 0
  const vtCustoEmpresa = arred(vtBruto - vtDescontoFunc)
  const vaTotal = i.vaAtivo ? arred(i.diasConsiderados * i.vaValorDia) : 0

  return {
    vtBruto,
    vtDescontoFunc,
    vtCustoEmpresa,
    vaTotal,
    vaDescontoFunc: 0,
    vaCustoEmpresa: vaTotal,
    totalCustoEmpresa: arred(vtCustoEmpresa + vaTotal),
    totalDescontoFunc: arred(vtDescontoFunc),
  }
}
