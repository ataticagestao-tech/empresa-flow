/**
 * Extrai dados financeiros de PDFs (boletos, notas fiscais, faturas, demonstrativos)
 * usando pdfjs-dist para ler o texto e regex para parsear campos.
 */
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export interface ExtractedPayable {
  description: string;
  amount: number | null;
  due_date: string | null; // yyyy-MM-dd
  competencia: string | null; // MM/yyyy
  supplier_name: string | null;
  cnpj: string | null;
  barcode: string | null;
  invoice_number: string | null;
  raw_text: string; // para debug
}

/** Extrai texto do PDF preservando posição dos items para melhor parsing */
async function extractText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    // Agrupa por linha (items com Y similar)
    const lines = new Map<number, { x: number; str: string }[]>();
    for (const item of content.items as any[]) {
      if (!item.str || !item.str.trim()) continue;
      const y = Math.round(item.transform[5]); // coordenada Y
      const x = item.transform[4]; // coordenada X
      if (!lines.has(y)) lines.set(y, []);
      lines.get(y)!.push({ x, str: item.str });
    }

    // Ordena por Y decrescente (topo para baixo) e X crescente
    const sortedYs = Array.from(lines.keys()).sort((a, b) => b - a);
    const pageLines: string[] = [];
    for (const y of sortedYs) {
      const items = lines.get(y)!.sort((a, b) => a.x - b.x);
      pageLines.push(items.map(i => i.str).join(" "));
    }
    pages.push(pageLines.join("\n"));
  }

  return pages.join("\n\n");
}

/** Parseia valor monetário brasileiro */
function parseValor(text: string): number | null {
  const candidates: { value: number; priority: number }[] = [];

  // Prioridade 1: label explícito + valor
  const labeled = [
    /(?:valor\s*(?:total|do\s*documento|a\s*pagar|cobrado|l[ií]quido|original))\s*[:=]?\s*R?\$?\s*([\d.,]+)/gi,
    /(?:total\s*(?:a\s*pagar|geral|cobrado|do\s*boleto|l[ií]quido))\s*[:=]?\s*R?\$?\s*([\d.,]+)/gi,
    /(?:vlr?\s*(?:total|documento|pagar))\s*[:=]?\s*R?\$?\s*([\d.,]+)/gi,
  ];
  for (const re of labeled) {
    let m;
    while ((m = re.exec(text)) !== null) {
      const val = parseBRNumber(m[1]);
      if (val && val > 0) candidates.push({ value: val, priority: 1 });
    }
  }

  // Prioridade 2: R$ seguido de número
  const rMatch = /R\$\s*([\d.,]+)/g;
  let m;
  while ((m = rMatch.exec(text)) !== null) {
    const val = parseBRNumber(m[1]);
    if (val && val > 0) candidates.push({ value: val, priority: 2 });
  }

  // Prioridade 3: números grandes no formato BR (ex: 1.234,56)
  const bigNum = /\b(\d{1,3}(?:\.\d{3})*,\d{2})\b/g;
  while ((m = bigNum.exec(text)) !== null) {
    const val = parseBRNumber(m[1]);
    if (val && val >= 10) candidates.push({ value: val, priority: 3 });
  }

  if (!candidates.length) return null;

  // Retorna o de maior prioridade; se empate, o maior valor
  candidates.sort((a, b) => a.priority - b.priority || b.value - a.value);
  return candidates[0].value;
}

function parseBRNumber(raw: string): number | null {
  if (!raw) return null;
  const clean = raw.replace(/\./g, "").replace(",", ".");
  const val = parseFloat(clean);
  if (isNaN(val) || val <= 0 || val >= 100_000_000) return null;
  return val;
}

/** Parseia todas as datas do texto e retorna a mais provável de vencimento */
function parseData(text: string): string | null {
  // Prioridade 1: vencimento explícito
  const vencPatterns = [
    /(?:vencimento|data\s*(?:de\s*)?vencimento|venc\.?|dt\.?\s*venc\.?)\s*[:=]?\s*(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{2,4})/gi,
  ];
  for (const re of vencPatterns) {
    const m = re.exec(text);
    if (m) {
      const d = parseDateBR(m[1]);
      if (d) return d;
    }
  }

  // Prioridade 2: todas as datas, pega a mais futura (provavelmente vencimento)
  const allDates: string[] = [];
  const dateRe = /(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})/g;
  let m;
  while ((m = dateRe.exec(text)) !== null) {
    const d = parseDateBR(m[1]);
    if (d) allDates.push(d);
  }

  if (allDates.length === 0) return null;
  // A data mais futura tende a ser o vencimento
  allDates.sort((a, b) => b.localeCompare(a));
  return allDates[0];
}

