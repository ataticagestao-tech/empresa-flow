import jsPDF from "jspdf";

export interface RelatorioPagamento {
    competencia: string;
    tipo: string;
    valor: number;
    data_pagamento: string | null;
    conta: string | null;
    status: string;
    source: "folha" | "beneficio" | "manual";
}

export interface RelatorioBeneficioMes {
    competencia: string;
    dias_uteis: number;
    dias_considerados: number;
    vt_custo_empresa: number;
    va_custo_empresa: number;
    total_custo_empresa: number;
    status: string;
}

export interface RelatorioFuncionarioData {
    empresa_nome: string;
    empresa_cnpj?: string | null;
    funcionario: {
        nome: string;
        cpf: string | null;
        rg: string | null;
        data_nascimento: string | null;
        cargo: string | null;
        tipo_contrato: string | null;
        hire_date: string | null;
        data_demissao: string | null;
        salario_base: number;
        centro_custo: string | null;
        email: string | null;
        phone: string | null;
        banco_folha: string | null;
        agencia_folha: string | null;
        conta_folha: string | null;
        tipo_conta_folha: string | null;
        chave_pix_folha: string | null;
        pis: string | null;
        ctps_numero: string | null;
        ctps_serie: string | null;
        status: string;
    };
    pagamentos: RelatorioPagamento[];
    beneficios: RelatorioBeneficioMes[];
    comissoes: RelatorioPagamento[];
    cor_primaria?: string;
}

const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

const fmtData = (iso: string | null | undefined) => {
    if (!iso) return "—";
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + "T12:00:00" : iso;
    const d = new Date(parsed);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
};

const fmtCompetencia = (c: string | null | undefined): string => {
    if (!c) return "—";
    if (/^\d{4}-\d{2}/.test(c)) {
        const [ano, mes] = c.slice(0, 7).split("-");
        return `${mes}/${ano}`;
    }
    return c;
};

const tipoContratoLabel = (v: string | null | undefined): string => {
    if (!v) return "—";
    const map: Record<string, string> = {
        clt: "CLT", pj: "PJ", autonomo: "Autônomo", estagio: "Estágio", temporario: "Temporário",
    };
    return map[v] || v;
};

const tipoContaLabel = (v: string | null | undefined): string => {
    if (!v) return "—";
    const map: Record<string, string> = {
        corrente: "Corrente", poupanca: "Poupança", pix: "PIX",
    };
    return map[v] || v;
};

const statusLabel = (s: string): string => {
    const map: Record<string, string> = {
        pago: "Pago", aberto: "Em aberto", parcial: "Parcial",
        vencido: "Vencido", cancelado: "Cancelado", confirmado: "Confirmado",
    };
    return map[s] || s;
};

const sourceLabel = (s: string): string => {
    const map: Record<string, string> = {
        folha: "Folha", beneficio: "Benefício", manual: "Manual",
    };
    return map[s] || s;
};

const statusColor = (s: string): [number, number, number] => {
    if (s === "pago") return [3, 152, 85];
    if (s === "vencido") return [229, 62, 62];
    if (s === "parcial") return [234, 88, 12];
    if (s === "cancelado") return [120, 120, 120];
    return [5, 150, 105];
};

function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace("#", "");
    return [
        parseInt(h.substring(0, 2), 16),
        parseInt(h.substring(2, 4), 16),
        parseInt(h.substring(4, 6), 16),
    ];
}

