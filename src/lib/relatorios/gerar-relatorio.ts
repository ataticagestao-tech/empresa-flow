import * as XLSX from "xlsx";
import {
  gerarRelatorioListaPDF,
  downloadListaPDF,
  type ColunaLista,
} from "@/lib/cadastros-pdf/gerar-lista-pdf";

/**
 * Coluna de um relatório. Mesma forma do ExportMenu — `value` devolve o texto
 * (usado no PDF e como fallback no Excel) e `numericValue`, quando presente,
 * vira número de verdade no Excel (permite soma e gera a linha TOTAL).
 */
export interface ColunaRelatorio<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
  numericValue?: (row: T) => number;
  align?: "left" | "right" | "center";
  pdfFlex?: number;
  excelWidth?: number;
}

export interface EmpresaInfo {
  nome: string;
  razao_social?: string | null;
  cnpj?: string | null;
  local?: string | null;
}

function fmtCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  return String(v);
}

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase();
}

/** Gera e baixa um .xlsx, com linha TOTAL automática para colunas numéricas. */
export function exportarRelatorioExcel<T>(opts: {
  rows: T[];
  columns: ColunaRelatorio<T>[];
  baseName: string;
  sheetName?: string;
}) {
  const { rows, columns, baseName, sheetName = "Dados" } = opts;

  const aoa = rows.map((row) => {
    const obj: Record<string, string | number> = {};
    columns.forEach((c) => {
      obj[c.header] = c.numericValue ? c.numericValue(row) : fmtCell(c.value(row));
    });
    return obj;
  });

  const ws = XLSX.utils.json_to_sheet(aoa, { header: columns.map((c) => c.header) });

  const numericIdx = columns.map((c, i) => (c.numericValue ? i : -1)).filter((i) => i >= 0);
  if (numericIdx.length > 0 && rows.length > 0) {
    const totalRow: (string | number)[] = columns.map(() => "");
    const firstNum = numericIdx[0];
    if (firstNum > 0) totalRow[firstNum - 1] = "TOTAL";
    else totalRow[0] = "TOTAL";
    numericIdx.forEach((i) => {
      totalRow[i] = rows.reduce((s, r) => s + (columns[i].numericValue!(r) || 0), 0);
    });
    XLSX.utils.sheet_add_aoa(ws, [totalRow], { origin: -1 });
  }

  ws["!cols"] = columns.map((c) => ({ wch: c.excelWidth ?? 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, `${slug(baseName)}.xlsx`);
}

/** Gera e baixa um PDF tabular reaproveitando o gerador de listas existente. */
export function exportarRelatorioPDF<T>(opts: {
  rows: T[];
  columns: ColunaRelatorio<T>[];
  titulo: string;
  baseName: string;
  empresa: EmpresaInfo;
  subtitulo?: string;
  orientacao?: "portrait" | "landscape";
  corPrimaria?: string;
}) {
  const {
    rows,
    columns,
    titulo,
    baseName,
    empresa,
    subtitulo,
    orientacao = "landscape",
    corPrimaria,
  } = opts;

  const colunas: ColunaLista[] = columns.map((c) => ({
    header: c.header,
    flex: c.pdfFlex ?? 10,
    align: c.align ?? (c.numericValue ? "right" : "left"),
  }));
  const linhas: string[][] = rows.map((row) => columns.map((c) => fmtCell(c.value(row))));

  const blob = gerarRelatorioListaPDF({
    empresa_nome: empresa.nome,
    empresa_razao_social: empresa.razao_social ?? null,
    empresa_cnpj: empresa.cnpj ?? null,
    empresa_local: empresa.local ?? null,
    titulo: subtitulo ? `${titulo} · ${subtitulo}` : titulo,
    orientacao,
    cor_primaria: corPrimaria,
    colunas,
    linhas,
  });
  downloadListaPDF(blob, baseName);
}
