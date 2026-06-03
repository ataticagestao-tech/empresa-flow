import * as XLSX from "xlsx";

/**
 * Parser da Agenda de Recebíveis da Stone (Excel/CSV).
 * Uma linha por PARCELA. Colunas reais (2026-06):
 *   DOCUMENTO | STONECODE | CATEGORIA | DATA DA VENDA | DATA DE VENCIMENTO |
 *   DATA DE VENCIMENTO ORIGINAL | BANDEIRA | PRODUTO | STONE ID | QTD DE PARCELAS |
 *   Nº DA PARCELA | VALOR BRUTO | VALOR LÍQUIDO | DESCONTO DE MDR |
 *   DESCONTO DE ANTECIPAÇÃO | DESCONTO UNIFICADO | ÚLTIMO STATUS | DATA DO ÚLTIMO STATUS
 *
 * data_vencimento = quando a parcela liquida (entra na conta). valor_liquido = o que cai.
 * taxa = |desconto_mdr| + |desconto_antecipacao| (≈ bruto − líquido).
 */

export interface StoneAgendaItem {
  documento: string | null;
  stonecode: string | null;
  categoria: string | null;
  dataVenda: string | null; // 'YYYY-MM-DD'
  dataVencimento: string; // 'YYYY-MM-DD' (obrigatório)
  dataVencimentoOriginal: string | null;
  bandeira: string | null;
  produto: string | null;
  stoneId: string | null;
  qtdParcelas: number | null;
  numParcela: number | null;
  valorBruto: number | null;
  valorLiquido: number; // obrigatório
  descontoMdr: number | null;
  descontoAntecipacao: number | null;
  descontoUnificado: number | null;
  status: string | null;
  dataStatus: string | null;
  /** Hash estável da parcela (dedup). */
  contentHash: string;
}

function norm(s: any): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[ºª°]/g, "") // "nº" → "n" (Nº DA PARCELA)
    .trim();
}

/** Acha o índice da coluna por nome normalizado exato; depois por "inclui". `exclude` evita falsos positivos. */
function colIdx(headers: string[], names: string[], exclude?: string[]): number {
  const H = headers.map(norm);
  const ex = (exclude || []).map(norm);
  const passesExclude = (h: string) => ex.every((e) => !h.includes(e));
  for (const n of names) {
    const nn = norm(n);
    const i = H.findIndex((h) => h === nn && passesExclude(h));
    if (i >= 0) return i;
  }
  for (const n of names) {
    const nn = norm(n);
    const i = H.findIndex((h) => h.includes(nn) && passesExclude(h));
    if (i >= 0) return i;
  }
  return -1;
}

/** 'DD/MM/YYYY' (com ou sem hora) | serial Excel | Date → 'YYYY-MM-DD'. */
function parseDate(value: any): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const str = String(value).trim();
  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/); // ignora hora depois
  if (dmy) {
    const [, dd, mm, yyyy] = dmy;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const num = Number(str.replace(",", "."));
  if (Number.isFinite(num) && num > 30000 && num < 80000) {
    const d = new Date((num - 25569) * 86400 * 1000);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

/** Número BR ("1.249,95", "-50,05", "875", "750,9315") → number. */
function parseNum(value: any): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value == null || value === "") return null;
  let str = String(value).trim();
  const isNeg = str.includes("-") || str.includes("(");
  str = str.replace(/r\$/gi, "").replace(/[()\s]/g, "");
  if (str.includes(",")) str = str.replace(/\./g, "").replace(",", ".");
  const num = parseFloat(str);
  if (!Number.isFinite(num)) return null;
  return isNeg ? -Math.abs(num) : Math.abs(num) * (isNeg ? -1 : 1);
}

function parseInt0(value: any): number | null {
  const n = parseNum(value);
  return n == null ? null : Math.round(n);
}

function hash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = (h * 33) ^ input.charCodeAt(i);
  return (h >>> 0).toString(16);
}

async function loadRows(file: File): Promise<any[][]> {
  const isCsv = /\.csv$/i.test(file.name);
  if (isCsv) {
    // CSV vem como texto BR ("1.300,00") — parseNum trata. Não converter aqui.
    const text = (await file.text()).replace(/^﻿/, "");
    return text.split(/\r?\n/).filter((l) => l.length > 0).map((l) => l.split(/[;\t]/).map((c) => c.trim()));
  }
  // Excel: ler os valores CRUS (raw:true) — evita o bug do texto formatado "1.300" virar 1,30.
  // SEM cellDates: datas vêm como serial do Excel (número), que parseDate converte de forma
  // segura contra fuso horário (cellDates+toISOString trocaria o dia em UTC-3).
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("Planilha vazia");
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
}