export async function gerarRelatorioFuncionarioPDF(data: RelatorioFuncionarioData): Promise<Blob> {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const cor = data.cor_primaria || "#059669";
    const [cr, cg, cb] = hexToRgb(cor);
    const W = 210;
    const H = 297;
    const margin = 18;
    const contentW = W - margin * 2;
    let y = 0;

    const ensureSpace = (needed: number) => {
        if (y + needed > H - 18) {
            doc.addPage();
            y = margin;
        }
    };

    const drawHeader = () => {
        doc.setFillColor(cr, cg, cb);
        doc.rect(0, 0, W, 30, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.setTextColor(255, 255, 255);
        doc.text(data.empresa_nome, margin, 14);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(220, 230, 240);
        if (data.empresa_cnpj) doc.text(`CNPJ: ${data.empresa_cnpj}`, margin, 20);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(255, 255, 255);
        doc.text("RELATÓRIO DO FUNCIONÁRIO", W - margin, 14, { align: "right" });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(220, 230, 240);
        doc.text(`Emitido em ${new Date().toLocaleDateString("pt-BR")}`, W - margin, 20, { align: "right" });
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

    const drawKV = (label: string, value: string, opts?: { col?: 0 | 1 | 2; cols?: number }): number => {
        const cols = opts?.cols || 1;
        if (cols === 1) {
            ensureSpace(6);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(110, 120, 130);
            doc.text(label, margin, y);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(9);
            doc.setTextColor(29, 41, 57);
            const lines = doc.splitTextToSize(value || "—", contentW - 40);
            doc.text(lines, margin + 40, y);
            y += Math.max(5, lines.length * 4.5);
            return lines.length;
        } else {
            const col = opts?.col ?? 0;
            const colW = contentW / cols;
            const x = margin + col * colW;
            const labelW = 22;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(110, 120, 130);
            doc.text(label, x, y);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(9);
            doc.setTextColor(29, 41, 57);
            const lines = doc.splitTextToSize(value || "—", colW - labelW - 2);
            doc.text(lines, x + labelW, y);
            return lines.length;
        }
    };

    const drawKVRow = (pairs: { label: string; value: string }[]) => {
        ensureSpace(6);
        let maxLines = 1;
        pairs.forEach((p, i) => {
            const n = drawKV(p.label, p.value, { col: i as 0 | 1 | 2, cols: pairs.length as any });
            if (n > maxLines) maxLines = n;
        });
        y += Math.max(6, maxLines * 4.5 + 1.5);
    };

    /* ── Header ─────────────────────────── */
    drawHeader();
    y = 40;

    // Nome em destaque
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(29, 41, 57);
    doc.text(data.funcionario.nome, margin, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(110, 120, 130);
    const subline = [
        data.funcionario.cargo || "Sem cargo",
        tipoContratoLabel(data.funcionario.tipo_contrato),
        statusLabel(data.funcionario.status),
    ].filter(Boolean).join("  ·  ");
    doc.text(subline, margin, y);
    y += 8;

    /* ── Dados Cadastrais ──────────────────────────────────── */
    drawSectionTitle("DADOS CADASTRAIS");
    drawKVRow([
        { label: "CPF", value: data.funcionario.cpf || "—" },
        { label: "RG", value: data.funcionario.rg || "—" },
        { label: "Nascimento", value: fmtData(data.funcionario.data_nascimento) },
    ]);
    drawKVRow([
        { label: "Admissão", value: fmtData(data.funcionario.hire_date) },
        { label: "Demissão", value: fmtData(data.funcionario.data_demissao) },
        { label: "Salário", value: fmt(data.funcionario.salario_base) },
    ]);
    drawKVRow([
        { label: "Centro Custo", value: data.funcionario.centro_custo || "—" },
        { label: "PIS", value: data.funcionario.pis || "—" },
        { label: "CTPS", value: [data.funcionario.ctps_numero, data.funcionario.ctps_serie].filter(Boolean).join(" / ") || "—" },
    ]);
    drawKVRow([
        { label: "E-mail", value: data.funcionario.email || "—" },
        { label: "Telefone", value: data.funcionario.phone || "—" },
    ]);
    y += 2;

    drawSectionTitle("DADOS BANCÁRIOS PARA FOLHA");
    drawKVRow([
        { label: "Banco", value: data.funcionario.banco_folha || "—" },
        { label: "Agência", value: data.funcionario.agencia_folha || "—" },
        { label: "Conta", value: data.funcionario.conta_folha || "—" },
    ]);
    drawKVRow([
        { label: "Tipo Conta", value: tipoContaLabel(data.funcionario.tipo_conta_folha) },
        { label: "Chave PIX", value: data.funcionario.chave_pix_folha || "—" },
    ]);
    y += 4;

    /* ── Salário Base Atual ──────────────────────────────── */
    drawSectionTitle("SALÁRIO BASE ATUAL");
    ensureSpace(10);
    doc.setFillColor(249, 250, 251);
    doc.roundedRect(margin, y - 3, contentW, 14, 2, 2, "F");
    doc.setDrawColor(234, 236, 240);
    doc.roundedRect(margin, y - 3, contentW, 14, 2, 2, "S");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(120, 128, 140);
    doc.text("VIGÊNCIA", margin + 4, y + 1);
    doc.text("SALÁRIO", margin + 70, y + 1);
    doc.text("MOTIVO", margin + 140, y + 1);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(29, 41, 57);
    doc.text(fmtData(data.funcionario.hire_date), margin + 4, y + 7);
    doc.text(fmt(data.funcionario.salario_base), margin + 70, y + 7);
    doc.text("Admissão", margin + 140, y + 7);
    y += 16;

    /* ── Histórico de Pagamentos ──────────────────────────── */
    const totalPago = data.pagamentos
        .filter(p => p.status === "pago")
        .reduce((s, p) => s + (Number(p.valor) || 0), 0);
    drawSectionTitle(`HISTÓRICO DE PAGAMENTOS (${data.pagamentos.length})  ·  Total pago: ${fmt(totalPago)}`);
    desenharTabelaPagamentos(data.pagamentos, "Nenhum pagamento registrado.");

    /* ── Benefícios ──────────────────────────────────────── */
    if (data.beneficios.length > 0) {
        const totalBen = data.beneficios.reduce((s, b) => s + (Number(b.total_custo_empresa) || 0), 0);
        drawSectionTitle(`BENEFÍCIOS (${data.beneficios.length})  ·  Total: ${fmt(totalBen)}`);
        desenharTabelaBeneficios(data.beneficios);
    }

    /* ── Comissões ──────────────────────────────────────── */
    const totalComissoes = data.comissoes
        .filter(p => p.status === "pago")
        .reduce((s, p) => s + (Number(p.valor) || 0), 0);
    drawSectionTitle(`COMISSÕES (${data.comissoes.length})  ·  Total pago: ${fmt(totalComissoes)}`);
    desenharTabelaPagamentos(data.comissoes, "Nenhuma comissão registrada.");

    /* ── Footer em todas as páginas ─────────────────────────── */
    const pageCount = (doc.internal as any).getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p);
        const fy = H - 10;
        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(0.3);
        doc.line(margin, fy - 3, margin + contentW, fy - 3);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(156, 163, 175);
        doc.text(`Documento gerado pelo sistema Tatica Gestão.`, margin, fy);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(cr, cg, cb);
        doc.text(`Página ${p} de ${pageCount}`, W - margin, fy, { align: "right" });
    }

    return doc.output("blob");

    /* ── Helpers ─────────────────────────────────────────── */
    function desenharTabelaPagamentos(items: RelatorioPagamento[], emptyMsg: string) {
        if (items.length === 0) {
            ensureSpace(6);
            doc.setFont("helvetica", "italic");
            doc.setFontSize(9);
            doc.setTextColor(150, 158, 170);
            doc.text(emptyMsg, margin, y);
            y += 6;
            return;
        }
        ensureSpace(8);
        doc.setFillColor(243, 244, 246);
        doc.rect(margin, y - 3, contentW, 6, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(80, 88, 100);
        doc.text("COMP.", margin + 2, y + 1);
        doc.text("ORIGEM", margin + 14, y + 1);
        doc.text("DESCRIÇÃO", margin + 30, y + 1);
        doc.text("PAGO EM", margin + 88, y + 1);
        doc.text("CONTA", margin + 110, y + 1);
        doc.text("STATUS", margin + 132, y + 1);
        doc.text("VALOR", margin + contentW - 2, y + 1, { align: "right" });
        y += 5;

        items.forEach((item, i) => {
            ensureSpace(7);
            if (i % 2 === 0) {
                doc.setFillColor(252, 252, 253);
                doc.rect(margin, y - 2, contentW, 6, "F");
            }
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(29, 41, 57);
            doc.text(fmtCompetencia(item.competencia), margin + 2, y + 2);
            doc.setTextColor(80, 88, 100);
            doc.text(sourceLabel(item.source), margin + 14, y + 2);
            doc.setTextColor(29, 41, 57);
            const desc = doc.splitTextToSize(item.tipo || "—", 55);
            doc.text(desc[0], margin + 30, y + 2);
            doc.setTextColor(80, 88, 100);
            doc.text(item.data_pagamento ? fmtData(item.data_pagamento) : "—", margin + 88, y + 2);
            const conta = doc.splitTextToSize(item.conta || "—", 20);
            doc.text(conta[0], margin + 110, y + 2);
            const [r, g, b] = statusColor(item.status);
            doc.setTextColor(r, g, b);
            doc.setFont("helvetica", "bold");
            const statusTxt = doc.splitTextToSize(statusLabel(item.status), 18);
            doc.text(statusTxt[0], margin + 132, y + 2);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(29, 41, 57);
            doc.text(fmt(item.valor), margin + contentW - 2, y + 2, { align: "right" });
            y += 6;
        });
        y += 2;
    }

    function desenharTabelaBeneficios(items: RelatorioBeneficioMes[]) {
        ensureSpace(8);
        doc.setFillColor(243, 244, 246);
        doc.rect(margin, y - 3, contentW, 6, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(80, 88, 100);
        doc.text("COMPETÊNCIA", margin + 2, y + 1);
        doc.text("DIAS ÚTEIS", margin + 32, y + 1);
        doc.text("CONSIDERADOS", margin + 58, y + 1);
        doc.text("VT", margin + 88, y + 1);
        doc.text("VA", margin + 108, y + 1);
        doc.text("STATUS", margin + 132, y + 1);
        doc.text("TOTAL", margin + contentW - 2, y + 1, { align: "right" });
        y += 5;

        items.forEach((item, i) => {
            ensureSpace(7);
            if (i % 2 === 0) {
                doc.setFillColor(252, 252, 253);
                doc.rect(margin, y - 2, contentW, 6, "F");
            }
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(29, 41, 57);
            doc.text(fmtCompetencia(item.competencia), margin + 2, y + 2);
            doc.text(String(item.dias_uteis ?? "—"), margin + 32, y + 2);
            doc.text(String(item.dias_considerados ?? "—"), margin + 58, y + 2);
            doc.text(fmt(item.vt_custo_empresa), margin + 88, y + 2);
            doc.text(fmt(item.va_custo_empresa), margin + 108, y + 2);
            const [r, g, b] = statusColor(item.status === "confirmado" ? "pago" : item.status);
            doc.setTextColor(r, g, b);
            doc.setFont("helvetica", "bold");
            const statusTxt = doc.splitTextToSize(statusLabel(item.status), 18);
            doc.text(statusTxt[0], margin + 132, y + 2);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(29, 41, 57);
            doc.text(fmt(item.total_custo_empresa), margin + contentW - 2, y + 2, { align: "right" });
            y += 6;
        });
        y += 2;
    }
}
