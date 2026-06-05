import jsPDF from "jspdf";

// ─── Tipos ──────────────────────────────────────────────────────────
export interface PontoDiaPDF {
  /** Ex.: "Seg 04/05" */
  rotulo: string;
  /** Ex.: "09:00 → 19:30" (ou "" quando ausência) */
  horario: string;
  /** Horas trabalhadas em decimal (ou null) */
  horas: number | null;
  /** Horas extras do dia (decimal) */
  extra: number;
  /** Horas faltantes do dia (decimal) */
  faltante: number;
  /** Rótulo de ausência: "Feriado", "Folga", "Falta"… (ou null) */
  ausencia: string | null;
}

export interface PontoSemanaPDF {
  num: number;
  /** Ex.: "04/05 a 09/05" */
  periodo: string;
  dias: number;
  horas: number;
  extra: number;
  faltante: number;
  pontos: PontoDiaPDF[];
}

export interface PontoSemanalPDFData {
  empresa_nome: string;
  empresa_cnpj?: string | null;
  empresa_razao_social?: string | null;
  empresa_local?: string | null;
  /** Nome da funcionária */
  funcionaria: string;
  /** Ex.: "Maio 2026" */
  competencia: string;
  semanas: PontoSemanaPDF[];
  total: { dias: number; horas: number; extra: number; faltante: number };
  cor_primaria?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

/** Decimal de horas (8.69) → "8h41". Usa traço para nulo. */
function fmtH(dec: number | null | undefined): string {
  if (dec == null || isNaN(Number(dec))) return "—";
  const min = Math.round(Number(dec) * 60);
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0 && m === 0) return "0h";
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, "0")}`;
}

/** Resultado líquido com sinal: "+15h04" / "−2h12" / "0h". */
function fmtSigned(dec: number): string {
  if (Math.abs(dec) < 1 / 120) return "0h"; // < ~0,5min ≈ zero
  return (dec >= 0 ? "+" : "−") + fmtH(Math.abs(dec));
}

/**
 * Relatório de ponto por semana de UMA funcionária, com extra, faltante e
 * o resultado líquido (extra − faltante). Documento próprio (A4 retrato)
 * com cabeçalho/rodapé no mesmo padrão dos demais relatórios do sistema.
 */
export function gerarPontoSemanalPDF(data: PontoSemanalPDFData): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const cor = data.cor_primaria || "#059669";
  const [cr, cg, cb] = hexToRgb(cor);
  const W = 210;
  const H = 297;
  const margin = 12;
  const contentW = W - margin * 2; // 186mm

  // Colunas (somam contentW): Dia | Horário | Horas | Extra | Faltante | Result.
  const cols = [
    { key: "dia", header: "Dia", w: 38, align: "left" as const },
    { key: "horario", header: "Horário", w: 42, align: "left" as const },
    { key: "horas", header: "Horas", w: 24, align: "center" as const },
    { key: "extra", header: "Extra", w: 26, align: "right" as const },
    { key: "faltante", header: "Faltante", w: 28, align: "right" as const },
    { key: "result", header: "Result.", w: 28, align: "right" as const },
  ];
  const colX: number[] = [];
  let acc = margin;
  for (const c of cols) { colX.push(acc); acc += c.w; }
  const cellX = (i: number, pad = 2) =>
    cols[i].align === "right" ? colX[i] + cols[i].w - pad
      : cols[i].align === "center" ? colX[i] + cols[i].w / 2
        : colX[i] + pad;

  const headerBandH = 32;
  const bottomLimit = H - 14;

  const agora = new Date();
  const emitidoEm = agora.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const codigoDoc = `REL-PON-${agora.getFullYear()}${pad2(agora.getMonth() + 1)}${pad2(agora.getDate())}-${pad2(agora.getHours())}${pad2(agora.getMinutes())}`;

  let y = 0;

  const drawHeader = () => {
    doc.setFillColor(cr, cg, cb);
    doc.rect(0, 0, W, headerBandH, "F");

    // Monograma com a inicial da empresa.
    const s = 16;
    const ly = (headerBandH - s) / 2;
    const inicial = (data.empresa_nome || "?").trim().charAt(0).toUpperCase() || "?";
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin, ly, s, s, 3, 3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.setTextColor(cr, cg, cb);
    doc.text(inicial, margin + s / 2, ly + s / 2 + 2.2, { align: "center" });
    const textX = margin + s + 5;
    const leftMaxW = W - margin - 72 - textX;

    // Esquerda: empresa.
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(255, 255, 255);
    doc.text(doc.splitTextToSize(data.empresa_nome, leftMaxW)[0] || data.empresa_nome, textX, 13);

    let yy = 19;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(225, 235, 240);
    const razao = data.empresa_razao_social?.trim();
    if (razao && razao.toLowerCase() !== data.empresa_nome.trim().toLowerCase()) {
      doc.text(doc.splitTextToSize(razao, leftMaxW)[0], textX, yy);
      yy += 5;
    }
    const infoParts = [
      data.empresa_cnpj ? `CNPJ: ${data.empresa_cnpj}` : null,
      data.empresa_local || null,
    ].filter(Boolean);
    if (infoParts.length) doc.text(infoParts.join("   ·   "), textX, yy);

    // Direita: título + datas.
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.text("PONTO · SEMANAL", W - margin, 13, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(225, 235, 240);
    doc.text(`Emitido em ${emitidoEm}`, W - margin, 19, { align: "right" });
    doc.setFontSize(7);
    doc.text(`Cód.: ${codigoDoc}`, W - margin, 23.5, { align: "right" });
  };

  // Faixa com nome da funcionária + competência.
  const drawSubtitulo = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(29, 41, 57);
    doc.text(data.funcionaria, margin, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(110, 118, 130);
    doc.text(data.competencia, W - margin, y, { align: "right" });
    y += 5;
  };

  const drawColHeaders = () => {
    doc.setFillColor(243, 244, 246);
    doc.rect(margin, y - 4, contentW, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(80, 88, 100);
    cols.forEach((c, i) => doc.text(c.header.toUpperCase(), cellX(i), y, { align: c.align }));
    y += 5;
    doc.setDrawColor(cr, cg, cb);
    doc.setLineWidth(0.3);
    doc.line(margin, y - 1.5, margin + contentW, y - 1.5);
  };

  const startPage = (first: boolean) => {
    if (!first) doc.addPage();
    drawHeader();
    y = headerBandH + 9;
    drawSubtitulo();
    drawColHeaders();
  };

  const ensure = (need: number) => {
    if (y + need > bottomLimit) startPage(false);
  };

  startPage(true);

  // ── Corpo: cada semana é uma seção ──
  data.semanas.forEach((sem) => {
    ensure(16);

    // Barra da semana.
    const resSemana = sem.extra - sem.faltante;
    doc.setFillColor(237, 240, 244);
    doc.rect(margin, y - 3.5, contentW, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(45, 55, 72);
    doc.text(`Semana ${sem.num}`, margin + 2, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(110, 118, 130);
    doc.text(sem.periodo, margin + 24, y);
    // Resumo à direita da barra.
    doc.setFont("helvetica", "bold");
    doc.setTextColor(45, 55, 72);
    doc.text(`${sem.dias} d`, colX[2] + cols[2].w / 2, y, { align: "center" });
    doc.setTextColor(234, 88, 12);
    doc.text(sem.extra > 0 ? "+" + fmtH(sem.extra) : "—", cellX(3), y, { align: "right" });
    doc.setTextColor(220, 38, 38);
    doc.text(sem.faltante > 0 ? "−" + fmtH(sem.faltante) : "—", cellX(4), y, { align: "right" });
    doc.setTextColor(resSemana >= 0 ? 5 : 220, resSemana >= 0 ? 150 : 38, resSemana >= 0 ? 105 : 38);
    doc.text(fmtSigned(resSemana), cellX(5), y, { align: "right" });
    y += 6;

    // Linhas diárias.
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    sem.pontos.forEach((d, di) => {
      ensure(5.5);
      if (di % 2 === 0) {
        doc.setFillColor(252, 252, 253);
        doc.rect(margin, y - 2.6, contentW, 5, "F");
      }
      doc.setTextColor(29, 41, 57);
      doc.text(d.rotulo, cellX(0), y);
      doc.setTextColor(90, 98, 110);
      if (d.ausencia) {
        doc.text(d.ausencia, cellX(1), y);
      } else {
        doc.text(d.horario || "—", cellX(1), y);
        doc.setTextColor(29, 41, 57);
        doc.text(d.horas != null ? fmtH(d.horas) : "—", cellX(2), y, { align: "center" });
        if (d.extra > 0) {
          doc.setTextColor(234, 88, 12);
          doc.text("+" + fmtH(d.extra), cellX(3), y, { align: "right" });
        }
        if (d.faltante > 0) {
          doc.setTextColor(220, 38, 38);
          doc.text("−" + fmtH(d.faltante), cellX(4), y, { align: "right" });
        }
        const rd = d.extra - d.faltante;
        if (Math.abs(rd) >= 1 / 120) {
          doc.setTextColor(rd >= 0 ? 5 : 220, rd >= 0 ? 150 : 38, rd >= 0 ? 105 : 38);
          doc.text(fmtSigned(rd), cellX(5), y, { align: "right" });
        }
      }
      y += 5;
    });
    y += 2;
  });

  // ── Caixa de consolidado do mês ──
  ensure(20);
  const t = data.total;
  const resMes = t.extra - t.faltante;
  y += 2;
  doc.setFillColor(cr, cg, cb);
  doc.roundedRect(margin, y - 1, contentW, 16, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text("CONSOLIDADO DO MÊS", margin + 4, y + 5.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`${t.dias} dias trabalhados`, margin + 4, y + 11);

  // Blocos numéricos à direita.
  const bloco = (rotulo: string, valor: string, xRight: number) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(225, 235, 240);
    doc.text(rotulo, xRight, y + 4.5, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text(valor, xRight, y + 11, { align: "right" });
  };
  bloco("Trabalhadas", fmtH(t.horas), margin + contentW - 96);
  bloco("Extra", t.extra > 0 ? "+" + fmtH(t.extra) : "0h", margin + contentW - 64);
  bloco("Faltante", t.faltante > 0 ? "−" + fmtH(t.faltante) : "0h", margin + contentW - 30);
  bloco("Resultado", fmtSigned(resMes), margin + contentW - 2);
  y += 16;

  // ── Rodapé em todas as páginas ──
  const pageCount = (doc.internal as any).getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const fy = H - 7;
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.3);
    doc.line(margin, fy - 3, margin + contentW, fy - 3);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(156, 163, 175);
    doc.text("Documento gerado pelo sistema Tatica Gestão.", margin, fy);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(cr, cg, cb);
    doc.text(`Página ${p} de ${pageCount}`, W - margin, fy, { align: "right" });
  }

  return doc.output("blob");
}
