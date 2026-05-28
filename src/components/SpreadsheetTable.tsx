import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Tabela estilo planilha (Excel):
 * - Preenche 100% do container (colunas em %), nunca ultrapassa.
 * - Colunas redimensionáveis arrastando a divisória: uma cresce, a vizinha
 *   encolhe (total fixo) — não há rolagem horizontal nem arraste infinito.
 * - Seleção de célula (clique destaca; texto continua selecionável p/ copiar).
 * - Cabeçalho fixo (sticky) — depende de um container com scroll no pai.
 *
 * O componente renderiza só o <table>. Quem usa cuida da moldura/scroll do pai.
 */
export interface SpreadsheetColumn<T> {
  id: string;
  header: ReactNode;
  align?: "left" | "right" | "center";
  /** tabular-nums + alinhamento à direita por padrão. */
  numeric?: boolean;
  /** Peso relativo da largura padrão (default 10). */
  weight?: number;
  /** Envolve o conteúdo num container truncado. Default true. Use false p/ células com layout próprio. */
  truncate?: boolean;
  render: (row: T) => ReactNode;
  /** Tooltip (title) da célula. */
  title?: (row: T) => string;
  cellClassName?: string;
}

interface SpreadsheetTableProps<T> {
  columns: SpreadsheetColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  /** Linha de total opcional (um conteúdo por coluna; null = vazio). */
  totals?: (ReactNode | null)[];
  /** Quando muda, reseta larguras das colunas e a seleção. */
  resetKey?: string | number;
  selectable?: boolean;
  /** Mostra a linha de cabeçalho (com alças de redimensionamento). Default true. */
  showHeader?: boolean;
  className?: string;
  headerClassName?: string;
  cellClassName?: string;
  rowClassName?: (row: T, index: number) => string;
  minColPx?: number;
}

const alignClass = (a?: "left" | "right" | "center") =>
  a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";

export function SpreadsheetTable<T>({
  columns,
  rows,
  rowKey,
  totals,
  resetKey,
  selectable = true,
  showHeader = true,
  className,
  headerClassName,
  cellClassName,
  rowClassName,
  minColPx = 60,
}: SpreadsheetTableProps<T>) {
  const tableRef = useRef<HTMLTableElement>(null);

  const pctFrom = () => {
    const weights = columns.map((c) => c.weight ?? 10);
    const total = weights.reduce((s, w) => s + w, 0) || 1;
    return weights.map((w) => (w / total) * 100);
  };
  const [colPct, setColPct] = useState<number[]>(pctFrom);
  const [selCell, setSelCell] = useState<string | null>(null);

  useEffect(() => {
    setColPct(pctFrom());
    setSelCell(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, columns.length]);

  const startResize = (e: React.MouseEvent, i: number) => {
    e.preventDefault();
    e.stopPropagation();
    const W = tableRef.current?.offsetWidth ?? 1;
    const startPcts = colPct.length ? [...colPct] : pctFrom();
    if (i < 0 || i >= startPcts.length - 1) return;
    const startX = e.clientX;
    const pairTotal = startPcts[i] + startPcts[i + 1];
    const minPct = Math.min(pairTotal / 2, Math.max(5, (minColPx / W) * 100));
    const onMove = (ev: MouseEvent) => {
      const dPct = ((ev.clientX - startX) / W) * 100;
      let ni = startPcts[i] + dPct;
      ni = Math.max(minPct, Math.min(pairTotal - minPct, ni));
      setColPct((prev) => {
        const base = prev.length ? [...prev] : [...startPcts];
        base[i] = ni;
        base[i + 1] = pairTotal - ni;
        return base;
      });
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  return (
    <table
      ref={tableRef}
      className={cn("border-collapse", className)}
      style={{ width: "100%", tableLayout: "fixed" }}
    >
      <colgroup>
        {columns.map((c, i) => (
          <col key={c.id} style={{ width: `${colPct[i] ?? 100 / columns.length}%` }} />
        ))}
      </colgroup>
      {showHeader && (
      <thead className="sticky top-0 z-10">
        <tr>
          {columns.map((c, i) => (
            <th
              key={c.id}
              className={cn(
                "relative px-3 py-2 select-none border-b border-r border-border/50",
                alignClass(c.align ?? (c.numeric ? "right" : "left")),
                headerClassName,
              )}
            >
              <div className="truncate">{c.header}</div>
              {i < columns.length - 1 && (
                <span
                  role="separator"
                  aria-orientation="vertical"
                  onMouseDown={(e) => startResize(e, i)}
                  className="absolute top-0 -right-1 z-20 h-full w-2 cursor-col-resize hover:bg-primary/40"
                />
              )}
            </th>
          ))}
        </tr>
      </thead>
      )}
      <tbody>
        {rows.map((row, ri) => (
          <tr key={rowKey(row, ri)} className={rowClassName?.(row, ri)}>
            {columns.map((c, ci) => {
              const sel = selectable && selCell === `${ri}:${ci}`;
              const content = c.render(row);
              return (
                <td
                  key={c.id}
                  title={c.title?.(row)}
                  onClick={selectable ? () => setSelCell(`${ri}:${ci}`) : undefined}
                  className={cn(
                    "px-3 py-2 border-b border-r border-border/40 overflow-hidden align-middle",
                    alignClass(c.align ?? (c.numeric ? "right" : "left")),
                    c.numeric && "tabular-nums",
                    selectable && "cursor-cell select-text",
                    cellClassName,
                    c.cellClassName,
                    sel && "ring-2 ring-inset ring-primary bg-primary/5",
                  )}
                >
                  {c.truncate === false ? content : <div className="truncate">{content}</div>}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
      {totals && rows.length > 0 && (
        <tfoot>
          <tr>
            {columns.map((c, ci) => (
              <td
                key={c.id}
                className={cn(
                  "px-3 py-2 border-t-2 border-r border-border/40 font-semibold",
                  alignClass(c.align ?? (c.numeric ? "right" : "left")),
                  c.numeric && "tabular-nums",
                  cellClassName,
                )}
              >
                {totals[ci] ?? ""}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );
}