export async function parseStoneAgenda(file: File): Promise<StoneAgendaItem[]> {
  const rows = await loadRows(file);
  if (rows.length < 2) throw new Error("Planilha sem dados");

  // Acha a linha de cabeçalho (a que tem VALOR LÍQUIDO + DATA DE VENCIMENTO).
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const liq = colIdx(rows[i], ["valor liquido"]);
    const venc = colIdx(rows[i], ["data de vencimento"]);
    if (liq >= 0 && venc >= 0) { headerIdx = i; break; }
  }
  if (headerIdx < 0) {
    throw new Error("Não encontrei o cabeçalho da agenda Stone (esperado 'Valor Líquido' e 'Data de Vencimento').");
  }

  const H = rows[headerIdx];
  const idx = {
    documento: colIdx(H, ["documento"]),
    stonecode: colIdx(H, ["stonecode", "stone code"]),
    categoria: colIdx(H, ["categoria"]),
    dataVenda: colIdx(H, ["data da venda"]),
    dataVencimento: colIdx(H, ["data de vencimento"], ["original"]),
    dataVencimentoOriginal: colIdx(H, ["data de vencimento original"]),
    bandeira: colIdx(H, ["bandeira"]),
    produto: colIdx(H, ["produto"]),
    stoneId: colIdx(H, ["stone id"]),
    qtdParcelas: colIdx(H, ["qtd de parcelas", "qtd parcelas"]),
    numParcela: colIdx(H, ["no da parcela", "n da parcela", "numero da parcela"]),
    valorBruto: colIdx(H, ["valor bruto"]),
    valorLiquido: colIdx(H, ["valor liquido"]),
    descontoMdr: colIdx(H, ["desconto de mdr", "mdr"]),
    descontoAntecipacao: colIdx(H, ["desconto de antecipacao", "antecipacao"]),
    descontoUnificado: colIdx(H, ["desconto unificado"]),
    status: colIdx(H, ["ultimo status", "status"]),
    dataStatus: colIdx(H, ["data do ultimo status"]),
  };

  const get = (row: string[], i: number) => (i >= 0 ? row[i] : "");

  const items: StoneAgendaItem[] = [];
  const occ = new Map<string, number>(); // índice de ocorrência p/ desempatar linhas idênticas
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    const dataVencimento = parseDate(get(row, idx.dataVencimento));
    const valorLiquido = parseNum(get(row, idx.valorLiquido));
    if (!dataVencimento || valorLiquido == null) continue; // linha não-dados (total, vazia…)

    const dataVenda = parseDate(get(row, idx.dataVenda));
    const stonecode = String(get(row, idx.stonecode) || "").trim() || null;
    const numParcela = parseInt0(get(row, idx.numParcela));
    const qtdParcelas = parseInt0(get(row, idx.qtdParcelas));
    const valorBruto = parseNum(get(row, idx.valorBruto));
    const bandeira = String(get(row, idx.bandeira) || "").trim() || null;

    // Hash estável da parcela + índice de ocorrência (desempata linhas de conteúdo idêntico;
    // senão o upsert quebra com "ON CONFLICT cannot affect row a second time").
    const baseKey = [stonecode, dataVenda, dataVencimento, qtdParcelas, numParcela, valorBruto, valorLiquido, bandeira].join("|");
    const occIdx = occ.get(baseKey) || 0;
    occ.set(baseKey, occIdx + 1);
    const contentHash = hash(`${baseKey}|${occIdx}`);

    items.push({
      documento: String(get(row, idx.documento) || "").trim() || null,
      stonecode,
      categoria: String(get(row, idx.categoria) || "").trim() || null,
      dataVenda,
      dataVencimento,
      dataVencimentoOriginal: parseDate(get(row, idx.dataVencimentoOriginal)),
      bandeira,
      produto: String(get(row, idx.produto) || "").trim() || null,
      stoneId: String(get(row, idx.stoneId) || "").trim() || null,
      qtdParcelas,
      numParcela,
      valorBruto,
      valorLiquido,
      descontoMdr: parseNum(get(row, idx.descontoMdr)),
      descontoAntecipacao: parseNum(get(row, idx.descontoAntecipacao)),
      descontoUnificado: parseNum(get(row, idx.descontoUnificado)),
      status: String(get(row, idx.status) || "").trim() || null,
      dataStatus: parseDate(get(row, idx.dataStatus)),
      contentHash,
    });
  }

  return items;
}
