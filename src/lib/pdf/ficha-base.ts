import jsPDF from "jspdf";

/**
 * Carrega um logo (URL) → dataURL PNG + dimensões em mm ajustadas à proporção
 * (cabe numa caixa ~16mm). Null se a imagem não carregar (CORS, formato, etc.).
 */
export async function carregarLogoFicha(
  url: string | null | undefined,
): Promise<{ dataUrl: string; w: number; h: number } | null> {
  if (!url) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL("image/png");
        const ratio = img.naturalWidth / img.naturalHeight || 1;
        const box = 16;
        let w = box, h = box;
        if (ratio >= 1) { w = box; h = box / ratio; } else { h = box; w = box * ratio; }
        resolve({ dataUrl, w, h });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export interface CabecalhoFichaOpts {
  W: number;
  margin: number;
  /** Cor primária já convertida em RGB. */
  cor: [number, number, number];
  empresaNome: string;
  empresaRazao?: string | null;
  empresaCnpj?: string | null;
  empresaLocal?: string | null;
  /** Título do documento, ex.: "FICHA DO CLIENTE". */
  titulo: string;
  /** Prefixo do código, ex.: "FICHA-CLI". */
  codigoPrefixo?: string;
  logo_base64?: string | null;
  logo_w?: number;
  logo_h?: number;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Desenha a faixa de cabeçalho padrão (logo + empresa + título + emissão + código).
 * Retorna o Y onde o corpo do documento deve começar.
 */
export function desenharCabecalhoFicha(doc: jsPDF, o: CabecalhoFichaOpts): number {
  const [cr, cg, cb] = o.cor;
  const bandH = 32;
  const empNome = o.empresaNome || "Empresa";

  doc.setFillColor(cr, cg, cb);
  doc.rect(0, 0, o.W, bandH, "F");

  // Caixa branca do logo
  const boxSize = 20;
  const boxY = (bandH - boxSize) / 2;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(o.margin, boxY, boxSize, boxSize, 3, 3, "F");
  let drew = false;
  if (o.logo_base64) {
    const lw = o.logo_w && o.logo_w > 0 ? o.logo_w : 16;
    const lh = o.logo_h && o.logo_h > 0 ? o.logo_h : 16;
    const fmt = /^data:image\/png/i.test(o.logo_base64) ? "PNG"
      : /^data:image\/jpe?g/i.test(o.logo_base64) ? "JPEG" : "PNG";
    try {
      doc.addImage(o.logo_base64, fmt, o.margin + (boxSize - lw) / 2, boxY + (boxSize - lh) / 2, lw, lh);
      drew = true;
    } catch { drew = false; }
  }
  if (!drew) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(cr, cg, cb);
    doc.text(empNome.charAt(0).toUpperCase(), o.margin + boxSize / 2, boxY + boxSize / 2 + 2.2, { align: "center" });
  }

  // Bloco empresa (esquerda)
  const tx = o.margin + boxSize + 6;
  const leftW = o.W - o.margin * 2 - boxSize - 6 - 66;
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(doc.splitTextToSize(empNome, leftW)[0] || empNome, tx, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(235, 240, 245);
  let ly = 19;
  if (o.empresaRazao && String(o.empresaRazao).toLowerCase() !== String(empNome).toLowerCase()) {
    doc.text(doc.splitTextToSize(String(o.empresaRazao), leftW)[0], tx, ly);
    ly += 4.3;
  }
  const info = [o.empresaCnpj ? `CNPJ: ${o.empresaCnpj}` : null, o.empresaLocal || null].filter(Boolean).join("   ·   ");
  if (info) doc.text(info, tx, ly);

  // Bloco documento (direita)
  const agora = new Date();
  const emitidoEm = agora.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const codigoDoc = `${o.codigoPrefixo || "DOC"}-${agora.getFullYear()}${pad2(agora.getMonth() + 1)}${pad2(agora.getDate())}-${pad2(agora.getHours())}${pad2(agora.getMinutes())}`;
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(o.titulo, o.W - o.margin, 13, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(235, 240, 245);
  doc.text(`Emitido em ${emitidoEm}`, o.W - o.margin, 19, { align: "right" });
  doc.setFontSize(7);
  doc.text(`Cód.: ${codigoDoc}`, o.W - o.margin, 23.5, { align: "right" });

  return bandH + 8;
}

/** Desenha o rodapé padrão (linha + texto + paginação) em todas as páginas. */
export function desenharRodapeFichas(
  doc: jsPDF,
  o: { W: number; H: number; margin: number; cor: [number, number, number]; texto?: string },
) {
  const [cr, cg, cb] = o.cor;
  const contentW = o.W - o.margin * 2;
  const pageCount = (doc.internal as any).getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const fy = o.H - 10;
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.3);
    doc.line(o.margin, fy - 3, o.margin + contentW, fy - 3);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(156, 163, 175);
    doc.text(o.texto || "Documento gerado pelo sistema Tatica Gestão.", o.margin, fy);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(cr, cg, cb);
    doc.text(`Página ${p} de ${pageCount}`, o.W - o.margin, fy, { align: "right" });
  }
}

/** Dispara o download do Blob como arquivo .pdf. */
export function baixarFichaPDF(blob: Blob, baseName: string) {
  const slug = String(baseName || "ficha")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ficha-${slug}-${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
