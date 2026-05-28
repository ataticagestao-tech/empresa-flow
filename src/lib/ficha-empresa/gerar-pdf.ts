import jsPDF from "jspdf";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface SocioFicha {
  nome_socio?: string | null;
  qualificacao_socio?: string | null;
  data_entrada_sociedade?: string | null;
}

export interface FichaEmpresaData {
  /** Objeto da empresa (campos de companies + responsável + endereço). */
  company: any;
  /** Quadro societário (QSA). */
  qsa?: SocioFicha[];
  /** Mapa regime_tributario → rótulo amigável. */
  regimeLabels?: Record<string, string>;
  /** Logo da empresa em dataURL. Se ausente, usa monograma. */
  logo_base64?: string | null;
  logo_w?: number;
  logo_h?: number;
  /** Cor primária do cabeçalho. Default: verde do sistema. */
  cor_primaria?: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = (hex || "#059669").replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function fmtData(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return format(new Date(String(iso).slice(0, 10) + "T12:00:00"), "dd/MM/yyyy");
  } catch {
    return null;
  }
}

function maskCNPJ(v: string): string {
  const d = (v || "").replace(/\D/g, "");
  if (d.length !== 14) return v;
  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

/**
 * Carrega o logo da empresa (URL) → dataURL + dimensões em mm ajustadas à
 * proporção (cabe numa caixa ~18mm). Null se a imagem não carregar (CORS etc.).
 */
export async function carregarLogoEmpresa(
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
        const box = 18;
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

/** Gera a ficha cadastral da empresa em PDF (A4 retrato, padrão visual do sistema). */
export function gerarFichaEmpresaPDF(data: FichaEmpresaData): Blob {
  const c = data.company || {};
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const cor = data.cor_primaria || "#059669";
  const [cr, cg, cb] = hexToRgb(cor);
  const W = 210;
  const H = 297;
  const margin = 14;
  const contentW = W - margin * 2;
  const headerBandH = 36;
  const bottomLimit = H - 14;

  const nome = c.nome_fantasia || c.razao_social || "Empresa";
  const agora = new Date();
  const emitidoEm = agora.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const codigoDoc = `FICHA-EMP-${agora.getFullYear()}${pad2(agora.getMonth() + 1)}${pad2(agora.getDate())}-${pad2(agora.getHours())}${pad2(agora.getMinutes())}`;
  const ou = (v: any) => (v != null && String(v).trim() ? String(v).trim() : "—");

  /* ── Cabeçalho ── */
  const drawHeader = () => {
    doc.setFillColor(cr, cg, cb);
    doc.rect(0, 0, W, headerBandH, "F");

    // Logo numa caixa branca (qualquer logo aparece bem; senão monograma)
    const boxSize = 22;
    const boxY = (headerBandH - boxSize) / 2;
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin, boxY, boxSize, boxSize, 3, 3, "F");
    if (data.logo_base64) {
      const lw = data.logo_w && data.logo_w > 0 ? data.logo_w : 18;
      const lh = data.logo_h && data.logo_h > 0 ? data.logo_h : 18;
      const fmt = /^data:image\/png/i.test(data.logo_base64) ? "PNG"
        : /^data:image\/jpe?g/i.test(data.logo_base64) ? "JPEG" : "PNG";
      try {
        doc.addImage(data.logo_base64, fmt, margin + (boxSize - lw) / 2, boxY + (boxSize - lh) / 2, lw, lh);
      } catch {
        doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(cr, cg, cb);
        doc.text(nome.charAt(0).toUpperCase(), margin + boxSize / 2, boxY + boxSize / 2 + 2.4, { align: "center" });
      }
    } else {
      doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(cr, cg, cb);
      doc.text(nome.charAt(0).toUpperCase(), margin + boxSize / 2, boxY + boxSize / 2 + 2.4, { align: "center" });
    }

    const tx = margin + boxSize + 6;
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text(doc.splitTextToSize(nome, contentW - boxSize - 6 - 70)[0] || nome, tx, 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(235, 240, 245);
    let ly = 20;
    if (c.razao_social && String(c.razao_social).toLowerCase() !== String(nome).toLowerCase()) {
      doc.text(doc.splitTextToSize(String(c.razao_social), contentW - boxSize - 6 - 70)[0], tx, ly);
      ly += 4.5;
    }
    const linhaInfo = [c.cnpj ? `CNPJ: ${maskCNPJ(c.cnpj)}` : null,
      [c.endereco_cidade, c.endereco_estado].filter(Boolean).join("/") || null].filter(Boolean).join("   ·   ");
    if (linhaInfo) doc.text(linhaInfo, tx, ly);

    // Bloco direito
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("FICHA CADASTRAL", W - margin, 14, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(235, 240, 245);
    doc.text(`Emitido em ${emitidoEm}`, W - margin, 20, { align: "right" });
    doc.setFontSize(7);
    doc.text(`Cód.: ${codigoDoc}`, W - margin, 24.5, { align: "right" });
  };

  let y = headerBandH + 10;

  const novaPagina = () => { doc.addPage(); drawHeader(); return headerBandH + 10; };
  const garantir = (need: number) => { if (y + need > bottomLimit) y = novaPagina(); };

  /* ── Título de seção ── */
  const secaoTitulo = (txt: string) => {
    garantir(12);
    doc.setFillColor(cr, cg, cb);
    doc.roundedRect(margin, y, 2.5, 5, 1, 1, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.setTextColor(30, 41, 57);
    doc.text(txt, margin + 5, y + 4.3);
    y += 9;
  };

  /* ── Grade de campos (2 colunas) ── */
  const campos = (pares: Array<[string, string | null | undefined]>) => {
    const colW = contentW / 2;
    for (let i = 0; i < pares.length; i += 2) {
      const rowPares = pares.slice(i, i + 2);
      garantir(11);
      rowPares.forEach(([rot, val], col) => {
        const x = margin + col * colW;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(150, 158, 170);
        doc.text(rot.toUpperCase(), x, y);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10.5);
        doc.setTextColor(29, 41, 57);
        const linhas = doc.splitTextToSize(ou(val), colW - 4) as string[];
        doc.text(linhas[0] || "—", x, y + 5);
      });
      y += 11;
    }
    y += 3;
  };

  drawHeader();

  // 1 Identificação
  secaoTitulo("Identificação");
  campos([
    ["Razão social", c.razao_social],
    ["Nome fantasia", c.nome_fantasia],
    ["CNPJ", c.cnpj ? maskCNPJ(c.cnpj) : null],
    ["Data de abertura", fmtData(c.data_abertura)],
    ["Inscrição municipal", c.inscricao_municipal],
    ["Inscrição estadual", c.inscricao_estadual],
    ["Situação", c.is_active ? "Ativa" : "Inativa"],
  ]);

  // 2 Endereço e contato
  const enderecoFmt = [
    [c.endereco_logradouro, c.endereco_numero].filter(Boolean).join(", "),
    c.endereco_bairro,
  ].filter(Boolean).join(" — ");
  secaoTitulo("Endereço e Contato");
  campos([
    ["Logradouro", enderecoFmt || null],
    ["Cidade / UF", [c.endereco_cidade, c.endereco_estado].filter(Boolean).join(" / ") || null],
    ["CEP", c.endereco_cep],
    ["E-mail", c.email],
    ["Telefone", c.telefone],
  ]);

  // 3 Regime tributário
  secaoTitulo("Regime Tributário");
  campos([
    ["Regime adotado", c.regime_tributario ? (data.regimeLabels?.[c.regime_tributario] || c.regime_tributario) : null],
  ]);

  // 4 Responsável legal
  secaoTitulo("Responsável Legal");
  campos([
    ["Nome", c.responsavel_nome],
    ["CPF", c.responsavel_cpf],
    ["E-mail", c.responsavel_email],
    ["Telefone", c.responsavel_telefone],
  ]);

  // 5 Quadro societário
  secaoTitulo("Quadro Societário");
  const qsa = data.qsa || [];
  if (qsa.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9.5);
    doc.setTextColor(120, 128, 140);
    garantir(8);
    doc.text("Nenhum sócio localizado na base da Receita Federal para o CNPJ informado.", margin, y);
    y += 8;
  } else {
    const cols = [
      { label: "Sócio", w: contentW * 0.52, align: "left" as const },
      { label: "Qualificação", w: contentW * 0.33, align: "left" as const },
      { label: "Desde", w: contentW * 0.15, align: "left" as const },
    ];
    const colX: number[] = [];
    let ax = margin;
    cols.forEach((cc) => { colX.push(ax); ax += cc.w; });

    const cabecalho = () => {
      garantir(8);
      doc.setFillColor(243, 244, 246);
      doc.rect(margin, y, contentW, 7, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(80, 88, 100);
      cols.forEach((cc, i) => doc.text(cc.label.toUpperCase(), colX[i] + 2, y + 4.6));
      y += 7;
    };
    cabecalho();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    qsa.forEach((s, i) => {
      const nomeLn = doc.splitTextToSize(s.nome_socio || "—", cols[0].w - 4) as string[];
      const qualLn = doc.splitTextToSize(s.qualificacao_socio || "—", cols[1].w - 4) as string[];
      const linhasN = Math.max(nomeLn.length, qualLn.length, 1);
      const rowH = Math.max(7, linhasN * 5 + 2);
      if (y + rowH > bottomLimit) { y = novaPagina(); cabecalho(); doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); }
      if (i % 2 === 0) { doc.setFillColor(250, 250, 251); doc.rect(margin, y, contentW, rowH, "F"); }
      doc.setTextColor(29, 41, 57);
      nomeLn.forEach((ln, k) => doc.text(ln, colX[0] + 2, y + 5 + k * 5));
      qualLn.forEach((ln, k) => doc.text(ln, colX[1] + 2, y + 5 + k * 5));
      doc.text(fmtData(s.data_entrada_sociedade) || "—", colX[2] + 2, y + 5);
      y += rowH;
      doc.setDrawColor(235, 237, 240);
      doc.setLineWidth(0.1);
      doc.line(margin, y, margin + contentW, y);
    });
    y += 3;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(150, 158, 170);
    garantir(6);
    doc.text(`Fonte: BrasilAPI / Receita Federal · consulta em ${format(agora, "dd/MM/yyyy HH:mm")}.`, margin, y);
  }

  /* ── Rodapé em todas as páginas ── */
  const pageCount = (doc.internal as any).getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const fy = H - 8;
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.3);
    doc.line(margin, fy - 3, margin + contentW, fy - 3);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(156, 163, 175);
    doc.text("Ficha cadastral gerada pelo sistema Tatica Gestão.", margin, fy);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(cr, cg, cb);
    doc.text(`Página ${p} de ${pageCount}`, W - margin, fy, { align: "right" });
  }

  return doc.output("blob");
}
