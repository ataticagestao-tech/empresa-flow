export const formatBRL = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const formatCPF = (v: string) =>
  v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')

export const formatCNPJ = (v: string) =>
  v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')

export const formatData = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR')

export const formatPercentual = (value: number) =>
  `${value.toFixed(1)}%`
