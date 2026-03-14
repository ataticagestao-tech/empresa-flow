import jsPDF from "jspdf";

export interface ReciboPDFData {
  numero: string;
  valor: number;
  favorecido: string;
  forma_pagamento?: string;
  categoria?: string;
  conta_bancaria?: string;
  data_pagamento: string;
  descricao: string;
  empresa_nome: string;
  empresa_cnpj?: string;
  cor_primaria?: string;
  rodape_texto?: string;
  tipo?: "payable" | "receivable";
}

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

export async function gerarReciboPDF(data: ReciboPDFData): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const cor = data.cor_primaria || "#0d1b2a";
  const [cr, cg, cb] = hexToRgb(cor);
  const tipoLabel = data.tipo === "receivable" ? "COMPROVANTE DE RECEBIMENTO" : "COMPROVANTE DE PAGAMENTO";
  const statusLabel = data.tipo === "receivable" ? "VALOR RECEBIDO" : "VALOR PAGO";
  const W = 210;
  const margin = 20;
  const contentW = W - margin * 2;
  let y = margin;

  // ── Header: empresa + tipo documento ──
  doc.setFillColor(cr, cg, cb);
  doc.rect(0, 0, W, 38, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text(data.empresa_nome, margin, 18);

  if (data.empresa_cnpj) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(200, 210, 220);
    doc.text(`CNPJ: ${data.empresa_cnpj}`, margin, 26);
  }

  // Badge tipo documento (lado direito)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  const badgeW = doc.getTextWidth(tipoLabel) + 12;
  doc.setFillColor(255, 255, 255, 0.15);
  doc.roundedRect(W - margin - badgeW, 12, badgeW, 8, 2, 2, "F");
  doc.text(tipoLabel, W - margin - badgeW + 6, 17.5);

  // Número do recibo
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(200, 210, 220);
  doc.text(`N.º ${data.numero}`, W - margin - badgeW + 6, 25);

  y = 50;

  // ── Status block (valor pago) ──
  doc.setFillColor(240, 253, 244); // #f0fdf4
  doc.roundedRect(margin, y, contentW, 28, 4, 4, "F");
  doc.setDrawColor(187, 247, 208); // #bbf7d0
  doc.roundedRect(margin, y, contentW, 28, 4, 4, "S");

  // Check circle
  doc.setFillColor(34, 197, 94); // #22c55e
  doc.circle(margin + 14, y + 14, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text("✓", margin + 11.5, y + 17.5);

  // Status text
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(22, 163, 74); // #16a34a
  doc.text(statusLabel, margin + 26, y + 10);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(21, 128, 61); // #15803d
  doc.text(fmt(data.valor), margin + 26, y + 22);

  y += 38;

  // ── Section title: Detalhes ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(cr, cg, cb);
  doc.text("DETALHES", margin, y);
  y += 3;
  doc.setDrawColor(cr, cg, cb);
  doc.setLineWidth(0.5);
  doc.line(margin, y, margin + contentW, y);
  y += 8;

  // ── Data rows ──
  const rows: { label: string; value: string }[] = [
    { label: "Favorecido / Pagador", value: data.favorecido || "-" },
    { label: "Descrição", value: data.descricao || "-" },
    { label: "Data do Pagamento", value: data.data_pagamento },
    ...(data.categoria ? [{ label: "Categoria", value: data.categoria }] : []),
    ...(data.conta_bancaria ? [{ label: "Conta Bancária", value: data.conta_bancaria }] : []),
    ...(data.forma_pagamento ? [{ label: "Forma de Pagamento", value: data.forma_pagamento }] : []),
  ];

  rows.forEach((row, i) => {
    // Zebra striping
    if (i % 2 === 0) {
      doc.setFillColor(249, 250, 251); // #f9fafb
      doc.rect(margin, y - 4, contentW, 10, "F");
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128); // #6b7280
    doc.text(row.label, margin + 4, y + 2);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(26, 26, 26);
    doc.text(row.value, margin + 68, y + 2);

    // Separator line
    doc.setDrawColor(243, 244, 246); // #f3f4f6
    doc.setLineWidth(0.2);
    doc.line(margin, y + 6, margin + contentW, y + 6);

    y += 10;
  });

  y += 10;

  // ── Footer ──
  const footerY = 277;
  doc.setDrawColor(229, 231, 235); // #e5e7eb
  doc.setLineWidth(0.3);
  doc.line(margin, footerY, margin + contentW, footerY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(156, 163, 175); // #9ca3af
  doc.text(
    data.rodape_texto || "Documento gerado automaticamente pelo sistema Tática Gestão.",
    margin,
    footerY + 5
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(cr, cg, cb);
  doc.text("Tática Gestão", W - margin, footerY + 5, { align: "right" });

  return doc.output("blob");
}

export function downloadBlob(blob: Blob, nomeArquivo: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
