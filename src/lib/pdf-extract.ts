/**
 * Extrai dados financeiros de PDFs (boletos, notas fiscais, faturas)
 * usando pdfjs-dist para ler o texto e regex para parsear campos.
 */
import * as pdfjsLib from "pdfjs-dist";

// Worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export interface ExtractedPayable {
  description: string;
  amount: number | null;
  due_date: string | null; // yyyy-MM-dd
  supplier_name: string | null;
  cnpj: string | null;
  barcode: string | null;
  invoice_number: string | null;
}

/** Extrai todo o texto de um PDF File */
async function extractText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item: any) => item.str)
      .join(" ");
    pages.push(text);
  }
  return pages.join("\n");
}

/** Parseia valor monetário brasileiro: "1.234,56" ou "R$ 1.234,56" */
function parseValor(text: string): number | null {
  // Tenta múltiplos padrões
  const patterns = [
    /(?:valor\s*(?:total|do\s*documento|a\s*pagar|cobrado|liquido|l[ií]quido))\s*[:=]?\s*R?\$?\s*([\d.,]+)/i,
    /(?:total\s*(?:a\s*pagar|geral|cobrado|do\s*boleto))\s*[:=]?\s*R?\$?\s*([\d.,]+)/i,
    /R\$\s*([\d.,]+)/,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) {
      const raw = m[1].replace(/\./g, "").replace(",", ".");
      const val = parseFloat(raw);
      if (!isNaN(val) && val > 0 && val < 100_000_000) return val;
    }
  }
  return null;
}

/** Parseia data brasileira dd/MM/yyyy */
function parseData(text: string): string | null {
  const patterns = [
    /(?:vencimento|data\s*de\s*vencimento|venc\.?)\s*[:=]?\s*(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})/i,
    /(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})/,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) {
      const parts = m[1].split(/[\/\-\.]/);
      if (parts.length === 3) {
        const [dd, mm, yyyy] = parts;
        const d = parseInt(dd), mo = parseInt(mm), y = parseInt(yyyy);
        if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && y >= 2020 && y <= 2040) {
          return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
        }
      }
    }
  }
  return null;
}

/** Extrai CNPJ */
function parseCNPJ(text: string): string | null {
  const m = text.match(/(\d{2}\.?\d{3}\.?\d{3}[\/]?\d{4}[-]?\d{2})/);
  return m ? m[1] : null;
}

/** Extrai código de barras (47 ou 48 dígitos) */
function parseBarcode(text: string): string | null {
  const cleaned = text.replace(/[\s.\-]/g, "");
  const m = cleaned.match(/(\d{47,48})/);
  return m ? m[1] : null;
}

/** Extrai número da nota fiscal */
function parseNF(text: string): string | null {
  const patterns = [
    /(?:nota\s*fiscal|NF|NF-e|NFe|n[uú]mero\s*(?:da\s*)?(?:nota|NF))\s*[:=\s]*[n°º]?\s*(\d{3,15})/i,
    /(?:n[uú]mero|n[°º])\s*[:=]?\s*(\d{4,15})/i,
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
    /(?:benefici[aá]rio|cedente|fornecedor|raz[aã]o\s*social|favorecido|sacado)\s*[:=]?\s*([^\n\r]{5,80})/i,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) {
      // Limpa o nome
      let name = m[1].trim()
        .replace(/\s{2,}/g, " ")
        .replace(/CPF.*|CNPJ.*/i, "")
        .trim();
      if (name.length > 3) return name;
    }
  }
  return null;
}

/** Extrai descrição / título do documento */
function parseDescription(text: string, supplierName: string | null): string {
  // Tenta encontrar referência ou descrição no documento
  const patterns = [
    /(?:descri[cç][aã]o|refer[eê]ncia|hist[oó]rico|discrimina[cç][aã]o)\s*[:=]?\s*([^\n\r]{5,100})/i,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) return m[1].trim().substring(0, 100);
  }
  // Fallback: usa nome do fornecedor ou nome do arquivo
  if (supplierName) return `Pagamento - ${supplierName}`;
  return "Conta importada via PDF";
}

/** Função principal: extrai dados do PDF */
export async function extractPayableFromPDF(file: File): Promise<ExtractedPayable> {
  const text = await extractText(file);
  const supplier_name = parseSupplier(text);

  return {
    description: parseDescription(text, supplier_name),
    amount: parseValor(text),
    due_date: parseData(text),
    supplier_name,
    cnpj: parseCNPJ(text),
    barcode: parseBarcode(text),
    invoice_number: parseNF(text),
  };
}
