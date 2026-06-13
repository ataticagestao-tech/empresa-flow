import jsPDF from "jspdf";
import { desenharCabecalhoFicha, desenharRodapeFichas, carregarLogoFicha } from "@/lib/pdf/ficha-base";

// ============================================================================
// Demonstrativo de Repasse de Comissão (tipo holerite do profissional)
// Cabeçalho (empresa + profissional + período) → tabela de procedimentos →
// deduções discriminadas → resumo Bruto / Deduções / Líquido.
// Modelado em src/lib/funcionario-pdf/gerar-pdf.ts, reusando ficha-base.
// ============================================================================

export interface DemonstrativoItem {
  data_venda: string;
  cliente_nome: string | null;
  descricao: string | null;
  base_valor: number;
  comissao_tipo: string | null;
  comissao_percentual: number | null;
  valor_comissao: number;
}

export interface DemonstrativoDeducao {
  tipo: string;            // ir | sala | materiais | adiantamento | outros
  descricao?: string | null;
  valor: number;
}

export interface DemonstrativoData {
  empresa_nome: string;
  empresa_cnpj?: string | null;
  empresa_razao?: string | null;
  empresa_local?: string | null;
  logo_url?: string | null;
  profissional_nome: string;
  profissional_cpf?: string | null;
  periodo_inicio: string;
  periodo_fim: string;
  itens: DemonstrativoItem[];
  deducoes: DemonstrativoDeducao[];
  valor_bruto: number;
  total_deducoes: number;
  valor_liquido: number;
  cor_primaria?: string;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

const fmtData = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + "T12:00:00" : iso;
  const d = new Date(parsed);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
};

const fmtRegra = (i: DemonstrativoItem): string =>
  i.comissao_tipo === "valor" ? "R$/un" : i.comissao_percentual != null ? `${Number(i.comissao_percentual)}%` : "—";

const tipoDeducaoLabel = (t: string): string => {
  const map: Record<string, string> = {
    ir: "IR retido na fonte",
    sala: "Taxa de sala/consultório",
    materiais: "Materiais utilizados",
    adiantamento: "Adiantamento",
    outros: "Outros",
  };
  return map[t] || t;
};

function hexToRgb(hex: string): [number, number, number] {
  const h = (hex || "#059669").replace("#", "");
  return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
}

