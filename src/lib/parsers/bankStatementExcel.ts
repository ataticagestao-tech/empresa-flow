import * as XLSX from "xlsx";

export interface ExcelParsedTransaction {
  date: string;
  description: string;
  amount: number;
  raw: string;
}

/** Tenta converter datas em vários formatos para ISO yyyy-MM-dd */
function parseDate(value: any): string | null {
  if (!value) return null;

  // Se for um Date nativo (xlsx converte automaticamente com cellDates)
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const str = String(value).trim();

  // DD/MM/YYYY ou DD-MM-YYYY
  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const [, dd, mm, yyyy] = dmy;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  // YYYY-MM-DD (já ISO)
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return str;

  // Número serial do Excel (dias desde 1900-01-01)
  const num = Number(str);
  if (Number.isFinite(num) && num > 30000 && num < 60000) {
    const d = new Date((num - 25569) * 86400 * 1000);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  return null;
}

/** Tenta extrair valor numérico de uma célula (suporta R$ 1.234,56 e variações) */
function parseAmount(value: any): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value) return null;

  let str = String(value).trim();

  // Detectar sinal negativo
  const isNeg = str.includes("-") || str.includes("(");

  // Limpar R$, parênteses, espaços
  str = str.replace(/R\$\s*/gi, "").replace(/[()]/g, "").replace(/\s/g, "");

  // Formato brasileiro: 1.234,56
  if (str.includes(",")) {
    str = str.replace(/\./g, "").replace(",", ".");
  }

  const num = parseFloat(str);
  if (!Number.isFinite(num)) return null;
  return isNeg ? -Math.abs(num) : num;
}

// Nomes comuns de colunas em extratos bancários brasileiros
const DATE_ALIASES = ["data", "date", "dt", "data_mov", "data mov", "data movimento", "dt_mov", "dt mov", "data lançamento", "data lancamento", "data operação", "data operacao"];
const HIST_ALIASES = ["historico", "histórico", "hist", "tipo", "operação", "operacao", "lançamento", "lancamento"];
const DESC_ALIASES = ["descricao", "descrição", "description", "desc", "detalhe", "detalhes", "beneficiario", "beneficiário", "favorecido", "memo", "observação", "observacao"];
const AMOUNT_ALIASES = ["valor", "amount", "value", "vlr", "montante", "valor (r$)", "valor r$"];
const CREDIT_ALIASES = ["credito", "crédito", "credit", "entrada", "entradas"];
const DEBIT_ALIASES = ["debito", "débito", "debit", "saida", "saída", "saidas", "saídas"];
const BALANCE_ALIASES = ["saldo", "balance"];

// Parse CSV com detecção automática de separador (; , \t)
function parseCsvText(text: string): string[][] {
    // Remove BOM
    const cleaned = text.replace(/^\uFEFF/, "");
    const lines = cleaned.split(/\r?\n/).filter(l => l.length > 0);
    if (lines.length === 0) return [];

    // Detectar separador: conta ocorrências de ; vs , vs \t na primeira linha não vazia
    const sample = lines.slice(0, Math.min(5, lines.length)).join("\n");
    const semicolons = (sample.match(/;/g) || []).length;
    const tabs = (sample.match(/\t/g) || []).length;
    const commas = (sample.match(/,/g) || []).length;

    let sep = ",";
    if (semicolons >= tabs && semicolons >= commas) sep = ";";
    else if (tabs > commas) sep = "\t";

    return lines.map(line => {
        // Suporte simples a campos entre aspas
        const result: string[] = [];
        let current = "";
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') { inQuotes = !inQuotes; continue; }
            if (ch === sep && !inQuotes) { result.push(current.trim()); current = ""; continue; }
            current += ch;
        }
        result.push(current.trim());
        return result;
    });
}

function findColumnIndex(headers: string[], aliases: string[]): number {
  const normalized = headers.map((h) => h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim());
  for (const alias of aliases) {
    const norm = alias.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const idx = normalized.indexOf(norm);
    if (idx >= 0) return idx;
  }
  // Busca parcial
  for (const alias of aliases) {
    const norm = alias.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const idx = normalized.findIndex((h) => h.includes(norm));
    if (idx >= 0) return idx;
  }
  return -1;
}

