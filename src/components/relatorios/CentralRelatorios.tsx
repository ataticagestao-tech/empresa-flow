import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileSpreadsheet, FileText, Loader2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  catalogoRelatorios,
  GRUPOS_RELATORIO,
  type GrupoRelatorio,
} from "@/lib/relatorios/catalogo";
import {
  exportarRelatorioExcel,
  exportarRelatorioPDF,
  type EmpresaInfo,
} from "@/lib/relatorios/gerar-relatorio";

interface Props {
  client: any;
  companyId?: string;
  empresa: EmpresaInfo;
  range: { start: string; end: string };
  periodoLabel: string;
}

const PREVIEW_LIMIT = 20;

const fmtCell = (v: string | number | null | undefined): string => {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
};

const alignClass = (align?: "left" | "right" | "center") =>
  align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";

export function CentralRelatorios({ client, companyId, empresa, range, periodoLabel }: Props) {
  const [areaId, setAreaId] = useState<GrupoRelatorio>(GRUPOS_RELATORIO[0].id);
  const reportsInArea = useMemo(
    () => catalogoRelatorios.filter((r) => r.grupo === areaId),
    [areaId],
  );
  const [selectedId, setSelectedId] = useState<string | undefined>(reportsInArea[0]?.id);
  const [busy, setBusy] = useState<null | "excel" | "pdf">(null);

  const def = useMemo(
    () => catalogoRelatorios.find((r) => r.id === selectedId) ?? null,
    [selectedId],
  );

  // Larguras das colunas em PORCENTAGEM (somam sempre 100%).
  // A tabela tem width:100%, então ela preenche o quadro e NUNCA o ultrapassa.
  // Arrastar a divisória entre duas colunas troca largura entre elas (total fixo).
  const colWeight = (c: any): number => c.excelWidth ?? (c.numericValue ? 14 : 18);
  const pctFromDef = (d: typeof def): number[] => {
    if (!d) return [];
    const weights = d.columns.map(colWeight);
    const total = weights.reduce((s, w) => s + w, 0) || 1;
    return weights.map((w) => (w / total) * 100);
  };

  const [selCell, setSelCell] = useState<string | null>(null);
  const [colPct, setColPct] = useState<number[]>(() => pctFromDef(def));
  const tableRef = useRef<HTMLTableElement>(null);

  useEffect(() => {
    setColPct(pctFromDef(def));
    setSelCell(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def?.id]);

  // Redimensiona a divisória entre a coluna i e a i+1: o que uma ganha, a outra
  // perde. O total fica em 100%, então a tabela jamais cresce além do quadro.
  const startResize = (e: React.MouseEvent, i: number) => {
    e.preventDefault();
    e.stopPropagation();
    const W = tableRef.current?.offsetWidth ?? 1;
    const startPcts = colPct.length ? [...colPct] : pctFromDef(def);
    if (i < 0 || i >= startPcts.length - 1) return;
    const startX = e.clientX;
    const pairTotal = startPcts[i] + startPcts[i + 1];
    const minPct = Math.min(pairTotal / 2, Math.max(5, (60 / W) * 100));
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

  const {
    data: rows,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: [
      "relatorio-preview",
      def?.id,
      companyId,
      def?.usaPeriodo ? range.start : null,
      def?.usaPeriodo ? range.end : null,
    ],
    queryFn: async () => {
      if (!def || !companyId) return [];
      return def.carregar({ client, companyId, range });
    },
    enabled: !!def && !!companyId,
  });

  const baseName = () => {
    const periodo = def?.usaPeriodo ? `${range.start}_a_${range.end}` : "";
    return [def?.id, empresa.nome, periodo].filter(Boolean).join("-");
  };

  const exportar = (fmt: "excel" | "pdf") => {
    if (!def || !rows) return;
    if (!rows.length) {
      toast.info(def.usaPeriodo ? "Nenhum dado nesse período." : "Nenhum registro cadastrado.");
      return;
    }
    setBusy(fmt);
    try {
      if (fmt === "excel") {
        exportarRelatorioExcel({
          rows,
          columns: def.columns,
          baseName: baseName(),
          sheetName: def.titulo,
        });
      } else {
        exportarRelatorioPDF({
          rows,
          columns: def.columns,
          titulo: def.titulo.toUpperCase(),
          baseName: baseName(),
          empresa,
          subtitulo: def.usaPeriodo ? periodoLabel : undefined,
          orientacao: def.pdfOrientacao,
          corPrimaria: def.corPrimaria,
        });
      }
      toast.success(`${def.titulo} · ${rows.length} linha${rows.length === 1 ? "" : "s"}`);
    } catch (e: any) {
      toast.error("Erro ao gerar relatório: " + (e?.message || String(e)));
    } finally {
      setBusy(null);
    }
  };

  // Totais por coluna numérica (sobre todas as linhas, não só a prévia).
  const totals = useMemo(() => {
    if (!def) return [];
    return def.columns.map((c) =>
      c.numericValue ? (rows ?? []).reduce((s, r) => s + (c.numericValue!(r) || 0), 0) : null,
    );
  }, [def, rows]);
  const firstNumIdx = totals.findIndex((t) => t !== null);
  const totalLabelIdx = firstNumIdx > 0 ? firstNumIdx - 1 : 0;
  const hasTotals = firstNumIdx >= 0 && (rows?.length ?? 0) > 0;

  const previewRows = (rows ?? []).slice(0, PREVIEW_LIMIT);
  const downloadDisabled = busy !== null || isLoading || !rows || rows.length === 0;

  const btnBase =
    "flex items-center justify-center gap-1.5 h-8 px-3 text-[12px] font-semibold text-[#1D2939] bg-white border border-[#D0D5DD] rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="space-y-4">
      {/* Dropdown de área */}
      <div className="flex flex-col gap-1.5 max-w-xs">
        <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Área do relatório
        </label>
        <Select
          value={areaId}
          onValueChange={(v) => {
            const next = v as GrupoRelatorio;
            setAreaId(next);
            setSelectedId(catalogoRelatorios.find((r) => r.grupo === next)?.id);
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GRUPOS_RELATORIO.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Master-detail: lista à esquerda, prévia à direita */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        {/* Lista de relatórios da área */}
        <div className="border rounded-lg overflow-hidden bg-card h-fit">
          {reportsInArea.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setSelectedId(r.id)}
              className={cn(
                "w-full text-left px-3 py-2.5 flex items-center gap-2 text-sm border-b last:border-b-0 transition-colors hover:bg-accent",
                selectedId === r.id && "bg-accent font-medium",
              )}
            >
              <span className="flex-1 min-w-0 truncate">{r.titulo}</span>
              <ChevronRight
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground",
                  selectedId === r.id && "text-foreground",
                )}
              />
            </button>
          ))}
        </div>

        {/* Prévia do relatório selecionado */}
        <div className="border rounded-lg bg-card min-h-[380px] min-w-0 flex flex-col overflow-hidden">
          {!def ? (
            <div className="flex-1 grid place-items-center text-sm text-muted-foreground">
              Selecione um relatório à esquerda.
            </div>
          ) : (
            <>
              <div className="p-4 border-b flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <h4 className="font-semibold text-[#1D2939]">{def.titulo}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">{def.descricao}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {def.usaPeriodo ? `Período: ${periodoLabel}` : "Todos os registros cadastrados"}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => exportar("excel")}
                    disabled={downloadDisabled}
                    className={cn(btnBase, "hover:bg-[#ECFDF4]")}
                  >
                    {busy === "excel" ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <FileSpreadsheet size={13} className="text-[#039855]" />
                    )}
                    Excel
                  </button>
                  <button
                    type="button"
                    onClick={() => exportar("pdf")}
                    disabled={downloadDisabled}
                    className={cn(btnBase, "hover:bg-[#FEF3F2]")}
                  >
                    {busy === "pdf" ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <FileText size={13} className="text-[#D92D20]" />
                    )}
                    PDF
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto">
                {!companyId ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    Selecione uma empresa para visualizar a prévia.
                  </div>
                ) : isLoading ? (
                  <div className="p-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 size={16} className="animate-spin" /> Carregando prévia...
                  </div>
                ) : isError ? (
                  <div className="p-8 text-center text-sm text-[#DC2626]">
                    Erro ao carregar: {(error as any)?.message || "tente novamente"}
                  </div>
                ) : !rows?.length ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    {def.usaPeriodo
                      ? "Nenhum dado nesse período. Ajuste o filtro de datas no topo."
                      : "Nenhum registro cadastrado."}
                  </div>
                ) : (
                  <table
                    ref={tableRef}
                    className="text-xs border-collapse"
                    style={{ width: "100%", tableLayout: "fixed" }}
                  >
                    <colgroup>
                      {def.columns.map((_, i) => (
                        <col
                          key={i}
                          style={{ width: `${colPct[i] ?? 100 / def.columns.length}%` }}
                        />
                      ))}
                    </colgroup>
                    <thead className="bg-muted/50 sticky top-0 z-10">
                      <tr>
                        {def.columns.map((c, i) => (
                          <th
                            key={i}
                            className={cn(
                              "relative border-b border-r border-border/60 px-4 py-3 font-semibold text-muted-foreground select-none",
                              alignClass(c.align),
                            )}
                          >
                            <span className="block truncate">{c.header}</span>
                            {i < def.columns.length - 1 && (
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
                    <tbody>
                      {previewRows.map((row, ri) => (
                        <tr key={ri}>
                          {def.columns.map((c, ci) => {
                            const text = fmtCell(c.value(row));
                            const cellKey = `${ri}:${ci}`;
                            const selected = selCell === cellKey;
                            return (
                              <td
                                key={ci}
                                title={text}
                                onClick={() => setSelCell(cellKey)}
                                className={cn(
                                  "border-b border-r border-border/40 px-4 py-3 text-[#1D2939] truncate cursor-cell select-text",
                                  alignClass(c.align),
                                  c.numericValue && "tabular-nums",
                                  selected && "ring-2 ring-inset ring-primary bg-primary/5",
                                )}
                              >
                                {text}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                    {hasTotals && (
                      <tfoot>
                        <tr className="bg-muted/30 font-semibold">
                          {def.columns.map((c, ci) => {
                            let content = "";
                            if (totals[ci] !== null)
                              content = (totals[ci] as number).toLocaleString("pt-BR", {
                                maximumFractionDigits: 2,
                              });
                            else if (ci === totalLabelIdx) content = "TOTAL";
                            return (
                              <td
                                key={ci}
                                title={content}
                                className={cn(
                                  "border-t-2 border-r border-border/40 px-4 py-3 text-[#1D2939] truncate",
                                  alignClass(c.align),
                                  c.numericValue && "tabular-nums",
                                )}
                              >
                                {content}
                              </td>
                            );
                          })}
                        </tr>
                      </tfoot>
                    )}
                  </table>
                )}
              </div>

              {rows && rows.length > PREVIEW_LIMIT && (
                <div className="p-2 text-[11px] text-center text-muted-foreground border-t">
                  Mostrando {PREVIEW_LIMIT} de {rows.length} linhas — baixe o arquivo para ver tudo.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