function parseDateBR(raw: string): string | null {
  const parts = raw.split(/[\/\-\.]/);
  if (parts.length !== 3) return null;
  let [dd, mm, yyyy] = parts;
  if (yyyy.length === 2) yyyy = "20" + yyyy;
  const d = parseInt(dd), mo = parseInt(mm), y = parseInt(yyyy);
  if (d < 1 || d > 31 || mo < 1 || mo > 12 || y < 2020 || y > 2040) return null;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

/** Extrai competência (mês/ano de referência) */
function parseCompetencia(text: string): string | null {
  // Padrão 1: "Competência: 02/2026" ou "Ref: FEV/2026"
  const patterns = [
    /(?:compet[eê]ncia|refer[eê]ncia|per[ií]odo\s*(?:de\s*)?refer[eê]ncia|ref\.?)\s*[:=]?\s*(\d{2}[\/\-]\d{4})/gi,
    /(?:compet[eê]ncia|refer[eê]ncia|ref\.?)\s*[:=]?\s*([A-Za-z]{3,9}[\/\-]\d{4})/gi,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) {
      const val = m[1].trim();
      // Se formato MM/YYYY
      if (/^\d{2}[\/\-]\d{4}$/.test(val)) return val.replace("-", "/");
      // Se formato MES/YYYY, converte
      const mesMap: Record<string, string> = {
        jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
        jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
      };
      const parts = val.split(/[\/\-]/);
      if (parts.length === 2) {
        const mesKey = parts[0].toLowerCase().substring(0, 3);
        if (mesMap[mesKey]) return `${mesMap[mesKey]}/${parts[1]}`;
      }
    }
  }

  // Fallback: derivar da primeira data encontrada no documento
  const dateRe = /(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})/;
  const m = text.match(dateRe);
  if (m) return `${m[2]}/${m[3]}`; // MM/YYYY da primeira data

  return null;
}

/** Extrai CNPJ */
function parseCNPJ(text: string): string | null {
  const m = text.match(/(\d{2}\.?\d{3}\.?\d{3}[\/]?\d{4}[-]?\d{2})/);
  return m ? m[1] : null;
}

/** Extrai código de barras (47 ou 48 dígitos) */
function parseBarcode(text: string): string | null {
  // Tenta com espaços/pontos (formato tipografia de boleto)
  const spaced = text.match(/(\d{5}[\.\s]?\d{5}[\.\s]?\d{5}[\.\s]?\d{6}[\.\s]?\d{5}[\.\s]?\d{6}[\.\s]?\d[\.\s]?\d{14})/);
  if (spaced) return spaced[1].replace(/[\s.]/g, "");

  const cleaned = text.replace(/[\s.\-]/g, "");
  const m = cleaned.match(/(\d{47,48})/);
  return m ? m[1] : null;
}

/** Extrai número da nota fiscal */
function parseNF(text: string): string | null {
  const patterns = [
    /(?:nota\s*fiscal|NF[-\s]?e?|n[uú]mero\s*(?:da\s*)?(?:nota|NF))\s*[:=\s]*[n°º]?\s*(\d{3,15})/i,
    /(?:documento|doc\.?)\s*[:=\s]*[n°º]?\s*(\d{4,15})/i,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) return m[1];
  }
  return null;
}

/** Extrai nome do fornecedor / beneficiário */
function parseSupplier(text: string): string | null {
  const patterns = [
    /(?:benefici[aá]rio|cedente|fornecedor|raz[aã]o\s*social|favorecido|pagador|empresa|prestador)\s*[:=]?\s*([^\n\r]{5,80})/i,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) {
      let name = m[1].trim()
        .replace(/\s{2,}/g, " ")
        .replace(/CPF.*|CNPJ.*|\d{2}\.\d{3}\.\d{3}.*/i, "")
        .trim();
      // Remove se pegou lixo (só números ou muito curto)
      if (name.length > 3 && !/^\d+$/.test(name)) return name;
    }
  }
  return null;
}

/** Extrai descrição do documento */
function parseDescription(text: string, supplierName: string | null, fileName: string): string {
  const patterns = [
    /(?:descri[cç][aã]o|refer[eê]ncia|hist[oó]rico|discrimina[cç][aã]o|objeto|servi[cç]o)\s*[:=]?\s*([^\n\r]{5,120})/i,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) {
      const desc = m[1].trim().substring(0, 100);
      // Ignora se é lixo (headers de tabela etc)
      if (desc.length > 5 && !/^(c[oó]digo|principal|denomina)/i.test(desc)) return desc;
    }
  }
  // Fallback: nome do fornecedor
  if (supplierName) return `Pagamento - ${supplierName}`;
  // Fallback: nome do arquivo sem extensão
  const cleanName = fileName.replace(/\.pdf$/i, "").replace(/[_-]/g, " ").trim();
  if (cleanName.length > 3) return cleanName;
  return "Conta importada via PDF";
}

/** Função principal: extrai dados do PDF */
export async function extractPayableFromPDF(file: File): Promise<ExtractedPayable> {
  const text = await extractText(file);

  // Log para debug (só em dev)
  console.log("📄 PDF texto extraído:", text.substring(0, 2000));

  const supplier_name = parseSupplier(text);

  return {
    description: parseDescription(text, supplier_name, file.name),
    amount: parseValor(text),
    due_date: parseData(text),
    competencia: parseCompetencia(text),
    supplier_name,
    cnpj: parseCNPJ(text),
    barcode: parseBarcode(text),
    invoice_number: parseNF(text),
    raw_text: text.substring(0, 3000),
  };
}