export async function gerarDemonstrativoRepassePDF(data: DemonstrativoData): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const [cr, cg, cb] = hexToRgb(data.cor_primaria || "#059669");
  const W = 210, H = 297, margin = 18;
  const contentW = W - margin * 2;
  let y = 0;
  let bodyTop = 40;
  const logo = await carregarLogoFicha(data.logo_url);

  const drawHeader = () => {
    bodyTop = desenharCabecalhoFicha(doc, {
      W, margin, cor: [cr, cg, cb],
      empresaNome: data.empresa_nome,
      empresaRazao: data.empresa_razao,
      empresaCnpj: data.empresa_cnpj,
      empresaLocal: data.empresa_local,
      titulo: "DEMONSTRATIVO DE REPASSE",
      codigoPrefixo: "REP",
      logo_base64: logo?.dataUrl ?? null,
      logo_w: logo?.w,
      logo_h: logo?.h,
    });
  };

  const ensureSpace = (needed: number) => {
    if (y + needed > H - 18) {
      doc.addPage();
      drawHeader();
      y = bodyTop;
    }
  };

  const drawSectionTitle = (title: string) => {
    ensureSpace(12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(cr, cg, cb);
    doc.text(title, margin, y);
    y += 2;
    doc.setDrawColor(cr, cg, cb);
    doc.setLineWidth(0.4);
    doc.line(margin, y, margin + contentW, y);
    y += 6;
  };

  drawHeader();
  y = bodyTop;

  // ── Identificação do profissional + período ──────────────────────────────
  doc.setFillColor(246, 242, 235);
  ensureSpace(20);
  doc.roundedRect(margin, y, contentW, 16, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(29, 41, 57);
  doc.text(data.profissional_nome || "Profissional", margin + 4, y + 6.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(110, 120, 130);
  const subInfo = [
    data.profissional_cpf ? `CPF: ${data.profissional_cpf}` : null,
    `Período: ${fmtData(data.periodo_inicio)} a ${fmtData(data.periodo_fim)}`,
  ].filter(Boolean).join("    ·    ");
  doc.text(subInfo, margin + 4, y + 12);
  y += 22;

  // ── Tabela de procedimentos ──────────────────────────────────────────────
  drawSectionTitle("Procedimentos realizados");

  // Colunas: Data | Cliente | Serviço/Produto | Base | Regra | Comissão
  const cData = margin;
  const cCli = margin + 22;
  const cServ = margin + 70;
  const cBase = margin + 130;
  const cRegra = margin + 152;
  const cCom = margin + contentW;

  const drawTableHead = () => {
    ensureSpace(8);
    doc.setFillColor(cr, cg, cb);
    doc.rect(margin, y - 4, contentW, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text("DATA", cData + 1, y);
    doc.text("CLIENTE", cCli, y);
    doc.text("SERVIÇO/PRODUTO", cServ, y);
    doc.text("BASE", cBase + 18, y, { align: "right" });
    doc.text("REGRA", cRegra + 6, y, { align: "center" });
    doc.text("COMISSÃO", cCom, y, { align: "right" });
    y += 6;
  };

  drawTableHead();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  data.itens.forEach((it, idx) => {
    ensureSpace(6);
    if (y > bodyTop + 6 && idx > 0 && (y - bodyTop) < 7) drawTableHead();
    if (idx % 2 === 1) {
      doc.setFillColor(250, 250, 247);
      doc.rect(margin, y - 3.6, contentW, 5.4, "F");
    }
    doc.setTextColor(85, 90, 100);
    doc.text(fmtData(it.data_venda), cData + 1, y);
    doc.setTextColor(29, 41, 57);
    doc.text((doc.splitTextToSize(it.cliente_nome || "—", cServ - cCli - 2)[0]) || "—", cCli, y);
    doc.text((doc.splitTextToSize(it.descricao || "—", cBase - cServ - 2)[0]) || "—", cServ, y);
    doc.setTextColor(85, 90, 100);
    doc.text(fmt(it.base_valor), cBase + 18, y, { align: "right" });
    doc.setTextColor(120, 125, 135);
    doc.text(fmtRegra(it), cRegra + 6, y, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setTextColor(29, 41, 57);
    doc.text(fmt(it.valor_comissao), cCom, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    y += 5.4;
  });

  // Subtotal bruto
  ensureSpace(8);
  doc.setDrawColor(210, 214, 220);
  doc.setLineWidth(0.3);
  doc.line(margin, y - 1, margin + contentW, y - 1);
  y += 3;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(29, 41, 57);
  doc.text("Total bruto (comissões)", cBase - 6, y, { align: "right" });
  doc.text(fmt(data.valor_bruto), cCom, y, { align: "right" });
  y += 9;

  // ── Deduções ─────────────────────────────────────────────────────────────
  if (data.deducoes && data.deducoes.length > 0) {
    drawSectionTitle("Deduções");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    data.deducoes.forEach((d) => {
      ensureSpace(6);
      doc.setTextColor(85, 90, 100);
      const label = d.descricao ? `${tipoDeducaoLabel(d.tipo)} — ${d.descricao}` : tipoDeducaoLabel(d.tipo);
      doc.text(doc.splitTextToSize(label, contentW - 40)[0] || label, margin + 1, y);
      doc.setTextColor(190, 60, 60);
      doc.text(`- ${fmt(d.valor)}`, cCom, y, { align: "right" });
      y += 5.4;
    });
    ensureSpace(8);
    doc.setDrawColor(210, 214, 220);
    doc.line(margin, y - 1, margin + contentW, y - 1);
    y += 3;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(29, 41, 57);
    doc.text("Total de deduções", cBase - 6, y, { align: "right" });
    doc.setTextColor(190, 60, 60);
    doc.text(`- ${fmt(data.total_deducoes)}`, cCom, y, { align: "right" });
    y += 9;
  }

  // ── Resumo / líquido ─────────────────────────────────────────────────────
  ensureSpace(18);
  doc.setFillColor(cr, cg, cb);
  doc.roundedRect(margin, y, contentW, 14, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text("VALOR LÍQUIDO A RECEBER", margin + 4, y + 9);
  doc.setFontSize(14);
  doc.text(fmt(data.valor_liquido), margin + contentW - 4, y + 9.2, { align: "right" });
  y += 20;

  desenharRodapeFichas(doc, {
    W, H, margin, cor: [cr, cg, cb],
    texto: "Demonstrativo de repasse gerado pelo sistema Tatica Gestão.",
  });

  return doc.output("blob");
}

/** Dispara o download do demonstrativo como arquivo .pdf. */
export function baixarDemonstrativoPDF(blob: Blob, profissional: string, periodoFim: string) {
  const slug = String(profissional || "profissional")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `demonstrativo-${slug}-${(periodoFim || "").slice(0, 10)}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