async function loadRows(file: File): Promise<string[][]> {
  const isCsv = /\.csv$/i.test(file.name);

  if (isCsv) {
    // Parser CSV próprio — detecta separador ; , \t e preserva strings brasileiras
    const text = await file.text();
    return parseCsvText(text);
  }

  // Excel (.xlsx/.xls) — ler como string para preservar valores brasileiros como "1.234,56"
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true, raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Planilha vazia");
  const sheet = workbook.Sheets[sheetName];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  return rows.map(r => r.map(c => String(c || "")));
}

export async function parseBankStatementExcel(file: File): Promise<ExcelParsedTransaction[]> {
  const rows = await loadRows(file);

  if (rows.length < 2) throw new Error("Planilha sem dados suficientes");

  // Encontrar a linha de cabeçalho
  let headerRowIdx = -1;
  let dateCol = -1;
  let histCol = -1;
  let descCol = -1;
  let amountCol = -1;
  let creditCol = -1;
  let debitCol = -1;
  let balanceCol = -1;

  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i].map((c: any) => String(c || ""));
    const dIdx = findColumnIndex(row, DATE_ALIASES);
    if (dIdx < 0) continue;

    const aIdx = findColumnIndex(row, AMOUNT_ALIASES);
    const cIdx = findColumnIndex(row, CREDIT_ALIASES);
    const dbtIdx = findColumnIndex(row, DEBIT_ALIASES);

    if (aIdx >= 0 || (cIdx >= 0 && dbtIdx >= 0)) {
      headerRowIdx = i;
      dateCol = dIdx;
      histCol = findColumnIndex(row, HIST_ALIASES);
      descCol = findColumnIndex(row, DESC_ALIASES);
      amountCol = aIdx;
      creditCol = cIdx;
      debitCol = dbtIdx;
      balanceCol = findColumnIndex(row, BALANCE_ALIASES);
      break;
    }
  }

  if (headerRowIdx < 0 || dateCol < 0) {
    throw new Error(
      "Não foi possível identificar as colunas do extrato. " +
      "A planilha deve ter colunas como: Data, Descrição, Valor (ou Crédito/Débito)."
    );
  }

  // Evitar confundir hist com desc: se histCol == descCol, manter só descCol
  if (histCol >= 0 && histCol === descCol) histCol = -1;

  // Se não achou nenhuma coluna de descrição, usar a coluna após a data
  if (histCol < 0 && descCol < 0) {
    descCol = dateCol + 1;
  }

  const parsed: ExcelParsedTransaction[] = [];

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const dateVal = parseDate(row[dateCol]);
    if (!dateVal) continue;

    // Concatenar Histórico + Descrição (ex: "Pix enviado - Ryan Rissi Marques")
    const histPart = histCol >= 0 ? String(row[histCol] || "").trim() : "";
    const descPart = descCol >= 0 ? String(row[descCol] || "").trim() : "";
    let desc = [histPart, descPart].filter(Boolean).join(" - ");
    if (!desc) continue;

    let amount: number | null = null;

    if (amountCol >= 0 && amountCol !== balanceCol) {
      // Coluna única de valor — ignorar coluna Saldo
      amount = parseAmount(row[amountCol]);
    } else if (creditCol >= 0 && debitCol >= 0) {
      // Colunas separadas crédito/débito
      const credit = parseAmount(row[creditCol]);
      const debit = parseAmount(row[debitCol]);
      if (credit && Math.abs(credit) > 0.001) {
        amount = Math.abs(credit);
      } else if (debit && Math.abs(debit) > 0.001) {
        amount = -Math.abs(debit);
      }
    }

    if (amount === null || !Number.isFinite(amount) || Math.abs(amount) < 0.01) continue;

    parsed.push({
      date: dateVal,
      description: desc.substring(0, 255),
      amount,
      raw: row.map((c: any) => String(c || "")).join(" | "),
    });
  }

  return parsed;
}
