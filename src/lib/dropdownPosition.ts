// Posiciona menus suspensos (renderizados via portal com position:fixed) de forma
// que nunca fiquem cortados no rodapé: abre pra baixo quando há espaço, senão pra
// cima, e sempre limita a altura ao espaço disponível (com rolagem interna).
export type DropdownCoords =
  | { top: number; right: number; maxHeight: number }
  | { bottom: number; right: number; maxHeight: number }

export const computeDropdownCoords = (rect: DOMRect): DropdownCoords => {
  const GAP = 4
  const MARGIN = 12
  const right = window.innerWidth - rect.right
  const spaceBelow = window.innerHeight - rect.bottom
  const spaceAbove = rect.top

  if (spaceBelow < 280 && spaceAbove > spaceBelow) {
    return { bottom: window.innerHeight - rect.top + GAP, right, maxHeight: spaceAbove - MARGIN }
  }
  return { top: rect.bottom + GAP, right, maxHeight: spaceBelow - MARGIN }
}

// Estilo de posicionamento pronto para espalhar no style do menu.
export const dropdownPositionStyle = (c: DropdownCoords): React.CSSProperties => ({
  ...('top' in c ? { top: c.top } : { bottom: c.bottom }),
  right: c.right,
  maxHeight: c.maxHeight,
  overflowY: 'auto',
})
